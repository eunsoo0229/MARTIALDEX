// AI 코치 선택 — which coach runs a lesson. Chosen by the user before every
// lesson (coachPicker), stored ON the lesson session, and used to route every
// language-model call of that lesson:
//   'martialdex' : MARTIALDEX 자체 AI 코치 — technique data + deterministic lesson
//                  engine; the local Ollama model only rewords grounded answers.
//                  Never calls Gemini (no silent fallback).
//   'gemini'     : the existing Gemini coach, unchanged paths.
// Sessions saved before this choice existed have no coach: they read as
// 'unknown' — never guessed to be Gemini.

export type CoachKind = 'martialdex' | 'gemini';
export type StoredCoachKind = CoachKind | 'unknown';

export const COACH_LABEL: Record<StoredCoachKind, string> = {
  martialdex: 'MARTIALDEX 자체 AI 코치',
  gemini: 'Gemini AI 코치',
  unknown: '코치 정보 없음 (이전 수업)',
};

export function isCoachKind(v: unknown): v is CoachKind {
  return v === 'martialdex' || v === 'gemini';
}

/** The coach recorded on a session / record — 'unknown' when it predates the choice (or is malformed). */
export function coachKindOf(x: { coachKind?: unknown } | null | undefined): StoredCoachKind {
  return isCoachKind(x?.coachKind) ? x!.coachKind as CoachKind : 'unknown';
}

/** Local model status as reported by the Electron main process (electron/ollama.cjs). */
export interface LocalModelStatus {
  ok: boolean;
  running: boolean;
  model: string | null;
  models: string[];
  reason: 'NOT_RUNNING' | 'MODEL_MISSING' | 'BAD_RESPONSE' | 'UNKNOWN' | 'UNSUPPORTED_PLATFORM' | null;
}

export interface LocalAskRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
  json?: boolean;
  /** Time budget for this request (main process clamps it to 5–120 s). */
  timeoutMs?: number;
  /** Lets the renderer cancel it while the student waits. */
  requestId?: string;
}

export type LocalAskResult =
  | { ok: true; text: string; model: string; evalCount: number; ms: number; attempts?: number }
  | { ok: false; code: string; message: string };
