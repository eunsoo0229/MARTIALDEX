import { useState } from 'react';
import type { GymWeightCalcType } from '../types';
import { toDisplayUnit, toKg } from '../lib/gymTraining/volume';
import { calculateActualWeightKg, getUserBodyweightKg, setUserBodyweightKg } from '../lib/gymTraining/weightCalc';
import GymWeightComparison from './GymWeightComparison';

interface SetLike {
  completed: boolean;
  actualReps: number | null;
  weightKg?: number | null;
}

/**
 * A routine's target sets/weight are fixed at "오늘의 훈련" plan-build time
 * (see todayTraining/planner.ts), but a real workout rarely matches the plan
 * exactly — the lifter might warm up lighter or go heavier than planned on
 * set 1. Without this, GymSetInput (remounted fresh per set via its `key`)
 * always re-prefilled from the ORIGINAL routine target, so changing the
 * weight for set 1 had no effect on sets 2/3 — the user had to retype the
 * same correction every single set. This carries the last COMPLETED set's
 * actual weight forward as the new default for the next set instead,
 * falling back to the routine's original target only before any set in this
 * exercise has been completed yet. The carried-forward value is always the
 * RAW input (e.g. one dumbbell's weight, or the assist weight) — never the
 * calculated actual load — since that's what re-populates the same input
 * field the user is editing.
 *
 * Reps are handled differently when `repsPerSet` is given: a routine can
 * deliberately plan a different rep count per set (e.g. a 12/10/8 pyramid),
 * so carrying forward set 1's ACTUAL reps as set 2's default would silently
 * overwrite that plan the moment set 1 finished. In that case the per-set
 * planned value always wins for reps. The exact same rule now applies to
 * weight when `weightPerSet` is given (spec "헬스 운동 — 세트별 무게 지원",
 * e.g. a 40/45/50kg pyramid) — the planned per-set weight wins over the
 * previous set's actual, so the routine's plan is genuinely followed
 * instead of being silently overwritten by whatever the lifter typed for
 * set 1. Without `weightPerSet`/`repsPerSet` (free training with no
 * routine, or legacy data), both carry forward from the last actual entry,
 * unchanged from before.
 */
export function computeCarryForwardTarget(
  sets: SetLike[],
  activeSetIndex: number,
  fallback: { targetWeightKg: number | null; targetReps: number | null; repsPerSet?: (number | null)[]; weightPerSet?: (number | null)[] }
): { weightKg: number | null; reps: number | null } {
  let weightKg: number | null;
  if (fallback.weightPerSet) {
    weightKg = fallback.weightPerSet[activeSetIndex] ?? fallback.targetWeightKg;
  } else {
    weightKg = fallback.targetWeightKg;
    for (let i = activeSetIndex - 1; i >= 0; i--) {
      if (sets[i]?.completed) {
        weightKg = sets[i].weightKg ?? fallback.targetWeightKg;
        break;
      }
    }
  }

  if (fallback.repsPerSet) {
    return { weightKg, reps: fallback.repsPerSet[activeSetIndex] ?? fallback.targetReps };
  }
  for (let i = activeSetIndex - 1; i >= 0; i--) {
    const s = sets[i];
    if (s?.completed) {
      return { weightKg, reps: s.actualReps ?? fallback.targetReps };
    }
  }
  return { weightKg, reps: fallback.targetReps };
}

