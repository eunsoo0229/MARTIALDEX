import { CHEER_LABEL, describePlan, formatDuration, planErrors, PLAN_LIMITS, type CheerLevel } from '../../lib/coachLesson/workoutPlan';
import { remainingMs, workedMs, type WorkoutResult, type WorkoutRun } from '../../lib/coachLesson/workoutTimer';
import type { PlanDraft } from '../../lib/coachLesson/oneOffSession';

function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const FIELD_LABEL = { exercise: '운동 시간', sets: '세트', rest: '휴식' } as const;

function NumberInput(props: { value: number | null; onChange: (v: number | null) => void; min: number; max: number; testId: string; label: string; suffix: string; disabled?: boolean }) {
  return (
    <label className="workout-field">
      <span className="field-label">{props.label}</span>
      <span className="workout-field__input">
        <input
          type="number"
          inputMode="numeric"
          className="select"
          min={props.min}
          max={props.max}
          value={props.value ?? ''}
          placeholder="?"
          disabled={props.disabled}
          data-testid={props.testId}
          onChange={(e) => props.onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
        {props.suffix}
      </span>
    </label>
  );
}

/**
 * 운동 계획 + 타이머. Before start: the plan read from the coach's words,
 * every number editable, missing ones clearly asked for (never invented).
 * Running: phase, set n/N, a countdown computed from real deadlines, pause /
 * resume / end. Done: the result.
 */
export default function WorkoutPanel(props: {
  title: string;
  practice: string;
  draft: PlanDraft;
  mismatch: boolean;
  onDraft: (d: PlanDraft) => void;
  run: WorkoutRun | null;
  result: WorkoutResult | null;
  cheer: CheerLevel;
  onCheer: (c: CheerLevel) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  /** Practice without a timer (rep-based drills): done / not done. */
  onManualDone: (completed: boolean) => void;
  manualAllowed: boolean;
}) {
  const { draft, run } = props;
  const now = Date.now();
  const complete = draft.exerciseDurationSeconds !== null && draft.sets !== null && draft.restDurationSeconds !== null;
  const errors = complete ? planErrors({ exerciseDurationSeconds: draft.exerciseDurationSeconds!, sets: draft.sets!, restDurationSeconds: draft.restDurationSeconds! }) : [];
  const missing = (['exercise', 'sets', 'rest'] as const).filter((k) => (k === 'exercise' ? draft.exerciseDurationSeconds : k === 'sets' ? draft.sets : draft.restDurationSeconds) === null);
  const set = (patch: Partial<PlanDraft>) => props.onDraft({ ...draft, ...patch, source: 'user_edit', fromLastUsed: draft.fromLastUsed.filter((f) => !(f === 'exercise' && 'exerciseDurationSeconds' in patch) && !(f === 'sets' && 'sets' in patch) && !(f === 'rest' && 'restDurationSeconds' in patch)) });
  const running = !!run && run.phase !== 'done';
  const exMin = draft.exerciseDurationSeconds === null ? null : Math.floor(draft.exerciseDurationSeconds / 60);
  const exSec = draft.exerciseDurationSeconds === null ? null : draft.exerciseDurationSeconds % 60;

  return (
    <div className="card info-card workout-panel" data-testid="workout-panel" data-phase={run?.phase ?? 'plan'} data-paused={String(!!run?.paused)}>
      <h3 style={{ marginTop: 0 }}>⏱ 실습 · {props.title}</h3>
      {props.practice && (
        <p className="technique-row__sub" data-testid="oneoff-practice" style={{ marginTop: 0 }}>
          코치의 실습 안내: {props.practice}
        </p>
      )}

      {!run && (
        <div data-testid="workout-plan">
          <div className="workout-fields">
            <label className="workout-field">
              <span className="field-label">운동 시간</span>
              <span className="workout-field__input">
                <input type="number" className="select" min={0} max={30} value={exMin ?? ''} placeholder="?" data-testid="workout-ex-min" onChange={(e) => set({ exerciseDurationSeconds: e.target.value === '' && exSec === null ? null : Number(e.target.value || 0) * 60 + (exSec ?? 0) })} />분
                <input type="number" className="select" min={0} max={59} value={exSec ?? ''} placeholder="0" data-testid="workout-ex-sec" onChange={(e) => set({ exerciseDurationSeconds: (exMin ?? 0) * 60 + Number(e.target.value || 0) })} />초
              </span>
            </label>
            <NumberInput label="세트" value={draft.sets} onChange={(v) => set({ sets: v })} min={PLAN_LIMITS.sets.min} max={PLAN_LIMITS.sets.max} testId="workout-sets" suffix="세트" />
            <NumberInput label="세트 사이 휴식" value={draft.restDurationSeconds} onChange={(v) => set({ restDurationSeconds: v })} min={0} max={PLAN_LIMITS.rest.max} testId="workout-rest" suffix="초" />
          </div>
          {complete && errors.length === 0 && (
            <p style={{ margin: '6px 0' }} data-testid="workout-summary">
              <strong>{describePlan({ exerciseDurationSeconds: draft.exerciseDurationSeconds!, sets: draft.sets!, restDurationSeconds: draft.restDurationSeconds! })}</strong>
              {draft.evidence.length > 0 && draft.source !== 'user_edit' && <span className="technique-row__sub"> · 코치 안내에서 읽은 값: “{draft.evidence.join('”, “')}”</span>}
            </p>
          )}
          {draft.fromLastUsed.length > 0 && (
            <p className="video-status-message" data-testid="workout-last-used" style={{ margin: '4px 0' }}>
              코치 안내에 없던 {draft.fromLastUsed.map((f) => FIELD_LABEL[f]).join('·')}은(는) 지난번에 쓰신 설정입니다. 맞는지 확인해 주세요.
            </p>
          )}
          {missing.length > 0 && (
            <p className="ai-inline-warning" data-testid="workout-missing" style={{ margin: '4px 0' }}>
              코치 안내에 {missing.map((f) => FIELD_LABEL[f]).join('·')}이(가) 정해져 있지 않습니다. 직접 정해 주세요.
            </p>
          )}
          {props.mismatch && <p className="video-status-message">AI가 만든 계획 데이터와 안내 문장이 달라 안내 문장의 숫자를 따랐습니다.</p>}
          {errors.map((e) => (
            <p key={e} className="ai-inline-warning" style={{ margin: '4px 0' }}>
              {e}
            </p>
          ))}
          <div className="modal-actions modal-actions--start">
            <button type="button" className="btn btn-primary" disabled={!complete || errors.length > 0} onClick={props.onStart} data-testid="workout-start">
              ▶ 타이머 시작
            </button>
            {props.manualAllowed && (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => props.onManualDone(true)} data-testid="oneoff-practice-done">
                  타이머 없이 연습 완료
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => props.onManualDone(false)}>
                  못 했어요
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {run && (
        <div className="workout-timer text-center" data-testid="workout-timer">
          <div className="workout-timer__phase" data-testid="workout-phase">
            {run.phase === 'done' ? (run.endedEarly ? '종료' : '완료') : run.paused ? '일시정지' : run.phase === 'work' ? '운동 중' : '휴식 중'}
            {run.phase !== 'done' && (
              <span data-testid="workout-set">
                {' '}
                · {run.set}/{run.plan.sets}세트
              </span>
            )}
          </div>
          {run.phase !== 'done' && (
            <div className={`timer-display${run.phase === 'rest' ? ' timer-display--rest' : ''}`} data-testid="workout-remaining">
              {mmss(remainingMs(run, now))}
            </div>
          )}
          {running && (
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              {run.paused ? (
                <button type="button" className="btn btn-primary" onClick={props.onResume} data-testid="workout-resume">
                  ▶ 재개
                </button>
              ) : (
                <button type="button" className="btn btn-secondary" onClick={props.onPause} data-testid="workout-pause">
                  ⏸ 일시정지
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={props.onStop} data-testid="workout-stop">
                ■ 종료
              </button>
            </div>
          )}
          {running && <p className="video-status-message">실제 운동 시간 {formatDuration(Math.round(workedMs(run, now) / 1000))} · 계획 {describePlan(run.plan)}</p>}
          {run.phase === 'done' && props.result && (
            <div data-testid="workout-result">
              <p style={{ margin: '4px 0' }}>
                <strong>
                  {props.result.completedSets}/{props.result.plannedSets}세트 완료
                </strong>{' '}
                · 실제 운동 시간 {formatDuration(props.result.workedSeconds)}
                {props.result.endedEarly ? ' · 중간에 종료' : ''}
              </p>
            </div>
          )}
        </div>
      )}

      <label className="workout-cheer">
        <span className="field-label">운동 중 응원</span>
        <select className="select" value={props.cheer} onChange={(e) => props.onCheer(e.target.value as CheerLevel)} data-testid="workout-cheer">
          {(Object.keys(CHEER_LABEL) as CheerLevel[]).map((c) => (
            <option key={c} value={c}>
              {CHEER_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
