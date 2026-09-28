// 15단계 — 실제 스파링 영상 기반 AI 분석. Every field below is populated only
// from something the app actually computed (tracked pose geometry, motion
// heuristics, or whitelist-validated AI text) — never a placeholder/random
// value. See computePostureSegments.ts / motionEventDetector.ts for the
// "real vs estimated" boundary on each field.

export type SparringAnalysisScope = 'overall' | 'posture' | 'technique' | 'movement' | 'attackDefense' | 'distance' | 'style';

export const ANALYSIS_SCOPE_LABEL: Record<SparringAnalysisScope, string> = {
  overall: '스파링 전체 분석',
  posture: '자세 분석',
  technique: '기술 사용 분석',
  movement: '움직임 분석',
  attackDefense: '공격/방어 분석',
  distance: '거리 조절 분석',
  style: '나의 스타일 분석',
};

export interface PersonCandidate {
  index: number;
  label: string; // "사람 A" / "사람 B" — display only, not an identity claim
  centroid: { x: number; y: number }; // normalized 0-1, at the reference frame
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
}

export type MotionEventCategory =
  | 'strike_like'
  | 'kick_like'
  | 'level_change_like'
  | 'clinch_like'
  | 'footwork_movement'
  | 'distance_exit_like'
  | 'guard_hold_like';

export const MOTION_EVENT_LABEL: Record<MotionEventCategory, string> = {
  strike_like: '타격성 동작 감지',
  kick_like: '킥성 동작 감지',
  level_change_like: '레벨 체인지/테이크다운 시도 동작 감지',
  clinch_like: '클린치성 근접 동작 감지',
  footwork_movement: '이동/풋워크 감지',
  distance_exit_like: '거리 이탈(후퇴) 동작 감지',
  guard_hold_like: '가드 유지 동작 감지',
};

export interface MotionEvent {
  timestampSec: number;
  category: MotionEventCategory;
  label: string;
  /** Always a heuristic strength, never "확정" — see motionEventDetector.ts. */
  confidence: 'low' | 'medium';
}

export interface TechniqueGuess {
  techniqueId: string;
  techniqueName: string;
  martialArt: string;
  occurrences: number[]; // timestampSec[]
  /** Always true — a name AI (not a certainty detector) suggested from a real-id whitelist. */
  estimated: true;
}

export type PostureStatus = 'good' | 'average' | 'needs_improvement';

export interface PostureMetricResult {
  id: 'guard' | 'stance' | 'balance' | 'footPosition';
  label: string;
  score: number;
  status: PostureStatus;
}

export type PostureSegmentKey = 'early' | 'mid' | 'late';

export interface PostureSegment {
  segment: PostureSegmentKey;
  label: string;
  metrics: PostureMetricResult[];
  note: string | null;
}

export interface OverallScores {
  technique: number | null;
  movement: number | null;
  distance: number | null;
  defense: number | null;
  offense: number | null;
  posture: number | null;
}

export interface StyleComparisonResult {
  targetFighterName: string;
  matchedFeatures: string[];
  improvementAreas: string[];
}

export type AnalysisLimitationCode = 'low_resolution' | 'person_lost' | 'people_overlap' | 'short_clip' | 'single_person_detected';

export interface AnalysisLimitation {
  code: AnalysisLimitationCode;
  message: string;
}

export interface SavedMoment {
  timestampSec: number;
  label: string;
}

export interface WeakArea {
  label: string;
  score: number | null;
}

// ---------------- 스파링 코칭 고도화 (신규) ----------------
// Every field below is either (a) computed deterministically from real
// timestamps/geometry already produced by techniqueHypothesis.ts/
// motionEventDetector.ts/personTracker.ts — sequenceAnalysis.ts, zero AI
// involvement, zero fabrication risk — or (b) explicitly AI-sourced and
// always optional, defaulting to absent/"확인 불가" rather than guessing
// (visualEventAnalysis.ts, coachingSynthesis.ts). Nothing here replaces the
// existing motionEvents/techniqueGuesses/overallScores fields above.

export type DistanceBucket = 'close' | 'mid' | 'far';

export interface TechniqueOccurrence {
  techniqueId: string;
  techniqueName: string;
  timestampSec: number;
}

/** One real observed A→B transition (or A→no-follow-up) between two technique occurrences, with an actual repeat count — never invented. */
export interface SequencePattern {
  fromTechniqueId: string;
  fromTechniqueName: string;
  toTechniqueId: string | null;
  toTechniqueName: string | null;
  count: number;
}

