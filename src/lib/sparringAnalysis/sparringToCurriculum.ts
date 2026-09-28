import type { Curriculum } from '../curriculum/types';
import { curriculumRepository } from '../curriculum/repository';
import { getAuthorName } from '../curriculum/curriculumService';
import type { GoalAnalysis, GoalIntensity, GoalUserLevel } from '../aiCurriculum/types';
import { GOAL_MAX_DURATION_DAYS, GOAL_MIN_DURATION_DAYS } from '../aiCurriculum/types';
import { discoverMissingDesiredTechniques, fallbackTechniquePool, matchGoalToTechniques } from '../aiCurriculum/techniqueMatcher';
import { classifyIntentsFromText } from '../aiCurriculum/intentClassifier';
import { INTENSITY_PER_DAY, planGoalCurriculum } from '../aiCurriculum/curriculumPlanner';
import { validateCurriculumDays } from '../aiCurriculum/validator';
import { computeAllSkillProgress } from '../skillProgress/weaknessEngine';
import type { MasteryStatus } from '../skillProgress/types';
import type { SparringSession } from './types';

// Upgraded from the original bare `searchTechniques(area.label, 4)` version
// to reuse the EXACT SAME matching/planning pipeline "AI 맞춤 커리큘럼" uses
// (matchGoalToTechniques -> discoverMissingDesiredTechniques ->
// fallbackTechniquePool -> planGoalCurriculum -> validateCurriculumDays,
// all in src/lib/aiCurriculum/) — never analyzeGoal()'s free-text Gemini
// call, since the "goal" here is already fully structured from real
// sparring-analysis data (weak areas, real detected patterns, mastery),
// not free text a user typed. This is the exact reuse seam confirmed by
// investigation: every one of those functions takes a plain GoalAnalysis
// data object, with no dependency on how it was produced.

function newId(): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `custom__${rand}`;
}

function buildMasteryMap(): Map<string, MasteryStatus> {
  const map = new Map<string, MasteryStatus>();
  for (const { technique, progress } of computeAllSkillProgress()) map.set(technique.id, progress.status);
  return map;
}

// Same formula as aiCurriculum/service.ts's private estimateNeededPoolSize —
// duplicated rather than exported/imported since it's a tiny, self-contained
// heuristic and this module deliberately doesn't reach into that service
// file's internals.
function estimateNeededPoolSize(targetDays: number, intensity: GoalIntensity): number {
  const [lo, hi] = INTENSITY_PER_DAY[intensity];
  const avgPerDay = (lo + hi) / 2;
  return Math.ceil(Math.max(6, targetDays * avgPerDay * 0.9));
}

function intensityFromDailyMinutes(minutes: number): GoalIntensity {
  if (minutes <= 20) return 'light';
  if (minutes <= 50) return 'normal';
  return 'intensive';
}

export interface SparringCurriculumOptions {
  durationDays?: number;
  dailyMinutes?: number;
  /** Overrides which weak-area labels to focus on — defaults to the session's own top weak areas when omitted (spec 12's "집중하고 싶은 약점" selector). */
  focusAreaLabels?: string[];
}

/**
 * Every phrase below comes from data the session actually computed — weak
 * areas (scoringEngine.ts), repeated real A→B patterns (sequenceAnalysis.ts),
 * and (when available) the AI coaching synthesis's weaknesses/improvement
 * directions, themselves already whitelist-validated against real patterns
 * in coachingSynthesis.ts. Nothing here invents a weakness that wasn't
 * actually observed.
 */
function buildSyntheticGoalAnalysis(session: SparringSession, focusAreaLabels?: string[]): GoalAnalysis {
  const areaLabels = (focusAreaLabels && focusAreaLabels.length > 0 ? focusAreaLabels : session.weakAreas.map((a) => a.label)).slice(0, 5);
  const patternPhrases = (session.sequenceAnalysis?.repeatedPatterns ?? [])
    .slice(0, 3)
    .map((p) => `${p.fromTechniqueName} 이후 ${p.toTechniqueName ?? '후속 공격'} 연결`);
  const synthesisWeaknesses = (session.coachingSynthesis?.weaknesses ?? []).map((w) => w.label);
  const improvementDirections = session.coachingSynthesis?.improvementDirections ?? [];

  const weaknesses = [...new Set([...areaLabels, ...synthesisWeaknesses])];
  const goals = [...new Set([...patternPhrases, ...improvementDirections])];
  const priority = weaknesses.slice(0, 6);
  const combinedText = [...weaknesses, ...goals].join(' ');

  // IMPORTANT: weak-area/coaching labels ("Distance Management", "공격 후
  // 후속타 부족") are diagnostic CATEGORY phrases, never literal technique
  // names — they belong in weaknesses/goals (search-weighted, harmless even
  // when nothing matches) and must never be put in desiredTechniques, since
  // that field is exactly what discoverMissingDesiredTechniques() below
  // tries to research-and-register as a REAL new technique. Only genuinely
  // real, already-resolved technique names (the ones this exact session
  // already detected) belong there — discoverMissingDesiredTechniques will
  // then simply skip them as already-matched, never invent a fake
  // "Distance Management" technique.
  const desiredTechniques = [...new Set((session.sequenceAnalysis?.repeatedPatterns ?? []).flatMap((p) => [p.fromTechniqueName, p.toTechniqueName]).filter((n): n is string => !!n))].slice(0, 5);

  return {
    martialArt: session.martialArt,
    // Deliberately conservative default — the real per-technique mastery map
    // (buildMasteryMap, below) does the actual difficulty reweighting inside
    // matchGoalToTechniques/fallbackTechniquePool, so this label only affects
    // fallback-pool difficulty-proximity sorting, never claims to know the
    // user's real skill level.
    estimatedLevel: 'beginner' as GoalUserLevel,
    weaknesses,
    desiredStyle: [],
    desiredTechniques,
    goals: goals.length > 0 ? goals : weaknesses,
    priority,
    intents: classifyIntentsFromText(combinedText),
    // A sparring-derived weak-area curriculum is a "learn/improve this"
    // request, never an explicit "show me the variety within X" one — false
    // is the correct default per aiCurriculum/diversity.ts's doc comment
    // (only an explicit user request should turn on structural-role
    // demotion of fundamentals/entries/etc).
    diversityRequested: false,
    // No external-search stage runs for this synthetic, sparring-derived
    // analysis (researchTechniquesForGoal's buildResearchAngles falls back
    // to the legacy priority/goals/weaknesses phrases when this is empty).
    searchTopics: [],
    referencedFighterName: null,
    clarifyingQuestion: null,
    summary: `스파링 분석에서 발견된 약점 개선: ${weaknesses.join(', ')}`,
    suggestedDurationDays: 14,
    durationReason: '스파링 분석에서 발견된 약점을 반복 훈련으로 보완하기 위한 기간입니다.',
  };
}

