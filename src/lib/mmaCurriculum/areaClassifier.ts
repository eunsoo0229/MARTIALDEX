import type { Technique } from '../../types';
import type { MmaArea } from './types';

// Deterministic, keyword-based — same approach as
// fighterStyle/phaseClassifier.ts's classifyPhase(), just re-parameterized
// for MMA-specific area vocabulary. Every keyword list below was checked
// against the real encyclopedia data before being added (see types.ts's
// comment on MmaArea) — a technique that matches nothing returns null
// rather than being forced into a guessed bucket, so "부족한 영역" narration
// never silently over- or under-counts an area based on a bad default.
const KEYWORDS: { area: MmaArea; words: string[] }[] = [
  {
    area: 'submission',
    words: [
      '초크', '조르기', '관절기', '서브미션',
      'submission', 'choke', 'armbar', 'triangle', 'kimura', 'americana', 'guillotine',
      'rear-naked', 'rnc', 'ezekiel', 'heel hook', 'ankle lock', 'keylock', 'kneebar', 'lock',
    ],
  },
  {
    area: 'takedown_defense',
    words: [
      '스프롤', '언더훅', '탈출', '방어',
      'sprawl', 'underhook', 'down defense', 'headlock defense', 'chest-to-chest defense',
    ],
  },
  {
    area: 'takedown',
    words: [
      '테이크다운', '더블 레그', '싱글 레그', '던지기', '투사', '그립', '리샷',
      'takedown', 'double leg', 'single leg', 'level change', 'shoot', 'throw', 'snap', 'duck', 'tie',
    ],
  },
  {
    area: 'ground',
    words: [
      '가드', '마운트', '사이드', '백', '탑', '바텀', '포지션', '컨트롤',
      'guard', 'mount', 'side control', 'back control', 'top position', 'bottom position',
      'control', 'turtle', 'pass', 'north-south', 'knee on belly',
    ],
  },
  {
    area: 'clinch',
    words: ['클린치', '바디락', 'clinch', 'body lock', 'collar tie', 'plum'],
  },
  {
    area: 'striking',
    words: [
      '펀치', '킥', '니', '엘보', '잽', '스트레이트', '훅', '어퍼컷', '로우킥',
      'jab', 'cross', 'hook', 'uppercut', 'kick', 'knee strike', 'elbow', 'punch', 'strike', 'combination',
    ],
  },
  {
    area: 'transition',
    words: ['스윕', '전환', 'sweep', 'transition', 'scramble'],
  },
];

function textOf(t: Technique): string {
  return [t.category, ...t.positions, ...t.tags, t.name].join(' ').toLowerCase();
}

export function classifyMmaArea(technique: Technique): MmaArea | null {
  const text = textOf(technique);
  for (const { area, words } of KEYWORDS) {
    if (words.some((w) => text.includes(w.toLowerCase()))) return area;
  }
  return null;
}
