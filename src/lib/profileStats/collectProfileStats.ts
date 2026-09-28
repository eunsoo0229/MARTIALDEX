import { computeAllSkillProgress, summarizeOverallCounts, type TechniqueSkillEntry } from '../skillProgress/weaknessEngine';
import { listTrainingHistory } from '../trainingHistory/service';
import { listSparringSessions } from '../sparringAnalysis/sparringSessionService';
import { getProgress, listMyCurricula } from '../curriculum/curriculumService';
import { listMyStyleCurricula } from '../fighterStyle/styleCurriculumService';
import { computeStreak } from '../streak/streakEngine';
import { getAllRecords } from '../poseAnalysis/recordsService';
import { listMyCombos } from '../combo/service';
import { listMyTactics } from '../tactic/service';

export interface ProfileStatsInput {
  learnedCount: number;
  proficientCount: number;
  completedTrainingSessions: number;
  sparringSessionCount: number;
  completedCurriculaCount: number;
  completedStyleCurriculaCount: number;
  currentStreak: number;
  longestStreak: number;
  lastTrainedDate: string | null;
  /** 24단계 — Martial Rank & Badge: additional real activity signals (see rank/levelEngine.ts, achievements/definitions.ts). */
  poseAnalysisCount: number;
  comboCount: number;
  comboTrainingSessionCount: number;
  tacticCount: number;
  tacticFeedbackCount: number;
  distinctMartialArtsLearned: number;
}

// One shared real-data pass used by BOTH the achievements engine and the
// level engine, so "학습 기술 수"/"완료한 커리큘럼 수" etc. are computed
// exactly once and mean the same thing everywhere they're shown (Profile
// page, achievements, AI coach context).
export function collectProfileStats(skillEntries: TechniqueSkillEntry[] = computeAllSkillProgress()): ProfileStatsInput {
  const counts = summarizeOverallCounts(skillEntries);
  const trainingHistory = listTrainingHistory();
  const sparringSessions = listSparringSessions();
  const myCurricula = listMyCurricula();
  const myStyleCurricula = listMyStyleCurricula();
  const streak = computeStreak(trainingHistory);
  const myCombos = listMyCombos();
  const myTactics = listMyTactics();
  const distinctMartialArtsLearned = new Set(
    skillEntries.filter((e) => e.progress.status !== 'not_started').map((e) => e.technique.martialArt)
  ).size;

  return {
    learnedCount: counts.total - counts.not_started,
    proficientCount: counts.proficient,
    completedTrainingSessions: trainingHistory.filter((e) => e.completed).length,
    sparringSessionCount: sparringSessions.length,
    completedCurriculaCount: myCurricula.filter((c) => getProgress(c.id)?.progress === 100).length,
    completedStyleCurriculaCount: myStyleCurricula.filter((c) => getProgress(c.id)?.progress === 100).length,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    lastTrainedDate: streak.lastTrainedDate,
    poseAnalysisCount: getAllRecords().length,
    comboCount: myCombos.length,
    comboTrainingSessionCount: trainingHistory.filter((e) => e.completed && e.source === 'combo').length,
    tacticCount: myTactics.length,
    tacticFeedbackCount: myTactics.filter((t) => !!t.feedback).length,
    distinctMartialArtsLearned,
  };
}
