import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getMartialArt } from '../lib/loadData';
import { searchTechniques } from '../lib/search';
import { resolveTechnique } from '../lib/userTechniques/service';
import { STATUS_ICON } from '../lib/poseAnalysis/scoring';
import { formatDuration } from '../lib/sparringAnalysis/videoMeta';
import { addSavedMoment } from '../lib/sparringAnalysis/sparringSessionService';
import { STYLE_CURRICULUM_MARTIAL_ART } from '../lib/fighterStyle/styleCurriculumService';
import { recordTrainingSession } from '../lib/trainingHistory/service';
import { generateTodayTrainingPlan } from '../lib/todayTraining/planner';
import { addTechniqueToSession } from '../lib/todayTraining/sessionStore';
import { getSportAnalysisProfile } from '../lib/sparringAnalysis/sportAnalysisProfiles';
import { MOTION_EVENT_LABEL, type SparringSession, type TechniqueGuess } from '../lib/sparringAnalysis/types';
import { generateSparringSetups, type GeneratedSetup } from '../lib/sparringAnalysis/setupGeneration';
import { isSyntheticTrainingDomain } from '../lib/loadData';
import { useAuth } from '../lib/auth/AuthProvider';
import AiAskModal from './AiAskModal';
import CurriculumOptionsSheet from './sparring/CurriculumOptionsSheet';

const POSTURE_STATUS_TEXT: Record<string, string> = { good: '좋음', average: '보통', needs_improvement: '개선 필요' };
const CATEGORY_SCORE_LABEL: Record<string, string> = {
  attack: '공격',
  defense: '방어',
  footwork: '풋워크',
  distance: '거리 조절',
  timing: '타이밍',
  connection: '공격 연결',
  tacticalVariety: '전술 다양성',
};
const DIFFICULTY_LABEL: Record<string, string> = { basic: '기본', intermediate: '중급', advanced: '심화' };