// Shared by TodayTraining.tsx (루틴 기반 세트) and FreeTraining.tsx (자유
//훈련에서 추가한 헬스 운동) — the one place a gym exercise's set gets
// weight/reps/RPE typed in, so both flows write the exact same
// TrainingExerciseDetail shape (trainingHistory/types.ts) and therefore feed
// the exact same volume/growthRate/recovery calculations with zero
// downstream branching on "which screen recorded this."
//
// The weight/dumbbell/assist input always edits in the CURRENTLY selected
// display unit; toggling kg<->lbs immediately converts the numeric value
// through the canonical kg round-trip (toKg/toDisplayUnit) so precision is
// preserved. `weightCalcType` (from the technique's gymWeightCalcType,
// undefined = 'standard') decides which fields render and how the actual
// load is derived — see gymTraining/weightCalc.ts's calculateActualWeightKg,
// the single function this and every volume calculation goes through.
export default function GymSetInput({
  targetReps,
  targetWeightKg,
  weightCalcType,
  previousSetsLabel,
  comparison,
  onComplete,
}: {
  targetReps: number | null;
  targetWeightKg: number | null;
  weightCalcType?: GymWeightCalcType | null;
  /** e.g. "60kg×10, 60kg×10, 60kg×8" — the previous completed session's sets for this exercise (records.ts). */
  previousSetsLabel: string | null;
  /** When given, shows 지난 운동/지난주/지난달 weight change for this set (GymWeightComparison). */
  comparison?: { techniqueId: string; setIndex: number; completedSets?: { loadKg: number | null; reps: number | null }[] };
  onComplete: (result: { actualReps: number; weightKg: number; calculatedWeightKg: number; rpe: number | null }) => void;
}) {
  const type = weightCalcType ?? 'standard';
  const [unit, setUnit] = useState<'kg' | 'lbs'>('kg');
  const [weightValue, setWeightValue] = useState(targetWeightKg != null ? String(targetWeightKg) : '');
  const [assistValue, setAssistValue] = useState(targetWeightKg != null ? String(targetWeightKg) : '');
  const [bodyweightValue, setBodyweightValue] = useState(() => {
    const stored = getUserBodyweightKg();
    return stored != null ? String(stored) : '';
  });
  const [repsValue, setRepsValue] = useState(targetReps != null ? String(targetReps) : '');
  const [rpeValue, setRpeValue] = useState('');

  function toggleUnit(next: 'kg' | 'lbs') {
    if (next === unit) return;
    for (const [value, setValue] of [
      [weightValue, setWeightValue],
      [assistValue, setAssistValue],
      [bodyweightValue, setBodyweightValue],
    ] as const) {
      const current = Number(value);
      if (value.trim() !== '' && Number.isFinite(current)) {
        const kg = toKg(current, unit);
        const converted = toDisplayUnit(kg, next);
        setValue((Math.round(converted * 100) / 100).toString());
      }
    }
    setUnit(next);
  }

  const bodyweightKg = bodyweightValue.trim() === '' ? null : toKg(Math.max(0, Number(bodyweightValue) || 0), unit);
  const rawInputKg =
    type === 'dumbbell'
      ? weightValue.trim() === ''
        ? null
        : toKg(Math.max(0, Number(weightValue) || 0), unit)
      : type === 'assisted_machine'
        ? assistValue.trim() === ''
          ? 0
          : toKg(Math.max(0, Number(assistValue) || 0), unit)
        : type === 'bodyweight'
          ? null
          : weightValue.trim() === ''
            ? null
            : toKg(Math.max(0, Number(weightValue) || 0), unit);
  const calculatedKg = calculateActualWeightKg({ weightCalcType: type, inputWeightKg: rawInputKg, bodyweightKg, reps: null });

  const canComplete =
    repsValue.trim() !== '' &&
    (type === 'standard'
      ? weightValue.trim() !== ''
      : type === 'dumbbell'
        ? weightValue.trim() !== ''
        : type === 'assisted_machine'
          ? bodyweightValue.trim() !== ''
          : bodyweightValue.trim() !== '');

  function handleComplete() {
    const repsNum = Math.max(0, Number(repsValue) || 0);
    const rpeNum = rpeValue.trim() === '' ? null : Math.min(10, Math.max(1, Number(rpeValue) || 0));
    if (type === 'bodyweight' || type === 'assisted_machine') {
      if (bodyweightKg != null) setUserBodyweightKg(bodyweightKg);
    }
    // weightKg (raw) is what re-populates this same field next set via
    // computeCarryForwardTarget — for bodyweight, there's no separate raw
    // input, so the bodyweight itself doubles as the stored "raw" value.
    const rawToStore = type === 'bodyweight' ? (bodyweightKg ?? 0) : (rawInputKg ?? 0);
    const calculated = calculateActualWeightKg({ weightCalcType: type, inputWeightKg: rawInputKg, bodyweightKg, reps: null }) ?? 0;
    onComplete({ actualReps: repsNum, weightKg: rawToStore, calculatedWeightKg: calculated, rpe: rpeNum });
  }

  const targetLabel =
    type === 'bodyweight'
      ? '체중'
      : type === 'assisted_machine'
        ? targetWeightKg != null
          ? `보조 ${targetWeightKg}kg`
          : '보조 무게 미정'
        : type === 'dumbbell'
          ? targetWeightKg != null
            ? `한쪽 ${targetWeightKg}kg`
            : '자유 중량'
          : targetWeightKg != null
            ? `${targetWeightKg}kg`
            : '자유 중량';

  return (
    <div className="gym-set-input">
      {previousSetsLabel && <p className="video-status-message">최근 기록: {previousSetsLabel}</p>}
      <p>
        목표: <strong>{targetLabel} × {targetReps ?? '-'}회</strong>
      </p>
      <div className="chip-row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        {type === 'bodyweight' && (
          <label className="field-label">
            현재 체중
            <input
              type="number"
              className="select gym-num-input gym-num-input--wide"
              min={0}
              step="0.5"
              value={bodyweightValue}
              onChange={(e) => setBodyweightValue(e.target.value)}
            />
          </label>
        )}
        {type === 'assisted_machine' && (
          <>
            <label className="field-label">
              현재 체중
              <input
                type="number"
                className="select gym-num-input gym-num-input--wide"
                min={0}
                step="0.5"
                value={bodyweightValue}
                onChange={(e) => setBodyweightValue(e.target.value)}
              />
            </label>
            <label className="field-label">
              보조 무게
              <input
                type="number"
                className="select gym-num-input gym-num-input--wide"
                min={0}
                step="0.5"
                value={assistValue}
                onChange={(e) => setAssistValue(e.target.value)}
              />
            </label>
          </>
        )}
        {type === 'dumbbell' && (
          <label className="field-label">
            한쪽 무게
            <input
              type="number"
              className="select gym-num-input gym-num-input--wide"
              min={0}
              step="0.5"
              value={weightValue}
              onChange={(e) => setWeightValue(e.target.value)}
            />
          </label>
        )}
        {type === 'standard' && (
          <label className="field-label">
            중량
            <input
              type="number"
              className="select gym-num-input gym-num-input--wide"
              min={0}
              step="0.5"
              value={weightValue}
              onChange={(e) => setWeightValue(e.target.value)}
            />
          </label>
        )}
        {type !== 'bodyweight' && (
          <div className="chip-row" style={{ gap: 4 }}>
            <button type="button" className={`chip${unit === 'kg' ? ' active' : ''}`} onClick={() => toggleUnit('kg')}>
              kg
            </button>
            <button type="button" className={`chip${unit === 'lbs' ? ' active' : ''}`} onClick={() => toggleUnit('lbs')}>
              lbs
            </button>
          </div>
        )}
        <label className="field-label">
          반복
          <input
            type="number"
            className="select gym-num-input"
            min={0}
            value={repsValue}
            onChange={(e) => setRepsValue(e.target.value)}
          />
        </label>
        <label className="field-label">
          RPE
          <input
            type="number"
            className="select gym-num-input"
            min={1}
            max={10}
            placeholder="선택"
            value={rpeValue}
            onChange={(e) => setRpeValue(e.target.value)}
          />
        </label>
        <button className="btn btn-primary set-complete-btn" disabled={!canComplete} onClick={handleComplete}>
          세트 완료
        </button>
      </div>
      {(type === 'dumbbell' || type === 'assisted_machine') && (
        <p className="video-status-message">계산 중량: {calculatedKg != null ? `${Math.round(calculatedKg * 10) / 10}kg` : '-'}</p>
      )}
      {comparison && (
        <GymWeightComparison
          techniqueId={comparison.techniqueId}
          weightCalcType={type}
          setIndex={comparison.setIndex}
          currentKg={calculatedKg}
          currentReps={repsValue.trim() === '' ? null : Math.max(0, Number(repsValue) || 0)}
          completedSets={comparison.completedSets ?? []}
          unit={unit}
        />
      )}
    </div>
  );
}
