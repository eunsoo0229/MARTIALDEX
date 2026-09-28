import type { GroundPosition, PositionOutcome, PositionState } from './types';

/** Always complementary by construction — never independently mutable per fighter. */
export function stateFor(role: 'player' | 'opponent', pos: GroundPosition): PositionState {
  const isTop = pos.topRole === role;
  return `${pos.family}_${isTop ? 'top' : 'bottom'}` as PositionState;
}

export function opponentOf(role: 'player' | 'opponent'): 'player' | 'opponent' {
  return role === 'player' ? 'opponent' : 'player';
}

/** Applies a technique's outcome-position to the match: the acting fighter takes `outcome.actorRole`, the other fighter always gets the complement — this is the ONLY place GroundPosition is ever constructed after match start, so the top/bottom invariant can't be violated by a stray manual assignment elsewhere. */
export function applyOutcome(actor: 'player' | 'opponent', outcome: PositionOutcome): GroundPosition {
  const topRole = outcome.actorRole === 'top' ? actor : opponentOf(actor);
  return { family: outcome.family, topRole };
}

export function positionStateLabel(state: PositionState): string {
  const idx = state.lastIndexOf('_');
  const family = state.slice(0, idx) as GroundPosition['family'];
  return `${state.endsWith('_top') ? '위' : '아래'} ${familyLabel(family)}`;
}

export function familyLabel(family: GroundPosition['family']): string {
  const labels: Record<GroundPosition['family'], string> = {
    guard: '가드',
    half_guard: '하프 가드',
    side_control: '사이드 컨트롤',
    mount: '마운트',
    knee_on_belly: '니 온 벨리',
    back_control: '백 컨트롤',
    turtle: '터틀',
  };
  return labels[family];
}
