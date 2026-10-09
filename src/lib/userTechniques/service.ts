import type { MartialArtSummary, Technique } from '../../types';
import { allTechniques, getMartialArt, getTechnique, gymExercises, homeTrainingExercises, isSyntheticTrainingDomain, martialArtSummaries } from '../loadData';
import { HOME_TRAINING_MARTIAL_ART_ID } from '../homeTraining/library';
import { GYM_MARTIAL_ART_ID } from '../gymTraining/library';
import { searchTechniques, searchTechniquesAsync, type TechniqueFilters } from '../search';
import { userTechniqueRepository } from './repository';
import { generateUserTechniqueId } from './idGenerator';
import { checkDuplicate } from './duplicateCheck';
import { passesVerificationGate, verifyTechnique } from './verification';
import { generateTechniqueRecord } from './recordGenerator';
import type { DuplicateCheckResult, UserTechniqueRecord, VerificationResult } from './types';
import { addTeqRepository } from '../addTeq/repository';
import { customMartialArtRepository } from '../customMartialArt/repository';
import { isTechniqueInArt, libraryLinksOf, libraryTechniques, redirectedTechnique, techniqueCategoryInArt } from '../techniqueCanonical';

export function listMyUserTechniques(): UserTechniqueRecord[] {
  return userTechniqueRepository.list();
}

export function getUserTechnique(id: string): UserTechniqueRecord | undefined {
  return userTechniqueRepository.get(id);
}

/** Official-first lookup, then the shared add_teq library, then this
 * user's own local user_techniques — used anywhere a page needs to resolve
 * a technique that might not be official (TechniqueDetail, training
 * session, curriculum day rendering, combo, free training...). This is
 * the "통합 resolver" every AI feature and browsing screen now shares;
 * never changes the behavior of the existing `getTechnique` (official-only)
 * for callers that still use that directly. */
export function resolveTechnique(id: string): Technique | undefined {
  // Canonical first: an official merged-away id, a library record that
  // duplicated an official technique, or a link record all resolve to the
  // one canonical technique (techniqueCanonical/).
  const official = getTechnique(id) ?? redirectedTechnique(id);
  if (official) return official;
  const lib = libraryTechniques();
  return lib.addTeq.find((t) => t.id === id) ?? lib.mine.find((t) => t.id === id) ?? addTeqRepository.get(id)?.technique ?? userTechniqueRepository.get(id)?.technique;
}

/** Same as resolveTechnique but for a list of ids, in order, dropping any id that resolves to none of the three sources — mirrors getTechniquesByIds' contract exactly. */
export function resolveTechniquesByIds(ids: string[]): Technique[] {
  return ids.map((id) => resolveTechnique(id)).filter((t): t is Technique => !!t);
}

function matchesTechniqueFilters(t: Technique, filters: TechniqueFilters): boolean {
  return (
    (!filters.martialArt || isTechniqueInArt(t, filters.martialArt)) &&
    (!filters.category || (filters.martialArt ? techniqueCategoryInArt(t, filters.martialArt) : t.category) === filters.category) &&
    (!filters.position || t.positions.includes(filters.position)) &&
    (!filters.difficulty || t.difficulty === filters.difficulty) &&
    (!filters.type || t.tags.includes(filters.type))
  );
}

function matchesQuerySubstring(t: Technique, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return t.name.toLowerCase().includes(q) || (t.koreanName ?? '').toLowerCase().includes(q) || t.aliases.some((a) => a.toLowerCase().includes(q));
}

/** Official techniques linked to `filters.martialArt` through the shared library (e.g. MMA + Granby Roll) — the static search index only knows the official merge. */
function linkedIntoArt(query: string, filters: TechniqueFilters): Technique[] {
  if (!filters.martialArt) return [];
  const art = filters.martialArt;
  return allTechniques.filter((t) => libraryLinksOf(t.id).some((l) => l.martialArt === art) && matchesTechniqueFilters(t, filters) && matchesQuerySubstring(t, query));
}

