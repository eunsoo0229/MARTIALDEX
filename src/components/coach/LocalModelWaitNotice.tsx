import { useEffect, useState } from 'react';
import { cancelLocalModelWait, currentLocalModelWait, subscribeLocalModelWait, type LocalModelWait } from '../../lib/coachProvider/localModel';

// 자체 AI 코치: while the local model rewords an answer (it can take tens of
// seconds on a small machine), the student sees how long it has waited, the
// limit, and can stop waiting — the lesson then continues with the technique
// data's own sentences. Renders nothing when no local request is running.

export default function LocalModelWaitNotice() {
  const [wait, setWait] = useState<LocalModelWait | null>(currentLocalModelWait());
  const [now, setNow] = useState(Date.now());
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => subscribeLocalModelWait((w) => {
    setWait(w);
    setCancelling(false);
  }), []);
  useEffect(() => {
    if (!wait) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [wait]);

  if (!wait) return null;
  const seconds = Math.max(0, Math.floor((now - wait.startedAt) / 1000));
  return (
    <div className="video-status-message" role="status" data-testid="local-model-wait" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span>
        로컬 모델이 답변을 다듬는 중… {seconds}초 (최대 {Math.round(wait.timeoutMs / 1000)}초, 넘으면 기술 자료 문장으로 안내)
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        data-testid="local-model-wait-cancel"
        disabled={cancelling}
        onClick={() => {
          setCancelling(true);
          void cancelLocalModelWait();
        }}
      >
        기다리지 않고 자료 원문으로 보기
      </button>
    </div>
  );
}
