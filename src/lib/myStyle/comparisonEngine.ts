import { getTechnique } from '../loadData';
import { classifyPosition, POSITION_LABEL, type CanonicalPosition } from '../skillProgress/positionClassifier';
import type { PositionBreakdown } from '../skillProgress/weaknessEngine';
import type { TechniqueMatch } from '../fighterStyle/types';

const COMPARISON_POSITIONS: Exclude<CanonicalPosition, 'other'>[] = ['standing', 'clinch', 'guard', 'mount_top', 'back_control'];

export interface StyleComparisonRow {
  position: Exclude<CanonicalPosition, 'other'>;
  label: string;
  currentStars: number | null;
  targetStars: number | null;
}

export interface ImprovementItem {
  position: Exclude<CanonicalPosition, 'other'>;
  positionLabel: string;
  techniqueId: string;
  techniqueName: string;
  martialArt: string;
  reason: string;
}

function starsFromScore(score: number | null): number | null {
  if (score === null) return null;
  return Math.max(1, Math.min(5, Math.round(score / 20)));
}

// Both sides of the comparison reuse the SAME classifier
// (skillProgress/positionClassifier.ts) so "클린치"/"탑 컨트롤" mean the
// identical thing whether we're looking at the user's own analyzed
// techniques or the target style's matched techniques — no separate,
// incompatible taxonomy is invented for this comparison.
export function computeStyleComparison(currentPositions: PositionBreakdown[], targetMatches: TechniqueMatch[]): StyleComparisonRow[] {
  const targetByPosition = new Map<Exclude<CanonicalPosition, 'other'>, number[]>();
  for (const m of targetMatches) {
    const technique = getTechnique(m.techniqueId);
    if (!technique) continue;
    const pos = classifyPosition(technique);
    if (pos === 'other') continue;
    const list = targetByPosition.get(pos) ?? [];
    list.push(m.relevanceScore);
    targetByPosition.set(pos, list);
  }

  return COMPARISON_POSITIONS.map((position) => {
    const currentEntry = currentPositions.find((p) => p.position === position);
    const targetScores = targetByPosition.get(position);
    const targetAvg = targetScores && targetScores.length > 0 ? targetScores.reduce((a, b) => a + b, 0) / targetScores.length : null;
    return {
      position,
      label: POSITION_LABEL[position],
      currentStars: currentEntry && currentEntry.analyzedCount > 0 ? starsFromScore(currentEntry.averageScore) : null,
      targetStars: starsFromScore(targetAvg),
    };
  });
}

const MAX_IMPROVEMENT_ITEMS = 3;

// Deterministic gap ranking — target's importance minus the user's own
// measured level, both already real numbers from computeStyleComparison.
// No AI involved in picking WHICH techniques to recommend; the AI never
// gets a chance to invent a technique name here.
export function computeImprovementItems(comparison: StyleComparisonRow[], targetMatches: TechniqueMatch[]): ImprovementItem[] {
  const gaps = comparison
    .filter((row) => row.targetStars !== null)
    .map((row) => ({ row, gap: row.targetStars! - (row.currentStars ?? 0) }))
    .filter((g) => g.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, MAX_IMPROVEMENT_ITEMS);

  const items: ImprovementItem[] = [];
  for (const { row } of gaps) {
    const candidates = targetMatches
      .filter((m) => {
        const t = getTechnique(m.techniqueId);
        return t && classifyPosition(t) === row.position;
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
    const best = candidates[0];
    if (!best) continue;
    const technique = getTechnique(best.techniqueId);
    if (!technique) continue;
    const currentLabel = row.currentStars ? `현재 ${'★'.repeat(row.currentStars)}${'☆'.repeat(5 - row.currentStars)}` : '현재 데이터 부족';
    const targetLabel = `목표 ${'★'.repeat(row.targetStars ?? 0)}${'☆'.repeat(5 - (row.targetStars ?? 0))}`;
    items.push({
      position: row.position,
      positionLabel: row.label,
      techniqueId: technique.id,
      techniqueName: technique.name,
      martialArt: technique.martialArt,
      reason: `${row.label} — ${currentLabel} · ${targetLabel}. 목표 스타일에서 중요도가 높은 영역입니다.`,
    });
  }
  return items;
}
