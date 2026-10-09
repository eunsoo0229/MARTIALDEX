import type { Technique } from '../types';
import { resolveTechniquesByIds } from '../lib/userTechniques/service';

/**
 * Marks an old record that listed several techniques on one line ("Lead Teep /
 * Rear Teep") and was split by the technique-relation audit. The user's own
 * history / mastery stays on this record — it is not copied to the new ones.
 */
export default function LegacySplitNote({ technique }: { technique: Technique }) {
  const parts = resolveTechniquesByIds(technique.splitInto ?? []);
  return (
    <span className="legacy-split-note" data-testid="legacy-split-note">
      여러 기술을 묶은 기존 기록 — 지금은 {parts.map((p) => p.name).join(' · ')} 기술로 나뉘었습니다. 이 기록의 학습 내역은 그대로 보존됩니다.
    </span>
  );
}
