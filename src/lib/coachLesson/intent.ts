import type { PendingQuestion, StudentIntent } from './types';

// Classifies what the student said WITHOUT an API call. Voice transcripts
// and typed text go through the same function. Anything ambiguous while a
// question is pending is treated as an answer — the answer analyzer can
// still flag it as a question (AnswerAnalysis.kind === 'question').

/** Recognizes "I'm ready / start" in voice transcripts or typed text. */
export function isReadyIntent(text: string): boolean {
  // Whole short utterance only, so a question like "시작 자세가 뭐야?" is
  // answered, not mistaken for "start". Trailing punctuation from speech
  // transcription ("준비됐어.") is ignored.
  const t = text.toLowerCase().replace(/[\s.,!?~…"'“”]+/g, '');
  if (t.length === 0 || t.length > 14) return false;
  return /^(네|응|예|좋아|오케이|ok)?(준비(됐|되었|완료|끝났|다됐)(어|어요|습니다|음|다)?|시작(해|하자|할게|해줘|해주세요|합시다|할래|요)?|불러줘|불러주세요|레디|ready|go|letsgo|고고?)$/.test(t);
}

function norm(text: string): string {
  return text.toLowerCase().replace(/[\s.,!~…"'“”]+/g, '');
}

const UNDERSTOOD = /^(네|넵|예|응|어|ㅇㅇ|웅|맞아|그래|오케이|ok|okay|알겠(어|어요|습니다)?|알았(어|어요|습니다)?|이해(했|됐|되었|가 ?됐|가 ?돼)(어|어요|습니다|음|다)?|이해함|괜찮(아|아요|습니다)|충분(해|해요|합니다)|좋아(요)?)(요|네요)?[?]?$/;
const DONT_KNOW = /(모르겠|몰라|모름|잘 ?모르|헷갈|감이 ?안|이해(가|를)? ?(안|못)|어려워|어렵네|글쎄|^아니(요|오)?$|^아뇨$)/;
const REPEAT = /(다시 ?(설명|말|한 ?번|알려|해)|한 ?번 ?더|무슨 ?(말|뜻)|천천히 ?(설명|말)|쉽게 ?(설명|말)|예시)/;
const SKIP = /(건너뛰|넘어가|패스|스킵|skip|다음 ?(으로|단계|기술)|그만하|생략)/;
const QUESTION_LEAD = /^(근데|그런데|그럼|그러면|혹시|질문|궁금)/;
const INTERROGATIVE = /(왜(?!냐)|어떻게|어떤|뭐|무엇|무슨|언제|어디|어느|몇|누가|인가요|나요|까요|건가|거야\?|돼\?|되나|하나요|해야 ?(돼|하|할)|하면 ?(돼|되)|어때|맞아\?|맞나|니\?|냐\?)/;

export function classifyIntent(text: string, pending: PendingQuestion | null): StudentIntent {
  const t = text.trim();
  const n = norm(t);
  if (!n) return 'answer';
  if (isReadyIntent(t)) return 'ready';
  if (SKIP.test(t) && t.length <= 20) return 'skip';
  if (REPEAT.test(t) && t.length <= 30) return 'repeat';
  if (DONT_KNOW.test(t) && t.length <= 24) return 'dont_know';
  if (UNDERSTOOD.test(n)) return 'understood';
  const looksLikeQuestion = QUESTION_LEAD.test(t) || (INTERROGATIVE.test(t) && (/[?？]$/.test(t) || /(나요|까요|가요|인가|건가|어때|하죠|되죠|돼요)$/.test(n)));
  if (looksLikeQuestion) return 'question';
  // With a question pending, a short "팔꿈치?" is a tentative answer, not a question.
  if (pending) return 'answer';
  return 'question';
}
