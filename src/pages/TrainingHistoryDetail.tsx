import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { deleteTrainingHistoryEntry, getTrainingHistoryEntry, updateTrainingHistoryExerciseNotes, updateTrainingHistoryNotes } from '../lib/trainingHistory/service';
import { useTrainingHistory } from '../lib/trainingHistory/useTrainingHistory';
import { getAllRecords } from '../lib/poseAnalysis/recordsService';
import { getMartialArt, martialArtSummaries } from '../lib/loadData';
import { resolveTechnique, resolveTechniquesByIds } from '../lib/userTechniques/service';
import { deriveEntryCurriculumTitle, deriveEntryMartialArt, deriveEntrySetsReps, deriveEntryTechniqueNames } from '../lib/trainingAnalytics/historyView';
import { WEEKDAY_LABEL, dateKeyOf } from '../lib/dateUtil';
import { getSparringSession } from '../lib/sparringSession/service';
import { INTENSITY_LABEL, SPARRING_TYPE_LABEL } from '../lib/sparringSession/types';
import BackButton from '../components/BackButton';

const SOURCE_LABEL: Record<string, string> = {
  curriculum: '커리큘럼 학습',
  coach_today: '오늘의 훈련',
  sparring: '스파링 분석',
  review: '복습',
  combo: '콤보 훈련',
  shadow: '쉐도우 복싱',
  free_training: '자유훈련',
  gym_class: '체육관 수업',
  sparring_session: '스파링',
  // Removed feature — kept only so past entries still show a readable label.
  ground_battle: '그라운드 배틀 (지난 기록)',
  visual_mitt: 'AI Visualizing Mitt',
};

