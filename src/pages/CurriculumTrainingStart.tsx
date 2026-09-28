import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { getUnifiedMartialArt } from '../lib/userTechniques/service';
import { getCurriculum, resolveTodayDay } from '../lib/curriculum/curriculumService';
import { useCurriculumProgress } from '../lib/curriculum/useCurriculum';
import { STYLE_CURRICULUM_MARTIAL_ART } from '../lib/fighterStyle/styleCurriculumService';
import { mmaCurriculumLabel, mmaCurriculumLinkTarget } from '../lib/mmaCurriculum/breadcrumb';
import { getTodaySession, startCurriculumDayTraining } from '../lib/todayTraining/sessionStore';
import BackButton from '../components/BackButton';

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
            <button className="btn btn-primary" onClick={() => beginTraining(todayDay)}>
              Day {todayDay} 훈련 시작
            </button>
          </div>
        </div>

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
                  onClick={() => beginTraining(d.day)}
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
