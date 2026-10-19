import { useState } from 'react';
import { Link } from 'react-router-dom';
import SearchBar from '../components/SearchBar';
import MartialArtCard from '../components/MartialArtCard';
import TechniqueRow from '../components/TechniqueRow';
import EmptyState from '../components/EmptyState';
import AiAskModal from '../components/AiAskModal';
import { getUnifiedMartialArtSummaries, getUnifiedTechniqueCount, resolveTechniquesByIds } from '../lib/userTechniques/service';
import { useAddTeqLibraryVersion } from '../lib/addTeq/useAddTeqLibrary';
import { useFavorites, useRecentlyViewedSynced } from '../lib/userData';
import { useTodayTraining } from '../lib/todayTraining/useTodayTraining';
import { useAllSkillProgress } from '../lib/skillProgress/useSkillProgress';
import { summarizeCoachStats } from '../lib/skillProgress/weaknessEngine';
import { useMyActiveProgress } from '../lib/curriculum/useCurriculum';
import { useReviewSession } from '../lib/reviewSystem/useReviewSession';
import { REVIEW_TIER_ICON } from '../lib/reviewSystem/types';
import { useProfileStats } from '../lib/profileStats/useProfileStats';
import { useMyStyle } from '../lib/myStyle/useMyStyle';
import { useNutritionMeals } from '../lib/nutrition/useNutritionMeals';
import { useNutritionProfile } from '../lib/nutrition/useNutritionProfile';
import { formatKcal, sumMealsTotals } from '../lib/nutrition/calc';
import { todayDateKey } from '../lib/dateUtil';


