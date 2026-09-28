import { supabase } from '../supabase/client';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';
import { trainingHistoryRepository } from '../trainingHistory/repository';
import type { TrainingHistoryEntry } from '../trainingHistory/types';
import { isStillCurrentUser } from './syncGuard';

const NOT_CONFIGURED_MESSAGE = 'Supabase 설정이 필요합니다.';
const NOT_LOGGED_IN_MESSAGE = '로그인이 필요합니다.';

// Entries used to be genuinely append-only (never edited/deleted after
// creation), so the merge only needed to ask "does this id exist on the
// other side yet." Now that entries can be deleted (item 5) and edited —
// notes (item 3) — this is "whichever side is newer wins" on `updatedAt`
// (falling back to `completedAt` for rows from before either feature
// existed, which never lost/won a real conflict anyway since they were
// truly never edited), the same merge shape as gymRoutineSync.ts/comboSync.ts.
export async function syncTrainingHistoryBidirectional(userId: string): Promise<AuthResult<{ pulled: number; pushed: number }>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  if (!userId) return { ok: false, message: NOT_LOGGED_IN_MESSAGE };

  try {
    // Flush pending local deletions BEFORE fetching cloudRows below — a
    // deleted-but-not-yet-cloud-deleted entry would otherwise be pulled
    // straight back by mergeFromCloud further down (the exact resurrection
    // bug already fixed once for gym_routines — see gymRoutineSync.ts).
    for (const id of trainingHistoryRepository.listDeletedIds()) {
      const { error } = await supabase.from('training_history').delete().eq('id', id).eq('user_id', userId);
      if (!error) trainingHistoryRepository.clearDeleted(id);
    }

    const { data: cloudRows, error: fetchError } = await supabase
      .from('training_history')
      .select('id, data, updated_at')
      .eq('user_id', userId);
    if (fetchError) return { ok: false, message: toKoreanAuthMessage(fetchError) };

    // Account-switch race guard — see syncGuard.ts.
    if (!(await isStillCurrentUser(userId))) return { ok: true, data: { pulled: 0, pushed: 0 } };

    const cloudById = new Map((cloudRows ?? []).map((r) => [r.id as string, r]));
    const cloudEntries = (cloudRows ?? []).map((r) => r.data as TrainingHistoryEntry);
    const pulled = trainingHistoryRepository.mergeFromCloud(cloudEntries);

    const localEntries = trainingHistoryRepository.list();
    const toPush = localEntries.filter((e) => {
      const row = cloudById.get(e.id);
      if (!row) return true;
      const cloudTime = (row.updated_at as string) ?? '';
      const localTime = e.updatedAt ?? e.completedAt;
      return localTime > cloudTime;
    });
    if (toPush.length > 0) {
      const rows = toPush.map((e) => ({
        id: e.id,
        user_id: userId,
        date: e.date,
        completed_at: e.completedAt,
        updated_at: e.updatedAt ?? e.completedAt,
        data: e,
      }));
      const { error } = await supabase.from('training_history').upsert(rows);
      if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    }

    return { ok: true, data: { pulled, pushed: toPush.length } };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}