/** Official search results, the shared add_teq library, and this user's own
 * local user_techniques, merged as one ranked list. This is also the
 * candidate pool every duplicate-check/discovery step searches against, so
 * a technique already in add_teq is found here BEFORE any AI call is made
 * (spec section 4/10).
 *
 * A genuine substring/exact match from ANY of the three sources is always
 * placed ahead of a merely-fuzzy official match, regardless of `limit` —
 * previously, a small `limit` (e.g. an 8-result technique picker) could let
 * official's own Fuse-fuzzy hits fill the whole result before add_teq/
 * user_techniques were even considered, so a technique that exists ONLY in
 * add_teq (e.g. "Von Flue Choke", absent from the 1,283 official file)
 * never showed up in search results at all even though its name matched
 * the query exactly. Search itself never touches the network — merging
 * all three is cheap regardless of corpus size.
 */
/** A technique whose name or alias IS the query ("Guillotine") ranks above ones that only contain it ("Guillotine Tilt"). Stable otherwise. */
function exactNameFirst(list: Technique[], query: string): Technique[] {
  const q = normalizeTechniqueName(query);
  if (!q) return list;
  const isExact = (t: Technique) => [t.name, t.koreanName ?? '', ...t.aliases].some((n) => n && normalizeTechniqueName(n) === q);
  return [...list.filter(isExact), ...list.filter((t) => !isExact(t))];
}

export function searchAllTechniques(query: string, limit = 30, filters: TechniqueFilters = {}): Technique[] {
  // add_teq/user_techniques carry BOTH real martial-arts techniques and
  // discovered gym/home-training exercises (see RequestGymExercise.tsx) —
  // unlike the static bundles (never in the official search corpus, see
  // search.ts), a discovered gym exercise's martialArt really is 'gym', so
  // nothing here filtered it out. An unscoped call (no filters.martialArt —
  // every global search: SearchBar, TechniqueList, ComboBuilder, ...) must
  // never surface it as a martial-arts technique; a call that explicitly
  // asks for a synthetic domain (e.g. checkDuplicate's gym candidate search)
  // still needs it, so the exclusion only applies when the caller isn't
  // already scoped to that domain.
  const includeSynthetic = isSyntheticTrainingDomain(filters.martialArt);
  const official = searchTechniques(query, limit > 0 ? Math.max(limit, 30) : 9999, filters);
  const lib = libraryTechniques();
  const addTeq = lib.addTeq.filter((t) => matchesTechniqueFilters(t, filters) && matchesQuerySubstring(t, query)).filter((t) => includeSynthetic || !isSyntheticTrainingDomain(t.martialArt));
  const mine = lib.mine
    .filter((t) => matchesTechniqueFilters(t, filters))
    .filter((t) => matchesQuerySubstring(t, query))
    .filter((t) => includeSynthetic || !isSyntheticTrainingDomain(t.martialArt));
  const linked = linkedIntoArt(query, filters);

  const seen = new Set<string>();
  const exact: Technique[] = [];
  const fuzzy: Technique[] = [];
  for (const t of [...official, ...linked, ...addTeq, ...mine]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    (matchesQuerySubstring(t, query) ? exact : fuzzy).push(t);
  }
  const merged = [...exactNameFirst(exact, query), ...fuzzy];
  return limit > 0 ? merged.slice(0, limit) : merged;
}

/**
 * Same merge as searchAllTechniques() above, but awaits searchTechniquesAsync()
 * for the official-corpus portion so its Fuse fallback (the expensive part
 * on a large query miss) runs off the main thread — see search.ts's doc
 * comment. add_teq/user_techniques stay synchronous here (small, per-user
 * datasets — never the ~1,310-entry corpus, so never the actual cost).
 * Used only by the live-typing SearchBar; every other existing caller of
 * searchAllTechniques() is untouched.
 */
