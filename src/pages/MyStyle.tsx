import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { FighterCandidate, FighterStyleAnalysis, Intensity, TechniqueMatch, UserLevel } from '../lib/fighterStyle/types';
import { MAX_DURATION_DAYS, MIN_DURATION_DAYS } from '../lib/fighterStyle/types';
import { extractFighterQuery, identifyFighterCandidates } from '../lib/fighterStyle/fighterIdentification';
import { getOrGenerateStyleAnalysis } from '../lib/fighterStyle/styleAnalysis';
import { matchStyleToTechniques } from '../lib/fighterStyle/techniqueMatcher';
import { recommendDuration } from '../lib/fighterStyle/durationAdvisor';
import { saveNewStyleCurriculum, STYLE_CURRICULUM_MARTIAL_ART } from '../lib/fighterStyle/styleCurriculumService';
import { GENERIC_STYLE_PRESETS, presetToFighterCandidate } from '../lib/myStyle/targetStyleService';
import { useMyStyle } from '../lib/myStyle/useMyStyle';
import { computeImprovementItems, computeStyleComparison } from '../lib/myStyle/comparisonEngine';
import { buildSparringStyleTimeline, computeMonthlyStyleTrend } from '../lib/myStyle/styleEvolution';
import type { MyStyleAnalysis } from '../lib/myStyle/types';
import { addTechniqueToSession } from '../lib/todayTraining/sessionStore';
import { generateTodayTrainingPlan } from '../lib/todayTraining/planner';
import { useAuth } from '../lib/auth/AuthProvider';
import EmptyState from '../components/EmptyState';
import LoginToBackupBanner from '../components/auth/LoginToBackupBanner';
import BackButton from '../components/BackButton';

type TargetMode = 'idle' | 'searching' | 'disambiguate' | 'notFound' | 'analyzing' | 'ready';

const STYLE_FIELD_LABELS: { key: keyof MyStyleAnalysis; label: string }[] = [
  { key: 'attackTendency', label: '공격 성향' },
  { key: 'defenseTendency', label: '방어 성향' },
  { key: 'distance', label: '거리' },
  { key: 'footwork', label: '풋워크' },
  { key: 'clinch', label: '클린치' },
  { key: 'takedown', label: '테이크다운' },
  { key: 'ground', label: '그라운드' },
  { key: 'techniqueSelection', label: '기술 선택' },
  { key: 'transitionPattern', label: '전환 패턴' },
];

const LEVEL_OPTIONS: { value: UserLevel; label: string }[] = [
  { value: 'first_time', label: '처음 시작' },
  { value: 'beginner', label: '초급' },
  { value: 'intermediate', label: '중급' },
  { value: 'advanced', label: '고급' },
];
const INTENSITY_OPTIONS: { value: Intensity; label: string }[] = [
  { value: 'light', label: '가볍게' },
  { value: 'normal', label: '보통' },
  { value: 'intensive', label: '집중' },
];
const QUICK_DURATIONS = [7, 14, 30, 60, 90];

function starLine(stars: number | null): string {
  if (stars === null) return '데이터 부족';
  return '★'.repeat(stars) + '☆'.repeat(5 - stars);
}

