import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { martialArtSummaries } from '../lib/loadData';
import { buildExportPayload, deleteAllRecords } from '../lib/poseAnalysis/recordsService';
import { classifyScore, STATUS_ICON as SCORE_ICON } from '../lib/poseAnalysis/scoring';
import { useAllSkillProgress } from '../lib/skillProgress/useSkillProgress';
import { rankWeakness, summarizeByMartialArt, summarizeByPosition, summarizeOverallCounts } from '../lib/skillProgress/weaknessEngine';
import { MASTERY_ICON, MASTERY_LABEL, type MasteryStatus } from '../lib/skillProgress/types';
import EmptyState from '../components/EmptyState';
import LoginToBackupBanner from '../components/auth/LoginToBackupBanner';
import BackButton from '../components/BackButton';

type ViewMode = 'mastery' | 'martialArt' | 'position';
type SortMode = 'default' | 'score' | 'recent';

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const MASTERY_STATUS_ORDER: MasteryStatus[] = ['proficient', 'average', 'needs_improvement', 'learning', 'not_started'];

export default function MySkills() {
  const skillEntries = useAllSkillProgress(); // reacts to pose-record / training-history / override changes

  // Filters live in the URL (not useState) so they survive this component's
  // unmount/remount on navigation to a technique detail page and back —
  // React Router unmounts route elements by default, which was wiping any
  // local useState filter here. Mirrors TechniqueList.tsx's existing
  // useSearchParams/updateParam pattern for the same class of filter.
  const [searchParams, setSearchParams] = useSearchParams();
  const martialArtFilter = searchParams.get('martialArt') ?? '';
  const statusFilter = (searchParams.get('status') ?? '') as MasteryStatus | '';
  const view = (searchParams.get('view') as ViewMode | null) ?? 'mastery';
  const sortMode = (searchParams.get('sort') as SortMode | null) ?? 'default';

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  const overall = useMemo(() => summarizeOverallCounts(skillEntries), [skillEntries]);
  const byArt = useMemo(() => summarizeByMartialArt(skillEntries).filter((a) => a.total > 0), [skillEntries]);
  const byPosition = useMemo(() => summarizeByPosition(skillEntries), [skillEntries]);
  const weakness = useMemo(() => rankWeakness(skillEntries, { limit: 5 }), [skillEntries]);
  const worstPosition = useMemo(() => {
    const withScore = byPosition.filter((p) => p.averageScore !== null);
    return withScore.length ? withScore.reduce((a, b) => ((b.averageScore ?? 100) < (a.averageScore ?? 100) ? b : a)) : null;
  }, [byPosition]);

  const filtered = skillEntries.filter((e) => {
    if (martialArtFilter && e.technique.martialArt !== martialArtFilter) return false;
    if (statusFilter && e.progress.status !== statusFilter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortMode === 'score') return (b.progress.latestScore ?? -1) - (a.progress.latestScore ?? -1);
    if (sortMode === 'recent') return (b.progress.lastPracticedAt ?? '').localeCompare(a.progress.lastPracticedAt ?? '');
    return 0;
  });

  const totalAnalyzed = skillEntries.filter((e) => e.progress.analysisCount > 0).length;

  function handleExport() {
    downloadJson(buildExportPayload(), `martialdex-pose-records-${new Date().toISOString().slice(0, 10)}.json`);
  }

  function handleDeleteAll() {
    if (!window.confirm('모든 자세 분석 기록을 삭제할까요? 되돌릴 수 없습니다.')) return;
    deleteAllRecords();
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>나의 기술</span>
        </div>

        <div className="section-title">
          <h2>🥋 나의 기술</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          커리큘럼 학습 기록과 카메라 자세 분석 결과를 종합한 참고용 숙련도이며, 실제 무술 실력을 완전히
          평가하지 않습니다.
        </p>
        <LoginToBackupBanner featureName="기술 숙련도" />

        <div className="curriculum-stat-row">
          <div>
            <strong>{overall.total}</strong>
            <span>전체</span>
          </div>
          <div>
            <strong>{overall.proficient}</strong>
            <span>{MASTERY_ICON.proficient} 숙련</span>
          </div>
          <div>
            <strong>{overall.average}</strong>
            <span>{MASTERY_ICON.average} 보통</span>
          </div>
          <div>
            <strong>{overall.needs_improvement}</strong>
            <span>{MASTERY_ICON.needs_improvement} 개선 필요</span>
          </div>
          <div>
            <strong>{overall.learning}</strong>
            <span>{MASTERY_ICON.learning} 학습 중</span>
          </div>
          <div>
            <strong>{overall.not_started}</strong>
            <span>{MASTERY_ICON.not_started} 미학습</span>
          </div>
        </div>

        <div className="chip-row">
          <button className={`chip ${view === 'mastery' ? 'active' : ''}`} onClick={() => updateParam('view', 'mastery')}>
            숙련도별 보기
          </button>
          <button className={`chip ${view === 'martialArt' ? 'active' : ''}`} onClick={() => updateParam('view', 'martialArt')}>
            무술별 보기
          </button>
          <button className={`chip ${view === 'position' ? 'active' : ''}`} onClick={() => updateParam('view', 'position')}>
            포지션별 보기
          </button>
        </div>

        {view === 'martialArt' && (
          <div className="stack gap-2">
            {byArt.map((a) => (
              <div key={a.martialArtId} className="card info-card">
                <h3>🥊 {a.nameKo}</h3>
                <div className="curriculum-stat-row">
                  <div>
                    <strong>
                      {a.counts.proficient} / {a.total}
                    </strong>
                    <span>숙련</span>
                  </div>
                  <div>
                    <strong>
                      {a.counts.average} / {a.total}
                    </strong>
                    <span>보통</span>
                  </div>
                  <div>
                    <strong>
                      {a.counts.needs_improvement} / {a.total}
                    </strong>
                    <span>개선 필요</span>
                  </div>
                  <div>
                    <strong>
                      {a.counts.not_started} / {a.total}
                    </strong>
                    <span>미학습</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'position' && (
          <div className="card info-card">
            <h3>포지션별 약점</h3>
            <div className="stack gap-1">
              {byPosition.map((p) => (
                <div key={p.position} className="pose-history-row__main" style={{ cursor: 'default' }}>
                  <span>{p.label}</span>
                  <span>
                    {p.averageScore !== null
                      ? `${SCORE_ICON[classifyScore(p.averageScore)]} ${p.averageScore}% (분석 ${p.analyzedCount}/${p.totalCount})`
                      : `분석 기록 없음 (0/${p.totalCount})`}
                  </span>
                </div>
              ))}
            </div>
            {worstPosition && (
              <p className="video-status-message">
                현재 가장 개선이 필요한 포지션: {worstPosition.label} ({worstPosition.averageScore}%)
              </p>
            )}
          </div>
        )}

        {view === 'mastery' && (
          <>
            <div className="filter-bar">
              <div className="filter-bar__left">
                <select className="select" value={martialArtFilter} onChange={(e) => updateParam('martialArt', e.target.value)}>
                  <option value="">전체 무술</option>
                  {martialArtSummaries.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nameKo}
                    </option>
                  ))}
                </select>
                <select className="select" value={statusFilter} onChange={(e) => updateParam('status', e.target.value)}>
                  <option value="">전체 숙련도</option>
                  {MASTERY_STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {MASTERY_ICON[s]} {MASTERY_LABEL[s]}
                    </option>
                  ))}
                </select>
                <select className="select" value={sortMode} onChange={(e) => updateParam('sort', e.target.value)}>
                  <option value="default">기본 순</option>
                  <option value="score">점수순</option>
                  <option value="recent">최근 학습순</option>
                </select>
              </div>
              <span className="result-count">{filtered.length}개</span>
            </div>

            <div className="stack gap-2">
              {sorted.map(({ technique, progress }) => (
                <Link key={technique.id} to={`/arts/${technique.martialArt}/techniques/${technique.id}`} className="technique-row">
                  <div className="technique-row__main">
                    <div className="technique-row__name">{technique.name}</div>
                    <div className="technique-row__sub">{technique.category}</div>
                  </div>
                  <div className="technique-row__right">
                    <span className={`chip ${progress.status !== 'not_started' ? 'active' : ''}`}>
                      {MASTERY_ICON[progress.status]} {MASTERY_LABEL[progress.status]}
                      {progress.latestScore !== null ? ` · ${progress.latestScore}점` : ''}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        <div className="card info-card">
          <h3>🔻 개선이 필요한 기술 TOP 5</h3>
          {weakness.length === 0 ? (
            <EmptyState icon="✅" text="아직 개선이 필요하다고 판단할 만한 분석 기록이 없습니다." />
          ) : (
            <div className="stack gap-1">
              {weakness.map((w, i) => (
                <div key={w.techniqueId} className="pose-history-row__main" style={{ cursor: 'default' }}>
                  <span>
                    {i + 1}. {w.techniqueName}
                  </span>
                  <span>{w.score}점</span>
                </div>
              ))}
            </div>
          )}
          <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
            <Link to="/coach" className="btn btn-secondary">
              AI 개인 코치에서 개선하기 →
            </Link>
          </div>
        </div>

        {totalAnalyzed > 0 && (
          <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
            <button className="btn btn-secondary" onClick={handleExport}>
              분석 기록 내보내기 (JSON)
            </button>
            <button className="btn btn-ghost" onClick={handleDeleteAll}>
              전체 분석 기록 삭제
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
