import { useEffect, useState } from 'react';
import { getShadowSession, pauseShadowSession, resumeShadowSession, stopShadowSession, tickShadowSession } from './sessionStore';
import { speak } from './tts';
import type { ShadowSessionState } from './types';

const EVENTS = ['martialdex:shadow-boxing-updated', 'storage'];

// A single persistent poll for the page's lifetime — checks Date.now()
// against the session's own absolute deadlines every 250ms (same accuracy
// principle as todayTraining/combo's rest timers) and speaks whatever
// tickShadowSession() says is due. Kept as one steady interval rather than
// one that's torn down/recreated on every state change, since this needs to
// keep announcing techniques even while the round-timer UI itself isn't
// re-rendering for any other reason.
export function useShadowBoxing() {
  const [session, setSession] = useState<ShadowSessionState | null>(getShadowSession);

  useEffect(() => {
    const onUpdate = () => setSession(getShadowSession());
    for (const evt of EVENTS) window.addEventListener(evt, onUpdate);
    return () => {
      for (const evt of EVENTS) window.removeEventListener(evt, onUpdate);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const current = getShadowSession();
      if (!current || current.paused || current.phase === 'finished') return;
      const events = tickShadowSession();
      for (const e of events) speak(e.text);
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  return {
    session,
    pause: pauseShadowSession,
    resume: resumeShadowSession,
    stop: stopShadowSession,
  };
}
