import type { PoseFrame, PoseLandmarkName } from '../poseAnalysis/types';
import { POSE_CONNECTIONS } from '../poseAnalysis/landmarks';
import { createMultiPoseLandmarker } from '../poseAnalysis/poseEstimator';
import { bodyFrame, clipSignals, personBox } from './motion';
import type { ClipFrame, PreparedClip } from './types';

// Turns a clip into what the comparison needs, entirely on the device:
// MediaPipe poses (local model, already bundled for 자세 분석) + small JPEG
// frames. Used for a reference video FILE the user is allowed to use, a
// video file of their own attempt (e.g. recorded with the phone camera app),
// and live camera capture. Nothing here uploads anything.

// Frames are kept at 640 px so they can be cropped to the person later (cropToPerson).
const THUMB_WIDTH = 640;

/**
 * MediaPipe x/y are fractions of the image width/height — on a 4:3 or 16:9
 * frame a horizontal and a vertical "0.1" are different lengths. Poses kept
 * here have x multiplied by width/height so distances are in one unit
 * (motion.ts relies on it for torso-normalised geometry).
 */
function squarePose(p: PoseFrame | null | undefined, aspect: number, timestampMs: number): PoseFrame {
  const out: PoseFrame = { timestampMs };
  if (!p) return out;
  for (const [k, v] of Object.entries(p)) {
    if (k === 'timestampMs' || !v || typeof v !== 'object') continue;
    (out as Record<string, unknown>)[k] = { ...v, x: v.x * aspect, z: (v.z ?? 0) * aspect }; // MediaPipe z is on the x (width) scale
  }
  return out;
}

function thumb(source: CanvasImageSource, w: number, h: number, canvas: HTMLCanvasElement): { image: string; brightness: number } {
  const width = THUMB_WIDTH;
  const height = Math.max(1, Math.round((h / Math.max(1, w)) * width));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4 * 16) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    n++;
  }
  return { image: canvas.toDataURL('image/jpeg', 0.72), brightness: n ? sum / n : 0 };
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', fail);
      resolve();
    };
    const fail = () => {
      video.removeEventListener('seeked', done);
      reject(new Error('seek failed'));
    };
    video.addEventListener('seeked', done);
    video.addEventListener('error', fail);
    video.currentTime = t;
  });
}

/** Loads a video Blob into a detached <video>; rejects when the browser cannot decode it. */
export function loadVideo(blob: Blob): Promise<{ video: HTMLVideoElement; url: string; durationSeconds: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    const timer = window.setTimeout(() => reject(new Error('영상을 불러오는 데 너무 오래 걸립니다.')), 20000);
    video.onloadeddata = async () => {
      window.clearTimeout(timer);
      // Some WebM files report Infinity until seeked to the end.
      if (!Number.isFinite(video.duration)) {
        await seek(video, 1e7).catch(() => {});
        await seek(video, 0).catch(() => {});
      }
      resolve({ video, url, durationSeconds: Number.isFinite(video.duration) ? video.duration : 0 });
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      reject(new Error('이 영상 형식은 재생할 수 없습니다. MP4 또는 WebM 파일을 사용해 주세요.'));
    };
  });
}

/** Samples a video file (optionally only [startSeconds, endSeconds]) at `fps` — poses + frames, timestamps in ms from startSeconds. */
export async function sampleVideoBlob(
  blob: Blob,
  opts: { fps?: number; startSeconds?: number; endSeconds?: number; onProgress?: (done: number, total: number) => void } = {}
): Promise<PreparedClip & { durationSeconds: number }> {
  const { video, url, durationSeconds } = await loadVideo(blob);
  const landmarker = await createMultiPoseLandmarker(1);
  const canvas = document.createElement('canvas');
  try {
    const fps = opts.fps ?? 10;
    const start = Math.max(0, opts.startSeconds ?? 0);
    const end = Math.min(durationSeconds || Infinity, opts.endSeconds ?? durationSeconds);
    const total = Math.max(1, Math.floor((end - start) * fps));
    const poses: PoseFrame[] = [];
    const frames: ClipFrame[] = [];
    let brightness = 0;
    for (let i = 0; i <= total; i++) {
      const t = start + i / fps;
      if (t > end) break;
      await seek(video, t);
      const tMs = Math.round((t - start) * 1000);
      const detected = landmarker.detect(video)[0];
      poses.push(squarePose(detected, video.videoWidth / Math.max(1, video.videoHeight), tMs));
      const th = thumb(video, video.videoWidth, video.videoHeight, canvas);
      brightness += th.brightness;
      frames.push({ tMs, image: th.image });
      opts.onProgress?.(i + 1, total + 1);
    }
    return { poses, frames, signals: clipSignals(poses, frames.length ? brightness / frames.length : null), durationSeconds };
  } finally {
    landmarker.close();
    URL.revokeObjectURL(url);
  }
}

/**
 * Live camera capture: call add() every animation frame while recording
 * (with the pose the live landmarker already found); a frame image is kept
 * every `frameEveryMs`. finish() returns the prepared clip.
 */
