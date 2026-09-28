import type { ComboGenerationPreview } from './types';

// Persists the in-progress "AI 목적 기반 콤비네이션 생성" result so it survives
// clicking into a resolved step's real technique detail page and back (spec
// section 25) — same reasoning/pattern as freeTraining/draftStore.ts.
const KEY = 'martialdex:ai-combo-draft';

export interface AiComboDraft {
  freeText: string;
  martialArt: string;
  preview: ComboGenerationPreview | null;
  errorMessage: string | null;
}

export function readAiComboDraft(): AiComboDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AiComboDraft) : null;
  } catch {
    return null;
  }
}

export function writeAiComboDraft(draft: AiComboDraft | null) {
  if (draft) window.localStorage.setItem(KEY, JSON.stringify(draft));
  else window.localStorage.removeItem(KEY);
}
