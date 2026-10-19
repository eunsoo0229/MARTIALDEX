// Types for the Mac app's local speech-recognition bridge (electron/localStt.cjs via preload).

export interface LocalSttModelInfo {
  id: string;
  label: string;
  sizeBytes: number;
  downloaded: boolean;
}

export interface LocalSttStatus {
  /** The whisper-server binary is bundled in this build. */
  engineAvailable: boolean;
  model: string;
  models: LocalSttModelInfo[];
  downloaded: boolean;
  /** A leftover incomplete file (an interrupted download). */
  partial: boolean;
  sizeBytes: number;
  /** Where the model file lives on this Mac. */
  path: string;
  downloading: string | null;
  serverRunning: boolean;
}

export type LocalSttFailure = { ok: false; code: string; message: string };

export interface LocalSttApi {
  status: (model?: string) => Promise<LocalSttStatus>;
  download: (model?: string) => Promise<{ ok: true } | LocalSttFailure>;
  cancelDownload: () => Promise<boolean>;
  deleteModel: (model?: string) => Promise<LocalSttStatus>;
  warmUp: (model?: string) => Promise<{ ok: true } | LocalSttFailure>;
  transcribe: (wav: Uint8Array, opts?: { model?: string; prompt?: string; audioCtx?: number }) => Promise<{ ok: true; text: string } | LocalSttFailure>;
  onDownloadProgress: (cb: (p: { model: string; received: number; total: number }) => void) => () => void;
}
