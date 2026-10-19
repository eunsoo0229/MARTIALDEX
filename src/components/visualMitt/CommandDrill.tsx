import { useEffect, useMemo, useRef, useState } from 'react';
import { FrontView, POV_IMPACT_MS, povTiming, type Stance } from './MittStage';
import type { MittCombo } from '../../lib/visualMitt/combos';
import { calloutFor, pickNext } from '../../lib/visualMitt/reaction';
import { useMittTempo } from '../../lib/visualMitt/tempo';
import TempoControls from './TempoControls';
import { COMMAND_LEVEL_LABEL, commandCallout, commandPhase, commandPool, commandTiming, recordCommandSession, type CommandLevel } from '../../lib/visualMitt/commandDrill';
import { useReadyCountdown } from '../../lib/visualMitt/readyCountdown';
import { HitSound } from '../../lib/visualMitt/hitSound';
import { isTtsSupported, speak, stopSpeaking } from '../../lib/voice/tts';

interface Call {
  combo: MittCombo;
  /** runningMs() when it was called. */
  at: number;
  /** runningMs() when the mitt sequence starts: the call's SPEECH END + the 말 → 미트 gap (null while the coach is still talking). */
  mittAt: number | null;
}

/** Longest a call may take to be spoken before the mitt starts anyway (a stuck speech engine must not stall the round). */
const speechTimeoutMs = (text: string) => 1500 + text.length * 220;

/**
 * 공격 지시: the mitt holder calls a strike or a short combo at random ("잽!",
 * "원투!", "바디 훅!"), then presents the mitt for each strike in turn. The
 * user throws on the call. Timing comes from the tempo sliders only (call → mitt gap,
 * one slot per strike, recovery). Nothing here watches the user — the round
 * records what was called and for how long.
 */
