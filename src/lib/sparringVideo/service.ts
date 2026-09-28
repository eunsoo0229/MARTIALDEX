import type { CameraFacing, CameraMode, SparringVideo } from './types';
import { sparringVideoRepository } from './repository';
import { saveVideoBlob, deleteVideoFile, resolvePlayableSrc } from './storage';

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function listAllSparringVideos(): SparringVideo[] {
  return sparringVideoRepository.list();
}

export function getSparringVideo(id: string): SparringVideo | undefined {
  return sparringVideoRepository.get(id);
}

/** The "TrainingSession → SparringVideo[]" query from the plan — implemented as a reverse lookup so TrainingHistoryEntry itself never needs a forward array field. */
export function listSparringVideosForEntry(trainingEntryId: string): SparringVideo[] {
  return sparringVideoRepository.list().filter((v) => v.linkedTrainingEntryId === trainingEntryId);
}

export function listSparringVideosForSparringSession(sparringSessionId: string): SparringVideo[] {
  return sparringVideoRepository.list().filter((v) => v.linkedSparringSessionId === sparringSessionId);
}

export { resolvePlayableSrc };

export interface SaveRecordingInput {
  blob: Blob;
  facing: CameraFacing;
  cameraMode: CameraMode;
  durationSeconds: number;
  thumbnailDataUrl?: string;
  pairId?: string;
  linkedTrainingEntryId?: string;
  linkedSparringSessionId?: string;
  notes?: string | null;
}

/** Persists one just-recorded clip (called only after the user explicitly taps "저장" on the post-recording preview — never automatically) and records its metadata. */
export async function saveRecording(input: SaveRecordingInput): Promise<{ ok: true; video: SparringVideo } | { ok: false; message: string }> {
  const id = newId();
  const saved = await saveVideoBlob(id, input.blob);
  if (!saved.ok) return saved;

  const video: SparringVideo = {
    id,
    createdAt: new Date().toISOString(),
    durationSeconds: input.durationSeconds,
    cameraMode: input.cameraMode,
    facing: input.facing,
    localUri: saved.localUri,
    thumbnailDataUrl: input.thumbnailDataUrl,
    pairId: input.pairId,
    linkedTrainingEntryId: input.linkedTrainingEntryId,
    linkedSparringSessionId: input.linkedSparringSessionId,
    notes: input.notes ?? null,
    fileSizeBytes: saved.fileSizeBytes,
  };
  sparringVideoRepository.add(video);
  return { ok: true, video };
}

/**
 * Deletes both the 촬영 목록 record AND the underlying video file — never
 * touches any separate "갤러리로 저장" MediaStore copy (see gallery.ts's
 * saveVideoToDeviceGallery), since that's an independent export this record
 * carries no reference to at all.
 *
 * The record is only removed once the file is actually confirmed gone (or
 * was already gone). If the real deletion fails, the record is kept and the
 * failure is reported honestly instead of the previous behavior — silently
 * discarding the error and removing the record either way, which made a
 * failed delete indistinguishable from a successful one and could leave an
 * orphaned file on disk forever with zero trace.
 */
export async function deleteSparringVideo(id: string): Promise<{ ok: boolean; message?: string }> {
  const video = sparringVideoRepository.get(id);
  if (!video) return { ok: true }; // already gone — same end state, nothing to report as a failure
  const result = await deleteVideoFile(video.localUri);
  if (!result.ok) return result;
  sparringVideoRepository.remove(id);
  return { ok: true };
}

export function updateSparringVideoNotes(id: string, notes: string): SparringVideo | undefined {
  return sparringVideoRepository.update(id, { notes: notes.trim() || null });
}

export interface SaveNativeRecordingInput {
  /** Absolute on-device path the native SparringCamera plugin already wrote the file to (see BackgroundRecordingService.java) — nothing left to upload/encode here, only the metadata record needs creating. */
  filePath: string;
  facing: CameraFacing;
  durationSeconds: number;
  linkedTrainingEntryId?: string;
  linkedSparringSessionId?: string;
  notes?: string | null;
  /** From SparringCameraStopResult.fileSizeBytes (the Java side reads File.length() right after the recorder finalizes) — optional because older callers/tests may omit it; absent just means the list UI shows "크기 확인 불가", same as any other pre-existing record. */
  fileSizeBytes?: number;
}

/** Counterpart to saveRecording() for clips captured by the native Android foreground-service camera (SparringCamera plugin) instead of getUserMedia — the file is already on disk, so this only persists metadata. Always cameraMode 'single': the native path holds one camera at a time (see nativeCameraPlugin.ts). */
export function saveNativeRecording(input: SaveNativeRecordingInput): { ok: true; video: SparringVideo } {
  const id = newId();
  const video: SparringVideo = {
    id,
    createdAt: new Date().toISOString(),
    durationSeconds: input.durationSeconds,
    cameraMode: 'single',
    facing: input.facing,
    localUri: input.filePath,
    linkedTrainingEntryId: input.linkedTrainingEntryId,
    linkedSparringSessionId: input.linkedSparringSessionId,
    notes: input.notes ?? null,
    fileSizeBytes: input.fileSizeBytes,
  };
  sparringVideoRepository.add(video);
  return { ok: true, video };
}

/** Best-effort thumbnail attach after the fact (native recordings have no live <video> frame to grab from during capture — see SparringRecord.tsx's native branch, which calls this once it can load the saved file into an offscreen <video>). A no-op target id (already deleted) is fine — update() just returns undefined. */
export function updateSparringVideoThumbnail(id: string, thumbnailDataUrl: string): SparringVideo | undefined {
  return sparringVideoRepository.update(id, { thumbnailDataUrl });
}

/** Sets/clears the non-destructive trim range — see SparringVideo.trimStartSec/trimEndSec. Pass nulls to reset to the full clip. */
export function setSparringVideoTrim(id: string, trimStartSec: number | null, trimEndSec: number | null): SparringVideo | undefined {
  return sparringVideoRepository.update(id, { trimStartSec, trimEndSec });
}

/** Best-effort — only does anything on Electron (Finder/Explorer "파일 위치 열기"); a no-op everywhere else. */
export function revealSparringVideoFile(localUri: string): void {
  window.martialdex?.revealVideo?.(localUri);
}
