import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Technique } from '../types';
import { getCurriculum } from '../lib/curriculum/curriculumService';
import { resolveTechniquesByIds as getTechniquesByIds } from '../lib/userTechniques/service';

const CIRCLED_NUMBERS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
import { useTodayTraining } from '../lib/todayTraining/useTodayTraining';
import { useTrainingSessionDetail } from '../lib/todayTraining/useTrainingSessionDetail';
import { computeSessionActuals, computeSessionStats, getActiveSetElapsedMs, getRestRemainingMs } from '../lib/todayTraining/sessionDetail';
import { isPoseAnalysisSupported } from '../lib/poseAnalysis/poseAnalysisConfig';
import { formatLastSessionSets } from '../lib/gymTraining/records';
import { applyActualsToExercise, getGymRoutine } from '../lib/gymRoutine/service';
import { getTrainingHistoryEntry } from '../lib/trainingHistory/service';
import { estimateSessionCalories } from '../lib/nutrition/trainingEnergy';
import { getNutritionProfileWithPrefill } from '../lib/nutrition/profileService';
import { formatKcal } from '../lib/nutrition/calc';
import DifficultyBadge from '../components/DifficultyBadge';
import RelatedVideos from '../components/RelatedVideos';
import PoseAnalysisModal from '../components/PoseAnalysisModal';
import GymSetInput, { computeCarryForwardTarget } from '../components/GymSetInput';
import EmptyState from '../components/EmptyState';
import LoginToBackupBanner from '../components/auth/LoginToBackupBanner';
import BackButton from '../components/BackButton';

