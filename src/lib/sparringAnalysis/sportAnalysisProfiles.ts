import { STYLE_CURRICULUM_MARTIAL_ART } from '../fighterStyle/styleCurriculumService';
import type { MotionEvent, MotionEventCategory, OverallScores } from './types';

// Central per-sport analysis config (spec section 11): every place in the
// sparring pipeline that needs to behave differently per sport reads its
// settings from ONE profile object here, instead of duplicating sport
// branching logic across motionEventDetector/scoringEngine/
// styleObservationEngine/techniqueHypothesis/SparringResultView. Adding a
// new sport (or changing an existing one) means editing exactly one entry
// below.
//
// IMPORTANT HONESTY BOUNDARY: nothing here invents a capability the pose
// heuristics don't have. There is still no way to judge whether a strike/
// takedown/throw actually SUCCEEDED (see scoringEngine.ts's `technique: null`),
// so no profile below defines a "success rate" metric — only which of the
// 7 already-detectable motion categories are plausible for a sport, and how
// the SAME real signals are weighted/labeled per sport.

export type SportDomain = 'striking' | 'grappling' | 'hybrid';

/**
 * How relevant a detected motion category is to a given sport:
 * - 'primary': core to this sport's analysis — counted in offense scoring and shown first.
 * - 'secondary': plausible and shown, but not part of the sport's headline offense metric.
 * - 'unlikely': not part of this sport's technique vocabulary — excluded from the
 *   sport's results entirely rather than mislabeled (spec section 10), with an
 *   honest "정확도가 낮아 제외" notice shown instead (see excludedMotionCounts).
 */
export type CategoryRelevance = 'primary' | 'secondary' | 'unlikely';

export type ScoreKey = keyof OverallScores;

export interface SportAnalysisProfile {
  id: string;
  nameKo: string;
  domain: SportDomain;
  /** Search keywords used to build the real-technique candidate pool for the optional AI technique-name step. */
  allowedTechniques: string[];
  /**
   * Technique-name keywords that must never be treated as a real candidate for this sport, even
   * defensively — belt-and-suspenders on top of the technique database's own martialArt filter.
   */
  excludedTechniqueKeywords: string[];
  /** Relevance of each of the 7 detectable motion categories to this sport. */
  categories: Record<MotionEventCategory, CategoryRelevance>;
  /** Per-category weight used to compute the sport's "offense" score from real per-minute event rates. */
  offenseWeights: Partial<Record<MotionEventCategory, number>>;
  /** Sport-specific Korean labels for the 5 score fields shown on the result screen. */
  scoreLabels: Record<Exclude<ScoreKey, 'technique'>, string>;
  /** Display order for the score cards on the result screen (only fields with a non-null score are shown). */
  resultCategoryOrder: Exclude<ScoreKey, 'technique'>[];
}

const STRIKING_EXCLUDED_KEYWORDS = ['Takedown', 'Single Leg', 'Double Leg', 'Guard Pass', 'Sweep', 'Mount', 'Side Control', 'Submission', 'Armbar', 'Choke', 'Throw'];
const GRAPPLING_EXCLUDED_KEYWORDS = ['Jab', 'Cross', 'Hook', 'Uppercut', 'Roundhouse', 'Teep', 'Front Kick', 'Elbow Strike'];

function strikingCategories(opts: { kicks: boolean; clinch: CategoryRelevance }): Record<MotionEventCategory, CategoryRelevance> {
  return {
    strike_like: 'primary',
    kick_like: opts.kicks ? 'primary' : 'unlikely',
    level_change_like: 'unlikely',
    clinch_like: opts.clinch,
    footwork_movement: 'primary',
    distance_exit_like: 'secondary',
    guard_hold_like: 'secondary',
  };
}

function grapplingCategories(opts: { strikes: CategoryRelevance }): Record<MotionEventCategory, CategoryRelevance> {
  return {
    strike_like: opts.strikes,
    kick_like: 'unlikely',
    level_change_like: 'primary',
    clinch_like: 'primary',
    footwork_movement: 'secondary',
    distance_exit_like: 'secondary',
    guard_hold_like: 'secondary',
  };
}

