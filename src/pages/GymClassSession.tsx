import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthProvider';
import { getSessionWithClass, submitAttendance } from '../lib/gymClass/service';
import type { GymClass, GymClassSession as GymClassSessionData } from '../lib/gymClass/types';
import { resolveTechniquesByIds } from '../lib/userTechniques/service';
import { formatLastSessionSets } from '../lib/gymTraining/records';
import type { TrainingExerciseDetail } from '../lib/trainingHistory/types';
import type { Technique } from '../types';
import GymSetInput from '../components/GymSetInput';
import BackButton from '../components/BackButton';
import EmptyState from '../components/EmptyState';

interface RunnerSet {
  completed: boolean;
  actualReps: number | null;
  actualSeconds: number | null;
  weightKg: number | null;
  calculatedWeightKg: number | null;
  rpe: number | null;
}

interface RunnerExercise {
  technique: Technique;
  mode: 'reps' | 'time';
  sets: RunnerSet[];
  targetReps: number | null;
  targetSeconds: number | null;
  targetWeightKg: number | null;
}

// A deliberately simpler session runner than TodayTraining/FreeTraining's
// full engine (no rest-timer countdown UI, no pause/resume) — the class's
// plan is fixed by the instructor so there is no exercise-picker step
// either. It still produces the EXACT same TrainingExerciseDetail[] shape
// (reusing GymSetInput for weighted exercises) so the resulting
// recordTrainingSession() call feeds every derived system identically to
// any other training source.
export default function GymClassSession() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [session, setSession] = useState<GymClassSessionData | null>(null);
  const [gymClass, setGymClass] = useState<GymClass | null>(null);
  const [gymName, setGymName] = useState('');
  const [exercises, setExercises] = useState<RunnerExercise[]>([]);
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [startedAt] = useState(() => new Date().toISOString());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const result = await getSessionWithClass(sessionId);
      if (!result.ok || !result.data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const { session: s, gymClass: c, gymName: g } = result.data;
      setSession(s);
      setGymClass(c);
      setGymName(g);
      const techniques = resolveTechniquesByIds(c.plan.techniqueIds);
      setExercises(
        techniques.map((technique) => {
          const config = c.plan.exerciseConfig[technique.id];
          const mode = config?.mode ?? 'reps';
          const sets = config?.sets ?? 3;
          return {
            technique,
            mode,
            targetReps: config?.targetReps ?? null,
            targetSeconds: config?.targetSeconds ?? null,
            targetWeightKg: config?.targetWeightKg ?? null,
            sets: Array.from({ length: sets }, () => ({
              completed: false,
              actualReps: null,
              actualSeconds: null,
              weightKg: null,
              calculatedWeightKg: null,
              rpe: null,
            })),
          };
        })
      );
      setLoading(false);
    })();
  }, [sessionId]);

  const exercise = exercises[exerciseIndex];
  const activeSetIndex = useMemo(() => exercise?.sets.findIndex((s) => !s.completed) ?? -1, [exercise]);
  const exerciseFinished = exercise ? activeSetIndex === -1 : false;
  const allFinished = exercises.length > 0 && exercises.every((ex) => ex.sets.every((s) => s.completed));

  function recordSet(result: { actualReps?: number; actualSeconds?: number; weightKg?: number; calculatedWeightKg?: number; rpe?: number | null }) {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exerciseIndex) return ex;
        const sets = ex.sets.map((s, j) =>
          j === activeSetIndex
            ? {
                completed: true,
                actualReps: result.actualReps ?? s.actualReps,
                actualSeconds: result.actualSeconds ?? s.actualSeconds,
                weightKg: result.weightKg ?? s.weightKg,
                calculatedWeightKg: result.calculatedWeightKg ?? s.weightKg ?? s.calculatedWeightKg,
                rpe: result.rpe ?? s.rpe,
              }
            : s
        );
        return { ...ex, sets };
      })
    );
  }

  async function handleFinishClass() {
    if (!user || !session || !gymClass) return;
    setSubmitting(true);
    setError(null);
    const finishedAt = new Date();
    const startedDate = new Date(startedAt);
    const actualMinutes = Math.max(1, Math.round((finishedAt.getTime() - startedDate.getTime()) / 60000));
    const estimatedMinutes = exercises.length * 8;

    const exerciseDetails: TrainingExerciseDetail[] = exercises.map((ex) => ({
      techniqueId: ex.technique.id,
      mode: ex.mode,
      sets: ex.sets.length,
      targetReps: ex.targetReps,
      targetSeconds: ex.targetSeconds,
      actualReps: ex.sets.map((s) => s.actualReps),
      actualSeconds: ex.sets.map((s) => s.actualSeconds),
      restSeconds: 60,
      startedAt,
      finishedAt: finishedAt.toISOString(),
      actualWeightKg: ex.sets.map((s) => s.weightKg),
      actualCalculatedWeightKg: ex.sets.map((s) => s.calculatedWeightKg),
      actualRpe: ex.sets.map((s) => s.rpe),
    }));

    const result = await submitAttendance(
      session,
      { gymName, classTitle: gymClass.title },
      gymClass.plan.techniqueIds,
      exerciseDetails,
      estimatedMinutes,
      actualMinutes,
      user.id
    );
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDone(true);
  }

  if (loading) return null;
  if (notFound || !session || !gymClass) {
    return (
      <div className="page">
        <div className="container">
          <BackButton fallback="/gym" />
          <EmptyState icon="🏛" text="수업을 찾을 수 없습니다." />
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="page">
        <div className="container">
          <div className="card info-card" style={{ textAlign: 'center' }}>
            <h2>🎉 수업 완료</h2>
            <p>{gymName} · {gymClass.title}</p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <Link className="btn btn-primary" to="/gym">
                체육관으로
              </Link>
              <Link className="btn btn-secondary" to="/training-analytics/history">
                훈련 기록 보기
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton fallback="/gym" />
        <div className="breadcrumb">
          <Link to="/gym">체육관</Link>
          <span>/</span>
          <span>{gymClass.title}</span>
        </div>
        <div className="section-title">
          <h2>{gymName} · {gymClass.title}</h2>
        </div>

        {exercise && (
          <div className="card info-card">
            <div className="chip-row" style={{ marginBottom: 10 }}>
              <span className="chip active">
                {exerciseIndex + 1} / {exercises.length} · {exercise.technique.name}
              </span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, marginBottom: 12 }}>
              {exercise.sets.map((s, i) => (
                <li key={i}>
                  {s.completed ? '☑' : i === activeSetIndex ? '▶' : '☐'} SET {i + 1}
                  {s.completed && s.weightKg != null && s.actualReps !== null ? ` — ${s.weightKg}kg × ${s.actualReps}회` : ''}
                  {s.completed && s.weightKg == null && s.actualReps !== null ? ` — ${s.actualReps}회` : ''}
                  {s.completed && s.actualSeconds !== null ? ` — ${s.actualSeconds}초` : ''}
                </li>
              ))}
            </ul>

            {!exerciseFinished &&
              (exercise.technique.gymBodyPart && exercise.mode === 'reps' ? (
                <GymSetInput
                  key={`${exercise.technique.id}-${activeSetIndex}`}
                  targetReps={exercise.targetReps}
                  targetWeightKg={exercise.targetWeightKg}
                  weightCalcType={exercise.technique.gymWeightCalcType}
                  previousSetsLabel={formatLastSessionSets(exercise.technique.id)}
                  onComplete={recordSet}
                />
              ) : exercise.mode === 'time' ? (
                <SimpleTimeInput targetSeconds={exercise.targetSeconds ?? 30} onComplete={(actualSeconds) => recordSet({ actualSeconds })} />
              ) : (
                <SimpleRepsInput targetReps={exercise.targetReps ?? 10} onComplete={(actualReps) => recordSet({ actualReps })} />
              ))}

            {exerciseFinished && (
              <div className="modal-actions modal-actions--start">
                {exerciseIndex < exercises.length - 1 ? (
                  <button className="btn btn-primary" onClick={() => setExerciseIndex((i) => i + 1)}>
                    다음 운동
                  </button>
                ) : (
                  <p className="video-status-message">모든 운동을 완료했습니다.</p>
                )}
              </div>
            )}
          </div>
        )}

        {error && <p className="video-status-message" style={{ color: 'var(--accent, #e53e3e)' }}>{error}</p>}

        <div className="modal-actions modal-actions--start">
          <button className="btn btn-primary" disabled={!allFinished || submitting} onClick={handleFinishClass}>
            {submitting ? '저장 중...' : '수업 완료'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SimpleRepsInput({ targetReps, onComplete }: { targetReps: number; onComplete: (reps: number) => void }) {
  const [value, setValue] = useState(String(targetReps));
  return (
    <div className="chip-row" style={{ alignItems: 'center' }}>
      <label className="field-label">
        반복
        <input type="number" className="select gym-num-input" min={0} value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <button className="btn btn-primary set-complete-btn" onClick={() => onComplete(Math.max(0, Number(value) || 0))}>
        세트 완료
      </button>
    </div>
  );
}

function SimpleTimeInput({ targetSeconds, onComplete }: { targetSeconds: number; onComplete: (seconds: number) => void }) {
  const [value, setValue] = useState(String(targetSeconds));
  return (
    <div className="chip-row" style={{ alignItems: 'center' }}>
      <label className="field-label">
        수행 시간(초)
        <input type="number" className="select gym-num-input" min={0} value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <button className="btn btn-primary set-complete-btn" onClick={() => onComplete(Math.max(0, Number(value) || 0))}>
        세트 완료
      </button>
    </div>
  );
}
