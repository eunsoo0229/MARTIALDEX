import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteCombo, listMyCombos } from '../lib/combo/service';
import { resolveTechniquesByIds } from '../lib/userTechniques/service';
import type { Combo } from '../lib/combo/types';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

export default function ComboList() {
  const [combos, setCombos] = useState<Combo[]>(() => listMyCombos());
  const [expandedAnalysisId, setExpandedAnalysisId] = useState<string | null>(null);

  useEffect(() => {
    const onUpdate = () => setCombos(listMyCombos());
    window.addEventListener('martialdex:combos-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener('martialdex:combos-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, []);

  function handleDelete(id: string) {
    if (!window.confirm('이 콤보를 삭제할까요? 되돌릴 수 없습니다.')) return;
    deleteCombo(id);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>콤보 북</span>
        </div>
        <div className="section-title">
          <h2>🥊 콤보 북</h2>
          <Link to="/combos/new" className="see-all">
            + 새 콤보 만들기
          </Link>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          기존 기술 백과사전의 기술들을 연결해 나만의 콤보/연속기를 만들고 훈련해보세요.
        </p>

        {combos.length === 0 ? (
          <EmptyState icon="🥊" text="아직 만든 콤보가 없습니다. 기술을 연결해 나만의 콤보를 만들어보세요." />
        ) : (
          <div className="stack gap-2">
            {combos.map((combo) => {
              const techniques = resolveTechniquesByIds(combo.techniqueIds);
              return (
                <div className="card info-card" key={combo.id}>
                  <h3>{combo.name}</h3>
                  {combo.description && <p className="video-status-message">{combo.description}</p>}
                  <div className="chip-row" style={{ flexWrap: 'wrap' }}>
                    {techniques.map((t, i) => (
                      <span key={`${t.id}-${i}`} className="chip">
                        {i > 0 ? '→ ' : ''}
                        {t.name}
                      </span>
                    ))}
                  </div>
                  <div className="modal-actions modal-actions--start">
                    <Link to={`/combos/${combo.id}/train`} className="btn btn-primary">
                      🔥 훈련하기
                    </Link>
                    <Link to={`/combos/${combo.id}/edit`} className="btn btn-secondary">
                      편집
                    </Link>
                    {combo.aiComboMeta?.analysis && (
                      <button
                        className="btn btn-ghost"
                        onClick={() => setExpandedAnalysisId(expandedAnalysisId === combo.id ? null : combo.id)}
                      >
                        {expandedAnalysisId === combo.id ? 'AI 분석 닫기' : '🧠 AI 분석 보기'}
                      </button>
                    )}
                    <button className="btn btn-ghost" onClick={() => handleDelete(combo.id)}>
                      삭제
                    </button>
                  </div>
                  {expandedAnalysisId === combo.id && combo.aiComboMeta?.analysis && (
                    <div className="info-card-inline" style={{ marginTop: 10, flexDirection: 'column', alignItems: 'stretch' }}>
                      <p className="video-status-message">
                        {combo.aiComboMeta.analysis.startingSituation} · {combo.aiComboMeta.analysis.range} · {combo.aiComboMeta.analysis.position} → {combo.aiComboMeta.analysis.finalGoal}
                      </p>
                      {combo.aiComboMeta.analysis.stepDetails.map((d, i) => (
                        <p key={i} className="video-status-message">
                          {i + 1}. 🛡 {d.opponentReaction} → ➡ {d.followUpIfReacts}
                        </p>
                      ))}
                      {combo.aiComboMeta.analysis.pros.length > 0 && (
                        <p className="video-status-message">👍 {combo.aiComboMeta.analysis.pros.join(' · ')}</p>
                      )}
                      {combo.aiComboMeta.analysis.cautions.length > 0 && (
                        <p className="video-status-message">⚠️ {combo.aiComboMeta.analysis.cautions.join(' · ')}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
