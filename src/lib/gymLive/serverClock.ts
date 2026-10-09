import { supabase } from '../supabase/client';

// Every device's clock is wrong by some amount, so the timer is computed in
// SERVER time: offset = serverNow - localNow, measured against Postgres
// now() (gym_live_server_now RPC, the same clock that stamps every anchor).
// Of a few samples, the one with the shortest round trip wins (least
// network asymmetry), and the server time is assumed to be at the midpoint.
// Re-measured on reconnect / foreground, never mid-display.

let offsetMs = 0;
let measured = false;
let inFlight: Promise<number> | null = null;

async function sample(): Promise<{ offset: number; rtt: number } | null> {
  if (!supabase) return null;
  const t0 = Date.now();
  const { data, error } = await supabase.rpc('gym_live_server_now');
  const t1 = Date.now();
  if (error || !data) return null;
  const server = new Date(data as string).getTime();
  if (!Number.isFinite(server)) return null;
  return { offset: server - (t0 + t1) / 2, rtt: t1 - t0 };
}

/**
 * Measures the offset. `force` re-measures even if a measurement is already
 * running (it waits for that one first) — used when the local clock may have
 * jumped since, e.g. a device time change.
 */
export function syncServerClock(samples = 3, force = false): Promise<number> {
  if (inFlight && !force) return inFlight;
  const previous = inFlight;
  inFlight = (async () => {
    if (previous) await previous.catch(() => undefined);
    let best: { offset: number; rtt: number } | null = null;
    for (let i = 0; i < samples; i++) {
      const s = await sample().catch(() => null);
      if (s && (!best || s.rtt < best.rtt)) best = s;
    }
    if (best) {
      offsetMs = best.offset;
      measured = true;
    }
    inFlight = null;
    return offsetMs;
  })();
  return inFlight;
}

/** Current time on the server's clock (falls back to the local clock until the first measurement). */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function isServerClockMeasured(): boolean {
  return measured;
}

/** For tests only. */
export function __setServerOffsetForTest(ms: number): void {
  offsetMs = ms;
  measured = true;
}
