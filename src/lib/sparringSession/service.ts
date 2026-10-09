import type { SparringRules, SparringRunState, SparringSessionRecord } from './types';
import { SPARRING_TYPE_LABEL } from './types';
import { INTENSITY_LABEL } from './types';
import { sparringSessionRepository } from './repository';
import { getActualSparringMs } from './sessionStore';
import { recordTrainingSession, listTrainingHistory } from '../trainingHistory/service';
import { todayDateKey } from '../dateUtil';

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * "지난 룰 불러오기" (spec section 6) — copies only the RULE fields from the
 * most recent saved session into a fresh object for a new draft. Never
 * mutates or returns the stored record itself, so editing the draft can
 * never accidentally change history.
 */
export function loadLastSparringRules(): SparringRules | null {
  const last = sparringSessionRepository.list()[0];
  if (!last) return null;
  return {
    martialArt: last.martialArt,
    sparringType: last.sparringType,
    plannedRounds: last.plannedRounds,
    roundDurationSeconds: last.roundDurationSeconds,
    restDurationSeconds: last.restDurationSeconds,
    intensity: last.intensity,
    equipment: [...(last.equipment ?? [])],
    allowedTechniqueIds: [...(last.allowedTechniqueIds ?? [])],
    prohibitedTechniqueIds: [...(last.prohibitedTechniqueIds ?? [])],
    partnerName: last.partnerName,
    notes: last.notes,
  };
}

/**
 * Saves the finished run as a real sparring_sessions record AND links it
 * into training_history via recordTrainingSession — both must happen
 * together (spec section 13's "별도 버튼 없이 자동 반영") or not at all from
 * the caller's perspective; this is the single entry point the end-screen
 * "기록 저장" button calls.
 *
 * Idempotency (spec section 14): keyed on `run.startedAt`, the one thing
 * that's genuinely stable across repeated calls for the SAME run (a fresh
 * id would be generated every call otherwise, defeating any id-based
 * dedup check) — only one run can ever be active at a time (single
 * localStorage slot), so a given startedAt uniquely identifies one
 * real session. A double-click/retried save reuses the SAME sparring_sessions
 * record (updating it, e.g. if the user edited the time and saved again)
 * instead of creating a second one, so the training_history link-check
 * below also correctly finds the existing entry.
 */
export function finalizeSparringSession(run: SparringRunState, overrides?: { actualDurationSeconds?: number }): SparringSessionRecord {
  const now = new Date().toISOString();
  const rules = run.rules;
  const actualDurationSeconds = overrides?.actualDurationSeconds ?? Math.round(getActualSparringMs(run) / 1000);
  const plannedDurationSeconds = rules.plannedRounds * rules.roundDurationSeconds;

  const existing = sparringSessionRepository.list().find((s) => s.entryMode !== 'manual' && s.startedAt === run.startedAt);

  const record: SparringSessionRecord = {
    ...rules,
    id: existing?.id ?? newId(),
    date: existing?.date ?? todayDateKey(),
    startedAt: run.startedAt,
    endedAt: run.finishedAt ?? now,
    plannedDurationSeconds,
    actualDurationSeconds: Math.max(0, actualDurationSeconds),
    actualRounds: run.completedRounds,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    entryMode: 'timer',
  };

  sparringSessionRepository.save(record);

  const alreadyLinked = listTrainingHistory().some((e) => e.sparringSessionId === record.id);
  if (!alreadyLinked) {
    const actualMinutes = Math.max(1, Math.round(record.actualDurationSeconds / 60));
    recordTrainingSession({
      curriculumId: null,
      dayNumber: null,
      techniqueIds: record.allowedTechniqueIds,
      completed: true,
      estimatedMinutes: Math.max(1, Math.round(plannedDurationSeconds / 60)),
      actualMinutes,
      notes: `스파링 · ${record.actualRounds}/${record.plannedRounds}라운드 · ${INTENSITY_LABEL[record.intensity]}`,
      source: 'sparring_session',
      sparringSessionId: record.id,
    });
  }

  return record;
}

