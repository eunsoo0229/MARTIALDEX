import { useEffect, useRef, useState } from 'react';
import { FootworkView, FrontView, type Stance } from './MittStage';
import type { MittCombo } from '../../lib/visualMitt/combos';
import type { MittSpeed } from '../../lib/visualMitt/aiPlan';

// The Visualizing Mitt ENGINE — one combo played as ONE continuous motion:
//   Jab → (short transition) → Cross → (short transition) → Hook, then the
//   next repetition, for `repetitions` times, with no speech between the
// techniques. The host (AI 튜터 수업 or the standalone page) speaks before
// and after; this component only animates and reports what was completed.
// Timing comes only from `speed` (the visual speed) — never from the TTS
// speech rate.

export const RUN_SPEED: Record<MittSpeed, { label: string; move: number; gap: number; repGap: number }> = {
  slow: { label: '느리게', move: 1100, gap: 280, repGap: 900 },
  normal: { label: '보통', move: 650, gap: 140, repGap: 600 },
  fast: { label: '빠르게', move: 380, gap: 70, repGap: 400 },
};

export interface MittRunResult {
  completedReps: number;
  targetReps: number;
  finished: boolean;
}

export default function MittRunner({
  combo,
  repetitions,
  speed: initialSpeed,
  stance = 'orthodox',
  autoStart = true,
  onDone,
  onLastRep,
}: {
  combo: MittCombo;
  repetitions: number;
  speed: MittSpeed;
  stance?: Stance;
  autoStart?: boolean;
  onDone: (r: MittRunResult) => void;
  /** Fired once when the final repetition starts (host may say one short line). */
  onLastRep?: () => void;
}) {
  const n = combo.steps.length;
  const [speed, setSpeed] = useState<MittSpeed>(initialSpeed);
  const [playing, setPlaying] = useState(autoStart);
  const [rep, setRep] = useState(0); // 0-based current repetition
  const [step, setStep] = useState(0);
  const [p, setP] = useState(0);
  const [done, setDone] = useState(false);
  const clock = useRef({ t: 0, last: 0 });
  const lastRepAnnounced = useRef(false);
  const doneRef = useRef(false);

  // One timeline per repetition: [move, gap] × n, then repGap. Pausing freezes the clock.
  useEffect(() => {
    if (!playing || done) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    clock.current.last = performance.now();
    const tick = (now: number) => {
      clock.current.t += now - clock.current.last;
      clock.current.last = now;
      const { move, gap, repGap } = RUN_SPEED[speed];
      const per = move + gap;
      const repLen = n * per - gap + repGap;
      const r = Math.floor(clock.current.t / repLen);
      if (r >= repetitions) {
        setP(1);
        setStep(n - 1);
        setRep(repetitions - 1);
        if (!doneRef.current) {
          doneRef.current = true;
          setDone(true);
          setPlaying(false);
          onDone({ completedReps: repetitions, targetReps: repetitions, finished: true });
        }
        return;
      }
      const within = clock.current.t - r * repLen;
      const s = Math.min(n - 1, Math.floor(within / per));
      const local = within - s * per;
      setRep(r);
      setStep(s);
      setP(reduced ? (local < move ? 0.5 : 1) : Math.min(1, local / move));
      if (r === repetitions - 1 && !lastRepAnnounced.current && repetitions > 1) {
        lastRepAnnounced.current = true;
        onLastRep?.();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, done, n, repetitions]);

  // Keep the place in the timeline when the speed changes (same rep/step, new tempo).
  function changeSpeed(next: MittSpeed) {
    const len = (sp: MittSpeed) => n * (RUN_SPEED[sp].move + RUN_SPEED[sp].gap) - RUN_SPEED[sp].gap + RUN_SPEED[sp].repGap;
    clock.current.t = (clock.current.t / len(speed)) * len(next);
    setSpeed(next);
  }

  function restart() {
    clock.current.t = 0;
    lastRepAnnounced.current = false;
    doneRef.current = false;
    setDone(false);
    setRep(0);
    setStep(0);
    setP(0);
    setPlaying(true);
  }

  function stop() {
    setPlaying(false);
    if (!doneRef.current) {
      doneRef.current = true;
      setDone(true);
      onDone({ completedReps: rep + (step === n - 1 && p >= 1 ? 1 : 0), targetReps: repetitions, finished: false });
    }
  }

  const cur = combo.steps[step];
  return (
    <div className="card info-card mitt-runner" data-testid="mitt-runner" data-rep={rep + 1} data-step={step + 1} data-done={done ? 'true' : 'false'} data-speed={speed}>
      <div className="mitt-runner__head">
        <div className="mitt-runner__combo" data-testid="mitt-runner-combo">
          {combo.steps.map((s, i) => (
            <span key={i} className={`mitt-runner__move${i === step ? ' is-current' : ''}`}>
              {i > 0 && <span className="mitt-runner__arrow">→</span>}
              {s.technique.name}
            </span>
          ))}
        </div>
        <div className="mitt-runner__stats">
          <span data-testid="mitt-runner-step">
            동작 <strong>{step + 1} / {n}</strong>
          </span>
          <span data-testid="mitt-runner-rep">
            반복 <strong>{Math.min(rep + 1, repetitions)} / {repetitions}</strong>
          </span>
          <span>
            속도 <strong data-testid="mitt-runner-speed">{RUN_SPEED[speed].label}</strong>
          </span>
        </div>
      </div>
      <div className="mitt-stage">
        <FrontView archetype={cur.motion.archetype} target={cur.motion.target} stance={stance} p={p} />
        <FootworkView archetype={cur.motion.archetype} stance={stance} p={p} />
      </div>
      <div className="mitt-controls" style={{ marginTop: 8 }}>
        {done ? (
          <button className="btn btn-secondary btn-sm" onClick={restart} data-testid="mitt-runner-restart">
            ↺ 처음부터 다시
          </button>
        ) : playing ? (
          <button className="btn btn-secondary btn-sm" onClick={() => setPlaying(false)} data-testid="mitt-runner-pause">
            ⏸ 일시정지
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => setPlaying(true)} data-testid="mitt-runner-play">
            ▶ {clock.current.t > 0 ? '계속' : '시작'}
          </button>
        )}
        {(Object.keys(RUN_SPEED) as MittSpeed[]).map((s) => (
          <button key={s} className={`chip ${speed === s ? 'active' : ''}`} onClick={() => changeSpeed(s)} data-testid={`mitt-runner-speed-${s}`}>
            {RUN_SPEED[s].label}
          </button>
        ))}
        {!done && (
          <button className="btn btn-ghost btn-sm" onClick={stop} data-testid="mitt-runner-stop">
            ■ 여기서 끝내기
          </button>
        )}
      </div>
      <p className="video-status-message" style={{ margin: '6px 0 0' }}>
        화면의 목표와 발 위치를 보며 동작 순서를 따라 하세요. 그림은 동작 경로·풋워크 도식이며, 앱이 동작을 보거나 판정하지 않습니다.
      </p>
    </div>
  );
}
