// Derives display-ready fields from the EXISTING TrainingHistoryEntry log
// (src/lib/trainingHistory/) — no parallel history store. Every function
// here is a pure read: nothing is persisted, nothing is invented for an
// entry that lacks the underlying data (spec section 2: "데이터가 없는
// 항목을 임의로 생성하지 않는다").
import type { TrainingHistoryEntry } from '../trainingHistory/types';
import { getCurriculum } from '../curriculum/curriculumService';
import { resolveTechniquesByIds } from '../userTechniques/service';
import { todayDateKey } from '../dateUtil';

export interface EntrySetsReps {
  totalSets: number;
  totalReps: number | null; // null when every exercise in the entry was time-based, not rep-based
}

function addDaysKey(dateKey: string, delta: number): string {
  const d = new Date(dateKey + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Date-key-based (not timestamp-based) so a session logged at 11:58pm is never mislabeled "어제" by a few minutes' clock drift. */
export function formatRelativeDateLabel(dateKey: string, today: string = todayDateKey()): string {
  if (dateKey === today) return '오늘';
  if (dateKey === addDaysKey(today, -1)) return '어제';
  const diffDays = Math.round((new Date(today + 'T00:00:00Z').getTime() - new Date(dateKey + 'T00:00:00Z').getTime()) / 86400000);
  if (diffDays > 0 && diffDays < 7) return `${diffDays}일 전`;
  const d = new Date(dateKey + 'T00:00:00Z');
  return `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
}

/** curriculumId's martial art first (authoritative), else the martial art most of the entry's real techniques belong to. Returns null only when neither source resolves (e.g. a curriculum that was later deleted and no resolvable techniqueIds). */
export function deriveEntryMartialArt(entry: TrainingHistoryEntry): string | null {
  if (entry.curriculumId) {
    const curriculum = getCurriculum(entry.curriculumId);
    if (curriculum) return curriculum.martialArt;
  }
  const techniques = resolveTechniquesByIds(entry.techniqueIds);
  if (techniques.length === 0) return null;
  const counts = new Map<string, number>();
  for (const t of techniques) counts.set(t.martialArt, (counts.get(t.martialArt) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function deriveEntryCurriculumTitle(entry: TrainingHistoryEntry): string | null {
  if (!entry.curriculumId) return null;
  return getCurriculum(entry.curriculumId)?.title ?? null;
}

export function deriveEntryTechniqueNames(entry: TrainingHistoryEntry): string[] {
  return resolveTechniquesByIds(entry.techniqueIds).map((t) => t.koreanName || t.name);
}

/** Only meaningful for the set-tracking "오늘의 훈련" flow — entries without exerciseDetails (curriculum Day checkbox, combo, shadow, sparring, review) return null rather than a fabricated count. */
export function deriveEntrySetsReps(entry: TrainingHistoryEntry): EntrySetsReps | null {
  if (!entry.exerciseDetails || entry.exerciseDetails.length === 0) return null;
  let totalSets = 0;
  let totalReps = 0;
  let hasReps = false;
  for (const ex of entry.exerciseDetails) {
    totalSets += ex.actualReps.filter((v) => v !== null).length + ex.actualSeconds.filter((v) => v !== null).length;
    for (const r of ex.actualReps) {
      if (r !== null) {
        totalReps += r;
        hasReps = true;
      }
    }
  }
  return { totalSets, totalReps: hasReps ? totalReps : null };
}

/** Newest-first by actual completion time — not relied on to already hold (repository.add's unshift keeps it true for normal same-device recording, but a cloud-sync merge or any other future write path could append out of order), so every display path sorts explicitly here rather than trusting insertion order. */
export function sortEntriesNewestFirst(entries: TrainingHistoryEntry[]): TrainingHistoryEntry[] {
  return entries.slice().sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

export interface HistoryDateGroup {
  dateKey: string;
  label: string;
  entries: TrainingHistoryEntry[];
}

/** Groups entries by calendar date, newest date group first (see sortEntriesNewestFirst). */
export function groupHistoryByDate(entries: TrainingHistoryEntry[]): HistoryDateGroup[] {
  const groups: HistoryDateGroup[] = [];
  const indexByDate = new Map<string, number>();
  for (const entry of sortEntriesNewestFirst(entries)) {
    let idx = indexByDate.get(entry.date);
    if (idx === undefined) {
      idx = groups.length;
      indexByDate.set(entry.date, idx);
      groups.push({ dateKey: entry.date, label: formatRelativeDateLabel(entry.date), entries: [] });
    }
    groups[idx].entries.push(entry);
  }
  return groups;
}

export interface HistoryFilter {
  martialArt?: string; // 'all' or omitted = every martial art
  query?: string; // matches technique name or curriculum title, case-insensitive substring
}

export function filterHistory(entries: TrainingHistoryEntry[], filter: HistoryFilter): TrainingHistoryEntry[] {
  const q = filter.query?.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filter.martialArt && filter.martialArt !== 'all' && deriveEntryMartialArt(entry) !== filter.martialArt) return false;
    if (q) {
      const curriculumTitle = deriveEntryCurriculumTitle(entry)?.toLowerCase() ?? '';
      const techniqueNames = deriveEntryTechniqueNames(entry).map((n) => n.toLowerCase());
      const matches = curriculumTitle.includes(q) || techniqueNames.some((n) => n.includes(q));
      if (!matches) return false;
    }
    return true;
  });
}
