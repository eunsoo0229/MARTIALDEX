import type { AnswerAnalysis, ConceptStatus, LessonConcept, QuestionType, ScenarioItem } from './types';
import { answerTokens, hitsOf, isCore, polarityOf, tokenMatch } from './answerMatch';

// 결정론적 채점 — grades a short answer against REQUIRED ANSWER ELEMENTS built
// only from the lesson's own data (the concept's key point / purpose line,
// the scenario's answer, the technique's key points). An element is met only
// when several of its content words appear in the answer (one shared word is
// never enough). Words are compared by stem (verb endings / particles removed,
// contracted conjugations matched) plus a small table of expressions the data
// uses for the same thing (answerMatch.ts).
//
// An answer is a clear wrong answer only when it ASSERTS one of the
// technique's documented common mistakes: it says the words that only the
// mistake has ("팔로만 당겨"), or says it does NOT do the key action ("무릎은
// 안 조여도 돼요"). Mistake words inside "…하지 말고", "…하지 않게",
// "…하지 않으면" (avoid / consequence) are not an assertion.
// When the data gives no usable element the answer cannot be fully graded:
// the result is capped below "understood" — never full marks by default.
//
// This result is the authority: a language model's grading (Gemini coach)
// may lower it, and may only confirm "understood" where every required
// element already has evidence in the answer (reconcileAnalysis).

export interface AnswerElement {
  text: string;
  tokens: string[];
  required: boolean;
  /** Tokens of this element the answer covers. */
  hits: number;
  need: number;
  matched: boolean;
}

export type GradeCoverage = 'full_match' | 'partial_match' | 'no_match' | 'contradicted' | 'not_evaluable';

export interface DeterministicGrade {
  verdict: ConceptStatus;
  coverage: GradeCoverage;
  /** 'all' = every required element; 'any' = one of the listed points is enough (practice review / video / "why"). */
  mode: 'all' | 'any';
  elements: AnswerElement[];
  /** The documented mistake the answer states, if any. */
  contradiction: string | null;
  reason: string;
}

export interface GradeInput {
  concept: LessonConcept | null;
  scenario?: ScenarioItem | null;
  /** Reference for questions not tied to one concept (practice review / video / recap): " / "-separated points. */
  reference: string;
  /** The technique's documented common mistakes (posture.commonMistakes) — contradiction patterns. */
  mistakes?: string[];
  /** All of the technique's key points — tells which words of a mistake are the mistake's own. */
  points?: string[];
  /** The technique's names — not answer content ("암바는 …" names it, it does not explain it). */
  names?: string[];
  /** The question type being answered ("why" accepts the consequence of missing the point). */
  questionType?: QuestionType | null;
  answer: string;
}

/** Fewer content words than this and an element cannot be checked reliably. */
const MIN_ELEMENT_TOKENS = 2;
/** Long definition sentences: this many of their words is enough (never fewer than 2). */
const MAX_NEED = 4;

function needFor(n: number): number {
  return n <= 3 ? Math.min(2, n) : Math.min(MAX_NEED, Math.max(2, Math.ceil(n * 0.4)));
}

function element(text: string, required: boolean, answer: string[], names: string[] = [], only?: string[]): AnswerElement {
  const tokens = (only ?? answerTokens(text))
    .filter((t) => !names.some((n) => tokenMatch(t, n)))
    .slice(0, 14);
  const need = needFor(tokens.length);
  const hits = hitsOf(answer, tokens);
  // Body parts / sides alone ("반대 손", "다리 머리") say where, not what: one of the element's other words must be there too.
  const core = tokens.filter(isCore);
  const coreHit = core.length === 0 || hitsOf(answer, core) > 0;
  return { text, tokens, required, hits, need, matched: tokens.length >= MIN_ELEMENT_TOKENS && hits >= need && coreHit };
}

/** One more element word is required when the answer also asserts a word only a documented mistake has ("천천히 회수해도"). */
function withMistakeHint(e: AnswerElement, answer: string[]): AnswerElement {
  if (!e.matched || e.hits >= e.need + 1 || e.hits >= e.tokens.length) return e;
  return { ...e, need: e.need + 1, matched: false };
}

/** "핵심 (놓치면: 실수)" → { point, mistake }. */
function splitReference(ref: string): { point: string; mistake: string | null } {
  const m = ref.match(/^(.*?)\s*\(놓치면:\s*(.+)\)\s*$/);
  return m ? { point: m[1].trim(), mistake: m[2].trim() } : { point: ref.trim(), mistake: null };
}

