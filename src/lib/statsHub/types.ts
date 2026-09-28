export type PeriodKey = '7d' | '30d' | '90d' | 'all';

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  '7d': '7일',
  '30d': '30일',
  '90d': '3개월',
  all: '전체',
};

export const PERIOD_DAYS: Record<Exclude<PeriodKey, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export interface OverviewStats {
  trainingCount: number;
  totalMinutes: number;
  techniquesLearnedCount: number; // distinct techniques touched within the period
  currentProficientCount: number; // current snapshot, not period-scoped (mastery has no history log)
  sparringCount: number;
  poseAnalysisCount: number;
}

export interface MartialArtStats {
  martialArtId: string;
  nameKo: string;
  trainingCount: number;
  techniqueCount: number; // distinct techniques touched within the period
  averageScore: number | null; // avg pose-analysis score within the period, null if none
}

export interface SparringMartialArtCount {
  martialArtId: string;
  nameKo: string;
  count: number;
}

export interface TechniqueUsageFrequency {
  techniqueId: string;
  techniqueName: string;
  occurrences: number;
}

export interface SparringStats {
  totalCount: number;
  byMartialArt: SparringMartialArtCount[];
  latestOverallScores: { martialArtId: string; nameKo: string; posture: number | null; distance: number | null; movement: number | null } | null;
  techniqueUsage: TechniqueUsageFrequency[];
  styleTrend: { label: string; points: number[] }[]; // e.g. "자세" -> [68, 72, 76], oldest to newest
}

export interface TrendPoint {
  date: string; // bucket label (YYYY-MM-DD or a coarser bucket key)
  value: number;
}

export interface AiTrainingSummary {
  summary: string;
  source: 'ai' | 'fallback';
  generatedAt: string;
}
