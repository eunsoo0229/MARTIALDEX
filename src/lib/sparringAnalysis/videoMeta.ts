export interface VideoMeta {
  fileName: string;
  durationSec: number;
  width: number;
  height: number;
}

// The video File never leaves this process — an object URL is created for
// local playback only (see SparringAnalysis.tsx), and this just reads the
// browser-native metadata off the resulting <video> element.
export function readVideoMeta(video: HTMLVideoElement, file: File): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    function resolveNow() {
      resolve({ fileName: file.name, durationSec: video.duration, width: video.videoWidth, height: video.videoHeight });
    }
    // readyState >= HAVE_METADATA (1) means duration/videoWidth/videoHeight
    // are already populated right now — true every time this is called from
    // the <video>'s own onLoadedMetadata handler (SparringAnalysis.tsx),
    // since that event has by definition already fired once. Waiting for a
    // SECOND 'loadedmetadata' event in that case hangs forever: the event
    // fires only once per source and will never fire again, so the promise
    // this function returns would never resolve or reject — this was the
    // actual reason videoMeta stayed null and "분석할 사람 지정" silently
    // did nothing on every click.
    if (video.readyState >= 1) {
      resolveNow();
      return;
    }
    function onLoaded() {
      cleanup();
      resolveNow();
    }
    function onError() {
      cleanup();
      reject(new Error('영상 메타데이터를 읽을 수 없습니다.'));
    }
    function cleanup() {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
    }
    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('error', onError);
  });
}

const SUPPORTED_EXTENSIONS = /\.(mp4|mov|webm)$/i;
const SUPPORTED_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
// A generous local-processing cap — not tied to any paid API's upload limit.
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024;

export function validateVideoFile(file: File): string | null {
  const isSupported = SUPPORTED_MIME_TYPES.includes(file.type) || SUPPORTED_EXTENSIONS.test(file.name);
  if (!isSupported) return '지원하지 않는 파일 형식입니다. MP4, MOV, WebM 파일을 사용해주세요.';
  if (file.size > MAX_VIDEO_BYTES) return '영상 파일이 너무 큽니다. 300MB 이하의 영상을 사용해주세요.';
  return null;
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
