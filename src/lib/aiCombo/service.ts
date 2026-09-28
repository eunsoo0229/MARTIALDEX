import type { ComboGenerationPreview } from './types';
import { analyzeComboGoal } from './goalAnalysis';
import { resolveComboStep, resolveComboSuggestion } from './stepResolver';
import { computeAllSkillProgress } from '../skillProgress/weaknessEngine';
import type { MasteryStatus } from '../skillProgress/types';

export interface GenerateComboInput {
  freeText: string;
  martialArt: string;
  userId: string | null;
}

export type GenerateComboOutcome =
  | { ok: true; preview: ComboGenerationPreview }
  | { ok: false; code: 'AI_ERROR'; message: string }
  | { ok: false; code: 'NO_STEPS_RESOLVED'; message: string };

function buildMasteryMap(): Map<string, MasteryStatus> {
  const map = new Map<string, MasteryStatus>();
  for (const { technique, progress } of computeAllSkillProgress()) map.set(technique.id, progress.status);
  return map;
}

/**
 * Orchestrates the full pipeline spec section 6 requires, in order: analyze
 * the user's purpose (one Gemini call, never invents technique ids) -> for
 * each ordered step phrase, search the existing library first, and only
 * research+register a genuinely missing technique via the Technique
 * Discovery Service (never skipping straight to "AI already knows this" —
 * see resolveComboStep). Steps resolve sequentially (not in parallel) so a
 * technique discovered for an earlier step is immediately available to be
 * reused/avoided by a later step in the same combo.
 */
export async function generateCombo(input: GenerateComboInput): Promise<GenerateComboOutcome> {
  const analysisResult = await analyzeComboGoal({ freeText: input.freeText, martialArtHint: input.martialArt });
  if (!analysisResult.ok) return { ok: false, code: 'AI_ERROR', message: analysisResult.message };
  const analysis = analysisResult.data;

  const martialArt = analysis.martialArt || input.martialArt;
  const masteryByTechniqueId = buildMasteryMap();
  const usedTechniqueIds = new Set<string>();

  const results = [];
  for (const step of analysis.steps) {
    results.push(await resolveComboStep(step, martialArt, masteryByTechniqueId, usedTechniqueIds, input.userId));
  }

  if (results.every((r) => !r.techniqueId)) {
    return { ok: false, code: 'NO_STEPS_RESOLVED', message: '콤비네이션에 필요한 기술을 하나도 찾거나 등록하지 못했습니다. 다른 표현으로 다시 시도해주세요.' };
  }

  const complementaryFollowUps = analysis.complementaryFollowUps.map((phrase) => resolveComboSuggestion(phrase, martialArt));
  const alternativeTechniques = analysis.alternativeTechniques.map((phrase) => resolveComboSuggestion(phrase, martialArt));

  return {
    ok: true,
    preview: {
      goalText: input.freeText,
      martialArt,
      analysis,
      results,
      complementaryFollowUps,
      alternativeTechniques,
      generatedAt: new Date().toISOString(),
    },
  };
}