function formatMMSS(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(totalMs / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function TodayTraining() {
  const { session, plan, start, finish, finishAll, undoFinish, setNotes, isFullyComplete } = useTodayTraining();
  const [poseTechnique, setPoseTechnique] = useState<Technique | null>(null);
  const [actualsApplied, setActualsApplied] = useState(false);

  const curriculum = plan.curriculumId ? getCurriculum(plan.curriculumId) : undefined;
  const { detail, recordSet, startSetTimer, cancelSetTimer, nextExercise, setNote, pauseRest, resumeRest, skipRest, pauseSession, resumeSession } =
    useTrainingSessionDetail(curriculum);

  // 13-5: as soon as every technique in today's session is checked off,
  // finalize once — writes the trainingHistory entry (including the
  // set/rep/time log from `detail`, when present) and, for a
  // curriculum-backed session, marks that Day complete via the existing
  // curriculumService, exactly like the manual "학습 완료로 표시" button.
  // "훈련 취소" (undoFinish) reads which history entry/prior curriculum-day
  // state to revert straight off the persisted session (session.finalizedEntryId),
  // not component state, so it survives navigating away and back.
  useEffect(() => {
    if (session && isFullyComplete && !session.finishedAt) {
      finish(curriculum);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.completedTechniqueIds.length, session?.finishedAt]);

  if (plan.mode === 'no_data' && !session) {
    return (
      <div className="page">
        <div className="container">
          <BackButton />
          <div className="breadcrumb">
            <Link to="/">홈</Link>
            <span>/</span>
            <span>오늘의 훈련</span>
          </div>
          <EmptyState icon="🥋" text="아직 학습 기록이 없습니다." />
          <div className="modal-actions" style={{ justifyContent: 'center' }}>
            <Link to="/learning" className="btn btn-primary">
              커리큘럼 만들기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    const techniques = getTechniquesByIds(plan.techniqueIds);
    return (
      <div className="page">
        <div className="container">
          <BackButton />
          <div className="breadcrumb">
            <Link to="/">홈</Link>
            <span>/</span>
            <span>오늘의 훈련</span>
          </div>
          <div className="section-title">
            <h2>🔥 오늘의 훈련</h2>
          </div>
          <LoginToBackupBanner featureName="훈련 기록" />
          {plan.curriculumTitle && <p className="detail-hero__korean">{plan.curriculumTitle}</p>}
          <div className="chip-row">
            {plan.day !== null && <span className="chip active">DAY {plan.day}</span>}
            {plan.mode === 'ad_hoc' && <span className="chip">오늘의 추천 학습</span>}
          </div>
          {plan.goal && (
            <div className="card info-card">
              <h3>오늘의 목표</h3>
              <p>{plan.goal}</p>
            </div>
          )}
          <div className="card info-card">
            <h3>학습 기술</h3>
            <ul>
              {techniques.map((t, i) => (
                <li key={t.id}>
                  {CIRCLED_NUMBERS[i] ?? `${i + 1}.`} {t.name}
                  {t.koreanName && t.koreanName !== t.name ? ` (${t.koreanName})` : ''}
                </li>
              ))}
            </ul>
          </div>
          <div className="curriculum-stat-row">
            <div>
              <strong>{plan.estimatedMinutes}분</strong>
              <span>예상 시간</span>
            </div>
            {plan.weaknessNote && (
              <div>
                <strong>{plan.weaknessNote.score}점</strong>
                <span>최근 약점 · {plan.weaknessNote.techniqueName}</span>
              </div>
            )}
          </div>
          <div className="modal-actions modal-actions--start">
            <button className="btn btn-primary" onClick={() => start()}>
              훈련 시작
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isFullyComplete) {
    const stats = detail ? computeSessionStats(detail) : null;
    const totalMinutes = session.finishedAt
      ? Math.max(1, Math.round((new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 60000))
      : session.plan.estimatedMinutes;

    // "실제 수행값을 다음 루틴에 반영" (item 2) — only offered when this
    // session actually came from a gym routine (session.plan.gymRoutineId,
    // set by planner.ts) and at least one of ITS exercises has a completed
    // set. Never touches the routine until the user explicitly confirms.
    const routine = session.plan.gymRoutineId ? getGymRoutine(session.plan.gymRoutineId) : undefined;
    const routineDay = routine?.days.find((d) => d.weekday === session.plan.gymRoutineWeekday);
    const actuals = detail ? computeSessionActuals(detail) : {};
    const applicableExerciseIds = routineDay ? routineDay.exercises.map((e) => e.techniqueId).filter((id) => actuals[id]) : [];

    // "훈련-칼로리 소비 연동" (item 9) — read-only lookup of the just-finalized
    // trainingHistory entry, estimated via the same MET model every other
    // nutrition screen uses. null when body weight is unknown or the entry
    // has no usable duration — never fabricated.
    const finalizedEntry = session.finalizedEntryId ? getTrainingHistoryEntry(session.finalizedEntryId) : undefined;
    const estimatedBurnKcal = finalizedEntry ? estimateSessionCalories(finalizedEntry, getNutritionProfileWithPrefill().bodyWeightKg) : null;

    return (
      <div className="page">
        <div className="container">
          <BackButton />
          <div className="breadcrumb">
            <Link to="/">홈</Link>
            <span>/</span>
            <span>오늘의 훈련</span>
          </div>
          <div className="section-title">
            <h2>🎉 오늘의 훈련 완료</h2>
          </div>
          {session.plan.day !== null && <p className="detail-hero__korean">Day {session.plan.day} · 완료율 100%</p>}
          <div className="curriculum-stat-row">
            <div>
              <strong>{stats ? stats.exerciseCount : session.plan.techniqueIds.length}개</strong>
              <span>완료 운동</span>
            </div>
            {stats && (
              <div>
                <strong>{stats.completedSets}세트</strong>
                <span>완료 세트</span>
              </div>
            )}
            {stats && stats.totalReps > 0 && (
              <div>
                <strong>{stats.totalReps}회</strong>
                <span>총 반복 횟수</span>
              </div>
            )}
            <div>
              <strong>{totalMinutes}분</strong>
              <span>총 훈련 시간</span>
            </div>
          </div>
          <p className="video-status-message">오늘의 훈련을 완료했습니다.</p>
          {estimatedBurnKcal != null && (
            <p className="video-status-message">
              🔥 이번 훈련 예상 소모량: 약 {formatKcal(estimatedBurnKcal)} (체중 기반 추정치 —{' '}
              <Link to="/nutrition">영양 화면에서 확인 →</Link>)
            </p>
          )}

          {routine && applicableExerciseIds.length > 0 && (
            <div className="card info-card">
              <h3>실제 수행값을 다음 루틴에 반영하시겠습니까?</h3>
              {actualsApplied ? (
                <p className="video-status-message">반영되었습니다 — "{routine.name}" 루틴이 오늘 수행값으로 업데이트되었습니다.</p>
              ) : (
                <>
                  <ul>
                    {applicableExerciseIds.map((id) => {
                      const t = getTechniquesByIds([id])[0];
                      const a = actuals[id];
                      return (
                        <li key={id}>
                          {t?.name ?? id}: {a.repsPerSet.map((r) => r ?? '-').join(', ')}회
                          {a.lastWeightKg != null ? ` · 마지막 세트 ${a.lastWeightKg}kg` : ''}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="modal-actions modal-actions--start">
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        for (const id of applicableExerciseIds) {
                          applyActualsToExercise(routine.id, session.plan.gymRoutineWeekday!, id, actuals[id]);
                        }
                        setActualsApplied(true);
                      }}
                    >
                      반영하기
                    </button>
                    <button className="btn btn-ghost" onClick={() => setActualsApplied(true)}>
                      기존 루틴 유지
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="modal-actions modal-actions--start">
            {session.plan.techniqueIds[0] && isPoseAnalysisSupported(session.plan.techniqueIds[0]) && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  const t = getTechniquesByIds([session.plan.techniqueIds[0]])[0];
                  if (t) setPoseTechnique(t);
                }}
              >
                📷 자세 분석하기
              </button>
            )}
            <Link to="/my-skills" className="btn btn-secondary">
              훈련 기록 보기
            </Link>
            {curriculum && (
              <Link to={`/learning/${curriculum.martialArt}/${curriculum.id}`} className="btn btn-ghost">
                커리큘럼으로 돌아가기
              </Link>
            )}
            {session.finalizedEntryId && (
              <button
                className="btn btn-ghost"
                onClick={() => {
                  if (window.confirm('방금 완료한 훈련을 취소할까요? 훈련 기록/볼륨/통계에서 완전히 제거되며 되돌릴 수 없습니다.')) {
                    undoFinish(curriculum);
                  }
                }}
              >
                훈련 취소
              </button>
            )}
          </div>
        </div>
        {poseTechnique && <PoseAnalysisModal technique={poseTechnique} onClose={() => setPoseTechnique(null)} />}
      </div>
    );
  }

  if (!detail) {
    return <EmptyState icon="🥋" text="오늘의 훈련 정보를 불러오는 중입니다." />;
  }

  const exercise = detail.exercises[detail.currentExerciseIndex];
  if (!exercise) {
    // Defensive fallback — shouldn't normally be reached since isFullyComplete covers this.
    return <EmptyState icon="🥋" text="오늘의 훈련 정보를 불러오지 못했습니다." />;
  }
  const technique = getTechniquesByIds([exercise.techniqueId])[0];
  const activeSetIndex = exercise.sets.findIndex((s) => !s.completed);
  const restTimer = detail.restTimer && detail.restTimer.exerciseIndex === detail.currentExerciseIndex ? detail.restTimer : null;
  const restRemainingMs = restTimer ? getRestRemainingMs(restTimer) : 0;
  const restExpired = !!restTimer && restTimer.pausedRemainingMs === null && restRemainingMs <= 0;
  // Lets a user who went heavier/lighter than the routine's planned weight
  // on set 1 have that carry forward as the default for sets 2/3, instead
  // of GymSetInput re-prefilling the original routine target every set.
  const carryForward = computeCarryForwardTarget(exercise.sets, activeSetIndex, {
    targetWeightKg: exercise.config.targetWeightKg ?? null,
    targetReps: exercise.config.targetReps,
    repsPerSet: exercise.config.targetRepsPerSet,
    weightPerSet: exercise.config.targetWeightPerSet,
  });

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>오늘의 훈련</span>
        </div>
        <div className="chip-row">
          {plan.day !== null && <span className="chip active">DAY {plan.day}</span>}
          <span className="chip">
            {detail.currentExerciseIndex + 1}/{detail.exercises.length}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => (detail.paused ? resumeSession() : pauseSession())} style={{ marginLeft: 'auto' }}>
            {detail.paused ? '▶ 재개' : '⏸ 일시정지'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (window.confirm('아직 기록하지 않은 세트/운동은 완료 처리하지 않고, 오늘 훈련 전체를 완료 상태로 종료할까요?')) {
                finishAll(curriculum);
              }
            }}
          >
            오늘 훈련 전체 완료
          </button>
        </div>

        <div className="card info-card">
          <label className="field-label">오늘 훈련 메모 (선택)</label>
          <textarea
            style={{ width: '100%', minHeight: 50 }}
            placeholder="예: 오늘 컨디션 좋음"
            defaultValue={session.sessionNotes ?? ''}
            onBlur={(e) => setNotes(e.target.value)}
          />
        </div>

        {detail.paused ? (
          <div className="card info-card text-center">
            <h3>일시정지됨</h3>
            <p>진행 상황은 그대로 저장되어 있습니다. 준비되면 재개하세요.</p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={resumeSession}>
                ▶ 재개
              </button>
            </div>
          </div>
        ) : (
          <>
            {technique && (
              <div className="detail-hero">
                <div>
                  <h1>오늘의 훈련 · {technique.name}</h1>
                  {technique.koreanName && technique.koreanName !== technique.name && (
                    <div className="detail-hero__korean">{technique.koreanName}</div>
                  )}
                  <DifficultyBadge difficulty={technique.difficulty} />
                </div>
              </div>
            )}

            {restTimer ? (
              <div className="card info-card text-center" style={{ borderColor: 'var(--accent, #e53e3e)' }}>
                <h3>SET {restTimer.setIndex + 1} 완료 · 휴식</h3>
                <div className="timer-display">
                  {restExpired ? '휴식 종료!' : formatMMSS(restRemainingMs)}
                </div>
                <div className="modal-actions" style={{ justifyContent: 'center' }}>
                  {restExpired ? (
                    <button className="btn btn-primary" onClick={skipRest}>
                      다음 세트 시작
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-secondary" onClick={() => (restTimer.pausedRemainingMs !== null ? resumeRest() : pauseRest())}>
                        {restTimer.pausedRemainingMs !== null ? '재개' : '일시정지'}
                      </button>
                      <button className="btn btn-ghost" onClick={skipRest}>
                        건너뛰기
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="card info-card">
                <div className="chip-row" style={{ marginBottom: 10 }}>
                  <span className="chip active">
                    SET {activeSetIndex + 1} / {exercise.config.sets}
                  </span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, marginBottom: 12 }}>
                  {exercise.sets.map((s, i) => (
                    <li key={i}>
                      {s.completed ? '☑' : i === activeSetIndex ? '▶' : '☐'} SET {i + 1}
                      {s.completed && technique?.gymBodyPart && s.weightKg != null && s.actualReps !== null
                        ? ` — ${s.calculatedWeightKg != null && s.calculatedWeightKg !== s.weightKg ? `${s.calculatedWeightKg}kg (${s.weightKg}kg)` : `${s.weightKg}kg`} × ${s.actualReps}회${s.rpe != null ? ` (RPE ${s.rpe})` : ''}`
                        : ''}
                      {s.completed && !technique?.gymBodyPart && exercise.config.mode === 'reps' && s.actualReps !== null ? ` — ${s.actualReps}회` : ''}
                      {s.completed && exercise.config.mode === 'time' && s.actualSeconds !== null ? ` — ${s.actualSeconds}초` : ''}
                    </li>
                  ))}
                </ul>

                {technique?.gymBodyPart && exercise.config.mode === 'reps' ? (
                  <GymSetInput
                    key={`${exercise.techniqueId}-${activeSetIndex}`}
                    targetReps={carryForward.reps}
                    targetWeightKg={carryForward.weightKg}
                    weightCalcType={technique.gymWeightCalcType}
                    previousSetsLabel={formatLastSessionSets(exercise.techniqueId)}
                    onComplete={({ actualReps, weightKg, calculatedWeightKg, rpe }) =>
                      recordSet(detail.currentExerciseIndex, activeSetIndex, { actualReps, weightKg, calculatedWeightKg, rpe })
                    }
                  />
                ) : exercise.config.mode === 'reps' ? (
                  <RepsSetInput
                    key={`${exercise.techniqueId}-${activeSetIndex}`}
                    targetReps={exercise.config.targetReps ?? 0}
                    onComplete={(actualReps) => recordSet(detail.currentExerciseIndex, activeSetIndex, { actualReps })}
                  />
                ) : (
                  <TimeSetInput
                    key={`${exercise.techniqueId}-${activeSetIndex}`}
                    targetSeconds={exercise.config.targetSeconds ?? 0}
                    running={exercise.activeSetStartedAt !== null}
                    elapsedMs={getActiveSetElapsedMs(exercise)}
                    onStart={() => startSetTimer(detail.currentExerciseIndex)}
                    onCancel={() => cancelSetTimer(detail.currentExerciseIndex)}
                    onComplete={(actualSeconds) => recordSet(detail.currentExerciseIndex, activeSetIndex, { actualSeconds })}
                  />
                )}

                <label className="field-label" style={{ marginTop: 10, display: 'block' }}>
                  이 운동 메모 (선택)
                  <textarea
                    style={{ width: '100%', minHeight: 40 }}
                    placeholder="예: 다음에는 45kg 도전"
                    defaultValue={exercise.notes ?? ''}
                    onBlur={(e) => setNote(detail.currentExerciseIndex, e.target.value)}
                  />
                </label>
              </div>
            )}

            {exercise.finishedAt && detail.currentExerciseIndex < detail.exercises.length - 1 && (
              <div className="card info-card">
                <p>
                  {technique?.name ?? exercise.techniqueId} · {exercise.config.sets}세트 중 {exercise.config.sets}세트 완료
                </p>
                <p className="detail-hero__korean">
                  다음: {getTechniquesByIds([detail.exercises[detail.currentExerciseIndex + 1].techniqueId])[0]?.name} ·{' '}
                  {detail.exercises[detail.currentExerciseIndex + 1].config.sets}세트
                </p>
                <div className="modal-actions modal-actions--start">
                  <button className="btn btn-primary" onClick={nextExercise}>
                    다음 훈련
                  </button>
                </div>
              </div>
            )}

            {technique && (
              <div className="modal-actions modal-actions--start">
                <Link to={`/arts/${technique.martialArt}/techniques/${technique.id}`} className="btn btn-secondary">
                  기술 상세 보기
                </Link>
                {isPoseAnalysisSupported(technique.id) && (
                  <button className="btn btn-secondary" onClick={() => setPoseTechnique(technique)}>
                    자세 분석
                  </button>
                )}
              </div>
            )}

            {technique && <RelatedVideos technique={technique} liveSearchFallback />}
          </>
        )}
      </div>
      {poseTechnique && <PoseAnalysisModal technique={poseTechnique} onClose={() => setPoseTechnique(null)} />}
    </div>
  );
}

function RepsSetInput({ targetReps, onComplete }: { targetReps: number; onComplete: (actualReps: number) => void }) {
  const [value, setValue] = useState('');
  return (
    <>
      <p>
        목표 횟수: <strong>{targetReps}</strong>
      </p>
      <div className="chip-row" style={{ alignItems: 'center' }}>
        <label className="field-label">실제 수행</label>
        <input
          type="number"
          className="select"
          style={{ width: 90 }}
          min={0}
          placeholder={String(targetReps)}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          className="btn btn-primary set-complete-btn"
          disabled={value.trim() === ''}
          onClick={() => onComplete(Math.max(0, Number(value) || 0))}
        >
          세트 완료
        </button>
      </div>
    </>
  );
}

function TimeSetInput({
  targetSeconds,
  running,
  elapsedMs,
  onStart,
  onCancel,
  onComplete,
}: {
  targetSeconds: number;
  running: boolean;
  elapsedMs: number;
  onStart: () => void;
  onCancel: () => void;
  onComplete: (actualSeconds: number) => void;
}) {
  const elapsedSeconds = Math.min(targetSeconds, Math.floor(elapsedMs / 1000));
  return (
    <>
      <p>
        목표: <strong>{targetSeconds}초</strong>
      </p>
      {running ? (
        <>
          <div className="timer-display--sm">
            [{formatMMSS(elapsedMs)} / {formatMMSS(targetSeconds * 1000)}]
          </div>
          <div className="modal-actions modal-actions--start">
            <button className="btn btn-ghost" onClick={onCancel}>
              중지
            </button>
            <button className="btn btn-primary set-complete-btn" onClick={() => onComplete(elapsedSeconds)}>
              세트 완료
            </button>
          </div>
        </>
      ) : (
        <div className="modal-actions modal-actions--start">
          <button className="btn btn-primary" onClick={onStart}>
            시작
          </button>
        </div>
      )}
    </>
  );
}
