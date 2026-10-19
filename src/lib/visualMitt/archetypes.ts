import type { Technique } from '../../types';

// AI Visualizing Mitt — motion archetypes.
//
// A technique is visualized through ONE of the archetypes below: a generic,
// widely-taught model of that kind of strike / takedown entry (which limb,
// which side, which target height, the shape of its path, and the basic
// footwork), drawn for an orthodox stance and mirrored for southpaw.
// Techniques are matched to an archetype by reviewed name rules over the real
// MARTIALDEX technique DB — nothing is generated per technique, and a
// technique that matches no archetype is simply "not visualizable" (never
// given an invented motion). The per-technique specifics (key points, common
// mistakes) shown next to the drawing come from the technique's own posture
// data when it has any.

/** defense = slip / duck / roll / sway / parry / block … the holder attacks, you answer; trap = control the holder's guard hand (pull down, paw). */
export type MotionKind = 'strike' | 'feint' | 'entry' | 'defense' | 'trap';
/** The holder's attack a defense answers (the holder's own lead/rear side — they mirror your stance). */
export interface IncomingAttack {
  side: Side;
  path: 'straight' | 'hook' | 'uppercut' | 'kick' | 'teep';
  target: Target;
}
export type GuardKind = 'parry' | 'catch' | 'block' | 'cover' | 'elbowBlock' | 'shoulderRoll' | 'check' | 'kickCatch' | 'kickParry';
export type Side = 'lead' | 'rear';
export type Limb = 'hand' | 'foot' | 'knee' | 'elbow' | 'body';
export type PathShape =
  | 'straight'
  | 'hook'
  | 'uppercut'
  | 'overhand'
  | 'round'
  | 'thrust'
  | 'spin'
  | 'axe'
  | 'knee'
  | 'elbowH'
  | 'elbowUp'
  | 'elbowDown'
  | 'elbowSide'
  | 'elbowBack'
  | 'backfist'
  | 'hammer'
  | 'chop'
  | 'hookKick'
  | 'crescent'
  | 'stomp'
  | 'twist'
  | 'feint'
  | 'shot'
  | 'throw';
/** Where a throw/takedown sends the opponent (drawn as an arrow). */
export type ThrowDir = 'back' | 'front' | 'side' | 'over' | 'down';
export type Target = 'head' | 'body' | 'leg' | 'hips' | 'none';

/** A foot movement in stance coordinates (orthodox): lead foot starts at (0,0), rear foot at (40,35); +y = backward. */
export interface FootMove {
  foot: 'lead' | 'rear';
  dx: number;
  dy: number;
  /** Pivot on the ball of the foot, degrees (heel turning outward is positive). */
  pivot?: number;
  label: string;
  /** Goes out and comes back (the kicking foot/knee): the drawing shows the reach, then the return to stance. */
  returns?: boolean;
}

export interface MotionArchetype {
  key: string;
  label: string;
  kind: MotionKind;
  side: Side;
  limb: Limb;
  path: PathShape;
  target: Target;
  /** General how-to, one short sentence (the widely-taught basic). */
  cue: string;
  footwork: FootMove[];
  /** Drops the hips (level change) during the move. */
  levelChange?: boolean;
  /** Turns the back to the target on the way (spinning techniques). */
  spin?: boolean;
  /** Jumps off the ground (jumping/flying kicks and knees). */
  jump?: boolean;
  /** A straight thrown out to the SIDE (e.g. 옆지르기) — the mitt is held wide, not in front. */
  wide?: boolean;
  /** Throws/takedowns: turn your back in to the opponent (hip/shoulder throws). */
  turnIn?: boolean;
  /** Throws/takedowns: the direction the opponent is broken/thrown. */
  throwDir?: ThrowDir;
  /** defense: the attack it answers. */
  incoming?: IncomingAttack;
  /** defense: where YOUR head/body goes (orthodox, your view): dx + = to your right, dy + = down, back = lean away 0–1, u = dip under and come up (roll). */
  /** angle: after the roll you come up OUTSIDE the attacking arm (사각) — at the holder's side, not in front. */
  evade?: { dx: number; dy: number; back?: number; u?: boolean; angle?: boolean };
  /** defense: the limb that meets the attack (side = which of YOUR hands/legs). */
  guard?: GuardKind;
  /** trap: which of the HOLDER's hands you control, and how. */
  trap?: { hand: Side; how: 'pull' | 'slap' | 'paw' };
}

const A = (a: MotionArchetype) => a;

