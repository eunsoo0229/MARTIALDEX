import type { CoachRecommendation } from './types';
import type { BaseCoachRecommendation } from './coachEngine';

// 18. AI 비용 관리 — a coaching call is only re-sent to Gemini when the
// underlying deterministic recommendation (which real techniques were
// picked) actually changed, not on every "오늘의 코칭 받기" click within the
// same day. Same idea as fighterStyle/fighterProfileStore.ts's cache, keyed
// on a hash of the decision instead of the fighter id.
const KEY = 'martialdex:coach-recommendation';

interface CachedCoaching {
  baseHash: string;
  recommendation: CoachRecommendation;
}

export function computeBaseHash(base: BaseCoachRecommendation): string {
  return JSON.stringify([
    base.priority?.techniqueId ?? null,
    base.review?.techniqueId ?? null,
    base.newTechnique?.techniqueId ?? null,
    base.recommendedCurriculumDay?.curriculumId ?? null,
    base.recommendedCurriculumDay?.day ?? null,
  ]);
}

export function getCachedCoaching(): CachedCoaching | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CachedCoaching) : null;
  } catch {
    return null;
  }
}

export function setCachedCoaching(baseHash: string, recommendation: CoachRecommendation): void {
  window.localStorage.setItem(KEY, JSON.stringify({ baseHash, recommendation }));
  window.dispatchEvent(new CustomEvent('martialdex:coach-recommendation-updated'));
}
