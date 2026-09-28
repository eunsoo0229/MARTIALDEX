import type { CameraFacing } from './types';

// Reuses the same navigator.mediaDevices.getUserMedia() approach as the
// existing camera feature (components/PoseAnalysisModal.tsx) — same
// permission flow (standard browser prompt, no separate pre-consent UI),
// just with an explicit facingMode constraint that modal doesn't need
// (it never distinguishes front/back).

export interface CameraStreamHandle {
  stream: MediaStream;
  facing: CameraFacing;
}

export async function openCamera(facing: CameraFacing): Promise<CameraStreamHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing },
    audio: true,
  });
  return { stream, facing };
}

export function stopCameraStream(handle: CameraStreamHandle | null): void {
  handle?.stream.getTracks().forEach((t) => t.stop());
}

/**
 * Detects whether this device/browser can genuinely run front AND back
 * camera at once — never assumed. Opens the front stream, then tries to
 * ALSO open the back stream while the first is still active; most
 * mid-range Android devices reject the second request outright (single
 * hardware camera pipeline), which is exactly the "미지원 → 단일 카메라
 * fallback" case the recorder must handle. Both trial streams are always
 * stopped before returning — this is a pure capability probe, not the
 * actual recording streams (the recorder opens its own fresh streams once
 * it knows which mode to use, right when the user taps "촬영 시작").
 */
export async function detectDualCameraSupport(): Promise<boolean> {
  let front: MediaStream | null = null;
  let back: MediaStream | null = null;
  try {
    front = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
  } catch {
    return false;
  }
  try {
    back = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    return true;
  } catch {
    return false;
  } finally {
    front?.getTracks().forEach((t) => t.stop());
    back?.getTracks().forEach((t) => t.stop());
  }
}

export interface RecorderHandle {
  facing: CameraFacing;
  stream: MediaStream;
  recorder: MediaRecorder;
  chunks: Blob[];
}

const PREFERRED_MIME_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

function pickSupportedMimeType(): string | undefined {
  return PREFERRED_MIME_TYPES.find((t) => (window.MediaRecorder ? MediaRecorder.isTypeSupported(t) : false));
}

export function startRecording(handle: CameraStreamHandle): RecorderHandle {
  const mimeType = pickSupportedMimeType();
  const recorder = new MediaRecorder(handle.stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(1000); // 1s timeslices so a crash/force-stop still leaves usable chunks
  return { facing: handle.facing, stream: handle.stream, recorder, chunks };
}

export function pauseRecording(handle: RecorderHandle): void {
  if (handle.recorder.state === 'recording') handle.recorder.pause();
}

export function resumeRecording(handle: RecorderHandle): void {
  if (handle.recorder.state === 'paused') handle.recorder.resume();
}

export function stopRecording(handle: RecorderHandle): Promise<Blob> {
  return new Promise((resolve) => {
    handle.recorder.onstop = () => {
      const mimeType = handle.recorder.mimeType || 'video/webm';
      resolve(new Blob(handle.chunks, { type: mimeType }));
    };
    if (handle.recorder.state !== 'inactive') handle.recorder.stop();
    else resolve(new Blob(handle.chunks, { type: handle.recorder.mimeType || 'video/webm' }));
  });
}

/** A single frame grabbed from the live stream as a small JPEG data URL — used for the saved video's list thumbnail (see SparringVideo.thumbnailDataUrl). Never the full video. */
export function captureThumbnail(videoEl: HTMLVideoElement): string | undefined {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(videoEl.videoWidth || 320, 320);
    canvas.height = Math.round(canvas.width * ((videoEl.videoHeight || 240) / (videoEl.videoWidth || 320)));
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch {
    return undefined;
  }
}
