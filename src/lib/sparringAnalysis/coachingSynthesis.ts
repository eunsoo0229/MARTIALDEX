import { askGeminiForJson } from '../fighterStyle/geminiJson';
import { getMartialArt, isSyntheticTrainingDomain } from '../loadData';
import { searchTechniques } from '../search';
import { listLearnedTechniques } from '../learnedTechniques/service';
import { isTechniqueInArt } from '../techniqueCanonical';
import { buildDataLimits, buildEvidenceFacts } from './coachingFacts';
import type {
  CoachingCategoryScore,
  CoachingCategoryScores,
  CoachingInsight,
  CoachingSynthesisResult,
  AnalysisLimitation,
  EvidenceFact,
  MotionEvent,
  NextTrainingItem,
  OverallScores,
  PostureSegment,
  SequenceAnalysisResult,
  TechniqueGuess,
  VisualEventInsight,
  WeakArea,
} from './types';

export interface CoachingSynthesisInput {
  martialArt: string;
  techniqueGuesses: TechniqueGuess[];
  motionEvents: MotionEvent[];
  opponentMotionEvents: MotionEvent[];
  /** Optional — absent when no technique guesses survived; facts/limits are still built from motion + posture data. */
  sequenceAnalysis?: SequenceAnalysisResult;
  visualInsights: VisualEventInsight[];
  postureSegments: PostureSegment[];
  styleObservations: string[];
  weakAreas: WeakArea[];
  videoDurationSec?: number;
  overallScores?: OverallScores;
  limitations?: AnalysisLimitation[];
}

const CATEGORY_KEYS = ['attack', 'defense', 'footwork', 'distance', 'timing', 'connection', 'tacticalVariety'] as const;
const INSUFFICIENT: CoachingCategoryScore = '분석 데이터 부족';

// Which real signals must exist before a category score is even eligible to
// be a number — checked in CODE, after Gemini answers, and used to force
// the field back to INSUFFICIENT regardless of what Gemini said. This is
// the "AI 혼자 판단하게 두지 않는다" backstop from the plan: a hallucinated
// confident number for a category with zero underlying evidence is exactly
// the failure mode spec section 16 warns against.
function hasEvidence(key: (typeof CATEGORY_KEYS)[number], input: CoachingSynthesisInput): boolean {
  switch (key) {
    case 'attack':
      return input.techniqueGuesses.length > 0 || input.motionEvents.some((e) => e.category === 'strike_like' || e.category === 'kick_like');
    case 'defense':
      return input.opponentMotionEvents.length > 0 || input.postureSegments.some((s) => s.metrics.some((m) => m.id === 'guard'));
    case 'footwork':
      return input.motionEvents.some((e) => e.category === 'footwork_movement');
    case 'distance':
      return (
        input.motionEvents.some((e) => e.category === 'distance_exit_like' || e.category === 'clinch_like') ||
        !!input.sequenceAnalysis?.perTechnique.some((t) => Object.keys(t.distanceBuckets).length > 0)
      );
    case 'timing':
      return (input.sequenceAnalysis?.reactiveRatio ?? null) !== null || input.motionEvents.length >= 5;
    case 'connection':
      return (input.sequenceAnalysis?.timeline.length ?? 0) >= 2;
    case 'tacticalVariety':
      return input.techniqueGuesses.length >= 2;
    default:
      return false;
  }
}

function isValidScore(v: unknown): v is CoachingCategoryScore {
  return typeof v === 'number' || v === INSUFFICIENT;
}

interface RawItem {
  label: string;
  factIds: string[];
}

interface RawNextTraining {
  title: string;
  drill: string;
  reason: string;
  factIds: string[];
  techniqueIds: string[];
}

export interface RawResponse {
  strengths: RawItem[];
  weaknesses: RawItem[];
  patternDiagnoses: { patternIndex: number; diagnosis: string }[];
  categoryScores: Record<string, unknown>;
  nextTraining: RawNextTraining[];
  overallFeedback: string;
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

function isRawItemArray(v: unknown): v is RawItem[] {
  return Array.isArray(v) && v.every((d) => d && typeof d === 'object' && isStr((d as RawItem).label) && isStrArray((d as RawItem).factIds));
}

function isRawResponse(data: unknown): data is RawResponse {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    isRawItemArray(d.strengths) &&
    isRawItemArray(d.weaknesses) &&
    Array.isArray(d.patternDiagnoses) &&
    d.patternDiagnoses.every((p) => p && typeof p === 'object' && typeof (p as Record<string, unknown>).patternIndex === 'number' && isStr((p as Record<string, unknown>).diagnosis)) &&
    !!d.categoryScores &&
    typeof d.categoryScores === 'object' &&
    Array.isArray(d.nextTraining) &&
    d.nextTraining.every((n) => {
      const x = n as RawNextTraining;
      return x && typeof x === 'object' && isStr(x.title) && isStr(x.drill) && isStr(x.reason) && isStrArray(x.factIds) && isStrArray(x.techniqueIds);
    }) &&
    isStr(d.overallFeedback)
  );
}

