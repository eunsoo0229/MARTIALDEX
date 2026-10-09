import type { Curriculum, CurriculumDay, CurriculumProgress, CurriculumVisibility, ExerciseConfig } from './types';
import { curriculumRepository } from './repository';
import { getOfficialCurriculum, getOfficialCurriculumById, listOfficialCurricula, withSplitIdsExpanded } from './officialData';


// -----------------------------------------------------------------------
// UI -> curriculumService (this file) -> curriculumRepository (repository.ts)
//
// Nothing in src/pages or src/components should import repository.ts or
// officialData.ts directly — they go through the functions here so the
// storage layer (today: localStorage) can be swapped for a real backend
// later without touching a single component.
// -----------------------------------------------------------------------

function newId(): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `custom__${rand}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function deriveTotals(days: CurriculumDay[]) {
  return {
    totalDays: days.length,
    estimatedWeeks: Math.max(1, Math.ceil(days.length / 4)),
    techniqueCount: new Set(days.flatMap((d) => d.techniqueIds)).size,
  };
}

// ---------------- reading curricula ----------------

export function getMartialArtsWithOfficialCurriculum(): string[] {
  return listOfficialCurricula().map((c) => c.martialArt);
}

export function getCurriculumsForMartialArt(martialArt: string): { official?: Curriculum; custom: Curriculum[] } {
  return {
    official: getOfficialCurriculum(martialArt),
    custom: curriculumRepository.listCustom().filter((c) => c.martialArt === martialArt).map(withSplitIdsExpanded),
  };
}

export function getCurriculum(id: string): Curriculum | undefined {
  const official = getOfficialCurriculumById(id);
  if (official) return official;
  const custom = curriculumRepository.getCustom(id);
  return custom ? withSplitIdsExpanded(custom) : undefined;
}

export function listMyCurricula(): Curriculum[] {
  return curriculumRepository.listCustom().map(withSplitIdsExpanded);
}

/** What the "커뮤니티" explore page shows — see repository.ts for the honest scope of this (local-only for now). */
export function listBrowsableCurricula(): Curriculum[] {
  return curriculumRepository.listCustom().filter((c) => c.visibility !== 'private');
}

export function getAuthorName(): string {
  return curriculumRepository.getAuthorName();
}

export function setAuthorName(name: string): void {
  curriculumRepository.setAuthorName(name.trim() || '나');
}

// ---------------- custom curriculum CRUD ----------------

export function createCustomCurriculum(input: {
  title: string;
  description: string;
  martialArt: string;
  visibility: CurriculumVisibility;
  coverIcon?: string;
}): Curriculum {
  const curriculum: Curriculum = {
    id: newId(),
    martialArt: input.martialArt,
    title: input.title.trim() || '새 커리큘럼',
    description: input.description.trim(),
    source: 'custom',
    visibility: input.visibility,
    authorName: getAuthorName(),
    coverIcon: input.coverIcon,
    totalDays: 0,
    estimatedWeeks: 1,
    phases: [],
    days: [],
    techniqueCount: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  curriculumRepository.saveCustom(curriculum);
  return curriculum;
}

export function saveCustomCurriculum(curriculum: Curriculum): Curriculum {
  const totals = deriveTotals(curriculum.days);
  const updated: Curriculum = { ...curriculum, ...totals, updatedAt: nowIso() };
  curriculumRepository.saveCustom(updated);
  return updated;
}

export function deleteCustomCurriculum(id: string): void {
  curriculumRepository.deleteCustom(id);
}

// ---------------- day / technique editing (pure helpers — caller persists via saveCustomCurriculum) ----------------

export function addDay(curriculum: Curriculum): Curriculum {
  const day: CurriculumDay = {
    day: curriculum.days.length + 1,
    title: `Day ${curriculum.days.length + 1}`,
    description: '',
    learningGoals: [],
    techniqueIds: [],
    reviewTechniqueIds: [],
    difficulty: null,
    estimatedMinutes: 30,
  };
  return { ...curriculum, days: [...curriculum.days, day] };
}

function renumber(days: CurriculumDay[]): CurriculumDay[] {
  return days.map((d, i) => ({ ...d, day: i + 1 }));
}

export function removeDay(curriculum: Curriculum, dayNumber: number): Curriculum {
  return { ...curriculum, days: renumber(curriculum.days.filter((d) => d.day !== dayNumber)) };
}

export function reorderDay(curriculum: Curriculum, fromDay: number, toDay: number): Curriculum {
  const days = [...curriculum.days];
  const fromIdx = days.findIndex((d) => d.day === fromDay);
  const toIdx = days.findIndex((d) => d.day === toDay);
  if (fromIdx < 0 || toIdx < 0) return curriculum;
  const [moved] = days.splice(fromIdx, 1);
  days.splice(toIdx, 0, moved);
  return { ...curriculum, days: renumber(days) };
}

export function updateDay(curriculum: Curriculum, dayNumber: number, patch: Partial<CurriculumDay>): Curriculum {
  return {
    ...curriculum,
    days: curriculum.days.map((d) => (d.day === dayNumber ? { ...d, ...patch, day: d.day } : d)),
  };
}

export function addTechniqueToDay(curriculum: Curriculum, dayNumber: number, techniqueId: string): Curriculum {
  return {
    ...curriculum,
    days: curriculum.days.map((d) =>
      d.day === dayNumber && !d.techniqueIds.includes(techniqueId)
        ? { ...d, techniqueIds: [...d.techniqueIds, techniqueId] }
        : d
    ),
  };
}

export function removeTechniqueFromDay(curriculum: Curriculum, dayNumber: number, techniqueId: string): Curriculum {
  return {
    ...curriculum,
    days: curriculum.days.map((d) =>
      d.day === dayNumber ? { ...d, techniqueIds: d.techniqueIds.filter((id) => id !== techniqueId) } : d
    ),
  };
}

export function reorderTechniqueInDay(curriculum: Curriculum, dayNumber: number, fromIdx: number, toIdx: number): Curriculum {
  return {
    ...curriculum,
    days: curriculum.days.map((d) => {
      if (d.day !== dayNumber) return d;
      const ids = [...d.techniqueIds];
      const [moved] = ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, moved);
      return { ...d, techniqueIds: ids };
    }),
  };
}

export function setExerciseConfig(curriculum: Curriculum, dayNumber: number, techniqueId: string, config: ExerciseConfig): Curriculum {
  return {
    ...curriculum,
    days: curriculum.days.map((d) =>
      d.day === dayNumber ? { ...d, exerciseConfig: { ...d.exerciseConfig, [techniqueId]: config } } : d
    ),
  };
}

export function removeExerciseConfig(curriculum: Curriculum, dayNumber: number, techniqueId: string): Curriculum {
  return {
    ...curriculum,
    days: curriculum.days.map((d) => {
      if (d.day !== dayNumber || !d.exerciseConfig) return d;
      const { [techniqueId]: _removed, ...rest } = d.exerciseConfig;
      return { ...d, exerciseConfig: rest };
    }),
  };
}

// ---------------- copying (official or shared) into "my curricula" ----------------

export function copyToMyCurricula(source: Curriculum): Curriculum {
  const copy: Curriculum = {
    ...source,
    id: newId(),
    source: 'custom',
    visibility: 'private',
    authorName: getAuthorName(),
    basedOnCurriculumId: source.id || source.basedOnCurriculumId,
    description:
      source.source === 'official'
        ? source.description
        : `(원본: "${source.title}" · ${source.authorName})\n\n${source.description}`,
    likes: undefined,
    usageCount: undefined,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  curriculumRepository.saveCustom(copy);
  return copy;
}

// ---------------- progress ----------------

export function getProgress(curriculumId: string): CurriculumProgress | undefined {
  return curriculumRepository.getProgress(curriculumId);
}

function nextIncompleteDay(totalDays: number, completedDays: number[]): number {
  const completed = new Set(completedDays);
  for (let d = 1; d <= totalDays; d++) if (!completed.has(d)) return d;
  return totalDays; // every day done — "오늘 학습하기" re-opens the last day
}

export function ensureProgress(curriculum: Curriculum): CurriculumProgress {
  const existing = curriculumRepository.getProgress(curriculum.id);
  if (existing) return existing;
  const fresh: CurriculumProgress = {
    curriculumId: curriculum.id,
    currentDay: 1,
    completedDays: [],
    startedAt: nowIso(),
    lastStudiedAt: nowIso(),
    progress: 0,
  };
  curriculumRepository.saveProgress(fresh);
  return fresh;
}

export function resolveTodayDay(curriculum: Curriculum): number {
  const progress = curriculumRepository.getProgress(curriculum.id);
  if (!progress) return 1;
  return nextIncompleteDay(curriculum.totalDays, progress.completedDays);
}

export function setDayComplete(curriculum: Curriculum, dayNumber: number, complete: boolean): CurriculumProgress {
  const progress = ensureProgress(curriculum);
  const set = new Set(progress.completedDays);
  if (complete) set.add(dayNumber);
  else set.delete(dayNumber);
  const completedDays = [...set].sort((a, b) => a - b);
  const updated: CurriculumProgress = {
    ...progress,
    completedDays,
    currentDay: nextIncompleteDay(curriculum.totalDays, completedDays),
    lastStudiedAt: nowIso(),
    progress: curriculum.totalDays > 0 ? Math.round((completedDays.length / curriculum.totalDays) * 100) : 0,
  };
  curriculumRepository.saveProgress(updated);
  return updated;
}

/** BJJ → Day 12, Boxing → Day 5, ... — every curriculum the user has ever opened, most recently studied first. */
export function listMyActiveProgress(): { curriculum: Curriculum; progress: CurriculumProgress }[] {
  return curriculumRepository
    .listProgress()
    .map((progress) => {
      const curriculum = getCurriculum(progress.curriculumId);
      return curriculum ? { curriculum, progress } : null;
    })
    .filter((x): x is { curriculum: Curriculum; progress: CurriculumProgress } => x !== null)
    .sort((a, b) => b.progress.lastStudiedAt.localeCompare(a.progress.lastStudiedAt));
}
