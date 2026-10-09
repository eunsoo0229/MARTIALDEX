import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTrainingHistory } from '../lib/trainingHistory/useTrainingHistory';
import { useTodayTraining } from '../lib/todayTraining/useTodayTraining';
import { getGymRoutine } from '../lib/gymRoutine/service';
import GymRoutineDayPicker, { canPickOtherRoutineDay } from '../components/GymRoutineDayPicker';
import { formatVolumeCompact, sumVolumeKg, volumeForKstMonth, volumeForKstWeek } from '../lib/gymTraining/volume';
import { computeMonthlyVolumeGrowth } from '../lib/gymTraining/growthRate';
import { computeAllBodyPartRecovery, GYM_BODY_PART_LABEL } from '../lib/gymTraining/recovery';
import { computeCalendarMonth } from '../lib/trainingAnalytics/calendarData';
import { WEEKDAY_LABEL, todayDateKey } from '../lib/dateUtil';
import TrainingCalendarView from '../components/TrainingCalendarView';
import TrainingEntryRow from '../components/TrainingEntryRow';
import BodyPartMap from '../components/BodyPartMap';
import BackButton from '../components/BackButton';
import EmptyState from '../components/EmptyState';

const RECENT_LIMIT = 5;

export default function TrainingHub() {
  const navigate = useNavigate();
  // Stable reference (only changes when training history actually changes,
  // via useSynced's setState-on-event pattern) — every useMemo below keys
  // directly on this, never on a re-filtered/re-derived intermediate array,
  // avoiding the broken-memo-dependency bug found in SkillTree.tsx.
  const allEntries = useTrainingHistory();
  const { plan } = useTodayTraining();
  // Resolved by the plan's OWN gymRoutineId — never by independently asking
  // "which routine is active right now" (getActiveGymRoutine()). Once a
  // session starts, `plan` freezes to whatever routine built it; a live
  // "currently active routine" lookup can disagree the moment the user
  // switches routines mid-session, showing a DIFFERENT routine's name above
  // the still-frozen old routine's exercise list. See TodayTrainingPlan.gymRoutineId's doc comment.
  const planRoutine = plan.gymRoutineId ? getGymRoutine(plan.gymRoutineId) : undefined;

  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [routinePickerOpen, setRoutinePickerOpen] = useState(false);

  const todayVolume = useMemo(() => sumVolumeKg(allEntries.filter((e) => e.date === todayDateKey())), [allEntries]);
  const weekVolume = useMemo(() => volumeForKstWeek(allEntries), [allEntries]);
  const monthGrowth = useMemo(() => computeMonthlyVolumeGrowth(allEntries), [allEntries]);
  const recovery = useMemo(() => computeAllBodyPartRecovery(allEntries), [allEntries]);
  const calendarDays = useMemo(() => computeCalendarMonth(allEntries, calendarYear, calendarMonth), [allEntries, calendarYear, calendarMonth]);
  const recentEntries = useMemo(() => allEntries.slice(0, RECENT_LIMIT), [allEntries]);

  const selectedDayEntries = useMemo(
    () => (selectedDate ? allEntries.filter((e) => e.date === selectedDate) : []),
    [selectedDate, allEntries]
  );

  function goPrevMonth() {
    const d = new Date(calendarYear, calendarMonth - 1, 1);
    setCalendarYear(d.getFullYear());
    setCalendarMonth(d.getMonth());
  }
  function goNextMonth() {
    const d = new Date(calendarYear, calendarMonth + 1, 1);
    setCalendarYear(d.getFullYear());
    setCalendarMonth(d.getMonth());
  }

  const growthUp = monthGrowth.percent > 0;
  const growthDown = monthGrowth.percent < 0;

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>훈련</span>
        </div>
        <div className="section-title">
          <h2>🥋 훈련</h2>
        </div>
        <div className="chip-row" style={{ marginBottom: 16 }}>
          <Link to="/training/routines" className="chip">
            📅 요일별 루틴
          </Link>
          <Link to="/training/routines/manage" className="chip">
            🔀 루틴 관리
          </Link>
          <Link to="/training/exercises" className="chip">
            🏋️ 헬스 운동 목록
          </Link>
          <Link to="/free-training" className="chip">
            🥊 자유 훈련
          </Link>
          <Link to="/home-training" className="chip">
            💪 AI 맞춤 홈트 만들기
          </Link>
          <Link to="/gym" className="chip">
            🏛 체육관 수업
          </Link>
          <Link to="/sparring/record" className="chip">
            🎥 스파링 촬영
          </Link>
          <Link to="/training-analytics/history" className="chip">
            📜 전체 훈련 기록
          </Link>
        </div>

        {/* 1. 오늘의 훈련 */}
        <div className="card info-card">
          <h3>오늘의 훈련</h3>
          {plan.mode === 'no_data' ? (
            <p className="video-status-message">아직 훈련 계획이 없습니다. 커리큘럼을 시작하거나 요일별 루틴을 만들어보세요.</p>
          ) : (
            <>
              <p>{plan.dayTitle ?? plan.goal ?? '오늘의 훈련'}</p>
              <p className="technique-row__sub">
                {plan.techniqueIds.length}개 운동 · 약 {plan.estimatedMinutes}분
                {plan.gymRoutineId ? ` · 루틴: ${planRoutine?.name ?? '삭제된 루틴'}` : ''}
                {plan.gymRoutineSubstituted && plan.gymRoutineWeekday != null ? ` (${WEEKDAY_LABEL[plan.gymRoutineWeekday]}요일 루틴 불러옴)` : ''}
              </p>
            </>
          )}
          <div className="modal-actions modal-actions--start">
            <button className="btn btn-primary" onClick={() => navigate('/today-training')}>
              훈련 시작
            </button>
            {canPickOtherRoutineDay() && (
              <button className="btn btn-secondary" onClick={() => setRoutinePickerOpen(true)}>
                다른 요일 루틴으로 운동하기
              </button>
            )}
          </div>
          {routinePickerOpen && (
            <GymRoutineDayPicker
              onClose={() => setRoutinePickerOpen(false)}
              onStarted={() => {
                setRoutinePickerOpen(false);
                navigate('/today-training');
              }}
            />
          )}
        </div>

        {/* 2-3. 오늘/주간 볼륨 */}
        <div className="card info-card">
          <div className="gym-volume-row">
            <div>
              <strong>{formatVolumeCompact(todayVolume)}</strong>
              <span>오늘 운동 볼륨</span>
            </div>
            <div>
              <strong>{formatVolumeCompact(weekVolume)}</strong>
              <span>이번 주 볼륨</span>
            </div>
          </div>

          {/* 4-5. 이번 달 누적 볼륨(가장 크게) + 성장률 */}
          <div className="gym-volume-hero">
            <span className="gym-volume-hero__value">{formatVolumeCompact(monthGrowth.currentValue)}</span>
            <span className="gym-volume-hero__label">이번 달 누적 볼륨</span>
            <span className={`gym-growth-badge${growthUp ? ' gym-growth-badge--up' : growthDown ? ' gym-growth-badge--down' : ''}`}>
              {monthGrowth.percent > 0 ? '+' : ''}
              {monthGrowth.percent}% 지난 기간 대비
            </span>
          </div>

          <TrainingCalendarView
            year={calendarYear}
            month={calendarMonth}
            days={calendarDays}
            selectedDate={selectedDate}
            onSelectDate={(d) => setSelectedDate(d === selectedDate ? null : d)}
            onPrevMonth={goPrevMonth}
            onNextMonth={goNextMonth}
            showVolume
          />

          {selectedDate && (
            <div style={{ marginTop: 10 }}>
              <strong>{selectedDate}</strong>
              {selectedDayEntries.length === 0 ? (
                <p className="video-status-message">이 날짜에는 훈련 기록이 없습니다.</p>
              ) : (
                <div className="stack gap-2" style={{ marginTop: 6 }}>
                  {selectedDayEntries.map((entry) => (
                    <TrainingEntryRow key={entry.id} entry={entry} onClick={() => navigate(`/training-analytics/${entry.id}`)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 6. 회복도 */}
        <div className="section-title">
          <h2>회복도</h2>
        </div>
        <div className="card info-card">
          <BodyPartMap recovery={recovery} />
          <div className="gym-recovery-grid">
            {recovery.map((r) => (
              <button
                key={r.bodyPart}
                type="button"
                className="gym-recovery-grid__item"
                onClick={() => navigate(`/training/body/${r.bodyPart}`)}
              >
                <strong>{r.recoveryPercent}%</strong>
                <span>{GYM_BODY_PART_LABEL[r.bodyPart]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 7. 최근 운동 */}
        <div className="section-title">
          <h2>최근 운동</h2>
        </div>
        {recentEntries.length === 0 ? (
          <EmptyState icon="🥋" text="아직 훈련 기록이 없습니다." />
        ) : (
          <div className="stack gap-2">
            {recentEntries.map((entry) => (
              <TrainingEntryRow key={entry.id} entry={entry} onClick={() => navigate(`/training-analytics/${entry.id}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