// Same id as fighterStyle's STYLE_CURRICULUM_MARTIAL_ART — MMA sessions search every art (no per-art filter), like SparringResultView.
const STYLE_ART = 'mma';

interface TrainingCandidate {
  id: string;
  name: string;
  learned: boolean;
}

/**
 * The ONLY technique ids "다음 훈련 추천" may reference: the user's own
 * learned techniques in this art first, then techniques the analysis
 * itself saw, then real search hits for each weak-area label (same
 * deterministic lookup SparringResultView/sparringToCurriculum use).
 */
function buildTrainingCandidates(input: CoachingSynthesisInput): TrainingCandidate[] {
  const byId = new Map<string, TrainingCandidate>();
  const inArt = (t: { martialArt: string } & Parameters<typeof isTechniqueInArt>[0]) =>
    !isSyntheticTrainingDomain(t.martialArt) && (input.martialArt === STYLE_ART || isTechniqueInArt(t, input.martialArt));
  for (const e of listLearnedTechniques()) {
    if (byId.size >= 25) break;
    if (inArt(e.technique)) byId.set(e.technique.id, { id: e.technique.id, name: e.technique.koreanName || e.technique.name, learned: true });
  }
  for (const g of input.techniqueGuesses) if (!byId.has(g.techniqueId)) byId.set(g.techniqueId, { id: g.techniqueId, name: g.techniqueName, learned: false });
  const filters = input.martialArt === STYLE_ART ? {} : { martialArt: input.martialArt };
  for (const w of input.weakAreas) {
    for (const t of searchTechniques(w.label, 3, filters)) {
      if (!isSyntheticTrainingDomain(t.martialArt) && !byId.has(t.id)) byId.set(t.id, { id: t.id, name: t.koreanName || t.name, learned: false });
    }
  }
  return [...byId.values()].slice(0, 40);
}


/**
 * Grounded coaching (v2). Code builds the evidence (coachingFacts.ts); the
 * AI may only interpret it:
 *   - every strength/weakness/drill must cite ≥1 real fact id — anything
 *     citing none is dropped, and the displayed evidence is the code's fact
 *     text, never the AI's wording;
 *   - patternDiagnoses reference patterns by index and are rebuilt from the
 *     real pattern (unchanged discipline);
 *   - drill technique ids are filtered against buildTrainingCandidates();
 *   - dataLimits (what is NOT measured) are code-determined and always shown.
 * Returns null (not throws) on any AI failure/invalid response — the caller
 * treats that exactly like "AI stage skipped".
 */
export interface PreparedCoaching {
  patterns: SequenceAnalysisResult['patterns'];
  facts: EvidenceFact[];
  dataLimits: string[];
  candidates: TrainingCandidate[];
}

/** Everything code decides before the AI call (facts, limits, pattern list, technique whitelist). */
export function prepareCoaching(input: CoachingSynthesisInput): PreparedCoaching {
  return {
    patterns: input.sequenceAnalysis?.patterns.slice(0, 15) ?? [],
    facts: buildEvidenceFacts(input),
    dataLimits: buildDataLimits(input),
    candidates: buildTrainingCandidates(input),
  };
}

