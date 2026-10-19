import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resolveTechnique as getTechnique } from '../lib/userTechniques/service';
import { useAllSkillProgress } from '../lib/skillProgress/useSkillProgress';
import { rankWeakness, summarizeCoachStats } from '../lib/skillProgress/weaknessEngine';
import { formatRelativeDays } from '../lib/dateUtil';
import { getCoaching } from '../lib/aiCoach/coachService';
import type { CoachRecommendation } from '../lib/aiCoach/types';
import { createWeaknessCurriculum } from '../lib/aiCoach/weaknessCurriculum';
import { computeReviewCandidates } from '../lib/reviewSystem/reviewEngine';
import EmptyState from '../components/EmptyState';
import AiAskModal from '../components/AiAskModal';
import BackButton from '../components/BackButton';
import AiFeatureCatalog from '../components/coach/AiFeatureCatalog';

function techniqueLink(techniqueId: string): string {
  const t = getTechnique(techniqueId);
  return t ? `/arts/${t.martialArt}/techniques/${t.id}` : '/techniques';
}

export default function AiCoach() {
  const skillEntries = useAllSkillProgress();
  const stats = summarizeCoachStats(skillEntries);
  const weakness = useMemo(() => rankWeakness(skillEntries, { limit: 5 }), [skillEntries]);
  const reviewCandidates = useMemo(() => computeReviewCandidates(skillEntries), [skillEntries]);
  const reviewActionableCount = reviewCandidates.filter((c) => c.tier !== 'maintained').length;

  const [recommendation, setRecommendation] = useState<CoachRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const navigate = useNavigate();

  async function handleGetCoaching(force: boolean) {
    setLoading(true);
    setNotice(null);
    try {
      const { recommendation: rec, aiFailed } = await getCoaching(force);
      setRecommendation(rec);
      if (aiFailed) setNotice('AI 코칭 문구를 불러오지 못해 기본 추천 문구를 표시합니다. 잠시 후 다시 시도해보세요.');
    } catch {
      setNotice('AI 코칭을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }

  function handleImproveWeakness(techniqueId: string) {
    const curriculum = createWeaknessCurriculum(techniqueId);
    navigate(`/learning/${curriculum.martialArt}/${curriculum.id}`);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>AI 코치</span>
        </div>

        <div className="section-title">
          <h2>🥋 AI 코치</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          MARTIALDEX의 AI 기능을 모두 이곳에서 시작할 수 있습니다. 수업·코칭부터 기술·콤보, 커리큘럼, 분석, 홈트·영양까지 — 실제 학습 기록을 바탕으로 한 추천이며, 실제 전문 지도자를 대체하지 않습니다.
        </p>

        <AiFeatureCatalog onAsk={() => setAiOpen(true)} />

        <h3 className="ai-catalog__section">내 학습 상태와 오늘의 코칭</h3>
        <div className="card info-card">
          <h3>현재 상태</h3>
          <div className="curriculum-stat-row">
            <div>
              <strong>{stats.learnedCount}</strong>
              <span>학습 기술</span>
            </div>
            <div>
              <strong>{stats.proficientCount}</strong>
              <span>숙련 기술</span>
            </div>
            <div>
              <strong>{stats.averageCount}</strong>
              <span>보통</span>
            </div>
            <div>
              <strong>{stats.needsImprovementCount}</strong>
              <span>개선 필요</span>
            </div>
          </div>
          <p className="video-status-message">최근 학습: {formatRelativeDays(stats.lastPracticedAt)}</p>
          <div className="modal-actions modal-actions--start">
            <button className="btn btn-primary" onClick={() => handleGetCoaching(false)} disabled={loading}>
              {loading ? '분석 중…' : recommendation ? '오늘의 코칭 다시 받기' : '오늘의 코칭 받기'}
            </button>
            <Link to="/today-training" className="btn btn-secondary">
              🔥 오늘의 훈련 보기
            </Link>
          </div>
        </div>

        {notice && <div className="ai-inline-warning">{notice}</div>}

        {recommendation && (
          <div className="card info-card">
            <h3>오늘의 추천</h3>
            <div className="stack gap-2">
              {recommendation.priority && (
                <div className="chip-row">
                  <span className="field-label">🎯 우선 학습</span>
                  <Link to={techniqueLink(recommendation.priority.techniqueId)} className="chip active">
                    {recommendation.priority.techniqueName}
                  </Link>
                </div>
              )}
              {recommendation.review && (
                <div className="chip-row">
                  <span className="field-label">🔄 복습</span>
                  <Link to={techniqueLink(recommendation.review.techniqueId)} className="chip">
                    {recommendation.review.techniqueName}
                  </Link>
                </div>
              )}
              {recommendation.newTechnique && (
                <div className="chip-row">
                  <span className="field-label">📚 새로운 기술</span>
                  <Link to={techniqueLink(recommendation.newTechnique.techniqueId)} className="chip">
                    {recommendation.newTechnique.techniqueName}
                  </Link>
                </div>
              )}
              {recommendation.recommendedCurriculumDay && (
                <div className="chip-row">
                  <span className="field-label">📘 추천 커리큘럼 Day</span>
                  <Link
                    to={`/learning/${getTechnique(recommendation.priority?.techniqueId ?? '')?.martialArt ?? ''}/${recommendation.recommendedCurriculumDay.curriculumId}/day/${recommendation.recommendedCurriculumDay.day}`}
                    className="chip"
                  >
                    {recommendation.recommendedCurriculumDay.curriculumTitle} · Day {recommendation.recommendedCurriculumDay.day}
                  </Link>
                </div>
              )}
              <div className="chip-row">
                <span className="field-label">⏱ 예상 시간</span>
                <span className="chip">{recommendation.estimatedMinutes}분</span>
              </div>
            </div>
            <p style={{ marginTop: 10 }}>
              <strong>추천 이유:</strong> {recommendation.reason}
            </p>
            {recommendation.source === 'fallback' && (
              <p className="video-status-message">AI 코칭 문구를 사용할 수 없어 기본 문구를 표시하고 있습니다.</p>
            )}
          </div>
        )}

        <div className="card info-card">
          <h3>🔻 개선이 필요한 기술 TOP 5</h3>
          {weakness.length === 0 ? (
            <EmptyState icon="✅" text="아직 개선이 필요하다고 판단할 만한 분석 기록이 없습니다. 카메라 자세 분석을 먼저 진행해보세요." />
          ) : (
            <div className="stack gap-2">
              {weakness.map((w, i) => (
                <div key={w.techniqueId} className="technique-row">
                  <div className="technique-row__main">
                    <div className="technique-row__name">
                      {i + 1}. {w.techniqueName} — {w.score}점
                    </div>
                    <div className="technique-row__sub">{w.reason}</div>
                  </div>
                  <div className="technique-row__right">
                    <button className="btn btn-secondary btn-sm" onClick={() => handleImproveWeakness(w.techniqueId)}>
                      이 약점 개선하기
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {reviewActionableCount > 0 && (
          <div className="card info-card">
            <h3>🔁 이번 주 복습</h3>
            <p className="video-status-message">
              복습이 필요한 기술 {reviewActionableCount}개가 있습니다. 학습 기록과 점수 변화를 바탕으로 계산한 우선순위입니다.
            </p>
            <Link to="/review/ai" className="btn btn-secondary">
              오늘의 복습 보기 →
            </Link>
          </div>
        )}

        <div className="modal-actions modal-actions--start">
          <Link to="/my-skills" className="btn btn-ghost">
            나의 기술 대시보드
          </Link>
        </div>
      </div>
      {aiOpen && <AiAskModal onClose={() => setAiOpen(false)} coach />}
    </div>
  );
}
