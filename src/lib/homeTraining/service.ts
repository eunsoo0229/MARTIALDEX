import type { Curriculum, CurriculumDay } from '../curriculum/types';
import type { HomeGoalAnalysis, HomeTrainingMeta } from './types';
import type { HomeExerciseEquipment } from '../../types';
import { analyzeHomeGoal } from './goalAnalysis';
import { matchHomeGoalToExercises, fallbackHomeExercisePool } from './exerciseMatcher';
import { planHomeSessions } from './sessionPlanner';
import { validateHomeSessions } from './validator';
import { resolveTechnique } from '../userTechniques/service';
import { curriculumRepository } from '../curriculum/repository';
import { getAuthorName } from '../curriculum/curriculumService';
import { buildTrainingAiContext } from '../trainingAnalytics/aiContext';
import { computeAllSkillProgress } from '../skillProgress/weaknessEngine';
import { rankWeakness } from '../skillProgress/weaknessEngine';
import { HOME_TRAINING_MARTIAL_ART_ID } from './library';

const MIN_SESSIONS_PER_WEEK = 1;
const MAX_SESSIONS_PER_WEEK = 7;
const MIN_TOTAL_WEEKS = 1;
const MAX_TOTAL_WEEKS = 12;
const MIN_NEEDED_POOL_SIZE = 8;

function newId(): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `custom__${rand}`;
}

function deriveTitle(analysis: HomeGoalAnalysis): string {
  const topics = analysis.goals.slice(0, 2);
  return topics.length > 0 ? `홈트 ${topics.join(' · ')}` : '홈트 맞춤 커리큘럼';
}

export interface GenerateHomeCurriculumInput {
  /** Null/empty means "목적 없이 훈련 기록 분석" — the no-goal-stated flow (spec section 5). */
  freeText: string | null;
  relatedMartialArt: string | null;
  sessionsPerWeek: number;
  totalWeeks: number;
  minutesPerSession: number;
  equipment: HomeExerciseEquipment[];
}

export interface HomeCurriculumPreview {
  title: string;
  analysis: HomeGoalAnalysis;
  matchedExercises: ReturnType<typeof matchHomeGoalToExercises>;
  days: CurriculumDay[];
  sessionsPerWeek: number;
  totalWeeks: number;
  minutesPerSession: number;
  equipment: HomeExerciseEquipment[];
  goalSource: HomeTrainingMeta['goalSource'];
  goalText: string | null;
}

export type GenerateHomeCurriculumOutcome =
  | { ok: true; preview: HomeCurriculumPreview }
  | { ok: false; code: 'CLARIFYING_NEEDED'; question: string }
  | { ok: false; code: 'NO_TRAINING_DATA' }
  | { ok: false; code: 'VALIDATION_FAILED'; errors: string[] }
  | { ok: false; code: 'AI_ERROR'; message: string };

