import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteTactic, listMyTactics, saveTacticFeedback } from '../lib/tactic/service';
import { generateTacticFeedback } from '../lib/tactic/feedback';
import { resolveTechniquesByIds } from '../lib/userTechniques/service';
import type { Tactic } from '../lib/tactic/types';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

export default function TacticList() {
  const [tactics, setTactics] = useState<Tactic[]>(() => listMyTactics());
  const [loadingFeedbackId, setLoadingFeedbackId] = useState<string | null>(null);
  const [errorByTactic, setErrorByTactic] = useState<Record<string, string>>({});

  useEffect(() => {
    const onUpdate = () => setTactics(listMyTactics());
    window.addEventListener('martialdex:tactics-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener('martialdex:tactics-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, []);

  function handleDelete(id: string) {
    if (!window.confirm('이 전술을 삭제할까요? 되돌릴 수 없습니다.')) return;
    deleteTactic(id);
  }

  async function handleFeedback(tactic: Tactic) {
    setLoadingFeedbackId(tactic.id);
    setErrorByTactic((prev) => ({ ...prev, [tactic.id]: '' }));
    const outcome = await generateTacticFeedback(tactic);
    setLoadingFeedbackId(null);
    if (!outcome.ok || !outcome.text) {
      setErrorByTactic((prev) => ({ ...prev, [tactic.id]: outcome.message ?? '피드백을 생성하지 못했습니다.' }));
      return;
    }
    saveTacticFeedback(tactic, outcome.text);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>전술 셋업</span>
        </div>
        <div className="section-title">
          <h2>🧩 상황별 전술 셋업</h2>
          <Link to="/tactics/new" className="see-all">
            + 새 전술 만들기
          </Link>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          IF(상황) → THEN(대응 기술 순서) 형태로 나만의 전술을 만들고 AI 피드백을 받아보세요.
        </p>

        {tactics.length === 0 ? (
          <EmptyState icon="🧩" text="아직 만든 전술이 없습니다. 상황과 대응 기술을 연결해 나만의 전술을 만들어보세요." />
        ) : (
          <div className="stack gap-2">
            {tactics.map((tactic) => {
              const techniques = resolveTechniquesByIds(tactic.techniqueIds);
              return (
                <div className="card info-card" key={tactic.id}>
                  <h3>{tactic.name}</h3>
                  <p>
                    <strong>IF</strong> {tactic.situation}
                  </p>
                  <div className="chip-row" style={{ flexWrap: 'wrap' }}>
                    <span className="chip">THEN</span>
                    {techniques.map((t, i) => (
                      <span key={`${t.id}-${i}`} className="chip">
                        {i > 0 ? '→ ' : ''}
                        {t.name}
                      </span>
                    ))}
                  </div>

                  {tactic.feedback && (
                    <div className="card info-card" style={{ marginTop: 10, marginBottom: 0 }}>
                      <p style={{ margin: 0 }}>
                        <strong>✦ AI 전술 피드백</strong>
                      </p>
                      <p style={{ marginBottom: 0 }}>{tactic.feedback}</p>
                    </div>
                  )}
                  {errorByTactic[tactic.id] && <p className="video-status-message">{errorByTactic[tactic.id]}</p>}

                  <div className="modal-actions modal-actions--start">
                    <button className="btn btn-primary" onClick={() => handleFeedback(tactic)} disabled={loadingFeedbackId === tactic.id}>
                      {loadingFeedbackId === tactic.id ? '분석 중...' : tactic.feedback ? '✦ 피드백 다시 받기' : '✦ AI 피드백 받기'}
                    </button>
                    <Link to={`/tactics/${tactic.id}/edit`} className="btn btn-secondary">
                      편집
                    </Link>
                    <button className="btn btn-ghost" onClick={() => handleDelete(tactic.id)}>
                      삭제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
