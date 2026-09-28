import { computeSkillProgress } from '../skillProgress/computeSkillProgress';
import { getCuratedTechnique } from './curatedRoster';
import { applyOutcome, stateFor } from './positionUtil';
import { mulberry32 } from './rng';
import type { ActionCategory, FighterState, GroundBattleRunState, PositionFamily, TurnLogEntry, TurnOutcome } from './types';

// Rule-based (never physics-simulated) combat resolver — one formula, no
// per-technique special-case branches. Every tunable lives in this one
// constants block so the whole game can be rebalanced without touching
// logic.
export const CONSTANTS = {
  STAMINA_DIFF_DIVISOR: 300,
  SUBMISSION_FATIGUE_BONUS: 0.1,
  DEFEND_PENALTY: 0.15,
  ESCALATION_BONUS_PER_TICK: 0.08,
  ESCALATION_CAP: 0.24,
  LOW_MASTERY_PENALTY: -0.1,
  PROFICIENT_BONUS: 0.1,
  PARTIAL_SPLIT: 0.7,
  REVERSAL_WINDOW: 0.15,
  OUTCOME_STAMINA_MULTIPLIER: { success: 0.9, partial: 1.0, fail: 1.2, reversal: 1.3 } as Record<'success' | 'partial' | 'fail' | 'reversal', number>,
  PASSIVE_STAMINA_REGEN_PER_TURN: 3,
  MAX_STAMINA: 100,
  MAX_HP: 100,
  DOMINANCE_MULTIPLIER: { mount: 1.5, back_control: 1.5, knee_on_belly: 1.2, side_control: 1.1, turtle: 0.8, half_guard: 0, guard: 0 } as Record<PositionFamily, number>,
  BASE_CONTROL_DAMAGE: 6,
  SUBMISSION_TICK_DAMAGE: 4,
  MIN_STAMINA_FRACTION_TO_ATTEMPT: 0.4,
  FATIGUE_TAX: 3,
  MAX_TURNS: 40,
};