export const ARCHETYPES: Record<string, MotionArchetype> = {
  jab: A({ key: 'jab', label: '잽', kind: 'strike', side: 'lead', limb: 'hand', path: 'straight', target: 'head', cue: '리드 손을 곧게 뻗어 미트를 치고, 같은 길로 바로 가드로 회수합니다.', footwork: [{ foot: 'lead', dx: 0, dy: -10, label: '앞발 반 걸음 전진' }] }),
  cross: A({ key: 'cross', label: '크로스(스트레이트)', kind: 'strike', side: 'rear', limb: 'hand', path: 'straight', target: 'head', cue: '뒷발 뒤꿈치를 돌리며 허리를 회전시켜 뒷손을 곧게 뻗습니다.', footwork: [{ foot: 'rear', dx: 0, dy: 0, pivot: 45, label: '뒷발 뒤꿈치 회전' }] }),
  leadHook: A({ key: 'leadHook', label: '리드 훅', kind: 'strike', side: 'lead', limb: 'hand', path: 'hook', target: 'head', cue: '팔꿈치를 어깨 높이로 들고, 앞발과 허리를 함께 돌려 옆에서 미트를 칩니다.', footwork: [{ foot: 'lead', dx: 0, dy: 0, pivot: 60, label: '앞발 회전' }] }),
  rearHook: A({ key: 'rearHook', label: '리어 훅', kind: 'strike', side: 'rear', limb: 'hand', path: 'hook', target: 'head', cue: '뒷발을 돌리며 몸통 회전으로 뒷손 훅을 옆에서 넣습니다.', footwork: [{ foot: 'rear', dx: 0, dy: 0, pivot: 45, label: '뒷발 회전' }] }),
  checkHook: A({ key: 'checkHook', label: '체크 훅', kind: 'strike', side: 'lead', limb: 'hand', path: 'hook', target: 'head', cue: '리드 훅을 치면서 앞발을 축으로 몸을 돌려 상대의 전진 라인에서 빠집니다.', footwork: [{ foot: 'lead', dx: 0, dy: 0, pivot: 90, label: '앞발 축 회전' }, { foot: 'rear', dx: -45, dy: -15, label: '뒷발이 돌아 나감' }] }),
  leadUppercut: A({ key: 'leadUppercut', label: '리드 어퍼컷', kind: 'strike', side: 'lead', limb: 'hand', path: 'uppercut', target: 'head', cue: '무릎을 살짝 굽혔다 펴며 리드 손을 아래에서 위로 올려 칩니다.', footwork: [], levelChange: true }),
  rearUppercut: A({ key: 'rearUppercut', label: '리어 어퍼컷', kind: 'strike', side: 'rear', limb: 'hand', path: 'uppercut', target: 'head', cue: '뒷발을 돌리고 무릎을 펴는 힘으로 뒷손을 아래에서 위로 올립니다.', footwork: [{ foot: 'rear', dx: 0, dy: 0, pivot: 30, label: '뒷발 회전' }], levelChange: true }),
  overhand: A({ key: 'overhand', label: '오버핸드', kind: 'strike', side: 'rear', limb: 'hand', path: 'overhand', target: 'head', cue: '머리를 살짝 낮추며 뒷손을 위에서 아래로 둥글게 넘겨 칩니다.', footwork: [{ foot: 'rear', dx: 0, dy: 0, pivot: 45, label: '뒷발 회전' }], levelChange: true }),
  leadOverhand: A({ key: 'leadOverhand', label: '리드 오버핸드', kind: 'strike', side: 'lead', limb: 'hand', path: 'overhand', target: 'head', cue: '리드 손을 위에서 아래로 둥글게 넘겨 칩니다.', footwork: [], levelChange: true }),
  superman: A({ key: 'superman', label: '슈퍼맨 펀치', kind: 'strike', side: 'rear', limb: 'hand', path: 'straight', target: 'head', cue: '뒷다리를 뒤로 차는 반동으로 앞으로 뛰어들며 뒷손을 뻗습니다.', footwork: [{ foot: 'lead', dx: 0, dy: -25, label: '앞으로 뛰어듦' }, { foot: 'rear', dx: 0, dy: -20, label: '뒷발 차고 따라옴' }] }),
  backfist: A({ key: 'backfist', label: '백피스트', kind: 'strike', side: 'lead', limb: 'hand', path: 'backfist', target: 'head', cue: '리드 손등으로 팔꿈치를 펴며 옆에서 채찍처럼 칩니다.', footwork: [] }),
  spinBackfist: A({ key: 'spinBackfist', label: '스피닝 백피스트', kind: 'strike', side: 'rear', limb: 'hand', path: 'spin', target: 'head', cue: '앞발 축으로 등을 돌려 회전하며 뒷손 손등으로 칩니다. 회전 중에도 시선을 먼저 돌립니다.', footwork: [{ foot: 'lead', dx: 0, dy: 0, pivot: 180, label: '앞발 축 회전' }, { foot: 'rear', dx: -40, dy: -40, label: '뒷발이 돌아 앞으로' }], spin: true }),
  teep: A({ key: 'teep', label: '티프(앞차기)', kind: 'strike', side: 'lead', limb: 'foot', path: 'thrust', target: 'body', cue: '앞무릎을 가슴 쪽으로 당겼다가 발바닥으로 곧게 밀어 차고 다시 접어 내립니다.', footwork: [{ foot: 'lead', dx: 0, dy: -30, label: '앞발로 밀어 참' }] }),
  rearTeep: A({ key: 'rearTeep', label: '리어 티프', kind: 'strike', side: 'rear', limb: 'foot', path: 'thrust', target: 'body', cue: '뒷무릎을 가슴 쪽으로 끌어올린 뒤 엉덩이를 밀어 넣으며 발바닥으로 곧게 밀어 차고, 다시 접어 뒤로 내립니다.', footwork: [{ foot: 'rear', dx: -20, dy: -60, label: '뒷발로 밀어 참' }] }),
  frontKick: A({ key: 'frontKick', label: '앞차기', kind: 'strike', side: 'rear', limb: 'foot', path: 'thrust', target: 'body', cue: '뒷무릎을 들어 올린 뒤 발끝·볼로 곧게 차고 다시 접어 회수합니다.', footwork: [{ foot: 'rear', dx: -20, dy: -55, label: '뒷발로 앞차기' }] }),
  roundKick: A({ key: 'roundKick', label: '라운드킥(몸통)', kind: 'strike', side: 'rear', limb: 'foot', path: 'round', target: 'body', cue: '앞발을 바깥으로 돌리며 엉덩이를 넣고, 뒷다리 정강이로 옆에서 몸통 미트를 찹니다.', footwork: [{ foot: 'lead', dx: -8, dy: -6, pivot: 70, label: '앞발 바깥으로 회전' }, { foot: 'rear', dx: -30, dy: -50, label: '뒷다리 킥 후 원위치' }] }),
  highKick: A({ key: 'highKick', label: '하이킥', kind: 'strike', side: 'rear', limb: 'foot', path: 'round', target: 'head', cue: '앞발을 크게 돌려 엉덩이를 완전히 넣고 뒷다리로 머리 높이를 찹니다. 차는 쪽 팔은 내려 균형을 잡습니다.', footwork: [{ foot: 'lead', dx: -10, dy: -6, pivot: 90, label: '앞발 크게 회전' }, { foot: 'rear', dx: -30, dy: -55, label: '뒷다리 킥 후 원위치' }] }),
  lowKick: A({ key: 'lowKick', label: '로우킥', kind: 'strike', side: 'rear', limb: 'foot', path: 'round', target: 'leg', cue: '앞발을 살짝 바깥으로 딛고 뒷다리 정강이로 상대 허벅지 바깥을 내려치듯 찹니다.', footwork: [{ foot: 'lead', dx: -10, dy: -6, pivot: 45, label: '앞발 바깥 디딤' }, { foot: 'rear', dx: -25, dy: -45, label: '뒷다리 킥 후 원위치' }] }),
  leadLowKick: A({ key: 'leadLowKick', label: '앞발 로우킥', kind: 'strike', side: 'lead', limb: 'foot', path: 'round', target: 'leg', cue: '뒷발을 살짝 당겨 붙인 뒤 앞다리 정강이로 상대 앞다리 안쪽·허벅지를 짧게 찹니다.', footwork: [{ foot: 'rear', dx: -15, dy: -12, label: '뒷발 당겨 붙임' }, { foot: 'lead', dx: 15, dy: -20, label: '앞다리 킥' }] }),
  leadRoundKick: A({ key: 'leadRoundKick', label: '앞발 라운드킥', kind: 'strike', side: 'lead', limb: 'foot', path: 'round', target: 'body', cue: '뒷발을 앞발 쪽으로 당겨 붙이거나 살짝 스위치한 뒤 앞다리로 돌려 찹니다.', footwork: [{ foot: 'rear', dx: -25, dy: -20, label: '뒷발 당겨 붙임' }, { foot: 'lead', dx: 20, dy: -30, label: '앞다리 킥' }] }),
  switchKick: A({ key: 'switchKick', label: '스위치 킥', kind: 'strike', side: 'lead', limb: 'foot', path: 'round', target: 'body', cue: '두 발 위치를 빠르게 바꾸고(스위치) 바뀐 뒷다리, 즉 원래 앞다리로 돌려 찹니다.', footwork: [{ foot: 'lead', dx: 30, dy: 30, label: '앞발이 뒤로 (스위치)' }, { foot: 'rear', dx: -30, dy: -30, label: '뒷발이 앞으로 (스위치)' }] }),
  stepUpKick: A({ key: 'stepUpKick', label: '스텝업 킥', kind: 'strike', side: 'rear', limb: 'foot', path: 'round', target: 'body', cue: '앞발로 한 걸음 밟아 들어가 거리를 좁힌 뒤 뒷다리로 돌려 찹니다.', footwork: [{ foot: 'lead', dx: -10, dy: -20, pivot: 60, label: '앞발 밟고 들어감' }, { foot: 'rear', dx: -30, dy: -60, label: '뒷다리 킥' }] }),
  questionMark: A({ key: 'questionMark', label: '퀘스천 마크 킥', kind: 'strike', side: 'rear', limb: 'foot', path: 'round', target: 'head', cue: '로우·바디킥처럼 낮게 올리다가 무릎을 꺾어 위에서 머리 쪽으로 방향을 바꿔 찹니다.', footwork: [{ foot: 'lead', dx: -10, dy: -6, pivot: 90, label: '앞발 회전' }, { foot: 'rear', dx: -30, dy: -55, label: '뒷다리 킥' }] }),
  sideKick: A({ key: 'sideKick', label: '사이드킥', kind: 'strike', side: 'lead', limb: 'foot', path: 'thrust', target: 'body', cue: '몸을 옆으로 세우고 앞무릎을 접었다가 발날·뒤꿈치로 옆으로 곧게 밀어 찹니다.', footwork: [{ foot: 'rear', dx: -30, dy: -15, label: '뒷발을 앞발 뒤로 붙임' }, { foot: 'lead', dx: 0, dy: -35, pivot: 90, label: '앞다리 옆차기' }] }),
  backKick: A({ key: 'backKick', label: '백킥', kind: 'strike', side: 'rear', limb: 'foot', path: 'spin', target: 'body', cue: '앞발 축으로 등을 돌리며 어깨 너머로 목표를 보고, 뒤꿈치로 곧게 뒤로 찹니다.', footwork: [{ foot: 'lead', dx: 0, dy: 0, pivot: 180, label: '앞발 축 회전' }, { foot: 'rear', dx: -40, dy: -60, label: '뒤꿈치로 차기' }], spin: true }),
  axeKick: A({ key: 'axeKick', label: '내려차기(액스킥)', kind: 'strike', side: 'rear', limb: 'foot', path: 'axe', target: 'head', cue: '다리를 곧게 높이 들어 올렸다가 뒤꿈치로 위에서 아래로 내려 찍습니다.', footwork: [{ foot: 'rear', dx: -30, dy: -50, label: '뒷다리 들어 내려 찍기' }] }),
  obliqueKick: A({ key: 'obliqueKick', label: '오블리크 킥', kind: 'strike', side: 'lead', limb: 'foot', path: 'thrust', target: 'leg', cue: '앞발바닥으로 상대 앞다리 무릎 위쪽을 비스듬히 밟듯 밀어 찹니다.', footwork: [{ foot: 'lead', dx: 5, dy: -30, label: '앞발로 밀어 밟음' }] }),
  rearKnee: A({ key: 'rearKnee', label: '니킥(뒷무릎)', kind: 'strike', side: 'rear', limb: 'knee', path: 'knee', target: 'body', cue: '엉덩이를 앞으로 밀며 뒷무릎을 곧게 들어 올려 몸통 미트를 찌릅니다.', footwork: [{ foot: 'rear', dx: -20, dy: -40, label: '뒷무릎 올림' }] }),
  leadKnee: A({ key: 'leadKnee', label: '니킥(앞무릎)', kind: 'strike', side: 'lead', limb: 'knee', path: 'knee', target: 'body', cue: '살짝 스위치하거나 뒷발로 지탱하며 앞무릎을 올려 찌릅니다.', footwork: [{ foot: 'lead', dx: 10, dy: -25, label: '앞무릎 올림' }] }),
  flyingKnee: A({ key: 'flyingKnee', label: '플라잉 니', kind: 'strike', side: 'rear', limb: 'knee', path: 'knee', target: 'head', cue: '앞으로 뛰어오르며 무릎을 높이 끌어올립니다. 착지 자세까지 연습합니다.', footwork: [{ foot: 'lead', dx: 0, dy: -30, label: '도약' }, { foot: 'rear', dx: -20, dy: -55, label: '무릎 끌어올림' }] }),
  hElbow: A({ key: 'hElbow', label: '가로 엘보', kind: 'strike', side: 'rear', limb: 'elbow', path: 'elbowH', target: 'head', cue: '가까운 거리에서 팔꿈치를 어깨 높이로 들고 몸통 회전으로 옆으로 휘두릅니다.', footwork: [{ foot: 'rear', dx: 0, dy: 0, pivot: 45, label: '뒷발 회전' }] }),
  upElbow: A({ key: 'upElbow', label: '올려 엘보', kind: 'strike', side: 'rear', limb: 'elbow', path: 'elbowUp', target: 'head', cue: '팔꿈치를 아래에서 위로 턱을 향해 올려 칩니다.', footwork: [{ foot: 'rear', dx: 0, dy: 0, pivot: 30, label: '뒷발 회전' }] }),
  downElbow: A({ key: 'downElbow', label: '내려 엘보', kind: 'strike', side: 'rear', limb: 'elbow', path: 'elbowDown', target: 'head', cue: '팔꿈치를 높이 들었다가 위에서 비스듬히 내려 칩니다.', footwork: [] }),
  spinElbow: A({ key: 'spinElbow', label: '스피닝 엘보', kind: 'strike', side: 'rear', limb: 'elbow', path: 'spin', target: 'head', cue: '앞발 축으로 등을 돌려 회전하며 뒷팔 팔꿈치로 옆을 칩니다.', footwork: [{ foot: 'lead', dx: 0, dy: 0, pivot: 180, label: '앞발 축 회전' }, { foot: 'rear', dx: -40, dy: -35, label: '뒷발이 돌아 앞으로' }], spin: true }),
  handFeint: A({ key: 'handFeint', label: '손 페인트', kind: 'feint', side: 'lead', limb: 'hand', path: 'feint', target: 'none', cue: '실제로 치지 않고 손·어깨를 짧게 내밀어 상대 반응을 끌어냅니다. 다음 기술이 진짜 공격입니다.', footwork: [] }),
  kickFeint: A({ key: 'kickFeint', label: '킥 페인트', kind: 'feint', side: 'rear', limb: 'foot', path: 'feint', target: 'none', cue: '무릎만 짧게 들어 킥을 보여 주고 내려놓으며, 상대가 반응하는 순간 다음 기술로 이어 갑니다.', footwork: [] }),
  levelFeint: A({ key: 'levelFeint', label: '레벨 체인지 페인트', kind: 'feint', side: 'lead', limb: 'body', path: 'feint', target: 'none', cue: '태클을 들어갈 것처럼 무릎을 굽혀 자세를 낮췄다가 다시 일어나 상대의 손을 내리게 만듭니다.', footwork: [], levelChange: true }),
  doubleLeg: A({ key: 'doubleLeg', label: '더블 레그 진입', kind: 'entry', side: 'lead', limb: 'body', path: 'shot', target: 'hips', cue: '자세를 낮춘 뒤(레벨 체인지) 앞발을 상대 두 발 사이 깊숙이 딛고 앞무릎을 매트 가까이 내리며 들어가, 뒷발이 따라와 몸을 붙입니다.', footwork: [{ foot: 'lead', dx: 20, dy: -80, label: '페네트레이션 스텝 (상대 두 발 사이)' }, { foot: 'rear', dx: -10, dy: -70, label: '뒷발 따라오기' }], levelChange: true }),
  singleLeg: A({ key: 'singleLeg', label: '싱글 레그 진입', kind: 'entry', side: 'lead', limb: 'body', path: 'shot', target: 'leg', cue: '자세를 낮추고 앞발을 상대 앞다리 바깥쪽으로 딛어 들어가, 머리를 바깥에 두고 한쪽 다리를 감쌉니다.', footwork: [{ foot: 'lead', dx: -15, dy: -75, label: '앞발을 상대 앞다리 쪽으로' }, { foot: 'rear', dx: -20, dy: -55, label: '뒷발 따라오기' }], levelChange: true }),
  highCrotch: A({ key: 'highCrotch', label: '하이 크로치 진입', kind: 'entry', side: 'lead', limb: 'body', path: 'shot', target: 'hips', cue: '자세를 낮추고 앞발을 상대 앞다리 쪽으로 깊이 딛으며, 머리는 바깥에 두고 앞팔을 다리 사이 높이 넣습니다.', footwork: [{ foot: 'lead', dx: -5, dy: -78, label: '앞발 깊게 진입' }, { foot: 'rear', dx: -25, dy: -60, label: '뒷발 따라와 각도' }], levelChange: true }),
  // ---- 추가 손기술 ----
  lungePunch: A({ key: 'lungePunch', label: '전진 찌르기(오이즈키)', kind: 'strike', side: 'rear', limb: 'hand', path: 'straight', target: 'body', cue: '뒷발을 한 걸음 내디뎌 앞발이 되게 하면서, 내딛는 발과 같은 쪽 주먹을 곧게 찌릅니다.', footwork: [{ foot: 'rear', dx: -40, dy: -75, label: '뒷발이 한 걸음 앞으로 (같은 쪽 주먹)' }] }),
  corkscrew: A({ key: 'corkscrew', label: '코크스크루 펀치', kind: 'strike', side: 'lead', limb: 'hand', path: 'straight', target: 'head', cue: '잽처럼 곧게 뻗다가 마지막에 팔꿈치를 바깥으로 들며 주먹을 안쪽으로 비틀어 꽂습니다.', footwork: [{ foot: 'lead', dx: 0, dy: -8, label: '앞발 반 걸음' }] }),
  bolo: A({ key: 'bolo', label: '볼로 펀치', kind: 'strike', side: 'rear', limb: 'hand', path: 'uppercut', target: 'body', cue: '뒷손을 아래로 크게 원을 그리듯 휘둘러 올려 몸통·턱을 칩니다. 큰 동작이라 상대 시선을 끈 뒤에 씁니다.', footwork: [{ foot: 'rear', dx: 0, dy: 0, pivot: 40, label: '뒷발 회전' }], levelChange: true }),
  gazelle: A({ key: 'gazelle', label: '가젤 펀치', kind: 'strike', side: 'lead', limb: 'hand', path: 'hook', target: 'head', cue: '무릎을 깊게 굽혔다가 앞으로 뛰어오르듯 펴면서 리드 훅을 위로 꽂습니다.', footwork: [{ foot: 'lead', dx: 0, dy: -30, label: '앞으로 튀어 오름' }, { foot: 'rear', dx: 0, dy: -20, label: '뒷발 따라옴' }], levelChange: true }),
  palmStrike: A({ key: 'palmStrike', label: '손바닥 치기(바탕손)', kind: 'strike', side: 'rear', limb: 'hand', path: 'straight', target: 'head', cue: '손목을 젖혀 손바닥 아래 단단한 부분(장근)으로 곧게 밀어 칩니다.', footwork: [{ foot: 'rear', dx: 0, dy: 0, pivot: 40, label: '뒷발 뒤꿈치 회전' }] }),
  spearHand: A({ key: 'spearHand', label: '손끝 찌르기(누키테)', kind: 'strike', side: 'rear', limb: 'hand', path: 'straight', target: 'body', cue: '손가락을 붙여 곧게 편 손끝으로 곧게 찌릅니다. 미트에는 가볍게, 손가락이 꺾이지 않게 칩니다.', footwork: [{ foot: 'rear', dx: 0, dy: 0, pivot: 40, label: '뒷발 뒤꿈치 회전' }] }),
  sidePunch: A({ key: 'sidePunch', label: '옆지르기', kind: 'strike', side: 'lead', limb: 'hand', path: 'straight', target: 'head', cue: '몸을 옆으로 세운 채 옆에 있는 목표를 향해 주먹을 곧게 뻗고, 반대 손은 허리로 당깁니다.', footwork: [{ foot: 'lead', dx: -20, dy: 0, label: '옆으로 반 걸음' }], wide: true }),
  hammerFist: A({ key: 'hammerFist', label: '망치주먹(테츠이)', kind: 'strike', side: 'rear', limb: 'hand', path: 'hammer', target: 'head', cue: '주먹 바닥(새끼손가락 쪽)으로 위에서 아래로 망치처럼 내려칩니다.', footwork: [{ foot: 'rear', dx: 0, dy: 0, pivot: 30, label: '뒷발 회전' }] }),
  knifeHand: A({ key: 'knifeHand', label: '손날치기(슈토)', kind: 'strike', side: 'rear', limb: 'hand', path: 'chop', target: 'head', cue: '손을 펴 손날(새끼손가락 쪽 날)로 옆에서 휘둘러 칩니다. 손바닥이 마지막에 아래를 향합니다.', footwork: [{ foot: 'rear', dx: 0, dy: 0, pivot: 40, label: '뒷발 회전' }] }),
  ridgeHand: A({ key: 'ridgeHand', label: '반대손날(하이토)', kind: 'strike', side: 'rear', limb: 'hand', path: 'chop', target: 'head', cue: '엄지를 접은 손의 엄지 쪽 날로 바깥에서 안쪽으로 둥글게 휘둘러 칩니다.', footwork: [{ foot: 'rear', dx: 0, dy: 0, pivot: 45, label: '뒷발 회전' }] }),
  downPunch: A({ key: 'downPunch', label: '내려지르기', kind: 'strike', side: 'rear', limb: 'hand', path: 'hammer', target: 'body', cue: '주먹을 위에서 아래로 비스듬히 내려 지릅니다. 넘어진 상대나 숙인 목표를 겨냥합니다.', footwork: [{ foot: 'rear', dx: 0, dy: 0, pivot: 30, label: '뒷발 회전' }], levelChange: true }),
  // ---- 추가 팔꿈치 ----
  spearElbow: A({ key: 'spearElbow', label: '찌르는 엘보(속 퐁)', kind: 'strike', side: 'rear', limb: 'elbow', path: 'straight', target: 'head', cue: '팔꿈치 끝을 앞으로 곧게 내밀어 찌릅니다. 손은 이마 앞에서 가드를 유지합니다.', footwork: [{ foot: 'lead', dx: 0, dy: -15, label: '앞발 반 걸음' }] }),
  sideElbow: A({ key: 'sideElbow', label: '옆 엘보(요코 엠피)', kind: 'strike', side: 'lead', limb: 'elbow', path: 'elbowSide', target: 'body', cue: '팔을 가슴 앞에 접었다가 팔꿈치를 옆으로 곧게 밀어 옆 목표를 칩니다.', footwork: [{ foot: 'lead', dx: -20, dy: 0, label: '옆으로 디딤' }], wide: true }),
  backElbow: A({ key: 'backElbow', label: '뒤 엘보(우시로 엠피)', kind: 'strike', side: 'rear', limb: 'elbow', path: 'elbowBack', target: 'body', cue: '어깨 너머로 뒤를 보며 팔꿈치를 뒤로 곧게 찍습니다.', footwork: [{ foot: 'rear', dx: 0, dy: 10, label: '뒷발 살짝 뒤로' }] }),
  // ---- 추가 킥 ----
  hookKick: A({ key: 'hookKick', label: '후려차기(훅킥)', kind: 'strike', side: 'lead', limb: 'foot', path: 'hookKick', target: 'head', cue: '다리를 목표 바깥쪽으로 뻗어 올린 뒤 무릎을 접으며 뒤꿈치로 안쪽을 향해 후려 찹니다.', footwork: [{ foot: 'rear', dx: -25, dy: -15, label: '뒷발 당겨 붙임' }, { foot: 'lead', dx: -20, dy: -40, label: '앞다리 후려차기' }] }),
  spinHookKick: A({ key: 'spinHookKick', label: '뒤후려차기(스피닝 훅킥)', kind: 'strike', side: 'rear', limb: 'foot', path: 'hookKick', target: 'head', cue: '앞발 축으로 등을 돌리며 시선을 먼저 돌리고, 뒷다리를 뻗어 뒤꿈치로 원을 그리며 후려 찹니다.', footwork: [{ foot: 'lead', dx: 0, dy: 0, pivot: 180, label: '앞발 축 회전' }, { foot: 'rear', dx: -40, dy: -60, label: '뒷다리로 후려차기' }], spin: true }),
  crescentKick: A({ key: 'crescentKick', label: '반달차기(크레센트 킥)', kind: 'strike', side: 'rear', limb: 'foot', path: 'crescent', target: 'head', cue: '다리를 곧게 편 채 바깥에서 안쪽으로 반달 모양을 그리며 발바닥·발날로 목표를 쓸어 찹니다.', footwork: [{ foot: 'rear', dx: -30, dy: -50, label: '뒷다리 반달 궤적' }] }),
  stompKick: A({ key: 'stompKick', label: '밟아차기(후미코미)', kind: 'strike', side: 'lead', limb: 'foot', path: 'stomp', target: 'leg', cue: '무릎을 높이 들었다가 뒤꿈치·발날로 상대 무릎이나 발등을 아래로 밟듯 찍습니다.', footwork: [{ foot: 'lead', dx: 5, dy: -30, label: '앞발로 밟아 찍기' }] }),
  twistKick: A({ key: 'twistKick', label: '비틀어차기', kind: 'strike', side: 'rear', limb: 'foot', path: 'twist', target: 'body', cue: '무릎을 몸 안쪽으로 들어 올린 뒤 바깥쪽으로 비틀어 펴며 발등·앞축으로 찹니다.', footwork: [{ foot: 'lead', dx: 0, dy: 0, pivot: -40, label: '앞발 안쪽으로 회전' }, { foot: 'rear', dx: -10, dy: -55, label: '뒷다리 비틀어차기' }] }),
  doubleRoundKick: A({ key: 'doubleRoundKick', label: '나래차기(두 발 연속)', kind: 'strike', side: 'rear', limb: 'foot', path: 'round', target: 'body', cue: '뒷다리로 돌려차고 그 발이 내려오기 전에 공중에서 반대 다리로 이어서 돌려찹니다.', footwork: [{ foot: 'rear', dx: -30, dy: -50, label: '첫 번째 돌려차기' }, { foot: 'lead', dx: 30, dy: 10, label: '공중에서 두 번째 돌려차기' }], jump: true }),
  spinRoundKick: A({ key: 'spinRoundKick', label: '360° 돌려차기', kind: 'strike', side: 'lead', limb: 'foot', path: 'round', target: 'head', cue: '앞발 축으로 몸을 한 바퀴 돌리며 뛰어올라, 회전 끝에서 돌려차기로 찹니다.', footwork: [{ foot: 'lead', dx: 0, dy: 0, pivot: 360, label: '한 바퀴 회전' }, { foot: 'rear', dx: -30, dy: -50, label: '회전하며 돌려차기' }], spin: true, jump: true }),
  spinAxeKick: A({ key: 'spinAxeKick', label: '회전 내려차기', kind: 'strike', side: 'rear', limb: 'foot', path: 'axe', target: 'head', cue: '등을 돌려 회전하며 다리를 높이 들어 올린 뒤 뒤꿈치로 내려 찍습니다.', footwork: [{ foot: 'lead', dx: 0, dy: 0, pivot: 180, label: '앞발 축 회전' }, { foot: 'rear', dx: -30, dy: -50, label: '내려 찍기' }], spin: true }),
  jumpFrontKick: A({ key: 'jumpFrontKick', label: '뛰어앞차기', kind: 'strike', side: 'rear', limb: 'foot', path: 'thrust', target: 'head', cue: '앞무릎을 끌어올려 뛰어오른 뒤 공중에서 뒷다리로 앞차기를 합니다. 착지 후 바로 가드.', footwork: [{ foot: 'lead', dx: 0, dy: -20, label: '도약' }, { foot: 'rear', dx: -20, dy: -60, label: '공중 앞차기' }], jump: true }),
  jumpRoundKick: A({ key: 'jumpRoundKick', label: '뛰어돌려차기', kind: 'strike', side: 'rear', limb: 'foot', path: 'round', target: 'head', cue: '뛰어오르며 엉덩이를 돌려 공중에서 돌려찹니다.', footwork: [{ foot: 'lead', dx: -10, dy: -10, pivot: 70, label: '도약하며 회전' }, { foot: 'rear', dx: -30, dy: -55, label: '공중 돌려차기' }], jump: true }),
  flyingSideKick: A({ key: 'flyingSideKick', label: '뛰어옆차기(이단옆차기)', kind: 'strike', side: 'lead', limb: 'foot', path: 'thrust', target: 'head', cue: '도움닫기로 뛰어올라 공중에서 몸을 옆으로 세우고 앞다리 발날로 곧게 옆차기를 합니다.', footwork: [{ foot: 'rear', dx: 0, dy: -40, label: '도움닫기' }, { foot: 'lead', dx: 0, dy: -60, pivot: 90, label: '공중 옆차기' }], jump: true }),
  jumpBackKick: A({ key: 'jumpBackKick', label: '뛰어뒤차기', kind: 'strike', side: 'rear', limb: 'foot', path: 'spin', target: 'body', cue: '뛰어오르며 등을 돌리고 공중에서 뒤꿈치로 곧게 뒤차기를 합니다.', footwork: [{ foot: 'lead', dx: 0, dy: 0, pivot: 180, label: '도약하며 회전' }, { foot: 'rear', dx: -40, dy: -60, label: '공중 뒤차기' }], spin: true, jump: true }),
  jumpAxeKick: A({ key: 'jumpAxeKick', label: '뛰어내려차기', kind: 'strike', side: 'rear', limb: 'foot', path: 'axe', target: 'head', cue: '뛰어오르며 다리를 높이 들어 올려 공중에서 뒤꿈치로 내려 찍습니다.', footwork: [{ foot: 'rear', dx: -30, dy: -50, label: '공중 내려 찍기' }], jump: true }),
  // ---- 추가 무릎 ----
  sideKnee: A({ key: 'sideKnee', label: '옆·대각 니(카오 치앙)', kind: 'strike', side: 'rear', limb: 'knee', path: 'round', target: 'body', cue: '엉덩이를 돌리며 무릎을 바깥에서 비스듬히 휘둘러 옆구리를 찌릅니다.', footwork: [{ foot: 'lead', dx: 0, dy: 0, pivot: 45, label: '앞발 회전' }, { foot: 'rear', dx: -25, dy: -40, label: '무릎 비스듬히' }] }),
  spinKnee: A({ key: 'spinKnee', label: '스피닝 니', kind: 'strike', side: 'rear', limb: 'knee', path: 'spin', target: 'body', cue: '앞발 축으로 등을 돌려 회전한 뒤, 돌아 나오며 무릎을 올려 찌릅니다.', footwork: [{ foot: 'lead', dx: 0, dy: 0, pivot: 180, label: '앞발 축 회전' }, { foot: 'rear', dx: -30, dy: -45, label: '무릎 올림' }], spin: true }),
  // ---- 던지기·테이크다운 ----
  osotoGari: A({ key: 'osotoGari', label: '큰 바깥 베기(오소토가리)', kind: 'entry', side: 'rear', limb: 'body', path: 'throw', target: 'leg', cue: '앞발을 상대 발 옆으로 깊게 딛고 상대를 뒤쪽 구석으로 무너뜨린 뒤, 뒷다리로 상대 다리 뒤를 크게 베어 넘깁니다.', footwork: [{ foot: 'lead', dx: 15, dy: -70, label: '앞발을 상대 발 옆으로' }, { foot: 'rear', dx: -15, dy: -115, label: '뒷다리로 상대 다리 뒤를 베기' }], throwDir: 'back' }),
  ouchiGari: A({ key: 'ouchiGari', label: '큰 안 베기(오우치가리)', kind: 'entry', side: 'rear', limb: 'body', path: 'throw', target: 'leg', cue: '상대를 뒤로 무너뜨리며 다리를 상대 두 다리 사이로 넣어 안쪽에서 상대 다리를 크게 원을 그려 베어 냅니다.', footwork: [{ foot: 'lead', dx: 10, dy: -40, label: '앞발 반 걸음 진입' }, { foot: 'rear', dx: -20, dy: -100, label: '다리 사이로 넣어 안쪽에서 베기' }], throwDir: 'back' }),
  kouchiGari: A({ key: 'kouchiGari', label: '작은 안 베기(코우치가리)', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'leg', cue: '상대를 뒤로 밀며 발바닥으로 상대 발뒤꿈치 안쪽을 짧게 쓸어 베어 냅니다.', footwork: [{ foot: 'rear', dx: 0, dy: -30, label: '뒷발 따라 붙기' }, { foot: 'lead', dx: 25, dy: -65, label: '앞발로 발뒤꿈치 안쪽 베기' }], throwDir: 'back' }),
  kosotoGari: A({ key: 'kosotoGari', label: '작은 바깥 베기·걸기(코소토)', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'leg', cue: '상대 무게가 실린 발의 뒤꿈치를 바깥에서 발바닥으로 걸어 당기며 뒤로 넘깁니다.', footwork: [{ foot: 'rear', dx: -10, dy: -30, label: '옆으로 비켜 들어감' }, { foot: 'lead', dx: 30, dy: -80, label: '발뒤꿈치 바깥 걸기' }], throwDir: 'back' }),
  footSweep: A({ key: 'footSweep', label: '발 후리기(아시바라이)', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'leg', cue: '상대가 발을 내딛어 무게를 싣기 직전, 발바닥으로 그 발을 옆으로 쓸어 내며 손으로 같은 방향으로 끌어 넘깁니다.', footwork: [{ foot: 'lead', dx: 40, dy: -80, label: '발바닥으로 상대 발 쓸기', returns: true }], throwDir: 'side' }),
  sasae: A({ key: 'sasae', label: '발목·무릎 막아 돌리기(사사에·히자구루마)', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'leg', cue: '뒷발을 비켜 딛고, 발바닥으로 상대 발목(무릎) 앞을 막은 채 손으로 바퀴를 돌리듯 앞으로 끌어 넘깁니다.', footwork: [{ foot: 'rear', dx: -15, dy: -20, label: '뒷발 비켜 딛기' }, { foot: 'lead', dx: 35, dy: -85, label: '발바닥으로 발목 앞 막기' }], throwDir: 'front' }),
  hipThrow: A({ key: 'hipThrow', label: '허리 던지기(오고시·힙 토스)', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'hips', cue: '앞발을 상대 앞으로 딛고 몸을 돌려 등을 붙인 뒤, 무릎을 굽혀 허리를 상대 허리 아래로 넣고 허리를 튕겨 넘깁니다.', footwork: [{ foot: 'lead', dx: 30, dy: -80, pivot: 180, label: '앞발 딛고 몸 돌리기' }, { foot: 'rear', dx: -5, dy: -95, label: '뒷발 돌려 붙여 등 붙이기' }], levelChange: true, turnIn: true, throwDir: 'front' }),
  sweepingHip: A({ key: 'sweepingHip', label: '후려 던지기(하라이고시·우치마타)', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'leg', cue: '몸을 돌려 들어가 한 발로 서고, 다른 다리로 상대 다리를 뒤로 후려 올리며 앞으로 넘깁니다.', footwork: [{ foot: 'lead', dx: 30, dy: -80, pivot: 180, label: '앞발 딛고 몸 돌리기' }, { foot: 'rear', dx: -5, dy: -95, label: '뒷발 돌려 붙이기' }, { foot: 'rear', dx: 0, dy: 35, label: '다리로 후려 올리기', returns: true }], turnIn: true, throwDir: 'front' }),
  shoulderThrow: A({ key: 'shoulderThrow', label: '업어치기(세오이나게)', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'hips', cue: '상대를 앞으로 끌어 무너뜨리며 몸을 돌려 등을 붙이고, 무릎을 깊게 굽혀 상대를 어깨 위로 업어 넘깁니다.', footwork: [{ foot: 'lead', dx: 25, dy: -85, pivot: 180, label: '앞발 딛고 몸 돌리기' }, { foot: 'rear', dx: -20, dy: -95, label: '뒷발 돌려 붙이기' }], levelChange: true, turnIn: true, throwDir: 'front' }),
  taiOtoshi: A({ key: 'taiOtoshi', label: '몸 떨어뜨리기(타이오토시)', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'leg', cue: '몸을 돌려 들어가며 다리를 상대 발목 앞에 뻗어 막고, 손으로 앞아래로 끌어당겨 넘깁니다.', footwork: [{ foot: 'lead', dx: 20, dy: -70, pivot: 180, label: '앞발 딛고 몸 돌리기' }, { foot: 'rear', dx: -60, dy: -75, label: '다리를 뻗어 발목 앞 막기' }], turnIn: true, throwDir: 'front' }),
  pullDown: A({ key: 'pullDown', label: '끌어 떨어뜨리기(우키오토시·스미오토시)', kind: 'entry', side: 'rear', limb: 'body', path: 'throw', target: 'none', cue: '다리를 걸지 않고, 상대가 앞으로 나오는 힘을 이용해 한 발을 뒤로 빼며 손으로 앞아래·구석으로 끌어 떨어뜨립니다.', footwork: [{ foot: 'rear', dx: 10, dy: 40, label: '뒷발 뒤로 빼기' }], levelChange: true, throwDir: 'down' }),
  scoop: A({ key: 'scoop', label: '퍼올려 던지기(스쿠이나게)', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'leg', cue: '자세를 낮춰 상대 옆·뒤로 들어가 다리(발뒤꿈치)를 손으로 퍼 올리듯 잡아당기며 뒤로 넘깁니다.', footwork: [{ foot: 'lead', dx: 25, dy: -85, label: '상대 옆으로 깊게 진입' }, { foot: 'rear', dx: 0, dy: -60, label: '뒷발 따라와 붙기' }], levelChange: true, throwDir: 'back' }),
  backSacrifice: A({ key: 'backSacrifice', label: '바로 누우며 던지기(토모에나게·수플렉스)', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'hips', cue: '상대 품으로 깊게 들어가 상대를 붙인 채 스스로 등을 바닥으로 떨어뜨리며 상대를 머리 위로 넘깁니다. 낙법이 되는 상대와만 연습합니다.', footwork: [{ foot: 'lead', dx: 20, dy: -85, label: '상대 다리 사이로 깊게 진입' }], levelChange: true, throwDir: 'over' }),
  sideSacrifice: A({ key: 'sideSacrifice', label: '옆으로 누우며 던지기(요코스테미)', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'leg', cue: '상대 옆으로 미끄러지듯 누우며 몸이나 다리로 상대 발을 막고, 붙잡은 채 옆으로 넘깁니다. 낙법이 되는 상대와만 연습합니다.', footwork: [{ foot: 'lead', dx: 40, dy: -85, label: '상대 발 옆으로 미끄러져 들어감' }], levelChange: true, throwDir: 'side' }),
  wrapThrow: A({ key: 'wrapThrow', label: '감아 던지기(마키코미)', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'hips', cue: '상대 팔을 겨드랑이에 감아 끼운 채 몸을 돌려 들어가, 함께 앞으로 굴러 떨어지며 넘깁니다.', footwork: [{ foot: 'lead', dx: 30, dy: -80, pivot: 180, label: '앞발 딛고 몸 돌리기' }, { foot: 'rear', dx: -5, dy: -95, label: '뒷발 붙이며 감아 돌기' }], levelChange: true, turnIn: true, throwDir: 'front' }),
  firemansCarry: A({ key: 'firemansCarry', label: '파이어맨 캐리', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'hips', cue: '상대 팔을 끌며 자세를 크게 낮춰 앞무릎을 상대 두 발 사이에 내리고, 상대를 어깨에 걸쳐 옆으로 굴려 넘깁니다.', footwork: [{ foot: 'lead', dx: 20, dy: -85, label: '무릎을 상대 두 발 사이로' }, { foot: 'rear', dx: 30, dy: -75, pivot: 90, label: '뒷발 돌려 들어가기' }], levelChange: true, turnIn: true, throwDir: 'side' }),
  armDrag: A({ key: 'armDrag', label: '암 드래그', kind: 'entry', side: 'rear', limb: 'body', path: 'throw', target: 'none', cue: '뒷손으로 상대 팔(삼두)을 잡아 내 쪽으로 끌어당기며 그 팔 바깥으로 돌아 들어가 상대 옆·뒤를 잡습니다.', footwork: [{ foot: 'lead', dx: -30, dy: -60, label: '팔 바깥쪽으로 돌아 들어감' }, { foot: 'rear', dx: -20, dy: -80, label: '뒷발 따라와 등 쪽으로' }], throwDir: 'side' }),
  duckUnder: A({ key: 'duckUnder', label: '덕 언더', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'none', cue: '상대 팔을 들어 올리며 자세를 낮춰 그 겨드랑이 밑으로 머리를 넣고, 상대 뒤로 돌아 나갑니다.', footwork: [{ foot: 'lead', dx: 30, dy: -90, label: '겨드랑이 밑으로 진입' }, { foot: 'rear', dx: 40, dy: -125, label: '상대 뒤로 돌아감' }], levelChange: true }),
  goBehind: A({ key: 'goBehind', label: '고 비하인드(슬라이드·셕 바이)', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'none', cue: '상대 팔을 치우거나 흘려보내며 옆으로 비켜 서고, 그대로 상대 뒤로 돌아가 허리를 잡습니다.', footwork: [{ foot: 'lead', dx: -35, dy: -70, label: '옆으로 비켜 진입' }, { foot: 'rear', dx: -10, dy: -120, label: '상대 뒤로 돌아감' }] }),
  snapDown: A({ key: 'snapDown', label: '스냅 다운', kind: 'entry', side: 'rear', limb: 'body', path: 'throw', target: 'none', cue: '상대 머리·목을 잡고 한 발 뒤로 빠지며 아래로 세게 잡아채 상대 무릎이 매트에 닿게 만듭니다.', footwork: [{ foot: 'rear', dx: 0, dy: 35, label: '뒷발 뒤로 빠지기' }, { foot: 'lead', dx: 0, dy: 25, label: '앞발 따라 빠지기' }], throwDir: 'down' }),
  kneeTap: A({ key: 'kneeTap', label: '니 탭', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'leg', cue: '상대 머리·목을 한쪽으로 당기며 자세를 낮춰 반대쪽 무릎 바깥을 손으로 막고 옆으로 넘깁니다.', footwork: [{ foot: 'lead', dx: -20, dy: -70, label: '앞발 바깥으로 딛기' }], levelChange: true, throwDir: 'side' }),
  outsideTrip: A({ key: 'outsideTrip', label: '아웃사이드 트립', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'leg', cue: '상대 몸통을 잡아 붙인 채 상대 다리 바깥 뒤에 발을 걸고, 가슴으로 밀어 그 다리 위로 넘깁니다.', footwork: [{ foot: 'rear', dx: 0, dy: -60, label: '붙어 들어가기' }, { foot: 'lead', dx: 30, dy: -95, label: '다리 바깥 뒤에 걸기' }], throwDir: 'back' }),
  insideTrip: A({ key: 'insideTrip', label: '인사이드 트립', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'leg', cue: '상대 몸통을 잡아 붙인 채 다리를 상대 두 다리 사이로 넣어 안쪽에서 다리를 걸고 뒤로 밀어 넘깁니다.', footwork: [{ foot: 'rear', dx: 0, dy: -60, label: '붙어 들어가기' }, { foot: 'lead', dx: 20, dy: -100, label: '다리 사이로 넣어 안쪽 걸기' }], throwDir: 'back' }),
  bodyLock: A({ key: 'bodyLock', label: '바디락 테이크다운', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'hips', cue: '두 팔로 상대 허리를 감아 손을 잠그고, 엉덩이를 붙여 당긴 뒤 옆으로 비틀거나 다리를 걸어 넘깁니다.', footwork: [{ foot: 'lead', dx: 20, dy: -90, label: '깊게 붙어 들어가기' }, { foot: 'rear', dx: 10, dy: -70, label: '엉덩이 붙이며 각도' }], levelChange: true, throwDir: 'side' }),
  lateralDrop: A({ key: 'lateralDrop', label: '래터럴 드롭', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'hips', cue: '오버·언더 그립으로 붙어 상대 다리 사이 깊숙이 발을 딛고, 가슴을 붙인 채 옆으로 함께 떨어지며 상대를 등 쪽으로 넘깁니다.', footwork: [{ foot: 'lead', dx: 30, dy: -95, label: '상대 다리 사이 깊게' }], levelChange: true, throwDir: 'side' }),
  matReturn: A({ key: 'matReturn', label: '매트 리턴', kind: 'entry', side: 'lead', limb: 'body', path: 'throw', target: 'hips', cue: '상대 뒤에서 허리를 감아 잡고 엉덩이를 붙여 들어 올린 뒤, 다리를 쓸거나 옆으로 돌려 매트로 되돌려 내립니다.', footwork: [{ foot: 'lead', dx: -10, dy: -120, label: '상대 뒤로 붙기' }, { foot: 'rear', dx: 20, dy: -100, label: '엉덩이 붙여 들어 올리기' }], levelChange: true, throwDir: 'down' }),
  anklePick: A({ key: 'anklePick', label: '앵클 픽', kind: 'entry', side: 'lead', limb: 'body', path: 'shot', target: 'leg', cue: '상대 머리를 눌러 무게를 앞다리에 싣게 한 뒤, 짧게 들어가며 상대 발목을 낚아챕니다.', footwork: [{ foot: 'lead', dx: -10, dy: -45, label: '짧은 진입 스텝' }], levelChange: true }),
  // ---- defenses: the holder attacks, you answer (drawn from your eyes) ----
  slip: A({ key: 'slip', label: '슬립', kind: 'defense', side: 'lead', limb: 'body', path: 'feint', target: 'head', incoming: { side: 'lead', path: 'straight', target: 'head' }, evade: { dx: 40, dy: 12 }, cue: '상대 잽이 오는 순간 무릎을 살짝 굽히고 상체를 비틀어, 머리를 주먹 바깥쪽으로 한 뼘만 빼 줍니다. 눈은 상대에게서 떼지 않습니다.', footwork: [{ foot: 'lead', dx: 0, dy: 0, pivot: 15, label: '무릎 살짝 굽혀 상체 회전' }] }),
  slipInside: A({ key: 'slipInside', label: '안쪽 슬립', kind: 'defense', side: 'rear', limb: 'body', path: 'feint', target: 'head', incoming: { side: 'lead', path: 'straight', target: 'head' }, evade: { dx: -40, dy: 12 }, cue: '상대 잽 안쪽(두 팔 사이)으로 머리를 빼며 체중을 앞발 쪽에 둡니다. 바로 뒷손·훅 카운터가 나갈 수 있는 위치입니다.', footwork: [{ foot: 'lead', dx: 0, dy: 0, pivot: -10, label: '앞발에 체중' }] }),
  doubleSlip: A({ key: 'doubleSlip', label: '더블 슬립', kind: 'defense', side: 'lead', limb: 'body', path: 'feint', target: 'head', incoming: { side: 'rear', path: 'straight', target: 'head' }, evade: { dx: -40, dy: 12 }, cue: '잽은 바깥쪽으로, 이어지는 크로스는 반대쪽으로 머리를 빼 두 번 연속으로 피합니다. 지금 그림은 두 번째(크로스) 슬립입니다.', footwork: [{ foot: 'lead', dx: 0, dy: 0, pivot: 15, label: '오른쪽' }, { foot: 'lead', dx: 0, dy: 0, pivot: -15, label: '왼쪽' }] }),
  duck: A({ key: 'duck', label: '더킹', kind: 'defense', side: 'lead', limb: 'body', path: 'feint', target: 'head', incoming: { side: 'rear', path: 'straight', target: 'head' }, evade: { dx: 0, dy: 62 }, cue: '허리를 숙이지 말고 무릎을 굽혀 수직으로 내려앉아 공격 아래로 피합니다. 손은 얼굴 앞에 둡니다.', footwork: [], levelChange: true }),
  roll: A({ key: 'roll', label: '롤링(밥 앤 위브)', kind: 'defense', side: 'lead', limb: 'body', path: 'feint', target: 'head', incoming: { side: 'lead', path: 'hook', target: 'head' }, evade: { dx: 46, dy: 54, u: true, angle: true }, cue: '훅이 날아가는 방향과 반대로, 훅이 시작된 쪽(상대 앞손 바깥)으로 무릎을 굽혀 U자를 그리며 주먹 아래를 지나 빠져나옵니다. 상대 팔을 지나 바깥 사각에서 일어서면 상대는 정면으로 칠 수 없고, 나는 바로 카운터를 넣을 수 있습니다.', footwork: [{ foot: 'lead', dx: 0, dy: 0, label: '무릎 굽혀 U자로 주먹 아래' }, { foot: 'lead', dx: 18, dy: -12, label: '앞발을 상대 앞손 바깥으로 반 걸음' }, { foot: 'rear', dx: 8, dy: 0, pivot: -35, label: '뒷발 돌려 사각 각도' }], levelChange: true }),
  leanBack: A({ key: 'leanBack', label: '스웨이(린 백)', kind: 'defense', side: 'rear', limb: 'body', path: 'feint', target: 'head', incoming: { side: 'lead', path: 'straight', target: 'head' }, evade: { dx: 0, dy: -4, back: 0.32 }, cue: '발은 그대로 두고 상체를 뒷발 쪽으로 젖혀 주먹이 닿지 않게 합니다. 턱은 당기고 손은 얼굴 앞에 둡니다.', footwork: [{ foot: 'rear', dx: 0, dy: 0, label: '체중 뒷발로' }] }),
  pull: A({ key: 'pull', label: '풀(뒤로 빼기)', kind: 'defense', side: 'rear', limb: 'body', path: 'feint', target: 'head', incoming: { side: 'lead', path: 'straight', target: 'head' }, evade: { dx: 6, dy: 8, back: 0.26 }, cue: '상대 잽이 닿기 직전 체중을 뒷발로 옮겨 머리를 뒤로 짧게 빼고, 상대 손이 돌아가는 순간 바로 되받아칩니다.', footwork: [{ foot: 'rear', dx: 0, dy: 0, label: '체중 뒷발로' }] }),
  sideStep: A({ key: 'sideStep', label: '사이드 스텝', kind: 'defense', side: 'lead', limb: 'body', path: 'feint', target: 'head', incoming: { side: 'rear', path: 'straight', target: 'head' }, evade: { dx: 70, dy: 0 }, cue: '공격 라인에서 옆으로 한 걸음 빠져 상대 측면을 잡습니다. 발이 엇갈리지 않게 가까운 발부터 움직입니다.', footwork: [{ foot: 'lead', dx: -30, dy: 0, label: '옆으로' }, { foot: 'rear', dx: -30, dy: 0, label: '따라가기' }] }),
  angleOut: A({ key: 'angleOut', label: '앵글 아웃(피벗)', kind: 'defense', side: 'lead', limb: 'body', path: 'feint', target: 'head', incoming: { side: 'rear', path: 'straight', target: 'head' }, evade: { dx: -64, dy: 0 }, cue: '앞발을 축으로 뒷발을 돌려 공격 라인 밖으로 각도를 만들고, 상대 옆에서 다시 공격합니다.', footwork: [{ foot: 'lead', dx: 0, dy: 0, pivot: 60, label: '앞발 축' }, { foot: 'rear', dx: -45, dy: -25, label: '뒷발 돌기' }] }),
  parry: A({ key: 'parry', label: '패리', kind: 'defense', side: 'rear', limb: 'hand', path: 'feint', target: 'head', incoming: { side: 'lead', path: 'straight', target: 'head' }, guard: 'parry', cue: '오는 잽을 뒷손 손바닥으로 짧게 쳐서 옆으로 흘려 보냅니다. 손을 크게 휘두르지 말고 얼굴 앞에서 짧게.', footwork: [] }),
  leadParry: A({ key: 'leadParry', label: '앞손 패리', kind: 'defense', side: 'lead', limb: 'hand', path: 'feint', target: 'head', incoming: { side: 'rear', path: 'straight', target: 'head' }, guard: 'parry', cue: '오는 크로스를 앞손 손바닥으로 짧게 쳐서 바깥으로 흘립니다. 뒷손은 턱을 지킵니다.', footwork: [] }),
  downParry: A({ key: 'downParry', label: '다운 패리', kind: 'defense', side: 'rear', limb: 'hand', path: 'feint', target: 'body', incoming: { side: 'lead', path: 'straight', target: 'body' }, guard: 'parry', cue: '몸통으로 오는 잽을 손바닥으로 아래로 눌러 쳐냅니다. 얼굴 가드가 비지 않게 짧게.', footwork: [] }),
  catchPunch: A({ key: 'catchPunch', label: '캐치', kind: 'defense', side: 'rear', limb: 'hand', path: 'feint', target: 'head', incoming: { side: 'lead', path: 'straight', target: 'head' }, guard: 'catch', cue: '뒷손 장갑을 얼굴 앞에서 살짝 펴 잽을 받아 냅니다. 손을 앞으로 뻗지 말고 얼굴 가까이에서.', footwork: [] }),
  block: A({ key: 'block', label: '블록', kind: 'defense', side: 'rear', limb: 'hand', path: 'feint', target: 'head', incoming: { side: 'lead', path: 'hook', target: 'head' }, guard: 'block', cue: '훅이 오는 쪽 장갑을 관자놀이에 붙이고 팔꿈치를 세워 받아 냅니다. 고개를 숙이고 턱을 당깁니다.', footwork: [] }),
  cover: A({ key: 'cover', label: '커버(하이 가드)', kind: 'defense', side: 'rear', limb: 'hand', path: 'feint', target: 'head', incoming: { side: 'rear', path: 'hook', target: 'head' }, guard: 'cover', cue: '두 장갑을 이마·관자놀이에 붙이고 팔꿈치를 모아 연타를 막습니다. 틈 사이로 상대를 봅니다.', footwork: [] }),
  elbowBlock: A({ key: 'elbowBlock', label: '엘보 블록', kind: 'defense', side: 'rear', limb: 'elbow', path: 'feint', target: 'body', incoming: { side: 'lead', path: 'hook', target: 'body' }, guard: 'elbowBlock', cue: '몸통으로 오는 훅·어퍼를 팔꿈치를 옆구리에 붙여 막습니다. 살짝 몸을 그쪽으로 기울여 충격을 받습니다.', footwork: [] }),
  shoulderRoll: A({ key: 'shoulderRoll', label: '숄더 롤', kind: 'defense', side: 'lead', limb: 'body', path: 'feint', target: 'head', incoming: { side: 'rear', path: 'straight', target: 'head' }, guard: 'shoulderRoll', evade: { dx: 14, dy: 0 }, cue: '앞어깨를 올려 턱을 가리고 몸을 뒷발 쪽으로 살짝 돌려, 오는 크로스를 어깨로 굴려 흘립니다.', footwork: [{ foot: 'rear', dx: 0, dy: 0, pivot: 20, label: '뒷발로 회전' }] }),
  check: A({ key: 'check', label: '체크(정강이 막기)', kind: 'defense', side: 'lead', limb: 'foot', path: 'feint', target: 'leg', incoming: { side: 'rear', path: 'kick', target: 'leg' }, guard: 'check', cue: '앞다리 무릎을 바깥으로 들어 정강이로 상대 로우킥을 받아 냅니다. 손은 얼굴 가드.', footwork: [{ foot: 'lead', dx: -8, dy: -10, label: '무릎 들어 정강이로', returns: true }] }),
  kickCatch: A({ key: 'kickCatch', label: '킥 캐치', kind: 'defense', side: 'lead', limb: 'hand', path: 'feint', target: 'body', incoming: { side: 'rear', path: 'kick', target: 'body' }, guard: 'kickCatch', cue: '몸통으로 오는 킥을 옆구리로 받으며 같은 쪽 팔로 다리를 감싸 잡습니다. 반대손은 얼굴을 지킵니다.', footwork: [] }),
  teepCatch: A({ key: 'teepCatch', label: '팁 캐치', kind: 'defense', side: 'rear', limb: 'hand', path: 'feint', target: 'body', incoming: { side: 'lead', path: 'teep', target: 'body' }, guard: 'kickCatch', cue: '배로 오는 팁을 한 손으로 아래에서 받쳐 잡습니다. 몸은 살짝 비켜 충격을 줄입니다.', footwork: [] }),
  kickParry: A({ key: 'kickParry', label: '킥 패리', kind: 'defense', side: 'rear', limb: 'hand', path: 'feint', target: 'body', incoming: { side: 'lead', path: 'teep', target: 'body' }, guard: 'kickParry', cue: '오는 팁·킥을 손바닥으로 옆으로 쳐내 상대 균형을 무너뜨립니다.', footwork: [] }),
  // ---- guard control: hit / pull the holder's guard hand to open a line ----
  leadHandTrap: A({ key: 'leadHandTrap', label: '앞손 트랩', kind: 'trap', side: 'lead', limb: 'hand', path: 'feint', target: 'head', trap: { hand: 'lead', how: 'pull' }, cue: '앞손으로 상대 앞손을 덮어 아래로 눌러 내리며, 가드가 내려간 라인으로 바로 뒷손을 보냅니다.', footwork: [{ foot: 'lead', dx: 0, dy: -10, label: '반 걸음 붙기' }] }),
  rearHandTrap: A({ key: 'rearHandTrap', label: '뒷손 트랩', kind: 'trap', side: 'rear', limb: 'hand', path: 'feint', target: 'head', trap: { hand: 'rear', how: 'pull' }, cue: '뒷손으로 상대 뒷손 장갑을 턱에서 끌어내리거나 밀어 고정하고, 그쪽 얼굴이 빈 순간 리드 훅으로 이어 갑니다.', footwork: [{ foot: 'lead', dx: 0, dy: -10, label: '반 걸음 붙기' }] }),
  paw: A({ key: 'paw', label: '포(앞손 쳐내기)', kind: 'trap', side: 'lead', limb: 'hand', path: 'feint', target: 'head', trap: { hand: 'lead', how: 'paw' }, cue: '앞손으로 상대 앞손을 가볍게 툭 쳐 시선과 가드를 흔든 뒤, 바로 잽·크로스로 들어갑니다.', footwork: [] }),
  guardPullDown: A({ key: 'guardPullDown', label: '가드 끌어내리기', kind: 'trap', side: 'lead', limb: 'hand', path: 'feint', target: 'head', trap: { hand: 'lead', how: 'slap' }, cue: '상대 가드 손(주로 앞팔)을 손바닥으로 세게 쳐 아래로 끌어내리고, 열린 얼굴로 바로 반대손 공격을 넣습니다.', footwork: [] }),
};

