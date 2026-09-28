import type { PositionBreakdown } from '../skillProgress/weaknessEngine';

export interface TechniqueFrequencyEntry {
  techniqueId: string;
  techniqueName: string;
  martialArt: string;
  count: number;
}

export interface MartialArtUsage {
  martialArtId: string;
  nameKo: string;
  count: number;
}

// Every field here is a real, already-computed number or list — no AI
// touches this object. If `hasEnoughData` is false, the page must show
// "분석 데이터가 부족합니다" and nothing else may be inferred from it.
export interface MyStyleDataSummary {
  hasEnoughData: boolean;
  sparringSessionCount: number;
  trainingSessionCount: number;
  analyzedTechniqueCount: number;
  practicedTechniqueCount: number;
  positionBreakdown: PositionBreakdown[];
  techniqueFrequency: TechniqueFrequencyEntry[];
  avgOverallScores: {
    movement: number | null;
    distance: number | null;
    defense: number | null;
    offense: number | null;
    posture: number | null;
  } | null;
  recentStyleObservations: string[];
  recentWeakAreaLabels: string[];
  martialArtsPracticed: MartialArtUsage[];
  inputHash: string;
}

export interface MyStyleAnalysis {
  styleName: string;
  traits: string[];
  attackTendency: string;
  defenseTendency: string;
  distance: string;
  footwork: string;
  clinch: string;
  takedown: string;
  ground: string;
  techniqueSelection: string;
  transitionPattern: string;
  source: 'ai' | 'fallback';
  generatedAt: string;
  inputHash: string;
}