export default function SparringResultView({
  session: initialSession,
  videoUrl,
  onSeek,
}: {
  session: SparringSession;
  videoUrl?: string | null;
  onSeek?: (timestampSec: number) => void;
}) {
  const [session, setSession] = useState(initialSession);
  const [aiOpen, setAiOpen] = useState(false);
  const [confirmingTechnique, setConfirmingTechnique] = useState<TechniqueGuess | null>(null);
  const [curriculumSheetOpen, setCurriculumSheetOpen] = useState(false);
  const [generatingSetups, setGeneratingSetups] = useState(false);
  const [generatedSetups, setGeneratedSetups] = useState<GeneratedSetup[] | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [expandedPatternKey, setExpandedPatternKey] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const art = getMartialArt(session.martialArt);
  const martialArtLabel = art?.nameKo ?? (session.martialArt === STYLE_CURRICULUM_MARTIAL_ART ? 'MMA' : session.martialArt);
  const sportProfile = getSportAnalysisProfile(session.martialArt);

  const hasOverallScore = Object.values(session.overallScores).some((v) => v !== null);
  // Older sessions saved before this field existed simply have no exclusions to report.
  const excludedEntries = Object.entries(session.excludedMotionCounts ?? {}) as [keyof typeof MOTION_EVENT_LABEL, number][];

  function handleSeek(t: number) {
    onSeek?.(t);
  }

  function handleSaveMoment(timestampSec: number, label: string) {
    const updated = addSavedMoment(session.id, { timestampSec, label });
    if (updated) setSession(updated);
  }

  function handleAddToTodayTraining(techniqueId: string, label: string) {
    addTechniqueToSession(techniqueId, generateTodayTrainingPlan());
    window.alert(`"${label}" 관련 기술을 오늘의 훈련에 추가했습니다.`);
  }

  // A weak-area label ("Distance Management") is never itself a technique
  // id — resolved the same deterministic way as sparringToCurriculum.ts, via
  // the real search index. If nothing matches, no button is shown at all
  // rather than pretending the action succeeded.
  function findRealTechniqueForArea(label: string) {
    const filters = session.martialArt === STYLE_CURRICULUM_MARTIAL_ART ? {} : { martialArt: session.martialArt };
    // Same unfiltered-MMA-pseudo-id gap as sparringToCurriculum.ts — a
    // home-training exercise must never be offered as "the real technique"
    // behind a sparring weak-area label.
    return searchTechniques(label, 3, filters).find((t) => !isSyntheticTrainingDomain(t.martialArt)) ?? null;
  }

  function handleConfirmMastery(guess: TechniqueGuess) {
    recordTrainingSession({
      curriculumId: null,
      dayNumber: null,
      techniqueIds: [guess.techniqueId],
      completed: true,
      estimatedMinutes: 10,
      source: 'sparring',
    });
    setConfirmingTechnique(null);
  }

  async function handleGenerateSetups() {
    setGeneratingSetups(true);
    setSetupError(null);
    try {
      const setups = await generateSparringSetups(session, user?.id ?? null);
      if (setups.length === 0) {
        setSetupError('셋업을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.');
      } else {
        setGeneratedSetups(setups);
      }
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : '셋업 생성 중 문제가 발생했습니다.');
    } finally {
      setGeneratingSetups(false);
    }
  }

  // Nearest-timestamp match, not an exact one — visualEventAnalysis.ts's
  // frame timestamps come from the same MotionEvent list a TechniqueGuess's
  // occurrence was derived from, but they're independent arrays, so a tight
  // tolerance is used instead of assuming identical floats.
  function findVisualInsight(timestampSec: number) {
    return (session.visualInsights ?? []).find((v) => Math.abs(v.timestampSec - timestampSec) < 0.15) ?? null;
  }

  function techniqueSequenceStats(techniqueId: string) {
    return session.sequenceAnalysis?.perTechnique.find((t) => t.techniqueId === techniqueId) ?? null;
  }

  return (
    <div className="stack gap-2">
      <div className="card info-card">
        <h3>🥊 스파링 분석 결과</h3>
        <div className="chip-row">
          <span className="chip active">{martialArtLabel}</span>
          <span className="chip">분석 영상 {formatDuration(session.videoDurationSec)}</span>
          <span className="chip">분석 대상: 나</span>
        </div>
        <p className="video-status-message">
          영상 분석 결과는 참고용이며, 카메라 각도·조명·화질·가림 등에 따라 정확도가 달라질 수 있습니다.
        </p>
        {session.limitations.map((l) => (
          <p key={l.code} className="ai-inline-warning">
            {l.message}
          </p>
        ))}
        {excludedEntries.length > 0 && (
          <p className="ai-inline-warning">
            {martialArtLabel} 종목에서는 감지 정확도가 낮아 다음 동작은 분석에서 제외했습니다:{' '}
            {excludedEntries.map(([cat, count]) => `${MOTION_EVENT_LABEL[cat]} (${count}회)`).join(', ')}
          </p>
        )}
      </div>

      {hasOverallScore && (
        <div className="card info-card">
          <h3>전체 평가 · {martialArtLabel}</h3>
          <div className="curriculum-stat-row">
            {sportProfile.resultCategoryOrder.map((key) => {
              const score = session.overallScores[key];
              if (score === null) return null;
              return (
                <div key={key}>
                  <strong>{score}</strong>
                  <span>{sportProfile.scoreLabels[key]}</span>
                </div>
              );
            })}
          </div>
          <p className="video-status-message">
            기술 실행의 성공/실패 여부(예: 테이크다운 성공률, 타격 적중 여부)는 신뢰할 수 있는 근거가 없어 점수화하지 않았습니다.
          </p>
        </div>
      )}

      {session.coachingSynthesis && (
        <div className="card info-card">
          <h3>🧠 AI 코칭 종합 평가</h3>
          <p className="video-status-message">
            아래 항목은 실제 감지된 패턴/동작 데이터를 근거로 AI가 종합한 평가이며, 근거가 부족한 항목은 점수 대신
            "분석 데이터 부족"으로 표시됩니다.
          </p>
          <div className="sparring-score-grid">
            {(Object.keys(session.coachingSynthesis.categoryScores) as (keyof typeof session.coachingSynthesis.categoryScores)[]).map((key) => {
              const score = session.coachingSynthesis!.categoryScores[key];
              return (
                <div key={key} className="sparring-score-grid__item">
                  <strong>{typeof score === 'number' ? score : '—'}</strong>
                  <span>{CATEGORY_SCORE_LABEL[key]}</span>
                  {typeof score !== 'number' && <span className="sparring-score-grid__insufficient">{score}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {session.coachingSynthesis && (session.coachingSynthesis.strengths.length > 0 || session.coachingSynthesis.weaknesses.length > 0) && (
        <div className="card info-card">
          <h3>👍 강점 · ⚠️ 개선점</h3>
          <div className="sparring-insight-grid">
            {session.coachingSynthesis.strengths.map((s, i) => (
              <details key={`s-${i}`} className="sparring-insight-card sparring-insight-card--strength">
                <summary>👍 {s.label}</summary>
                <p>{s.evidence}</p>
              </details>
            ))}
            {session.coachingSynthesis.weaknesses.map((w, i) => (
              <details key={`w-${i}`} className="sparring-insight-card sparring-insight-card--weakness">
                <summary>⚠️ {w.label}</summary>
                <p>{w.evidence}</p>
              </details>
            ))}
          </div>
        </div>
      )}

      {((session.sequenceAnalysis?.patterns.length ?? 0) > 0 || (session.coachingSynthesis?.patternDiagnoses.length ?? 0) > 0) && (
        <div className="card info-card">
          <h3>🔍 발견된 패턴</h3>
          <p className="video-status-message">기술 사용 시각을 실제로 비교해 찾아낸 연결/반복 패턴입니다(추정이 아닌 실측 횟수).</p>
          <div className="stack gap-2">
            {(session.sequenceAnalysis?.patterns ?? []).slice(0, 8).map((p, i) => {
              const key = `${p.fromTechniqueId}→${p.toTechniqueId ?? 'none'}`;
              const diagnosis = session.coachingSynthesis?.patternDiagnoses.find((d) => d.patternDescription === `${p.fromTechniqueName} → ${p.toTechniqueName ?? '후속 공격 없음'}`);
              return (
                <div key={i} className="sparring-pattern-card">
                  <button type="button" className="sparring-pattern-card__header" onClick={() => setExpandedPatternKey(expandedPatternKey === key ? null : key)}>
                    <strong>
                      {p.fromTechniqueName} → {p.toTechniqueName ?? '후속 공격 없음'}
                    </strong>
                    <span>{p.count}회 반복</span>
                  </button>
                  {expandedPatternKey === key && (
                    <p className="video-status-message">{diagnosis?.diagnosis ?? '이 패턴에 대한 AI 진단은 생성되지 않았습니다.'}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {session.techniqueGuesses.length > 0 && (
        <div className="card info-card">
          <h3>발견된 기술 (AI 추정)</h3>
          <p className="video-status-message">
            아래 기술명은 감지된 동작 패턴을 기반으로 한 AI 추정이며, 확정된 분석 결과가 아닙니다.
          </p>
          <div className="stack gap-2">
            {session.techniqueGuesses.map((g) => {
              const seq = techniqueSequenceStats(g.techniqueId);
              const visuals = g.occurrences.map((t) => findVisualInsight(t)).filter((v): v is NonNullable<typeof v> => !!v);
              return (
                <div key={g.techniqueId} className="technique-row">
                  <div className="technique-row__main">
                    <div className="technique-row__name">✓ {g.techniqueName} (추정)</div>
                    <div className="technique-row__sub">
                      사용 {g.occurrences.length}회 · 관련 장면: {g.occurrences.map((t) => formatDuration(t)).join(', ')}
                    </div>
                    {seq && (
                      <div className="chip-row" style={{ marginTop: 6 }}>
                        <span className="chip">단독 {seq.soloCount}회 · 콤비 {seq.comboCount}회</span>
                        <span className="chip">후속 연결 {seq.followUpCount}회 · 후속 없음 {seq.noFollowUpCount}회</span>
                        {seq.movedAfterCount + seq.stayedStillCount > 0 && (
                          <span className="chip">공격 후 이동 {seq.movedAfterCount}회 · 제자리 {seq.stayedStillCount}회</span>
                        )}
                      </div>
                    )}
                    {visuals.length > 0 && (
                      <div className="chip-row" style={{ marginTop: 6 }}>
                        {visuals.map((v, i) => (
                          <span key={i} className="chip">
                            {formatDuration(v.timestampSec)} 적중:{v.hitAssessment === 'landed' ? '적중' : v.hitAssessment === 'missed' ? '빗나감' : '확인 불가'}
                            {v.opponentReaction ? ` · 상대반응: ${v.opponentReaction}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="technique-row__right">
                    {onSeek && (
                      <button className="btn btn-ghost btn-sm" onClick={() => handleSeek(g.occurrences[0])}>
                        장면 보기
                      </button>
                    )}
                    <button className="btn btn-secondary btn-sm" onClick={() => setConfirmingTechnique(g)}>
                      학습 기록에 추가
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {confirmingTechnique && (
        <div className="modal-overlay" onClick={() => setConfirmingTechnique(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3>학습 기록에 추가</h3>
            <p>
              스파링에서 "{confirmingTechnique.techniqueName}" 사용이 관찰되었습니다(AI 추정). 학습 기록에 추가할까요?
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmingTechnique(null)}>
                취소
              </button>
              <button className="btn btn-primary" onClick={() => handleConfirmMastery(confirmingTechnique)}>
                추가
              </button>
            </div>
          </div>
        </div>
      )}

      {session.motionEvents.length > 0 && (
        <div className="card info-card">
          <h3>타임라인 분석</h3>
          <div className="stack gap-1">
            {session.motionEvents.map((e, i) => (
              <div key={i} className="pose-history-row" style={{ cursor: 'default' }}>
                <button
                  className="pose-history-row__main"
                  onClick={() => handleSeek(e.timestampSec)}
                  disabled={!onSeek}
                  style={{ textAlign: 'left', flex: 1 }}
                >
                  <span>{formatDuration(e.timestampSec)}</span>
                  <span>
                    {e.label}
                    {e.confidence === 'low' ? ' (추정 신뢰도 낮음)' : ''}
                  </span>
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => handleSaveMoment(e.timestampSec, e.label)}>
                  ⭐ 저장
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {session.postureSegments.length > 0 && (
        <div className="card info-card">
          <h3>자세 분석 (스파링 중 변화)</h3>
          <div className="stack gap-2">
            {session.postureSegments.map((seg) => (
              <div key={seg.segment}>
                <div className="field-label">{seg.label}</div>
                <div className="chip-row">
                  {seg.metrics.map((m) => (
                    <span key={m.id} className="chip">
                      {STATUS_ICON[m.status]} {m.label} {POSTURE_STATUS_TEXT[m.status]}
                    </span>
                  ))}
                </div>
                {seg.note && <p className="video-status-message">{seg.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {session.styleObservations.length > 0 && (
        <div className="card info-card info-card--muted">
          <h3>스타일 분석</h3>
          <p className="video-status-message">현재 스파링에서 관찰된 특징(확정적 판단이 아닌 참고용 관찰입니다)</p>
          <ul>
            {session.styleObservations.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </div>
      )}

      {session.styleComparison && (
        <div className="card info-card info-card--muted">
          <h3>선수 스타일과 비교 — {session.styleComparison.targetFighterName}</h3>
          {session.styleComparison.matchedFeatures.length > 0 && <p>✓ 관찰된 공통 특징: {session.styleComparison.matchedFeatures.join(', ')}</p>}
          {session.styleComparison.improvementAreas.length > 0 && <p>개선 방향: {session.styleComparison.improvementAreas.join(', ')}</p>}
          <p className="video-status-message">
            실제 선수와의 실력이나 신체 능력을 비교한 것이 아니라, 기술적/전술적 특징의 차이만을 설명합니다.
          </p>
        </div>
      )}

      {session.savedMoments.length > 0 && (
        <div className="card info-card">
          <h3>⭐ 중요 장면</h3>
          <div className="stack gap-1">
            {session.savedMoments.map((m, i) => (
              <button key={i} className="pose-history-row__main" onClick={() => handleSeek(m.timestampSec)} disabled={!onSeek}>
                <span>{formatDuration(m.timestampSec)}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>
          {!videoUrl && <p className="video-status-message">영상을 다시 불러오면 해당 구간으로 이동할 수 있습니다.</p>}
        </div>
      )}

      {session.weakAreas.length > 0 && (
        <div className="card info-card">
          <h3>가장 개선이 필요한 부분</h3>
          <div className="stack gap-1">
            {session.weakAreas.map((w, i) => {
              const match = findRealTechniqueForArea(w.label);
              return (
                <div key={i} className="technique-row">
                  <div className="technique-row__main">
                    <div className="technique-row__name">
                      {i + 1}. {w.label}
                      {w.score !== null ? ` (${w.score}점)` : ''}
                    </div>
                    {match && <div className="technique-row__sub">관련 기술: {match.name}</div>}
                  </div>
                  {match && (
                    <div className="technique-row__right">
                      <button className="btn btn-secondary btn-sm" onClick={() => handleAddToTodayTraining(match.id, w.label)}>
                        오늘의 훈련에 추가
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="modal-actions modal-actions--start">
            <button className="btn btn-primary" onClick={() => setCurriculumSheetOpen(true)}>
              🎯 맞춤 커리큘럼 생성
            </button>
            <button className="btn btn-secondary" onClick={handleGenerateSetups} disabled={generatingSetups}>
              {generatingSetups ? '셋업 생성 중…' : '🧠 셋업 생성'}
            </button>
          </div>
          {setupError && (
            <div className="ai-error" role="alert">
              {setupError}
            </div>
          )}
        </div>
      )}

      {generatedSetups && generatedSetups.length > 0 && (
        <div className="card info-card">
          <h3>🧠 추천 셋업</h3>
          <p className="video-status-message">스파링에서 발견된 패턴/약점을 바탕으로 생성되었습니다. 목록에서 훈련하거나 콤보 목록에서 다시 볼 수 있습니다.</p>
          <div className="stack gap-2">
            {generatedSetups.map(({ combo, reasonLabel }, i) => (
              <div key={combo.id} className="sparring-setup-card">
                <div className="sparring-setup-card__header">
                  <strong>SETUP {String(i + 1).padStart(2, '0')} · {combo.name}</strong>
                  {combo.sourceMeta && <span className="chip">{DIFFICULTY_LABEL[combo.sourceMeta.difficulty]}</span>}
                </div>
                <p className="sparring-setup-card__sequence">{combo.techniqueIds.map((id) => resolveTechnique(id)?.name ?? id).join(' → ')}</p>
                {combo.aiComboMeta?.analysis?.finalGoal && <p>목적: {combo.aiComboMeta.analysis.finalGoal}</p>}
                {combo.aiComboMeta?.analysis?.startingSituation && <p className="video-status-message">사용 상황: {combo.aiComboMeta.analysis.startingSituation}</p>}
                {combo.aiComboMeta?.analysis?.stepDetails?.[0]?.opponentReaction && (
                  <p className="video-status-message">예상 상대 반응: {combo.aiComboMeta.analysis.stepDetails[0].opponentReaction}</p>
                )}
                <p className="video-status-message">근거: {reasonLabel}</p>
                <div className="modal-actions modal-actions--start">
                  <Link to={`/combos/${combo.id}/train`} className="btn btn-secondary btn-sm">
                    훈련하기
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="modal-actions modal-actions--start">
        <button className="btn btn-secondary" onClick={() => setAiOpen(true)}>
          ✦ AI 개인 코치에게 물어보기
        </button>
        <Link to="/coach" className="btn btn-ghost">
          AI 개인 코치로 이동
        </Link>
      </div>
      {aiOpen && <AiAskModal onClose={() => setAiOpen(false)} coach />}
      {curriculumSheetOpen && (
        <CurriculumOptionsSheet
          session={session}
          userId={user?.id ?? null}
          onClose={() => setCurriculumSheetOpen(false)}
          onCreated={(curriculum) => {
            setCurriculumSheetOpen(false);
            navigate(`/learning/${curriculum.martialArt}/${curriculum.id}`);
          }}
        />
      )}
    </div>
  );
}
