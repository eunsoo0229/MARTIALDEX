import type { PeriodKey } from '../statsHub/types';
import { isWithinPeriod } from '../statsHub/periodUtils';
import { computeMartialArtStats } from '../statsHub/martialArtStats';
import type { MartialArtStats } from '../statsHub/types';
import type { TrainingHistoryEntry } from '../trainingHistory/types';
import { listTrainingHistory } from '../trainingHistory/service';
import { listMyActiveProgress } from '../curriculum/curriculumService';
import { resolveTechnique } from '../userTechniques/service';
import { deriveEntrySetsReps } from './historyView';
import { canonicalTechniqueId } from '../techniqueCanonical';
import { GYM_MARTIAL_ART_ID } from '../gymTraining/library';
import { HOME_TRAINING_MARTIAL_ART_ID } from '../homeTraining/library';
import type { Technique } from '../../types';

export interface TopTechnique {
  techniqueId: string;
  name: string;
  count: number;
}

export interface CurriculumCompletionRate {
  curriculumId: string;
  title: string;
  progress: number; // 0-100, real CurriculumProgress.progress
}

export interface TrainingReport {
  period: PeriodKey;
  totalMinutes: number;
  completedSets: number; // only ever counts entries that carry real exerciseDetails — never a fabricated estimate
  trainingDays: number; // distinct calendar dates with at least one completed session
  /** Martial-arts techniques only (gym/home-training exercises excluded) — "🥋 가장 많이 훈련한 기술". */
  topTechniques: TopTechnique[];
  /** Gym (and home-training) exercises only — "🏋️ 가장 많이 훈련한 헬스". Never merged with topTechniques. */
  topGymExercises: TopTechnique[];
  curriculumCompletionRates: CurriculumCompletionRate[];
  martialArtBreakdown: MartialArtStats[];
}

/** Gym exercise (or a home-training exercise) rather than a martial-arts technique. */
function isFitnessExercise(t: Technique): boolean {
  return t.martialArt === GYM_MARTIAL_ART_ID || t.martialArt === HOME_TRAINING_MARTIAL_ART_ID || t.gymBodyPart != null;
}

export function computeTrainingReport(period: PeriodKey, entries: TrainingHistoryEntry[] = listTrainingHistory()): TrainingReport {
  const inPeriod = entries.filter((e) => e.completed && isWithinPeriod(e.completedAt, period));

  const totalMinutes = inPeriod.reduce((sum, e) => sum + (e.actualMinutes ?? e.estimatedMinutes), 0);
  const completedSets = inPeriod.reduce((sum, e) => sum + (deriveEntrySetsReps(e)?.totalSets ?? 0), 0);
  const trainingDays = new Set(inPeriod.map((e) => e.date)).size;

  // Count = number of completed sessions that included it (same basis as
  // before — the most reliable value the log stores; per-technique minutes
  // aren't recorded). Keyed by canonical id so merged/linked duplicates of
  // one technique count together, then split by domain so a lift never
  // competes with a martial-arts technique in the same ranking.
  const techniqueCounts = new Map<string, number>();
  for (const e of inPeriod) {
    for (const id of new Set(e.techniqueIds.map(canonicalTechniqueId))) techniqueCounts.set(id, (techniqueCounts.get(id) ?? 0) + 1);
  }
  const ranked = [...techniqueCounts.entries()]
    .map(([techniqueId, count]) => {
      const t = resolveTechnique(techniqueId);
      return t ? { technique: t, top: { techniqueId, name: t.koreanName || t.name, count } } : null;
    })
    .filter((x): x is { technique: Technique; top: TopTechnique } => !!x)
    .sort((a, b) => b.top.count - a.top.count);
  const topTechniques = ranked.filter((x) => !isFitnessExercise(x.technique)).slice(0, 3).map((x) => x.top);
  const topGymExercises = ranked.filter((x) => isFitnessExercise(x.technique)).slice(0, 3).map((x) => x.top);

  const curriculumCompletionRates: CurriculumCompletionRate[] = listMyActiveProgress().map(({ curriculum, progress }) => ({
    curriculumId: curriculum.id,
    title: curriculum.title,
    progress: progress.progress,
  }));

  const martialArtBreakdown = computeMartialArtStats(period);

  return { period, totalMinutes, completedSets, trainingDays, topTechniques, topGymExercises, curriculumCompletionRates, martialArtBreakdown };
}
