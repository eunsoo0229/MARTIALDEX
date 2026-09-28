export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | null;

// Hand-curated (never scraped via the YouTube Data API, no API key
// involved) — see data/curated/videos.json and CURATION.md. Up to 2 per
// technique, only ever real, human-checked video IDs.
export interface CuratedVideo {
  title: string;
  videoId: string;
  channel: string;
}

/**
 * Body-part breakdown of the starting posture — every field is optional
 * because not every technique has something meaningful to say about every
 * body part (e.g. a hand-fighting drill may have nothing distinctive to say
 * about "발/발의 방향"). Only fields with real, non-fabricated content are
 * ever filled in — see data/curated/posture.json.
 */
export interface PostureBodyPosition {
  head?: string;
  upperBody?: string;
  arms?: string;
  hips?: string;
  legs?: string;
  feet?: string;
  weightDistribution?: string;
  distance?: string;
}

/**
 * Hand-curated, same pattern as CuratedVideo / poseAnalysis.json — never
 * auto-generated for all 1,253 techniques. A technique with no `posture`
 * entry simply doesn't have this section yet ("자세 설명 준비 중"), not an
 * error and not a fabricated placeholder. Only `overview` is required;
 * everything else is filled in only when the technique genuinely has
 * something specific to say about it.
 */
export interface PostureInfo {
  overview: string;
  startingPosition?: string;
  bodyPosition?: PostureBodyPosition;
  /** Ordered, plain-language steps (e.g. "1단계 — 시작 자세: ..."). Not every technique needs the same step count. */
  steps?: string[];
  keyPoints?: string[];
  commonMistakes?: string[];
}

/** Only meaningful for home-training exercises (martialArt === HOME_TRAINING_MARTIAL_ART_ID) — a general fitness/movement classification distinct from combat `category`. */
export type HomeExerciseType =
  | 'strength'
  | 'conditioning'
  | 'mobility'
  | 'flexibility'
  | 'combat_movement'
  | 'striking_drill'
  | 'grappling_drill'
  | 'footwork'
  | 'recovery';

export type HomeExerciseEquipment = 'none' | 'mat' | 'jump_rope' | 'dumbbell' | 'band' | 'pull_up_bar' | 'other';

/**
 * Only meaningful for gym/weight-training exercises (martialArt === GYM_MARTIAL_ART_ID,
 * see src/lib/gymTraining/library.ts). Matches the 14-folder taxonomy of the source
 * dataset exactly. 'cardio'/'full_body' are deliberately excluded from body-part
 * recovery attribution (see src/lib/gymTraining/recovery.ts) — their "주요 근육" values
 * aren't real single-muscle-group data ("심폐계", "등, 하체"), so they only count
 * toward domain-agnostic volume totals, never a specific recovery bar.
 */
export type GymBodyPart =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves'
  | 'lower_back'
  | 'cardio'
  | 'full_body';

export type GymDifficulty = '초급' | '중급' | '고급';
export type GymExerciseKind = '단일' | '등척성' | '복합' | '유산소';

/**
 * How a set's input weight translates into the ACTUAL load lifted — see
 * gymTraining/weightCalc.ts's calculateSetVolume(), the single function
 * every volume/recovery/growth-rate consumer goes through.
 *   - standard: barbell/machine/cable/plate-loaded — input weight IS the load.
 *   - dumbbell: input is ONE dumbbell's weight — actual load is input × 2.
 *   - assisted_machine: input is the assist weight subtracted from the
 *     lifter's bodyweight (e.g. assisted pull-up/dip machines) — actual
 *     load is max(0, bodyweight - input), never negative.
 *   - bodyweight: no weight input at all — actual load is the lifter's
 *     bodyweight itself.
 * Undefined (every technique before this field existed, and every combat
 * technique/home-training exercise) behaves exactly like 'standard' — see
 * calculateSetVolume's default branch — so this is purely additive.
 */
export type GymWeightCalcType = 'standard' | 'dumbbell' | 'assisted_machine' | 'bodyweight';

export interface Technique {
  id: string;
  martialArt: string;
  name: string;
  koreanName: string | null;
  aliases: string[];
  category: string;
  positions: string[];
  description: string;
  purpose: string | null;
  principles: string[];
  variations: string[];
  counters: string[];
  defenses: string[];
  transitions: string[];
  relatedTechniques: string[];
  relatedMartialArts: string[];
  difficulty: Difficulty;
  tags: string[];
  youtubeSearchQuery: string | null;
  /** Always present (defaults to []) — attached at load time from data/curated/videos.json, not part of the step-2 parser output. */
  videos: CuratedVideo[];
  /** Present only for the small curated subset with hand-authored posture data — see data/curated/posture.json. */
  posture?: PostureInfo;
  /** Set only for techniques added via "기술 추가 요청" (src/lib/userTechniques/) or the new-martial-art / missing-technique web-research flow (src/lib/martialArtDiscovery/) — absent (undefined) for all 1,253 official techniques. */
  source?: 'user_added' | 'ai_web_research';
  /** Home-training / gym reference-data fields below — always undefined for the 1,283 official combat techniques. */
  exerciseType?: HomeExerciseType;
  equipment?: HomeExerciseEquipment[];
  recommendedSets?: number;
  recommendedReps?: number | null;
  recommendedDurationSeconds?: number | null;
  recommendedRestSeconds?: number;
  /** Gym(웨이트 트레이닝)-only fields below — always undefined for combat techniques and home-training exercises alike. */
  gymBodyPart?: GymBodyPart;
  /** = 주요 근육, display-only (never used in recovery attribution math — see gymTraining/recovery.ts). */
  primaryMuscle?: string;
  /** = 보조 근육, display-only. */
  secondaryMuscles?: string[];
  /** = 장비, split on '/' from the source data (e.g. "덤벨/EZ바" -> ['덤벨','EZ바']). */
  gymEquipment?: string[];
  gymDifficulty?: GymDifficulty;
  gymExerciseKind?: GymExerciseKind;
  /** Undefined behaves like 'standard' — see GymWeightCalcType's own doc comment. */
  gymWeightCalcType?: GymWeightCalcType;
  /**
   * Real, AI-verified (Google Search grounding) step-by-step performance
   * notes — set only for exercises discovered via "새 운동 추가 요청"
   * (gymTrainingDiscovery/recordGenerator.ts). Deliberately null/undefined
   * for the static 147-exercise bundle: their source markdown's 수행 방법
   * section was verified to be templated boilerplate shared across the
   * whole dataset, not exercise-specific instruction (see
   * gymTraining/library.ts's header comment) — showing that text as if it
   * were real per-exercise form guidance would be worse than admitting
   * there's nothing here yet.
   */
  gymPostureNotes?: string | null;
}

export interface MartialArtMeta {
  id: string;
  nameEn: string | null;
  nameKo: string;
}

export interface MartialArtFile {
  martialArt: MartialArtMeta;
  count: number;
  techniques: Technique[];
}

export interface MartialArtSummary extends MartialArtMeta {
  techniqueCount: number;
  categories: string[];
  difficultyCounts: Record<string, number>;
}
