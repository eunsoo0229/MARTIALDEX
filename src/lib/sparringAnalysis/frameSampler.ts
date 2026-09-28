import type { PoseFrame } from '../poseAnalysis/types';
import { createMultiPoseLandmarker } from '../poseAnalysis/poseEstimator';
import { MAX_FRAME_SAMPLES, MIN_SAMPLE_INTERVAL_SEC } from './types';

export interface SampledFrame {
  timestampSec: number;
  /** One entry per detected person in this frame — order is NOT stable across frames. */
  poses: PoseFrame[];
}

export function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    function onSeeked() {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    }
    video.addEventListener('seeked', onSeeked);
    video.currentTime = t;
  });
}

// Evenly spaced sample points, capped at MAX_FRAME_SAMPLES so a long clip
// doesn't run the (WASM) pose model hundreds of times — this is real local
// inference per sample, not free, so the cap keeps analysis time reasonable.
export function buildSampleTimestamps(durationSec: number, maxSamples = MAX_FRAME_SAMPLES): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [0];
  const interval = Math.max(MIN_SAMPLE_INTERVAL_SEC, durationSec / maxSamples);
  const timestamps: number[] = [];
  for (let t = 0; t < durationSec; t += interval) {
    timestamps.push(Math.min(t, Math.max(0, durationSec - 0.05)));
  }
  return timestamps.length ? timestamps : [0];
}

// Seeks to each sample timestamp and runs multi-person pose detection there
// (IMAGE mode — see poseEstimator.ts). This is genuinely local model
// inference, not a canned result, but it IS just per-frame detection with no
// built-in identity tracking — personTracker.ts is what turns this into "the
// same person over time".
export async function samplePosesFromVideo(
  video: HTMLVideoElement,
  timestamps: number[],
  numPoses: number,
  onProgress?: (done: number, total: number) => void
): Promise<SampledFrame[]> {
  const landmarker = await createMultiPoseLandmarker(numPoses);
  const wasPlaying = !video.paused;
  video.pause();
  const results: SampledFrame[] = [];
  try {
    for (let i = 0; i < timestamps.length; i++) {
      await seekTo(video, timestamps[i]);
      const poses = landmarker.detect(video);
      results.push({ timestampSec: timestamps[i], poses });
      onProgress?.(i + 1, timestamps.length);
    }
  } finally {
    landmarker.close();
    if (wasPlaying) void video.play();
  }
  return results;
}
