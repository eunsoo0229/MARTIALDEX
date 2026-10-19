import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import BackButton from '../components/BackButton';
import TutorVoiceSettingsPanel from '../components/TutorVoiceSettingsPanel';
import { FootworkView, FrontView, povTiming, type Stance } from '../components/visualMitt/MittStage';
import { getMartialArt } from '../lib/loadData';
import { KIND_LABEL, TARGET_LABEL } from '../lib/visualMitt/archetypes';
import {
  listBookCombos,
  listDbCombos,
  listVisualizableTechniques,
  MITT_ROLE_LABEL,
  recordMittSession,
  resolveMittCombo,
  reviewConnections,
  saveMittCombo,
  stepsForIds,
  type MittCombo,
  type MittStep,
} from '../lib/visualMitt/combos';
import { askCoach } from '../lib/aiCoachDay/service';
import type { CoachMessage } from '../lib/aiCoachDay/types';
import { isTtsSupported, speak, stopSpeaking } from '../lib/voice/tts';
import { techniqueArts } from '../lib/techniqueCanonical';
import ReactionDrill from '../components/visualMitt/ReactionDrill';
import CommandDrill from '../components/visualMitt/CommandDrill';
import ComboVideoPanel from '../components/visualMitt/ComboVideoPanel';
import MittRunner, { RUN_SPEED } from '../components/visualMitt/MittRunner';
import AutoGrowTextarea from '../components/AutoGrowTextarea';
import { decideDrill, type MittPlan } from '../lib/visualMitt/aiPlan';
import { comboBookText, hasAuthorText, interpretedCombo, interpretUserCombo, planMittTraining, type InterpretedCombo, type MittSourcePreference } from '../lib/visualMitt/mittSourcing';
import { listMyCombos } from '../lib/combo/service';
import { useAuth } from '../lib/auth/AuthProvider';

// AI Visualizing Mitt — practise strike sequences and takedown entry steps
// against a drawn mitt holder / opponent, step by step, guided by the AI
// coach (text or voice, using the existing AI 튜터 음성 settings). Nothing
// here watches the user: progress and "완료" are what the user marks.

type Speed = 'slow' | 'normal' | 'fast';
const SPEED: Record<Speed, { label: string; move: number; hold: number }> = {
  slow: { label: '느린 학습', move: 2600, hold: 2200 },
  normal: { label: '보통', move: 1500, hold: 1300 },
  fast: { label: '빠른 반복', move: 800, hold: 500 },
};
const STANCE_LABEL: Record<Stance, string> = { orthodox: '오소독스 (왼발 앞)', southpaw: '사우스포 (오른발 앞)' };

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Drives one step's motion: 0→1 over `move` ms while playing, then calls onDone after `hold` ms. Restarts when `runKey` changes. */
function useStepProgress(runKey: string, move: number, hold: number, playing: boolean, onDone: () => void): number {
  const [p, setP] = useState(0);
  const elapsed = useRef(0);
  const done = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    elapsed.current = 0;
    done.current = false;
    setP(0);
  }, [runKey]);
  useEffect(() => {
    if (!playing) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current += now - last;
      last = now;
      const next = reduced ? (elapsed.current > 50 ? 1 : 0) : Math.min(1, elapsed.current / move);
      setP(next);
      if (!done.current && elapsed.current >= move + hold) {
        done.current = true;
        onDoneRef.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, move, hold, runKey]);
  return p;
}

function stepLine(step: MittStep, i: number, n: number): string {
  const a = step.motion.archetype;
  const keyPoint = step.technique.posture?.keyPoints?.[0];
  const where = a.kind === 'feint' ? '' : ` 목표는 ${TARGET_LABEL[step.motion.target]}입니다.`;
  const own = `${step.note ? ` 메모: ${step.note}` : ''}${step.opponentReaction ? ` 예상 반응: ${step.opponentReaction}` : ''}`;
  return `${i + 1}/${n}단계, ${MITT_ROLE_LABEL[step.role]}: ${step.technique.name}. ${a.cue}${where}${keyPoint ? ` 핵심 포인트: ${keyPoint}` : ''}${own}`;
}

export default function VisualMitt() {
  const [params, setParams] = useSearchParams();
  const comboId = params.get('combo');
  const mode: 'voice' | 'text' = params.get('mode') === 'voice' ? 'voice' : 'text';
  const combo = useMemo(() => (comboId ? resolveMittCombo(comboId) : null), [comboId]);
  const stance: Stance = params.get('stance') === 'southpaw' ? 'southpaw' : 'orthodox';
  // A user-written combo/setup (combo book, shared copies) is first read by the AI, which splits its
  // description/notes into the real technique steps; the user then picks AI steps or the original.
  const authored = useMemo(() => {
    if (!combo || combo.source !== 'saved') return null;
    const book = listMyCombos().find((c) => c.id === combo.id);
    if (!book || book.visualMittMeta || book.aiComboMeta || book.sourceMeta) return null; // built by the app → already structured
    const text = comboBookText(book);
    return hasAuthorText(text) ? text : null;
  }, [combo]);
  const [chosen, setChosen] = useState<{ id: string; combo: MittCombo } | null>(null);
  if (combo && authored && chosen?.id !== combo.id) {
    return <UserComboGate key={combo.id} combo={combo} text={authored} onChoose={(c) => setChosen({ id: combo.id, combo: c })} onExit={() => setParams({ mode })} />;
  }
  const playing = combo && chosen?.id === combo.id ? chosen.combo : combo;
  return playing ? (
    <MittSession key={playing.id} combo={playing} mode={mode} initialStance={stance} onExit={() => setParams({ mode })} />
  ) : (
    <MittSetup mode={mode} onPick={(id, stance) => setParams({ combo: id, mode, stance })} onMode={(m) => setParams({ mode: m })} missing={!!comboId} />
  );
}

