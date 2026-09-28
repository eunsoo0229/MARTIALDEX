import { supabase } from '../supabase/client';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';
import { techniqueVideoPickRepository } from '../techniqueVideo/repository';
import type { TechniqueVideoPick } from '../techniqueVideo/types';
import { isStillCurrentUser } from './syncGuard';

const NOT_CONFIGURED_MESSAGE = 'Supabase 설정이 필요합니다.';
const NOT_LOGGED_IN_MESSAGE = '로그인이 필요합니다.';

// Same per-item "whichever side is newer wins" merge as combos/curricula,
// plus the tombstone-flush + defense-in-depth pull guard curriculumSync.ts
// needed adding after the fact (see its doc comment) — built in here from
// the start so a cleared video pick can never resurrect via sync.
export async function syncTechniqueVideoPicksBidirectional(userId: string): Promise<AuthResult<{ pulled: number; pushed: number }>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  if (!userId) return { ok: false, message: NOT_LOGGED_IN_MESSAGE };

  try {
    for (const techniqueId of techniqueVideoPickRepository.listDeletedIds()) {
      const { error } = await supabase.from('technique_video_picks').delete().eq('technique_id', techniqueId).eq('user_id', userId);
      if (!error) techniqueVideoPickRepository.clearDeleted(techniqueId);
    }

    const { data: cloudRows, error: fetchError } = await supabase
      .from('technique_video_picks')
      .select('technique_id, data, updated_at')
      .eq('user_id', userId);
    if (fetchError) return { ok: false, message: toKoreanAuthMessage(fetchError) };

    // Account-switch race guard — see syncGuard.ts.
    if (!(await isStillCurrentUser(userId))) return { ok: true, data: { pulled: 0, pushed: 0 } };

    // Defense-in-depth against the same resurrection race curriculumSync.ts
    // guards against — see that file's doc comment for why "flush before
    // fetch" alone isn't enough when the flush's own delete call fails.
    const pendingDeleteIds = new Set(techniqueVideoPickRepository.listDeletedIds());
    const cloudById = new Map((cloudRows ?? []).map((r) => [r.technique_id as string, r]));
    const localPicks = techniqueVideoPickRepository.list();
    const localById = new Map(localPicks.map((p) => [p.techniqueId, p]));

    let pulled = 0;
    let pushed = 0;
    const toPull: TechniqueVideoPick[] = [];

    for (const row of cloudRows ?? []) {
      const techniqueId = row.technique_id as string;
      if (pendingDeleteIds.has(techniqueId)) continue;
      const local = localById.get(techniqueId);
      const cloudPick = row.data as TechniqueVideoPick;
      const cloudTime = new Date(row.updated_at as string).getTime();
      const localTime = local?.updatedAt ? new Date(local.updatedAt).getTime() : -Infinity;
      if (!local || cloudTime > localTime) {
        toPull.push(cloudPick);
        pulled++;
      }
    }
    techniqueVideoPickRepository.saveMany(toPull);

    const toPush: TechniqueVideoPick[] = [];
    for (const local of localPicks) {
      const row = cloudById.get(local.techniqueId);
      const cloudTime = row ? new Date(row.updated_at as string).getTime() : -Infinity;
      const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
      if (!row || localTime > cloudTime) toPush.push(local);
    }
    if (toPush.length > 0) {
      const now = new Date().toISOString();
      const rows = toPush.map((p) => ({ technique_id: p.techniqueId, user_id: userId, data: p, updated_at: p.updatedAt ?? now }));
      const { error } = await supabase.from('technique_video_picks').upsert(rows);
      if (error) return { ok: false, message: toKoreanAuthMessage(error) };
      pushed = toPush.length;
    }

    return { ok: true, data: { pulled, pushed } };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}
