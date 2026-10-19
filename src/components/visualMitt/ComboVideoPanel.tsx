import { useCallback, useEffect, useState } from 'react';
import type { Technique } from '../../types';
import type { LessonVideoResult } from '../../lib/coachLesson/lessonVideos';
import { cachedComboVideos, comboVideoKey, findComboVideos } from '../../lib/visualMitt/comboVideos';
import LessonVideoPanel from '../coach/LessonVideoPanel';

/**
 * 미트 훈련 전에 보는 콤보 영상 — searches YouTube for this combo when shown
 * (cached per combo), lists only videos whose own metadata was checked, and
 * says so when there are none. Collapsible so it never blocks the drill.
 */
export default function ComboVideoPanel({ techniques, comboName }: { techniques: Technique[]; comboName: string }) {
  const key = comboVideoKey(techniques);
  const [result, setResult] = useState<LessonVideoResult | null>(() => cachedComboVideos(techniques));
  const [progress, setProgress] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const run = useCallback(
    (force = false) => {
      if (!techniques.length) return;
      if (force) setResult(null);
      let alive = true;
      void findComboVideos(techniques, { comboName, onProgress: (m) => alive && setProgress(m) }).then((r) => alive && setResult(r));
      return () => {
        alive = false;
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, comboName]
  );
  useEffect(() => {
    if (cachedComboVideos(techniques)) return;
    return run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!techniques.length) return null;
  const label = techniques.length === 1 ? '기술' : '콤보';
  return (
    <details className="combo-videos" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} data-testid="combo-videos" data-status={result?.status ?? 'searching'}>
      <summary>
        연습 전에 영상 보기 · {comboName}
        {result?.status === 'found' ? ` (${result.videos.length}개)` : result?.status === 'none' ? ' (찾은 영상 없음)' : ''}
      </summary>
      <LessonVideoPanel result={result} progress={progress} onRetry={() => run(true)} title={`▶ ${label} 영상`} testId="combo-videos-panel" subject={`이 ${label}`} />
    </details>
  );
}
