import type { Technique } from '../../types';
import { martialArtSummaries } from '../loadData';
import { normalizeTechniqueName, findNormalizedDuplicate, getUnifiedTechniquesByMartialArt } from '../userTechniques/service';
import { isTechniqueInArt } from '../techniqueCanonical';
import { significantNameTokens, namesLikelySame } from '../aiCurriculum/diversity';
import { runExpandedWebResearch } from '../webSearch/expandedSearch';
import type { SearchResult } from '../webSearch/types';
import { verifyMartialArtFromEvidence, extractTechniqueCandidatesFromEvidence, verifyRequestedTechniqueFromEvidence } from './aiVerification';
import { customMartialArtRepository } from '../customMartialArt/repository';
import { insertCustomMartialArt } from '../customMartialArt/service';
import type { CustomMartialArt, WebEvidenceSource } from '../customMartialArt/types';
import { insertAddTeqTechnique } from '../addTeq/service';
import { withGiNoGi } from '../grappling/analyzeNewTechnique';
import { saveUserTechnique } from '../userTechniques/service';
import type { AddTeqRecord } from '../addTeq/types';
import type { UserTechniqueRecord } from '../userTechniques/types';
import type { DiscoveredTechniqueCandidate, MartialArtVerificationOutcome, SingleTechniqueVerificationOutcome, TechniqueCategory, TechniqueResearchOutcome } from './types';

const DEBUG = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;
function log(...args: unknown[]) {
  if (DEBUG) console.debug('[MartialArtDiscovery]', ...args);
}

// Bounded search budgets — real Tavily calls cost real quota (spec section
// 26 of the earlier Tavily audit still applies here: free tier is
// 1,000/month). A martial-art-wide research is a deliberate, occasional,
// high-value action, not routine, so a higher budget than a single
// curriculum-research pass is acceptable.
const MAX_QUERIES_PER_WAVE = 3;
const MAX_MARTIAL_ART_VERIFICATION_WAVES = 2;
const MAX_TECHNIQUE_RESEARCH_WAVES = 4;
const MAX_SOURCES_PER_EXTRACTION = 10;
const TARGET_TECHNIQUE_COUNT = 50;
const DEDUP_SIMILARITY_THRESHOLD = 0.6;

function slugifyMartialArtId(nameEn: string | null, nameKo: string): string {
  const base = (nameEn || nameKo)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base || 'martial-art';
}

function martialArtIdExists(id: string): boolean {
  return martialArtSummaries.some((a) => a.id === id) || !!customMartialArtRepository.get(id);
}

