import type { GymRoutine, GymRoutineDay, GymRoutineExerciseTarget, Weekday } from './types';
import { gymRoutineRepository } from './repository';

function newId(): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `gym-routine__${rand}`;
}

export function listMyGymRoutines(): GymRoutine[] {
  return gymRoutineRepository.list();
}

export function getGymRoutine(id: string): GymRoutine | undefined {
  return gymRoutineRepository.get(id);
}

export function getActiveGymRoutine(): GymRoutine | undefined {
  return gymRoutineRepository.list().find((r) => r.active);
}

export function createGymRoutine(name: string): GymRoutine {
  const now = new Date().toISOString();
  const routine: GymRoutine = {
    id: newId(),
    name: name.trim() || '새 루틴',
    days: [],
    active: false,
    createdAt: now,
    updatedAt: now,
  };
  gymRoutineRepository.save(routine);
  return routine;
}

export function renameGymRoutine(routine: GymRoutine, name: string): GymRoutine {
  const updated: GymRoutine = { ...routine, name: name.trim() || routine.name, updatedAt: new Date().toISOString() };
  gymRoutineRepository.save(updated);
  return updated;
}

/** Exactly one routine may be active at a time — activating one deactivates every other routine. */
export function setActiveGymRoutine(id: string): void {
  const now = new Date().toISOString();
  for (const r of gymRoutineRepository.list()) {
    const shouldBeActive = r.id === id;
    if (r.active !== shouldBeActive) gymRoutineRepository.save({ ...r, active: shouldBeActive, updatedAt: now });
  }
}

/**
 * Turns a routine off WITHOUT activating any other routine — leaves zero
 * routines active. Distinct from setActiveGymRoutine (which always makes
 * exactly the given routine active and every other one inactive) since
 * that function has no way to express "just turn this one off" — needed by
 * the 훈련 루틴 관리 screen's per-routine toggle (GymRoutineActivation.tsx),
 * where tapping an already-active routine's switch should turn it off, not
 * silently re-activate it (a no-op re-save) or activate some other routine.
 */
export function deactivateGymRoutine(id: string): void {
  const routine = gymRoutineRepository.get(id);
  if (!routine || !routine.active) return;
  gymRoutineRepository.save({ ...routine, active: false, updatedAt: new Date().toISOString() });
}

export function deleteGymRoutine(id: string): void {
  gymRoutineRepository.delete(id);
}

function getOrCreateDay(routine: GymRoutine, weekday: Weekday): { day: GymRoutineDay; days: GymRoutineDay[] } {
  const days = routine.days.map((d) => ({ ...d, exercises: [...d.exercises] }));
  let day = days.find((d) => d.weekday === weekday);
  if (!day) {
    day = { weekday, exercises: [] };
    days.push(day);
  }
  return { day, days };
}

export function addExerciseToDay(routine: GymRoutine, weekday: Weekday, target: GymRoutineExerciseTarget): GymRoutine {
  const { day, days } = getOrCreateDay(routine, weekday);
  if (day.exercises.some((e) => e.techniqueId === target.techniqueId)) return routine;
  day.exercises.push(target);
  const updated: GymRoutine = { ...routine, days, updatedAt: new Date().toISOString() };
  gymRoutineRepository.save(updated);
  return updated;
}

export function removeExerciseFromDay(routine: GymRoutine, weekday: Weekday, index: number): GymRoutine {
  const { day, days } = getOrCreateDay(routine, weekday);
  day.exercises.splice(index, 1);
  const updated: GymRoutine = { ...routine, days: days.filter((d) => d.exercises.length > 0 || d.weekday !== weekday), updatedAt: new Date().toISOString() };
  gymRoutineRepository.save(updated);
  return updated;
}

/** Resizes a per-set reps array to `sets` entries, padding new slots with the last existing value (or null) rather than dropping back to some arbitrary default. */
function resizeReps(reps: (number | null)[], sets: number): (number | null)[] {
  const next = reps.slice(0, sets);
  while (next.length < sets) next.push(next[next.length - 1] ?? null);
  return next;
}

/**
 * Edits one exercise's target sets/reps/seconds/weight/rest in place — the
 * routine-builder's inline stat editor uses this. A `targetSets` patch
 * automatically resizes `targetReps` to match (growing pads with the last
 * set's value, shrinking truncates) so the two never drift out of sync.
 */
export function updateExerciseTarget(
  routine: GymRoutine,
  weekday: Weekday,
  index: number,
  patch: Partial<GymRoutineExerciseTarget>
): GymRoutine {
  const { day, days } = getOrCreateDay(routine, weekday);
  const current = day.exercises[index];
  if (!current) return routine;
  const merged = { ...current, ...patch };
  if (patch.targetSets != null && patch.targetSets !== current.targetSets) {
    merged.targetReps = resizeReps(current.targetReps, patch.targetSets);
    merged.targetWeightKg = resizeReps(current.targetWeightKg, patch.targetSets);
  }
  day.exercises[index] = merged;
  const updated: GymRoutine = { ...routine, days, updatedAt: new Date().toISOString() };
  gymRoutineRepository.save(updated);
  return updated;
}

