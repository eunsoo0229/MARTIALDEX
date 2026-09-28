import { supabase } from '../supabase/client';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';
import { nutritionMealRepository } from '../nutrition/mealRepository';
import { nutritionProfileRepository } from '../nutrition/profileRepository';
import type { NutritionMealEntry, NutritionProfile } from '../nutrition/types';
import { isStillCurrentUser } from './syncGuard';

const NOT_CONFIGURED_MESSAGE = 'Supabase 설정이 필요합니다.';
const NOT_LOGGED_IN_MESSAGE = '로그인이 필요합니다.';

/**
 * Meal entries — same tombstone-delete + "newest wins" merge shape as
 * trainingHistorySync.ts/gymRoutineSync.ts. Tombstones are flushed BEFORE
 * the fetch so a just-deleted meal can never be re-pulled and resurrected.
 */
export async function syncNutritionMealsBidirectional(userId: string): Promise<AuthResult<{ pulled: number; pushed: number }>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  if (!userId) return { ok: false, message: NOT_LOGGED_IN_MESSAGE };

  try {
    for (const id of nutritionMealRepository.listDeletedIds()) {
      const { error } = await supabase.from('nutrition_meals').delete().eq('id', id).eq('user_id', userId);
      if (!error) nutritionMealRepository.clearDeleted(id);
    }

    const { data: cloudRows, error: fetchError } = await supabase
      .from('nutrition_meals')
      .select('id, data, updated_at')
      .eq('user_id', userId);
    if (fetchError) return { ok: false, message: toKoreanAuthMessage(fetchError) };

    // Account-switch race guard — see syncGuard.ts.
    if (!(await isStillCurrentUser(userId))) return { ok: true, data: { pulled: 0, pushed: 0 } };

    const cloudById = new Map((cloudRows ?? []).map((r) => [r.id as string, r]));
    const cloudEntries = (cloudRows ?? []).map((r) => r.data as NutritionMealEntry);
    const pulled = nutritionMealRepository.mergeFromCloud(cloudEntries);

    const localEntries = nutritionMealRepository.list();
    const toPush = localEntries.filter((m) => {
      const row = cloudById.get(m.id);
      if (!row) return true;
      const cloudTime = (row.updated_at as string) ?? '';
      const localTime = m.updatedAt ?? m.createdAt;
      return localTime > cloudTime;
    });
    if (toPush.length > 0) {
      const rows = toPush.map((m) => ({
        id: m.id,
        user_id: userId,
        date: m.date,
        created_at: m.createdAt,
        updated_at: m.updatedAt ?? m.createdAt,
        data: m,
      }));
      const { error } = await supabase.from('nutrition_meals').upsert(rows);
      if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    }

    return { ok: true, data: { pulled, pushed: toPush.length } };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

/**
 * Nutrition profile (goals + BMR body metrics) — a singleton row keyed by
 * user_id (no separate id, no tombstone: a profile is only ever replaced,
 * never deleted). "Newest wins" on updatedAt, same as the meals sync above.
 */
export async function syncNutritionProfileBidirectional(userId: string): Promise<AuthResult<{ pulled: boolean; pushed: boolean }>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  if (!userId) return { ok: false, message: NOT_LOGGED_IN_MESSAGE };

  try {
    const { data: row, error: fetchError } = await supabase
      .from('nutrition_profiles')
      .select('data, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (fetchError) return { ok: false, message: toKoreanAuthMessage(fetchError) };

    // Account-switch race guard — see syncGuard.ts.
    if (!(await isStillCurrentUser(userId))) return { ok: true, data: { pulled: false, pushed: false } };

    let pulled = false;
    if (row) {
      pulled = nutritionProfileRepository.mergeFromCloud(row.data as NutritionProfile);
    }

    const local = nutritionProfileRepository.get();
    const cloudTime = (row?.updated_at as string) ?? '';
    let pushed = false;
    if (!row || local.updatedAt > cloudTime) {
      const { error } = await supabase
        .from('nutrition_profiles')
        .upsert({ user_id: userId, data: local, updated_at: local.updatedAt });
      if (error) return { ok: false, message: toKoreanAuthMessage(error) };
      pushed = true;
    }

    return { ok: true, data: { pulled, pushed } };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}
