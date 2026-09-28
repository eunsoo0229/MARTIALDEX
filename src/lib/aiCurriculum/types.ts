// "AI 맞춤 커리큘럼" — an independent feature from "선수 스타일 학습"
// (src/lib/fighterStyle/): the user describes a training GOAL in free text
// (never a fighter's name as the primary subject) and gets a curriculum
// built from that. Reuses genuinely generic pieces (Gemini JSON-mode
// helper, phase classification, the day-scheduling algorithm) but keeps its
// own types/meta field so the two features never share persisted state.

import type { TechniqueStructureRole } from './structureClassifier';

export type GoalUserLevel = 'beginner' | 'intermediate' | 'advanced';
export type GoalIntensity = 'light' | 'normal' | 'intensive';
export type GoalDurationMode = 'ai_recommended' | 'user_selected';

/**
 * Research/matching pipeline's own honest self-report — never collapsed
 * into a single ok/fail boolean again (that was the root cause of showing
 * "조사 완료"-equivalent framing even when the internet-research stage had
 * silently fallen back to the AI's own prior knowledge). See
 * techniqueResearch.ts's deriveSearchStatus().
 * - SEARCH_SUCCESS: grounded search ran and returned enough genuinely
 *   relevant, non-generic technique candidates.
 * - SEARCH_PARTIAL: grounded search ran but returned few/low-specificity
 *   results (mostly generic/duplicate) — usable, but thin.
 * - SEARCH_FAILED: the search attempt itself failed (network/timeout/empty/
 *   parse error) after Gemini/grounding WAS available to try.
 * - SEARCH_NOT_AVAILABLE: search couldn't even be attempted (no API key
 *   configured, invalid key, or not logged in on the Android/web transport)
 *   — a configuration/availability problem, not a transient failure.
 */
export type SearchStatus = 'SEARCH_SUCCESS' | 'SEARCH_PARTIAL' | 'SEARCH_FAILED' | 'SEARCH_NOT_AVAILABLE';

/**
 * HOW the research candidates were obtained — a separate axis from
 * SearchStatus (which only says whether the attempt produced usable
 * results). Confirmed via real testing + Google's own pricing page
 * (ai.google.dev/gemini-api/docs/pricing): Grounding with Google Search is
 * "Not available" on the free tier for gemini-3.6-flash/gemini-3.1-flash-lite
 * (requires a billing-enabled/paid project) — this is a project tier
 * limitation, not a code bug, and not something MARTIALDEX can silently work
 * around. When grounding is gated this way, techniqueResearch.ts falls back
 * to ONE ungrounded attempt so the feature doesn't die outright, but the
 * result must never be presented as if a real web search happened.
 * - 'web_search': a REAL external web search ran (webSearchProvider, Tavily
 *   by default — see src/lib/webSearch/) and candidates were extracted from
 *   ACTUAL retrieved page content/snippets, never from Gemini's own prior
 *   knowledge. The highest-trust mode — attempted FIRST when TAVILY_API_KEY
 *   is configured, before Google Search grounding is ever tried.
 * - 'grounded': Google Search grounding actually ran (usedSearchGrounding true).
 * - 'knowledge_fallback': grounding failed (RATE_LIMIT/NETWORK) and the
 *   ungrounded fallback attempt is what produced these candidates —
 *   Gemini's own training knowledge only, explicitly told to name only
 *   well-established standard techniques, never presented as "searched".
 * - 'unavailable': neither web search, grounding, nor the knowledge fallback
 *   produced anything usable (or failed for a config/auth reason where a
 *   silent fallback would hide a real problem — see SEARCH_UNAVAILABLE_CODES).
 * - 'insufficient_web_evidence': Tavily genuinely executed — at least one
 *   real HTTP call succeeded, across the initial queries and up to 2 bounded
 *   expansion waves with differently-framed queries (techniqueResearch.ts's
 *   attemptWebSearchWithExpansion) — but never produced enough validated,
 *   evidence-backed candidates to safely build a curriculum from. Distinct
 *   from 'knowledge_fallback': that mode means Tavily itself failed/wasn't
 *   reachable; this one means Tavily worked but the goal's real-world
 *   evidence was too thin. generateGoalCurriculumPreview() must NEVER pad
 *   this out with MARTIALDEX's whole technique DB (fallbackTechniquePool) —
 *   it stops generation outright and reports the shortfall honestly instead.
 */
export type ResearchMode = 'web_search' | 'grounded' | 'knowledge_fallback' | 'unavailable' | 'insufficient_web_evidence';

/** A researched technique's relationship to Martialdex's own technique library — spec's "registered/external_only/uncertain" 3-way split. 'uncertain' candidates are never auto-merged into a curriculum (see mergeResearchedTechniques). */
export type ResearchedTechniqueDbStatus = 'registered' | 'external_only' | 'uncertain';

