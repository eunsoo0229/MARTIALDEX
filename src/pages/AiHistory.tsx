import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthProvider';
import { deleteAiQuestionHistoryEntry, listAiQuestionHistory } from '../lib/aiHistory/service';
import { AI_HISTORY_FEATURE_LABEL, type AiQuestionHistoryEntry } from '../lib/aiHistory/types';
import { resolveTechnique } from '../lib/userTechniques/service';
import { getCurriculum } from '../lib/curriculum/curriculumService';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function RelatedLink({ entry }: { entry: AiQuestionHistoryEntry }) {
  if (entry.relatedTechniqueId) {
    const technique = resolveTechnique(entry.relatedTechniqueId);
    if (technique) {
      return (
        <Link to={`/arts/${technique.martialArt}/techniques/${technique.id}`} className="chip">
          🥋 {technique.name}
        </Link>
      );
    }
  }
  if (entry.relatedCurriculumId) {
    const curriculum = getCurriculum(entry.relatedCurriculumId);
    if (curriculum) {
      return (
        <Link to={`/learning/${curriculum.martialArt}/${curriculum.id}`} className="chip">
          📘 {curriculum.title}
        </Link>
      );
    }
  }
  return null;
}

export default function AiHistory() {
  const { user, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState<AiQuestionHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const result = await listAiQuestionHistory();
    if (result.ok) {
      setEntries(result.data);
      setError(null);
    } else {
      setError(result.message);
    }
  }

  useEffect(() => {
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleDelete(id: string) {
    if (!window.confirm('이 질문 기록을 삭제할까요? 되돌릴 수 없습니다.')) return;
    const result = await deleteAiQuestionHistoryEntry(id);
    if (result.ok) setEntries((prev) => (prev ? prev.filter((e) => e.id !== id) : prev));
    else setError(result.message);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>AI 질문 기록</span>
        </div>
        <div className="section-title">
          <h2>🕑 AI 질문 기록</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          기술 상세/자세 분석/커리큘럼/선수 스타일/AI 코치 화면에서 "AI에게 질문하기"로 나눈 대화 기록입니다. 로그인 계정에
          저장되어 다른 기기에서도 확인할 수 있습니다.
        </p>

        {!user ? (
          <div className="card info-card">
            <p className="video-status-message">AI 질문 기록은 로그인 후 이용할 수 있습니다.</p>
            {!authLoading && (
              <div className="modal-actions modal-actions--start">
                <Link to="/login" className="btn btn-primary">
                  로그인
                </Link>
              </div>
            )}
          </div>
        ) : (
          <>
            {error && <div className="banner banner--error" role="alert">{error}</div>}
            {entries === null ? (
              <p className="video-status-message row gap-1" style={{ justifyContent: 'center' }}>
                <span className="spinner" /> 불러오는 중...
              </p>
            ) : entries.length === 0 ? (
              <EmptyState icon="🕑" text="아직 AI에게 질문한 기록이 없습니다." />
            ) : (
              <div className="stack gap-2">
                {entries.map((entry) => (
                  <div className="card info-card" key={entry.id}>
                    <div className="chip-row" style={{ marginBottom: 8 }}>
                      <span className="chip active">{AI_HISTORY_FEATURE_LABEL[entry.feature]}</span>
                      <span className="field-label" style={{ alignSelf: 'center' }}>{formatDateTime(entry.createdAt)}</span>
                      <RelatedLink entry={entry} />
                    </div>
                    <p style={{ fontWeight: 600 }}>Q. {entry.question}</p>
                    <p className="video-status-message" style={{ whiteSpace: 'pre-wrap' }}>A. {entry.answer}</p>
                    <div className="modal-actions modal-actions--start">
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(entry.id)}>
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
