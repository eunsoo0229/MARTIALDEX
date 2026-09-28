import type { Technique } from '../../types';

export type UserTechniqueStatus = 'pending' | 'approved' | 'rejected';

export type VerificationVerdict = 'confirmed' | 'alias_of_existing' | 'uncertain' | 'fictional' | 'insufficient_evidence';

/**
 * Result of the "실제로 존재하는 기술인지" check (spec sections 3-5, 20).
 * Never treated as a green light on its own — see validator.ts's stricter
 * gate (confidence + evidence count) before anything is allowed to reach
 * the save step.
 */
export interface VerificationResult {
  verdict: VerificationVerdict;
  /** 0-100, the model's own stated confidence — a low number here rejects regardless of verdict label. */
  confidence: number;
  martialArtConfirmed: string | null;
  category: string | null;
  /**
   * The technique's standard/full name (English, matching how the
   * official encyclopedia names things) even when the user's input was an
   * abbreviation or a paraphrase (e.g. input "RNC" -> canonicalName "Rear
   * Naked Choke"). A plain text/candidate search for "RNC" itself never
   * surfaces "Rear Naked Choke" as a duplicate-check candidate (no textual
   * similarity), so runVerificationStage re-runs the duplicate check
   * against THIS name before ever generating/registering a new record —
   * the single fix for spec section 10's abbreviation-family dedup case.
   * Null only when the model has no better name than what was input.
   */
  canonicalName: string | null;
  /** Short descriptions of what evidence was found/checked — never fabricated URLs, just what the model says it found. */
  evidenceNotes: string[];
  /** Real citations, only present when Google Search grounding actually returned sources for this call. */
  groundingSources: { title: string; uri: string }[];
  /** Whether this call actually used live web search grounding, or fell back to the model's internal knowledge only. */
  usedSearchGrounding: boolean;
  reason: string;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchedTechniqueId: string | null;
  matchedTechniqueName: string | null;
  reason: string;
}

/**
 * A user-submitted technique. Wraps a fully normal `Technique` object (same
 * shape as the 1,253 official ones — spec section 8) plus moderation/
 * provenance metadata that lives OUTSIDE the shared Technique type so
 * official-technique code paths are never affected by this feature.
 */
export interface UserTechniqueRecord {
  id: string;
  technique: Technique;
  status: UserTechniqueStatus;
  /** null for a record created while logged out (local-only, not yet tied to an account). */
  addedByUserId: string | null;
  duplicateCheck: DuplicateCheckResult;
  verification: VerificationResult;
  createdAt: string;
  updatedAt: string;
}
