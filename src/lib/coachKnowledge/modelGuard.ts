import type { Answerability } from './answerability';
import type { TechniqueEvidence } from './evidence';
import { answerTokens, tokenMatch } from '../coachLesson/answerMatch';

// What a small local model may do in the 자체 AI 코치: REWORD the evidence the
// data already holds into two or three spoken sentences. It never decides
// anything (grading / lesson flow happen before it is called) and its text is
// only used when it passes every check below — otherwise the data's own
// sentence is used. These checks come from measuring llama3.2:1b on this
// project (looping repetitions, invented technique details, mixed scripts).

export const LOCAL_SYSTEM_PROMPT = [
  '너는 MARTIALDEX의 무술 코치다. 학생 질문에 [근거]에 적힌 내용만 사용해서 한국어 존댓말로 2~3문장으로 답한다.',
  '[근거]에 없는 동작, 숫자, 기술 이름, 효과를 절대 덧붙이지 않는다. 모르는 내용은 말하지 않는다.',
  '목록 기호, 마크다운, 이모지를 쓰지 않는다. 학생의 동작을 본 것처럼 말하지 않는다.',
].join('\n');

export function localPrompt(ev: TechniqueEvidence, a: Answerability, question: string): string {
  const lines = a.needs.filter((n) => n.evidence.length).flatMap((n) => n.evidence.flatMap((e) => e.values.slice(0, 3).map((v) => `- ${n.need.label}: ${v}`)));
  return [`[기술] ${ev.displayName}`, '[근거]', ...lines.slice(0, 12), '', `[학생 질문] ${question}`, '[답변]'].join('\n');
}

export interface GuardResult {
  ok: boolean;
  reasons: string[];
  text: string;
}

const LETTERS = /\p{L}/gu;
const HANGUL = /[가-힣]/g;
/** Latin with diacritics (Vietnamese …), Cyrillic, CJK ideographs, Thai, Arabic — not expected in a Korean answer. */
const FOREIGN = /[À-ɏḀ-ỿЀ-ӿ一-鿿฀-๿؀-ۿ]/;

/** Share of the model's content words that must come from the evidence / question. */
const MIN_GROUNDED = 0.5;
/** Connective / coaching words a reworded answer may add without adding facts. */
const GENERIC = new Set(['중요', '중요합니다', '기억', '연습', '연습하세요', '주의', '필요', '좋습니다', '도움', '도움이', '방법', '다음', '먼저', '그다음', '이때', '그래서', '따라서', '또한', '하세요', '합니다', '해야', '있습니다', '됩니다', '것입니다', '질문', '답변', '설명', '말씀', '확인', '자료', '근거', '기술의', '학생']);

function repeats(text: string): boolean {
  const t = text.replace(/\s+/g, ' ');
  for (let len = 4; len <= 14; len++) {
    const seen = new Map<string, number>();
    for (let i = 0; i + len <= t.length; i += 1) {
      const chunk = t.slice(i, i + len);
      if (!/[가-힣a-z]/i.test(chunk)) continue;
      const n = (seen.get(chunk) ?? 0) + 1;
      if (n >= 4) return true;
      seen.set(chunk, n);
    }
  }
  return false;
}

/**
 * Checks a local model's answer against the evidence it was given.
 * `knownNames` = every technique name in MARTIALDEX (lower-cased, ≥ 3 chars):
 * mentioning one that is not in the evidence means the model brought in
 * another technique the data did not link here.
 */
export function guardModelText(raw: string, ev: TechniqueEvidence, a: Answerability, knownNames: Set<string> = new Set(), question = ''): GuardResult {
  const text = raw.trim().replace(/^\s*["'“]|["'”]\s*$/g, '').replace(/\s+/g, ' ');
  const reasons: string[] = [];
  if (text.length < 8) reasons.push('너무 짧음');
  if (text.length > 420) reasons.push('너무 김');
  if (repeats(text)) reasons.push('같은 구절 반복');
  const letters = text.match(LETTERS)?.length ?? 0;
  const hangul = text.match(HANGUL)?.length ?? 0;
  if (letters > 0 && hangul / letters < 0.6) reasons.push('한국어 비율 낮음');
  if (FOREIGN.test(text)) reasons.push('다른 언어 문자 섞임');
  const evidenceText = [ev.name, ev.displayName, ...a.needs.flatMap((n) => n.evidence.flatMap((e) => e.values)), ...(ev.fields.related?.values ?? [])].join(' ').toLowerCase();
  for (const d of text.match(/\d+(?:\.\d+)?/g) ?? []) if (!evidenceText.includes(d)) reasons.push(`근거에 없는 숫자 ${d}`);
  // English words mixed into a Korean answer ("턱이 expose되기") — only names the evidence itself uses are allowed.
  const latin = (text.match(/[A-Za-z]{3,}/g) ?? []).filter((w) => !evidenceText.includes(w.toLowerCase()) && !question.toLowerCase().includes(w.toLowerCase()));
  if (latin.length) reasons.push(`영어 단어 섞임 (${latin.slice(0, 3).join(', ')})`);
  const lower = text.toLowerCase();
  for (const n of knownNames) {
    if (n.length >= 3 && lower.includes(n) && !evidenceText.includes(n)) {
      reasons.push(`근거에 없는 기술 이름 "${n}"`);
      break;
    }
  }
  if (/자세가 (좋|훌륭|정확)|잘 하고 계십|보니까|화면에서 보/.test(text)) reasons.push('사용자를 본 것처럼 말함');
  // The same sentence said twice (small models loop on whole sentences, not only on short chunks).
  const sentences = text.split(/(?<=[.!?。])\s+/).map((x) => x.replace(/[.!?。\s]+$/, '').trim()).filter((x) => x.length >= 6);
  if (new Set(sentences).size < sentences.length) reasons.push('같은 문장 반복');
  // Off-topic: most of what the model says must be words the evidence (or the question) already has.
  const said = answerTokens(text).filter((t) => !GENERIC.has(t));
  const grounded = answerTokens(`${evidenceText} ${question}`);
  if (said.length >= 3) {
    const inEvidence = said.filter((t) => grounded.some((g) => tokenMatch(t, g))).length;
    if (inEvidence / said.length < MIN_GROUNDED) reasons.push(`근거와 무관한 내용 (근거 단어 ${inEvidence}/${said.length})`);
  }
  return { ok: reasons.length === 0, reasons, text };
}
