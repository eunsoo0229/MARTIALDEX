// 자유훈련 스파링 기록 — deliberately separate from src/lib/sparringAnalysis/
// (SparringSession there is video-analysis-only: pose/motion/posture/
// coaching fields all derived from actually processing a video, which would
// have to be fabricated/left null for a manual rules+timer session). This
// domain is a simple, honest "I sparred, here are the rules and the real
// elapsed time" log, following the same local-first + Supabase-sync shape
// as src/lib/combo/.

export type SparringIntensity = 'light' | 'moderate' | 'hard';
export const INTENSITY_LABEL: Record<SparringIntensity, string> = { light: '가볍게', moderate: '보통', hard: '강하게' };

// Only the categories the app doesn't already have a real technique-vocabulary
// id for; anything else uses martialArtSummaries' own ids so techniques picked
// via TechniquePicker resolve correctly.
export type SparringType = 'striking' | 'grappling' | 'mma';
export const SPARRING_TYPE_LABEL: Record<SparringType, string> = { striking: '타격', grappling: '그래플링', mma: 'MMA' };

export const EQUIPMENT_OPTIONS = ['복싱 글러브', 'MMA 글러브', '헤드기어', '마우스피스', '정강이 보호대', '기타'] as const;
export type SparringEquipment = (typeof EQUIPMENT_OPTIONS)[number];

/** The rules a user configures before a session — persisted as-is so "지난 룰 불러오기" can copy every field verbatim into a fresh draft. */
export interface SparringRules {
  martialArt: string;
  sparringType: SparringType;
  plannedRounds: number;
  roundDurationSeconds: number;
  restDurationSeconds: number;
  intensity: SparringIntensity;
  equipment: SparringEquipment[];
  /** Real Martialdex technique ids only — never fabricated (TechniquePicker-selected). */
  allowedTechniqueIds: string[];
  prohibitedTechniqueIds: string[];
  partnerName: string | null;
  notes: string | null;
}

/** One completed (or manually-ended) sparring session — the record actually saved to sparring_sessions. */
export interface SparringSessionRecord extends SparringRules {
  id: string;
  date: string; // YYYY-MM-DD
  startedAt: string; // ISO
  endedAt: string; // ISO
  /** planned = plannedRounds × roundDurationSeconds, for display/comparison only — never used to compute the actual figure below. */
  plannedDurationSeconds: number;
  /** Real elapsed time (round phases only, pauses excluded) — see sessionStore.ts's accumulation logic. User-editable on the end screen within a sane bound. */
  actualDurationSeconds: number;
  actualRounds: number;
  createdAt: string;
  updatedAt: string;
}

export type SparringPhase = 'round' | 'rest' | 'finished';

/** The live/running timer state — same Date.now()-absolute-deadline mechanic as shadowBoxing/types.ts's ShadowSessionState, so pause/resume can never drift. */
export interface SparringRunState {
  rules: SparringRules;
  currentRound: number;
  phase: SparringPhase;
  phaseEndTimestamp: number;
  pausedRemainingMs: number | null;
  paused: boolean;
  /** Sum of real round-phase time elapsed so far, EXCLUDING the current in-progress phase (added to on every phase transition) — this plus the current phase's already-elapsed time is the running "실제 시간" (never rounds × roundDuration). */
  accumulatedRoundMs: number;
  completedRounds: number;
  startedAt: string;
  finishedAt: string | null;
}
