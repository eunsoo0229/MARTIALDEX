import type { MasteryStatus } from './types';
import { canonicalTechniqueId, equivalentTechniqueIds } from '../techniqueCanonical';

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

// Overrides may have been saved under a technique id that was later merged
// into a canonical technique (techniqueCanonical/). Reads are keyed by the
// canonical id; when both the canonical id and a merged-away id carry a
// value, the canonical id's own value wins (it is the newer write — every
// write below goes to the canonical id). Old keys are left in place, so
// nothing the user set is ever lost.
function canonicalMap(): Record<string, MasteryStatus> {
  const raw = readAll();
  const out: Record<string, MasteryStatus> = {};
  for (const [id, status] of Object.entries(raw)) {
    const c = canonicalTechniqueId(id);
    if (c === id || !(c in out)) out[c] = status;
  }
  for (const [id, status] of Object.entries(raw)) if (canonicalTechniqueId(id) === id) out[id] = status;
  return out;
}

export function getOverride(techniqueId: string): MasteryStatus | null {
  return canonicalMap()[canonicalTechniqueId(techniqueId)] ?? null;
}

export function setOverride(techniqueId: string, status: MasteryStatus): void {
  setOverrides([techniqueId], status);
}

export function clearOverride(techniqueId: string): void {
  setOverrides([techniqueId], null);
}

export function getAllOverrides(): Record<string, MasteryStatus> {
  return canonicalMap();
}

/**
 * Bulk variant for "배운 기술" multi-select — same map, same event, but ONE
 * read + ONE write for the whole selection (status null = back to the
 * computed value). Written under the canonical id; clearing also clears the
 * merged-away ids so an old value can't resurface. Every id is applied or
 * none is: a single setItem.
 */
export function setOverrides(techniqueIds: string[], status: MasteryStatus | null): void {
  const all = readAll();
  for (const id of techniqueIds) {
    const c = canonicalTechniqueId(id);
    if (status) all[c] = status;
    else for (const eq of equivalentTechniqueIds(c)) delete all[eq];
  }
  writeAll(all);
}
