import { useState } from 'react';
import type { CoachLocation } from '../lib/aiCoachCurriculum/types';
import { EQUIPMENT_OPTIONS, LOCATION_ICON, LOCATION_LABEL } from '../lib/aiCoachCurriculum/location';

// "AI 코치 수업을 시작하기 전에 오늘 어디에서 운동할까요?" — shared by the
// Day-start chooser, the coach session (when opened without a place) and the
// AI 코치 수업 setup page. Step 2 (equipment) is optional: anything not
// ticked is treated as unknown by the coach, never assumed.
export default function CoachLocationPicker({
  onConfirm,
  onBack,
  confirmLabel = '이 환경으로 시작',
}: {
  onConfirm: (location: CoachLocation, equipment: string[]) => void;
  onBack?: () => void;
  confirmLabel?: string;
}) {
  const [location, setLocation] = useState<CoachLocation | null>(null);
  const [equipment, setEquipment] = useState<string[]>([]);

  if (!location) {
    return (
      <div data-testid="coach-location-picker">
        <p style={{ margin: '0 0 8px' }}>
          AI 코치 수업을 시작하기 전에
          <br />
          <strong>오늘 어디에서 운동할까요?</strong>
        </p>
        <div className="day-start-options">
          <button className="btn btn-primary day-start-option" data-testid="coach-location-home" onClick={() => setLocation('home')}>
            {LOCATION_ICON.home} {LOCATION_LABEL.home}
            <span className="day-start-option__desc">좁은 공간·혼자·장비 없이 할 수 있는 수업으로 구성합니다.</span>
          </button>
          <button className="btn btn-secondary day-start-option" data-testid="coach-location-gym" onClick={() => setLocation('gym')}>
            {LOCATION_ICON.gym} {LOCATION_LABEL.gym}
            <span className="day-start-option__desc">매트·샌드백·미트·파트너 등 체육관 환경을 활용합니다.</span>
          </button>
          <button className="btn btn-secondary day-start-option" data-testid="coach-location-limited" onClick={() => setLocation('limited')}>
            {LOCATION_ICON.limited} {LOCATION_LABEL.limited}
            <span className="day-start-option__desc">사무실·야외·숙소처럼 공간과 장비가 제한된 곳 — 조용하고 짧은 솔로 동작으로 구성합니다.</span>
          </button>
          {onBack && (
            <button className="btn btn-ghost btn-sm" onClick={onBack}>
              ← 뒤로
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="coach-location-equipment" data-location={location}>
      <p style={{ margin: '0 0 6px' }}>
        {LOCATION_ICON[location]} <strong>{LOCATION_LABEL[location]}</strong> — 지금 쓸 수 있는 것이 있으면 선택해 주세요.
      </p>
      <p className="video-status-message" style={{ margin: '0 0 8px' }}>
        잘 모르면 선택하지 않아도 됩니다. 선택하지 않은 장비나 파트너는 있다고 가정하지 않고, 필요한 단계마다 대안을 알려 드려요.
      </p>
      <div className="chip-row">
        {EQUIPMENT_OPTIONS[location].map((o) => {
          const on = equipment.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              className={`chip ${on ? 'active' : ''}`}
              data-testid={`coach-equip-${o.id}`}
              aria-pressed={on}
              onClick={() => setEquipment((prev) => (on ? prev.filter((x) => x !== o.id) : [...prev, o.id]))}
            >
              {on ? '✓ ' : ''}
              {o.label}
            </button>
          );
        })}
      </div>
      <div className="modal-actions modal-actions--start" style={{ marginTop: 10 }}>
        <button className="btn btn-primary" data-testid="coach-location-confirm" onClick={() => onConfirm(location, equipment)}>
          {confirmLabel}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setLocation(null);
            setEquipment([]);
          }}
        >
          ← 장소 다시 선택
        </button>
      </div>
    </div>
  );
}