export interface TechniqueSequenceStats {
  techniqueId: string;
  techniqueName: string;
  occurrenceCount: number;
  soloCount: number;
  comboCount: number;
  followUpCount: number;
  noFollowUpCount: number;
  distanceBuckets: Partial<Record<DistanceBucket, number>>;
  movedAfterCount: number;
  stayedStillCount: number;
}

export interface SequenceAnalysisResult {
  timeline: TechniqueOccurrence[];
  patterns: SequencePattern[];
  repeatedPatterns: SequencePattern[];
  perTechnique: TechniqueSequenceStats[];
  soloCount: number;
  combinationCount: number;
  /** Fraction (0-1) of the user's occurrences preceded shortly by a real detected opponent motion event. Null when no opponent tracking data was available at all (e.g. a single-person clip) — never a guessed 0. */
  reactiveRatio: number | null;
  initiatingRatio: number | null;
}

export type HitAssessment = 'landed' | 'missed' | 'unclear';

/** One frame Gemini actually looked at — never claims more than the image shows; `hitAssessment`/`opponentReaction` default to 'unclear'/null per the prompt's own instruction when not visually clear. */
export interface VisualEventInsight {
  timestampSec: number;
  techniqueId: string | null;
  hitAssessment: HitAssessment;
  opponentReaction: string | null;
  confidence: 'low' | 'medium' | 'high';
  evidence: string;
}

export interface CoachingInsight {
  label: string;
  evidence: string;
}

/** Must reference a pattern that actually exists in SequenceAnalysisResult.patterns — validated in coachingSynthesis.ts, never freeform. */
export interface PatternDiagnosis {
  patternDescription: string;
  occurrenceCount: number;
  diagnosis: string;
}

/** '분석 데이터 부족' is a real, code-enforced sentinel (see coachingSynthesis.ts's backstop) — not just a label AI happens to pick. */
export type CoachingCategoryScore = number | '분석 데이터 부족';

export interface CoachingCategoryScores {
  attack: CoachingCategoryScore;
  defense: CoachingCategoryScore;
  footwork: CoachingCategoryScore;
  distance: CoachingCategoryScore;
  timing: CoachingCategoryScore;
  connection: CoachingCategoryScore;
  tacticalVariety: CoachingCategoryScore;
}

export interface CoachingSynthesisResult {
  strengths: CoachingInsight[];
  weaknesses: CoachingInsight[];
  patternDiagnoses: PatternDiagnosis[];
  categoryScores: CoachingCategoryScores;
  improvementDirections: string[];
  generatedAt: string;
}

export interface SparringSession {
  id: string;
  date: string;
  martialArt: string;
  videoName: string;
  videoDurationSec: number;
  videoResolution: { width: number; height: number } | null;
  analysisScopes: SparringAnalysisScope[];
  overallScores: OverallScores;
  motionEvents: MotionEvent[];
  techniqueGuesses: TechniqueGuess[];
  postureSegments: PostureSegment[];
  styleObservations: string[];
  styleComparison: StyleComparisonResult | null;
  limitations: AnalysisLimitation[];
  savedMoments: SavedMoment[];
  weakAreas: WeakArea[];
  notes: string | null;
  /**
   * Motion categories that were detected but excluded from this sport's
   * results because they aren't part of that sport's technique vocabulary
   * (e.g. a hip-drop during boxing is not shown as "테이크다운 시도") — see
   * sportAnalysisProfiles.ts. Never silently dropped: SparringResultView
   * surfaces this as an honest "정확도가 낮아 제외" notice (spec section 10).
   */
  excludedMotionCounts: Partial<Record<MotionEventCategory, number>>;

  /** Deterministic (no AI) — see sequenceAnalysis.ts. Absent only for sessions saved before this field existed. */
  sequenceAnalysis?: SequenceAnalysisResult;
  /** Opponent's own motion events (personTracker.ts's trackOpponent + the same detectMotionEvents heuristics) — absent when opponent tracking found nothing. */
  opponentMotionEvents?: MotionEvent[];
  /** AI, optional — visualEventAnalysis.ts. Absent/empty when the call wasn't made or failed; never blocks the rest of the session. */
  visualInsights?: VisualEventInsight[];
  /** AI, optional — coachingSynthesis.ts. Explicit null (not just absent) means the call was attempted and failed/parsed-invalid, so the UI can distinguish "not tried" from "tried, no result" if it ever matters. */
  coachingSynthesis?: CoachingSynthesisResult | null;
}

export const MIN_SAMPLE_INTERVAL_SEC = 1;
export const MAX_FRAME_SAMPLES = 60;
