import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BackButton from '../components/BackButton';
import EmptyState from '../components/EmptyState';
import { rosterFromSkillEntries } from '../lib/groundBattle/service';
import { useAllSkillProgress } from '../lib/skillProgress/useSkillProgress';
import { startMatch } from '../lib/groundBattle/matchStore';
import { ACTION_CATEGORY_LABEL, DIFFICULTY_LABEL, type ActionCategory, type BattleDifficulty, type BattleMode, type PositionFamily } from '../lib/groundBattle/types';
import { familyLabel } from '../lib/groundBattle/positionUtil';

const STARTING_FAMILIES: PositionFamily[] = ['guard', 'half_guard', 'side_control', 'mount', 'turtle'];
const CATEGORIES: ActionCategory[] = ['attack', 'escape', 'position', 'defend', 'submission'];

export default function GroundBattleSetup() {
  const navigate = useNavigate();
  const [difficulty, setDifficulty] = useState<BattleDifficulty>('easy');
  const [mode, setMode] = useState<BattleMode>('ai');
  const [startingFamily, setStartingFamily] = useState<PositionFamily | 'random'>('random');

  // Reactive (same hook the skill dashboards use) so practicing a technique
  // elsewhere while this screen is open updates the loadout immediately.
  const skillEntries = useAllSkillProgress();
  const roster = useMemo(() => rosterFromSkillEntries(skillEntries), [skillEntries]);
  const countsByCategory = useMemo(() => {
    const counts: Record<ActionCategory, number> = { attack: 0, escape: 0, position: 0, defend: 0, submission: 0 };
    for (const t of roster) counts[t.category]++;
    return counts;
  }, [roster]);

  function handleStart() {
    const family = startingFamily === 'random' ? STARTING_FAMILIES[Math.floor(Math.random() * STARTING_FAMILIES.length)] : startingFamily;
    const topRole = Math.random() < 0.5 ? 'player' : 'opponent';
    startMatch(difficulty, mode, roster.map((t) => t.techniqueId), { family, topRole });
    navigate('/free-training/ground-battle/battle');
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/free-training/ground-battle">그라운드 배틀</Link>
          <span>/</span>
          <span>매치 설정</span>
        </div>
        <div className="section-title">
          <h2>매치 설정</h2>
        </div>

        {roster.length === 0 ? (
          <EmptyState icon="🥋" text="그라운드 기술을 아직 학습하지 않았습니다 — 나의 기술 화면에서 먼저 연습해보세요." />
        ) : (
          <>
            <div className="card info-card">
              <label className="field-label">상대</label>
              <div className="chip-row" style={{ marginBottom: 12 }}>
                <button type="button" className={`chip${mode === 'ai' ? ' active' : ''}`} onClick={() => setMode('ai')}>
                  VS AI
                </button>
                <button type="button" className={`chip${mode === 'local_2p' ? ' active' : ''}`} onClick={() => setMode('local_2p')}>
                  로컬 2인
                </button>
              </div>

              {mode === 'ai' && (
                <>
                  <label className="field-label">난이도</label>
                  <div className="chip-row" style={{ marginBottom: 12 }}>
                    {(['easy', 'normal'] as BattleDifficulty[]).map((d) => (
                      <button key={d} type="button" className={`chip${difficulty === d ? ' active' : ''}`} onClick={() => setDifficulty(d)}>
                        {DIFFICULTY_LABEL[d]}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <label className="field-label">시작 포지션</label>
              <select className="select" style={{ width: '100%', marginBottom: 12 }} value={startingFamily} onChange={(e) => setStartingFamily(e.target.value as PositionFamily | 'random')}>
                <option value="random">랜덤</option>
                {STARTING_FAMILIES.map((f) => (
                  <option key={f} value={f}>
                    {familyLabel(f)}
                  </option>
                ))}
              </select>

              <label className="field-label">보유 기술 (학습한 그라운드 기술 기준)</label>
              <div className="chip-row" style={{ marginBottom: 12 }}>
                {CATEGORIES.map((c) => (
                  <span key={c} className="chip">
                    {ACTION_CATEGORY_LABEL[c]} {countsByCategory[c]}
                  </span>
                ))}
              </div>

              <div className="modal-actions modal-actions--start">
                <button type="button" className="btn btn-primary" onClick={handleStart}>
                  전투 시작
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
