import { useEffect, useRef, useState } from 'react';
import { FootworkView, FrontView, POV_IMPACT_MS, povTiming, type Stance } from './MittStage';
import type { MittCombo } from '../../lib/visualMitt/combos';
import type { MittSpeed } from '../../lib/visualMitt/aiPlan';
import { useReadyCountdown } from '../../lib/visualMitt/readyCountdown';
import { HitSound } from '../../lib/visualMitt/hitSound';
import { calloutFor } from '../../lib/visualMitt/reaction';
import { isTtsSupported, speak } from '../../lib/voice/tts';
import { tempoLabel, useMittTempo, type MittTempo } from '../../lib/visualMitt/tempo';
import TempoControls from './TempoControls';

// The Visualizing Mitt ENGINE — one combo played as ONE continuous motion:
//   Jab → (short transition) → Cross → (short transition) → Hook, then the
//   next repetition, for `repetitions` times. The host (AI 튜터 수업 or the
// standalone page) speaks before and after. Between the techniques the only
// speech is the pad holder's call ("잽!", "크로스!") when `speakCallouts` is
// on: started early enough that the call has FINISHED `callGapMs` (말 끝 → 미트
// 간격 slider) before its technique starts — how long a call takes to speak
// is measured from the real speech-end events as the drill runs. A new call
// cuts off the previous one so it never lags behind the drawing. The call
// word is also shown on the stage.
// Timing comes only from the tempo sliders (tempo.ts) — never from the TTS
// speech rate. `stepMs` is the combo TEMPO (time per technique); the punch
// itself always plays at the same real speed (MittStage povTiming). The
// drill's suggested `speed` applies until the user moves the speed slider.

/** The pad holder's word for a step — the Korean name when the technique has no short call. */
function callWord(s: MittCombo['steps'][number]): string {
  const w = calloutFor(s);
  return w === s.technique.name && s.technique.koreanName ? s.technique.koreanName : w;
}

/** A drill's suggested speed (AI 튜터) — labels, and the slider's starting point. */
export const RUN_SPEED: Record<MittSpeed, { label: string; move: number; gap: number; repGap: number }> = {
  slow: { label: '느리게', move: 1100, gap: 280, repGap: 900 },
  normal: { label: '보통', move: 650, gap: 140, repGap: 600 },
  fast: { label: '빠르게', move: 380, gap: 70, repGap: 400 },
};

