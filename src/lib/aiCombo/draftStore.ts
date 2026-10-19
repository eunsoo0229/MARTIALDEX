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

const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/**
 * A draft saved by an earlier version can lack fields added since (e.g.
 * analysis.pros / cautions) — the screen reads `.length` on them, so missing
 * lists are filled with [] here. A preview without its results is dropped
 * (the request text is kept) rather than crashing the page.
 */
export function normalizeAiComboDraft(raw: unknown): AiComboDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<AiComboDraft>;
  const p = d.preview as Partial<ComboGenerationPreview> | null | undefined;
  let preview: ComboGenerationPreview | null = null;
  if (p && typeof p === 'object' && Array.isArray(p.results) && p.analysis && typeof p.analysis === 'object') {
    const a = p.analysis as ComboGenerationPreview['analysis'];
    preview = {
      ...(p as ComboGenerationPreview),
      results: p.results.filter((r) => r && typeof r === 'object' && r.step),
      complementaryFollowUps: list(p.complementaryFollowUps),
      alternativeTechniques: list(p.alternativeTechniques),
      analysis: {
        ...a,
        summary: typeof a.summary === 'string' ? a.summary : '',
        steps: list(a.steps),
        pros: list(a.pros),
        cautions: list(a.cautions),
        prerequisiteTechniques: list(a.prerequisiteTechniques),
        connectingTechniques: list(a.connectingTechniques),
        complementaryFollowUps: list(a.complementaryFollowUps),
        alternativeTechniques: list(a.alternativeTechniques),
      },
    };
  }
  return {
    freeText: typeof d.freeText === 'string' ? d.freeText : '',
    martialArt: typeof d.martialArt === 'string' ? d.martialArt : '',
    preview,
    errorMessage: typeof d.errorMessage === 'string' ? d.errorMessage : null,
  };
}

export function readAiComboDraft(): AiComboDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? normalizeAiComboDraft(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeAiComboDraft(draft: AiComboDraft | null) {
  if (draft) window.localStorage.setItem(KEY, JSON.stringify(draft));
  else window.localStorage.removeItem(KEY);
}
