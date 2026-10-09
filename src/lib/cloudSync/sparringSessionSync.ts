import { supabase } from '../supabase/client';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';
import { isSparringRuleRecord, sparringSessionRepository } from '../sparringSession/repository';
import type { SparringSessionRecord } from '../sparringSession/types';
import { isStillCurrentUser } from './syncGuard';

const NOT_CONFIGURED_MESSAGE = 'Supabase 설정이 필요합니다.';
const NOT_LOGGED_IN_MESSAGE = '로그인이 필요합니다.';

// Same per-item "whichever side is newer wins" merge as comboSync.ts's
// syncCombosBidirectional / curriculumSync.ts — safe to run silently on
// every login, never overwrites a newer edit with an older one.
export async function syncSparringSessionsBidirectional(userId: string): Promise<AuthResult<{ pulled: number; pushed: number }>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  if (!userId) return { ok: false, message: NOT_LOGGED_IN_MESSAGE };

  try {
    const { data: cloudRows, error: fetchError } = await supabase.from('sparring_sessions').select('id, data, updated_at').eq('user_id', userId);
    if (fetchError) return { ok: false, message: toKoreanAuthMessage(fetchError) };

    // Account-switch race guard — see syncGuard.ts.
    if (!(await isStillCurrentUser(userId))) return { ok: true, data: { pulled: 0, pushed: 0 } };

    // Only rule-based records belong here; anything else that reached this
    // table through the old shared local key is left untouched in the cloud.
    const ruleRows = (cloudRows ?? []).filter((r) => isSparringRuleRecord(r.data));
    const cloudById = new Map((cloudRows ?? []).map((r) => [r.id, r]));
    const localSessions = sparringSessionRepository.list();
    const localById = new Map(localSessions.map((s) => [s.id, s]));

    let pulled = 0;
    let pushed = 0;

    for (const row of ruleRows) {
      const local = localById.get(row.id);
      const cloudSession = row.data as SparringSessionRecord;
      const cloudTime = new Date(row.updated_at as string).getTime();
      const localTime = local?.updatedAt ? new Date(local.updatedAt).getTime() : -Infinity;
      if (!local || cloudTime > localTime) {
        sparringSessionRepository.save(cloudSession);
        pulled++;
      }
    }

    const toPush: SparringSessionRecord[] = [];
    for (const local of localSessions) {
      const row = cloudById.get(local.id);
      const cloudTime = row ? new Date(row.updated_at as string).getTime() : -Infinity;
      const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
      if (!row || localTime > cloudTime) toPush.push(local);
    }
    if (toPush.length > 0) {
      const now = new Date().toISOString();
      const rows = toPush.map((s) => ({ id: s.id, user_id: userId, martial_art: s.martialArt, date: s.date, data: s, updated_at: s.updatedAt ?? now }));
      const { error } = await supabase.from('sparring_sessions').upsert(rows);
      if (error) return { ok: false, message: toKoreanAuthMessage(error) };
      pushed = toPush.length;
    }

    return { ok: true, data: { pulled, pushed } };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}
