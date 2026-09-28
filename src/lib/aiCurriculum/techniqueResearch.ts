import { askGeminiForJsonWithGrounding } from '../userTechniques/geminiJson';
import type { AiErrorCode, GroundingSource } from '../ai/types';
import type { GoalAnalysis, GoalIntent, ResearchMode, SearchStatus } from './types';
import { intentMultiplier } from './intentClassifier';
import { significantNameTokens } from './diversity';
import { MMA_MARTIAL_ART_ID, MMA_SOURCE_MARTIAL_ARTS } from '../mmaCurriculum/types';
import { getMartialArt } from '../loadData';
import { webSearchProvider } from '../webSearch/provider';
import type { SearchResult } from '../webSearch/types';

const DEBUG = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;
function log(...args: unknown[]) {
  // Dev-only pipeline trace (spec section 19) — never logs API keys/tokens,
  // only the same goal/technique text already visible in the UI.
  if (DEBUG) console.debug('[CurriculumResearch]', ...args);
}

/**
 * Structured `[CURRICULUM_*] key=value ...` trace lines (spec section 27) —
 * grep-able by tag, dev-only, and never includes the API key or raw request
 * headers (only the same query text/counts already surfaced in the UI).
 */
function structuredLog(tag: string, fields: Record<string, string | number | boolean>) {
  if (!DEBUG) return;
  const parts = Object.entries(fields).map(([k, v]) => `${k}=${typeof v === 'string' ? `"${v}"` : v}`);
  console.debug(`[${tag}] ${parts.join(' ')}`);
}

export interface ResearchedTechnique {
  name: string;
  martialArtGuess: string;
  purpose: string;
  intentGuess: GoalIntent | 'unknown';
  /** Free-text provenance note (site name/URL, or "general knowledge (no live search)" for the ungrounded fallback) — kept for backward compatibility; prefer sourceUrls/sourceTitles below when researchMode is 'web_search'. */
  source: string;
  /** Real URLs the technique was actually found in (web_search mode only — never fabricated; empty for grounded/knowledge_fallback since those don't retrieve real pages). */
  sourceUrls?: string[];
  sourceTitles?: string[];
  /** Short quote/paraphrase of what in the source actually mentions this technique — required for web_search mode to count as more than a name-drop. */
  evidence?: string;
  /** 0-100, Gemini's own confidence that this is a real, correctly-named technique given the evidence available. Candidates below CONFIDENCE_UNCERTAIN_THRESHOLD are marked 'uncertain' and excluded from auto-merge (spec section 13/14). */
  confidence?: number;
}

export interface ExcludedResearchTechnique {
  name: string;
  reason: string;
}

export interface TechniqueResearchOutcome {
  ok: boolean;
  status: SearchStatus;
  /** After goal-opposite exclusion + de-dup — safe to merge into desiredTechniques. */
  techniques: ResearchedTechnique[];
  /** Dropped for conflicting with the goal's intent, or as a near-duplicate of an already-kept name — spec sections 4/15's "제외된 항목" transparency. */
  excluded: ExcludedResearchTechnique[];
  /** How many Gemini returned before any filtering below ran. */
  rawCount: number;
  /** Researched results dropped because their own intentGuess directly conflicts with the goal's intents (spec 1-4). Subset of `excluded`. */
  excludedOppositeCampCount: number;
  usedSearchGrounding: boolean;
  groundingSources: GroundingSource[];
  /** The angle-queries this call explicitly instructed Gemini's search tool to cover (spec section 4) — a PLAN, not a guarantee of what Gemini's tool actually ran; see `actualSearchQueries` for that. */
  plannedQueries: string[];
  /** Gemini's own `groundingMetadata.webSearchQueries` — the REAL queries its search tool issued, when the API reports them. Empty when unavailable (never fabricated to match plannedQueries). */
  actualSearchQueries: string[];
  errorMessage?: string;
  /** How these candidates were obtained — see ResearchMode's doc comment in types.ts. */
  researchMode: ResearchMode;
  /** True only for researchMode 'web_search' — a real webSearchProvider call actually ran and returned >=1 result. Never true when results came from Gemini's own knowledge (spec section 25). */
  usedExternalWebSearch: boolean;
  /** The literal query strings actually sent to the web search provider (web_search mode) — ground truth, not inferred, unlike actualSearchQueries above which depends on Gemini self-reporting what its grounding tool did. */
  executedQueries: string[];
  /** Raw result count returned by the web search provider, before any extraction/filtering (web_search mode only; 0 otherwise). */
  searchResultCount: number;
  /** How many distinct sources were actually fed to Gemini for technique extraction (web_search mode only; 0 otherwise). */
  analyzedSourceCount: number;
  /** How many search waves actually ran (1 = initial only, up to 1 + MAX_EXPANSION_WAVES) — spec section 9/26's expansion-search accounting. 0 for non-web_search/insufficient_web_evidence modes. */
  wavesRun: number;
}

// A topic phrase containing any Hangul syllable is exactly the "Korean text
// mechanically glued into an English search template" bug this function
// used to produce (e.g. "다양한 테이크다운 스타일 techniques") — filtered out
// as a last-resort defensive check even though analysis.searchTopics is
// supposed to already be clean (goalAnalysis.ts's prompt instructs Gemini
// to keep it English/romanized-only); a stray Korean topic is dropped
// rather than shipped as a broken query.
const HANGUL_RE = /[가-힣]/;

/**
 * Deterministic, code-level floor — never depends on any single Gemini JSON
 * field. `analysis.martialArt` is always a real resolved id by the time this
 * runs (analyzeGoal always sets it, defaulting to the user's own dropdown
 * choice), so this can never come back empty. This is what guarantees Tavily
 * is actually attempted on every real generation (spec section 1's mandatory
 * pipeline order) instead of silently skipping web search whenever Gemini's
 * `searchTopics` happens to come back empty/thin AND every legacy phrase
 * happens to be Korean (this was the confirmed root cause of curricula
 * showing "AI 기본 지식 사용" even when Tavily was correctly configured —
 * attemptWebSearch()'s very first line returns null when plannedQueries is
 * empty, which fell through to Google Search grounding, which is
 * billing-gated on the free tier, which then fell to knowledge_fallback).
 */
function buildDeterministicFallbackAngles(martialArtId: string, intents: GoalIntent[]): string[] {
  const artTerm = martialArtId === MMA_MARTIAL_ART_ID ? 'mixed martial arts (MMA)' : martialArtId.replace(/-/g, ' ');
  const angles = [`${artTerm} techniques`];
  const intentTerm = intents.find((i) => VALID_GOAL_INTENTS.has(i));
  if (intentTerm) angles.push(`${artTerm} ${intentTerm} techniques`);
  return angles;
}

