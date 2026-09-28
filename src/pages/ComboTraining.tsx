import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getCombo } from '../lib/combo/service';
import { resolveTechniquesByIds } from '../lib/userTechniques/service';
import { getComboSession, getRestRemainingMs, startComboSession } from '../lib/combo/sessionStore';
import { useComboTraining } from '../lib/combo/useComboTraining';
import DifficultyBadge from '../components/DifficultyBadge';
import RelatedVideos from '../components/RelatedVideos';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

const ROUND_PRESETS = [1, 2, 3, 5];
const REST_PRESETS = [30, 60, 90, 120];

function formatMMSS(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(totalMs / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ComboTraining() {
  const { comboId = '' } = useParams();
  const combo = getCombo(comboId);
  const [totalRounds, setTotalRounds] = useState(3);
  const [restSeconds, setRestSeconds] = useState(60);

  const { session, completeCurrentTechnique, pauseRestTimer, resumeRestTimer, skipRestTimer, pauseComboSession, resumeComboSession } = useComboTraining();

  if (!combo) return <Navigate to="/combos" replace />;

  const isThisCombo = session?.comboId === combo.id;

  if (!isThisCombo || !session) {
    return (
      <div className="page">
        <div className="container">
          <BackButton />
          <div className="breadcrumb">
            <Link to="/">홈</Link>
            <span>/</span>
            <Link to="/combos">콤보 북</Link>
            <span>/</span>
            <span>{combo.name}</span>
          </div>
          <div className="section-title">
            <h2>🔥 콤보 훈련 시작</h2>
          </div>
          <div className="card info-card">
            <h3>{combo.name}</h3>
            <div className="chip-row" style={{ flexWrap: 'wrap' }}>
              {resolveTechniquesByIds(combo.techniqueIds).map((t, i) => (
                <span key={`${t.id}-${i}`} className="chip">
                  {i > 0 ? '→ ' : ''}
                  {t.name}
                </span>
              ))}
            </div>
            <div className="chip-row" style={{ marginTop: 16 }}>
              <div>
                <label className="field-label">세트(라운드) 수</label>
                <br />
                <select className="select" value={totalRounds} onChange={(e) => setTotalRounds(Number(e.target.value))}>
                  {ROUND_PRESETS.map((r) => (
                    <option key={r} value={r}>
                      {r}세트
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">세트 사이 휴식</label>
                <br />
                <select className="select" value={restSeconds} onChange={(e) => setRestSeconds(Number(e.target.value))}>
                  {REST_PRESETS.map((r) => (
                    <option key={r} value={r}>
                      {r}초
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-actions modal-actions--start">
              <button className="btn btn-primary" onClick={() => startComboSession(combo, { totalRounds, restSeconds })}>
                훈련 시작
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (session.finishedAt) {
    const totalMinutes = Math.max(1, Math.round((new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 60000));
    return (
      <div className="page">
        <div className="container">
          <BackButton />
          <div className="breadcrumb">
            <Link to="/">홈</Link>
            <span>/</span>
            <Link to="/combos">콤보 북</Link>
            <span>/</span>
            <span>{combo.name}</span>
          </div>
          <div className="section-title">
            <h2>🎉 콤보 훈련 완료</h2>
          </div>
          <div className="curriculum-stat-row">
            <div>
              <strong>{session.completedRounds}세트</strong>
              <span>완료 세트</span>
            </div>
            <div>
              <strong>{session.completedRounds * session.techniqueIds.length}회</strong>
              <span>총 수행 기술 수</span>
            </div>
            <div>
              <strong>{totalMinutes}분</strong>
              <span>총 훈련 시간</span>
            </div>
          </div>
          <p className="video-status-message">"{combo.name}" 콤보 훈련을 완료했습니다.</p>
          <div className="modal-actions modal-actions--start">
            <Link to="/my-skills" className="btn btn-secondary">
              훈련 기록 보기
            </Link>
            <Link to="/combos" className="btn btn-ghost">
              콤보 북으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const technique = resolveTechniquesByIds([session.techniqueIds[session.currentTechniqueIndex]])[0];
  const restTimer = session.restTimer;
  const restRemainingMs = restTimer ? getRestRemainingMs(restTimer) : 0;
  const restExpired = !!restTimer && restTimer.pausedRemainingMs === null && restRemainingMs <= 0;

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/combos">콤보 북</Link>
          <span>/</span>
          <span>{combo.name}</span>
        </div>
        <div className="chip-row">
          <span className="chip active">
            세트 {session.completedRounds + 1} / {session.totalRounds}
          </span>
          <span className="chip">
            기술 {session.currentTechniqueIndex + 1} / {session.techniqueIds.length}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => (session.paused ? resumeComboSession() : pauseComboSession())}
            style={{ marginLeft: 'auto' }}
          >
            {session.paused ? '▶ 재개' : '⏸ 일시정지'}
          </button>
        </div>

        {session.paused ? (
          <div className="card info-card text-center">
            <h3>일시정지됨</h3>
            <p>진행 상황은 그대로 저장되어 있습니다. 준비되면 재개하세요.</p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={resumeComboSession}>
                ▶ 재개
              </button>
            </div>
          </div>
        ) : restTimer ? (
          <div className="card info-card" style={{ textAlign: 'center', borderColor: 'var(--accent, #e53e3e)' }}>
            <h3>세트 {session.completedRounds} 완료 · 휴식</h3>
            <div style={{ fontSize: '2.6rem', fontWeight: 800, margin: '10px 0' }}>{restExpired ? '휴식 종료!' : formatMMSS(restRemainingMs)}</div>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              {restExpired ? (
                <button className="btn btn-primary" onClick={skipRestTimer}>
                  다음 세트 시작
                </button>
              ) : (
                <>
                  <button className="btn btn-secondary" onClick={() => (restTimer.pausedRemainingMs !== null ? resumeRestTimer() : pauseRestTimer())}>
                    {restTimer.pausedRemainingMs !== null ? '재개' : '일시정지'}
                  </button>
                  <button className="btn btn-ghost" onClick={skipRestTimer}>
                    건너뛰기
                  </button>
                </>
              )}
            </div>
          </div>
        ) : technique ? (
          <>
            <div className="detail-hero">
              <div>
                <h1>{combo.name}</h1>
                <div className="detail-hero__korean">{technique.name}</div>
                <DifficultyBadge difficulty={technique.difficulty} />
              </div>
            </div>
            <div className="card info-card">
              <div className="chip-row" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
                {session.techniqueIds.map((id, i) => (
                  <span key={`${id}-${i}`} className={`chip${i === session.currentTechniqueIndex ? ' active' : ''}`}>
                    {i < session.currentTechniqueIndex ? '☑ ' : i === session.currentTechniqueIndex ? '▶ ' : '☐ '}
                    {resolveTechniquesByIds([id])[0]?.name ?? id}
                  </span>
                ))}
              </div>
              <p>{technique.purpose || technique.description}</p>
              <div className="modal-actions modal-actions--start">
                <Link to={`/arts/${technique.martialArt}/techniques/${technique.id}`} className="btn btn-secondary">
                  기술 상세 보기
                </Link>
                <button className="btn btn-primary" onClick={completeCurrentTechnique}>
                  완료
                </button>
              </div>
            </div>
            <RelatedVideos technique={technique} liveSearchFallback />
          </>
        ) : (
          <EmptyState icon="🥊" text="콤보 훈련 정보를 불러오지 못했습니다." />
        )}
      </div>
    </div>
  );
}
