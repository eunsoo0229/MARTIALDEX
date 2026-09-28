import type { PeriodKey, SparringStats } from './types';
import { isWithinPeriod } from './periodUtils';
import { getMartialArt } from '../loadData';
import { STYLE_CURRICULUM_MARTIAL_ART } from '../fighterStyle/styleCurriculumService';
import { listSparringSessions } from '../sparringAnalysis/sparringSessionService';

function martialArtLabel(id: string): string {
  return id === STYLE_CURRICULUM_MARTIAL_ART ? 'MMA' : (getMartialArt(id)?.nameKo ?? id);
}

export function computeSparringStats(period: PeriodKey): SparringStats {
  const sessions = listSparringSessions().filter((s) => isWithinPeriod(s.date, period));

  const countByArt = new Map<string, number>();
  for (const s of sessions) countByArt.set(s.martialArt, (countByArt.get(s.martialArt) ?? 0) + 1);
  const byMartialArt = [...countByArt.entries()]
    .map(([id, count]) => ({ martialArtId: id, nameKo: martialArtLabel(id), count }))
    .sort((a, b) => b.count - a.count);

  const usage = new Map<string, { techniqueName: string; occurrences: number }>();
  for (const s of sessions) {
    for (const g of s.techniqueGuesses) {
      const cur = usage.get(g.techniqueId) ?? { techniqueName: g.techniqueName, occurrences: 0 };
      cur.occurrences += g.occurrences.length;
      usage.set(g.techniqueId, cur);
    }
  }
  const techniqueUsage = [...usage.entries()]
    .map(([techniqueId, v]) => ({ techniqueId, techniqueName: v.techniqueName, occurrences: v.occurrences }))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 8);

  const chronological = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const latest = chronological[chronological.length - 1] ?? null;
  const latestOverallScores = latest
    ? {
        martialArtId: latest.martialArt,
        nameKo: martialArtLabel(latest.martialArt),
        posture: latest.overallScores.posture,
        distance: latest.overallScores.distance,
        movement: latest.overallScores.movement,
      }
    : null;

  const styleTrend = (['posture', 'distance', 'movement'] as const)
    .map((key) => {
      const points = chronological.map((s) => s.overallScores[key]).filter((v): v is number => v !== null);
      const label = key === 'posture' ? '자세' : key === 'distance' ? '거리 조절' : '움직임';
      return { label, points };
    })
    .filter((t) => t.points.length >= 2); // a single point has no trend to show

  return { totalCount: sessions.length, byMartialArt, latestOverallScores, techniqueUsage, styleTrend };
}
