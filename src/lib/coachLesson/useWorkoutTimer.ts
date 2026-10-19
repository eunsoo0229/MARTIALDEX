import { useCallback, useEffect, useRef, useState } from 'react';
import type { CheerLevel } from './workoutPlan';
import { changeRunPlan, pauseWorkout, resumeWorkout, startWorkout, stopWorkout, tickWorkout, type TimerEvent, type WorkoutRun } from './workoutTimer';

// React binding for the pure workout timer. The run lives in state and is
// re-evaluated against Date.now() every 250 ms and immediately when the app
// becomes visible again (a hidden tab's timers are throttled) — the clock,
// not the number of ticks, decides what happened. Exactly one interval
// exists per mounted hook; events go to `onEvents` once.

export function useWorkoutTimer(opts: { initial: WorkoutRun | null; cheer: CheerLevel; onEvents: (events: TimerEvent[], run: WorkoutRun) => void; onChange: (run: WorkoutRun | null) => void }) {
  const [run, setRun] = useState<WorkoutRun | null>(opts.initial);
  const runRef = useRef<WorkoutRun | null>(opts.initial);
  const cbs = useRef(opts);
  cbs.current = opts;
  const [, setNow] = useState(0);

  const commit = useCallback((next: WorkoutRun | null, events: TimerEvent[] = []) => {
    runRef.current = next;
    setRun(next);
    cbs.current.onChange(next);
    if (next && events.length) cbs.current.onEvents(events, next);
  }, []);

  const tick = useCallback(() => {
    const cur = runRef.current;
    if (!cur || cur.paused || cur.phase === 'done') return;
    const r = tickWorkout(cur, Date.now(), cbs.current.cheer);
    if (r.run !== cur) commit(r.run, r.events);
    setNow(Date.now());
  }, [commit]);

  const active = !!run && !run.paused && run.phase !== 'done';
  useEffect(() => {
    if (!active) return;
    tick();
    const id = window.setInterval(tick, 250);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [active, tick]);

  return {
    run,
    start: (plan: WorkoutRun['plan']) => {
      const r = startWorkout(plan, Date.now());
      commit(r.run, r.events);
    },
    pause: () => runRef.current && commit(pauseWorkout(runRef.current, Date.now())),
    resume: () => runRef.current && commit(resumeWorkout(runRef.current, Date.now())),
    stop: () => runRef.current && commit(stopWorkout(runRef.current, Date.now())),
    changePlan: (plan: WorkoutRun['plan']) => runRef.current && commit(changeRunPlan(runRef.current, plan)),
    clear: () => commit(null),
  };
}
