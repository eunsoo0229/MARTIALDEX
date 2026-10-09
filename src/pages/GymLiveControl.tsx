import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveSession } from '../lib/gymLive/useLiveSession';
import { controlLiveSession } from '../lib/gymLive/service';
import { viewAt } from '../lib/gymLive/timeline';
import { isTerminal, type LiveControlAction, type LiveParticipant } from '../lib/gymLive/types';
import LiveTimer from '../components/gymLive/LiveTimer';
import BackButton from '../components/BackButton';
import EmptyState from '../components/EmptyState';

const STATUS_LABEL: Record<string, string> = {
  ready: 'READY',
  running: '진행 중',
  paused: 'PAUSED',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
  interrupted: 'INTERRUPTED',
};

/** One round's matchups + who sits out, rebuilt from each student's own pairing list. */
export function roundMatchups(participants: LiveParticipant[], round: number): { pairs: [string, string][]; byes: string[] } {
  const pairs: [string, string][] = [];
  const seen = new Set<string>();
  const byes: string[] = [];
  const nick = new Map(participants.map((p) => [p.userId, p.nickname]));
  for (const p of participants) {
    const r = p.pairings.find((x) => x.round === round);
    if (!r?.opponentUserId) {
      byes.push(p.nickname);
      continue;
    }
    const key = [p.userId, r.opponentUserId].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([p.nickname, nick.get(r.opponentUserId) ?? r.opponentNickname ?? '?']);
  }
  return { pairs, byes };
}

export default function GymLiveControl() {
  const { sessionId = '' } = useParams();
  const { session, participants, loaded, error, connection, now, refresh } = useLiveSession(sessionId);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!loaded) return <EmptyState icon="⏳" text="세션을 불러오는 중입니다." />;
  if (!session) return <EmptyState icon="🥋" text={error ?? '세션을 찾을 수 없습니다.'} />;

  async function act(action: LiveControlAction) {
    if (action === 'end' && !window.confirm('훈련을 종료할까요? 끝까지 진행하지 않은 세트는 완료로 기록되지 않습니다.')) return;
    if (action === 'cancel' && !window.confirm('훈련을 취소할까요? 학생 기록에 남지 않습니다.')) return;
    setBusy(true);
    setActionError(null);
    const r = await controlLiveSession(session!.id, action);
    if (!r.ok) setActionError(r.message);
    await refresh();
    setBusy(false);
  }

  const v = viewAt(session, now);
  const unit = session.kind === 'sparring' ? '라운드' : '세트';
  const terminal = isTerminal(session.status);
  const matchups = session.kind === 'sparring' ? roundMatchups(participants, v.setIndex + 1) : null;

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/gym/admin">체육관 관리</Link>
          <span>/</span>
          <Link to={`/gym/admin/${session.gymId}`}>체육관</Link>
          <span>/</span>
          <span>실시간 훈련</span>
        </div>
        <div className="section-title">
          <h2>⏱ 실시간 {session.kind === 'sparring' ? '스파링' : '훈련'}</h2>
        </div>
        <div className="card info-card text-center">
          <p className="live-student__title">
            {session.kind === 'sparring'
              ? participants.length === 2
                ? `${participants[0].nickname} vs ${participants[1].nickname}`
                : `전체 스파링 · ${participants.length}명`
              : `${session.techniqueName ?? session.title} · ${participants.map((p) => p.nickname).join(', ')}`}
          </p>
          <span className="chip active" data-testid="live-status">
            {STATUS_LABEL[session.status]}
          </span>
          <LiveTimer session={session} now={now} />
          {connection !== 'live' && <p className="technique-row__sub">{connection === 'connecting' ? '연결 중…' : '재연결 중 — 서버 상태로 자동 복구됩니다.'}</p>}

          {!terminal && (
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              {session.status === 'ready' && (
                <>
                  <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => act('start')}>
                    ▶ 시작
                  </button>
                  <button className="btn btn-ghost" disabled={busy} onClick={() => act('cancel')}>
                    취소
                  </button>
                </>
              )}
              {session.status === 'running' && (
                <button className="btn btn-secondary" disabled={busy} onClick={() => act('pause')}>
                  ⏸ 일시정지
                </button>
              )}
              {session.status === 'paused' && (
                <button className="btn btn-primary" disabled={busy} onClick={() => act('resume')}>
                  ▶ 재개
                </button>
              )}
              {(session.status === 'running' || session.status === 'paused') && (
                <>
                  <button className="btn btn-secondary" disabled={busy} onClick={() => act('next')}>
                    ⏭ 다음 {unit}
                  </button>
                  <button className="btn btn-ghost" disabled={busy} onClick={() => act('end')}>
                    ■ 종료
                  </button>
                </>
              )}
            </div>
          )}
          {actionError && (
            <div className="ai-error" role="alert">
              {actionError}
            </div>
          )}
        </div>

        {matchups && session.status !== 'ready' && !terminal && (
          <div className="card info-card" data-testid="live-matchups">
            <h3>ROUND {v.setIndex + 1} 매칭</h3>
            <ul className="live-matchups">
              {matchups.pairs.map(([a, b]) => (
                <li key={`${a}-${b}`}>
                  {a} vs {b} <span className="live-dot">● {v.phase === 'rest' ? '휴식' : v.phase === 'paused' ? '일시정지' : '진행 중'}</span>
                </li>
              ))}
              {matchups.byes.map((n) => (
                <li key={`bye-${n}`} className="technique-row__sub">
                  {n} — 대기
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="card info-card">
          <h3>참가 학생</h3>
          <ul className="live-matchups">
            {participants.map((p) => (
              <li key={p.userId} data-testid="live-participant">
                {p.nickname}
                {terminal && <span className="technique-row__sub"> — {p.recordedAt ? '기록 저장됨' : '기록 저장 대기 (학생 기기에서 자동 저장)'}</span>}
              </li>
            ))}
          </ul>
          {terminal && (
            <p className="technique-row__sub">
              {session.status === 'completed'
                ? `${session.totalSets} / ${session.totalSets} ${unit} 완료`
                : session.status === 'interrupted'
                  ? '중간에 종료됨 — 학생 기록에는 실제로 끝까지 진행한 세트만 완료로 저장됩니다.'
                  : '취소됨 — 학생 기록에 남지 않습니다.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
