import type { Curriculum, ExerciseConfig } from '../curriculum/types';
import type { GymRoutineDay, Weekday } from '../gymRoutine/types';
import type { TodayTrainingPlan } from './types';
import { computeAllSkillProgress, rankWeakness } from '../skillProgress/weaknessEngine';
import { getTodayGymRoutineDay } from '../gymRoutine/todayResolver';
import { getGymRoutine } from '../gymRoutine/service';
import { getKstWeekday } from '../dateUtil';

const DIFFICULTY_ORDER: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 };

// A user-configured gym routine day (src/lib/gymRoutine/) is merged into
// today's plan — this is the concrete "훈련" integration: one session can
// contain martial-arts drills AND gym exercises together. Every existing
// user with no active gym routine sees byte-identical behavior, since
// getTodayGymRoutineDay() returns null whenever there's no active routine
// or today is a configured rest day.
function buildGymExerciseConfig(gymDay: GymRoutineDay): Record<string, ExerciseConfig> {
  const config: Record<string, ExerciseConfig> = {};
  for (const target of gymDay.exercises) {
    const isTimeBased = target.targetSeconds !== null;
    config[target.techniqueId] = {
      mode: isTimeBased ? 'time' : 'reps',
      sets: target.targetSets,
      // targetReps stays a single-value summary (set 1's target) for every
      // reader that only expects one number; targetRepsPerSet below carries
      // the real per-set plan through to GymSetInput's carry-forward.
      targetReps: isTimeBased ? null : (target.targetReps[0] ?? null),
      targetRepsPerSet: isTimeBased ? undefined : target.targetReps,
      targetSeconds: isTimeBased ? target.targetSeconds : null,
      restSeconds: target.restSeconds,
      // targetWeightKg stays a single-value summary (set 1's target) for
      // every reader that only expects one number; targetWeightPerSet
      // below carries the real per-set plan through to GymSetInput's
      // carry-forward, mirroring targetRepsPerSet above (spec "헬스 운동 —
      // 세트별 무게 지원").
      targetWeightKg: target.targetWeightKg[0] ?? null,
      targetWeightPerSet: target.targetWeightKg,
    };
  }
  return config;
}

// The single place a (curriculum, day) pair turns into a TodayTrainingPlan —
// used ONLY by buildTrainingPlanForCurriculumDay() below, the explicit "이
// 커리큘럼을 지금 훈련하기" entry point (the "훈련하기" button on any
// curriculum's day-list page, official, custom, or AI 선수 스타일 alike —
// same Curriculum/CurriculumDay shape, so there is no curriculum-source
// branching anywhere in this file). generateTodayTrainingPlan() below never
// calls this — a curriculum is a learning program the user opts into
// explicitly, not a recurring routine that should auto-populate "오늘의 훈련".
function planFromCurriculumDay(
  curriculum: Curriculum,
  day: number,
  weaknessNote: TodayTrainingPlan['weaknessNote']
): TodayTrainingPlan | null {
  const dayData = curriculum.days.find((d) => d.day === day);
  if (!dayData) return null;
  return {
    mode: 'curriculum',
    curriculumId: curriculum.id,
    curriculumTitle: curriculum.title,
    martialArt: curriculum.martialArt,
    day,
    dayTitle: dayData.title,
    goal: dayData.learningGoals[0] ?? (dayData.description || null),
    techniqueIds: [...dayData.techniqueIds, ...dayData.reviewTechniqueIds],
    estimatedMinutes: dayData.estimatedMinutes,
    weaknessNote,
  };
}

/**
 * Explicit entry point for "이 커리큘럼을 지금 훈련하기" — used by the
 * unified "훈련하기" button so a Training Session always starts for the
 * curriculum + day the user is actually looking at, instead of whatever
 * generateTodayTrainingPlan() would have guessed as "today's" curriculum
 * (which only ever considers the single most-recently-studied one). This is
 * what makes AI 선수 스타일 curricula behave identically to any other —
 * they're plain Curriculum objects and go through the exact same function.
 */
export function buildTrainingPlanForCurriculumDay(curriculum: Curriculum, day: number): TodayTrainingPlan | null {
  const skillEntries = computeAllSkillProgress();
  const topWeakness = rankWeakness(skillEntries, { curriculum, limit: 1 })[0] ?? null;
  const weaknessNote =
    topWeakness && topWeakness.score !== null
      ? { techniqueId: topWeakness.techniqueId, techniqueName: topWeakness.techniqueName, score: topWeakness.score }
      : null;
  return planFromCurriculumDay(curriculum, day, weaknessNote);
}

