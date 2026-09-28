import { resolveTechniquesByIds } from '../userTechniques/service';
import type { GroundBattleMatchRecord, PositionState, TurnLogEntry } from './types';

export interface MatchStats {
  totalTurns: number;
  playerTurns: number;
  successfulTechniques: { techniqueId: string; name: string; count: number }[];
  failedTechniques: { techniqueId: string; name: string; count: number }[];
}

/** Real stats only, derived directly from the match's own turnLog — never fabricated. */
export function computeMatchStats(record: GroundBattleMatchRecord): MatchStats {
  const playerEntries = record.turnLog.filter((e) => e.actor === 'player');
  const successCounts = new Map<string, number>();
  const failCounts = new Map<string, number>();
  for (const e of playerEntries) {
    if (e.outcome === 'success') successCounts.set(e.techniqueId, (successCounts.get(e.techniqueId) ?? 0) + 1);
    else if (e.outcome === 'fail' || e.outcome === 'reversal' || e.outcome === 'illegal') failCounts.set(e.techniqueId, (failCounts.get(e.techniqueId) ?? 0) + 1);
  }
  const nameOf = (id: string) => resolveTechniquesByIds([id])[0];
  const toList = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([techniqueId, count]) => {
        const t = nameOf(techniqueId);
        return { techniqueId, name: t?.koreanName || t?.name || techniqueId, count };
      })
      .sort((a, b) => b.count - a.count);

  return {
    totalTurns: record.turnLog.length,
    playerTurns: playerEntries.length,
    successfulTechniques: toList(successCounts),
    failedTechniques: toList(failCounts),
  };
}

/** One honest "what to review" line, only ever from real per-technique fail counts in THIS match — never shown mid-match (spec: no in-match hints), only on the post-match result screen. */
export function buildReviewSuggestion(stats: MatchStats): string | null {
  const worst = stats.failedTechniques.find((f) => f.count >= 2);
  if (!worst) return null;
  return `${worst.name} 시도가 ${worst.count}번 실패했습니다 — 이 기술의 실제 포지션 요구조건을 다시 확인해보세요.`;
}

export function summarizeTurnOutcome(entry: TurnLogEntry): string {
  const outcomeLabel: Record<TurnLogEntry['outcome'], string> = {
    illegal: '시도할 수 없음',
    success: '성공',
    partial: '부분 성공',
    fail: '실패',
    reversal: '역전당함',
  };
  return outcomeLabel[entry.outcome];
}

export function isPlayerWin(outcome: GroundBattleMatchRecord['outcome']): boolean {
  return outcome === 'player_submission_win' || outcome === 'player_tko_win' || outcome === 'decision_player';
}

export function isPlayerLoss(outcome: GroundBattleMatchRecord['outcome']): boolean {
  return outcome === 'opponent_submission_win' || outcome === 'opponent_tko_win' || outcome === 'decision_opponent';
}

export interface HistoryStats {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  mostUsedTechniqueId: string | null;
  /** Player position (e.g. 'guard_bottom') with the highest success rate across all real attempts (min 3 attempts), or null. */
  bestPosition: PositionState | null;
  /** Player position with the lowest success rate (min 3 attempts), or null. */
  weakestPosition: PositionState | null;
}

const MIN_ATTEMPTS_FOR_POSITION_STAT = 3;

/** Aggregate across real saved matches only — returns nulls rather than guessing when there isn't enough real data. */
export function computeHistoryStats(records: GroundBattleMatchRecord[]): HistoryStats {
  const usage = new Map<string, number>();
  const byPosition = new Map<PositionState, { attempts: number; successes: number }>();
  for (const r of records) {
    for (const e of r.turnLog) {
      if (e.actor !== 'player') continue;
      usage.set(e.techniqueId, (usage.get(e.techniqueId) ?? 0) + 1);
      const p = byPosition.get(e.positionBefore) ?? { attempts: 0, successes: 0 };
      p.attempts++;
      if (e.outcome === 'success') p.successes++;
      byPosition.set(e.positionBefore, p);
    }
  }
  const mostUsed = [...usage.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const eligible = [...byPosition.entries()].filter(([, v]) => v.attempts >= MIN_ATTEMPTS_FOR_POSITION_STAT).map(([k, v]) => ({ k, rate: v.successes / v.attempts }));
  eligible.sort((a, b) => b.rate - a.rate);
  const best = eligible[0]?.k ?? null;
  const weakest = eligible.length > 1 ? eligible[eligible.length - 1].k : null;
  return {
    matches: records.length,
    wins: records.filter((r) => isPlayerWin(r.outcome)).length,
    losses: records.filter((r) => isPlayerLoss(r.outcome)).length,
    draws: records.filter((r) => r.outcome === 'draw').length,
    mostUsedTechniqueId: mostUsed,
    bestPosition: best,
    weakestPosition: weakest,
  };
}
