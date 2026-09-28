import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProfileStats } from '../lib/profileStats/useProfileStats';
import { listTrainingHistory } from '../lib/trainingHistory/service';
import { useTrainingHistory } from '../lib/trainingHistory/useTrainingHistory';
import { groupHistoryByDate, sortEntriesNewestFirst } from '../lib/trainingAnalytics/historyView';
import { computeCalendarMonth } from '../lib/trainingAnalytics/calendarData';
import { computeTrainingReport } from '../lib/trainingAnalytics/report';
import { computeDashboardInsight } from '../lib/trainingAnalytics/dashboardInsight';
import TrainingCalendarView from '../components/TrainingCalendarView';
import TrainingEntryRow from '../components/TrainingEntryRow';
import DonutChart from '../components/DonutChart';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

const DONUT_COLORS = ['#9c2b2b', '#a3792f', '#2f7a4f', '#2f6f9c', '#7c4a9c', '#c2703f', '#3f9c8f', '#9c3f7c', '#5f5f9c'];
const RECENT_LIMIT = 5;

export default function Dashboard() {
  // useTrainingHistory() keeps this page reactive to new sessions; the
  // underlying list read is the SAME repository call every other training
  // page already makes — no separate/duplicated data store for the
  // Dashboard (spec section: "데이터를 중복 저장하지 않는다").
  useTrainingHistory();
  const { stats, level, rank, achievements } = useProfileStats();
  const navigate = useNavigate();
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth());

  // A single listTrainingHistory() read, reused below for both the recent
  // list and the calendar — never re-fetched per section. The 30-day report
  // (used for both the donut chart and curriculum completion rates) is
  // likewise computed once, not twice, and nothing outside a 30-day/recent
  // window (e.g. full pose-analysis or sparring history) is loaded here at
  // all, since the Dashboard doesn't display it (spec: "불필요한 전체
  // 데이터를 한 번에 로드하지 않는다").
  const allEntries = listTrainingHistory();
  const recentGroups = useMemo(() => groupHistoryByDate(sortEntriesNewestFirst(allEntries).slice(0, RECENT_LIMIT)), [allEntries]);
  const calendarDays = useMemo(() => computeCalendarMonth(allEntries, calendarYear, calendarMonth), [allEntries, calendarYear, calendarMonth]);
  const report30d = useMemo(() => computeTrainingReport('30d', allEntries), [allEntries]);
  const report7d = useMemo(() => computeTrainingReport('7d', allEntries), [allEntries]);
  const insight = useMemo(() => computeDashboardInsight(report7d), [report7d]);
  const unlockedBadgeCount = achievements.filter((a) => a.unlocked).length;
  const overallProgressPct = level.xpForNextLevel !== null ? Math.min(100, Math.round((level.xpIntoLevel / level.xpForNextLevel) * 100)) : 100;

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

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>대시보드</span>
        </div>

        <div className="section-title">
          <h2>🏠 대시보드</h2>
          <Link to="/profile" className="see-all">
            프로필 (구매·판매·업적) →
          </Link>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          MARTIALDEX의 실제 저장된 데이터를 한 화면에서 확인합니다.
        </p>

        <div className="card info-card">
          <h3>👤 프로필</h3>
          <div className="chip-row">
            <span className="chip active">🥋 {rank.title}</span>
            <span className="chip">Level {level.level}</span>
            <span className="chip">🏆 {unlockedBadgeCount}/{achievements.length} 배지</span>
            {stats.currentStreak > 0 && <span className="chip">🔥 {stats.currentStreak}일 연속</span>}
          </div>
          <div className="progress-track" style={{ marginTop: 8 }}>
            <div className="progress-fill" style={{ width: `${overallProgressPct}%` }} />
          </div>
          <p className="video-status-message">전체 진행률 {overallProgressPct}% (다음 랭크까지)</p>
          <div className="modal-actions modal-actions--start" style={{ marginTop: 6 }}>
            <Link to="/profile" className="btn btn-secondary btn-sm">
              프로필 전체 보기 →
            </Link>
          </div>
        </div>

        <div className="card info-card">
          <h3>📘 진행 중인 커리큘럼</h3>
          {report30d.curriculumCompletionRates.length === 0 ? (
            <EmptyState icon="📘" text="진행 중인 커리큘럼이 없습니다." />
          ) : (
            <div className="stack gap-2">
              {report30d.curriculumCompletionRates.map((c) => (
                <div key={c.curriculumId} className="pose-history-row__main" style={{ cursor: 'default' }}>
                  <span>{c.title}</span>
                  <span>{c.progress}% 달성</span>
                </div>
              ))}
            </div>
          )}
          <div className="modal-actions modal-actions--start" style={{ marginTop: 6 }}>
            <Link to="/learning" className="btn btn-secondary btn-sm">
              학습 허브로 이동 →
            </Link>
          </div>
        </div>

        <div className="card info-card">
          <div className="section-title" style={{ marginBottom: 6 }}>
            <h3>🕓 최근 훈련</h3>
            <Link to="/training-analytics/history" className="see-all">
              전체 기록 보기 →
            </Link>
          </div>
          {recentGroups.length === 0 ? (
            <EmptyState icon="🕓" text="아직 훈련 기록이 없습니다." />
          ) : (
            <div className="stack gap-2">
              {recentGroups.map((group) => (
                <div key={group.dateKey}>
                  <div className="field-label" style={{ marginBottom: 6 }}>
                    {group.label}
                  </div>
                  <div className="stack gap-2">
                    {group.entries.map((entry) => (
                      <TrainingEntryRow key={entry.id} entry={entry} onClick={() => navigate(`/training-analytics/${entry.id}`)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card info-card">
          <h3>📅 훈련 캘린더</h3>
          <TrainingCalendarView
            year={calendarYear}
            month={calendarMonth}
            days={calendarDays}
            selectedDate={null}
            onSelectDate={() => navigate('/training-analytics')}
            onPrevMonth={goPrevMonth}
            onNextMonth={goNextMonth}
          />
          <p className="video-status-message">날짜를 클릭하면 훈련 분석 화면에서 자세히 볼 수 있습니다.</p>
        </div>

        {report30d.martialArtBreakdown.length > 0 && (
          <div className="card info-card">
            <h3>🥋 무술별 훈련 밸런스 (최근 30일)</h3>
            <DonutChart
              slices={report30d.martialArtBreakdown.map((s, i) => ({ key: s.martialArtId, label: s.nameKo, value: s.trainingCount, color: DONUT_COLORS[i % DONUT_COLORS.length] }))}
            />
          </div>
        )}

        <div className="card info-card">
          <h3>💡 AI 인사이트</h3>
          {insight ? (
            <p style={{ margin: 0 }}>{insight}</p>
          ) : (
            <EmptyState icon="💡" text="아직 인사이트를 만들 만한 훈련 기록이 없습니다." />
          )}
          <div className="modal-actions modal-actions--start" style={{ marginTop: 6 }}>
            <Link to="/training-analytics" className="btn btn-ghost btn-sm">
              더 자세한 AI 훈련 분석 보기 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