export function getSparringSession(id: string): SparringSessionRecord | undefined {
  return sparringSessionRepository.get(id);
}

export function listSparringSessions(): SparringSessionRecord[] {
  return sparringSessionRepository.list();
}

export function deleteSparringSession(id: string): void {
  sparringSessionRepository.delete(id);
}

/** Inputs for a sparring that already happened, recorded afterwards. */
export interface PastSparringInput {
  rules: SparringRules;
  /** YYYY-MM-DD, today or earlier */
  date: string;
  actualRounds: number;
  /** Real sparring time (rounds only, rest excluded) as the user remembers it. */
  actualDurationSeconds: number;
  usedTechniqueIds: string[];
  wentWell: string | null;
  toImprove: string | null;
}

export function validatePastSparring(input: PastSparringInput, today = todayDateKey()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return '날짜를 입력해 주세요.';
  if (input.date > today) return '아직 오지 않은 날짜는 기록할 수 없습니다.';
  if (input.date < '2000-01-01') return '날짜를 확인해 주세요.';
  if (!Number.isInteger(input.actualRounds) || input.actualRounds < 1 || input.actualRounds > 50) return '진행한 라운드 수를 확인해 주세요 (1~50).';
  if (!Number.isFinite(input.actualDurationSeconds) || input.actualDurationSeconds <= 0) return '스파링 시간을 입력해 주세요.';
  if (input.actualDurationSeconds > 4 * 3600) return '스파링 시간이 너무 깁니다. 시간을 확인해 주세요.';
  return null;
}

/**
 * Records a sparring that already happened — saved to the sparring records
 * AND linked into training_history ON THE SPARRING'S OWN DATE (so streaks,
 * analytics and nutrition count it on the day it was done). Each call is one
 * new record; the screen disables the save button after a save.
 */
export function recordPastSparringSession(input: PastSparringInput): SparringSessionRecord {
  const error = validatePastSparring(input);
  if (error) throw new Error(error);
  const now = new Date().toISOString();
  const rules = input.rules;
  const plannedDurationSeconds = rules.plannedRounds * rules.roundDurationSeconds;
  const dayStart = new Date(`${input.date}T00:00:00+09:00`).toISOString();
  const record: SparringSessionRecord = {
    ...rules,
    equipment: [...rules.equipment],
    allowedTechniqueIds: [...rules.allowedTechniqueIds],
    prohibitedTechniqueIds: [...rules.prohibitedTechniqueIds],
    id: newId(),
    date: input.date,
    // the time of day isn't asked — only the date is known
    startedAt: dayStart,
    endedAt: dayStart,
    plannedDurationSeconds,
    actualDurationSeconds: Math.round(input.actualDurationSeconds),
    actualRounds: input.actualRounds,
    createdAt: now,
    updatedAt: now,
    entryMode: 'manual',
    usedTechniqueIds: [...new Set(input.usedTechniqueIds)],
    wentWell: input.wentWell?.trim() || null,
    toImprove: input.toImprove?.trim() || null,
  };
  sparringSessionRepository.save(record);

  const techniqueIds = record.usedTechniqueIds!.length > 0 ? record.usedTechniqueIds! : record.allowedTechniqueIds;
  recordTrainingSession({
    date: record.date,
    curriculumId: null,
    dayNumber: null,
    techniqueIds,
    completed: true,
    estimatedMinutes: Math.max(1, Math.round(record.actualDurationSeconds / 60)),
    actualMinutes: Math.max(1, Math.round(record.actualDurationSeconds / 60)),
    notes: `스파링 기록 · ${SPARRING_TYPE_LABEL[record.sparringType]} · ${record.actualRounds}라운드 · ${INTENSITY_LABEL[record.intensity]}${record.partnerName ? ` · 파트너 ${record.partnerName}` : ''}`,
    source: 'sparring_session',
    sparringSessionId: record.id,
  });
  return record;
}
