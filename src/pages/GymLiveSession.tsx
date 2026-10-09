import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthProvider';
import { useLiveSession } from '../lib/gymLive/useLiveSession';
import { completedSetFlags, viewAt } from '../lib/gymLive/timeline';
import { isTerminal } from '../lib/gymLive/types';
import LiveTimer from '../components/gymLive/LiveTimer';
import EmptyState from '../components/EmptyState';

// 학생 화면 — deliberately no controls: the coach drives the session; this
// only shows what to do now, synced from the server.
export default function GymLiveSession() {
  const { sessionId = '' } = useParams();
  const { user } = useAuth();
  const { session, participants, loaded, error, connection, now, recordOutcome } = useLiveSession(sessionId, user?.id ?? null);

  if (!user) return <EmptyState icon="🔒" text="로그인이 필요합니다." />;
  if (!loaded) return <EmptyState icon="⏳" text="훈련 정보를 불러오는 중입니다." />;
  if (!session) return <EmptyState icon="🥋" text={error ?? '훈련 세션을 찾을 수 없습니다.'} />;

  const me = participants.find((p) => p.userId === user.id);
  const v = viewAt(session, now);
  const round = v.setIndex + 1;
  const pairing = me?.pairings.find((p) => p.round === round);
  const unit = session.kind === 'sparring' ? '라운드' : '세트';

  if (isTerminal(session.status)) {
    const flags = completedSetFlags(session, session.endedAt ? new Date(session.endedAt).getTime() : now);
    const myRounds = session.kind === 'sparring' ? flags.filter((_, i) => me?.pairings.find((p) => p.round === i + 1)?.opponentUserId) : flags;
    const total = session.kind === 'sparring' ? (me?.pairings.filter((p) => p.opponentUserId).length ?? 0) : session.totalSets;
    const done = myRounds.filter(Boolean).length;
    return (
      <div className="page">
        <div className="container live-student">
          <div className="live-student__card" data-testid="live-student-done">
            <h2>{session.status === 'cancelled' ? '훈련 취소됨' : session.status === 'completed' && done === total ? '훈련 완료' : '훈련 종료'}</h2>
            {session.status !== 'cancelled' && (
              <p className="live-student__big" data-testid="live-done-count">
                {done} / {total} {unit} 완료
              </p>
            )}
            {session.status === 'interrupted' && <p className="technique-row__sub">관장님이 훈련을 중간에 종료했습니다.</p>}
            {session.status === 'completed' && done < total && <p className="technique-row__sub">일부 {unit}는 관장님이 건너뛰어 완료로 기록하지 않았습니다.</p>}
            <p data-testid="live-record-status">
              {recordOutcome === 'recorded' || recordOutcome === 'already'
                ? '기록이 저장되었습니다.'
                : recordOutcome === 'nothing'
                  ? '진행한 훈련이 없어 기록하지 않았습니다.'
                  : '기록을 저장하는 중…'}
            </p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <Link to="/training-analytics/history" className="btn btn-secondary">
                내 훈련 기록 보기
              </Link>
              <Link to="/gym" className="btn btn-ghost">
                체육관으로
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container live-student">
        <div className="live-student__card" data-testid="live-student">
          <div className="live-student__title" data-testid="live-title">
            {session.kind === 'sparring' ? 'SPARRING' : (session.techniqueName ?? session.title).toUpperCase()}
          </div>
          {session.kind === 'sparring' && (
            <div className="live-student__opponent" data-testid="live-opponent">
              {session.status === 'ready' ? (
                <span>곧 시작합니다</span>
              ) : pairing?.opponentNickname ? (
                <>
                  <span className="technique-row__sub">상대</span>
                  <strong>{pairing.opponentNickname}</strong>
                </>
              ) : (
                <strong>이번 라운드 대기</strong>
              )}
            </div>
          )}
          <LiveTimer session={session} now={now} />
          {session.status === 'ready' && <p className="technique-row__sub">관장님이 시작하면 바로 진행됩니다.</p>}
          {connection !== 'live' && (
            <p className="technique-row__sub" data-testid="live-connection">
              {connection === 'connecting' ? '연결 중…' : '연결이 불안정합니다 — 마지막으로 받은 상태로 계속 진행합니다.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
