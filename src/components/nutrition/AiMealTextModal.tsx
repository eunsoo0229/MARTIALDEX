import { useState } from 'react';
import { createPortal } from 'react-dom';
import { parseMealFromText } from '../../lib/nutrition/aiMealParse';
import type { MealType, NutritionFoodItem } from '../../lib/nutrition/types';
import BottomSheet from '../BottomSheet';

/**
 * 자연어 식사 입력 (item 6). Result is never auto-saved — the caller opens
 * MealFormModal with the returned mealType/foods for confirm/edit, same
 * contract as the photo-analysis modal.
 */
export default function AiMealTextModal({
  onClose,
  onParsed,
}: {
  onClose: () => void;
  onParsed: (result: { mealType: MealType; foods: NutritionFoodItem[] }) => void;
}) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState('');

  async function handleParse() {
    if (!text.trim()) {
      setWarning('오늘 먹은 음식을 문장으로 입력해주세요.');
      return;
    }
    setLoading(true);
    setWarning('');
    const result = await parseMealFromText(text);
    setLoading(false);
    if (!result.ok) {
      setWarning(result.message);
      return;
    }
    if (result.data.foods.length === 0) {
      setWarning('문장에서 음식을 인식하지 못했습니다. 다시 입력하거나 직접 입력해주세요.');
      return;
    }
    onParsed(result.data);
  }

  return createPortal(
    <BottomSheet onClose={onClose}>
        <h3>📝 자연어로 식사 입력</h3>
        <p className="video-status-message">예: "오늘 점심에 김치찌개 한 그릇이랑 밥 한 공기 먹었어."</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="먹은 음식을 자유롭게 설명해주세요."
          style={{ minHeight: 90 }}
        />
        {warning && <p className="ai-inline-warning">{warning}</p>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            취소
          </button>
          <button className="btn btn-primary" onClick={handleParse} disabled={loading}>
            {loading ? '변환 중…' : '변환하기'}
          </button>
        </div>
    </BottomSheet>,
    document.body
  );
}
