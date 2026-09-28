import { Link, Navigate, useParams } from 'react-router-dom';
import BackButton from '../components/BackButton';
import { getGroundBattleMatch } from '../lib/groundBattle/service';
import { buildReviewSuggestion, computeMatchStats, isPlayerLoss, isPlayerWin, summarizeTurnOutcome } from '../lib/groundBattle/reviewFeedback';
import { clearGroundBattleRun } from '../lib/groundBattle/matchStore';
import { positionStateLabel } from '../lib/groundBattle/positionUtil';
import { DIFFICULTY_LABEL, OUTCOME_LABEL } from '../lib/groundBattle/types';
import { resolveTechniquesByIds } from '../lib/userTechniques/service';

export default function GroundBattleResult() {
  const { matchId = '' } = useParams();
  const record = getGroundBattleMatch(matchId);
  if (!record) return <Navigate to="/free-training/ground-battle/history" replace />;

  const stats = computeMatchStats(record);
  const suggestion = buildReviewSuggestion(stats);
  const title = record.outcome ? OUTCOME_LABEL[record.outcome] : '매치 종료';
  const icon = isPlayerWin(record.outcome) ? '🏆' : isPlayerLoss(record.outcome) ? '🥲' : '🤝';
  const isLocal = record.mode === 'local_2p';

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/free-training/ground-battle">그라운드 배틀</Link>
          <span>/</span>
          <span>결과</span>
        </div>
        <div className="section-title">
          <h2 data-testid="ground-battle-result-title">
            {icon} {isLocal ? title.replace('승리', '(선수 1 기준) 승리').replace('패배', '(선수 1 기준) 패배') : title}
          </h2>
        </div>

        <div className="card info-card">
          <p style={{ margin: 0 }}>
            {isLocal ? '로컬 2인' : `VS AI · ${DIFFICULTY_LABEL[record.difficulty]}`} · 총 {stats.totalTurns}턴 (내 행동 {stats.playerTurns}회)
          </p>
        </div>

        <div className="card info-card">
          <h3>성공한 기술</h3>
          {stats.successfulTechniques.length === 0 ? (
            <p className="video-status-message">없음</p>
          ) : (
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {stats.successfulTechniques.map((t) => (
                <li key={t.techniqueId}>
                  {t.name} ×{t.count}
                </li>
              ))}
            </ul>
          )}
          <h3 style={{ marginTop: 12 }}>실패한 기술</h3>
          {stats.failedTechniques.length === 0 ? (
            <p className="video-status-message">없음</p>
          ) : (
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {stats.failedTechniques.map((t) => (
                <li key={t.techniqueId}>
                  <Link to={`/arts/bjj/techniques/${t.techniqueId}`}>{t.name}</Link> ×{t.count}
                </li>
              ))}
            </ul>
          )}
        </div>

        {suggestion && (
          <div className="card info-card" data-testid="ground-battle-review">
            <h3>학습 추천</h3>
            <p style={{ margin: 0 }}>{suggestion}</p>
          </div>
        )}

        <details className="card info-card">
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>턴별 기록 보기</summary>
          <ol style={{ paddingLeft: 18, marginTop: 10 }}>
            {record.turnLog.map((e) => {
              const t = resolveTechniquesByIds([e.techniqueId])[0];
              const who = e.actor === 'player' ? (isLocal ? '선수 1' : '나') : isLocal ? '선수 2' : '상대';
              return (
                <li key={`${e.turnNumber}-${e.actor}`} className="video-status-message" style={{ margin: '2px 0' }}>
                  {who}: {t?.koreanName || t?.name || e.techniqueId} — {summarizeTurnOutcome(e)} ({positionStateLabel(e.positionBefore)}
                  {e.positionBefore !== e.positionAfter ? ` → ${positionStateLabel(e.positionAfter)}` : ''})
                </li>
              );
            })}
          </ol>
        </details>

        <div className="modal-actions modal-actions--start">
          <Link to="/free-training/ground-battle/setup" className="btn btn-primary" onClick={() => clearGroundBattleRun()}>
            다시 하기
          </Link>
          <Link to="/free-training/ground-battle/history" className="btn btn-secondary" onClick={() => clearGroundBattleRun()}>
            전적 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