/**
 * spec section 4/5: never a single "user text verbatim" query, and never a
 * Korean phrase mechanically glued into an English template. Builds from
 * `analysis.searchTopics` — the clean, search-engine-friendly English/
 * romanized phrases goalAnalysis.ts's prompt asks Gemini to produce
 * specifically for this purpose (kept separate from desiredTechniques/goals/
 * priority, which preserve the user's own wording — including Korean and
 * diversity-adjective clutter — for relevance-scoring, not for search).
 * Falls back to the old priority/goals/weaknesses/desiredTechniques phrases
 * when searchTopics came back empty, and even then, drops any topic that
 * still contains Hangul rather than building a mashup query from it. If
 * BOTH of those come up empty (a real, observed failure mode — Gemini is
 * not guaranteed to populate searchTopics, and a Korean-speaking user's
 * legacy phrases are usually Korean), falls all the way to
 * buildDeterministicFallbackAngles so this function can never return [].
 */
function extractCleanOrLegacyTopics(analysis: GoalAnalysis): string[] {
  const cleanTopics = (analysis.searchTopics ?? []).filter((t) => typeof t === 'string' && t.trim() && !HANGUL_RE.test(t));
  const legacyTopics = [...new Set([...analysis.priority, ...analysis.goals, ...analysis.weaknesses, ...analysis.desiredTechniques])]
    .filter((t) => t.trim() && !HANGUL_RE.test(t));
  return (cleanTopics.length > 0 ? cleanTopics : legacyTopics).slice(0, 3);
}

export function buildResearchAngles(analysis: GoalAnalysis, diversityRequested: boolean): string[] {
  const topics = extractCleanOrLegacyTopics(analysis);
  if (topics.length === 0) return buildDeterministicFallbackAngles(analysis.martialArt, analysis.intents ?? []);
  const angles: string[] = [];
  for (const topic of topics) {
    // searchTopics sometimes already ends in "technique(s)" (Gemini's own
    // phrasing) — avoid the redundant "wrestling takedown techniques
    // techniques" query this produced before.
    const withTechniques = /techniques?$/i.test(topic.trim()) ? topic.trim() : `${topic} techniques`;
    angles.push(withTechniques);
    if (diversityRequested) {
      angles.push(`different types of ${topic}`);
      angles.push(`${topic} variations`);
    }
  }
  return [...new Set(angles)].slice(0, diversityRequested ? 9 : 6);
}

/**
 * Same topic basis as buildResearchAngles (never a second, parallel
 * topic-derivation scheme), reused for expansion-search waves once the
 * initial wave came up short — spec section 6's "기존 Tavily 검색 시스템을
 * 재사용한다... buildResearchAngles() 구조가 있다면 이를 재사용한다". Falls back
 * to a bare martial-art term (never empty) so expansion templates always
 * have something to work with even when the initial wave's own topics were
 * empty (a rare case, since buildResearchAngles already has its own
 * deterministic floor for the initial wave).
 */
function coreSearchTopicsForExpansion(analysis: GoalAnalysis): string[] {
  const topics = extractCleanOrLegacyTopics(analysis);
  if (topics.length > 0) return topics;
  const artTerm = analysis.martialArt === MMA_MARTIAL_ART_ID ? 'mixed martial arts (MMA)' : analysis.martialArt.replace(/-/g, ' ');
  return [artTerm];
}

/**
 * Spec section 8's "동일한 검색어를 반복하지 않는다 — 검색 각도를 변경한다": each
 * expansion wave reframes the SAME goal-derived topics with different search
 * intent (tutorial/coaching-angle first, then setup/entry-chain angle),
 * never the literal wave-1 query text again, and never a hardcoded
 * per-goal string — the topics themselves still come from the user's own
 * goal via coreSearchTopicsForExpansion.
 */
function buildExpansionAngles(analysis: GoalAnalysis, waveIndex: number): string[] {
  const topics = coreSearchTopicsForExpansion(analysis);
  const templatesByWave: ((t: string) => string)[][] = [
    [(t) => `${t} tutorial`, (t) => `${t} coaching breakdown`, (t) => `how to do ${t}`],
    [(t) => `${t} setups and combinations`, (t) => `${t} entries and chains`, (t) => `${t} against defense`],
  ];
  const templates = templatesByWave[Math.min(waveIndex - 1, templatesByWave.length - 1)];
  const angles = topics.flatMap((t) => templates.map((tpl) => tpl(t)));
  return [...new Set(angles)].slice(0, MAX_WEB_SEARCH_QUERIES);
}

// spec section 5: a duration-scaled MINIMUM to accept web_search evidence as
// "sufficient" — deliberately much gentler than service.ts's
// estimateNeededPoolSize (that one sizes the FULL curriculum pool; real
// web-search evidence density per topic is far lower than the whole
// technique DB, so requiring a full pool's worth of evidence would make
// insufficient_web_evidence fire on almost every real search). A shortfall
// between this floor and the full pool size is still honestly reported via
// insufficientContent/qualityWarning downstream — this floor only decides
// "is there enough REAL evidence to build a web_search curriculum AT ALL".
const MIN_EVIDENCE_CANDIDATES_FLOOR = 3;
function computeMinimumEvidenceCandidates(totalDays: number): number {
  return Math.max(MIN_EVIDENCE_CANDIDATES_FLOOR, Math.ceil(totalDays / 7) + 2);
}

const VALID_GOAL_INTENTS = new Set<string>(['attack', 'defense', 'escape', 'counter', 'connection', 'fundamentals']);
const VALID_INTENT_GUESS = new Set<string>([...VALID_GOAL_INTENTS, 'unknown']);

function isResearchArray(v: unknown): v is ResearchedTechnique[] {
  return (
    Array.isArray(v) &&
    v.every((x) => {
      if (!x || typeof x !== 'object') return false;
      const o = x as Record<string, unknown>;
      return (
        typeof o.name === 'string' &&
        o.name.trim().length > 0 &&
        typeof o.martialArtGuess === 'string' &&
        typeof o.purpose === 'string' &&
        typeof o.intentGuess === 'string' &&
        VALID_INTENT_GUESS.has(o.intentGuess) &&
        typeof o.source === 'string'
      );
    })
  );
}

// Bounded so a diversity-heavy goal (up to 9 planned angles) never fires
// more than this many real Tavily calls per research pass — keeps usage
// well inside the free tier (1,000/month) even under heavy testing.
const MAX_WEB_SEARCH_QUERIES = 3;
// Caps how many distinct retrieved pages get pasted into the extraction
// prompt — bounds token usage regardless of how many raw results came back.
const MAX_SOURCES_FOR_EXTRACTION = 8;
// Below this, a web_search-mode candidate is excluded outright (spec section
// 14's "uncertain은 자동 포함하지 않는다") rather than merely flagged low.
const CONFIDENCE_UNCERTAIN_THRESHOLD = 50;

