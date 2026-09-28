import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getSessionWithClass, listRosterForSession } from '../lib/gymClass/service';
import type { GymClass, GymClassSession, RosterEntry } from '../lib/gymClass/types';
import BackButton from '../components/BackButton';
import EmptyState from '../components/EmptyState';

// Instructor-only roster/completion view (spec item 13). Deliberately reads
// ONLY listRosterForSession() (completion + set count) — never anything
// from nutrition/profile/trainingHistory tables, so there is no code path
// here that could leak a student's personal data even by accident; the RLS
// on gym_class_attendance (migration 0022) is the structural backstop.
export default function GymAdminSessionRoster() {
  const { sessionId = '' } = useParams();
  const [session, setSession] = useState<GymClassSession | null>(null);
  const [gymClass, setGymClass] = useState<GymClass | null>(null);
  const [gymName, setGymName] = useState('');
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const sessionResult = await getSessionWithClass(sessionId);
      if (!sessionResult.ok || !sessionResult.data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setSession(sessionResult.data.session);
      setGymClass(sessionResult.data.gymClass);
      setGymName(sessionResult.data.gymName);
      const rosterResult = await listRosterForSession(sessionResult.data.session.gymId, sessionId);
      if (rosterResult.ok) setRoster(rosterResult.data);
      setLoading(false);
    })();
  }, [sessionId]);

  if (loading) return null;
  if (notFound || !session || !gymClass) {
    return (
      <div className="page">
        <div className="container">
          <BackButton fallback="/gym/admin" />
          <EmptyState icon="🏛" text="수업을 찾을 수 없습니다." />
        </div>
      </div>
    );
  }

  const completedCount = roster.filter((r) => r.completed).length;

  return (
    <div className="page">
      <div className="container">
        <BackButton fallback={`/gym/admin/${session.gymId}`} />
        <div className="breadcrumb">
          <Link to={`/gym/admin/${session.gymId}`}>{gymName}</Link>
          <span>/</span>
          <span>{gymClass.title}</span>
        </div>
        <div className="section-title">
          <h2>{gymClass.title}</h2>
        </div>
        <div className="card info-card">
          <p>{session.date} · 참여 학생 {roster.length}명 · 완료 {completedCount}명</p>
        </div>

        {roster.length === 0 ? (
          <EmptyState icon="👥" text="아직 참가한 학생이 없습니다." />
        ) : (
          <div className="stack gap-2">
            {roster.map((r) => (
              <div key={r.studentUserId} className="card info-card">
                <div className="chip-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong>{r.studentNickname ?? '학생'}</strong>
                  <span className={`chip${r.completed ? ' active' : ''}`}>{r.completed ? '완료' : '미완료'}</span>
                </div>
                {r.completed && <p className="video-status-message">{r.totalSets}세트 완료</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
