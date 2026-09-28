import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import BackButton from '../components/BackButton';
import { useGroundBattleRun } from '../lib/groundBattle/useGroundBattleRun';
import { advancePastPassDevice, endMatchNow, runAiTurn, submitActorAction } from '../lib/groundBattle/matchStore';
import { finalizeGroundBattleMatch } from '../lib/groundBattle/service';
import { getCuratedTechnique } from '../lib/groundBattle/curatedRoster';
import { familyLabel, positionStateLabel, stateFor } from '../lib/groundBattle/positionUtil';
import { summarizeTurnOutcome } from '../lib/groundBattle/reviewFeedback';
import { ACTION_CATEGORY_LABEL, type ActionCategory } from '../lib/groundBattle/types';
import { resolveTechniquesByIds } from '../lib/userTechniques/service';

const CATEGORIES: ActionCategory[] = ['attack', 'escape', 'position', 'defend', 'submission'];

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="progress-track">
      <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }} />
    </div>
  );
}

export default function GroundBattleMatch() {
  const run = useGroundBattleRun();
  const navigate = useNavigate();
  const [category, setCategory] = useState<ActionCategory | null>(null);
  const aiTriggeredForTurn = useRef<number | null>(null);
  const finalizedRef = useRef(false);

  useEffect(() => {
    if (!run) return;
    if (run.phase === 'opponent_turn' && run.mode === 'ai' && aiTriggeredForTurn.current !== run.turnNumber) {
      aiTriggeredForTurn.current = run.turnNumber;
      const timer = window.setTimeout(() => {
        runAiTurn();
      }, 700);
      return () => window.clearTimeout(timer);
    }
  }, [run?.phase, run?.turnNumber, run?.mode]);

  useEffect(() => {
    if (run?.phase === 'finished' && !finalizedRef.current) {
      finalizedRef.current = true;
      const record = finalizeGroundBattleMatch(run);
      navigate(`/free-training/ground-battle/result/${record.id}`, { replace: true });
    }
  }, [run?.phase]);

  if (!run) return <Navigate to="/free-training/ground-battle/setup" replace />;
  if (run.phase === 'finished') return null; // navigating away via the effect above

  const playerState = stateFor('player', run.position);
  const opponentState = stateFor('opponent', run.position);
  const playerTopIsPlayer = run.position.topRole === 'player';
  const playerLabel = run.mode === 'local_2p' ? '선수 1' : '나';
  const opponentLabel = run.mode === 'local_2p' ? '선수 2' : '상대';

  const loadoutTechniques = resolveTechniquesByIds(run.playerLoadoutTechniqueIds);
  const techniquesInCategory = category
    ? run.playerLoadoutTechniqueIds
        .map((id) => ({ curated: getCuratedTechnique(id), real: loadoutTechniques.find((t) => t.id === id) }))
        .filter((x) => x.curated && x.real && x.curated.category === category)
    : [];

  function handlePick(techniqueId: string) {
    // submitActorAction is the authority on whose turn it is; a rejected
    // call (turnOutcome === null) consumed nothing, so just keep the picker.
    const { turnOutcome } = submitActorAction(actorForPicker, techniqueId);
    if (turnOutcome !== null) setCategory(null);
  }

  // In local 2-player mode the "opponent" fighter is a second human who
  // uses the exact same picker (their own view never shows AI-style legality
  // info either). In AI mode only the player ever picks.
  const actorForPicker: 'player' | 'opponent' = run.phase === 'opponent_turn' && run.mode === 'local_2p' ? 'opponent' : 'player';
  const pickerOpen = run.phase === 'player_turn' || (run.phase === 'opponent_turn' && run.mode === 'local_2p');

  // Last turns since the viewer's previous decision — never shown before a
  // choice, only as the outcome of choices already made (spec 17/18).
  const recentLog = run.turnLog.slice(-2);

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/free-training/ground-battle">그라운드 배틀</Link>
          <span>/</span>
          <span>매치</span>
        </div>

        <div className="card info-card ground-battle-arena" data-family={run.position.family}>
          <div className="ground-battle-arena__title">{familyLabel(run.position.family)}</div>
          <div className={`ground-battle-arena__fighter ground-battle-arena__fighter--top ${playerTopIsPlayer ? 'is-player' : 'is-opponent'}`}>
            ▼ {playerTopIsPlayer ? playerLabel : opponentLabel} (위)
          </div>
          <div className={`ground-battle-arena__fighter ground-battle-arena__fighter--bottom ${playerTopIsPlayer ? 'is-opponent' : 'is-player'}`}>
            ▲ {playerTopIsPlayer ? opponentLabel : playerLabel} (아래)
          </div>
          <div className="ground-battle-arena__turn">턴 {run.turnNumber}</div>
        </div>

        <div className="card info-card">
          <strong>{playerLabel} ({playerState.endsWith('top') ? '위' : '아래'})</strong>
          <p className="video-status-message" style={{ margin: '4px 0' }}>
            컨디션
          </p>
          <Bar value={run.player.hp} color="#e5484d" />
          <p className="video-status-message" style={{ margin: '8px 0 4px' }}>
            스태미나
          </p>
          <Bar value={run.player.stamina} color="#3b82f6" />
        </div>

        <div className="card info-card">
          <strong>{opponentLabel} ({opponentState.endsWith('top') ? '위' : '아래'})</strong>
          <p className="video-status-message" style={{ margin: '4px 0' }}>
            컨디션
          </p>
          <Bar value={run.opponent.hp} color="#e5484d" />
          <p className="video-status-message" style={{ margin: '8px 0 4px' }}>
            스태미나
          </p>
          <Bar value={run.opponent.stamina} color="#3b82f6" />
        </div>

        {recentLog.length > 0 && (
          <div className="card info-card" data-testid="ground-battle-turn-result">
            {recentLog.map((e) => {
              const name = resolveTechniquesByIds([e.techniqueId])[0];
              const who = e.actor === 'player' ? playerLabel : opponentLabel;
              return (
                <div key={`${e.turnNumber}-${e.actor}`} className="ground-battle-log-row">
                  <div>
                    <strong>{who}</strong> — {name?.koreanName || name?.name || e.techniqueId} 시도
                  </div>
                  <div className={`ground-battle-log-row__outcome is-${e.outcome}`}>{summarizeTurnOutcome(e)}</div>
                  {e.positionBefore !== e.positionAfter && (
                    <div className="video-status-message" style={{ margin: 0 }}>
                      포지션 변화: {positionStateLabel(e.positionBefore)} → {positionStateLabel(e.positionAfter)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {run.phase === 'pass_device' && (
          <div className="card info-card text-center">
            <h3>다음 선수 차례입니다</h3>
            <p>화면을 넘겨주세요.</p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => advancePastPassDevice()}>
                준비 완료, 계속하기
              </button>
            </div>
          </div>
        )}

        {run.phase === 'opponent_turn' && run.mode === 'ai' && (
          <div className="card info-card text-center">
            <p className="video-status-message row gap-1">
              <span className="spinner" /> 상대가 행동을 고르는 중...
            </p>
          </div>
        )}

        {pickerOpen && (
          <div className="card info-card">
            {!category ? (
              <>
                <label className="field-label">{actorForPicker === 'player' ? playerLabel : opponentLabel} — 행동 선택</label>
                <div className="chip-row">
                  {CATEGORIES.map((c) => (
                    <button key={c} type="button" className="chip" onClick={() => setCategory(c)}>
                      {ACTION_CATEGORY_LABEL[c]}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <label className="field-label">{ACTION_CATEGORY_LABEL[category]} — 기술 선택</label>
                <div className="stack gap-2">
                  {techniquesInCategory.length === 0 ? (
                    <p className="video-status-message">이 카테고리에 학습한 기술이 없습니다.</p>
                  ) : (
                    techniquesInCategory.map(({ real }) => (
                      <button key={real!.id} type="button" className="btn btn-secondary" style={{ textAlign: 'left' }} onClick={() => handlePick(real!.id)}>
                        {real!.koreanName || real!.name}
                      </button>
                    ))
                  )}
                </div>
                <div className="modal-actions modal-actions--start" style={{ marginTop: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setCategory(null)}>
                    ← 카테고리 다시 선택
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="modal-actions modal-actions--start">
          <button className="btn btn-ghost btn-sm" onClick={() => endMatchNow()}>
            매치 종료
          </button>
        </div>
      </div>
    </div>
  );
}
