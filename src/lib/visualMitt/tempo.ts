import { useEffect, useState } from 'react';
import { POV_IMPACT_MS } from '../../components/visualMitt/MittStage';

// 미트 템포 — two sliders shared by every mitt mode (콤보 연속 실행, 공격 지시,
// 반응 훈련), remembered on this device:
//   stepMs     time per technique inside a combo. The punch animation itself
//              always plays at real speed; this is the spacing between
//              techniques. The floor is real pad-work pace: the next mitt can
//              come up as soon as the glove has landed (≈0.21 s) plus a hair.
//   callGapMs  time from the END of the coach's spoken call to the mitt/strike
//              starting on screen (말 끝 → 미트). Without voice it counts from
//              the moment the call is shown.

export const STEP_MS_MIN = POV_IMPACT_MS + 40; // 250 ms — as fast as real pad work
export const STEP_MS_MAX = 1500;
export const CALL_GAP_MIN = 0;
export const CALL_GAP_MAX = 1200;

export interface MittTempo {
  stepMs: number;
  callGapMs: number;
  /** The user moved the speed slider — use their value instead of a drill's suggested speed. */
  userSetStep: boolean;
}

export const DEFAULT_TEMPO: MittTempo = { stepMs: 800, callGapMs: 300, userSetStep: false };

/** The old three speeds as slider positions (preset chips, and a drill's suggested speed). */
export const STEP_PRESETS = { slow: 1300, normal: 800, fast: 450, max: STEP_MS_MIN } as const;

const KEY = 'martialdex:mitt-tempo';
const EVENT = 'martialdex:mitt-tempo-changed';
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(v)));

export function loadTempo(): MittTempo {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Partial<MittTempo> | null;
    if (!v) return DEFAULT_TEMPO;
    return {
      stepMs: typeof v.stepMs === 'number' ? clamp(v.stepMs, STEP_MS_MIN, STEP_MS_MAX) : DEFAULT_TEMPO.stepMs,
      callGapMs: typeof v.callGapMs === 'number' ? clamp(v.callGapMs, CALL_GAP_MIN, CALL_GAP_MAX) : DEFAULT_TEMPO.callGapMs,
      userSetStep: !!v.userSetStep,
    };
  } catch {
    return DEFAULT_TEMPO;
  }
}

export function saveTempo(t: MittTempo) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    // storage unavailable — the slider still works for this session
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * The shared tempo. `suggestedStepMs` (a drill's own speed) applies until the
 * user has moved the speed slider once; after that their value wins.
 */
export function useMittTempo(suggestedStepMs?: number): [MittTempo, (patch: Partial<Pick<MittTempo, 'stepMs' | 'callGapMs'>>) => void] {
  const resolve = () => {
    const t = loadTempo();
    return suggestedStepMs != null && !t.userSetStep ? { ...t, stepMs: clamp(suggestedStepMs, STEP_MS_MIN, STEP_MS_MAX) } : t;
  };
  const [tempo, setTempo] = useState<MittTempo>(resolve);
  useEffect(() => {
    const on = () => setTempo(resolve());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedStepMs]);
  const update = (patch: Partial<Pick<MittTempo, 'stepMs' | 'callGapMs'>>) => {
    const cur = loadTempo();
    const next: MittTempo = {
      stepMs: patch.stepMs != null ? clamp(patch.stepMs, STEP_MS_MIN, STEP_MS_MAX) : tempo.stepMs,
      callGapMs: patch.callGapMs != null ? clamp(patch.callGapMs, CALL_GAP_MIN, CALL_GAP_MAX) : cur.callGapMs,
      userSetStep: cur.userSetStep || patch.stepMs != null,
    };
    setTempo(next);
    saveTempo(next);
  };
  return [tempo, update];
}

/** Recovery pause after a called combo, scaled with the tempo. */
export function restMsFor(stepMs: number): number {
  return clamp(stepMs * 2.2, 500, 3200);
}

/** Kicks/knees/shots need a little longer than a punch, in proportion to the tempo. */
export function kickExtraMs(stepMs: number): number {
  return Math.round(stepMs * 0.45);
}

export function tempoLabel(stepMs: number): string {
  if (stepMs <= 320) return '실전 최고 속도';
  if (stepMs <= 550) return '빠르게';
  if (stepMs <= 1000) return '보통';
  return '천천히';
}
