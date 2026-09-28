import type { PoseLandmarkName } from './types';

// Index of each named point within MediaPipe Pose's standard 33-point output
// (https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker —
// stable, documented indices). We only name the subset this feature uses.
export const LANDMARK_INDEX: Record<PoseLandmarkName, number> = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
};

export const ALL_LANDMARK_NAMES = Object.keys(LANDMARK_INDEX) as PoseLandmarkName[];

// Bone pairs for drawing the skeleton overlay — body only, no face mesh.
export const POSE_CONNECTIONS: [PoseLandmarkName, PoseLandmarkName][] = [
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
];
