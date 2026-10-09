// 체육관 실시간 훈련 — client mirror of supabase/migrations/0035_gym_live_sessions.sql.

export type LiveSessionKind = 'drill' | 'sparring';

/** READY → (WORK ⇄ REST, derived) / PAUSED → COMPLETED | INTERRUPTED | CANCELLED */
export type LiveSessionStatus = 'ready' | 'running' | 'paused' | 'completed' | 'cancelled' | 'interrupted';

export const TERMINAL_STATUSES: LiveSessionStatus[] = ['completed', 'cancelled', 'interrupted'];

export function isTerminal(status: LiveSessionStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export interface LiveSession {
  id: string;
  gymId: string;
  coachUserId: string;
  kind: LiveSessionKind;
  title: string;
  techniqueId: string | null;
  techniqueName: string | null;
  martialArt: string | null;
  workSeconds: number;
  restSeconds: number;
  totalSets: number;
  status: LiveSessionStatus;
  /** Server-clock epoch ms of the current anchor (null before start). */
  anchorAt: number | null;
  anchorElapsedMs: number;
  /** Closed lived intervals of timeline time, [from, to] ms. */
  segments: [number, number][];
  startedAt: string | null;
  endedAt: string | null;
  endedElapsedMs: number | null;
  version: number;
  createdAt: string;
}

/** One round of ONE student's schedule. opponent null = 대기 (bye) that round. */
export interface LivePairing {
  round: number;
  opponentUserId: string | null;
  opponentNickname: string | null;
}

export interface LiveParticipant {
  sessionId: string;
  userId: string;
  gymId: string;
  nickname: string;
  /** Only this student's own rounds — never other matches. */
  pairings: LivePairing[];
  active: boolean;
  recordedAt: string | null;
}

export type LiveControlAction = 'start' | 'pause' | 'resume' | 'next' | 'end' | 'cancel';