function elementsFor(input: GradeInput, answer: string[]): { elements: AnswerElement[]; mode: 'all' | 'any'; mistakes: string[]; points: string[] } {
  const mistakes = [...(input.mistakes ?? [])];
  const points = [...(input.points ?? [])];
  const names = (input.names ?? []).flatMap((n) => answerTokens(n));
  if (input.scenario) {
    return { elements: [element(input.scenario.answer, true, answer, names)], mode: 'all', mistakes, points };
  }
  const c = input.concept;
  if (c) {
    if (c.id === 'purpose') {
      const [what, ...rest] = c.reference.split(' / ');
      const situation = rest.find((r) => r.startsWith('사용 상황:'));
      const els = [element(what, true, answer, names)];
      if (situation) els.push(element(situation.replace(/^사용 상황:\s*/, ''), false, answer, names));
      return { elements: els, mode: 'all', mistakes, points };
    }
    const { point, mistake } = splitReference(c.reference);
    if (mistake && !mistakes.includes(mistake)) mistakes.push(mistake);
    if (!points.includes(point)) points.push(point);
    // "왜 중요할까요? 놓치면 어떻게 될까요?" — naming the point OR the consequence of missing it answers it.
    // The consequence is what only the mistake says (its words shared with the key points are the action itself).
    if (input.questionType === 'why' && mistake) {
      const pointTokens = points.flatMap((p) => answerTokens(p));
      const consequence = answerTokens(mistake).filter((t) => !pointTokens.some((p) => tokenMatch(t, p)));
      const els = [element(point, true, answer, names)];
      if (consequence.length >= MIN_ELEMENT_TOKENS) els.push(element(`놓쳤을 때의 결과: ${mistake}`, true, answer, names, consequence));
      return { elements: els, mode: 'any', mistakes, points };
    }
    return { elements: [element(point, true, answer, names)], mode: 'all', mistakes, points };
  }
  const refs = input.reference
    .split(' / ')
    .map((p) => p.replace(/^[^:]{1,30}:\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 6);
  return { elements: refs.map((p) => element(p, true, answer, names)), mode: 'any', mistakes, points: [...points, ...refs] };
}

/**
 * The documented mistake this answer asserts, or null. Two ways to assert one:
 *  A. it says (not inside an avoid / consequence clause) the words that only
 *     the mistake has — not the words it shares with the key points;
 *  B. the mistake is "not doing X" and the answer says it does not do X.
 * In a "why" answer the consequence of a mistake is the expected content, so
 * only B counts there.
 */
function mistakeOwnTokens(mistakes: string[], points: string[]): string[][] {
  const pointTokens = points.flatMap((p) => answerTokens(p));
  return mistakes.map((m) => answerTokens(m).filter((t) => !pointTokens.some((p) => tokenMatch(t, p))));
}

function assertedMistake(input: GradeInput, mistakes: string[], points: string[]): string | null {
  const pol = polarityOf(input.answer);
  const pointTokens = points.flatMap((p) => answerTokens(p));
  for (const m of mistakes) {
    const mt = answerTokens(m);
    if (mt.length < MIN_ELEMENT_TOKENS) continue;
    const own = mt.filter((t) => !pointTokens.some((p) => tokenMatch(t, p)));
    const shared = mt.filter((t) => !own.includes(t));
    const all = [...pol.asserted, ...pol.negated];
    if (input.questionType !== 'why' && own.length > 0) {
      const ownHits = hitsOf(pol.asserted, own);
      if (ownHits >= Math.min(2, own.length) && hitsOf(all, mt) >= MIN_ELEMENT_TOKENS) return m;
    }
    const negativeMistake = /(않|못|안\s|없이)/.test(m);
    if (negativeMistake && shared.length > 0 && hitsOf(pol.negated, shared) >= 1 && hitsOf(all, mt) >= needFor(mt.length)) return m;
  }
  return null;
}

export function gradeByEvidence(input: GradeInput): DeterministicGrade {
  const answer = answerTokens(input.answer);
  const { elements, mode, mistakes, points } = elementsFor(input, answer);

  // A documented mistake the answer asserts is a clear wrong answer.
  const contradiction = assertedMistake(input, mistakes, points);
  // An answer that also uses a word only a mistake has needs one more element word to count as met.
  if (!contradiction && input.questionType !== 'why') {
    const asserted = polarityOf(input.answer).asserted;
    if (mistakeOwnTokens(mistakes, points).some((own) => hitsOf(asserted, own) > 0)) {
      for (let i = 0; i < elements.length; i++) elements[i] = withMistakeHint(elements[i], answer);
    }
  }
  const usable = elements.filter((e) => e.tokens.length >= MIN_ELEMENT_TOKENS);
  if (contradiction) {
    return { verdict: 'weak', coverage: 'contradicted', mode, elements, contradiction, reason: `답이 기술 자료의 흔한 실수("${contradiction}")와 같습니다.` };
  }
  if (usable.length === 0) {
    const any = hitsOf(answer, answerTokens(input.concept?.reference ?? input.reference)) > 0;
    return { verdict: any ? 'partial' : 'weak', coverage: 'not_evaluable', mode, elements, contradiction: null, reason: '이 질문은 자료에 확인할 정답 요소가 부족해 정확히 채점할 수 없습니다 (만점 처리하지 않음).' };
  }
  const required = usable.filter((e) => e.required);
  const met = mode === 'any' ? required.some((e) => e.matched) : required.every((e) => e.matched);
  const someEvidence = usable.some((e) => e.hits > 0);
  if (met && answer.length >= MIN_ELEMENT_TOKENS) {
    return { verdict: 'understood', coverage: 'full_match', mode, elements, contradiction: null, reason: '필수 정답 요소가 답에서 확인되었습니다.' };
  }
  if (someEvidence) {
    return { verdict: 'partial', coverage: 'partial_match', mode, elements, contradiction: null, reason: '정답 요소 일부만 확인되었습니다.' };
  }
  return { verdict: 'weak', coverage: 'no_match', mode, elements, contradiction: null, reason: '답에서 정답 요소를 확인하지 못했습니다.' };
}

const FEEDBACK: Record<GradeCoverage, string> = {
  full_match: '맞습니다. 핵심을 정확하게 짚으셨습니다.',
  partial_match: '방향은 맞습니다. 다만 한 가지가 더 있습니다.',
  no_match: '조금 다르게 생각해 보겠습니다.',
  contradicted: '그 부분은 이 기술에서 흔히 하는 실수에 가깝습니다. 함께 다시 보겠습니다.',
  not_evaluable: '말씀 감사합니다. 이 부분은 자료가 부족해 정확히 채점하지 않고 한 번 더 정리하겠습니다.',
};

/** The deterministic grade as the engine's AnswerAnalysis (no model involved). */
export function evidenceAnalysis(g: DeterministicGrade): AnswerAnalysis {
  const missing = g.elements.filter((e) => e.required && !e.matched).map((e) => e.text);
  return {
    kind: 'answer',
    verdict: g.verdict,
    understood: g.elements.filter((e) => e.matched).map((e) => e.text),
    missing: g.verdict === 'understood' ? [] : missing.slice(0, 3),
    misconception: g.contradiction,
    feedback: FEEDBACK[g.coverage],
    reexplain: null,
    reply: null,
    method: 'evidence',
    grading: { deterministic: g.verdict, coverage: g.coverage, model: null, final: g.verdict, modelOverruled: false },
  };
}

const RANK: Record<ConceptStatus, number> = { unknown: 0, weak: 1, partial: 2, understood: 3 };
const QUESTION_LIKE = /\?|？|(뭐|왜|어떻게|언제|어디|무엇|맞나요|인가요|나요|까요|건가요|되나요|해요\?)\s*$/;

/**
 * Combines the deterministic grade with a language model's analysis.
 *  - The model may LOWER the verdict (stricter is safe).
 *  - It may raise it only up to what the evidence allows: "understood" needs
 *    full_match, or partial_match where EVERY required element already has
 *    some evidence in the answer; a contradicted / no_match / not_evaluable
 *    answer can never become "understood".
 *  - It cannot turn an answer into a "question" unless the text reads like one.
 *  - When the model's verdict is overruled, its feedback / re-explanation are
 *    dropped (they were written for a verdict that no longer holds).
 */
export function reconcileAnalysis(g: DeterministicGrade, model: AnswerAnalysis | null, answerText: string): AnswerAnalysis {
  const det = evidenceAnalysis(g);
  if (!model || model.method !== 'ai') return det;
  if (model.kind === 'question') {
    if (QUESTION_LIKE.test(answerText.trim())) return { ...model, grading: { deterministic: g.verdict, coverage: g.coverage, model: model.verdict, final: model.verdict, modelOverruled: false } };
    model = { ...model, kind: 'answer', reply: null };
  }
  const everyRequiredTouched = g.elements.filter((e) => e.required && e.tokens.length >= MIN_ELEMENT_TOKENS).every((e) => e.hits > 0);
  const cap: ConceptStatus =
    g.coverage === 'full_match' || (g.coverage === 'partial_match' && g.mode === 'all' && everyRequiredTouched) ? 'understood' : g.coverage === 'contradicted' ? 'weak' : 'partial';
  let final: ConceptStatus;
  if (RANK[model.verdict] <= RANK[g.verdict]) final = model.verdict;
  else final = RANK[model.verdict] <= RANK[cap] ? model.verdict : RANK[cap] >= RANK[g.verdict] ? cap : g.verdict;
  const overruled = final !== model.verdict;
  if (!overruled) return { ...model, grading: { deterministic: g.verdict, coverage: g.coverage, model: model.verdict, final, modelOverruled: false } };
  return {
    ...det,
    verdict: final,
    feedback: FEEDBACK[final === 'understood' ? 'full_match' : final === 'partial' ? 'partial_match' : g.coverage === 'contradicted' ? 'contradicted' : 'no_match'],
    misconception: g.contradiction ?? model.misconception,
    method: 'ai',
    grading: { deterministic: g.verdict, coverage: g.coverage, model: model.verdict, final, modelOverruled: true },
  };
}

/** Recap: which of the day's core points the answer really names (each point checked as a required element). */
export function recapHitsByEvidence(points: { label: string; reference: string }[], answerText: string): string[] {
  const answer = answerTokens(answerText);
  return points
    .filter((p) => {
      const byLabel = element(p.label, true, answer);
      if (byLabel.tokens.length >= MIN_ELEMENT_TOKENS) return byLabel.matched;
      return element(p.reference, true, answer).matched;
    })
    .map((p) => p.label);
}

export const _internal = { needFor, splitReference, QUESTION_LIKE };
