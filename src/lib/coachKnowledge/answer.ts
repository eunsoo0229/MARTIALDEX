import type { Technique } from '../../types';
import { getUnifiedAllTechniques } from '../userTechniques/service';
import { askLocalModel } from '../coachProvider/localModel';
import { evidenceAnswerText, judgeAnswerability, needsOf, type Answerability } from './answerability';
import type { TechniqueEvidence } from './evidence';
import { evidenceFor } from './lookup';
import { guardModelText, localPrompt, LOCAL_SYSTEM_PROMPT } from './modelGuard';

// 자체 AI 코치의 질문 답변:
//   question → required information (answerability.ts) → technique evidence
//   → unanswerable: the "자료에 없습니다" answer — NO model call
//   → (partly) answerable: the local model rewords the evidence; its text is
//     used only if guardModelText accepts it, otherwise the data's own text.
//     What is missing is always stated after it, by code, not by the model.

export interface GroundedAnswer {
  text: string;
  answerability: Answerability;
  /** 'evidence' = the data's own text; 'local_model' = reworded by the local model (checked). */
  source: 'evidence' | 'local_model';
  modelCalled: boolean;
  /** Why the model was not used (unavailable / rejected output), shown to the student when relevant. */
  modelNote: string | null;
  evidence: TechniqueEvidence;
}

/** A lesson answer is not worth a longer wait: after this the data's own text is used (the lesson goes on). */
export const COACH_ANSWER_TIMEOUT_MS = 45000;

// Back-off: after 2 timeouts in a row, or 3 unusable answers in a row (timeout / failed / rejected
// by the checks), the model is skipped for PAUSE_MINUTES — the lesson answers from the data at once.
const PAUSE_MINUTES = 10;
let misses = 0;
let timeouts = 0;
let pausedUntil = 0;
let pauseNoted = false;

function recordOutcome(o: 'answered' | 'timeout' | 'failed' | 'rejected' | 'cancelled') {
  if (o === 'answered' || o === 'cancelled') {
    // "answered" is settled by the guard afterwards; a student's cancel says nothing about the model.
    if (o === 'cancelled') return;
    timeouts = 0;
    return;
  }
  misses++;
  timeouts = o === 'timeout' ? timeouts + 1 : 0;
  if (timeouts >= 2 || misses >= 3) {
    pausedUntil = Date.now() + PAUSE_MINUTES * 60_000;
    pauseNoted = false;
    misses = 0;
    timeouts = 0;
  }
}

/** Tests / a new lesson may start fresh. */
export function resetLocalModelBackoff() {
  misses = 0;
  timeouts = 0;
  pausedUntil = 0;
  pauseNoted = false;
}

let namesCache: { count: number; names: Set<string> } | null = null;
function knownNames(): Set<string> {
  const all = getUnifiedAllTechniques();
  if (namesCache && namesCache.count === all.length) return namesCache.names;
  const names = new Set<string>();
  for (const t of all) for (const n of [t.name, t.koreanName ?? '', ...t.aliases]) if (n && n.trim().length >= 3) names.add(n.trim().toLowerCase());
  namesCache = { count: all.length, names };
  return names;
}

export async function answerFromEvidence(t: Technique, question: string, opts: { useModel: boolean }): Promise<GroundedAnswer> {
  const evidence = evidenceFor(t);
  const answerability = judgeAnswerability(evidence, needsOf(question));
  const base = evidenceAnswerText(evidence, answerability);
  if (answerability.status === 'unanswerable' || !opts.useModel) {
    return { text: base, answerability, source: 'evidence', modelCalled: false, modelNote: null, evidence };
  }
  // The model kept timing out / failing its checks: don't make the student wait again for a while.
  if (Date.now() < pausedUntil) {
    const note = pauseNoted ? null : `로컬 모델이 계속 늦거나 확인되지 않는 답을 내서 ${PAUSE_MINUTES}분 동안은 기술 자료 문장으로 바로 안내합니다.`;
    pauseNoted = true;
    return { text: base, answerability, source: 'evidence', modelCalled: false, modelNote: note, evidence };
  }
  const r = await askLocalModel({ system: LOCAL_SYSTEM_PROMPT, prompt: localPrompt(evidence, answerability, question), maxTokens: 180, timeoutMs: COACH_ANSWER_TIMEOUT_MS });
  recordOutcome(r.ok ? 'answered' : r.code === 'TIMEOUT' ? 'timeout' : r.code === 'CANCELLED' ? 'cancelled' : 'failed');
  if (!r.ok) {
    const note = r.code === 'CANCELLED' ? '로컬 모델을 기다리지 않고 기술 자료의 내용을 그대로 안내합니다.' : `${r.message} 기술 자료의 내용을 그대로 안내합니다.`;
    return { text: base, answerability, source: 'evidence', modelCalled: true, modelNote: note, evidence };
  }
  const guard = guardModelText(r.text, evidence, answerability, knownNames(), question);
  if (!guard.ok) recordOutcome('rejected');
  else misses = 0;
  if (!guard.ok) {
    return { text: base, answerability, source: 'evidence', modelCalled: true, modelNote: `로컬 모델의 답변이 자료와 맞는지 확인되지 않아(${guard.reasons.slice(0, 2).join(', ')}) 기술 자료의 내용을 그대로 안내합니다.`, evidence };
  }
  const missing = answerability.status === 'partial' ? ` 다만 ${answerability.missing.join(' · ')}은(는) MARTIALDEX 자료에 없어 확인되지 않았습니다.` : '';
  return { text: `${guard.text}${missing}`, answerability, source: 'local_model', modelCalled: true, modelNote: null, evidence };
}
