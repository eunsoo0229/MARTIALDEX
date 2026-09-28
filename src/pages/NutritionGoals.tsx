import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNutritionProfile } from '../lib/nutrition/useNutritionProfile';
import { saveNutritionProfile } from '../lib/nutrition/profileService';
import { computeBmr } from '../lib/nutrition/bmr';
import { GOAL_TYPE_LABEL, type Gender, type NutritionGoalType, type NutritionProfile } from '../lib/nutrition/types';
import NumberField from '../components/NumberField';
import BackButton from '../components/BackButton';

const GOAL_TYPES: NutritionGoalType[] = ['lose', 'gain', 'maintain'];
// Very light "sedentary-to-lightly-active" activity multiplier + a common
// deficit/surplus adjustment per goal type — an assistive STARTING SUGGESTION
// only (item 2: "확정적인 건강 판단을 내리지 않도록"), never applied
// automatically and always requires an explicit button press.
const ACTIVITY_FACTOR = 1.375;
const GOAL_ADJUSTMENT_KCAL: Record<NutritionGoalType, number> = { lose: -500, gain: 300, maintain: 0 };

export default function NutritionGoals() {
  const navigate = useNavigate();
  const stored = useNutritionProfile();
  const [profile, setProfile] = useState<NutritionProfile>(stored);
  const [suggestNote, setSuggestNote] = useState('');

  function patch(p: Partial<NutritionProfile>) {
    setProfile((prev) => ({ ...prev, ...p }));
  }

  function handleSuggest() {
    const bmr = computeBmr(profile);
    if (bmr == null) {
      setSuggestNote('제안값을 계산하려면 키/나이/성별/체중을 먼저 입력해주세요.');
      return;
    }
    const maintenance = Math.round(bmr * ACTIVITY_FACTOR);
    const suggestedCalories = Math.max(1200, maintenance + GOAL_ADJUSTMENT_KCAL[profile.goalType]);
    patch({
      calorieGoal: suggestedCalories,
      carbGoalG: Math.round((suggestedCalories * 0.5) / 4),
      proteinGoalG: Math.round((suggestedCalories * 0.3) / 4),
      fatGoalG: Math.round((suggestedCalories * 0.2) / 9),
    });
    setSuggestNote('활동량을 가볍게 가정한 참고용 제안값입니다 — 실제 건강 상태에 따라 직접 조정해주세요. 의학적 판단이 아닙니다.');
  }

  function handleSave() {
    saveNutritionProfile({ ...profile, updatedAt: new Date().toISOString() });
    navigate('/nutrition');
  }

  return (
    <div className="page">
      <div className="container container--narrow">
        <BackButton fallback="/nutrition" />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/nutrition">영양/식단</Link>
          <span>/</span>
          <span>목표 설정</span>
        </div>
        <div className="section-title">
          <h2>🎯 영양 목표 설정</h2>
        </div>

        <div className="card info-card">
          <label className="field-label">목표 유형</label>
          <div className="chip-row" style={{ marginBottom: 12 }}>
            {GOAL_TYPES.map((gt) => (
              <button key={gt} type="button" className={`chip${profile.goalType === gt ? ' active' : ''}`} onClick={() => patch({ goalType: gt })}>
                {GOAL_TYPE_LABEL[gt]}
              </button>
            ))}
          </div>

          <div className="chip-row" style={{ flexWrap: 'wrap', gap: 12 }}>
            <label className="field-label">
              목표 칼로리(kcal)
              <NumberField className="select gym-num-input gym-num-input--wide" min={0} allowEmpty value={profile.calorieGoal} onCommit={(n) => patch({ calorieGoal: n })} />
            </label>
            <label className="field-label">
              탄수화물 목표(g)
              <NumberField className="select gym-num-input" min={0} allowEmpty value={profile.carbGoalG} onCommit={(n) => patch({ carbGoalG: n })} />
            </label>
            <label className="field-label">
              단백질 목표(g)
              <NumberField className="select gym-num-input" min={0} allowEmpty value={profile.proteinGoalG} onCommit={(n) => patch({ proteinGoalG: n })} />
            </label>
            <label className="field-label">
              지방 목표(g)
              <NumberField className="select gym-num-input" min={0} allowEmpty value={profile.fatGoalG} onCommit={(n) => patch({ fatGoalG: n })} />
            </label>
          </div>

          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={handleSuggest}>
            신체 정보로 제안값 계산
          </button>
          {suggestNote && <p className="video-status-message">{suggestNote}</p>}
        </div>

        <div className="card info-card">
          <h3>기초대사량 계산용 신체 정보</h3>
          <p className="video-status-message">이 정보는 기초대사량(BMR) 계산에만 사용되며, 확정적인 건강 판단에는 사용되지 않습니다.</p>
          <div className="chip-row" style={{ flexWrap: 'wrap', gap: 12 }}>
            <label className="field-label">
              키(cm)
              <NumberField className="select gym-num-input" min={0} allowEmpty value={profile.heightCm} onCommit={(n) => patch({ heightCm: n })} />
            </label>
            <label className="field-label">
              나이
              <NumberField className="select gym-num-input" min={0} allowEmpty value={profile.age} onCommit={(n) => patch({ age: n })} />
            </label>
            <label className="field-label">
              체중(kg)
              <NumberField className="select gym-num-input" min={0} step="0.1" allowEmpty value={profile.bodyWeightKg} onCommit={(n) => patch({ bodyWeightKg: n })} />
            </label>
            <label className="field-label">
              성별
              <div className="chip-row">
                {(['male', 'female'] as Gender[]).map((g) => (
                  <button key={g} type="button" className={`chip${profile.gender === g ? ' active' : ''}`} onClick={() => patch({ gender: g })}>
                    {g === 'male' ? '남성' : '여성'}
                  </button>
                ))}
              </div>
            </label>
          </div>
        </div>

        <div className="modal-actions modal-actions--start">
          <button className="btn btn-primary" onClick={handleSave}>
            저장
          </button>
          <Link to="/nutrition" className="btn btn-ghost">
            취소
          </Link>
        </div>
      </div>
    </div>
  );
}
