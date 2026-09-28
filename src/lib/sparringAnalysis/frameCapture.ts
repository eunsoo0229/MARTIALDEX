import { seekTo } from './frameSampler';
import type { AiImagePart } from '../ai/types';

// Same canvas-snapshot approach as sparringVideo/camera.ts's captureThumbnail
// (downscaled JPEG, not a lossless frame) — this is the piece that was
// genuinely missing per the investigation: frameSampler.ts already seeks to
// timestamps for MediaPipe, but nothing turned a seeked frame into an actual
// image byte payload for Gemini. Kept deliberately small (width capped,
// moderate JPEG quality) to keep the multimodal request payload/token cost
// bounded — visualEventAnalysis.ts sends several of these in one call.
const FRAME_MAX_WIDTH = 480;
const FRAME_JPEG_QUALITY = 0.6;

function dataUrlToImagePart(dataUrl: string): AiImagePart | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  return match ? { mimeType: match[1], data: match[2] } : null;
}

/** Seeks the video to `timestampSec` and grabs one downscaled JPEG frame — null only if canvas 2D context is unavailable (never guesses a placeholder image). */
export async function captureFrameAt(video: HTMLVideoElement, timestampSec: number): Promise<AiImagePart | null> {
  await seekTo(video, timestampSec);
  const vw = video.videoWidth || FRAME_MAX_WIDTH;
  const vh = video.videoHeight || Math.round(FRAME_MAX_WIDTH * 0.75);
  const width = Math.min(FRAME_MAX_WIDTH, vw);
  const height = Math.max(1, Math.round(width * (vh / vw)));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  return dataUrlToImagePart(canvas.toDataURL('image/jpeg', FRAME_JPEG_QUALITY));
}

export interface CapturedFrame {
  timestampSec: number;
  image: AiImagePart;
}

/** Captures one frame per timestamp, in order, skipping (not fabricating) any that fail. Pauses playback for the duration of the seeks, same as samplePosesFromVideo. */
export async function captureFramesAt(video: HTMLVideoElement, timestamps: number[]): Promise<CapturedFrame[]> {
  const wasPlaying = !video.paused;
  video.pause();
  const results: CapturedFrame[] = [];
  try {
    for (const t of timestamps) {
      const image = await captureFrameAt(video, t);
      if (image) results.push({ timestampSec: t, image });
    }
  } finally {
    if (wasPlaying) void video.play();
  }
  return results;
}
