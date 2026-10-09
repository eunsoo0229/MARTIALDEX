import { useMemo, useState } from 'react';
import type { GymWeightCalcType } from '../types';
import { toDisplayUnit } from '../lib/gymTraining/volume';
import {
  WEIGHT_BASELINE_LABEL,
  compareLoad,
  compareVolume,
  findWeightBaselines,
  formatChangePercent,
  listPastWeightRecords,
  supportsWeightComparison,
  type WeightBaselineKind,
} from '../lib/gymTraining/weightComparison';

const KINDS: WeightBaselineKind[] = ['lastSession', 'lastWeek', 'lastMonth'];

function formatLoad(kg: number, unit: 'kg' | 'lbs'): string {
  return `${Math.round(toDisplayUnit(kg, unit) * 10) / 10}${unit}`;
}

function formatVolume(kg: number, unit: 'kg' | 'lbs'): string {
  return `${Math.round(toDisplayUnit(kg, unit)).toLocaleString('ko-KR')}${unit}`;
}

function toneOf(percent: number | undefined): string {
  if (percent == null) return '';
  return percent > 0 ? ' gym-weight-compare__pct--up' : percent < 0 ? ' gym-weight-compare__pct--down' : '';
}

/**
 * 중량 변화율 + 볼륨 변화율 — the set being entered vs 지난 운동/지난주/지난달,
 * rendered small under GymSetInput's fields. Weight and volume are two
 * separate blocks and never combined. `currentKg` is the ACTUAL load (after
 * weightCalcType), the same quantity past records store, so a dumbbell set
 * compares 2×one-dumbbell against 2×one-dumbbell. Rows with no real past
 * record are omitted, never estimated.
 */
export default function GymWeightComparison({
  techniqueId,
  weightCalcType,
  setIndex,
  currentKg,
  currentReps,
  completedSets,
  unit,
}: {
  techniqueId: string;
  weightCalcType?: GymWeightCalcType | null;
  setIndex: number;
  currentKg: number | null;
  currentReps: number | null;
  /** This exercise's already-completed sets today (actual load, reps), in set order. */
  completedSets: { loadKg: number | null; reps: number | null }[];
  unit: 'kg' | 'lbs';
}) {
  const [showDetail, setShowDetail] = useState(false);
  // GymSetInput remounts per set (keyed by set index), so this reads the
  // history once per set rather than on every keystroke.
  const baselines = useMemo(() => findWeightBaselines(listPastWeightRecords(techniqueId, weightCalcType)), [techniqueId, weightCalcType]);

  if (!supportsWeightComparison(weightCalcType)) return null;
  const rows = KINDS.flatMap((kind) => {
    const record = baselines[kind];
    return record ? [{ kind, record }] : [];
  });

  if (rows.length === 0) {
    return <p className="gym-weight-compare__empty">이전 중량 기록 없음</p>;
  }

  // Today's volume so far: completed sets + the set being entered (when it has weight and reps).
  const setVolumes = completedSets.flatMap((s) => (s.loadKg != null && s.loadKg > 0 && s.reps != null ? [s.loadKg * s.reps] : []));
  if (currentKg != null && currentKg > 0 && currentReps != null && currentReps > 0) setVolumes.push(currentKg * currentReps);
  const currentVolume = setVolumes.reduce((a, b) => a + b, 0);

  return (
    <div className="gym-weight-compare">
      <div className="gym-weight-compare__heading">중량</div>
      {rows.map(({ kind, record }) => {
        const comparison = compareLoad(currentKg, record, setIndex);
        const previousKg = comparison?.previousKg ?? record.setLoadsKg[setIndex] ?? record.topLoadKg;
        return (
          <div key={kind} className="gym-weight-compare__row">
            <span className={`gym-weight-compare__pct${toneOf(comparison?.percent)}`}>{comparison ? formatChangePercent(comparison.percent) : '—'}</span>
            <span>{WEIGHT_BASELINE_LABEL[kind]}</span>
            <span className="gym-weight-compare__prev">{formatLoad(previousKg, unit)}</span>
            {showDetail && (
              <span className="gym-weight-compare__meta">
                {record.date} · {record.setLoadsKg[setIndex] != null ? `${setIndex + 1}세트` : '최고 세트'}
              </span>
            )}
          </div>
        );
      })}

      <div className="gym-weight-compare__heading">
        총 볼륨 <span className="gym-weight-compare__prev">{currentVolume > 0 ? formatVolume(currentVolume, unit) : '—'}</span>
        {setVolumes.length > 0 && <span> ({setVolumes.length}세트)</span>}
      </div>
      {rows.map(({ kind, record }) => {
        const comparison = compareVolume(setVolumes, record);
        return (
          <div key={kind} className="gym-weight-compare__row">
            <span className={`gym-weight-compare__pct${toneOf(comparison?.percent)}`}>{comparison ? formatChangePercent(comparison.percent) : '—'}</span>
            <span>{WEIGHT_BASELINE_LABEL[kind]}</span>
            <span className="gym-weight-compare__prev">{formatVolume(comparison?.previousKg ?? record.totalVolumeKg, unit)}</span>
            {showDetail && (
              <span className="gym-weight-compare__meta">
                {record.date} · {comparison?.basis === 'sameSets' ? `처음 ${comparison.setCount}세트 기준` : '전체 세트'}
              </span>
            )}
          </div>
        );
      })}
      <button type="button" className="gym-weight-compare__toggle" onClick={() => setShowDetail((v) => !v)}>
        {showDetail ? '간단히' : '비교 기준 보기'}
      </button>
    </div>
  );
}
