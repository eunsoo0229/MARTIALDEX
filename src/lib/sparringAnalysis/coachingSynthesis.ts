import { askGeminiForJson } from '../fighterStyle/geminiJson';
import { getMartialArt } from '../loadData';
import type {
  CoachingCategoryScore,
  CoachingCategoryScores,
  CoachingInsight,
  CoachingSynthesisResult,
  MotionEvent,
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
  sequenceAnalysis: SequenceAnalysisResult;
  visualInsights: VisualEventInsight[];
  postureSegments: PostureSegment[];
  styleObservations: string[];
  weakAreas: WeakArea[];
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
        input.sequenceAnalysis.perTechnique.some((t) => Object.keys(t.distanceBuckets).length > 0)
      );
    case 'timing':
      return input.sequenceAnalysis.reactiveRatio !== null || input.motionEvents.length >= 5;
    case 'connection':
      return input.sequenceAnalysis.timeline.length >= 2;
    case 'tacticalVariety':
      return input.techniqueGuesses.length >= 2;
    default:
      return false;
  }
}

function isValidScore(v: unknown): v is CoachingCategoryScore {
  return typeof v === 'number' || v === INSUFFICIENT;
}

interface RawResponse {
  strengths: { label: string; evidence: string }[];
  weaknesses: { label: string; evidence: string }[];
  patternDiagnoses: { patternIndex: number; diagnosis: string }[];
  categoryScores: Record<string, unknown>;
  improvementDirections: string[];
}

function isCoachingInsightArray(v: unknown): v is CoachingInsight[] {
  return Array.isArray(v) && v.every((d) => d && typeof d === 'object' && typeof (d as Record<string, unknown>).label === 'string' && typeof (d as Record<string, unknown>).evidence === 'string');
}

function isRawResponse(data: unknown): data is RawResponse {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    isCoachingInsightArray(d.strengths) &&
    isCoachingInsightArray(d.weaknesses) &&
    Array.isArray(d.patternDiagnoses) &&
    d.patternDiagnoses.every((p) => p && typeof p === 'object' && typeof (p as Record<string, unknown>).patternIndex === 'number' && typeof (p as Record<string, unknown>).diagnosis === 'string') &&
    !!d.categoryScores &&
    typeof d.categoryScores === 'object' &&
    Array.isArray(d.improvementDirections) &&
    d.improvementDirections.every((s) => typeof s === 'string')
  );
}

/**
 * One text-only Gemini call that turns everything already computed (real
 * pattern counts from sequenceAnalysis.ts, real motion-event rates, real
 * posture/style observations) into a coaching narrative. `patternDiagnoses`
 * is the one place this most needed a whitelist guard: Gemini is asked to
 * reference patterns only by INDEX into the real pattern list this function
 * hands it, and patternDescription/occurrenceCount in the final result are
 * always reconstructed from that real pattern — never from what Gemini said
 * the pattern was (same discipline as techniqueHypothesis.ts's candidateIds
 * whitelist). Returns null (not throws) on any failure/invalid response —
 * the caller must treat that exactly like "AI stage skipped".
 */
