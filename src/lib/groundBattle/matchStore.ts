import { applyPassiveRegen, checkMatchEnd, resolveTurn } from './combatEngine';
import { chooseAiAction } from './aiOpponent';
import { randomSeed } from './rng';
import type { BattleDifficulty, BattleMode, GroundBattleRunState, GroundPosition, TurnLogEntry, TurnOutcome } from './types';

const KEY = 'martialdex:ground-battle-run';
const EVENT = 'martialdex:ground-battle-run-updated';

// Same defensive shape-validation as sparringSession/sessionStore.ts's
// readRun() — a malformed/legacy/future-schema entry is treated as "no
// match" and cleared, never crashes the app (see the "Free Training ->
// Sparring 검은 화면" root-cause fix from earlier this session).
function isValidRunState(v: unknown): v is GroundBattleRunState {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const position = o.position as Record<string, unknown> | undefined;
  const player = o.player as Record<string, unknown> | undefined;
  const opponent = o.opponent as Record<string, unknown> | undefined;
  return (
    typeof o.id === 'string' &&
    !!position &&
    typeof position.family === 'string' &&
    (position.topRole === 'player' || position.topRole === 'opponent') &&
    !!player &&
    typeof player.hp === 'number' &&
    typeof player.stamina === 'number' &&
    !!opponent &&
    typeof opponent.hp === 'number' &&
    typeof opponent.stamina === 'number' &&
    typeof o.turnNumber === 'number' &&
    (o.phase === 'player_turn' || o.phase === 'opponent_turn' || o.phase === 'pass_device' || o.phase === 'finished') &&
    Array.isArray(o.turnLog) &&
    Array.isArray(o.playerLoadoutTechniqueIds)
  );
}

function readRun(): GroundBattleRunState | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidRunState(parsed)) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeRun(run: GroundBattleRunState | null) {
  if (run) window.localStorage.setItem(KEY, JSON.stringify(run));
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getGroundBattleRun(): GroundBattleRunState | null {
  return readRun();
}

export function startMatch(difficulty: BattleDifficulty, mode: BattleMode, playerLoadoutTechniqueIds: string[], startingPosition: GroundPosition): GroundBattleRunState {
  const now = new Date().toISOString();
  const run: GroundBattleRunState = {
    id: crypto.randomUUID ? crypto.randomUUID() : `gb_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    difficulty,
    mode,
    startedAt: now,
    finishedAt: null,
    turnNumber: 1,
    phase: 'player_turn',
    position: startingPosition,
    player: { hp: 100, stamina: 100, lastActionCategory: null, controlBonus: 0 },
    opponent: { hp: 100, stamina: 100, lastActionCategory: null, controlBonus: 0 },
    activeSubmissionThreat: null,
    turnLog: [],
    outcome: null,
    rngSeed: randomSeed(),
    playerLoadoutTechniqueIds,
  };
  writeRun(run);
  return run;
}

export interface SubmitActionResult {
  /** The stored run after this call (unchanged when the action was rejected). */
  state: GroundBattleRunState | null;
  /** null = rejected outright (no run, match over, or not this actor's turn) — nothing was consumed. Otherwise the resolved outcome of the turn that was consumed. */
  turnOutcome: TurnOutcome | null;
  logEntry: TurnLogEntry | null;
}

/** The single enforcement point for "one main action per turn" — rejected (turnOutcome: null, nothing changes) unless it's actually this actor's turn. */
export function submitActorAction(actor: 'player' | 'opponent', techniqueId: string): SubmitActionResult {
  const run = readRun();
  if (!run || run.phase === 'finished') return { state: run, turnOutcome: null, logEntry: null };
  const expectedPhase = actor === 'player' ? 'player_turn' : 'opponent_turn';
  if (run.phase !== expectedPhase) return { state: run, turnOutcome: null, logEntry: null };

  const result = resolveTurn(run, actor, techniqueId);
  let next: GroundBattleRunState = { ...result.newState, turnLog: [...result.newState.turnLog, result.logEntry], turnNumber: result.newState.turnNumber + 1 };
  next = applyPassiveRegen(next);

  const matchOutcome = checkMatchEnd(next);
  if (matchOutcome) {
    next = { ...next, phase: 'finished', outcome: matchOutcome, finishedAt: new Date().toISOString() };
  } else {
    next = { ...next, phase: run.mode === 'local_2p' ? 'pass_device' : actor === 'player' ? 'opponent_turn' : 'player_turn' };
  }

  writeRun(next);
  return { state: next, turnOutcome: result.outcome, logEntry: result.logEntry };
}

/** local_2p only — flips 'pass_device' to the correct next *_turn once the interstitial's "계속하기" button is tapped. */
export function advancePastPassDevice(): GroundBattleRunState | null {
  const run = readRun();
  if (!run || run.phase !== 'pass_device') return run;
  const lastActor = run.turnLog[run.turnLog.length - 1]?.actor ?? 'opponent';
  const next: GroundBattleRunState = { ...run, phase: lastActor === 'player' ? 'opponent_turn' : 'player_turn' };
  writeRun(next);
  return next;
}

/** Convenience wrapper for mode==='ai' — chooses + submits in one call. */
export function runAiTurn(): SubmitActionResult {
  const run = readRun();
  if (!run || run.phase !== 'opponent_turn' || run.mode !== 'ai') return { state: run, turnOutcome: null, logEntry: null };
  const { techniqueId } = chooseAiAction(run, run.difficulty);
  return submitActorAction('opponent', techniqueId);
}

/** Manual early end (never traps the user) — resolves to a decision outcome based on cumulative damage dealt so far. */
export function endMatchNow(): GroundBattleRunState | null {
  const run = readRun();
  if (!run || run.phase === 'finished') return run;
  const playerDamageDealt = run.turnLog.filter((e) => e.actor === 'player').reduce((sum, e) => sum - e.hpDelta.opponent, 0);
  const opponentDamageDealt = run.turnLog.filter((e) => e.actor === 'opponent').reduce((sum, e) => sum - e.hpDelta.player, 0);
  const outcome = playerDamageDealt > opponentDamageDealt ? 'decision_player' : opponentDamageDealt > playerDamageDealt ? 'decision_opponent' : 'draw';
  const next: GroundBattleRunState = { ...run, phase: 'finished', outcome, finishedAt: new Date().toISOString() };
  writeRun(next);
  return next;
}

export function clearGroundBattleRun(): void {
  writeRun(null);
}

export { EVENT as GROUND_BATTLE_RUN_EVENT };
