import type { GymRoutineDay, Weekday } from './types';
import { getKstWeekday } from '../dateUtil';
import { getActiveGymRoutine } from './service';

/**
 * Today's (KST weekday) day from the active routine, plus the routine's OWN
 * id/weekday — never just the bare day. A caller that only got the day back
 * (the old return shape) had no way to say "this plan came from THIS
 * specific routine" — it could only re-derive "whichever routine is active
 * right now" independently, which silently desyncs the moment the active
 * routine changes after a plan/session was already built from this call
 * (see todayTraining/planner.ts's TodayTrainingPlan.gymRoutineId, and the
 * bug it fixed: a screen showing "루틴: X" from a fresh getActiveGymRoutine()
 * lookup while the exercise list below it came from an already-frozen
 * session built from a DIFFERENT routine).
 */
export interface TodayGymRoutineDay {
  routineId: string;
  weekday: Weekday;
  day: GymRoutineDay;
}

/** Null if there is no active routine, or the routine has no exercises configured for today (rest day). */
export function getTodayGymRoutineDay(now: Date = new Date()): TodayGymRoutineDay | null {
  const routine = getActiveGymRoutine();
  if (!routine) return null;
  const weekday = getKstWeekday(now);
  const day = routine.days.find((d) => d.weekday === weekday);
  if (!day || day.exercises.length === 0) return null;
  return { routineId: routine.id, weekday, day };
}
