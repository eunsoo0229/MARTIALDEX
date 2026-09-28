// "상황별 전술 셋업" — an IF (situation) -> THEN (ordered real technique ids)
// tactic the user authors. Same "store only technique ids, never
// duplicate encyclopedia data" rule as src/lib/combo/types.ts — a tactic is
// conceptually a combo with an attached situation description and optional
// AI feedback, so its shape deliberately mirrors Combo's.

export interface Tactic {
  id: string;
  userId: string | null; // null until synced to an account — same convention as Combo.userId
  name: string;
  /** The "IF" condition — free text describing the opponent situation (e.g. "상대가 잽을 사용한다"). */
  situation: string;
  /** Ordered "THEN" sequence — real technique ids only, official or user-added. */
  techniqueIds: string[];
  /** Short AI-generated tactical commentary — null until the user requests it (spec section 9). */
  feedback: string | null;
  feedbackGeneratedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
