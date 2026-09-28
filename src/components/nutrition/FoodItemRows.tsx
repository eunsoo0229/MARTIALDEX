import type { NutritionFoodItem } from '../../lib/nutrition/types';
import NumberField from '../NumberField';

/** Shared editable food-row list — used by MealFormModal (single meal) and AiMealGenModal (per meal type), so every manual/AI-reviewed meal edits foods identically. */
export default function FoodItemRows({ foods, onChange }: { foods: NutritionFoodItem[]; onChange: (foods: NutritionFoodItem[]) => void }) {
  function updateRow(idx: number, patch: Partial<NutritionFoodItem>) {
    onChange(foods.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }
  function removeRow(idx: number) {
    onChange(foods.filter((_, i) => i !== idx));
  }
  function addRow() {
    onChange([...foods, { name: '', amount: '', calories: 0, carbsG: 0, proteinG: 0, fatG: 0 }]);
  }

  return (
    <div className="stack gap-2">
      {foods.map((f, idx) => (
        <div key={idx} className="food-item-row">
          <div className="food-item-row__name-line">
            <input
              className="select"
              style={{ flex: '1 1 140px' }}
              type="text"
              placeholder="음식 이름"
              value={f.name}
              onChange={(e) => updateRow(idx, { name: e.target.value })}
            />
            <input
              className="select"
              style={{ width: 90 }}
              type="text"
              placeholder="섭취량"
              value={f.amount}
              onChange={(e) => updateRow(idx, { amount: e.target.value })}
            />
            <button type="button" className="icon-action-btn food-item-row__remove" aria-label="삭제" onClick={() => removeRow(idx)}>
              ✕
            </button>
          </div>
          <div className="food-item-row__macros">
            <label className="field-label">
              kcal
              <NumberField className="select gym-num-input" min={0} value={f.calories} onCommit={(n) => updateRow(idx, { calories: n ?? 0 })} />
            </label>
            <label className="field-label">
              탄(g)
              <NumberField className="select gym-num-input" min={0} value={f.carbsG} onCommit={(n) => updateRow(idx, { carbsG: n ?? 0 })} />
            </label>
            <label className="field-label">
              단(g)
              <NumberField className="select gym-num-input" min={0} value={f.proteinG} onCommit={(n) => updateRow(idx, { proteinG: n ?? 0 })} />
            </label>
            <label className="field-label">
              지(g)
              <NumberField className="select gym-num-input" min={0} value={f.fatG} onCommit={(n) => updateRow(idx, { fatG: n ?? 0 })} />
            </label>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>
        + 음식 추가
      </button>
    </div>
  );
}
