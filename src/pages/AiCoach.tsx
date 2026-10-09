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
          <span>AI 개인 코치</span>
        </div>

        <div className="section-title">
          <h2>🥋 AI 개인 코치</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          안녕하세요. 현재 학습 기록과 기술 분석 결과를 확인하여 오늘 가장 효율적인 학습 방법을 추천해드립니다. AI
          분석 기록을 기반으로 한 학습 추천이며, 실제 전문 지도자를 대체하지 않습니다.
        </p>

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

        <div className="card info-card" data-testid="oneoff-entry">
          <h3>✍️ 수업하고 싶은 거 입력하기</h3>
          <p style={{ margin: '4px 0 8px' }}>
            오늘 배우고 싶은 것을 말하면, AI 코치가 실시간 검색으로 자료를 찾아 오늘 바로 받을 수 있는 수업 하나를 만들어 함께 진행합니다. 커리큘럼은 만들지 않습니다.
          </p>
          <div className="modal-actions modal-actions--start">
            <Link to="/coach/lesson" className="btn btn-primary">
              오늘 수업 입력하기
            </Link>
          </div>
        </div>

        <div className="card info-card" data-testid="coach-class-entry">
          <h3>🧑‍🏫 AI 코치 수업</h3>
          <p style={{ margin: '4px 0 8px' }}>
            집이나 체육관 중 운동할 곳을 고르면, 지금까지 배운 기술 {stats.learnedCount}개와 숙련도를 바탕으로 AI 코치가 수업을 구성하고 함께 진행합니다.
          </p>
          <div className="modal-actions modal-actions--start">
            <Link to="/coach/class" className="btn btn-primary">
              AI 코치 수업 시작
            </Link>
            <Link to="/learned-techniques" className="btn btn-secondary">
              📚 배운 기술
            </Link>
          </div>
        </div>

        <div className="card info-card" data-testid="visual-mitt-entry">
          <h3>🥊 AI Visualizing Mitt</h3>
          <p style={{ margin: '4px 0 8px' }}>
            실제 미트나 파트너 없이, 화면의 미트 잡이·목표 지점·발 위치를 보며 타격 콤보와 테이크다운 진입 스텝을 AI 코치와 단계별로 반복합니다.
          </p>
          <div className="modal-actions modal-actions--start">
            <Link to="/coach/mitt" className="btn btn-primary">
              Visualizing Mitt 시작
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
            <Link to="/review" className="btn btn-secondary">
              오늘의 복습 보기 →
            </Link>
          </div>
        )}

        <div className="card info-card">
          <h3>🥋 나의 스타일 · 목표 스타일 비교</h3>
          <p className="video-status-message">
            실제 학습/스파링 데이터를 바탕으로 나의 무술 스타일을 분석하고, 목표로 하는 선수/스타일과 비교해 우선 학습할 부분을 추천받을 수 있습니다.
          </p>
          <Link to="/my-style" className="btn btn-secondary">
            나의 스타일 보기 →
          </Link>
        </div>

        <div className="card info-card">
          <h3>🎯 상황별 기술 추천</h3>
          <p className="video-status-message">
            "상대가 계속 압박해", "클린치에서 뭘 해야 해?" 같은 실제 상황을 설명하면 관련 기술을
            찾아드립니다.
          </p>
          <Link to="/situation" className="btn btn-secondary">
            상황 추천 받기 →
          </Link>
        </div>

        <div className="modal-actions modal-actions--start">
          <button className="btn btn-secondary" onClick={() => setAiOpen(true)}>
            ✦ AI에게 직접 물어보기
          </button>
          <Link to="/my-skills" className="btn btn-ghost">
            나의 기술 대시보드
          </Link>
        </div>
      </div>
      {aiOpen && <AiAskModal onClose={() => setAiOpen(false)} coach />}
    </div>
  );
}
