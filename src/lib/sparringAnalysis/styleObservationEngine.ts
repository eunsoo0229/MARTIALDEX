import type { MotionEvent, MotionEventCategory, PostureSegment } from './types';

function countBy(events: MotionEvent[], category: MotionEventCategory): number {
  return events.filter((e) => e.category === category).length;
}

// Deterministic, template-based sentences from real event/posture counts —
// no AI call, and every sentence is phrased as "이러한 특징이 관찰됩니다" per
// spec 14, never "당신은 OO 스타일이다".
export function buildStyleObservations(events: MotionEvent[], postureSegments: PostureSegment[]): string[] {
  const total = events.length;
  const strikeCount = countBy(events, 'strike_like');
  const levelChangeCount = countBy(events, 'level_change_like');
  const clinchCount = countBy(events, 'clinch_like');
  const footworkCount = countBy(events, 'footwork_movement');
  const exitCount = countBy(events, 'distance_exit_like');

  const observations: string[] = [];
  if (levelChangeCount >= 2) {
    observations.push('레벨 체인지/테이크다운 시도로 보이는 동작이 여러 차례 관찰되어, 압박형 움직임의 특징이 나타납니다.');
  }
  if (clinchCount >= 2) {
    observations.push('클린치성 근접 동작이 자주 관찰되어 근거리 공방을 선호하는 경향이 나타납니다.');
  }
  if (strikeCount > levelChangeCount + clinchCount && strikeCount > 0) {
    observations.push('타격성 동작 비중이 상대적으로 높게 관찰되었습니다.');
  }
  if (total > 0 && footworkCount >= total * 0.3) {
    observations.push('이동/풋워크 동작 비중이 높아 거리 조절을 적극적으로 시도하는 경향이 관찰됩니다.');
  }
  if (clinchCount > 0 && exitCount === 0) {
    observations.push('근접 상황에서 거리를 벌리는 동작보다 근접을 유지하는 동작이 더 자주 관찰되었습니다.');
  }

  const lateNote = postureSegments.find((s) => s.segment === 'late')?.note;
  if (lateNote) observations.push(lateNote);

  if (observations.length === 0) {
    observations.push('현재 분석 범위에서는 뚜렷한 스타일적 특징을 관찰하기에 충분한 동작 데이터가 확보되지 않았습니다.');
  }
  return observations;
}
