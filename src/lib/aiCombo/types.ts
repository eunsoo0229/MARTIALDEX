// "AI 목적 기반 콤비네이션 생성" — independent from aiCurriculum/ (curricula
// are unordered phase/day buckets; a combo is a single ORDERED chain of
// steps) but follows the exact same architectural shape: one Gemini call
// extracts a structured, free-text-only breakdown (never technique ids
// directly), then deterministic code resolves each step phrase to a real
// technique via search (and, when nothing matches, the Technique Discovery
// Service) — see aiCombo/service.ts.

export type ComboOffenseDefense = 'offense' | 'defense' | 'mixed';

export interface ComboGoalStep {
  /** Short phrase describing what this step is, e.g. "Jab", "Level Change" — resolved to a real technique later, never trusted as an id. */
  phrase: string;
  /** Why this step comes here, e.g. "상대의 시선을 앞으로 유도" — shown to the user next to the resolved technique. */
  purpose: string;
  /** Opponent's expected reaction to THIS specific step (not the combo as a whole) — e.g. "가드를 올려 얼굴을 방어함". */
  opponentReaction: string;
  /** What to do next given that specific reaction — the "상대 반응에 따른 다음 선택지" branch for this step. */
  followUpIfReacts: string;
}

/** What Gemini extracts from the user's free-text purpose (spec section 5). */
export interface ComboGoalAnalysis {
  /** Confirmed martial art id — defaults to the user's dropdown choice unless the text clearly says otherwise. */
  martialArt: string;
  offenseOrDefense: ComboOffenseDefense;
  startingSituation: string;
  range: string;
  position: string;
  expectedOpponentReaction: string;
  finalGoal: string;
  prerequisiteTechniques: string[];
  connectingTechniques: string[];
  /** Ordered — step 0 happens first. This ordering IS the sequencing logic (spec section 3's "논리적인 연결"); code only fills in which real technique matches each phrase, never reorders them. */
  steps: ComboGoalStep[];
  /** Why this combo works — concrete tactical advantages, not generic praise. */
  pros: string[];
  /** What can go wrong / what to watch out for when executing this combo. */
  cautions: string[];
  /** Techniques worth chaining AFTER this combo succeeds (phrases, resolved like steps). */
  complementaryFollowUps: string[];
  /** Techniques that work as a substitute for this combo in a different situation (phrases, resolved like steps). */
  alternativeTechniques: string[];
  /** One-line "목적: ..." summary for the result screen. */
  summary: string;
}

export interface ComboStepResult {
  step: ComboGoalStep;
  techniqueId: string | null;
  techniqueName: string | null;
  martialArt: string | null;
  /** Why this specific technique was chosen for this step — combines the step's own purpose with how it was resolved (existing match vs newly discovered). */
  reason: string;
  /** Set when this technique didn't exist in the library yet and was researched+registered via the Technique Discovery Service. */
  discovered: boolean;
}

/** A resolved suggestion phrase (complementaryFollowUps/alternativeTechniques) — library-search only, never triggers Technique Discovery's research+registration since these are supplementary ideas, not core combo content. Unresolved is shown as plain text, never a broken link. */
export interface ComboSuggestion {
  phrase: string;
  techniqueId: string | null;
  techniqueName: string | null;
  martialArt: string | null;
}

export interface ComboGenerationPreview {
  goalText: string;
  martialArt: string;
  analysis: ComboGoalAnalysis;
  results: ComboStepResult[];
  complementaryFollowUps: ComboSuggestion[];
  alternativeTechniques: ComboSuggestion[];
  generatedAt: string;
}
