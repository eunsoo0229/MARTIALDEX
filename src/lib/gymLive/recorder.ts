import { getTrainingHistoryEntry, recordTrainingSession } from '../trainingHistory/service';
import { sparringSessionRepository } from '../sparringSession/repository';
import type { SparringSessionRecord, SparringType } from '../sparringSession/types';
import type { TrainingExerciseDetail } from '../trainingHistory/types';
import { kstDateKeyOfInstant } from '../dateUtil';
import { completedSetFlags, totalMsOf, workSecondsPerSet } from './timeline';
import { markLiveRecorded } from './service';
import type { LiveParticipant, LiveSession } from './types';

// Writes a finished live session into THIS student's own records — run on
// the student's device (their training_history / sparring rows are
// self-only RLS; the coach can never write them). Idempotent by
// construction: the entry id is derived from the session id, so a retry, a
// second device, or a cloud re-sync all land on the same entry.
//
// Only what really happened is recorded: completed sets/rounds are the
// ones whose whole WORK window was lived (timeline.ts), bye rounds aren't
// counted as sparring, and a never-started (cancelled) session writes
// nothing.

export type RecordOutcome = 'recorded' | 'already' | 'nothing' | 'not_finished';

export function liveEntryId(sessionId: string): string {
  return `gymlive__${sessionId}`;
}

function sparringTypeFor(martialArt: string | null): SparringType {
  const a = (martialArt ?? '').toLowerCase();
  if (a === 'mma') return 'mma';
  if (['bjj', 'jiu', 'judo', 'wrestling', 'sambo'].some((k) => a.includes(k))) return 'grappling';
  return 'striking';
}

export async function recordLiveSessionForMe(session: LiveSession, me: LiveParticipant, gymName: string): Promise<RecordOutcome> {
  if (session.status === 'ready' || session.status === 'running' || session.status === 'paused') return 'not_finished';
  const id = liveEntryId(session.id);
  if (session.status === 'cancelled' || getTrainingHistoryEntry(id)) {
    await markLiveRecorded(session.id);
    return session.status === 'cancelled' ? 'nothing' : 'already';
  }

  const endMs = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
  const perSet = workSecondsPerSet(session, endMs);
  const done = completedSetFlags(session, endMs);
  // The session may have run to its end while a set was skipped mid-WORK;
  // 'completed' is only claimed per student when every one of their own
  // sets/rounds was actually done (set below once that's known).
  const sessionRanToEnd = session.status === 'completed';
  const startedAt = session.startedAt ?? session.createdAt;
  const date = kstDateKeyOfInstant(startedAt);
  const meta = {
    sessionId: session.id,
    gymId: session.gymId,
    gymName,
    coachUserId: session.coachUserId,
    kind: session.kind,
    totalSets: session.totalSets,
    workSeconds: session.workSeconds,
    restSeconds: session.restSeconds,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
  } as const;
  const gymClassMeta = { gymId: session.gymId, gymName, classTitle: `실시간 · ${session.title}`, sessionId: session.id };

  if (session.kind === 'drill') {
    const lived = perSet.reduce((a, b) => a + b, 0);
    if (lived <= 0) {
      await markLiveRecorded(session.id);
      return 'nothing';
    }
    const completedSets = done.filter(Boolean).length;
    const status = sessionRanToEnd && completedSets === session.totalSets ? 'completed' : 'interrupted';
    const details: TrainingExerciseDetail[] = session.techniqueId
      ? [
          {
            techniqueId: session.techniqueId,
            mode: 'time',
            sets: session.totalSets,
            targetReps: null,
            targetSeconds: session.workSeconds,
            actualReps: perSet.map(() => null),
            actualSeconds: perSet.map((sec) => (sec > 0 ? sec : null)),
            restSeconds: session.restSeconds,
            startedAt: session.startedAt,
            finishedAt: session.endedAt,
          },
        ]
      : [];
    recordTrainingSession({
      id,
      date,
      curriculumId: null,
      dayNumber: null,
      techniqueIds: session.techniqueId ? [session.techniqueId] : [],
      completed: completedSets > 0,
      estimatedMinutes: Math.max(1, Math.round(totalMsOf(session) / 60000)),
      actualMinutes: Math.max(1, Math.round(lived / 60)),
      notes: `${gymName} · ${session.title} · ${completedSets}/${session.totalSets}세트${status === 'interrupted' ? ' (일부 세트 미완료)' : ''}`,
      source: 'gym_class',
      exerciseDetails: details,
      gymClassMeta,
      gymLive: { ...meta, status, completedSets },
    });
  } else {
    // Sparring: only rounds where I actually had an opponent count.
    const byRound = new Map(me.pairings.map((p) => [p.round, p]));
    const opponents = Array.from({ length: session.totalSets }, (_, i) => byRound.get(i + 1)?.opponentNickname ?? null);
    const myRounds = opponents.map((o, i) => (o ? i : -1)).filter((i) => i >= 0);
    const livedSec = myRounds.reduce((s, i) => s + perSet[i], 0);
    if (myRounds.length === 0 || livedSec <= 0) {
      await markLiveRecorded(session.id);
      return 'nothing';
    }
    const completedRounds = myRounds.filter((i) => done[i]).length;
    const status = sessionRanToEnd && completedRounds === myRounds.length ? 'completed' : 'interrupted';
    const now = new Date().toISOString();
    const uniqueOpponents = [...new Set(opponents.filter((o): o is string => !!o))];
    const record: SparringSessionRecord = {
      martialArt: session.martialArt ?? 'mma',
      sparringType: sparringTypeFor(session.martialArt),
      plannedRounds: myRounds.length,
      roundDurationSeconds: session.workSeconds,
      restDurationSeconds: session.restSeconds,
      intensity: 'unspecified',
      equipment: [],
      allowedTechniqueIds: [],
      prohibitedTechniqueIds: [],
      partnerName: uniqueOpponents.join(', ') || null,
      notes: `${gymName} 체육관 스파링 (관장 진행)`,
      id,
      date,
      startedAt,
      endedAt: session.endedAt ?? now,
      plannedDurationSeconds: myRounds.length * session.workSeconds,
      actualDurationSeconds: Math.round(livedSec),
      actualRounds: completedRounds,
      createdAt: now,
      updatedAt: now,
      entryMode: 'timer',
      gymLive: { sessionId: session.id, gymId: session.gymId, gymName, opponents: uniqueOpponents, status },
    };
    if (!sparringSessionRepository.get(id)) sparringSessionRepository.save(record);
    recordTrainingSession({
      id,
      date,
      curriculumId: null,
      dayNumber: null,
      techniqueIds: [],
      completed: completedRounds > 0,
      estimatedMinutes: Math.max(1, Math.round((myRounds.length * session.workSeconds) / 60)),
      actualMinutes: Math.max(1, Math.round(livedSec / 60)),
      notes: `${gymName} 스파링 · 상대 ${uniqueOpponents.join(', ')} · ${completedRounds}/${myRounds.length}라운드${status === 'interrupted' ? ' (일부 라운드 미완료)' : ''}`,
      source: 'sparring_session',
      sparringSessionId: id,
      gymClassMeta,
      gymLive: { ...meta, status, completedSets: completedRounds, opponents },
    });
  }
  await markLiveRecorded(session.id);
  return 'recorded';
}
