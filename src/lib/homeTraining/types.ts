import type { HomeExerciseEquipment, HomeExerciseType } from '../../types';

export type { HomeExerciseEquipment, HomeExerciseType };

/**
 * What Gemini extracts from the user's free-text home-training goal, OR —
 * when the user gave no goal — the equivalent structure derived from their
 * own training-history analysis (see weaknessAnalysis.ts). Deliberately does
 * NOT reuse aiCurriculum's GoalIntent (attack/defense/escape/counter) —
 * those combat-intent camps are meaningless for a fitness/movement goal.
 */
export interface HomeGoalAnalysis {
  /** Real martial art id this goal is related to, or null if purely general fitness. */
  relatedMartialArt: string | null;
  /** Free-text phrases describing the goal, e.g. "테이크다운에 필요한 하체 폭발력". */
  goals: string[];
  /** Exercise types (see HomeExerciseType) to emphasize, ordered most-important first. */
  emphasizedTypes: HomeExerciseType[];
  /** Real technique ids (if any) the analysis explicitly ties this goal to — e.g. weak techniques from training history. */
  relatedTechniqueIds: string[];
  /** One-line "당신의 목표" summary for the preview screen, in Korean. */
  summary: string;
  /** Set only when the free text (or lack thereof) is too vague to build a meaningful plan from. */
  clarifyingQuestion: string | null;
  /** Present only in the no-goal-stated flow — the AI's plain-language explanation of strengths/gaps, grounded in buildTrainingAiContext()'s real local data. */
  trainingRecordAnalysis: string | null;
}

export interface HomeExerciseMatch {
  exerciseId: string;
  exerciseName: string;
  /** 0-100, deterministic — never random. */
  relevanceScore: number;
  reason: string;
}

export type HomeTrainingGoalSource = 'user_goal' | 'training_record_analysis';

/** Persisted on Curriculum.homeTrainingMeta — lets regeneration skip re-analysis when possible and lets the UI show correct week/session framing (see sessionPlanner.ts's header comment for why Day-count math is never repurposed globally). */
export interface HomeTrainingMeta {
  goalSource: HomeTrainingGoalSource;
  goalText: string | null;
  analysis: HomeGoalAnalysis;
  matchedExercises: HomeExerciseMatch[];
  sessionsPerWeek: number;
  totalWeeks: number;
  minutesPerSession: number;
  equipment: HomeExerciseEquipment[];
  generatedAt: string;
}
