import type { HomeExerciseEquipment, Technique } from '../../types';
import type { HomeExerciseMatch, HomeGoalAnalysis } from './types';
import type { MasteryStatus } from '../skillProgress/types';
// searchAllTechniques/resolveTechniquesByIds (not the official-only
// searchTechniques/getTechniquesByIds) so a phrase can match — and a match
// can resolve to — an AI-discovered add_teq/user_techniques exercise too,
// not just the built-in library. Same pattern as aiCurriculum/techniqueMatcher.ts.
import { searchAllTechniques, resolveTechniquesByIds } from '../userTechniques/service';
import { HOME_TRAINING_MARTIAL_ART_ID, HOME_TRAINING_FILE } from './library';
import { exerciseFitsEquipment } from './equipment';

const FIELD_WEIGHTS: { field: keyof HomeGoalAnalysis; weight: number }[] = [
  { field: 'goals', weight: 40 },
];

const MIN_RELEVANCE = 12;
const MAX_MATCHES = 60;
const SEARCH_LIMIT_PER_PHRASE = 8;

/**
 * Turns HomeGoalAnalysis's free-text goal phrases into real exercise
 * matches — nothing here is invented; a phrase that matches nothing
 * contributes no exercises. Equipment is a HARD filter (spec: 장비 없는
 * 운동을 임의로 넣지 않는다), applied before scoring so an unavailable-
 * equipment exercise never even competes for a slot.
 */
export function matchHomeGoalToExercises(
  analysis: HomeGoalAnalysis,
  equipment: HomeExerciseEquipment[],
  options?: { weakTechniqueIds?: Set<string>; masteryByTechniqueId?: Map<string, MasteryStatus> }
): HomeExerciseMatch[] {
  const scoreById = new Map<string, number>();
  const reasonPartsById = new Map<string, Set<string>>();

  function addScore(id: string, contribution: number, reason: string) {
    if (contribution <= 0) return;
    scoreById.set(id, (scoreById.get(id) ?? 0) + contribution);
    if (!reasonPartsById.has(id)) reasonPartsById.set(id, new Set());
    reasonPartsById.get(id)!.add(reason);
  }

  for (const { field, weight } of FIELD_WEIGHTS) {
    const phrases = analysis[field];
    if (!Array.isArray(phrases)) continue;
    for (const phrase of phrases) {
      if (typeof phrase !== 'string' || !phrase.trim()) continue;
      const results = searchAllTechniques(phrase, SEARCH_LIMIT_PER_PHRASE, { martialArt: HOME_TRAINING_MARTIAL_ART_ID });
      results.forEach((t, rank) => {
        if (!exerciseFitsEquipment(t, equipment)) return; // hard filter, never just a penalty
        addScore(t.id, weight * (1 - rank * 0.12), `목표("${phrase}")와 관련성이 있음`);
      });
    }
  }

  // emphasizedTypes boost — a real signal on top of phrase search, since a
  // goal like "체력 향상" may not textually match any single exercise name.
  const allEquipmentEligible = HOME_TRAINING_FILE.techniques.filter((t) => exerciseFitsEquipment(t, equipment));
  analysis.emphasizedTypes.forEach((type, idx) => {
    const boost = [30, 22, 16, 10][idx] ?? 6;
    for (const t of allEquipmentEligible) {
      if (t.exerciseType === type) addScore(t.id, boost, `강조 유형("${type}")과 일치`);
    }
  });

  // Technique-linked boost (spec section 8): an exercise whose
  // relatedTechniques overlaps with either the AI's own relatedTechniqueIds
  // or the user's actual weak techniques (rankWeakness, passed in by the
  // caller) gets a meaningful boost — this is the "관련 무술 기술과 연결"
  // mechanism, using the EXISTING relatedTechniques field, no new join table.
  const targetTechniqueIds = new Set<string>([...analysis.relatedTechniqueIds, ...(options?.weakTechniqueIds ? [...options.weakTechniqueIds] : [])]);
  if (targetTechniqueIds.size > 0) {
    for (const t of allEquipmentEligible) {
      const overlap = t.relatedTechniques.filter((id) => targetTechniqueIds.has(id));
      if (overlap.length > 0) addScore(t.id, 25 * overlap.length, '최근 훈련한 관련 기술을 보완함');
    }
  }

  const resolved = resolveTechniquesByIds([...scoreById.keys()]);
  const byId = new Map(resolved.map((t) => [t.id, t]));

  const matches: HomeExerciseMatch[] = [];
  for (const [exerciseId, rawScore] of scoreById.entries()) {
    if (rawScore < MIN_RELEVANCE) continue;
    const exercise = byId.get(exerciseId);
    if (!exercise) continue; // must resolve to a real exercise — never fabricated
    if (!exerciseFitsEquipment(exercise, equipment)) continue; // re-check in case it entered via a non-phrase boost path
    const reasons = [...(reasonPartsById.get(exerciseId) ?? [])].slice(0, 2).join(', ');
    matches.push({
      exerciseId,
      exerciseName: exercise.name,
      relevanceScore: Math.round(Math.min(100, rawScore)),
      reason: reasons || '입력하신 목표와 관련성이 있음',
    });
  }

  matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return matches.slice(0, MAX_MATCHES);
}

/**
 * Fallback pool for when the goal yields too few matches to fill the
 * requested session count — mirrors aiCurriculum's fallbackTechniquePool,
 * but scoped to home-training and equipment-filtered. Weighted toward
 * general strength/conditioning/mobility so a short goal text still
 * produces a well-rounded plan rather than an empty one.
 */
export function fallbackHomeExercisePool(equipment: HomeExerciseEquipment[], options?: { masteryByTechniqueId?: Map<string, MasteryStatus>; limit?: number }): HomeExerciseMatch[] {
  const limit = options?.limit ?? 30;
  const masteryByTechniqueId = options?.masteryByTechniqueId;
  const pool = searchAllTechniques('', limit + 20, { martialArt: HOME_TRAINING_MARTIAL_ART_ID }).filter((t) => exerciseFitsEquipment(t, equipment));

  const sorted = [...pool].sort((a: Technique, b: Technique) => {
    const pa = masteryByTechniqueId?.get(a.id) === 'proficient' ? 1 : 0;
    const pb = masteryByTechniqueId?.get(b.id) === 'proficient' ? 1 : 0;
    return pa - pb;
  });

  return sorted.slice(0, limit).map((t, i) => ({
    exerciseId: t.id,
    exerciseName: t.name,
    relevanceScore: Math.max(10, 30 - i),
    reason: '균형 잡힌 홈트 구성을 위한 기본 운동',
  }));
}
