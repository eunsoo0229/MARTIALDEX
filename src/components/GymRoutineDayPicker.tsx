import { useState } from 'react';
import type { GymRoutine, Weekday } from '../lib/gymRoutine/types';
import { getActiveGymRoutine, listMyGymRoutines } from '../lib/gymRoutine/service';
import { WEEKDAY_LABEL, getKstWeekday } from '../lib/dateUtil';
import { getTodaySession, startGymRoutineDayTraining } from '../lib/todayTraining/sessionStore';
import { resolveTechnique } from '../lib/userTechniques/service';
import BottomSheet from './BottomSheet';

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

function hasAnyDay(r: GymRoutine): boolean {
  return r.days.some((d) => d.exercises.length > 0);
}

/** Whether "다른 요일 루틴으로 운동하기" has anything to offer (some routine has at least one non-rest day). */
export function canPickOtherRoutineDay(): boolean {
  return listMyGymRoutines().some(hasAnyDay);
}

function formatTarget(reps: (number | null)[], weights: (number | null)[], seconds: number | null, sets: number): string {
  if (seconds !== null) return `${sets}세트 × ${seconds}초`;
  const repsLabel = reps.every((r) => r === reps[0]) ? `${reps[0] ?? '-'}회` : reps.map((r) => r ?? '-').join('/') + '회';
  const ws = weights.filter((w): w is number => w != null);
  const weightLabel = ws.length === 0 ? '' : weights.every((w) => w === weights[0]) ? ` · ${weights[0]}kg` : ` · ${weights.map((w) => w ?? '-').join('/')}kg`;
  return `${sets}세트 × ${repsLabel}${weightLabel}`;
}

/**
 * "다른 요일 루틴으로 운동하기" — pick any weekday of a routine and run it
 * as TODAY's session. Read-only on routines: starting goes through
 * startGymRoutineDayTraining, which copies the day's targets into the
 * session plan; the routine (both the picked day and today's own day)
 * stays exactly as it was.
 */
export default function GymRoutineDayPicker({ onClose, onStarted }: { onClose: () => void; onStarted: () => void }) {
  const routines = listMyGymRoutines().filter(hasAnyDay);
  const todayWeekday = getKstWeekday();
  const [routineId, setRoutineId] = useState<string | null>(() => {
    const active = getActiveGymRoutine();
    return active && hasAnyDay(active) ? active.id : routines[0]?.id ?? null;
  });
  const [weekday, setWeekday] = useState<Weekday | null>(null);
  const routine = routines.find((r) => r.id === routineId);
  const day = weekday != null ? routine?.days.find((d) => d.weekday === weekday) : undefined;

  function handleStart() {
    if (!routine || weekday == null) return;
    const existing = getTodaySession();
    if (existing && !existing.finishedAt) {
      if (!window.confirm('진행 중인 오늘 훈련이 있습니다. 이 루틴으로 바꿔 새로 시작할까요? 진행 중인 세트 기록은 저장되지 않습니다.')) return;
    } else if (existing?.finishedAt) {
      if (!window.confirm('오늘 이미 완료한 훈련이 있습니다. 완료한 기록은 그대로 유지되고, 이 루틴으로 새 훈련을 시작합니다.')) return;
    }
    if (startGymRoutineDayTraining(routine.id, weekday)) onStarted();
  }

  return (
    <BottomSheet onClose={onClose}>
      <h3>어떤 루틴으로 오늘 운동할까요?</h3>
      {routines.length === 0 ? (
        <p className="video-status-message">요일별 루틴에 운동이 없습니다. 먼저 루틴을 만들어주세요.</p>
      ) : (
        <>
          {routines.length > 1 && (
            <div className="chip-row" style={{ marginBottom: 8 }}>
              {routines.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`chip${r.id === routineId ? ' active' : ''}`}
                  onClick={() => {
                    setRoutineId(r.id);
                    setWeekday(null);
                  }}
                >
                  {r.name}
                  {r.active ? ' (사용 중)' : ''}
                </button>
              ))}
            </div>
          )}
          <div className="stack gap-2">
            {WEEKDAYS.map((w) => {
              const d = routine?.days.find((x) => x.weekday === w);
              const count = d?.exercises.length ?? 0;
              return (
                <button
                  key={w}
                  type="button"
                  className={`technique-row${weekday === w ? ' active' : ''}`}
                  disabled={count === 0}
                  aria-pressed={weekday === w}
                  style={{ justifyContent: 'space-between', opacity: count === 0 ? 0.5 : 1, outline: weekday === w ? '2px solid var(--accent)' : undefined }}
                  onClick={() => setWeekday(w)}
                >
                  <span>
                    {WEEKDAY_LABEL[w]}요일{w === todayWeekday ? ' · 오늘' : ''}
                  </span>
                  <span className="technique-row__sub">{count === 0 ? '휴식일' : `${count}개 운동`}</span>
                </button>
              );
            })}
          </div>

          {day && weekday != null && (
            <div className="card info-card" style={{ marginTop: 12 }}>
              <h3>
                {WEEKDAY_LABEL[weekday]}요일 루틴{routine ? ` · ${routine.name}` : ''}
              </h3>
              <ol style={{ paddingLeft: 20, margin: 0 }}>
                {day.exercises.map((ex, i) => (
                  <li key={`${ex.techniqueId}-${i}`}>
                    {resolveTechnique(ex.techniqueId)?.name ?? ex.techniqueId}
                    <span className="technique-row__sub"> — {formatTarget(ex.targetReps, ex.targetWeightKg, ex.targetSeconds, ex.targetSets)} · 휴식 {ex.restSeconds}초</span>
                  </li>
                ))}
              </ol>
              <p className="video-status-message">오늘 날짜로 기록되며, 원래 루틴은 변경되지 않습니다.</p>
            </div>
          )}
        </>
      )}
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          닫기
        </button>
        <button className="btn btn-primary" disabled={!day} onClick={handleStart}>
          이 루틴으로 운동 시작
        </button>
      </div>
    </BottomSheet>
  );
}
