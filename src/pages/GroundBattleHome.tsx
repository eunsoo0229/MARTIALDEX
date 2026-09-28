import { Link } from 'react-router-dom';
import BackButton from '../components/BackButton';
import { listGroundBattleMatches } from '../lib/groundBattle/service';
import { OUTCOME_LABEL } from '../lib/groundBattle/types';

export default function GroundBattleHome() {
  const matches = listGroundBattleMatches();
  const wins = matches.filter((m) => m.outcome === 'player_submission_win' || m.outcome === 'player_tko_win' || m.outcome === 'decision_player').length;

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/free-training">자유훈련</Link>
          <span>/</span>
          <span>그라운드 배틀</span>
        </div>
        <div className="section-title">
          <h2>⚔️ 그라운드 배틀</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          턴제 그라운드 격투 대결입니다. 현재 포지션과 상황을 보고, MARTIALDEX에서 배운 지식으로 어떤 기술을 쓸지 직접 판단하세요 — 추천 기술은 알려주지 않습니다.
        </p>

        <div className="card info-card">
          <p>
            지금까지 <strong>{matches.length}</strong>경기 · <strong>{wins}</strong>승
          </p>
          <div className="modal-actions modal-actions--start" style={{ marginTop: 8 }}>
            <Link to="/free-training/ground-battle/setup" className="btn btn-primary">
              매치 시작
            </Link>
            <Link to="/free-training/ground-battle/history" className="btn btn-secondary">
              전적 보기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
