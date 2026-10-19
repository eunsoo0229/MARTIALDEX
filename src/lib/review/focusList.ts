// 부족 기술 보완 목록 — techniques the student picked by hand on the 부족 기술
// 보완 복습 screen (the fallback when there's no recorded weakness, or to
// add one the app can't know about). Local, part of the account backup.

export interface FocusTechnique {
  techniqueId: string;
  addedAt: string;
}

const KEY = 'martialdex:review-focus';
export const FOCUS_EVENT = 'martialdex:review-focus-updated';

function read(): FocusTechnique[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => x && typeof x.techniqueId === 'string') : [];
  } catch {
    return [];
  }
}
function write(list: FocusTechnique[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage full
  }
  window.dispatchEvent(new CustomEvent(FOCUS_EVENT));
}

export function listFocusTechniques(): FocusTechnique[] {
  return read();
}
export function addFocusTechnique(techniqueId: string): void {
  if (read().some((x) => x.techniqueId === techniqueId)) return;
  write([{ techniqueId, addedAt: new Date().toISOString() }, ...read()]);
}
export function removeFocusTechnique(techniqueId: string): void {
  write(read().filter((x) => x.techniqueId !== techniqueId));
}