export async function generateHomeCurriculumPreview(input: GenerateHomeCurriculumInput): Promise<GenerateHomeCurriculumOutcome> {
  const sessionsPerWeek = Math.max(MIN_SESSIONS_PER_WEEK, Math.min(MAX_SESSIONS_PER_WEEK, Math.round(input.sessionsPerWeek)));
  const totalWeeks = Math.max(MIN_TOTAL_WEEKS, Math.min(MAX_TOTAL_WEEKS, Math.round(input.totalWeeks)));
  const noStatedGoal = !input.freeText || !input.freeText.trim();

  // Deterministic, no-AI-call local aggregation (spec section 5) — the
  // SAME function the AI 코치 dashboard already uses. Never a random
  // curriculum: if there's no stated goal AND no real training data to
  // analyze, generation stops here rather than guessing.
  const trainingContext = buildTrainingAiContext();
  if (noStatedGoal && !trainingContext.hasAnyData) {
    return { ok: false, code: 'NO_TRAINING_DATA' };
  }

  const analysisResult = await analyzeHomeGoal({
    freeText: input.freeText,
    relatedMartialArtHint: input.relatedMartialArt,
    sessionsPerWeek,
    minutesPerSession: input.minutesPerSession,
    equipment: input.equipment,
    trainingContextLines: noStatedGoal ? trainingContext.contextLines : [],
  });
  if (!analysisResult.ok) return { ok: false, code: 'AI_ERROR', message: analysisResult.message };
  const analysis = analysisResult.data;

  if (analysis.clarifyingQuestion) {
    return { ok: false, code: 'CLARIFYING_NEEDED', question: analysis.clarifyingQuestion };
  }

  const title = deriveTitle(analysis);
  const masteryByTechniqueId = new Map(computeAllSkillProgress().map((e) => [e.technique.id, e.progress.status]));
  const weakTechniqueIds = new Set(rankWeakness(computeAllSkillProgress(), { limit: 8 }).map((w) => w.techniqueId));

  let matches = matchHomeGoalToExercises(analysis, input.equipment, { weakTechniqueIds, masteryByTechniqueId });

  const neededPoolSize = Math.max(MIN_NEEDED_POOL_SIZE, sessionsPerWeek * 3);
  if (matches.length < neededPoolSize) {
    const fallback = fallbackHomeExercisePool(input.equipment, { masteryByTechniqueId, limit: neededPoolSize });
    const byId = new Map(matches.map((m) => [m.exerciseId, m]));
    for (const m of fallback) if (!byId.has(m.exerciseId)) byId.set(m.exerciseId, m);
    matches = [...byId.values()].sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  const subjectLabel = title.replace(/^홈트 /, '');
  const totalSessions = sessionsPerWeek * totalWeeks;

  function planAndValidate(pool: typeof matches) {
    const { days } = planHomeSessions({ subjectLabel, matches: pool, sessionsPerWeek, totalWeeks, minutesPerSession: input.minutesPerSession });
    const validation = validateHomeSessions(days, totalSessions);
    return { days, validation };
  }

  let pool = matches;
  let attempt = planAndValidate(pool);

  // Same bounded self-healing retry as aiCurriculum/service.ts — never
  // re-prompts Gemini (planHomeSessions is deterministic given the same
  // pool), only drops ids that don't actually resolve and re-plans once.
  if (!attempt.validation.ok) {
    const resolvablePool = pool.filter((m) => !!resolveTechnique(m.exerciseId));
    if (resolvablePool.length < pool.length) {
      pool = resolvablePool;
      attempt = planAndValidate(pool);
    }
  }

  if (!attempt.validation.ok) {
    return { ok: false, code: 'VALIDATION_FAILED', errors: attempt.validation.errors };
  }

  return {
    ok: true,
    preview: {
      title,
      analysis,
      matchedExercises: pool,
      days: attempt.days,
      sessionsPerWeek,
      totalWeeks,
      minutesPerSession: input.minutesPerSession,
      equipment: input.equipment,
      goalSource: noStatedGoal ? 'training_record_analysis' : 'user_goal',
      goalText: input.freeText,
    },
  };
}

/** Saves a preview as a real Curriculum — identical repository path as every other curriculum (official/custom/AI/style/home). */
export function saveHomeCurriculumPreview(preview: HomeCurriculumPreview, existingId?: string): Curriculum {
  const now = new Date().toISOString();
  const techniqueCount = new Set(preview.days.flatMap((d) => d.techniqueIds)).size;

  const homeTrainingMeta: HomeTrainingMeta = {
    goalSource: preview.goalSource,
    goalText: preview.goalText,
    analysis: preview.analysis,
    matchedExercises: preview.matchedExercises,
    sessionsPerWeek: preview.sessionsPerWeek,
    totalWeeks: preview.totalWeeks,
    minutesPerSession: preview.minutesPerSession,
    equipment: preview.equipment,
    generatedAt: now,
  };

  const curriculum: Curriculum = {
    id: existingId ?? newId(),
    martialArt: HOME_TRAINING_MARTIAL_ART_ID,
    title: preview.title,
    subtitle: '홈트 커리큘럼',
    description:
      `${preview.analysis.summary} 사용자의 목표와 훈련 기록을 바탕으로 AI가 생성한 홈트레이닝 커리큘럼입니다. ` +
      '실제 훈련은 반드시 본인의 몸 상태에 맞게, 필요 시 전문가의 지도를 받아 진행해야 합니다.',
    source: 'custom',
    visibility: 'private',
    authorName: getAuthorName(),
    coverIcon: '💪',
    totalDays: preview.days.length,
    estimatedWeeks: preview.totalWeeks,
    phases: [],
    days: preview.days,
    techniqueCount,
    createdAt: now,
    updatedAt: now,
    homeTrainingMeta,
  };

  curriculumRepository.saveCustom(curriculum);
  return curriculum;
}

export function listMyHomeCurricula() {
  return curriculumRepository.listCustom().filter((c) => !!c.homeTrainingMeta);
}
