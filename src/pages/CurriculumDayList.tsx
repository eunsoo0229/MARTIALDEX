import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { getUnifiedMartialArt } from '../lib/userTechniques/service';
import { getCurriculum, resolveTodayDay } from '../lib/curriculum/curriculumService';
import { deleteCurriculumVerified } from '../lib/curriculum/deleteCurriculum';
import { useAuth } from '../lib/auth/AuthProvider';
import { useCurriculumProgress } from '../lib/curriculum/useCurriculum';
import { encodeShareCode } from '../lib/curriculum/shareCode';
import { copyToClipboard } from '../lib/clipboard';
import { regenerateStyleCurriculum, STYLE_CURRICULUM_MARTIAL_ART } from '../lib/fighterStyle/styleCurriculumService';
import { mmaCurriculumLabel, mmaCurriculumLinkTarget } from '../lib/mmaCurriculum/breadcrumb';
import { MAX_DURATION_DAYS, MIN_DURATION_DAYS } from '../lib/fighterStyle/types';
import { useTechniqueSkillSummary } from '../lib/poseAnalysis/usePoseRecords';
import { STATUS_ICON } from '../lib/poseAnalysis/scoring';
import DifficultyBadge from '../components/DifficultyBadge';
import BackButton from '../components/BackButton';
import ManualCopyBox from '../components/ManualCopyBox';

function KeyTechniqueRow({ techniqueId, techniqueName }: { techniqueId: string; techniqueName: string }) {
  const summary = useTechniqueSkillSummary(techniqueId);
  return (
    <div className="pose-history-row__main" style={{ cursor: 'default' }}>
      <span>{techniqueName}</span>
      <span>
        {summary.status === 'not_analyzed' ? `${STATUS_ICON.not_analyzed} 분석 안 함` : `${STATUS_ICON[summary.status]} ${summary.latestScore}점`}
      </span>
    </div>
  );
}

