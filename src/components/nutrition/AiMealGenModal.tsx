import { useState } from 'react';
import { createPortal } from 'react-dom';
import { generateMealPlan, type GeneratedMealPlan } from '../../lib/nutrition/aiMealGen';
import { MEAL_TYPE_LABEL, type MealType, type NutritionProfile } from '../../lib/nutrition/types';
import { addMeal } from '../../lib/nutrition/mealService';
import { todayDateKey } from '../../lib/dateUtil';
import FoodItemRows from './FoodItemRows';
import BottomSheet from '../BottomSheet';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const EMPTY_PLAN: GeneratedMealPlan = { breakfast: [], lunch: [], dinner: [], snack: [] };

/**
 * AI 식단 생성 (item 3) — one Gemini call returns a full day's plan; the
 * result stays editable per meal type (FoodItemRows, same shared row editor
 * as MealFormModal) before the user saves any of it. Saving writes one
 * NutritionMealEntry per non-empty meal type, all tagged source:'ai_generated'
 * so they show as AI 추정값 in every downstream view.
 */
export default function AiMealGenModal({ onClose, onSaved, profile }: { onClose: () => void; onSaved: () => void; profile: NutritionProfile }) {
  const [goalDescription, setGoalDescription] = useState('');
  const [plan, setPlan] = useState<GeneratedMealPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState('');

  async function handleGenerate() {
    if (!goalDescription.trim()) {
      setWarning('예: "운동하는 날에 먹을 식단을 짜줘"처럼 원하는 목표를 입력해주세요.');
      return;
    }
    setLoading(true);
    setWarning('');
    const result = await generateMealPlan({
      goalDescription,
      calorieGoal: profile.calorieGoal,
      carbGoalG: profile.carbGoalG,
      proteinGoalG: profile.proteinGoalG,
      fatGoalG: profile.fatGoalG,
    });
    setLoading(false);
    if (!result.ok) {
      setWarning(result.message);
      return;
    }
    setPlan(result.data);
  }

  function handleSave() {
    if (!plan) return;
    const date = todayDateKey();
    let savedCount = 0;
    for (const mt of MEAL_TYPES) {
      const foods = plan[mt].filter((f) => f.name.trim() !== '');
      if (foods.length === 0) continue;
      addMeal({ date, mealType: mt, foods, source: 'ai_generated' });
      savedCount++;
    }
    if (savedCount === 0) {
      setWarning('저장할 음식이 없습니다. 최소 한 끼 이상 음식을 남겨주세요.');
      return;
    }
    onSaved();
    onClose();
  }

  return createPortal(
    <BottomSheet onClose={onClose} className={`ai-modal${plan ? ' modal-panel--scrollable' : ''}`}>
        <h3>🤖 AI 식단 생성</h3>
        <p className="video-status-message">
          AI가 생성한 추정값입니다 — 그대로 사용하거나 저장 전에 자유롭게 수정할 수 있습니다.
        </p>

        {!plan && (
          <>
            <textarea
              value={goalDescription}
              onChange={(e) => setGoalDescription(e.target.value)}
              placeholder='예: "복싱 훈련을 하는 날의 식단을 짜줘", "하루 목표 칼로리에 맞춰 식단을 만들어줘"'
              style={{ minHeight: 80 }}
            />
            {warning && <p className="ai-inline-warning">{warning}</p>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>
                취소
              </button>
              <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
                {loading ? '생성 중…' : '식단 생성하기'}
              </button>
            </div>
          </>
        )}

        {plan && (
          <>
            {/* 4개 끼니 전체가 길어질 수 있는 영역 — 이 부분만 독립적으로
                스크롤되고, 위 disclaimer/제목과 아래 저장 버튼은 고정된다. */}
            <div className="modal-scroll-body">
              {MEAL_TYPES.map((mt) => (
                <div key={mt} style={{ marginTop: 12 }}>
                  <label className="field-label">{MEAL_TYPE_LABEL[mt]}</label>
                  {plan[mt].length === 0 ? (
                    <p className="video-status-message">이 끼니는 비워두는 것을 권장합니다.</p>
                  ) : (
                    <FoodItemRows foods={plan[mt]} onChange={(foods) => setPlan({ ...(plan ?? EMPTY_PLAN), [mt]: foods })} />
                  )}
                </div>
              ))}
            </div>
            {warning && <p className="ai-inline-warning">{warning}</p>}
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setPlan(null);
                  setWarning('');
                }}
              >
                다시 생성
              </button>
              <button className="btn btn-primary" onClick={handleSave}>
                이대로 저장
              </button>
            </div>
          </>
        )}
    </BottomSheet>,
    document.body
  );
}
