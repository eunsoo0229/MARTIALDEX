import type { PoseFrame, PoseLandmarkName } from './types';
import { ALL_LANDMARK_NAMES, LANDMARK_INDEX } from './landmarks';
import type { FilesetResolver as FilesetResolverType, PoseLandmarker as MpPoseLandmarkerType } from '@mediapipe/tasks-vision';

// The only module that talks to MediaPipe. Everything (WASM runtime + the
// pose model) is bundled locally under public/mediapipe/ and loaded via a
// relative path — no network request, no external server ever sees the
// camera feed. See README "카메라 자세 분석" for how these files got there.
const WASM_BASE = './mediapipe/wasm';
const MODEL_PATH = './mediapipe/models/pose_landmarker_lite.task';

// GPU delegate support is inconsistent across Android WebView versions/GPUs
// — some mid-range/older devices fail to initialize it at all, others
// silently run far slower than plain CPU. Desktop Electron never hits this
// (Chromium's GPU path there is uniform), so it never surfaced until
// checked specifically for mobile. Falling back to CPU on any GPU-init
// failure keeps the feature usable instead of throwing on affected devices.
async function createFromOptionsWithFallback(
  MpPoseLandmarker: typeof MpPoseLandmarkerType,
  vision: Awaited<ReturnType<typeof FilesetResolverType.forVisionTasks>>,
  runningOptions: { runningMode: 'VIDEO' | 'IMAGE'; numPoses: number }
): Promise<MpPoseLandmarkerType> {
  try {
    return await MpPoseLandmarker.createFromOptions(vision, {
      ...runningOptions,
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
    });
  } catch {
    return await MpPoseLandmarker.createFromOptions(vision, {
      ...runningOptions,
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'CPU' },
    });
  }
}

export interface PoseLandmarker {
  detect(video: HTMLVideoElement, timestampMs: number): PoseFrame | null;
  close(): void;
}

export async function createPoseLandmarker(): Promise<PoseLandmarker> {
  const { FilesetResolver, PoseLandmarker: MpPoseLandmarker } = await import('@mediapipe/tasks-vision');
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
  const landmarker = await createFromOptionsWithFallback(MpPoseLandmarker, vision, {
    runningMode: 'VIDEO',
    numPoses: 1,
  });

  let lastTimestamp = -1;

  return {
    detect(video, timestampMs) {
      // MediaPipe's VIDEO mode requires strictly increasing timestamps.
      const ts = timestampMs > lastTimestamp ? timestampMs : lastTimestamp + 1;
      lastTimestamp = ts;
      const result = landmarker.detectForVideo(video, ts);
      const raw = result.landmarks?.[0];
      if (!raw) return null;

      const frame: PoseFrame = { timestampMs: ts };
      for (const name of ALL_LANDMARK_NAMES) {
        const p = raw[LANDMARK_INDEX[name]];
        if (p) frame[name as PoseLandmarkName] = { x: p.x, y: p.y, z: p.z ?? 0, visibility: p.visibility ?? 0 };
      }
      return frame;
    },
    close() {
      landmarker.close();
    },
  };
}

// Multi-person variant for 15단계 스파링 분석 — a sparring clip has two
// people, so `createPoseLandmarker()` above (numPoses: 1, VIDEO mode, tied to
// live continuous camera playback) doesn't fit. This uses IMAGE mode instead:
// each call is treated as an independent frame with no timestamp-ordering
// requirement, which matches how the sparring analyzer samples frames by
// seeking around a <video> element rather than playing it continuously.
// Still the same local model/WASM bundle — no new asset, no network call.
export interface MultiPoseLandmarker {
  detect(source: HTMLVideoElement | HTMLCanvasElement): PoseFrame[];
  close(): void;
}

export async function createMultiPoseLandmarker(numPoses: number): Promise<MultiPoseLandmarker> {
  const { FilesetResolver, PoseLandmarker: MpPoseLandmarker } = await import('@mediapipe/tasks-vision');
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
  const landmarker = await createFromOptionsWithFallback(MpPoseLandmarker, vision, {
    runningMode: 'IMAGE',
    numPoses,
  });

  return {
    detect(source) {
      const result = landmarker.detect(source);
      return (result.landmarks ?? []).map((raw) => {
        // timestampMs is meaningless for a standalone IMAGE-mode detection —
        // left at 0; the caller (sparringAnalysis/frameSampler.ts) tracks the
        // real video timestamp itself alongside this per-person array.
        const frame: PoseFrame = { timestampMs: 0 };
        for (const name of ALL_LANDMARK_NAMES) {
          const p = raw[LANDMARK_INDEX[name]];
          if (p) frame[name as PoseLandmarkName] = { x: p.x, y: p.y, z: p.z ?? 0, visibility: p.visibility ?? 0 };
        }
        return frame;
      });
    },
    close() {
      landmarker.close();
    },
  };
}
