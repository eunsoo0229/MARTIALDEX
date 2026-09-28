import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { FighterCandidate, FighterStyleAnalysis, Intensity, TechniqueMatch, UserLevel } from '../lib/fighterStyle/types';
import { MAX_DURATION_DAYS, MIN_DURATION_DAYS } from '../lib/fighterStyle/types';
import { extractFighterQuery, identifyFighterCandidates } from '../lib/fighterStyle/fighterIdentification';
import { getOrGenerateStyleAnalysis } from '../lib/fighterStyle/styleAnalysis';
import { matchStyleToTechniques } from '../lib/fighterStyle/techniqueMatcher';
import { recommendDuration } from '../lib/fighterStyle/durationAdvisor';
import { planStyleCurriculum } from '../lib/fighterStyle/curriculumPlanner';
import { listMyStyleCurricula, saveNewStyleCurriculum, STYLE_CURRICULUM_MARTIAL_ART } from '../lib/fighterStyle/styleCurriculumService';
import { useMyActiveProgress } from '../lib/curriculum/useCurriculum';
import { useAuth } from '../lib/auth/AuthProvider';
import AiAskModal from '../components/AiAskModal';
import BackButton from '../components/BackButton';

type Step =
  | 'input'
  | 'identifying'
  | 'disambiguate'
  | 'notFound'
  | 'analyzing'
  | 'styleResult'
  | 'levelSelect'
  | 'durationChoice'
  | 'durationAiLoading'
  | 'durationAiResult'
  | 'durationManual'
  | 'intensitySelect'
  | 'preview'
  | 'creating';

const LEVEL_OPTIONS: { value: UserLevel; label: string }[] = [
  { value: 'first_time', label: '처음 시작' },
  { value: 'beginner', label: '초급' },
  { value: 'intermediate', label: '중급' },
  { value: 'advanced', label: '고급' },
];

const INTENSITY_OPTIONS: { value: Intensity; label: string; hint: string }[] = [
  { value: 'light', label: '가볍게', hint: '하루 학습량 적음, 기술을 더 세분화' },
  { value: 'normal', label: '보통', hint: '균형 잡힌 하루 학습량' },
  { value: 'intensive', label: '집중', hint: '하루 학습량 많음, 빠르게 진행' },
];

const QUICK_DURATIONS = [7, 14, 30, 45, 60, 90];

function ChoiceCard({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub?: string }) {
  return (
    <button className={`choice-card ${active ? 'choice-card--active' : ''}`} onClick={onClick}>
      <span className="choice-card__radio" aria-hidden="true">
        {active ? '●' : '○'}
      </span>
      <span>
        <span className="choice-card__title">{title}</span>
        {sub && <span className="choice-card__sub">{sub}</span>}
      </span>
    </button>
  );
}

