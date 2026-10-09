import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listTrainingHistory } from '../lib/trainingHistory/service';
import { useTrainingHistory } from '../lib/trainingHistory/useTrainingHistory';
import { groupHistoryByDate, sortEntriesNewestFirst } from '../lib/trainingAnalytics/historyView';
import { computeCalendarMonth } from '../lib/trainingAnalytics/calendarData';
import { computeTrainingReport } from '../lib/trainingAnalytics/report';
import { getAiTrainingAnalysis } from '../lib/trainingAnalytics/aiAnalysis';
import type { AiTrainingAnalysis } from '../lib/trainingAnalytics/aiAnalysis';
import TrainingCalendarView from '../components/TrainingCalendarView';
import TrainingEntryRow from '../components/TrainingEntryRow';
import DonutChart from '../components/DonutChart';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

const DONUT_COLORS = ['#9c2b2b', '#a3792f', '#2f7a4f', '#2f6f9c', '#7c4a9c', '#c2703f', '#3f9c8f', '#9c3f7c', '#5f5f9c'];
const RECENT_LIMIT = 8;

export default function TrainingAnalytics() {
  useTrainingHistory();
  const navigate = useNavigate();
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [reportPeriod, setReportPeriod] = useState<'7d' | '30d'>('7d');
  const [aiAnalysis, setAiAnalysis] = useState<AiTrainingAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const allEntries = listTrainingHistory();
  const recentGroups = useMemo(() => groupHistoryByDate(sortEntriesNewestFirst(allEntries).slice(0, RECENT_LIMIT)), [allEntries]);
  const calendarDays = useMemo(() => computeCalendarMonth(allEntries, calendarYear, calendarMonth), [allEntries, calendarYear, calendarMonth]);
  const selectedDayEntries = useMemo(() => (selectedDate ? allEntries.filter((e) => e.date === selectedDate && e.completed) : []), [allEntries, selectedDate]);
  const martialArtBalance = useMemo(() => computeTrainingReport('30d', allEntries).martialArtBreakdown, [allEntries]);
  const report = useMemo(() => computeTrainingReport(reportPeriod, allEntries), [reportPeriod, allEntries]);

  function goPrevMonth() {
    const d = new Date(calendarYear, calendarMonth - 1, 1);
    setCalendarYear(d.getFullYear());
    setCalendarMonth(d.getMonth());
    setSelectedDate(null);
  }
  function goNextMonth() {
    const d = new Date(calendarYear, calendarMonth + 1, 1);
    setCalendarYear(d.getFullYear());
    setCalendarMonth(d.getMonth());
    setSelectedDate(null);
  }

  async function handleGetAiAnalysis() {
    setAiLoading(true);
    setAiNotice(null);
    try {
      const result = await getAiTrainingAnalysis();
      setAiAnalysis(result);
      if (result.source === 'fallback') setAiNotice('AI 분석을 불러오지 못해 실제 기록 기반 기본 요약을 표시합니다.');
    } catch {
      setAiNotice('AI 훈련 분석을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>훈련 분석</span>
        </div>

        <div className="section-title">
          <h2>📊 훈련 분석</h2>
          <Link to="/training-analytics/history" className="see-all">
            전체 기록 보기 →
          </Link>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          실제 저장된 Training Session 기록을 기반으로 한 참고용 분석입니다.
        </p>

        {allEntries.length === 0 ? (
          <EmptyState icon="📊" text="아직 표시할 훈련 기록이 없습니다. 훈련을 완료하면 여기에 표시됩니다." />
        ) : (
          <>
            <div className="card info-card">
              <h3>🕓 최근 훈련</h3>
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
            </div>

            <div className="card info-card">
              <h3>📅 훈련 캘린더</h3>
              <TrainingCalendarView
                year={calendarYear}
                month={calendarMonth}
                days={calendarDays}
                selectedDate={selectedDate}
                onSelectDate={(d) => setSelectedDate(d === selectedDate ? null : d)}
                onPrevMonth={goPrevMonth}
                onNextMonth={goNextMonth}
              />
              {selectedDate && (
                <div style={{ marginTop: 12 }}>
                  <div className="field-label">{selectedDate} 훈련 목록</div>
                  {selectedDayEntries.length === 0 ? (
                    <p className="video-status-message">이 날짜에는 훈련 기록이 없습니다.</p>
                  ) : (
                    <div className="stack gap-2" style={{ marginTop: 6 }}>
                      {selectedDayEntries.map((entry) => (
                        <TrainingEntryRow key={entry.id} entry={entry} compact onClick={() => navigate(`/training-analytics/${entry.id}`)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {martialArtBalance.length > 0 && (
              <div className="card info-card">
                <h3>🥋 무술별 훈련 밸런스 (최근 30일)</h3>
                <DonutChart
                  slices={martialArtBalance.map((s, i) => ({ key: s.martialArtId, label: s.nameKo, value: s.trainingCount, color: DONUT_COLORS[i % DONUT_COLORS.length] }))}
                />
              </div>
            )}

            <div className="card info-card">
              <h3>🗒 주간 / 월간 리포트</h3>
              <div className="chip-row">
                <button className={`chip ${reportPeriod === '7d' ? 'active' : ''}`} onClick={() => setReportPeriod('7d')}>
                  주간
                </button>
                <button className={`chip ${reportPeriod === '30d' ? 'active' : ''}`} onClick={() => setReportPeriod('30d')}>
                  월간
                </button>
              </div>
              <div className="curriculum-stat-row">
                <div>
                  <strong>{report.totalMinutes}분</strong>
                  <span>총 훈련 시간</span>
                </div>
                <div>
                  <strong>{report.completedSets}</strong>
                  <span>완료 세트</span>
                </div>
                <div>
                  <strong>{report.trainingDays}일</strong>
                  <span>훈련 일수</span>
                </div>
              </div>

              {report.topTechniques.length > 0 && (
                <>
                  <div className="field-label" style={{ marginTop: 12 }}>
                    🥋 가장 많이 훈련한 기술 TOP {report.topTechniques.length}
                  </div>
                  <ol className="top-trained-list">
                    {report.topTechniques.map((t) => (
                      <li key={t.techniqueId}>
                        {t.name} — {t.count}회
                      </li>
                    ))}
                  </ol>
                </>
              )}

              {report.topGymExercises.length > 0 && (
                <>
                  <div className="field-label" style={{ marginTop: 12 }}>
                    🏋️ 가장 많이 훈련한 헬스 TOP {report.topGymExercises.length}
                  </div>
                  <ol className="top-trained-list">
                    {report.topGymExercises.map((t) => (
                      <li key={t.techniqueId}>
                        {t.name} — {t.count}회
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {(report.topTechniques.length > 0 || report.topGymExercises.length > 0) && (
                <p className="technique-row__sub">횟수 = 해당 기술/운동이 포함된 훈련 세션 수</p>
              )}

              {report.curriculumCompletionRates.length > 0 && (
                <>
                  <div className="field-label" style={{ marginTop: 12 }}>
                    커리큘럼 달성률
                  </div>
                  <div className="stack gap-2">
                    {report.curriculumCompletionRates.map((c) => (
                      <div key={c.curriculumId} className="pose-history-row__main" style={{ cursor: 'default' }}>
                        <span>{c.title}</span>
                        <span>{c.progress}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {report.martialArtBreakdown.length > 0 && (
                <>
                  <div className="field-label" style={{ marginTop: 12 }}>
                    무술별 훈련 비율
                  </div>
                  <div className="chip-row">
                    {report.martialArtBreakdown.map((s) => (
                      <span key={s.martialArtId} className="chip">
                        {s.nameKo} {s.trainingCount}회
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="card info-card">
              <h3>🤖 AI 훈련 분석</h3>
              <p className="video-status-message" style={{ marginTop: -6 }}>
                실제 훈련 기록을 바탕으로 패턴을 분석합니다. 의료적 진단이나 부상 판단은 제공하지 않습니다.
              </p>
              <button className="btn btn-primary btn-sm" onClick={handleGetAiAnalysis} disabled={aiLoading}>
                {aiLoading ? '분석 중…' : aiAnalysis ? 'AI 분석 다시 받기' : 'AI 분석 받기'}
              </button>
              {aiNotice && <div className="ai-inline-warning">{aiNotice}</div>}
              {aiAnalysis && (
                <div className="stack gap-2" style={{ marginTop: 10 }}>
                  <div>
                    <div className="field-label">최근 훈련 패턴</div>
                    <p style={{ margin: 0 }}>{aiAnalysis.recentPattern}</p>
                  </div>
                  {aiAnalysis.frequentTechniques && (
                    <div>
                      <div className="field-label">자주 훈련하는 기술</div>
                      <p style={{ margin: 0 }}>{aiAnalysis.frequentTechniques}</p>
                    </div>
                  )}
                  {aiAnalysis.underTrainedAreas && (
                    <div>
                      <div className="field-label">상대적으로 적게 훈련한 영역</div>
                      <p style={{ margin: 0 }}>{aiAnalysis.underTrainedAreas}</p>
                    </div>
                  )}
                  {aiAnalysis.curriculumStatus && (
                    <div>
                      <div className="field-label">현재 커리큘럼 진행 상황</div>
                      <p style={{ margin: 0 }}>{aiAnalysis.curriculumStatus}</p>
                    </div>
                  )}
                  <div>
                    <div className="field-label">다음 훈련 방향 제안</div>
                    <p style={{ margin: 0 }}>{aiAnalysis.nextSuggestion}</p>
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
