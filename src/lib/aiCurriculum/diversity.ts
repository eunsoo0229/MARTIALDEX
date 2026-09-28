import type { GoalAnalysis, GoalTechniqueMatch } from './types';

// Spec section 6's exact trigger phrases (Korean + English), plus a few
// direct synonyms — deterministic keyword probe, same style as
// intentClassifier.ts's classifyIntentsFromText. Word-boundary-guarded on
// the Latin terms only (Korean has no word-boundary concept in JS regex).
const DIVERSITY_RE =
  /다양하게|다양한\s*기술|다양성|여러\s*종류|종류별|폭넓게|여러\s*스타일|여러\s*방법|골고루|\bdifferent\s+types?\b|\bvariety\b|\bvariations?\b|\bwide\s+range\b/i;

/**
 * Whether the goal is asking to see BREADTH within a technique topic (spec
 * section 6) — this is the switch that turns on structural-role demotion
 * (structureClassifier.ts) and family-based dedup (selectDiverseTechniques
 * below). Trusts Gemini's own `diversityRequested` field when it says true,
 * but a plain keyword hit in the user's own words is trusted too even if
 * Gemini's field came back false/missing — same "deterministic floor under
 * an AI field" pattern as intentClassifier.ts's resolveGoalIntents (an
 * explicit "다양하게" in the user's own text must never be silently missed
 * because a JSON field happened to be false).
 */
export function resolveDiversityRequested(
  analysis: Pick<GoalAnalysis, 'diversityRequested' | 'summary' | 'goals' | 'weaknesses' | 'desiredTechniques'>,
  freeText: string
): boolean {
  if (analysis.diversityRequested === true) return true;
  const combined = [freeText, analysis.summary, ...analysis.goals, ...analysis.weaknesses, ...analysis.desiredTechniques].join(' ');
  return DIVERSITY_RE.test(combined);
}

const FAMILY_STOPWORDS = new Set([
  'basic', 'standard', 'the', 'a', 'an', 'to', 'with', 'from', 'drill', 'drilling', 'technique', 'techniques',
  'takedown', 'takedowns', 'throw', 'throws', 'entry', 'entries', 'finish', 'finishing', 'finishes',
  'setup', 'variation', 'variations', 'position', 'style', 'defense', 'defence', 'counter', 'reversal',
  'and', 'or', 'vs', 'for', 'of', 'into', 'i', 'ii', 'iii', 'iv',
]);

/** Lowercased, punctuation-stripped, filler-word-stripped token SET for a technique name — the basis for family-similarity grouping below. Exported for reuse by research-stage de-dup (spec section 15). */
export function significantNameTokens(name: string): Set<string> {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !FAMILY_STOPWORDS.has(w) && !/^\d+$/.test(w));
  return new Set(tokens);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

/** Case/whitespace-insensitive name equality check used to line up a researched technique name with the real matched technique it resolved to (service.ts's research-summary reporting) — deliberately looser than exact string equality but stricter than the family-clustering below. */
export function namesLikelySame(a: string, b: string): boolean {
  const na = significantNameTokens(a);
  const nb = significantNameTokens(b);
  return jaccardSimilarity(na, nb) >= 0.6;
}

const FAMILY_SIMILARITY_THRESHOLD = 0.5;

export interface SelectDiverseOptions {
  /** No-op guard — false leaves `matches` completely untouched (spec scenario B: a plain "초보자용 4주 커리큘럼" goal must never get its content reordered/thinned by this). */
  diversityRequested: boolean;
  /** How many near-duplicate-family members can rank ahead of being pushed to the tail (never dropped — see below). */
  maxPerFamily?: number;
}

/**
 * Spec sections 6/14/15 combined: when a goal explicitly wants variety, stop
 * near-duplicate variants of the SAME mechanism (e.g. "Basic Double Leg" /
 * "Double Leg from Tie" / "Double Leg Finish") from crowding out a spread of
 * genuinely different techniques — without ever deleting content. Matches
 * beyond `maxPerFamily` within a detected family are moved to the END of
 * the list (still present, still schedulable as extra/review content if the
 * pool needs them later) rather than dropped — this module only ever
 * REORDERS, matching the rest of this pipeline's "never force-fill, never
 * silently discard" discipline (see techniqueMatcher.ts's fallbackTechniquePool
 * comment for the same principle applied to intent filtering).
 *
 * Family membership is similarity-based (Jaccard over significant name
 * tokens), not a fixed taxonomy — this stays martial-art-agnostic and needs
 * no per-art hardcoding, same as every other matcher in this pipeline.
 */
export function selectDiverseTechniques(matches: GoalTechniqueMatch[], opts: SelectDiverseOptions): GoalTechniqueMatch[] {
  if (!opts.diversityRequested || matches.length === 0) return matches;
  const maxPerFamily = opts.maxPerFamily ?? 2;

  const sorted = [...matches].sort((a, b) => b.relevanceScore - a.relevanceScore);
  const families: { tokens: Set<string>; count: number }[] = [];
  const kept: GoalTechniqueMatch[] = [];
  const deferred: GoalTechniqueMatch[] = [];

  for (const m of sorted) {
    const tokens = significantNameTokens(m.techniqueName);
    let family = families.find((f) => jaccardSimilarity(f.tokens, tokens) >= FAMILY_SIMILARITY_THRESHOLD);
    if (!family) {
      family = { tokens: new Set(tokens), count: 0 };
      families.push(family);
    }
    if (family.count < maxPerFamily) {
      family.count++;
      for (const t of tokens) family.tokens.add(t); // widen so later same-family variants with slightly different wording still cluster correctly
      kept.push(m);
    } else {
      deferred.push(m);
    }
  }
  return [...kept, ...deferred];
}

/** True when a role is generic/supporting enough that, under an active diversity request, it should be reported as deprioritized in the "조사 결과" UI (service.ts) rather than counted as a genuine on-topic find. */
export function isLowPriorityStructureRole(weight: number): boolean {
  return weight <= 0.3;
}
