import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import BackButton from '../components/BackButton';
import { getCurriculum } from '../lib/curriculum/curriculumService';
import { buildDayContext } from '../lib/ai/context';
import { getTechniqueVideos } from '../lib/techniqueVideo/service';
import { isTtsSupported, speak, stopSpeaking } from '../lib/voice/tts';
import { isVoiceInputSupported } from '../lib/voice/stt';
import { useVoiceInput, VoiceInputPanel } from '../components/voice/useVoiceInput';
import { COACH_DAY_CONFIG, practiceSecondsFor } from '../lib/aiCoachDay/config';
import { practiceRemainingMs } from '../lib/aiCoachDay/cues';
import {
  appendMessages,
  clearCoachDayRun,
  COACH_DAY_EVENT,
  getCoachDayRun,
  pausePractice,
  resumePractice,
  startCoachDayRun,
  startPractice,
  stopPracticeEarly,
  tickPractice,
  updateCoachDayRun,
} from '../lib/aiCoachDay/sessionStore';
import {
  coachTechniquesForDay,
  displayName,
  finalizeCoachDay,
  isReadyIntent,
  coachPlaceContext,
  planItemFor,
  practiceFeedback,
  quizQuestionFor,
  reminderPointFor,
} from '../lib/aiCoachDay/service';
import { LOCATION_ICON, LOCATION_LABEL, locationIntro, parseLocation } from '../lib/aiCoachCurriculum/location';
import { ROLE_LABEL } from '../lib/aiCoachCurriculum/service';
import CoachLocationPicker from '../components/CoachLocationPicker';
import CoachPicker from '../components/coach/CoachPicker';
import LocalModelWaitNotice from '../components/coach/LocalModelWaitNotice';
import { coachBackend } from '../lib/coachProvider/backend';
import { rememberedCoach } from '../lib/coachProvider/preference';
import { COACH_LABEL, coachKindOf, isCoachKind, type CoachKind } from '../lib/coachProvider/types';
import TutorVoiceSettingsPanel from '../components/TutorVoiceSettingsPanel';
import { motionForTechnique } from '../lib/visualMitt/archetypes';
import type { CoachDayRun, CoachMode, CoachStep, LessonMittPlan } from '../lib/aiCoachDay/types';
import PostureSection from '../components/PostureSection';
import MicTestPanel, { LevelMeter, PHASE_LABEL } from '../components/MicTestPanel';
import SoloDrillRunner, { type SoloDrillResult } from '../components/soloDrill/SoloDrillRunner';
import { isMmaContext, isSubmissionGoal, planPractice, type PracticeSetup } from '../lib/aiCoachDay/practicePlan';
import ComboVideoPanel from '../components/visualMitt/ComboVideoPanel';
import MittRunner, { type MittRunResult } from '../components/visualMitt/MittRunner';
import { findTutorVideos, type TutorVideo } from '../lib/techniqueVideo/tutorVideoFinder';
import { findOtherPlatformVideos, PLATFORM_LABEL, type PlatformVideo } from '../lib/techniqueVideo/otherPlatformVideos';
import OtherPlatformVideos from '../components/coach/OtherPlatformVideos';
import { addTechniqueVideo } from '../lib/techniqueVideo/service';
import { isMittRequest, lessonPlan, type MittPlan } from '../lib/visualMitt/aiPlan';
import { planMittTraining } from '../lib/visualMitt/mittSourcing';
import { reviewConnections, saveMittCombo, stepsForIds, type MittCombo } from '../lib/visualMitt/combos';
import { withObject } from '../lib/aiCoachDay/politeSpeech';
import { resolveTechnique } from '../lib/userTechniques/service';
import type { CoachMessage } from '../lib/aiCoachDay/types';
import type { Technique } from '../types';
import { actionsToMessages, lessonContextFor, lessonEvent, respondToStudent, startLesson } from '../lib/coachLesson/service';
import { buildRecap, outcomeQuiz, recapFeedback, toLearningRecord, type RecapPlan } from '../lib/coachLesson/engine';
import { classifyIntent } from '../lib/coachLesson/intent';
import { saveLearningRecord } from '../lib/coachLesson/records';
import { questionAnswerPairs, saveLessonLog, techniqueSummary } from '../lib/coachLesson/lessonLog';
import { OPTION_LETTERS } from '../lib/coachLesson/text';
import type { ChoiceQuestion, CoachLessonState, ConceptStatus, LessonStepResult } from '../lib/coachLesson/types';

const READY_PROMPT = '준비가 되셨다면 "준비됐어" 또는 "시작"이라고 말씀하시거나 아래 버튼을 눌러 주세요. 실습 전에 자세부터 설명하겠습니다.';

const IFRAME_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