/** Sets a single set's target reps (the per-set "횟수" inputs in the routine builder). */
export function setSetReps(routine: GymRoutine, weekday: Weekday, index: number, setIndex: number, reps: number | null): GymRoutine {
  const { day, days } = getOrCreateDay(routine, weekday);
  const current = day.exercises[index];
  if (!current || setIndex < 0 || setIndex >= current.targetReps.length) return routine;
  const targetReps = current.targetReps.map((r, i) => (i === setIndex ? reps : r));
  day.exercises[index] = { ...current, targetReps };
  const updated: GymRoutine = { ...routine, days, updatedAt: new Date().toISOString() };
  gymRoutineRepository.save(updated);
  return updated;
}

/** "모든 세트 동일하게" — overwrites every set's target reps with the same value in one action. */
export function setAllSetsReps(routine: GymRoutine, weekday: Weekday, index: number, reps: number | null): GymRoutine {
  const { day, days } = getOrCreateDay(routine, weekday);
  const current = day.exercises[index];
  if (!current) return routine;
  day.exercises[index] = { ...current, targetReps: current.targetReps.map(() => reps) };
  const updated: GymRoutine = { ...routine, days, updatedAt: new Date().toISOString() };
  gymRoutineRepository.save(updated);
  return updated;
}

/** Sets a single set's target weight (kg) — the per-set "무게" inputs in the routine builder, mirroring setSetReps above (spec "헬스 운동 — 세트별 무게 지원"). */
export function setSetWeight(routine: GymRoutine, weekday: Weekday, index: number, setIndex: number, weightKg: number | null): GymRoutine {
  const { day, days } = getOrCreateDay(routine, weekday);
  const current = day.exercises[index];
  if (!current || setIndex < 0 || setIndex >= current.targetWeightKg.length) return routine;
  const targetWeightKg = current.targetWeightKg.map((w, i) => (i === setIndex ? weightKg : w));
  day.exercises[index] = { ...current, targetWeightKg };
  const updated: GymRoutine = { ...routine, days, updatedAt: new Date().toISOString() };
  gymRoutineRepository.save(updated);
  return updated;
}

/** "모든 세트 동일하게" (무게) — overwrites every set's target weight with the same value in one action. */
export function setAllSetsWeight(routine: GymRoutine, weekday: Weekday, index: number, weightKg: number | null): GymRoutine {
  const { day, days } = getOrCreateDay(routine, weekday);
  const current = day.exercises[index];
  if (!current) return routine;
  day.exercises[index] = { ...current, targetWeightKg: current.targetWeightKg.map(() => weightKg) };
  const updated: GymRoutine = { ...routine, days, updatedAt: new Date().toISOString() };
  gymRoutineRepository.save(updated);
  return updated;
}

/**
 * "실제 수행값을 다음 루틴에 반영" (item 2) — called ONLY when the user
 * explicitly confirms after a training session completes, never mid-session
 * (the routine's plan values stay untouched while the workout is in
 * progress — see todayTraining/sessionStore.ts's applyActualsToTodayRoutine
 * caller). Looked up by (routineId, weekday, techniqueId) rather than an
 * index, since the caller only knows which exercise was trained, not its
 * position in the (possibly since-reordered) day.
 *
 * Representative-value rule, applied consistently everywhere this is used:
 *   - targetReps becomes exactly the per-set actual reps performed (and
 *     targetSets is resized to match — if the user did 3 sets, the next
 *     plan is 3 sets with those rep values, not the OLD set count).
 *   - targetWeightKg becomes exactly the per-set actual weights performed
 *     (e.g. 40/45/50kg stays a 40/45/50kg plan next time, not collapsed to
 *     one value — spec "헬스 운동 — 세트별 무게 지원"), left untouched if no
 *     set recorded a weight at all.
 */
export function applyActualsToExercise(
  routineId: string,
  weekday: Weekday,
  techniqueId: string,
  actuals: { repsPerSet: (number | null)[]; weightPerSetKg: (number | null)[] }
): GymRoutine | undefined {
  const routine = gymRoutineRepository.get(routineId);
  if (!routine) return undefined;
  const { day, days } = getOrCreateDay(routine, weekday);
  const index = day.exercises.findIndex((e) => e.techniqueId === techniqueId);
  if (index === -1) return undefined;
  const current = day.exercises[index];
  const hasAnyWeight = actuals.weightPerSetKg.some((w) => w != null);
  day.exercises[index] = {
    ...current,
    targetSets: actuals.repsPerSet.length || current.targetSets,
    targetReps: actuals.repsPerSet.length > 0 ? actuals.repsPerSet : current.targetReps,
    targetWeightKg: hasAnyWeight ? resizeReps(actuals.weightPerSetKg, actuals.repsPerSet.length || current.targetSets) : current.targetWeightKg,
  };
  const updated: GymRoutine = { ...routine, days, updatedAt: new Date().toISOString() };
  gymRoutineRepository.save(updated);
  return updated;
}

/** Pure splice-based reorder — no drag-and-drop dependency, driven by simple ▲▼ move buttons for touch reliability. */
export function reorderExercise(routine: GymRoutine, weekday: Weekday, fromIndex: number, toIndex: number): GymRoutine {
  const { day, days } = getOrCreateDay(routine, weekday);
  if (toIndex < 0 || toIndex >= day.exercises.length) return routine;
  const [moved] = day.exercises.splice(fromIndex, 1);
  day.exercises.splice(toIndex, 0, moved);
  const updated: GymRoutine = { ...routine, days, updatedAt: new Date().toISOString() };
  gymRoutineRepository.save(updated);
  return updated;
}
