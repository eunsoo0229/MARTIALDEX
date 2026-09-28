import type { MartialArtStats, PeriodKey } from './types';
import { isWithinPeriod } from './periodUtils';
import { getMartialArt, martialArtSummaries } from '../loadData';
import { resolveTechnique } from '../userTechniques/service';
import { HOME_TRAINING_MARTIAL_ART_ID } from '../homeTraining/library';
import { listTrainingHistory } from '../trainingHistory/service';
import { getAllRecords } from '../poseAnalysis/recordsService';

export function computeMartialArtStats(period: PeriodKey): MartialArtStats[] {
  const history = listTrainingHistory().filter((h) => h.completed && isWithinPeriod(h.completedAt, period));
  const records = getAllRecords().filter((r) => isWithinPeriod(r.analyzedAt, period));

  const trainingCountByArt = new Map<string, number>();
  const techniqueSetByArt = new Map<string, Set<string>>();

  function addTechnique(martialArt: string, techniqueId: string) {
    const set = techniqueSetByArt.get(martialArt) ?? new Set<string>();
    set.add(techniqueId);
    techniqueSetByArt.set(martialArt, set);
  }

  for (const h of history) {
    const artsThisSession = new Set<string>();
    for (const id of h.techniqueIds) {
      // resolveTechnique (not the official-only getTechnique) so
      // home-training sessions (built-in library OR AI-discovered
      // exercises in add_teq/user_techniques) also count here — this feeds
      // buildTrainingAiContext()'s "무술별 훈련 횟수" line, which the
      // no-goal-stated home-training curriculum generator relies on to see
      // how much home training the user has actually done.
      const t = resolveTechnique(id);
      if (!t) continue;
      artsThisSession.add(t.martialArt);
      addTechnique(t.martialArt, id);
    }
    for (const art of artsThisSession) trainingCountByArt.set(art, (trainingCountByArt.get(art) ?? 0) + 1);
  }

  const scoresByArt = new Map<string, number[]>();
  for (const r of records) {
    const list = scoresByArt.get(r.martialArtId) ?? [];
    list.push(r.score);
    scoresByArt.set(r.martialArtId, list);
    addTechnique(r.martialArtId, r.techniqueId);
  }

  // martialArtSummaries deliberately stays the 9 real combat arts (see
  // loadData.ts) — home-training is appended explicitly here so its
  // training volume is visible in 무술별 통계 without polluting every other
  // consumer of martialArtSummaries.
  const homeTrainingArt = getMartialArt(HOME_TRAINING_MARTIAL_ART_ID);
  const artsWithHomeTraining = homeTrainingArt ? [...martialArtSummaries, homeTrainingArt] : martialArtSummaries;

  return artsWithHomeTraining
    .map((a) => {
      const scores = scoresByArt.get(a.id) ?? [];
      return {
        martialArtId: a.id,
        nameKo: a.nameKo,
        trainingCount: trainingCountByArt.get(a.id) ?? 0,
        techniqueCount: techniqueSetByArt.get(a.id)?.size ?? 0,
        averageScore: scores.length ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : null,
      };
    })
    .filter((s) => s.trainingCount > 0 || s.techniqueCount > 0)
    .sort((a, b) => b.trainingCount - a.trainingCount);
}
