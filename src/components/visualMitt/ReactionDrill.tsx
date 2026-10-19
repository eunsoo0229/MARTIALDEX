import { useEffect, useMemo, useRef, useState } from 'react';
import type { MittCombo } from '../../lib/visualMitt/combos';
import { calloutFor, comboCallout, pickNext, REACTION_PACE, reactionPool, reactionSlotMs, recordReactionSession, type ReactionPace } from '../../lib/visualMitt/reaction';
import { restMsFor } from '../../lib/visualMitt/tempo';
import { HitSound } from '../../lib/visualMitt/hitSound';
import { useMittTempo } from '../../lib/visualMitt/tempo';
import TempoControls from './TempoControls';
import { speak, stopSpeaking } from '../../lib/voice/tts';
import { FrontView, POV_IMPACT_MS, povTiming, type Stance } from './MittStage';

export interface ReactionResult {
  calledCombos: number;
  seconds: number;
  finished: boolean;
  /** The combos that were called, in order (ids). */
  called: MittCombo[];
}

/**
 * 반응 훈련: random REAL combos (basic attacks only) are called out loud one
 * after another; the user throws each on reaction. Timing comes from the
 * tempo sliders only — the mitt shows up `callGapMs` after the coach has
 * FINISHED saying the call, and the next call waits for the combo's slots
 * plus a recovery pause. Nothing here watches the user: it records what was
 * called and for how long.
 */
