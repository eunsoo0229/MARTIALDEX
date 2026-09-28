import type { SparringVideo } from './types';
import { SparringCamera, isNativeAndroidRecordingAvailable } from './nativeCameraPlugin';

// "갤러리에서 보기" / "파일로 이동하기" — platform dispatch for the two
// fallback-UI action buttons (see SparringVideoList.tsx's VideoPreview).
// Neither of these ever copies/moves/re-encodes the underlying file — both
// just hand the EXISTING localUri to whatever the OS's "open this" API is
// on each platform, exactly the same "never touch the saved path" principle
// storage.ts already follows for playback (resolvePlayableSrc).

export interface VideoActionResult {
  ok: boolean;
  message?: string;
}

const UNSUPPORTED: VideoActionResult = { ok: false, message: '이 환경에서는 지원되지 않는 기능입니다.' };

/**
 * "갤러리에서 보기":
 * - Electron (Mac/Windows): opens the file with the OS's default video
 *   player (video:open IPC → shell.openPath) — the closest desktop
 *   equivalent, since neither OS has a "photo/video gallery app" concept.
 * - Native Android: SparringCameraPlugin.openInGallery — an ACTION_VIEW
 *   intent with a video MIME type via FileProvider. Honest caveat (see that
 *   method's Java doc comment): the video lives in the app's PRIVATE
 *   storage, which the system Gallery app never scans, so this opens a
 *   video-capable app rather than making the clip appear inside the
 *   Gallery app's own grid — moving/copying the file into shared storage to
 *   achieve that would violate the "never touch the saved file" requirement.
 * - Plain web (no persistent storage at all for this feature): unsupported.
 */
export async function openVideoInGallery(video: SparringVideo): Promise<VideoActionResult> {
  if (window.martialdex?.openVideo) {
    try {
      return await window.martialdex.openVideo(video.localUri);
    } catch {
      return { ok: false, message: '영상을 여는 중 오류가 발생했습니다.' };
    }
  }
  if (isNativeAndroidRecordingAvailable()) {
    try {
      return await SparringCamera.openInGallery({ filePath: video.localUri });
    } catch (e) {
      // The native call rejecting (rather than resolving ok:false) means
      // something unexpected happened at the bridge level — still never lets
      // it propagate as an unhandled rejection/crash to the caller.
      return { ok: false, message: e instanceof Error ? e.message : '영상을 여는 중 오류가 발생했습니다.' };
    }
  }
  return UNSUPPORTED;
}

/**
 * "파일로 이동하기":
 * - Electron: reuses the EXISTING revealVideo IPC (shell.showItemInFolder —
 *   Finder on macOS, Explorer on Windows) unchanged, same as
 *   service.ts's revealSparringVideoFile.
 * - Native Android: SparringCameraPlugin.openFileLocation — best-effort;
 *   Android has no OS-level "reveal in folder" for an app's private
 *   storage (no file manager/DocumentsUI can browse there), so this offers
 *   a broader app chooser than openInGallery's video-biased one. Documented
 *   platform limitation, not a bug — see that method's Java doc comment.
 * - Plain web: unsupported.
 */
export async function openVideoFileLocation(video: SparringVideo): Promise<VideoActionResult> {
  if (window.martialdex?.revealVideo) {
    try {
      window.martialdex.revealVideo(video.localUri);
      return { ok: true };
    } catch {
      return { ok: false, message: '파일 위치를 여는 중 오류가 발생했습니다.' };
    }
  }
  if (isNativeAndroidRecordingAvailable()) {
    try {
      return await SparringCamera.openFileLocation({ filePath: video.localUri });
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : '파일을 여는 중 오류가 발생했습니다.' };
    }
  }
  return UNSUPPORTED;
}

/** Whether either action has any real chance of working on this platform — the list/card UI uses this to hide both buttons on plain web instead of showing controls that always fail (spec: "지원되지 않는 경우 버튼을 숨기거나 적절한 안내"). */
export function isVideoExternalOpenSupported(): boolean {
  return !!window.martialdex?.openVideo || !!window.martialdex?.revealVideo || isNativeAndroidRecordingAvailable();
}

/**
 * "갤러리로 저장" — unlike the two actions above (which never touch the
 * file), this makes an explicit COPY into the device's real Gallery/Photos
 * library so the clip actually appears in the Gallery app's own grid — the
 * thing openVideoInGallery can't do without moving/duplicating the file.
 * The app-internal original and its 촬영 목록 entry are left untouched; this
 * only ever ADDS a second copy the user explicitly requested by tapping the
 * button. Android-only by design (Electron/web have no comparable "device
 * photo library" concept to copy into) — the list UI hides this button
 * everywhere else rather than showing one that always reports unsupported.
 */
// Copying a 60분+ clip (hundreds of MB to a few GB) genuinely takes a while
// — the fix for "너무 느리고 진행상황도 표시가 안돼서" is two-part: the native
// side now uses a 1MB copy buffer instead of 8KB (see SparringCameraPlugin.
// java's copyStreamWithProgress doc comment — most of the reported slowness
// was per-call JNI/syscall overhead from the old tiny buffer, not raw disk
// throughput), and it emits a "galleryProgress" event as it goes so the
// caller can show a real percentage instead of a static "저장 중...".
export async function saveVideoToDeviceGallery(video: SparringVideo, onProgress?: (percent: number) => void): Promise<VideoActionResult> {
  if (!isNativeAndroidRecordingAvailable()) return UNSUPPORTED;
  let listenerHandle: Awaited<ReturnType<typeof SparringCamera.addListener>> | null = null;
  try {
    if (onProgress) {
      // Only one save-to-gallery run is ever in flight per VideoCard (the
      // button disables itself while saving — see SparringVideoList.tsx),
      // so there's no need to match events against a specific filePath here.
      listenerHandle = await SparringCamera.addListener('galleryProgress', (e) => onProgress(e.percent));
    }
    return await SparringCamera.saveToGallery({ filePath: video.localUri });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '갤러리에 저장하는 중 오류가 발생했습니다.' };
  } finally {
    await listenerHandle?.remove();
  }
}

/** Whether saveVideoToDeviceGallery has any chance of working — Android-only, see that function's doc comment. */
export function isSaveToGallerySupported(): boolean {
  return isNativeAndroidRecordingAvailable();
}

// 60 minutes — spec's explicit hard cutoff (section 2/5). Duration alone
// decides whether a <video> is even attempted; anything at/under this still
// gets a real preview attempt, which itself falls back reactively on an
// actual load/decode failure (see SparringVideoList.tsx's VideoPreview
// component) — this constant only covers the "too long, don't even try"
// half of the decision, not the "attempted but failed" half.
export const MAX_PREVIEWABLE_DURATION_SECONDS = 60 * 60;

export function isDurationPreviewable(durationSeconds: number): boolean {
  return durationSeconds > 0 && durationSeconds <= MAX_PREVIEWABLE_DURATION_SECONDS;
}

/** Human-readable file size — undefined for records saved before fileSizeBytes existed (pre-existing data, never backfilled by re-statting the file). */
export function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) return '크기 확인 불가';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)}MB`;
  return `${(mb / 1024).toFixed(2)}GB`;
}
