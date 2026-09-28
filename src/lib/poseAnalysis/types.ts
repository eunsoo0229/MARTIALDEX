// Named subset of MediaPipe Pose's 33 landmarks — see landmarks.ts for the
// index mapping. Only the points this feature actually uses (per the spec:
// nose, shoulders, elbows, wrists, hips, knees, ankles).
export type PoseLandmarkName =
  | 'nose'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftElbow'
  | 'rightElbow'
  | 'leftWrist'
  | 'rightWrist'
  | 'leftHip'
  | 'rightHip'
  | 'leftKnee'
  | 'rightKnee'
  | 'leftAnkle'
  | 'rightAnkle';

export interface PoseLandmarkPoint {
  x: number;
  y: number;
  z: number;
  /** MediaPipe's own confidence for this point, 0-1. */
  visibility: number;
}

/** One video frame's worth of named landmarks, captured during a recording. */
export type PoseFrame = Partial<Record<PoseLandmarkName, PoseLandmarkPoint>> & {
  timestampMs: number;
};

export interface MetricResult {
  id: string;
  score: number;
  /** Short, honest note on what was actually measured — never a certainty claim. */
  detail: string;
}

export interface PoseAnalysisMetricConfig {
  id: string;
  name: string;
  params?: Record<string, number | string>;
}

export interface PoseAnalysisConfig {
  supported: true;
  requiredLandmarks: PoseLandmarkName[];
  metrics: PoseAnalysisMetricConfig[];
}

export type SkillStatus = 'good' | 'average' | 'needs_improvement' | 'not_analyzed';

export interface PoseAnalysisResult {
  techniqueId: string;
  overallScore: number;
  status: Exclude<SkillStatus, 'not_analyzed'>;
  metricScores: { id: string; name: string; score: number; detail: string }[];
  strengths: string[];
  improvements: string[];
  /** How many usable pose frames (visible + confident enough) fed into this result. */
  frameCount: number;
}

export interface PoseAnalysisRecord {
  recordId: string;
  techniqueId: string;
  martialArtId: string;
  score: number;
  status: Exclude<SkillStatus, 'not_analyzed'>;
  metricScores: Record<string, number>;
  analyzedAt: string;
}

export interface TechniqueSkillSummary {
  techniqueId: string;
  status: SkillStatus;
  latestScore: number | null;
  bestScore: number | null;
  averageScore: number | null;
  firstScore: number | null;
  analysisCount: number;
  lastAnalyzedAt: string | null;
  /** latestScore - firstScore — explicitly a change in *analysis score*, not a verified skill gain. */
  scoreDelta: number | null;
}
