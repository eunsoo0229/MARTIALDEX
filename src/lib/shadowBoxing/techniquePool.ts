import { getTechniquesByMartialArt } from '../loadData';
import { listMyActiveProgress, resolveTodayDay } from '../curriculum/curriculumService';
import { computeAllSkillProgress } from '../skillProgress/weaknessEngine';

const POOL_SIZE = 12;
const DIFFICULTY_RANK: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 };

/**
 * Priority order from spec section 3: (1) the user's active curriculum's
 * current Day for this martial art, (2) techniques the user is currently
 * "학습 중" (skillProgress status === 'learning') for this martial art,
 * (3) a general beginner-first set of real techniques for the martial art.
 * Every id returned is a real, resolvable technique — nothing is invented;
 * see resolveTechnique()/resolveTechniquesByIds() at the call sites that
 * consume this pool.
 */
export function resolveShadowTechniquePool(martialArt: string): string[] {
  const active = listMyActiveProgress().find((a) => a.curriculum.martialArt === martialArt);
  if (active) {
    const day = resolveTodayDay(active.curriculum);
    const dayData = active.curriculum.days.find((d) => d.day === day);
    const ids = [...(dayData?.techniqueIds ?? []), ...(dayData?.reviewTechniqueIds ?? [])];
    if (ids.length >= 2) return ids;
  }

  const learning = computeAllSkillProgress()
    .filter((e) => e.technique.martialArt === martialArt && e.progress.status === 'learning')
    .map((e) => e.technique.id);
  if (learning.length >= 2) return learning.slice(0, POOL_SIZE);

  return getTechniquesByMartialArt(martialArt)
    .slice()
    .sort((a, b) => {
      const ra = a.difficulty ? (DIFFICULTY_RANK[a.difficulty] ?? 1) : 1;
      const rb = b.difficulty ? (DIFFICULTY_RANK[b.difficulty] ?? 1) : 1;
      return ra - rb;
    })
    .slice(0, POOL_SIZE)
    .map((t) => t.id);
}
