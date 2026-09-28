import type { FighterStyleAnalysis, TechniqueMatch } from './types';
// searchAllTechniques/resolveTechniquesByIds (not the official-only
// searchTechniques/getTechniquesByIds) so a style element can match — and
// resolve to — a technique already in the shared add_teq library or this
// user's own user_techniques, not just the 1,253 official ones.
import { searchAllTechniques, resolveTechniquesByIds, resolveTechnique } from '../userTechniques/service';
import { discoverTechnique } from '../techniqueDiscovery/service';
import { classifyPhase } from './phaseClassifier';
import { MMA_SOURCE_MARTIAL_ARTS } from '../mmaCurriculum/types';

// Maps each style-analysis field to (a) how much it counts toward
// relevanceScore and (b) the human-readable label used in the `reason`
// string. keyTechniques are literal technique names, so they're weighted
// highest; broader style-genre words (primaryStyles) are weighted lowest.
const FIELD_WEIGHTS: { field: keyof FighterStyleAnalysis; weight: number; label: string }[] = [
  { field: 'keyTechniques', weight: 40, label: '핵심 기술' },
  { field: 'preferredPositions', weight: 25, label: '선호 포지션' },
  { field: 'transitions', weight: 20, label: '기술 연결' },
  { field: 'offensiveConcepts', weight: 15, label: '공격 방식' },
  { field: 'defensiveConcepts', weight: 15, label: '방어 방식' },
  { field: 'distanceManagement', weight: 10, label: '거리 운영' },
  { field: 'primaryStyles', weight: 10, label: '주요 스타일' },
];

const MIN_RELEVANCE = 15;
const MAX_MATCHES = 60;
const SEARCH_LIMIT_PER_PHRASE = 5;

/**
 * Turns an AI-generated style analysis (free-text phrases only) into real
 * Martialdex technique matches. This is the ONLY place a "style element"
 * becomes a techniqueId, and it only ever does so by running the app's own
 * existing search index (src/lib/search.ts — the same exact-match + Fuse
 * fuzzy engine the search bar uses, now including the shared add_teq
 * library and this user's own user_techniques via searchAllTechniques)
 * against each phrase, falling back to the Technique Discovery Service for
 * a `keyTechniques` phrase (the literal-technique-name field, weighted
 * highest) that matches nothing anywhere (spec section 9) — never a
 * fabricated id. relevanceScore is a deterministic sum of
 * (search-rank-based contribution x field weight), never a random number.
 */
export async function matchStyleToTechniques(analysis: FighterStyleAnalysis, userId: string | null = null): Promise<TechniqueMatch[]> {
  const scoreById = new Map<string, number>();
  const reasonPartsById = new Map<string, Set<string>>();

  for (const { field, weight, label } of FIELD_WEIGHTS) {
    const phrases = analysis[field];
    if (!Array.isArray(phrases)) continue;
    for (const phrase of phrases) {
      if (typeof phrase !== 'string' || !phrase.trim()) continue;
      const results = searchAllTechniques(phrase, SEARCH_LIMIT_PER_PHRASE);
      results.forEach((t, rank) => {
        const contribution = weight * (1 - rank * 0.15);
        if (contribution <= 0) return;
        scoreById.set(t.id, (scoreById.get(t.id) ?? 0) + contribution);
        if (!reasonPartsById.has(t.id)) reasonPartsById.set(t.id, new Set());
        reasonPartsById.get(t.id)!.add(`${label}("${phrase}")`);
      });
    }
  }

  const techniques = resolveTechniquesByIds([...scoreById.keys()]);
  const byId = new Map(techniques.map((t) => [t.id, t]));

  const matches: TechniqueMatch[] = [];
  for (const [techniqueId, rawScore] of scoreById.entries()) {
    if (rawScore < MIN_RELEVANCE) continue;
    const technique = byId.get(techniqueId);
    if (!technique) continue; // id must resolve to a real technique — otherwise silently dropped, never fabricated
    const reasons = [...(reasonPartsById.get(techniqueId) ?? [])].slice(0, 2).join(', ');
    matches.push({
      techniqueId,
      techniqueName: technique.name,
      martialArt: technique.martialArt,
      relevanceScore: Math.round(Math.min(100, rawScore)),
      reason: reasons ? `선수 스타일의 ${reasons} 요소와 관련성이 있음` : '스타일 요소와 관련성이 있음',
      phase: classifyPhase(technique),
    });
  }

  // keyTechniques ("핵심 기술") is the literal-technique-name field — a
  // phrase in it that never contributed to any match above genuinely
  // wasn't found anywhere, so it's the one place a fighter-style analysis
  // should trigger real discovery rather than silently dropping it. No
  // single martial art applies here (a fighter's style spans several), so
  // the hint defaults to 'boxing' (same "no better info" default already
  // used elsewhere in this app, e.g. RequestTechnique.tsx) and
  // discoverTechnique's own martialArtConfirmed override corrects it to
  // whatever real art Google Search grounding actually confirms.
  for (const phrase of analysis.keyTechniques ?? []) {
    if (typeof phrase !== 'string' || !phrase.trim()) continue;
    if (matches.some((m) => m.reason.includes(`("${phrase}")`))) continue;
    const outcome = await discoverTechnique({ name: phrase, martialArt: MMA_SOURCE_MARTIAL_ARTS[0], userId });
    if (!outcome.techniqueId) continue;
    const technique = resolveTechnique(outcome.techniqueId);
    if (!technique) continue;
    matches.push({
      techniqueId: technique.id,
      techniqueName: technique.name,
      martialArt: technique.martialArt,
      relevanceScore: 85,
      reason:
        outcome.status === 'existing'
          ? `선수 스타일의 핵심 기술("${phrase}")과 관련성이 있음`
          : `선수 스타일의 핵심 기술("${phrase}")을 새로 발견해 등록함 — ${outcome.reason}`,
      phase: classifyPhase(technique),
    });
  }

  matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return matches.slice(0, MAX_MATCHES);
}
