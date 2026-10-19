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
  /**
   * Present only for a copy saved from someone else's 사용자 콤보·셋업 (☆ 즐겨찾기 / 내 콤보에 저장 —
   * sharedCombo/myComboCopy.ts). Additive: the copy is an ordinary combo-book entry, so 콤보 훈련
   * and AI Visualizing Mitt use it like any other. Steps the copy couldn't resolve (the author's
   * own private techniques) are listed in missingSteps instead of being invented.
   */
  sharedMeta?: {
    sharedComboId: string;
    authorNickname: string;
    kind: 'combo' | 'setup';
    purpose: string;
    savedAt: string;
    missingSteps: string[];
    stepNotes: { techniqueId: string; note: string; opponentReaction: string | null }[];
  };
  /** Present only for a combo built in "AI Visualizing Mitt" (src/lib/visualMitt/) — additive; the combo is still an ordinary combo-book entry (same ids, same sync). */
  visualMittMeta?: {
    createdAt: string;
    stance: 'orthodox' | 'southpaw';
    /** combo = 연속 공격, setup = 반응 유도 후 연결. Absent on combos saved before this existed (= combo). */
    type?: 'combo' | 'setup';
    purpose?: string;
    repetitions?: number;
    speed?: 'slow' | 'normal' | 'fast';
    coachingNote?: string;
    stepNotes?: { techniqueId: string; note: string; opponentReaction: string | null }[];
    source?: 'ai' | 'user';
  };
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
