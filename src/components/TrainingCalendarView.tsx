import type { CalendarDayData } from '../lib/trainingAnalytics/calendarData';
import { formatVolumeCompact } from '../lib/gymTraining/volume';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export default function TrainingCalendarView({
  year,
  month, // 0-indexed
  days,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  showVolume = false,
}: {
  year: number;
  month: number;
  days: CalendarDayData[];
  selectedDate: string | null;
  onSelectDate: (dateKey: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** When true, renders each cell's totalVolume beneath the day number. Existing callers (Dashboard/TrainingAnalytics) omit this and render byte-identically to before. */
  showVolume?: boolean;
}) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const leadingBlanks = Array.from({ length: firstWeekday }, (_, i) => `blank-${i}`);

  return (
    <div className="training-calendar">
      <div className="training-calendar__header">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onPrevMonth} aria-label="이전 달">
          ◀
        </button>
        <strong>
          {year}년 {month + 1}월
        </strong>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onNextMonth} aria-label="다음 달">
          ▶
        </button>
      </div>
      <div className="training-calendar__weekdays">
        {WEEKDAY_LABELS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="training-calendar__grid">
        {leadingBlanks.map((k) => (
          <div key={k} className="training-calendar__cell training-calendar__cell--empty" />
        ))}
        {days.map((d) => {
          const dayNumber = Number(d.dateKey.slice(-2));
          const isSelected = d.dateKey === selectedDate;
          return (
            <button
              key={d.dateKey}
              type="button"
              data-date={d.dateKey}
              className={`training-calendar__cell training-calendar__cell--intensity-${d.intensity} ${isSelected ? 'training-calendar__cell--selected' : ''}`}
              onClick={() => onSelectDate(d.dateKey)}
              title={
                d.count > 0
                  ? `${d.count}회 훈련 · ${d.totalMinutes}분${d.totalVolume > 0 ? ` · ${formatVolumeCompact(d.totalVolume)}` : ''}`
                  : '훈련 기록 없음'
              }
            >
              {dayNumber}
              {showVolume && d.totalVolume > 0 && (
                <span className="training-calendar__cell-volume">{formatVolumeCompact(d.totalVolume)}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