// A kick or knee is out-and-back: the striking foot returns to its stance
// position after the strike (a stance switch is not).
for (const a of Object.values(ARCHETYPES)) {
  if (a.kind !== 'strike' || (a.limb !== 'foot' && a.limb !== 'knee') || a.key === 'switchKick') continue;
  for (const m of a.footwork) if (m.foot === a.side) m.returns = true;
}

// Ordered, reviewed name rules (first match wins). Tested on the technique's
// name and aliases (lowercased). Names that are not ONE motion — combinations
// ("A → B", "1--2"), umbrella records ("Lead Hook / Rear Hook"), defenses,
// counters, catches — never match.
const EXCLUDE = /→|--|\s\/\s|,|from |\buke\b|choke|(gari|goshi|mata) gaeshi|\bto\b|counter|catch|check(?!\s?hook)|block|parry|guard|cover|defen|shield|chain|position|finish|setup|combination|entry|transition|sprawl|escape|frame|tie|control|pipe|stance|dirty|clinch/i;
const RULES: [RegExp, string][] = [
  // jumping / spinning kicks first (their names contain the plain kick names)
  [/뛰어이단옆차기|이단옆차기|뛰어옆차기|flying side kick/i, 'flyingSideKick'],
  [/뛰어앞차기|nidan geri|tobi geri|jumping front kick|jumping teep/i, 'jumpFrontKick'],
  [/뛰어돌려차기|jumping round(house)? kick/i, 'jumpRoundKick'],
  [/뛰어뒤차기|jumping back kick/i, 'jumpBackKick'],
  [/뛰어내려차기/i, 'jumpAxeKick'],
  [/공중회전 발차기|완전 회전형|360|tornado/i, 'spinRoundKick'],
  [/회전 내려차기/i, 'spinAxeKick'],
  [/회전 옆차기|뒤돌아차기/i, 'backKick'],
  [/뒤후려차기|wheel kick|spinning hook kick|spinning heel kick/i, 'spinHookKick'],
  [/나래차기|다단|double round kick/i, 'doubleRoundKick'],
  [/^jumping kick$/i, 'jumpFrontKick'],
  [/^후려차기$|hook kick/i, 'hookKick'],
  [/crescent|반달차기|표적차기/i, 'crescentKick'],
  [/fumikomi|밟아차기|stomp/i, 'stompKick'],
  [/비틀어차기|twist kick/i, 'twistKick'],
  [/^찍어차기$/i, 'axeKick'],
  [/spinning knee/i, 'spinKnee'],
  [/khao chiang|khao khong|side knee|diagonal knee/i, 'sideKnee'],
  [/^short knee$/i, 'rearKnee'],
  [/tae chiang/i, 'roundKick'],
  [/teep to leg/i, 'teep'],
  // hand strikes
  [/oi-zuki|lunge punch|전진 찌르기/i, 'lungePunch'],
  [/corkscrew/i, 'corkscrew'],
  [/bolo punch/i, 'bolo'],
  [/gazelle/i, 'gazelle'],
  [/teisho|palm strike|바탕손/i, 'palmStrike'],
  [/nukite|spear hand|편손끝/i, 'spearHand'],
  [/^옆지르기$/i, 'sidePunch'],
  [/^내려지르기$/i, 'downPunch'],
  [/tettsui|hammer ?fist|망치주먹/i, 'hammerFist'],
  [/shuto|knife ?hand|^손날치기$/i, 'knifeHand'],
  [/haito|ridge ?hand|반대손날/i, 'ridgeHand'],
  [/age-zuki|올려 찌르기/i, 'rearUppercut'],
  [/mawashi-zuki|^돌려지르기$/i, 'rearHook'],
  [/choku-zuki|tate-zuki|ippon-ken|^바로지르기$|^지르기$/i, 'cross'],
  [/^반대지르기$/i, 'jab'],
  // elbows
  [/sok phung|spear(ing)? elbow/i, 'spearElbow'],
  [/yoko empi|side elbow/i, 'sideElbow'],
  [/ushiro empi|back elbow/i, 'backElbow'],
  [/age empi/i, 'upElbow'],
  [/otoshi empi/i, 'downElbow'],
  [/mawashi empi|long elbow|short elbow|^팔굽치기$/i, 'hElbow'],
  // throws / takedowns (judo · sambo · wrestling)
  [/makikomi/i, 'wrapThrow'],
  [/\bosoto|отхват|back trip/i, 'osotoGari'],
  [/\bouchi|зацеп/i, 'ouchiGari'],
  [/kouchi/i, 'kouchiGari'],
  [/kosoto|outside trip/i, 'kosotoGari'],
  [/inside trip/i, 'insideTrip'],
  [/ashi barai|harai tsurikomi|подсечка/i, 'footSweep'],
  [/sasae|hiza guruma|ashi guruma/i, 'sasae'],
  [/harai goshi|hane goshi|uchi mata(?! sukashi)|yama arashi|подхват|подсад/i, 'sweepingHip'],
  [/seoi|drop seoi|вертушка|arm throw|arm spin|head-and-arm|через спину/i, 'shoulderThrow'],
  [/tai otoshi/i, 'taiOtoshi'],
  [/uki otoshi|sumi otoshi/i, 'pullDown'],
  [/sukui nage|kuchiki daoshi|kibisu gaeshi|obi otoshi/i, 'scoop'],
  [/goshi|koshi guruma|hip toss|headlock throw|через бедро/i, 'hipThrow'],
  [/tomoe nage|sumi gaeshi|hikikomi gaeshi|tawara gaeshi|ura nage|suplex|через голову|через грудь/i, 'backSacrifice'],
  [/yoko otoshi|yoko guruma|tani otoshi|yoko wakare|yoko gake|uki waza|daki wakare/i, 'sideSacrifice'],
  [/lateral drop/i, 'lateralDrop'],
  [/fireman|мельница/i, 'firemansCarry'],
  [/^arm drag$/i, 'armDrag'],
  [/^duck ?under$/i, 'duckUnder'],
  [/go-behind|slide by|shuck by|throw-by/i, 'goBehind'],
  [/snap ?down/i, 'snapDown'],
  [/^knee tap$/i, 'kneeTap'],
  [/body lock (takedown|throw|lift)/i, 'bodyLock'],
  [/fake shot/i, 'levelFeint'],
  [/(blast|snatch|high|low|reshot) double/i, 'doubleLeg'],
  [/mat return|lift and return/i, 'matReturn'],
  [/level change double leg|double leg|더블 레그/i, 'doubleLeg'],
  [/penetration step|페네트레이션/i, 'doubleLeg'],
  [/high[- ]crotch|하이 크로치/i, 'highCrotch'],
  [/(low|outside|inside|sweep|high|snatch)\s?single|^single leg$|싱글 레그/i, 'singleLeg'],
  [/ankle pick|앵클 픽/i, 'anklePick'],
  [/level change feint/i, 'levelFeint'],
  [/kick feint|foot feint/i, 'kickFeint'],
  [/jab feint|hand feint|shoulder feint|pump feint|^feint$/i, 'handFeint'],
  [/check hook/i, 'checkHook'],
  [/spinning backfist/i, 'spinBackfist'],
  [/backfist|uraken/i, 'backfist'],
  [/superman/i, 'superman'],
  [/lead overhand/i, 'leadOverhand'],
  [/overhand/i, 'overhand'],
  [/rear uppercut/i, 'rearUppercut'],
  [/uppercut|shovel hook/i, 'leadUppercut'],
  [/rear hook/i, 'rearHook'],
  [/lead hook|^hook$|short hook|body hook|hook to body|kagi-zuki/i, 'leadHook'],
  [/^cross$|straight right|gyaku-zuki|body cross|rear straight/i, 'cross'],
  [/^jab$|kizami-zuki|body jab|jab to body|lead straight/i, 'jab'],
  [/spinning back kick|^back kick$|ushiro geri$|^뒤차기$/i, 'backKick'],
  [/question mark/i, 'questionMark'],
  [/switch( low)? kick/i, 'switchKick'],
  [/step-up kick/i, 'stepUpKick'],
  [/side kick|side teep|yoko geri|^옆차기$/i, 'sideKick'],
  [/rear teep|뒷발 밀어차기/i, 'rearTeep'],
  [/lead teep|body teep|hip teep|앞발 밀어차기/i, 'teep'],
  [/lead round kick/i, 'leadRoundKick'],
  [/lead low kick/i, 'leadLowKick'],
  [/axe kick|kakato geri|^내려차기$/i, 'axeKick'],
  [/oblique kick/i, 'obliqueKick'],
  [/^teep$|push teep|face-level teep|^밀어차기$/i, 'teep'],
  [/front kick|mae geri|^앞차기$/i, 'frontKick'],
  [/low kick|calf kick|thigh kick/i, 'lowKick'],
  [/high kick/i, 'highKick'],
  [/앞발 돌려차기/i, 'leadRoundKick'],
  [/body kick|round kick|roundhouse|mawashi geri|돌려차기/i, 'roundKick'],
  [/flying knee|jumping knee/i, 'flyingKnee'],
  [/lead knee/i, 'leadKnee'],
  [/straight knee|rear knee|step-up knee|khao trong|^knee$/i, 'rearKnee'],
  [/spinning elbow/i, 'spinElbow'],
  [/upward elbow|sok ngoei/i, 'upElbow'],
  [/downward elbow|diagonal elbow/i, 'downElbow'],
  [/horizontal elbow|sok tad|^elbow$/i, 'hElbow'],
];

