import type { PoseFrame } from '../poseAnalysis/types';

// 기준 영상 비교 자세 평가 — a technique is judged by comparing the user's
// recorded attempt with a REFERENCE demonstration video, not by hand-written
// joint angles. The criteria are built automatically from the reference
// (profile.ts); MediaPipe poses are only a local helper signal (finding the
// performed segment, aligning the phases in time, checking capture quality
// and camera direction) — never the score.

export type CameraView = 'front' | 'side' | 'diagonal' | 'back' | 'unknown';

export type ReferenceSource =
  | { kind: 'youtube'; videoId: string; url: string; title: string; channel: string; lengthSeconds: number }
  | { kind: 'file'; fileName: string; mimeType: string; sizeBytes: number; durationSeconds: number };

/** A registered reference demonstration for one technique. */
export interface ReferenceVideo {
  id: string;
  techniqueId: string;
  martialArt: string;
  source: ReferenceSource;
  /** The part of the video that shows the technique (seconds from the start of the video). */
  startSeconds: number;
  endSeconds: number;
  /** User's stated camera direction (the profile also reports what it saw). */
  cameraView: CameraView;
  createdAt: string;
  updatedAt: string;
  /** The auto-built evaluation criteria (null until built). */
  profile: ReferenceProfile | null;
  /** File references: keyframes + pose features live in IndexedDB (referenceStore.ts). */
  hasLocalMedia: boolean;
}

export type CriterionAspect =
  | 'start_posture'
  | 'sequence'
  | 'body_position'
  | 'limb_motion'
  | 'weight_balance'
  | 'trajectory'
  | 'finish'
  | 'technique_specific';

export const ASPECT_LABEL: Record<CriterionAspect, string> = {
  start_posture: '시작 자세·준비 동작',
  sequence: '동작 순서·전환',
  body_position: '신체 부위의 상대 위치',
  limb_motion: '관절·팔다리 움직임',
  weight_balance: '체중 이동·균형',
  trajectory: '궤적·도달 위치',
  finish: '마무리·다음 동작 연결',
  technique_specific: '기술 고유 특성',
};

export type Importance = 'core' | 'support' | 'minor';
export const IMPORTANCE_WEIGHT: Record<Importance, number> = { core: 3, support: 2, minor: 1 };

export interface ReferencePhase {
  id: string;
  name: string;
  description: string;
  /** Seconds relative to the reference segment start (startSeconds), when the model could tell. */
  startSec: number | null;
  endSec: number | null;
  /** Position inside the reference clip, 0–1 (used to place the phase in the user's attempt). */
  startFraction: number | null;
  endFraction: number | null;
}

export interface ReferenceCriterion {
  id: string;
  phaseId: string | null;
  aspect: CriterionAspect;
  /** What correct execution looks like — an observable description, not a joint angle. */
  description: string;
  importance: Importance;
  /** What in the reference shows it (frames / time). */
  evidence: string;
}

/** Built once per reference from the reference video itself (+ the technique's MARTIALDEX data). */
export interface ReferenceProfile {
  builtAt: string;
  model: 'gemini';
  techniqueVisible: boolean;
  /** What the reference actually shows — if it is not this technique, the profile says so. */
  matchesTechnique: boolean;
  observedTechnique: string;
  cameraView: CameraView;
  visibleBodyParts: string[];
  phases: ReferencePhase[];
  criteria: ReferenceCriterion[];
  /** Aspects the reference cannot show (occluded, off-frame, angle) — never scored. */
  excluded: { aspect: string; reason: string }[];
  summary: string;
  /** Where the technique movement itself happens inside the reference clip (0–1, idle excluded). */
  active: { start: number; end: number };
}

/** Local (MediaPipe) analysis of one clip — the helper signal. */
export interface ClipSignals {
  durationMs: number;
  frameCount: number;
  /** Frames where shoulders + hips were confidently detected. */
  visibleRatio: number;
  /** Frames where knees/ankles were also detected (whole body in frame). */
  fullBodyRatio: number;
  meanBrightness: number | null;
  /** The performed segment (ms from clip start), or null when no movement was found. */
  segment: { startMs: number; endMs: number; peakMs: number } | null;
  peakEnergy: number;
  cameraView: CameraView;
  issues: CaptureIssue[];
}

