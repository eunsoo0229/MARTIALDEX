import type { Technique } from '../../types';
import type { CurriculumDay, CurriculumPhaseRange } from '../curriculum/types';
import type { GoalIntensity, GoalIntent, GoalPhaseKey, GoalTechniqueMatch, GoalUserLevel } from './types';
import type { MasteryStatus } from '../skillProgress/types';
// resolveTechnique (not the official-only getTechnique) so a technique
// discovered via add_teq/user_techniques for this curriculum still resolves
// here instead of being silently dropped when building each day's content.
import { resolveTechnique as getTechnique } from '../userTechniques/service';
import { classifyTechniqueIntents, techniqueCamps } from './intentClassifier';

// Deterministic day-by-day scheduler for "AI 맞춤 커리큘럼" — adapted from
// fighterStyle/curriculumPlanner.ts's already-tested algorithm (same
// largest-remainder day distribution + per-phase capacity redistribution
// that fixed the "빈 Day" bug there), re-worded for a goal-based curriculum
// instead of a "선수 스타일" one. Kept as its own copy (not imported) so
// this feature never depends on fighterStyle/'s module for its core path —
// see spec section 18/independence requirement.

const PHASE_ORDER: GoalPhaseKey[] = ['fundamentals', 'entries', 'position', 'connection', 'situational'];

const PHASE_LABEL: Record<GoalPhaseKey, string> = {
  fundamentals: '기초',
  entries: '거리 좁히기 · 진입',
  position: '포지션 · 응용',
  connection: '기술 연결',
  situational: '상황 훈련',
};

const PHASE_BASE_WEIGHT: Record<GoalPhaseKey, number> = {
  fundamentals: 0.18,
  entries: 0.24,
  position: 0.24,
  connection: 0.2,
  situational: 0.14,
};

export const INTENSITY_PER_DAY: Record<GoalIntensity, [number, number]> = {
  light: [1, 2],
  normal: [2, 3],
  intensive: [3, 4],
};
// Raised from {4,6,7}: review days were consuming too large a share of the
// schedule relative to new-technique days (user complaint: 커리큘럼이
// "복습" 위주). A larger cadence means more teaching days elapse between
// each in-phase review day, so review stays a supporting mechanism instead
// of the dominant one, per the day-shape example in the spec (새 기술이
// 대부분, 복습은 필요한 경우에만 보조적으로).
const INTENSITY_REVIEW_CADENCE: Record<GoalIntensity, number> = {
  light: 5,
  normal: 8,
  intensive: 9,
};

const DIFF_RANK: Record<string, number> = { beginner: 0, intermediate: 2, advanced: 3 };
function diffRank(d: string | null | undefined): number {
  return d ? (DIFF_RANK[d] ?? 1) : 1;
}