// The single place a (routine, weekday) pair turns into a TodayTrainingPlan
// — shared by today's auto-loaded routine (generateTodayTrainingPlan) and
// "다른 요일 루틴으로 운동하기" (buildTrainingPlanForGymRoutineDay), so a
// borrowed day carries exactly the same targets (order, sets, per-set
// reps/weight, seconds, rest) as if it had been scheduled today.
function planFromGymRoutineDay(
  routineId: string,
  weekday: Weekday,
  day: GymRoutineDay,
  weaknessNote: TodayTrainingPlan['weaknessNote'],
  substituted: boolean
): TodayTrainingPlan {
  return {
    mode: 'gym_routine',
    curriculumId: null,
    curriculumTitle: null,
    martialArt: null,
    day: null,
    dayTitle: null,
    goal: '오늘의 웨이트 루틴',
    techniqueIds: day.exercises.map((e) => e.techniqueId),
    estimatedMinutes: day.exercises.length * 8,
    weaknessNote,
    gymExerciseConfig: buildGymExerciseConfig(day),
    gymRoutineId: routineId,
    gymRoutineWeekday: weekday,
    ...(substituted ? { gymRoutineSubstituted: true } : {}),
  };
}

/**
 * "다른 요일 루틴으로 운동하기" — builds today's plan from ANY weekday of a
 * routine (e.g. 수요일 LEGS on a Monday). Read-only on the routine: the
 * plan gets its own copy of the day's targets, so neither the source day
 * nor today's scheduled day is changed. Null if the routine or that day
 * has no exercises (rest day).
 */
export function buildTrainingPlanForGymRoutineDay(routineId: string, weekday: Weekday, now: Date = new Date()): TodayTrainingPlan | null {
  const routine = getGymRoutine(routineId);
  const day = routine?.days.find((d) => d.weekday === weekday);
  if (!routine || !day || day.exercises.length === 0) return null;
  return planFromGymRoutineDay(routine.id, weekday, day, null, weekday !== getKstWeekday(now));
}

// "오늘의 훈련" is for RECURRING ROUTINES only (요일별 웨이트 루틴), never a
// curriculum — a curriculum is a multi-day learning PROGRAM the user works
// through explicitly (via each curriculum's own "훈련하기" button, which
// still goes through buildTrainingPlanForCurriculumDay() below unchanged),
// not a daily routine that should silently take over this auto-suggested
// plan just because it happens to be "in progress". When there's no active
// gym routine for today, this falls back to a short ad-hoc plan built from
// real skill/practice data (never random techniques, and never biased
// toward any curriculum's technique list).
export function generateTodayTrainingPlan(): TodayTrainingPlan {
  const skillEntries = computeAllSkillProgress();
  const topWeakness = rankWeakness(skillEntries, { limit: 1 })[0] ?? null;
  const weaknessNote =
    topWeakness && topWeakness.score !== null
      ? { techniqueId: topWeakness.techniqueId, techniqueName: topWeakness.techniqueName, score: topWeakness.score }
      : null;

  const gymDay = getTodayGymRoutineDay();

  // A deliberately-set recurring routine is a stronger signal than an
  // inferred weakness pick, so it wins over the ad_hoc fallback below.
  if (gymDay) {
    return planFromGymRoutineDay(gymDay.routineId, gymDay.weekday, gymDay.day, weaknessNote, false);
  }

  // No gym routine configured for today — build a short recommendation from the user's own
  // record: review the single weakest analyzed technique, then a couple of
  // not-yet-started techniques from a martial art the user has already
  // touched (never a martial art they've shown no signal for at all).
  const familiarArts = new Set(
    skillEntries.filter((e) => e.progress.analysisCount > 0 || e.progress.practiceCount > 0).map((e) => e.technique.martialArt)
  );
  const reviewCandidates = rankWeakness(skillEntries, { limit: 1 });
  const notStartedCandidates = skillEntries
    .filter((e) => e.progress.status === 'not_started' && familiarArts.has(e.technique.martialArt))
    .sort((a, b) => {
      const da = a.technique.difficulty ? DIFFICULTY_ORDER[a.technique.difficulty] ?? 3 : 3;
      const db = b.technique.difficulty ? DIFFICULTY_ORDER[b.technique.difficulty] ?? 3 : 3;
      return da !== db ? da - db : a.technique.id.localeCompare(b.technique.id);
    })
    .slice(0, 3);

  const techniqueIds = [...reviewCandidates.map((r) => r.techniqueId), ...notStartedCandidates.map((e) => e.technique.id)].slice(0, 3);

  if (techniqueIds.length === 0) {
    return {
      mode: 'no_data',
      curriculumId: null,
      curriculumTitle: null,
      martialArt: null,
      day: null,
      dayTitle: null,
      goal: null,
      techniqueIds: [],
      estimatedMinutes: 0,
      weaknessNote: null,
    };
  }

  const firstEntry = skillEntries.find((e) => e.technique.id === techniqueIds[0]);
  return {
    mode: 'ad_hoc',
    curriculumId: null,
    curriculumTitle: null,
    martialArt: firstEntry?.technique.martialArt ?? null,
    day: null,
    dayTitle: null,
    goal: '최근 학습 기록을 기반으로 한 오늘의 추천 학습',
    techniqueIds,
    estimatedMinutes: techniqueIds.length * 12,
    weaknessNote,
  };
}
