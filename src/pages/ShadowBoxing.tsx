import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { martialArtSummaries } from '../lib/loadData';
import { resolveShadowTechniquePool } from '../lib/shadowBoxing/techniquePool';
import { clearShadowSession, getPhaseRemainingMs, getShadowSession, startShadowSession } from '../lib/shadowBoxing/sessionStore';
import { useShadowBoxing } from '../lib/shadowBoxing/useShadowBoxing';
import { isTtsSupported } from '../lib/shadowBoxing/tts';
import { PACE_LABEL, type ShadowPace } from '../lib/shadowBoxing/types';
import { resolveTechnique } from '../lib/userTechniques/service';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

const ROUND_SECONDS_PRESETS = [60, 120, 180];
const TOTAL_ROUNDS_PRESETS = [3, 5, 8, 12];
const REST_SECONDS_PRESETS = [15, 30, 60];
const PACES: ShadowPace[] = ['slow', 'normal', 'fast'];

function formatMMSS(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(totalMs / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ShadowBoxing() {
  const [martialArt, setMartialArt] = useState(martialArtSummaries[0]?.id ?? 'boxing');
  const [roundSeconds, setRoundSeconds] = useState(120);
  const [totalRounds, setTotalRounds] = useState(5);
  const [restSeconds, setRestSeconds] = useState(30);
  const [pace, setPace] = useState<ShadowPace>('normal');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { session, pause, resume, stop } = useShadowBoxing();
  const ttsSupported = isTtsSupported();

  // Visual-only refresh for the countdown — the actual remaining time is
  // always recomputed from Date.now() vs the session's stored absolute
  // deadline (see getPhaseRemainingMs), so a missed tick never drifts.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!session || session.paused || session.phase === 'finished') return;
    const id = window.setInterval(() => forceTick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [session?.paused, session?.phase]);

  function handleStart() {
    const pool = resolveShadowTechniquePool(martialArt);
    if (pool.length < 2) {
      setErrorMessage('이 무술에 사용할 수 있는 기술이 부족합니다.');
      return;
    }
    setErrorMessage(null);
    startShadowSession({ martialArt, techniquePool: pool, roundSeconds, totalRounds, restSeconds, pace });
  }

  function handleReset() {
    clearShadowSession();
  }

  if (!session) {
    return (
      <div className="page">
        <div className="container">
          <BackButton />
          <div className="breadcrumb">
            <Link to="/">홈</Link>
            <span>/</span>
            <span>AI 쉐도우 복싱 코치</span>
          </div>
          <div className="section-title">
            <h2>🥊 AI 쉐도우 복싱 코치</h2>
          </div>
          <p className="video-status-message" style={{ marginTop: -8 }}>
            화면을 보지 않아도 음성 안내를 들으며 훈련할 수 있습니다. 라운드/휴식 시간과 페이스를 설정하고
            시작하세요.
          </p>
          {!ttsSupported && (
            <p className="video-status-message">⚠️ 이 환경에서는 음성 안내(TTS)를 지원하지 않아 화면 텍스트로만 안내됩니다.</p>
          )}

          <div className="card info-card">
            <div className="chip-row" style={{ marginBottom: 12 }}>
              <div>
                <label className="field-label">무술</label>
                <br />
                <select className="select" value={martialArt} onChange={(e) => setMartialArt(e.target.value)}>
                  {martialArtSummaries.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nameKo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">라운드 시간</label>
                <br />
                <select className="select" value={roundSeconds} onChange={(e) => setRoundSeconds(Number(e.target.value))}>
                  {ROUND_SECONDS_PRESETS.map((s) => (
                    <option key={s} value={s}>
                      {Math.round(s / 60) === s / 60 ? `${s / 60}분` : `${s}초`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">라운드 수</label>
                <br />
                <select className="select" value={totalRounds} onChange={(e) => setTotalRounds(Number(e.target.value))}>
                  {TOTAL_ROUNDS_PRESETS.map((r) => (
                    <option key={r} value={r}>
                      {r}라운드
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">휴식 시간</label>
                <br />
                <select className="select" value={restSeconds} onChange={(e) => setRestSeconds(Number(e.target.value))}>
                  {REST_SECONDS_PRESETS.map((s) => (
                    <option key={s} value={s}>
                      {s}초
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">페이스</label>
                <br />
                <select className="select" value={pace} onChange={(e) => setPace(e.target.value as ShadowPace)}>
                  {PACES.map((p) => (
                    <option key={p} value={p}>
                      {PACE_LABEL[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="video-status-message">
              총 훈련 시간: 약 {Math.round((roundSeconds * totalRounds + restSeconds * (totalRounds - 1)) / 60)}분 ({totalRounds}라운드 ×{' '}
              {Math.round(roundSeconds / 60) || Math.round(roundSeconds)}
              {roundSeconds % 60 === 0 ? '분' : '초'} + 휴식 {restSeconds}초 × {totalRounds - 1}회)
            </p>
            {errorMessage && <p className="video-status-message">{errorMessage}</p>}
            <div className="modal-actions modal-actions--start">
              <button className="btn btn-primary" onClick={handleStart}>
                훈련 시작
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (session.phase === 'finished') {
    const totalMinutes = session.finishedAt ? Math.max(1, Math.round((new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 60000)) : 0;
    return (
      <div className="page">
        <div className="container">
          <BackButton />
          <div className="breadcrumb">
            <Link to="/">홈</Link>
            <span>/</span>
            <span>AI 쉐도우 복싱 코치</span>
          </div>
          <div className="section-title">
            <h2>🎉 쉐도우 복싱 훈련 완료</h2>
          </div>
          <div className="curriculum-stat-row">
            <div>
              <strong>{session.currentRound}/{session.totalRounds}</strong>
              <span>완료 라운드</span>
            </div>
            <div>
              <strong>{session.announcedTechniqueIds.length}회</strong>
              <span>기술 안내 횟수</span>
            </div>
            <div>
              <strong>{new Set(session.announcedTechniqueIds).size}개</strong>
              <span>사용 기술 종류</span>
            </div>
            <div>
              <strong>{totalMinutes}분</strong>
              <span>총 훈련 시간</span>
            </div>
          </div>
          <div className="modal-actions modal-actions--start">
            <Link to="/my-skills" className="btn btn-secondary">
              훈련 기록 보기
            </Link>
            <button className="btn btn-primary" onClick={handleReset}>
              다시 설정하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  const remainingMs = getPhaseRemainingMs(session);
  const lastTechniqueId = session.announcedTechniqueIds[session.announcedTechniqueIds.length - 1];
  const lastTechnique = lastTechniqueId ? resolveTechnique(lastTechniqueId) : undefined;

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>AI 쉐도우 복싱 코치</span>
        </div>
        <div className="chip-row">
          <span className="chip active">
            라운드 {session.currentRound} / {session.totalRounds}
          </span>
          <span className="chip">{session.phase === 'round' ? '훈련 중' : '휴식 중'}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => (session.paused ? resume() : pause())} style={{ marginLeft: 'auto' }}>
            {session.paused ? '▶ 재개' : '⏸ 일시정지'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => stop()}>
            ■ 훈련 종료
          </button>
        </div>

        {session.paused ? (
          <div className="card info-card text-center">
            <h3>일시정지됨</h3>
            <p>진행 상황은 그대로 저장되어 있습니다. 준비되면 재개하세요.</p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={resume}>
                ▶ 재개
              </button>
            </div>
          </div>
        ) : (
          <div className="card info-card text-center">
            <h3>{session.phase === 'round' ? '훈련 중' : '휴식'}</h3>
            <div className="timer-display">{formatMMSS(remainingMs)}</div>
            {session.phase === 'round' && (
              <div style={{ fontSize: '2rem', fontWeight: 700, minHeight: '2.4em' }}>{lastTechnique?.koreanName || lastTechnique?.name || ' '}</div>
            )}
            {!ttsSupported && <p className="video-status-message">⚠️ 이 환경에서는 음성 안내를 지원하지 않아 화면 텍스트로만 안내됩니다.</p>}
          </div>
        )}

        <EmptyState icon="🎧" text="화면을 보지 않아도 음성 안내에 따라 훈련할 수 있습니다." />
      </div>
    </div>
  );
}
