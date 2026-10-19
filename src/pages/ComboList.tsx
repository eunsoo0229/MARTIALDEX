import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteCombo, listMyCombos } from '../lib/combo/service';
import { resolveTechniquesByIds } from '../lib/userTechniques/service';
import type { Combo } from '../lib/combo/types';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';
import ShareComboModal, { type ShareSource } from '../components/sharedCombo/ShareComboModal';
import { useMySharedSources } from '../lib/sharedCombo/useMySharedSources';

export default function ComboList() {
  const [combos, setCombos] = useState<Combo[]>(() => listMyCombos());
  const [expandedAnalysisId, setExpandedAnalysisId] = useState<string | null>(null);
  const [sharing, setSharing] = useState<ShareSource | null>(null);
  const [sharedNotice, setSharedNotice] = useState<{ id: string; name: string } | null>(null);
  const { shared, refresh } = useMySharedSources();

  function shareSourceFor(combo: Combo): ShareSource {
    const m = combo.visualMittMeta;
    return {
      sourceRef: `combo:${combo.id}`,
      kind: m?.type === 'setup' ? 'setup' : 'combo',
      name: combo.name,
      purpose: m?.purpose ?? combo.aiComboMeta?.goalText ?? '',
      description: combo.description ?? '',
      techniqueIds: combo.techniqueIds,
      stepNotes: m?.stepNotes?.map((n) => ({ techniqueId: n.techniqueId, note: n.note, opponentReaction: n.opponentReaction })),
      alreadyShared: shared.has(`combo:${combo.id}`),
    };
  }

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
          기존 기술 백과사전의 기술들을 연결해 나만의 콤보/연속기를 만들고 훈련해보세요. "공유"를 누르면 <Link to="/user-combos">사용자 콤보·셋업</Link>에 올라가 다른 사람도 볼 수 있습니다.
        </p>
        {sharedNotice && (
          <div className="card info-card" data-testid="share-done">
            "{sharedNotice.name}"을(를) 공유했습니다. <Link to={`/user-combos/${sharedNotice.id}`}>공유된 화면 보기</Link>
          </div>
        )}

        {combos.length === 0 ? (
          <EmptyState icon="🥊" text="아직 만든 콤보가 없습니다. 기술을 연결해 나만의 콤보를 만들어보세요." />
        ) : (
          <div className="stack gap-2">
            {combos.map((combo) => {
              const techniques = resolveTechniquesByIds(combo.techniqueIds);
              return (
                <div className="card info-card" key={combo.id}>
                  <h3>{combo.name}</h3>
                  {combo.sharedMeta && (
                    <p className="video-status-message" data-testid="combo-shared-from">
                      <span className="chip">공유받은 {combo.sharedMeta.kind === 'setup' ? '셋업' : '콤보'}</span> by {combo.sharedMeta.authorNickname || '익명'} ·{' '}
                      <Link to={`/user-combos/${combo.sharedMeta.sharedComboId}`}>원본 보기</Link>
                      {combo.sharedMeta.missingSteps.length > 0 && ` · 내 기술 목록에 없어 뺀 단계: ${combo.sharedMeta.missingSteps.join(', ')}`}
                    </p>
                  )}
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
                    <Link to={`/coach/mitt?combo=${encodeURIComponent(combo.id)}`} className="btn btn-ghost" data-testid="combo-mitt">
                      🥊 Mitt로 연습
                    </Link>
                    {!combo.sharedMeta && (
                    <button className="btn btn-ghost" onClick={() => setSharing(shareSourceFor(combo))} data-testid="combo-share">
                      {shared.has(`combo:${combo.id}`) ? '🔗 공유됨 · 갱신' : '🔗 공유'}
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
      {sharing && (
        <ShareComboModal
          source={sharing}
          onClose={() => setSharing(null)}
          onShared={(c) => {
            setSharing(null);
            setSharedNotice({ id: c.id, name: c.name });
            refresh();
          }}
        />
      )}
    </div>
  );
}