export const SPORT_ANALYSIS_PROFILES: Record<string, SportAnalysisProfile> = {
  boxing: {
    id: 'boxing',
    nameKo: '복싱',
    domain: 'striking',
    allowedTechniques: ['Jab', 'Cross', 'Hook', 'Uppercut', 'Guard', 'Footwork', 'Head Movement', 'Distance', 'Combination', 'Defense'],
    excludedTechniqueKeywords: STRIKING_EXCLUDED_KEYWORDS,
    categories: strikingCategories({ kicks: false, clinch: 'unlikely' }),
    offenseWeights: { strike_like: 8, footwork_movement: 1.5 },
    scoreLabels: { movement: '풋워크', distance: '거리 조절', defense: '가드/방어', offense: '타격 연결', posture: '자세' },
    resultCategoryOrder: ['offense', 'defense', 'movement', 'distance', 'posture'],
  },
  kickboxing: {
    id: 'kickboxing',
    nameKo: '킥복싱',
    domain: 'striking',
    allowedTechniques: ['Punch', 'Kick', 'Knee', 'Defense', 'Footwork', 'Distance', 'Combination'],
    excludedTechniqueKeywords: STRIKING_EXCLUDED_KEYWORDS,
    categories: strikingCategories({ kicks: true, clinch: 'unlikely' }),
    offenseWeights: { strike_like: 5, kick_like: 6, footwork_movement: 1.5 },
    scoreLabels: { movement: '풋워크', distance: '거리 조절', defense: '방어', offense: '펀치·킥 연결', posture: '자세' },
    resultCategoryOrder: ['offense', 'defense', 'movement', 'distance', 'posture'],
  },
  'muay-thai': {
    id: 'muay-thai',
    nameKo: '무에타이',
    domain: 'striking',
    allowedTechniques: ['Punch', 'Kick', 'Elbow', 'Knee', 'Clinch', 'Teep', 'Defense', 'Balance'],
    excludedTechniqueKeywords: STRIKING_EXCLUDED_KEYWORDS,
    categories: strikingCategories({ kicks: true, clinch: 'primary' }),
    offenseWeights: { strike_like: 4, kick_like: 5, clinch_like: 4, footwork_movement: 1 },
    scoreLabels: { movement: '풋워크', distance: '거리 조절', defense: '방어', offense: '타격·클린치 연결', posture: '자세' },
    resultCategoryOrder: ['offense', 'defense', 'movement', 'distance', 'posture'],
  },
  taekwondo: {
    id: 'taekwondo',
    nameKo: '태권도',
    domain: 'striking',
    allowedTechniques: ['Front Kick', 'Roundhouse', 'Side Kick', 'Back Kick', 'Footwork', 'Distance', 'Timing'],
    excludedTechniqueKeywords: STRIKING_EXCLUDED_KEYWORDS,
    categories: { ...strikingCategories({ kicks: true, clinch: 'unlikely' }), strike_like: 'secondary', distance_exit_like: 'primary' },
    offenseWeights: { kick_like: 8, strike_like: 2, footwork_movement: 1.5 },
    scoreLabels: { movement: '풋워크', distance: '거리 조절', defense: '방어', offense: '발차기 빈도', posture: '자세' },
    resultCategoryOrder: ['offense', 'distance', 'movement', 'defense', 'posture'],
  },
  karate: {
    id: 'karate',
    nameKo: '가라테',
    domain: 'striking',
    allowedTechniques: ['Stance', 'Straight Punch', 'Reverse Punch', 'Kick', 'Distance', 'Timing', 'Footwork'],
    excludedTechniqueKeywords: STRIKING_EXCLUDED_KEYWORDS,
    categories: { ...strikingCategories({ kicks: true, clinch: 'unlikely' }), distance_exit_like: 'primary' },
    offenseWeights: { strike_like: 5, kick_like: 5, footwork_movement: 1.5 },
    scoreLabels: { movement: '풋워크', distance: '거리 조절', defense: '방어', offense: '타격 연결', posture: '자세' },
    resultCategoryOrder: ['offense', 'distance', 'movement', 'defense', 'posture'],
  },
  wrestling: {
    id: 'wrestling',
    nameKo: '레슬링',
    domain: 'grappling',
    allowedTechniques: ['Stance', 'Level Change', 'Shot', 'Single Leg', 'Double Leg', 'Sprawl', 'Takedown', 'Control', 'Scramble'],
    excludedTechniqueKeywords: GRAPPLING_EXCLUDED_KEYWORDS,
    categories: grapplingCategories({ strikes: 'unlikely' }),
    offenseWeights: { level_change_like: 8, clinch_like: 4 },
    scoreLabels: { movement: '풋워크', distance: '거리 조절', defense: '테이크다운 방어', offense: '테이크다운 시도', posture: '자세' },
    resultCategoryOrder: ['offense', 'defense', 'movement', 'distance', 'posture'],
  },
  judo: {
    id: 'judo',
    nameKo: '유도',
    domain: 'grappling',
    allowedTechniques: ['Grip', 'Kuzushi', 'Entry', 'Throw', 'Transition', 'Ground Control'],
    excludedTechniqueKeywords: GRAPPLING_EXCLUDED_KEYWORDS,
    categories: grapplingCategories({ strikes: 'unlikely' }),
    offenseWeights: { clinch_like: 6, level_change_like: 6 },
    scoreLabels: { movement: '이동', distance: '거리 조절', defense: '균형 유지', offense: '그립·던지기 시도', posture: '자세' },
    resultCategoryOrder: ['offense', 'defense', 'movement', 'distance', 'posture'],
  },
  sambo: {
    id: 'sambo',
    nameKo: '삼보',
    domain: 'grappling',
    allowedTechniques: ['Grip', 'Takedown', 'Throw', 'Leg Attack', 'Ground Control', 'Submission'],
    excludedTechniqueKeywords: GRAPPLING_EXCLUDED_KEYWORDS,
    categories: grapplingCategories({ strikes: 'unlikely' }),
    offenseWeights: { level_change_like: 7, clinch_like: 5 },
    scoreLabels: { movement: '이동', distance: '거리 조절', defense: '테이크다운 방어', offense: '테이크다운·던지기 시도', posture: '자세' },
    resultCategoryOrder: ['offense', 'defense', 'movement', 'distance', 'posture'],
  },
  bjj: {
    id: 'bjj',
    nameKo: '브라질리언 주짓수(BJJ)',
    domain: 'grappling',
    allowedTechniques: ['Guard', 'Guard Pass', 'Sweep', 'Mount', 'Side Control', 'Back Control', 'Submission', 'Escape'],
    excludedTechniqueKeywords: GRAPPLING_EXCLUDED_KEYWORDS,
    categories: { ...grapplingCategories({ strikes: 'unlikely' }), guard_hold_like: 'primary', footwork_movement: 'unlikely' },
    offenseWeights: { clinch_like: 5, level_change_like: 3 },
    scoreLabels: { movement: '포지션 전환', distance: '탈출 시도', defense: '포지션·컨트롤 유지', offense: '포지션 전환 시도', posture: '자세' },
    resultCategoryOrder: ['offense', 'defense', 'movement', 'distance', 'posture'],
  },
  [STYLE_CURRICULUM_MARTIAL_ART]: {
    id: STYLE_CURRICULUM_MARTIAL_ART,
    nameKo: 'MMA',
    domain: 'hybrid',
    allowedTechniques: ['Striking', 'Wrestling', 'Clinch', 'Takedown', 'Ground', 'Ground and Pound', 'Submission', 'Cage/Wall Position', 'Transition'],
    // MMA legitimately spans both domains (spec section 9) — nothing is excluded here.
    excludedTechniqueKeywords: [],
    categories: {
      strike_like: 'primary',
      kick_like: 'primary',
      level_change_like: 'primary',
      clinch_like: 'primary',
      footwork_movement: 'primary',
      distance_exit_like: 'secondary',
      guard_hold_like: 'secondary',
    },
    offenseWeights: { strike_like: 3, kick_like: 4, level_change_like: 4, clinch_like: 3, footwork_movement: 1 },
    scoreLabels: { movement: '풋워크', distance: '거리 조절', defense: '방어·테이크다운 방어', offense: '타격·테이크다운 시도', posture: '자세' },
    resultCategoryOrder: ['offense', 'defense', 'movement', 'distance', 'posture'],
  },
};

