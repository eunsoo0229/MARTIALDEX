import { listSparringSessions } from '../sparringAnalysis/sparringSessionService';
import type { MotionEvent, MotionEventCategory } from '../sparringAnalysis/types';

// MotionEventCategory already distinguishes exactly the concepts this
// feature needs (테이크다운 시도, 클린치, 가드 유지, 타격, 풋워크, 거리 이탈) —
// reused as-is instead of inventing a parallel taxonomy, and it comes
// straight from each sparring session's own real detected motion events.
const CATEGORY_LABEL: Record<MotionEventCategory, string> = {
  strike_like: '타격',
  kick_like: '킥',
  level_change_like: '테이크다운 시도',
  clinch_like: '클린치',
  footwork_movement: '풋워크/이동',
  distance_exit_like: '거리 유지',
  guard_hold_like: '가드 유지',
};

const STRIKING_CATEGORIES: MotionEventCategory[] = ['strike_like', 'kick_like', 'footwork_movement', 'distance_exit_like'];
const GRAPPLING_CATEGORIES: MotionEventCategory[] = ['level_change_like', 'clinch_like', 'guard_hold_like'];

function tally(events: MotionEvent[]): Record<MotionEventCategory, number> {
  const counts: Record<MotionEventCategory, number> = {
    strike_like: 0,
    kick_like: 0,
    level_change_like: 0,
    clinch_like: 0,
    footwork_movement: 0,
    distance_exit_like: 0,
    guard_hold_like: 0,
  };
  for (const e of events) counts[e.category]++;
  return counts;
}

export interface SparringStyleSnapshot {
  sessionId: string;
  date: string;
  label: string;
}

const SHARE_INCREASE_THRESHOLD = 0.15;

// Per-session tags (spec item 8: "스파링 1 → 압박형, 스파링 2 → 클린치 비중
// 증가 ..."). Purely deterministic comparison of each session's dominant
// motion-event category against the previous real session — no AI call, so
// there's no fabrication risk and no per-session API cost.
export function buildSparringStyleTimeline(sessions: ReturnType<typeof listSparringSessions> = listSparringSessions()): SparringStyleSnapshot[] {
  const chronological = [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const result: SparringStyleSnapshot[] = [];
  let prev: { category: MotionEventCategory; share: number } | null = null;

  for (const s of chronological) {
    if (s.motionEvents.length === 0) continue;
    const counts = tally(s.motionEvents);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    const [dominantCategory, dominantCount] = (Object.entries(counts) as [MotionEventCategory, number][]).sort((a, b) => b[1] - a[1])[0];
    const share = dominantCount / total;

    let label: string;
    if (!prev) {
      label = `${CATEGORY_LABEL[dominantCategory]} 중심`;
    } else if (dominantCategory !== prev.category) {
      label = `${CATEGORY_LABEL[dominantCategory]} 중심으로 전환`;
    } else if (share - prev.share >= SHARE_INCREASE_THRESHOLD) {
      label = `${CATEGORY_LABEL[dominantCategory]} 비중 증가`;
    } else if (prev.share - share >= SHARE_INCREASE_THRESHOLD) {
      label = `${CATEGORY_LABEL[dominantCategory]} 비중 감소`;
    } else {
      label = `${CATEGORY_LABEL[dominantCategory]} 유지`;
    }

    result.push({ sessionId: s.id, date: s.date, label });
    prev = { category: dominantCategory, share };
  }
  return result;
}

export interface MonthlyStyleTrendPoint {
  month: string; // YYYY-MM
  label: string;
  sessionCount: number;
}

// Spec item 9: "8월 Striking 중심 → 9월 Mixed → 10월 Grappling 중심" — only
// ever built from months that actually have real sparring sessions with
// detected motion events; a month with no data simply doesn't appear (the
// page additionally hides the whole section unless there are >=2 points).
export function computeMonthlyStyleTrend(sessions: ReturnType<typeof listSparringSessions> = listSparringSessions()): MonthlyStyleTrendPoint[] {
  const byMonth = new Map<string, MotionEvent[]>();
  const sessionCountByMonth = new Map<string, number>();
  for (const s of sessions) {
    if (s.motionEvents.length === 0) continue;
    const month = s.date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), ...s.motionEvents]);
    sessionCountByMonth.set(month, (sessionCountByMonth.get(month) ?? 0) + 1);
  }

  const points: MonthlyStyleTrendPoint[] = [];
  for (const month of [...byMonth.keys()].sort()) {
    const counts = tally(byMonth.get(month)!);
    const striking = STRIKING_CATEGORIES.reduce((a, c) => a + counts[c], 0);
    const grappling = GRAPPLING_CATEGORIES.reduce((a, c) => a + counts[c], 0);
    const total = striking + grappling;
    if (total === 0) continue;
    const strikingRatio = striking / total;
    const label = strikingRatio >= 0.6 ? 'Striking 중심' : strikingRatio <= 0.4 ? 'Grappling 중심' : 'Mixed';
    points.push({ month, label, sessionCount: sessionCountByMonth.get(month) ?? 0 });
  }
  return points;
}
