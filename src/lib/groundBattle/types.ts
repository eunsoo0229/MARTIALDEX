// Ground Battle — turn-based ground-grappling game mode, scoped to BJJ only
// for v1 (see curatedRoster.ts's doc comment for why). This module never
// touches the shared Technique/posture/difficulty data — it is purely
// GAME-DESIGN metadata (success chances, stamina costs, category
// assignments this feature invented for balance) layered on top of REAL
// technique ids already in data/processed/bjj.json. Mirrors the
// sparringSession/ domain's exact file split and local-first + Supabase
// sync pattern (types/repository/service + matchStore for the live run).

export type PositionFamily = 'guard' | 'half_guard' | 'side_control' | 'mount' | 'knee_on_belly' | 'back_control' | 'turtle';

export type PositionRole = 'top' | 'bottom';

/** The technique-tagging vocabulary CuratedGroundTechnique.usableFrom uses. */
export type PositionState =
  | 'guard_top' | 'guard_bottom'
  | 'half_guard_top' | 'half_guard_bottom'
  | 'side_control_top' | 'side_control_bottom'
  | 'mount_top' | 'mount_bottom'
  | 'knee_on_belly_top' | 'knee_on_belly_bottom'
  | 'back_control_top' | 'back_control_bottom'
  | 'turtle_top' | 'turtle_bottom';

/**
 * The match's shared ground position — only ONE of these exists at a time,
 * with an explicit role assignment, so "who's on top" can never desync
 * between the two fighters (unlike two independently-mutable fields would
 * allow). `topRole` is a control/advantage abstraction, not literal
 * geometry, for back_control (top = has hooks/seatbelt) and turtle
 * (top = attacking a turtled opponent).
 */
export interface GroundPosition {
  family: PositionFamily;
  topRole: 'player' | 'opponent';
}

export type ActionCategory = 'attack' | 'escape' | 'position' | 'defend' | 'submission';

export const ACTION_CATEGORY_LABEL: Record<ActionCategory, string> = {
  attack: '공격',
  escape: '탈출',
  position: '포지션',
  defend: '방어',
  submission: '서브미션',
};

export interface PositionOutcome {
  family: PositionFamily;
  /** Role the ACTING fighter ends up in — the other fighter's role is always the complement, derived automatically, never set independently. */
  actorRole: PositionRole;
}

/**
 * One hand-curated roster entry. `techniqueId` must be a REAL id already
 * present in data/processed/bjj.json — validated at module load time in
 * dev (see curatedRoster.ts). Everything else here (category, stamina
 * cost, success chance, outcome positions) is game-balance metadata this
 * feature invents; it is never written back into the shared Technique
 * object and never claimed as a real-world fact about the technique.
 */
export interface CuratedGroundTechnique {
  techniqueId: string;
  usableFrom: PositionState[];
  category: ActionCategory;
  /** Tunable scale (roughly 5-25). */
  staminaCost: number;
  /** 0-1 base success chance BEFORE the resolver's modifiers. */
  baseSuccessChance: number;
  onSuccess?: PositionOutcome;
  onPartial?: PositionOutcome;
  onFail?: PositionOutcome;
  onReversal?: PositionOutcome;
  isSubmissionFinish: boolean;
  /** Only for isSubmissionFinish entries: consecutive successful ticks needed to end the match. */
  submissionProgressNeeded?: number;
}

export type TurnOutcome = 'illegal' | 'success' | 'partial' | 'fail' | 'reversal';

export interface FighterState {
  hp: number;
  stamina: number;
  lastActionCategory: ActionCategory | null;
  /** Small stacking bonus from a prior successful 'position' action this same fighter took; decays on this fighter's own next turn. */
  controlBonus: number;
}

export interface SubmissionThreat {
  techniqueId: string;
  holder: 'player' | 'opponent';
  progress: number;
}

export interface TurnLogEntry {
  turnNumber: number;
  actor: 'player' | 'opponent';
  techniqueId: string;
  category: ActionCategory;
  positionBefore: PositionState;
  outcome: TurnOutcome;
  positionAfter: PositionState;
  hpDelta: { player: number; opponent: number };
  staminaSpent: number;
  timestamp: string;
}

export type BattlePhase = 'player_turn' | 'opponent_turn' | 'pass_device' | 'finished';

export type MatchOutcome =
  | 'player_submission_win'
  | 'opponent_submission_win'
  | 'player_tko_win'
  | 'opponent_tko_win'
  | 'decision_player'
  | 'decision_opponent'
  | 'draw'
  | null;

export const OUTCOME_LABEL: Record<Exclude<MatchOutcome, null>, string> = {
  player_submission_win: '서브미션 승리',
  opponent_submission_win: '서브미션 패배',
  player_tko_win: '판정 승리',
  opponent_tko_win: '판정 패배',
  decision_player: '판정승',
  decision_opponent: '판정패',
  draw: '무승부',
};

export type BattleDifficulty = 'easy' | 'normal';
export const DIFFICULTY_LABEL: Record<BattleDifficulty, string> = { easy: '쉬움', normal: '보통' };

export type BattleMode = 'ai' | 'local_2p';

/** The live, in-progress match state — mirrors SparringRunState's shape/role. */
export interface GroundBattleRunState {
  id: string;
  difficulty: BattleDifficulty;
  mode: BattleMode;
  startedAt: string;
  finishedAt: string | null;
  turnNumber: number;
  phase: BattlePhase;
  position: GroundPosition;
  player: FighterState;
  opponent: FighterState;
  activeSubmissionThreat: SubmissionThreat | null;
  turnLog: TurnLogEntry[];
  outcome: MatchOutcome;
  rngSeed: number;
  /** Frozen at Battle Setup — the player's usable technique ids for this match. */
  playerLoadoutTechniqueIds: string[];
}

/** One completed (or manually-ended) match — the record actually saved to ground_battle_matches. */
export interface GroundBattleMatchRecord {
  id: string;
  difficulty: BattleDifficulty;
  mode: BattleMode;
  outcome: MatchOutcome;
  startedAt: string;
  finishedAt: string;
  turnCount: number;
  turnLog: TurnLogEntry[];
  createdAt: string;
  updatedAt: string;
}
