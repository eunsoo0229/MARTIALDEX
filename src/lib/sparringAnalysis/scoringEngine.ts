import { clampScore, mean } from '../poseAnalysis/geometry';
import type { AnalysisLimitation, MotionEvent, MotionEventCategory, OverallScores, PostureSegment, WeakArea } from './types';
import { overallPostureScore } from './postureMetrics';
import type { SportAnalysisProfile } from './sportAnalysisProfiles';

const MIN_USABLE_FOR_SCORING = 4;

// Every number here is a heuristic COMPOSITE of real signals (tracked
// posture geometry + motion-event rates) — never a learned skill grade.
// "기술"(technique EXECUTION quality/success) is deliberately left null
// always: there is no reliable local signal for whether a strike/takedown
// attempt actually succeeded, so rather than invent a number, this app
// simply doesn't score it (see README "실제 스파링 영상 기반 AI 분석" —
// section "무엇을 실제로 계산하는가" for the honest boundary).
export function computeOverallScores(
  postureSegments: PostureSegment[],
  events: MotionEvent[],
  usableFrameCount: number,
  durationSec: number,
  profile: SportAnalysisProfile
): OverallScores {
  if (usableFrameCount < MIN_USABLE_FOR_SCORING) {
    return { technique: null, movement: null, distance: null, defense: null, offense: null, posture: null };
  }

  const posture = overallPostureScore(postureSegments);
  const allMetrics = postureSegments.flatMap((s) => s.metrics);
  const guardMetric = allMetrics.find((m) => m.id === 'guard') ?? null;
  const balanceScores = allMetrics.filter((m) => m.id === 'balance').map((m) => m.score);
  const balanceAvg = balanceScores.length ? mean(balanceScores) : null;

  const perMinute = (cat: MotionEventCategory): number => (durationSec > 0 ? (events.filter((e) => e.category === cat).length / durationSec) * 60 : 0);

  const footworkRate = perMinute('footwork_movement');
  const movement = balanceAvg !== null ? clampScore(balanceAvg * 0.6 + Math.min(100, footworkRate * 10) * 0.4) : footworkRate > 0 ? clampScore(Math.min(100, footworkRate * 10)) : null;

  const exitRate = perMinute('distance_exit_like');
  const distance = footworkRate > 0 || exitRate > 0 ? clampScore(footworkRate * 6 + exitRate * 15) : null;

  const guardHoldRate = perMinute('guard_hold_like');
  const defense = guardMetric ? clampScore(guardMetric.score * 0.7 + Math.min(100, guardHoldRate * 20) * 0.3) : guardHoldRate > 0 ? clampScore(Math.min(100, guardHoldRate * 20)) : null;

  // Sport-specific composition of the SAME real per-minute event rates (spec
  // section 12: scores must differ per sport) — e.g. wrestling weights
  // level_change_like heavily (takedown attempts), boxing weights strike_like,
  // taekwondo weights kick_like. No new signal is invented; only the blend
  // of already-detected categories changes.
  const offenseEntries = Object.entries(profile.offenseWeights) as [MotionEventCategory, number][];
  const offenseRaw = offenseEntries.reduce((sum, [cat, weight]) => sum + perMinute(cat) * weight, 0);
  const offense = offenseRaw > 0 ? clampScore(offenseRaw) : null;

  return { technique: null, movement, distance, defense, offense, posture };
}

/** 22단계 "가장 개선이 필요한 부분" — only ever built from scores/metrics that were actually computed. */
export function computeWeakAreas(overallScores: OverallScores, postureSegments: PostureSegment[], profile: SportAnalysisProfile): WeakArea[] {
  const areas: WeakArea[] = [];
  for (const key of ['distance', 'defense', 'movement', 'offense'] as const) {
    const score = overallScores[key];
    const label = profile.scoreLabels[key];
    if (score !== null && label && score < 70) areas.push({ label, score });
  }
  for (const seg of postureSegments) {
    for (const m of seg.metrics) {
      if (m.status === 'needs_improvement' && !areas.some((a) => a.label === m.label)) {
        areas.push({ label: m.label, score: m.score });
      }
    }
  }
  areas.sort((a, b) => (a.score ?? 100) - (b.score ?? 100));
  return areas.slice(0, 5);
}

/** 25단계 — surfaced as plain-language notices next to the result, never silently ignored. */
export function detectLimitations(
  videoMeta: { width: number; height: number },
  durationSec: number,
  trackingLossRatio: number,
  maxPeopleDetectedAtOnce: number
): AnalysisLimitation[] {
  const limitations: AnalysisLimitation[] = [];
  if (videoMeta.width > 0 && (videoMeta.width < 480 || videoMeta.height < 360)) {
    limitations.push({ code: 'low_resolution', message: '영상 해상도가 낮아 분석 정확도가 떨어질 수 있습니다.' });
  }
  if (durationSec < 8) {
    limitations.push({ code: 'short_clip', message: '영상 길이가 짧아 충분한 데이터를 확보하지 못했을 수 있습니다.' });
  }
  if (trackingLossRatio > 0.4) {
    limitations.push({ code: 'person_lost', message: '선택한 사람을 일부 구간에서 놓쳤을 수 있습니다(가려짐, 화면 밖 이동, 다른 사람과 겹침 등).' });
  }
  if (maxPeopleDetectedAtOnce <= 1) {
    limitations.push({ code: 'single_person_detected', message: '일부 구간에서 한 명만 감지되어 상대와의 상호작용(클린치/거리) 분석이 제한적일 수 있습니다.' });
  }
  return limitations;
}