/** One technique's slot at this tempo: the move, a short transition, and the pause between repetitions. */
function runTiming(stepMs: number): { move: number; gap: number; repGap: number } {
  const gap = Math.round(stepMs * 0.18);
  return { move: stepMs - gap, gap, repGap: Math.max(300, Math.round(stepMs * 0.75)) };
}

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
  speakCallouts = false,
}: {
  combo: MittCombo;
  repetitions: number;
  speed: MittSpeed;
  stance?: Stance;
  autoStart?: boolean;
  onDone: (r: MittRunResult) => void;
  /** Fired once when the final repetition starts (host may say one short line — not when the calls already said "마지막"). */
  onLastRep?: (info: { calledOut: boolean }) => void;
  /** Speak each technique's call ("잽!") — the host passes its voice mode; the user can still turn it off here. */
  speakCallouts?: boolean;
}) {
  const n = combo.steps.length;
  const [tempo, setTempo] = useMittTempo(RUN_SPEED[initialSpeed].move + RUN_SPEED[initialSpeed].gap);
  const callGap = useRef(tempo.callGapMs);
  callGap.current = tempo.callGapMs;
  /** speak() → speech end per call text, measured on this device; `avg` for words not heard yet. */
  const speech = useRef({ byText: new Map<string, number>(), avg: 600 });
  const [playing, setPlaying] = useState(false);
  const [rep, setRep] = useState(0); // 0-based current repetition
  const [step, setStep] = useState(0);
  const [ms, setMs] = useState(0); // since the current technique started
  const [done, setDone] = useState(false);
  const clock = useRef({ t: 0, last: 0 });
  const lastRepAnnounced = useRef(false);
  const doneRef = useRef(false);
  const impactKey = useRef('');
  const soundRef = useRef<HitSound | null>(null);
  const [sound, setSound] = useState(true);
  const soundOn = useRef(sound);
  soundOn.current = sound;
  const canCall = speakCallouts && isTtsSupported();
  const [callouts, setCallouts] = useState(true);
  const callOn = useRef(false);
  callOn.current = canCall && callouts;
  /** Timeline index (rep × steps + step) of the next technique to call out. */
  const nextCall = useRef(0);
  useEffect(() => () => soundRef.current?.close(), []);
  function unlockSound() {
    soundRef.current ??= new HitSound();
    soundRef.current.unlock();
  }
  function beginFresh() {
    impactKey.current = '';
    nextCall.current = 0;
    unlockSound();
    ready.start();
  }
  // 5초 준비 시간 before the first move (start, restart and autoStart); 3초 when resuming from pause.
  const ready = useReadyCountdown(() => setPlaying(true));
  useEffect(() => {
    if (autoStart) beginFresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One timeline per repetition: [move, gap] × n, then repGap. Pausing freezes the clock.
  useEffect(() => {
    if (!playing || done) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    clock.current.last = performance.now();
    const tick = (now: number) => {
      clock.current.t += Math.max(0, now - clock.current.last); // a rAF timestamp can precede the effect start
      clock.current.last = now;
      const { move, gap, repGap } = runTiming(tempo.stepMs);
      const per = move + gap;
      const repLen = n * per - gap + repGap;
      const r = Math.floor(clock.current.t / repLen);
      if (r >= repetitions) {
        setMs(move + gap);
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
      setMs(reduced ? (local < POV_IMPACT_MS ? POV_IMPACT_MS / 2 : POV_IMPACT_MS) : local);
      const key = `${r}:${s}`;
      // Pad-holder calls, in timeline order: each technique is called callGapMs before it starts —
      // even when that is more than one technique ahead (fast tempo, long gap). A technique already
      // past its impact (resume, speed change) is skipped rather than called late.
      const g = r * n + s;
      if (nextCall.current < g || (nextCall.current === g && local >= POV_IMPACT_MS)) nextCall.current = local >= POV_IMPACT_MS ? g + 1 : g;
      const startOf = (j: number) => Math.floor(j / n) * repLen + (j % n) * per;
      const textOf = (j: number) => `${Math.floor(j / n) === repetitions - 1 && j % n === 0 && repetitions > 1 ? '마지막, ' : ''}${callWord(combo.steps[j % n])}!`;
      const leadOf = (j: number) => callGap.current + (callOn.current ? (speech.current.byText.get(textOf(j)) ?? speech.current.avg) : 0);
      while (nextCall.current < repetitions * n && startOf(nextCall.current) - clock.current.t <= leadOf(nextCall.current)) {
        const j = nextCall.current++;
        if (callOn.current) {
          const text = textOf(j);
          const t0 = performance.now();
          void speak(text, { interrupt: true }).then((o) => {
            if (!o.ok) return;
            const ms = performance.now() - t0;
            const prev = speech.current.byText.get(text);
            speech.current.byText.set(text, Math.round(prev == null ? ms : prev * 0.5 + ms * 0.5));
            speech.current.avg = Math.round(speech.current.avg * 0.7 + ms * 0.3);
          });
        }
      }
      if (local >= POV_IMPACT_MS && impactKey.current !== key) {
        impactKey.current = key;
        const a = combo.steps[s].motion.archetype;
        if (soundOn.current && a.kind === 'strike') soundRef.current?.play(a.path === 'hook' || a.path === 'round' || a.path === 'overhand' ? 'hook' : a.side === 'rear' ? 'straight' : 'jab');
      }
      if (r === repetitions - 1 && !lastRepAnnounced.current && repetitions > 1) {
        lastRepAnnounced.current = true;
        onLastRep?.({ calledOut: callOn.current });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, tempo.stepMs, done, n, repetitions]);

  // Keep the place in the timeline when the speed changes (same rep/step, new tempo).
  function changeTempo(patch: Partial<Pick<MittTempo, 'stepMs' | 'callGapMs'>>) {
    if (patch.stepMs != null && patch.stepMs !== tempo.stepMs) {
      const len = (stepMs: number) => {
        const t = runTiming(stepMs);
        return n * (t.move + t.gap) - t.gap + t.repGap;
      };
      clock.current.t = (clock.current.t / len(tempo.stepMs)) * len(patch.stepMs);
    }
    setTempo(patch);
  }

  function restart() {
    clock.current.t = 0;
    lastRepAnnounced.current = false;
    doneRef.current = false;
    setDone(false);
    setRep(0);
    setStep(0);
    setMs(0);
    beginFresh();
  }

  function stop() {
    ready.cancel();
    setPlaying(false);
    if (!doneRef.current) {
      doneRef.current = true;
      setDone(true);
      onDone({ completedReps: rep + (step === n - 1 && ms >= POV_IMPACT_MS ? 1 : 0), targetReps: repetitions, finished: false });
    }
  }

  const cur = combo.steps[step];
  const { p, back } = povTiming(ms, cur?.motion.archetype);
  return (
    <div className="card info-card mitt-runner" data-testid="mitt-runner" data-rep={rep + 1} data-step={step + 1} data-done={done ? 'true' : 'false'} data-step-ms={tempo.stepMs}>
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
            속도 <strong data-testid="mitt-runner-speed">{tempoLabel(tempo.stepMs)}</strong>
          </span>
        </div>
      </div>
      <div className="mitt-stage">
        {ready.left !== null && (
          <div className="mitt-ready" role="status" aria-live="assertive" data-testid="mitt-ready-countdown">
            <span className="mitt-ready__label">준비하세요</span>
            <strong className="mitt-ready__num">{ready.left}</strong>
          </div>
        )}
        {playing && ready.left === null && (
          <div className="mitt-callout" aria-live="off" data-testid="mitt-runner-callout" key={`${rep}:${step}`}>
            {callWord(cur)}!
          </div>
        )}
        <FrontView archetype={cur.motion.archetype} target={cur.motion.target} stance={stance} p={p} back={back} />
        <FootworkView archetype={cur.motion.archetype} stance={stance} p={p} />
      </div>
      <div className="mitt-controls" style={{ marginTop: 8 }}>
        {done ? (
          <button className="btn btn-secondary btn-sm" onClick={restart} data-testid="mitt-runner-restart">
            ↺ 처음부터 다시
          </button>
        ) : ready.left !== null ? (
          <button className="btn btn-secondary btn-sm" onClick={ready.cancel} data-testid="mitt-runner-cancel-ready">
            ✕ 준비 취소
          </button>
        ) : playing ? (
          <button className="btn btn-secondary btn-sm" onClick={() => setPlaying(false)} data-testid="mitt-runner-pause">
            ⏸ 일시정지
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => (clock.current.t > 0 ? (unlockSound(), ready.start(3)) : beginFresh())} data-testid="mitt-runner-play">
            ▶ {clock.current.t > 0 ? '계속' : '시작'}
          </button>
        )}
        <label className="chip" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} data-testid="mitt-runner-sound" /> 타격음
        </label>
        {canCall && (
          <label className="chip" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={callouts} onChange={(e) => setCallouts(e.target.checked)} data-testid="mitt-runner-callouts" /> 🗣 공격 콜
          </label>
        )}
        {!done && (
          <button className="btn btn-ghost btn-sm" onClick={stop} data-testid="mitt-runner-stop">
            ■ 여기서 끝내기
          </button>
        )}
      </div>
      <TempoControls tempo={tempo} onChange={changeTempo} showCallGap={canCall} testIdPrefix="mitt-runner-speed" />
      <p className="video-status-message" style={{ margin: '6px 0 0' }}>
        미트 잡는 사람이 내미는 미트를 보고 그쪽으로 치세요. 오른쪽은 발 위치 도식입니다.
      </p>
    </div>
  );
}
