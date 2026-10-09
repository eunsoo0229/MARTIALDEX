import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthProvider';
import { getGymName, getLiveSession, listMyPendingParticipations, subscribeLive } from '../lib/gymLive/service';
import { recordLiveSessionForMe } from '../lib/gymLive/recorder';
import { isTerminal } from '../lib/gymLive/types';

/**
 * Student side of 체육관 실시간 훈련, mounted once for the whole app:
 *   - when a coach puts this user into a live session, the session screen
 *     opens by itself (no tapping needed) — realtime INSERT on my own
 *     participant row, plus a check on start / reconnect / foreground;
 *   - a session that ended while this app was closed or offline is saved to
 *     my records the next time the app is open (recorder.ts is idempotent).
 */
export default function GymLiveWatcher() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const opened = useRef(new Set<string>());
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    let alive = true;
    let running = false;

    async function check() {
      if (running) return;
      running = true;
      try {
        const mine = await listMyPendingParticipations(userId);
        if (!alive || !mine.ok) return;
        for (const p of mine.data) {
          const s = await getLiveSession(p.sessionId);
          if (!alive || !s.ok || !s.data) continue;
          if (!isTerminal(s.data.status)) {
            const target = `/gym/live/${p.sessionId}`;
            if (!opened.current.has(p.sessionId) && pathRef.current !== target) {
              opened.current.add(p.sessionId);
              navigate(target);
            }
          } else if (!p.recordedAt) {
            await recordLiveSessionForMe(s.data, p, await getGymName(s.data.gymId));
          }
        }
      } finally {
        running = false;
      }
    }

    void check();
    const unsubscribe = subscribeLive('gym-live-mine', [{ table: 'gym_live_participants', filter: `user_id=eq.${userId}` }], () => void check());
    const onWake = () => document.visibilityState !== 'hidden' && void check();
    window.addEventListener('online', onWake);
    document.addEventListener('visibilitychange', onWake);
    const poll = window.setInterval(() => void check(), 15000);
    return () => {
      alive = false;
      unsubscribe();
      window.removeEventListener('online', onWake);
      document.removeEventListener('visibilitychange', onWake);
      window.clearInterval(poll);
    };
  }, [user, navigate]);

  return null;
}