// ---------------- user-written combo → AI step split ----------------
function UserComboGate({ combo, text, onChoose, onExit }: { combo: MittCombo; text: ReturnType<typeof comboBookText>; onChoose: (c: MittCombo) => void; onExit: () => void }) {
  const [state, setState] = useState<{ busy: boolean; result: InterpretedCombo | null; error: string | null }>({ busy: true, result: null, error: null });
  useEffect(() => {
    let alive = true;
    void interpretUserCombo(text).then((r) => alive && setState({ busy: false, result: r.ok ? r.result : null, error: r.ok ? null : r.message }));
    return () => {
      alive = false;
    };
  }, [text]);
  const ai = state.result ? interpretedCombo(combo, state.result) : null;
  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="section-title">
          <h2>🥊 {combo.name}</h2>
        </div>
        <div className="card info-card" data-testid="mitt-interpret" data-state={state.busy ? 'busy' : ai ? 'done' : 'error'}>
          <h3 style={{ margin: '0 0 4px' }}>🤖 AI가 콤보 설명을 읽고 미트 단계로 정리합니다</h3>
          <p className="video-status-message" style={{ margin: '0 0 6px' }}>
            직접 만든 {text.kind === 'setup' ? '셋업' : '콤보'}은 설명과 단계가 애매하게 나뉘어 있을 수 있어, 이름·목적·설명·메모를 함께 읽고 실제로 칠 기술 순서로 나눕니다. 작성자가 쓰지 않은 기술은 추가하지 않습니다.
          </p>
          {state.busy && <p data-testid="mitt-interpret-busy">설명을 읽는 중입니다…</p>}
          {state.error && <div className="ai-inline-warning">{state.error} 원래 단계로 연습할 수 있습니다.</div>}
          {ai && state.result && (
            <>
              {state.result.summary && <p style={{ margin: '4px 0' }}>{state.result.summary}</p>}
              <ol className="coach-class-steps" data-testid="mitt-interpret-steps">
                {ai.steps.map((st, i) => (
                  <li key={i} data-testid="mitt-interpret-step" data-technique-id={st.techniqueId}>
                    <span className="chip">{MITT_ROLE_LABEL[st.role]}</span> <strong>{st.technique.name}</strong>
                    {st.note ? ` — ${st.note}` : ''}
                    {st.opponentReaction ? ` (예상 반응: ${st.opponentReaction})` : ''}
                  </li>
                ))}
              </ol>
              {state.result.unmapped.length > 0 && <p className="technique-row__sub">미트로 표현할 수 없어 뺀 동작: {state.result.unmapped.join(', ')}</p>}
            </>
          )}
          <p className="technique-row__sub">원래 단계: {combo.steps.map((s) => s.technique.name).join(' → ') || '없음'}</p>
          <div className="modal-actions modal-actions--start">
            {ai && (
              <button className="btn btn-primary" onClick={() => onChoose(ai)} data-testid="mitt-interpret-use-ai">
                AI가 정리한 단계로 훈련
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => onChoose(combo)} disabled={!combo.steps.length} data-testid="mitt-interpret-use-original">
              원래 단계로 훈련
            </button>
            <button className="btn btn-ghost" onClick={onExit}>
              돌아가기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- setup: pick or build a combo ----------------
function MittSetup({ mode, onPick, onMode, missing }: { mode: 'voice' | 'text'; onPick: (id: string, stance: Stance) => void; onMode: (m: 'voice' | 'text') => void; missing: boolean }) {
  const [tab, setTab] = useState<'ai' | 'command' | 'react' | 'db' | 'mine' | 'single' | 'build'>('ai');
  const [purpose, setPurpose] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPlan, setAiPlan] = useState<MittPlan | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiSaved, setAiSaved] = useState<string | null>(null);
  const { user } = useAuth();

  /** The coach decides: a fitting shared combo/setup, or a new drill from a live web search (`prefer` overrides). */
  async function askAi(prefer: MittSourcePreference = 'auto') {
    if (!purpose.trim() || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    setAiPlan(null);
    setAiRunning(false);
    setAiSaved(null);
    const r = await planMittTraining({ purpose, martialArt: art || null, previous: aiPlan, viewerId: user?.id ?? null, prefer });
    setAiBusy(false);
    if (r.ok) setAiPlan(r.plan);
    else setAiError(r.message);
  }
  const [stance, setStance] = useState<Stance>('orthodox');
  const [art, setArt] = useState('');
  const [query, setQuery] = useState('');
  const db = useMemo(() => listDbCombos(), []);
  const mine = useMemo(() => listBookCombos(), []);
  const techniques = useMemo(() => listVisualizableTechniques(), []);
  const [draft, setDraft] = useState<string[]>([]);
  const [draftName, setDraftName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const draftSteps = useMemo(() => stepsForIds(draft), [draft]);
  const draftNotes = useMemo(() => reviewConnections(draftSteps), [draftSteps]);
  const arts = useMemo(() => [...new Set(techniques.flatMap((t) => techniqueArts(t)))], [techniques]);
  const q = query.trim().toLowerCase();
  const found = techniques.filter((t) => (!art || techniqueArts(t).includes(art)) && (!q || [t.name, t.koreanName ?? '', ...t.aliases].some((n) => n.toLowerCase().includes(q))));
  const dbShown = db.filter((c) => !art || c.steps.some((s) => techniqueArts(s.technique).includes(art)));

  function save() {
    setSaveError(null);
    if (draft.length < 2) return setSaveError('기술을 2개 이상 추가해 주세요.');
    if (!draftName.trim()) return setSaveError('콤보 이름을 입력해 주세요.');
    const c = saveMittCombo(draftName, draft, stance);
    onPick(c.id, stance);
  }

  const comboRow = (c: MittCombo) => (
    <div key={c.id} className="technique-row" data-testid="mitt-combo-option" data-combo-id={c.id} data-source={c.source}>
      <div className="technique-row__main">
        <div className="technique-row__name">{c.name}</div>
        <div className="technique-row__sub">
          {c.sourceLabel} · {c.steps.map((s) => MITT_ROLE_LABEL[s.role]).join(' → ')}
          {c.skipped.length > 0 ? ` · 시각화할 수 없는 단계 ${c.skipped.length}개는 건너뜀` : ''}
        </div>
      </div>
      <div className="technique-row__right">
        <button className="btn btn-primary btn-sm" disabled={c.steps.length === 0} onClick={() => onPick(c.id, stance)} data-testid="mitt-combo-start">
          연습
        </button>
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/coach">AI 코치</Link>
          <span>/</span>
          <span>AI Visualizing Mitt</span>
        </div>
        <div className="section-title">
          <h2>🥊 AI Visualizing Mitt</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          실제 미트나 파트너 없이, 화면의 미트 잡이·목표 미트·발 위치를 보며 타격 콤보와 테이크다운 진입 스텝을 순서대로 익힙니다. 그림은 동작의 경로와 풋워크를 보여 주는 도식이며, 앱이 사용자의 동작을 보거나 판정하지는 않습니다.
        </p>
        {missing && <div className="ai-inline-warning">선택한 콤보를 찾을 수 없습니다. 다시 골라 주세요.</div>}

        <div className="card info-card">
          <div className="chip-row">
            <span className="field-label">스탠스</span>
            {(['orthodox', 'southpaw'] as Stance[]).map((s) => (
              <button key={s} className={`chip ${stance === s ? 'active' : ''}`} onClick={() => setStance(s)} data-testid={`mitt-stance-${s}`}>
                {STANCE_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="chip-row">
            <span className="field-label">코치 안내</span>
            <button className={`chip ${mode === 'text' ? 'active' : ''}`} onClick={() => onMode('text')} data-testid="mitt-mode-text">
              ⌨️ 글로 보기
            </button>
            <button className={`chip ${mode === 'voice' ? 'active' : ''}`} onClick={() => onMode('voice')} data-testid="mitt-mode-voice" disabled={!isTtsSupported()}>
              🎙 음성으로 듣기
            </button>
          </div>
          {mode === 'voice' && (
            <details className="coach-voice-settings">
              <summary>🔊 AI 튜터 음성 · 말하기 속도</summary>
              <TutorVoiceSettingsPanel autoSave />
            </details>
          )}
          <div className="chip-row">
            <span className="field-label">무술</span>
            <select className="select" value={art} onChange={(e) => setArt(e.target.value)} data-testid="mitt-art-filter">
              <option value="">전체</option>
              {arts.map((a) => (
                <option key={a} value={a}>
                  {getMartialArt(a)?.nameKo ?? a}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="chip-row" role="tablist">
          {(
            [
              ['ai', 'AI에게 콤보/셋업 요청'],
              ['command', '🎯 공격 지시 (미트 콜)'],
              ['react', '반응 훈련 (무작위 콤보)'],
              ['db', `추천 콤보 (기술 DB 수록 ${db.length})`],
              ['mine', `내 콤보 ${mine.length}`],
              ['single', `단일 기술 ${techniques.length}`],
              ['build', '콤보 만들기'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`chip ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)} data-testid={`mitt-tab-${k}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'react' && <ReactionDrill stance={stance} />}
        {tab === 'command' && <CommandDrill stance={stance} voice={mode === 'voice'} />}

        {tab === 'ai' && (
          <div className="card info-card" data-testid="mitt-ai">
            <div className="field-block">
              <label className="field-label" htmlFor="mitt-purpose">
                연습하고 싶은 목적
              </label>
              <AutoGrowTextarea
                id="mitt-purpose"
                minRows={2}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="예: 잽으로 상대 가드를 열고 바디 공격으로 연결하는 콤보를 만들어 주세요 / 상대가 앞으로 들어올 때 대응하는 셋업"
                data-testid="mitt-purpose"
              />
            </div>
            <div className="modal-actions modal-actions--start" style={{ marginTop: 8 }}>
              <button className="btn btn-primary" onClick={() => void askAi()} disabled={aiBusy || !purpose.trim()} data-testid="mitt-ai-generate">
                {aiBusy ? 'AI 코치가 공유 콤보를 살펴보고 실시간 검색하는 중입니다…' : aiPlan ? '다시 만들기' : 'AI 튜터에게 만들기 요청'}
              </button>
            </div>
            <p className="video-status-message">AI 코치가 먼저 MARTIALDEX 사용자들이 공유한 콤보·셋업 중 목적에 맞는 것이 있는지 보고, 있으면 그대로 불러오고 없으면 실시간으로 검색해 새로 만듭니다. 기술은 MARTIALDEX 기술 DB에 있고 시각화할 수 있는 것만 씁니다.</p>
            {aiError && <div className="ai-inline-warning">{aiError}</div>}
            {aiPlan && (
              <div data-testid="mitt-ai-plan" data-type={aiPlan.type}>
                <h3 style={{ margin: '8px 0 4px' }}>
                  {aiPlan.type === 'setup' ? '셋업' : '콤보'}: {aiPlan.name}
                </h3>
                <p style={{ margin: '0 0 4px' }}>목적: {aiPlan.purpose}</p>
                {aiPlan.decision && (
                  <div className="mitt-source" data-testid="mitt-ai-source" data-choice={aiPlan.decision.choice}>
                    <strong>
                      {aiPlan.decision.choice === 'shared'
                        ? `📚 사용자 공유 ${aiPlan.shared?.kind === 'setup' ? '셋업을' : '콤보를'} 불러왔습니다 · by ${aiPlan.shared?.authorNickname || '익명'} · ♥${aiPlan.shared?.likeCount ?? 0}`
                        : aiPlan.decision.choice === 'web'
                          ? '🌐 실시간 검색 자료로 새로 만들었습니다'
                          : '⚠️ 기술 DB만으로 만들었습니다'}
                    </strong>
                    <div>{aiPlan.decision.reason}</div>
                    {aiPlan.webSources && aiPlan.webSources.length > 0 && (
                      <ul className="mitt-source__list" data-testid="mitt-ai-web-sources">
                        {aiPlan.webSources.map((w) => (
                          <li key={w.url}>
                            <a href={w.url} target="_blank" rel="noreferrer">
                              {w.title || w.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                    {aiPlan.unmapped && aiPlan.unmapped.length > 0 && <div className="technique-row__sub">미트로 표현할 수 없어 뺀 동작: {aiPlan.unmapped.join(', ')}</div>}
                    <div className="chip-row" style={{ marginTop: 4 }}>
                      {aiPlan.decision.choice !== 'shared' && (
                        <button className="chip" onClick={() => void askAi('shared')} disabled={aiBusy} data-testid="mitt-ai-prefer-shared">
                          📚 공유 콤보에서 찾기
                        </button>
                      )}
                      {aiPlan.decision.choice !== 'web' && (
                        <button className="chip" onClick={() => void askAi('web')} disabled={aiBusy} data-testid="mitt-ai-prefer-web">
                          🌐 실시간 검색으로 새로 만들기
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <ol className="coach-class-steps">
                  {aiPlan.combo.steps.map((st, i) => (
                    <li key={i} data-testid="mitt-ai-step" data-technique-id={st.techniqueId}>
                      <span className="chip">{MITT_ROLE_LABEL[st.role]}</span> <strong>{st.technique.name}</strong>
                      {aiPlan.stepNotes[i]?.note ? ` — ${aiPlan.stepNotes[i].note}` : ''}
                      {aiPlan.stepNotes[i]?.opponentReaction ? ` (예상 반응: ${aiPlan.stepNotes[i].opponentReaction})` : ''}
                    </li>
                  ))}
                </ol>
                <p className="video-status-message" data-testid="mitt-ai-reps">
                  {aiPlan.repetitions}회 · {RUN_SPEED[aiPlan.speed].label} — {aiPlan.reason}
                  {aiPlan.coachingNote ? ` · ${aiPlan.coachingNote}` : ''}
                </p>
                <div className="modal-actions modal-actions--start">
                  <button className="btn btn-primary" onClick={() => setAiRunning(true)} data-testid="mitt-ai-run">
                    ▶ 바로 연습 ({aiPlan.repetitions}회)
                  </button>
                  {aiSaved ? (
                    <span className="video-status-message" data-testid="mitt-ai-saved">콤보 북에 저장했습니다.</span>
                  ) : (
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        const c = saveMittCombo(aiPlan.name, aiPlan.combo.steps.map((x) => x.techniqueId), stance, {
                          type: aiPlan.type,
                          purpose: aiPlan.purpose,
                          repetitions: aiPlan.repetitions,
                          speed: aiPlan.speed,
                          coachingNote: aiPlan.coachingNote,
                          stepNotes: aiPlan.stepNotes,
                          source: 'ai',
                        });
                        setAiSaved(c.id);
                      }}
                      data-testid="mitt-ai-save"
                    >
                      콤보 북에 저장
                    </button>
                  )}
                </div>
                <ComboVideoPanel techniques={aiPlan.combo.steps.map((x) => x.technique)} comboName={aiPlan.name} />
                {aiRunning && (
                  <div style={{ marginTop: 8 }}>
                    <MittRunner
                      combo={aiPlan.combo}
                      repetitions={aiPlan.repetitions}
                      speed={aiPlan.speed}
                      stance={stance}
                      speakCallouts={mode === 'voice'}
                      onLastRep={(i) => mode === 'voice' && !i.calledOut && speak('마지막 1회입니다.', { interrupt: false })}
                      onDone={(r) => mode === 'voice' && speak(r.finished ? `좋습니다. ${aiPlan.name}을(를) ${r.completedReps}회 모두 반복했습니다.` : `${r.completedReps}회까지 연습했습니다.`)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'db' && (
          <div className="stack gap-1" data-testid="mitt-db-list">
            <p className="video-status-message">MARTIALDEX 기술 DB에 실제로 수록된 조합(예: 킥복싱 "대표적인 콤비네이션", 복싱 "1--2--3")입니다 — 검증된 추천 콤보.</p>
            {dbShown.map(comboRow)}
          </div>
        )}
        {tab === 'mine' && (
          <div className="stack gap-1" data-testid="mitt-mine-list">
            <p className="video-status-message">콤보 북에 저장된 사용자 지정 콤보입니다. 연결 순서는 사용자가 정한 것이며 검증된 조합이 아닙니다.</p>
            {mine.length === 0 ? <p className="video-status-message">저장된 콤보가 없습니다. "콤보 만들기"에서 만들어 보세요.</p> : mine.map(comboRow)}
          </div>
        )}
        {(tab === 'single' || tab === 'build') && (
          <div className="card info-card">
            <input className="select filter-text-input" placeholder="기술 이름으로 검색 (예: Jab, Teep, Double Leg)" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="mitt-search" />
            <div className="stack gap-1" style={{ marginTop: 8, maxHeight: 320, overflow: 'auto' }}>
              {found.slice(0, 60).map((t) => (
                <div key={t.id} className="technique-row" data-testid="mitt-technique-option" data-technique-id={t.id}>
                  <div className="technique-row__main">
                    <div className="technique-row__name">
                      {t.name} {t.koreanName && t.koreanName !== t.name ? <span className="learned-row__ko">{t.koreanName}</span> : null}
                    </div>
                    <div className="technique-row__sub">{techniqueArts(t).map((a) => getMartialArt(a)?.nameKo ?? a).join(' · ')}</div>
                  </div>
                  <div className="technique-row__right">
                    {tab === 'single' ? (
                      <button className="btn btn-primary btn-sm" onClick={() => onPick(`single:${t.id}`, stance)} data-testid="mitt-single-start">
                        연습
                      </button>
                    ) : (
                      <button className="btn btn-secondary btn-sm" onClick={() => setDraft((d) => [...d, t.id])} data-testid="mitt-add-step">
                        ＋ 추가
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'build' && (
          <div className="card info-card" data-testid="mitt-builder">
            <h3>만드는 중인 콤보 ({draft.length}단계)</h3>
            <ol className="coach-class-steps">
              {draftSteps.map((s, i) => (
                <li key={`${s.techniqueId}-${i}`} data-testid="mitt-draft-step">
                  <span className="chip">{MITT_ROLE_LABEL[s.role]}</span> {s.technique.name}{' '}
                  <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => setDraft((d) => { const n = [...d]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })} aria-label="위로">
                    ↑
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={i === draft.length - 1} onClick={() => setDraft((d) => { const n = [...d]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })} aria-label="아래로">
                    ↓
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} aria-label="삭제">
                    ✕
                  </button>
                </li>
              ))}
            </ol>
            {draftNotes.length > 0 && (
              <div className="ai-inline-warning" data-testid="mitt-draft-notes">
                참고 (사용자 지정 콤보 — 연결 검증 안 됨): {draftNotes.join(' / ')}
              </div>
            )}
            <input className="select" placeholder="콤보 이름" value={draftName} onChange={(e) => setDraftName(e.target.value)} data-testid="mitt-draft-name" />
            {saveError && <p className="ai-inline-warning">{saveError}</p>}
            <div className="modal-actions modal-actions--start">
              <button className="btn btn-primary" onClick={save} data-testid="mitt-draft-save">
                콤보 북에 저장하고 연습
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- session ----------------
function MittSession({ combo, mode, initialStance, onExit }: { combo: MittCombo; mode: 'voice' | 'text'; initialStance: Stance; onExit: () => void }) {
  const n = combo.steps.length;
  const [stance, setStance] = useState<Stance>(initialStance);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [auto, setAuto] = useState(true);
  const [loopStep, setLoopStep] = useState(false);
  const [repeatAll, setRepeatAll] = useState(true);
  const [speed, setSpeed] = useState<Speed>('slow');
  const [run, setRun] = useState(0);
  const [reps, setReps] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState(false);
  // 콤보 연속 실행 (one continuous motion, tutor-decided repetitions) is the default for a combo; 단계별 익히기 is the step-by-step study mode.
  const [runMode, setRunMode] = useState<'continuous' | 'steps'>(n >= 2 ? 'continuous' : 'steps');
  const drill = useMemo(() => decideDrill(combo.steps), [combo]);
  const [runKey, setRunKey] = useState(0);
  const [markComplete, setMarkComplete] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const step = combo.steps[index];
  const voice = mode === 'voice' && isTtsSupported();

  const say = useCallback(
    (text: string, kind: CoachMessage['kind'] = 'system', interrupt = false) => {
      setMessages((m) => [...m, { id: newId(), role: 'coach', text, kind, at: new Date().toISOString() }]);
      if (voice) speak(text, { interrupt });
    },
    [voice]
  );

  // Opening + start-of-step lines (each step announced once per visit).
  const announced = useRef('');
  useEffect(() => {
    if (index === 0 && run === 0 && announced.current === '') {
      say(
        runMode === 'continuous'
          ? `${combo.name} ${n >= 2 ? '콤보' : '동작'}를 ${drill.repetitions}회 연습하겠습니다. ${drill.reason} ${STANCE_LABEL[stance]} 스탠스로 서서 손은 턱 앞 가드에 두시고, 준비되면 시작을 눌러 주세요.${voice ? ' 칠 때마다 기술 이름을 불러 드릴게요.' : ''}`
          : `AI Visualizing Mitt를 시작하겠습니다. 오늘 연습할 것은 ${combo.name}, ${n}단계입니다. ${STANCE_LABEL[stance]} 스탠스로 서서 손은 턱 앞 가드에 두세요. 준비되면 재생을 눌러 주세요.`
      );
      if (runMode === 'continuous') {
        announced.current = 'opening';
        return;
      }
    }
    if (runMode === 'continuous') {
      if (announced.current === '') announced.current = 'opening';
      return; // no per-technique speech while a combo runs continuously
    }
    const key = `${index}:${run}`;
    if (announced.current === key) return;
    // Moving to a step cuts off the previous step's line (voice keeps up with the drawing) — but never the opening.
    const interrupt = announced.current !== '';
    announced.current = key;
    say(stepLine(step, index, n), 'explain', interrupt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, run, runMode]);
  useEffect(() => () => stopSpeaking(), []);

  const onStepDone = useCallback(() => {
    if (loopStep) return setRun((r) => r + 1);
    if (!auto) return setPlaying(false);
    if (index + 1 < n) return setIndex((i) => i + 1);
    setReps((r) => r + 1);
    if (repeatAll) {
      say(`${combo.name} 한 바퀴를 마쳤습니다. 처음부터 다시 이어서 진행하겠습니다.`, 'feedback');
      setIndex(0);
      setRun((r) => r + 1);
    } else {
      setPlaying(false);
      say(`${combo.name}를 끝까지 연습했습니다. 전체 반복을 누르시면 처음부터 다시 진행하겠습니다.`, 'feedback');
    }
  }, [auto, loopStep, index, n, repeatAll, combo.name, say]);

  const p = useStepProgress(`${index}:${run}:${speed}`, SPEED[speed].move, SPEED[speed].hold, playing && !ended, onStepDone);
  // The step's time slot follows the chosen speed; the punch inside it always plays at real speed.
  const pov = povTiming(p * SPEED[speed].move, step.motion.archetype);

  function go(i: number) {
    setIndex(Math.max(0, Math.min(n - 1, i)));
    setRun((r) => r + 1);
  }

  async function ask() {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    setMessages((m) => [...m, { id: newId(), role: 'user', text: q, at: new Date().toISOString() }]);
    setBusy(true);
    const context = `[AI Visualizing Mitt]\n콤보: ${combo.steps.map((s, i) => `${i + 1}. ${s.technique.name}(${MITT_ROLE_LABEL[s.role]})`).join(' → ')}\n지금 ${index + 1}단계: ${step.technique.name} — ${step.motion.archetype.cue}\n스탠스: ${STANCE_LABEL[stance]}\n사용자는 실제 미트 없이 화면의 도식을 보며 혼자 동작을 연습 중이다.`;
    const r = await askCoach(step.technique, context, messages, q);
    say(r.ok ? r.text : `지금은 답변을 가져오지 못했어요: ${r.message}`, 'answer');
    setBusy(false);
  }

  function end() {
    setPlaying(false);
    setEnded(true);
    stopSpeaking();
    say(`수업을 마치겠습니다. 반복 ${reps}회, 완료로 표시한 단계는 ${completed.size}/${n}개입니다. 다음에는 ${speed === 'fast' ? '다른 콤보에 도전' : '속도를 한 단계 올려 반복'}해 보시기 바랍니다.`, 'feedback');
  }

  function saveRecord() {
    const minutes = Math.round((Date.now() - startedAt.current) / 60000);
    const entry = recordMittSession({
      combo,
      completedSteps: [...completed].sort((a, b) => a - b),
      repetitions: reps,
      stance,
      minutes,
      markedComplete: markComplete,
    });
    setSaved(entry.id);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/coach">AI 코치</Link>
          <span>/</span>
          <button className="btn btn-ghost btn-sm" onClick={onExit}>
            AI Visualizing Mitt
          </button>
          <span>/</span>
          <span>{combo.name}</span>
        </div>
        <div className="section-title">
          <h2>🥊 {combo.name}</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          {combo.sourceLabel} · {STANCE_LABEL[stance]} · {mode === 'voice' ? '음성 안내' : '글 안내'} · 반복 <strong data-testid="mitt-reps">{reps}</strong>회
        </p>
        {combo.skipped.length > 0 && <div className="ai-inline-warning">시각화 정보가 없는 단계는 건너뜁니다: {combo.skipped.join(', ')}</div>}
        {combo.warnings.length > 0 && <div className="ai-inline-warning">참고 (사용자 지정 콤보): {combo.warnings.join(' / ')}</div>}

        <ComboVideoPanel techniques={combo.steps.map((x) => x.technique)} comboName={combo.name} />

        <div className="chip-row" data-testid="mitt-run-mode">
          <button className={`chip ${runMode === 'continuous' ? 'active' : ''}`} onClick={() => setRunMode('continuous')} data-testid="mitt-mode-continuous">
            ⚡ 콤보 연속 실행
          </button>
          <button className={`chip ${runMode === 'steps' ? 'active' : ''}`} onClick={() => setRunMode('steps')} data-testid="mitt-mode-steps">
            🧩 단계별 익히기
          </button>
        </div>

        {runMode === 'continuous' && !ended && (
          <div data-testid="mitt-continuous">
            <p className="video-status-message" style={{ margin: '0 0 6px' }} data-testid="mitt-drill-reason">
              AI 튜터 결정: {drill.repetitions}회 · {RUN_SPEED[drill.speed].label} — {drill.reason}
            </p>
            <MittRunner
              key={`${runKey}:${stance}`}
              combo={combo}
              repetitions={drill.repetitions}
              speed={drill.speed}
              stance={stance}
              autoStart={false}
              speakCallouts={voice}
              onLastRep={(i) => voice && !i.calledOut && speak('마지막 1회입니다.')}
              onDone={(r) => {
                setReps((x) => x + r.completedReps);
                say(r.finished ? `좋습니다. ${combo.name}을(를) ${r.completedReps}회 모두 반복했습니다. 다음에는 속도를 한 단계 올려 보겠습니다.` : `${combo.name}은(는) ${r.completedReps}회까지 연습했습니다.`, 'feedback');
              }}
            />
            <div className="modal-actions modal-actions--start" style={{ marginTop: 6 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setRunKey((k) => k + 1)}>
                ↺ 새로 시작
              </button>
              <button className="btn btn-ghost btn-sm" onClick={end} data-testid="mitt-end-continuous">
                ■ 수업 종료
              </button>
            </div>
          </div>
        )}

        {runMode === 'steps' && (
        <>
        <div className="mitt-steps" data-testid="mitt-steps">
          {combo.steps.map((s, i) => (
            <button key={i} className={`mitt-step-chip${i === index ? ' mitt-step-chip--current' : ''}${completed.has(i) ? ' mitt-step-chip--done' : ''}`} onClick={() => go(i)} data-testid="mitt-step-chip" data-current={i === index ? 'true' : 'false'}>
              {completed.has(i) ? '✔ ' : ''}
              {i + 1}. {s.technique.name}
            </button>
          ))}
        </div>

        <div className="card info-card" data-testid="mitt-current" data-index={index} data-archetype={step.motion.archetype.key} data-kind={step.motion.archetype.kind}>
          <h3>
            {index + 1}/{n} · {MITT_ROLE_LABEL[step.role]} · {step.technique.name}
            <span className="chip" style={{ marginLeft: 6 }}>
              {KIND_LABEL[step.motion.archetype.kind]} · {step.motion.archetype.label}
            </span>
          </h3>
          <p style={{ margin: '2px 0 6px' }}>{step.motion.archetype.cue}</p>
          {(step.note || step.opponentReaction) && (
            <p className="video-status-message" style={{ margin: '0 0 6px' }} data-testid="mitt-step-note">
              {step.note && <>📝 {step.note} </>}
              {step.opponentReaction && <>🎯 예상 반응: {step.opponentReaction}</>}
            </p>
          )}
          <p className="video-status-message" style={{ margin: 0 }}>
            목표: {TARGET_LABEL[step.motion.target]} · 다음: {index + 1 < n ? combo.steps[index + 1].technique.name : repeatAll ? '처음부터 반복' : '끝'}
          </p>
          <div className="mitt-stage" style={{ marginTop: 8 }}>
            <FrontView archetype={step.motion.archetype} target={step.motion.target} stance={stance} p={pov.p} back={pov.back} />
            <FootworkView archetype={step.motion.archetype} stance={stance} p={pov.p} />
          </div>
          <div className="progress-track" style={{ margin: '6px 0' }}>
            <div className="progress-fill" style={{ width: `${Math.round(p * 100)}%` }} data-testid="mitt-progress" data-p={p.toFixed(2)} />
          </div>
          <p className="video-status-message" style={{ margin: 0 }}>
            동작 경로·풋워크 도식입니다 (전신 애니메이션이나 자세 판정이 아님). 단계마다 멈춰 두고 그림을 보며 따라 해도 됩니다.
          </p>
        </div>

        {!ended && (
          <div className="card info-card">
            <div className="mitt-controls">
              <button className="btn btn-secondary btn-sm" onClick={() => go(index - 1)} disabled={index === 0} data-testid="mitt-prev">
                ◀ 이전
              </button>
              {playing ? (
                <button className="btn btn-secondary btn-sm" onClick={() => setPlaying(false)} data-testid="mitt-pause">
                  ⏸ 일시정지
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={() => setPlaying(true)} data-testid="mitt-play">
                  ▶ 재생
                </button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => go(index + 1)} disabled={index === n - 1} data-testid="mitt-next">
                다음 ▶
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setRun((r) => r + 1)} data-testid="mitt-replay">
                ↺ 다시 보기
              </button>
              <button className={`btn btn-sm ${loopStep ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setLoopStep((v) => !v)} aria-pressed={loopStep} data-testid="mitt-loop-step">
                🔁 현재 단계 반복
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  go(0);
                  setPlaying(true);
                }}
                data-testid="mitt-repeat-all"
              >
                ⏮ 전체 콤보 처음부터
              </button>
            </div>
            <div className="chip-row" style={{ marginTop: 8 }}>
              <span className="field-label">시각화 속도</span>
              {(Object.keys(SPEED) as Speed[]).map((s) => (
                <button key={s} className={`chip ${speed === s ? 'active' : ''}`} onClick={() => setSpeed(s)} data-testid={`mitt-speed-${s}`}>
                  {SPEED[s].label}
                </button>
              ))}
            </div>
            <div className="chip-row">
              <label className="tutor-voice__check">
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} data-testid="mitt-auto" /> 자동으로 다음 단계
              </label>
              <label className="tutor-voice__check">
                <input type="checkbox" checked={repeatAll} onChange={(e) => setRepeatAll(e.target.checked)} data-testid="mitt-repeat-toggle" /> 끝나면 처음부터 반복
              </label>
              <label className="tutor-voice__check">
                <input type="checkbox" checked={stance === 'southpaw'} onChange={(e) => setStance(e.target.checked ? 'southpaw' : 'orthodox')} data-testid="mitt-southpaw" /> 사우스포
              </label>
            </div>
            <div className="modal-actions modal-actions--start" style={{ marginTop: 6 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setCompleted((c) => new Set(c).add(index))} disabled={completed.has(index)} data-testid="mitt-mark-step">
                ✔ 이 단계 연습함 (내가 표시)
              </button>
              <button className="btn btn-ghost btn-sm" onClick={end} data-testid="mitt-end">
                ■ 수업 종료
              </button>
            </div>
            {voice && (
              <details className="coach-voice-settings" data-testid="mitt-voice-settings">
                <summary>🔊 AI 튜터 설정 (음성 · 말하기 속도)</summary>
                <TutorVoiceSettingsPanel />
              </details>
            )}
          </div>
        )}

        </>
        )}

        <div className="card info-card">
          <div className="ai-chat coach-chat" data-testid="mitt-chat">
            {messages.map((m) => (
              <div key={m.id} className={`ai-msg ai-msg--${m.role === 'user' ? 'user' : 'model'}`} data-kind={m.kind ?? ''}>
                <div className="ai-msg__bubble">{m.text}</div>
              </div>
            ))}
            {busy && (
              <div className="ai-msg ai-msg--model">
                <div className="ai-msg__bubble ai-msg__bubble--loading">
                  <span className="ai-typing-dot" />
                  <span className="ai-typing-dot" />
                  <span className="ai-typing-dot" />
                </div>
              </div>
            )}
          </div>
          <div className="modal-actions modal-actions--start" style={{ marginTop: 6 }}>
            <input
              className="select"
              style={{ flex: 1 }}
              placeholder="AI 코치에게 이 동작에 대해 질문하기"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) void ask();
              }}
              data-testid="mitt-ask-input"
            />
            <button className="btn btn-secondary btn-sm" onClick={() => void ask()} disabled={busy || !input.trim()} data-testid="mitt-ask">
              질문
            </button>
          </div>
        </div>


        {ended && (
          <div className="card info-card" data-testid="mitt-summary">
            <h3>🎉 수업 요약</h3>
            <p style={{ margin: '4px 0' }}>
              반복 {reps}회 · 완료로 표시한 단계 {completed.size}/{n}개
            </p>
            <p className="video-status-message">반복·완료 단계는 사용자가 표시한 연습 기록입니다.</p>
            {!saved ? (
              <>
                <label className="tutor-voice__check">
                  <input type="checkbox" checked={markComplete} onChange={(e) => setMarkComplete(e.target.checked)} data-testid="mitt-mark-complete" /> 오늘 연습을 완료로 표시
                </label>
                <div className="modal-actions modal-actions--start">
                  <button className="btn btn-primary" onClick={saveRecord} data-testid="mitt-save-record">
                    학습 기록에 저장
                  </button>
                  <button className="btn btn-ghost" onClick={onExit}>
                    저장하지 않고 나가기
                  </button>
                </div>
              </>
            ) : (
              <div className="modal-actions modal-actions--start">
                <Link to={`/training-analytics/${saved}`} className="btn btn-secondary" data-testid="mitt-record-link">
                  학습 기록 보기
                </Link>
                <button className="btn btn-primary" onClick={onExit}>
                  다른 콤보 연습
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
