import type { Technique } from '../../types';

// 14-6 "포지션별 약점" needs a small, universal position vocabulary — but the
// real technique data's `positions` field is extremely long-tail and
// per-technique specific (e.g. "데 라 히바 (De La Riva Guard)", "손기술 --- Te
// Waza" — see data/processed/*.json), not a clean 5-value enum. So, exactly
// like fighterStyle/phaseClassifier.ts does for curriculum phases, a REAL
// technique is bucketed into one of a handful of canonical positions via
// deterministic keyword matching against its own category/positions/tags/
// name — no AI, no invented data. Techniques that don't clearly match any
// bucket are 'other' and are left out of the position dashboard entirely
// (rather than forced into a misleading bucket).
export type CanonicalPosition = 'standing' | 'clinch' | 'guard' | 'mount_top' | 'back_control' | 'other';

export const POSITION_LABEL: Record<Exclude<CanonicalPosition, 'other'>, string> = {
  standing: 'Standing',
  clinch: 'Clinch',
  guard: 'Guard',
  mount_top: 'Mount',
  back_control: 'Back Control',
};

const KEYWORDS: { position: Exclude<CanonicalPosition, 'other'>; words: string[] }[] = [
  {
    position: 'back_control',
    words: ['백 컨트롤', '백', 'back control', 'back mount', 'rear naked', 'hooks in'],
  },
  {
    position: 'mount_top',
    words: ['마운트', 'mount', '탑 포지션', 'top position', 'ground and pound', '파운드', '사이드 컨트롤', 'side control'],
  },
  {
    position: 'guard',
    words: ['가드', 'guard', '스윕', 'sweep', '하프', 'half guard', '오픈 가드', '클로즈드 가드', '터틀', 'turtle'],
  },
  {
    position: 'clinch',
    words: ['클린치', 'clinch', '타이업', 'tie up', '언더훅', 'underhook', '오버훅', 'overhook', '그립', 'grip fighting'],
  },
  {
    position: 'standing',
    words: [
      '스탠딩', 'standing', '타격', '펀치', 'punch', '킥', 'kick', '풋워크', 'footwork',
      '테이크다운', 'takedown', '스탠스', 'stance', '던지기', 'throw', '싱글 레그', '더블 레그',
      'single leg', 'double leg',
    ],
  },
];

function textOf(t: Technique): string {
  return [t.category, ...t.positions, ...t.tags, t.name].join(' ').toLowerCase();
}

export function classifyPosition(technique: Technique): CanonicalPosition {
  const text = textOf(technique);
  for (const { position, words } of KEYWORDS) {
    if (words.some((w) => text.includes(w.toLowerCase()))) return position;
  }
  return 'other';
}
