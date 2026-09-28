import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { martialArtSummaries } from '../lib/loadData';
import { getUnifiedMartialArtSummaries } from '../lib/userTechniques/service';
import { useCustomMartialArtLibraryVersion } from '../lib/customMartialArt/useCustomMartialArtLibrary';
import { GOAL_DAILY_MINUTES_PRESETS, GOAL_DURATION_PRESETS, GOAL_MAX_DURATION_DAYS, GOAL_MIN_DURATION_DAYS } from '../lib/aiCurriculum/types';
import type { GoalCurriculumPreview, InsufficientWebEvidenceSummary } from '../lib/aiCurriculum/service';
import { generateGoalCurriculumPreview, saveGoalCurriculumPreview } from '../lib/aiCurriculum/service';
import { getProgress } from '../lib/curriculum/curriculumService';
import { useMyCurricula } from '../lib/curriculum/useCurriculum';
import { MMA_MARTIAL_ART_ID } from '../lib/mmaCurriculum/types';
import { getMmaAreaAnalysis, type MmaAreaAnalysis } from '../lib/mmaCurriculum/mmaAnalysis';
import { useAuth } from '../lib/auth/AuthProvider';
import BackButton from '../components/BackButton';
import ResearchResultsCard from '../components/ResearchResultsCard';

type Step = 'input' | 'generating' | 'clarifying' | 'preview' | 'saving' | 'error';

const EXAMPLES = [
  '복싱 풋워크가 부족해',
  '인파이팅 능력을 키우고 싶어',
  '테이크다운 방어를 집중적으로 배우고 싶어',
  '복싱을 처음 시작해서 기본기를 차근차근 배우고 싶어',
  '마카체프처럼 클린치와 그라운드 컨트롤을 잘하고 싶어',
];

const MMA_EXAMPLES = [
  'MMA에서 테이크다운 방어가 부족해',
  'MMA에서 타격 후 테이크다운 연결을 연습하고 싶어',
  'MMA 기본기를 전체적으로 배우고 싶어',
  '그래플링이 약한 MMA 선수 스타일로 훈련하고 싶어',
];

