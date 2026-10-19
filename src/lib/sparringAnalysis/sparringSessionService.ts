import type { SavedMoment, SparringClip, SparringSession, SparringWeakness } from './types';
import { sparringSessionRepository } from './repository';
import { deleteClip, deleteClipsForSession, saveClip } from './clipStore';
import { extractClip, isClipExtractionSupported, probeClip } from './clipExtractor';


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
  // The clips' media lives in IndexedDB — remove it with the session (the
  // original video file itself is never touched).
  void deleteClipsForSession(id);
}

/** Reads the latest stored copy, applies `mutate`, saves — so concurrent updates (clip progress, user checks) never overwrite each other. */
export function updateSparringSession(id: string, mutate: (s: SparringSession) => SparringSession): SparringSession | undefined {
  const current = sparringSessionRepository.get(id);
  if (!current) return undefined;
  const updated = mutate(current);
  sparringSessionRepository.save(updated);
  return updated;
}

function patchClip(id: string, clipId: string, patch: Partial<SparringClip>): SparringSession | undefined {
  return updateSparringSession(id, (s) => ({ ...s, clips: (s.clips ?? []).map((c) => (c.id === clipId ? { ...c, ...patch } : c)) }));
}

/**
 * Cuts every pending (or, with `retryFailed`, failed) clip of a session out
 * of the ORIGINAL video at `sourceUrl`, one at a time. A clip only becomes
 * 'ready' after its stored media decodes and plays (probeClip); anything
 * else is recorded as 'failed' with the reason, never shown as playable.
 */
export async function extractSessionClips(
  sessionId: string,
  sourceUrl: string,
  opts: { retryFailed?: boolean; onlyClipId?: string; signal?: AbortSignal; onUpdate?: (s: SparringSession) => void } = {}
): Promise<SparringSession | undefined> {
  const session = sparringSessionRepository.get(sessionId);
  if (!session?.clips?.length) return session;
  if (!isClipExtractionSupported()) {
    for (const c of session.clips) if (c.status !== 'ready') patchClip(sessionId, c.id, { status: 'failed', error: '이 환경은 영상 클립 생성을 지원하지 않습니다 (captureStream/MediaRecorder 없음).' });
    const s = sparringSessionRepository.get(sessionId);
    if (s) opts.onUpdate?.(s);
    return s;
  }
  const todo = session.clips.filter((c) => (opts.onlyClipId ? c.id === opts.onlyClipId : c.status === 'pending' || (opts.retryFailed && c.status === 'failed')));
  for (const clip of todo) {
    if (opts.signal?.aborted) break;
    opts.onUpdate?.(patchClip(sessionId, clip.id, { status: 'pending', error: null })!);
    try {
      const out = await extractClip(sourceUrl, clip.startSec, clip.endSec, opts.signal);
      const playable = await probeClip(out.blob);
      if (!(playable > 0.3)) throw new Error('생성된 클립을 재생할 수 없습니다.');
      await deleteClip(sessionId, clip.id);
      await saveClip(sessionId, clip.id, out.blob);
      opts.onUpdate?.(
        patchClip(sessionId, clip.id, { status: 'ready', error: null, actualStartSec: out.actualStartSec, actualEndSec: out.actualEndSec, sizeBytes: out.blob.size, mimeType: out.mimeType })!
      );
    } catch (e) {
      opts.onUpdate?.(patchClip(sessionId, clip.id, { status: 'failed', error: e instanceof Error ? e.message : '클립을 만들지 못했습니다.' })!);
    }
  }
  return sparringSessionRepository.get(sessionId);
}

/** The user's own check after watching a weakness clip ("맞아요"/"아니에요"). */
export function setWeaknessVerified(sessionId: string, weaknessId: string, verified: boolean | null): SparringSession | undefined {
  return updateSparringSession(sessionId, (s) => ({ ...s, weaknesses: (s.weaknesses ?? []).map((w: SparringWeakness) => (w.id === weaknessId ? { ...w, verifiedOnVideo: verified } : w)) }));
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
