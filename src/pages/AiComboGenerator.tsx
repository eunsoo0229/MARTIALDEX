import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { martialArtSummaries } from '../lib/loadData';
import { MMA_MARTIAL_ART_ID } from '../lib/mmaCurriculum/types';
import { generateCombo } from '../lib/aiCombo/service';
import { readAiComboDraft, writeAiComboDraft, type AiComboDraft } from '../lib/aiCombo/draftStore';
import { createCombo } from '../lib/combo/service';
import { resolveTechnique } from '../lib/userTechniques/service';
import { getDefaultExerciseConfig } from '../lib/todayTraining/exerciseDefaults';
import { addDraftEntry, setDraftMartialArt } from '../lib/freeTraining/draftStore';
import { useAuth } from '../lib/auth/AuthProvider';
import BackButton from '../components/BackButton';

const OFFENSE_DEFENSE_LABEL: Record<string, string> = { offense: '공격', defense: '방어/카운터', mixed: '복합' };

export default function AiComboGenerator() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const initial = readAiComboDraft();

  const [martialArt, setMartialArt] = useState(initial?.martialArt || martialArtSummaries[0]?.id || 'boxing');
  const [freeText, setFreeText] = useState(initial?.freeText ?? '');
  const [preview, setPreview] = useState(initial?.preview ?? null);
  const [errorMessage, setErrorMessage] = useState(initial?.errorMessage ?? null);
  const [loading, setLoading] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  function persist(next: Partial<AiComboDraft>) {
    writeAiComboDraft({
      freeText: next.freeText ?? freeText,
      martialArt: next.martialArt ?? martialArt,
      preview: next.preview !== undefined ? next.preview : preview,
      errorMessage: next.errorMessage !== undefined ? next.errorMessage : errorMessage,
    });
  }

  async function handleGenerate() {
    if (!freeText.trim()) {
      setErrorMessage('원하는 목적을 입력해주세요.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSaveMessage(null);
    const outcome = await generateCombo({ freeText, martialArt, userId: user?.id ?? null });
    setLoading(false);
    if (!outcome.ok) {
      setPreview(null);
      setErrorMessage(outcome.message);
      persist({ preview: null, errorMessage: outcome.message, freeText, martialArt });
      return;
    }
    setPreview(outcome.preview);
    setErrorMessage(null);
    persist({ preview: outcome.preview, errorMessage: null, freeText, martialArt });
  }

  const resolvedResults = preview?.results.filter((r) => r.techniqueId) ?? [];

  function handleAddToFreeTraining() {
    if (resolvedResults.length === 0 || !preview) return;
    setDraftMartialArt(preview.martialArt === MMA_MARTIAL_ART_ID ? preview.martialArt : preview.martialArt);
    for (const r of resolvedResults) {
      const technique = resolveTechnique(r.techniqueId!);
      if (!technique) continue;
      addDraftEntry({ techniqueId: technique.id, config: getDefaultExerciseConfig(technique) });
    }
    navigate('/free-training');
  }

  function handleSaveCombo() {
    if (resolvedResults.length < 2 || !preview) {
      setSaveMessage('저장하려면 최소 2개 이상의 기술이 확보되어야 합니다.');
      return;
    }
    const name = saveName.trim() || preview.analysis.summary.replace(/^목적:\s*/, '').slice(0, 40) || 'AI 콤비네이션';
    const combo = createCombo({
      name,
      description: preview.goalText,
      techniqueIds: resolvedResults.map((r) => r.techniqueId!),
      aiComboMeta: {
        goalText: preview.goalText,
        stepReasons: resolvedResults.map((r) => r.reason),
        generatedAt: preview.generatedAt,
        analysis: {
          offenseOrDefense: preview.analysis.offenseOrDefense,
          startingSituation: preview.analysis.startingSituation,
          range: preview.analysis.range,
          position: preview.analysis.position,
          finalGoal: preview.analysis.finalGoal,
          stepDetails: resolvedResults.map((r) => ({ opponentReaction: r.step.opponentReaction, followUpIfReacts: r.step.followUpIfReacts })),
          pros: preview.analysis.pros,
          cautions: preview.analysis.cautions,
          complementaryFollowUps: preview.complementaryFollowUps.map((s) => ({ techniqueId: s.techniqueId, techniqueName: s.techniqueName })),
          alternativeTechniques: preview.alternativeTechniques.map((s) => ({ techniqueId: s.techniqueId, techniqueName: s.techniqueName })),
        },
      },
    });
    setSaveMessage('콤보로 저장했습니다.');
    navigate(`/combos/${combo.id}/train`);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>AI 콤비네이션 생성</span>
        </div>
        <div className="section-title">
          <h2>🧠 AI 목적 기반 콤비네이션 생성</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          원하는 목적이나 상황을 자유롭게 입력하면 AI가 논리적으로 연결된 기술 콤비네이션을 만들어줍니다. Martialdex
          기술 라이브러리에 없는 기술은 인터넷에서 조사해 검증 후 새로 등록합니다.
        </p>

        <div className="card info-card">
          <label className="field-label">무술</label>
          <select className="select" style={{ width: '100%', marginBottom: 12 }} value={martialArt} onChange={(e) => setMartialArt(e.target.value)}>
            {martialArtSummaries.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nameKo}
              </option>
            ))}
            <option value={MMA_MARTIAL_ART_ID}>MMA (Mixed Martial Arts, 종합)</option>
          </select>
          <label className="field-label">원하는 목적</label>
          <textarea
            style={{ width: '100%', minHeight: 70, marginBottom: 12 }}
            placeholder="예: 상대를 케이지로 몰아넣고 테이크다운하고 싶어"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
          />
          <div className="modal-actions modal-actions--start">
            <button className="btn btn-primary" disabled={loading} onClick={handleGenerate}>
              {loading ? '생성 중...' : '콤비네이션 생성'}
            </button>
          </div>
          {errorMessage && <p className="video-status-message">{errorMessage}</p>}
        </div>

        {preview && (
          <>
            <div className="card info-card">
              <h3>목적 분석</h3>
              <p className="detail-hero__korean">{preview.analysis.summary}</p>
              <div className="curriculum-stat-row">
                <div>
                  <strong>{OFFENSE_DEFENSE_LABEL[preview.analysis.offenseOrDefense] ?? preview.analysis.offenseOrDefense}</strong>
                  <span>유형</span>
                </div>
                <div>
                  <strong>{preview.analysis.range}</strong>
                  <span>거리</span>
                </div>
                <div>
                  <strong>{preview.analysis.position}</strong>
                  <span>포지션</span>
                </div>
                <div>
                  <strong>{preview.analysis.finalGoal}</strong>
                  <span>최종 목적</span>
                </div>
              </div>
              <p className="video-status-message">시작 상황: {preview.analysis.startingSituation}</p>
              <p className="video-status-message">예상 상대 반응: {preview.analysis.expectedOpponentReaction}</p>
            </div>

            <div className="card info-card">
              <h3>🔗 AI 콤비네이션</h3>
              <div className="stack gap-2">
                {preview.results.map((r, i) => (
                  <div key={i} className="card info-card info-card--muted">
                    <div className="technique-row__main" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        {i + 1}.{' '}
                        {r.techniqueId ? (
                          <Link to={`/arts/${r.martialArt}/techniques/${r.techniqueId}`} className="technique-row__name">
                            {r.techniqueName}
                          </Link>
                        ) : (
                          <span className="technique-row__name">{r.step.phrase} (기술을 찾지 못함)</span>
                        )}
                        {r.discovered && <span className="chip" style={{ marginLeft: 6 }}>🔎 새로 발견됨</span>}
                      </div>
                    </div>
                    <p className="video-status-message">↳ {r.reason}</p>
                    {r.step.opponentReaction && <p className="video-status-message">🛡 상대 반응: {r.step.opponentReaction}</p>}
                    {r.step.followUpIfReacts && <p className="video-status-message">➡ 다음 선택지: {r.step.followUpIfReacts}</p>}
                  </div>
                ))}
              </div>
            </div>

            {(preview.analysis.pros.length > 0 || preview.analysis.cautions.length > 0) && (
              <div className="card info-card">
                <h3>⚖️ 장점 &amp; 주의할 점</h3>
                {preview.analysis.pros.length > 0 && (
                  <>
                    <div className="field-label">장점</div>
                    <ul style={{ marginBottom: 10 }}>
                      {preview.analysis.pros.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </>
                )}
                {preview.analysis.cautions.length > 0 && (
                  <>
                    <div className="field-label">주의할 점</div>
                    <ul>
                      {preview.analysis.cautions.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {(preview.complementaryFollowUps.length > 0 || preview.alternativeTechniques.length > 0) && (
              <div className="card info-card">
                <h3>🔀 보완/대체 기술</h3>
                {preview.complementaryFollowUps.length > 0 && (
                  <>
                    <div className="field-label">성공 후 이어가면 좋은 기술</div>
                    <div className="chip-row" style={{ marginBottom: 10 }}>
                      {preview.complementaryFollowUps.map((s, i) =>
                        s.techniqueId ? (
                          <Link key={i} to={`/arts/${s.martialArt}/techniques/${s.techniqueId}`} className="chip">
                            {s.techniqueName}
                          </Link>
                        ) : (
                          <span key={i} className="chip">
                            {s.phrase}
                          </span>
                        )
                      )}
                    </div>
                  </>
                )}
                {preview.alternativeTechniques.length > 0 && (
                  <>
                    <div className="field-label">다른 상황의 대체 기술</div>
                    <div className="chip-row">
                      {preview.alternativeTechniques.map((s, i) =>
                        s.techniqueId ? (
                          <Link key={i} to={`/arts/${s.martialArt}/techniques/${s.techniqueId}`} className="chip">
                            {s.techniqueName}
                          </Link>
                        ) : (
                          <span key={i} className="chip">
                            {s.phrase}
                          </span>
                        )
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="card info-card">
              <div className="modal-actions modal-actions--start">
                <button className="btn btn-primary" disabled={resolvedResults.length === 0} onClick={handleAddToFreeTraining}>
                  자유훈련에 추가
                </button>
              </div>
              <label className="field-label" style={{ marginTop: 10 }}>
                콤보 이름 (저장 시)
              </label>
              <input
                className="select"
                style={{ width: '100%', marginBottom: 8 }}
                placeholder="예: 케이지 압박 테이크다운"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
              />
              <div className="modal-actions modal-actions--start">
                <button className="btn btn-secondary" disabled={resolvedResults.length < 2} onClick={handleSaveCombo}>
                  콤보로 저장
                </button>
              </div>
              {saveMessage && <p className="video-status-message">{saveMessage}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
