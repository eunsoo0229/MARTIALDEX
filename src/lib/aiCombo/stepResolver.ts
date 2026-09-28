import type { ComboGoalStep, ComboStepResult, ComboSuggestion } from './types';
import type { MasteryStatus } from '../skillProgress/types';
import { searchAllTechniques } from '../userTechniques/service';
import { discoverTechnique } from '../techniqueDiscovery/service';
import { MMA_MARTIAL_ART_ID, MMA_SOURCE_MARTIAL_ARTS } from '../mmaCurriculum/types';

// The one MMA-specific martial art with real encyclopedia data added this
// session — distinct from MMA_MARTIAL_ART_ID (the pre-existing synthetic
// cross-discipline id used by "선수 스타일 학습"). A step that can't be
// resolved from any of the 7 cross-searched source arts while the user is
// in the cross-discipline MMA flow is registered as a genuine MMA-specific
// technique here, not under the synthetic id (which has no real data file).
const REAL_MMA_MARTIAL_ART_ID = 'mixed-martial-arts';

// Both the synthetic cross-discipline id and the real MMA encyclopedia id
// need the same fan-out: MMA is fundamentally a mix of striking/wrestling/
// grappling disciplines, so a step phrase like "Jab" or "Double Leg" is
// expected to resolve to boxing's/wrestling's own real technique rather
// than triggering a redundant re-research+registration of the same
// real-world move under the MMA-specific technique set (which only holds
// genuinely MMA-native content — cage work, ground-and-pound, etc. — see
// data/processed/mixed-martial-arts.json's own relatedTechniques links).
function isMmaContext(martialArt: string): boolean {
  return martialArt === MMA_MARTIAL_ART_ID || martialArt === REAL_MMA_MARTIAL_ART_ID;
}

function searchForMartialArt(phrase: string, martialArt: string, limit: number) {
  if (!isMmaContext(martialArt)) return searchAllTechniques(phrase, limit, { martialArt });
  return searchAllTechniques(phrase, limit * 3)
    .filter((t) => MMA_SOURCE_MARTIAL_ARTS.includes(t.martialArt) || t.martialArt === REAL_MMA_MARTIAL_ART_ID)
    .slice(0, limit);
}

/**
 * Resolves one AI-proposed combo step to a real technique — search the
 * library first (spec section 6/7's "기존 기술 우선"), and only if nothing
 * resolves, fall back to the Technique Discovery Service (internet research
 * + verification + registration). `usedTechniqueIds` prevents the same
 * technique from being picked for two different steps in one combo.
 */
export async function resolveComboStep(
  step: ComboGoalStep,
  martialArt: string,
  masteryByTechniqueId: Map<string, MasteryStatus> | undefined,
  usedTechniqueIds: Set<string>,
  userId: string | null
): Promise<ComboStepResult> {
  const candidates = searchForMartialArt(step.phrase, martialArt, 6);
  const fresh = candidates.filter((c) => !usedTechniqueIds.has(c.id));
  const pool = fresh.length > 0 ? fresh : candidates;

  // Soft mastery-aware preference (spec section 20) — pick the first
  // candidate the user hasn't already mastered, but never exclude the
  // text-relevance ranking's top result entirely; falls back to it if every
  // candidate is already 'proficient'. AI/code never overwrites mastery.
  const best = (masteryByTechniqueId ? pool.find((c) => masteryByTechniqueId.get(c.id) !== 'proficient') : undefined) ?? pool[0];

  if (best) {
    usedTechniqueIds.add(best.id);
    return { step, techniqueId: best.id, techniqueName: best.name, martialArt: best.martialArt, reason: step.purpose, discovered: false };
  }

  const targetMartialArt = martialArt === MMA_MARTIAL_ART_ID ? REAL_MMA_MARTIAL_ART_ID : martialArt;
  const discovery = await discoverTechnique({ name: step.phrase, martialArt: targetMartialArt, userId });
  if (discovery.techniqueId) {
    usedTechniqueIds.add(discovery.techniqueId);
    return {
      step,
      techniqueId: discovery.techniqueId,
      techniqueName: discovery.techniqueName,
      martialArt: targetMartialArt,
      reason: discovery.status === 'existing' ? discovery.reason : `${step.purpose} (${discovery.status === 'variant' ? '관련 기술로 새로 등록됨' : '새로운 기술로 등록됨'} — ${discovery.reason})`,
      discovered: discovery.status !== 'existing',
    };
  }

  return { step, techniqueId: null, techniqueName: null, martialArt: null, reason: discovery.reason, discovered: false };
}

/**
 * Resolves a complementaryFollowUps/alternativeTechniques phrase — library
 * search ONLY, never falls through to Technique Discovery's internet
 * research+registration. These are supplementary "다음에 이어가면 좋은
 * 기술"/"대체 기술" ideas, not core combo content, so it isn't worth the
 * extra AI call/registration cost every time one doesn't already exist —
 * an unresolved suggestion just renders as plain text (see AiComboGenerator.tsx).
 */
export function resolveComboSuggestion(phrase: string, martialArt: string): ComboSuggestion {
  const candidates = searchForMartialArt(phrase, martialArt, 1);
  const match = candidates[0];
  return match
    ? { phrase, techniqueId: match.id, techniqueName: match.name, martialArt: match.martialArt }
    : { phrase, techniqueId: null, techniqueName: null, martialArt: null };
}
