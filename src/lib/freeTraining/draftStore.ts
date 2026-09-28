import type { FreeTrainingDraft, FreeTrainingEntry } from './types';

// Local-first draft persistence for the free-training BUILDER screen (before
// training starts) — same convention as every other in-progress-state module
// in this app (todayTraining/combo/curriculum all use a single localStorage
// key + a CustomEvent). This is the fix for the exact class of bug found and
// fixed in MySkills.tsx this session: a page's own useState is wiped when
// React Router unmounts it on navigation (e.g. clicking into a technique's
// real detail page from the builder), so anything that must survive that
// round trip has to live outside the component. Unlike MySkills' simple
// filter (three primitives, a good fit for URL search params), the builder's
// state is a whole ordered technique list + per-technique config object —
// too much/too structured to reasonably encode in a URL, so it follows the
// app's OTHER established pattern for this instead.
const KEY = 'martialdex:free-training-draft';
const EVENT = 'martialdex:free-training-draft-updated';

export function readDraft(): FreeTrainingDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FreeTrainingDraft) : null;
  } catch {
    return null;
  }
}

export function writeDraft(draft: FreeTrainingDraft | null) {
  if (draft) window.localStorage.setItem(KEY, JSON.stringify(draft));
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getOrCreateDraft(defaultMartialArt: string): FreeTrainingDraft {
  return readDraft() ?? { martialArt: defaultMartialArt, entries: [] };
}

export function setDraftMartialArt(martialArt: string): FreeTrainingDraft {
  const draft = readDraft() ?? { martialArt, entries: [] };
  const updated: FreeTrainingDraft = { ...draft, martialArt };
  writeDraft(updated);
  return updated;
}

export function addDraftEntry(entry: FreeTrainingEntry): FreeTrainingDraft {
  const draft = readDraft() ?? { martialArt: '', entries: [] };
  if (draft.entries.some((e) => e.techniqueId === entry.techniqueId)) return draft;
  const updated: FreeTrainingDraft = { ...draft, entries: [...draft.entries, entry] };
  writeDraft(updated);
  return updated;
}

export function removeDraftEntry(techniqueId: string): FreeTrainingDraft | null {
  const draft = readDraft();
  if (!draft) return null;
  const updated: FreeTrainingDraft = { ...draft, entries: draft.entries.filter((e) => e.techniqueId !== techniqueId) };
  writeDraft(updated);
  return updated;
}

export function reorderDraftEntries(fromIndex: number, toIndex: number): FreeTrainingDraft | null {
  const draft = readDraft();
  if (!draft || fromIndex === toIndex) return draft;
  const entries = [...draft.entries];
  const [moved] = entries.splice(fromIndex, 1);
  entries.splice(toIndex, 0, moved);
  const updated: FreeTrainingDraft = { ...draft, entries };
  writeDraft(updated);
  return updated;
}

export function updateDraftEntryConfig(techniqueId: string, config: FreeTrainingEntry['config']): FreeTrainingDraft | null {
  const draft = readDraft();
  if (!draft) return null;
  const updated: FreeTrainingDraft = {
    ...draft,
    entries: draft.entries.map((e) => (e.techniqueId === techniqueId ? { ...e, config } : e)),
  };
  writeDraft(updated);
  return updated;
}

export function clearDraft(): void {
  writeDraft(null);
}

export { KEY as FREE_TRAINING_DRAFT_KEY, EVENT as FREE_TRAINING_DRAFT_EVENT };
