import type { LevelInfo } from '../level/levelEngine';

// 24단계 — "Martial Rank & Badge". Deliberately a thin wrapper over the
// EXISTING level/XP engine (src/lib/level/levelEngine.ts) rather than a
// second parallel formula — same real activity data, same thresholds, just
// a Korean, game-flavored title layered on top for the "게임형 Rank" framing
// the spec asks for. Titles are intentionally generic fantasy/RPG-style
// wording (도장 입문자, 수련생, ...) and never use real martial-arts belt/dan
// terminology (백대, 유단자, 초단 등) so this can never be mistaken for an
// actual grading — see the disclaimer surfaced alongside it in Profile.tsx.
const RANK_TITLES = [
  '도장 입문자',
  '성실한 수련생',
  '다재다능 수련자',
  '헌신적인 무도인',
  '고급 수련자',
  '베테랑 파이터',
  '그랜드마스터 후보',
];

export interface RankInfo {
  rank: number;
  title: string;
  xp: number;
  xpIntoRank: number;
  xpForNextRank: number | null;
}

export function computeRankInfo(level: LevelInfo): RankInfo {
  return {
    rank: level.level,
    title: RANK_TITLES[level.level - 1] ?? RANK_TITLES[RANK_TITLES.length - 1],
    xp: level.xp,
    xpIntoRank: level.xpIntoLevel,
    xpForNextRank: level.xpForNextLevel,
  };
}
