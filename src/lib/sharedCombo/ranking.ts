import { tagLabel } from './purpose';
import type { InterestEvent, InterestEventType, SharedCombo, SharedComboSort } from './types';

// 정렬·추천 알고리즘 (pure — no storage, no network).
//
// 맞춤 추천: the user's interest profile is built from what they did with
// combos on this device — opened (1), hearted (3), favorited (4), shared (2)
// — with each event fading by half every INTEREST_HALF_LIFE_DAYS, so what
// they look at NOW matters most. A combo scores by how well its purpose tags,
// techniques, kind (콤보/셋업) and martial art match that profile, plus a
// small popularity and freshness term; combos the user has already opened
// many times are scaled down so the top keeps showing something new. With no
// history yet it falls back to popular + recent.

export const INTEREST_HALF_LIFE_DAYS = 14;
const DAY = 86400000;

export const EVENT_WEIGHT: Record<InterestEventType, number> = { view: 1, like: 3, favorite: 4, share: 2 };

export interface InterestProfile {
  tags: Map<string, number>;
  techniques: Map<string, number>;
  kinds: Map<string, number>;
  arts: Map<string, number>;
  /** Decayed views per combo (to avoid showing the same thing on top forever). */
  views: Map<string, number>;
  total: number;
}

function add(m: Map<string, number>, k: string, v: number) {
  m.set(k, (m.get(k) ?? 0) + v);
}

export function buildInterestProfile(events: InterestEvent[], now: number): InterestProfile {
  const p: InterestProfile = { tags: new Map(), techniques: new Map(), kinds: new Map(), arts: new Map(), views: new Map(), total: 0 };
  for (const e of events) {
    const age = Math.max(0, now - e.at) / DAY;
    const w = EVENT_WEIGHT[e.type] * Math.pow(0.5, age / INTEREST_HALF_LIFE_DAYS);
    if (w < 0.01) continue;
    p.total += w;
    for (const t of e.purposeTags) add(p.tags, t, w);
    for (const t of e.techniqueIds) add(p.techniques, t, w / Math.max(1, e.techniqueIds.length));
    add(p.kinds, e.kind, w);
    if (e.martialArt) add(p.arts, e.martialArt, w);
    if (e.type === 'view') add(p.views, e.comboId, Math.pow(0.5, age / INTEREST_HALF_LIFE_DAYS));
  }
  return p;
}

function share(m: Map<string, number>, k: string, total: number): number {
  return total > 0 ? (m.get(k) ?? 0) / total : 0;
}

export interface Recommendation {
  combo: SharedCombo;
  score: number;
  /** Short reason shown on the card ("자주 본 '테이크다운' 셋업"). */
  reason: string | null;
}

export function scoreForProfile(c: SharedCombo, p: InterestProfile, now: number): Recommendation {
  const ageDays = Math.max(0, now - Date.parse(c.createdAt)) / DAY;
  const popularity = Math.log1p(c.likeCount) * 0.12;
  const freshness = Math.exp(-ageDays / 30) * 0.08;
  if (p.total <= 0) return { combo: c, score: popularity + freshness, reason: null };

  const tagHits = c.purposeTags.map((t) => ({ t, s: share(p.tags, t, p.total) })).filter((x) => x.s > 0);
  const tagScore = tagHits.reduce((s, x) => s + x.s, 0);
  const techScore = c.techniqueIds.reduce((s, t) => s + share(p.techniques, t, p.total), 0);
  const kindScore = share(p.kinds, c.kind, p.total) * 0.3;
  const artScore = c.martialArt ? share(p.arts, c.martialArt, p.total) * 0.2 : 0;
  // Already opened (recently) → scaled down, so similar combos the user hasn't seen can rise above it
  // (an opened combo matches its own profile perfectly and would otherwise stay on top forever).
  const seen = p.views.get(c.id) ?? 0;
  const seenFactor = 1 - Math.min(0.6, seen * 0.15);
  const score = (tagScore * 1.0 + techScore * 0.6 + kindScore + artScore) * seenFactor + popularity + freshness;
  const best = tagHits.sort((a, b) => b.s - a.s)[0];
  const reason = best ? `관심 있게 본 '${tagLabel(best.t)}' ${c.kind === 'setup' ? '셋업과' : '콤보와'} 비슷합니다` : techScore > 0 ? '자주 본 기술이 들어 있습니다' : null;
  return { combo: c, score, reason };
}