export async function searchAllTechniquesAsync(query: string, limit = 30, filters: TechniqueFilters = {}): Promise<Technique[]> {
  const includeSynthetic = isSyntheticTrainingDomain(filters.martialArt);
  const official = await searchTechniquesAsync(query, limit > 0 ? Math.max(limit, 30) : 9999, filters);
  const lib = libraryTechniques();
  const addTeq = lib.addTeq.filter((t) => matchesTechniqueFilters(t, filters) && matchesQuerySubstring(t, query)).filter((t) => includeSynthetic || !isSyntheticTrainingDomain(t.martialArt));
  const mine = lib.mine
    .filter((t) => matchesTechniqueFilters(t, filters))
    .filter((t) => matchesQuerySubstring(t, query))
    .filter((t) => includeSynthetic || !isSyntheticTrainingDomain(t.martialArt));
  const linked = linkedIntoArt(query, filters);

  const seen = new Set<string>();
  const exact: Technique[] = [];
  const fuzzy: Technique[] = [];
  for (const t of [...official, ...linked, ...addTeq, ...mine]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    (matchesQuerySubstring(t, query) ? exact : fuzzy).push(t);
  }
  const merged = [...exactNameFirst(exact, query), ...fuzzy];
  return limit > 0 ? merged.slice(0, limit) : merged;
}

/** Every technique in the unified library — official + shared add_teq +
 * this user's own local additions — as a flat array. Use for things like
 * cross-art name matching or building filter-option lists; for a single id
 * use resolveTechnique, for a ranked query use searchAllTechniques.
 *
 * De-duplicated by id, official-first: a technique that was saved locally
 * to user_techniques (e.g. the add_teq insert appeared to fail) and later
 * also landed in the shared add_teq cache under the SAME id (the insert
 * had actually gone through, or a later sync pulled it down) used to show
 * up here TWICE — same id, two independent computeSkillProgress() results,
 * which on e.g. MySkills.tsx looked like a row that no 숙련도 filter could
 * ever fully get rid of. resolveTechnique() already only ever resolves one
 * copy (official ?? add_teq ?? mine), so this keeps that same precedence.
 */
export function getUnifiedAllTechniques(): Technique[] {
  const seen = new Set<string>();
  const unique: Technique[] = [];
  const lib = libraryTechniques();
  for (const t of [...allTechniques, ...lib.addTeq, ...lib.mine]) {
    // A discovered gym/home-training exercise (add_teq/user_techniques,
    // martialArt === 'gym'/'home-training') is not a martial-arts
    // technique — this function represents ONLY the unified real-technique
    // corpus (allTechniques already excludes the static bundles the same
    // way). A caller that wants a synthetic domain's full set — static
    // bundle + discovered — uses getUnifiedTechniquesByMartialArt instead.
    if (isSyntheticTrainingDomain(t.martialArt) || seen.has(t.id)) continue;
    seen.add(t.id);
    unique.push(t);
  }
  return unique;
}

/** 공식 1,283개 + add_teq + user_techniques 전체 기술 수 (spec [문제 1]) — the
 * official 1,253/1,283-technique JSON files are never modified; this only
 * adds the shared/local counts on top for display purposes. Discovered gym/
 * home-training exercises are excluded (see getUnifiedAllTechniques) so
 * adding a gym exercise never changes this number. */
export function getUnifiedTechniqueCount(): number {
  return getUnifiedAllTechniques().length;
}

/** martialArtSummaries with techniqueCount (and only techniqueCount —
 * categories/difficultyCounts stay as the official file computed them)
 * augmented by add_teq entries for that art, PLUS any user-added martial
 * arts from the custom_martial_arts registry (spec "MARTIALDEX 신규 무술
 * 추가 시스템" — a genuinely new id like "wushu" has no entry in the
 * static 9-art array at all, so it must be appended here, not merged into
 * an existing row). Official data is never mutated; this returns new
 * objects each call. */
