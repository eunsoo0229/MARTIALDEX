import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { getUnifiedMartialArt } from '../lib/userTechniques/service';
import { getCurriculum, resolveTodayDay } from '../lib/curriculum/curriculumService';
import { useCurriculumProgress } from '../lib/curriculum/useCurriculum';
import { STYLE_CURRICULUM_MARTIAL_ART } from '../lib/fighterStyle/styleCurriculumService';
import { mmaCurriculumLabel, mmaCurriculumLinkTarget } from '../lib/mmaCurriculum/breadcrumb';
import { getTodaySession, startCurriculumDayTraining } from '../lib/todayTraining/sessionStore';
import BackButton from '../components/BackButton';
import TutorVoiceSettingsPanel from '../components/TutorVoiceSettingsPanel';
import CoachLocationPicker from '../components/CoachLocationPicker';
import type { CoachLocation } from '../lib/aiCoachCurriculum/types';
import { LOCATION_ICON, LOCATION_LABEL } from '../lib/aiCoachCurriculum/location';

// The single "훈련하기" entry point for every curriculum — official, custom,
// or AI 선수 스타일 alike. No curriculum-source branching: this page and
// startCurriculumDayTraining() only ever look at plain Curriculum/
// CurriculumDay fields, so any curriculum that can render a day-list can
// also be trained here.
export default function CurriculumTrainingStart() {
  const { martialArtId = '', curriculumId = '' } = useParams();
  const navigate = useNavigate();
  const curriculum = getCurriculum(curriculumId);
  const { progress } = useCurriculumProgress(curriculum);
  const [showDayPicker, setShowDayPicker] = useState(false);
  // "Day N 훈련 시작" now asks HOW to learn first: 혼자 하기 (the existing
  // flow, unchanged) or AI 코치와 하기 (voice or text).
  const [chooserDay, setChooserDay] = useState<number | null>(null);
  const [coachChoice, setCoachChoice] = useState(false);
  // AI 코치 branch: 장소(집/체육관) first, then 말로/입력으로. An AI 코치 수업
  // curriculum already fixed its place at creation, so it skips straight to mode.
  const [place, setPlace] = useState<{ location: CoachLocation; equipment: string[] } | null>(null);

  if (!curriculum || curriculum.martialArt !== martialArtId) {
    return <Navigate to={martialArtId ? `/learning/${martialArtId}` : '/learning'} replace />;
  }

  const art = getUnifiedMartialArt(curriculum.martialArt);
  const artLabel = curriculum.martialArt === STYLE_CURRICULUM_MARTIAL_ART ? mmaCurriculumLabel(curriculum) : art?.nameKo ?? curriculum.martialArt;
  const todayDay = resolveTodayDay(curriculum);
  const completedSet = new Set(progress?.completedDays ?? []);

  function beginTraining(day: number) {
    const existing = getTodaySession();
    if (existing && !existing.finishedAt && (existing.plan.curriculumId !== curriculum!.id || existing.plan.day !== day)) {
      const ok = window.confirm(
        '진행 중인 다른 훈련이 있습니다. 지금 새 훈련을 시작하면 그 진행 상황은 저장되지 않고 사라집니다. 계속할까요?'
      );
      if (!ok) return;
    }
    const started = startCurriculumDayTraining(curriculum!, day);
    if (!started) return;
    navigate('/today-training');
  }

  function openChooser(day: number) {
    setChooserDay(day);
    setCoachChoice(false);
    setPlace(null);
  }

  const fixedPlace = curriculum.aiCoachMeta ? { location: curriculum.aiCoachMeta.location, equipment: curriculum.aiCoachMeta.equipment } : null;
  const coachPlace = fixedPlace ?? place;

  function beginCoach(day: number, mode: 'voice' | 'text') {
    const q = new URLSearchParams({ mode });
    if (coachPlace && !fixedPlace) {
      q.set('place', coachPlace.location);
      if (coachPlace.equipment.length) q.set('equip', coachPlace.equipment.join(','));
    }
    navigate(`/learning/${curriculum!.martialArt}/${curriculum!.id}/coach/${day}?${q.toString()}`);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/learning">학습</Link>
          <span>/</span>
          <Link to={curriculum.martialArt === STYLE_CURRICULUM_MARTIAL_ART ? mmaCurriculumLinkTarget(curriculum) : `/learning/${curriculum.martialArt}`}>
            {artLabel}
          </Link>
          <span>/</span>
          <Link to={`/learning/${curriculum.martialArt}/${curriculum.id}`}>{curriculum.title}</Link>
          <span>/</span>
          <span>훈련 시작</span>
        </div>

        <div className="section-title">
          <h2>🔥 훈련 시작</h2>
        </div>
        <p className="detail-hero__korean">{curriculum.title}</p>

        <div className="card info-card">
          <h3>현재 진행: Day {todayDay}</h3>
          {progress && (
            <div className="progress-track" style={{ margin: '8px 0' }}>
              <div className="progress-fill" style={{ width: `${progress.progress}%` }} />
            </div>
          )}
          <div className="modal-actions modal-actions--start">
            <button className="btn btn-primary" onClick={() => openChooser(todayDay)}>
              Day {todayDay} 훈련 시작
            </button>
          </div>
        </div>

        {chooserDay !== null && (
          <div className="card info-card" data-testid="day-start-chooser">
            <h3>Day {chooserDay} 어떻게 학습할까요?</h3>
            {!coachChoice ? (
              <div className="day-start-options">
                <button className="btn btn-primary day-start-option" onClick={() => beginTraining(chooserDay)}>
                  🙋 혼자 하기
                  <span className="day-start-option__desc">기존 방식대로 세트·타이머로 훈련합니다.</span>
                </button>
                <button className="btn btn-secondary day-start-option" onClick={() => setCoachChoice(true)}>
                  🧑‍🏫 AI 코치와 하기
                  <span className="day-start-option__desc">코치가 기술을 설명하고 영상·질문·타이머로 연습을 이끌어 줍니다.</span>
                </button>
              </div>
            ) : !coachPlace ? (
              <CoachLocationPicker onConfirm={(location, equipment) => setPlace({ location, equipment })} onBack={() => setCoachChoice(false)} />
            ) : (
              <div className="day-start-options">
                <p className="video-status-message" data-testid="day-start-place" style={{ margin: 0 }}>
                  {LOCATION_ICON[coachPlace.location]} {LOCATION_LABEL[coachPlace.location]}
                  {fixedPlace ? ' (이 수업의 장소)' : ''}
                </p>
                <details className="coach-voice-settings" data-testid="prestart-voice-settings">
                  <summary>🔊 말로 대화할 때의 AI 튜터 음성 · 말하기 속도</summary>
                  <TutorVoiceSettingsPanel autoSave />
                </details>
                <button className="btn btn-primary day-start-option" onClick={() => beginCoach(chooserDay, 'voice')}>
                  🎙 말로 대화
                  <span className="day-start-option__desc">마이크로 질문하고 코치의 답을 음성으로 듣습니다.</span>
                </button>
                <button className="btn btn-secondary day-start-option" onClick={() => beginCoach(chooserDay, 'text')}>
                  ⌨️ 입력으로 대화
                  <span className="day-start-option__desc">채팅처럼 입력하고 글로 답을 받습니다.</span>
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => (fixedPlace ? setCoachChoice(false) : setPlace(null))}>
                  ← 뒤로
                </button>
              </div>
            )}
          </div>
        )}

        {!showDayPicker ? (
          <button className="btn btn-ghost" onClick={() => setShowDayPicker(true)}>
            다른 Day로 훈련하기
          </button>
        ) : (
          <div className="card info-card">
            <h3>Day 선택</h3>
            <div className="chip-row" style={{ flexWrap: 'wrap' }}>
              {curriculum.days.map((d) => (
                <button
                  key={d.day}
                  className={`chip${d.day === todayDay ? ' active' : ''}`}
                  onClick={() => openChooser(d.day)}
                >
                  Day {d.day}
                  {completedSet.has(d.day) ? ' ✓' : ''}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
