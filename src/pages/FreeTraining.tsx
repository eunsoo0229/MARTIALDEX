import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { martialArtSummaries } from '../lib/loadData';
import { searchAllTechniques, resolveTechniquesByIds } from '../lib/userTechniques/service';
import { getDefaultExerciseConfig } from '../lib/todayTraining/exerciseDefaults';
import type { ExerciseConfig } from '../lib/curriculum/types';
import {
  FREE_TRAINING_DRAFT_EVENT,
  addDraftEntry,
  clearDraft,
  getOrCreateDraft,
  readDraft,
  removeDraftEntry,
  reorderDraftEntries,
  setDraftMartialArt,
  updateDraftEntryConfig,
} from '../lib/freeTraining/draftStore';
import { startFreeTrainingSession } from '../lib/freeTraining/sessionStore';
import { finalizeFreeTrainingSession, clearFreeTrainingSession, undoFreeTrainingFinalize } from '../lib/freeTraining/service';
import { computeFreeTrainingStats, getActiveSetElapsedMs, getRestRemainingMs } from '../lib/freeTraining/sessionDetail';
import { useFreeTraining } from '../lib/freeTraining/useFreeTraining';
import type { FreeTrainingDraft, FreeTrainingSessionState } from '../lib/freeTraining/types';
import { createCombo, validateCombo } from '../lib/combo/service';
import { formatLastSessionSets } from '../lib/gymTraining/records';
import { getTrainingHistoryEntry } from '../lib/trainingHistory/service';
import { estimateSessionCalories } from '../lib/nutrition/trainingEnergy';
import { getNutritionProfileWithPrefill } from '../lib/nutrition/profileService';
import { formatKcal } from '../lib/nutrition/calc';
import DifficultyBadge from '../components/DifficultyBadge';
import RelatedVideos from '../components/RelatedVideos';
import GymSetInput, { computeCarryForwardTarget } from '../components/GymSetInput';
import GymExercisePicker from '../components/GymExercisePicker';
import NumberField from '../components/NumberField';
import EmptyState from '../components/EmptyState';
import LoginToBackupBanner from '../components/auth/LoginToBackupBanner';
import BackButton from '../components/BackButton';