/**
 * What kind of training the user is actually asking for — independent of
 * which martial art or which specific technique names are involved. This is
 * the axis that was previously lost between goal analysis and technique
 * matching: "테이크다운 방어" and "테이크다운 공격" produced nearly identical
 * matched phrases (both mention "테이크다운"), so techniqueMatcher.ts had no
 * way to tell an offensive Double Leg apart from a defensive Sprawl. See
 * intentClassifier.ts for how this is derived and applied.
 */
export type GoalIntent = 'attack' | 'defense' | 'escape' | 'counter' | 'connection' | 'fundamentals';

export const GOAL_DURATION_PRESETS = [7, 14, 30, 60, 90] as const;
export const GOAL_MIN_DURATION_DAYS = 7;
export const GOAL_MAX_DURATION_DAYS = 180;
export const GOAL_DAILY_MINUTES_PRESETS = [15, 30, 45, 60, 90] as const;

/** What Gemini extracts from the user's free-text goal (spec section 2). */
export interface GoalAnalysis {
  /** Confirmed martial art id — defaults to the user's dropdown choice unless the text clearly says otherwise. */
  martialArt: string;
  estimatedLevel: GoalUserLevel;
  /** Free-text phrases, e.g. "풋워크", "거리 조절". */
  weaknesses: string[];
  /** e.g. "아웃복싱", "압박형". */
  desiredStyle: string[];
  /** Literal technique names/phrases the user mentioned. */
  desiredTechniques: string[];
  /** e.g. "인파이팅 강화", "테이크다운 방어". */
  goals: string[];
  /** Same phrases as the fields above, ordered most-important first. */
  priority: string[];
  /** Which training-intent(s) the goal centers on (see GoalIntent) — usually 1-2, ordered most-important first. May be empty if genuinely ambiguous; resolveGoalIntents() (intentClassifier.ts) sanitizes/back-fills this. */
  intents: GoalIntent[];
  /**
   * True when the user is asking to see BREADTH within a technique topic
   * (e.g. "테이크다운의 다양성을 알고 싶어") rather than to learn it from
   * scratch including its prerequisites (e.g. "초보자가 테이크다운을 배우기
   * 위한 4주 커리큘럼" — spec scenario B, where fundamentals/hand-fighting
   * SHOULD be included). Gemini's own best-effort read of this; always
   * routed through resolveDiversityRequested() (diversity.ts) before use,
   * which also trusts an explicit keyword in the user's own text even if
   * this field came back false.
   */
  diversityRequested: boolean;
  /**
   * Clean, search-engine-friendly English/romanized topic phrases (e.g.
   * ["wrestling takedown", "takedown variations"]) — DELIBERATELY separate
   * from desiredTechniques/goals/priority above, which preserve the user's
   * own wording (including Korean, and including diversity-adjective
   * clutter like "다양한"/"습득") for relevance-scoring purposes. Mixing the
   * two concerns in one field was the root cause of search queries like
   * "다양한 테이크다운 스타일 techniques" (a literal Korean phrase with
   * "techniques" mechanically appended) — see techniqueResearch.ts's
   * buildResearchAngles(), which now builds from this field instead.
   * 1-3 short phrases, empty if the goal is too vague to name a clean topic.
   */
  searchTopics: string[];
  /** Set only when the user's text names a specific real fighter to emulate (spec section 11's tail). */
  referencedFighterName: string | null;
  /** Non-null only when the text is too vague to build a meaningful curriculum from (spec section 3). */
  clarifyingQuestion: string | null;
  /** One-line "당신의 목표" summary for the preview screen. */
  summary: string;
  /** AI's own duration suggestion, used only when the user asked for "AI 추천" instead of a fixed day count. */
  suggestedDurationDays: number;
  durationReason: string;
}

export type GoalPhaseKey = 'fundamentals' | 'entries' | 'position' | 'connection' | 'situational';

export interface GoalTechniqueMatch {
  techniqueId: string;
  techniqueName: string;
  martialArt: string;
  /** 0-100, deterministic (search-rank x field weight x priority boost) — never random. */
  relevanceScore: number;
  reason: string;
  phase: GoalPhaseKey;
  /** How directly this technique IS what was asked for vs. a supporting skill (structureClassifier.ts) — always set, but only affects scoring when the goal's diversityRequested is true. */
  structureRole: TechniqueStructureRole;
  /** Set only by discoverMissingDesiredTechniques for a genuinely-new registration where a real video-search result was found and persisted (techniqueDiscovery/service.ts's attachDiscoveredVideo) — undefined for every other match (existing techniques already have their own real video story, curated or not). */
  videoAttached?: boolean;
}

/** Persisted "ingredients" on Curriculum.aiGoalMeta — lets regeneration/refinement skip re-analysis when possible. */
export interface AiGoalCurriculumMeta {
  goalText: string;
  analysis: GoalAnalysis;
  matchedTechniques: GoalTechniqueMatch[];
  durationMode: GoalDurationMode;
  intensity: GoalIntensity;
  dailyMinutes: number;
  generatedAt: string;
  /** Each user-typed "다시 만들어달라" request, oldest first — passed back to Gemini as extra context on regenerate. */
  refinementHistory: string[];
}
