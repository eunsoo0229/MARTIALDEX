import type { DiscoveryOutcome } from './types';
import type { UserTechniqueRecord } from '../userTechniques/types';
import { findNormalizedDuplicate, normalizeTechniqueName, runDuplicateStage, runVerificationStage, saveUserTechnique } from '../userTechniques/service';
import { pullAddTeqFromCloud, insertAddTeqTechnique } from '../addTeq/service';
import { withGiNoGi } from '../grappling/analyzeNewTechnique';
import type { AddTeqRecord } from '../addTeq/types';
import { martialArtSummaries } from '../loadData';
import { MMA_SOURCE_MARTIAL_ARTS } from '../mmaCurriculum/types';
import { videoSearchProvider } from '../videoSearch/provider';

// Per-process cache so one combo-generation request never re-runs the same
// AI duplicate/verification calls twice for the same phrase+martial art
// (spec section 23/10 — "동일 기술 재조사 방지"). Intentionally NOT persisted —
// a fresh session should always be free to re-evaluate, and the underlying
// technique library itself (searched first, below) is the real dedup layer
// across sessions, not this cache.
const inFlightCache = new Map<string, Promise<DiscoveryOutcome>>();

const VALID_REAL_MARTIAL_ART_IDS = new Set([...martialArtSummaries.map((a) => a.id), ...MMA_SOURCE_MARTIAL_ARTS]);

/** verifyTechnique's martialArtConfirmed is freeform AI text (could be
 * "Boxing", "복싱", the id itself, ...) — only ever used to CORRECT the
 * martial art a discovered technique gets filed under when it confidently
 * names a real known id/nameKo/nameEn different from the caller's own hint
 * (useful for cross-discipline callers like 선수 스타일, which has no single
 * martial art to pass in); never trusted blindly, never allowed to
 * introduce an unknown id. */
function resolveConfirmedMartialArt(confirmed: string | null, fallbackHint: string): string {
  if (!confirmed) return fallbackHint;
  const norm = confirmed.trim().toLowerCase();
  if (VALID_REAL_MARTIAL_ART_IDS.has(confirmed.trim())) return confirmed.trim();
  const byName = martialArtSummaries.find((a) => a.nameKo.toLowerCase() === norm || (a.nameEn ?? '').toLowerCase() === norm);
  return byName ? byName.id : fallbackHint;
}

/**
 * Best-effort, never-blocking live video search for a genuinely new
 * technique record — mirrors RequestTechnique.tsx's manual "기술 추가" flow
 * (same query shape, same videoSearchProvider, same CuratedVideo mapping),
 * just with no human to click a radio button: since there's no reviewer in
 * this automated path, the single TOP-ranked real result is taken as-is
 * (never fabricated — it's exactly what videoSearchProvider's own YouTube
 * search returned for this technique's name) rather than inventing a
 * relevance-scoring scheme that doesn't exist anywhere else in the app. A
 * failed/empty search silently leaves `videos: []`, exactly the same
 * "video is optional, never blocks registration" policy the manual flow
 * already follows (spec section 9 — "새 규칙을 임의로 만들지 말고 기존 정책을
 * 따른다").
 */
async function attachDiscoveredVideo(record: UserTechniqueRecord): Promise<{ record: UserTechniqueRecord; videoAttached: boolean }> {
  const query = record.technique.youtubeSearchQuery;
  if (!query) return { record, videoAttached: false };
  try {
    const outcome = await videoSearchProvider.search(query);
    if (!outcome.ok || outcome.results.length === 0) return { record, videoAttached: false };
    const top = outcome.results[0];
    return {
      record: { ...record, technique: { ...record.technique, videos: [{ title: top.title, videoId: top.videoId, channel: top.channel }] } },
      videoAttached: true,
    };
  } catch {
    return { record, videoAttached: false };
  }
}

