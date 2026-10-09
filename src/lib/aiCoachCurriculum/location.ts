import type { CoachLocation } from './types';

export const LOCATION_LABEL: Record<CoachLocation, string> = { home: '집에서 운동', gym: '체육관에서 운동', limited: '기타 장소 (장비·공간 제한)' };
export const LOCATION_SHORT: Record<CoachLocation, string> = { home: '집', gym: '체육관', limited: '기타 장소' };
export const LOCATION_ICON: Record<CoachLocation, string> = { home: '🏠', gym: '🥊', limited: '📍' };

/** 집·기타 장소 = 혼자, 장비 없음이 기본 (파트너 단계는 솔로 드릴로). */
export function isSoloLocation(location: CoachLocation): boolean {
  return location !== 'gym';
}

export function parseLocation(v: string | null | undefined): CoachLocation | null {
  return v === 'home' || v === 'gym' || v === 'limited' ? v : null;
}

/** Home ids match HomeExerciseEquipment (types.ts) so the drill pool can be filtered by real exercise data. */
export const EQUIPMENT_OPTIONS: Record<CoachLocation, { id: string; label: string }[]> = {
  home: [
    { id: 'mat', label: '매트' },
    { id: 'jump_rope', label: '줄넘기' },
    { id: 'dumbbell', label: '덤벨' },
    { id: 'band', label: '밴드' },
    { id: 'pull_up_bar', label: '철봉' },
  ],
  gym: [
    { id: 'mat', label: '매트' },
    { id: 'heavy_bag', label: '샌드백' },
    { id: 'mitts', label: '미트(잡아줄 사람 포함)' },
    { id: 'dummy', label: '그래플링 더미' },
    { id: 'machines', label: '운동기구' },
    { id: 'partner', label: '연습 파트너' },
  ],
  limited: [
    { id: 'mat', label: '매트' },
    { id: 'band', label: '밴드' },
    { id: 'jump_rope', label: '줄넘기' },
  ],
};

export function equipmentLabel(location: CoachLocation, id: string): string {
  return EQUIPMENT_OPTIONS[location].find((o) => o.id === id)?.label ?? id;
}

/**
 * The location rules handed to every AI call (curriculum generation AND the
 * live coach session), so "집/체육관" changes what is planned and said — not
 * just a label. Unconfirmed equipment/partners are explicitly "unknown".
 */
export function locationRules(location: CoachLocation, equipment: string[]): string {
  const confirmed = equipment.map((id) => equipmentLabel(location, id));
  const unconfirmed = EQUIPMENT_OPTIONS[location].filter((o) => !equipment.includes(o.id)).map((o) => o.label);
  const lines =
    location === 'limited'
      ? [
          '운동 장소: 기타 장소 (limited) — 사무실·야외·숙소처럼 공간과 장비가 제한된 곳',
          '- 공간이 아주 좁고, 혼자이며, 장비가 없다고 가정한다. 소음과 바닥 충격이 적은 동작을 우선한다.',
          '- 파트너가 필요한 기술은 넣지 않거나 솔로 드릴로 바꾼다. 매트가 확인되지 않았으면 바닥에 눕거나 구르는 동작은 넣지 않는다.',
          '- 점프·회전이 큰 동작, 던지기, 실제 관절기/조르기 적용은 하지 않는다. 짧고 안전한 반복 위주로 구성한다.',
        ]
      : location === 'home'
      ? [
          '운동 장소: 집 (home)',
          '- 공간이 좁고, 혼자 운동하며, 장비가 없다고 가정한다.',
          '- 파트너가 필요한 기술은 넣지 않거나, 혼자 할 수 있는 솔로 드릴(섀도 동작, 자세 반복, 움직임 드릴)로 바꾼다.',
          '- 점프·회전이 큰 동작, 던지기, 실제 관절기/조르기 적용은 하지 않는다. 안전한 반복 위주로 구성한다.',
          '- 기술 연습과 체중을 이용한 기본 체력·움직임 드릴을 조합할 수 있다.',
        ]
      : [
          '운동 장소: 체육관 (gym)',
          '- 넓은 공간을 쓸 수 있고, 매트·샌드백·미트·더미·운동기구·파트너를 활용하는 드릴을 구성할 수 있다.',
          '- 단, 아래에서 "확인됨"이 아닌 장비나 파트너는 있다고 가정하지 않는다. 그런 장비를 쓰는 단계에는 반드시 없을 때의 대안(soloAlternative)을 함께 적는다.',
          '- 파트너 드릴은 천천히, 탭하면 즉시 푸는 안전 수칙을 지킨다.',
        ];
  lines.push(`- 확인된 장비/환경: ${confirmed.length ? confirmed.join(', ') : '없음'}`);
  lines.push(`- 확인되지 않은 장비/환경(있다고 가정 금지): ${unconfirmed.length ? unconfirmed.join(', ') : '없음'}`);
  return lines.join('\n');
}

/** First line the coach says in a live session — tells the user how the place shapes today's class. */
export function locationIntro(location: CoachLocation, equipment: string[]): string {
  if (location === 'limited') return '오늘은 공간과 장비가 제한된 곳에서 운동하겠습니다. 좁은 곳에서도 할 수 있는 조용하고 짧은 동작 위주로, 파트너가 필요한 동작은 혼자 하는 드릴로 바꿔서 진행하겠습니다.';
  if (location === 'home') return '오늘은 집에서 운동하겠습니다. 공간이 좁아도 할 수 있도록, 파트너가 필요한 동작은 혼자 하는 드릴로 바꿔서 진행하겠습니다.';
  const confirmed = equipment.map((id) => equipmentLabel('gym', id));
  return confirmed.length
    ? `오늘은 체육관 수업입니다. 확인된 환경은 ${confirmed.join(', ')}입니다. 그 밖의 장비나 파트너가 필요한 단계는 없을 때의 대안도 함께 알려 드리겠습니다.`
    : '오늘은 체육관 수업입니다. 어떤 장비를 쓸 수 있는지 아직 모르므로, 장비나 파트너가 필요한 단계마다 없을 때의 대안도 함께 알려 드리겠습니다.';
}