export function recommend(combos: SharedCombo[], events: InterestEvent[], now: number): Recommendation[] {
  const profile = buildInterestProfile(events, now);
  return combos
    .map((c) => scoreForProfile(c, profile, now))
    .sort((a, b) => b.score - a.score || b.combo.likeCount - a.combo.likeCount || b.combo.createdAt.localeCompare(a.combo.createdAt));
}

// ---------------- periods

/** Start of this week (Monday 00:00), month or year in local time. */
export function periodStart(sort: 'week' | 'month' | 'year', now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (sort === 'week') {
    const dow = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - dow);
    return d;
  }
  if (sort === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(now.getFullYear(), 0, 1);
}

export interface RankedCombo {
  combo: SharedCombo;
  /** Hearts counted for the chosen ordering (period hearts for week/month/year). */
  hearts: number;
  reason: string | null;
}

/**
 * Orders combos for one tab. `periodLikes` = hearts given since the period
 * start (from the server's count-only function); combos with none in the
 * period still appear, after the ones that have some.
 */
export function rankCombos(combos: SharedCombo[], sort: SharedComboSort, ctx: { now: number; periodLikes?: Map<string, number>; events?: InterestEvent[] }): RankedCombo[] {
  const byNewest = (a: SharedCombo, b: SharedCombo) => b.createdAt.localeCompare(a.createdAt);
  switch (sort) {
    case 'recommended':
      return recommend(combos, ctx.events ?? [], ctx.now).map((r) => ({ combo: r.combo, hearts: r.combo.likeCount, reason: r.reason }));
    case 'latest':
      return [...combos].sort(byNewest).map((c) => ({ combo: c, hearts: c.likeCount, reason: null }));
    case 'least':
      return [...combos].sort((a, b) => a.likeCount - b.likeCount || byNewest(a, b)).map((c) => ({ combo: c, hearts: c.likeCount, reason: null }));
    case 'all':
      return [...combos].sort((a, b) => b.likeCount - a.likeCount || byNewest(a, b)).map((c) => ({ combo: c, hearts: c.likeCount, reason: null }));
    default: {
      const pl = ctx.periodLikes ?? new Map<string, number>();
      return [...combos]
        .sort((a, b) => (pl.get(b.id) ?? 0) - (pl.get(a.id) ?? 0) || b.likeCount - a.likeCount || byNewest(a, b))
        .map((c) => ({ combo: c, hearts: pl.get(c.id) ?? 0, reason: null }));
    }
  }
}

// ---------------- similar

function jaccard(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 0;
  const A = new Set(a);
  const inter = b.filter((x) => A.has(x)).length;
  return inter / (A.size + new Set(b).size - inter);
}

/** 관련 추천 콤보(셋업): same purpose, overlapping techniques, same kind and art. */
export function similarCombos(target: SharedCombo, all: SharedCombo[], limit = 6): { combo: SharedCombo; score: number }[] {
  return all
    .filter((c) => c.id !== target.id)
    .map((c) => ({
      combo: c,
      score: jaccard(target.purposeTags, c.purposeTags) * 0.5 + jaccard(target.techniqueIds, c.techniqueIds) * 0.35 + (c.kind === target.kind ? 0.1 : 0) + (c.martialArt && c.martialArt === target.martialArt ? 0.05 : 0),
    }))
    .filter((x) => x.score >= 0.15)
    .sort((a, b) => b.score - a.score || b.combo.likeCount - a.combo.likeCount)
    .slice(0, limit);
}
