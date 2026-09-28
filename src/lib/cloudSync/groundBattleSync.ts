import { supabase } from '../supabase/client';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';
import { groundBattleRepository } from '../groundBattle/repository';
import type { GroundBattleMatchRecord } from '../groundBattle/types';
import { isStillCurrentUser } from './syncGuard';

const NOT_CONFIGURED_MESSAGE = 'Supabase 설정이 필요합니다.';
const NOT_LOGGED_IN_MESSAGE = '로그인이 필요합니다.';

// Same per-item "whichever side is newer wins" merge as sparringSessionSync.ts
// / comboSync.ts — safe to run silently on every login, never overwrites a
// newer entry with an older one.
export async function syncGroundBattleMatchesBidirectional(userId: string): Promise<AuthResult<{ pulled: number; pushed: number }>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  if (!userId) return { ok: false, message: NOT_LOGGED_IN_MESSAGE };

  try {
    const { data: cloudRows, error: fetchError } = await supabase.from('ground_battle_matches').select('id, data, updated_at').eq('user_id', userId);
    if (fetchError) return { ok: false, message: toKoreanAuthMessage(fetchError) };

    if (!(await isStillCurrentUser(userId))) return { ok: true, data: { pulled: 0, pushed: 0 } };

    const cloudById = new Map((cloudRows ?? []).map((r) => [r.id, r]));
    const localMatches = groundBattleRepository.list();
    const localById = new Map(localMatches.map((m) => [m.id, m]));

    let pulled = 0;
    let pushed = 0;

    for (const row of cloudRows ?? []) {
      const local = localById.get(row.id);
      const cloudMatch = row.data as GroundBattleMatchRecord;
      const cloudTime = new Date(row.updated_at as string).getTime();
      const localTime = local?.updatedAt ? new Date(local.updatedAt).getTime() : -Infinity;
      if (!local || cloudTime > localTime) {
        groundBattleRepository.save(cloudMatch);
        pulled++;
      }
    }

    const toPush: GroundBattleMatchRecord[] = [];
    for (const local of localMatches) {
      const row = cloudById.get(local.id);
      const cloudTime = row ? new Date(row.updated_at as string).getTime() : -Infinity;
      const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
      if (!row || localTime > cloudTime) toPush.push(local);
    }
    if (toPush.length > 0) {
      const now = new Date().toISOString();
      const rows = toPush.map((m) => ({ id: m.id, user_id: userId, difficulty: m.difficulty, mode: m.mode, outcome: m.outcome, data: m, updated_at: m.updatedAt ?? now }));
      const { error } = await supabase.from('ground_battle_matches').upsert(rows);
      if (error) return { ok: false, message: toKoreanAuthMessage(error) };
      pushed = toPush.length;
    }

    return { ok: true, data: { pulled, pushed } };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}
