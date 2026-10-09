import type { Technique } from '../../types';
import { askGeminiForJsonWithGrounding } from '../userTechniques/geminiJson';
import { COACH_SYSTEM_INSTRUCTION, techniqueData } from '../aiCoachDay/service';
import { politeFix } from '../aiCoachDay/politeSpeech';
import type { AnswerAnalysis, ConceptStatus, LessonConcept, LessonLevel, PendingQuestion } from './types';
import type { RecapPlan } from './engine';
import { contentTokens, overlap } from './text';

// Grades ONE student answer by meaning — what was understood, what is
// missing or misunderstood — and drafts the coach's feedback plus a fresh,
// data-grounded re-explanation in the same call (one API call per answer).
// When the AI is unavailable it falls back to an honest keyword overlap so
// the lesson never blocks.

interface RawAnalysis {
  kind?: string;
  verdict: string;
  understood?: unknown;
  missing?: unknown;
  misconception?: unknown;
  feedback: string;
  reexplain?: unknown;
  reply?: unknown;
}

function isRaw(v: unknown): v is RawAnalysis {
  if (!v || typeof v !== 'object') return false;
  const o = v as RawAnalysis;
  return typeof o.verdict === 'string' && typeof o.feedback === 'string';
}

function toVerdict(v: string): ConceptStatus | null {
  const s = v.toLowerCase().trim();
  if (/^(understood|correct|이해)/.test(s)) return 'understood';
  if (/^(partial|부분)/.test(s)) return 'partial';
  if (/^(weak|incorrect|wrong|misunderstood|오답)/.test(s)) return 'weak';
  if (/^(unknown|none|모름)/.test(s)) return 'unknown';
  return null;
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 4) : []);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Banned mechanical reactions — the coach never answers with just these. */
const HARSH = /^(틀렸습니다|틀렸어요|아닙니다|아니에요|오답입니다|다시 하세요)[.!]?\s*/;

function soften(feedback: string, verdict: ConceptStatus): string {
  let f = politeFix(feedback.trim());
  if (HARSH.test(f)) f = f.replace(HARSH, verdict === 'partial' ? '방향은 맞습니다. ' : '조금 다르게 생각해 보겠습니다. ');
  return f;
}

const LEVEL_NOTE: Record<LessonLevel, string> = {
  easy: '학습자가 어려워하고 있다. 재설명은 전문용어를 줄이고 일상적인 말과 짧은 예시로 1~2문장.',
  normal: '재설명은 1~2문장.',
  advanced: '학습자가 잘 따라오고 있다. 재설명은 1문장으로 짧게, 이유 중심으로.',
};

export interface AnalyzeInput {
  /** The technique being taught — null for a one-off topic lesson, which passes `material` instead. */
  technique: Technique | null;
  /** One-off lessons (oneOff.ts): the lesson's own grounded material (search-derived points + sources), used instead of technique data. */
  material?: string;
  concept: LessonConcept | null;
  /** Reference for questions not tied to one concept (practice review / video / scenario). */
  reference: string;
  pending: PendingQuestion;
  answer: string;
  level: LessonLevel;
  /** Explanations already given on this concept — the re-explanation must say it differently. */
  alreadyExplained: string[];
  /** Extra place/plan context (coachPlaceContext). */
  place?: string;
}

export function offlineAnalysis(input: Pick<AnalyzeInput, 'concept' | 'reference' | 'answer'>): AnswerAnalysis {
  const keys = input.concept?.keywords.length ? input.concept.keywords : contentTokens(input.reference).slice(0, 12);
  const ans = contentTokens(input.answer);
  const hits = overlap(ans, keys);
  const need = Math.min(2, Math.max(1, Math.ceil(keys.length / 4)));
  const verdict: ConceptStatus = hits >= need + 1 || (hits >= need && keys.length <= 3) ? 'understood' : hits >= 1 ? 'partial' : 'weak';
  const ref = (input.concept?.reference ?? input.reference).split(' / ')[0];
  const feedback =
    verdict === 'understood'
      ? '맞습니다. 핵심을 잘 짚으셨습니다.'
      : verdict === 'partial'
        ? '방향은 맞습니다. 한 가지를 더 생각해 보겠습니다.'
        : '조금 다르게 생각해 보겠습니다.';
  return {
    kind: 'answer',
    verdict,
    understood: [],
    missing: verdict === 'understood' ? [] : [ref],
    misconception: null,
    feedback: `${feedback} (지금은 AI 채점을 사용할 수 없어 핵심 단어로 간이 판정했습니다.)`,
    reexplain: null,
    reply: null,
    method: 'keyword',
  };
}

