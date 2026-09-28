import type { SparringRules, SparringRunState, SparringSessionRecord } from './types';
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
    equipment: [...last.equipment],
    allowedTechniqueIds: [...last.allowedTechniqueIds],
    prohibitedTechniqueIds: [...last.prohibitedTechniqueIds],
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

  const existing = sparringSessionRepository.list().find((s) => s.startedAt === run.startedAt);

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
