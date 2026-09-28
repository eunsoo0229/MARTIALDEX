import { supabase } from '../supabase/client';
import type { ReportReason } from './types';

const NOT_CONFIGURED_MESSAGE = 'Supabase 설정이 필요합니다.';
const NOT_LOGGED_IN_MESSAGE = '신고하려면 로그인이 필요합니다.';

export type SubmitReportOutcome =
  | { ok: true }
  | { ok: false; code: 'ALREADY_REPORTED'; message: string }
  | { ok: false; code: 'NOT_LOGGED_IN' | 'NOT_CONFIGURED' | 'ERROR'; message: string };

/** Same "동일 user_id + 동일 technique_id + 처리되지 않은(open) 신고" check the
 * DB's own partial unique index (0017_technique_reports.sql) also enforces
 * — this is the friendly pre-check that lets the UI show "이미 신고했습니다"
 * instead of a raw constraint-violation error; the index is the real
 * backstop against a race between this check and the insert below. */
async function hasOpenReport(techniqueId: string, userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase
    .from('technique_reports')
    .select('id')
    .eq('technique_id', techniqueId)
    .eq('user_id', userId)
    .eq('status', 'open')
    .limit(1);
  return !!data && data.length > 0;
}

/**
 * Submits a "기술 신고" for ANY technique — official, shared add_teq, or
 * this user's own user_techniques (spec 문제 8) — techniqueId is stored as
 * a plain reference, never validated against a specific source table,
 * since official techniques have no DB row of their own. Never deletes,
 * hides, or otherwise changes the reported technique — purely
 * informational (spec 문제 5/9's "4차 방어" layer, on top of the existing
 * duplicate-check/AI-verification defenses which are unchanged).
 */
export async function submitTechniqueReport(input: {
  techniqueId: string;
  userId: string | null;
  reason: ReportReason;
  description: string;
}): Promise<SubmitReportOutcome> {
  if (!supabase) return { ok: false, code: 'NOT_CONFIGURED', message: NOT_CONFIGURED_MESSAGE };
  if (!input.userId) return { ok: false, code: 'NOT_LOGGED_IN', message: NOT_LOGGED_IN_MESSAGE };

  const alreadyReported = await hasOpenReport(input.techniqueId, input.userId);
  if (alreadyReported) {
    return { ok: false, code: 'ALREADY_REPORTED', message: '이미 이 기술을 신고했습니다. 검토가 끝나기 전까지는 다시 신고할 수 없습니다.' };
  }

  const { error } = await supabase.from('technique_reports').insert({
    technique_id: input.techniqueId,
    user_id: input.userId,
    reason: input.reason,
    description: input.description.trim() || null,
  });

  if (error) {
    // 23505 = unique_violation — the partial unique index caught a race
    // this check-then-insert missed (e.g. a double-click); same friendly
    // message as the pre-check above, not a raw DB error.
    if (error.code === '23505') {
      return { ok: false, code: 'ALREADY_REPORTED', message: '이미 이 기술을 신고했습니다. 검토가 끝나기 전까지는 다시 신고할 수 없습니다.' };
    }
    return { ok: false, code: 'ERROR', message: '신고를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.' };
  }

  return { ok: true };
}
