// "커스텀 콤보 북" — a user-authored ordered sequence of existing technique
// ids (Jab -> Cross -> Double Leg, etc.). Stores ONLY technique ids, never
// names/descriptions/posture text, so a combo can never go stale or
// duplicate the encyclopedia (spec section 6) — resolving a combo's
// techniques always goes through resolveTechnique()/resolveTechniquesByIds()
// (src/lib/userTechniques/service.ts), the same official+user-technique-aware
// lookup already used by curricula and Training Session.

export interface Combo {
  id: string;
  userId: string | null; // null until synced to an account — same convention as UserTechniqueRecord.addedByUserId
  name: string;
  description: string;
  /** Ordered, real technique ids only — official or user-added, never fabricated. */
  techniqueIds: string[];
  createdAt: string;
  updatedAt: string;
  /**
   * Present only for a combo saved from "AI 목적 기반 콤비네이션 생성" (spec
   * section 17) — the AI-generated breakdown/per-step reasons, kept purely
   * additive so every existing Combo (manually built via ComboBuilder) is
   * unaffected. Mirrors how Curriculum.aiGoalMeta was bolted onto the
   * pre-existing Curriculum type for the same reason.
   */
  aiComboMeta?: {
    goalText: string;
    /** One entry per techniqueIds[i], in the same order — the AI's own reason for that step. */
    stepReasons: string[];
    generatedAt: string;
    /**
     * Full AI breakdown beyond the per-step reason — optional so combos
     * saved before this field existed still type-check/load fine (they just
     * won't show an "AI 분석 보기" section). One entry per techniqueIds[i],
     * same order as stepReasons.
     */
    analysis?: {
      offenseOrDefense: string;
      startingSituation: string;
      range: string;
      position: string;
      finalGoal: string;
      stepDetails: { opponentReaction: string; followUpIfReacts: string }[];
      pros: string[];
      cautions: string[];
      complementaryFollowUps: { techniqueId: string | null; techniqueName: string | null }[];
      alternativeTechniques: { techniqueId: string | null; techniqueName: string | null }[];
    };
  };
  /** Present only for a combo generated as a "추천 셋업" from 스파링 분석 (see sparringAnalysis/setupGeneration.ts) — purely additive, coexists with aiComboMeta (the combo was still built via the same generateCombo() pipeline). Lets the sparring result screen distinguish its own suggestions from the user's other combos while the combo itself still shows up normally in the regular Combo list. */
  sourceMeta?: { source: 'sparring'; sparringSessionId: string; difficulty: 'basic' | 'intermediate' | 'advanced' };
}

export interface RestTimerState {
  /** Which round just finished (0-based) — the rest that follows it. */
  round: number;
  durationSeconds: number;
  endTimestamp: number;
  pausedRemainingMs: number | null;
}

/**
 * A combo "run" — one full 세트/round is one pass through every technique in
 * the combo, in order (spec section 5's "1세트 -> Jab -> Cross -> Double Leg").
 * Mirrors the Date.now()-based rest-timer + pause pattern already
 * established in todayTraining/sessionDetail.ts, kept as its own copy since
 * a combo run is a materially different shape (one round = the WHOLE
 * sequence, not independent per-technique sets) rather than something that
 * type fits into TrainingSessionDetail's per-exercise sets model.
 */
export interface ComboSessionState {
  comboId: string;
  techniqueIds: string[];
  totalRounds: number;
  restSeconds: number;
  /** 0-based index of the technique currently being performed within the round. */
  currentTechniqueIndex: number;
  /** Rounds fully completed so far. */
  completedRounds: number;
  restTimer: RestTimerState | null;
  paused: boolean;
  startedAt: string;
  finishedAt: string | null;
}
