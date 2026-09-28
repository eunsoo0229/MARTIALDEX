import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getMartialArt, getTechnique, martialArtSummaries } from '../lib/loadData';
import { STYLE_CURRICULUM_MARTIAL_ART } from '../lib/fighterStyle/styleCurriculumService';
import { listMyActiveProgress, listMyCurricula } from '../lib/curriculum/curriculumService';
import { addTechniqueToDay, resolveTodayDay, saveCustomCurriculum } from '../lib/curriculum/curriculumService';
import { listSparringSessions } from '../lib/sparringAnalysis/sparringSessionService';
import { getSituationRecommendation } from '../lib/situationRecommend/recommendationService';
import { SITUATION_CATEGORY_LABEL, SITUATION_CATEGORY_ORDER, SITUATION_EXAMPLES } from '../lib/situationRecommend/types';
import type { SituationCategory, SituationRecommendationResult } from '../lib/situationRecommend/types';
import { addTechniqueToSession } from '../lib/todayTraining/sessionStore';
import { generateTodayTrainingPlan } from '../lib/todayTraining/planner';
import { isPoseAnalysisSupported } from '../lib/poseAnalysis/poseAnalysisConfig';
import PoseAnalysisModal from '../components/PoseAnalysisModal';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

const MARTIAL_ART_OPTIONS = [...martialArtSummaries.map((a) => ({ id: a.id, label: a.nameKo })), { id: STYLE_CURRICULUM_MARTIAL_ART, label: 'MMA' }];

function defaultMartialArt(): string {
  const active = listMyActiveProgress()[0]?.curriculum.martialArt;
  if (active) return active;
  const sparring = listSparringSessions()[0]?.martialArt;
  if (sparring) return sparring;
  return martialArtSummaries[0]?.id ?? '';
}

