import { useEffect, useMemo, useRef, useState } from 'react';
import { DRILL_PACE, nextBurst, type DrillCue, type DrillPace } from '../../lib/soloDrill/moves';
import { speak, stopSpeaking } from '../../lib/voice/tts';

export interface SoloDrillResult {
  calls: number;
  bursts: number;
  seconds: number;
  finished: boolean;
}

/**
 * Solo call-out drill: bursts of 2–4 real cues ("태클 → 스프롤 → 다운블록")
 * are called quickly, a reset pause, then the next burst. The user moves on
 * each call. Records what was called and for how long — nothing is measured.
 */
export default function SoloDrillRunner({
  cues,
  focusId,
  seconds: total,
  pace: initialPace = 'normal',
  autoStart = true,
  voice = true,
  onDone,
}: {
  cues: DrillCue[];
  focusId: string | null;
  seconds: number;
  pace?: DrillPace;
  autoStart?: boolean;
  voice?: boolean;
  onDone: (r: SoloDrillResult) => void;
}) {
  const [pace, setPace] = useState<DrillPace>(initialPace);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [call, setCall] = useState<DrillCue | null>(null);
  const [burst, setBurst] = useState<DrillCue[]>([]);
  const [stats, setStats] = useState({ calls: 0, bursts: 0 });
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const clock = useRef({ startedAt: 0, pausedTotal: 0, pausedAt: 0, nextAt: 0, queue: [] as DrillCue[] });
  const statsRef = useRef({ calls: 0, bursts: 0 });
  const cueKey = useMemo(() => cues.map((c) => c.id).join(','), [cues]);

  const now = () => performance.now();
  const runningMs = () => (clock.current.pausedAt ? clock.current.pausedAt : now()) - clock.current.startedAt - clock.current.pausedTotal;

  function start() {
    statsRef.current = { calls: 0, bursts: 0 };
    setStats(statsRef.current);
    setDone(false);
    clock.current = { startedAt: now(), pausedTotal: 0, pausedAt: 0, nextAt: 1500, queue: [] };
    if (voice) void speak('솔로 드릴을 시작합니다. 부르는 대로 바로 움직여 주세요.', { interrupt: true });
    setRunning(true);
    setPaused(false);
  }

  function finish(finished: boolean) {
    setRunning(false);
    setPaused(false);
    setDone(true);
    stopSpeaking();
    if (voice) void speak(finished ? `수고하셨습니다. ${statsRef.current.calls}번의 구령에 맞춰 움직였습니다.` : `${statsRef.current.calls}번까지 했습니다.`, { interrupt: true });
    onDone({ ...statsRef.current, seconds: Math.round(runningMs() / 1000), finished });
  }

  useEffect(() => {
    if (!running || paused) return;
    let raf = 0;
    const tick = () => {
      const t = runningMs();
      setElapsed(t);
      if (t >= total * 1000) {
        finish(true);
        return;
      }
      if (t >= clock.current.nextAt) {
        const p = DRILL_PACE[pace];
        if (!clock.current.queue.length) {
          clock.current.queue = nextBurst(cues, focusId);
          setBurst(clock.current.queue);
          statsRef.current = { ...statsRef.current, bursts: statsRef.current.bursts + 1 };
        }
        const next = clock.current.queue.shift()!;
        statsRef.current = { ...statsRef.current, calls: statsRef.current.calls + 1 };
        setStats(statsRef.current);
        setCall(next);
        if (voice) void speak(next.call, { interrupt: true });
        clock.current.nextAt = t + (clock.current.queue.length ? p.between : p.between + p.reset) * 1000;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, paused, pace, total, cueKey, focusId]);

  useEffect(() => {
    if (autoStart && cues.length) start();
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePause() {
    if (!running) return;
    if (paused) {
      clock.current.pausedTotal += now() - clock.current.pausedAt;
      clock.current.pausedAt = 0;
      setPaused(false);
    } else {
      clock.current.pausedAt = now();
      stopSpeaking();
      setPaused(true);
    }
  }

  const remaining = Math.max(0, total - Math.floor(elapsed / 1000));
  return (
    <div className="card info-card solo-drill" data-testid="solo-drill" data-running={running} data-calls={stats.calls} data-done={done}>
      <p className="video-status-message" style={{ marginTop: 0 }}>
        구령: {cues.map((c) => c.call).join(' · ')} — 2~4개씩 빠르게 부르고 잠깐 쉰 뒤 다음 구령이 이어집니다.
      </p>
      <div className="chip-row" style={{ marginBottom: 8 }}>
        <span className="field-label" style={{ margin: 0 }}>속도</span>
        {(Object.keys(DRILL_PACE) as DrillPace[]).map((p) => (
          <button key={p} type="button" className={`chip${pace === p ? ' active' : ''}`} onClick={() => setPace(p)} data-testid={`solo-drill-pace-${p}`}>
            {DRILL_PACE[p].label}
          </button>
        ))}
      </div>
      <div className="solo-drill__call" data-testid="solo-drill-call" data-cue={call?.id ?? ''}>
        {call ? (
          <>
            <div className="solo-drill__word">{call.call}</div>
            <div className="video-status-message">{burst.map((b) => b.call).join(' → ')}</div>
          </>
        ) : (
          <div className="video-status-message">{done ? '드릴이 끝났습니다.' : '준비 자세를 잡아 주세요.'}</div>
        )}
      </div>
      <div className="chip-row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <span data-testid="solo-drill-remaining">
          남은 시간 {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} · 구령 {stats.calls}번
        </span>
        <span className="chip-row">
          {!running ? (
            !done && (
              <button className="btn btn-primary btn-sm" onClick={start} data-testid="solo-drill-start">
                시작
              </button>
            )
          ) : (
            <>
              <button className="btn btn-secondary btn-sm" onClick={togglePause} data-testid="solo-drill-pause">
                {paused ? '계속' : '일시정지'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => finish(false)} data-testid="solo-drill-stop">
                그만하기
              </button>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
