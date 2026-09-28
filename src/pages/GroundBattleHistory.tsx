import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BackButton from '../components/BackButton';
import EmptyState from '../components/EmptyState';
import { listGroundBattleMatches } from '../lib/groundBattle/service';
import { GROUND_BATTLE_MATCHES_EVENT } from '../lib/groundBattle/repository';
import { computeHistoryStats } from '../lib/groundBattle/reviewFeedback';
import { positionStateLabel } from '../lib/groundBattle/positionUtil';
import { DIFFICULTY_LABEL, OUTCOME_LABEL } from '../lib/groundBattle/types';
import { resolveTechniquesByIds } from '../lib/userTechniques/service';

export default function GroundBattleHistory() {
  const [records, setRecords] = useState(listGroundBattleMatches);
  useEffect(() => {
    const onUpdate = () => setRecords(listGroundBattleMatches());
    window.addEventListener(GROUND_BATTLE_MATCHES_EVENT, onUpdate);
    return () => window.removeEventListener(GROUND_BATTLE_MATCHES_EVENT, onUpdate);
  }, []);

  const stats = computeHistoryStats(records);
  const mostUsed = stats.mostUsedTechniqueId ? resolveTechniquesByIds([stats.mostUsedTechniqueId])[0] : undefined;

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/free-training/ground-battle">그라운드 배틀</Link>
          <span>/</span>
          <span>전적</span>
        </div>
        <div className="section-title">
          <h2>그라운드 배틀 전적</h2>
        </div>

        {records.length === 0 ? (
          <EmptyState icon="⚔️" text="아직 기록된 매치가 없습니다." />
        ) : (
          <>
            <div className="card info-card" data-testid="ground-battle-history-stats">
              <p style={{ margin: 0 }}>
                경기 <strong>{stats.matches}</strong> · 승 <strong>{stats.wins}</strong> · 패 <strong>{stats.losses}</strong>
                {stats.draws > 0 ? ` · 무 ${stats.draws}` : ''}
              </p>
              {mostUsed && <p style={{ margin: '6px 0 0' }}>가장 많이 쓴 기술: {mostUsed.koreanName || mostUsed.name}</p>}
              {stats.bestPosition && <p style={{ margin: '6px 0 0' }}>가장 잘 풀린 포지션: {positionStateLabel(stats.bestPosition)}</p>}
              {stats.weakestPosition && <p style={{ margin: '6px 0 0' }}>약한 포지션: {positionStateLabel(stats.weakestPosition)}</p>}
            </div>

            <div className="stack gap-2">
              {records.map((r) => (
                <Link key={r.id} to={`/free-training/ground-battle/result/${r.id}`} className="card info-card" style={{ display: 'block' }}>
                  <strong>{r.outcome ? OUTCOME_LABEL[r.outcome] : '종료'}</strong>
                  <span className="video-status-message" style={{ marginLeft: 8 }}>
                    {r.mode === 'local_2p' ? '로컬 2인' : `AI ${DIFFICULTY_LABEL[r.difficulty]}`} · {r.turnCount}턴 · {r.finishedAt.slice(0, 10)}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