// Defense / guard-control names — exact single-move records only (checked BEFORE the
// exclusion list, which keeps rejecting combination records like "Slip → Cross").
const DEFENSE_RULES: [RegExp, string | ((art?: string) => string)][] = [
  [/^slip outside$|^slip$/i, 'slip'],
  [/^slip inside$/i, 'slipInside'],
  [/^double slip$/i, 'doubleSlip'],
  [/^duck$|^ducking$/i, 'duck'],
  [/^roll$|bob and weave|^weave$|^bob$/i, 'roll'],
  [/^lean back$|^sway( back)?$/i, 'leanBack'],
  [/^pull$|^pull back$/i, 'pull'],
  [/^side step$|^step out$|^step away$/i, 'sideStep'],
  [/^angle out$|^evade$|^pivot out$/i, 'angleOut'],
  [/^lead hand parry$/i, 'leadParry'],
  [/^downward parry$/i, 'downParry'],
  [/^parry$|^rear hand parry$|^double parry$/i, 'parry'],
  [/^teep catch$/i, 'teepCatch'],
  [/^kick parry$/i, 'kickParry'],
  [/^catch$/i, (art) => (art === 'kickboxing' || art === 'muay-thai' ? 'kickCatch' : 'catchPunch')],
  [/^elbow block$|^body cover$|^elbow shield$/i, 'elbowBlock'],
  [/^block$|^elbow guard$/i, 'block'],
  [/^cover$|^shell$|^high guard$|^double forearm guard$|^cross-arm guard$/i, 'cover'],
  [/^shoulder roll$|^philly shell$|^shoulder block$/i, 'shoulderRoll'],
  [/^check$|^shin block$|^body kick check$|^leg check$/i, 'check'],
  [/^lead hand trap$|^hand trap$/i, 'leadHandTrap'],
  [/^rear hand trap$/i, 'rearHandTrap'],
  [/^paw$|^lead hand paw$|^pawing jab$/i, 'paw'],
  [/^guard pull-?down$|^pull down$|^slap down$|^guard slap$/i, 'guardPullDown'],
];

