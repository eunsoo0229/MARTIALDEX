import type { ClipSignals, ComparisonJudgement, Confidence, ReferenceCriterion, ReferencePhase, Reliability, ScoreBreakdown, Verdict } from './types';
import { IMPORTANCE_WEIGHT } from './types';

// The score is computed HERE, from the AI's per-criterion verdicts — the AI
// never returns a number. Formula (documented in docs/AI_PROJECT_GUIDE.md):
//
//   value(verdict)  match = 1, partial = 0.5, mismatch = 0, not_observable = excluded
//   weight          importance: core 3 · support 2 · minor 1
//   raw score       100 × Σ weight·value / Σ weight   (observable criteria only)
//   core cap        core deficit = core mismatches + 0.5 × core partials
//                   (medium/high confidence only): ≥ 2 → at most 50, ≥ 1 → at
//                   most 70, > 0 → at most 85 (looking similar overall cannot
//                   hide a wrong key movement)
//   coverage        Σ weight observable / Σ weight all criteria
//   reliability     0.4·coverage + 0.25·visibleRatio + 0.2·mean confidence×(0.5+0.5·agreement) + 0.15·camera-view match
//                   (agreement = share of criteria two independent AI judgements agreed on)
//                   (different camera direction → at most 0.74, i.e. never "high")
//
// No score at all ("평가 불가") when: the AI says a different technique was
// performed, no technique was performed, coverage < 0.5, fewer than 2
// observable criteria, or the person was visible in < 40% of the frames.

export const VERDICT_VALUE: Record<Exclude<Verdict, 'not_observable'>, number> = { match: 1, partial: 0.5, mismatch: 0 };
const CONFIDENCE_VALUE: Record<Confidence, number> = { high: 1, medium: 0.7, low: 0.4 };

export const MIN_COVERAGE = 0.5;
export const MIN_OBSERVED = 2;
export const MIN_VISIBLE = 0.4;

export function reliabilityLabel(v: number): Reliability {
  return v >= 0.75 ? 'high' : v >= 0.5 ? 'medium' : 'low';
}

export const RELIABILITY_LABEL: Record<Reliability, string> = { high: '높음', medium: '보통', low: '낮음' };

export function scoreComparison(input: {
  criteria: ReferenceCriterion[];
  phases: ReferencePhase[];
  judgement: ComparisonJudgement;
  signals: ClipSignals;
  viewMatches: boolean;
}): ScoreBreakdown {
  const { criteria, phases, judgement, signals } = input;
  const byId = new Map(judgement.criteria.map((c) => [c.criterionId, c]));
  const totalWeight = criteria.reduce((s, c) => s + IMPORTANCE_WEIGHT[c.importance], 0);
  const observed = criteria
    .map((c) => ({ c, r: byId.get(c.id) }))
    .filter((x): x is { c: ReferenceCriterion; r: NonNullable<typeof x.r> } => !!x.r && x.r.verdict !== 'not_observable');
  const observedWeight = observed.reduce((s, x) => s + IMPORTANCE_WEIGHT[x.c.importance], 0);
  const coverage = totalWeight ? observedWeight / totalWeight : 0;
  // confidence of the verdicts, discounted when the independent judgements disagreed
  const meanConfidence = (observed.length ? observed.reduce((s, x) => s + CONFIDENCE_VALUE[x.r.confidence], 0) / observed.length : 0) * (0.5 + 0.5 * (judgement.agreement ?? 1));
  const rawReliability = Math.round((0.4 * coverage + 0.25 * Math.min(1, signals.visibleRatio) + 0.2 * meanConfidence + 0.15 * (input.viewMatches ? 1 : 0.4)) * 100) / 100;
  // A different camera direction can hide parts of the movement: never "high" then.
  const reliabilityValue = input.viewMatches ? rawReliability : Math.min(rawReliability, 0.74);
  const reliability = reliabilityLabel(reliabilityValue);

  const weighted = (xs: typeof observed) => {
    const w = xs.reduce((s, x) => s + IMPORTANCE_WEIGHT[x.c.importance], 0);
    if (!w) return null;
    return Math.round((100 * xs.reduce((s, x) => s + IMPORTANCE_WEIGHT[x.c.importance] * VERDICT_VALUE[x.r.verdict as keyof typeof VERDICT_VALUE], 0)) / w);
  };
  const phaseScores = phases.map((p) => ({ phaseId: p.id, name: p.name, score: weighted(observed.filter((x) => x.c.phaseId === p.id)) }));
  const base = { phaseScores, coverage: Math.round(coverage * 100) / 100, reliability, reliabilityValue };

  const reasons: string[] = [];
  if (!judgement.techniquePerformed) return { ...base, status: 'not_performed', score: null, rawScore: null, cap: null, reasons: ['영상에서 기술을 수행하는 동작을 확인하지 못했습니다.'] };
  if (!judgement.sameTechnique) return { ...base, status: 'different_technique', score: null, rawScore: null, cap: null, reasons: ['기준 영상과 다른 기술을 수행한 것으로 판단되어 점수를 매기지 않았습니다.'] };
  if (signals.visibleRatio < MIN_VISIBLE) reasons.push(`사람이 인식된 프레임이 ${Math.round(signals.visibleRatio * 100)}%뿐입니다.`);
  if (coverage < MIN_COVERAGE) reasons.push(`평가 기준 중 관찰 가능한 비중이 ${Math.round(coverage * 100)}%로 너무 적습니다.`);
  if (observed.length < MIN_OBSERVED) reasons.push('관찰 가능한 평가 기준이 2개 미만입니다.');
  if (reasons.length) return { ...base, status: 'insufficient', score: null, rawScore: null, cap: null, reasons };

  const rawScore = weighted(observed)!;
  // core deficit: a core criterion missed counts 1, only partly met 0.5 (low-confidence verdicts don't count)
  const coreMisses = observed.filter((x) => x.c.importance === 'core' && x.r.verdict === 'mismatch' && x.r.confidence !== 'low').length;
  const corePartials = observed.filter((x) => x.c.importance === 'core' && x.r.verdict === 'partial' && x.r.confidence !== 'low').length;
  const deficit = coreMisses + 0.5 * corePartials;
  const what =
    coreMisses && corePartials
      ? `핵심 기준 ${coreMisses}개가 기준 영상과 다르고 ${corePartials}개는 부분적으로만 맞습니다`
      : coreMisses
        ? `핵심 기준 ${coreMisses}개가 기준 영상과 다릅니다`
        : `핵심 기준 ${corePartials}개가 부분적으로만 맞습니다`;
  const cap = deficit >= 2 ? { value: 50, reason: `${what}.` } : deficit >= 1 ? { value: 70, reason: `${what}.` } : deficit > 0 ? { value: 85, reason: `${what}.` } : null;
  const score = cap ? Math.min(rawScore, cap.value) : rawScore;
  return { ...base, status: 'scored', score, rawScore, cap, reasons: [] };
}
