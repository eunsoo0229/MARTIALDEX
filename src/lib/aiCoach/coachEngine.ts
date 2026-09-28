import { getTechnique } from '../loadData';
import type { CoachRecommendation, CoachTechniqueRef } from './types';
import { computeAllSkillProgress, rankWeakness } from '../skillProgress/weaknessEngine';
import { generateTodayTrainingPlan } from '../todayTraining/planner';
import { listMyActiveProgress } from '../curriculum/curriculumService';

export type BaseCoachRecommendation = Omit<CoachRecommendation, 'reason' | 'generatedAt' | 'source'>;

function toRef(techniqueId: string): CoachTechniqueRef | null {
  const t = getTechnique(techniqueId);
  return t ? { techniqueId: t.id, techniqueName: t.name } : null;
}

// The ONLY place technique choices for "오늘의 추천" get decided — plain code
// over real data (weaknessEngine + today's plan), never AI. coachService.ts
// asks Gemini only to phrase a "reason" sentence around whatever this
// function already picked; the AI never sees or returns a technique id.
export function buildBaseRecommendation(): BaseCoachRecommendation {
  const active = listMyActiveProgress();
  const skillEntries = computeAllSkillProgress();
  const weakness = rankWeakness(skillEntries, { curriculum: active[0]?.curriculum, limit: 2 });
  const plan = generateTodayTrainingPlan();

  const priority = weakness[0] ? toRef(weakness[0].techniqueId) : null;
  let review: CoachTechniqueRef | null = weakness[1] ? toRef(weakness[1].techniqueId) : null;
  let newTechnique: CoachTechniqueRef | null = null;

  if (plan.mode === 'curriculum' || plan.mode === 'ad_hoc') {
    if (!review) {
      const dayReviewId = plan.techniqueIds.find((id) => id !== priority?.techniqueId);
      review = dayReviewId ? toRef(dayReviewId) : null;
    }
    const newId = plan.techniqueIds.find((id) => id !== priority?.techniqueId && id !== review?.techniqueId);
    newTechnique = newId ? toRef(newId) : null;
  }

  return {
    priority,
    review,
    newTechnique,
    recommendedCurriculumDay:
      plan.mode === 'curriculum' && plan.curriculumId && plan.day !== null
        ? { curriculumId: plan.curriculumId, curriculumTitle: plan.curriculumTitle ?? '', day: plan.day }
        : null,
    estimatedMinutes: plan.estimatedMinutes || 30,
  };
}

// Used whenever the AI narration call isn't available (no API key, network
// error, rate limit) — the recommendation itself is never blocked by an AI
// outage since every technique in it is already real, computed data.
export function templateReason(base: BaseCoachRecommendation): string {
  const parts: string[] = [];
  if (base.priority) parts.push(`최근 분석 결과 "${base.priority.techniqueName}"의 개선이 필요해 우선 학습을 추천합니다.`);
  if (base.review) parts.push(`"${base.review.techniqueName}"을(를) 복습하면 도움이 됩니다.`);
  if (base.newTechnique) parts.push(`새로운 기술로 "${base.newTechnique.techniqueName}"을(를) 시작해보세요.`);
  if (!parts.length) parts.push('아직 참고할 학습 기록이 많지 않습니다. 관심 있는 무술의 기초 기술부터 꾸준히 연습해보세요.');
  return parts.join(' ');
}
