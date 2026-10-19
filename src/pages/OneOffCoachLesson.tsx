import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import BackButton from '../components/BackButton';
import AutoGrowTextarea from '../components/AutoGrowTextarea';
import CoachVoiceBar from '../components/coach/CoachVoiceBar';
import LessonVideoPanel from '../components/coach/LessonVideoPanel';
import WorkoutPanel from '../components/coach/WorkoutPanel';
import PersonalCoachPanel from '../components/coach/PersonalCoachPanel';
import { getMartialArt, martialArtSummaries } from '../lib/loadData';
import { resolveTechnique } from '../lib/userTechniques/service';
import { recordTrainingSession } from '../lib/trainingHistory/service';
import { actionsToMessages } from '../lib/coachLesson/service';
import { saveLearningRecord } from '../lib/coachLesson/records';
import { questionAnswerPairs, saveLessonLog, techniqueSummary } from '../lib/coachLesson/lessonLog';
import { toLearningRecord } from '../lib/coachLesson/engine';
import { isReadyIntent } from '../lib/coachLesson/intent';
import { buildLocalOneOffLesson, buildOneOffLesson, oneOffEvent, respondOneOff, startOneOffLesson, type OneOffMode } from '../lib/coachLesson/oneOff';
import CoachPicker from '../components/coach/CoachPicker';
import LocalModelWaitNotice from '../components/coach/LocalModelWaitNotice';
import { coachBackend } from '../lib/coachProvider/backend';
import { rememberedCoach } from '../lib/coachProvider/preference';
import { COACH_LABEL, coachKindOf, type CoachKind } from '../lib/coachProvider/types';
import { getTechniqueVideos } from '../lib/techniqueVideo/service';
import { loadActiveOneOffSession, saveOneOffSession, type OneOffSession, type PlanDraft } from '../lib/coachLesson/oneOffSession';
import { describePlan, draftFromSpec, getWorkoutSettings, hasWorkoutSpec, parseWorkoutSpec, planErrors, saveWorkoutSettings, type WorkoutSettings, type WorkoutSpec } from '../lib/coachLesson/workoutPlan';
import { stopWorkout, workoutResult, type TimerEvent, type WorkoutRun } from '../lib/coachLesson/workoutTimer';
import { useWorkoutTimer } from '../lib/coachLesson/useWorkoutTimer';
import { findLessonVideos } from '../lib/coachLesson/lessonVideos';
import { getPersonalCoachRecommendation, type PersonalCoachResult } from '../lib/personalCoach/service';
import { isSpeaking, speak, stopSpeaking } from '../lib/voice/tts';
import type { CoachMessage } from '../lib/aiCoachDay/types';
import type { LessonStepResult } from '../lib/coachLesson/types';
import { oneOffPractice } from '../lib/coachLesson/oneOffMitt';
import MittRunner, { type MittRunResult } from '../components/visualMitt/MittRunner';
import { stepsForIds, type MittCombo } from '../lib/visualMitt/combos';

const MODE_LABEL: Record<OneOffMode, string> = {
  technique: '특정 기술 + 실시간 검색',
  technique_goal: '특정 기술 + 실시간 검색',
  topic: '실시간 검색 기반 수업',
};

const EXAMPLES = ['오늘 Jab을 배우고 싶어', '오늘 잽과 크로스 연결을 연습하고 싶어', '오늘 복싱 거리 조절을 배우고 싶어', '오늘 키 큰 상대를 상대하는 법을 배우고 싶어'];
const ANALYSIS_DEFAULT = '내 훈련 기록을 보고 부족한 부분과 다음 훈련을 추천해줘.';
/** Only a message that talks about time/sets is treated as a plan change. */
const PLAN_WORDS = /(분|초|세트|라운드|휴식|쉬|rest|set|round|minute|second)/i;

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
function coachLines(result: LessonStepResult): CoachMessage[] {
  const at = new Date().toISOString();
  return actionsToMessages(result.actions).map((m) => ({ ...m, id: newId(), at }));
}
const msg = (role: CoachMessage['role'], text: string, kind?: CoachMessage['kind']): CoachMessage => ({ id: newId(), role, text, kind, at: new Date().toISOString() });

function specToDraft(spec: WorkoutSpec, source: PlanDraft['source'], settings: WorkoutSettings): PlanDraft {
  const d = draftFromSpec(spec, settings.lastPlan);
  return { ...d, source, evidence: spec.evidence };
}
function draftComplete(d: PlanDraft | null): d is PlanDraft & { exerciseDurationSeconds: number; sets: number; restDurationSeconds: number } {
  return !!d && d.exerciseDurationSeconds !== null && d.sets !== null && d.restDurationSeconds !== null && planErrors(d as never).length === 0;
}

/**
 * AI 코치 — 「수업하고 싶은 거 입력하기」. One screen for the whole lesson:
 * the request (or an analysis of the student's own records, formerly AI
 * Personal Coach), a back-and-forth lesson by text or voice, the lesson's
 * real videos, the practice plan turned into a set/rest timer with spoken
 * cues, and the result saved to the training record. No curriculum is
 * created here.
 */