// Distributes `total` across phase weights as integers summing EXACTLY to
// `total` (largest-remainder method) — guarantees days.length === targetDays.
function largestRemainderRound(weights: Partial<Record<GoalPhaseKey, number>>, total: number): Record<string, number> {
  const keys = Object.keys(weights) as GoalPhaseKey[];
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

// Names the ACTUAL techniques this specific review day samples (via the same
// resolver/shortLabel used everywhere else in this file), instead of a fixed
// sentence that never varies — a review day's "핵심 사항" must reflect the
// real curriculum content it's reviewing, not a generic template that stays
// identical no matter which techniques were actually sampled.
function reviewLearningGoal(sampleIds: string[], scopeLabel: string): string {
  const names = sampleIds.map((id) => getTechnique(id)).filter((t): t is Technique => !!t).map(shortLabel).slice(0, 4);
  if (names.length === 0) return `${scopeLabel}에서 배운 기술들을 스스로 설명할 수 있다.`;
  return `${names.join(', ')} 등 ${scopeLabel}에서 배운 기술을 스스로 설명하고 다시 수행할 수 있다.`;
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

// How many days of REAL content a phase's matched pool can sustain — caps
// each phase's day allocation at what it actually has techniques for,
// pushing any surplus to phases with real content left (see the
// redistribution loop below). This is what prevents empty/placeholder days.
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

export interface PlanGoalCurriculumParams {
  /** Short human-readable label for the goal, e.g. "복싱 인파이팅 강화" — used only in generated day/phase text. */
  subjectLabel: string;
  matches: GoalTechniqueMatch[];
  targetDays: number;
  intensity: GoalIntensity;
  userLevel: GoalUserLevel;
  /** User's actual per-technique mastery, when available — used only to pick WHICH already-introduced techniques a review day samples (prefers ones the user hasn't mastered yet over already-'proficient' ones), never to change which techniques get taught. */
  masteryByTechniqueId?: Map<string, MasteryStatus>;
  /**
   * When true, each phase's pool is sorted primary_technique-role first
   * (before difficulty/relevance) so the small number of surviving
   * supporting-role matches (grips/positions — techniqueMatcher.ts's raised
   * threshold and fallbackTechniquePool's hard role-filter already keep
   * this count small) sink toward the LATER days of a phase instead of
   * being interspersed into day 1 alongside the actual requested technique
   * family. Spec section 17: a day should have one clear purpose, not
   * "Basic Double Leg · Collar Tie · Inside Tie" mixing the two.
   */
  diversityRequested?: boolean;
  /**
   * Spec section 4: when the goal spans BOTH the offense and defensive
   * camps at once (e.g. "상대가 밀고 들어올 때 카운터" + "내가 밀고 들어가는
   * 공격" — intents=['attack','counter']), "do not merge these two
   * categories" — same-camp matches are sorted to cluster together within
   * each phase (see dominantCampLabel below for the resulting day-title
   * prefix) instead of being freely interleaved.
   */
  goalIntents?: GoalIntent[];
}

const CAMP_DAY_LABEL: Record<'offense' | 'defensive', string> = { offense: '[공격]', defensive: '[카운터]' };

/** The day-title prefix for a dual-camp goal — only set when every technique in the chunk agrees on one camp; mixed/neutral chunks get no prefix rather than a misleading one. */
function dominantCampLabel(techs: Technique[]): string {
  const camps = new Set<'offense' | 'defensive' | 'neutral'>();
  for (const t of techs) for (const c of techniqueCamps(classifyTechniqueIntents(t))) camps.add(c);
  const real = [...camps].filter((c) => c !== 'neutral');
  if (real.length === 1) return `${CAMP_DAY_LABEL[real[0] as 'offense' | 'defensive']} `;
  return '';
}

// Prefers techniques the user hasn't mastered yet for a review day's sample
// — reviewing something already 'proficient' wastes a review slot that
// could instead reinforce a weaker technique. Falls back to the full
// (recency-based) list when everything introduced so far is proficient, so
// a review day is never left empty.
function pickReviewSample(introducedIds: string[], masteryByTechniqueId: Map<string, MasteryStatus> | undefined, limit: number): string[] {
  if (!masteryByTechniqueId) return introducedIds.slice(-limit);
  const needsReview = introducedIds.filter((id) => masteryByTechniqueId.get(id) !== 'proficient');
  const pool = needsReview.length > 0 ? needsReview : introducedIds;
  return pool.slice(-limit);
}

export interface PlannedGoalCurriculum {
  days: CurriculumDay[];
  phases: CurriculumPhaseRange[];
}

/**
 * Guarantees `days.length === targetDays` exactly for any non-empty match
 * pool: a phase with more matches than its day budget needs just gets the
 * top (by difficulty, then relevance) subset; a phase with FEWER matches
 * than its budget fills the remainder with review of what it already has
 * instead of ever inventing technique ids or emitting an empty day. Mirrors
 * spec section 9's progression (기초 → 반복 → 연결 → 응용 → 상황 훈련 →
 * 복습/평가): PHASE_ORDER walks fundamentals→...→situational with a review
 * day inserted periodically within each phase, then dedicated final review
 * days at the end.
 */
export function planGoalCurriculum(params: PlanGoalCurriculumParams): PlannedGoalCurriculum {
  const { matches, targetDays, intensity, subjectLabel, masteryByTechniqueId, diversityRequested, goalIntents } = params;
  const goalCampSet = new Set([...techniqueCamps(goalIntents ?? [])]);
  const dualCampGoal = goalCampSet.has('offense') && goalCampSet.has('defensive');
  const perDayRange = INTENSITY_PER_DAY[intensity];
  const reviewCadence = INTENSITY_REVIEW_CADENCE[intensity];

  const best = new Map<string, GoalTechniqueMatch>();
  for (const m of matches) {
    const existing = best.get(m.techniqueId);
    if (!existing || m.relevanceScore > existing.relevanceScore) best.set(m.techniqueId, m);
  }
  const byPhase: Record<GoalPhaseKey, GoalTechniqueMatch[]> = {
    fundamentals: [],
    entries: [],
    position: [],
    connection: [],
    situational: [],
  };
  for (const m of best.values()) byPhase[m.phase].push(m);

  const includeSituational = targetDays >= 40;
  if (includeSituational) {
    for (const src of ['position', 'connection'] as GoalPhaseKey[]) {
      byPhase[src].sort((a, b) => b.relevanceScore - a.relevanceScore);
      const cut = Math.floor(byPhase[src].length * 0.25);
      if (cut > 0) byPhase.situational.push(...byPhase[src].splice(byPhase[src].length - cut, cut));
    }
  }

  // Only computed once per technique id (classifyTechniqueIntents/
  // techniqueCamps are cheap but there's no reason to redo them per
  // comparator call across an O(n log n) sort).
  const campRankById = new Map<string, number>();
  function campRank(techniqueId: string): number {
    const cached = campRankById.get(techniqueId);
    if (cached !== undefined) return cached;
    const t = getTechnique(techniqueId);
    const camps = t ? techniqueCamps(classifyTechniqueIntents(t)) : new Set<'offense' | 'defensive' | 'neutral'>();
    // Defensive-camp (counter/escape/defense — the "opponent pressures me"
    // branch) sorts before offense-camp within a phase; neutral (connection/
    // fundamentals) sits in between so it doesn't arbitrarily split either
    // block. Order itself doesn't matter — only that each camp CLUSTERS
    // into contiguous days instead of alternating day to day.
    const rank = camps.has('defensive') && !camps.has('offense') ? 0 : camps.has('offense') && !camps.has('defensive') ? 2 : 1;
    campRankById.set(techniqueId, rank);
    return rank;
  }

  const activePhases = PHASE_ORDER.filter((p) => p !== 'situational' || includeSituational);
  for (const p of activePhases) {
    byPhase[p].sort((a, b) => {
      // Role comes first, ahead of difficulty, only under an active
      // diversity request — sinks the small remaining number of
      // supporting-role matches (grips/positions that scored well enough
      // to survive techniqueMatcher.ts's raised threshold) to the tail of
      // this phase's pool, so the days that get chunked FIRST are pure
      // primary-technique content instead of "Basic Double Leg · Collar
      // Tie · Inside Tie" in one day.
      if (diversityRequested) {
        const ra = a.structureRole === 'primary_technique' ? 0 : 1;
        const rb = b.structureRole === 'primary_technique' ? 0 : 1;
        if (ra !== rb) return ra - rb;
      }
      // Spec section 4 — only when the goal genuinely spans both camps
      // ("상대 압박 대응" + "내 압박 공격" at once); clusters same-camp
      // matches into contiguous days ahead of difficulty, so a day is
      // never "half counter-technique, half offense" by accident.
      if (dualCampGoal) {
        const ca = campRank(a.techniqueId);
        const cb = campRank(b.techniqueId);
        if (ca !== cb) return ca - cb;
      }
      const da = diffRank(getTechnique(a.techniqueId)?.difficulty);
      const db = diffRank(getTechnique(b.techniqueId)?.difficulty);
      return da !== db ? da - db : b.relevanceScore - a.relevanceScore;
    });
  }

  const finalReviewDays = Math.max(2, Math.min(6, Math.round(targetDays * 0.08)));
  const contentDaysTarget = Math.max(0, targetDays - finalReviewDays);
  const weights: Partial<Record<GoalPhaseKey, number>> = {};
  for (const p of activePhases) weights[p] = PHASE_BASE_WEIGHT[p];
  const phaseDayShares = largestRemainderRound(weights, contentDaysTarget);

  const phaseCapacity: Partial<Record<GoalPhaseKey, number>> = {};
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
    // spec section 20's "하루 기술 수가 지나치게 적어지는 문제" — tracks the
    // most recently pushed TEACHING day (and its real Technique[] content,
    // not just ids) in this phase so a stranded 1-technique chunk (pool
    // simply ran out mid-alternation) can be folded into it instead of
    // becoming its own lonely day.
    let lastTeachingDayIndex: number | null = null;
    let lastTeachingChunk: Technique[] = [];

    for (let i = 0; i < shareDays; i++) {
      const dayNum = days.length + 1;
      const poolExhausted = poolIdx >= pool.length;
      const dueForReview = introducedInPhase.length > 0 && sinceReview >= reviewCadence;

      if (introducedInPhase.length > 0 && (dueForReview || poolExhausted)) {
        const sample = pickReviewSample(introducedInPhase, masteryByTechniqueId, 6);
        days.push({
          day: dayNum,
          title: `${PHASE_LABEL[phaseKey]} 복습`,
          description: `지금까지 배운 '${PHASE_LABEL[phaseKey]}' 관련 기술을 '${subjectLabel}' 목표 관점에서 다시 점검합니다.`,
          learningGoals: [reviewLearningGoal(sample, `${PHASE_LABEL[phaseKey]} 구간`)],
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

      if (techChunk.length === 0) continue; // pool truly exhausted mid-phase — never emit a blank day, just end the phase early

      // A chunk of exactly 1 almost always means the pool simply ran out
      // mid-alternation (perDayRange asked for 2-4, only 1 was left) rather
      // than a technique that genuinely needs its own dedicated day — fold
      // it into the immediately preceding teaching day instead, and use
      // this slot for a review day so the phase's day count is unchanged.
      if (techChunk.length === 1 && lastTeachingDayIndex !== null) {
        const extra = techChunk[0];
        const mergedChunk = [...lastTeachingChunk, extra];
        const prevDay = days[lastTeachingDayIndex];
        const usedGoalsMerged = new Set<string>();
        const campLabelMerged = dualCampGoal ? dominantCampLabel(mergedChunk) : '';
        const titlePrefix = prevDay.title.startsWith(`${PHASE_LABEL[phaseKey]}: `) ? `${PHASE_LABEL[phaseKey]}: ` : '';
        prevDay.title = campLabelMerged + titlePrefix + mergedChunk.map(shortLabel).join(' · ');
        prevDay.description = `'${subjectLabel}' 목표를 위한 '${PHASE_LABEL[phaseKey]}' 단계입니다. 오늘은 ${mergedChunk.map((t) => t.name).join(', ')}을(를) 배웁니다.`;
        prevDay.learningGoals = mergedChunk.map((t) => learningGoalFor(t, usedGoalsMerged));
        prevDay.techniqueIds = mergedChunk.map((t) => t.id);
        prevDay.difficulty = dominantDifficulty(mergedChunk);
        prevDay.estimatedMinutes = Math.max(25, Math.min(75, 20 + 15 * mergedChunk.length));
        lastTeachingChunk = mergedChunk;
        introducedInPhase.push(extra.id);
        allIntroducedIds.push(extra.id);

        const sample = pickReviewSample(introducedInPhase, masteryByTechniqueId, 6);
        days.push({
          day: dayNum,
          title: `${PHASE_LABEL[phaseKey]} 복습`,
          description: `지금까지 배운 '${PHASE_LABEL[phaseKey]}' 관련 기술을 '${subjectLabel}' 목표 관점에서 다시 점검합니다.`,
          learningGoals: [reviewLearningGoal(sample, `${PHASE_LABEL[phaseKey]} 구간`)],
          techniqueIds: [],
          reviewTechniqueIds: sample,
          difficulty: null,
          estimatedMinutes: 25,
        });
        sinceReview = 0;
        continue;
      }

      const usedGoals = new Set<string>();
      const campLabel = dualCampGoal ? dominantCampLabel(techChunk) : '';
      days.push({
        day: dayNum,
        title: campLabel + (isFirstTeachingDay ? `${PHASE_LABEL[phaseKey]}: ` : '') + techChunk.map(shortLabel).join(' · '),
        description: `'${subjectLabel}' 목표를 위한 '${PHASE_LABEL[phaseKey]}' 단계입니다. 오늘은 ${techChunk
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
      lastTeachingDayIndex = days.length - 1;
      lastTeachingChunk = techChunk;
      introducedInPhase.push(...techChunk.map((t) => t.id));
      allIntroducedIds.push(...techChunk.map((t) => t.id));
      sinceReview++;
    }

    phaseRanges.push({
      name: PHASE_LABEL[phaseKey],
      blurb: `'${subjectLabel}' 커리큘럼 — ${PHASE_LABEL[phaseKey]} 단계입니다.`,
      startDay,
      endDay: days.length,
    });
  }

  const uniqueIntroduced = [...new Set(allIntroducedIds)];
  for (let i = 0; i < totalFinalReviewDays; i++) {
    const base = firstIntroducedPerPhase.length > 0 ? firstIntroducedPerPhase : uniqueIntroduced.slice(0, 8);
    const sample = pickReviewSample(base, masteryByTechniqueId, 8);
    days.push({
      day: days.length + 1,
      title: `복습 및 평가 ${i + 1}/${totalFinalReviewDays}`,
      description: `'${subjectLabel}' 커리큘럼 전체를 복습하며 기술 사이의 연결을 정리합니다.`,
      learningGoals: [reviewLearningGoal(sample, `'${subjectLabel}' 커리큘럼 전체`)],
      techniqueIds: [],
      reviewTechniqueIds: [...new Set(sample)].slice(0, 8),
      difficulty: 'intermediate',
      estimatedMinutes: 30,
    });
  }

  return { days, phases: phaseRanges };
}