/**
 * Registers a fully-built (verified, already-generated) technique record —
 * the single place that decides WHERE a newly-discovered technique lives:
 * the shared Supabase `add_teq` library when the caller is logged in (spec
 * section 2/15 — every other user must be able to resolve the same
 * techniqueId), or the existing local-only `user_techniques` path when
 * logged out (spec section 16 — that path is never removed). Shared by
 * discoverTechnique() below AND RequestTechnique.tsx's own manual
 * "등록하기" button, so this branch exists in exactly one place.
 */
export async function registerDiscoveredTechnique(record: UserTechniqueRecord, userId: string | null): Promise<{ id: string; techniqueName: string }> {
  // Grappling techniques get their Gi / No-Gi split researched before saving (add_teq rows can't be updated later).
  record = { ...record, technique: await withGiNoGi(record.technique) };
  if (!userId) {
    const saved = saveUserTechnique(record, null);
    return { id: saved.id, techniqueName: saved.technique.name };
  }

  const addTeqRecord: AddTeqRecord = {
    id: record.id,
    technique: record.technique,
    // Propagates the record's own status (set by runVerificationStage —
    // 'approved' the moment it passes the Google Search grounding gate,
    // since that gate IS the review; there is no separate manual/admin
    // approval step this app ever runs) rather than re-deciding it here.
    status: record.status,
    duplicateCheck: record.duplicateCheck,
    verification: record.verification,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
  const inserted = await insertAddTeqTechnique(addTeqRecord);
  if (inserted.ok) return { id: addTeqRecord.id, techniqueName: addTeqRecord.technique.name };

  // Supabase insert failed (offline, RLS misconfiguration, etc.) — fall
  // back to the local-only path rather than losing the discovery entirely;
  // still usable by THIS user/session immediately via resolveTechnique.
  const saved = saveUserTechnique(record, userId);
  return { id: saved.id, techniqueName: saved.technique.name };
}

/**
 * Resolves a free-text technique name to a real technique_id, following
 * the pipeline spec section 4 requires: official 1,253 -> shared add_teq
 * library -> this user's own user_techniques -> (only if still not found)
 * Google Search grounding -> verify it's real -> generate its record ->
 * second duplicate check -> register into add_teq (or user_techniques when
 * logged out) -> return its real id. Never fabricates an id — a phrase
 * that doesn't resolve and can't be verified returns `techniqueId: null`.
 */
export async function discoverTechnique(input: {
  name: string;
  martialArt: string;
  description?: string;
  userId: string | null;
}): Promise<DiscoveryOutcome> {
  const cacheKey = `${input.martialArt}::${normalizeTechniqueName(input.name)}`;
  const cached = inFlightCache.get(cacheKey);
  if (cached) return cached;

  const promise = discoverTechniqueUncached(input);
  inFlightCache.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    // Only cache for the duration of the in-flight call — see comment above.
    inFlightCache.delete(cacheKey);
  }
}

