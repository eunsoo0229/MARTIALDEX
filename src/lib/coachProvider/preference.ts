import { isCoachKind, type CoachKind } from './types';

// The coach choice remembered on THIS device. Default: ask before every
// lesson, with the last choice pre-selected. "다음부터 묻지 않기" skips the
// picker and uses the remembered coach (still shown, and changeable, in the lesson).

const KEY = 'martialdex:coach-kind-pref';

export interface CoachPreference {
  last: CoachKind | null;
  /** true = use `last` without asking. */
  remember: boolean;
}

export function getCoachPreference(): CoachPreference {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Partial<CoachPreference> | null;
    return { last: isCoachKind(raw?.last) ? raw!.last : null, remember: raw?.remember === true && isCoachKind(raw?.last) };
  } catch {
    return { last: null, remember: false };
  }
}

export function saveCoachPreference(p: CoachPreference): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ last: p.last, remember: p.remember && !!p.last }));
  } catch {
    // storage unavailable — the picker simply shows every time
  }
}

/** The coach to use without showing the picker, or null when the user should be asked. */
export function rememberedCoach(): CoachKind | null {
  const p = getCoachPreference();
  return p.remember ? p.last : null;
}
