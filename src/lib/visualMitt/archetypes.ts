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

export type MotionKind = 'strike' | 'feint' | 'entry';
export type Side = 'lead' | 'rear';
export type Limb = 'hand' | 'foot' | 'knee' | 'elbow' | 'body';
export type PathShape = 'straight' | 'hook' | 'uppercut' | 'overhand' | 'round' | 'thrust' | 'spin' | 'axe' | 'knee' | 'elbowH' | 'elbowUp' | 'elbowDown' | 'backfist' | 'feint' | 'shot';
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
  anklePick: A({ key: 'anklePick', label: '앵클 픽', kind: 'entry', side: 'lead', limb: 'body', path: 'shot', target: 'leg', cue: '상대 머리를 눌러 무게를 앞다리에 싣게 한 뒤, 짧게 들어가며 상대 발목을 낚아챕니다.', footwork: [{ foot: 'lead', dx: -10, dy: -45, label: '짧은 진입 스텝' }], levelChange: true }),
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
const EXCLUDE = /→|--|\s\/\s|,|회전|뛰어|이단|from |\bto\b|counter|catch|check(?!\s?hook)|block|parry|guard|cover|defen|shield|chain|position|finish|setup|combination|entry|transition|sprawl|escape|frame|tie|control|pipe|stance|dirty|clinch/i;
const RULES: [RegExp, string][] = [
  [/level change double leg|double leg|더블 레그/i, 'doubleLeg'],
  [/penetration step|페네트레이션/i, 'doubleLeg'],
  [/high crotch|하이 크로치/i, 'highCrotch'],
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

export interface TechniqueMotion {
  archetype: MotionArchetype;
  /** Target height adjusted by the technique's own name (e.g. "Body Jab" → body). */
  target: Target;
}

export function motionForTechnique(t: Pick<Technique, 'name' | 'aliases'> & { martialArt?: string }): TechniqueMotion | null {
  const names = [t.name, ...(t.aliases ?? [])].map((n) => n.trim()).filter(Boolean);
  if (EXCLUDE.test(t.name) && !/^level change double leg$/i.test(t.name)) return null;
  for (const n of names) {
    for (const [re, key] of RULES) {
      if (!re.test(n)) continue;
      // A wrestling "Feint" is a fake shot, not a hand feint.
      const archetype = ARCHETYPES[key === 'handFeint' && t.martialArt === 'wrestling' ? 'levelFeint' : key];
      let target = archetype.target;
      if (archetype.kind === 'strike') {
        if (/body|몸통/i.test(n)) target = 'body';
        else if (/high|head|face|얼굴/i.test(n) && archetype.key !== 'highKick') target = 'head';
        else if (/low|calf|thigh/i.test(n)) target = 'leg';
      }
      return { archetype, target };
    }
  }
  return null;
}

export const TARGET_LABEL: Record<Target, string> = { head: '머리 높이', body: '몸통 높이', leg: '다리', hips: '허리·골반', none: '목표 없음 (페인트)' };
export const KIND_LABEL: Record<MotionKind, string> = { strike: '타격', feint: '셋업(페인트)', entry: '테이크다운 진입' };