// Should never actually be hit — SPARRING_SPORTS (the UI picker) always uses
// ids that have an entry above — but kept as a safe, non-fabricating fallback
// (treats every category as plausible, using the old sport-agnostic weights)
// rather than letting a lookup miss crash the analysis pipeline.
const FALLBACK_PROFILE: SportAnalysisProfile = {
  id: 'unknown',
  nameKo: '기타',
  domain: 'hybrid',
  allowedTechniques: [],
  excludedTechniqueKeywords: [],
  categories: {
    strike_like: 'primary',
    kick_like: 'primary',
    level_change_like: 'primary',
    clinch_like: 'primary',
    footwork_movement: 'primary',
    distance_exit_like: 'secondary',
    guard_hold_like: 'secondary',
  },
  offenseWeights: { strike_like: 8, level_change_like: 8, clinch_like: 8 },
  scoreLabels: { movement: '움직임', distance: '거리 조절', defense: '방어', offense: '공격 연결', posture: '자세' },
  resultCategoryOrder: ['offense', 'defense', 'movement', 'distance', 'posture'],
};

export function getSportAnalysisProfile(sportId: string): SportAnalysisProfile {
  return SPORT_ANALYSIS_PROFILES[sportId] ?? FALLBACK_PROFILE;
}

export function getCriteriaLabels(sportId: string): string[] {
  return SPORT_ANALYSIS_PROFILES[sportId]?.allowedTechniques ?? [];
}

export interface SportScopedEvents {
  events: MotionEvent[];
  excludedCounts: Partial<Record<MotionEventCategory, number>>;
}

/**
 * Filters raw, sport-blind motion events down to what's honestly relevant for the
 * selected sport (spec sections 2-10): 'unlikely' categories are removed rather than
 * shown under a misleading label (e.g. a boxer's hip-drop is never surfaced as a
 * "테이크다운 시도" just because the underlying geometry heuristic is shared). The
 * excluded counts are returned so the UI can show an honest notice instead of
 * silently dropping data (spec section 10 anti-hallucination requirement).
 */
export function applySportProfile(events: MotionEvent[], profile: SportAnalysisProfile): SportScopedEvents {
  const kept: MotionEvent[] = [];
  const excludedCounts: Partial<Record<MotionEventCategory, number>> = {};
  for (const e of events) {
    if (profile.categories[e.category] === 'unlikely') {
      excludedCounts[e.category] = (excludedCounts[e.category] ?? 0) + 1;
      continue;
    }
    kept.push(e);
  }
  return { events: kept, excludedCounts };
}