export async function createSparringImprovementCurriculum(
  session: SparringSession,
  userId: string | null,
  options?: SparringCurriculumOptions
): Promise<Curriculum> {
  if (session.weakAreas.length === 0) throw new Error('createSparringImprovementCurriculum: session has no weak areas');

  const analysis = buildSyntheticGoalAnalysis(session, options?.focusAreaLabels);
  const totalDays = Math.round(Math.max(GOAL_MIN_DURATION_DAYS, Math.min(GOAL_MAX_DURATION_DAYS, options?.durationDays ?? 14)));
  const dailyMinutes = options?.dailyMinutes ?? 30;
  const intensity = intensityFromDailyMinutes(dailyMinutes);
  const masteryByTechniqueId = buildMasteryMap();

  let matches = matchGoalToTechniques(analysis, session.martialArt, masteryByTechniqueId);

  // Only real, already-detected technique names go through Discovery
  // Service verification here (see buildSyntheticGoalAnalysis's comment) —
  // weak-area/pattern LABELS are never treated as technique names to
  // research-and-register. In practice this mostly no-ops (the names came
  // from techniques this session already resolved, so matchGoalToTechniques
  // above typically already matched them), but stays correct if a name
  // didn't survive the search step for some reason.
  const discovered = await discoverMissingDesiredTechniques(analysis.desiredTechniques, session.martialArt, userId, matches, analysis.intents);
  if (discovered.length > 0) {
    const byId = new Map(matches.map((m) => [m.techniqueId, m]));
    for (const m of discovered) if (!byId.has(m.techniqueId)) byId.set(m.techniqueId, m);
    matches = [...byId.values()].sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  const neededPoolSize = estimateNeededPoolSize(totalDays, intensity);
  if (matches.length < neededPoolSize) {
    const fallback = fallbackTechniquePool(session.martialArt, analysis.estimatedLevel, {
      masteryByTechniqueId,
      limit: neededPoolSize,
      intents: analysis.intents,
    });
    const byId = new Map(matches.map((m) => [m.techniqueId, m]));
    for (const m of fallback) if (!byId.has(m.techniqueId)) byId.set(m.techniqueId, m);
    matches = [...byId.values()].sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  if (matches.length === 0) {
    throw new Error('createSparringImprovementCurriculum: 발견된 약점에 맞는 실제 기술을 찾지 못했습니다.');
  }

  const subjectLabel = `스파링 개선 (${new Date(session.date).toLocaleDateString('ko-KR')})`;
  const { days, phases } = planGoalCurriculum({
    subjectLabel,
    matches,
    targetDays: totalDays,
    intensity,
    userLevel: analysis.estimatedLevel,
    masteryByTechniqueId,
  });
  const validation = validateCurriculumDays(days, totalDays);
  if (!validation.ok) {
    throw new Error(`createSparringImprovementCurriculum: 생성된 커리큘럼 검증 실패 — ${validation.errors.join(', ')}`);
  }

  const now = new Date().toISOString();
  const techniqueCount = new Set(days.flatMap((d) => d.techniqueIds)).size;
  const curriculum: Curriculum = {
    id: newId(),
    martialArt: session.martialArt,
    title: `스파링 분석 개선 커리큘럼 (${new Date(session.date).toLocaleDateString('ko-KR')})`,
    subtitle: '스파링 영상 분석 기반 맞춤 커리큘럼',
    description:
      '실제 스파링 영상 분석에서 관찰된 약점과 패턴을 바탕으로 생성된 커리큘럼입니다. ' +
      '영상 분석 결과는 참고용이며 실제 전문 지도자의 지도를 대체하지 않습니다.',
    source: 'custom',
    visibility: 'private',
    authorName: getAuthorName(),
    coverIcon: '🥊',
    totalDays: days.length,
    estimatedWeeks: Math.max(1, Math.ceil(days.length / 4)),
    phases,
    days,
    techniqueCount,
    createdAt: now,
    updatedAt: now,
    sparringAnalysisMeta: { sparringSessionId: session.id, weakAreaLabels: analysis.weaknesses, generatedAt: now },
  };

  curriculumRepository.saveCustom(curriculum);
  return curriculum;
}
