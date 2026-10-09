import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchTechniques } from '../../lib/search';
import { getUnifiedMartialArtSummaries } from '../../lib/userTechniques/service';
import { createLiveSession, listActiveLiveSessions, listGymStudents, listLiveParticipants, subscribeLive, type GymStudent } from '../../lib/gymLive/service';
import { serverNow, syncServerClock } from '../../lib/gymLive/serverClock';
import type { LiveParticipant, LiveSession, LiveSessionKind } from '../../lib/gymLive/types';
import type { Technique } from '../../types';
import LiveTimer from './LiveTimer';

type Mode = 'drill' | 'pair' | 'all';

const MODE_LABEL: Record<Mode, string> = { drill: '개인 훈련', pair: '2인 스파링', all: '전체 스파링' };

/**
 * 관장 화면 — start a coach-driven live session for chosen students and
 * watch every running session of this gym at a glance. Technique choice
 * reuses searchTechniques (the same picker the class builder above uses).
 */
export default function GymLivePanel({ gymId }: { gymId: string }) {
  const navigate = useNavigate();
  const [students, setStudents] = useState<GymStudent[]>([]);
  const [mode, setMode] = useState<Mode>('drill');
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [technique, setTechnique] = useState<Technique | null>(null);
  const [martialArt, setMartialArt] = useState('boxing');
  const [work, setWork] = useState(30);
  const [rest, setRest] = useState(15);
  const [sets, setSets] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<{ session: LiveSession; participants: LiveParticipant[] }[]>([]);
  const [now, setNow] = useState(() => serverNow());

  const results = useMemo(() => (query.trim() ? searchTechniques(query, 8) : []), [query]);
  const arts = useMemo(() => getUnifiedMartialArtSummaries(), []);

  useEffect(() => {
    void listGymStudents(gymId).then((r) => r.ok && setStudents(r.data));
  }, [gymId]);

  // Live overview of this gym's unfinished sessions.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await listActiveLiveSessions(gymId);
      if (!alive || !r.ok) return;
      const withPeople = await Promise.all(
        r.data.map(async (session) => {
          const p = await listLiveParticipants(session.id);
          return { session, participants: p.ok ? p.data : [] };
        })
      );
      if (alive) setActive(withPeople);
    };
    void syncServerClock();
    void load();
    const unsub = subscribeLive(`gym-live-overview-${gymId}`, [{ table: 'gym_live_sessions', filter: `gym_id=eq.${gymId}` }], () => void load());
    const poll = window.setInterval(() => void load(), 8000);
    const tick = window.setInterval(() => setNow(serverNow()), 250);
    return () => {
      alive = false;
      unsub();
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [gymId]);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setSelected(m === 'all' ? students.map((s) => s.userId) : []);
    if (m === 'drill') {
      setWork(30);
      setRest(15);
      setSets(5);
    } else {
      setWork(120);
      setRest(60);
      setSets(3);
    }
  }

  function toggle(userId: string) {
    setSelected((prev) => {
      if (prev.includes(userId)) return prev.filter((id) => id !== userId);
      if (mode === 'pair' && prev.length >= 2) return [prev[1], userId];
      return [...prev, userId];
    });
  }

  const canStart =
    !busy &&
    work >= 5 &&
    rest >= 0 &&
    sets >= 1 &&
    (mode === 'drill' ? selected.length >= 1 && !!technique : mode === 'pair' ? selected.length === 2 : selected.length >= 2);

  async function start(replaceActive = false) {
    setBusy(true);
    setError(null);
    const kind: LiveSessionKind = mode === 'drill' ? 'drill' : 'sparring';
    const chosen = students.filter((s) => selected.includes(s.userId));
    const r = await createLiveSession({
      gymId,
      kind,
      title: kind === 'drill' ? technique!.koreanName || technique!.name : '스파링',
      techniqueId: kind === 'drill' ? technique!.id : null,
      techniqueName: kind === 'drill' ? technique!.koreanName || technique!.name : null,
      martialArt: kind === 'drill' ? technique!.martialArt : martialArt,
      workSeconds: work,
      restSeconds: rest,
      totalSets: sets,
      students: chosen,
      replaceActive,
    });
    setBusy(false);
    if (!r.ok) {
      if (r.busyNicknames && !replaceActive) {
        if (window.confirm(`이미 진행 중인 훈련이 있습니다 (${r.busyNicknames.join(', ')}).\n새 훈련을 시작하면 기존 훈련을 종료할까요?`)) void start(true);
        return;
      }
      setError(r.message);
      return;
    }
    navigate(`/gym/admin/live/${r.data.id}`);
  }

  const unit = mode === 'drill' ? '세트' : '라운드';

  return (
    <>
      {active.length > 0 && (
        <div className="card info-card" data-testid="live-overview">
          <h3>⏱ 실시간 훈련</h3>
          <div className="stack gap-2">
            {active.map(({ session, participants }) => (
              <button key={session.id} type="button" className="live-overview-row" onClick={() => navigate(`/gym/admin/live/${session.id}`)}>
                <span className="live-overview-row__who">
                  {session.kind === 'sparring'
                    ? participants.length === 2
                      ? `${participants[0].nickname} vs ${participants[1].nickname}`
                      : `전체 스파링 (${participants.length}명)`
                    : `${participants.map((p) => p.nickname).join(', ')} · ${session.techniqueName ?? session.title}`}
                </span>
                <LiveTimer session={session} now={now} compact />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card info-card" data-testid="live-launcher">
        <h3>실시간 훈련 시작</h3>
        <div className="chip-row">
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <button key={m} type="button" className={`chip${mode === m ? ' active' : ''}`} onClick={() => switchMode(m)}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>

        <div className="field-label" style={{ marginTop: 10 }}>
          체육관 학생 {students.length}명{mode === 'pair' ? ' — 2명 선택' : ''}
        </div>
        {students.length === 0 ? (
          <p className="technique-row__sub">아직 가입한 학생이 없습니다. 가입 코드를 공유하세요.</p>
        ) : (
          <div className="chip-row">
            {students.map((s) => (
              <button key={s.userId} type="button" className={`chip${selected.includes(s.userId) ? ' active' : ''}`} onClick={() => toggle(s.userId)} data-testid="live-student-chip">
                {selected.includes(s.userId) ? '● ' : '○ '}
                {s.nickname}
              </button>
            ))}
            {mode !== 'pair' && students.length > 1 && (
              <button type="button" className="chip" onClick={() => setSelected(selected.length === students.length ? [] : students.map((s) => s.userId))}>
                {selected.length === students.length ? '선택 해제' : '전체 선택'}
              </button>
            )}
          </div>
        )}

        {mode === 'drill' ? (
          <>
            <div className="field-label" style={{ marginTop: 10 }}>
              운동/훈련
            </div>
            {technique ? (
              <span className="chip active">
                {technique.koreanName || technique.name}{' '}
                <button type="button" aria-label="변경" onClick={() => setTechnique(null)} style={{ marginLeft: 4 }}>
                  ✕
                </button>
              </span>
            ) : (
              <>
                <input className="select" style={{ width: '100%' }} placeholder="기술/운동 검색 (예: Jab)" value={query} onChange={(e) => setQuery(e.target.value)} />
                {results.length > 0 && (
                  <div className="chip-row" style={{ marginTop: 6 }}>
                    {results.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="chip"
                        onClick={() => {
                          setTechnique(t);
                          setQuery('');
                        }}
                      >
                        + {t.koreanName || t.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <label className="field-label" style={{ marginTop: 10, display: 'block' }}>
            종목
            <select className="select" value={martialArt} onChange={(e) => setMartialArt(e.target.value)} style={{ marginLeft: 8 }}>
              {arts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nameKo}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="chip-row" style={{ marginTop: 10, alignItems: 'center' }}>
          <label className="field-label">
            {mode === 'drill' ? '훈련 시간' : '라운드 시간'}(초)
            <input type="number" className="select gym-num-input gym-num-input--wide" min={5} value={work} onChange={(e) => setWork(Math.max(0, Number(e.target.value) || 0))} data-testid="live-work" />
          </label>
          <label className="field-label">
            휴식(초)
            <input type="number" className="select gym-num-input gym-num-input--wide" min={0} value={rest} onChange={(e) => setRest(Math.max(0, Number(e.target.value) || 0))} data-testid="live-rest" />
          </label>
          <label className="field-label">
            {unit}
            <input type="number" className="select gym-num-input" min={1} max={50} value={sets} onChange={(e) => setSets(Math.max(0, Number(e.target.value) || 0))} data-testid="live-sets" />
          </label>
        </div>

        <div className="modal-actions modal-actions--start">
          <button className="btn btn-primary" disabled={!canStart} onClick={() => start()} data-testid="live-create">
            {mode === 'drill' ? '훈련 시작' : '스파링 시작'}
          </button>
        </div>
        {mode === 'all' && selected.length >= 2 && (
          <p className="technique-row__sub">
            {selected.length}명 — 라운드마다 무작위로 2명씩 매칭합니다{selected.length % 2 === 1 ? ' (홀수라 라운드마다 1명 대기, 돌아가며)' : ''}.
          </p>
        )}
        {error && (
          <div className="ai-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </>
  );
}
