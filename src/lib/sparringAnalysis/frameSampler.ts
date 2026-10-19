import type { PoseFrame } from '../poseAnalysis/types';
import { createMultiPoseLandmarker } from '../poseAnalysis/poseEstimator';
import { MAX_FRAME_SAMPLES, MIN_SAMPLE_INTERVAL_SEC } from './types';
import { grabFrame, measurePersonColors, type PersonColors } from './attire';

export interface SampledFrame {
  timestampSec: number;
  /** One entry per detected person in this frame — order is NOT stable across frames. */
  poses: PoseFrame[];
  /** Measured clothing colours per pose (same order as `poses`) — only when sampling was asked to measure them (복장 기반 식별). */
  colors?: PersonColors[];
}

export class AnalysisCancelledError extends Error {
  constructor() {
    super('분석이 취소되었습니다.');
  }
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
  onProgress?: (done: number, total: number) => void,
  options: { measureColors?: boolean; signal?: AbortSignal } = {}
): Promise<SampledFrame[]> {
  const landmarker = await createMultiPoseLandmarker(numPoses);
  const wasPlaying = !video.paused;
  video.pause();
  const results: SampledFrame[] = [];
  try {
    for (let i = 0; i < timestamps.length; i++) {
      if (options.signal?.aborted) throw new AnalysisCancelledError();
      await seekTo(video, timestamps[i]);
      const poses = landmarker.detect(video);
      const img = options.measureColors && poses.length ? grabFrame(video) : null;
      results.push({ timestampSec: timestamps[i], poses, ...(img ? { colors: poses.map((p) => measurePersonColors(img, p)) } : {}) });
      onProgress?.(i + 1, timestamps.length);
    }
  } finally {
    landmarker.close();
    if (wasPlaying) void video.play();
  }
  return results;
}
