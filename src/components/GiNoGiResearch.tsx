import { useState } from 'react';
import type { Technique } from '../types';
import { analyzeGiNoGi, saveLocalGiNoGi } from '../lib/grappling/analyzeNewTechnique';

/**
 * For an ADDED grappling technique without a usable Gi / No-Gi record (added
 * before this existed, or the research failed when it was added): research it
 * now. The result is kept on this device (shared add_teq rows can't be edited).
 */
export default function GiNoGiResearch({ technique, failedReason }: { technique: Technique; failedReason: string | null }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setNote(null);
    try {
      const r = await analyzeGiNoGi(technique);
      saveLocalGiNoGi(technique.id, r);
      if (r.method === 'pending' || r.method === 'ai_rejected') setNote(r.reason ?? '근거를 찾지 못해 판단 보류로 남겼습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card info-card" data-testid="gi-nogi-research">
      <h3>🥋 Gi / No-Gi 수행 방식</h3>
      <p className="video-status-message">
        {failedReason ?? '새로 추가된 그래플링 기술이라 아직 Gi / No-Gi 구분이 조사되지 않았습니다.'} 웹 자료를 근거로 Gi와 No-Gi에서 각각 어떻게 하는지 조사할 수 있습니다.
      </p>
      <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void run()} data-testid="gi-nogi-research-run">
        {busy ? '조사 중…' : 'Gi / No-Gi 조사하기'}
      </button>
      {note && <p className="video-status-message" data-testid="gi-nogi-research-note">{note}</p>}
    </div>
  );
}