export default function TrainingHistoryDetail() {
  const { entryId = '' } = useParams();
  const navigate = useNavigate();
  useTrainingHistory();
  const entry = getTrainingHistoryEntry(entryId);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);

  if (!entry) return <Navigate to="/training-analytics/history" replace />;

  const martialArtId = deriveEntryMartialArt(entry);
  // getMartialArt (not martialArtSummaries.find) so home-training/gym entries
  // show "홈트"/"웨이트" instead of falling through to the raw synthetic id —
  // same fix already applied in components/TrainingEntryRow.tsx.
  const martialArtName = martialArtId ? (getMartialArt(martialArtId)?.nameKo ?? martialArtId) : null;
  const curriculumTitle = deriveEntryCurriculumTitle(entry);
  const techniqueNames = deriveEntryTechniqueNames(entry);
  const setsReps = deriveEntrySetsReps(entry);
  const duration = entry.actualMinutes ?? entry.estimatedMinutes;
  const isEstimated = entry.actualMinutes === null;

  const completedDate = new Date(entry.completedAt);
  const dateLabel = completedDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeLabel = completedDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  // Same-day + same-technique real pose-analysis records — an honest
  // correlation (this session and these analyses happened the same day on
  // the same technique), never claimed as "the exact analysis from this
  // session" since trainingHistory entries don't carry a record id link.
  const relatedPoseRecords = getAllRecords().filter(
    (r) => entry.techniqueIds.includes(r.techniqueId) && dateKeyOf(r.analyzedAt) === entry.date
  );

  const exerciseNotes = (entry.exerciseDetails ?? []).filter((ex) => ex.notes || editingExerciseId === ex.techniqueId);

  return (
    <div className="page">
      <div className="container">
        <BackButton fallback="/training-analytics/history" />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/training-analytics">훈련 분석</Link>
          <span>/</span>
          <span>훈련 상세</span>
        </div>

        <div className="section-title">
          <h2>📋 훈련 상세</h2>
        </div>

        <div className="card info-card">
          <div className="curriculum-stat-row">
            <div>
              <strong>{dateLabel}</strong>
              <span>날짜</span>
            </div>
            <div>
              <strong>{timeLabel}</strong>
              <span>시간</span>
            </div>
            <div>
              <strong>{martialArtName ?? '-'}</strong>
              <span>무술</span>
            </div>
            <div>
              <strong>{duration}분</strong>
              <span>{isEstimated ? '예상 훈련 시간' : '실제 훈련 시간'}</span>
            </div>
            <div>
              <strong>{entry.completed ? '완료' : '미완료'}</strong>
              <span>완료 여부</span>
            </div>
            <div>
              <strong>{SOURCE_LABEL[entry.source] ?? entry.source}</strong>
              <span>훈련 유형</span>
            </div>
          </div>

          {entry.gymRoutine && (
            <>
              <div className="field-label" style={{ marginTop: 12 }}>
                수행한 루틴
              </div>
              <p>
                {entry.gymRoutine.routineName} · {WEEKDAY_LABEL[entry.gymRoutine.weekday]}요일 루틴
                {entry.gymRoutine.substituted ? ` 기반 운동 (원래 ${WEEKDAY_LABEL[entry.gymRoutine.weekday]}요일 루틴을 ${entry.date}에 수행)` : ''}
              </p>
            </>
          )}

          {curriculumTitle && (
            <>
              <div className="field-label" style={{ marginTop: 12 }}>
                커리큘럼
              </div>
              <p>
                {curriculumTitle}
                {entry.dayNumber !== null ? ` · Day ${entry.dayNumber}` : ''}
              </p>
            </>
          )}

          {techniqueNames.length > 0 && (
            <>
              <div className="field-label" style={{ marginTop: 12 }}>
                기술
              </div>
              <div className="chip-row">
                {techniqueNames.map((name) => (
                  <span key={name} className="chip">
                    {name}
                  </span>
                ))}
              </div>
            </>
          )}

          {setsReps && (
            <>
              <div className="field-label" style={{ marginTop: 12 }}>
                세트 / 횟수
              </div>
              <p>
                {setsReps.totalSets}세트{setsReps.totalReps !== null ? ` / ${setsReps.totalReps}회` : ''}
              </p>
            </>
          )}

          {entry.sparringSessionId && (() => {
            const rules = getSparringSession(entry.sparringSessionId!);
            if (!rules) return null;
            const allowed = resolveTechniquesByIds(rules.allowedTechniqueIds);
            const prohibited = resolveTechniquesByIds(rules.prohibitedTechniqueIds);
            const used = resolveTechniquesByIds(rules.usedTechniqueIds ?? []);
            return (
              <details style={{ marginTop: 12 }} open={rules.entryMode === 'manual'} data-testid="sparring-detail">
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{rules.entryMode === 'manual' ? '스파링 기록 보기' : '스파링 룰 보기'}</summary>
                <div className="stack gap-2" style={{ marginTop: 10 }}>
                  <p className="video-status-message" style={{ margin: 0 }}>
                    {rules.date} · 실제 {rules.actualRounds}라운드 · {Math.floor(rules.actualDurationSeconds / 60)}분 {rules.actualDurationSeconds % 60}초
                    {rules.entryMode === 'manual' ? ' (나중에 기록)' : ' (타이머로 진행)'}
                  </p>
                  {used.length > 0 && (
                    <p className="video-status-message" style={{ margin: 0 }}>
                      사용한 기술: {used.map((t) => t.koreanName || t.name).join(', ')}
                    </p>
                  )}
                  {rules.wentWell && (
                    <p className="video-status-message" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      잘된 점: {rules.wentWell}
                    </p>
                  )}
                  {rules.toImprove && (
                    <p className="video-status-message" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      보완할 점: {rules.toImprove}
                    </p>
                  )}
                  <p className="video-status-message" style={{ margin: 0 }}>
                    {SPARRING_TYPE_LABEL[rules.sparringType]} · {rules.plannedRounds}라운드 × {Math.round(rules.roundDurationSeconds / 60) || rules.roundDurationSeconds}
                    {rules.roundDurationSeconds % 60 === 0 ? '분' : '초'} · 휴식{' '}
                    {rules.restDurationSeconds > 0 ? `${rules.restDurationSeconds < 60 ? `${rules.restDurationSeconds}초` : `${rules.restDurationSeconds / 60}분`}` : '없음'} · 강도{' '}
                    {INTENSITY_LABEL[rules.intensity]}
                  </p>
                  {rules.equipment.length > 0 && (
                    <p className="video-status-message" style={{ margin: 0 }}>
                      보호장비: {rules.equipment.join(', ')}
                    </p>
                  )}
                  {allowed.length > 0 && (
                    <p className="video-status-message" style={{ margin: 0 }}>
                      허용 기술: {allowed.map((t) => t.koreanName || t.name).join(', ')}
                    </p>
                  )}
                  {prohibited.length > 0 && (
                    <p className="video-status-message" style={{ margin: 0 }}>
                      금지 기술: {prohibited.map((t) => t.koreanName || t.name).join(', ')}
                    </p>
                  )}
                  {rules.partnerName && (
                    <p className="video-status-message" style={{ margin: 0 }}>
                      파트너: {rules.partnerName}
                    </p>
                  )}
                  {rules.notes && (
                    <p className="video-status-message" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      메모: {rules.notes}
                    </p>
                  )}
                </div>
              </details>
            );
          })()}

          <div className="field-label" style={{ marginTop: 12 }}>
            메모
          </div>
          {editingNotes ? (
            <>
              <textarea
                style={{ width: '100%', minHeight: 60 }}
                defaultValue={entry.notes ?? ''}
                id="training-history-notes-editor"
              />
              <div className="modal-actions modal-actions--start" style={{ marginTop: 6 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    const el = document.getElementById('training-history-notes-editor') as HTMLTextAreaElement | null;
                    updateTrainingHistoryNotes(entry.id, el?.value ?? null);
                    setEditingNotes(false);
                  }}
                >
                  저장
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingNotes(false)}>
                  취소
                </button>
              </div>
            </>
          ) : (
            <>
              <p>{entry.notes || '메모가 없습니다.'}</p>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingNotes(true)}>
                메모 {entry.notes ? '수정' : '추가'}
              </button>
            </>
          )}

          {exerciseNotes.length > 0 && (
            <>
              <div className="field-label" style={{ marginTop: 12 }}>
                운동별 메모
              </div>
              <div className="stack gap-2">
                {exerciseNotes.map((ex) => {
                  const t = resolveTechnique(ex.techniqueId);
                  return (
                    <div key={ex.techniqueId}>
                      <strong>{t?.name ?? ex.techniqueId}</strong>
                      {editingExerciseId === ex.techniqueId ? (
                        <>
                          <textarea style={{ width: '100%', minHeight: 40 }} defaultValue={ex.notes ?? ''} id={`ex-note-${ex.techniqueId}`} />
                          <div className="modal-actions modal-actions--start" style={{ marginTop: 4 }}>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => {
                                const el = document.getElementById(`ex-note-${ex.techniqueId}`) as HTMLTextAreaElement | null;
                                updateTrainingHistoryExerciseNotes(entry.id, ex.techniqueId, el?.value ?? null);
                                setEditingExerciseId(null);
                              }}
                            >
                              저장
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingExerciseId(null)}>
                              취소
                            </button>
                          </div>
                        </>
                      ) : (
                        <p>
                          {ex.notes}{' '}
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditingExerciseId(ex.techniqueId)}>
                            수정
                          </button>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="modal-actions modal-actions--start" style={{ marginTop: 12 }}>
            <button
              className="btn btn-ghost"
              onClick={() => {
                if (window.confirm('이 훈련 기록을 삭제할까요? 되돌릴 수 없습니다.')) {
                  deleteTrainingHistoryEntry(entry.id);
                  navigate('/training-analytics/history');
                }
              }}
            >
              이 기록 삭제
            </button>
          </div>
        </div>

        {relatedPoseRecords.length > 0 && (
          <div className="card info-card">
            <h3>📈 이 날짜의 자세 분석 결과</h3>
            <div className="stack gap-2">
              {relatedPoseRecords.map((r) => (
                <div key={r.recordId} className="pose-history-row">
                  <div className="pose-history-row__main" style={{ cursor: 'default', flex: 1 }}>
                    <span>{martialArtSummaries.find((a) => a.id === r.martialArtId)?.nameKo ?? r.martialArtId}</span>
                    <span>
                      {r.score}점 · {r.status === 'good' ? '양호' : r.status === 'average' ? '보통' : '개선 필요'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
