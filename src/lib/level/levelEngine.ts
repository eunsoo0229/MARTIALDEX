import type { ProfileStatsInput } from '../profileStats/collectProfileStats';

// App-internal learning-progress labels only — never implies a real belt
// rank, certification, or competition result (spec explicitly requires
// this distinction to stay visible wherever a level is shown).
const LEVEL_LABELS = ['Beginner', 'Learner', 'Practitioner', 'Dedicated', 'Advanced Practitioner', 'Veteran', 'Master Student'];
const LEVEL_THRESHOLDS = [0, 50, 150, 350, 700, 1200, 2000];

export interface LevelInfo {
  level: number;
  label: string;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number | null;
}

// A simple deterministic weighted sum over real counts — not a hidden
// scoring model, and never derived from anything but genuine recorded
// activity (learned/proficient technique counts, completed sessions,
// completed curricula). completedTrainingSessions already includes combo
// runs (they're recorded via the same trainingHistory log, source:'combo'),
// so combo/tactic terms below are deliberately NOT re-weighted at the same
// rate as a completed session — they add a modest bonus for having actually
// built combos/tactics and used the AI feedback, without double-counting
// the underlying session completions.
export function computeXp(stats: ProfileStatsInput): number {
  return (
    stats.learnedCount * 2 +
    stats.proficientCount * 5 +
    stats.completedTrainingSessions * 3 +
    stats.sparringSessionCount * 8 +
    stats.completedCurriculaCount * 30 +
    stats.completedStyleCurriculaCount * 40 +
    stats.poseAnalysisCount * 2 +
    stats.comboCount * 3 +
    stats.tacticCount * 4 +
    stats.tacticFeedbackCount * 2
  );
}

export function computeLevelInfo(stats: ProfileStatsInput): LevelInfo {
  const xp = computeXp(stats);
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }
  const thresholdIndex = level - 1;
  const currentThreshold = LEVEL_THRESHOLDS[thresholdIndex];
  const nextThreshold = LEVEL_THRESHOLDS[thresholdIndex + 1] ?? null;
  return {
    level,
    label: LEVEL_LABELS[thresholdIndex] ?? LEVEL_LABELS[LEVEL_LABELS.length - 1],
    xp,
    xpIntoLevel: xp - currentThreshold,
    xpForNextLevel: nextThreshold !== null ? nextThreshold - currentThreshold : null,
  };
}
