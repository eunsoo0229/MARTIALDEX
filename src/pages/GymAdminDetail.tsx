import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthProvider';
import { createGymClass, getGym, listGymClasses, openTodaySession } from '../lib/gymClass/service';
import type { Gym, GymClass } from '../lib/gymClass/types';
import { searchTechniques } from '../lib/search';
import { getDefaultExerciseConfig } from '../lib/todayTraining/exerciseDefaults';
import type { ExerciseConfig } from '../lib/curriculum/types';
import type { Technique } from '../types';
import BackButton from '../components/BackButton';
import EmptyState from '../components/EmptyState';

// Instructor's per-gym class management (spec item 13/14): create classes
// (reusing searchTechniques() — the same search index SearchBar.tsx uses,
// no new technique-picking logic) and open today's session for one.
export default function GymAdminDetail() {
  const { gymId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [gym, setGym] = useState<Gym | null>(null);
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Technique[]>([]);

  const searchResults = useMemo(() => (query.trim() ? searchTechniques(query, 15) : []), [query]);

  async function refresh() {
    setLoading(true);
    const [gymResult, classResult] = await Promise.all([getGym(gymId), listGymClasses(gymId)]);
    if (gymResult.ok) setGym(gymResult.data);
    if (classResult.ok) setClasses(classResult.data);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gymId]);

  function addTechnique(t: Technique) {
    if (picked.some((p) => p.id === t.id)) return;
    setPicked((prev) => [...prev, t]);
    setQuery('');
  }
  function removeTechnique(id: string) {
    setPicked((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleCreateClass() {
    if (!user || !title.trim() || picked.length === 0) return;
    setBusy(true);
    setError(null);
    const exerciseConfig: Record<string, ExerciseConfig> = {};
    for (const t of picked) exerciseConfig[t.id] = getDefaultExerciseConfig(t);
    const result = await createGymClass(gymId, title, { techniqueIds: picked.map((t) => t.id), exerciseConfig }, user.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setTitle('');
    setPicked([]);
    void refresh();
  }

  async function handleOpenSession(gymClass: GymClass) {
    if (!user) return;
    setBusy(true);
    setError(null);
    const result = await openTodaySession(gymClass, user.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    navigate(`/gym/admin/session/${result.data.id}`);
  }

  if (loading) return null;
  if (!gym) {
    return (
      <div className="page">
        <div className="container">
          <BackButton fallback="/gym/admin" />
          <EmptyState icon="🏛" text="체육관을 찾을 수 없습니다." />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton fallback="/gym/admin" />
        <div className="breadcrumb">
          <Link to="/gym/admin">체육관 관리</Link>
          <span>/</span>
          <span>{gym.name}</span>
        </div>
        <div className="section-title">
          <h2>{gym.name}</h2>
        </div>
        <div className="card info-card">
          <p>가입 코드: <strong>{gym.joinCode}</strong></p>
          <p className="video-status-message">학생에게 이 코드를 공유하면 체육관에 참가할 수 있습니다.</p>
        </div>

        <div className="card info-card">
          <h3>새 클래스 만들기</h3>
          <input className="select" style={{ width: '100%', marginBottom: 8 }} placeholder="클래스 이름 (예: 복싱 초급반)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="select" style={{ width: '100%' }} placeholder="기술/운동 검색해서 추가" value={query} onChange={(e) => setQuery(e.target.value)} />
          {searchResults.length > 0 && (
            <div className="stack gap-2" style={{ marginTop: 6 }}>
              {searchResults.map((t) => (
                <button key={t.id} type="button" className="chip" onClick={() => addTechnique(t)}>
                  + {t.name}
                </button>
              ))}
            </div>
          )}
          {picked.length > 0 && (
            <div className="chip-row" style={{ marginTop: 8 }}>
              {picked.map((t) => (
                <span key={t.id} className="chip active">
                  {t.name}{' '}
                  <button type="button" onClick={() => removeTechnique(t.id)} aria-label="제거" style={{ marginLeft: 4 }}>
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="modal-actions modal-actions--start">
            <button className="btn btn-primary" disabled={busy || !title.trim() || picked.length === 0} onClick={handleCreateClass}>
              클래스 만들기
            </button>
          </div>
          {error && <p className="video-status-message" style={{ color: 'var(--accent, #e53e3e)' }}>{error}</p>}
        </div>

        <div className="section-title">
          <h2>클래스 목록</h2>
        </div>
        {classes.length === 0 ? (
          <EmptyState icon="📋" text="아직 만든 클래스가 없습니다." />
        ) : (
          <div className="stack gap-2">
            {classes.map((c) => (
              <div key={c.id} className="card info-card">
                <strong>{c.title}</strong>
                <p className="video-status-message">{c.plan.techniqueIds.length}개 운동</p>
                <div className="modal-actions modal-actions--start">
                  <button className="btn btn-primary" disabled={busy} onClick={() => handleOpenSession(c)}>
                    오늘 수업 열기
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
