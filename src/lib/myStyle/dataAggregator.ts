import { getMartialArt, getTechniquesByIds } from '../loadData';
import { computeAllSkillProgress, summarizeByPosition, type TechniqueSkillEntry } from '../skillProgress/weaknessEngine';
import { listTrainingHistory } from '../trainingHistory/service';
import { listSparringSessions } from '../sparringAnalysis/sparringSessionService';
import type { MartialArtUsage, MyStyleDataSummary, TechniqueFrequencyEntry } from './types';

const MIN_TRAINING_SESSIONS_WITHOUT_SPARRING = 5;
const MIN_PRACTICED_TECHNIQUES_WITHOUT_SPARRING = 5;

// "스타일을 임의로 만들어내지 않는다" starts here — if this gate is false,
// nothing downstream (styleAnalysisEngine, comparisonEngine) may render a
// style label at all. Sparring gives the richest real signal (attack/
// defense/distance/technique-usage all in one place), so one real sparring
// session alone is enough; without any sparring, we require real volume
// from training history instead so a single logged day can't fabricate a
// "style".
function computeHasEnoughData(sparringSessionCount: number, trainingSessionCount: number, practicedTechniqueCount: number): boolean {
  if (sparringSessionCount >= 1) return true;
  return trainingSessionCount >= MIN_TRAINING_SESSIONS_WITHOUT_SPARRING && practicedTechniqueCount >= MIN_PRACTICED_TECHNIQUES_WITHOUT_SPARRING;
}

function average(values: (number | null)[]): number | null {
  const real = values.filter((v): v is number => v !== null);
  if (real.length === 0) return null;
  return Math.round((real.reduce((a, b) => a + b, 0) / real.length) * 10) / 10;
}

// One real pass over the data the app already stores — no new storage, no
// AI call. Reused as-is by both the AI style-analysis prompt (as plain
// numbers) and the deterministic fallback, so both are grounded in exactly
// the same facts.
export function buildMyStyleDataSummary(skillEntries: TechniqueSkillEntry[] = computeAllSkillProgress()): MyStyleDataSummary {
  const trainingHistory = listTrainingHistory().filter((e) => e.completed);
  const sparringSessions = listSparringSessions();

  const practicedIds = new Set<string>();
  for (const e of trainingHistory) for (const id of e.techniqueIds) practicedIds.add(id);
  for (const e of skillEntries) if (e.progress.analysisCount > 0) practicedIds.add(e.technique.id);

  const analyzedTechniqueCount = skillEntries.filter((e) => e.progress.analysisCount > 0).length;

  const hasEnoughData = computeHasEnoughData(sparringSessions.length, trainingHistory.length, practicedIds.size);

  const frequency = new Map<string, number>();
  for (const e of trainingHistory) for (const id of e.techniqueIds) frequency.set(id, (frequency.get(id) ?? 0) + 1);
  for (const s of sparringSessions) for (const g of s.techniqueGuesses) frequency.set(g.techniqueId, (frequency.get(g.techniqueId) ?? 0) + 1);
  const topFrequencyIds = [...frequency.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const techniqueFrequency: TechniqueFrequencyEntry[] = getTechniquesByIds(topFrequencyIds.map(([id]) => id)).map((t) => ({
    techniqueId: t.id,
    techniqueName: t.name,
    martialArt: t.martialArt,
    count: frequency.get(t.id) ?? 0,
  }));

  const avgOverallScores =
    sparringSessions.length > 0
      ? {
          movement: average(sparringSessions.map((s) => s.overallScores.movement)),
          distance: average(sparringSessions.map((s) => s.overallScores.distance)),
          defense: average(sparringSessions.map((s) => s.overallScores.defense)),
          offense: average(sparringSessions.map((s) => s.overallScores.offense)),
          posture: average(sparringSessions.map((s) => s.overallScores.posture)),
        }
      : null;

  const recentStyleObservations = [...new Set(sparringSessions.slice(0, 3).flatMap((s) => s.styleObservations))].slice(0, 8);
  const recentWeakAreaLabels = [...new Set(sparringSessions.slice(0, 3).flatMap((s) => s.weakAreas.map((w) => w.label)))].slice(0, 6);

  const martialArtCounts = new Map<string, number>();
  for (const e of trainingHistory) {
    for (const t of getTechniquesByIds(e.techniqueIds)) martialArtCounts.set(t.martialArt, (martialArtCounts.get(t.martialArt) ?? 0) + 1);
  }
  for (const s of sparringSessions) martialArtCounts.set(s.martialArt, (martialArtCounts.get(s.martialArt) ?? 0) + 1);
  const martialArtsPracticed: MartialArtUsage[] = [...martialArtCounts.entries()]
    .map(([id, count]) => ({ martialArtId: id, nameKo: getMartialArt(id)?.nameKo ?? id, count }))
    .sort((a, b) => b.count - a.count);

  const positionBreakdown = summarizeByPosition(skillEntries).filter((p) => p.analyzedCount > 0);

  const inputHash = JSON.stringify([
    sparringSessions.length,
    trainingHistory.length,
    practicedIds.size,
    topFrequencyIds,
    positionBreakdown.map((p) => [p.position, p.averageScore, p.analyzedCount]),
  ]);

  return {
    hasEnoughData,
    sparringSessionCount: sparringSessions.length,
    trainingSessionCount: trainingHistory.length,
    analyzedTechniqueCount,
    practicedTechniqueCount: practicedIds.size,
    positionBreakdown,
    techniqueFrequency,
    avgOverallScores,
    recentStyleObservations,
    recentWeakAreaLabels,
    martialArtsPracticed,
    inputHash,
  };
}
