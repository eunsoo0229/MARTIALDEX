import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Technique } from '../types';
import { resolveTechniquesByIds as getTechniquesByIds } from '../lib/userTechniques/service';
import { useReviewSession } from '../lib/reviewSystem/useReviewSession';
import { REVIEW_TIER_ICON, REVIEW_TIER_LABEL } from '../lib/reviewSystem/types';
import type { ReviewCandidate, WeeklyReviewPlan } from '../lib/reviewSystem/types';
import { getWeeklyReviewPlan } from '../lib/reviewSystem/reviewAiService';
import { addTechniqueToDay, listMyCurricula, resolveTodayDay, saveCustomCurriculum } from '../lib/curriculum/curriculumService';
import { isPoseAnalysisSupported } from '../lib/poseAnalysis/poseAnalysisConfig';
import { useTechniqueRecords, useTechniqueSkillSummary } from '../lib/poseAnalysis/usePoseRecords';
import { STATUS_ICON, STATUS_LABEL } from '../lib/poseAnalysis/scoring';
import { getTechniqueConnections, hasAnyConnections } from '../lib/techniqueGraph/buildGraph';
import { RELATION_LABEL } from '../lib/techniqueGraph/types';
import DifficultyBadge from '../components/DifficultyBadge';
import RelatedVideos from '../components/RelatedVideos';
import ScoreHistoryChart from '../components/ScoreHistoryChart';
import PoseAnalysisModal from '../components/PoseAnalysisModal';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

const CIRCLED_NUMBERS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
const CONNECTION_SECTIONS = ['prerequisite', 'next', 'counter', 'escape', 'samePosition'] as const;

