import { useEffect, useState } from 'react';
import { endSparringRunNow, getSparringRun, pauseSparringRun, resumeSparringRun, tickSparringRun } from './sessionStore';
import type { SparringRunState } from './types';

const EVENTS = ['martialdex:sparring-run-updated', 'storage'];

// Same "one persistent 250ms poll for the page's lifetime" pattern as
// the other timed training stores — checks Date.now() against the run's own
// absolute deadlines, never drifts regardless of render timing.
export function useSparringRun() {
  const [run, setRun] = useState<SparringRunState | null>(getSparringRun);

  useEffect(() => {
    const onUpdate = () => setRun(getSparringRun());
    for (const evt of EVENTS) window.addEventListener(evt, onUpdate);
    return () => {
      for (const evt of EVENTS) window.removeEventListener(evt, onUpdate);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const current = getSparringRun();
      if (!current || current.paused || current.phase === 'finished') return;
      tickSparringRun();
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  return {
    run,
    pause: pauseSparringRun,
    resume: resumeSparringRun,
    endNow: endSparringRunNow,
  };
}
