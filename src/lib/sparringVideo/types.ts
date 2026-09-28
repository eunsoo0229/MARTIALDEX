// A recorded video's METADATA only — never the binary itself, same
// principle as every other local-first entity in this codebase (see
// trainingHistory/curriculum/nutrition repositories). The actual video file
// lives on disk (Electron userData dir) or in Capacitor's native Filesystem
// (Directory.Data); `localUri` is a platform-specific reference/path the UI
// resolves into a playable src at render time (see camera.ts/service.ts).
export type CameraFacing = 'user' | 'environment';
export type CameraMode = 'single' | 'dual';

export interface SparringVideo {
  id: string;
  createdAt: string; // ISO timestamp
  durationSeconds: number;
  cameraMode: CameraMode;
  /** Which camera this specific file came from — for a dual-mode pair, one 'user' + one 'environment' row share the same pairId below. */
  facing: CameraFacing;
  /** Platform-specific reference to the actual file — an Electron absolute path, or a Capacitor Filesystem URI. Never a blob/data URL (those don't survive a restart). */
  localUri: string;
  /** Small base64 JPEG captured from the first frame, for the video list thumbnail — kept tiny (not the full video) so repository JSON stays cheap to read/write like every other local-first entity here. */
  thumbnailDataUrl?: string;
  /** Present only on one of a dual-camera pair's two rows — links them together in the UI. Absent for single-camera recordings. */
  pairId?: string;
  /**
   * Optional back-reference to whatever training/sparring context this was
   * recorded during — "TrainingSession → SparringVideo[]" from the UI's
   * perspective is implemented as this reverse pointer (see
   * listSparringVideosForEntry()/listSparringVideosForSession() in
   * service.ts) rather than a forward array on TrainingHistoryEntry/
   * SparringSession, so neither of those existing, sensitive core types
   * needs to change at all.
   */
  linkedTrainingEntryId?: string;
  linkedSparringSessionId?: string;
  notes?: string | null;
  /**
   * Non-destructive trim range (seconds, within [0, durationSeconds]) — the
   * original file on disk is never re-encoded/shortened (this app has no
   * video-encoding pipeline, and bundling one — e.g. ffmpeg — just for this
   * would be a heavy, fragile addition for a feature players can implement
   * by simply respecting these two numbers). Both null/absent means "use
   * the full clip". Playback (SparringVideoList's "재생") seeks to
   * trimStartSec on load and stops at trimEndSec.
   */
  trimStartSec?: number | null;
  trimEndSec?: number | null;
  /**
   * Exact file size in bytes, captured once at save time (see storage.ts's
   * saveVideoBlob/service.ts's saveNativeRecording) — optional and additive
   * on purpose: every SparringVideo saved before this field existed simply
   * has it `undefined`, which the video-list UI treats as "크기 확인 불가"
   * rather than crashing or needing a migration. Never recomputed by
   * re-reading the file later (would defeat the point of not touching old
   * files at all).
   */
  fileSizeBytes?: number;
}

/** Structured for future MediaPipe integration (see poseEstimator.ts) — not used by this phase, just here so a later feature can attach a saved analysis run's id per the "구조화만 수행" scope. */
export interface SparringVideoAnalysisLink {
  videoId: string;
  poseAnalysisRecordId: string;
}
