// Provider-agnostic YouTube search types — mirrors src/lib/ai/types.ts's
// shape so the two-transport pattern (Electron IPC vs Supabase Edge
// Function) stays consistent across both features.

export interface VideoSearchItem {
  videoId: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
}

export type VideoSearchErrorCode = 'NETWORK' | 'UNAUTHORIZED' | 'EMPTY_RESPONSE' | 'UNKNOWN';

export type VideoSearchOutcome =
  | { ok: true; results: VideoSearchItem[] }
  | { ok: false; code: VideoSearchErrorCode; message: string };

/** Real metadata of ONE YouTube video, read from its public watch page (never invented). */
export interface VideoInfo {
  videoId: string;
  title: string;
  channel: string;
  description: string;
  lengthSeconds: number;
  keywords: string[];
  category: string | null;
  playable: boolean;
  /** True when only a search-result excerpt of the description was available (web transport fallback) — the verifier is told it is partial. */
  descriptionIsExcerpt?: boolean;
}

export type VideoInfoOutcome = { ok: true; info: VideoInfo } | { ok: false; code: VideoSearchErrorCode; message: string };
