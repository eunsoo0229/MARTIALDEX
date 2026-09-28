import { supabase } from '../supabase/client';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';
import { userTechniqueRepository } from '../userTechniques/repository';
import type { UserTechniqueRecord } from '../userTechniques/types';
import { isStillCurrentUser } from './syncGuard';

const NOT_CONFIGURED_MESSAGE = 'Supabase 설정이 필요합니다.';
const NOT_LOGGED_IN_MESSAGE = '로그인이 필요합니다.';

// Same per-item "whichever side is newer wins" merge as
// curriculumSync.ts's syncCurriculaBidirectional — safe to run silently on
// every login (see CloudSyncOnLogin.tsx / LocalDataMigrationPrompt.tsx),
// never needs a user prompt because it never overwrites a newer edit with
// an older one.
export async function syncUserTechniquesBidirectional(userId: string): Promise<AuthResult<{ pulled: number; pushed: number }>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  if (!userId) return { ok: false, message: NOT_LOGGED_IN_MESSAGE };

  try {
    const { data: cloudRows, error: fetchError } = await supabase
      .from('user_techniques')
      .select('id, data, updated_at')
      .eq('user_id', userId);
    if (fetchError) return { ok: false, message: toKoreanAuthMessage(fetchError) };

    // The fetch above was a real network round trip — userId may no longer
    // be the active account by the time it resolves (account-switch race,
    // see syncGuard.ts). Never write another account's leftover promise
    // into this device's shared local storage.
    if (!(await isStillCurrentUser(userId))) return { ok: true, data: { pulled: 0, pushed: 0 } };

    const cloudById = new Map((cloudRows ?? []).map((r) => [r.id, r]));
    const localRecords = userTechniqueRepository.list();
    const localById = new Map(localRecords.map((r) => [r.id, r]));

    let pulled = 0;
    let pushed = 0;

    for (const row of cloudRows ?? []) {
      const local = localById.get(row.id);
      const cloudRecord = row.data as UserTechniqueRecord;
      const cloudTime = new Date(row.updated_at as string).getTime();
      const localTime = local?.updatedAt ? new Date(local.updatedAt).getTime() : -Infinity;
      if (!local || cloudTime > localTime) {
        userTechniqueRepository.save(cloudRecord);
        pulled++;
      }
    }

    const toPush: UserTechniqueRecord[] = [];
    for (const local of localRecords) {
      const row = cloudById.get(local.id);
      const cloudTime = row ? new Date(row.updated_at as string).getTime() : -Infinity;
      const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
      if (!row || localTime > cloudTime) toPush.push(local);
    }
    if (toPush.length > 0) {
      const now = new Date().toISOString();
      const rows = toPush.map((r) => ({
        id: r.id,
        user_id: userId,
        technique_id: r.technique.id,
        martial_art: r.technique.martialArt,
        status: r.status,
        data: r,
        updated_at: r.updatedAt ?? now,
      }));
      const { error } = await supabase.from('user_techniques').upsert(rows);
      if (error) return { ok: false, message: toKoreanAuthMessage(error) };
      pushed = toPush.length;
    }

    return { ok: true, data: { pulled, pushed } };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}