export default function CurriculumDayList() {
  const { martialArtId = '', curriculumId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const curriculum = getCurriculum(curriculumId);
  const { progress, setDayComplete, start } = useCurriculumProgress(curriculum);
  const [copied, setCopied] = useState(false);
  const [manualCopyCode, setManualCopyCode] = useState<string | null>(null);
  const [changingDuration, setChangingDuration] = useState(false);
  const [newDurationInput, setNewDurationInput] = useState('');
  const [durationError, setDurationError] = useState<string | null>(null);

  if (!curriculum || curriculum.martialArt !== martialArtId) {
    return <Navigate to={`/learning/${martialArtId}`} replace />;
  }

  const art = getUnifiedMartialArt(curriculum.martialArt);
  const todayDay = resolveTodayDay(curriculum);
  const completedSet = new Set(progress?.completedDays ?? []);

  function phaseFor(day: number) {
    return curriculum!.phases.find((p) => day >= p.startDay && day <= p.endDay);
  }

  async function handleShare() {
    const code = encodeShareCode(curriculum!);
    const result = await copyToClipboard(code);
    if (result === 'failed') {
      setManualCopyCode(code);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Leaves the page only once the delete is confirmed (locally and, when
  // signed in, on the server) — see deleteCurriculumVerified. On failure the
  // curriculum stays visible and the user is told so.
  async function handleDelete() {
    if (deleting || !window.confirm('이 커리큘럼을 삭제할까요? 되돌릴 수 없습니다.\n(훈련 기록·학습한 기술·스파링 기록은 그대로 유지됩니다.)')) return;
    const { id, martialArt } = curriculum!;
    setDeleting(true);
    const result = await deleteCurriculumVerified(id, user?.id ?? null);
    setDeleting(false);
    if (!result.ok) {
      window.alert(result.message);
      return;
    }
    navigate(`/learning/${martialArt}`);
  }

  function handleChangeDuration() {
    const n = Number(newDurationInput);
    if (!newDurationInput.trim() || !Number.isFinite(n) || n <= 0) {
      setDurationError('숫자로 기간을 입력해주세요.');
      return;
    }
    if (n < MIN_DURATION_DAYS) {
      setDurationError(`너무 짧은 기간입니다. 최소 ${MIN_DURATION_DAYS}일 이상으로 설정해주세요.`);
      return;
    }
    if (n > MAX_DURATION_DAYS) {
      setDurationError(`너무 긴 기간입니다. 최대 ${MAX_DURATION_DAYS}일 이하로 설정해주세요.`);
      return;
    }
    if (!window.confirm(`기간을 ${Math.round(n)}일로 다시 구성할까요? 커리큘럼 전체가 재설계되며, 현재 진행 상황은 초기화됩니다.`)) {
      return;
    }
    regenerateStyleCurriculum(curriculum!, Math.round(n));
    navigate(0);
  }

  const artLabel = curriculum.martialArt === STYLE_CURRICULUM_MARTIAL_ART ? mmaCurriculumLabel(curriculum) : art?.nameKo ?? curriculum.martialArt;

  let lastPhaseName: string | null = null;

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
          <span>{curriculum.title}</span>
        </div>

        <div className="detail-hero">
          <div>
            <h1>{curriculum.title}</h1>
            <div className="detail-hero__korean">
              {curriculum.source === 'official' ? 'Martialdex 추천 커리큘럼' : `커스텀 커리큘럼 · ${curriculum.authorName}`}
            </div>
            <p style={{ marginTop: 8, color: 'var(--text-muted)' }}>{curriculum.description}</p>
          </div>
          <div className="detail-actions">
            <Link to={`/learning/${curriculum.martialArt}/${curriculum.id}/train`} className="btn btn-primary btn-lg">
              🔥 훈련하기
            </Link>
            <Link
              to={`/learning/${curriculum.martialArt}/${curriculum.id}/day/${todayDay}`}
              className="btn btn-secondary"
              onClick={start}
            >
              ▶ 오늘 학습하기
            </Link>
            {curriculum.source === 'custom' && (
              <>
                <Link to={`/learning/${curriculum.martialArt}/${curriculum.id}/edit`} className="btn btn-secondary">
                  편집
                </Link>
                <button className="btn btn-secondary" onClick={handleShare}>
                  {copied ? '복사됨 ✓' : '공유 코드 복사'}
                </button>
                {curriculum.marketplaceListingId ? (
                  <Link to={`/marketplace/${curriculum.marketplaceListingId}`} className="btn btn-secondary">
                    🛒 마켓에서 보기
                  </Link>
                ) : (
                  <Link to={`/marketplace/publish/${curriculum.id}`} className="btn btn-secondary">
                    🛒 마켓에 게시
                  </Link>
                )}
                <button className="btn btn-ghost" onClick={handleDelete} disabled={deleting}>
                  {deleting ? '삭제 중…' : '삭제'}
                </button>
              </>
            )}
          </div>
        </div>

        {manualCopyCode && <ManualCopyBox text={manualCopyCode} onClose={() => setManualCopyCode(null)} />}

        {curriculum.sparringAnalysisMeta && (
          <div className="card info-card" data-testid="sparring-curriculum-meta">
            <h3 style={{ marginTop: 0 }}>🥊 스파링 분석에서 온 커리큘럼</h3>
            <p>
              해결하려는 약점: {curriculum.sparringAnalysisMeta.weakAreaLabels.join(', ')}{' '}
              <Link to={`/sparring/${curriculum.sparringAnalysisMeta.sparringSessionId}`}>분석·약점 장면 보기</Link>
            </p>
            {curriculum.sparringAnalysisMeta.webResearch && (
              <p className="technique-row__sub" data-testid="sparring-curriculum-research">
                실시간 웹 검색:{' '}
                {curriculum.sparringAnalysisMeta.webResearch.status === 'ok'
                  ? `자료 ${curriculum.sparringAnalysisMeta.webSources?.length ?? 0}개 참고 (검색어 ${curriculum.sparringAnalysisMeta.webResearch.queries.length}개)`
                  : curriculum.sparringAnalysisMeta.webResearch.note}
              </p>
            )}
            {(curriculum.sparringAnalysisMeta.webSources ?? []).length > 0 && (
              <details>
                <summary>참고한 웹 자료 (웹 페이지의 설명이며 Martialdex 검증 정보가 아닙니다)</summary>
                <ul>
                  {curriculum.sparringAnalysisMeta.webSources!.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title}
                      </a>{' '}
                      <span className="technique-row__sub">({s.domain})</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="technique-row__sub">완료 조건과 재평가: 각 Day를 실제로 마치면 완료로 표시됩니다. 커리큘럼을 마친 뒤 새 스파링 영상을 분석하면 같은 약점 장면이 줄었는지 이전 분석과 비교해 보여줍니다.</p>
          </div>
        )}

        {progress && (
          <div className="progress-track" style={{ marginBottom: 24 }}>
            <div className="progress-fill" style={{ width: `${progress.progress}%` }} />
          </div>
        )}

        {curriculum.styleMeta && (
          <div className="card info-card">
            <h3>🎯 핵심 기술 &amp; AI 자세 분석 점수</h3>
            <div className="stack gap-1">
              {curriculum.styleMeta.matchedTechniques.slice(0, 8).map((m) => (
                <KeyTechniqueRow key={m.techniqueId} techniqueId={m.techniqueId} techniqueName={m.techniqueName} />
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 8 }}>
              AI 자세 분석 점수는 카메라 기반 근사 측정치이며, 실제 실력을 확정하지 않습니다. 점수가 낮은
              기술부터 복습 비중을 높이는 것을 고려해보세요.
            </p>

            <div className="field-label" style={{ marginTop: 10 }}>
              현재 학습 기간: {curriculum.totalDays}일 ({curriculum.styleMeta.durationMode === 'ai_recommended' ? 'AI 추천' : '직접 설정'})
            </div>
            {!changingDuration ? (
              <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => setChangingDuration(true)}>
                기간 변경
              </button>
            ) : (
              <div style={{ marginTop: 6 }}>
                <div className="chip-row">
                  <input
                    type="number"
                    className="select"
                    style={{ width: 100 }}
                    placeholder="새 기간"
                    value={newDurationInput}
                    onChange={(e) => setNewDurationInput(e.target.value)}
                  />
                  <span>일</span>
                  <button className="btn btn-primary btn-sm" onClick={handleChangeDuration}>
                    이 기간으로 재구성
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setChangingDuration(false)}>
                    취소
                  </button>
                </div>
                {durationError && <div className="ai-inline-warning">{durationError}</div>}
              </div>
            )}
          </div>
        )}

        <div className="day-grid">
          {curriculum.days.map((d) => {
            const phase = phaseFor(d.day);
            const showPhaseHeader = phase && phase.name !== lastPhaseName;
            if (phase) lastPhaseName = phase.name;
            const done = completedSet.has(d.day);
            return (
              <div key={d.day} className="day-grid__item">
                {showPhaseHeader && <div className="day-grid__phase">{phase!.name}</div>}
                <Link
                  to={`/learning/${curriculum.martialArt}/${curriculum.id}/day/${d.day}`}
                  className={`day-card ${done ? 'day-card--done' : ''} ${d.day === todayDay ? 'day-card--current' : ''}`}
                >
                  <div className="day-card__num">Day {d.day}</div>
                  <div className="day-card__title">{d.title}</div>
                  <div className="day-card__meta">
                    <DifficultyBadge difficulty={d.difficulty} />
                    <span>{d.estimatedMinutes}분</span>
                    {d.techniqueIds.length > 0 && <span>기술 {d.techniqueIds.length}개</span>}
                  </div>
                  {done && <div className="day-card__check">✓</div>}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
