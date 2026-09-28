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