export type CaptureIssue = 'no_person' | 'body_cut_off' | 'too_dark' | 'no_movement' | 'too_short' | 'few_frames';

export const CAPTURE_ISSUE_LABEL: Record<CaptureIssue, string> = {
  no_person: '사람을 거의 인식하지 못했습니다. 카메라 앞에 서 주세요.',
  body_cut_off: '몸 전체(머리~발)가 화면에 다 들어오지 않았습니다. 카메라에서 조금 더 떨어져 주세요.',
  too_dark: '영상이 너무 어둡습니다. 조명을 밝게 해 주세요.',
  no_movement: '기술을 수행하는 움직임이 감지되지 않았습니다.',
  too_short: '촬영 시간이 너무 짧습니다.',
  few_frames: '분석할 수 있는 프레임이 너무 적습니다.',
};

export interface ClipFrame {
  tMs: number;
  /** JPEG data URL (small, for the AI and the side-by-side view). */
  image: string;
}

/** A clip ready for comparison: poses for alignment, a few frames for the AI. */
export interface PreparedClip {
  poses: PoseFrame[];
  frames: ClipFrame[];
  signals: ClipSignals;
}

export type Verdict = 'match' | 'partial' | 'mismatch' | 'not_observable';
export type Confidence = 'high' | 'medium' | 'low';

export interface CriterionResult {
  criterionId: string;
  verdict: Verdict;
  confidence: Confidence;
  /** What was seen in the user's frames (cites U# frames). */
  observation: string;
  /** What the reference shows for the same point. */
  referenceObservation: string;
}

/** The AI's structured judgement — evidence only; the score is computed in scoring.ts. */
export interface ComparisonJudgement {
  sameTechnique: boolean;
  techniquePerformed: boolean;
  criteria: CriterionResult[];
  phases: { phaseId: string; summary: string }[];
  strengths: string[];
  differences: { criterionId: string | null; what: string; why: string }[];
  focus: string[];
  drills: string[];
  limitations: string[];
  /** Share of criteria the independent judgements agreed on (1 = all). */
  agreement: number;
  samples: number;
  /** Local pose hints the AI confirmed on the frames, with the criterion they adjusted ("H1→C3"). */
  confirmedHints?: string[];
}

export type Reliability = 'high' | 'medium' | 'low';

export interface ScoreBreakdown {
  status: 'scored' | 'insufficient' | 'different_technique' | 'not_performed';
  score: number | null;
  /** Weighted mean before any core-mismatch cap. */
  rawScore: number | null;
  cap: { value: number; reason: string } | null;
  phaseScores: { phaseId: string; name: string; score: number | null }[];
  /** Share of criterion weight that could be observed. */
  coverage: number;
  reliability: Reliability;
  reliabilityValue: number;
  reasons: string[];
}

export interface AlignmentInfo {
  method: 'dtw' | 'segment';
  /** user segment length / reference segment length */
  speedRatio: number | null;
  /** Reference phase → user time (ms from clip start). */
  phaseTimes: { phaseId: string; refMs: number | null; userMs: number }[];
}

/** One finished evaluation (no video stored — frames are not kept either). */
export interface FormCompareRecord {
  id: string;
  techniqueId: string;
  martialArt: string;
  referenceId: string;
  createdAt: string;
  breakdown: ScoreBreakdown;
  judgement: ComparisonJudgement;
  criteria: ReferenceCriterion[];
  signals: ClipSignals;
  alignment: AlignmentInfo;
  viewWarning: string | null;
  /** Local pose-difference hints given to the AI (file references only). */
  poseHints?: string[];
  /** Matching PoseAnalysisRecord id (existing history / skill progress), when a score was given. */
  poseRecordId: string | null;
}
