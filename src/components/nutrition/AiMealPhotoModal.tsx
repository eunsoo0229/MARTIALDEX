import { useState } from 'react';
import { createPortal } from 'react-dom';
import { analyzeMealPhoto } from '../../lib/nutrition/aiPhotoAnalysis';
import type { NutritionFoodItem } from '../../lib/nutrition/types';
import BottomSheet from '../BottomSheet';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * 음식 사진 분석 (item 5). `<input type="file" accept="image/*" capture="environment">`
 * opens the native camera on Android/Capacitor's WebView and a normal file
 * picker on Electron/desktop — same "upload or take a photo" UX as
 * getUserMedia+canvas capture, without writing new still-frame-capture code
 * (PoseAnalysisModal.tsx's canvas approach is for a live skeleton overlay,
 * not applicable here). Result is never auto-saved — the caller opens
 * MealFormModal with the returned foods for confirm/edit.
 */
export default function AiMealPhotoModal({
  onClose,
  onAnalyzed,
}: {
  onClose: () => void;
  onAnalyzed: (foods: NutritionFoodItem[]) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ mimeType: string; base64Data: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState('');

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setWarning('이미지 용량이 너무 큽니다 (4MB 이하로 선택해주세요).');
      return;
    }
    setWarning('');
    const dataUrl = await readFileAsDataUrl(file);
    const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) {
      setWarning('이미지를 읽을 수 없습니다. 다른 파일을 선택해주세요.');
      return;
    }
    setPreviewUrl(dataUrl);
    setImageData({ mimeType: match[1], base64Data: match[2] });
  }

  async function handleAnalyze() {
    if (!imageData) return;
    setLoading(true);
    setWarning('');
    const result = await analyzeMealPhoto(imageData);
    setLoading(false);
    if (!result.ok) {
      setWarning(result.message);
      return;
    }
    if (result.data.foods.length === 0) {
      setWarning('사진에서 음식을 인식하지 못했습니다. 다른 사진을 시도하거나 직접 입력해주세요.');
      return;
    }
    onAnalyzed(result.data.foods);
  }

  return createPortal(
    <BottomSheet onClose={onClose}>
        <h3>📷 사진으로 식사 분석</h3>
        <p className="video-status-message">
          사진을 기반으로 추정한 값이며 실제 조리법, 재료, 섭취량에 따라 달라질 수 있습니다. 분석 후 확인/수정할 수 있습니다.
        </p>

        <input type="file" accept="image/*" capture="environment" className="select" onChange={handleFileChange} />

        {previewUrl && (
          <img src={previewUrl} alt="선택한 음식 사진" style={{ marginTop: 10, maxHeight: 220, borderRadius: 8, objectFit: 'cover' }} />
        )}

        {warning && <p className="ai-inline-warning">{warning}</p>}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            취소
          </button>
          <button className="btn btn-primary" onClick={handleAnalyze} disabled={!imageData || loading}>
            {loading ? '분석 중…' : 'AI로 분석하기'}
          </button>
        </div>
    </BottomSheet>,
    document.body
  );
}