function formatMMSS(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// The posture guide is no longer read out as one long monologue: its steps,
// key points and mistakes are taught a piece at a time by the lesson engine
// (coachLesson/concepts.ts) and stay visible in the posture card.

const STATUS_ICON: Record<ConceptStatus, string> = { understood: '●', partial: '◐', weak: '△', unknown: '○' };
const STATUS_LABEL: Record<ConceptStatus, string> = { understood: '이해', partial: '부분 이해', weak: '복습 필요', unknown: '아직' };

/** 오늘의 복습 — the core points of every technique taught today. */
function recapPlanFor(run: CoachDayRun): RecapPlan | null {
  const items = run.techniqueIds
    .filter((id) => run.lessons?.[id])
    .map((id) => resolveTechnique(id))
    .filter((t): t is Technique => !!t)
    .map((t) => ({ name: displayName(t), concepts: lessonContextFor(t).concepts }));
  return buildRecap(items);
}

function planToLesson(plan: MittPlan, resume: LessonMittPlan['resume']): LessonMittPlan {
  return {
    techniqueIds: plan.combo.steps.map((s) => s.techniqueId),
    name: plan.name,
    type: plan.type,
    purpose: plan.purpose,
    repetitions: plan.repetitions,
    speed: plan.speed,
    reason: plan.reason,
    coachingNote: plan.coachingNote,
    stepNotes: plan.stepNotes,
    source: plan.source,
    resume,
  };
}

function useCoachRun(): CoachDayRun | null {
  const [run, setRun] = useState<CoachDayRun | null>(getCoachDayRun);
  useEffect(() => {
    const on = () => setRun(getCoachDayRun());
    window.addEventListener(COACH_DAY_EVENT, on);
    return () => window.removeEventListener(COACH_DAY_EVENT, on);
  }, []);
  return run;
}

export default function CurriculumCoachSession() {
  const { martialArtId = '', curriculumId = '', day: dayParam = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode: CoachMode = searchParams.get('mode') === 'voice' ? 'voice' : 'text';
  // 코치 선택 — chosen before the lesson starts (?coach=martialdex|gemini), or the
  // device's remembered choice when the user asked not to be asked again.
  const coachParam = searchParams.get('coach');
  const chosenCoach: CoachKind | null = isCoachKind(coachParam) ? coachParam : rememberedCoach();
  const [switchTo, setSwitchTo] = useState<'pick' | CoachKind | null>(null);
  const curriculum = getCurriculum(curriculumId);
  // Where the class happens: fixed by an AI 코치 수업 curriculum, otherwise
  // chosen right before the class (?place=home|gym&equip=a,b). With neither,
  // the place picker is shown before anything starts.
  const location = curriculum?.aiCoachMeta?.location ?? parseLocation(searchParams.get('place'));
  const equipmentKey = curriculum?.aiCoachMeta ? curriculum.aiCoachMeta.equipment.join(',') : (searchParams.get('equip') ?? '');
  const equipment = useMemo(() => equipmentKey.split(',').filter(Boolean), [equipmentKey]);
  const day = curriculum?.days.find((d) => d.day === Number(dayParam));
  const techniques = useMemo(() => (day ? coachTechniquesForDay(day) : []), [day]);
  const dayContext = useMemo(() => (curriculum && day ? buildDayContext(curriculum, day) : ''), [curriculum, day]);
  const run = useCoachRun();
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const handledSteps = useRef(new Set<string>());
  const spokenIds = useRef(new Set<string>());
  const chatRef = useRef<HTMLDivElement>(null);
  const [summary, setSummary] = useState<ReturnType<typeof finalizeCoachDay> | null>(null);
  const ttsAvailable = isTtsSupported();
  const recordingRef = useRef(false);
  const pendingSpeech = useRef<{ text: string; interrupt: boolean }[]>([]);
  const [otherVideos, setOtherVideos] = useState<{ techniqueId: string; videos: PlatformVideo[] } | null>(null);
  const [videoFind, setVideoFind] = useState<{ techniqueId: string; status: 'searching' | 'done'; progress: string; videos: TutorVideo[]; checked: number } | null>(null);
  const [savedVideoId, setSavedVideoId] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (!ttsAvailable) return;
    const id = window.setInterval(() => setSpeaking(window.speechSynthesis.speaking), 300);
    return () => window.clearInterval(id);
  }, [ttsAvailable]);

  // Start (or resume the same) session for this Day + mode.
  useEffect(() => {
    if (!curriculum || !day || techniques.length === 0 || !location || !chosenCoach) return;
    const existing = getCoachDayRun();
    const sameDay =
      existing && existing.curriculumId === curriculum.id && existing.day === day.day && existing.mode === mode && (existing.location ?? null) === location && !existing.finishedAt;
    // A run saved before the coach choice existed has no coach: it is resumed and the
    // user's explicit choice applies from here on (recorded) — never assumed to be Gemini.
    const legacy = sameDay && coachKindOf(existing) === 'unknown';
    const same = sameDay && (legacy || existing!.coachKind === chosenCoach);
    if (!same) {
      startCoachDayRun(curriculum.id, day.day, mode, techniques.map((t) => t.id), location, equipment, chosenCoach);
      handledSteps.current.clear();
      spokenIds.current.clear();
    } else {
      // Resuming: never re-speak what was already said.
      for (const m of existing!.messages) spokenIds.current.add(m.id);
      if (legacy) {
        updateCoachDayRun((r) => ({ ...r, coachKind: chosenCoach, coachSwitches: [...(r.coachSwitches ?? []), { from: 'unknown', to: chosenCoach, at: new Date().toISOString(), index: r.index }] }));
        appendMessages([{ role: 'coach', kind: 'system', text: `이 수업은 코치 정보가 없던 이전 세션입니다. 지금부터는 ${COACH_LABEL[chosenCoach]}가 이어서 진행합니다.` }]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curriculum?.id, day?.day, mode, location, equipmentKey, chosenCoach]);

  useEffect(() => () => stopSpeaking(), []);

  const current = run ? resolveTechnique(run.techniqueIds[run.index]) : undefined;
  // Every language-model call of this lesson goes through the run's own coach.
  const runCoach: CoachKind | null = run && isCoachKind(run.coachKind) ? run.coachKind : null;
  const coach = coachBackend(runCoach ?? chosenCoach ?? 'gemini');
  const ownCoach = (runCoach ?? chosenCoach) === 'martialdex';
  const planItem = day && current ? planItemFor(day, current.id) : null;
  const placeContext = useMemo(() => coachPlaceContext(location, equipment, planItem), [location, equipment, planItem]);
  const lessonCtx = useMemo(() => (current ? lessonContextFor(current) : null), [current?.id]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Voice mode: speak every NEW coach message exactly once.
  useEffect(() => {
    if (!run) return;
    let interrupted = false;
    for (const m of run.messages) {
      if (spokenIds.current.has(m.id)) continue;
      spokenIds.current.add(m.id);
      // A timer cue cuts in (it must match the clock) — but only the first
      // cue of a batch, so cues that fire together are all heard. Every
      // other coach line queues. Voice + rate come from the AI 튜터 음성 설정
      // at the moment each line starts.
      if (mode === 'voice' && m.role === 'coach') {
        const interrupt = m.kind === 'cue' && !interrupted;
        if (interrupt) interrupted = true;
        // Never talk over the user's answer: lines that arrive while the mic is open wait until it closes.
        if (recordingRef.current) pendingSpeech.current.push({ text: m.text, interrupt });
        else speak(m.text, { interrupt });
      }
    }
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [run?.messages.length, mode]);

  // Step automation (each runs once per technique index).
  useEffect(() => {
    if (!run || !current) return;
    const key = `${run.id}:${run.index}:${run.step}`;
    if (handledSteps.current.has(key)) return;
    if (run.step === 'explain') {
      // 1:1 수업 시작 — one short line and a question, not a monologue (coachLesson/engine.ts).
      handledSteps.current.add(key);
      const intro = run.index === 0 ? `오늘은 ${run.techniqueIds.length}개 ${planItem ? '단계를' : '기술을'} 함께 연습하겠습니다. ` : '';
      const lead = planItem ? `${intro}이번 단계(${ROLE_LABEL[planItem.role]})는 ${displayName(current)}입니다.` : `${intro}이번 기술은 ${displayName(current)}입니다.`;
      if (run.index === 0 && location) appendMessages([{ role: 'coach', kind: 'system', text: locationIntro(location, equipment) }]);
      applyLesson(current, startLesson(current, lead));
    } else if (run.step === 'practiced') {
      handledSteps.current.add(key);
      const lesson = run.lessons?.[current.id];
      const completed = run.outcomes[current.id]?.completed ?? false;
      // 수행 후 질문 — the lesson asks what was applied before moving on.
      if (lesson) {
        applyLesson(current, lessonEvent(current, lesson, { type: 'PRACTICE_DONE', completed }));
        return;
      }
      // Run saved before the lesson engine existed: previous behaviour.
      appendMessages([{ role: 'coach', kind: 'feedback', text: practiceFeedback(current, completed, run.location) }]);
      afterTechnique();
    }
  }, [run?.id, run?.index, run?.step, current?.id]);

  /**
   * Applies one engine result: transcript lines, the lesson state, and the
   * page step the lesson is now at. The engine — not this UI — decides the
   * flow; a running timer or mitt drill is never interrupted by it.
   */
  function applyLesson(t: Technique, result: LessonStepResult) {
    const before = getCoachDayRun();
    if (!before) return;
    const lines: Omit<CoachMessage, 'id' | 'at'>[] = actionsToMessages(result.actions);
    const stepFor: Record<LessonStepResult['directive'], CoachStep> = { teach: 'lesson', video: 'videos', check: 'quiz', ready: 'ready', review: 'review', next: 'review' };
    const keep = before.step === 'practice' || before.step === 'mitt' || before.step === 'drill' || before.step === 'posture';
    const nextStep = keep ? before.step : stepFor[result.directive];
    if (!keep && nextStep === 'videos' && before.step !== 'videos') {
      const videos = getTechniqueVideos(t);
      lines.push({
        role: 'coach',
        kind: 'system',
        text: videos.length > 0 ? `이 기술의 MARTIALDEX 관련 영상이 ${videos.length}개 있습니다. 영상을 보신 뒤 "영상 확인 완료"를 눌러 주세요.` : '등록된 영상이 없어 관련 영상을 찾고 내용이 이 기술과 맞는지 확인하겠습니다. 잠시만 기다려 주세요.',
      });
      // The practice itself always calls the drawn mitt (practicePlan.ts) — said up front.
      if (motionForTechnique(t)) {
        lines.push({ role: 'coach', kind: 'system', text: `실습 때는 AI Visualizing Mitt를 불러 ${t.name}의 목표 지점과 발 위치에 맞춰 치게 됩니다. 시작 전에 자세부터 설명하겠습니다.` });
      }
    }
    if (!keep && nextStep === 'ready' && before.step !== 'ready') lines.push({ role: 'coach', kind: 'system', text: READY_PROMPT });
    const overall = result.state.understanding.overall;
    updateCoachDayRun((r) => ({
      ...r,
      step: nextStep,
      pendingQuiz: result.state.pending?.text ?? null,
      lessons: { ...(r.lessons ?? {}), [t.id]: result.state },
      outcomes: {
        ...r.outcomes,
        [t.id]: { ...r.outcomes[t.id], understanding: overall, quiz: overall === 'unknown' && r.outcomes[t.id]?.quiz ? r.outcomes[t.id].quiz : outcomeQuiz(overall) },
      },
    }));
    if (lines.length) appendMessages(lines);
    if (result.directive === 'next') {
      // 학습 기록: which concepts were understood / need review — read by the next lesson on this technique.
      saveLearningRecord(toLearningRecord(result.state, lessonContextFor(t)));
      afterTechnique();
    }
  }

  /** Done with the current technique: maybe connect the day's strikes on the mitt, then the next technique (or the recap). */
  function afterTechnique() {
    const run = getCoachDayRun();
    if (!run) return;
    const hasNext = run.index + 1 < run.techniqueIds.length;
    // The tutor's own decision: once two or more strikes/entries have been practised,
    // connect them into one combo on the Visualizing Mitt (only if the order is a natural one).
    if (!run.lessonComboOffered) {
      const practised = run.techniqueIds.slice(0, run.index + 1).filter((id) => run.outcomes[id]?.practicedSeconds > 0);
      const mittable = practised.filter((id) => { const t = resolveTechnique(id); return t && motionForTechnique(t); }).slice(-4);
      const plan = mittable.length >= 2 ? lessonPlan(mittable) : null;
      if (plan && reviewConnections(plan.combo.steps).length === 0) {
        appendMessages([{ role: 'coach', kind: 'system', text: `방금 배운 기술을 연결해서 연습해 보겠습니다. ${plan.name} 콤보를 ${plan.repetitions}회 반복하겠습니다. ${plan.reason}` }]);
        updateCoachDayRun((r) => ({ ...r, lessonComboOffered: true, mittPlan: planToLesson(plan, 'next'), step: 'mitt' }));
        return;
      }
    }
    advanceAfterTechnique(hasNext);
  }

  function advanceAfterTechnique(hasNext: boolean) {
    if (hasNext) {
      appendMessages([{ role: 'coach', kind: 'system', text: '다음 기술로 넘어가겠습니다.' }]);
      updateCoachDayRun((r) => ({ ...r, index: r.index + 1, step: 'explain' }));
      return;
    }
    // 수업 종료 전 복습 — only when the lesson engine taught something today.
    const r = getCoachDayRun();
    const plan = r ? recapPlanFor(r) : null;
    if (plan && r && !r.recap) {
      appendMessages([{ role: 'coach', kind: 'quiz', text: plan.question }]);
      updateCoachDayRun((x) => ({ ...x, step: 'recap', recap: { question: plan.question, answered: false } }));
      return;
    }
    updateCoachDayRun((x) => ({ ...x, step: 'summary', finishedAt: new Date().toISOString() }));
  }

  async function answerRecap(text: string | null) {
    const r = getCoachDayRun();
    const plan = r ? recapPlanFor(r) : null;
    if (!r || !plan) return;
    let feedback: string;
    if (text === null || ['skip', 'dont_know'].includes(classifyIntent(text, null))) {
      feedback = recapFeedback(plan, []);
    } else {
      setBusy(true);
      const hits = await coach.gradeRecap(null, plan, text);
      setBusy(false);
      feedback = recapFeedback(plan, hits);
    }
    appendMessages([{ role: 'coach', kind: 'feedback', text: feedback }]);
    updateCoachDayRun((x) => ({ ...x, recap: { question: plan.question, answered: true }, step: 'summary', finishedAt: new Date().toISOString() }));
  }

  // Videos step: when nothing is saved, search + verify (same verification as "URL 직접 추가").
  useEffect(() => {
    if (!run || run.step !== 'videos' || !current) return;
    if (videoFind?.techniqueId === current.id) return;
    const saved = getTechniqueVideos(current);
    if (saved.length) {
      setVideoFind({ techniqueId: current.id, status: 'done', progress: '', videos: saved.map((v) => ({ video: v, source: 'saved' })), checked: 0 });
      return;
    }
    if (ownCoach) {
      // Found videos are checked by Gemini (urlVerification.ts) — the 자체 AI 코치 shows registered videos only.
      setVideoFind({ techniqueId: current.id, status: 'done', progress: '', videos: [], checked: 0 });
      appendMessages([{ role: 'coach', kind: 'system', text: 'MARTIALDEX에 등록된 영상이 없습니다. 자체 AI 코치는 Gemini로 영상 내용을 확인하는 검색을 하지 않으므로, 위의 자세 설명을 참고해 주세요.' }]);
      return;
    }
    setVideoFind({ techniqueId: current.id, status: 'searching', progress: '관련 영상을 찾는 중입니다…', videos: [], checked: 0 });
    const t = current;
    void findTutorVideos(t, { onProgress: (msg) => setVideoFind((v) => (v && v.techniqueId === t.id ? { ...v, progress: msg } : v)) }).then(async (r) => {
      // YouTube had nothing → other video platforms (web search; the real page text must name the technique).
      let other: PlatformVideo[] = [];
      if (!r.videos.length) {
        const names = [t.name, t.koreanName ?? '', ...(t.aliases ?? [])].filter(Boolean);
        const found = await findOtherPlatformVideos({
          terms: names,
          queries: [`${t.name} ${curriculum?.martialArt ?? ''} tutorial`.trim(), t.koreanName ? `${t.koreanName} 기술 설명` : ''].filter(Boolean),
          onProgress: (msg) => setVideoFind((v) => (v && v.techniqueId === t.id ? { ...v, progress: msg } : v)),
        }).catch(() => ({ videos: [] as PlatformVideo[] }));
        other = found.videos;
      }
      setOtherVideos({ techniqueId: t.id, videos: other });
      setVideoFind({ techniqueId: t.id, status: 'done', progress: '', videos: r.videos, checked: r.checked });
      const watchFor = (t.posture?.keyPoints ?? []).slice(0, 3);
      appendMessages([
        {
          role: 'coach',
          kind: 'system',
          text: other.length
            ? `유튜브에서 맞는 영상을 찾지 못해 다른 영상 플랫폼(${[...new Set(other.map((o) => PLATFORM_LABEL[o.platform]))].join(', ')})에서 찾았습니다. 영상을 보신 뒤 "다음"을 눌러 주세요.`
            : r.videos.length
            ? `내용을 확인한 관련 영상을 찾았습니다. 영상을 보신 뒤 "영상 확인 완료"를 눌러 주세요.${watchFor.length ? ` 영상에서는 ${withObject(watchFor.join(', '))} 확인해 주세요.` : ''}`
            : `현재 등록된 관련 영상을 찾지 못했습니다${r.checked ? `(후보 ${r.checked}개를 확인했지만 이 기술과 맞는 영상이 없었습니다)` : ''}. 위의 자세 설명을 보고 준비가 되셨다면 "다음"을 눌러 주세요.`,
        },
      ]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.step, current?.id]);

  // Summary: finalize once (training history + Day completion).
  useEffect(() => {
    if (!run || run.step !== 'summary' || !curriculum || !day || summary) return;
    const result = finalizeCoachDay(run, curriculum, day);
    if (result.historyEntryId !== run.historyEntryId) updateCoachDayRun((r) => ({ ...r, historyEntryId: result.historyEntryId }));
    setSummary(result);
    // 수업 기록 (전 수업내용 복습용): what was taught and understood — once per run (same id → replaced, not duplicated).
    const taught = run.techniqueIds.filter((id) => run.lessons?.[id]);
    if (taught.length) {
      const recapAsk = run.recap?.question ?? null;
      const recapIdx = recapAsk ? run.messages.findIndex((m) => m.role === 'coach' && m.text === recapAsk) : -1;
      const recapFeedback = recapIdx >= 0 ? run.messages.slice(recapIdx + 1).find((m) => m.role === 'coach' && m.kind === 'feedback')?.text ?? null : null;
      const finished = run.finishedAt ?? new Date().toISOString();
      saveLessonLog({
        id: `lesson_${run.id}`,
        kind: 'curriculum_day',
        title: `${curriculum.title} · Day ${day.day}${day.title ? ` · ${day.title}` : ''}`,
        date: finished.slice(0, 10),
        startedAt: run.startedAt,
        finishedAt: finished,
        curriculumId: curriculum.id,
        day: day.day,
        historyEntryId: result.historyEntryId,
        techniques: taught.map((id) => {
          const t = resolveTechnique(id);
          return t ? techniqueSummary(id, displayName(t), run.lessons![id], lessonContextFor(t)) : null;
        }).filter((x): x is NonNullable<typeof x> => !!x),
        qa: questionAnswerPairs(run.messages),
        recap: recapAsk && recapFeedback ? { question: recapAsk, feedback: recapFeedback } : null,
        updatedAt: new Date().toISOString(),
        coachKind: coachKindOf(run),
      });
    }
    appendMessages([{ role: 'coach', kind: 'system', text: '오늘 학습을 모두 마쳤습니다. 수고하셨습니다. 아래 요약을 확인해 주세요.' }]);
  }, [run?.step]);

  // Practice timer: event-based cues, polled.
  useEffect(() => {
    if (!run || run.step !== 'practice' || !current) return;
    const point = reminderPointFor(current);
    const id = window.setInterval(() => {
      tickPractice({ name: displayName(current), point });
      forceTick((n) => n + 1);
    }, 250);
    return () => window.clearInterval(id);
  }, [run?.step, current?.id]);

  const handleUserText = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      const r = getCoachDayRun();
      if (!text || !r || !current || busy) return;
      appendMessages([{ role: 'user', text }]);
      if (r.step === 'recap') {
        await answerRecap(text);
        return;
      }
      const lesson = r.lessons?.[current.id];
      if (r.step === 'ready' && isReadyIntent(text)) {
        beginPractice();
        return;
      }
      // 자세 설명 끝 → "준비됐어" starts the practice that was planned.
      if (r.step === 'posture' && isReadyIntent(text)) {
        confirmPractice();
        return;
      }
      // "이걸 콤보로 연습하고 싶어" … → a Visualizing Mitt drill (checked before the lesson so it is never graded as an answer).
      if (lesson && r.step !== 'practice' && r.step !== 'mitt' && r.step !== 'posture' && !lesson.pending && isMittRequest(text)) {
        await startMittFromRequest(text, r);
        return;
      }
      // 1:1 수업: intent → (answer analysis | coach answer) → lesson engine. Same path for voice and text.
      if (lesson && r.step !== 'mitt') {
        setBusy(true);
        try {
          const res = await respondToStudent({ technique: current, state: lesson, text, dayContext, history: getCoachDayRun()?.messages ?? [], place: placeContext, coach });
          applyLesson(current, res);
        } finally {
          setBusy(false);
        }
        return;
      }
      // ---- below: runs saved before the lesson engine (no lesson state) keep their old behaviour ----
      if (r.step === 'quiz' && r.pendingQuiz) {
        setBusy(true);
        const graded = await coach.gradeQuiz(current, r.pendingQuiz, text);
        appendMessages([{ role: 'coach', kind: 'feedback', text: graded.feedback }]);
        updateCoachDayRun((x) => ({
          ...x,
          pendingQuiz: null,
          step: 'ready',
          outcomes: { ...x.outcomes, [current.id]: { ...x.outcomes[current.id], quiz: graded.verdict } },
        }));
        appendMessages([{ role: 'coach', kind: 'system', text: READY_PROMPT }]);
        setBusy(false);
        return;
      }
      // "준비됐어" while the video is still up = done watching → the check question comes first.
      if (r.step === 'videos' && isReadyIntent(text)) {
        goToQuiz();
        return;
      }
      // "이걸 콤보로 연습하고 싶어", "테이크다운으로 연결해줘", "더 빠르게" … → a Visualizing Mitt drill in the lesson.
      if (r.step !== 'practice' && r.step !== 'mitt' && isMittRequest(text)) {
        await startMittFromRequest(text, r);
        return;
      }
      setBusy(true);
      const answer = await coach.answerQuestion({ technique: current, question: text, dayContext, history: getCoachDayRun()?.messages ?? [], place: placeContext });
      appendMessages([{ role: 'coach', kind: 'answer', text: answer.ok ? answer.text : `지금은 답변을 가져오지 못했습니다: ${answer.message}` }]);
      setBusy(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current?.id, busy, dayContext, placeContext, coach.kind]
  );

  async function startMittFromRequest(text: string, r: CoachDayRun) {
    if (coach.kind === 'martialdex') {
      // planMittTraining uses Gemini + web search — not part of the 자체 AI 코치.
      appendMessages([{ role: 'coach', kind: 'answer', text: '자체 AI 코치는 문장으로 요청한 미트 훈련을 새로 설계하지 않습니다(그 기능은 Gemini를 사용합니다). 오늘 배운 기술의 미트 연습은 실습 단계에서 그대로 진행됩니다.' }]);
      return;
    }
    setBusy(true);
    const prev = r.mittPlan ? lessonPlan(r.mittPlan.techniqueIds, r.mittPlan.name) : null;
    // The coach first checks users' shared combos/setups for this purpose, otherwise builds one from a live web search.
    const res = await planMittTraining({ purpose: text, martialArt: curriculum?.martialArt, contextTechniqueIds: r.techniqueIds.slice(0, r.index + 1), previous: prev });
    setBusy(false);
    if (!res.ok) {
      appendMessages([{ role: 'coach', kind: 'answer', text: res.message }]);
      return;
    }
    const plan = res.plan;
    const how = plan.stepNotes.map((n, i) => `${i + 1}. ${plan.combo.steps[i]?.technique.name ?? ''}${n.note ? ` — ${n.note}` : ''}${n.opponentReaction ? ` (예상 반응: ${n.opponentReaction})` : ''}`).join(' ');
    appendMessages([
      {
        role: 'coach',
        kind: 'answer',
        text: `${plan.source === 'shared' ? `MARTIALDEX 사용자 ${plan.shared?.authorNickname || '익명'}님이 공유한 ${plan.type === 'setup' ? '셋업을' : '콤보를'} 불러왔습니다` : plan.source === 'web' ? `실시간 검색 자료로 ${plan.type === 'setup' ? '셋업을' : '콤보를'} 만들었습니다` : `${plan.type === 'setup' ? '셋업을' : '콤보를'} 만들었습니다`}: ${plan.name}. ${plan.decision?.reason ? `${plan.decision.reason} ` : ''} 목적은 ${plan.purpose.replace(/[.。]$/, '')}입니다. ${how} 이 연습을 ${plan.repetitions}회 반복하겠습니다.`,
      },
    ]);
    updateCoachDayRun((x) => ({ ...x, mittPlan: planToLesson(plan, r.step as CoachStep), step: 'mitt' }));
  }

  /** "영상 확인 완료" — the lesson decides: a pre-practice check, a question about the video, or straight to practice. */
  function goToQuiz() {
    if (!current) return;
    const lesson = getCoachDayRun()?.lessons?.[current.id];
    if (lesson) {
      applyLesson(current, lessonEvent(current, lesson, { type: 'VIDEO_DONE' }));
      return;
    }
    const q = quizQuestionFor(current);
    updateCoachDayRun((r) => ({ ...r, step: 'quiz', pendingQuiz: q }));
    appendMessages([{ role: 'coach', kind: 'quiz', text: q }]);
  }

  /** Skip the question currently asked (never traps the student). From the video step: skip to practice. */
  function skipQuiz() {
    if (!current) return;
    const run = getCoachDayRun();
    let lesson = run?.lessons?.[current.id];
    if (lesson) {
      if (run?.step === 'videos') {
        const r1 = lessonEvent(current, lesson, { type: 'VIDEO_DONE' });
        lesson = r1.state;
        if (!lesson.pending) {
          applyLesson(current, r1);
          return;
        }
      }
      if (lesson.pending) applyLesson(current, lessonEvent(current, lesson, { type: 'SKIP' }));
      return;
    }
    updateCoachDayRun((r) => ({ ...r, step: 'ready', pendingQuiz: null, outcomes: { ...r.outcomes, [current.id]: { ...r.outcomes[current.id], quiz: 'skipped' } } }));
    appendMessages([{ role: 'coach', kind: 'system', text: READY_PROMPT }]);
  }

  /** Quick replies in the "답변 차례" panel — sent exactly as if typed/spoken. */
  function quickReply(text: string) {
    void handleUserText(text);
  }

  // ---- Visualizing Mitt inside the lesson ----
  function finishMitt(result: MittRunResult) {
    const r = getCoachDayRun();
    const plan = r?.mittPlan;
    if (!r || !plan) return;
    if (plan.asPractice) {
      // The mitt WAS this technique's practice: its run time is the practiced time.
      const practicedSeconds = Math.max(1, Math.round((Date.now() - plan.asPractice.startedAt) / 1000));
      const tid = plan.asPractice.techniqueId;
      const setup = r.practiceSetup?.techniqueId === tid ? r.practiceSetup : null;
      updateCoachDayRun((x) => ({
        ...x,
        mittPlan: null,
        mittSessions: [...(x.mittSessions ?? []), { name: plan.name, techniqueIds: plan.techniqueIds, completedReps: result.completedReps, targetReps: result.targetReps, finished: result.finished }],
        outcomes: { ...x.outcomes, [tid]: { ...x.outcomes[tid], practicedSeconds: (x.outcomes[tid]?.practicedSeconds ?? 0) + practicedSeconds, completed: result.finished } },
        // a chain continues below (startAfterMitt) — only a mitt-only practice is done here
        step: setup?.after ? x.step : 'practiced',
        practiceSetup: setup?.after ? x.practiceSetup : null,
      }));
      appendMessages([{ role: 'coach', kind: 'system', text: result.finished ? `Visualizing Mitt로 ${withObject(plan.name)} ${result.completedReps}회 모두 쳤습니다.` : `${plan.name}은(는) ${result.completedReps}회까지 쳤습니다.` }]);
      // A chain continues after the mitt (MMA grappling / takedown → submission); otherwise the
      // 'practiced' step runs the usual follow-up (question / feedback / next technique).
      if (setup?.after) startAfterMitt(setup);
      return;
    }
    appendMessages([
      {
        role: 'coach',
        kind: 'feedback',
        text: result.finished
          ? `좋습니다. ${withObject(plan.name)} ${result.completedReps}회 모두 반복했습니다.${plan.coachingNote ? ` ${plan.coachingNote}` : ''}`
          : `${plan.name}은(는) ${result.completedReps}회까지 연습했습니다. 필요하면 언제든 다시 해 보겠습니다.`,
      },
    ]);
    updateCoachDayRun((x) => ({
      ...x,
      mittPlan: null,
      mittSessions: [...(x.mittSessions ?? []), { name: plan.name, techniqueIds: plan.techniqueIds, completedReps: result.completedReps, targetReps: result.targetReps, finished: result.finished }],
      step: plan.resume === 'next' ? 'mitt' : plan.resume,
    }));
    if (plan.resume === 'next') advanceAfterTechnique(r.index + 1 < r.techniqueIds.length);
    else appendMessages([{ role: 'coach', kind: 'system', text: '수업으로 돌아가겠습니다.' }]);
  }

  /**
   * How a technique is practised in the lesson:
   *   striking technique with a mitt motion → the Visualizing Mitt (reps the tutor decides),
   *   wrestling / BJJ standing or solo ground movement → the solo call-out drill,
   *   anything else (partner-only grappling…) → the timed practice as before.
   */
  function finishDrill(result: SoloDrillResult) {
    const r = getCoachDayRun();
    const plan = r?.drillPlan;
    if (!r || !plan) return;
    updateCoachDayRun((x) => ({
      ...x,
      drillPlan: null,
      drillSessions: [...(x.drillSessions ?? []), { techniqueId: plan.techniqueId, calls: result.calls, seconds: result.seconds, finished: result.finished }],
      outcomes: { ...x.outcomes, [plan.techniqueId]: { ...x.outcomes[plan.techniqueId], practicedSeconds: (x.outcomes[plan.techniqueId]?.practicedSeconds ?? 0) + result.seconds, completed: result.finished } },
      practiceSetup: null,
      step: 'practiced',
    }));
    // the 'practiced' step then runs the usual follow-up (question / feedback / next technique)
    appendMessages([{ role: 'coach', kind: 'system', text: result.finished ? `솔로 드릴 구령 ${result.calls}번에 맞춰 끝까지 움직였습니다.` : `솔로 드릴은 구령 ${result.calls}번까지 했습니다.` }]);
  }

  /**
   * "준비됐어" → the coach plans the practice (practicePlan.ts: the mitt is
   * always called when the technique or its chain can be drawn; MMA mixes
   * strikes with takedowns; a submission goal becomes takedown → submission)
   * and explains the stance and posture FIRST. Nothing starts until the user
   * confirms the posture (confirmPractice).
   */
  function beginPractice() {
    if (!current || !day) return;
    const seconds = practiceSecondsFor(day, current, techniques.length);
    const goal = curriculum?.aiCoachMeta?.goal ?? curriculum?.aiGoalMeta?.goalText ?? null;
    const setup = planPractice(current, { location: location ?? null, mma: isMmaContext(curriculum?.martialArt, current), submissionGoal: isSubmissionGoal(goal), seconds });
    appendMessages([
      { role: 'coach', kind: 'system', text: setup.intro },
      ...setup.briefing.map((text) => ({ role: 'coach' as const, kind: 'explain' as const, text })),
    ]);
    updateCoachDayRun((r) => ({ ...r, step: 'posture', practiceSetup: setup }));
  }

  /** Posture confirmed → the planned practice starts: the mitt first, otherwise the drill or the timer. */
  function confirmPractice() {
    const r = getCoachDayRun();
    const setup = r?.practiceSetup;
    if (!r || !setup || !current || setup.techniqueId !== current.id) {
      beginPractice();
      return;
    }
    if (setup.mitt) {
      appendMessages([{ role: 'coach', kind: 'system', text: `좋습니다. Visualizing Mitt를 불러오겠습니다. ${setup.mitt.name}을(를) ${setup.mitt.repetitions}회 칩니다. ${setup.mitt.reason}` }]);
      updateCoachDayRun((x) => ({ ...x, step: 'mitt', mittPlan: { ...setup.mitt!, resume: 'ready', asPractice: { techniqueId: setup.techniqueId, startedAt: Date.now() } } }));
      return;
    }
    startAfterMitt(setup);
  }

  /** The drill / timer part of a practice (alone, or after its mitt part). */
  function startAfterMitt(setup: PracticeSetup) {
    if (!current) return;
    if (setup.after === 'drill' && setup.drill) {
      const d = setup.drill;
      const focus = d.focusId ? d.cues.find((c) => c.id === d.focusId) : null;
      appendMessages([{ role: 'coach', kind: 'system', text: `솔로 드릴을 시작합니다. 구령이 들리는 대로 바로 움직여 주세요.${focus ? ` "${focus.call}"을(를) 더 자주 부르겠습니다.` : ''} ${formatMMSS(d.seconds * 1000)} 동안 진행합니다.` }]);
      updateCoachDayRun((x) => ({ ...x, step: 'drill', drillPlan: d }));
      return;
    }
    startPractice(setup.timerSeconds);
    updateCoachDayRun((x) => ({ ...x, practiceSetup: null }));
    appendMessages([
      {
        role: 'coach',
        kind: 'system',
        text: setup.timerText
          ? `${setup.timerText} ${formatMMSS(setup.timerSeconds * 1000)} 동안 진행합니다.`
          : planItem
            ? `좋습니다. 시작하겠습니다. ${formatMMSS(setup.timerSeconds * 1000)} 동안 진행합니다. ${planItem.instruction}${planItem.soloAlternative ? ` 장비나 파트너가 없으면: ${planItem.soloAlternative}` : ''}`
            : `좋습니다. 시작하겠습니다. ${formatMMSS(setup.timerSeconds * 1000)} 동안 ${displayName(current)}를 반복해서 연습해 주세요.`,
      },
    ]);
  }

  function flushPendingSpeech() {
    recordingRef.current = false;
    for (const s of pendingSpeech.current.splice(0)) speak(s.text, { interrupt: s.interrupt });
  }

  // The tutor stops talking while the user answers (and its own voice is never recorded as the answer).
  // The recognized text goes into the input box to be checked/edited and sent — or straight in when
  // the student turned on 말이 끝나면 바로 보내기.
  const voice = useVoiceInput({
    maxSeconds: COACH_DAY_CONFIG.maxRecordSeconds,
    hints: current ? [current.name, current.koreanName ?? ''].filter(Boolean) : [],
    // the 자체 AI 코치 uses no external AI — speech recognition stays on this device's engine, no Gemini fallback
    allowFallback: !ownCoach,
    onRecordingChange: (on) => {
      if (on) recordingRef.current = true;
      else flushPendingSpeech();
    },
    onFinal: (text, autoSend) => {
      if (autoSend) void handleUserText(text);
      else {
        setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
        inputRef.current?.focus();
      }
    },
  });
  const recording = voice.recording;
  const transcribing = voice.phase === 'recognizing';
  const micPhase = voice.phase;
  const toggleMic = voice.toggle;

  if (!curriculum || curriculum.martialArt !== martialArtId || !day) return <Navigate to={`/learning/${martialArtId}`} replace />;
  if (techniques.length === 0) {
    return (
      <div className="page">
        <div className="container">
          <BackButton />
          <p className="video-status-message">이 Day에는 연습할 기술이 등록되어 있지 않습니다.</p>
        </div>
      </div>
    );
  }
  const setCoachParam = (kind: CoachKind) => {
    const next = new URLSearchParams(searchParams);
    next.set('coach', kind);
    setSearchParams(next, { replace: true });
  };
  if (!chosenCoach) {
    return (
      <div className="page">
        <div className="container">
          <BackButton />
          <div className="section-title">
            <h2>🧑‍🏫 AI 코치와 Day {day.day}</h2>
          </div>
          <div className="card info-card">
            <CoachPicker onPick={setCoachParam} confirmLabel="이 코치로 수업 시작" />
          </div>
        </div>
      </div>
    );
  }
  if (!location) {
    return (
      <div className="page">
        <div className="container">
          <BackButton />
          <div className="section-title">
            <h2>🧑‍🏫 AI 코치와 Day {day.day}</h2>
          </div>
          <div className="card info-card">
            <CoachLocationPicker
              onConfirm={(loc, eq) => {
                const next = new URLSearchParams(searchParams);
                next.set('place', loc);
                if (eq.length) next.set('equip', eq.join(','));
                else next.delete('equip');
                setSearchParams(next, { replace: true });
              }}
            />
          </div>
        </div>
      </div>
    );
  }
  if (!run || run.curriculumId !== curriculum.id || run.day !== day.day) return null;

  const shownVideos: TutorVideo[] = current && videoFind?.techniqueId === current.id ? videoFind.videos : [];
  const activeVideo = shownVideos.find((v) => v.video.videoId === playingVideoId) ?? shownVideos[0];
  const activeVideoId = activeVideo?.video.videoId ?? null;
  const mittCombo: MittCombo | null = run.mittPlan
    ? { id: `lesson-mitt`, name: run.mittPlan.name, source: 'single', sourceLabel: 'AI 튜터 수업', steps: stepsForIds(run.mittPlan.techniqueIds), skipped: [], warnings: [] }
    : null;
  const remaining = run.practice ? practiceRemainingMs(run.practice) : 0;
  // Speech-to-text runs through Gemini (voice/stt.ts) — off for the 자체 AI 코치 (TTS still speaks).
  // Recognition runs on this platform's own engine (sttEngines.ts) — no Gemini — so the 자체 AI 코치 can use it too.
  const voiceInputOk = isVoiceInputSupported() || voice.info?.id === 'android';
  const lesson: CoachLessonState | null = current ? (run.lessons?.[current.id] ?? null) : null;
  // 학생이 답해야 하는 시점 — shown clearly, never auto-advanced.
  const awaiting: { text: string; choice: ChoiceQuestion | null; type: string } | null =
    run.step === 'recap'
      ? run.recap && !run.recap.answered
        ? { text: run.recap.question, choice: null, type: 'recap' }
        : null
      : lesson?.pending && ['lesson', 'quiz', 'review', 'videos'].includes(run.step)
        ? { text: lesson.pending.text, choice: lesson.pending.choice, type: lesson.pending.type }
        : null;
  const stage = lesson?.currentStage;

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to={`/learning/${curriculum.martialArt}/${curriculum.id}`}>{curriculum.title}</Link>
          <span>/</span>
          <span>Day {day.day} · AI 코치</span>
        </div>
        <div className="section-title">
          <h2>🧑‍🏫 AI 코치와 Day {day.day}</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          <span data-testid="coach-location" data-location={location}>
            {LOCATION_ICON[location]} {LOCATION_LABEL[location]}
          </span>{' '}
          · {mode === 'voice' ? '말로 대화 모드' : '입력으로 대화 모드'} · {planItem ? '단계' : '기술'} {Math.min(run.index + 1, run.techniqueIds.length)}/{run.techniqueIds.length}
          {current ? ` · ${displayName(current)}` : ''}
        </p>
        <div className="chip-row" style={{ marginTop: -4 }}>
          <span className="chip" data-testid="coach-kind" data-coach={coachKindOf(run)}>
            {coachKindOf(run) === 'martialdex' ? '🥋' : coachKindOf(run) === 'gemini' ? '✨' : '❔'} {COACH_LABEL[coachKindOf(run)]}
          </span>
          {run.step !== 'summary' && !switchTo && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSwitchTo('pick')} data-testid="coach-switch-open">
              코치 바꾸기
            </button>
          )}
        </div>
        {switchTo === 'pick' && (
          <div className="card info-card" data-testid="coach-switch">
            <CoachPicker
              showRemember={false}
              confirmLabel="다음"
              note={`지금 수업은 ${COACH_LABEL[coachKindOf(run)]}로 진행 중입니다. 바꿀 코치를 고르면 지금 수업을 어떻게 할지 한 번 더 확인합니다.`}
              onPick={(k) => setSwitchTo(k === coachKindOf(run) ? null : k)}
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSwitchTo(null)} data-testid="coach-switch-cancel">
              취소
            </button>
          </div>
        )}
        {switchTo && switchTo !== 'pick' && (
          <div className="card info-card" data-testid="coach-switch-confirm" data-to={switchTo}>
            <p style={{ marginTop: 0 }}>
              <strong>{COACH_LABEL[switchTo]}</strong>(으)로 바꿉니다. 지금 수업은 어떻게 할까요?
            </p>
            <div className="modal-actions modal-actions--start">
              <button
                className="btn btn-primary"
                data-testid="coach-switch-keep"
                onClick={() => {
                  const from = coachKindOf(run);
                  updateCoachDayRun((r) => ({ ...r, coachKind: switchTo, coachSwitches: [...(r.coachSwitches ?? []), { from, to: switchTo, at: new Date().toISOString(), index: r.index }] }));
                  appendMessages([{ role: 'coach', kind: 'system', text: `코치를 ${COACH_LABEL[from]}에서 ${COACH_LABEL[switchTo]}(으)로 바꿨습니다. 지금까지의 진행과 대화는 그대로 두고, 다음 대화부터 ${COACH_LABEL[switchTo]}가 답변하고 채점합니다.` }]);
                  setCoachParam(switchTo);
                  setSwitchTo(null);
                }}
              >
                진행 유지하고 코치만 바꾸기
              </button>
              <button
                className="btn btn-secondary"
                data-testid="coach-switch-restart"
                onClick={() => {
                  stopSpeaking();
                  clearCoachDayRun();
                  setCoachParam(switchTo);
                  setSwitchTo(null);
                }}
              >
                이 Day를 처음부터 새 코치로
              </button>
              <button className="btn btn-ghost" onClick={() => setSwitchTo(null)}>
                취소
              </button>
            </div>
            <p className="video-status-message" style={{ marginBottom: 0 }}>
              처음부터 다시 하면 지금 진행 중인 이 Day 수업은 기록되지 않고 사라집니다.
            </p>
          </div>
        )}
        {mode === 'voice' && !ttsAvailable && <div className="ai-inline-warning">이 기기에서는 음성 안내(TTS)를 지원하지 않아 코치 답변을 글로만 보여줍니다.</div>}
        {mode === 'voice' && ttsAvailable && (
          // 수업 중에도 바꿀 수 있음 — [적용] 후 다음 음성부터 (지금 말하는 문장은 끊지 않음).
          <details className="card info-card coach-voice-settings" data-testid="coach-voice-settings">
            <summary>🔊 AI 튜터 설정 (음성 · 말하기 속도)</summary>
            <TutorVoiceSettingsPanel />
          </details>
        )}
        {mode === 'voice' && (
          <details className="card info-card coach-voice-settings" data-testid="coach-mic-test">
            <summary>🎤 마이크 테스트</summary>
            <MicTestPanel hints={current ? [current.name] : []} allowFallback={!ownCoach} />
          </details>
        )}

        {lesson && lessonCtx && current && run.step !== 'summary' && (
          <div className="card info-card coach-lesson-progress" data-testid="coach-lesson-progress" data-stage={lesson.currentStage} data-level={lesson.level} aria-label="현재 학습 진행">
            <span className="coach-lesson-progress__title">현재 학습 · {displayName(current)}</span>
            <ol>
              {lessonCtx.concepts.map((c) => {
                const st = lesson.understanding.concepts[c.id]?.status ?? 'unknown';
                const isCur = ['EXPLANATION', 'UNDERSTANDING_CHECK', 'RE_EXPLANATION', 'INTRO'].includes(lesson.currentStage) && (lesson.pending?.conceptId ?? lessonCtx.concepts[lesson.conceptIndex]?.id) === c.id;
                return (
                  <li key={c.id} data-status={st} data-current={isCur} data-testid="coach-lesson-concept" title={STATUS_LABEL[st]}>
                    {STATUS_ICON[st]} {c.label} <span className="sr-only">({STATUS_LABEL[st]})</span>
                  </li>
                );
              })}
              <li data-current={stage === 'VIDEO'} data-status={lesson.videoDone ? 'understood' : 'unknown'}>{lesson.videoDone ? '●' : '○'} 영상</li>
              <li data-current={stage === 'PRE_PRACTICE_CHECK' || stage === 'PRACTICE'} data-status={lesson.practiceDone ? 'understood' : 'unknown'}>{lesson.practiceDone ? '●' : '○'} 수행</li>
              <li data-current={stage === 'PRACTICE_REVIEW' || stage === 'SCENARIO_CHECK'} data-status={stage === 'COMPLETE' ? 'understood' : 'unknown'}>{stage === 'COMPLETE' ? '●' : '○'} 수행 후 확인</li>
              <li data-current={run.step === 'recap'} data-status="unknown">○ 복습</li>
            </ol>
          </div>
        )}

        <div className="card info-card" data-testid="coach-step" data-step={run.step}>
          <div className="ai-chat coach-chat" ref={chatRef} data-testid="coach-chat">
            {run.messages.map((m) => (
              <div key={m.id} className={`ai-msg ai-msg--${m.role === 'user' ? 'user' : 'model'}${m.kind === 'cue' ? ' coach-cue' : ''}`} data-kind={m.kind ?? ''}>
                <div className="ai-msg__bubble">{m.text}</div>
              </div>
            ))}
            {(busy || transcribing) && (
              <div className="ai-msg ai-msg--model">
                <div className="ai-msg__bubble ai-msg__bubble--loading">
                  <span className="ai-typing-dot" />
                  <span className="ai-typing-dot" />
                  <span className="ai-typing-dot" />
                </div>
              </div>
            )}
            {ownCoach && <LocalModelWaitNotice />}
          </div>
        </div>

        {awaiting && (
          <div className="card info-card coach-turn" data-testid={run.step === 'quiz' ? 'coach-quiz-wait' : 'coach-awaiting'} data-awaiting="true" data-question-type={awaiting.type}>
            <p className="coach-turn__label">🙋 답변 차례입니다</p>
            <p className="coach-turn__question">{awaiting.choice ? awaiting.choice.question : awaiting.text}</p>
            {awaiting.choice && (
              <div className="coach-turn__choices">
                {awaiting.choice.options.map((o, i) => (
                  <button key={i} type="button" className="btn btn-secondary" disabled={busy} onClick={() => quickReply(OPTION_LETTERS[i])} data-testid="coach-choice-option">
                    {OPTION_LETTERS[i]}. {o}
                  </button>
                ))}
              </div>
            )}
            <div className="coach-turn__quick">
              {mode === 'voice' && voiceInputOk && (
                <button type="button" className={`btn btn-sm ${recording ? 'btn-primary coach-mic--on' : 'btn-primary'}`} disabled={transcribing || busy} onClick={() => void toggleMic()} data-testid="coach-turn-mic">
                  {recording ? '■ 말하기 끝' : '🎙 말해서 답하기'}
                </button>
              )}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.focus()}>
                ⌨ 텍스트로 답하기
              </button>
              {run.step !== 'recap' && (
                <>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => quickReply('모르겠어요')} data-testid="coach-quick-dont-know">
                    모르겠어요
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => quickReply('다시 설명해 주세요')} data-testid="coach-quick-repeat">
                    다시 설명해 주세요
                  </button>
                </>
              )}
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={run.step === 'recap' ? () => void answerRecap(null) : skipQuiz} data-testid="coach-quick-skip">
                이 질문 건너뛰기
              </button>
            </div>
          </div>
        )}

        {(run.step === 'lesson' || run.step === 'videos' || run.step === 'quiz') && current?.posture && (
          <div className="card info-card coach-posture-guide" data-testid="coach-posture">
            <PostureSection posture={current.posture} />
          </div>
        )}

        {run.step === 'videos' && current && (
          <div className="card info-card" data-testid="coach-videos" data-video-status={videoFind?.techniqueId === current.id ? videoFind.status : 'pending'}>
            <h3>▶ {displayName(current)} 관련 영상</h3>
            {videoFind?.techniqueId === current.id && videoFind.status === 'searching' ? (
              <p className="video-status-message" data-testid="coach-video-searching">
                {videoFind.progress}
              </p>
            ) : shownVideos.length === 0 && otherVideos?.techniqueId === current.id && otherVideos.videos.length > 0 ? (
              <OtherPlatformVideos videos={otherVideos.videos} testId="coach-other-videos" />
            ) : shownVideos.length === 0 ? (
              <p className="video-status-message" data-testid="coach-video-none">
                현재 등록된 관련 영상을 찾지 못했습니다. 위의 자세 설명을 참고해 주세요.
              </p>
            ) : (
              <div className="coach-video-search">
                <div className="coach-video-list">
                  {shownVideos.map((v, i) => (
                    <button key={v.video.videoId} type="button" className={`chip${activeVideoId === v.video.videoId ? ' active' : ''}`} onClick={() => setPlayingVideoId(v.video.videoId)} data-testid="coach-video-chip" data-source={v.source}>
                      {v.source === 'verified' ? '🔎 ' : ''}영상 {i + 1}
                    </button>
                  ))}
                </div>
                {activeVideo && (
                  <div className="video-embed" data-testid="coach-video-player" data-video-id={activeVideo.video.videoId}>
                    <div className="video-embed__frame-wrap">
                      <iframe src={`https://www.youtube.com/embed/${activeVideo.video.videoId}`} title={activeVideo.video.title} allow={IFRAME_ALLOW} referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
                    </div>
                    <div className="video-embed__title">{activeVideo.video.title}</div>
                    {activeVideo.source === 'verified' && (
                      <p className="video-status-message" style={{ margin: '4px 0 0' }}>
                        AI가 이 영상의 실제 제목·설명을 확인해 이 기술의 설명 영상으로 판단했습니다.{activeVideo.reason ? ` (${activeVideo.reason})` : ''}{' '}
                        {savedVideoId === activeVideo.video.videoId ? (
                          <strong>· 기술 영상으로 저장했습니다.</strong>
                        ) : (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              const r = addTechniqueVideo(current, activeVideo.video);
                              if (r.ok || r.code === 'DUPLICATE') setSavedVideoId(activeVideo.video.videoId);
                            }}
                            data-testid="coach-video-save"
                          >
                            이 기술의 영상으로 저장
                          </button>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {(current.posture?.keyPoints?.length ?? 0) > 0 && (
              <p className="video-status-message" style={{ margin: '6px 0 0' }}>
                영상에서 확인할 점: {current.posture!.keyPoints!.slice(0, 3).join(' · ')}
              </p>
            )}
            <div className="modal-actions modal-actions--start" style={{ marginTop: 10 }}>
              <button className="btn btn-primary" onClick={goToQuiz} disabled={videoFind?.techniqueId === current.id && videoFind.status === 'searching'} data-testid="coach-video-done">
                {shownVideos.length ? '영상 확인 완료 — 질문 받기' : '다음 — 질문 받기'}
              </button>
              <button className="btn btn-ghost" onClick={skipQuiz}>
                질문 건너뛰기
              </button>
            </div>
          </div>
        )}

        {run.step === 'quiz' && !awaiting && (
          <div className="card info-card" data-testid="coach-quiz-wait">
            <p style={{ margin: 0 }}>질문에 {mode === 'voice' ? '마이크로 말씀하시거나 ' : ''}아래 입력창에 답해 주세요. 답변을 확인한 뒤 다음 단계로 넘어가겠습니다.</p>
            <button className="btn btn-ghost btn-sm" onClick={skipQuiz} style={{ marginTop: 6 }}>
              이 질문 건너뛰기
            </button>
          </div>
        )}

        {run.step === 'ready' && (
          <div className="card info-card text-center" data-testid="coach-ready">
            <p style={{ margin: '0 0 8px' }}>준비가 되셨다면 "준비됐어" 또는 "시작"이라고 {mode === 'voice' ? '말씀하시거나' : '입력하시거나'} 아래 버튼을 눌러 주세요.</p>
            <button className="btn btn-primary" onClick={beginPractice}>
              준비 완료 — 자세 설명 듣기
            </button>
          </div>
        )}

        {run.step === 'posture' && run.practiceSetup && current && (
          <div className="card info-card" data-testid="coach-posture" data-mode={run.practiceSetup.mode}>
            <h3 style={{ margin: 0 }}>🧍 실습 전 자세 설명 · {displayName(current)}</h3>
            <p className="video-status-message" style={{ margin: '4px 0 6px' }} data-testid="coach-posture-intro">
              {run.practiceSetup.intro}
            </p>
            <ol className="coach-class-steps" data-testid="coach-posture-lines">
              {run.practiceSetup.briefing.slice(0, -1).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
            {run.practiceSetup.mitt && (
              <p className="video-status-message" style={{ margin: '6px 0 0' }} data-testid="coach-posture-mitt">
                🥊 이어서 Visualizing Mitt: {run.practiceSetup.mitt.name} · {run.practiceSetup.mitt.repetitions}회
                {run.practiceSetup.after === 'drill' ? ' → 솔로 드릴' : run.practiceSetup.after === 'timer' ? ' → 마무리 반복' : ''}
              </p>
            )}
            <div className="modal-actions modal-actions--start" style={{ marginTop: 10 }}>
              <button className="btn btn-primary" onClick={confirmPractice} data-testid="coach-posture-start">
                자세 확인 — 실습 시작
              </button>
            </div>
          </div>
        )}

        {run.step === 'mitt' && mittCombo && run.mittPlan && (
          <div data-testid="coach-mitt" data-type={run.mittPlan.type}>
            <div className="card info-card" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>
                🥊 AI Visualizing Mitt · {run.mittPlan.type === 'setup' ? '셋업' : '콤보'}: {run.mittPlan.name}
              </h3>
              <p className="video-status-message" style={{ margin: '4px 0 0' }}>
                {run.mittPlan.purpose} · {run.mittPlan.reason}
              </p>
              {run.mittPlan.asPractice && planItem && (
                <p className="video-status-message" data-testid="coach-plan-instruction" style={{ margin: '4px 0 0' }}>
                  {planItem.instruction}
                </p>
              )}
              {run.mittPlan.stepNotes.some((n) => n.opponentReaction) && (
                <ol className="coach-class-steps">
                  {run.mittPlan.stepNotes.map((n, i) => (
                    <li key={i}>
                      {mittCombo.steps[i]?.technique.name}
                      {n.note ? ` — ${n.note}` : ''}
                      {n.opponentReaction ? ` (예상 반응: ${n.opponentReaction})` : ''}
                    </li>
                  ))}
                </ol>
              )}
              {run.mittPlan.source === 'ai' && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    saveMittCombo(run.mittPlan!.name, run.mittPlan!.techniqueIds, 'orthodox', {
                      type: run.mittPlan!.type,
                      purpose: run.mittPlan!.purpose,
                      repetitions: run.mittPlan!.repetitions,
                      speed: run.mittPlan!.speed,
                      coachingNote: run.mittPlan!.coachingNote,
                      stepNotes: run.mittPlan!.stepNotes,
                      source: 'ai',
                    })
                  }
                  data-testid="coach-mitt-save"
                >
                  콤보 북에 저장
                </button>
              )}
            </div>
            <ComboVideoPanel techniques={mittCombo.steps.map((x) => x.technique)} comboName={run.mittPlan.name} />
            <MittRunner
              key={`${run.mittPlan.name}:${run.mittPlan.techniqueIds.join('+')}`}
              combo={mittCombo}
              repetitions={run.mittPlan.repetitions}
              speed={run.mittPlan.speed}
              onLastRep={() => appendMessages([{ role: 'coach', kind: 'cue', text: '마지막 1회입니다.' }])}
              onDone={finishMitt}
            />
          </div>
        )}

        {run.step === 'drill' && run.drillPlan && (
          <div data-testid="coach-drill">
            <div className="card info-card" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>🤼 솔로 드릴 · {current ? displayName(current) : ''}</h3>
              <p className="video-status-message" style={{ margin: '4px 0 0' }}>
                {run.drillPlan.group === 'standing' ? '스탠딩 자세에서 시작합니다.' : '바닥에 누운/앉은 자세에서 시작합니다.'} 구령을 듣는 즉시 움직이고, 동작 뒤에는 바로 자세를 회복해 주세요.
              </p>
              {planItem && (
                <p className="video-status-message" data-testid="coach-plan-instruction" style={{ margin: '4px 0 0' }}>
                  {planItem.instruction}
                </p>
              )}
            </div>
            <SoloDrillRunner
              key={`${run.drillPlan.techniqueId}:${run.index}`}
              cues={run.drillPlan.cues}
              focusId={run.drillPlan.focusId}
              seconds={run.drillPlan.seconds}
              pace={run.drillPlan.pace}
              voice
              onDone={finishDrill}
            />
          </div>
        )}

        {run.step === 'practice' && run.practice && (
          <div className="card info-card text-center" data-testid="coach-timer">
            <h3>{current ? displayName(current) : ''} 실습</h3>
            {planItem && (
              <p className="video-status-message" data-testid="coach-plan-instruction" style={{ margin: '0 0 6px' }}>
                {planItem.instruction}
                {planItem.soloAlternative ? ` · 없으면: ${planItem.soloAlternative}` : ''}
              </p>
            )}
            <div className="timer-display" data-testid="coach-timer-display">
              {formatMMSS(remaining)}
            </div>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              {run.practice.paused ? (
                <button className="btn btn-primary" onClick={() => resumePractice()}>
                  ▶ 재개
                </button>
              ) : (
                <button className="btn btn-secondary" onClick={() => pausePractice()}>
                  ⏸ 일시정지
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => stopPracticeEarly()}>
                ■ 여기서 끝내기
              </button>
            </div>
          </div>
        )}

        {run.step === 'summary' && summary && (
          <div className="card info-card" data-testid="coach-summary">
            <h3>🎉 오늘의 학습 요약</h3>
            <p style={{ margin: '4px 0' }}>총 실습 시간: {formatMMSS(summary.practicedSeconds * 1000)}</p>
            <ul style={{ paddingLeft: 18, margin: '4px 0' }}>
              {run.techniqueIds.map((id) => {
                const t = resolveTechnique(id);
                const o = run.outcomes[id];
                return (
                  <li key={id}>
                    {t ? displayName(t) : id} — {o.completed ? '✅ 완료' : o.practicedSeconds > 0 ? `⏹ ${formatMMSS(o.practicedSeconds * 1000)} 연습 후 중단` : '⏭ 연습 안 함'}
                    {o.understanding
                      ? ` · 이해도: ${STATUS_LABEL[o.understanding]}`
                      : o.quiz === 'correct'
                        ? ' · 복습 질문 정답'
                        : o.quiz === 'incorrect'
                          ? ' · 복습 질문 오답'
                          : ''}
                    {run.lessons?.[id] && (() => {
                      const weak = Object.entries(run.lessons![id].understanding.concepts).filter(([, c]) => c.status !== 'understood');
                      const ctx = t ? lessonContextFor(t) : null;
                      return weak.length && ctx ? <span data-testid="coach-summary-review"> (다시 볼 부분: {weak.map(([cid]) => ctx.concepts.find((c) => c.id === cid)?.label ?? cid).join(', ')})</span> : null;
                    })()}
                  </li>
                );
              })}
            </ul>
            {summary.reviewTechniqueIds.length > 0 && (
              <p style={{ margin: '4px 0' }}>
                복습이 필요한 기술: {summary.reviewTechniqueIds.map((id) => resolveTechnique(id)).filter(Boolean).map((t) => displayName(t!)).join(', ')}
              </p>
            )}
            <p className="video-status-message">
              {summary.historyEntryId ? `학습 기록에 저장했습니다${summary.allCompleted ? ' · Day 완료로 표시했습니다' : ''}.` : '실습한 기술이 없어 학습 기록은 저장하지 않았습니다.'}
            </p>
            <div className="modal-actions modal-actions--start">
              {summary.historyEntryId && (
                <Link to={`/training-analytics/${summary.historyEntryId}`} className="btn btn-secondary">
                  학습 기록 보기
                </Link>
              )}
              <Link to={`/learning/${curriculum.martialArt}/${curriculum.id}`} className="btn btn-primary" onClick={() => clearCoachDayRun()}>
                커리큘럼으로
              </Link>
            </div>
          </div>
        )}

        {run.step !== 'summary' && (
          <div className="card info-card coach-input" data-testid="coach-input">
            {mode === 'voice' && (
              <>
                <button
                  type="button"
                  className={`btn ${recording ? 'btn-primary coach-mic--on' : 'btn-secondary'} coach-mic`}
                  disabled={!voiceInputOk || transcribing || busy}
                  onClick={() => void toggleMic()}
                  data-testid="coach-mic"
                >
                  {recording ? '■ 말하기 끝' : transcribing ? '알아듣는 중…' : speaking ? '🎙 AI 튜터의 말을 멈추고 말하기' : '🎙 눌러서 말하기'}
                </button>
                <span className="video-status-message" data-testid="coach-mic-phase" data-phase={micPhase} style={{ marginLeft: 8 }}>
                  {micPhase === 'listening' ? PHASE_LABEL.listening : micPhase === 'requesting' || micPhase === 'recognizing' ? PHASE_LABEL[micPhase] : speaking ? 'AI 튜터가 말하는 중입니다.' : ''}
                </span>
                {recording && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={voice.cancel} data-testid="coach-mic-cancel">
                    취소
                  </button>
                )}
                {micPhase === 'listening' && voice.level >= 0 && <LevelMeter level={voice.level} />}
                {!voiceInputOk && (
                  <p className="video-status-message" data-testid="coach-mic-off-reason">
                    이 기기에서는 음성 입력을 사용할 수 없습니다. 아래 입력창에 적어서 대화해 주세요.
                  </p>
                )}
                <VoiceInputPanel voice={voice} testIdPrefix="coach-voice" />
              </>
            )}
            <div className="modal-actions modal-actions--start" style={{ marginTop: mode === 'voice' ? 8 : 0 }}>
              <input
                className="select"
                style={{ flex: 1 }}
                data-testid="coach-text-input"
                ref={inputRef}
                placeholder={awaiting ? '답을 입력해 주세요 — 궁금한 점은 언제든 물어봐 주세요' : '코치에게 질문하시거나 "준비됐어"라고 입력해 주세요'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    void handleUserText(input);
                    setInput('');
                  }
                }}
              />
              <button
                className="btn btn-secondary btn-sm"
                disabled={busy || !input.trim()}
                onClick={() => {
                  void handleUserText(input);
                  setInput('');
                }}
              >
                보내기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
