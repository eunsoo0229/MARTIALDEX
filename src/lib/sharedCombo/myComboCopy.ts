import type { Combo } from '../combo/types';
import { createCombo, deleteCombo, listMyCombos } from '../combo/service';
import { listMyTactics } from '../tactic/service';
import { resolveTechnique } from '../userTechniques/service';
import type { SharedCombo } from './types';
import { toggleFavoriteCombo } from './localStores';

// ☆ on someone else's 사용자 콤보·셋업 also puts a copy in MY 콤보 북, so
// 콤보 훈련 and AI Visualizing Mitt (which read the combo book) can use it.
// The copy is linked to the shared original (Combo.sharedMeta.sharedComboId):
// starring again never duplicates it, and un-starring removes it unless the
// user has edited the copy since (then it's theirs to keep).

export type CopyResult =
  | { status: 'saved'; combo: Combo }
  | { status: 'exists'; combo: Combo }
  | { status: 'own' }
  | { status: 'no_steps'; missing: string[] };

export function findSharedCopy(sharedComboId: string): Combo | undefined {
  return listMyCombos().find((c) => c.sharedMeta?.sharedComboId === sharedComboId);
}

/** Is this shared combo one of MY OWN combos / tactics (shared from this device)? */
function isOwnSource(c: SharedCombo): boolean {
  const ref = c.sourceRef ?? '';
  if (ref.startsWith('combo:')) return listMyCombos().some((x) => x.id === ref.slice(6));
  if (ref.startsWith('tactic:')) return listMyTactics().some((x) => x.id === ref.slice(7));
  return false;
}

export function saveSharedToMyCombos(c: SharedCombo, viewerId: string | null = null): CopyResult {
  if ((viewerId && c.authorId === viewerId) || isOwnSource(c)) return { status: 'own' };
  const existing = findSharedCopy(c.id);
  if (existing) return { status: 'exists', combo: existing };

  // Only steps this user's library can resolve — the author's private techniques can't be, and are named instead.
  const techniqueIds: string[] = [];
  const missing: string[] = [];
  const stepNotes: NonNullable<Combo['sharedMeta']>['stepNotes'] = [];
  for (const s of c.steps) {
    const t = resolveTechnique(s.techniqueId);
    if (!t) {
      missing.push(s.name);
      continue;
    }
    techniqueIds.push(t.id);
    if (s.note || s.opponentReaction) stepNotes.push({ techniqueId: t.id, note: s.note ?? '', opponentReaction: s.opponentReaction ?? null });
  }
  if (!techniqueIds.length) return { status: 'no_steps', missing };

  const kindLabel = c.kind === 'setup' ? '셋업' : '콤보';
  const combo = createCombo({
    name: c.name,
    description: [c.purpose, c.description].filter(Boolean).join(' — ') || `${c.authorNickname || '다른 사용자'}님의 공유 ${kindLabel}`,
    techniqueIds,
    sharedMeta: { sharedComboId: c.id, authorNickname: c.authorNickname, kind: c.kind, purpose: c.purpose, savedAt: new Date().toISOString(), missingSteps: missing, stepNotes },
  });
  return { status: 'saved', combo };
}

/** Removes the linked copy when it's still exactly as saved; returns whether it was removed. */
export function removeSharedCopy(sharedComboId: string): boolean {
  const copy = findSharedCopy(sharedComboId);
  if (!copy || copy.updatedAt !== copy.createdAt) return false;
  deleteCombo(copy.id);
  return true;
}

/** ☆ on a shared combo: toggles the favorite AND keeps the combo-book copy in step with it. */
export function toggleFavoriteWithCopy(c: SharedCombo, viewerId: string | null): { on: boolean; copy: CopyResult | null; removed: boolean } {
  const on = toggleFavoriteCombo(c);
  if (on) return { on, copy: saveSharedToMyCombos(c, viewerId), removed: false };
  return { on, copy: null, removed: removeSharedCopy(c.id) };
}
