import type { ShadowPace, ShadowSessionState } from './types';
import { PACE_SECONDS } from './types';
import { resolveTechnique } from '../userTechniques/service';
import { recordTrainingSession } from '../trainingHistory/service';

// One active shadow-boxing session at a time, independent of "오늘의
// 훈련"/콤보 훈련's own session keys — none of these three training modes
// can clobber each other.
const KEY = 'martialdex:shadow-boxing-session';
const EVENT = 'martialdex:shadow-boxing-updated';

function readSession(): ShadowSessionState | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ShadowSessionState) : null;
  } catch {
    return null;
  }
}

function writeSession(session: ShadowSessionState | null) {
  if (session) window.localStorage.setItem(KEY, JSON.stringify(session));
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getShadowSession(): ShadowSessionState | null {
  return readSession();
}

export function startShadowSession(input: {
  martialArt: string;
  techniquePool: string[];
  roundSeconds: number;
  totalRounds: number;
  restSeconds: number;
  pace: ShadowPace;
}): ShadowSessionState {
  const now = Date.now();
  const session: ShadowSessionState = {
    martialArt: input.martialArt,
    techniquePool: input.techniquePool,
    roundSeconds: input.roundSeconds,
    totalRounds: Math.max(1, input.totalRounds),
    restSeconds: Math.max(0, input.restSeconds),
    pace: input.pace,
    paceSeconds: PACE_SECONDS[input.pace],
    currentRound: 1,
    phase: 'round',
    phaseEndTimestamp: now + input.roundSeconds * 1000,
    pausedRemainingMs: null,
    nextAnnounceTimestamp: now,
    pausedAnnounceRemainingMs: null,
    announceIndex: 0,
    announcedTechniqueIds: [],
    paused: false,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  writeSession(session);
  return session;
}

function finalizeShadowSession(session: ShadowSessionState): void {
  const finishedAt = new Date().toISOString();
  const actualMinutes = Math.max(1, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60000));
  const techniqueIds = [...new Set(session.announcedTechniqueIds)];
  if (techniqueIds.length > 0) {
    recordTrainingSession({
      curriculumId: null,
      dayNumber: null,
      techniqueIds,
      completed: true,
      estimatedMinutes: Math.round((session.roundSeconds * session.totalRounds) / 60) || 1,
      actualMinutes,
      notes: `쉐도우 복싱 · ${session.currentRound}/${session.totalRounds}라운드 · ${session.announcedTechniqueIds.length}회 기술 안내`,
      source: 'shadow',
    });
  }
  writeSession({ ...session, phase: 'finished', finishedAt });
}

/** Called on a fast poll (e.g. every 250ms) — returns TTS-worthy events for the caller to speak; never speaks directly itself (kept side-effect-free here so it's trivially testable). */
export interface ShadowTickEvent {
  type: 'announce' | 'round-start' | 'round-end' | 'rest-end' | 'finished';
  text: string;
}

export function tickShadowSession(): ShadowTickEvent[] {
  let session = readSession();
  if (!session || session.paused || session.phase === 'finished') return [];
  const events: ShadowTickEvent[] = [];
  const now = Date.now();

  if (session.phase === 'round' && session.nextAnnounceTimestamp !== null && now >= session.nextAnnounceTimestamp) {
    const techniqueId = session.techniquePool[session.announceIndex % session.techniquePool.length];
    const technique = resolveTechnique(techniqueId);
    if (technique) {
      events.push({ type: 'announce', text: technique.koreanName || technique.name });
      session = {
        ...session,
        announceIndex: session.announceIndex + 1,
        announcedTechniqueIds: [...session.announcedTechniqueIds, techniqueId],
        nextAnnounceTimestamp: now + session.paceSeconds * 1000,
      };
      writeSession(session);
    }
  }

  if (session.phase === 'round' && now >= session.phaseEndTimestamp) {
    if (session.currentRound >= session.totalRounds) {
      events.push({ type: 'finished', text: '훈련이 종료되었습니다. 수고하셨습니다.' });
      finalizeShadowSession(session);
    } else {
      events.push({ type: 'round-end', text: `${session.currentRound}라운드 종료. 휴식하세요.` });
      writeSession({ ...session, phase: 'rest', phaseEndTimestamp: now + session.restSeconds * 1000, nextAnnounceTimestamp: null });
    }
  } else if (session.phase === 'rest' && now >= session.phaseEndTimestamp) {
    const nextRound = session.currentRound + 1;
    events.push({ type: 'round-end', text: `${nextRound}라운드 시작` });
    writeSession({ ...session, phase: 'round', currentRound: nextRound, phaseEndTimestamp: now + session.roundSeconds * 1000, nextAnnounceTimestamp: now });
  }

  return events;
}

export function getPhaseRemainingMs(session: ShadowSessionState): number {
  if (session.pausedRemainingMs !== null) return session.pausedRemainingMs;
  return Math.max(0, session.phaseEndTimestamp - Date.now());
}

export function pauseShadowSession(): ShadowSessionState | null {
  const session = readSession();
  if (!session || session.paused) return session;
  const now = Date.now();
  const updated: ShadowSessionState = {
    ...session,
    paused: true,
    pausedRemainingMs: getPhaseRemainingMs(session),
    pausedAnnounceRemainingMs: session.nextAnnounceTimestamp !== null ? Math.max(0, session.nextAnnounceTimestamp - now) : null,
  };
  writeSession(updated);
  return updated;
}

export function resumeShadowSession(): ShadowSessionState | null {
  const session = readSession();
  if (!session || !session.paused) return session;
  const now = Date.now();
  const updated: ShadowSessionState = {
    ...session,
    paused: false,
    phaseEndTimestamp: now + (session.pausedRemainingMs ?? 0),
    nextAnnounceTimestamp: session.pausedAnnounceRemainingMs !== null ? now + session.pausedAnnounceRemainingMs : null,
    pausedRemainingMs: null,
    pausedAnnounceRemainingMs: null,
  };
  writeSession(updated);
  return updated;
}

/** Manual early stop (spec section 6 — never traps the user in an endless session). Still records progress made so far, same as any other partial-but-real session. */
export function stopShadowSession(): void {
  const session = readSession();
  if (session && !session.finishedAt && session.announcedTechniqueIds.length > 0) {
    finalizeShadowSession(session);
    return;
  }
  writeSession(null);
}

export function clearShadowSession(): void {
  writeSession(null);
}
