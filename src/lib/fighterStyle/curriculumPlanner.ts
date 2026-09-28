import type { Technique } from '../../types';
import type { CurriculumDay, CurriculumPhaseRange } from '../curriculum/types';
import type { Intensity, StylePhaseKey, TechniqueMatch, UserLevel } from './types';
// resolveTechnique (not the official-only getTechnique) so a technique
// discovered via add_teq/user_techniques for this style curriculum still
// resolves here instead of being silently dropped when building each day.
import { resolveTechnique as getTechnique } from '../userTechniques/service';

const PHASE_ORDER: StylePhaseKey[] = ['fundamentals', 'entries', 'position', 'connection', 'situational'];

const PHASE_LABEL: Record<StylePhaseKey, string> = {
  fundamentals: '기본기',
  entries: '거리 좁히기 · 진입',
  position: '포지션 컨트롤',
  connection: '기술 연결 · 마무리',
  situational: '상황별 응용',
};

const PHASE_BASE_WEIGHT: Record<StylePhaseKey, number> = {
  fundamentals: 0.15,
  entries: 0.24,
  position: 0.26,
  connection: 0.22,
  situational: 0.13,
};

const INTENSITY_PER_DAY: Record<Intensity, [number, number]> = {
  light: [1, 2],
  normal: [2, 3],
  intensive: [3, 4],
};
const INTENSITY_REVIEW_CADENCE: Record<Intensity, number> = {
  light: 4,
  normal: 6,
  intensive: 7,
};

const DIFF_RANK: Record<string, number> = { beginner: 0, intermediate: 2, advanced: 3 };
function diffRank(d: string | null | undefined): number {
  return d ? (DIFF_RANK[d] ?? 1) : 1;
}