export default function OneOffCoachLesson() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [session, setSession] = useState<OneOffSession | null>(loadActiveOneOffSession);
  // ?q=…&art=… — handed over from elsewhere (e.g. 숏폼 "영상에 나온 내용 배우기"): prefilled, never auto-sent.
  const [request, setRequest] = useState(() => params.get('q') ?? '');
  const [art, setArt] = useState(() => params.get('art') ?? '');
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PersonalCoachResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [settings, setSettings] = useState<WorkoutSettings>(getWorkoutSettings);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [videoProgress, setVideoProgress] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  // 코치 선택: the request waiting for a coach, an explicit Gemini offer after a 자체 코치 refusal, and mid-lesson switching.
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [offerGemini, setOfferGemini] = useState<string | null>(null);
  /** 자체 AI 코치: techniques the request may mean — the student picks one (never chosen automatically). */
  const [choices, setChoices] = useState<{ text: string; candidates: { techniqueId: string; name: string; martialArt: string }[] } | null>(null);
  const [switchTo, setSwitchTo] = useState<'pick' | CoachKind | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const spoken = useRef(new Set<string>(session?.messages.map((m) => m.id) ?? []));
  const recording = useRef(false);
  const heldSpeech = useRef<string[]>([]);
  const videoSearchFor = useRef<string | null>(null);

  useEffect(() => saveOneOffSession(session), [session]);
  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [session?.messages.length]);

  const update = useCallback((fn: (s: OneOffSession) => OneOffSession) => setSession((s) => (s ? fn(s) : s)), []);
  const addMessages = useCallback((ms: CoachMessage[]) => update((s) => ({ ...s, messages: [...s.messages, ...ms] })), [update]);
  // The lesson's mitt practice — techniques that came out of this lesson, combined (oneOffMitt.ts).
  const practice = useMemo(() => (session ? oneOffPractice(session.lesson) : null), [session?.lesson.id]);
  const mittCombo: MittCombo | null = practice?.mitt ? { id: `oneoff-mitt`, name: practice.mitt.name, source: 'single', sourceLabel: '오늘 수업에서 나온 기술', steps: stepsForIds(practice.mitt.techniqueIds), skipped: [], warnings: [] } : null;

  // ---- voice output: every NEW coach line is spoken once (never while the student is talking)
  useEffect(() => {
    if (!session) return;
    for (const m of session.messages) {
      if (spoken.current.has(m.id)) continue;
      spoken.current.add(m.id);
      if (m.role !== 'coach' || !settings.voice) continue;
      if (recording.current) heldSpeech.current.push(m.text);
      else void speak(m.text);
    }
  }, [session?.messages.length, settings.voice]);

  function onRecordingChange(on: boolean) {
    recording.current = on;
    if (!on && settings.voice) for (const t of heldSpeech.current.splice(0)) void speak(t);
  }

  // ---- lesson flow
  function apply(result: LessonStepResult, userText?: string) {
    update((s) => ({ ...s, state: result.state, directive: result.directive, messages: [...s.messages, ...(userText ? [msg('user', userText)] : []), ...coachLines(result)] }));
  }

  /** "오늘 수업 만들기" → the coach is chosen first (unless the device remembers one), then the lesson is built by THAT coach. */
  async function build(text = request, coachKind: CoachKind | null = rememberedCoach(), techniqueId: string | null = null) {
    if (!text.trim()) return;
    if (!coachKind) {
      setPickFor(text);
      return;
    }
    setPickFor(null);
    setOfferGemini(null);
    setChoices(null);
    setBuilding(true);
    setError(null);
    // 자체 AI 코치: technique data only (no web search, no Gemini); Gemini 코치: the existing builder.
    const r = coachKind === 'martialdex' ? buildLocalOneOffLesson(text, art || null, { techniqueId }) : await buildOneOffLesson(text, art || null);
    setBuilding(false);
    if (!r.ok) {
      setError(r.message);
      // Never switched automatically — the student may choose the Gemini coach explicitly.
      if (r.code === 'NOT_IN_DB') setOfferGemini(text);
      if ((r.code === 'NOT_IN_DB' || r.code === 'CHOOSE_TECHNIQUE') && coachKind === 'martialdex' && r.candidates?.length) setChoices({ text, candidates: r.candidates });
      return;
    }
    stopSpeaking();
    spoken.current.clear();
    videoSearchFor.current = null;
    timer.clear();
    setAnalysis(null);
    setPlanOpen(false);
    const first = startOneOffLesson(r.lesson);
    setSession({ v: 1, lesson: r.lesson, state: first.state, directive: first.directive, messages: coachLines(first), startedAt: Date.now(), recorded: false, plan: null, run: null, workoutResult: null, videos: null, coachKind });
  }

  async function analyze() {
    setAnalyzing(true);
    setError(null);
    try {
      setAnalysis(await getPersonalCoachRecommendation(request.trim() || ANALYSIS_DEFAULT));
    } catch {
      setError('기록 분석을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setAnalyzing(false);
    }
  }

  // ---- workout timer
  const finishPractice = useCallback(
    (run: WorkoutRun | null, completed: boolean) => {
      const result = run ? workoutResult(run, Date.now()) : null;
      if (run && result && result.workedSeconds > 0) {
        const s = saveWorkoutSettings({ lastPlan: { exerciseDurationSeconds: run.plan.exerciseDurationSeconds, sets: run.plan.sets, restDurationSeconds: run.plan.restDurationSeconds } });
        setSettings(s);
      }
      setSession((s) => {
        if (!s) return s;
        const base = { ...s, workoutResult: result ?? s.workoutResult, run };
        // The lesson moves on only when it was waiting for this practice.
        if (s.directive !== 'ready') return base;
        const next = oneOffEvent(s.lesson, s.state, { type: 'PRACTICE_DONE', completed });
        return { ...base, state: next.state, directive: next.directive, messages: [...base.messages, ...coachLines(next)] };
      });
    },
    []
  );

  const onTimerEvents = useCallback(
    (events: TimerEvent[], run: WorkoutRun) => {
      const lines: CoachMessage[] = [];
      for (const e of events) {
        const m = msg('coach', e.text, 'cue');
        spoken.current.add(m.id); // cues are voiced here, with their own overlap rule
        lines.push(m);
        if (!settings.voice || e.stale) continue;
        // Phase changes must match the clock → they cut in. Encouragement never talks over another line.
        if (e.kind === 'transition') void speak(e.text, { interrupt: true });
        else if (!isSpeaking()) void speak(e.text);
      }
      addMessages(lines);
      if (events.some((e) => e.type === 'done')) finishPractice(run, true);
    },
    [settings.voice, addMessages, finishPractice]
  );

  const timer = useWorkoutTimer({
    initial: session?.run ?? null,
    cheer: settings.cheer,
    onEvents: onTimerEvents,
    onChange: (run) => update((s) => ({ ...s, run })),
  });

  // A run that finished while the app was closed is settled once on return.
  useEffect(() => {
    if (session?.run?.phase === 'done' && session.directive === 'ready' && !session.workoutResult) finishPractice(session.run, !session.run.endedEarly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the lesson reaches practice, the coach's practice sentence becomes a plan draft.
  useEffect(() => {
    if (!session || session.directive !== 'ready' || session.plan || session.run) return;
    // A lesson whose techniques can be drawn ALWAYS practises on the Visualizing Mitt —
    // posture briefing first; the timer plan only follows when the practice continues after it.
    if (practice && !session.mitt) {
      update((s) => ({
        ...s,
        mitt: { phase: 'posture', startedAt: null, result: null },
        messages: [...s.messages, msg('coach', practice.intro, 'system'), ...practice.briefing.map((t) => msg('coach', t, 'explain'))],
      }));
      return;
    }
    if (practice && session.mitt?.phase !== 'done') return;
    const d = specToDraft(session.lesson.workout?.spec ?? parseWorkoutSpec(session.lesson.practice), 'lesson', settings);
    const note = draftComplete(d)
      ? `타이머 계획: ${describePlan(d)}. 계획을 확인하고 "타이머 시작"을 누르시거나 "시작"이라고 말씀해 주세요.`
      : d.exerciseDurationSeconds !== null || d.sets !== null
        ? '실습 계획에 정해지지 않은 값이 있습니다. 운동 시간·세트·휴식을 확인해서 정해 주세요.'
        : null;
    update((s) => ({ ...s, plan: d, messages: note ? [...s.messages, msg('coach', note, 'system')] : s.messages }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.directive]);

  function startTimer() {
    const s = session;
    if (!s || !draftComplete(s.plan)) return;
    const focus = s.lesson.context.concepts.filter((c) => c.importance === 'core').map((c) => c.label).slice(0, 3);
    stopSpeaking();
    timer.start({ title: s.lesson.title, focus, exerciseDurationSeconds: s.plan.exerciseDurationSeconds, sets: s.plan.sets, restDurationSeconds: s.plan.restDurationSeconds });
    update((x) => ({ ...x, workoutResult: null }));
  }

  function stopTimer() {
    const run = session?.run;
    if (!run) return;
    // Stopping emits no timer event — settle here with the real work time done.
    const stopped = stopWorkout(run, Date.now());
    timer.stop();
    finishPractice(stopped, false);
  }

  function setPlanFromText(text: string, source: PlanDraft['source']): boolean {
    const spec = parseWorkoutSpec(text);
    if (!hasWorkoutSpec(spec) || !session) return false;
    const prev = session.plan;
    const merged: PlanDraft = {
      exerciseDurationSeconds: spec.exerciseDurationSeconds ?? prev?.exerciseDurationSeconds ?? null,
      sets: spec.sets ?? prev?.sets ?? null,
      restDurationSeconds: spec.restDurationSeconds ?? prev?.restDurationSeconds ?? (spec.sets === 1 ? 0 : null),
      source,
      fromLastUsed: (prev?.fromLastUsed ?? []).filter((f) => (f === 'exercise' ? spec.exerciseDurationSeconds === null : f === 'sets' ? spec.sets === null : spec.restDurationSeconds === null)),
      evidence: spec.evidence,
    };
    if (session.run && session.run.phase !== 'done' && draftComplete(merged)) timer.changePlan({ ...session.run.plan, exerciseDurationSeconds: merged.exerciseDurationSeconds, sets: merged.sets, restDurationSeconds: merged.restDurationSeconds });
    update((s) => ({ ...s, plan: merged }));
    setPlanOpen(true);
    return true;
  }

  // ---- Visualizing Mitt practice (posture → mitt → [timer] → PRACTICE_DONE)
  function startMitt() {
    if (!practice?.mitt) return;
    stopSpeaking();
    addMessages([msg('coach', `좋습니다. Visualizing Mitt를 불러오겠습니다. ${practice.mitt.name}을(를) ${practice.mitt.repetitions}회 칩니다. ${practice.mitt.reason}`, 'system')]);
    update((s) => ({ ...s, mitt: { phase: 'running', startedAt: Date.now(), result: null } }));
  }

  function finishMitt(r: MittRunResult) {
    const seconds = Math.max(1, Math.round((Date.now() - (session?.mitt?.startedAt ?? Date.now())) / 1000));
    const line = r.finished ? `Visualizing Mitt로 ${practice?.mitt?.name ?? ''} ${r.completedReps}회 모두 쳤습니다.` : `Visualizing Mitt는 ${r.completedReps}회까지 쳤습니다.`;
    update((s) => ({ ...s, mitt: { phase: 'done', startedAt: s.mitt?.startedAt ?? null, result: { ...r, seconds } }, messages: [...s.messages, msg('coach', line, 'system')] }));
    if (practice?.after) {
      // takedown → submission: the finish is repeated on the lesson timer
      if (practice.timerText) addMessages([msg('coach', practice.timerText, 'system')]);
      update((s) => ({ ...s, plan: specToDraft(parseWorkoutSpec(`${Math.round(practice.timerSeconds / 60) || 1}분 1세트`), 'lesson', settings) }));
      return;
    }
    finishPractice(null, r.finished);
  }

  // ---- student input (typed or transcribed — same path)
  async function send(raw: string) {
    const text = raw.trim();
    const s = session;
    if (!s || !text || thinking) return;
    setInput('');
    if (s.mitt?.phase === 'posture' && isReadyIntent(text)) {
      addMessages([msg('user', text)]);
      startMitt();
      return;
    }
    const timerVisible = s.directive === 'ready' || planOpen || (!!s.run && s.run.phase !== 'done');
    if (timerVisible && !s.run && isReadyIntent(text) && draftComplete(s.plan)) {
      addMessages([msg('user', text)]);
      startTimer();
      return;
    }
    if (timerVisible && PLAN_WORDS.test(text) && !s.state.pending && setPlanFromText(text, 'student')) {
      const p = parseWorkoutSpec(text);
      addMessages([msg('user', text), msg('coach', `운동 계획을 바꿨습니다${p.evidence.length ? `: ${p.evidence.join(', ')}` : ''}. ${s.run && s.run.phase !== 'done' ? '세트 수는 바로, 시간은 다음 단계부터 적용됩니다.' : '확인하고 타이머를 시작해 주세요.'}`, 'system')]);
      return;
    }
    let kind = coachKindOf(s);
    if (kind === 'unknown') {
      // A lesson saved before the coach choice: never assumed. The student's standing choice
      // ("다음부터 묻지 않기") applies; without one, the student picks who continues it.
      const remembered = rememberedCoach();
      if (!remembered) {
        setSwitchTo('pick');
        return;
      }
      kind = remembered;
      update((x) => ({
        ...x,
        coachKind: remembered,
        coachSwitches: [...(x.coachSwitches ?? []), { from: 'unknown', to: remembered, at: new Date().toISOString() }],
        messages: [...x.messages, msg('coach', `이 수업은 코치 정보가 없던 이전 수업입니다. 기억된 선택에 따라 지금부터 ${COACH_LABEL[remembered]}가 이어서 진행합니다.`, 'system')],
      }));
    }
    setThinking(true);
    try {
      apply(await respondOneOff(s.lesson, s.state, text, s.messages, coachBackend(kind)), text);
    } finally {
      setThinking(false);
    }
  }

  // ---- videos: searched in the background as soon as the lesson exists
  const runVideoSearch = useCallback((s: OneOffSession) => {
    const lesson = s.lesson;
    if (videoSearchFor.current === lesson.id) return;
    videoSearchFor.current = lesson.id;
    setVideoProgress(null);
    const technique = lesson.techniqueId ? resolveTechnique(lesson.techniqueId) ?? null : null;
    if (coachKindOf(s) === 'martialdex') {
      // Found videos are checked by Gemini — the 자체 AI 코치 shows MARTIALDEX's registered videos only.
      const saved = technique ? getTechniqueVideos(technique) : [];
      const videos = saved.map((v) => ({ videoId: v.videoId, title: v.title, channel: v.channel, thumbnailUrl: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`, url: `https://www.youtube.com/watch?v=${v.videoId}`, source: 'saved' as const }));
      setSession((cur) => (cur && cur.lesson.id === lesson.id ? { ...cur, videos: { status: videos.length ? 'found' : 'none', videos, queries: [], checked: 0, message: videos.length ? null : 'MARTIALDEX에 등록된 영상이 없습니다. 자체 AI 코치는 Gemini로 영상 내용을 확인하는 검색을 하지 않습니다.' } } : cur));
      return;
    }
    void findLessonVideos(
      {
        technique,
        topic: lesson.title,
        terms: lesson.videoTerms ?? [lesson.title],
        martialArt: lesson.martialArt ? getMartialArt(lesson.martialArt)?.nameEn ?? lesson.martialArt : null,
        queries: lesson.videoQueries ?? [lesson.title],
      },
      { onProgress: setVideoProgress }
    ).then((videos) => setSession((cur) => (cur && cur.lesson.id === lesson.id ? { ...cur, videos } : cur)));
  }, []);
  useEffect(() => {
    if (session && !session.videos) runVideoSearch(session);
  }, [session?.lesson.id, session?.videos, runVideoSearch]);

  // ---- finishing: one training-history entry (never a curriculum)
  const complete = session?.state.currentStage === 'COMPLETE';
  useEffect(() => {
    if (!complete || !session || session.recorded) return;
    const { lesson, state, workoutResult: wr } = session;
    if (lesson.techniqueId) saveLearningRecord(toLearningRecord(state, lesson.context));
    const minutes = wr && wr.workedSeconds > 0 ? Math.max(1, Math.round(wr.workedSeconds / 60)) : Math.max(1, Math.round((Date.now() - session.startedAt) / 60000));
    const entry = recordTrainingSession({
      curriculumId: null,
      dayNumber: null,
      techniqueIds: [...new Set([...(lesson.techniqueId ? [lesson.techniqueId] : lesson.linkedLearned.map((l) => l.techniqueId)), ...(session.mitt?.result ? practice?.mitt?.techniqueIds ?? [] : [])])],
      completed: wr ? !wr.endedEarly : true,
      estimatedMinutes: 20,
      actualMinutes: minutes,
      notes: `AI 코치 1회 수업 · ${lesson.title}${session.mitt?.result && practice?.mitt ? ` · Visualizing Mitt ${practice.mitt.name} ${session.mitt.result.completedReps}/${session.mitt.result.targetReps}회 (사용자 수행 기록)` : ''}${wr && session.run ? ` · 실습 ${describePlan(session.run.plan)} 중 ${wr.completedSets}/${wr.plannedSets}세트 (실제 ${Math.round(wr.workedSeconds)}초)` : ''}`,
      source: 'coach_today',
      // 대화 방식 = how the student actually talked (mic used at least once → voice), not the playback setting.
      aiCoach: { location: null, mode: session.usedMic ? 'voice' : 'text' },
    });
    // 수업 기록 (전 수업내용 복습용) — once (the "recorded" flag guards re-renders and reloads).
    const finished = new Date().toISOString();
    saveLessonLog({
      id: `lesson_${lesson.id}`,
      kind: 'one_off',
      title: lesson.title,
      date: finished.slice(0, 10),
      startedAt: new Date(session.startedAt).toISOString(),
      finishedAt: finished,
      curriculumId: null,
      day: null,
      historyEntryId: entry.id,
      techniques: [techniqueSummary(lesson.techniqueId, lesson.title, state, lesson.context)],
      qa: questionAnswerPairs(session.messages),
      recap: null,
      updatedAt: finished,
      coachKind: coachKindOf(session),
    });
    update((s) => ({ ...s, recorded: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete]);

  const lesson = session?.lesson;
  const state = session?.state;
  const technique = lesson?.techniqueId ? resolveTechnique(lesson.techniqueId) : undefined;
  const hints = useMemo(() => (lesson ? [lesson.title, ...(technique ? [technique.name, technique.koreanName ?? ''] : []), ...lesson.context.concepts.map((c) => c.label)].filter(Boolean).slice(0, 10) : []), [lesson?.id]);
  const directive = session?.directive;
  const run = session?.run ?? null;
  const mittActive = !!session?.mitt && session.mitt.phase !== 'done' && directive === 'ready';
  const showWorkout = !!session && !complete && !mittActive && (directive === 'ready' || planOpen || !!run) && !(practice && directive === 'ready' && !session.mitt);
  const pending = state?.pending ?? null;

  function reset() {
    stopSpeaking();
    timer.clear();
    setSession(null);
    setPlanOpen(false);
  }

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

        {!session && (
          <>
            {params.get('mode') === 'analysis' && (
              <div className="card info-card" data-testid="personal-coach-hint">
                <strong>내 기록 분석·추천</strong> — 아래 입력창에 궁금한 점(예: "풋워크가 부족한 것 같아")을 적거나 비워 둔 채 <strong>📊 내 기록으로 분석·추천 받기</strong>를 눌러 주세요. 저장된 훈련 기록을 근거로 분석합니다.
              </div>
            )}
            {params.get('from') === 'personal-coach' && (
              <div className="card info-card" data-testid="personal-coach-moved">
                AI Personal Coach는 이제 AI 코치 안에 있습니다. 아래에서 <strong>내 기록으로 분석·추천 받기</strong>를 누르면 같은 분석을 받을 수 있고, 추천으로 바로 수업을 시작할 수 있습니다.
              </div>
            )}
            <div className="card info-card" data-testid="oneoff-setup">
              <p style={{ marginTop: 0 }}>오늘 배우고 싶은 것이나 부족하다고 느끼는 부분을 말해 주세요. AI 코치가 실시간 검색 자료와 내 훈련 기록을 바탕으로 오늘 하루 수업을 만들고, 말이나 글로 대화하며 영상·타이머와 함께 진행합니다. (커리큘럼은 만들지 않습니다.)</p>
              <AutoGrowTextarea className="select" data-testid="oneoff-request" minRows={2} value={request} placeholder="예: 오늘 잽과 크로스 연결을 연습하고 싶어" onChange={(e) => setRequest(e.target.value)} disabled={building || analyzing} />
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
              {pickFor !== null && (
                <div className="card info-card" style={{ marginTop: 8 }}>
                  <CoachPicker confirmLabel="이 코치로 오늘 수업 만들기" onPick={(k) => void build(pickFor, k)} />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPickFor(null)} data-testid="coach-pick-cancel">
                    취소
                  </button>
                </div>
              )}
              <div className="modal-actions modal-actions--start">
                <button className="btn btn-primary" data-testid="oneoff-build" onClick={() => void build()} disabled={building || analyzing || !request.trim() || pickFor !== null}>
                  {building ? '자료를 찾아 오늘 수업을 만드는 중…' : '오늘 수업 만들기'}
                </button>
                <button className="btn btn-secondary" data-testid="personal-coach-analyze" onClick={() => void analyze()} disabled={building || analyzing}>
                  {analyzing ? '내 기록을 분석하는 중…' : '📊 내 기록으로 분석·추천 받기'}
                </button>
              </div>
              {error && (
                <div className="ai-error" role="alert" data-testid="oneoff-error">
                  {error}
                </div>
              )}
              {choices && (
                <div className="modal-actions modal-actions--start" data-testid="oneoff-technique-choices" style={{ flexWrap: 'wrap' }}>
                  {choices.candidates.map((c) => (
                    <button
                      key={c.techniqueId}
                      type="button"
                      className="btn btn-secondary btn-sm"
                      data-testid="oneoff-technique-choice"
                      data-technique-id={c.techniqueId}
                      onClick={() => void build(choices.text, 'martialdex', c.techniqueId)}
                      disabled={building}
                    >
                      {c.name} · {getMartialArt(c.martialArt)?.nameKo ?? c.martialArt}
                    </button>
                  ))}
                </div>
              )}
              {offerGemini && (
                <div className="modal-actions modal-actions--start">
                  <button type="button" className="btn btn-secondary btn-sm" data-testid="oneoff-use-gemini" onClick={() => void build(offerGemini, 'gemini')} disabled={building}>
                    ✨ 이 요청은 Gemini AI 코치로 만들기 (웹 검색 사용)
                  </button>
                </div>
              )}
            </div>
            {analysis && (
              <PersonalCoachPanel
                result={analysis}
                onStartLesson={(req) => {
                  setRequest(req);
                  void build(req);
                }}
                onMakeCurriculum={() => navigate('/ai-curriculum', { state: { freeText: analysis.curriculumGoalText, martialArt: analysis.suggestedMartialArt ?? undefined } })}
                onClose={() => setAnalysis(null)}
              />
            )}
          </>
        )}

        {session && lesson && state && (
          <>
            <div className="card info-card" data-testid="oneoff-lesson" data-mode={lesson.mode} data-web-used={String(lesson.webSearch.used)}>
              <h3 style={{ marginTop: 0 }}>{lesson.title}</h3>
              <div className="chip-row">
                <span className="chip active" data-testid="oneoff-mode">
                  {MODE_LABEL[lesson.mode]}
                </span>
                <span className="chip" data-testid="coach-kind" data-coach={coachKindOf(session)}>
                  {coachKindOf(session) === 'martialdex' ? '🥋' : coachKindOf(session) === 'gemini' ? '✨' : '❔'} {COACH_LABEL[coachKindOf(session)]}
                </span>
                {!complete && !switchTo && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSwitchTo('pick')} data-testid="coach-switch-open">
                    코치 바꾸기
                  </button>
                )}
                {lesson.webSearch.called && <span className="chip">웹 자료 {lesson.sources.length}개</span>}
                {(lesson.personalization ?? []).length > 0 && (
                  <span className="chip" data-testid="oneoff-personalized" title={lesson.personalization.join(', ')}>
                    내 기록 반영: {lesson.personalization.join(' · ')}
                  </span>
                )}
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

            {switchTo === 'pick' && (
              <div className="card info-card" data-testid="coach-switch">
                <CoachPicker
                  showRemember={false}
                  confirmLabel="다음"
                  note={
                    coachKindOf(session) === 'unknown'
                      ? '이 수업은 코치 정보가 없던 이전 수업입니다. 이어서 진행할 코치를 골라 주세요.'
                      : `지금 수업은 ${COACH_LABEL[coachKindOf(session)]}로 진행 중입니다. 바꿀 코치를 고르면 지금 수업을 어떻게 할지 한 번 더 확인합니다.`
                  }
                  onPick={(k) => setSwitchTo(k === coachKindOf(session) ? null : k)}
                />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSwitchTo(null)} data-testid="coach-switch-cancel">
                  취소
                </button>
              </div>
            )}
            {switchTo && switchTo !== 'pick' && (
              <div className="card info-card" data-testid="coach-switch-confirm" data-to={switchTo}>
                <p style={{ marginTop: 0 }}>
                  <strong>{COACH_LABEL[switchTo]}</strong>(으)로 {coachKindOf(session) === 'unknown' ? '이어서 진행합니다' : '바꿉니다'}. 지금 수업은 어떻게 할까요?
                </p>
                <div className="modal-actions modal-actions--start">
                  <button
                    className="btn btn-primary"
                    data-testid="coach-switch-keep"
                    onClick={() => {
                      const from = coachKindOf(session);
                      const to = switchTo;
                      update((x) => ({
                        ...x,
                        coachKind: to,
                        coachSwitches: [...(x.coachSwitches ?? []), { from, to, at: new Date().toISOString() }],
                        messages: [...x.messages, msg('coach', `코치를 ${COACH_LABEL[from]}에서 ${COACH_LABEL[to]}(으)로 바꿨습니다. 지금까지의 수업 내용과 대화는 그대로 두고, 다음 대화부터 ${COACH_LABEL[to]}가 답변하고 채점합니다.${to === 'martialdex' && lesson.sources.length ? ' 이 수업 자료 중 웹 검색 자료는 자체 코치가 답변 근거로 쓰지 않습니다.' : ''}`, 'system')],
                      }));
                      setSwitchTo(null);
                    }}
                  >
                    진행 유지하고 코치만 바꾸기
                  </button>
                  <button
                    className="btn btn-secondary"
                    data-testid="coach-switch-restart"
                    onClick={() => {
                      const req = lesson.request;
                      const to = switchTo;
                      const techniqueId = lesson.techniqueId ?? null;
                      setSwitchTo(null);
                      reset();
                      setRequest(req);
                      // Same technique the lesson was about (the 자체 코치 does not re-guess it from the request).
                      void build(req, to, to === 'martialdex' ? techniqueId : null);
                    }}
                  >
                    같은 요청으로 새 코치와 처음부터
                  </button>
                  <button className="btn btn-ghost" onClick={() => setSwitchTo(null)}>
                    취소
                  </button>
                </div>
                <p className="video-status-message" style={{ marginBottom: 0 }}>
                  처음부터 다시 하면 지금 진행 중인 수업은 기록되지 않고 사라집니다.
                </p>
              </div>
            )}

            <CoachVoiceBar
              allowFallback={coachKindOf(session) !== 'martialdex'}
              voiceOn={settings.voice}
              onToggleVoice={(on) => {
                if (!on) stopSpeaking();
                setSettings(saveWorkoutSettings({ voice: on }));
              }}
              onTranscript={(t) => {
                update((s) => ({ ...s, usedMic: true }));
                void send(t);
              }}
              onDraft={(t) => {
                update((s) => ({ ...s, usedMic: true }));
                setInput((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t));
              }}
              hints={hints}
              disabled={thinking || complete}
              onRecordingChange={onRecordingChange}
            />

            <div className="card info-card oneoff-chat" data-testid="oneoff-chat" data-directive={directive} data-stage={state.currentStage}>
              {session.messages.map((m) => {
                const spec = m.role === 'coach' && m.kind !== 'cue' && m.kind !== 'system' ? parseWorkoutSpec(m.text) : null;
                const offer = !!spec && spec.exerciseDurationSeconds !== null && !run;
                return (
                  <div key={m.id} className={`oneoff-msg oneoff-msg--${m.role}${m.kind === 'cue' ? ' oneoff-msg--cue' : ''}`} data-role={m.role} data-kind={m.kind ?? ''}>
                    {m.text}
                    {offer && (
                      <button type="button" className="btn btn-ghost btn-sm oneoff-msg__action" onClick={() => setPlanFromText(m.text, 'coach')} data-testid="oneoff-plan-from-message">
                        ⏱ 이 계획으로 타이머 설정
                      </button>
                    )}
                  </div>
                );
              })}
              {thinking && <div className="oneoff-msg oneoff-msg--coach">…</div>}
              {thinking && coachKindOf(session) === 'martialdex' && <LocalModelWaitNotice />}
              <div ref={bottom} />

              {!complete && pending && (
                <p className="coach-turn__label" data-testid="oneoff-awaiting" style={{ margin: '4px 0 0' }}>
                  🙋 답변 차례입니다 — 말하거나 아래에 적어 주세요.
                </p>
              )}
              {!complete && directive === 'video' && (
                <div className="modal-actions modal-actions--start">
                  <button className="btn btn-primary" data-testid="oneoff-video-done" onClick={() => apply(oneOffEvent(lesson, state, { type: 'VIDEO_DONE' }))}>
                    {session.videos?.videos.length ? '영상 확인했어요' : lesson.sources.length ? '자료 확인했어요' : '다음으로'}
                  </button>
                </div>
              )}
              {!complete && (
                <form
                  className="oneoff-input"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send(input);
                  }}
                >
                  <input className="select" data-testid="oneoff-answer" value={input} onChange={(e) => setInput(e.target.value)} placeholder={pending ? '답하거나 질문하세요 (예: 이해했어 / 모르겠어 / 왜 그래?)' : '코치에게 질문하거나 "3분씩 3세트"처럼 계획을 말해 보세요'} disabled={thinking} />
                  <button className="btn btn-primary" type="submit" disabled={thinking || !input.trim()}>
                    보내기
                  </button>
                </form>
              )}
            </div>

            {mittActive && practice && session.mitt?.phase === 'posture' && (
              <div className="card info-card" data-testid="oneoff-posture" data-mode={practice.mode}>
                <h3 style={{ margin: 0 }}>🧍 실습 전 자세 설명</h3>
                <p className="video-status-message" style={{ margin: '4px 0 6px' }}>{practice.intro}</p>
                <ol className="coach-class-steps">
                  {practice.briefing.slice(0, -1).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ol>
                <p className="video-status-message" style={{ margin: '6px 0 0' }} data-testid="oneoff-posture-mitt">
                  🥊 이어서 Visualizing Mitt: {practice.mitt?.name} · {practice.mitt?.repetitions}회
                </p>
                <div className="modal-actions modal-actions--start" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary" onClick={startMitt} data-testid="oneoff-posture-start">
                    자세 확인 — 실습 시작
                  </button>
                </div>
              </div>
            )}
            {mittActive && practice?.mitt && mittCombo && session.mitt?.phase === 'running' && (
              <div data-testid="oneoff-mitt" data-ids={practice.mitt.techniqueIds.join(',')}>
                <div className="card info-card" style={{ marginBottom: 8 }}>
                  <h3 style={{ margin: 0 }}>🥊 AI Visualizing Mitt · {practice.mitt.name}</h3>
                  <p className="video-status-message" style={{ margin: '4px 0 0' }}>
                    {practice.mitt.purpose} · {practice.mitt.reason}
                  </p>
                </div>
                <MittRunner key={practice.mitt.techniqueIds.join('+')} combo={mittCombo} repetitions={practice.mitt.repetitions} speed={practice.mitt.speed} speakCallouts={settings.voice} onDone={finishMitt} />
              </div>
            )}
            {showWorkout && session.plan && (
              <WorkoutPanel
                title={lesson.title}
                practice={lesson.practice}
                draft={session.plan}
                mismatch={!!lesson.workout?.mismatch}
                onDraft={(d) => update((s) => ({ ...s, plan: d }))}
                run={run}
                result={session.workoutResult}
                cheer={settings.cheer}
                onCheer={(c) => setSettings(saveWorkoutSettings({ cheer: c }))}
                onStart={startTimer}
                onPause={() => timer.pause()}
                onResume={() => timer.resume()}
                onStop={stopTimer}
                onManualDone={(done) => finishPractice(null, done)}
                manualAllowed={directive === 'ready' && !run}
              />
            )}
            {showWorkout && !session.plan && (
              <div className="card info-card">
                <button type="button" className="btn btn-secondary" onClick={() => update((s) => ({ ...s, plan: specToDraft(parseWorkoutSpec(''), 'user_edit', settings) }))} data-testid="workout-open">
                  ⏱ 타이머 계획 직접 정하기
                </button>
              </div>
            )}

            <LessonVideoPanel
              result={session.videos}
              progress={videoProgress}
              highlight={directive === 'video'}
              onRetry={() => {
                videoSearchFor.current = null;
                update((s) => ({ ...s, videos: null }));
              }}
            />

            {complete && (
              <div className="card info-card" data-testid="oneoff-complete">
                <p style={{ marginTop: 0 }}>
                  오늘 수업을 마쳤습니다. {session.recorded ? '훈련 기록에 저장했습니다.' : ''}
                  {session.workoutResult && ` 실습: ${session.workoutResult.completedSets}/${session.workoutResult.plannedSets}세트, 실제 ${Math.round(session.workoutResult.workedSeconds)}초.`}
                </p>
                <div className="modal-actions modal-actions--start">
                  <button className="btn btn-secondary" onClick={reset} data-testid="oneoff-reset">
                    다른 수업 하기
                  </button>
                  <Link to="/training-analytics/history" className="btn btn-ghost">
                    훈련 기록 보기
                  </Link>
                </div>
              </div>
            )}
            {!complete && (
              <p className="video-status-message">
                <button type="button" className="btn btn-ghost btn-sm" onClick={reset} data-testid="oneoff-abandon">
                  이 수업 그만하고 새로 만들기
                </button>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