export default function ReactionDrill({
  pool: poolProp,
  roundSeconds: initialRound = 120,
  pace: initialPace = 'normal',
  autoStart = false,
  voice = true,
  record = true,
  stance = 'orthodox',
  onDone,
}: {
  pool?: MittCombo[];
  roundSeconds?: number;
  pace?: ReactionPace;
  autoStart?: boolean;
  voice?: boolean;
  /** Save the round to training history (off when an AI coach lesson records it itself). */
  record?: boolean;
  stance?: Stance;
  onDone?: (r: ReactionResult) => void;
}) {
  const pool = useMemo(() => poolProp ?? reactionPool(), [poolProp]);
  // `pace` (a lesson's suggested speed) applies until the user has moved the speed slider.
  const [tempo, setTempo] = useMittTempo(REACTION_PACE[initialPace].perStep * 1000);
  const tempoRef = useRef(tempo);
  tempoRef.current = tempo;
  const [roundSeconds, setRoundSeconds] = useState(initialRound);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [current, setCurrent] = useState<MittCombo | null>(null);
  const [called, setCalled] = useState<MittCombo[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const clock = useRef({ startedAt: 0, pausedTotal: 0, pausedAt: 0, nextAt: 0 });
  const calledRef = useRef<MittCombo[]>([]);
  const stageRef = useRef<HTMLDivElement | null>(null);
  /** runningMs() when the current combo's mitt sequence starts (speech end + gap); null while the call is being spoken. */
  const mittAtRef = useRef<number | null>(null);
  const [mittAt, setMittAt] = useState<number | null>(null);
  const callStartRef = useRef(0);
  const currentRef = useRef<MittCombo | null>(null);
  const impactKey = useRef('');
  const soundRef = useRef<HitSound | null>(null);
  const [sound, setSound] = useState(true);
  const soundOn = useRef(sound);
  soundOn.current = sound;
  useEffect(() => () => soundRef.current?.close(), []);
  const startMitt = (at: number) => {
    mittAtRef.current = at;
    setMittAt(at);
  };

  const now = () => performance.now();
  const runningMs = () => (clock.current.pausedAt ? clock.current.pausedAt : now()) - clock.current.startedAt - clock.current.pausedTotal;

  function start() {
    soundRef.current ??= new HitSound();
    soundRef.current.unlock();
    impactKey.current = '';
    currentRef.current = null;
    mittAtRef.current = null;
    calledRef.current = [];
    setCalled([]);
    setDone(false);
    setElapsed(0);
    clock.current = { startedAt: now(), pausedTotal: 0, pausedAt: 0, nextAt: 0 };
    setRunning(true);
    setPaused(false);
    requestAnimationFrame(() => stageRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }));
  }

  function finish(finished: boolean) {
    setRunning(false);
    setPaused(false);
    setDone(true);
    stopSpeaking();
    if (voice) void speak(finished ? `수고하셨습니다. 콤보 ${calledRef.current.length}개를 반응해서 쳤습니다.` : `${calledRef.current.length}개 콤보까지 연습했습니다.`, { interrupt: true });
    const seconds = Math.round(runningMs() / 1000);
    if (record) recordReactionSession({ called: calledRef.current, seconds, finished, stepMs: tempoRef.current.stepMs });
    onDone?.({ calledCombos: calledRef.current.length, seconds, finished, called: calledRef.current });
  }

  // the call loop
  useEffect(() => {
    if (!running || paused) return;
    let raf = 0;
    const tick = () => {
      const t = runningMs();
      setElapsed(t);
      if (t >= roundSeconds * 1000) {
        finish(true);
        return;
      }
      const cur = currentRef.current;
      const tp = tempoRef.current;
      // a stuck speech engine must not stall the round
      if (cur && mittAtRef.current === null && t - callStartRef.current >= 1500 + comboCallout(cur).length * 220) startMitt(t + tp.callGapMs);
      const seqMs = (c: MittCombo) => c.steps.reduce((n, st) => n + reactionSlotMs(st, tp.stepMs), 0) + restMsFor(tp.stepMs);
      if (!cur || (mittAtRef.current !== null && t >= mittAtRef.current + seqMs(cur))) {
        const next = pickNext(pool, calledRef.current.at(-1) ?? null);
        if (next) {
          calledRef.current = [...calledRef.current, next];
          currentRef.current = next;
          callStartRef.current = t;
          setCalled(calledRef.current);
          setCurrent(next);
          if (voice) {
            mittAtRef.current = null;
            setMittAt(null);
            void speak(comboCallout(next), { interrupt: true }).then(() => {
              if (currentRef.current === next && mittAtRef.current === null) startMitt(runningMs() + tempoRef.current.callGapMs);
            });
          } else startMitt(t + tp.callGapMs);
        }
      } else if (mittAtRef.current !== null && t >= mittAtRef.current) {
        // 타격음 at each strike's impact
        let local = t - mittAtRef.current;
        for (let i = 0; i < cur.steps.length; i++) {
          const st = cur.steps[i];
          const slot = reactionSlotMs(st, tp.stepMs);
          if (local < slot) {
            const key = `${calledRef.current.length}:${i}`;
            if (local >= POV_IMPACT_MS && impactKey.current !== key) {
              impactKey.current = key;
              const a = st.motion.archetype;
              if (soundOn.current && a.kind === 'strike') soundRef.current?.play(a.path === 'hook' || a.path === 'round' || a.path === 'overhand' ? 'hook' : a.side === 'rear' ? 'straight' : 'jab');
            }
            break;
          }
          local -= slot;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, paused, roundSeconds, pool]);

  useEffect(() => {
    if (autoStart && pool.length) start();
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

  const remaining = Math.max(0, roundSeconds - Math.floor(elapsed / 1000));
  // The mitt holder presents each strike of the called combo in turn, on the same timing the next call uses.
  const mitt = (() => {
    if (!current || !running) return null;
    if (mittAt === null || elapsed < mittAt) return { step: current.steps[0], p: 0, back: 0 }; // the coach is still calling it / the gap
    let local = elapsed - mittAt;
    for (const st of current.steps) {
      const slot = reactionSlotMs(st, tempo.stepMs);
      if (local < slot) return { step: st, ...povTiming(local, st.motion.archetype) };
      local -= slot;
    }
    const last = current.steps[current.steps.length - 1];
    return last ? { step: last, p: 1, back: 1 } : null;
  })();
  if (!pool.length) {
    return <p className="video-status-message" data-testid="reaction-empty">반응 훈련에 쓸 수 있는 기본 공격 콤보가 없습니다.</p>;
  }
  return (
    <div className="card info-card reaction-drill" data-testid="reaction-drill" data-running={running} data-called={called.length} data-done={done}>
      <p className="video-status-message" style={{ marginTop: 0 }}>
        코치가 MARTIALDEX에 실제로 있는 콤보 {pool.length}개 중 하나를 무작위로 불러 줍니다. 들리는 대로 바로 쳐 주세요. (기본 공격만: 잽·크로스·훅·어퍼·바디·카프킥·로우킥·미들킥·하이킥·팁·더블렉·싱글렉)
      </p>
      <TempoControls tempo={tempo} onChange={setTempo} testIdPrefix="reaction-pace" />
      <div className="chip-row" style={{ marginBottom: 8 }}>
        <label className="chip" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} data-testid="reaction-sound" /> 타격음
        </label>
        <span className="field-label" style={{ margin: 0 }}>시간</span>
        {[60, 120, 180].map((s) => (
          <button key={s} type="button" className={`chip${roundSeconds === s ? ' active' : ''}`} onClick={() => !running && setRoundSeconds(s)} disabled={running} data-testid={`reaction-round-${s}`}>
            {s / 60}분
          </button>
        ))}
      </div>
      <div className="mitt-stage mitt-stage--single" style={{ margin: '4px auto 8px' }} data-testid="reaction-mitt" ref={stageRef}>
        {mitt ? (
          <FrontView archetype={mitt.step.motion.archetype} target={mitt.step.motion.target} stance={stance} p={mitt.p} back={mitt.back} />
        ) : (
          <div className="video-status-message command-drill__idle">{done ? '라운드가 끝났습니다.' : '시작하면 미트 잡는 코치가 부른 콤보대로 미트를 내밀어 줍니다.'}</div>
        )}
      </div>
      <div className="reaction-drill__call" data-testid="reaction-call" data-combo={current?.id ?? ''}>
        {current ? (
          <>
            <div className="reaction-drill__words">{current.steps.map(calloutFor).join(' · ')}</div>
            <div className="video-status-message">{current.name}</div>
          </>
        ) : (
          <div className="video-status-message">{done ? '라운드가 끝났습니다.' : '시작을 누르면 콤보를 불러 줍니다.'}</div>
        )}
      </div>
      <div className="chip-row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <span data-testid="reaction-remaining">남은 시간 {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} · 콤보 {called.length}개</span>
        <span className="chip-row">
          {!running ? (
            <button className="btn btn-primary btn-sm" onClick={start} data-testid="reaction-start">
              {done ? '다시 시작' : '시작'}
            </button>
          ) : (
            <>
              <button className="btn btn-secondary btn-sm" onClick={togglePause} data-testid="reaction-pause">
                {paused ? '계속' : '일시정지'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => finish(false)} data-testid="reaction-stop">
                그만하기
              </button>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
