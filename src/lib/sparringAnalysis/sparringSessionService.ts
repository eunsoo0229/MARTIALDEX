import type { SavedMoment, SparringSession } from './types';
import { sparringSessionRepository } from './repository';


function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function saveSparringSession(input: Omit<SparringSession, 'id' | 'date'>): SparringSession {
  const session: SparringSession = { ...input, id: newId(), date: new Date().toISOString() };
  sparringSessionRepository.save(session);
  return session;
}

export function listSparringSessions(): SparringSession[] {
  return [...sparringSessionRepository.list()].sort((a, b) => b.date.localeCompare(a.date));
}

export function getSparringSession(id: string): SparringSession | undefined {
  return sparringSessionRepository.get(id);
}

export function deleteSparringSession(id: string): void {
  sparringSessionRepository.delete(id);
}

export function addSavedMoment(sessionId: string, moment: SavedMoment): SparringSession | undefined {
  const session = sparringSessionRepository.get(sessionId);
  if (!session) return undefined;
  const updated: SparringSession = { ...session, savedMoments: [...session.savedMoments, moment] };
  sparringSessionRepository.save(updated);
  return updated;
}

export function updateSessionNotes(sessionId: string, notes: string): SparringSession | undefined {
  const session = sparringSessionRepository.get(sessionId);
  if (!session) return undefined;
  const updated: SparringSession = { ...session, notes };
  sparringSessionRepository.save(updated);
  return updated;
}
