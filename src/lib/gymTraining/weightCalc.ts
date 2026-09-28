import type { GymWeightCalcType } from '../../types';

const BODYWEIGHT_KEY = 'martialdex:user-bodyweight-kg';

/** Local-first, per-device — no Supabase sync yet (out of scope for this
 * pass; flagged as a known limitation). Needed by 'assisted_machine' and
 * 'bodyweight' calc types to turn a set's input into an actual load. */
export function getUserBodyweightKg(): number | null {
  try {
    const raw = window.localStorage.getItem(BODYWEIGHT_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function setUserBodyweightKg(kg: number | null): void {
  try {
    if (kg == null || !Number.isFinite(kg) || kg <= 0) window.localStorage.removeItem(BODYWEIGHT_KEY);
    else window.localStorage.setItem(BODYWEIGHT_KEY, String(kg));
  } catch {
    // localStorage unavailable — the setting simply doesn't persist this session.
  }
}

export interface SetVolumeInput {
  /** Undefined behaves exactly like 'standard' (see GymWeightCalcType's doc comment) — every technique before this field existed. */
  weightCalcType?: GymWeightCalcType | null;
  /** The raw value the user typed in. Meaning depends on weightCalcType: the plate/machine weight (standard), ONE dumbbell's weight (dumbbell), the assist weight (assisted_machine), or unused (bodyweight). */
  inputWeightKg: number | null;
  reps: number | null;
  /** Required only for 'assisted_machine'/'bodyweight' — the lifter's bodyweight AT THE TIME this set was recorded (a snapshot, not read live at display time — see calculateSetVolume's own doc comment on why). */
  bodyweightKg?: number | null;
}

/**
 * Translates a set's raw input weight into the ACTUAL load lifted — the
 * single source of truth every volume/recovery/display consumer must go
 * through instead of assuming `inputWeightKg` IS the load.
 *   - standard (undefined too): input IS the load.
 *   - dumbbell: input is ONE dumbbell's weight — actual load is input × 2
 *     (both hands/dumbbells).
 *   - assisted_machine: actual load is max(0, bodyweight - assist) — never
 *     negative even if the configured assist exceeds bodyweight.
 *   - bodyweight: actual load is the bodyweight itself; `inputWeightKg` is unused.
 * Returns null only when a required input is missing (no bodyweight known
 * for assisted_machine/bodyweight, or no weight typed for standard/dumbbell)
 * — never NaN, never a fabricated number.
 */
export function calculateActualWeightKg(input: SetVolumeInput): number | null {
  const type = input.weightCalcType ?? 'standard';
  switch (type) {
    case 'dumbbell':
      return input.inputWeightKg == null ? null : input.inputWeightKg * 2;
    case 'assisted_machine': {
      if (input.bodyweightKg == null) return null;
      const assist = input.inputWeightKg ?? 0;
      return Math.max(0, input.bodyweightKg - assist);
    }
    case 'bodyweight':
      return input.bodyweightKg ?? null;
    case 'standard':
    default:
      return input.inputWeightKg;
  }
}

/**
 * The one function every volume total (세트/운동/오늘/주간/월간/달력/성장률/회복도)
 * must call instead of doing `weightKg * reps` inline — see item 9's "하나의
 * 중앙 계산 함수" requirement. Missing weight or reps contributes 0, never NaN.
 */
export function calculateSetVolumeKg(input: SetVolumeInput): number {
  const actual = calculateActualWeightKg(input);
  if (actual == null || input.reps == null) return 0;
  return actual * input.reps;
}
