import { useEffect, useRef, useState } from 'react';

// 준비 카운트다운 — after "시작" the user needs a few seconds to step back from
// the screen and raise their guard. Shows 5·4·3·2·1 with a short beep per
// second (higher beep on "시작") so it works when the user isn't looking at
// the screen. Pure UI timing — nothing is recorded during the countdown.

export const READY_SECONDS = 5;

function beep(ctx: AudioContext | null, hz: number, len: number) {
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = hz;
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + len + 0.02);
  } catch {
    // audio unavailable — the on-screen numbers still work
  }
}

/** `left` = whole seconds remaining (null = no countdown). `start` should be called from a user tap. */
export function useReadyCountdown(onGo: () => void) {
  const [left, setLeft] = useState<number | null>(null);
  const endRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const goRef = useRef(onGo);
  goRef.current = onGo;

  useEffect(() => {
    if (left === null) return;
    const iv = window.setInterval(() => {
      const next = Math.ceil((endRef.current - performance.now()) / 1000);
      if (next <= 0) {
        window.clearInterval(iv);
        beep(ctxRef.current, 1320, 0.35);
        setLeft(null);
        goRef.current();
      } else if (next !== left) {
        beep(ctxRef.current, 880, 0.12);
        setLeft(next);
      }
    }, 50);
    return () => window.clearInterval(iv);
  }, [left]);

  useEffect(() => () => void ctxRef.current?.close().catch(() => undefined), []);

  function start(seconds = READY_SECONDS) {
    try {
      if (!ctxRef.current) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        ctxRef.current = Ctor ? new Ctor() : null;
      }
      if (ctxRef.current?.state === 'suspended') void ctxRef.current.resume();
    } catch {
      ctxRef.current = null;
    }
    endRef.current = performance.now() + seconds * 1000;
    beep(ctxRef.current, 880, 0.12);
    setLeft(seconds);
  }

  return { left, start, cancel: () => setLeft(null) };
}
