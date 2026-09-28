import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getPersonalCoachRecommendation } from '../lib/personalCoach/service';
import type { PersonalCoachResult } from '../lib/personalCoach/service';
import BackButton from '../components/BackButton';

type Step = 'input' | 'loading' | 'result' | 'error';

const EXAMPLES = [
  '복싱 풋워크가 부족한 것 같아.',
  '레슬링 테이크다운을 더 연습하고 싶어.',
  '타격과 그래플링을 균형 있게 훈련하고 싶어.',
  '내 훈련 기록을 보고 부족한 부분을 알려줘.',
];

// 바로가기 대상 — 기술 상세는 추천 기술 칩 자체가 링크이므로 여기 목록에는
// 넣지 않는다 (spec section 4 나머지 항목).
const SHORTCUTS: { to: string; label: string }[] = [
  { to: '/learning', label: '📘 커리큘럼' },
  { to: '/today-training', label: '🔥 훈련하기' },
  { to: '/my-skills', label: '📷 자세 분석' },
  { to: '/sparring', label: '🥊 스파링 분석' },
  { to: '/combos', label: '🥋 콤보' },
  { to: '/tactics', label: '🧩 전술' },
  { to: '/training-analytics', label: '📊 훈련 기록' },
];

export default function PersonalCoach() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('input');
  const [freeText, setFreeText] = useState('');
  const [result, setResult] = useState<PersonalCoachResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleAsk() {
    if (!freeText.trim()) {
      setErrorMessage('원하는 목표나 부족한 부분을 입력해주세요.');
      setStep('error');
      return;
    }
    setStep('loading');
    try {
      const r = await getPersonalCoachRecommendation(freeText.trim());
      setResult(r);
      setStep('result');
    } catch {
      setErrorMessage('AI 추천을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      setStep('error');
    }
  }

  function handleMakeCurriculum() {
    if (!result) return;
    navigate('/ai-curriculum', { state: { freeText: result.curriculumGoalText, martialArt: result.suggestedMartialArt ?? undefined } });
  }

  return (
    <div className="page">
      <div className="container container--narrow">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>AI Personal Combat Coach</span>
        </div>

        <div className="section-title">
          <h2>🥊 AI Personal Combat Coach</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          원하는 목표나 부족한 부분을 자유롭게 말해보세요. 실제 저장된 훈련 데이터를 근거로 추천해드립니다.
        </p>

        {(step === 'input' || step === 'error') && (
          <div className="card info-card ai-step--input">
            <textarea
              className="field-full"
              style={{ minHeight: 90 }}
              placeholder="예: 복싱 풋워크가 부족한 것 같아."
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
            />
            <div className="chip-row" style={{ marginTop: 8 }}>
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="chip" onClick={() => setFreeText(ex)}>
                  {ex}
                </button>
              ))}
            </div>
            {step === 'error' && errorMessage && <div className="ai-inline-warning">{errorMessage}</div>}
            <div className="modal-actions modal-actions--start" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={handleAsk}>
                AI에게 물어보기
              </button>
            </div>
          </div>
        )}

        {step === 'loading' && (
          <div className="card info-card text-center">
            <p className="video-status-message row gap-1" style={{ justifyContent: 'center' }}>
              <span className="spinner" /> 실제 훈련 데이터를 분석하고 있습니다...
            </p>
          </div>
        )}

        {step === 'result' && result && (
          <>
            <div className="card info-card">
              <h3>AI 분석</h3>
              <p>{result.analysisSummary}</p>
              {result.source === 'fallback' && <p className="video-status-message">AI 분석을 불러오지 못해 기본 안내를 표시하고 있습니다.</p>}
            </div>

            {result.recommendedTechniques.length > 0 && (
              <div className="card info-card">
                <h3>🎯 추천 기술</h3>
                <div className="chip-row">
                  {result.recommendedTechniques.map((t) => (
                    <Link key={t.id} to={`/arts/${t.martialArt}/techniques/${t.id}`} className="chip active">
                      {t.koreanName || t.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="card info-card">
              <div className="stack gap-2">
                <div>
                  <div className="field-label">추천 훈련</div>
                  <p style={{ margin: 0 }}>{result.recommendedTraining}</p>
                </div>
                {result.underTrainedAreas && (
                  <div>
                    <div className="field-label">부족한 영역</div>
                    <p style={{ margin: 0 }}>{result.underTrainedAreas}</p>
                  </div>
                )}
                <div>
                  <div className="field-label">커리큘럼 방향</div>
                  <p style={{ margin: 0 }}>{result.curriculumDirection}</p>
                </div>
                <div>
                  <div className="field-label">다음 훈련</div>
                  <p style={{ margin: 0 }}>{result.nextTraining}</p>
                </div>
              </div>
              <div className="modal-actions modal-actions--start" style={{ marginTop: 12 }}>
                <button className="btn btn-primary" onClick={handleMakeCurriculum}>
                  이 추천으로 커리큘럼 만들기
                </button>
                <button className="btn btn-ghost" onClick={() => setStep('input')}>
                  다시 물어보기
                </button>
              </div>
            </div>

            <div className="card info-card">
              <h3>바로가기</h3>
              <div className="chip-row">
                {SHORTCUTS.map((s) => (
                  <Link key={s.to} to={s.to} className="chip">
                    {s.label}
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