export default function AiGoalCurriculum() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  // AI Personal Combat Coach (29단계) hands its recommendation off here as
  // router state instead of a second curriculum-generation pipeline — this
  // page's own existing flow does all the real work from this point on.
  const handoffState = location.state as { freeText?: string; martialArt?: string } | null;
  const [step, setStep] = useState<Step>('input');
  const [freeText, setFreeText] = useState(handoffState?.freeText ?? '');
  const [martialArt, setMartialArt] = useState(handoffState?.martialArt ?? martialArtSummaries[0]?.id ?? 'boxing');
  // 사용자가 새로 추가한 무술(spec "MARTIALDEX 신규 무술 추가 시스템")도 드롭다운에
  // 즉시 나타나야 하므로 정적 martialArtSummaries가 아닌 unified 목록을 쓴다.
  useCustomMartialArtLibraryVersion();
  const availableMartialArts = getUnifiedMartialArtSummaries();
  const [mmaAreaAnalysis, setMmaAreaAnalysis] = useState<MmaAreaAnalysis | null>(null);
  const [mmaAnalysisLoading, setMmaAnalysisLoading] = useState(false);
  const myCurricula = useMyCurricula();
  const myGoalCurricula = useMemo(() => myCurricula.filter((c) => !!c.aiGoalMeta), [myCurricula]);
  const [durationSelectValue, setDurationSelectValue] = useState<string>('30');
  const [customDurationInput, setCustomDurationInput] = useState('30');
  const [dailyMinutes, setDailyMinutes] = useState(30);
  // Default false — opting in changes what content the AI is allowed to
  // pick from, so it must be a deliberate choice rather than a surprise
  // behavior change for existing users (spec section 10's "기존 UX를 깨지
  //않도록").
  const [excludeLearnedTechniques, setExcludeLearnedTechniques] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** Set only when the last error was code 'INSUFFICIENT_WEB_EVIDENCE' — spec section 17/18: distinct wording + real search-stat transparency + a "다시 검색" retry that re-runs generation directly instead of sending the user back to the input form. */
  const [insufficientEvidence, setInsufficientEvidence] = useState<InsufficientWebEvidenceSummary | null>(null);
  const [clarifyingQuestion, setClarifyingQuestion] = useState<string | null>(null);
  const [clarifyingAnswerInput, setClarifyingAnswerInput] = useState('');
  const [refinementHistory, setRefinementHistory] = useState<string[]>([]);
  const [refinementInput, setRefinementInput] = useState('');
  const [preview, setPreview] = useState<GoalCurriculumPreview | null>(null);
  const [saving, setSaving] = useState(false);

  function resolvedDurationDays(): number | 'ai_recommended' {
    if (durationSelectValue === 'ai_recommended') return 'ai_recommended';
    if (durationSelectValue === 'custom') {
      const n = Number(customDurationInput);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 30;
    }
    return Number(durationSelectValue);
  }

  async function runGenerate(opts: { clarifyingAnswer?: string; skipClarifying?: boolean; history?: string[] } = {}) {
    setStep('generating');
    setErrorMessage(null);
    setInsufficientEvidence(null);
    const history = opts.history ?? refinementHistory;
    const result = await generateGoalCurriculumPreview({
      freeText,
      martialArt,
      durationDays: resolvedDurationDays(),
      dailyMinutes,
      clarifyingAnswer: opts.clarifyingAnswer,
      skipClarifying: opts.skipClarifying,
      refinementHistory: history,
      userId: user?.id ?? null,
      excludeLearnedTechniques,
    });
    if (!result.ok) {
      if (result.code === 'CLARIFYING_NEEDED') {
        setClarifyingQuestion(result.question);
        setStep('clarifying');
        return;
      }
      if (result.code === 'INSUFFICIENT_WEB_EVIDENCE') {
        // Spec section 17's exact wording — never claims the search itself
        // failed (it didn't), and never silently falls back to a
        // DB-padded curriculum.
        setErrorMessage(
          '⚠ 검색 근거가 충분하지 않습니다.\n\n실시간 웹 검색은 실행되었지만 현재 목표와 직접적으로 관련된 자료를 충분히 찾지 못했습니다.\n\n정확하지 않은 기술을 임의로 추가하지 않고 커리큘럼 생성을 중단했습니다.'
        );
        setInsufficientEvidence(result.research);
        setStep('error');
        return;
      }
      const message =
        result.code === 'VALIDATION_FAILED'
          ? `커리큘럼 생성 결과에 문제가 있어 저장하지 않았습니다:\n${result.errors.join('\n')}`
          : result.message;
      setErrorMessage(message);
      setStep('error');
      return;
    }
    setPreview(result.preview);
    setRefinementHistory(history);
    setStep('preview');
    setMmaAreaAnalysis(null);
    if (result.preview.martialArt === MMA_MARTIAL_ART_ID) {
      setMmaAnalysisLoading(true);
      try {
        setMmaAreaAnalysis(await getMmaAreaAnalysis(result.preview.matchedTechniques, freeText));
      } finally {
        setMmaAnalysisLoading(false);
      }
    }
  }

  function handleGenerateClick() {
    if (!freeText.trim()) {
      setErrorMessage('원하는 목표나 부족한 부분을 입력해주세요.');
      setStep('error');
      return;
    }
    void runGenerate();
  }

  function handleClarifyingAnswer() {
    void runGenerate({ clarifyingAnswer: clarifyingAnswerInput.trim() || undefined, skipClarifying: !clarifyingAnswerInput.trim() });
  }

  function handleClarifyingSkip() {
    void runGenerate({ skipClarifying: true });
  }

  function handleRegenerate() {
    if (!refinementInput.trim()) return;
    const nextHistory = [...refinementHistory, refinementInput.trim()];
    setRefinementInput('');
    void runGenerate({ history: nextHistory, skipClarifying: true });
  }

  async function handleSave() {
    if (!preview) return;
    setSaving(true);
    try {
      const curriculum = saveGoalCurriculumPreview(preview);
      navigate(`/learning/${curriculum.martialArt}/${curriculum.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/learning">학습</Link>
          <span>/</span>
          <span>AI 맞춤 커리큘럼</span>
        </div>
        <div className="section-title">
          <h2>🧠 AI 맞춤 커리큘럼</h2>
        </div>

        {step === 'input' && (
          <>
            <p className="video-status-message">원하는 훈련 목표나 부족한 부분을 자유롭게 적어주세요.</p>

            {myGoalCurricula.length > 0 && (
              <div className="card info-card">
                <h3>내가 만든 AI 맞춤 커리큘럼</h3>
                <div className="stack gap-2">
                  {myGoalCurricula.map((c) => {
                    const progress = getProgress(c.id);
                    const isMma = c.martialArt === MMA_MARTIAL_ART_ID;
                    const artLabel = isMma ? 'MMA' : availableMartialArts.find((a) => a.id === c.martialArt)?.nameKo ?? c.martialArt;
                    return (
                      <Link key={c.id} to={`/learning/${c.martialArt}/${c.id}`} className="technique-row">
                        <div className="technique-row__main">
                          <div className="technique-row__name">
                            {c.coverIcon ? `${c.coverIcon} ` : ''}
                            {isMma && <span className="chip active" style={{ marginRight: 6 }}>MMA</span>}
                            {c.title}
                          </div>
                          <div className="technique-row__sub">
                            {artLabel} · {c.totalDays}일 커리큘럼 · 진행률 {progress?.progress ?? 0}%
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="card info-card ai-step--input">
              <textarea
                className="field-full"
                style={{ minHeight: 90 }}
                placeholder="원하는 목표를 입력하세요..."
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
              />
              <div className="chip-row" style={{ marginTop: 8 }}>
                {(martialArt === MMA_MARTIAL_ART_ID ? MMA_EXAMPLES : EXAMPLES).map((ex) => (
                  <button key={ex} type="button" className="chip" onClick={() => setFreeText(ex)}>
                    {ex}
                  </button>
                ))}
              </div>

              <div className="chip-row" style={{ marginTop: 16 }}>
                <div>
                  <label className="field-label">무술</label>
                  <br />
                  <select className="select" value={martialArt} onChange={(e) => setMartialArt(e.target.value)}>
                    {availableMartialArts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nameKo}
                      </option>
                    ))}
                    <option value={MMA_MARTIAL_ART_ID}>MMA (Mixed Martial Arts)</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">훈련 기간</label>
                  <br />
                  <select className="select" value={durationSelectValue} onChange={(e) => setDurationSelectValue(e.target.value)}>
                    {GOAL_DURATION_PRESETS.map((d) => (
                      <option key={d} value={d}>
                        {d}일
                      </option>
                    ))}
                    <option value="ai_recommended">AI 추천</option>
                    <option value="custom">직접 입력</option>
                  </select>
                  {durationSelectValue === 'custom' && (
                    <input
                      type="number"
                      className="select"
                      style={{ width: 90, marginLeft: 8 }}
                      min={GOAL_MIN_DURATION_DAYS}
                      max={GOAL_MAX_DURATION_DAYS}
                      placeholder="일"
                      value={customDurationInput}
                      onChange={(e) => setCustomDurationInput(e.target.value)}
                    />
                  )}
                </div>
                <div>
                  <label className="field-label">하루 예상 훈련 시간</label>
                  <br />
                  <select className="select" value={dailyMinutes} onChange={(e) => setDailyMinutes(Number(e.target.value))}>
                    {GOAL_DAILY_MINUTES_PRESETS.map((m) => (
                      <option key={m} value={m}>
                        {m}분
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="video-status-message" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, cursor: 'pointer' }}>
                <input type="checkbox" checked={excludeLearnedTechniques} onChange={(e) => setExcludeLearnedTechniques(e.target.checked)} />
                이미 학습한 기술 커리큘럼에 넣지 않기
              </label>

              <div className="modal-actions modal-actions--start" style={{ marginTop: 16 }}>
                <button className="btn btn-primary" onClick={handleGenerateClick}>
                  AI에게 커리큘럼 만들기
                </button>
              </div>
            </div>
          </>
        )}

        {step === 'generating' && (
          <div className="card info-card text-center">
            <p className="video-status-message row gap-1" style={{ justifyContent: 'center' }}>
              <span className="spinner" /> AI가 입력하신 목표를 분석하고 커리큘럼을 만들고 있습니다...
            </p>
          </div>
        )}

        {step === 'clarifying' && clarifyingQuestion && (
          <div className="card info-card ai-step--input">
            <h3>추가로 하나만 확인할게요</h3>
            <p>{clarifyingQuestion}</p>
            <input
              className="select field-full"
              style={{ marginBottom: 12 }}
              placeholder="답변을 입력하세요 (건너뛰어도 괜찮습니다)"
              value={clarifyingAnswerInput}
              onChange={(e) => setClarifyingAnswerInput(e.target.value)}
            />
            <div className="modal-actions modal-actions--start">
              <button className="btn btn-primary" onClick={handleClarifyingAnswer}>
                답변하고 계속하기
              </button>
              <button className="btn btn-ghost" onClick={handleClarifyingSkip}>
                건너뛰기 (기본값 사용)
              </button>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="card info-card">
            <div className="banner banner--error" style={{ whiteSpace: 'pre-line' }}>{errorMessage}</div>
            {insufficientEvidence && (
              // Spec section 18 — lets the user tell "검색 자체가 안 된 것"
              // apart from "검색은 됐지만 관련 기술이 부족한 것".
              <p className="video-status-message" style={{ marginTop: 8 }}>
                검색 결과: {insufficientEvidence.searchResultCount}개 · 분석한 출처: {insufficientEvidence.analyzedSourceCount}개 · 발견된 기술:{' '}
                {insufficientEvidence.researchedCount}개 · 검증 통과: {insufficientEvidence.validResearchedCount}개 · 검색 시도 횟수:{' '}
                {insufficientEvidence.wavesRun}회
              </p>
            )}
            <div className="modal-actions modal-actions--start" style={{ marginTop: 12 }}>
              {insufficientEvidence ? (
                <button className="btn btn-primary" onClick={() => void runGenerate({ history: refinementHistory, skipClarifying: true })}>
                  다시 검색
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => setStep('input')}>
                  다시 시도
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'preview' && preview && (
          <>
            <div className="card info-card">
              <h3>AI 분석 결과</h3>
              <p>
                <strong>당신의 목표:</strong> {preview.analysis.summary}
              </p>
              {preview.analysis.priority.length > 0 && (
                <>
                  <p style={{ marginBottom: 4 }}>
                    <strong>주요 개선 영역</strong>
                  </p>
                  <ol style={{ marginTop: 0 }}>
                    {preview.analysis.priority.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ol>
                </>
              )}
              <div className="curriculum-stat-row">
                <div>
                  <strong>{preview.totalDays}일</strong>
                  <span>추천 과정</span>
                </div>
                <div>
                  <strong>{preview.dailyMinutes}분</strong>
                  <span>하루 훈련</span>
                </div>
                <div>
                  <strong>{preview.matchedTechniques.length}개</strong>
                  <span>매칭된 기술</span>
                </div>
              </div>
              {preview.durationMode === 'ai_recommended' && (
                <p className="video-status-message">
                  {preview.totalDays === preview.analysis.suggestedDurationDays
                    ? preview.analysis.durationReason
                    : // service.ts's diversity-mode recompute shrinks totalDays AFTER analysis.suggestedDurationDays/durationReason
                      // were already generated by Gemini — showing the stale AI sentence here would visibly contradict the
                      // number above it (e.g. "20일" reasoning under a "15일" header). Show what actually happened instead.
                      `AI가 처음 제안한 기간은 ${preview.analysis.suggestedDurationDays}일이었지만, 실제로 확보된 관련 기술 수를 기준으로 ${preview.totalDays}일로 조정했습니다.`}
                </p>
              )}
            </div>

            {preview.insufficientContent && (
              <div className="banner banner--warning">
                입력하신 목표에 딱 맞는 기술 수가 충분하지 않았습니다. 부족한 부분은 같은 무술의 다른 기술로 억지로 채우지
                않고, 대신 복습/응용 위주의 Day로 구성했습니다. 더 풍부한 커리큘럼을 원하시면 목표를 조금 더 넓게(예: 관련
                포지션이나 상황을 추가) 입력해 다시 만들어보세요.
              </div>
            )}
            {preview.contentWarning && <div className="banner banner--warning">{preview.contentWarning.message}</div>}
            {preview.qualityWarning && <div className="banner banner--warning">{preview.qualityWarning.message}</div>}
            {preview.excludedLearnedTechniqueCount > 0 && (
              <p className="video-status-message">이미 학습한 기술 {preview.excludedLearnedTechniqueCount}개를 커리큘럼 후보에서 제외했습니다.</p>
            )}

            <ResearchResultsCard research={preview.research} discoveryStats={preview.discoveryStats} matchedTechniques={preview.matchedTechniques} days={preview.days} />


            {preview.martialArt === MMA_MARTIAL_ART_ID && (
              <div className="card info-card">
                <h3>🥊 MMA 영역 분석</h3>
                <p className="video-status-message" style={{ marginTop: -6 }}>
                  Striking/Clinch/Takedown/Ground/Submission 등 실제 매칭된 기술과 훈련 기록을 기준으로 한 분석입니다.
                </p>
                {mmaAnalysisLoading ? (
                  <p className="video-status-message">분석 중…</p>
                ) : mmaAreaAnalysis ? (
                  <>
                    <div className="chip-row" style={{ flexWrap: 'wrap' }}>
                      {mmaAreaAnalysis.breakdown
                        .filter((b) => b.matchedTechniqueCount > 0 || b.trainedCount > 0)
                        .map((b) => (
                          <span key={b.area} className="chip">
                            {b.label}: 매칭 {b.matchedTechniqueCount}개 · 훈련 {b.trainedCount}회
                          </span>
                        ))}
                    </div>
                    <p style={{ marginTop: 10 }}>
                      <strong>부족한 영역:</strong> {mmaAreaAnalysis.underrepresentedAreas}
                    </p>
                    {mmaAreaAnalysis.wellCoveredAreas && (
                      <p>
                        <strong>충분한 영역:</strong> {mmaAreaAnalysis.wellCoveredAreas}
                      </p>
                    )}
                    {mmaAreaAnalysis.source === 'fallback' && (
                      <p className="video-status-message">AI 분석을 불러오지 못해 실제 데이터 기반 기본 요약을 표시합니다.</p>
                    )}
                  </>
                ) : null}
              </div>
            )}

            <div className="card info-card">
              <h3>다시 만들어달라고 하기</h3>
              <div className="chip-row" style={{ marginBottom: 8 }}>
                <input
                  className="select"
                  style={{ flex: 1, minWidth: 220 }}
                  placeholder='예: "훈련량을 줄여줘", "풋워크 비중을 더 높여줘", "초보자 수준으로 바꿔줘"'
                  value={refinementInput}
                  onChange={(e) => setRefinementInput(e.target.value)}
                />
                <button className="btn btn-secondary" onClick={handleRegenerate} disabled={!refinementInput.trim()}>
                  AI에게 다시 만들어달라고 하기
                </button>
              </div>
              {refinementHistory.length > 0 && (
                <p className="video-status-message">이전 요청: {refinementHistory.join(' / ')}</p>
              )}
            </div>

            <div className="section-title">
              <h2>Day별 커리큘럼</h2>
            </div>
            <div className="stack gap-2">
              {preview.days.map((d) => (
                <div key={d.day} className="card info-card">
                  <strong>Day {d.day}</strong> — {d.title}
                  {d.learningGoals.length > 0 && (
                    <p className="video-status-message" style={{ marginTop: 4, marginBottom: 4 }}>
                      목표: {d.learningGoals.join(' / ')}
                    </p>
                  )}
                  {d.techniqueIds.length > 0 && <p style={{ margin: 0 }}>기술: {d.techniqueIds.length}개 · {d.estimatedMinutes}분</p>}
                  {d.reviewTechniqueIds.length > 0 && d.techniqueIds.length === 0 && (
                    <p className="video-status-message" style={{ margin: 0 }}>복습: {d.reviewTechniqueIds.length}개 기술</p>
                  )}
                </div>
              ))}
            </div>

            <div className="modal-actions modal-actions--start" style={{ marginTop: 16 }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '저장 중...' : '저장하기'}
              </button>
              <button className="btn btn-ghost" onClick={() => setStep('input')}>
                처음부터 다시
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
