// 원본 영상에서 약점 구간 잘라내기 — no FFmpeg, no main-process command:
// the ORIGINAL file is played in a hidden <video> from `startSec` and its
// own frames are recorded with captureStream() + MediaRecorder (a real
// re-encode of the original pixels — nothing generated, no still images;
// video track only, so clips have no sound).
// requestVideoFrameCallback reports the original media time of the first
// and last recorded frames, so each clip knows exactly which part of the
// original it covers (actualStartSec / actualEndSec). Recording runs at
// normal speed, so a 10-second clip takes about 10 seconds to make.
// Works in Chromium (Electron, Chrome, Android WebView); elsewhere
// isClipExtractionSupported() is false and the UI says so.

export interface ExtractedClip {
  blob: Blob;
  mimeType: string;
  actualStartSec: number;
  actualEndSec: number;
}

type CaptureVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
};

// Clips are video-only: in Chromium a muted element's captured audio track never delivers data,
// and with it in the stream MediaRecorder silently records nothing (verified in Electron).
const MIME_CANDIDATES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];

export function pickClipMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export function isClipExtractionSupported(): boolean {
  const v = document.createElement('video') as CaptureVideo;
  return typeof v.captureStream === 'function' && !!pickClipMimeType();
}

export class ClipCancelledError extends Error {
  constructor() {
    super('클립 생성이 취소되었습니다.');
  }
}

function waitFor(el: HTMLMediaElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => {
      cleanup();
      reject(new Error(`${event} 대기 시간 초과`));
    }, timeoutMs);
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('원본 영상을 읽을 수 없습니다.'));
    };
    function cleanup() {
      window.clearTimeout(t);
      el.removeEventListener(event, onOk);
      el.removeEventListener('error', onErr);
    }
    el.addEventListener(event, onOk, { once: true });
    el.addEventListener('error', onErr, { once: true });
  });
}

/** Cuts [startSec, endSec] out of the original video at `sourceUrl`. */
export async function extractClip(sourceUrl: string, startSec: number, endSec: number, signal?: AbortSignal): Promise<ExtractedClip> {
  const mimeType = pickClipMimeType();
  if (!mimeType) throw new Error('이 환경은 영상 녹화(MediaRecorder)를 지원하지 않습니다.');
  if (!(endSec > startSec)) throw new Error('클립 구간이 올바르지 않습니다.');

  const video = document.createElement('video') as CaptureVideo;
  if (typeof video.captureStream !== 'function') throw new Error('이 환경은 영상 캡처(captureStream)를 지원하지 않습니다.');
  video.muted = true; // no sound out of the speakers while cutting (clips are video-only)
  video.playsInline = true;
  video.preload = 'auto';
  video.style.cssText = 'position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.appendChild(video);

  let recorder: MediaRecorder | null = null;
  try {
    video.src = sourceUrl;
    await waitFor(video, 'loadedmetadata', 15000);
    const duration = Number.isFinite(video.duration) ? video.duration : endSec;
    const start = Math.max(0, Math.min(startSec, duration - 0.1));
    const end = Math.min(endSec, duration);
    video.currentTime = start;
    await waitFor(video, 'seeked', 15000);
    if (signal?.aborted) throw new ClipCancelledError();

    const captured = video.captureStream!();
    const stream = new MediaStream(captured.getVideoTracks());
    const chunks: BlobPart[] = [];
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
    let recorderError: Error | null = null;
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onerror = (e) => {
      recorderError = new Error(`영상 녹화 오류: ${(e as unknown as { error?: Error }).error?.message ?? '알 수 없음'}`);
    };
    const stopped = new Promise<void>((resolve) => (recorder!.onstop = () => resolve()));

    let firstMedia: number | null = null;
    let lastMedia = start;
    const finished = new Promise<void>((resolve, reject) => {
      const deadline = window.setTimeout(() => reject(new Error('클립 생성 시간이 초과되었습니다.')), (end - start) * 1000 * 3 + 10000);
      const done = () => {
        window.clearTimeout(deadline);
        resolve();
      };
      const onFrame = (_now: number, meta: { mediaTime: number }) => {
        if (firstMedia === null) firstMedia = meta.mediaTime;
        lastMedia = meta.mediaTime;
        if (signal?.aborted) {
          window.clearTimeout(deadline);
          reject(new ClipCancelledError());
          return;
        }
        if (meta.mediaTime >= end || video.ended) done();
        else video.requestVideoFrameCallback!(onFrame);
      };
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(onFrame);
      else {
        const tick = () => {
          if (firstMedia === null) firstMedia = video.currentTime;
          lastMedia = video.currentTime;
          if (signal?.aborted) return reject(new ClipCancelledError());
          if (video.currentTime >= end || video.ended) done();
          else window.setTimeout(tick, 30);
        };
        tick();
      }
      video.addEventListener('ended', done, { once: true });
    });

    recorder.start(1000);
    await video.play();
    await finished;
    video.pause();
    recorder.stop();
    await stopped;
    captured.getTracks().forEach((t) => t.stop());

    const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
    if (recorderError) throw recorderError;
    if (blob.size < 1000) throw new Error('녹화된 데이터가 없습니다.');
    return { blob, mimeType: blob.type, actualStartSec: Math.round((firstMedia ?? start) * 100) / 100, actualEndSec: Math.round(lastMedia * 100) / 100 };
  } finally {
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // already stopped
      }
    }
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
  }
}

/** Confirms a stored clip really decodes and plays (used before showing it as playable). Returns its playable duration. */
export async function probeClip(blob: Blob): Promise<number> {
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  try {
    v.src = url;
    await waitFor(v, 'loadeddata', 10000);
    // MediaRecorder WebM often has no duration header — seek far to make the browser compute it.
    if (!Number.isFinite(v.duration)) {
      v.currentTime = 1e7;
      await waitFor(v, 'seeked', 10000).catch(() => undefined);
    }
    return Number.isFinite(v.duration) ? v.duration : v.currentTime;
  } finally {
    v.removeAttribute('src');
    v.load();
    URL.revokeObjectURL(url);
  }
}
