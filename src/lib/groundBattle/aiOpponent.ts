import { getTechniquesForPosition } from './curatedRoster';
import { stateFor } from './positionUtil';
import { mulberry32 } from './rng';
import type { BattleDifficulty, CuratedGroundTechnique, GroundBattleRunState } from './types';

// The AI uses the EXACT same combat engine/rules as the player — fairness
// comes only from selection-policy quality, never from a hidden rules
// advantage. Unlike the player, the AI has no SkillProgress/"learned"
// concept (it isn't a real user), so there is no mastery gate for it —
// difficulty only changes which legal move it tends to pick, never the
// legal pool or the resolver formula. The AI IS allowed to see which
// techniques are legal from its own current position (the spec's explicit
// "AI가 플레이어에게 보이지 않는 기술 정보를 활용하는 것은 허용한다").
export function chooseAiAction(state: GroundBattleRunState, difficulty: BattleDifficulty, rngOverride?: () => number): { techniqueId: string } {
  const opponentState = stateFor('opponent', state.position);
  const legal = getTechniquesForPosition(opponentState);
  const rng = rngOverride ?? mulberry32(state.rngSeed + state.turnNumber + 7919);
  if (legal.length === 0) {
    // Should never happen given the curated roster covers every state with
    // 2+ options, but never crash the match if it somehow does.
    return { techniqueId: getTechniquesForPosition(opponentState)[0]?.techniqueId ?? '' };
  }
  return difficulty === 'easy' ? chooseEasy(legal, rng) : chooseNormal(legal, state, rng);
}

function chooseEasy(legal: CuratedGroundTechnique[], rng: () => number): { techniqueId: string } {
  // 20% of the time picks uniformly at random regardless of quality, so it
  // visibly makes "bad" choices sometimes.
  if (rng() < 0.2) {
    return { techniqueId: legal[Math.floor(rng() * legal.length)].techniqueId };
  }
  const totalWeight = legal.reduce((sum, t) => sum + t.baseSuccessChance, 0);
  let roll = rng() * totalWeight;
  for (const t of legal) {
    roll -= t.baseSuccessChance;
    if (roll <= 0) return { techniqueId: t.techniqueId };
  }
  return { techniqueId: legal[legal.length - 1].techniqueId };
}

function chooseNormal(legal: CuratedGroundTechnique[], state: GroundBattleRunState, rng: () => number): { techniqueId: string } {
  let best: CuratedGroundTechnique = legal[0];
  let bestScore = -Infinity;
  for (const t of legal) {
    let score = t.baseSuccessChance;
    if (t.isSubmissionFinish && state.player.stamina < 40) score += 0.15;
    if (t.category === 'submission' && state.player.stamina < 30) score += 0.1;
    if (state.opponent.hp < 30 && t.category === 'defend') score += 0.2;
    if (state.opponent.stamina < 25) score -= 0.1 * (t.staminaCost / 20);
    score += (rng() - 0.5) * 0.1; // jitter (+/-0.05), keeps it from being perfectly predictable
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return { techniqueId: best.techniqueId };
}
