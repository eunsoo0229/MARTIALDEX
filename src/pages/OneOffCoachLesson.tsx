import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import BackButton from '../components/BackButton';
import AutoGrowTextarea from '../components/AutoGrowTextarea';
import { martialArtSummaries } from '../lib/loadData';
import { resolveTechnique } from '../lib/userTechniques/service';
import { recordTrainingSession } from '../lib/trainingHistory/service';
import { actionsToMessages } from '../lib/coachLesson/service';
import { saveLearningRecord } from '../lib/coachLesson/records';
import { toLearningRecord } from '../lib/coachLesson/engine';
import { buildOneOffLesson, oneOffEvent, respondOneOff, startOneOffLesson, type OneOffLesson, type OneOffMode } from '../lib/coachLesson/oneOff';
import type { CoachMessage } from '../lib/aiCoachDay/types';
import type { CoachLessonState, LessonStepResult } from '../lib/coachLesson/types';

const MODE_LABEL: Record<OneOffMode, string> = {
  technique: '특정 기술 + 실시간 검색',
  technique_goal: '특정 기술 + 실시간 검색',
  topic: '실시간 검색 기반 수업',
};

const EXAMPLES = ['오늘 Jab을 배우고 싶어', '오늘 복싱 거리 조절을 배우고 싶어', '오늘 키 큰 상대를 상대하는 법을 배우고 싶어', '오늘 잽으로 거리를 조절하는 법을 배우고 싶어'];

let msgSeq = 0;
function toMessages(result: LessonStepResult): CoachMessage[] {
  const at = new Date().toISOString();
  return actionsToMessages(result.actions).map((m) => ({ ...m, id: `m${++msgSeq}`, at }));
}

/**
 * 「수업하고 싶은 거 입력하기」 — type what you want to learn today; the coach
 * gathers material (MARTIALDEX DB for a named technique, live web search
 * otherwise — oneOff.ts) and teaches ONE lesson now. No curriculum is
 * created; finishing the lesson only writes a training-history entry (and
 * the technique's learning record when a technique was taught).
 */