/**
 * Stricter than isResearchArray — a web_search candidate must carry REAL
 * evidence (non-empty sourceUrls + evidence text) to type-check at all, so
 * a malformed/evidence-less item is rejected as a parse failure rather than
 * silently accepted and only caught later by the confidence filter.
 */
function isWebSearchResearchArray(v: unknown): v is ResearchedTechnique[] {
  return (
    Array.isArray(v) &&
    v.every((x) => {
      if (!x || typeof x !== 'object') return false;
      const o = x as Record<string, unknown>;
      return (
        typeof o.name === 'string' &&
        o.name.trim().length > 0 &&
        typeof o.martialArtGuess === 'string' &&
        typeof o.purpose === 'string' &&
        typeof o.intentGuess === 'string' &&
        VALID_INTENT_GUESS.has(o.intentGuess) &&
        Array.isArray(o.sourceUrls) &&
        o.sourceUrls.length > 0 &&
        o.sourceUrls.every((u) => typeof u === 'string') &&
        (o.sourceTitles === undefined || (Array.isArray(o.sourceTitles) && o.sourceTitles.every((t) => typeof t === 'string'))) &&
        typeof o.evidence === 'string' &&
        o.evidence.trim().length > 0 &&
        typeof o.confidence === 'number'
      );
    })
  );
}

// Codes that mean search couldn't even be ATTEMPTED (config/auth problem),
// as opposed to an attempt that ran and failed — see SearchStatus's doc
// comment in types.ts. Exported so the UI/tests can reason about the same
// classification without duplicating it.
const SEARCH_UNAVAILABLE_CODES = new Set<AiErrorCode | 'PARSE_ERROR'>(['NO_API_KEY', 'INVALID_API_KEY', 'UNAUTHORIZED']);
// Codes plausibly transient/format-related — worth exactly one retry with a
// reformulated prompt. RATE_LIMIT/NETWORK/NO_API_KEY/INVALID_API_KEY/
// UNAUTHORIZED are deliberately excluded: retrying an unchanged request
// against the same failure mode just burns another call (and, for
// RATE_LIMIT, more of an already-exhausted quota) without fixing anything.
const RETRYABLE_CODES = new Set<AiErrorCode | 'PARSE_ERROR'>(['EMPTY_RESPONSE', 'PARSE_ERROR', 'UNKNOWN']);

/**
 * Same rawCount/keptCount → SUCCESS/PARTIAL/FAILED thresholds used by both
 * the primary grounded flow (deriveSearchStatus below) and the knowledge-
 * fallback flow (researchTechniquesForGoal's ungrounded retry) — extracted
 * so the two paths can never silently drift apart. Behavior-preserving
 * extraction: deriveSearchStatus's own test suite still exercises the exact
 * same thresholds through this function.
 */
function bucketByCount(rawCount: number, keptCount: number): SearchStatus {
  // Test 3 (spec section 12): an empty array is NOT success, even though
  // the HTTP call itself succeeded — the old behavior conflated these.
  if (rawCount === 0) return 'SEARCH_FAILED';
  if (keptCount === 0) return 'SEARCH_PARTIAL';
  // Most of what came back was filtered out as opposite-camp/duplicate —
  // the attempt wasn't a failure, but it was thin (Test 4).
  if (keptCount < Math.max(2, Math.ceil(rawCount * 0.34))) return 'SEARCH_PARTIAL';
  return 'SEARCH_SUCCESS';
}

/**
 * Pure, side-effect-free — the ONLY place a raw Gemini outcome becomes a
 * SearchStatus, so it's unit-testable without a network call (spec section
 * 12's Test 1-5) and every caller agrees on the same classification.
 * `rawCount` is Gemini's own array length before any filtering; `keptCount`
 * is what survived opposite-camp exclusion + near-duplicate dedup.
 */
export function deriveSearchStatus(params: {
  ok: boolean;
  code?: AiErrorCode | 'PARSE_ERROR';
  usedSearchGrounding: boolean;
  rawCount: number;
  keptCount: number;
}): SearchStatus {
  if (!params.ok) {
    return params.code && SEARCH_UNAVAILABLE_CODES.has(params.code) ? 'SEARCH_NOT_AVAILABLE' : 'SEARCH_FAILED';
  }
  // Requested grounding but the API didn't actually report running it —
  // treat as unavailable rather than silently presenting an ungrounded
  // (AI-prior-knowledge) response as if it were a real search result. Only
  // applies to THIS (primary, grounding-requested) path — the deliberate
  // knowledge-fallback attempt below is a separate, explicitly-labeled mode
  // and never runs through this function.
  if (!params.usedSearchGrounding) return 'SEARCH_NOT_AVAILABLE';
  return bucketByCount(params.rawCount, params.keptCount);
}

/**
 * Section 1-3's "인터넷에서 목적에 필요한 실제 기술 조사" — the one genuinely
 * missing stage identified by investigating the existing pipeline (matching,
 * discovery/verification, hard intent exclusion, phase planning all already
 * exist and are left untouched — see techniqueMatcher.ts/intentClassifier.ts/
 * curriculumPlanner.ts). Runs Gemini WITH Google Search grounding — the same
 * `useSearchGrounding` flag userTechniques/verification.ts already uses to
 * verify a single technique's existence — one step earlier, to discover
 * candidate technique NAMES for the analyzed goal instead of confirming one
 * name already in hand.
 *
 * Best-effort for CURRICULUM GENERATION — a failed/thin research call never
 * blocks generation, the caller continues with the AI's-prior-knowledge-only
 * desiredTechniques it already had. It is NOT silently treated as success,
 * though: `status` always reflects what genuinely happened (spec section
 * 2/17 — "검색 실패를 검색 성공으로 취급하지 않는다"), and the caller
 * (service.ts) surfaces that status to the user instead of the old blanket
 * "AI 기존 지식만으로 진행 (품질 영향 없음)" claim.
 */