function CandidateRow({
  candidate,
  index,
  myCurricula,
  pickerOpen,
  onTogglePicker,
  onAddToCurriculum,
}: {
  candidate: ReviewCandidate;
  index: number;
  myCurricula: ReturnType<typeof listMyCurricula>;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onAddToCurriculum: (curriculumId: string) => void;
}) {
  return (
    <div className="technique-row" style={{ flexWrap: 'wrap' }}>
      <div className="technique-row__main">
        <div className="technique-row__name">
          {CIRCLED_NUMBERS[index] ?? `${index + 1}.`} {candidate.techniqueName}
          <span className="chip" style={{ marginLeft: 6 }}>
            {REVIEW_TIER_ICON[candidate.tier]} {REVIEW_TIER_LABEL[candidate.tier]}
          </span>
        </div>
        <div className="technique-row__sub">{candidate.reason}</div>
      </div>
      <div className="technique-row__right" style={{ flexWrap: 'wrap', gap: 6 }}>
        {candidate.latestScore !== null && <span className="chip">최근 점수 {candidate.latestScore}점</span>}
        {myCurricula.length > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={onTogglePicker}>
            커리큘럼에 추가
          </button>
        )}
      </div>
      {pickerOpen && (
        <div className="chip-row" style={{ flexBasis: '100%', marginTop: 6 }}>
          {myCurricula.map((c) => (
            <button key={c.id} className="chip" onClick={() => onAddToCurriculum(c.id)}>
              {c.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TodayReview() {
  const { session, plan, start, completeTechnique, finish, isFullyComplete } = useReviewSession();
  const [poseTechnique, setPoseTechnique] = useState<Technique | null>(null);
  const [curriculumPickerFor, setCurriculumPickerFor] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [aiPlan, setAiPlan] = useState<WeeklyReviewPlan | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const myCurricula = listMyCurricula();

  // 19-5: as soon as every technique in today's review session is checked
  // off, finalize once — closes the review-log entry (NOT a training record:
  // reviewing isn't training), like 13-5's TodayTraining auto-finish.
  useEffect(() => {
    if (session && isFullyComplete && !session.finishedAt) {
      finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.completedTechniqueIds.length, session?.finishedAt]);

  const currentTechnique = (() => {
    if (!session) return undefined;
    const techniques = getTechniquesByIds(session.techniqueIds);
    const currentIndex = session.techniqueIds.findIndex((id) => !session.completedTechniqueIds.includes(id));
    return techniques[currentIndex];
  })();

  const activeId = currentTechnique?.id ?? '';
  const skillSummary = useTechniqueSkillSummary(activeId);
  const scoreRecords = useTechniqueRecords(activeId);
  const connections = currentTechnique ? getTechniqueConnections(currentTechnique) : undefined;

  function handleAddToCurriculum(techniqueId: string, curriculumId: string) {
    const curriculum = myCurricula.find((c) => c.id === curriculumId);
    if (!curriculum) return;
    const day = resolveTodayDay(curriculum);
    const updated = addTechniqueToDay(curriculum, day, techniqueId);
    saveCustomCurriculum(updated);
    setCurriculumPickerFor(null);
    setActionMessage(`"${curriculum.title}" Day ${day}에 추가했습니다.`);
  }

  async function handleAiPlan() {
    setAiLoading(true);
    try {
      const result = await getWeeklyReviewPlan();
      setAiPlan(result);
    } finally {
      setAiLoading(false);
    }
  }

  const breadcrumb = (
    <>
      <BackButton />
      <div className="breadcrumb">
        <Link to="/">홈</Link>
        <span>/</span>
        <span>오늘의 복습</span>
      </div>
    </>
  );

  // Phase 0 — nothing has ever been practiced/analyzed, so there is no real
  // review signal yet (reviewEngine skips 'not_started' techniques entirely).
  if (plan.actionable.length === 0 && plan.maintained.length === 0) {
    return (
      <div className="page">
        <div className="container">
          {breadcrumb}
          <EmptyState icon="🔁" text="아직 복습을 추천할 만한 학습 기록이 없습니다." />
          <div className="modal-actions" style={{ justifyContent: 'center' }}>
            <Link to="/learning" className="btn btn-primary">
              학습 시작하기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Phase A — preview: tiered candidate list + AI weekly plan + curriculum add.
  if (!session) {
    const todayCandidates = plan.actionable.filter((c) => c.tier === 'today');
    const soonCandidates = plan.actionable.filter((c) => c.tier === 'soon');

    return (
      <div className="page">
        <div className="container">
          {breadcrumb}
          <div className="section-title">
            <h2>🔁 오늘의 복습</h2>
          </div>
          <p className="video-status-message" style={{ marginTop: -8 }}>
            학습 기록, AI 자세 분석 점수, 스파링 사용 이력을 바탕으로 계산한 복습 우선순위입니다. 참고용
            학습 추천이며, 실전 수행 능력을 보장하지 않습니다.
          </p>

          {actionMessage && <p className="video-status-message">{actionMessage}</p>}

          {plan.actionable.length > 0 && (
            <div className="card info-card">
              <h3>복습 대상 기술</h3>
              <div className="stack gap-2">
                {plan.actionable.map((c, i) => (
                  <CandidateRow
                    key={c.techniqueId}
                    candidate={c}
                    index={i}
                    myCurricula={myCurricula}
                    pickerOpen={curriculumPickerFor === c.techniqueId}
                    onTogglePicker={() => setCurriculumPickerFor(curriculumPickerFor === c.techniqueId ? null : c.techniqueId)}
                    onAddToCurriculum={(curriculumId) => handleAddToCurriculum(c.techniqueId, curriculumId)}
                  />
                ))}
              </div>
              <div className="curriculum-stat-row">
                <div>
                  <strong>{plan.estimatedMinutes}분</strong>
                  <span>예상 시간</span>
                </div>
                <div>
                  <strong>{todayCandidates.length}개</strong>
                  <span>{REVIEW_TIER_ICON.today} 오늘 복습 추천</span>
                </div>
                <div>
                  <strong>{soonCandidates.length}개</strong>
                  <span>{REVIEW_TIER_ICON.soon} 곧 복습</span>
                </div>
              </div>
              <div className="modal-actions modal-actions--start">
                <button className="btn btn-primary" onClick={() => start()}>
                  복습 시작
                </button>
              </div>
            </div>
          )}

          {plan.maintained.length > 0 && (
            <div className="card info-card">
              <h3>{REVIEW_TIER_ICON.maintained} 유지 중</h3>
              <div className="chip-row">
                {plan.maintained.map((c) => (
                  <span key={c.techniqueId} className="chip">
                    {c.techniqueName}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="card info-card">
            <h3>🤖 AI 주간 복습 계획</h3>
            <p className="video-status-message">"이번 주에 무엇을 복습해야 할까?" — 위 목록을 바탕으로 AI가 안내합니다.</p>
            {!aiPlan && (
              <div className="modal-actions modal-actions--start">
                <button className="btn btn-secondary" onClick={handleAiPlan} disabled={aiLoading}>
                  {aiLoading ? '계획을 만드는 중…' : 'AI 주간 복습 계획 받기'}
                </button>
              </div>
            )}
            {aiPlan && (
              <>
                <p>{aiPlan.summary}</p>
                {aiPlan.source === 'fallback' && (
                  <div className="ai-inline-warning">AI 응답을 불러오지 못해 기본 요약을 보여드립니다.</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Phase C — completion.
  if (isFullyComplete) {
    const reviewedTechniques = getTechniquesByIds(session.techniqueIds);
    return (
      <div className="page">
        <div className="container">
          {breadcrumb}
          <div className="section-title">
            <h2>🎉 오늘의 복습 완료</h2>
          </div>
          <div className="curriculum-stat-row">
            <div>
              <strong>{session.techniqueIds.length}개</strong>
              <span>복습한 기술</span>
            </div>
            <div>
              <strong>
                {session.finishedAt
                  ? Math.max(1, Math.round((new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 60000))
                  : Math.round(session.techniqueIds.length * 7)}
                분
              </strong>
              <span>복습 시간</span>
            </div>
            <div>
              <strong>100%</strong>
              <span>완료율</span>
            </div>
          </div>
          <p className="video-status-message">오늘의 복습을 완료했습니다. 복습 기록에 저장되었습니다 (훈련 기록과는 따로 보관됩니다).</p>

          <div className="card info-card">
            <h3>다시 자세 분석하기</h3>
            <p className="video-status-message">필요하다면 방금 복습한 기술을 다시 촬영해 분석할 수 있습니다.</p>
            <div className="chip-row">
              {reviewedTechniques.filter((t) => isPoseAnalysisSupported(t.id)).map((t) => (
                <button key={t.id} className="btn btn-secondary btn-sm" onClick={() => setPoseTechnique(t)}>
                  📷 {t.name}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-actions modal-actions--start">
            <Link to="/review" className="btn btn-secondary">
              복습 메인으로
            </Link>
            <Link to="/coach" className="btn btn-ghost">
              AI 코치로 돌아가기
            </Link>
          </div>
        </div>
        {poseTechnique && <PoseAnalysisModal technique={poseTechnique} onClose={() => setPoseTechnique(null)} />}
      </div>
    );
  }

  // Phase B — per-technique walkthrough.
  if (!currentTechnique) {
    return <EmptyState icon="🔁" text="복습 정보를 불러오지 못했습니다." />;
  }

  const techniques = getTechniquesByIds(session.techniqueIds);
  const currentIndex = session.techniqueIds.findIndex((id) => !session.completedTechniqueIds.includes(id));

  return (
    <div className="page">
      <div className="container">
        {breadcrumb}
        <div className="chip-row">
          <span className="chip active">
            {currentIndex + 1}/{techniques.length}
          </span>
        </div>

        <div className="detail-hero">
          <div>
            <h1>{currentTechnique.name}</h1>
            {currentTechnique.koreanName && currentTechnique.koreanName !== currentTechnique.name && (
              <div className="detail-hero__korean">{currentTechnique.koreanName}</div>
            )}
            <DifficultyBadge difficulty={currentTechnique.difficulty} />
          </div>
        </div>

        <div className="card info-card">
          <h3>기술 설명</h3>
          <p>{currentTechnique.description || currentTechnique.purpose || '아직 등록된 설명이 없습니다.'}</p>
        </div>

        <div className="card info-card">
          <h3>핵심 포인트</h3>
          {currentTechnique.principles.length > 0 ? (
            <ul>
              {currentTechnique.principles.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          ) : (
            <p className="video-status-message">아직 등록된 핵심 포인트가 없습니다.</p>
          )}
        </div>

        <div className="card info-card">
          <h3>📈 이전 분석 결과</h3>
          {skillSummary.analysisCount > 0 ? (
            <>
              <div className="chip-row">
                <span className="chip active">
                  {STATUS_ICON[skillSummary.status]} 최근 점수 {skillSummary.latestScore}점 ({STATUS_LABEL[skillSummary.status]})
                </span>
                {skillSummary.scoreDelta !== null && (
                  <span className="chip">{skillSummary.scoreDelta >= 0 ? `+${skillSummary.scoreDelta}` : skillSummary.scoreDelta}점 변화</span>
                )}
              </div>
              {scoreRecords.length >= 2 ? (
                <ScoreHistoryChart records={scoreRecords} />
              ) : (
                <p className="video-status-message">분석 기록이 아직 1회뿐입니다.</p>
              )}
            </>
          ) : (
            <p className="video-status-message">아직 자세 분석 기록이 없습니다.</p>
          )}
        </div>

        <div className="modal-actions modal-actions--start">
          <Link to={`/arts/${currentTechnique.martialArt}/techniques/${currentTechnique.id}`} className="btn btn-secondary">
            기술 상세 보기
          </Link>
          {isPoseAnalysisSupported(currentTechnique.id) && (
            <button className="btn btn-secondary" onClick={() => setPoseTechnique(currentTechnique)}>
              📷 자세 분석
            </button>
          )}
          <button className="btn btn-primary" onClick={() => completeTechnique(currentTechnique.id)}>
            복습 완료
          </button>
        </div>

        <RelatedVideos technique={currentTechnique} />

        {connections && hasAnyConnections(connections) && (
          <div className="card info-card">
            <h3>🔗 연결 기술</h3>
            {CONNECTION_SECTIONS.map((kind) => {
              const items = connections[kind];
              if (items.length === 0) return null;
              return (
                <div key={kind} style={{ marginBottom: 10 }}>
                  <div className="field-label">{RELATION_LABEL[kind]}</div>
                  <div className="chip-row">
                    {items.map((c) => (
                      <Link key={c.techniqueId} to={`/arts/${c.martialArt}/techniques/${c.techniqueId}`} className="chip">
                        {c.techniqueName}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {poseTechnique && <PoseAnalysisModal technique={poseTechnique} onClose={() => setPoseTechnique(null)} />}
    </div>
  );
}
