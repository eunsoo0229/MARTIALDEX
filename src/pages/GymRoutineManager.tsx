import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GymRoutine, Weekday } from '../lib/gymRoutine/types';
import {
  addExerciseToDay,
  createGymRoutine,
  deleteGymRoutine,
  listMyGymRoutines,
  removeExerciseFromDay,
  reorderExercise,
  setActiveGymRoutine,
  setAllSetsReps,
  setAllSetsWeight,
  setSetReps,
  setSetWeight,
  updateExerciseTarget,
} from '../lib/gymRoutine/service';
import { resolveTechnique } from '../lib/userTechniques/service';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';
import GymExercisePicker from '../components/GymExercisePicker';
import NumberField from '../components/NumberField';

const WEEKDAYS: { value: Weekday; label: string }[] = [
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
  { value: 7, label: '일' },
];

export default function GymRoutineManager() {
  const [routines, setRoutines] = useState<GymRoutine[]>(() => listMyGymRoutines());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeWeekday, setActiveWeekday] = useState<Weekday>(1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    const onUpdate = () => setRoutines(listMyGymRoutines());
    window.addEventListener('martialdex:gym-routines-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener('martialdex:gym-routines-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, []);

  const selected = routines.find((r) => r.id === selectedId) ?? null;

  function handleCreate() {
    const routine = createGymRoutine(newName || '새 루틴');
    setNewName('');
    setSelectedId(routine.id);
  }

  function handleDelete(id: string) {
    if (!window.confirm('이 루틴을 삭제할까요? 되돌릴 수 없습니다.')) return;
    deleteGymRoutine(id);
    if (selectedId === id) setSelectedId(null);
  }

  const day = selected?.days.find((d) => d.weekday === activeWeekday);

  return (
    <div className="page">
      <div className="container">
        <BackButton fallback="/training" />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/training">훈련</Link>
          <span>/</span>
          <span>요일별 루틴</span>
        </div>
        <div className="section-title">
          <h2>📅 요일별 웨이트 루틴</h2>
          <Link to="/training/routines/manage" className="see-all">
            루틴 관리 →
          </Link>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          활성화된 루틴 1개가 매일 "오늘의 훈련"에 자동으로 반영됩니다.
        </p>

        <div className="card info-card">
          <label className="field-label">새 루틴 이름</label>
          <div className="chip-row">
            <input
              className="select"
              style={{ flex: 1, minWidth: 160 }}
              type="text"
              placeholder="예: 5분할 루틴"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" onClick={handleCreate}>
              + 루틴 만들기
            </button>
          </div>
        </div>

        {routines.length === 0 ? (
          <EmptyState icon="📅" text="아직 만든 루틴이 없습니다." />
        ) : (
          <div className="stack gap-2">
            {routines.map((r) => (
              <div key={r.id} className="card info-card">
                <div className="chip-row">
                  <button
                    type="button"
                    style={{ fontWeight: 700, fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                    onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
                  >
                    {r.name}
                  </button>
                  {r.active && <span className="chip active">활성</span>}
                </div>
                <div className="technique-row__sub">
                  {r.days.reduce((sum, d) => sum + d.exercises.length, 0)}개 운동 · {r.days.length}일 구성
                </div>
                <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                  {!r.active && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setActiveGymRoutine(r.id)}>
                      활성화
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}>
                    {r.id === selectedId ? '편집 닫기' : '편집'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(r.id)}>
                    삭제
                  </button>
                </div>

                {r.id === selectedId && selected && (
                  <div style={{ marginTop: 12 }}>
                    <div className="chip-row">
                      {WEEKDAYS.map((w) => (
                        <button
                          key={w.value}
                          type="button"
                          className={`chip${activeWeekday === w.value ? ' active' : ''}`}
                          onClick={() => setActiveWeekday(w.value)}
                        >
                          {w.label}요일 ({selected.days.find((d) => d.weekday === w.value)?.exercises.length ?? 0})
                        </button>
                      ))}
                    </div>

                    {(!day || day.exercises.length === 0) && <p className="video-status-message">이 요일은 휴식일입니다.</p>}

                    {day && day.exercises.length > 0 && (
                      <div className="stack gap-2">
                        {day.exercises.map((ex, idx) => {
                          const technique = resolveTechnique(ex.techniqueId);
                          return (
                            <div key={`${ex.techniqueId}-${idx}`} className="technique-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                              <div className="technique-row__main">
                                <div className="technique-row__name">{technique?.name ?? ex.techniqueId}</div>
                              </div>
                              <div className="chip-row" style={{ alignItems: 'center', flexWrap: 'wrap', marginTop: 4, gap: 10 }}>
                                <label className="field-label">
                                  세트
                                  <NumberField
                                    className="select gym-num-input"
                                    min={1}
                                    value={ex.targetSets}
                                    onCommit={(n) => updateExerciseTarget(r, activeWeekday, idx, { targetSets: n ?? ex.targetSets })}
                                  />
                                </label>
                                {ex.targetSeconds != null ? (
                                  <label className="field-label">
                                    시간(초)
                                    <NumberField
                                      className="select gym-num-input"
                                      min={1}
                                      value={ex.targetSeconds}
                                      onCommit={(n) => updateExerciseTarget(r, activeWeekday, idx, { targetSeconds: n ?? ex.targetSeconds })}
                                    />
                                  </label>
                                ) : (
                                  <>
                                    {ex.targetReps.map((reps, setIdx) => (
                                      <label key={setIdx} className="field-label">
                                        {setIdx + 1}세트 횟수
                                        <NumberField
                                          className="select gym-num-input"
                                          min={1}
                                          value={reps}
                                          onCommit={(n) => setSetReps(r, activeWeekday, idx, setIdx, n)}
                                        />
                                      </label>
                                    ))}
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm"
                                      onClick={() => setAllSetsReps(r, activeWeekday, idx, ex.targetReps[0] ?? 10)}
                                    >
                                      모든 세트 동일하게
                                    </button>
                                  </>
                                )}
                                {technique?.gymWeightCalcType !== 'bodyweight' && (
                                  <>
                                    {ex.targetWeightKg.map((weight, setIdx) => (
                                      <label key={setIdx} className="field-label">
                                        {setIdx + 1}세트{' '}
                                        {technique?.gymWeightCalcType === 'dumbbell'
                                          ? '한쪽 무게(kg)'
                                          : technique?.gymWeightCalcType === 'assisted_machine'
                                            ? '보조 무게(kg)'
                                            : '중량(kg)'}
                                        <NumberField
                                          className="select gym-num-input gym-num-input--wide"
                                          min={0}
                                          step="0.5"
                                          placeholder="선택"
                                          allowEmpty
                                          value={weight}
                                          onCommit={(n) => setSetWeight(r, activeWeekday, idx, setIdx, n)}
                                        />
                                      </label>
                                    ))}
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm"
                                      onClick={() => setAllSetsWeight(r, activeWeekday, idx, ex.targetWeightKg[0] ?? null)}
                                    >
                                      모든 세트 동일하게
                                    </button>
                                  </>
                                )}
                                <label className="field-label">
                                  휴식(초)
                                  <NumberField
                                    className="select gym-num-input"
                                    min={0}
                                    value={ex.restSeconds}
                                    onCommit={(n) => updateExerciseTarget(r, activeWeekday, idx, { restSeconds: n ?? ex.restSeconds })}
                                  />
                                </label>
                              </div>
                              <div className="modal-actions" style={{ gap: 4, justifyContent: 'flex-start', marginTop: 2 }}>
                                <button
                                  className="icon-action-btn"
                                  aria-label="위로 이동"
                                  disabled={idx === 0}
                                  onClick={() => reorderExercise(r, activeWeekday, idx, idx - 1)}
                                >
                                  ▲
                                </button>
                                <button
                                  className="icon-action-btn"
                                  aria-label="아래로 이동"
                                  disabled={idx === day.exercises.length - 1}
                                  onClick={() => reorderExercise(r, activeWeekday, idx, idx + 1)}
                                >
                                  ▼
                                </button>
                                <button className="icon-action-btn" aria-label="삭제" onClick={() => removeExerciseFromDay(r, activeWeekday, idx)}>
                                  ✕
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="modal-actions modal-actions--start" style={{ marginTop: 10 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setPickerOpen(!pickerOpen)}>
                        {pickerOpen ? '운동 추가 닫기' : '+ 운동 추가'}
                      </button>
                    </div>

                    {pickerOpen && (
                      <div className="card info-card" style={{ marginTop: 8 }}>
                        <GymExercisePicker
                          excludeIds={day?.exercises.map((e) => e.techniqueId) ?? []}
                          onSelect={(technique) => {
                            const isTimeBased = technique.recommendedDurationSeconds != null;
                            const targetSets = technique.recommendedSets ?? 3;
                            addExerciseToDay(selected, activeWeekday, {
                              techniqueId: technique.id,
                              targetSets,
                              targetReps: isTimeBased ? Array(targetSets).fill(null) : Array(targetSets).fill(technique.recommendedReps ?? 10),
                              targetSeconds: isTimeBased ? technique.recommendedDurationSeconds ?? 30 : null,
                              targetWeightKg: Array(targetSets).fill(null),
                              restSeconds: technique.recommendedRestSeconds ?? 90,
                            });
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
