import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthProvider';
import { createGym, listMyGyms } from '../lib/gymClass/service';
import type { MyGymMembership } from '../lib/gymClass/types';
import BackButton from '../components/BackButton';
import EmptyState from '../components/EmptyState';

// Instructor-facing entry point (spec item 13) — create a gym (self-serve,
// same trust model as marketplace publishing / technique requests, no
// admin-approval gate), see the ones I already manage, and share the join
// code with students.
export default function GymAdminHub() {
  const navigate = useNavigate();
  const { user, profile, isConfigured } = useAuth();
  const [memberships, setMemberships] = useState<MyGymMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!user) return;
    setLoading(true);
    const result = await listMyGyms(user.id);
    if (result.ok) setMemberships(result.data.filter((m) => m.role === 'instructor'));
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function handleCreate() {
    if (!user || !name.trim()) return;
    setBusy(true);
    setError(null);
    const result = await createGym(name, user.id, profile?.nickname ?? '관장님');
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setName('');
    void refresh();
  }

  if (!isConfigured || !user) {
    return (
      <div className="page">
        <div className="container">
          <BackButton fallback="/training" />
          <EmptyState icon="🏛" text="체육관 관리 기능은 로그인이 필요합니다." />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton fallback="/training" />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/gym">체육관</Link>
          <span>/</span>
          <span>관리</span>
        </div>
        <div className="section-title">
          <h2>🏛 체육관 관리</h2>
        </div>

        <div className="card info-card">
          <h3>새 체육관 만들기</h3>
          <div className="chip-row">
            <input
              className="select"
              style={{ flex: 1, minWidth: 160 }}
              placeholder="체육관 이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={handleCreate}>
              만들기
            </button>
          </div>
          {error && <p className="video-status-message" style={{ color: 'var(--accent, #e53e3e)' }}>{error}</p>}
        </div>

        <div className="section-title">
          <h2>내가 관리하는 체육관</h2>
        </div>
        {loading ? (
          <p className="video-status-message">불러오는 중...</p>
        ) : memberships.length === 0 ? (
          <EmptyState icon="🏛" text="아직 관리하는 체육관이 없습니다." />
        ) : (
          <div className="stack gap-2">
            {memberships.map((m) => (
              <button key={m.gym.id} type="button" className="card info-card" style={{ textAlign: 'left', width: '100%' }} onClick={() => navigate(`/gym/admin/${m.gym.id}`)}>
                <strong>{m.gym.name}</strong>
                <p className="video-status-message">가입 코드: {m.gym.joinCode}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