function formatMMSS(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(totalMs / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Same fix as SearchBar.tsx: searchAllTechniques over the ~1,310-technique
// corpus (Fuse fuzzy pass) measured at 40-220ms per call — unmemoized and
// re-run on every keystroke used to block the render that shows the typed
// character. Debouncing the value that actually drives the search (not the
// input's own displayed value) fixes that without changing which results show.
function TechniquePicker({ martialArt, onPick }: { martialArt: string; onPick: (techniqueId: string, config: ExerciseConfig) => void }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 150);
    return () => window.clearTimeout(timer);
  }, [query]);
  const results = useMemo(
    () => (debouncedQuery.trim() ? searchAllTechniques(debouncedQuery, 8, { martialArt }) : []),
    [debouncedQuery, martialArt]
  );

  return (
    <div className="technique-picker">
      <input
        className="select"
        style={{ width: '100%' }}
        placeholder="기술 이름으로 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.length > 0 && (
        <div className="technique-picker__results">
          {results.map((t) => (
            <div
              key={t.id}
              className="search-result-row"
              onClick={() => {
                onPick(t.id, getDefaultExerciseConfig(t));
                setQuery('');
              }}
            >
              <div>
                <div className="search-result-row__name">
                  {t.name}
                  {t.koreanName && t.koreanName !== t.name ? ` · ${t.koreanName}` : ''}
                </div>
                <div className="search-result-row__meta">{t.category}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfigEditor({ config, onChange }: { config: ExerciseConfig; onChange: (config: ExerciseConfig) => void }) {
  return (
    <div className="chip-row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <select
        className="select"
        value={config.mode}
        onChange={(e) => {
          const mode = e.target.value as ExerciseConfig['mode'];
          onChange(mode === 'reps' ? { ...config, mode, targetReps: config.targetReps ?? 15, targetSeconds: null } : { ...config, mode, targetSeconds: config.targetSeconds ?? 60, targetReps: null });
        }}
      >
        <option value="reps">횟수</option>
        <option value="time">시간</option>
      </select>
      {config.mode === 'reps' ? (
        <label className="field-label">
          목표 횟수
          <NumberField
            className="select"
            style={{ width: 70, marginLeft: 4 }}
            min={1}
            value={config.targetReps ?? 0}
            onCommit={(n) => onChange({ ...config, targetReps: n ?? config.targetReps })}
          />
        </label>
      ) : (
        <label className="field-label">
          목표 시간(초)
          <NumberField
            className="select"
            style={{ width: 70, marginLeft: 4 }}
            min={1}
            value={config.targetSeconds ?? 0}
            onCommit={(n) => onChange({ ...config, targetSeconds: n ?? config.targetSeconds })}
          />
        </label>
      )}
      <label className="field-label">
        세트
        <NumberField
          className="select"
          style={{ width: 60, marginLeft: 4 }}
          min={1}
          value={config.sets}
          onCommit={(n) => onChange({ ...config, sets: n ?? config.sets })}
        />
      </label>
      <label className="field-label">
        휴식(초)
        <NumberField
          className="select"
          style={{ width: 60, marginLeft: 4 }}
          min={0}
          value={config.restSeconds}
          onCommit={(n) => onChange({ ...config, restSeconds: n ?? config.restSeconds })}
        />
      </label>
    </div>
  );
}

function FreeTrainingBuilder() {
  const [draft, setDraft] = useState<FreeTrainingDraft>(() => getOrCreateDraft(martialArtSummaries[0]?.id ?? ''));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [gymPickerOpen, setGymPickerOpen] = useState(false);

  useEffect(() => {
    const onUpdate = () => setDraft(readDraft() ?? { martialArt: martialArtSummaries[0]?.id ?? '', entries: [] });
    window.addEventListener(FREE_TRAINING_DRAFT_EVENT, onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener(FREE_TRAINING_DRAFT_EVENT, onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, []);

  const techniques = resolveTechniquesByIds(draft.entries.map((e) => e.techniqueId));
  const entryByTechniqueId = new Map(draft.entries.map((e) => [e.techniqueId, e]));

  function handleStart() {
    if (draft.entries.length === 0) {
      setStartError('훈련할 기술을 1개 이상 추가해주세요.');
      return;
    }
    const session = startFreeTrainingSession(draft);
    if (!session) {
      setStartError('추가한 기술을 찾을 수 없습니다. 다시 추가해주세요.');
      return;
    }
    setStartError(null);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>자유훈련</span>
        </div>
        <div className="section-title">
          <h2>🥋 자유훈련</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          AI 커리큘럼 없이 원하는 기술을 직접 골라 순서와 훈련량을 정해 훈련합니다.
        </p>
        <LoginToBackupBanner featureName="훈련 기록" />

        <div className="chip-row" style={{ marginBottom: 12 }}>
          <span className="chip active">일반 훈련</span>
          <Link to="/free-training/sparring" className="chip">
            🤼 스파링 기록
          </Link>
        </div>

        <div className="card info-card">
          <label className="field-label">무술</label>
          <select
            className="select"
            style={{ width: '100%', marginBottom: 12 }}
            value={draft.martialArt}
            onChange={(e) => setDraft(setDraftMartialArt(e.target.value))}
          >
            {martialArtSummaries.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nameKo}
              </option>
            ))}
          </select>
          <TechniquePicker martialArt={draft.martialArt} onPick={(techniqueId, config) => setDraft(addDraftEntry({ techniqueId, config }))} />
        </div>

        <div className="card info-card">
          <h3>🏋️ 헬스 운동 추가</h3>
          <p className="video-status-message">
            무술 기술과 별개로, 벤치프레스/스쿼트 같은 헬스 운동도 같은 자유훈련 세션에 추가할 수 있습니다. 위에서 고른 무술과 무관하게 추가됩니다.
          </p>
          <div className="modal-actions modal-actions--start" style={{ marginBottom: gymPickerOpen ? 10 : 0 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setGymPickerOpen(!gymPickerOpen)}>
              {gymPickerOpen ? '헬스 운동 선택기 닫기' : '+ 헬스 운동 선택'}
            </button>
          </div>
          {gymPickerOpen && (
            <GymExercisePicker
              excludeIds={draft.entries.map((e) => e.techniqueId)}
              onSelect={(technique) => {
                setDraft(addDraftEntry({ techniqueId: technique.id, config: getDefaultExerciseConfig(technique) }));
                setGymPickerOpen(false);
              }}
            />
          )}
        </div>

        <div className="card info-card">
          <h3>오늘의 자유훈련</h3>
          <p className="video-status-message">기술을 드래그하거나 ◀ ▶ 버튼으로 순서를 바꿀 수 있습니다. 기술을 클릭하면 상세 정보를 볼 수 있습니다.</p>
          {techniques.length === 0 ? (
            <p className="video-status-message">아직 추가된 기술이 없습니다.</p>
          ) : (
            <div className="stack gap-2">
              {techniques.map((t, i) => {
                const entry = entryByTechniqueId.get(t.id)!;
                return (
                  <div
                    key={t.id}
                    className="card info-card"
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== null) setDraft(reorderDraftEntries(dragIndex, i) ?? draft);
                      setDragIndex(null);
                    }}
                    style={{ cursor: 'grab' }}
                  >
                    <div className="technique-row__main" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Link to={`/arts/${t.martialArt}/techniques/${t.id}`} className="technique-row__name">
                        {i + 1}. {t.name}
                        {t.koreanName && t.koreanName !== t.name ? ` · ${t.koreanName}` : ''}
                      </Link>
                      <div>
                        <button
                          aria-label="위로 이동"
                          disabled={i === 0}
                          className="btn btn-ghost btn-sm"
                          onClick={() => setDraft(reorderDraftEntries(i, i - 1) ?? draft)}
                        >
                          ◀
                        </button>
                        <button
                          aria-label="아래로 이동"
                          disabled={i === techniques.length - 1}
                          className="btn btn-ghost btn-sm"
                          onClick={() => setDraft(reorderDraftEntries(i, i + 1) ?? draft)}
                        >
                          ▶
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setDraft(removeDraftEntry(t.id) ?? draft)}>
                          × 삭제
                        </button>
                      </div>
                    </div>
                    <ConfigEditor config={entry.config} onChange={(config) => setDraft(updateDraftEntryConfig(t.id, config) ?? draft)} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {startError && (
          <div className="card info-card">
            <p className="video-status-message">{startError}</p>
          </div>
        )}

        <div className="modal-actions modal-actions--start">
          <button className="btn btn-primary" onClick={handleStart}>
            훈련 시작
          </button>
          {draft.entries.length > 0 && (
            <button className="btn btn-ghost" onClick={() => setDraft({ martialArt: draft.martialArt, entries: [] })}>
              전체 비우기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FreeTrainingCompletedScreen({ session }: { session: FreeTrainingSessionState }) {
  const navigate = useNavigate();
  // Read straight off the persisted session (set by finalizeFreeTrainingSession)
  // rather than component state passed down from the parent — state doesn't
  // survive this screen unmounting/remounting (e.g. navigating away to check
  // 훈련 기록 and back), but the session in localStorage does.
  const entryId = session.finalizedEntryId ?? null;
  const stats = computeFreeTrainingStats(session.detail);
  const totalMinutes = Math.max(1, Math.round((new Date(session.finishedAt!).getTime() - new Date(session.startedAt).getTime()) / 60000));
  const techniques = resolveTechniquesByIds(session.detail.exercises.map((e) => e.techniqueId));

  // "훈련-칼로리 소비 연동" (item 9) — same read-only MET-based lookup as
  // TodayTraining.tsx's completion screen.
  const finalizedEntry = entryId ? getTrainingHistoryEntry(entryId) : undefined;
  const estimatedBurnKcal = finalizedEntry ? estimateSessionCalories(finalizedEntry, getNutritionProfileWithPrefill().bodyWeightKg) : null;

  // Reuses the exact same createCombo()/validateCombo() the manual Combo
  // Book editor (ComboBuilder.tsx) already uses — no separate save path, no
  // new storage. The order performed in this free-training session becomes
  // the combo's techniqueIds order, unchanged.
  const [comboName, setComboName] = useState('');
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [savedComboId, setSavedComboId] = useState<string | null>(null);

  function handleSaveAsCombo() {
    const techniqueIds = session.detail.exercises.map((e) => e.techniqueId);
    const validation = validateCombo(comboName, techniqueIds);
    if (!validation.ok) {
      setSaveErrors(validation.errors);
      return;
    }
    setSaveErrors([]);
    const combo = createCombo({ name: comboName, description: '자유훈련에서 수행한 순서로 저장된 콤보입니다.', techniqueIds });
    setSavedComboId(combo.id);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>자유훈련</span>
        </div>
        <div className="section-title">
          <h2>🎉 자유훈련 완료</h2>
        </div>
        <div className="curriculum-stat-row">
          <div>
            <strong>{stats.exerciseCount}개</strong>
            <span>수행 기술</span>
          </div>
          <div>
            <strong>
              {stats.completedSets}/{stats.totalSets}세트
            </strong>
            <span>완료율</span>
          </div>
          {stats.totalReps > 0 && (
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
        {estimatedBurnKcal != null && (
          <p className="video-status-message">
            🔥 이번 훈련 예상 소모량: 약 {formatKcal(estimatedBurnKcal)} (체중 기반 추정치 — <Link to="/nutrition">영양 화면에서 확인 →</Link>)
          </p>
        )}
        <div className="modal-actions modal-actions--start">
          <button
            className="btn btn-primary"
            onClick={() => {
              clearFreeTrainingSession();
              clearDraft();
            }}
          >
            새 자유훈련 시작
          </button>
          <Link to="/training-analytics/history" className="btn btn-secondary">
            훈련 기록 보기
          </Link>
          {entryId && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                if (window.confirm('방금 완료한 훈련을 취소할까요? 훈련 기록/볼륨/통계에서 완전히 제거되며 되돌릴 수 없습니다.')) {
                  undoFreeTrainingFinalize(entryId);
                }
              }}
            >
              훈련 취소
            </button>
          )}
        </div>

        {techniques.length >= 2 && (
          <div className="card info-card">
            <h3>🔗 콤보로 저장</h3>
            <p className="video-status-message">
              방금 수행한 기술 순서({techniques.map((t) => t.name).join(' → ')})를 그대로 콤보 북에 저장합니다.
            </p>
            {savedComboId ? (
              <p className="video-status-message">
                저장했습니다. <Link to={`/combos/${savedComboId}/edit`}>콤보 북에서 열기</Link> ·{' '}
                <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/combos/${savedComboId}/train`)}>
                  바로 훈련하기
                </button>
              </p>
            ) : (
              <>
                <input
                  className="select"
                  style={{ width: '100%', marginBottom: 8 }}
                  placeholder="콤보 이름 (예: 원투 태클)"
                  value={comboName}
                  onChange={(e) => setComboName(e.target.value)}
                />
                <div className="modal-actions modal-actions--start">
                  <button className="btn btn-secondary" onClick={handleSaveAsCombo}>
                    콤보로 저장
                  </button>
                </div>
                {saveErrors.map((e) => (
                  <p key={e} className="video-status-message">
                    {e}
                  </p>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FreeTraining() {
  const {
    session,
    detail,
    isFullyComplete,
    recordSet,
    startSetTimer,
    cancelSetTimer,
    nextExercise,
    setNote,
    setNotes,
    pauseRest,
    resumeRest,
    skipRest,
    pauseSession,
    resumeSession,
  } = useFreeTraining();

  useEffect(() => {
    if (session && isFullyComplete && !session.finishedAt) {
      const totalMinutes = Math.max(1, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60000));
      finalizeFreeTrainingSession(session, totalMinutes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.detail.exercises.map((e) => e.finishedAt).join(','), session?.finishedAt]);

  if (!session) return <FreeTrainingBuilder />;

  if (session.finishedAt) {
    return <FreeTrainingCompletedScreen session={session} />;
  }

  if (!detail) return <EmptyState icon="🥋" text="자유훈련 정보를 불러오는 중입니다." />;

  const exercise = detail.exercises[detail.currentExerciseIndex];
  if (!exercise) return <EmptyState icon="🥋" text="자유훈련 정보를 불러오지 못했습니다." />;
  const technique = resolveTechniquesByIds([exercise.techniqueId])[0];
  const activeSetIndex = exercise.sets.findIndex((s) => !s.completed);
  const restTimer = detail.restTimer && detail.restTimer.exerciseIndex === detail.currentExerciseIndex ? detail.restTimer : null;
  const restRemainingMs = restTimer ? getRestRemainingMs(restTimer) : 0;
  const restExpired = !!restTimer && restTimer.pausedRemainingMs === null && restRemainingMs <= 0;
  // Carries the last completed set's actual weight/reps forward as the
  // default for the next set, instead of always re-prefilling from the
  // exercise's original config (see GymSetInput.tsx's computeCarryForwardTarget).
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
          <span>자유훈련</span>
        </div>
        <div className="chip-row">
          <span className="chip active">
            {detail.currentExerciseIndex + 1}/{detail.exercises.length}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => (detail.paused ? resumeSession() : pauseSession())} style={{ marginLeft: 'auto' }}>
            {detail.paused ? '▶ 재개' : '⏸ 일시정지'}
          </button>
        </div>

        <div className="card info-card">
          <label className="field-label">이번 자유훈련 메모 (선택)</label>
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
                  <h1>자유훈련 · {technique.name}</h1>
                  {technique.koreanName && technique.koreanName !== technique.name && (
                    <div className="detail-hero__korean">{technique.koreanName}</div>
                  )}
                  <DifficultyBadge difficulty={technique.difficulty} />
                </div>
              </div>
            )}

            {restTimer ? (
              <div className="card info-card" style={{ textAlign: 'center', borderColor: 'var(--accent, #e53e3e)' }}>
                <h3>SET {restTimer.setIndex + 1} 완료 · 휴식</h3>
                <div style={{ fontSize: '2.6rem', fontWeight: 800, margin: '10px 0' }}>
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
                    comparison={{ techniqueId: exercise.techniqueId, setIndex: activeSetIndex, completedSets: exercise.sets.filter((s) => s.completed).map((s) => ({ loadKg: s.calculatedWeightKg ?? s.weightKg ?? null, reps: s.actualReps })) }}
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
                  {technique?.name ?? exercise.techniqueId} · {exercise.config.sets}세트 완료
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
              </div>
            )}

            {technique && <RelatedVideos technique={technique} liveSearchFallback />}
          </>
        )}
      </div>
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
        <button className="btn btn-primary set-complete-btn" disabled={value.trim() === ''} onClick={() => onComplete(Math.max(0, Number(value) || 0))}>
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
          <div style={{ fontSize: '2rem', fontWeight: 800, margin: '8px 0' }}>
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
