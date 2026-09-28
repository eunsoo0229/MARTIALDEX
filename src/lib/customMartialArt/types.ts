/** A real source page actually returned by Tavily and actually cited as evidence — never fabricated (see martialArtDiscovery/verification.ts). */
export interface WebEvidenceSource {
  title: string;
  url: string;
  /** Short excerpt/paraphrase of what in the source actually supports the verdict — never invented. */
  snippet: string;
}

/**
 * A martial art the user added via "+ 무술 추가" (spec: MARTIALDEX 신규 무술
 * 추가 시스템), stored in the SHARED public Supabase table `custom_martial_arts`
 * (migration 0031) — same "shared, not per-user" shape/rationale as
 * AddTeqRecord (addTeq/types.ts): once one user adds "우슈", every other
 * user must be able to see and use it, not just the person who added it.
 * The 9 official martial arts (data/processed/*.json) are NEVER touched —
 * this is purely additive, a parallel registry merged into
 * getUnifiedMartialArtSummaries() (userTechniques/service.ts) at read time.
 */
export interface CustomMartialArt {
  id: string;
  nameKo: string;
  nameEn: string | null;
  /** Web-research-derived summary (spec section 9's "설명") — never AI prior-knowledge prose; built from the same evidence in `sources`. */
  description: string;
  /** Only ever 'ai_web_research' today — a literal union (not a bare flag) so a future manually-curated addition path, if ever built, can be distinguished without a schema change. */
  source: 'ai_web_research';
  /** Always true — a CustomMartialArt row is only ever created after verification passes (spec section 8's "웹 근거 부족 시 등록 금지"); there is no "unverified" row in this table. */
  verified: true;
  verifiedAt: string;
  /** The user who ran the verification/registration — null only if verification somehow ran while logged out (registration itself requires login, per the shared-table RLS). */
  addedBy: string | null;
  /** Real Tavily-sourced evidence the verification verdict was based on (spec section 9's "확인된 출처") — never fabricated URLs. */
  sources: WebEvidenceSource[];
  createdAt: string;
  updatedAt: string;
}