export function getUnifiedMartialArtSummaries(): MartialArtSummary[] {
  // Counted per canonical technique: library duplicates/link records are not
  // extra techniques, but a link does add the linked technique to that art.
  const extra = new Map<string, number>();
  for (const t of libraryTechniques().addTeq) extra.set(t.martialArt, (extra.get(t.martialArt) ?? 0) + 1);
  for (const t of allTechniques) for (const l of libraryLinksOf(t.id)) extra.set(l.martialArt, (extra.get(l.martialArt) ?? 0) + 1);

  const official = extra.size === 0 ? martialArtSummaries : martialArtSummaries.map((a) => (extra.has(a.id) ? { ...a, techniqueCount: a.techniqueCount + (extra.get(a.id) ?? 0) } : a));

  const customArts = customMartialArtRepository.list();
  if (customArts.length === 0) return official;
  const custom: MartialArtSummary[] = customArts.map((c) => {
    const techniqueCount = extra.get(c.id) ?? 0;
    const techniques = libraryTechniques().addTeq.filter((t) => t.martialArt === c.id);
    return {
      id: c.id,
      nameKo: c.nameKo,
      nameEn: c.nameEn,
      techniqueCount,
      categories: Array.from(new Set(techniques.map((t) => t.category))),
      difficultyCounts: techniques.reduce<Record<string, number>>((acc, t) => {
        const key = t.difficulty ?? 'unknown';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
    };
  });
  return [...official, ...custom];
}

/** `getUnifiedMartialArtSummaries()`'s array deliberately stays the 9 real
 * combat arts (+ any custom martial arts, see above) only — many pages
 * iterate that array as a picker/dropdown and must never see a "홈트"
 * option there — but `MartialArtDetail.tsx` looks up a SINGLE id via this
 * function, so home-training gets a direct special-case here instead of
 * being added to the array. `getMartialArt` (loadData.ts) already resolves
 * 'home-training' to a friendly summary. */
export function getUnifiedMartialArt(id: string): MartialArtSummary | undefined {
  if (id === HOME_TRAINING_MARTIAL_ART_ID) return getMartialArt(id);
  return getUnifiedMartialArtSummaries().find((a) => a.id === id);
}

/** martialArtId -> its built-in curated bundle, for the synthetic domains
 * that keep one (see loadData.ts's SYNTHETIC_TRAINING_MARTIAL_ART_IDS) —
 * both are excluded from `allTechniques`/`getUnifiedAllTechniques`, so
 * getUnifiedTechniquesByMartialArt must merge them in explicitly. */
const SYNTHETIC_DOMAIN_BUNDLES: Record<string, Technique[]> = {
  [HOME_TRAINING_MARTIAL_ART_ID]: homeTrainingExercises,
  [GYM_MARTIAL_ART_ID]: gymExercises,
};

/** getTechniquesByMartialArt, plus any add_teq/user_techniques entries filed
 * under the same martial art — de-duplicated by id (see getUnifiedAllTechniques).
 * For a synthetic domain (home-training/gym) specifically, also includes its
 * built-in curated exercise library (never part of
 * `allTechniques`/`getUnifiedAllTechniques` — see loadData.ts — so it must
 * be merged in here explicitly). This is what lets a newly-discovered gym
 * exercise (add_teq, martial_art: 'gym') actually show up in GymExercisePicker
 * once that picker sources from this function instead of the static bundle. */
export function getUnifiedTechniquesByMartialArt(martialArtId: string): Technique[] {
  const bundle = SYNTHETIC_DOMAIN_BUNDLES[martialArtId];
  if (bundle) {
    const seen = new Set<string>();
    const combined: Technique[] = [];
    const lib = libraryTechniques();
    for (const t of [...bundle, ...lib.addTeq, ...lib.mine]) {
      if (t.martialArt !== martialArtId || seen.has(t.id)) continue;
      seen.add(t.id);
      combined.push(t);
    }
    return combined;
  }
  return getUnifiedAllTechniques().filter((t) => isTechniqueInArt(t, martialArtId));
}

export function normalizeTechniqueName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
}

/**
 * Exhaustive, limit-free normalized name/koreanName/alias equality check
 * across official + shared add_teq + this user's own user_techniques for
 * ONE martial art (spec [문제 2], steps 1-5 of its dedup ordering) —
 * deliberately NOT routed through the ranked/limited searchAllTechniques():
 * catches case/whitespace/hyphen/punctuation differences (e.g. "Von Flue
 * Choke" vs "von   flue-choke") no matter how many other loosely-similar
 * techniques exist elsewhere in the corpus. Harder cases (word order,
 * translation, abbreviations like "RNC", paraphrases like "... Submission")
 * are NOT this function's job — those still go through the existing AI
 * duplicate-check / verifyTechnique canonicalName re-check, unchanged.
 */
/**
 * Scoped by NAME only, never by martial art — a technique like "Von Flue
 * Choke" is taught across wrestling/BJJ/MMA, so whichever martial art the
 * caller happens to pass in for THIS call must not stop it from matching a
 * copy already filed under a different one. Scoping this by martialArt
 * used to let the same real technique get registered twice (once per
 * martial-art hint it was ever discovered under), each with its own
 * independent skill-progress/mastery tracking.
 */
export function findNormalizedDuplicate(name: string): Technique | undefined {
  const target = normalizeTechniqueName(name);
  if (!target) return undefined;
  // getUnifiedAllTechniques() now deliberately excludes every synthetic
  // domain entirely (see its own comment) — including discovered gym/
  // home-training exercises, not just the static bundles — so both need to
  // be added back here explicitly via getUnifiedTechniquesByMartialArt,
  // which already merges each synthetic domain's static bundle with its
  // add_teq/user_techniques entries. Without this, a free-text "is this
  // already in the library" check would miss every synthetic-domain
  // exercise (static or discovered), letting a request for e.g. an existing
  // gym exercise fall through to a wasted AI verification call instead of
  // being caught for free right here.
  const syntheticDomainTechniques = Object.keys(SYNTHETIC_DOMAIN_BUNDLES).flatMap((id) => getUnifiedTechniquesByMartialArt(id));
  return [...getUnifiedAllTechniques(), ...syntheticDomainTechniques].find(
    (t) =>
      normalizeTechniqueName(t.name) === target ||
      (!!t.koreanName && normalizeTechniqueName(t.koreanName) === target) ||
      t.aliases.some((a) => normalizeTechniqueName(a) === target)
  );
}

export interface DuplicateStageOutcome {
  ok: true;
  duplicate: DuplicateCheckResult;
}
export type DuplicateStageResult = DuplicateStageOutcome | { ok: false; message: string };

export async function runDuplicateStage(input: { name: string; martialArt: string; description?: string }): Promise<DuplicateStageResult> {
  const outcome = await checkDuplicate(input);
  if (!outcome.ok) return outcome;
  return { ok: true, duplicate: outcome.result };
}

export interface VerificationStageSuccess {
  ok: true;
  accepted: true;
  verification: VerificationResult;
  record: UserTechniqueRecord;
}
export interface VerificationStageRejected {
  ok: true;
  accepted: false;
  verification: VerificationResult;
  message: string;
}
export interface VerificationStageDuplicateFound {
  ok: true;
  accepted: false;
  verification: VerificationResult;
  duplicate: DuplicateCheckResult;
  message: string;
}
export type VerificationStageResult = VerificationStageSuccess | VerificationStageRejected | VerificationStageDuplicateFound | { ok: false; message: string };

/**
 * Runs verification (section 3-5), the hallucination gate (section 20),
 * technique-record generation (sections 8-12), and a SECOND duplicate check
 * against the AI's own confirmed canonical name (section 6 — "실제 기술이라고
 * 확인되더라도 기존 기술과 지나치게 유사한지 다시 확인") — in that order, each
 * one able to stop the pipeline before anything is generated/saved.
 *
 * There is no separate manual/admin review step — the Google Search
 * grounding verification gate above (passesVerificationGate: verdict
 * 'confirmed' + confidence >= 55 + real evidence/grounding sources) IS the
 * review. A record that reaches the return below already passed it, so it
 * is built with status 'approved', not a 'pending' awaiting-review state
 * that nothing in this app ever transitions out of.
 */
export async function runVerificationStage(input: {
  name: string;
  martialArt: string;
  description?: string;
}): Promise<VerificationStageResult> {
  const verificationOutcome = await verifyTechnique(input);
  if (!verificationOutcome.ok) return { ok: false, message: verificationOutcome.message };
  const verification = verificationOutcome.result;

  if (!passesVerificationGate(verification)) {
    return {
      ok: true,
      accepted: false,
      verification,
      message:
        verification.verdict === 'alias_of_existing'
          ? '기술명은 확인되지만 공식적인 명칭이 아니라 별칭으로 보입니다.'
          : verification.verdict === 'insufficient_evidence'
            ? '검증할 수 있는 자료가 부족합니다.'
            : '이 기술이 실제 무술 기술인지 충분히 확인할 수 없습니다.',
    };
  }

  // Canonical-name duplicate pass — BEFORE generating anything. A plain
  // text/candidate search for an abbreviation or paraphrase (e.g. "RNC",
  // "Rear Naked Choke Submission") has no textual similarity to the
  // existing "Rear Naked Choke" entry, so the FIRST duplicate check (on
  // the user's raw input) finds zero candidates and silently short-circuits
  // to "not a duplicate" — verifyTechnique's own canonicalName field (the
  // technique's standard full name, always populated when it recognizes an
  // abbreviation) is exactly what a real text search CAN match against, so
  // re-running the check here catches the whole "RNC family" class of
  // near-miss duplicates before a redundant record is ever generated.
  if (verification.canonicalName && verification.canonicalName.trim().toLowerCase() !== input.name.trim().toLowerCase()) {
    const canonicalCheck = await checkDuplicate({ name: verification.canonicalName, martialArt: input.martialArt, description: input.description });
    if (canonicalCheck.ok && canonicalCheck.result.isDuplicate) {
      return {
        ok: true,
        accepted: false,
        verification,
        duplicate: canonicalCheck.result,
        message: `입력하신 기술명("${input.name}")은 기존 기술 "${canonicalCheck.result.matchedTechniqueName}"의 다른 표기/약칭으로 보입니다.`,
      };
    }
  }

  const generated = await generateTechniqueRecord({
    id: generateUserTechniqueId(input.martialArt, input.name),
    name: input.name,
    martialArt: input.martialArt,
    description: input.description,
    verifiedCategory: verification.category,
  });
  if (!generated.ok) return { ok: false, message: generated.message };

  // Second duplicate pass — the AI-confirmed canonical name/aliases can
  // reveal a closer match to an existing technique than the user's original
  // phrasing did (spec section 6's "Double Leg" -> "Basic Double Leg" example).
  const secondCheck = await checkDuplicate({
    name: generated.record.technique.koreanName || generated.record.technique.name,
    martialArt: input.martialArt,
    description: generated.record.technique.description,
  });
  if (secondCheck.ok && secondCheck.result.isDuplicate) {
    return {
      ok: true,
      accepted: false,
      verification,
      duplicate: secondCheck.result,
      message: '검증된 기술명이 기존 기술과 매우 유사합니다. 새 기술로 등록하지 않습니다.',
    };
  }

  const now = new Date().toISOString();
  const record: UserTechniqueRecord = {
    id: generated.record.technique.id,
    technique: generated.record.technique,
    status: 'approved',
    addedByUserId: null,
    duplicateCheck: secondCheck.ok ? secondCheck.result : { isDuplicate: false, matchedTechniqueId: null, matchedTechniqueName: null, reason: '' },
    verification,
    createdAt: now,
    updatedAt: now,
  };

  return { ok: true, accepted: true, verification, record };
}

/** Only called when the user explicitly clicks [등록하기] on the preview screen (spec section 7) — never before. */
export function saveUserTechnique(record: UserTechniqueRecord, userId: string | null): UserTechniqueRecord {
  const saved: UserTechniqueRecord = { ...record, addedByUserId: userId, updatedAt: new Date().toISOString() };
  userTechniqueRepository.save(saved);
  return saved;
}

export function deleteUserTechnique(id: string): void {
  userTechniqueRepository.delete(id);
}

export function martialArtLabel(id: string): string {
  return getMartialArt(id)?.nameKo ?? id;
}