export default function CommandDrill({ stance: initialStance = 'orthodox', voice: voiceDefault = true, record = true }: { stance?: Stance; voice?: boolean; record?: boolean }) {
  const [level, setLevel] = useState<CommandLevel>('mixed');
  const [withKicks, setWithKicks] = useState(false);
  const [withDefense, setWithDefense] = useState(false);
  const [tempo, setTempo] = useMittTempo();
  const [roundSeconds, setRoundSeconds] = useState(120);
  const [stance, setStance] = useState<Stance>(initialStance);
  const [voice, setVoice] = useState(voiceDefault && isTtsSupported());
  const [sound, setSound] = useState(true);
  const pool = useMemo(() => commandPool(level, withKicks, undefined, undefined, withDefense), [level, withKicks, withDefense]);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const [call, setCall] = useState<Call | null>(null);
  const [t, setT] = useState(0);
  const calledRef = useRef<MittCombo[]>([]);
  const callRef = useRef<Call | null>(null);
  const impactKey = useRef('');
  const clock = useRef({ startedAt: 0, pausedTotal: 0, pausedAt: 0 });
  const soundRef = useRef<HitSound | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const opts = useRef({ voice, sound, tempo });
  opts.current = { voice, sound, tempo };
  useEffect(() => () => soundRef.current?.close(), []);

  const now = () => performance.now();
  const runningMs = () => (clock.current.pausedAt ? clock.current.pausedAt : now()) - clock.current.startedAt - clock.current.pausedTotal;
  const ready = useReadyCountdown(() => {
    clock.current = { startedAt: now(), pausedTotal: 0, pausedAt: 0 };
    setRunning(true);
  });

  function start() {
    soundRef.current ??= new HitSound();
    soundRef.current.unlock();
    calledRef.current = [];
    callRef.current = null;
    impactKey.current = '';
    setCall(null);
    setT(0);
    setDone(false);
    setPaused(false);
    ready.start();
    // The settings above can push the mitt below the fold — bring it into view for the round.
    requestAnimationFrame(() => stageRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }));
  }

  function finish(finished: boolean) {
    setRunning(false);
    setPaused(false);
    setDone(true);
    callRef.current = null;
    setCall(null);
    const n = calledRef.current.length;
    const strikes = calledRef.current.reduce((k, c) => k + c.steps.length, 0);
    if (opts.current.voice) void speak(finished ? `라운드 끝! 지시 ${n}번, 타격 ${strikes}회 했습니다. 수고하셨습니다.` : `지시 ${n}번까지 연습했습니다.`, { interrupt: true });
    const seconds = Math.round(runningMs() / 1000);
    if (record) recordCommandSession({ called: calledRef.current, seconds, finished, stepMs: opts.current.tempo.stepMs, level });
  }

  // the call loop
  useEffect(() => {
    if (!running || paused) return;
    let raf = 0;
    const tick = () => {
      const ms = runningMs();
      setT(ms);
      if (ms >= roundSeconds * 1000) {
        finish(true);
        return;
      }
      const cur = callRef.current;
      const seq = { stepMs: opts.current.tempo.stepMs, callGapMs: 0 }; // the gap is already in mittAt
      // the mitt waits for the call to be SPOKEN (or the timeout), then the gap
      if (cur && cur.mittAt === null && ms - cur.at >= speechTimeoutMs(commandCallout(cur.combo))) cur.mittAt = ms + opts.current.tempo.callGapMs;
      if (!cur || (cur.mittAt !== null && ms - cur.mittAt >= commandTiming(cur.combo, seq).totalMs)) {
        const next = pickNext(pool, cur?.combo ?? null);
        if (next) {
          const text = `${commandCallout(next)}!`;
          const c: Call = { combo: next, at: ms, mittAt: opts.current.voice ? null : ms + opts.current.tempo.callGapMs };
          callRef.current = c;
          calledRef.current = [...calledRef.current, next];
          setCall(c);
          if (opts.current.voice)
            void speak(text, { interrupt: true }).then(() => {
              if (callRef.current === c && c.mittAt === null) c.mittAt = runningMs() + opts.current.tempo.callGapMs;
            });
        }
      } else if (cur.mittAt !== null && ms >= cur.mittAt) {
        const ph = commandPhase(cur.combo, seq, ms - cur.mittAt);
        const key = `${calledRef.current.length}:${ph.step}`;
        if (ph.phase === 'strike' && ph.local >= POV_IMPACT_MS && impactKey.current !== key) {
          impactKey.current = key;
          const a = cur.combo.steps[ph.step].motion.archetype;
          if (opts.current.sound && a.kind === 'strike') soundRef.current?.play(a.path === 'hook' || a.path === 'round' || a.path === 'overhand' ? 'hook' : a.side === 'rear' ? 'straight' : 'jab');
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, paused, roundSeconds, pool]);

  useEffect(() => () => stopSpeaking(), []);

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

  const ph = call ? (call.mittAt !== null && t >= call.mittAt ? commandPhase(call.combo, { stepMs: tempo.stepMs, callGapMs: 0 }, t - call.mittAt) : { phase: 'react' as const, step: 0, local: 0 }) : null;
  const shown = call && ph ? call.combo.steps[ph.step] : null;
  const view = ph?.phase === 'strike' ? povTiming(ph.local, shown?.motion.archetype) : ph?.phase === 'rest' ? { p: 1, back: 1 } : { p: 0, back: 0 };
  const remaining = Math.max(0, roundSeconds - Math.floor(t / 1000));
  const strikes = calledRef.current.reduce((k, c) => k + c.steps.length, 0);
  const busy = running || ready.left !== null;

  if (!pool.length) {
    return <p className="video-status-message" data-testid="command-empty">지시할 수 있는 기본 공격이 없습니다. 레벨이나 킥 포함 여부를 바꿔 보세요.</p>;
  }
  return (
    <div className="card info-card command-drill" data-testid="command-drill" data-running={running} data-called={calledRef.current.length} data-done={done}>
      <p className="video-status-message" style={{ marginTop: 0 }}>
        미트 잡는 코치가 무작위로 공격을 불러 주고, 그 미트를 내밀어 보여 줍니다. 부르는 즉시 치세요. 지시는 MARTIALDEX에 있는 기본 공격{level !== 'single' ? '과 실제 콤보' : ''} {pool.length}가지 중에서 나옵니다.
      </p>
      <div className="chip-row">
        <span className="field-label" style={{ margin: 0 }}>지시</span>
        {(Object.keys(COMMAND_LEVEL_LABEL) as CommandLevel[]).map((l) => (
          <button key={l} type="button" className={`chip${level === l ? ' active' : ''}`} onClick={() => setLevel(l)} disabled={busy} data-testid={`command-level-${l}`}>
            {COMMAND_LEVEL_LABEL[l]}
          </button>
        ))}
        <label className="chip" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={withKicks} onChange={(e) => setWithKicks(e.target.checked)} disabled={busy} data-testid="command-kicks" /> 킥 포함
        </label>
        <label className="chip" style={{ cursor: 'pointer' }} title="코치가 공격을 뻗으면 피하거나 막고, 바로 카운터">
          <input type="checkbox" checked={withDefense} onChange={(e) => setWithDefense(e.target.checked)} disabled={busy} data-testid="command-defense" /> 🛡 방어 포함
        </label>
      </div>
      <TempoControls tempo={tempo} onChange={setTempo} testIdPrefix="command-pace" />
      <div className="chip-row">
        <span className="field-label" style={{ margin: 0 }}>시간</span>
        {[60, 120, 180].map((s) => (
          <button key={s} type="button" className={`chip${roundSeconds === s ? ' active' : ''}`} onClick={() => setRoundSeconds(s)} disabled={busy} data-testid={`command-round-${s}`}>
            {s / 60}분
          </button>
        ))}
      </div>
      <div className="chip-row">
        <label className="chip" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} disabled={!isTtsSupported()} data-testid="command-voice" /> 🗣 음성 지시
        </label>
        <label className="chip" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} data-testid="command-sound" /> 타격음
        </label>
        <label className="chip" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={stance === 'southpaw'} onChange={(e) => setStance(e.target.checked ? 'southpaw' : 'orthodox')} data-testid="command-southpaw" /> 사우스포
        </label>
      </div>

      <div className="mitt-stage mitt-stage--single" style={{ marginTop: 8 }} ref={stageRef}>
        {ready.left !== null && (
          <div className="mitt-ready" role="status" aria-live="assertive" data-testid="command-ready-countdown">
            <span className="mitt-ready__label">준비하세요</span>
            <strong className="mitt-ready__num">{ready.left}</strong>
          </div>
        )}
        {call && (
          <div className="mitt-callout mitt-callout--command" data-testid="command-call" data-combo={call.combo.id} key={calledRef.current.length}>
            {commandCallout(call.combo)}!
          </div>
        )}
        {shown ? (
          <FrontView archetype={shown.motion.archetype} target={shown.motion.target} stance={stance} p={view.p} back={view.back} />
        ) : (
          <div className="video-status-message command-drill__idle" data-testid="command-idle">
            {done ? '라운드가 끝났습니다.' : '시작을 누르면 5초 뒤부터 공격을 불러 줍니다.'}
          </div>
        )}
      </div>
      {call && (
        <div className="video-status-message" style={{ marginTop: 4 }} data-testid="command-call-detail">
          {call.combo.steps.map((s, i) => (
            <span key={i} className={`mitt-runner__move${ph?.phase === 'strike' && ph.step === i ? ' is-current' : ''}`}>
              {i > 0 && <span className="mitt-runner__arrow">→</span>}
              {calloutFor(s)}
            </span>
          ))}
          {call.combo.source === 'db' ? ` · ${call.combo.name}` : ''}
        </div>
      )}

      <div className="chip-row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <span data-testid="command-remaining">
          남은 시간 {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} · 지시 {calledRef.current.length}번 · 타격 {strikes}회
        </span>
        <span className="chip-row">
          {ready.left !== null ? (
            <button className="btn btn-secondary btn-sm" onClick={ready.cancel} data-testid="command-cancel-ready">
              ✕ 준비 취소
            </button>
          ) : !running ? (
            <button className="btn btn-primary btn-sm" onClick={start} data-testid="command-start">
              {done ? '다시 시작' : '▶ 시작'}
            </button>
          ) : (
            <>
              <button className="btn btn-secondary btn-sm" onClick={togglePause} data-testid="command-pause">
                {paused ? '계속' : '⏸ 일시정지'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => finish(false)} data-testid="command-stop">
                ■ 그만하기
              </button>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