export default function MyStyle() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { summary, analysis, loading, isStale, refresh } = useMyStyle();

  const [targetMode, setTargetMode] = useState<TargetMode>('idle');
  const [targetFreeText, setTargetFreeText] = useState('');
  const [targetCandidates, setTargetCandidates] = useState<FighterCandidate[]>([]);
  const [targetLabel, setTargetLabel] = useState<string | null>(null);
  const [targetStyleAnalysis, setTargetStyleAnalysis] = useState<FighterStyleAnalysis | null>(null);
  const [targetMatches, setTargetMatches] = useState<TechniqueMatch[]>([]);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [userLevel, setUserLevel] = useState<UserLevel>('beginner');
  const [intensity, setIntensity] = useState<Intensity>('normal');
  const [durationDays, setDurationDays] = useState(30);
  const [customDurationInput, setCustomDurationInput] = useState('');
  const [durationMode, setDurationMode] = useState<'ai_recommended' | 'user_selected'>('user_selected');
  const [aiDurationLoading, setAiDurationLoading] = useState(false);
  const [aiDurationReason, setAiDurationReason] = useState<string | null>(null);
  const [creatingCurriculum, setCreatingCurriculum] = useState(false);
  const [curriculumError, setCurriculumError] = useState<string | null>(null);

  async function selectTargetFighter(candidate: FighterCandidate, label?: string) {
    setTargetMode('analyzing');
    setTargetError(null);
    const analysisResult = await getOrGenerateStyleAnalysis(candidate);
    if (!analysisResult.ok) {
      setTargetError('목표 스타일 분석에 실패했습니다. 잠시 후 다시 시도해주세요.');
      setTargetMode('idle');
      return;
    }
    setTargetLabel(label ?? candidate.name);
    setTargetStyleAnalysis(analysisResult.data);
    setTargetMatches(await matchStyleToTechniques(analysisResult.data, user?.id ?? null));
    setTargetMode('ready');
  }

  async function handleSearchTarget() {
    if (!targetFreeText.trim()) return;
    setTargetMode('searching');
    setTargetError(null);
    const extracted = await extractFighterQuery(targetFreeText);
    if (!extracted.ok) {
      setTargetError('검색에 실패했습니다. 잠시 후 다시 시도해주세요.');
      setTargetMode('idle');
      return;
    }
    const found = await identifyFighterCandidates(extracted.data.fighterNameGuess);
    if (!found.ok || found.data.candidates.length === 0) {
      setTargetMode('notFound');
      return;
    }
    if (found.data.candidates.length === 1) {
      await selectTargetFighter(found.data.candidates[0]);
      return;
    }
    setTargetCandidates(found.data.candidates);
    setTargetMode('disambiguate');
  }

  function resetTarget() {
    setTargetMode('idle');
    setTargetFreeText('');
    setTargetCandidates([]);
    setTargetLabel(null);
    setTargetStyleAnalysis(null);
    setTargetMatches([]);
    setTargetError(null);
    setAiDurationReason(null);
    setDurationMode('user_selected');
    setCurriculumError(null);
  }

  const comparison = useMemo(
    () => (targetMode === 'ready' ? computeStyleComparison(summary.positionBreakdown, targetMatches) : []),
    [targetMode, summary.positionBreakdown, targetMatches]
  );
  const improvementItems = useMemo(() => (targetMode === 'ready' ? computeImprovementItems(comparison, targetMatches) : []), [targetMode, comparison, targetMatches]);
  const sparringTimeline = useMemo(() => buildSparringStyleTimeline(), [summary.sparringSessionCount]);
  const monthlyTrend = useMemo(() => computeMonthlyStyleTrend(), [summary.sparringSessionCount]);

  function handleLearnTechnique(techniqueId: string, techniqueName: string) {
    addTechniqueToSession(techniqueId, generateTodayTrainingPlan());
    setActionMessage(`"${techniqueName}"을(를) 오늘의 훈련에 추가했습니다.`);
  }

  async function handleAiRecommendDuration() {
    if (!targetStyleAnalysis) return;
    setAiDurationLoading(true);
    setCurriculumError(null);
    try {
      const rec = await recommendDuration({
        fighterName: targetLabel ?? targetStyleAnalysis.fighterName,
        styleAnalysis: targetStyleAnalysis,
        userLevel,
        matchedTechniqueCount: targetMatches.length,
      });
      if (rec.ok) {
        setDurationDays(rec.data.recommendedDays);
        setAiDurationReason(rec.data.reason);
        setDurationMode('ai_recommended');
      } else {
        setCurriculumError('AI 기간 추천을 불러오지 못했습니다. 기간을 직접 선택해주세요.');
      }
    } finally {
      setAiDurationLoading(false);
    }
  }

  function validateAndSetCustomDuration(value: string) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < MIN_DURATION_DAYS || n > MAX_DURATION_DAYS) {
      setCurriculumError(`기간은 ${MIN_DURATION_DAYS}일에서 ${MAX_DURATION_DAYS}일 사이로 입력해주세요.`);
      return;
    }
    setDurationDays(n);
    setDurationMode('user_selected');
    setAiDurationReason(null);
    setCurriculumError(null);
  }

  async function handleCreateCurriculum() {
    if (!targetStyleAnalysis) return;
    setCreatingCurriculum(true);
    setCurriculumError(null);
    try {
      const curriculum = saveNewStyleCurriculum({
        fighterId: targetStyleAnalysis.fighterId,
        fighterName: targetLabel ?? targetStyleAnalysis.fighterName,
        targetStyle: targetLabel ?? undefined,
        styleAnalysis: targetStyleAnalysis,
        matchedTechniques: targetMatches,
        targetDays: durationDays,
        intensity,
        userLevel,
        durationMode,
      });
      navigate(`/learning/${STYLE_CURRICULUM_MARTIAL_ART}/${curriculum.id}`);
    } catch {
      setCurriculumError('커리큘럼 생성에 실패했습니다. 잠시 후 다시 시도해주세요.');
      setCreatingCurriculum(false);
    }
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>나의 스타일</span>
        </div>

        <div className="section-title">
          <h2>🥋 MY MARTIAL STYLE</h2>
        </div>
        <LoginToBackupBanner featureName="나의 스타일 분석" />

        {!summary.hasEnoughData ? (
          <>
            <EmptyState icon="📊" text="분석 데이터가 부족합니다." />
            <p className="video-status-message">
              스파링 영상을 1회 이상 분석하거나, 훈련 기록을 5회 이상(서로 다른 기술 5개 이상) 남기면 나의 스타일을 분석할 수 있습니다.
            </p>
            <div className="modal-actions modal-actions--start">
              <Link to="/sparring" className="btn btn-primary">
                스파링 분석하러 가기
              </Link>
              <Link to="/today-training" className="btn btn-secondary">
                오늘의 훈련 시작
              </Link>
            </div>
          </>
        ) : (
          <>
            {!analysis && (
              <div className="card info-card">
                <p className="video-status-message">
                  실제 학습/스파링 데이터를 바탕으로 나의 무술 스타일을 분석할 수 있습니다. 실제 실력이나 대회 성적을 평가하는 것이 아닌 학습 참고 자료입니다.
                </p>
                <button className="btn btn-primary" onClick={() => refresh(false)} disabled={loading}>
                  {loading ? '분석 중…' : '스타일 분석하기'}
                </button>
              </div>
            )}

            {analysis && (
              <>
                {isStale && (
                  <div className="ai-inline-warning">
                    새로운 학습/스파링 기록이 있습니다.{' '}
                    <button className="btn btn-secondary btn-sm" onClick={() => refresh(true)} disabled={loading}>
                      {loading ? '분석 중…' : '다시 분석하기'}
                    </button>
                  </div>
                )}
                {analysis.source === 'fallback' && (
                  <div className="ai-inline-warning">AI 응답을 불러오지 못해 실제 데이터로 만든 기본 요약을 보여드립니다.</div>
                )}

                <div className="card info-card">
                  <div className="field-label">현재 스타일</div>
                  <h3>{analysis.styleName}</h3>
                  <div className="field-label" style={{ marginTop: 10 }}>
                    주요 특징
                  </div>
                  <ul>
                    {analysis.traits.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                  {!isStale && (
                    <button className="btn btn-ghost btn-sm" onClick={() => refresh(true)} disabled={loading}>
                      {loading ? '분석 중…' : '다시 분석'}
                    </button>
                  )}
                </div>

                <div className="card info-card">
                  <h3>스타일 특징</h3>
                  <div className="curriculum-stat-row" style={{ flexWrap: 'wrap' }}>
                    {STYLE_FIELD_LABELS.map((f) => (
                      <div key={f.key} style={{ minWidth: 140 }}>
                        <strong style={{ fontSize: '0.95em' }}>{String(analysis[f.key])}</strong>
                        <span>{f.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="card info-card">
              <h3>🎯 목표 스타일</h3>
              {targetMode === 'idle' && (
                <>
                  <div className="field-label">선수/스타일 이름으로 검색</div>
                  <textarea
                    placeholder='예: "마카체프 스타일", "볼카노프스키 스타일"'
                    value={targetFreeText}
                    onChange={(e) => setTargetFreeText(e.target.value)}
                  />
                  <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                    <button className="btn btn-primary" onClick={handleSearchTarget} disabled={!targetFreeText.trim()}>
                      검색
                    </button>
                  </div>
                  <div className="field-label" style={{ marginTop: 12 }}>
                    또는 무술 중심으로 빠르게 선택
                  </div>
                  <div className="chip-row">
                    {GENERIC_STYLE_PRESETS.map((p) => (
                      <button key={p.id} className="chip" onClick={() => selectTargetFighter(presetToFighterCandidate(p), p.label)}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  {targetError && <div className="ai-inline-warning">{targetError}</div>}
                </>
              )}
              {(targetMode === 'searching' || targetMode === 'analyzing') && <p className="video-status-message">분석 중…</p>}
              {targetMode === 'disambiguate' && (
                <>
                  <p className="field-label">여러 선수가 검색되었습니다. 한 명을 선택해주세요.</p>
                  <div className="stack gap-2">
                    {targetCandidates.map((c) => (
                      <button key={c.id} className="technique-row" style={{ textAlign: 'left', width: '100%' }} onClick={() => selectTargetFighter(c)}>
                        <div className="technique-row__main">
                          <div className="technique-row__name">{c.name}</div>
                          <div className="technique-row__sub">
                            {c.sport} · {c.shortDescription}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {targetMode === 'notFound' && (
                <>
                  <EmptyState icon="🔎" text="선수를 찾지 못했습니다." />
                  <button className="btn btn-secondary btn-sm" onClick={resetTarget}>
                    다시 입력하기
                  </button>
                </>
              )}
              {targetMode === 'ready' && targetStyleAnalysis && (
                <>
                  <div className="field-label">목표: {targetLabel ?? targetStyleAnalysis.fighterName}</div>
                  <p>{targetStyleAnalysis.styleSummary}</p>
                  <div className="chip-row">
                    {targetStyleAnalysis.primaryStyles.map((s) => (
                      <span key={s} className="chip">
                        {s}
                      </span>
                    ))}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={resetTarget}>
                    목표 스타일 다시 선택
                  </button>
                </>
              )}
            </div>

            {targetMode === 'ready' && (
              <div className="card info-card">
                <h3>현재 스타일 vs 목표 스타일</h3>
                <div className="stack gap-2">
                  {comparison.map((row) => (
                    <div key={row.position} className="technique-row">
                      <div className="technique-row__main">
                        <div className="technique-row__name">{row.label}</div>
                        <div className="technique-row__sub">
                          현재 {starLine(row.currentStars)} · 목표 {starLine(row.targetStars)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {targetMode === 'ready' && improvementItems.length > 0 && (
              <div className="card info-card">
                <h3>우선적으로 학습할 부분</h3>
                {actionMessage && <p className="video-status-message">{actionMessage}</p>}
                <div className="stack gap-2">
                  {improvementItems.map((item, i) => (
                    <div key={item.techniqueId} className="technique-row">
                      <div className="technique-row__main">
                        <div className="technique-row__name">
                          {i + 1}. {item.techniqueName}
                        </div>
                        <div className="technique-row__sub">{item.reason}</div>
                      </div>
                      <div className="technique-row__right">
                        <button className="btn btn-secondary btn-sm" onClick={() => handleLearnTechnique(item.techniqueId, item.techniqueName)}>
                          학습하기
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {targetMode === 'ready' && (
              <div className="card info-card">
                <h3>📘 목표 스타일 커리큘럼</h3>
                <div className="field-label">현재 수준</div>
                <div className="chip-row">
                  {LEVEL_OPTIONS.map((o) => (
                    <button key={o.value} className={`chip ${userLevel === o.value ? 'active' : ''}`} onClick={() => setUserLevel(o.value)}>
                      {o.label}
                    </button>
                  ))}
                </div>

                <div className="field-label" style={{ marginTop: 10 }}>
                  기간
                </div>
                <div className="chip-row">
                  {QUICK_DURATIONS.map((d) => (
                    <button
                      key={d}
                      className={`chip ${durationMode === 'user_selected' && durationDays === d ? 'active' : ''}`}
                      onClick={() => {
                        setDurationDays(d);
                        setDurationMode('user_selected');
                        setAiDurationReason(null);
                      }}
                    >
                      {d}일
                    </button>
                  ))}
                  <input
                    type="number"
                    className="select"
                    style={{ width: 100 }}
                    placeholder="직접 입력"
                    value={customDurationInput}
                    onChange={(e) => setCustomDurationInput(e.target.value)}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={() => validateAndSetCustomDuration(customDurationInput)}>
                    적용
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={handleAiRecommendDuration} disabled={aiDurationLoading}>
                    {aiDurationLoading ? '추천 받는 중…' : 'AI가 기간 추천'}
                  </button>
                </div>
                <p className="video-status-message">
                  선택된 기간: {durationDays}일{durationMode === 'ai_recommended' ? ' (AI 추천)' : ''}
                </p>
                {aiDurationReason && <p className="video-status-message">{aiDurationReason}</p>}

                <div className="field-label" style={{ marginTop: 10 }}>
                  강도
                </div>
                <div className="chip-row">
                  {INTENSITY_OPTIONS.map((o) => (
                    <button key={o.value} className={`chip ${intensity === o.value ? 'active' : ''}`} onClick={() => setIntensity(o.value)}>
                      {o.label}
                    </button>
                  ))}
                </div>

                {curriculumError && <div className="ai-inline-warning">{curriculumError}</div>}
                <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
                  <button className="btn btn-primary" onClick={handleCreateCurriculum} disabled={creatingCurriculum}>
                    {creatingCurriculum ? '생성 중…' : '커리큘럼 생성'}
                  </button>
                </div>
              </div>
            )}

            {sparringTimeline.length > 0 && (
              <div className="card info-card info-card--muted">
                <h3>스파링 스타일 타임라인</h3>
                <ul>
                  {sparringTimeline.map((s, i) => (
                    <li key={s.sessionId}>
                      스파링 {i + 1} ({s.date.slice(0, 10)}) → {s.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {monthlyTrend.length >= 2 && (
              <div className="card info-card info-card--muted">
                <h3>나의 스타일 변화</h3>
                <p>{monthlyTrend.map((m) => `${m.month} ${m.label}`).join(' → ')}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