export default function FighterStyleLearning() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const myStyleCurricula = listMyStyleCurricula();
  const activeProgress = useMyActiveProgress().filter((x) => !!x.curriculum.styleMeta);

  const [step, setStep] = useState<Step>('input');
  const [freeText, setFreeText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<FighterCandidate[]>([]);
  const [styleQuery, setStyleQuery] = useState<string | undefined>(undefined);
  const [fighter, setFighter] = useState<FighterCandidate | null>(null);
  const [styleAnalysis, setStyleAnalysis] = useState<FighterStyleAnalysis | null>(null);
  const [matches, setMatches] = useState<TechniqueMatch[]>([]);
  const [userLevel, setUserLevel] = useState<UserLevel>('beginner');
  const [durationMode, setDurationMode] = useState<'ai_recommended' | 'user_selected'>('ai_recommended');
  const [aiDuration, setAiDuration] = useState<{ recommendedDays: number; reason: string } | null>(null);
  const [durationDays, setDurationDays] = useState(30);
  const [customDurationInput, setCustomDurationInput] = useState('');
  const [durationValidationError, setDurationValidationError] = useState<string | null>(null);
  const [intensity, setIntensity] = useState<Intensity>('normal');
  const [aiOpen, setAiOpen] = useState(false);

  async function handleAnalyzeClick() {
    if (!freeText.trim()) {
      setErrorMessage('어떤 선수의 스타일을 배우고 싶은지 입력해주세요.');
      return;
    }
    setErrorMessage(null);
    setStep('identifying');
    const extracted = await extractFighterQuery(freeText);
    if (!extracted.ok) {
      setErrorMessage(extracted.message);
      setStep('input');
      return;
    }
    setStyleQuery(extracted.data.styleQuery ?? undefined);
    const found = await identifyFighterCandidates(extracted.data.fighterNameGuess);
    if (!found.ok) {
      setErrorMessage(found.message);
      setStep('input');
      return;
    }
    if (found.data.candidates.length === 0) {
      setStep('notFound');
      return;
    }
    if (found.data.candidates.length === 1) {
      void selectFighter(found.data.candidates[0]);
      return;
    }
    setCandidates(found.data.candidates);
    setStep('disambiguate');
  }

  async function selectFighter(candidate: FighterCandidate) {
    setFighter(candidate);
    setErrorMessage(null);
    setStep('analyzing');
    const analysis = await getOrGenerateStyleAnalysis(candidate);
    if (!analysis.ok) {
      setErrorMessage(analysis.message);
      setStep('input');
      return;
    }
    setStyleAnalysis(analysis.data);
    const found = await matchStyleToTechniques(analysis.data, user?.id ?? null);
    setMatches(found);
    setStep('styleResult');
  }

  async function handleAiRecommend() {
    if (!styleAnalysis || !fighter) return;
    setStep('durationAiLoading');
    const rec = await recommendDuration({
      fighterName: fighter.name,
      styleAnalysis,
      userLevel,
      matchedTechniqueCount: matches.length,
    });
    if (!rec.ok) {
      setErrorMessage(rec.message + ' 기간을 직접 선택해주세요.');
      setDurationMode('user_selected');
      setStep('durationManual');
      return;
    }
    setAiDuration(rec.data);
    setDurationDays(rec.data.recommendedDays);
    setStep('durationAiResult');
  }

  function validateAndSetCustomDuration(raw: string): boolean {
    const n = Number(raw);
    if (!raw.trim() || !Number.isFinite(n) || n <= 0) {
      setDurationValidationError('숫자로 기간을 입력해주세요.');
      return false;
    }
    if (n < MIN_DURATION_DAYS) {
      setDurationValidationError(`너무 짧은 기간입니다. 최소 ${MIN_DURATION_DAYS}일 이상으로 설정해주세요.`);
      return false;
    }
    if (n > MAX_DURATION_DAYS) {
      setDurationValidationError(`너무 긴 기간입니다. 최대 ${MAX_DURATION_DAYS}일 이하로 설정해주세요.`);
      return false;
    }
    setDurationValidationError(null);
    setDurationDays(Math.round(n));
    return true;
  }

  const preview = fighter && styleAnalysis ? planStyleCurriculum({ fighterName: fighter.name, matches, targetDays: durationDays, intensity, userLevel }) : null;

  function handleCreate() {
    if (!fighter || !styleAnalysis) return;
    setStep('creating');
    try {
      const curriculum = saveNewStyleCurriculum({
        fighterId: fighter.id,
        fighterName: fighter.name,
        targetStyle: styleQuery,
        styleAnalysis,
        matchedTechniques: matches,
        targetDays: durationDays,
        intensity,
        userLevel,
        durationMode,
      });
      navigate(`/learning/${STYLE_CURRICULUM_MARTIAL_ART}/${curriculum.id}`);
    } catch {
      setErrorMessage('커리큘럼 생성에 실패했습니다. 잠시 후 다시 시도해주세요.');
      setStep('preview');
    }
  }

  function resetWizard() {
    setStep('input');
    setFreeText('');
    setErrorMessage(null);
    setCandidates([]);
    setFighter(null);
    setStyleAnalysis(null);
    setMatches([]);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>선수 스타일 학습</span>
        </div>

        <div className="section-title">
          <h2>선수 스타일 학습</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          좋아하는 선수의 경기 스타일을 분석하고 나에게 맞는 학습 커리큘럼을 만들어보세요. 공개 경기 기록과
          분석 정보를 바탕으로 한 Martialdex의 학습용 스타일 분석이며, 선수의 실력을 공식적으로 판정하는
          자료가 아닙니다.
        </p>

        {step === 'input' && myStyleCurricula.length > 0 && (
          <section>
            <div className="section-title">
              <h2>내 스타일 커리큘럼</h2>
            </div>
            <div className="stack gap-2">
              {myStyleCurricula.map((c) => {
                const p = activeProgress.find((x) => x.curriculum.id === c.id)?.progress;
                return (
                  <Link key={c.id} to={`/learning/${STYLE_CURRICULUM_MARTIAL_ART}/${c.id}`} className="technique-row">
                    <div className="technique-row__main">
                      <div className="technique-row__name">
                        {c.coverIcon} {c.title}
                      </div>
                      <div className="technique-row__sub">
                        {c.totalDays}일 · 진행률 {p?.progress ?? 0}%
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <div className="card info-card" style={{ maxWidth: 640 }}>
          {step === 'input' && (
            <>
              <h3>어떤 선수의 스타일을 배우고 싶나요?</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                예: "마카체프 스타일을 배우고 싶어", "볼카노프스키처럼 거리 조절을 배우고 싶어", "올리베이라처럼
                서브미션 중심으로 배우고 싶어"
              </p>
              <textarea
                style={{ width: '100%', minHeight: 70 }}
                placeholder="예: 마카체프처럼 싸우고 싶어"
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
              />
              {errorMessage && (
                <div className="ai-error" role="alert" style={{ marginTop: 10 }}>
                  {errorMessage}
                </div>
              )}
              <div className="modal-actions modal-actions--start">
                <button className="btn btn-primary" onClick={handleAnalyzeClick}>
                  스타일 분석하기
                </button>
              </div>
            </>
          )}

          {(step === 'identifying' || step === 'analyzing' || step === 'durationAiLoading' || step === 'creating') && (
            <div className="ai-msg ai-msg--model">
              <div className="ai-msg__bubble ai-msg__bubble--loading">
                <span className="ai-typing-dot" />
                <span className="ai-typing-dot" />
                <span className="ai-typing-dot" />
              </div>
            </div>
          )}

          {step === 'notFound' && (
            <>
              <h3>선수를 찾지 못했습니다</h3>
              <p style={{ color: 'var(--text-muted)' }}>
                "{freeText}"에서 실제로 확인 가능한 선수를 찾지 못했습니다. 다른 이름이나 표기로 다시
                시도해주세요.
              </p>
              <button className="btn btn-secondary" onClick={resetWizard}>
                다시 입력하기
              </button>
            </>
          )}

          {step === 'disambiguate' && (
            <>
              <h3>어떤 선수를 말씀하시는 건가요?</h3>
              <div className="stack gap-2">
                {candidates.map((c) => (
                  <button key={c.id} className="technique-row" onClick={() => void selectFighter(c)}>
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

          {step === 'styleResult' && styleAnalysis && fighter && (
            <>
              <h3>🥋 {styleAnalysis.fighterName} 스타일 분석</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                공개 경기 기록과 분석 정보를 바탕으로 한 Martialdex의 학습용 스타일 분석입니다.
              </p>
              <p>{styleAnalysis.styleSummary}</p>

              <div className="field-label">핵심 스타일</div>
              <div className="chip-row" style={{ marginBottom: 12 }}>
                {styleAnalysis.primaryStyles.map((s) => (
                  <span className="chip" key={s}>
                    {s}
                  </span>
                ))}
              </div>

              <div className="field-label">주요 학습 요소 (관련 Martialdex 기술)</div>
              {matches.length === 0 ? (
                <p className="video-status-message">
                  현재 Martialdex 기술 데이터에서 직접적으로 대응되는 기술을 찾지 못했습니다.
                </p>
              ) : (
                <ol style={{ fontSize: 13.5 }}>
                  {matches.slice(0, 8).map((m) => (
                    <li key={m.techniqueId}>
                      {m.techniqueName} <span style={{ color: 'var(--text-faint)' }}>({m.reason})</span>
                    </li>
                  ))}
                </ol>
              )}

              <div className="modal-actions modal-actions--start">
                <button className="btn btn-secondary" onClick={() => setAiOpen(true)}>
                  ✦ AI에게 질문하기
                </button>
                <button
                  className="btn btn-primary"
                  disabled={matches.length === 0}
                  onClick={() => setStep('levelSelect')}
                >
                  이 스타일로 커리큘럼 만들기
                </button>
              </div>
            </>
          )}

          {step === 'levelSelect' && (
            <>
              <h3>현재 격투기 경험이 어느 정도인가요?</h3>
              <div className="stack gap-1">
                {LEVEL_OPTIONS.map((o) => (
                  <ChoiceCard key={o.value} active={userLevel === o.value} onClick={() => setUserLevel(o.value)} title={o.label} />
                ))}
              </div>
              <div className="modal-actions modal-actions--start">
                <button className="btn btn-primary" onClick={() => setStep('durationChoice')}>
                  다음
                </button>
              </div>
            </>
          )}

          {step === 'durationChoice' && (
            <>
              <h3>학습 기간을 어떻게 정할까요?</h3>
              <div className="stack gap-1">
                <ChoiceCard
                  active={durationMode === 'ai_recommended'}
                  onClick={() => setDurationMode('ai_recommended')}
                  title="AI에게 추천받기"
                />
                <ChoiceCard
                  active={durationMode === 'user_selected'}
                  onClick={() => setDurationMode('user_selected')}
                  title="직접 정하기"
                />
              </div>
              <div className="modal-actions modal-actions--start">
                <button
                  className="btn btn-primary"
                  onClick={() => (durationMode === 'ai_recommended' ? void handleAiRecommend() : setStep('durationManual'))}
                >
                  다음
                </button>
              </div>
            </>
          )}

          {step === 'durationAiResult' && aiDuration && (
            <>
              <h3>AI 추천 학습 기간: {aiDuration.recommendedDays}일</h3>
              <p style={{ color: 'var(--text-muted)' }}>{aiDuration.reason}</p>
              <div className="modal-actions modal-actions--start">
                <button className="btn btn-primary" onClick={() => setStep('intensitySelect')}>
                  이 기간으로 만들기
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setDurationMode('user_selected');
                    setStep('durationManual');
                  }}
                >
                  기간 변경
                </button>
              </div>
            </>
          )}

          {step === 'durationManual' && (
            <>
              <h3>학습 기간을 선택하세요</h3>
              <div className="chip-row" style={{ marginBottom: 12 }}>
                {QUICK_DURATIONS.map((d) => (
                  <button
                    key={d}
                    className={`chip ${durationDays === d ? 'active' : ''}`}
                    onClick={() => {
                      setDurationDays(d);
                      setDurationValidationError(null);
                      setCustomDurationInput('');
                    }}
                  >
                    {d}일
                  </button>
                ))}
              </div>
              <div className="chip-row">
                <input
                  type="number"
                  className="select"
                  style={{ width: 100 }}
                  placeholder="직접 입력"
                  value={customDurationInput}
                  onChange={(e) => setCustomDurationInput(e.target.value)}
                />
                <span>일</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => validateAndSetCustomDuration(customDurationInput)}
                >
                  적용
                </button>
              </div>
              {durationValidationError && <div className="ai-inline-warning">{durationValidationError}</div>}
              <p style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>선택된 기간: {durationDays}일</p>
              <div className="modal-actions modal-actions--start">
                <button className="btn btn-primary" onClick={() => setStep('intensitySelect')}>
                  다음
                </button>
              </div>
            </>
          )}

          {step === 'intensitySelect' && (
            <>
              <h3>학습 강도</h3>
              <div className="stack gap-1">
                {INTENSITY_OPTIONS.map((o) => (
                  <ChoiceCard key={o.value} active={intensity === o.value} onClick={() => setIntensity(o.value)} title={o.label} sub={o.hint} />
                ))}
              </div>
              <div className="modal-actions modal-actions--start">
                <button className="btn btn-primary" onClick={() => setStep('preview')}>
                  커리큘럼 미리보기
                </button>
              </div>
            </>
          )}

          {step === 'preview' && preview && fighter && (
            <>
              <h3>🥋 {fighter.name} Style</h3>
              <div className="curriculum-stat-row">
                <div>
                  <strong>{durationDays}일</strong>
                  <span>학습 기간</span>
                </div>
                <div>
                  <strong>{durationMode === 'ai_recommended' ? 'AI 추천' : '직접 설정'}</strong>
                  <span>기간 설정</span>
                </div>
                <div>
                  <strong>{INTENSITY_OPTIONS.find((o) => o.value === intensity)?.label}</strong>
                  <span>학습 강도</span>
                </div>
                <div>
                  <strong>{LEVEL_OPTIONS.find((o) => o.value === userLevel)?.label}</strong>
                  <span>사용자 수준</span>
                </div>
              </div>
              <div className="field-label">단계별 구성</div>
              <ol style={{ fontSize: 13.5 }}>
                {preview.phases.map((p) => (
                  <li key={p.name}>
                    {p.name} — Day {p.startDay}~{p.endDay}
                  </li>
                ))}
                {preview.days.length > (preview.phases.at(-1)?.endDay ?? 0) && (
                  <li>
                    종합 복습 — Day {(preview.phases.at(-1)?.endDay ?? 0) + 1}~{preview.days.length}
                  </li>
                )}
              </ol>
              <div className="modal-actions modal-actions--start">
                <button className="btn btn-primary" onClick={handleCreate}>
                  커리큘럼 생성
                </button>
                <button className="btn btn-secondary" onClick={() => setStep('durationChoice')}>
                  기간 변경
                </button>
                <button className="btn btn-ghost" onClick={resetWizard}>
                  취소
                </button>
              </div>
              {errorMessage && (
                <div className="ai-error" role="alert" style={{ marginTop: 10 }}>
                  {errorMessage}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {aiOpen && styleAnalysis && (
        <AiAskModal
          onClose={() => setAiOpen(false)}
          fighterStyleContext={{ styleAnalysis, matchedTechniques: matches, userLevel }}
        />
      )}
    </div>
  );
}
