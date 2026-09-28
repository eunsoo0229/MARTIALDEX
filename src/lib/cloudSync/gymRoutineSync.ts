import { supabase } from '../supabase/client';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';
import { gymRoutineRepository } from '../gymRoutine/repository';
import type { GymRoutine } from '../gymRoutine/types';
import { isStillCurrentUser } from './syncGuard';

const NOT_CONFIGURED_MESSAGE = 'Supabase 설정이 필요합니다.';
const NOT_LOGGED_IN_MESSAGE = '로그인이 필요합니다.';

// Same per-item "whichever side is newer wins" merge as comboSync.ts —
// safe to run silently on every login, never overwrites a newer edit with
// an older one.
export async function syncGymRoutinesBidirectional(userId: string): Promise<AuthResult<{ pulled: number; pushed: number }>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  if (!userId) return { ok: false, message: NOT_LOGGED_IN_MESSAGE };

  try {
    // Flush pending local deletions BEFORE fetching cloudRows below — a
    // routine deleted locally (online or while offline) is queued as a
    // tombstone (gymRoutineRepository) since deleteGymRoutine() has no
    // network access. Deleting the Supabase row here first, before the
    // fetch, means the pull loop below can never see it and mistake "no
    // local copy" for "cloud has something new" — which used to resurrect
    // a just-deleted routine within ~800ms (this sync runs on the same
    // debounced event deleteGymRoutine's local write fires).
    for (const id of gymRoutineRepository.listDeletedIds()) {
      const { error } = await supabase.from('gym_routines').delete().eq('id', id).eq('user_id', userId);
      if (!error) gymRoutineRepository.clearDeleted(id);
    }

    const { data: cloudRows, error: fetchError } = await supabase.from('gym_routines').select('id, data, updated_at').eq('user_id', userId);
    if (fetchError) return { ok: false, message: toKoreanAuthMessage(fetchError) };

    // Account-switch race guard — see syncGuard.ts.
    if (!(await isStillCurrentUser(userId))) return { ok: true, data: { pulled: 0, pushed: 0 } };

    const cloudById = new Map((cloudRows ?? []).map((r) => [r.id, r]));
    const localRoutines = gymRoutineRepository.list();
    const localById = new Map(localRoutines.map((r) => [r.id, r]));

    let pulled = 0;
    let pushed = 0;

    for (const row of cloudRows ?? []) {
      const local = localById.get(row.id);
      const cloudRoutine = row.data as GymRoutine;
      const cloudTime = new Date(row.updated_at as string).getTime();
      const localTime = local?.updatedAt ? new Date(local.updatedAt).getTime() : -Infinity;
      if (!local || cloudTime > localTime) {
        gymRoutineRepository.save(cloudRoutine);
        pulled++;
      }
    }

    const toPush: GymRoutine[] = [];
    for (const local of localRoutines) {
      const row = cloudById.get(local.id);
      const cloudTime = row ? new Date(row.updated_at as string).getTime() : -Infinity;
      const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
      if (!row || localTime > cloudTime) toPush.push(local);
    }
    if (toPush.length > 0) {
      const now = new Date().toISOString();
      const rows = toPush.map((r) => ({ id: r.id, user_id: userId, name: r.name, active: r.active, data: r, updated_at: r.updatedAt ?? now }));
      const { error } = await supabase.from('gym_routines').upsert(rows);
      if (error) return { ok: false, message: toKoreanAuthMessage(error) };
      pushed = toPush.length;
    }

    return { ok: true, data: { pulled, pushed } };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}