export async function analyzeAnswer(input: AnalyzeInput): Promise<AnswerAnalysis> {
  const ref = input.concept?.reference ?? input.reference;
  const system = [
    COACH_SYSTEM_INSTRUCTION,
    '',
    '지금은 1:1 수업 중이다. 코치가 던진 질문에 대한 학생의 답을 [기술 데이터]와 [모범 답안]의 "의미"로 평가한다. 표현이 달라도 핵심 의미가 맞으면 이해한 것이다.',
    '먼저 학생의 말이 질문에 대한 "답"인지, 코치에게 하는 "질문"인지 판단한다(kind). 질문이면 reply에 데이터에 근거한 2~3문장 답을 쓰고 verdict는 "unknown"으로 둔다.',
    'verdict: "understood"(질문이 묻는 핵심을 의미상 맞힘), "partial"(일부만 맞거나 핵심 이유가 빠짐), "weak"(핵심과 다르거나 잘못 이해함), "unknown"(모르겠다고 하거나 답이 없음).',
    '짧은 구어체 답을 기준으로 한다. 데이터의 세부를 전부 말하지 않았다는 이유만으로 partial로 내리지 않는다.',
    'understood: 학생이 맞게 이해한 점(짧은 구절 배열). missing: 빠졌거나 잘못 이해한 점(짧은 구절 배열). misconception: 잘못된 생각이 있으면 한 구절, 없으면 null.',
    'feedback: 1~2문장의 코치 말. "틀렸습니다", "아닙니다", "다시 하세요"처럼 기계적으로 말하지 않는다. 맞힌 부분을 먼저 구체적으로 인정하고(예: "○○는 정확하게 이해하셨습니다."), 부족하면 "다만 한 가지가 더 있습니다."처럼 이어 간다. 정답이면 짧게 칭찬하고 이유를 한 구절 덧붙인다. 학생이 왜 그렇게 답했을지 고려해 오해의 원인을 짚는다.',
    `reexplain: verdict가 understood가 아니면, missing을 채우는 새 설명을 쓴다. [이미 한 설명]과 같은 문장을 반복하지 말고 다른 각도(이유, 몸의 느낌, 실수했을 때 결과)로 말한다. ${LEVEL_NOTE[input.level]} 질문으로 끝내지 않는다. understood면 null.`,
    '출력: {"kind":"answer"|"question","verdict":"understood"|"partial"|"weak"|"unknown","understood":string[],"missing":string[],"misconception":string|null,"feedback":string,"reexplain":string|null,"reply":string|null}',
  ].join('\n');
  const context = [
    input.material ? `[수업 자료]\n${input.material}` : input.technique ? `[기술 데이터]\n${techniqueData(input.technique)}` : '',
    `[모범 답안]\n${ref}`,
    input.alreadyExplained.length ? `[이미 한 설명]\n${input.alreadyExplained.join('\n')}` : '',
    input.place ?? '',
  ]
    .filter(Boolean)
    .join('\n\n');
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await askGeminiForJsonWithGrounding<RawAnalysis>({
      systemInstruction: system,
      contextText: context,
      question: `코치 질문: ${input.pending.text}\n학생 답: ${input.answer}`,
      useSearchGrounding: false,
      validate: isRaw,
    });
    if (!r.ok) {
      // Not signed in / no network: don't retry, fall back right away.
      if (r.code !== 'PARSE_ERROR') break;
      continue;
    }
    const verdict = toVerdict(r.data.verdict);
    if (!verdict) continue;
    const kind = r.data.kind === 'question' ? 'question' : 'answer';
    const reexplain = strOrNull(r.data.reexplain);
    return {
      kind,
      verdict,
      understood: strList(r.data.understood),
      missing: strList(r.data.missing),
      misconception: strOrNull(r.data.misconception),
      feedback: soften(r.data.feedback, verdict),
      reexplain: verdict === 'understood' || !reexplain ? null : politeFix(reexplain),
      reply: kind === 'question' && strOrNull(r.data.reply) ? politeFix(strOrNull(r.data.reply)!) : null,
      method: 'ai',
    };
  }
  return offlineAnalysis(input);
}

/** Which of the day's core points the student named in the recap (AI by meaning, keyword fallback). */
export async function gradeRecap(technique: Technique | null, plan: RecapPlan, answer: string): Promise<string[]> {
  const labels = plan.points.map((p) => p.label);
  const r = await askGeminiForJsonWithGrounding<{ hits: string[] }>({
    systemInstruction: [
      COACH_SYSTEM_INSTRUCTION,
      '',
      '학생이 오늘 수업의 핵심 포인트를 말했다. [핵심 포인트 목록] 중 학생이 의미상 언급한 항목의 label만 그대로 골라 hits 배열로 출력한다. 표현이 달라도 의미가 같으면 포함한다.',
      '출력: {"hits": string[]}',
    ].join('\n'),
    contextText: `[핵심 포인트 목록]\n${plan.points.map((p) => `- label: ${p.label} | 기술: ${p.techniqueName} | 내용: ${p.reference}`).join('\n')}${technique ? `\n\n[기술 데이터]\n${techniqueData(technique)}` : ''}`,
    question: `학생 답: ${answer}`,
    useSearchGrounding: false,
    validate: (v: unknown): v is { hits: string[] } => !!v && typeof v === 'object' && Array.isArray((v as { hits?: unknown }).hits),
  });
  if (r.ok) return r.data.hits.filter((h) => labels.includes(h));
  const ans = contentTokens(answer);
  return plan.points.filter((p) => overlap(ans, contentTokens(p.label)) >= 1).map((p) => p.label);
}