export class LiveClipCollector {
  private poses: PoseFrame[] = [];
  private frames: ClipFrame[] = [];
  private brightness = 0;
  private lastFrameAt = -Infinity;
  private t0: number | null = null;
  private canvas = document.createElement('canvas');
  constructor(private frameEveryMs = 100) {}

  add(video: HTMLVideoElement, pose: PoseFrame | null, nowMs: number) {
    if (this.t0 === null) this.t0 = nowMs;
    const tMs = Math.round(nowMs - this.t0);
    this.poses.push(squarePose(pose, video.videoWidth / Math.max(1, video.videoHeight || 1), tMs));
    if (tMs - this.lastFrameAt >= this.frameEveryMs && video.videoWidth) {
      const th = thumb(video, video.videoWidth, video.videoHeight, this.canvas);
      this.brightness += th.brightness;
      this.frames.push({ tMs, image: th.image });
      this.lastFrameAt = tMs;
    }
  }

  finish(): PreparedClip {
    return { poses: this.poses, frames: this.frames, signals: clipSignals(this.poses, this.frames.length ? this.brightness / this.frames.length : null) };
  }
}

/**
 * Crops frames to one box around the person for the whole clip (from the
 * poses), so the AI sees the body at the same size whatever the camera
 * distance or background — a far-away person is not judged from a few pixels.
 */
export async function cropToPerson<T extends ClipFrame>(frames: T[], poses: PoseFrame[], seg: { startMs: number; endMs: number } | null, outHeight = 420): Promise<T[]> {
  if (!frames.length) return frames;
  const first = await loadImage(frames[0].image);
  const box = personBox(poses, first.width / Math.max(1, first.height), seg);
  if (!box) return frames;
  const canvas = document.createElement('canvas');
  const out: T[] = [];
  for (const f of frames) {
    const img = f === frames[0] ? first : await loadImage(f.image);
    const sx = box.x0 * img.width;
    const sy = box.y0 * img.height;
    const sw = (box.x1 - box.x0) * img.width;
    const sh = (box.y1 - box.y0) * img.height;
    canvas.height = outHeight;
    canvas.width = Math.max(1, Math.round((sw / Math.max(1, sh)) * outHeight));
    canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    out.push({ ...f, image: canvas.toDataURL('image/jpeg', 0.8) });
  }
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('frame decode failed'));
    img.src = src;
  });
}

/** Draws one pose, hip-centred and torso-scaled, onto ctx (poses are x × aspect — see squarePose). */
function drawSkeleton(ctx: CanvasRenderingContext2D, pose: PoseFrame | null, cx: number, cy: number, scale: number, color: string) {
  if (!pose) return;
  const b = bodyFrame(pose);
  if (!b) return;
  const P = (n: PoseLandmarkName) => {
    const p = pose[n];
    return p && p.visibility >= 0.5 ? { x: cx + ((p.x - b.origin.x) / b.unit) * scale, y: cy + ((p.y - b.origin.y) / b.unit) * scale } : null;
  };
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const [a, c] of POSE_CONNECTIONS) {
    const pa = P(a);
    const pc = P(c);
    if (!pa || !pc) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pc.x, pc.y);
    ctx.stroke();
  }
  const nose = P('nose');
  if (nose) {
    ctx.beginPath();
    ctx.arc(nose.x, nose.y, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const n of ['leftWrist', 'rightWrist'] as PoseLandmarkName[]) {
    const w = P(n);
    if (w) {
      ctx.beginPath();
      ctx.arc(w.x, w.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * One image per aligned moment: [reference photo | user photo | both
 * skeletons overlaid — hip-centred, scaled to the same torso length; blue =
 * reference, red = user]. The overlay removes background, clothing, skin
 * tone, body size and camera distance entirely, so the comparison is about
 * the pose itself.
 */
export async function compositePair(refImage: string, userImage: string, refPose: PoseFrame | null, userPose: PoseFrame | null, height = 380): Promise<string> {
  const [a, b] = await Promise.all([loadImage(refImage), loadImage(userImage)]);
  const wa = Math.round((a.width / a.height) * height);
  const wb = Math.round((b.width / b.height) * height);
  const ws = Math.round(height * 0.8);
  const canvas = document.createElement('canvas');
  canvas.width = wa + wb + ws + 8;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(a, 0, 0, wa, height);
  ctx.drawImage(b, wa + 4, 0, wb, height);
  const scale = height * 0.3; // torso length in px
  const cx = wa + wb + 8 + ws / 2;
  const cy = height * 0.58;
  ctx.globalAlpha = 0.8;
  drawSkeleton(ctx, refPose, cx, cy, scale, '#1f6feb');
  drawSkeleton(ctx, userPose, cx, cy, scale, '#e5534b');
  ctx.globalAlpha = 1;
  return canvas.toDataURL('image/jpeg', 0.8);
}

/** The pose nearest to a time (ms). */
export function poseAt(poses: PoseFrame[], tMs: number): PoseFrame | null {
  let best: PoseFrame | null = null;
  for (const p of poses) if (!best || Math.abs(p.timestampMs - tMs) < Math.abs(best.timestampMs - tMs)) best = p;
  return best;
}
