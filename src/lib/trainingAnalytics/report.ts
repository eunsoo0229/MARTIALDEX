import type { PeriodKey } from '../statsHub/types';
import { isWithinPeriod } from '../statsHub/periodUtils';
import { computeMartialArtStats } from '../statsHub/martialArtStats';
import type { MartialArtStats } from '../statsHub/types';
import type { TrainingHistoryEntry } from '../trainingHistory/types';
import { listTrainingHistory } from '../trainingHistory/service';
import { listMyActiveProgress } from '../curriculum/curriculumService';
import { resolveTechnique } from '../userTechniques/service';
import { deriveEntrySetsReps } from './historyView';

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
  topTechniques: TopTechnique[];
  curriculumCompletionRates: CurriculumCompletionRate[];
  martialArtBreakdown: MartialArtStats[];
}

export function computeTrainingReport(period: PeriodKey, entries: TrainingHistoryEntry[] = listTrainingHistory()): TrainingReport {
  const inPeriod = entries.filter((e) => e.completed && isWithinPeriod(e.completedAt, period));

  const totalMinutes = inPeriod.reduce((sum, e) => sum + (e.actualMinutes ?? e.estimatedMinutes), 0);
  const completedSets = inPeriod.reduce((sum, e) => sum + (deriveEntrySetsReps(e)?.totalSets ?? 0), 0);
  const trainingDays = new Set(inPeriod.map((e) => e.date)).size;

  const techniqueCounts = new Map<string, number>();
  for (const e of inPeriod) for (const id of e.techniqueIds) techniqueCounts.set(id, (techniqueCounts.get(id) ?? 0) + 1);
  const topTechniques: TopTechnique[] = [...techniqueCounts.entries()]
    .map(([techniqueId, count]) => {
      const t = resolveTechnique(techniqueId);
      return t ? { techniqueId, name: t.koreanName || t.name, count } : null;
    })
    .filter((t): t is TopTechnique => !!t)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const curriculumCompletionRates: CurriculumCompletionRate[] = listMyActiveProgress().map(({ curriculum, progress }) => ({
    curriculumId: curriculum.id,
    title: curriculum.title,
    progress: progress.progress,
  }));

  const martialArtBreakdown = computeMartialArtStats(period);

  return { period, totalMinutes, completedSets, trainingDays, topTechniques, curriculumCompletionRates, martialArtBreakdown };
}
