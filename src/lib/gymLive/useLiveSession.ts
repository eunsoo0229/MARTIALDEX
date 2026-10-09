import { useCallback, useEffect, useRef, useState } from 'react';
import { completeLiveSessionIfDue, getGymName, getLiveSession, listLiveParticipants, subscribeLive } from './service';
import { serverNow, syncServerClock } from './serverClock';
import { elapsedAt, totalMsOf } from './timeline';
import { recordLiveSessionForMe, type RecordOutcome } from './recorder';
import { isTerminal, type LiveParticipant, type LiveSession } from './types';

const POLL_MS = 5000;
const TICK_MS = 200;
/** Re-measure the server clock periodically — a device clock can jump (manual change, NTP correction). */
const CLOCK_RESYNC_MS = 60_000;

export type LiveConnection = 'connecting' | 'live' | 'reconnecting';

/**
 * One live session, kept in sync with the server:
 *   - realtime postgres_changes → re-fetch the authoritative row (never trust
 *     a payload or a local guess over the server);
 *   - a slow poll + re-fetch on reconnect/foreground as the safety net, so a
 *     dropped websocket or a backgrounded phone recovers on its own;
 *   - `now` ticks in SERVER time purely for display — the timer itself is
 *     always recomputed from the session anchor (timeline.ts), so it keeps
 *     running correctly offline and snaps back to the truth on reconnect;
 *   - natural completion is requested from the server (which verifies it);
 *   - for a participant (`myUserId` given), the finished session is saved to
 *     their own records automatically (recorder.ts, idempotent).
 */
export function useLiveSession(sessionId: string, myUserId?: string | null) {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<LiveConnection>('connecting');
  const [now, setNow] = useState(() => serverNow());
  const [recordOutcome, setRecordOutcome] = useState<RecordOutcome | null>(null);
  const dueRequestedFor = useRef<number | null>(null);
  const recording = useRef(false);

  const refresh = useCallback(async () => {
    const [s, p] = await Promise.all([getLiveSession(sessionId), listLiveParticipants(sessionId)]);
    if (s.ok) {
      setSession(s.data);
      setError(s.data ? null : '훈련 세션을 찾을 수 없거나 볼 수 있는 권한이 없습니다.');
    } else setError(s.message);
    if (p.ok) setParticipants(p.data);
    setLoaded(true);
    return s.ok;
  }, [sessionId]);

  useEffect(() => {
    let alive = true;
    void syncServerClock().then(() => alive && setNow(serverNow()));
    void refresh();
    const unsubscribe = subscribeLive(
      `gym-live-${sessionId}`,
      [
        { table: 'gym_live_sessions', filter: `id=eq.${sessionId}` },
        { table: 'gym_live_participants', filter: `session_id=eq.${sessionId}` },
      ],
      () => void refresh(),
      (status) => {
        if (!alive) return;
        if (status === 'SUBSCRIBED') {
          setConnection('live');
          void refresh(); // catch up on anything missed while (re)connecting
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConnection('reconnecting');
      }
    );
    const poll = window.setInterval(() => void refresh(), POLL_MS);
    const tick = window.setInterval(() => setNow(serverNow()), TICK_MS);
    const clockResync = window.setInterval(() => void syncServerClock(3, true), CLOCK_RESYNC_MS);
    // Back from background / frozen: redraw from the anchor IMMEDIATELY (not
    // on the next interval tick), then re-check the clock and the server state.
    const resync = () => {
      if (document.visibilityState === 'hidden') return;
      setNow(serverNow());
      void syncServerClock(3, true).then(() => {
        setNow(serverNow());
        return refresh();
      });
    };
    window.addEventListener('online', resync);
    window.addEventListener('focus', resync);
    window.addEventListener('pageshow', resync);
    document.addEventListener('visibilitychange', resync);
    document.addEventListener('resume', resync);
    return () => {
      alive = false;
      unsubscribe();
      window.clearInterval(poll);
      window.clearInterval(tick);
      window.clearInterval(clockResync);
      window.removeEventListener('online', resync);
      window.removeEventListener('focus', resync);
      window.removeEventListener('pageshow', resync);
      document.removeEventListener('visibilitychange', resync);
      document.removeEventListener('resume', resync);
    };
  }, [sessionId, refresh]);

  // Natural completion: once the timeline has run out, ask the server to
  // close it (it re-checks with its own clock). Once per session version.
  useEffect(() => {
    if (!session || session.status !== 'running') return;
    if (elapsedAt(session, now) < totalMsOf(session)) return;
    if (dueRequestedFor.current === session.version) return;
    dueRequestedFor.current = session.version;
    void completeLiveSessionIfDue(session.id).then(() => refresh());
  }, [session, now, refresh]);

  // Auto-save for the participant — only after the SERVER says it ended.
  useEffect(() => {
    if (!myUserId || !session || !isTerminal(session.status) || recording.current || recordOutcome) return;
    const me = participants.find((p) => p.userId === myUserId);
    if (!me) return;
    recording.current = true;
    void getGymName(session.gymId)
      .then((gymName) => recordLiveSessionForMe(session, me, gymName))
      .then((outcome) => setRecordOutcome(outcome))
      .finally(() => {
        recording.current = false;
      });
  }, [myUserId, session, participants, recordOutcome]);

  return { session, participants, loaded, error, connection, now, recordOutcome, refresh };
}
