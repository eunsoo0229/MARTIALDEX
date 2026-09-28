import { supabase } from '../supabase/client';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';
import { comboRepository } from '../combo/repository';
import type { Combo } from '../combo/types';
import { isStillCurrentUser } from './syncGuard';

const NOT_CONFIGURED_MESSAGE = 'Supabase 설정이 필요합니다.';
const NOT_LOGGED_IN_MESSAGE = '로그인이 필요합니다.';

// Same per-item "whichever side is newer wins" merge as
// curriculumSync.ts's syncCurriculaBidirectional / userTechniqueSync.ts —
// safe to run silently on every login, never overwrites a newer edit with
// an older one.
export async function syncCombosBidirectional(userId: string): Promise<AuthResult<{ pulled: number; pushed: number }>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  if (!userId) return { ok: false, message: NOT_LOGGED_IN_MESSAGE };

  try {
    const { data: cloudRows, error: fetchError } = await supabase.from('combos').select('id, data, updated_at').eq('user_id', userId);
    if (fetchError) return { ok: false, message: toKoreanAuthMessage(fetchError) };

    // Account-switch race guard — see syncGuard.ts.
    if (!(await isStillCurrentUser(userId))) return { ok: true, data: { pulled: 0, pushed: 0 } };

    const cloudById = new Map((cloudRows ?? []).map((r) => [r.id, r]));
    const localCombos = comboRepository.list();
    const localById = new Map(localCombos.map((c) => [c.id, c]));

    let pulled = 0;
    let pushed = 0;

    for (const row of cloudRows ?? []) {
      const local = localById.get(row.id);
      const cloudCombo = row.data as Combo;
      const cloudTime = new Date(row.updated_at as string).getTime();
      const localTime = local?.updatedAt ? new Date(local.updatedAt).getTime() : -Infinity;
      if (!local || cloudTime > localTime) {
        comboRepository.save(cloudCombo);
        pulled++;
      }
    }

    const toPush: Combo[] = [];
    for (const local of localCombos) {
      const row = cloudById.get(local.id);
      const cloudTime = row ? new Date(row.updated_at as string).getTime() : -Infinity;
      const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
      if (!row || localTime > cloudTime) toPush.push(local);
    }
    if (toPush.length > 0) {
      const now = new Date().toISOString();
      const rows = toPush.map((c) => ({ id: c.id, user_id: userId, name: c.name, data: c, updated_at: c.updatedAt ?? now }));
      const { error } = await supabase.from('combos').upsert(rows);
      if (error) return { ok: false, message: toKoreanAuthMessage(error) };
      pushed = toPush.length;
    }

    return { ok: true, data: { pulled, pushed } };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}