export interface ResolveTurnResult {
  outcome: TurnOutcome;
  logEntry: TurnLogEntry;
  newState: GroundBattleRunState;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Re-checks legality unconditionally, even though the UI/AI should never offer an illegal pick — defense in depth. */
function isLegal(state: GroundBattleRunState, actor: 'player' | 'opponent', techniqueId: string): boolean {
  const technique = getCuratedTechnique(techniqueId);
  if (!technique) return false;
  if (!technique.usableFrom.includes(stateFor(actor, state.position))) return false;
  if (actor === 'player' && !state.playerLoadoutTechniqueIds.includes(techniqueId)) return false;
  return true;
}

export function resolveTurn(state: GroundBattleRunState, actor: 'player' | 'opponent', techniqueId: string, rngOverride?: () => number): ResolveTurnResult {
  const technique = getCuratedTechnique(techniqueId);
  const opponent: 'player' | 'opponent' = actor === 'player' ? 'opponent' : 'player';
  const positionBefore = stateFor(actor, state.position);

  const noChangeLog = (outcome: TurnOutcome, category: ActionCategory, staminaSpent: number): TurnLogEntry => ({
    turnNumber: state.turnNumber,
    actor,
    techniqueId,
    category,
    positionBefore,
    outcome,
    positionAfter: positionBefore,
    hpDelta: { player: 0, opponent: 0 },
    staminaSpent,
    timestamp: new Date().toISOString(),
  });

  // An illegal pick still consumes the turn (otherwise guessing every
  // technique for free would trivialize the "judge it yourself" rule) but
  // changes nothing and consumes no RNG roll. It is logged so the post-match
  // review can honestly show it.
  if (!technique || !isLegal(state, actor, techniqueId)) {
    return { outcome: 'illegal', logEntry: noChangeLog('illegal', technique?.category ?? 'attack', 0), newState: state };
  }

  const actorFighter = state[actor];
  const opponentFighter = state[opponent];

  // Too exhausted to even attempt — small flat fatigue tax, no roll consumed.
  if (actorFighter.stamina < technique.staminaCost * CONSTANTS.MIN_STAMINA_FRACTION_TO_ATTEMPT) {
    const spent = Math.min(actorFighter.stamina, CONSTANTS.FATIGUE_TAX);
    const nextActorFighter: FighterState = { ...actorFighter, stamina: actorFighter.stamina - spent, lastActionCategory: technique.category };
    return {
      outcome: 'fail',
      logEntry: noChangeLog('fail', technique.category, spent),
      newState: { ...state, [actor]: nextActorFighter },
    };
  }

  const rng = rngOverride ?? mulberry32(state.rngSeed + state.turnNumber);

  const isContinuingSameSubmission = !!state.activeSubmissionThreat && state.activeSubmissionThreat.holder === actor && state.activeSubmissionThreat.techniqueId === techniqueId;
  const priorTicks = isContinuingSameSubmission ? state.activeSubmissionThreat!.progress : 0;

  let mastery: 'learning' | 'proficient' | null = null;
  if (actor === 'player') {
    const progress = computeSkillProgress(techniqueId);
    if (progress.status === 'learning') mastery = 'learning';
    else if (progress.status === 'proficient') mastery = 'proficient';
  }

  const finalChance = clamp(
    technique.baseSuccessChance +
      (actorFighter.stamina - opponentFighter.stamina) / CONSTANTS.STAMINA_DIFF_DIVISOR +
      (technique.category === 'submission' && opponentFighter.stamina < 30 ? CONSTANTS.SUBMISSION_FATIGUE_BONUS : 0) +
      (opponentFighter.lastActionCategory === 'defend' ? -CONSTANTS.DEFEND_PENALTY : 0) +
      (isContinuingSameSubmission ? Math.min(CONSTANTS.ESCALATION_BONUS_PER_TICK * priorTicks, CONSTANTS.ESCALATION_CAP) : 0) +
      (mastery === 'learning' ? CONSTANTS.LOW_MASTERY_PENALTY : mastery === 'proficient' ? CONSTANTS.PROFICIENT_BONUS : 0) +
      actorFighter.controlBonus,
    0.05,
    0.95
  );

  const roll = rng();
  let outcome: TurnOutcome;
  if (roll < finalChance * CONSTANTS.PARTIAL_SPLIT) outcome = 'success';
  else if (roll < finalChance) outcome = 'partial';
  else if (roll < finalChance + CONSTANTS.REVERSAL_WINDOW) outcome = 'fail';
  else outcome = 'reversal';

  // Stamina.
  const staminaSpent = Math.round(technique.staminaCost * CONSTANTS.OUTCOME_STAMINA_MULTIPLIER[outcome as 'success' | 'partial' | 'fail' | 'reversal']);
  let nextActorStamina = clamp(actorFighter.stamina - staminaSpent, 0, CONSTANTS.MAX_STAMINA);
  let nextOpponentStamina = opponentFighter.stamina;

  // Position.
  let nextPosition = state.position;
  if (outcome === 'success' && technique.onSuccess) nextPosition = applyOutcome(actor, technique.onSuccess);
  else if (outcome === 'partial' && technique.onPartial) nextPosition = applyOutcome(actor, technique.onPartial);
  else if (outcome === 'fail' && technique.onFail) nextPosition = applyOutcome(actor, technique.onFail);
  else if (outcome === 'reversal') {
    nextPosition = technique.onReversal ? applyOutcome(actor, technique.onReversal) : { family: state.position.family, topRole: opponent };
  }

  // HP — only ever from a dominant-position 'attack' success/partial, or a submission tick. Never from an invented strike.
  let hpDeltaPlayer = 0;
  let hpDeltaOpponent = 0;
  const actingFighterIsTop = state.position.topRole === actor;
  if (technique.category === 'attack' && (outcome === 'success' || outcome === 'partial') && actingFighterIsTop) {
    const multiplier = CONSTANTS.DOMINANCE_MULTIPLIER[state.position.family];
    if (multiplier > 0) {
      const dmg = Math.round(CONSTANTS.BASE_CONTROL_DAMAGE * multiplier * (outcome === 'partial' ? 0.5 : 1));
      if (opponent === 'player') hpDeltaPlayer = -dmg;
      else hpDeltaOpponent = -dmg;
      nextOpponentStamina = clamp(nextOpponentStamina, 0, CONSTANTS.MAX_STAMINA);
    }
  }

  // Submission progress.
  let nextThreat = state.activeSubmissionThreat;
  if (technique.isSubmissionFinish) {
    if (outcome === 'success') {
      nextThreat = isContinuingSameSubmission ? { ...state.activeSubmissionThreat!, progress: priorTicks + 1 } : { techniqueId, holder: actor, progress: 1 };
      const dmg = CONSTANTS.SUBMISSION_TICK_DAMAGE;
      if (opponent === 'player') hpDeltaPlayer -= dmg;
      else hpDeltaOpponent -= dmg;
    } else if (outcome === 'partial') {
      const dmg = Math.round(CONSTANTS.SUBMISSION_TICK_DAMAGE / 2);
      if (opponent === 'player') hpDeltaPlayer -= dmg;
      else hpDeltaOpponent -= dmg;
    } else {
      nextThreat = null;
    }
  } else if (outcome === 'fail' || outcome === 'reversal') {
    // A non-submission fail/reversal doesn't clear an unrelated in-progress threat.
    if (isContinuingSameSubmission) nextThreat = null;
  }

  const nextActorFighter: FighterState = {
    hp: clamp(actorFighter.hp + (actor === 'player' ? hpDeltaPlayer : hpDeltaOpponent), 0, CONSTANTS.MAX_HP),
    stamina: nextActorStamina,
    lastActionCategory: technique.category,
    controlBonus: technique.category === 'position' && (outcome === 'success' || outcome === 'partial') ? 0.05 : 0,
  };
  const nextOpponentFighter: FighterState = {
    hp: clamp(opponentFighter.hp + (opponent === 'player' ? hpDeltaPlayer : hpDeltaOpponent), 0, CONSTANTS.MAX_HP),
    stamina: clamp(nextOpponentStamina, 0, CONSTANTS.MAX_STAMINA),
    lastActionCategory: opponentFighter.lastActionCategory,
    controlBonus: 0,
  };

  const logEntry: TurnLogEntry = {
    turnNumber: state.turnNumber,
    actor,
    techniqueId,
    category: technique.category,
    positionBefore,
    outcome,
    positionAfter: stateFor(actor, nextPosition),
    hpDelta: { player: hpDeltaPlayer, opponent: hpDeltaOpponent },
    staminaSpent,
    timestamp: new Date().toISOString(),
  };

  const newState: GroundBattleRunState = {
    ...state,
    position: nextPosition,
    [actor]: nextActorFighter,
    [opponent]: nextOpponentFighter,
    activeSubmissionThreat: nextThreat,
  };

  return { outcome, logEntry, newState };
}

/** Passive stamina regen at the end of every turn (both fighters), capped at MAX_STAMINA. */
export function applyPassiveRegen(state: GroundBattleRunState): GroundBattleRunState {
  return {
    ...state,
    player: { ...state.player, stamina: clamp(state.player.stamina + CONSTANTS.PASSIVE_STAMINA_REGEN_PER_TURN, 0, CONSTANTS.MAX_STAMINA) },
    opponent: { ...state.opponent, stamina: clamp(state.opponent.stamina + CONSTANTS.PASSIVE_STAMINA_REGEN_PER_TURN, 0, CONSTANTS.MAX_STAMINA) },
  };
}

export type MatchEndCheck = GroundBattleRunState['outcome'];

/** Run after every accepted turn. Order: submission threshold -> HP KO -> turn cap decision. */
export function checkMatchEnd(state: GroundBattleRunState): MatchEndCheck {
  if (state.activeSubmissionThreat) {
    const technique = getCuratedTechnique(state.activeSubmissionThreat.techniqueId);
    const needed = technique?.submissionProgressNeeded ?? 2;
    if (state.activeSubmissionThreat.progress >= needed) {
      return state.activeSubmissionThreat.holder === 'player' ? 'player_submission_win' : 'opponent_submission_win';
    }
  }
  if (state.opponent.hp <= 0) return 'player_tko_win';
  if (state.player.hp <= 0) return 'opponent_tko_win';
  if (state.turnNumber >= CONSTANTS.MAX_TURNS) {
    const playerDamageDealt = state.turnLog.filter((e) => e.actor === 'player').reduce((sum, e) => sum - e.hpDelta.opponent, 0);
    const opponentDamageDealt = state.turnLog.filter((e) => e.actor === 'opponent').reduce((sum, e) => sum - e.hpDelta.player, 0);
    if (playerDamageDealt > opponentDamageDealt) return 'decision_player';
    if (opponentDamageDealt > playerDamageDealt) return 'decision_opponent';
    return 'draw';
  }
  return null;
}
