// Fighter Style Learning — types shared across identification, style
// analysis, technique matching, and curriculum planning. See
// data/curated/POSE_ANALYSIS.md / curriculum/types.ts for the sibling
// features this one builds on top of (nothing here duplicates them).

export interface FighterCandidate {
  /** Slug, e.g. "islam-makhachev" — used as fighterId everywhere downstream. */
  id: string;
  name: string;
  sport: string;
  shortDescription: string;
}

// Matches the shape described in the feature spec exactly. Every array is a
// list of short phrases in Gemini's own words — real Martialdex technique
// ids are never part of this object; that mapping happens later, in code,
// via techniqueMatcher.ts.
export interface FighterStyleAnalysis {
  fighterId: string;
  fighterName: string;
  styleSummary: string;
  primaryStyles: string[];
  keyStrengths: string[];
  preferredPositions: string[];
  keyTechniques: string[];
  transitions: string[];
  distanceManagement: string[];
  defensiveConcepts: string[];
  offensiveConcepts: string[];
  trainingFocus: string[];
  /** ISO timestamp — when this analysis was generated (for cache display / staleness). */
  generatedAt: string;
}

export type StylePhaseKey = 'fundamentals' | 'entries' | 'position' | 'connection' | 'situational';

export interface TechniqueMatch {
  techniqueId: string;
  techniqueName: string;
  martialArt: string;
  /** 0-100, computed from search-rank + which style-analysis field it came from — never random. */
  relevanceScore: number;
  reason: string;
  phase: StylePhaseKey;
}

export type UserLevel = 'first_time' | 'beginner' | 'intermediate' | 'advanced';
export type Intensity = 'light' | 'normal' | 'intensive';
export type DurationMode = 'ai_recommended' | 'user_selected';

export interface StyleCurriculumMeta {
  fighterId: string;
  fighterName: string;
  targetStyle?: string;
  durationMode: DurationMode;
  intensity: Intensity;
  userLevel: UserLevel;
  styleAnalysis: FighterStyleAnalysis;
  /** Persisted "ingredients" so duration/intensity can be changed later without another Gemini call. */
  matchedTechniques: TechniqueMatch[];
}

export interface DurationRecommendation {
  recommendedDays: number;
  reason: string;
}

export const MIN_DURATION_DAYS = 7;
export const MAX_DURATION_DAYS = 180;