async function discoverTechniqueUncached(input: {
  name: string;
  martialArt: string;
  description?: string;
  userId: string | null;
}): Promise<DiscoveryOutcome> {
  // 1) Cheap, exhaustive normalized-name match first — zero API cost.
  // Catches the overwhelming majority of real requests ("Double Leg",
  // "Armbar", ...) since they're already in the 1,253+ official
  // techniques, the shared add_teq library, or this user's own additions —
  // and, being limit-free (unlike a ranked search call), it can never be
  // crowded out by unrelated fuzzy matches (spec [문제 2]).
  const exact = findNormalizedDuplicate(input.name);
  if (exact) {
    return {
      techniqueId: exact.id,
      status: 'existing',
      techniqueName: exact.name,
      reason: `기존 기술 '${exact.name}'과 이름이 일치합니다.`,
      usedInternetResearch: false,
      videoAttached: false,
    };
  }

  // 1b) Refresh the local add_teq cache before concluding "not found" —
  // catches a technique another user/device registered since the last
  // pull (spec section 2's "사용자 B가 검색 -> 동일 techniqueId"). Only
  // possible when logged in (RLS requires an authenticated session to read
  // add_teq); a logged-out session simply proceeds without this refresh,
  // same as today.
  if (input.userId) {
    await pullAddTeqFromCloud();
    const exactAfterRefresh = findNormalizedDuplicate(input.name);
    if (exactAfterRefresh) {
      return {
        techniqueId: exactAfterRefresh.id,
        status: 'existing',
        techniqueName: exactAfterRefresh.name,
        reason: `기존 기술 '${exactAfterRefresh.name}'과 이름이 일치합니다.`,
        usedInternetResearch: false,
        videoAttached: false,
      };
    }
  }

  // 2) AI duplicate check — catches aliases/translations/abbreviations exact
  // substring search misses (e.g. "RNC" -> "Rear Naked Choke"). Candidates
  // now come from official + add_teq + user_techniques (duplicateCheck.ts
  // was updated to search all three). Only calls Gemini when at least one
  // plausible candidate exists to compare against.
  const dup = await runDuplicateStage({ name: input.name, martialArt: input.martialArt, description: input.description });
  if (!dup.ok) {
    return { techniqueId: null, status: 'not_found', techniqueName: null, reason: dup.message, usedInternetResearch: false, videoAttached: false };
  }
  if (dup.duplicate.isDuplicate && dup.duplicate.matchedTechniqueId) {
    return {
      techniqueId: dup.duplicate.matchedTechniqueId,
      status: 'existing',
      techniqueName: dup.duplicate.matchedTechniqueName,
      reason: dup.duplicate.reason,
      usedInternetResearch: false,
      videoAttached: false,
    };
  }

  // 3) Not found anywhere — research on the internet (Google Search
  // grounding, already wired into verifyTechnique), verify it's real, and
  // generate the full record in the same schema every technique already
  // uses. This stage also re-checks for duplicates (across all three
  // sources) against the AI's own canonical name.
  const verification = await runVerificationStage({ name: input.name, martialArt: input.martialArt, description: input.description });
  if (!verification.ok) {
    return { techniqueId: null, status: 'not_found', techniqueName: null, reason: verification.message, usedInternetResearch: false, videoAttached: false };
  }
  if (!verification.accepted) {
    if ('duplicate' in verification && verification.duplicate.matchedTechniqueId) {
      return {
        techniqueId: verification.duplicate.matchedTechniqueId,
        status: 'existing',
        techniqueName: verification.duplicate.matchedTechniqueName,
        reason: verification.message,
        usedInternetResearch: verification.verification.usedSearchGrounding,
        videoAttached: false,
      };
    }
    return {
      techniqueId: null,
      status: 'not_found',
      techniqueName: null,
      reason: verification.message,
      usedInternetResearch: verification.verification.usedSearchGrounding,
      videoAttached: false,
    };
  }

  // Genuinely new — let the AI's own confirmed martial art correct the
  // filing category when it confidently names a different real one than
  // the caller's hint (useful for cross-discipline callers like 선수
  // 스타일, which has no single martial art to pass in). Then register it:
  // shared add_teq when logged in, local user_techniques when not (see
  // registerDiscoveredTechnique above). 'variant' vs wholly 'new' is read
  // off the SAME relatedTechniques field the encyclopedia already uses.
  const confirmedMartialArt = resolveConfirmedMartialArt(verification.verification.martialArtConfirmed, input.martialArt);
  const recordWithArt: UserTechniqueRecord = {
    ...verification.record,
    technique: { ...verification.record.technique, martialArt: confirmedMartialArt },
  };
  // Manual RequestTechnique.tsx flow already does a live video search +
  // attach at this exact point in its pipeline (spec section 9) — this
  // automated discovery path had never done the same, always persisting
  // videos: [] instead. Best-effort/never-blocking: registration proceeds
  // identically whether or not a real video is found.
  const { record, videoAttached } = await attachDiscoveredVideo(recordWithArt);
  const registered = await registerDiscoveredTechnique(record, input.userId);
  const isVariant = record.technique.relatedTechniques.length > 0;
  return {
    techniqueId: registered.id,
    status: isVariant ? 'variant' : 'new',
    techniqueName: registered.techniqueName,
    reason: verification.verification.reason,
    usedInternetResearch: verification.verification.usedSearchGrounding,
    videoAttached,
  };
}