function generateMartialArtId(nameEn: string | null, nameKo: string): string {
  const base = slugifyMartialArtId(nameEn, nameKo);
  if (!martialArtIdExists(base)) return base;
  let suffix = 2;
  while (martialArtIdExists(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

/**
 * Spec section 5's "이미 존재하는 무술인지 먼저 확인" — normalized (case/
 * whitespace/hyphen-insensitive, Korean+English) match against the id,
 * Korean name, and English name of every official (9) + custom martial
 * art. Reuses the EXACT same normalizeTechniqueName() the technique-level
 * dedup already uses (userTechniques/service.ts) rather than a second,
 * parallel normalization scheme.
 */
export function findExistingMartialArt(inputName: string): { id: string; name: string } | undefined {
  const target = normalizeTechniqueName(inputName);
  if (!target) return undefined;
  for (const a of martialArtSummaries) {
    if (normalizeTechniqueName(a.id) === target || normalizeTechniqueName(a.nameKo) === target || (a.nameEn && normalizeTechniqueName(a.nameEn) === target)) {
      return { id: a.id, name: a.nameKo };
    }
  }
  for (const c of customMartialArtRepository.list()) {
    if (normalizeTechniqueName(c.id) === target || normalizeTechniqueName(c.nameKo) === target || (c.nameEn && normalizeTechniqueName(c.nameEn) === target)) {
      return { id: c.id, name: c.nameKo };
    }
  }
  return undefined;
}

function toWebEvidenceSources(sources: SearchResult[], indexes: number[]): WebEvidenceSource[] {
  return indexes
    .map((i) => sources[i - 1])
    .filter((s): s is SearchResult => !!s)
    .map((s) => ({ title: s.title, url: s.url, snippet: (s.content ?? s.snippet ?? '').slice(0, 300) }));
}

/**
 * Spec section 6/7 — verifies a NEW martial art candidate purely from real
 * Tavily evidence (never AI prior knowledge). Returns 'already_exists'
 * without ever touching the network if a normalized match is already
 * registered (official or custom).
 */
export async function verifyNewMartialArt(inputName: string): Promise<MartialArtVerificationOutcome> {
  const existing = findExistingMartialArt(inputName);
  if (existing) {
    return { status: 'already_exists', normalizedInput: inputName, existingMartialArtId: existing.id, existingMartialArtName: existing.name, executedQueries: [], wavesRun: 0 };
  }

  const name = inputName.trim();
  const queryWaves = [
    [`${name} martial art`, `${name} techniques`, `${name} history`],
    [`${name} official federation`, `${name} fighting style`, `${name} training system`],
  ].slice(0, MAX_MARTIAL_ART_VERIFICATION_WAVES);

  const research = await runExpandedWebResearch(queryWaves);
  log('martial art web research', { name, ok: research.ok, resultCount: research.collected.length, wavesRun: research.wavesRun });

  if (!research.ok) {
    if (research.notConfigured) {
      return { status: 'search_unavailable', normalizedInput: inputName, executedQueries: [], wavesRun: 0, errorMessage: 'Tavily 웹 검색이 설정되어 있지 않습니다.' };
    }
    return { status: 'insufficient_web_evidence', normalizedInput: inputName, executedQueries: research.executedQueries, wavesRun: research.wavesRun, errorMessage: research.errorMessage };
  }

  const sourcesForVerification = research.collected.slice(0, MAX_SOURCES_PER_EXTRACTION);
  const verification = await verifyMartialArtFromEvidence(name, sourcesForVerification);
  if (!verification.ok) {
    return { status: 'insufficient_web_evidence', normalizedInput: inputName, executedQueries: research.executedQueries, wavesRun: research.wavesRun, errorMessage: verification.message };
  }

  const v = verification.verdict;
  log('martial art verdict', v);
  const CONFIDENCE_THRESHOLD = 55;
  const passes = v.verdict === 'confirmed' && v.confidence >= CONFIDENCE_THRESHOLD && v.evidenceIndexes.length > 0;
  if (!passes) {
    return {
      status: 'insufficient_web_evidence',
      normalizedInput: inputName,
      executedQueries: research.executedQueries,
      wavesRun: research.wavesRun,
      errorMessage: v.reason || '실제 존재하는 독립적인 무술이라는 충분한 웹 근거를 찾지 못했습니다.',
    };
  }

  // Once verified, re-check for an existing match under the AI-confirmed
  // canonical name too — e.g. the user typed a romanization/typo that
  // didn't normalize-match, but the confirmed nameKo/nameEn does.
  const confirmedExisting = findExistingMartialArt(v.nameKo) ?? (v.nameEn ? findExistingMartialArt(v.nameEn) : undefined);
  if (confirmedExisting) {
    return { status: 'already_exists', normalizedInput: inputName, existingMartialArtId: confirmedExisting.id, existingMartialArtName: confirmedExisting.name, executedQueries: research.executedQueries, wavesRun: research.wavesRun };
  }

  return {
    status: 'verified',
    normalizedInput: inputName,
    nameKo: v.nameKo,
    nameEn: v.nameEn,
    description: v.description,
    sources: toWebEvidenceSources(sourcesForVerification, v.evidenceIndexes),
    executedQueries: research.executedQueries,
    wavesRun: research.wavesRun,
  };
}

function buildTechniqueResearchWaves(nameKo: string, nameEn: string | null): string[][] {
  const art = nameEn || nameKo;
  return [
    [`${art} basic techniques`, `${art} techniques list`, `${art} fighting techniques`],
    [`${art} kicks`, `${art} strikes punches`, `${art} throws takedowns`],
    [`${art} forms techniques`, `${art} training techniques`, `${art} defense techniques`],
    [`${art} grappling clinch techniques`, `${art} advanced techniques`, `${art} beginner techniques`],
  ].slice(0, MAX_TECHNIQUE_RESEARCH_WAVES);
}

/** Token-overlap dedup, mirroring aiCurriculum/techniqueResearch.ts's exact dedup rule — reused via the same significantNameTokens() utility rather than a second implementation. */
function dedupeCandidates(raw: DiscoveredTechniqueCandidate[]): DiscoveredTechniqueCandidate[] {
  const kept: DiscoveredTechniqueCandidate[] = [];
  const keptTokenSets: Set<string>[] = [];
  for (const c of raw) {
    const tokens = significantNameTokens(c.name);
    const dupIndex = keptTokenSets.findIndex((existing) => {
      if (existing.size === 0 || tokens.size === 0) return false;
      let intersection = 0;
      for (const t of tokens) if (existing.has(t)) intersection++;
      return intersection / (existing.size + tokens.size - intersection) >= DEDUP_SIMILARITY_THRESHOLD;
    });
    if (dupIndex >= 0) {
      // Keep the higher-confidence / more-evidenced of the two near-duplicates.
      if (c.confidence > kept[dupIndex].confidence) kept[dupIndex] = c;
      continue;
    }
    kept.push(c);
    keptTokenSets.push(tokens);
  }
  return kept;
}

/** Spec section 15's category balance — picks up to TARGET_TECHNIQUE_COUNT round-robin across categories present, so a martial art with heavy web coverage of one category (e.g. all kicks) doesn't crowd out everything else. Never invents a category that has zero real candidates. */
function selectBalanced(candidates: DiscoveredTechniqueCandidate[], limit: number): DiscoveredTechniqueCandidate[] {
  const byCategory = new Map<TechniqueCategory, DiscoveredTechniqueCandidate[]>();
  for (const c of candidates) {
    if (!byCategory.has(c.category)) byCategory.set(c.category, []);
    byCategory.get(c.category)!.push(c);
  }
  for (const list of byCategory.values()) list.sort((a, b) => b.confidence - a.confidence);
  const categories = [...byCategory.keys()];
  const selected: DiscoveredTechniqueCandidate[] = [];
  let round = 0;
  while (selected.length < limit) {
    let addedThisRound = false;
    for (const cat of categories) {
      if (selected.length >= limit) break;
      const list = byCategory.get(cat)!;
      if (round < list.length) {
        selected.push(list[round]);
        addedThisRound = true;
      }
    }
    if (!addedThisRound) break;
    round++;
  }
  return selected;
}

/**
 * Spec section 10-16 — researches up to TARGET_TECHNIQUE_COUNT (50) real,
 * web-verified techniques for a martial art via bounded multi-wave Tavily
 * search + Gemini extraction-from-real-content (never invention). Falls
 * short honestly (spec section 16) rather than padding with fabricated
 * entries — the caller (UI) decides whether to accept fewer or search more.
 */
export async function researchTechniquesForMartialArt(nameKo: string, nameEn: string | null): Promise<TechniqueResearchOutcome> {
  const waves = buildTechniqueResearchWaves(nameKo, nameEn);
  const rawCandidates: DiscoveredTechniqueCandidate[] = [];
  const executedQueries: string[] = [];
  const seenUrls = new Set<string>();
  let wavesRun = 0;
  let anySuccess = false;
  let notConfigured = false;

  for (const waveQueries of waves) {
    const queries = waveQueries.slice(0, MAX_QUERIES_PER_WAVE).filter((q) => !executedQueries.includes(q));
    if (queries.length === 0) continue;
    const research = await runExpandedWebResearch([queries]);
    if (research.notConfigured) {
      notConfigured = true;
      break;
    }
    anySuccess = anySuccess || research.anySuccess;
    executedQueries.push(...research.executedQueries);
    wavesRun += research.wavesRun;

    const newSources = research.collected.filter((r) => !seenUrls.has(r.url));
    for (const r of newSources) seenUrls.add(r.url);
    if (newSources.length === 0) continue;

    const sourcesForExtraction = newSources.slice(0, MAX_SOURCES_PER_EXTRACTION);
    const extraction = await extractTechniqueCandidatesFromEvidence(nameKo, nameEn, sourcesForExtraction);
    if (!extraction.ok) {
      log('extraction failed for wave', { wave: waveQueries, code: extraction.code, message: extraction.message });
      continue;
    }
    for (const c of extraction.candidates) {
      rawCandidates.push({
        name: c.name,
        nameKo: c.nameKo,
        category: c.category,
        description: c.description,
        sources: toWebEvidenceSources(sourcesForExtraction, c.sourceIndexes),
        confidence: c.confidence,
        selected: true,
        posture: c.posture,
        difficulty: c.difficulty,
      });
    }
    log('candidates after wave', { wave: waveQueries, cumulativeRaw: rawCandidates.length });

    // Early exit once we have a comfortable surplus before dedup (dedup only
    // ever shrinks) — avoids burning the full query budget once there's
    // clearly enough real material.
    if (rawCandidates.length >= TARGET_TECHNIQUE_COUNT * 1.5) break;
  }

  if (notConfigured) {
    return { status: 'search_unavailable', candidates: [], rawCandidateCount: 0, executedQueries: [], wavesRun: 0, errorMessage: 'Tavily 웹 검색이 설정되어 있지 않습니다.' };
  }
  if (!anySuccess) {
    return { status: 'insufficient_web_evidence', candidates: [], rawCandidateCount: 0, executedQueries, wavesRun, errorMessage: '검색 결과를 확보하지 못했습니다.' };
  }

  // Only keep candidates with real, non-trivial evidence — same confidence
  // floor aiCurriculum/techniqueResearch.ts uses for web_search-mode candidates.
  const CONFIDENCE_FLOOR = 50;
  const evidenced = rawCandidates.filter((c) => c.confidence >= CONFIDENCE_FLOOR && c.sources.length > 0);
  const deduped = dedupeCandidates(evidenced);
  const selected = selectBalanced(deduped, TARGET_TECHNIQUE_COUNT).map((c) => ({ ...c, selected: true }));
  const unselected = deduped.filter((c) => !selected.some((s) => s.name === c.name)).map((c) => ({ ...c, selected: false }));

  if (selected.length === 0) {
    return { status: 'insufficient_web_evidence', candidates: [], rawCandidateCount: rawCandidates.length, executedQueries, wavesRun, errorMessage: '실제 웹 근거로 검증된 기술을 찾지 못했습니다.' };
  }

  return { status: 'ok', candidates: [...selected, ...unselected], rawCandidateCount: rawCandidates.length, executedQueries, wavesRun };
}

function buildTechniqueFromCandidate(martialArtId: string, candidate: DiscoveredTechniqueCandidate, id: string): Technique {
  return {
    id,
    martialArt: martialArtId,
    name: candidate.name,
    koreanName: candidate.nameKo,
    aliases: [],
    category: candidate.category,
    positions: [],
    description: candidate.description,
    purpose: null,
    principles: [],
    variations: [],
    counters: [],
    defenses: [],
    transitions: [],
    relatedTechniques: [],
    relatedMartialArts: [],
    difficulty: candidate.difficulty,
    tags: [],
    youtubeSearchQuery: `${candidate.name} tutorial`,
    videos: [],
    posture: candidate.posture ?? undefined,
    source: 'ai_web_research',
  };
}

/**
 * Registers the verified martial art + the user's selected technique
 * candidates — the ONLY function that actually writes to the shared
 * registries (custom_martial_arts + add_teq), and only ever called after
 * both verifyNewMartialArt() and researchTechniquesForMartialArt() already
 * confirmed real web evidence, and the user explicitly confirmed (spec
 * section 19's "사용자 확인" step). Requires login — a brand-new,
 * globally-shared martial art has no local-only fallback (unlike a single
 * technique's user_techniques path), since it must be visible to every
 * user immediately.
 */
export async function registerNewMartialArt(
  verification: { nameKo: string; nameEn: string | null; description: string; sources: WebEvidenceSource[] },
  selectedCandidates: DiscoveredTechniqueCandidate[],
  userId: string
): Promise<{ ok: true; martialArtId: string; techniqueIds: string[] } | { ok: false; message: string }> {
  const martialArtId = generateMartialArtId(verification.nameEn, verification.nameKo);
  const now = new Date().toISOString();
  const martialArtRecord: CustomMartialArt = {
    id: martialArtId,
    nameKo: verification.nameKo,
    nameEn: verification.nameEn,
    description: verification.description,
    source: 'ai_web_research',
    verified: true,
    verifiedAt: now,
    addedBy: userId,
    sources: verification.sources,
    createdAt: now,
    updatedAt: now,
  };
  const maResult = await insertCustomMartialArt(martialArtRecord);
  if (!maResult.ok) return { ok: false, message: maResult.message };

  const techniqueIds: string[] = [];
  for (const candidate of selectedCandidates) {
    const id = `${martialArtId}__${candidate.name.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'technique'}`;
    const finalId = techniqueIds.includes(id) ? `${id}-${techniqueIds.length}` : id;
    const technique = buildTechniqueFromCandidate(martialArtId, candidate, finalId);
    const record: AddTeqRecord = {
      id: finalId,
      technique,
      status: 'approved',
      duplicateCheck: { isDuplicate: false, matchedTechniqueId: null, matchedTechniqueName: null, reason: '신규 무술 등록 시 웹 검색 기반으로 새로 발견됨' },
      verification: {
        verdict: 'confirmed',
        confidence: candidate.confidence,
        martialArtConfirmed: verification.nameKo,
        category: candidate.category,
        canonicalName: candidate.name,
        evidenceNotes: [candidate.description],
        // Real Tavily source citations, not Gemini's native grounding — see
        // aiVerification.ts's doc comment for why this reuses the existing
        // groundingSources/usedSearchGrounding fields rather than adding a
        // parallel "usedRealWebSearch" field to a widely-shared type.
        groundingSources: candidate.sources.map((s) => ({ title: s.title, uri: s.url })),
        usedSearchGrounding: true,
        reason: candidate.description,
      },
      createdAt: now,
      updatedAt: now,
    };
    const inserted = await insertAddTeqTechnique(record);
    if (inserted.ok) techniqueIds.push(finalId);
  }

  return { ok: true, martialArtId, techniqueIds };
}

// ===== 없는 기술 요청 (missing technique request) — works for BOTH new and existing martial arts =====

const MAX_MISSING_TECHNIQUE_WAVES = 3;

/**
 * Spec section 6/7's requested-technique query builder — the martial art's
 * own name is included in EVERY query (never a bare technique-name search),
 * so a technique famous under the same/similar name in a different martial
 * art doesn't get misattributed just from a generic search. `extraWave`
 * (spec section 20's "추가 검색") appends one more, differently-worded wave
 * (federation/syllabus/forms framing) — bounded by MAX_MISSING_TECHNIQUE_WAVES,
 * matching runExpandedWebResearch's "caller decides the bound, never
 * open-ended" contract.
 */
function buildRequestedTechniqueSearchQueries(martialArtNameKo: string, martialArtNameEn: string | null, requestedName: string, extraWave: boolean): string[][] {
  const art = martialArtNameEn || martialArtNameKo;
  const waves = [
    [`${art} ${requestedName}`, `${art} technique ${requestedName}`, `${requestedName} ${art} martial arts`],
    [`${art} ${requestedName} tutorial`, `${requestedName} technique tutorial`, `${art} ${requestedName} training`],
  ];
  if (extraWave) {
    waves.push([`${requestedName} ${art} federation syllabus`, `${requestedName} ${art} forms technique`, `${art} ${requestedName} official technique list`]);
  }
  return waves.slice(0, MAX_MISSING_TECHNIQUE_WAVES);
}

/**
 * Spec "MARTIALDEX — 신규 무술 미등록 기술 요청 기능" — verifies ONE specific
 * technique for a SPECIFIC martial art (the martial art's own name/id is
 * always included in every query, per that spec's section 5, so a
 * technique famous in a DIFFERENT martial art never gets misattributed
 * here just because it shares a name). Works identically for an official
 * martial art, an add_teq-only one, or a brand-new custom one — the caller
 * only ever passes martialArtId/nameKo/nameEn, never a hardcoded branch.
 */
function findExistingTechniqueMatch(martialArtId: string, requestedName: string): Technique | undefined {
  // Scoped-to-this-art check first (name/koreanName/alias — mirrors
  // findNormalizedDuplicate's own alias handling, spec section 4).
  const target = normalizeTechniqueName(requestedName);
  const inArt = getUnifiedTechniquesByMartialArt(martialArtId);
  const scoped = inArt.find(
    (t) => normalizeTechniqueName(t.name) === target || (!!t.koreanName && normalizeTechniqueName(t.koreanName) === target) || t.aliases.some((a) => normalizeTechniqueName(a) === target)
  );
  if (scoped) return scoped;
  // Global exact/alias match, but only treated as a duplicate here when it
  // already belongs to THIS martial art — a same-named technique filed
  // under a different art is not "already exists" for this one (that's the
  // wrong_martial_art path, decided from real evidence, not from a name
  // collision alone).
  const exactAnywhere = findNormalizedDuplicate(requestedName);
  if (exactAnywhere && isTechniqueInArt(exactAnywhere, martialArtId)) return exactAnywhere;
  // Spec section 4's "유사 기술" check — same significantNameTokens/0.6
  // threshold rule dedupeCandidates already uses (via namesLikelySame),
  // reused here so AI-canonicalized name variance for the SAME real
  // technique (e.g. "Zheng Ti Tui" vs "Zheng Ti") doesn't slip past an
  // exact-normalize-only check and get registered a second time.
  const similar = inArt.find((t) => namesLikelySame(t.name, requestedName) || (!!t.koreanName && namesLikelySame(t.koreanName, requestedName)));
  if (similar) return similar;
  return undefined;
}

/**
 * Spec "MARTIALDEX — 신규 무술 미등록 기술 요청" — verifies ONE requested
 * technique (exact name or natural-language description) for a SPECIFIC
 * martial art, purely from real Tavily evidence handed to Gemini
 * (verifyRequestedTechniqueFromEvidence — never useSearchGrounding:true,
 * never Gemini's own prior knowledge). Works identically for an official
 * martial art, an add_teq-only one, or a brand-new custom one. `extraSearch`
 * (spec section 20) re-runs with one additional, differently-worded query
 * wave when the caller (UI's "추가 검색" button) asks for it, still bounded.
 */
export async function verifyMissingTechnique(
  martialArtId: string,
  martialArtNameKo: string,
  martialArtNameEn: string | null,
  requestedName: string,
  opts?: { extraSearch?: boolean }
): Promise<SingleTechniqueVerificationOutcome> {
  // 1) Existing-technique dedup FIRST, before any network call (spec section 4).
  const existing = findExistingTechniqueMatch(martialArtId, requestedName);
  if (existing) {
    return { status: 'already_exists', existingTechniqueId: existing.id, existingTechniqueName: existing.name, executedQueries: [], wavesRun: 0 };
  }

  // 2) Real Tavily search WITH the martial art's own name in every query
  // (never a bare technique-name-only search — spec section 5/6's core rule).
  const queryWaves = buildRequestedTechniqueSearchQueries(martialArtNameKo, martialArtNameEn, requestedName, !!opts?.extraSearch);
  const research = await runExpandedWebResearch(queryWaves);
  if (!research.ok) {
    if (research.notConfigured) {
      return { status: 'search_unavailable', executedQueries: [], wavesRun: 0, errorMessage: 'Tavily 웹 검색이 설정되어 있지 않습니다.' };
    }
    return { status: 'insufficient_web_evidence', executedQueries: research.executedQueries, wavesRun: research.wavesRun, errorMessage: research.errorMessage };
  }

  const sourcesForVerification = research.collected.slice(0, MAX_SOURCES_PER_EXTRACTION);
  const verification = await verifyRequestedTechniqueFromEvidence(martialArtNameKo, martialArtNameEn, requestedName, sourcesForVerification);
  if (!verification.ok) {
    return { status: 'insufficient_web_evidence', executedQueries: research.executedQueries, wavesRun: research.wavesRun, errorMessage: verification.message };
  }

  const v = verification.verdict;
  log('requested technique verdict', v);

  if (v.verdict === 'wrong_martial_art') {
    return {
      status: 'wrong_martial_art',
      likelyMartialArt: v.likelyMartialArt,
      executedQueries: research.executedQueries,
      wavesRun: research.wavesRun,
      errorMessage: v.reason,
    };
  }
  if (v.verdict === 'not_a_technique') {
    return { status: 'not_a_technique', executedQueries: research.executedQueries, wavesRun: research.wavesRun, errorMessage: v.reason };
  }

  const CONFIDENCE_FLOOR = 50;
  const evidencedCandidates = v.verdict === 'confirmed' ? v.candidates.filter((c) => c.confidence >= CONFIDENCE_FLOOR && c.sourceIndexes.length > 0) : [];
  if (evidencedCandidates.length === 0) {
    return {
      status: 'insufficient_web_evidence',
      executedQueries: research.executedQueries,
      wavesRun: research.wavesRun,
      errorMessage: v.reason || `요청한 기술이 "${martialArtNameKo}"의 기술이라는 충분한 웹 근거를 찾지 못했습니다.`,
    };
  }

  const toCandidate = (c: (typeof evidencedCandidates)[number]): DiscoveredTechniqueCandidate => ({
    name: c.name,
    nameKo: c.nameKo,
    category: c.category,
    description: c.description,
    sources: toWebEvidenceSources(sourcesForVerification, c.sourceIndexes),
    confidence: c.confidence,
    selected: true,
    posture: c.posture,
    difficulty: c.difficulty,
  });

  if (evidencedCandidates.length > 1) {
    return { status: 'multiple_candidates', candidates: evidencedCandidates.map(toCandidate), executedQueries: research.executedQueries, wavesRun: research.wavesRun };
  }

  return { status: 'verified', candidate: toCandidate(evidencedCandidates[0]), executedQueries: research.executedQueries, wavesRun: research.wavesRun };
}

/** Registers a single verified missing-technique candidate — reuses the EXISTING add_teq/user_techniques dual-path (registerDiscoveredTechnique's own logic, mirrored here since that function expects a full UserTechniqueRecord with the OLD grounding-based verification shape). */
export async function registerMissingTechnique(
  martialArtId: string,
  candidate: DiscoveredTechniqueCandidate,
  userId: string | null
): Promise<{ ok: true; techniqueId: string } | { ok: false; code: 'already_exists'; existingTechniqueId: string; existingTechniqueName: string } | { ok: false; code: 'error'; message: string }> {
  // Spec section 23's "등록 직전 최종 중복 검사" — re-checks right before the
  // write, not just at request time, so two concurrent requests (or the same
  // user re-confirming a stale preview) never create a duplicate row.
  const dupe = findExistingTechniqueMatch(martialArtId, candidate.name) ?? (candidate.nameKo ? findExistingTechniqueMatch(martialArtId, candidate.nameKo) : undefined);
  if (dupe) {
    return { ok: false, code: 'already_exists', existingTechniqueId: dupe.id, existingTechniqueName: dupe.name };
  }

  const now = new Date().toISOString();
  const id = `${martialArtId}__${candidate.name.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'technique'}`;
  // Grappling techniques get their Gi / No-Gi split researched before saving (add_teq rows can't be updated later).
  const technique = await withGiNoGi(buildTechniqueFromCandidate(martialArtId, candidate, id));
  const record: UserTechniqueRecord = {
    id,
    technique,
    status: 'approved',
    addedByUserId: userId,
    duplicateCheck: { isDuplicate: false, matchedTechniqueId: null, matchedTechniqueName: null, reason: '없는 기술 요청 — 웹 검색 기반으로 새로 발견됨' },
    verification: {
      verdict: 'confirmed',
      confidence: candidate.confidence,
      martialArtConfirmed: martialArtId,
      category: candidate.category,
      canonicalName: candidate.name,
      evidenceNotes: [candidate.description],
      groundingSources: candidate.sources.map((s) => ({ title: s.title, uri: s.url })),
      usedSearchGrounding: true,
      reason: candidate.description,
    },
    createdAt: now,
    updatedAt: now,
  };

  if (!userId) {
    const saved = saveUserTechnique(record, null);
    return { ok: true, techniqueId: saved.id };
  }
  const addTeqRecord: AddTeqRecord = { id: record.id, technique: record.technique, status: 'approved', duplicateCheck: record.duplicateCheck, verification: record.verification, createdAt: record.createdAt, updatedAt: record.updatedAt };
  const inserted = await insertAddTeqTechnique(addTeqRecord);
  if (inserted.ok) return { ok: true, techniqueId: addTeqRecord.id };
  const saved = saveUserTechnique(record, userId);
  return { ok: true, techniqueId: saved.id };
}