export default function OneOffCoachLesson() {
  const [request, setRequest] = useState('');
  const [art, setArt] = useState('');
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lesson, setLesson] = useState<OneOffLesson | null>(null);
  const [state, setState] = useState<CoachLessonState | null>(null);
  const [directive, setDirective] = useState<LessonStepResult['directive']>('teach');
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const startedAt = useRef<number>(0);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [messages.length]);

  function apply(result: LessonStepResult, userText?: string) {
    setState(result.state);
    setDirective(result.directive);
    setMessages((prev) => [
      ...prev,
      ...(userText ? [{ id: `m${++msgSeq}`, at: new Date().toISOString(), role: 'user' as const, text: userText }] : []),
      ...toMessages(result),
    ]);
  }

  async function build() {
    setBuilding(true);
    setError(null);
    const r = await buildOneOffLesson(request, art || null);
    setBuilding(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setLesson(r.lesson);
    setMessages([]);
    setRecorded(false);
    startedAt.current = Date.now();
    apply(startOneOffLesson(r.lesson));
  }

  async function send(text: string) {
    if (!lesson || !state || !text.trim() || thinking) return;
    setInput('');
    setThinking(true);
    try {
      apply(await respondOneOff(lesson, state, text.trim(), messages), text.trim());
    } finally {
      setThinking(false);
    }
  }

  const complete = state?.currentStage === 'COMPLETE';

  // Finishing writes today's training record once (never a curriculum).
  useEffect(() => {
    if (!complete || !lesson || !state || recorded) return;
    setRecorded(true);
    if (lesson.techniqueId) saveLearningRecord(toLearningRecord(state, lesson.context));
    recordTrainingSession({
      curriculumId: null,
      dayNumber: null,
      techniqueIds: lesson.techniqueId ? [lesson.techniqueId] : lesson.linkedLearned.map((l) => l.techniqueId),
      completed: true,
      estimatedMinutes: 20,
      actualMinutes: Math.max(1, Math.round((Date.now() - startedAt.current) / 60000)),
      notes: `AI 코치 1회 수업 · ${lesson.title}`,
      source: 'coach_today',
      aiCoach: { location: null, mode: 'text' },
    });
  }, [complete, lesson, state, recorded]);

  const technique = lesson?.techniqueId ? resolveTechnique(lesson.techniqueId) : undefined;

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/coach">AI 코치</Link>
          <span>/</span>
          <span>오늘의 수업</span>
        </div>
        <div className="section-title">
          <h2>✍️ 수업하고 싶은 거 입력하기</h2>
        </div>

        {!lesson && (
          <div className="card info-card" data-testid="oneoff-setup">
            <p style={{ marginTop: 0 }}>오늘 배우고 싶은 것을 말해 주세요. AI 코치가 실시간 검색으로 자료를 찾아 오늘 하루 수업을 만듭니다. (커리큘럼은 만들지 않습니다.)</p>
            <AutoGrowTextarea className="select" data-testid="oneoff-request" minRows={2} value={request} placeholder="예: 오늘 복싱 거리 조절을 배우고 싶어" onChange={(e) => setRequest(e.target.value)} disabled={building} />
            <div className="chip-row" style={{ marginTop: 6 }}>
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="chip" onClick={() => setRequest(ex)} disabled={building}>
                  {ex}
                </button>
              ))}
            </div>
            <label className="field-label" style={{ display: 'block', marginTop: 8 }}>
              무술 (선택)
              <select className="select" value={art} onChange={(e) => setArt(e.target.value)} disabled={building} style={{ marginLeft: 8 }} data-testid="oneoff-art">
                <option value="">입력에서 자동 판단</option>
                {martialArtSummaries.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nameKo}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions modal-actions--start">
              <button className="btn btn-primary" data-testid="oneoff-build" onClick={() => void build()} disabled={building || !request.trim()}>
                {building ? '자료를 찾아 오늘 수업을 만드는 중…' : '오늘 수업 만들기'}
              </button>
            </div>
            {error && (
              <div className="ai-error" role="alert" data-testid="oneoff-error">
                {error}
              </div>
            )}
          </div>
        )}

        {lesson && state && (
          <>
            <div className="card info-card" data-testid="oneoff-lesson" data-mode={lesson.mode} data-web-used={String(lesson.webSearch.used)}>
              <h3 style={{ marginTop: 0 }}>{lesson.title}</h3>
              <div className="chip-row">
                <span className="chip active" data-testid="oneoff-mode">
                  {MODE_LABEL[lesson.mode]}
                </span>
                {lesson.webSearch.called && <span className="chip">웹 자료 {lesson.sources.length}개</span>}
                {technique && (
                  <Link className="chip" to={`/arts/${technique.martialArt}/techniques/${technique.id}`}>
                    {technique.koreanName || technique.name} 상세
                  </Link>
                )}
              </div>
              {lesson.webSearch.note && <p className="technique-row__sub">{lesson.webSearch.note}</p>}
              <ol className="oneoff-outline" data-testid="oneoff-outline">
                {lesson.context.concepts.map((c) => (
                  <li key={c.id} className={state.completedConcepts.includes(c.id) ? 'done' : ''}>
                    {c.label}
                  </li>
                ))}
                {lesson.context.scenarios.length > 0 && <li>상황 판단</li>}
                <li>실습 · 복습</li>
              </ol>
              {lesson.sources.length > 0 && (
                <details>
                  <summary>참고한 자료 {lesson.sources.length}개</summary>
                  <ul data-testid="oneoff-sources">
                    {lesson.sources.map((s) => (
                      <li key={s.id}>
                        [{s.id}] <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> <span className="technique-row__sub">({s.domain})</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            <div className="card info-card oneoff-chat" data-testid="oneoff-chat">
              {messages.map((m) => (
                <div key={m.id} className={`oneoff-msg oneoff-msg--${m.role}`} data-role={m.role}>
                  {m.text}
                </div>
              ))}
              {thinking && <div className="oneoff-msg oneoff-msg--coach">…</div>}
              <div ref={bottom} />

              {!complete && directive === 'video' && (
                <div className="modal-actions modal-actions--start">
                  {technique && (
                    <Link className="btn btn-secondary" to={`/arts/${technique.martialArt}/techniques/${technique.id}`} target="_blank">
                      기술 영상 보기
                    </Link>
                  )}
                  <button className="btn btn-primary" data-testid="oneoff-video-done" onClick={() => apply(oneOffEvent(lesson, state, { type: 'VIDEO_DONE' }))}>
                    {lesson.sources.length ? '자료 확인했어요' : '다음으로'}
                  </button>
                </div>
              )}
              {!complete && directive === 'ready' && (
                <>
                  {lesson.practice && <p className="technique-row__sub" data-testid="oneoff-practice">실습: {lesson.practice}</p>}
                  <div className="modal-actions modal-actions--start">
                    <button className="btn btn-primary" data-testid="oneoff-practice-done" onClick={() => apply(oneOffEvent(lesson, state, { type: 'PRACTICE_DONE', completed: true }))}>
                      연습 완료
                    </button>
                    <button className="btn btn-ghost" onClick={() => apply(oneOffEvent(lesson, state, { type: 'PRACTICE_DONE', completed: false }))}>
                      못 했어요
                    </button>
                  </div>
                </>
              )}
              {!complete && directive !== 'video' && directive !== 'ready' && (
                <form
                  className="oneoff-input"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send(input);
                  }}
                >
                  <input className="select" data-testid="oneoff-answer" value={input} onChange={(e) => setInput(e.target.value)} placeholder="답하거나 질문하세요 (예: 이해했어 / 모르겠어 / 왜 그래?)" disabled={thinking} />
                  <button className="btn btn-primary" type="submit" disabled={thinking || !input.trim()}>
                    보내기
                  </button>
                </form>
              )}
              {complete && (
                <div data-testid="oneoff-complete">
                  <p>오늘 수업을 마쳤습니다. 훈련 기록에 저장했어요.</p>
                  <div className="modal-actions modal-actions--start">
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setLesson(null);
                        setState(null);
                        setMessages([]);
                      }}
                    >
                      다른 수업 하기
                    </button>
                    <Link to="/training-analytics/history" className="btn btn-ghost">
                      훈련 기록 보기
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
