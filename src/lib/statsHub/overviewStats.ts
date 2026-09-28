import type { OverviewStats, PeriodKey } from './types';
import { isWithinPeriod } from './periodUtils';
import { listTrainingHistory } from '../trainingHistory/service';
import { getAllRecords } from '../poseAnalysis/recordsService';
import { listSparringSessions } from '../sparringAnalysis/sparringSessionService';
import { computeAllSkillProgress } from '../skillProgress/weaknessEngine';

// "숙련 기술 수" is a CURRENT snapshot (mastery has no historical log — see
// README "종합 훈련 기록 및 통계 시스템" for why), not filtered by period;
// everything else here genuinely respects the selected window.
export function computeOverviewStats(period: PeriodKey): OverviewStats {
  const history = listTrainingHistory().filter((h) => h.completed && isWithinPeriod(h.completedAt, period));
  const records = getAllRecords().filter((r) => isWithinPeriod(r.analyzedAt, period));
  const sparring = listSparringSessions().filter((s) => isWithinPeriod(s.date, period));

  const techniqueIds = new Set<string>();
  for (const h of history) for (const id of h.techniqueIds) techniqueIds.add(id);
  for (const r of records) techniqueIds.add(r.techniqueId);

  const skillEntries = computeAllSkillProgress();
  const currentProficientCount = skillEntries.filter((e) => e.progress.status === 'proficient').length;

  return {
    trainingCount: history.length,
    totalMinutes: history.reduce((sum, h) => sum + (h.actualMinutes ?? h.estimatedMinutes), 0),
    techniquesLearnedCount: techniqueIds.size,
    currentProficientCount,
    sparringCount: sparring.length,
    poseAnalysisCount: records.length,
  };
}