export async function researchTechniquesForGoal(analysis: GoalAnalysis, martialArt: string, totalDays: number = 14): Promise<TechniqueResearchOutcome> {
  const artScope =
    martialArt === MMA_MARTIAL_ART_ID
      ? `MMA(다음 실제 무술들의 조합 — ${MMA_SOURCE_MARTIAL_ARTS.join(', ')})`
      : (getMartialArt(martialArt)?.nameKo ?? martialArt);

  const diversityRequested = analysis.diversityRequested === true;
  const plannedQueries = buildResearchAngles(analysis, diversityRequested);
  const minimumRequiredCandidates = computeMinimumEvidenceCandidates(totalDays);

  /**
   * The SAME intent + confidence + near-duplicate filtering the final
   * return value always applied (spec sections 11/13/14) — extracted so the
   * web-search expansion loop below can run it cumulatively after every
   * wave to decide "do we have enough validated evidence yet", using the
   * exact same rules the final result will be judged by, not a looser
   * preview check.
   */
  function filterResearchedTechniques(
    raw: ResearchedTechnique[],
    mode: ResearchMode
  ): { techniques: ResearchedTechnique[]; excluded: ExcludedResearchTechnique[]; excludedOppositeCampCount: number } {
    const excluded: ExcludedResearchTechnique[] = [];
    let excludedOppositeCampCount = 0;
    const afterIntentFilter = raw.filter((r) => {
      if (!VALID_GOAL_INTENTS.has(r.intentGuess)) return true; // 'unknown' — let downstream classification decide
      const conflicts = intentMultiplier(analysis.intents, [r.intentGuess as GoalIntent]) === 0;
      if (conflicts) {
        excludedOppositeCampCount++;
        excluded.push({ name: r.name, reason: `목표와 반대되는 의도(${r.intentGuess})로 조사됨` });
      }
      return !conflicts;
    });

    // Spec section 14's "uncertain은 최종 커리큘럼에 자동 포함하지 마라" — only
    // meaningful for web_search-sourced candidates, where confidence is
    // grounded in actual retrieved evidence rather than Gemini's own
    // self-assessment of its prior knowledge.
    const afterConfidenceFilter = afterIntentFilter.filter((r) => {
      if (mode !== 'web_search' || typeof r.confidence !== 'number') return true;
      const uncertain = r.confidence < CONFIDENCE_UNCERTAIN_THRESHOLD || !r.evidence?.trim() || !r.sourceUrls?.length;
      if (uncertain) excluded.push({ name: r.name, reason: `근거가 충분하지 않아 확정할 수 없음(confidence ${r.confidence})` });
      return !uncertain;
    });

    // Spec section 10/15's dedup applied AT THE RESEARCH STAGE too — Gemini
    // itself sometimes returns near-duplicate names ("Double Leg" /
    // "Double-Leg Takedown" / "Basic Double Leg") across different search
    // angles/waves.
    const kept: ResearchedTechnique[] = [];
    const keptTokenSets: Set<string>[] = [];
    for (const r of afterConfidenceFilter) {
      const tokens = significantNameTokens(r.name);
      const dupIndex = keptTokenSets.findIndex((existing) => {
        if (existing.size === 0 || tokens.size === 0) return false;
        let intersection = 0;
        for (const t of tokens) if (existing.has(t)) intersection++;
        return intersection / (existing.size + tokens.size - intersection) >= 0.6;
      });
      if (dupIndex >= 0) {
        excluded.push({ name: r.name, reason: `이미 조사된 "${kept[dupIndex].name}"와 사실상 동일한 기술(중복)` });
        continue;
      }
      kept.push(r);
      keptTokenSets.push(tokens);
    }

    return { techniques: kept, excluded, excludedOppositeCampCount };
  }

  const intentLine =
    analysis.intents.length > 0
      ? `이 목적의 훈련 의도는 [${analysis.intents.join(', ')}] 중심이다 — 반드시 이 의도에 맞는 기술만 조사한다(반대 의도의 기술은 ` +
        '절대 포함하지 않는다. 예: 의도가 "defense"인데 상대를 제압하는 "attack" 성격의 진입 기술을 포함하면 안 된다).'
      : '';

  // Spec section 6/7's core fix: explicitly tells the researcher to
  // distinguish "이 목적을 위해 배워야 하는 사전 준비 동작"에서 "그 주제 자체인
  // 핵심 기술"을 구분하고, 다양성이 요청된 경우 서로 다른 메커니즘을 우선하라고
  // 지시한다 — Gemini's own research call was previously given NO signal at
  // all about this distinction, so it had no reason not to return generic
  // supporting skills as if they were on-topic finds.
  const diversityLine = diversityRequested
    ? [
        '사용자가 이 주제 "안에서의 다양성/폭"을 명시적으로 요청했다 — 다음을 반드시 지킨다:',
        '1) 핸드파이팅/그립 싸움, 브릿지, 히프 이스케이프, 기본 자세/스탠스, 풋워크, 컨디셔닝 같은 "이 주제를 배우기 위한 사전',
        '   준비 동작"은 절대 포함하지 않는다 — 오직 그 주제 자체인 구체적이고 서로 다른 명명된 기술만 조사한다.',
        '2) 같은 기술의 사소한 변형(예: "Double Leg" / "Double Leg Variation 1/2/3")을 여러 개 채워 넣지 않는다 — 가능한 한',
        '   서로 다른 메커니즘/진입 방식의 기술을 우선한다(예: 더블레그, 싱글렉, 발목픽, 바디락, 던지기 계열을 고르게).',
        '3) 위 planned research angles(아래 목록)의 각 관점을 실제로 검색해서 서로 다른 기술을 찾아본다.',
      ].join('\n')
    : [
        '사용자가 이 주제를 "처음부터 배우는" 목적이면(다양성 요청이 아니면) 사전 준비 동작(스탠스/핸드파이팅/그립 등)도',
        '정당한 결과다 — 이 경우 위 2)/3)의 다양성 제약은 적용하지 않는다.',
      ].join('\n');

  const anglesLine = plannedQueries.length > 0 ? `참고할 조사 관점(이 목록의 각 항목을 실제로 검색해볼 것): ${plannedQueries.join(' | ')}` : '';

  // Grounding with Google Search requires a billing-enabled Gemini project
  // — confirmed both by Google's own pricing page (ai.google.dev/gemini-api/
  // docs/pricing: "Not available" on the free tier for gemini-3.6-flash and
  // gemini-3.1-flash-lite) and by direct empirical testing (identical 429
  // RESOURCE_EXHAUSTED regardless of the tools[] key casing, while the exact
  // same ungrounded request on the same key succeeds). MARTIALDEX ships with
  // a free-tier key (see .env.example), so grounding can genuinely never
  // succeed on it without enabling billing — not a code bug. `groundedInstruction`
  // is used for the primary attempt; if that's gated, `attempt(..., false)`
  // below builds a DELIBERATELY different, explicitly-non-grounded prompt
  // (never the same text with the tool silently dropped) so a human reading
  // the prompt/response can never mistake this for "we searched the web".
  function buildSystemInstruction(grounded: boolean): string {
    const openingLine = grounded
      ? 'Google 검색을 사용해 실제로 존재하는 무술 기술만 조사하는 리서처 역할을 한다. 절대 기술을 지어내지 않는다.'
      : [
          '실시간 인터넷 검색은 이번 요청에서 사용할 수 없다 — 당신이 이미 알고 있는 지식만으로 답해야 한다.',
          '따라서 확신이 없거나 잘 알려지지 않은 기술은 절대 포함하지 마라. 오직 해당 무술에서 널리 알려진, 표준적인 정식',
          '기술명만 담는다(교재/도장에서 흔히 쓰이는 이름). 조금이라도 불확실하면 차라리 빼라 — 지어내는 것보다 적게',
          '보고하는 것이 낫다.',
        ].join('\n');
    const sourceLine = grounded
      ? '- source: 근거로 삼은 검색 결과의 출처(사이트명 또는 URL). 검색 없이 이미 확실히 아는 표준 기술이면 "general knowledge"'
      : '- source: 항상 "general knowledge (no live search)"로 고정한다 — 실시간 검색을 하지 않았으므로 검색 출처를 지어내지 않는다.';
    return [
      openingLine,
      `조사 대상 무술: ${artScope}`,
      intentLine,
      diversityLine,
      anglesLine,
      '',
      '사용자의 목표/부족한 부분/원하는 스타일을 바탕으로, 이 목적을 달성하는 데 실제로 필요한 표준 기술 이름을 찾는다.',
      grounded ? '모델이 이미 알고 있는 사전 지식이 아니라 실제 검색 결과에 근거해야 한다. 각 기술에 대해 다음을 담는다:' : '각 기술에 대해 다음을 담는다:',
      '- name: 표준 영문 또는 로마자 기술명(검색으로 확인된 실제 명칭)',
      '- martialArtGuess: 그 기술이 실제로 속한 무술(위 조사 대상 무술 범위 내에서만)',
      '- purpose: 이 기술이 왜 이 목적에 도움이 되는지 설명하는 한국어 1문장',
      '- intentGuess: "attack"|"defense"|"escape"|"counter"|"connection"|"fundamentals"|"unknown" 중 이 기술의 실제 성격',
      sourceLine,
      '',
      '다음은 절대 포함하지 않는다: 목적과 무관한 기술, 조사 대상 무술 범위 밖의 기술, 기술이 아닌 것(개념/전략 설명), 중복(같은',
      '기술의 다른 표기), 실제 존재 여부를 확인할 수 없는 기술, 목적과 반대되는 의도의 기술.',
      '최소 0개, 최대 12개의 기술을 담은 JSON 배열만 출력한다. 확실한 기술이 적으면 있는 만큼만 출력하고, 억지로 채우지 않는다.',
      '',
      '출력 형식: [{ "name": string, "martialArtGuess": string, "purpose": string, "intentGuess": string, "source": string }, ...]',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const systemInstruction = buildSystemInstruction(true);
  const fallbackSystemInstruction = buildSystemInstruction(false);

  /**
   * The extraction prompt for real web-search mode — deliberately distinct
   * wording from both buildSystemInstruction() variants: this one is never
   * asked to "search" (grounded) or "recall" (knowledge fallback) — it is
   * handed ACTUAL retrieved page content in contextText and told to extract
   * only what's genuinely present in it, with mandatory evidence/sourceUrls
   * (enforced by isWebSearchResearchArray's stricter type guard).
   */
  function buildWebSearchExtractionInstruction(): string {
    return [
      '아래 contextText에 실제 웹 검색으로 얻은 자료(제목/URL/본문 발췌)가 여러 개 주어진다.',
      '이 자료 안에 실제로 등장하는 무술 기술만 추출한다 — 자료에 언급되지 않은 기술을 지어내면 절대 안 된다.',
      `조사 대상 무술: ${artScope}`,
      intentLine,
      diversityLine,
      '',
      '각 기술에 대해 다음을 담는다:',
      '- name: 표준 영문 또는 로마자 기술명',
      '- martialArtGuess: 그 기술이 실제로 속한 무술(위 조사 대상 무술 범위 내에서만)',
      '- purpose: 이 기술이 왜 이 목적에 도움이 되는지 설명하는 한국어 1문장',
      '- intentGuess: "attack"|"defense"|"escape"|"counter"|"connection"|"fundamentals"|"unknown" 중 이 기술의 실제 성격',
      '- sourceUrls: 이 기술이 실제로 언급된 자료의 URL 배열(반드시 제공된 자료의 url 중에서만 고른다, 최소 1개)',
      '- sourceTitles: 위 URL들의 제목 배열(제공된 자료의 title을 그대로 사용)',
      '- evidence: 그 자료의 내용 중 실제로 이 기술을 언급하는 부분을 짧게 인용하거나 요약(지어내지 않는다)',
      '- confidence: 0-100, 제공된 자료만으로 이 기술이 실존한다고 얼마나 확신하는지(막연하게 스치듯 언급됐으면 낮게 준다)',
      '',
      '다음은 절대 포함하지 않는다: 제공된 자료에 실제로 등장하지 않는 기술, 목적과 무관한 기술, 조사 대상 무술 범위 밖의 기술,',
      '기술이 아닌 것(개념/전략 설명), 중복, 목적과 반대되는 의도의 기술. 자료에 근거가 없으면 억지로 채우지 말고 빼라.',
      '최소 0개, 최대 12개의 기술을 담은 JSON 배열만 출력한다.',
      '',
      '출력 형식: [{ "name": string, "martialArtGuess": string, "purpose": string, "intentGuess": string, "sourceUrls": string[], "sourceTitles": string[], "evidence": string, "confidence": number }, ...]',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const contextParts = [
    `목표 요약: ${analysis.summary}`,
    analysis.goals.length > 0 ? `훈련 목표: ${analysis.goals.join(', ')}` : '',
    analysis.weaknesses.length > 0 ? `부족한 부분: ${analysis.weaknesses.join(', ')}` : '',
    analysis.desiredStyle.length > 0 ? `원하는 스타일: ${analysis.desiredStyle.join(', ')}` : '',
    analysis.desiredTechniques.length > 0 ? `이미 알고 있는 원하는 기술: ${analysis.desiredTechniques.join(', ')}` : '',
  ].filter(Boolean);

  const question = '위 목표를 달성하는 데 실제로 필요한 기술을 인터넷에서 조사해줘.';
  const retryQuestion = '위 목표를 달성하는 데 실제로 필요한 기술을 인터넷에서 조사해줘. 구체적으로 이름이 있는 실제 기술을 최소 5개 이상 찾아봐.';

  log('intent parsed', { intents: analysis.intents, diversityRequested });
  log('search angles planned', plannedQueries);

  async function attempt(q: string, grounded = true) {
    log('search request started', { grounded });
    return askGeminiForJsonWithGrounding<ResearchedTechnique[]>({
      systemInstruction: grounded ? systemInstruction : fallbackSystemInstruction,
      contextText: contextParts.join('\n'),
      question: q,
      useSearchGrounding: grounded,
      validate: isResearchArray,
    });
  }

  // ===== Priority 1: real external web search (webSearchProvider, Tavily
  // by default) — spec sections 2-3: "Grounding을 유일한 검색 수단으로 쓰지
  //마라... 실제 외부 검색을 반드시 수행할 수 있는 독립적인 검색 계층을 추가".
  // Attempted BEFORE Google Search grounding, which is billing-gated (see
  // buildSystemInstruction's doc comment).
  //
  // One real Tavily call for a set of queries, deduping against URLs already
  // seen in EARLIER waves (the `seenUrls` set is shared across the whole
  // expansion loop below, not just within one wave) — spec section 10's
  // "중복 검색 결과 제거".
  async function runSearchWave(
    queries: string[],
    seenUrls: Set<string>
  ): Promise<{ collected: SearchResult[]; executedQueries: string[]; attemptedAny: boolean; anySuccess: boolean; notConfigured: boolean; lastError: string | null }> {
    const collected: SearchResult[] = [];
    const executedQueries: string[] = [];
    let attemptedAny = false;
    let anySuccess = false;
    let notConfigured = false;
    let lastError: string | null = null;

    for (const q of queries) {
      const outcome = await webSearchProvider.search(q);
      attemptedAny = true;
      if (!outcome.ok) {
        structuredLog('CURRICULUM_RESEARCH', { provider: 'tavily', query: q, results: 0, status: outcome.code === 'NO_API_KEY' ? 'not_configured' : 'failed' });
        if (outcome.code === 'NO_API_KEY') {
          notConfigured = true;
          break; // feature isn't set up at all — stop immediately, don't burn the other planned queries
        }
        lastError = outcome.message;
        continue; // one query failing never aborts the others (spec section 5's "개별 실패는 skip, 전체 실패와 구분")
      }
      anySuccess = true;
      structuredLog('CURRICULUM_RESEARCH', { provider: 'tavily', query: q, results: outcome.results.length, status: 'success' });
      executedQueries.push(q);
      for (const r of outcome.results) {
        if (seenUrls.has(r.url)) continue;
        seenUrls.add(r.url);
        collected.push(r);
      }
    }
    return { collected, executedQueries, attemptedAny, anySuccess, notConfigured, lastError };
  }

  /** Same Gemini extraction prompt/validation/retry as before, parameterized on a source slice so each expansion wave can extract from just its OWN newly-collected (already URL-deduped) pages. */
  async function extractTechniquesFromSources(sources: SearchResult[]) {
    const sourcesBlock = sources
      .map((r, i) => `[${i + 1}] title: ${r.title}\nurl: ${r.url}\ncontent: ${(r.content ?? r.snippet ?? '(내용 없음)').slice(0, 1500)}`)
      .join('\n\n');
    const extractionContext = `${contextParts.join('\n')}\n\n=== 실제 검색 결과 자료 (아래 자료에 실제로 등장하는 기술만 추출할 것) ===\n${sourcesBlock}`;
    async function attemptExtraction() {
      return askGeminiForJsonWithGrounding<ResearchedTechnique[]>({
        systemInstruction: buildWebSearchExtractionInstruction(),
        contextText: extractionContext,
        question: '위 실제 검색 결과 자료에서 실제로 언급된 기술만 추출해줘. 자료에 없는 기술은 지어내지 마라.',
        useSearchGrounding: false, // real content is already in hand — grounding here would just add a (billing-gated) call for no benefit
        validate: isWebSearchResearchArray,
      });
    }
    let extraction = await attemptExtraction();
    // Same bounded single retry as the grounded attempt()'s RETRYABLE_CODES
    // handling — a large sources block occasionally trips a transient
    // format issue (observed: PARSE_ERROR) unrelated to the content itself.
    if (!extraction.ok && RETRYABLE_CODES.has(extraction.code)) {
      log('web search extraction failed, retrying once', { code: extraction.code });
      extraction = await attemptExtraction();
    }
    return extraction;
  }

  // Bounded so this can never search indefinitely — spec section 9's
  // "무한 검색하지 않는다": at most 1 initial wave + this many EXPANSION
  // waves, each capped at MAX_WEB_SEARCH_QUERIES real Tavily calls.
  const MAX_EXPANSION_WAVES = 2;

  /**
   * Spec section 1/8/9/12's core new behavior: if the initial wave's
   * validated (evidence+intent+dedup-passing) candidate count doesn't clear
   * `minimumRequiredCandidates`, tries up to MAX_EXPANSION_WAVES more waves
   * with DIFFERENTLY-FRAMED queries (never repeating the same query text),
   * re-checking the CUMULATIVE validated count after every wave using the
   * exact same filterResearchedTechniques() rules the final result is judged
   * by. Returns null only when Tavily was never actually configured/reached
   * at all (unchanged "fall through silently" behavior). Returns
   * `insufficientAfterExpansion: true` when real search genuinely ran (at
   * least one HTTP-level success) but still came up short even after
   * expansion — spec section 15-B's 'insufficient_web_evidence', distinct
   * from an outright API failure (`ok: false` below, which still falls
   * through to the existing grounded/knowledge_fallback chain unchanged,
   * per spec section 15-A/35's "이 정책은 변경하지 않는다").
   */
  async function attemptWebSearchWithExpansion(): Promise<{
    ok: boolean;
    techniques: ResearchedTechnique[];
    rawCount: number;
    searchResultCount: number;
    analyzedSourceCount: number;
    executedQueries: string[];
    wavesRun: number;
    insufficientAfterExpansion: boolean;
    errorMessage?: string;
  } | null> {
    const initialQueries = plannedQueries.slice(0, MAX_WEB_SEARCH_QUERIES);
    if (initialQueries.length === 0) return null; // shouldn't happen now that buildResearchAngles has a deterministic floor, but keep the guard

    const seenUrls = new Set<string>();
    const allExecutedQueries: string[] = [];
    const rawTechniquesAcc: ResearchedTechnique[] = [];
    let totalRawResultCount = 0;
    let totalAnalyzedSourceCount = 0;
    let anyAttempted = false;
    let anySuccessOverall = false;
    let notConfigured = false;
    let lastError: string | null = null;
    let wavesRun = 0;

    for (let waveIndex = 0; waveIndex <= MAX_EXPANSION_WAVES; waveIndex++) {
      const rawWaveQueries = waveIndex === 0 ? initialQueries : buildExpansionAngles(analysis, waveIndex);
      const waveQueries = rawWaveQueries.filter((q) => !allExecutedQueries.includes(q));
      if (waveQueries.length === 0) continue;

      const wave = await runSearchWave(waveQueries, seenUrls);
      anyAttempted = anyAttempted || wave.attemptedAny;
      anySuccessOverall = anySuccessOverall || wave.anySuccess;
      if (wave.lastError) lastError = wave.lastError;
      if (wave.notConfigured) {
        notConfigured = true;
        break;
      }
      allExecutedQueries.push(...wave.executedQueries);
      totalRawResultCount += wave.collected.length;
      wavesRun++;

      if (wave.collected.length > 0) {
        const sourcesForExtraction = wave.collected.slice(0, MAX_SOURCES_FOR_EXTRACTION);
        totalAnalyzedSourceCount += sourcesForExtraction.length;
        const extraction = await extractTechniquesFromSources(sourcesForExtraction);
        if (extraction.ok) {
          structuredLog('CURRICULUM_CANDIDATES', { phase: waveIndex === 0 ? 'initial' : 'expansion', candidateCount: extraction.data.length, analyzedSources: sourcesForExtraction.length });
          rawTechniquesAcc.push(...extraction.data);
        } else {
          log('web search extraction failed', { wave: waveIndex, code: extraction.code, message: extraction.message });
        }
      }

      // Cumulative sufficiency check, using the SAME filter the final return
      // value will be judged by (spec section 12's "다시 계산").
      const filtered = filterResearchedTechniques(rawTechniquesAcc, 'web_search');
      structuredLog('CURRICULUM_RESEARCH', {
        phase: waveIndex === 0 ? 'initial' : 'expansion',
        provider: 'tavily',
        queries: waveQueries.length,
        results: wave.collected.length,
        validatedCandidates: filtered.techniques.length,
        minimumRequired: minimumRequiredCandidates,
      });
      if (filtered.techniques.length >= minimumRequiredCandidates) {
        return {
          ok: true,
          techniques: rawTechniquesAcc,
          rawCount: rawTechniquesAcc.length,
          searchResultCount: totalRawResultCount,
          analyzedSourceCount: totalAnalyzedSourceCount,
          executedQueries: allExecutedQueries,
          wavesRun,
          insufficientAfterExpansion: false,
        };
      }
    }

    if (!anyAttempted || notConfigured) return null; // never even reached Tavily — caller falls through to grounded/knowledge_fallback, unchanged

    if (!anySuccessOverall) {
      // EVERY real Tavily call across every wave failed at the HTTP/API
      // level (invalid key, rate limit, network, server error, ...) — this
      // is Tavily itself failing (spec section 15-A), not "search succeeded
      // but evidence is thin" (15-B). Falls through to the existing
      // grounded/knowledge_fallback chain, unchanged per spec section 35.
      return {
        ok: false,
        techniques: [],
        rawCount: 0,
        searchResultCount: 0,
        analyzedSourceCount: 0,
        executedQueries: allExecutedQueries,
        wavesRun,
        insufficientAfterExpansion: false,
        errorMessage: lastError ?? '검색 결과가 없습니다.',
      };
    }

    // At least one real Tavily call succeeded at the HTTP level across the
    // initial + expansion waves, but the validated candidate count never
    // cleared minimumRequiredCandidates even after exhausting the bounded
    // expansion budget — spec section 15-B/16's 'insufficient_web_evidence'.
    return {
      ok: true,
      techniques: rawTechniquesAcc,
      rawCount: rawTechniquesAcc.length,
      searchResultCount: totalRawResultCount,
      analyzedSourceCount: totalAnalyzedSourceCount,
      executedQueries: allExecutedQueries,
      wavesRun,
      insufficientAfterExpansion: true,
    };
  }

  const webSearchAttempt = await attemptWebSearchWithExpansion();

  let researchMode: ResearchMode = 'grounded';
  let rawTechniques: ResearchedTechnique[] = [];
  let usedSearchGroundingFinal = false;
  let groundingSourcesFinal: GroundingSource[] = [];
  let actualSearchQueriesFinal: string[] = [];
  let usedExternalWebSearch = false;
  let executedQueriesFinal: string[] = [];
  let searchResultCountFinal = 0;
  let analyzedSourceCountFinal = 0;
  let wavesRunFinal = 0;

  if (webSearchAttempt && webSearchAttempt.ok && !webSearchAttempt.insufficientAfterExpansion && webSearchAttempt.techniques.length > 0) {
    log('web search research ok', { results: webSearchAttempt.techniques.length, wavesRun: webSearchAttempt.wavesRun });
    researchMode = 'web_search';
    rawTechniques = webSearchAttempt.techniques;
    usedExternalWebSearch = true;
    executedQueriesFinal = webSearchAttempt.executedQueries;
    searchResultCountFinal = webSearchAttempt.searchResultCount;
    analyzedSourceCountFinal = webSearchAttempt.analyzedSourceCount;
    wavesRunFinal = webSearchAttempt.wavesRun;
  } else if (webSearchAttempt && webSearchAttempt.ok && webSearchAttempt.insufficientAfterExpansion) {
    // Tavily genuinely executed — real HTTP-level success across the
    // initial + expansion waves — but never produced enough validated,
    // evidence-backed candidates. Spec section 15-B/16's
    // 'insufficient_web_evidence': explicitly distinct from Tavily itself
    // failing (the else-branch below). The caller (service.ts) must stop
    // generation here rather than let fallbackTechniquePool or the
    // knowledge_fallback chain quietly stand in (spec section 4/13/20).
    log('web search ran but evidence stayed insufficient after expansion', { results: webSearchAttempt.techniques.length, wavesRun: webSearchAttempt.wavesRun });
    researchMode = 'insufficient_web_evidence';
    rawTechniques = webSearchAttempt.techniques;
    usedExternalWebSearch = true;
    executedQueriesFinal = webSearchAttempt.executedQueries;
    searchResultCountFinal = webSearchAttempt.searchResultCount;
    analyzedSourceCountFinal = webSearchAttempt.analyzedSourceCount;
    wavesRunFinal = webSearchAttempt.wavesRun;
  } else {
    // Web search wasn't configured, found nothing, or extraction failed —
    // fall through to the existing grounded -> knowledge_fallback chain
    // (unchanged behavior from before this addition).
    let result: Awaited<ReturnType<typeof attempt>>;
    try {
      result = await attempt(question);
      // Bounded single retry (spec section 3's "재검색 / 다른 검색어 시도") —
      // only for plausibly-transient/format failures, and only ONCE, so this
      // can never loop or meaningfully add to the free-tier request budget.
      if (!result.ok && RETRYABLE_CODES.has(result.code)) {
        log('search response failed, retrying once', { code: result.code });
        result = await attempt(retryQuestion);
      } else if (result.ok && result.data.length === 0) {
        log('search response empty, retrying once with a stronger prompt');
        const retried = await attempt(retryQuestion);
        if (retried.ok && retried.data.length > 0) result = retried;
      }

      // Grounding is billing-gated on this project's free-tier key (see
      // buildSystemInstruction's doc comment) — RATE_LIMIT/NETWORK on a
      // grounded attempt is exactly that signature, not a transient blip worth
      // retrying with the SAME (grounded) request again. Falls back ONCE to an
      // explicitly ungrounded attempt (never retried further) so the feature
      // degrades gracefully instead of failing outright.
      if (!result.ok && (result.code === 'RATE_LIMIT' || result.code === 'NETWORK')) {
        log('grounding unavailable, falling back to one ungrounded attempt', { code: result.code });
        const fallback = await attempt(question, false);
        if (fallback.ok) {
          result = fallback;
          researchMode = 'knowledge_fallback';
        } else {
          researchMode = 'unavailable';
        }
      } else if (!result.ok) {
        researchMode = 'unavailable';
      }
    } catch (e) {
      log('search request threw', e instanceof Error ? e.message : String(e));
      return {
        ok: false,
        status: 'SEARCH_FAILED',
        techniques: [],
        excluded: [],
        rawCount: 0,
        excludedOppositeCampCount: 0,
        usedSearchGrounding: false,
        groundingSources: [],
        plannedQueries,
        actualSearchQueries: [],
        errorMessage: e instanceof Error ? e.message : String(e),
        researchMode: 'unavailable',
        usedExternalWebSearch: false,
        executedQueries: [],
        searchResultCount: 0,
        analyzedSourceCount: 0,
        wavesRun: 0,
      };
    }

    if (!result.ok) {
      return {
        ok: false,
        status: deriveSearchStatus({ ok: false, code: result.code, usedSearchGrounding: false, rawCount: 0, keptCount: 0 }),
        techniques: [],
        excluded: [],
        rawCount: 0,
        excludedOppositeCampCount: 0,
        usedSearchGrounding: false,
        groundingSources: [],
        plannedQueries,
        actualSearchQueries: [],
        errorMessage: result.message,
        researchMode,
        usedExternalWebSearch: false,
        executedQueries: webSearchAttempt?.executedQueries ?? [],
        searchResultCount: webSearchAttempt?.searchResultCount ?? 0,
        analyzedSourceCount: webSearchAttempt?.analyzedSourceCount ?? 0,
        wavesRun: webSearchAttempt?.wavesRun ?? 0,
      };
    }

    log('search response ok', { results: result.data.length, actualQueries: result.webSearchQueries });
    rawTechniques = result.data;
    usedSearchGroundingFinal = result.usedSearchGrounding;
    groundingSourcesFinal = result.groundingSources;
    actualSearchQueriesFinal = result.webSearchQueries ?? [];
  }

  // Uses the SAME filterResearchedTechniques() the expansion loop above used
  // to decide sufficiency — never a second, looser pass. `filterMode` is
  // 'web_search' for BOTH researchMode 'web_search' and
  // 'insufficient_web_evidence' (both are real-evidence-sourced; only the
  // sufficiency verdict differs), so confidence filtering never gets
  // silently skipped for the insufficient case.
  const filterMode: ResearchMode = usedExternalWebSearch ? 'web_search' : researchMode;
  const { techniques, excluded, excludedOppositeCampCount } = filterResearchedTechniques(rawTechniques, filterMode);

  // The knowledge-fallback attempt is deliberately ungrounded, and the
  // web-search extraction call is deliberately ungrounded too (real content
  // already in hand) — feeding usedSearchGrounding:false through
  // deriveSearchStatus for either would trip its "requested grounding but
  // didn't happen" rule and mislabel a successful, intentional result as
  // SEARCH_NOT_AVAILABLE. bucketByCount applies the same count thresholds
  // without that grounding-mismatch check. Also covers 'insufficient_web_evidence'
  // — that mode's status naturally comes out SEARCH_PARTIAL/SEARCH_FAILED
  // from the thin count, which is honest; researchMode (not status) is what
  // service.ts gates the hard "stop generation" decision on.
  const status =
    researchMode === 'knowledge_fallback' || researchMode === 'web_search' || researchMode === 'insufficient_web_evidence'
      ? bucketByCount(rawTechniques.length, techniques.length)
      : deriveSearchStatus({
          ok: true,
          usedSearchGrounding: usedSearchGroundingFinal,
          rawCount: rawTechniques.length,
          keptCount: techniques.length,
        });
  log('candidate techniques after intent+confidence+dedup filter', techniques.map((t) => t.name));
  log('search status', { status, researchMode });
  structuredLog('CURRICULUM_CANDIDATES', {
    candidateCount: rawTechniques.length,
    validatedCount: techniques.length,
    researchMode,
    status,
    fallbackCandidates: 0,
  });

  return {
    ok: status === 'SEARCH_SUCCESS' || status === 'SEARCH_PARTIAL',
    status,
    techniques,
    excluded,
    rawCount: rawTechniques.length,
    excludedOppositeCampCount,
    usedSearchGrounding: usedSearchGroundingFinal,
    groundingSources: groundingSourcesFinal,
    plannedQueries,
    actualSearchQueries: actualSearchQueriesFinal,
    researchMode,
    usedExternalWebSearch,
    executedQueries: executedQueriesFinal,
    wavesRun: wavesRunFinal,
    searchResultCount: searchResultCountFinal,
    analyzedSourceCount: analyzedSourceCountFinal,
  };
}

/**
 * Merges researched technique names into analysis.desiredTechniques
 * (case-insensitive de-dupe against what's already there) — additive only,
 * never replaces the AI's own prior-knowledge phrases. Every downstream
 * consumer (matchGoalToTechniques's weight-45 desiredTechniques field,
 * discoverMissingDesiredTechniques's per-phrase verification loop) reads
 * analysis.desiredTechniques as-is, so merging here — and nowhere else — is
 * enough to route researched names through the EXISTING matching/discovery/
 * intent-filtering pipeline completely unchanged.
 */
export function mergeResearchedTechniques(analysis: GoalAnalysis, researched: ResearchedTechnique[]): number {
  const existingLower = new Set(analysis.desiredTechniques.map((t) => t.toLowerCase().trim()));
  let merged = 0;
  for (const r of researched) {
    const name = r.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (existingLower.has(key)) continue;
    existingLower.add(key);
    analysis.desiredTechniques.push(name);
    merged++;
  }
  return merged;
}
