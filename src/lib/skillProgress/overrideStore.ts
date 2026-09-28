import type { MasteryStatus } from './types';

// 14-3: "사용자가 직접 상태를 변경할 수 있도록 한다 ... 사용자 지정 상태는
// 저장한다." A sparse, tiny map — most of the 1,253 techniques will never
// have an entry here. Deliberately NOT folded into a bigger "skillProgress"
// table: everything else (score, practice count, dates) is already derived
// from poseAnalysis + trainingHistory, so persisting only the one field the
// user actually sets avoids a duplicate/stale copy of data that already
// lives elsewhere.
const KEY = 'martialdex:skill-status-overrides';

function readAll(): Record<string, MasteryStatus> {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, MasteryStatus>) : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, MasteryStatus>) {
  window.localStorage.setItem(KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent('martialdex:skill-overrides-updated'));
}

export function getOverride(techniqueId: string): MasteryStatus | null {
  return readAll()[techniqueId] ?? null;
}

export function setOverride(techniqueId: string, status: MasteryStatus): void {
  const all = readAll();
  all[techniqueId] = status;
  writeAll(all);
}

export function clearOverride(techniqueId: string): void {
  const all = readAll();
  delete all[techniqueId];
  writeAll(all);
}

export function getAllOverrides(): Record<string, MasteryStatus> {
  return readAll();
}
