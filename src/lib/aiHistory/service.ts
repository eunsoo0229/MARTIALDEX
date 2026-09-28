import { supabase } from '../supabase/client';
import type { AiHistoryFeature, AiQuestionHistoryEntry } from './types';

const NOT_CONFIGURED_MESSAGE = 'Supabase 설정이 필요합니다.';

function rowToEntry(row: Record<string, unknown>): AiQuestionHistoryEntry {
  return {
    id: row.id as string,
    feature: row.feature as AiHistoryFeature,
    question: row.question as string,
    answer: row.answer as string,
    relatedTechniqueId: (row.related_technique_id as string | null) ?? null,
    relatedCurriculumId: (row.related_curriculum_id as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

/**
 * Fire-and-forget — called right after AiAskModal's chat gets a real answer
 * (see useAiChat.ts). Never throws and never blocks/breaks the chat UX: a
 * failed history write (offline, RLS misconfigured, logged out) just means
 * this one turn doesn't show up later, nothing else about the AI feature
 * itself depends on it. Logged-out users simply get no history — this
 * mirrors every other "로그인해야 계정에 저장됨" feature in the app rather
 * than inventing a local-only fallback for something this low-stakes.
 */
export async function recordAiQuestion(input: {
  feature: AiHistoryFeature;
  question: string;
  answer: string;
  relatedTechniqueId?: string | null;
  relatedCurriculumId?: string | null;
}): Promise<void> {
  if (!supabase) return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;
    await supabase.from('ai_question_history').insert({
      user_id: userId,
      feature: input.feature,
      question: input.question,
      answer: input.answer,
      related_technique_id: input.relatedTechniqueId ?? null,
      related_curriculum_id: input.relatedCurriculumId ?? null,
    });
  } catch {
    // Best-effort only — see doc comment above.
  }
}

export async function listAiQuestionHistory(): Promise<{ ok: true; data: AiQuestionHistoryEntry[] } | { ok: false; message: string }> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user.id) return { ok: false, message: '로그인이 필요합니다.' };
  const { data, error } = await supabase
    .from('ai_question_history')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return { ok: false, message: '기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' };
  return { ok: true, data: (data ?? []).map(rowToEntry) };
}

export async function deleteAiQuestionHistoryEntry(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  const { error } = await supabase.from('ai_question_history').delete().eq('id', id);
  if (error) return { ok: false, message: '삭제하지 못했습니다. 잠시 후 다시 시도해주세요.' };
  return { ok: true };
}
