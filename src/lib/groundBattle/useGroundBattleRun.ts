import { useEffect, useState } from 'react';
import { getGroundBattleRun, GROUND_BATTLE_RUN_EVENT } from './matchStore';
import type { GroundBattleRunState } from './types';

const EVENTS = [GROUND_BATTLE_RUN_EVENT, 'storage'];

export function useGroundBattleRun() {
  const [run, setRun] = useState<GroundBattleRunState | null>(getGroundBattleRun);

  useEffect(() => {
    const onUpdate = () => setRun(getGroundBattleRun());
    for (const evt of EVENTS) window.addEventListener(evt, onUpdate);
    return () => {
      for (const evt of EVENTS) window.removeEventListener(evt, onUpdate);
    };
  }, []);

  return run;
}
