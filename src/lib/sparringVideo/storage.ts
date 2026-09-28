import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

// Platform-specific persistence for one recorded video Blob — mirrors the
// window.martialdex?.method feature-detection idiom already used for
// Electron-vs-web branching elsewhere (src/lib/externalLink.ts), extended
// with a Capacitor-native branch. Returns a `localUri` string (see
// SparringVideo.localUri) whose exact shape depends on which branch wrote
// it; resolvePlayableSrc() below is the one place that knows how to turn
// any of the three shapes back into a usable <video src>.
const SPARRING_VIDEOS_DIR = 'sparring-videos';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // "data:video/webm;base64,AAAA..." -> just the base64 payload.
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function saveVideoBlob(
  id: string,
  blob: Blob
): Promise<{ ok: true; localUri: string; fileSizeBytes: number } | { ok: false; message: string }> {
  // blob.size is the exact byte count of the actual video data BEFORE
  // base64 encoding — the same number of bytes every branch below ends up
  // writing to disk (base64 is just an encoding for transport, decoded back
  // to the identical byte count on the Electron/native side), so this one
  // read is accurate for every persisted branch without asking the OS to
  // stat the file back afterward.
  const fileSizeBytes = blob.size;

  if (window.martialdex?.saveVideo) {
    const base64Data = await blobToBase64(blob);
    const result = await window.martialdex.saveVideo(id, base64Data);
    if (!result.ok) return { ok: false, message: result.message };
    return { ok: true, localUri: result.path, fileSizeBytes };
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const base64Data = await blobToBase64(blob);
      await Filesystem.mkdir({ path: SPARRING_VIDEOS_DIR, directory: Directory.Data, recursive: true }).catch(() => {
        // Already exists — mkdir with recursive:true on an existing dir can
        // still reject on some platforms; safe to ignore and proceed.
      });
      const result = await Filesystem.writeFile({
        path: `${SPARRING_VIDEOS_DIR}/${id}.webm`,
        data: base64Data,
        directory: Directory.Data,
      });
      return { ok: true, localUri: result.uri, fileSizeBytes };
    } catch {
      return { ok: false, message: '영상 저장 중 오류가 발생했습니다.' };
    }
  }

  // Plain web/dev fallback — no persistent storage API available, so the
  // clip only survives for this session (an Object URL). Callers should
  // treat this as best-effort; the video list UI explains this limitation
  // when neither of the above branches is available.
  return { ok: true, localUri: URL.createObjectURL(blob), fileSizeBytes };
}

/**
 * Deletes the actual video FILE this localUri points at (never the
 * "갤러리로 저장" MediaStore copy some other library/gallery app may hold —
 * that's a deliberately independent, user-requested export this function
 * has no reference to at all, see gallery.ts's saveVideoToDeviceGallery).
 *
 * Used to silently swallow every failure here and unconditionally remove
 * the SparringVideo record regardless of whether the file actually went
 * away (service.ts's deleteSparringVideo) — meaning a real deletion failure
 * (permission error, file locked, IPC hiccup) looked EXACTLY like success
 * to the user: the list entry vanished while the file quietly stayed on
 * disk forever, with no trace anywhere. Now returns a real result so the
 * caller can tell the difference and keep the record (with an honest error
 * message) instead of "losing" the file.
 */
export async function deleteVideoFile(localUri: string): Promise<{ ok: boolean; message?: string }> {
  if (window.martialdex?.deleteVideo) {
    try {
      return await window.martialdex.deleteVideo(localUri);
    } catch {
      return { ok: false, message: '영상 파일 삭제 요청을 보내는 중 오류가 발생했습니다.' };
    }
  }
  if (Capacitor.isNativePlatform()) {
    // localUri here is either a "file://..." URI (older getUserMedia +
    // Filesystem.writeFile recordings) or a raw absolute path (newer
    // CameraX foreground-service recordings, BackgroundRecordingService.java)
    // — both land under the SAME getFilesDir()/sparring-videos/ directory
    // (Directory.Data === getFilesDir()), so Filesystem's own delete wants
    // the relative path re-derived from either shape rather than requiring
    // a second stored field just for deletion.
    const marker = `${SPARRING_VIDEOS_DIR}/`;
    const idx = localUri.indexOf(marker);
    const relativePath = idx >= 0 ? localUri.slice(idx) : null;
    if (!relativePath) {
      return { ok: false, message: '삭제할 파일의 경로를 확인할 수 없습니다.' };
    }
    try {
      await Filesystem.deleteFile({ path: relativePath, directory: Directory.Data });
      return { ok: true };
    } catch (e) {
      // The file already being gone means the end state we actually want
      // (no file left behind) already holds — not a real failure, so the
      // record is still safe to remove. Everything else (permission/IO
      // error) is a genuine failure and must NOT be reported as success.
      const message = e instanceof Error ? e.message : String(e);
      if (/not exist|not found|no such file/i.test(message)) return { ok: true };
      return { ok: false, message: '영상 파일을 삭제하지 못했습니다.' };
    }
  }
  if (localUri.startsWith('blob:')) URL.revokeObjectURL(localUri);
  return { ok: true };
}

/** The one place that knows how to turn a stored `localUri` back into a `<video src>` the current platform can actually load. */
export function resolvePlayableSrc(localUri: string): string {
  if (window.martialdex) return `file://${localUri}`;
  if (Capacitor.isNativePlatform()) return Capacitor.convertFileSrc(localUri);
  return localUri; // already a blob: URL from the web fallback above
}
