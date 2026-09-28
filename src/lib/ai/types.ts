// Provider-agnostic chat types shared between the UI, the in-memory chat
// store, and whichever AI provider is wired up in electron/main.cjs. Nothing
// here mentions Gemini by name — swapping providers later should only mean
// writing a new provider.ts, not touching this file or the UI.

export type ChatRole = 'user' | 'model';

export interface ChatMessage {
  role: ChatRole;
  text: string;
}

export type AiErrorCode =
  | 'NO_API_KEY'
  | 'INVALID_API_KEY'
  | 'RATE_LIMIT'
  | 'NETWORK'
  | 'EMPTY_RESPONSE'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface AiImagePart {
  /** e.g. "image/jpeg" — Gemini's inlineData.mimeType. */
  mimeType: string;
  /** Base64-encoded image bytes WITHOUT the "data:image/...;base64," prefix. */
  data: string;
}

export interface AskAiRequest {
  systemInstruction: string;
  contextText: string;
  history: ChatMessage[];
  question: string;
  /** Enables Gemini's Google Search grounding tool (real web lookups instead of model-only knowledge) — see 기술 추가 요청's verification step. Requires a Gemini plan/quota that includes grounding; falls through as a normal (ungrounded) call's error otherwise. */
  useSearchGrounding?: boolean;
  /** Attached to the final (question) turn's parts — see 음식 사진 분석 (nutrition/aiPhotoAnalysis.ts). Supported identically on Electron (electron/gemini.cjs) and Android (supabase/functions/gemini-ask). Undefined/empty for every existing text-only caller — fully additive. */
  imageParts?: AiImagePart[];
}

export type AskAiResult =
  // webSearchQueries: Gemini's own groundingMetadata.webSearchQueries — the
  // REAL query strings its search tool issued for a useSearchGrounding call,
  // when the API reports them. Used by aiCurriculum/techniqueResearch.ts to
  // show the user what was actually searched (never fabricated/guessed —
  // absent/empty when the API doesn't report it, not backfilled with the
  // request's own planned queries).
  | { ok: true; text: string; groundingSources?: GroundingSource[]; webSearchQueries?: string[] }
  | { ok: false; code: AiErrorCode; message: string };
