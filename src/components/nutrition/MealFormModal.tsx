import { useState } from 'react';
import { createPortal } from 'react-dom';
import { MEAL_TYPE_LABEL, type MealSource, type MealType, type NutritionFoodItem } from '../../lib/nutrition/types';
import { addMeal, updateMeal } from '../../lib/nutrition/mealService';
import { todayDateKey } from '../../lib/dateUtil';
import FoodItemRows from './FoodItemRows';
import BottomSheet from '../BottomSheet';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const SOURCE_ESTIMATE_NOTE: Partial<Record<MealSource, string>> = {
  ai_generated: 'AI가 생성한 추정값입니다 — 실제 섭취 전에 확인하고 필요하면 값을 수정한 뒤 저장해주세요.',
  ai_photo: '사진을 기반으로 추정한 값이며 실제 조리법, 재료, 섭취량에 따라 달라질 수 있습니다. 저장 전에 확인/수정해주세요.',
  ai_text: 'AI가 입력하신 문장을 분석해 추정한 값입니다 — 저장 전에 확인하고 필요하면 값을 수정해주세요.',
};

/**
 * 직접 입력(item 4)/편집(item 13)과 AI 생성 결과 확인(item 5·6)이 전부 이
 * 하나의 폼을 거친다 — "변환/분석 결과를 바로 확정하지 말고 사용자가
 * 확인/수정한 뒤 저장" 요구사항을 모든 AI 입력 경로에서 구조적으로 강제.
 */
export default function MealFormModal({
  onClose,
  onSaved,
  mode,
  existingId,
  date,
  initialMealType = 'lunch',
  initialFoods,
  source = 'manual',
  initialNotes = '',
}: {
  onClose: () => void;
  onSaved?: () => void;
  mode: 'create' | 'edit';
  existingId?: string;
  date?: string;
  initialMealType?: MealType;
  initialFoods?: NutritionFoodItem[];
  source?: MealSource;
  initialNotes?: string;
}) {
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [foods, setFoods] = useState<NutritionFoodItem[]>(
    initialFoods && initialFoods.length > 0 ? initialFoods : [{ name: '', amount: '', calories: 0, carbsG: 0, proteinG: 0, fatG: 0 }]
  );
  const [notes, setNotes] = useState(initialNotes);
  const [warning, setWarning] = useState('');

  const estimateNote = SOURCE_ESTIMATE_NOTE[source];

  function handleSave() {
    const validFoods = foods.filter((f) => f.name.trim() !== '');
    if (validFoods.length === 0) {
      setWarning('최소 한 개 이상의 음식 이름을 입력해주세요.');
      return;
    }
    setWarning('');
    if (mode === 'edit' && existingId) {
      updateMeal(existingId, { mealType, foods: validFoods, notes: notes.trim() || null });
    } else {
      addMeal({ date: date ?? todayDateKey(), mealType, foods: validFoods, source, notes: notes.trim() || null });
    }
    onSaved?.();
    onClose();
  }

  return createPortal(
    <BottomSheet onClose={onClose} className="modal-panel--scrollable">
        <h3>{mode === 'edit' ? '식사 수정' : '식사 추가'}</h3>
        {estimateNote && <p className="video-status-message">⚠️ {estimateNote}</p>}

        <label className="field-label">식사 종류</label>
        <div className="chip-row" style={{ marginBottom: 10 }}>
          {MEAL_TYPES.map((mt) => (
            <button key={mt} type="button" className={`chip${mealType === mt ? ' active' : ''}`} onClick={() => setMealType(mt)}>
              {MEAL_TYPE_LABEL[mt]}
            </button>
          ))}
        </div>

        {/* Food list can grow arbitrarily long (manual multi-row entry, or an
            AI photo/text/gen review with many detected items) — this is the
            only region that scrolls; title/식사 종류/저장 buttons stay fixed. */}
        <div className="modal-scroll-body">
          <label className="field-label">음식</label>
          <FoodItemRows foods={foods} onChange={setFoods} />

          <label className="field-label" style={{ marginTop: 10 }}>
            메모 (선택)
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="예: 훈련 후 식사" />
        </div>

        {warning && <p className="ai-inline-warning">{warning}</p>}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            취소
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            저장
          </button>
        </div>
    </BottomSheet>,
    document.body
  );
}
