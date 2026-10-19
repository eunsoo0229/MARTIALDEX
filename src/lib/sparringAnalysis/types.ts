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
  /** For grounded (v2) results this is the CODE-built fact text the item cites (factIds), never the AI's own wording. */
  evidence: string;
  /** Ids into CoachingSynthesisResult.facts — validated in code; an item that cites no real fact is dropped. Absent on older sessions. */
  factIds?: string[];
}

/** One measured/derived observation built by CODE from the analysis data (coachingFacts.ts) — the only thing the AI is allowed to cite. */
export interface EvidenceFact {
  id: string;
  text: string;
}

/** "다음 훈련 추천" — a concrete drill tied to the facts that motivated it and (when possible) real technique ids from a whitelist. */
export interface NextTrainingItem {
  title: string;
  drill: string;
  /** Which weakness this addresses, in plain words. */
  reason: string;
  factIds: string[];
  /** Real technique ids only (whitelist-validated) — the user's learned techniques first. */
  techniqueIds: string[];
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
  // ---- v2 (grounded coaching) — all optional so sessions saved earlier stay valid ----
  /** The exact fact list the AI was given and had to cite. */
  facts?: EvidenceFact[];
  /** What this analysis can NOT measure (code-determined, never AI) — shown so nothing unmeasured reads as fact. */
  dataLimits?: string[];
  nextTraining?: NextTrainingItem[];
  /** 종합 평가 — AI prose, but only generated from the cited facts. */
  overallFeedback?: string | null;
}

// ---------------- 스파링 분석 2.0: 선수 식별 · 약점 장면 · 클립 ----------------

export type WeaknessStatus = 'observed' | 'tentative' | 'on_hold';

export const WEAKNESS_STATUS_LABEL: Record<WeaknessStatus, string> = {
  observed: '확인된 관찰',
  tentative: '근거가 있는 잠정적 분석',
  on_hold: '판단 보류',
};

export interface WeaknessOccurrence {
  /** When the problem happens in the ORIGINAL video (seconds). */
  eventSec: number;
  /** Clip window around it in the original video (clamped to the video). */
  startSec: number;
  endSec: number;
  note: string;
}

/** How the confidence number was built — shown to the user next to it. */
export interface WeaknessConfidenceBasis {
  /** Share of frames in the scenes where the tracked person looked like "me" (attire) — 0.6 when no attire was given (position tracking only). */
  identity: number;
  /** Share of opportunities where the needed body points were actually visible. */
  observability: number;
  /** occurrences / opportunities. */
  consistency: number;
  /** 1 = measured geometry; lower when it rests on AI-estimated technique names. */
  classification: number;
  /** No labelled ground-truth data exists yet — this is a provisional index. */
  calibrated: false;
  notes: string[];
}

export interface SparringWeakness {
  id: string;
  subject: 'me';
  martialArt: string;
  situationType:
    | 'post_attack_guard'
    | 'no_reaction'
    | 'static_after_attack'
    | 'late_guard_drop'
    | 'single_attacks'
    // grappling (wrestling / judo / sambo / bjj / MMA)
    | 'takedown_no_finish'
    | 'no_takedown_defense'
    | 'clinch_posture_break'
    | 'bottom_position';
  title: string;
  description: string;
  /** What the video data directly shows. */
  observedEvidence: string[];
  /** Interpretation built on that evidence — never shown as fact. */
  inference: string;
  recommendation: string;
  startSec: number;
  eventSec: number;
  endSec: number;
  occurrences: WeaknessOccurrence[];
  opportunities: number;
  /** 0–100 provisional index (see confidenceBasis). */
  confidence: number;
  confidenceBasis: WeaknessConfidenceBasis;
  status: WeaknessStatus;
  /** The user's own check after watching the clip: true = 맞아요, false = 아니에요, null = not checked. */
  verifiedOnVideo: boolean | null;
  relatedTechniqueIds: string[];
  curriculumId: string | null;
  clipIds: string[];
}

export type SparringClipStatus = 'pending' | 'ready' | 'failed';

/** A clip cut from the ORIGINAL video; the media itself lives in IndexedDB (clipStore.ts). */
export interface SparringClip {
  id: string;
  /** Requested window in the original video. */
  startSec: number;
  endSec: number;
  /** What the recorder really captured (first/last frame media time of the original). */
  actualStartSec: number | null;
  actualEndSec: number | null;
  weaknessIds: string[];
  status: SparringClipStatus;
  error: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
  createdAt: string;
}

export interface IdentificationSummary {
  method: 'manual' | 'manual+attire';
  attire: import('./attire').SparringAttire | null;
  /** Attire-based suggestion shown on the person-select screen, and whether the user picked it. */
  suggestion: { index: number; confidence: number; followed: boolean } | null;
  observedFrames: number;
  meFrames: number;
  opponentLikeFrames: number;
  unclearFrames: number;
  /** Frames dropped from analysis because the tracked person looked like the opponent (possible ID swap). */
  excludedFrames: number;
  /** meFrames / observedFrames (null when attire couldn't be compared at all). */
  consistency: number | null;
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
  // ---- 2.0 (all optional: older sessions stay valid) ----
  identification?: IdentificationSummary;
  weaknesses?: SparringWeakness[];
  clips?: SparringClip[];
  /** Why fewer/no weakness scenes were reported (e.g. unsupported sport, no opponent tracking). */
  weaknessNotes?: string[];
}

export const MIN_SAMPLE_INTERVAL_SEC = 1;
export const MAX_FRAME_SAMPLES = 60;
