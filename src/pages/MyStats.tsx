import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PERIOD_LABEL, type PeriodKey } from '../lib/statsHub/types';
import { computeOverviewStats } from '../lib/statsHub/overviewStats';
import { computeMartialArtStats } from '../lib/statsHub/martialArtStats';
import { computeSparringStats } from '../lib/statsHub/sparringStats';
import { computeAverageScoreTrend, computeTrainingCountTrend, computeTrainingTimeTrend } from '../lib/statsHub/trendData';
import { getAiTrainingSummary } from '../lib/statsHub/aiSummaryService';
import type { AiTrainingSummary } from '../lib/statsHub/types';
import { useTrainingHistory } from '../lib/trainingHistory/useTrainingHistory';
import { useAllPoseRecords } from '../lib/poseAnalysis/usePoseRecords';
import { useSparringSessions } from '../lib/sparringAnalysis/useSparringSessions';
import TrendChart from '../components/TrendChart';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

const PERIOD_ORDER: PeriodKey[] = ['7d', '30d', '90d', 'all'];

export default function MyStats() {
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [aiSummary, setAiSummary] = useState<AiTrainingSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Reactive to any change in the underlying real stores (training history,
  // pose analysis records, sparring sessions). The compute* functions below
  // only take `period` as a parameter and read the stores internally, so
  // the array these hooks return isn't consumed directly — but it's still
  // a REQUIRED memo dependency: each hook returns a genuinely new array
  // reference only when its store actually changed, so listing it forces
  // the memo to recompute exactly when (and only when) it should. Omitting
  // it (the previous code did) meant a delete/edit re-rendered this
  // component but every stat stayed frozen at its last-computed value until
  // `period` was also touched — the same broken-memo-dependency bug found
  // in SkillTree.tsx.
  const historyEntries = useTrainingHistory();
  const poseRecords = useAllPoseRecords();
  const sparringSessions = useSparringSessions();

  const overview = useMemo(() => computeOverviewStats(period), [period, historyEntries]);
  const martialArtStats = useMemo(() => computeMartialArtStats(period), [period, historyEntries]);
  const sparringStats = useMemo(() => computeSparringStats(period), [period, sparringSessions]);
  const trainingTimeTrend = useMemo(() => computeTrainingTimeTrend(period), [period, historyEntries]);
  const trainingCountTrend = useMemo(() => computeTrainingCountTrend(period), [period, historyEntries]);
  const averageScoreTrend = useMemo(() => computeAverageScoreTrend(period), [period, poseRecords, sparringSessions]);

  async function handleGetSummary() {
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      const result = await getAiTrainingSummary(period);
      setAiSummary(result);
    } catch {
      setSummaryError('학습 요약을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoadingSummary(false);
    }
  }

  const hasAnyData = overview.trainingCount > 0 || overview.poseAnalysisCount > 0 || overview.sparringCount > 0;

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>나의 통계</span>
        </div>

        <div className="section-title">
          <h2>📊 나의 통계</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          훈련 기록, 카메라 자세 분석, 스파링 분석을 종합한 참고용 통계입니다. 실제 기록이 없는
          항목은 만들어내지 않고 표시하지 않습니다.
        </p>

        <div className="chip-row">
          {PERIOD_ORDER.map((p) => (
            <button key={p} className={`chip ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>

        {!hasAnyData ? (
          <EmptyState icon="📊" text="아직 이 기간에 표시할 학습 기록이 없습니다." />
        ) : (
          <>
            <div className="card info-card">
              <h3>현재 상태</h3>
              <div className="curriculum-stat-row">
                <div>
                  <strong>{overview.trainingCount}</strong>
                  <span>총 훈련 횟수</span>
                </div>
                <div>
                  <strong>{overview.totalMinutes}분</strong>
                  <span>총 훈련 시간</span>
                </div>
                <div>
                  <strong>{overview.techniquesLearnedCount}</strong>
                  <span>학습 기술 수</span>
                </div>
                <div>
                  <strong>{overview.currentProficientCount}</strong>
                  <span>현재 숙련 기술 수</span>
                </div>
                <div>
                  <strong>{overview.sparringCount}</strong>
                  <span>스파링 횟수</span>
                </div>
                <div>
                  <strong>{overview.poseAnalysisCount}</strong>
                  <span>분석 영상 수</span>
                </div>
              </div>
            </div>

            <div className="card info-card">
              <h3>🤖 AI 학습 요약</h3>
              <button className="btn btn-primary btn-sm" onClick={handleGetSummary} disabled={loadingSummary}>
                {loadingSummary ? '요약 생성 중…' : aiSummary ? '요약 다시 받기' : '이번 기간 요약 받기'}
              </button>
              {summaryError && <div className="ai-inline-warning">{summaryError}</div>}
              {aiSummary && (
                <>
                  <p style={{ marginTop: 10 }}>{aiSummary.summary}</p>
                  {aiSummary.source === 'fallback' && <p className="video-status-message">AI 요약을 불러오지 못해 기본 요약 문구를 표시하고 있습니다.</p>}
                </>
              )}
            </div>

            {trainingTimeTrend.length >= 2 && (
              <div className="card info-card">
                <h3>훈련 시간 추이</h3>
                <TrendChart points={trainingTimeTrend} variant="bar" unit="분" />
              </div>
            )}
            {trainingCountTrend.length >= 2 && (
              <div className="card info-card">
                <h3>훈련 횟수 추이</h3>
                <TrendChart points={trainingCountTrend} variant="bar" unit="회" />
              </div>
            )}
            {averageScoreTrend.length >= 2 && (
              <div className="card info-card">
                <h3>평균 자세 분석 점수 추이 (숙련도 변화 참고)</h3>
                <TrendChart points={averageScoreTrend} variant="line" unit="점" />
                <p className="video-status-message">
                  숙련도 등급 변화 이력은 별도로 기록하지 않아, 실제 분석 점수의 평균 추이로
                  대신 보여드립니다.
                </p>
              </div>
            )}

            {martialArtStats.length > 0 && (
              <div className="card info-card">
                <h3>무술별 통계</h3>
                <div className="stack gap-2">
                  {martialArtStats.map((s) => (
                    <div key={s.martialArtId} className="pose-history-row">
                      <div className="pose-history-row__main" style={{ cursor: 'default', flex: 1 }}>
                        <span>{s.nameKo}</span>
                        <span>
                          훈련 {s.trainingCount}회 · 기술 {s.techniqueCount}개{s.averageScore !== null ? ` · 평균 ${s.averageScore}점` : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card info-card">
              <h3>🥊 스파링 통계</h3>
              {sparringStats.totalCount === 0 ? (
                <EmptyState icon="🥊" text="이 기간에 분석한 스파링 영상이 없습니다." />
              ) : (
                <>
                  <div className="curriculum-stat-row">
                    <div>
                      <strong>{sparringStats.totalCount}</strong>
                      <span>스파링 횟수</span>
                    </div>
                    {sparringStats.latestOverallScores?.posture !== null && sparringStats.latestOverallScores && (
                      <div>
                        <strong>{sparringStats.latestOverallScores.posture}</strong>
                        <span>최근 자세 점수</span>
                      </div>
                    )}
                  </div>
                  {sparringStats.byMartialArt.length > 0 && (
                    <>
                      <div className="field-label">종목별 횟수</div>
                      <div className="chip-row">
                        {sparringStats.byMartialArt.map((a) => (
                          <span key={a.martialArtId} className="chip">
                            {a.nameKo} {a.count}회
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  {sparringStats.techniqueUsage.length > 0 && (
                    <>
                      <div className="field-label" style={{ marginTop: 10 }}>
                        기술 사용 빈도 (AI 추정)
                      </div>
                      <div className="chip-row">
                        {sparringStats.techniqueUsage.map((u) => (
                          <span key={u.techniqueId} className="chip">
                            {u.techniqueName} {u.occurrences}회
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  {sparringStats.styleTrend.length > 0 && (
                    <>
                      <div className="field-label" style={{ marginTop: 10 }}>
                        스타일 변화
                      </div>
                      {sparringStats.styleTrend.map((t) => (
                        <p key={t.label}>
                          {t.label}: {t.points.join(' → ')}
                        </p>
                      ))}
                    </>
                  )}
                  <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 6 }}>
                    <Link to="/sparring" className="btn btn-secondary btn-sm">
                      스파링 분석으로 이동
                    </Link>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
