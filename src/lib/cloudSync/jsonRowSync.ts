import { supabase } from '../supabase/client';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';
import { listReviewLog, replaceReviewLog, type ReviewLogEntry } from '../review/reviewLog';
import { listLessonLog, replaceLessonLog, type LessonLogEntry } from '../coachLesson/lessonLog';
import { isStillCurrentUser } from './syncGuard';

// Own-row jsonb tables from 0038 (review_logs, coach_lesson_logs). Same
// per-item "newer side wins" merge as sparringSessionSync.ts — safe to run
// silently on every login. Never deletes on either side.

interface Spec<T extends { id: string; updatedAt: string }> {
  table: string;
  list: () => T[];
  replace: (list: T[]) => void;
  columns: (e: T) => Record<string, unknown>;
  valid: (x: unknown) => x is T;
}

async function syncTable<T extends { id: string; updatedAt: string }>(userId: string, spec: Spec<T>): Promise<AuthResult<{ pulled: number; pushed: number }>> {
  if (!supabase) return { ok: false, message: 'Supabase 설정이 필요합니다.' };
  if (!userId) return { ok: false, message: '로그인이 필요합니다.' };
  try {
    const { data: rows, error } = await supabase.from(spec.table).select('id, data, updated_at').eq('user_id', userId);
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    if (!(await isStillCurrentUser(userId))) return { ok: true, data: { pulled: 0, pushed: 0 } };

    const local = spec.list();
    const merged = new Map(local.map((e) => [e.id, e]));
    const cloudTime = new Map<string, number>();
    let pulled = 0;
    for (const r of rows ?? []) {
      cloudTime.set(r.id as string, new Date(r.updated_at as string).getTime());
      if (!spec.valid(r.data)) continue;
      const mine = merged.get(r.id as string);
      if (!mine || new Date(r.updated_at as string).getTime() > new Date(mine.updatedAt).getTime()) {
        merged.set(r.id as string, r.data);
        pulled++;
      }
    }
    if (pulled) spec.replace([...merged.values()]);

    const toPush = local.filter((e) => !cloudTime.has(e.id) || new Date(e.updatedAt).getTime() > cloudTime.get(e.id)!);
    if (toPush.length) {
      const { error: upErr } = await supabase.from(spec.table).upsert(toPush.map((e) => ({ id: e.id, user_id: userId, ...spec.columns(e), data: e, updated_at: e.updatedAt })));
      if (upErr) return { ok: false, message: toKoreanAuthMessage(upErr) };
    }
    return { ok: true, data: { pulled, pushed: toPush.length } };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object';

export function syncReviewLogsBidirectional(userId: string) {
  return syncTable<ReviewLogEntry>(userId, {
    table: 'review_logs',
    list: listReviewLog,
    replace: replaceReviewLog,
    columns: (e) => ({ mode: e.mode }),
    valid: (x): x is ReviewLogEntry => isObj(x) && typeof x.id === 'string' && Array.isArray(x.techniqueIds) && typeof x.updatedAt === 'string',
  });
}

export function syncLessonLogsBidirectional(userId: string) {
  return syncTable<LessonLogEntry>(userId, {
    table: 'coach_lesson_logs',
    list: listLessonLog,
    replace: replaceLessonLog,
    columns: (e) => ({ date: e.date }),
    valid: (x): x is LessonLogEntry => isObj(x) && typeof x.id === 'string' && Array.isArray(x.techniques) && typeof x.updatedAt === 'string',
  });
}