export interface TechniqueMotion {
  archetype: MotionArchetype;
  /** Target height adjusted by the technique's own name (e.g. "Body Jab" → body). */
  target: Target;
}

// Variant records named only by their grip ("боковой", "с захватом пояса" …)
// inherit the throw family of the section they are filed under.
const CATEGORY_RULES: [RegExp, string][] = [
  [/허리\/몸통 던지기|бросок через бедро/i, 'hipThrow'],
  [/등으로 던지기|через спину/i, 'shoulderThrow'],
  [/подсечка/i, 'footSweep'],
];

// Name-rule matching is a pure function of the record, but it runs ~150 regexes per call and the
// combo lists call it for every technique many times — cache per record object.
const motionCache = new WeakMap<object, TechniqueMotion | null>();
export function motionForTechnique(t: Pick<Technique, 'name' | 'aliases'> & { martialArt?: string; category?: string }): TechniqueMotion | null {
  const hit = motionCache.get(t);
  if (hit !== undefined) return hit;
  const m = matchMotion(t);
  motionCache.set(t, m);
  return m;
}

function matchMotion(t: Pick<Technique, 'name' | 'aliases'> & { martialArt?: string; category?: string }): TechniqueMotion | null {
  const names = [t.name, ...(t.aliases ?? [])].map((n) => n.trim()).filter(Boolean);
  for (const n of names) {
    const rule = DEFENSE_RULES.find(([re]) => re.test(n));
    if (rule) {
      const archetype = ARCHETYPES[typeof rule[1] === 'function' ? rule[1](t.martialArt) : rule[1]];
      if (archetype) return { archetype, target: archetype.target };
    }
  }
  if (EXCLUDE.test(t.name) && !/^(level change double leg|teep to leg)$/i.test(t.name)) return null;
  const fromCategory = t.category ? CATEGORY_RULES.find(([re]) => re.test(t.category!)) : undefined;
  if (fromCategory && !names.some((n) => RULES.some(([re]) => re.test(n)))) {
    const archetype = ARCHETYPES[fromCategory[1]];
    return { archetype, target: archetype.target };
  }
  for (const n of names) {
    for (const [re, key] of RULES) {
      if (!re.test(n)) continue;
      // A wrestling "Feint" is a fake shot, not a hand feint.
      const archetype = ARCHETYPES[key === 'handFeint' && t.martialArt === 'wrestling' ? 'levelFeint' : key];
      let target = archetype.target;
      if (archetype.kind === 'strike') {
        if (/body|몸통/i.test(n)) target = 'body';
        else if (/high|head|face|얼굴/i.test(n) && archetype.key !== 'highKick') target = 'head';
        else if (/low|calf|thigh|to leg/i.test(n)) target = 'leg';
      }
      return { archetype, target };
    }
  }
  return null;
}

export const TARGET_LABEL: Record<Target, string> = { head: '머리 높이', body: '몸통 높이', leg: '다리', hips: '허리·골반', none: '목표 없음 (페인트)' };
export const KIND_LABEL: Record<MotionKind, string> = { strike: '타격', feint: '셋업(페인트)', entry: '테이크다운·던지기', defense: '방어·회피', trap: '가드 조작' };
export const THROW_DIR_LABEL: Record<ThrowDir, string> = { back: '뒤로 넘김', front: '앞으로 넘김', side: '옆으로 넘김', over: '머리 위로 넘김', down: '아래로 끌어 내림' };