export async function synthesizeCoaching(input: CoachingSynthesisInput): Promise<CoachingSynthesisResult | null> {
  const art = getMartialArt(input.martialArt);
  const patterns = input.sequenceAnalysis.patterns.slice(0, 15); // cap context size — the rest are lower-count, less coaching-relevant

  const contextParts = [
    `종목: ${art?.nameKo ?? input.martialArt}`,
    '',
    '실제 감지된 기술 사용 횟수:',
    ...input.techniqueGuesses.map((g) => `- ${g.techniqueName}: ${g.occurrences.length}회`),
    '',
    '실제 감지된 연결 패턴(발생 순서 기반, 각 항목의 인덱스를 patternDiagnoses에서 참조):',
    ...patterns.map((p, i) => `${i}: ${p.fromTechniqueName} → ${p.toTechniqueName ?? '후속 공격 없음'} (${p.count}회)`),
    '',
    `단독 공격: ${input.sequenceAnalysis.soloCount}회, 콤비네이션: ${input.sequenceAnalysis.combinationCount}회`,
    input.sequenceAnalysis.reactiveRatio !== null
      ? `상대 동작 직후 반응형으로 사용한 비율: ${Math.round(input.sequenceAnalysis.reactiveRatio * 100)}%`
      : '상대방 추적 데이터 없음 — 선공/후공 경향 확인 불가',
    '',
    input.visualInsights.length > 0
      ? `영상 프레임 기반 적중/상대반응 관찰 (${input.visualInsights.length}개 장면): ${input.visualInsights
          .map((v) => `${v.timestampSec}초 - 적중:${v.hitAssessment}${v.opponentReaction ? `, 상대반응:${v.opponentReaction}` : ''}`)
          .join(' / ')}`
      : '영상 프레임 기반 적중/상대반응 관찰 없음',
    '',
    input.styleObservations.length > 0 ? `기존 스타일 관찰:\n${input.styleObservations.join('\n')}` : '',
    input.weakAreas.length > 0 ? `기존 약점 지표: ${input.weakAreas.map((w) => `${w.label}${w.score !== null ? `(${w.score}점)` : ''}`).join(', ')}` : '',
  ].filter(Boolean);

  const result = await askGeminiForJson<RawResponse>({
    systemInstruction: [
      '아래는 실제 스파링 영상 분석에서 코드가 계산한 데이터다(추측이 아닌 실측). 이 데이터만 근거로 코칭 진단을 작성한다.',
      '데이터에 없는 사실을 새로 만들어내지 않는다 — 특히 상대의 심리 상태(위축됨, 자신감 등)는 절대 단정하지 않는다.',
      '',
      'strengths/weaknesses: 위 데이터에서 실제로 뒷받침되는 만큼만(각각 최대 5개, 근거 없으면 억지로 채우지 않음) 뽑는다.',
      '각 항목은 { "label": 짧은 한국어 요약, "evidence": 근거가 된 실제 데이터를 인용한 1문장 } 형태.',
      '',
      'patternDiagnoses: 위 "실제 감지된 연결 패턴" 목록에 있는 항목에 대해서만, 그 인덱스(patternIndex)를 참조해',
      '진단 문장(diagnosis)을 작성한다. 목록에 없는 패턴을 새로 만들어 진단하지 않는다.',
      '',
      'categoryScores: attack/defense/footwork/distance/timing/connection/tacticalVariety 각각 0-100 점수 또는',
      '"분석 데이터 부족" 중 하나. 해당 항목을 뒷받침할 데이터가 부족하면 반드시 "분석 데이터 부족"으로 답한다 — 억지로 숫자를 만들지 않는다.',
      '',
      'improvementDirections: 위 데이터에 기반한 구체적 개선 방향 문장 배열(최대 5개).',
      '',
      '출력 형식(JSON 객체 하나):',
      '{',
      '  "strengths": [{"label": string, "evidence": string}],',
      '  "weaknesses": [{"label": string, "evidence": string}],',
      '  "patternDiagnoses": [{"patternIndex": number, "diagnosis": string}],',
      '  "categoryScores": {"attack": number|"분석 데이터 부족", "defense": ..., "footwork": ..., "distance": ..., "timing": ..., "connection": ..., "tacticalVariety": ...},',
      '  "improvementDirections": string[]',
      '}',
    ].join('\n'),
    contextText: contextParts.join('\n'),
    question: '위 실제 분석 데이터를 바탕으로 코칭 진단을 작성해줘.',
    validate: isRawResponse,
  });

  if (!result.ok) return null;
  const raw = result.data;

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

  return {
    strengths: raw.strengths,
    weaknesses: raw.weaknesses,
    patternDiagnoses,
    categoryScores,
    improvementDirections: raw.improvementDirections,
    generatedAt: new Date().toISOString(),
  };
}