export async function synthesizeCoaching(input: CoachingSynthesisInput): Promise<CoachingSynthesisResult | null> {
  const art = getMartialArt(input.martialArt);
  const prepared = prepareCoaching(input);
  const { patterns, facts, dataLimits, candidates } = prepared;
  if (facts.length === 0) return null;

  const contextParts = [
    `종목: ${art?.nameKo ?? input.martialArt}`,
    '',
    '[측정/계산된 사실 — 이것만 근거로 사용, 반드시 id로 인용]',
    ...facts.map((f) => `${f.id}: ${f.text}`),
    '',
    '[측정되지 않는 것 — 이 항목에 대해서는 평가하지 말 것]',
    ...dataLimits.map((l) => `- ${l}`),
    '',
    '[연결 패턴 목록 — patternDiagnoses에서 인덱스로 참조]',
    ...(patterns.length > 0 ? patterns.map((p, i) => `${i}: ${p.fromTechniqueName} → ${p.toTechniqueName ?? '후속 공격 없음'} (${p.count}회)`) : ['(없음)']),
    '',
    '[추천 훈련에 사용할 수 있는 기술 — techniqueIds는 이 목록의 id만]',
    ...(candidates.length > 0 ? candidates.map((c) => `${c.id}: ${c.name}${c.learned ? ' (사용자가 학습한 기술)' : ''}`) : ['(없음)']),
  ];

  const result = await askGeminiForJson<RawResponse>({
    systemInstruction: [
      '너는 스파링 코치다. 목적은 사용자가 무엇을 했는지 나열하는 것이 아니라, 잘한 점과 부족한 점을 찾아 다음 훈련에 도움을 주는 것이다.',
      '근거는 오직 "[측정/계산된 사실]" 목록이다. 각 항목은 근거가 된 사실 id(예: "F3")를 factIds에 1개 이상 넣어야 한다.',
      '사실 목록에 없는 행동(예: 공격 후 가드가 내려감, 피격, 체력 저하, 상대의 심리)을 측정한 것처럼 쓰지 않는다. "[측정되지 않는 것]"의 항목은 평가하지 않는다.',
      '가능하면 기술 횟수 자체보다 거리·타이밍·공격/방어 전환·가드·움직임·공격 패턴·페이스 관점에서 해석하되, 해당 사실이 있을 때만 그렇게 한다.',
      '근거가 부족하면 항목 수를 줄인다(억지로 채우지 않음).',
      '',
      'strengths: 잘한 점(최대 4개) { "label": 한 문장 한국어 코칭 문장, "factIds": string[] }',
      'weaknesses: 개선할 점(최대 4개) 같은 형식.',
      'patternDiagnoses: "[연결 패턴 목록]"의 인덱스만 참조 { "patternIndex": number, "diagnosis": string }.',
      'categoryScores: attack/defense/footwork/distance/timing/connection/tacticalVariety 각각 0-100 또는 "분석 데이터 부족".',
      'nextTraining: 다음 훈련 과제(최대 3개). { "title": 짧은 제목, "drill": 실제로 할 연습(횟수/라운드 등 구체적으로), "reason": 어떤 개선점 때문인지, "factIds": string[], "techniqueIds": "[추천 훈련에 사용할 수 있는 기술]"의 id만(사용자가 학습한 기술 우선, 없으면 []) }',
      'overallFeedback: 종합 평가 2-4문장. 잘한 점, 가장 큰 개선 포인트, 다음 훈련에서 집중할 패턴을 사실에 근거해 요약한다. 측정 한계가 결론에 중요하면 한 번 언급한다.',
      '',
      '출력: 위 키를 모두 가진 JSON 객체 하나.',
    ].join('\n'),
    contextText: contextParts.join('\n'),
    question: '위 사실만 근거로 스파링 코칭 분석을 작성해줘.',
    validate: isRawResponse,
  });

  if (!result.ok) return null;
  return groundCoachingResponse(result.data, input, prepared);
}

/**
 * Turns a schema-valid AI response into the stored result, enforcing the
 * grounding rules in code (see synthesizeCoaching's doc comment). Pure —
 * exported so the rules can be tested without a live AI call.
 */
export function groundCoachingResponse(raw: RawResponse, input: CoachingSynthesisInput, prepared: PreparedCoaching): CoachingSynthesisResult {
  const { patterns, facts, dataLimits, candidates } = prepared;
  const factById = new Map(facts.map((f) => [f.id, f]));
  const candidateIds = new Set(candidates.map((c) => c.id));
  const validFactIds = (ids: string[]) => [...new Set(ids.filter((id) => factById.has(id)))];
  const grounded = (items: RawItem[], max: number): CoachingInsight[] =>
    items
      .map((it) => ({ label: it.label.trim(), factIds: validFactIds(it.factIds) }))
      .filter((it) => it.label && it.factIds.length > 0)
      .slice(0, max)
      .map((it) => ({ label: it.label, factIds: it.factIds, evidence: it.factIds.map((id) => factById.get(id)!.text).join(' / ') }));

  const categoryScores = {} as CoachingCategoryScores;
  for (const key of CATEGORY_KEYS) {
    const evidenceOk = hasEvidence(key, input);
    const rawScore = raw.categoryScores[key];
    categoryScores[key] = evidenceOk && isValidScore(rawScore) ? rawScore : INSUFFICIENT;
  }

  const patternDiagnoses = raw.patternDiagnoses
    .filter((p) => p.patternIndex >= 0 && p.patternIndex < patterns.length)
    .map((p) => {
      const real = patterns[p.patternIndex];
      return {
        patternDescription: `${real.fromTechniqueName} → ${real.toTechniqueName ?? '후속 공격 없음'}`,
        occurrenceCount: real.count,
        diagnosis: p.diagnosis,
      };
    });

  const nextTraining: NextTrainingItem[] = raw.nextTraining
    .map((n) => ({
      title: n.title.trim(),
      drill: n.drill.trim(),
      reason: n.reason.trim(),
      factIds: validFactIds(n.factIds),
      techniqueIds: [...new Set(n.techniqueIds.filter((id) => candidateIds.has(id)))].slice(0, 3),
    }))
    .filter((n) => n.title && n.drill && n.factIds.length > 0)
    .slice(0, 3);

  const overallFeedback = raw.overallFeedback.trim().slice(0, 800) || null;

  return {
    strengths: grounded(raw.strengths, 4),
    weaknesses: grounded(raw.weaknesses, 4),
    patternDiagnoses,
    categoryScores,
    // Kept for sparringToCurriculum.ts (the only consumer) — now the drills' own text.
    improvementDirections: nextTraining.map((n) => `${n.title}: ${n.drill}`),
    generatedAt: new Date().toISOString(),
    facts,
    dataLimits,
    nextTraining,
    overallFeedback,
  };
}