export default function Home() {
  const [aiOpen, setAiOpen] = useState(false);
  useAddTeqLibraryVersion(); // re-render when add_teq changes so counts/lists below stay current
  const { favorites } = useFavorites();
  const recent = useRecentlyViewedSynced();
  const { plan } = useTodayTraining();
  const skillEntries = useAllSkillProgress();
  const coachStats = summarizeCoachStats(skillEntries);
  const activeProgress = useMyActiveProgress();
  const todayTechniques = resolveTechniquesByIds(plan.techniqueIds).slice(0, 4);
  const { plan: reviewPlan } = useReviewSession();
  const reviewTodayCount = reviewPlan.actionable.filter((c) => c.tier === 'today').length;
  const reviewSoonCount = reviewPlan.actionable.filter((c) => c.tier === 'soon').length;
  const { stats: profileStats, level } = useProfileStats();
  const { summary: myStyleSummary, analysis: myStyleAnalysis } = useMyStyle();
  const hasAnyActivity = profileStats.learnedCount > 0 || profileStats.sparringSessionCount > 0;

  const nutritionMeals = useNutritionMeals();
  const nutritionProfile = useNutritionProfile();
  const todayMeals = nutritionMeals.filter((m) => m.date === todayDateKey());
  const todayNutritionTotals = sumMealsTotals(todayMeals);

  const favoriteTechniques = resolveTechniquesByIds(favorites);
  const recentTechniques = resolveTechniquesByIds(recent);
  const martialArtSummaries = getUnifiedMartialArtSummaries();
  const totalTechniqueCount = getUnifiedTechniqueCount();

  return (
    <div className="page">
      <div className="container">
        <div className="hero">
          <div className="hero__logo">
            MARTIAL<span>DEX</span>
          </div>
          <p className="hero__tagline">
            {martialArtSummaries.length}개 무술, {totalTechniqueCount}개 기술을 포지션별로 찾아보는 무술 기술 백과사전
          </p>
          <div className="hero__search-wrap">
            <SearchBar variant="hero" />
          </div>
          <div className="hero__cta-row">
            <button className="btn btn-primary hero__ai-btn" onClick={() => setAiOpen(true)}>
              ✦ AI에게 기술 질문하기
            </button>
            <Link to="/learning" className="btn btn-secondary hero__ai-btn">
              📘 학습 시작하기
            </Link>
          </div>

          <div className="stat-row">
            <div>
              <strong>{martialArtSummaries.length}</strong>
              무술
            </div>
            <div>
              <strong>{totalTechniqueCount}</strong>
              기술
            </div>
            <div>
              <strong>{favorites.length}</strong>
              즐겨찾기
            </div>
          </div>
        </div>

        <section>
          <div className="section-title">
            <h2>🔥 오늘의 훈련</h2>
          </div>
          <div className="card info-card">
            {plan.mode === 'no_data' ? (
              <>
                <p className="video-status-message">아직 학습 기록이 없습니다.</p>
                <Link to="/learning" className="btn btn-primary">
                  커리큘럼 만들기
                </Link>
              </>
            ) : (
              <>
                <div className="detail-hero__korean">
                  {plan.curriculumTitle ?? '오늘의 추천 학습'}
                  {plan.day !== null ? ` · DAY ${plan.day}` : ''}
                </div>
                {plan.dayTitle && <div style={{ fontWeight: 700, marginTop: 2 }}>{plan.dayTitle}</div>}
                {todayTechniques.length > 0 && (
                  <div className="chip-row" style={{ marginTop: 8 }}>
                    {todayTechniques.map((t) => (
                      <span key={t.id} className="chip">
                        {t.name}
                      </span>
                    ))}
                  </div>
                )}
                <div className="curriculum-stat-row">
                  <div>
                    <strong>{plan.estimatedMinutes}분</strong>
                    <span>예상 시간</span>
                  </div>
                  {plan.weaknessNote && (
                    <div>
                      <strong>{plan.weaknessNote.score}점</strong>
                      <span>최근 약점 · {plan.weaknessNote.techniqueName}</span>
                    </div>
                  )}
                </div>
                {activeProgress[0] && (
                  <div className="progress-track" style={{ marginBottom: 12 }}>
                    <div className="progress-fill" style={{ width: `${activeProgress[0].progress.progress}%` }} />
                  </div>
                )}
                <Link to="/today-training" className="btn btn-primary">
                  훈련 시작
                </Link>
              </>
            )}
          </div>
        </section>

        <section>
          <div className="section-title">
            <h2>🍚 오늘의 영양</h2>
            <Link to="/nutrition" className="see-all">
              더 보기 →
            </Link>
          </div>
          <div className="card info-card">
            {todayMeals.length === 0 ? (
              <>
                <p className="video-status-message">아직 오늘 등록된 식사가 없습니다.</p>
                <Link to="/nutrition" className="btn btn-primary">
                  식사 기록하기
                </Link>
              </>
            ) : (
              <>
                <div className="curriculum-stat-row">
                  <div>
                    <strong>{formatKcal(todayNutritionTotals.calories)}</strong>
                    <span>섭취{nutritionProfile.calorieGoal != null ? ` / 목표 ${formatKcal(nutritionProfile.calorieGoal)}` : ''}</span>
                  </div>
                  <div>
                    <strong>{Math.round(todayNutritionTotals.proteinG)}g</strong>
                    <span>단백질{nutritionProfile.proteinGoalG != null ? ` / 목표 ${nutritionProfile.proteinGoalG}g` : ''}</span>
                  </div>
                </div>
                <Link to="/nutrition" className="btn btn-primary">
                  영양 화면 보기
                </Link>
              </>
            )}
          </div>
        </section>

        {reviewPlan.actionable.length > 0 && (
          <section>
            <div className="section-title">
              <h2>🔁 오늘의 복습</h2>
            </div>
            <div className="card info-card">
              <div className="chip-row">
                {reviewTodayCount > 0 && <span className="chip active">{REVIEW_TIER_ICON.today} 오늘 {reviewTodayCount}개</span>}
                {reviewSoonCount > 0 && <span className="chip">{REVIEW_TIER_ICON.soon} 곧 {reviewSoonCount}개</span>}
              </div>
              <div className="curriculum-stat-row">
                <div>
                  <strong>{reviewPlan.estimatedMinutes}분</strong>
                  <span>예상 시간</span>
                </div>
              </div>
              <Link to="/review/ai" className="btn btn-primary">
                복습 시작
              </Link>
            </div>
          </section>
        )}

        {hasAnyActivity && (
          <section>
            <div className="section-title">
              <h2>👤 나의 성장</h2>
              <Link to="/profile" className="see-all">
                프로필 보기 →
              </Link>
            </div>
            <div className="card info-card">
              <div className="chip-row">
                <span className="chip active">Level {level.level} · {level.label}</span>
                {profileStats.currentStreak > 0 && <span className="chip">🔥 {profileStats.currentStreak}일 연속 학습</span>}
              </div>
              {myStyleSummary.hasEnoughData && (
                <p className="video-status-message">
                  현재 스타일: {myStyleAnalysis ? myStyleAnalysis.styleName : '분석 가능'} —{' '}
                  <Link to="/my-style">나의 스타일 보기 →</Link>
                </p>
              )}
            </div>
          </section>
        )}

        <section>
          <div className="section-title">
            <h2>🥋 AI 개인 코치</h2>
            <Link to="/coach" className="see-all">
              더 보기 →
            </Link>
          </div>
          <div className="card info-card">
            <div className="curriculum-stat-row">
              <div>
                <strong>{coachStats.learnedCount}</strong>
                <span>학습 기술</span>
              </div>
              <div>
                <strong>{coachStats.proficientCount}</strong>
                <span>숙련</span>
              </div>
              <div>
                <strong>{coachStats.averageCount}</strong>
                <span>보통</span>
              </div>
              <div>
                <strong>{coachStats.needsImprovementCount}</strong>
                <span>개선 필요</span>
              </div>
            </div>
            <Link to="/coach" className="btn btn-secondary">
              오늘의 코칭 받기
            </Link>
          </div>
        </section>

        <section>
          <div className="section-title">
            <h2>무술</h2>
            <Link to="/arts" className="see-all">
              전체보기 →
            </Link>
          </div>
          <div className="card-grid">
            {martialArtSummaries.map((art) => (
              <MartialArtCard key={art.id} art={art} />
            ))}
          </div>
        </section>

        <section>
          <div className="section-title">
            <h2>최근 본 기술</h2>
          </div>
          {recentTechniques.length === 0 ? (
            <EmptyState icon="🕘" text="아직 살펴본 기술이 없습니다. 기술을 클릭해서 상세 페이지를 확인해보세요." />
          ) : (
            <div className="stack gap-2">
              {recentTechniques.map((t) => (
                <TechniqueRow key={t.id} technique={t} />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="section-title">
            <h2>즐겨찾기</h2>
            <Link to="/favorites" className="see-all">
              기술 · 콤보·셋업 전체 보기 →
            </Link>
          </div>
          {favoriteTechniques.length === 0 ? (
            <EmptyState icon="★" text="아직 즐겨찾기한 기술이 없습니다. 기술 상세 페이지에서 별표를 눌러 추가해보세요." />
          ) : (
            <div className="stack gap-2">
              {favoriteTechniques.map((t) => (
                <TechniqueRow key={t.id} technique={t} />
              ))}
            </div>
          )}
        </section>
      </div>
      {aiOpen && <AiAskModal onClose={() => setAiOpen(false)} />}
    </div>
  );
}