// Distributes `total` across the given phase weights as integers that sum
// EXACTLY to `total` (largest-remainder method) — this is what lets the
// planner guarantee the final day count matches the user's chosen duration
// exactly, regardless of how many phases are active or how uneven the
// weights are.
function largestRemainderRound(weights: Partial<Record<StylePhaseKey, number>>, total: number): Record<string, number> {
  const keys = Object.keys(weights) as StylePhaseKey[];
  const sum = keys.reduce((s, k) => s + (weights[k] ?? 0), 0) || 1;
  const withFrac = keys.map((k) => {
    const exact = (total * (weights[k] ?? 0)) / sum;
    return { k, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  const result: Record<string, number> = {};
  for (const w of withFrac) result[w.k] = w.floor;
  let remaining = total - withFrac.reduce((s, w) => s + w.floor, 0);
  withFrac.sort((a, b) => b.frac - a.frac);
  for (let i = 0; remaining > 0 && i < withFrac.length; i++, remaining--) {
    result[withFrac[i].k]++;
  }
  return result;
}

function shortLabel(t: Technique): string {
  const base = t.koreanName && t.koreanName !== t.name && t.koreanName.length <= 14 ? t.koreanName : t.name;
  const cut = base.split(' / ')[0].split(' (')[0];
  return cut.length > 24 ? cut.slice(0, 23) + '…' : cut;
}

function learningGoalFor(t: Technique, used: Set<string>): string {
  const raw = (t.purpose || t.description || '').split('\n')[0].trim();
  const candidate = raw.length > 100 ? raw.slice(0, 99) + '…' : raw;
  if (candidate && !used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  return `${shortLabel(t)}의 기본 동작과 활용 상황을 이해한다.`;
}

// How many days of REAL content a phase's own matched-technique pool can
// sustain: enough teaching days to work through the pool at this
// intensity's per-day pace, plus the review days that cadence would insert
// along the way. A phase weight (PHASE_BASE_WEIGHT) is a starting point for
// how days SHOULD be split, not a promise that the phase has enough
// matched techniques to fill that many — capping each phase's allocation
// at this capacity (see the redistribution below) is what keeps a
// thin-pool phase from generating "관련 기술 없음" placeholder days.
function estimatePhaseCapacityDays(poolSize: number, perDayRange: [number, number], reviewCadence: number): number {
  if (poolSize <= 0) return 0;
  const avgPerDay = (perDayRange[0] + perDayRange[1]) / 2;
  const teachingDays = Math.ceil(poolSize / avgPerDay);
  const reviewDaysWithinPhase = Math.floor(teachingDays / reviewCadence);
  return teachingDays + reviewDaysWithinPhase;
}

function dominantDifficulty(techs: Technique[]): 'beginner' | 'intermediate' | 'advanced' {
  if (techs.some((t) => t.difficulty === 'advanced')) return 'advanced';
  if (techs.some((t) => t.difficulty === 'intermediate')) return 'intermediate';
  return 'beginner';
}

export interface PlanStyleCurriculumParams {
  fighterName: string;
  matches: TechniqueMatch[];
  targetDays: number;
  intensity: Intensity;
  userLevel: UserLevel;
}

export interface PlannedCurriculum {
  days: CurriculumDay[];
  phases: CurriculumPhaseRange[];
}

/**
 * Deterministic day-by-day scheduler. Guarantees `days.length === targetDays`
 * exactly (see largestRemainderRound) for any pool size: a phase with more
 * matched techniques than its day budget needs just gets the top
 * (by difficulty, then relevance) subset; a phase with FEWER techniques than
 * its day budget fills the remaining days with review/practice of what it
 * already has, instead of ever inventing new technique ids or silently
 * shrinking the phase's day range.
 */
export function planStyleCurriculum(params: PlanStyleCurriculumParams): PlannedCurriculum {
  const { matches, targetDays, intensity, fighterName } = params;
  const perDayRange = INTENSITY_PER_DAY[intensity];
  const reviewCadence = INTENSITY_REVIEW_CADENCE[intensity];

  // Bucket + dedupe (keep the highest-scoring match if the same technique
  // surfaced from multiple style-analysis fields).
  const best = new Map<string, TechniqueMatch>();
  for (const m of matches) {
    const existing = best.get(m.techniqueId);
    if (!existing || m.relevanceScore > existing.relevanceScore) best.set(m.techniqueId, m);
  }
  const byPhase: Record<StylePhaseKey, TechniqueMatch[]> = {
    fundamentals: [],
    entries: [],
    position: [],
    connection: [],
    situational: [],
  };
  for (const m of best.values()) byPhase[m.phase].push(m);

  const includeSituational = targetDays >= 40;
  if (includeSituational) {
    // 'situational' is never assigned by the classifier directly — carve its
    // pool out of the lower-relevance tail of position/connection so longer
    // curricula get a dedicated "응용" stage without duplicating techniques
    // across two stages.
    for (const src of ['position', 'connection'] as StylePhaseKey[]) {
      byPhase[src].sort((a, b) => b.relevanceScore - a.relevanceScore);
      const cut = Math.floor(byPhase[src].length * 0.25);
      if (cut > 0) byPhase.situational.push(...byPhase[src].splice(byPhase[src].length - cut, cut));
    }
  }

  const activePhases = PHASE_ORDER.filter((p) => p !== 'situational' || includeSituational);
  for (const p of activePhases) {
    byPhase[p].sort((a, b) => {
      const da = diffRank(getTechnique(a.techniqueId)?.difficulty);
      const db = diffRank(getTechnique(b.techniqueId)?.difficulty);
      return da !== db ? da - db : b.relevanceScore - a.relevanceScore;
    });
  }

  const finalReviewDays = Math.max(2, Math.min(6, Math.round(targetDays * 0.08)));
  const contentDaysTarget = Math.max(0, targetDays - finalReviewDays);
  const weights: Partial<Record<StylePhaseKey, number>> = {};
  for (const p of activePhases) weights[p] = PHASE_BASE_WEIGHT[p];
  const phaseDayShares = largestRemainderRound(weights, contentDaysTarget);

  // Clamp each phase to what its own matched-technique pool can actually
  // sustain, then hand the surplus to phases that still have real content
  // to teach — a phase never gets more days than it has techniques for,
  // and no day is generated before every phase's genuine capacity is used.
  const phaseCapacity: Partial<Record<StylePhaseKey, number>> = {};
  for (const p of activePhases) phaseCapacity[p] = estimatePhaseCapacityDays(byPhase[p].length, perDayRange, reviewCadence);

  let overflowDays = 0;
  for (const p of activePhases) {
    const cap = phaseCapacity[p] ?? 0;
    const share = phaseDayShares[p] ?? 0;
    if (share > cap) {
      overflowDays += share - cap;
      phaseDayShares[p] = cap;
    }
  }
  while (overflowDays > 0) {
    const withRoom = activePhases
      .map((p) => ({ p, room: (phaseCapacity[p] ?? 0) - (phaseDayShares[p] ?? 0) }))
      .filter((x) => x.room > 0);
    if (withRoom.length === 0) break;
    const roomWeights: Record<string, number> = {};
    for (const x of withRoom) roomWeights[x.p] = x.room;
    const extra = largestRemainderRound(roomWeights, Math.min(overflowDays, withRoom.reduce((s, x) => s + x.room, 0)));
    for (const x of withRoom) {
      const add = Math.min(extra[x.p] ?? 0, x.room);
      if (add <= 0) continue;
      phaseDayShares[x.p] = (phaseDayShares[x.p] ?? 0) + add;
      overflowDays -= add;
    }
  }
  // Nothing left with spare capacity (every matched technique across every
  // phase is already scheduled) — the only honest place for the remaining
  // days is more review of what was actually taught, never a fabricated or
  // blank day. finalReviewDays' own content (below) always has real
  // techniqueIds to draw from whenever this branch can be reached, because
  // the "선수 스타일 학습" wizard already refuses to build a curriculum from
  // zero matched techniques in the first place.
  const totalFinalReviewDays = finalReviewDays + overflowDays;

  const days: CurriculumDay[] = [];
  const phaseRanges: CurriculumPhaseRange[] = [];
  const allIntroducedIds: string[] = [];
  const firstIntroducedPerPhase: string[] = [];

  for (const phaseKey of activePhases) {
    const shareDays = phaseDayShares[phaseKey] ?? 0;
    if (shareDays <= 0) continue;

    const pool = byPhase[phaseKey];
    const startDay = days.length + 1;
    const introducedInPhase: string[] = [];
    let poolIdx = 0;
    let sinceReview = 0;
    let big = true;
    let isFirstTeachingDay = true;

    for (let i = 0; i < shareDays; i++) {
      const dayNum = days.length + 1;
      const poolExhausted = poolIdx >= pool.length;
      const dueForReview = introducedInPhase.length > 0 && sinceReview >= reviewCadence;

      if (introducedInPhase.length > 0 && (dueForReview || poolExhausted)) {
        const sample = introducedInPhase.slice(-6);
        days.push({
          day: dayNum,
          title: `${PHASE_LABEL[phaseKey]} 복습`,
          description: `지금까지 배운 '${PHASE_LABEL[phaseKey]}' 관련 기술을 ${fighterName} 스타일 관점에서 다시 점검합니다.`,
          learningGoals: [`${PHASE_LABEL[phaseKey]} 구간에서 배운 기술들을 스스로 설명할 수 있다.`],
          techniqueIds: [],
          reviewTechniqueIds: sample,
          difficulty: null,
          estimatedMinutes: 25,
        });
        sinceReview = 0;
        continue;
      }

      const n = big ? perDayRange[1] : perDayRange[0];
      big = !big;
      const matchChunk = pool.slice(poolIdx, poolIdx + n);
      poolIdx += Math.max(1, matchChunk.length);
      const techChunk = matchChunk.map((m) => getTechnique(m.techniqueId)).filter((t): t is Technique => !!t);

      if (techChunk.length === 0) {
        // Pool is empty on the very first slot of this phase (no matched
        // techniques at all) — still emit a labeled placeholder day rather
        // than silently vanishing, so the phase range stays meaningful.
        days.push({
          day: dayNum,
          title: `${PHASE_LABEL[phaseKey]} (관련 기술 없음)`,
          description: `현재 Martialdex 기술 데이터에서 '${PHASE_LABEL[phaseKey]}' 단계에 직접 대응되는 기술을 찾지 못했습니다.`,
          learningGoals: [],
          techniqueIds: [],
          reviewTechniqueIds: [],
          difficulty: null,
          estimatedMinutes: 20,
        });
        continue;
      }

      const usedGoals = new Set<string>();
      days.push({
        day: dayNum,
        title:
          (isFirstTeachingDay ? `${PHASE_LABEL[phaseKey]}: ` : '') + techChunk.map(shortLabel).join(' · '),
        description: `${fighterName} 스타일의 '${PHASE_LABEL[phaseKey]}' 요소를 익힙니다. 오늘은 ${techChunk
          .map((t) => t.name)
          .join(', ')}을(를) 배웁니다.`,
        learningGoals: techChunk.map((t) => learningGoalFor(t, usedGoals)),
        techniqueIds: techChunk.map((t) => t.id),
        reviewTechniqueIds: [],
        difficulty: dominantDifficulty(techChunk),
        estimatedMinutes: Math.max(25, Math.min(75, 20 + 15 * techChunk.length)),
      });
      if (isFirstTeachingDay) firstIntroducedPerPhase.push(techChunk[0].id);
      isFirstTeachingDay = false;
      introducedInPhase.push(...techChunk.map((t) => t.id));
      allIntroducedIds.push(...techChunk.map((t) => t.id));
      sinceReview++;
    }

    phaseRanges.push({
      name: PHASE_LABEL[phaseKey],
      blurb: `${fighterName} 스타일 학습 — ${PHASE_LABEL[phaseKey]} 단계입니다.`,
      startDay,
      endDay: days.length,
    });
  }

  const uniqueIntroduced = [...new Set(allIntroducedIds)];
  for (let i = 0; i < totalFinalReviewDays; i++) {
    const sample = firstIntroducedPerPhase.length > 0 ? firstIntroducedPerPhase : uniqueIntroduced.slice(0, 8);
    days.push({
      day: days.length + 1,
      title: `종합 복습 ${i + 1}/${totalFinalReviewDays}`,
      description: `${fighterName} 스타일 학습 전체를 복습하며 기술 사이의 연결을 정리합니다.`,
      learningGoals: ['전체 학습 내용에서 배운 핵심 기술들이 어떻게 연결되는지 설명할 수 있다.'],
      techniqueIds: [],
      reviewTechniqueIds: [...new Set(sample)].slice(0, 8),
      difficulty: 'intermediate',
      estimatedMinutes: 30,
    });
  }

  return { days, phases: phaseRanges };
}