export default function SituationRecommend() {
  const [martialArt, setMartialArt] = useState(defaultMartialArt);
  const [category, setCategory] = useState<SituationCategory | null>(null);
  const [situationText, setSituationText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SituationRecommendationResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [poseTechniqueId, setPoseTechniqueId] = useState<string | null>(null);
  const [curriculumPickerFor, setCurriculumPickerFor] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const myCurricula = listMyCurricula();
  const poseTechnique = poseTechniqueId ? getTechnique(poseTechniqueId) : undefined;

  async function handleRecommend() {
    if (!martialArt) return;
    setLoading(true);
    setNotice(null);
    setActionMessage(null);
    try {
      const res = await getSituationRecommendation({ situationText, category, martialArt });
      setResult(res);
      if (res.recommendations.length === 0) {
        setNotice('이 상황과 관련해 추천할 만한 실제 기술을 찾지 못했습니다. 다른 표현이나 카테고리로 다시 시도해보세요.');
      } else if (res.source === 'fallback') {
        setNotice('AI 추천 문구를 불러오지 못해, 학습 기록 기반의 기본 추천을 보여드립니다.');
      }
    } catch {
      setNotice('추천을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }

  function handleAddToToday(techniqueId: string) {
    addTechniqueToSession(techniqueId, generateTodayTrainingPlan());
    setActionMessage('오늘의 훈련에 추가했습니다.');
  }

  function handleAddToCurriculum(techniqueId: string, curriculumId: string) {
    const curriculum = myCurricula.find((c) => c.id === curriculumId);
    if (!curriculum) return;
    const day = resolveTodayDay(curriculum);
    const updated = addTechniqueToDay(curriculum, day, techniqueId);
    saveCustomCurriculum(updated);
    setCurriculumPickerFor(null);
    setActionMessage(`"${curriculum.title}" Day ${day}에 추가했습니다.`);
  }

  return (
    <div className="page">
      <div className="container container--narrow">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/coach">AI 개인 코치</Link>
          <span>/</span>
          <span>상황별 기술 추천</span>
        </div>

        <div className="section-title">
          <h2>🎯 상황별 기술 추천</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          스파링/훈련 중 마주친 상황을 설명하면, 실제 Martialdex 기술 데이터에서 관련 기술을
          찾아드립니다. 교육·훈련 목적의 참고용 제안이며, 실제 대련·시합에서의 성공을 보장하지
          않습니다.
        </p>

        <div className="card info-card ai-step--input">
          <div className="field-label">무술</div>
          <select className="select" value={martialArt} onChange={(e) => setMartialArt(e.target.value)}>
            {MARTIAL_ART_OPTIONS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>

          <div className="field-label" style={{ marginTop: 12 }}>
            상황 카테고리 (선택)
          </div>
          <div className="chip-row">
            {SITUATION_CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                className={`chip ${category === c ? 'active' : ''}`}
                onClick={() => setCategory(category === c ? null : c)}
              >
                {SITUATION_CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>

          <div className="field-label" style={{ marginTop: 12 }}>
            상황 설명
          </div>
          <textarea
            placeholder="예: 상대가 계속 앞으로 압박해."
            value={situationText}
            onChange={(e) => setSituationText(e.target.value)}
          />
          <div className="chip-row" style={{ marginTop: 6 }}>
            {SITUATION_EXAMPLES.map((ex) => (
              <button key={ex} className="chip" onClick={() => setSituationText(ex)}>
                {ex}
              </button>
            ))}
          </div>

          <div className="modal-actions modal-actions--start" style={{ marginTop: 10 }}>
            <button className="btn btn-primary" onClick={handleRecommend} disabled={loading || (!situationText.trim() && !category)}>
              {loading ? '추천을 찾는 중…' : '추천 받기'}
            </button>
          </div>
        </div>

        {notice && <div className="ai-inline-warning">{notice}</div>}
        {actionMessage && <p className="video-status-message">{actionMessage}</p>}

        {result && result.recommendations.length > 0 && (
          <div className="card info-card">
            <h3>추천 기술</h3>
            <p className="field-label">
              상황: "{result.situationText || (result.category ? SITUATION_CATEGORY_LABEL[result.category] : '')}"
            </p>
            <div className="stack gap-2">
              {result.recommendations.map((r, i) => {
                const t = getTechnique(r.techniqueId);
                const art = t ? getMartialArt(t.martialArt) : undefined;
                return (
                  <div key={r.techniqueId} className="technique-row" style={{ flexWrap: 'wrap' }}>
                    <div className="technique-row__main">
                      <div className="technique-row__name">
                        {i + 1}. {r.techniqueName}
                        {r.priority === 'learning_fit' && <span className="chip" style={{ marginLeft: 6 }}>학습 중/개선 필요</span>}
                      </div>
                      <div className="technique-row__sub">{r.reason}</div>
                    </div>
                    <div className="technique-row__right" style={{ flexWrap: 'wrap', gap: 6 }}>
                      {t && (
                        <Link to={`/arts/${t.martialArt}/techniques/${t.id}`} className="btn btn-secondary btn-sm">
                          기술 상세
                        </Link>
                      )}
                      {isPoseAnalysisSupported(r.techniqueId) && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setPoseTechniqueId(r.techniqueId)}>
                          📷 자세 분석
                        </button>
                      )}
                      <button className="btn btn-secondary btn-sm" onClick={() => handleAddToToday(r.techniqueId)}>
                        오늘의 훈련에 추가
                      </button>
                      {myCurricula.length > 0 && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setCurriculumPickerFor(curriculumPickerFor === r.techniqueId ? null : r.techniqueId)}>
                          커리큘럼에 추가
                        </button>
                      )}
                    </div>
                    {curriculumPickerFor === r.techniqueId && (
                      <div className="chip-row" style={{ flexBasis: '100%', marginTop: 6 }}>
                        {myCurricula.map((c) => (
                          <button key={c.id} className="chip" onClick={() => handleAddToCurriculum(r.techniqueId, c.id)}>
                            {c.title}
                          </button>
                        ))}
                      </div>
                    )}
                    {art?.nameKo && art.nameKo !== getMartialArt(martialArt)?.nameKo && <span className="cross-art-badge">{art.nameKo}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {result && result.recommendations.length === 0 && !notice && (
          <EmptyState icon="🔎" text="이 상황과 관련된 실제 기술을 찾지 못했습니다." />
        )}
      </div>
      {poseTechnique && <PoseAnalysisModal technique={poseTechnique} onClose={() => setPoseTechniqueId(null)} />}
    </div>
  );
}
