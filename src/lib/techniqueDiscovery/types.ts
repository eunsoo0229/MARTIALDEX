// Technique Discovery Service — a thin, reusable orchestration layer over
// the existing src/lib/userTechniques/ pipeline (checkDuplicate ->
// verifyTechnique w/ Google Search grounding -> generateTechniqueRecord ->
// second checkDuplicate -> saveUserTechnique). Nothing here reimplements
// that pipeline; it only decides WHEN to call it and what to do with the
// result, so any feature that needs "give me a real technique_id for this
// name, searching the internet and registering a new technique if truly
// necessary" (AI combo generation today, AI curriculum/선수 스타일 later)
// can call one function instead of re-deriving this flow.

export type DiscoveryStatus = 'existing' | 'variant' | 'new' | 'not_found';

export interface DiscoveryOutcome {
  techniqueId: string | null;
  /**
   * 'existing' — resolved to an already-known technique (official or
   * previously user-added), no AI registration involved.
   * 'variant' — a genuinely new technique was registered, but it turned out
   * to be closely related to an existing one (its AI-generated
   * relatedTechniques ended up non-empty) — surfaced separately from 'new'
   * per spec section 9's 동일/변형/신규 3-way split, using the SAME
   * relatedTechniques field the encyclopedia already has rather than a new
   * relationship structure.
   * 'new' — a genuinely new, unrelated technique was researched and registered.
   * 'not_found' — no existing match, and internet research + verification
   * did not confirm a real technique (insufficient evidence / fictional /
   * AI call failed) — callers must not invent a techniqueId in this case.
   */
  status: DiscoveryStatus;
  techniqueName: string | null;
  reason: string;
  usedInternetResearch: boolean;
  /** True only when status is 'new'/'variant' AND a real video-search result was found and persisted into the record's `technique.videos` before registration — never true for a fabricated/guessed video, and always false (not merely absent) when no result was found. */
  videoAttached: boolean;
}
