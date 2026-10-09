// 전체 학생 스파링 — round-by-round random pairing. Every round is built
// from the history of the rounds before it, in priority order:
//   1. never rematch the opponent from the immediately previous round
//      (only when there is literally no other option, e.g. 2 students);
//   2. byes (odd headcount) go to whoever has sat out the least, never to
//      last round's bye if anyone else can sit out — so the person who
//      waited fights next and nobody keeps sitting out;
//   3. prefer opponents met fewer times overall (variety);
//   4. randomness breaks every remaining tie, so the same roster gives
//      different matchups each session.
// It never fails: an impossible constraint just costs more, and the
// cheapest available matching is used.

export interface RoundPlan {
  round: number;
  pairs: [string, string][];
  bye: string | null;
}

export type Rng = () => number;

const LAST_ROUND_REMATCH = 10_000;
const PER_PREVIOUS_MEETING = 100;

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface History {
  meetings: Map<string, number>;
  lastOpponent: Map<string, string>;
  byes: Map<string, number>;
  lastBye: string | null;
}

function pairCost(a: string, b: string, h: History, jitter: number): number {
  let cost = (h.meetings.get(pairKey(a, b)) ?? 0) * PER_PREVIOUS_MEETING;
  if (h.lastOpponent.get(a) === b) cost += LAST_ROUND_REMATCH;
  return cost + jitter;
}

/** Exact minimum-cost perfect matching (small groups) — branch & bound over a shuffled order. */
function exactMatching(ids: string[], cost: (a: string, b: string) => number): [string, string][] {
  let best: [string, string][] = [];
  let bestCost = Infinity;
  const used = new Set<string>();
  const current: [string, string][] = [];
  function go(acc: number) {
    if (acc >= bestCost) return;
    const first = ids.find((id) => !used.has(id));
    if (!first) {
      bestCost = acc;
      best = [...current];
      return;
    }
    used.add(first);
    for (const other of ids) {
      if (used.has(other)) continue;
      used.add(other);
      current.push([first, other]);
      go(acc + cost(first, other));
      current.pop();
      used.delete(other);
    }
    used.delete(first);
  }
  go(0);
  return best;
}

/** Larger groups: randomized greedy + pairwise swap improvement. */
function heuristicMatching(ids: string[], cost: (a: string, b: string) => number, rng: Rng): [string, string][] {
  let best: [string, string][] = [];
  let bestCost = Infinity;
  for (let attempt = 0; attempt < 60; attempt++) {
    const pool = shuffle(ids, rng);
    const pairs: [string, string][] = [];
    while (pool.length > 1) {
      const a = pool.shift()!;
      let bi = 0;
      for (let i = 1; i < pool.length; i++) if (cost(a, pool[i]) < cost(a, pool[bi])) bi = i;
      pairs.push([a, pool.splice(bi, 1)[0]]);
    }
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < pairs.length; i++) {
        for (let j = i + 1; j < pairs.length; j++) {
          const [a, b] = pairs[i];
          const [c, d] = pairs[j];
          const now = cost(a, b) + cost(c, d);
          if (cost(a, c) + cost(b, d) < now) {
            pairs[i] = [a, c];
            pairs[j] = [b, d];
            improved = true;
          } else if (cost(a, d) + cost(b, c) < now) {
            pairs[i] = [a, d];
            pairs[j] = [b, c];
            improved = true;
          }
        }
      }
    }
    const total = pairs.reduce((s, [a, b]) => s + cost(a, b), 0);
    if (total < bestCost) {
      bestCost = total;
      best = pairs;
    }
  }
  return best;
}

function pickBye(ids: string[], h: History, rng: Rng): string {
  const minByes = Math.min(...ids.map((id) => h.byes.get(id) ?? 0));
  let candidates = ids.filter((id) => (h.byes.get(id) ?? 0) === minByes);
  if (candidates.length > 1 && h.lastBye) candidates = candidates.filter((id) => id !== h.lastBye);
  if (candidates.length === 0) candidates = ids.filter((id) => id !== h.lastBye);
  return candidates[Math.floor(rng() * candidates.length)] ?? ids[0];
}

export function planRounds(studentIds: string[], rounds: number, rng: Rng = Math.random): RoundPlan[] {
  const ids = [...new Set(studentIds)];
  if (ids.length < 2) return [];
  const h: History = { meetings: new Map(), lastOpponent: new Map(), byes: new Map(), lastBye: null };
  const plans: RoundPlan[] = [];

  for (let r = 1; r <= rounds; r++) {
    const bye = ids.length % 2 === 1 ? pickBye(ids, h, rng) : null;
    const fighters = ids.filter((id) => id !== bye);
    // Jitter fixed per pair within the round so the cost function is consistent.
    const jitter = new Map<string, number>();
    const cost = (a: string, b: string) => {
      const k = pairKey(a, b);
      if (!jitter.has(k)) jitter.set(k, rng());
      return pairCost(a, b, h, jitter.get(k)!);
    };
    const pairs = fighters.length <= 12 ? exactMatching(shuffle(fighters, rng), cost) : heuristicMatching(fighters, cost, rng);

    h.lastOpponent = new Map();
    for (const [a, b] of pairs) {
      h.meetings.set(pairKey(a, b), (h.meetings.get(pairKey(a, b)) ?? 0) + 1);
      h.lastOpponent.set(a, b);
      h.lastOpponent.set(b, a);
    }
    if (bye) h.byes.set(bye, (h.byes.get(bye) ?? 0) + 1);
    h.lastBye = bye;
    plans.push({ round: r, pairs, bye });
  }
  return plans;
}
