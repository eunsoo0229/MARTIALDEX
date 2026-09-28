import type { Technique } from '../../types';
import type { StylePhaseKey } from './types';

// Buckets a REAL technique (already resolved from the encyclopedia) into one
// of the curriculum's learning phases, using its own category/positions/tags
// — no AI call, deterministic. 'situational' is never assigned here; the
// planner carves that bucket out of the tail of 'position'/'connection' for
// longer-duration curricula (see curriculumPlanner.ts).
const KEYWORDS: { phase: Exclude<StylePhaseKey, 'situational'>; words: string[] }[] = [
  {
    phase: 'connection',
    words: [
      '서브미션', '조르기', '관절기', '피니시', '콤보', '연결',
      'submission', 'choke', 'lock', 'armbar', 'triangle', 'kimura', 'americana',
      'guillotine', 'rnc', 'ezekiel', 'heel hook', 'ankle lock', 'keylock', 'kneebar',
      'finish', 'combo', 'chain', 'knockout',
    ],
  },
  {
    phase: 'entries',
    words: [
      '테이크다운', '클린치', '그립', '진입', '슈팅', '페인트', '셋업', '콤비네이션',
      'takedown', 'clinch', 'entry', 'shot', 'feint', 'setup', 'combination', 'jab',
      'double leg', 'single leg', 'level change', 'snap', 'duck', 'underhook', 'tie',
    ],
  },
  {
    phase: 'position',
    words: [
      '가드', '컨트롤', '포지션', '마운트', '사이드', '백', '탑', '파운드', '탈출', '이스케이프',
      'guard', 'control', 'position', 'mount', 'side', 'back', 'top', 'pin', 'hold',
      'ground and pound', 'turtle', 'escape', 'pass', 'sweep', 'counter', 'defense', 'block',
    ],
  },
  {
    phase: 'fundamentals',
    words: [
      '스탠스', '자세', '풋워크', '이동', '거리', '기본', '균형',
      'stance', 'footwork', 'distance', 'movement', 'shuffle', 'pivot', 'basic', 'balance',
    ],
  },
];

function textOf(t: Technique): string {
  return [t.category, ...t.positions, ...t.tags, t.name].join(' ').toLowerCase();
}

export function classifyPhase(technique: Technique): Exclude<StylePhaseKey, 'situational'> {
  const text = textOf(technique);
  for (const { phase, words } of KEYWORDS) {
    if (words.some((w) => text.includes(w.toLowerCase()))) return phase;
  }
  // No clear signal — most techniques without a sharper category hint are
  // still some form of positional/control concept, so that's the safer
  // default bucket rather than always falling back to "fundamentals".
  return 'position';
}
