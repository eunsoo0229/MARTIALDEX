// Deliberately its own small component rather than reusing
// TrainingCalendarView — that component's CalendarDayData shape
// (count/totalMinutes/totalVolume/intensity 0-3) is training-specific, and
// forcing nutrition's "목표 달성 여부" semantics into it would couple this
// new feature to an unrelated type. Reuses the SAME `.training-calendar*`
// CSS classes (generic grid/cell styling, not training-specific in meaning)
// so it looks identical to the training calendar, per item 1's "UI는 기존
// 디자인 시스템과 통일" requirement — plus one new modifier class,
// `--goal-met`, for the yellow goal-achieved highlight (item 8).
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export interface NutritionCalendarDay {
  dateKey: string;
  hasEntries: boolean;
  goalMet: boolean;
}

export default function NutritionCalendarView({
  year,
  month, // 0-indexed
  days,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: {
  year: number;
  month: number;
  days: NutritionCalendarDay[];
  selectedDate: string | null;
  onSelectDate: (dateKey: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
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
              className={`training-calendar__cell ${d.goalMet ? 'training-calendar__cell--goal-met' : d.hasEntries ? 'training-calendar__cell--intensity-1' : ''} ${isSelected ? 'training-calendar__cell--selected' : ''}`}
              onClick={() => onSelectDate(d.dateKey)}
              title={d.hasEntries ? (d.goalMet ? '목표 달성' : '기록 있음') : '기록 없음'}
            >
              {dayNumber}
            </button>
          );
        })}
      </div>
    </div>
  );
}
