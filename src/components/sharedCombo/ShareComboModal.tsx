import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import BottomSheet from '../BottomSheet';
import { useAuth } from '../../lib/auth/AuthProvider';
import { resolveTechnique } from '../../lib/userTechniques/service';
import { getMartialArt } from '../../lib/loadData';
import { derivePurposeTags, tagLabel } from '../../lib/sharedCombo/purpose';
import { shareCombo, validateShare } from '../../lib/sharedCombo/service';
import { recordInterest } from '../../lib/sharedCombo/localStores';
import { KIND_LABEL, type SharedCombo, type SharedComboKind, type SharedComboStep } from '../../lib/sharedCombo/types';

export interface ShareSource {
  /** "combo:<id>" / "tactic:<id>" — sharing it again updates the shared copy. */
  sourceRef: string;
  kind: SharedComboKind;
  name: string;
  purpose: string;
  description: string;
  techniqueIds: string[];
  stepNotes?: { techniqueId: string; note?: string; opponentReaction?: string | null }[];
  alreadyShared?: boolean;
}

const PURPOSE_EXAMPLES = ['잽을 맞추기 위한 셋업', '테이크다운을 위한 셋업', '상대의 카운터를 피하며 들어가는 콤보', '압박해서 코너로 모는 콤보', '바디로 가드를 내리게 하는 셋업'];

/** 공유하기 — publishes a combo/setup to 사용자 콤보 (everyone can see it). */
export default function ShareComboModal(props: { source: ShareSource; onClose: () => void; onShared: (c: SharedCombo) => void }) {
  const { user, profile } = useAuth();
  const s = props.source;
  const [kind, setKind] = useState<SharedComboKind>(s.kind);
  const [name, setName] = useState(s.name);
  const [purpose, setPurpose] = useState(s.purpose);
  const [description, setDescription] = useState(s.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps: SharedComboStep[] = useMemo(
    () =>
      s.techniqueIds.map((id, i) => {
        const t = resolveTechnique(id);
        const note = s.stepNotes?.[i]?.techniqueId === id ? s.stepNotes[i] : s.stepNotes?.find((n) => n.techniqueId === id);
        // The art of the id the user picked (boxing__slip → boxing), not the merged canonical entry's.
        const prefix = id.includes('__') ? id.split('__')[0] : null;
        return {
          techniqueId: id,
          name: t ? (t.koreanName && t.koreanName !== t.name ? `${t.name} (${t.koreanName})` : t.name) : id,
          martialArt: (prefix && getMartialArt(prefix) ? prefix : null) ?? t?.martialArt ?? null,
          ...(note?.note ? { note: note.note } : {}),
          ...(note?.opponentReaction ? { opponentReaction: note.opponentReaction } : {}),
        };
      }),
    [s]
  );
  const martialArt = useMemo(() => {
    const counts = new Map<string, number>();
    for (const st of steps) if (st.martialArt) counts.set(st.martialArt, (counts.get(st.martialArt) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [steps]);
  const tags = derivePurposeTags({ purpose, description, stepNames: steps.map((x) => x.name) });
  const errors = validateShare({ name, purpose, steps });

  async function submit() {
    if (!user) return;
    setBusy(true);
    setError(null);
    const r = await shareCombo({ userId: user.id, nickname: profile?.nickname ?? '', kind, name, purpose, description, martialArt, steps, sourceRef: s.sourceRef });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    recordInterest('share', r.data);
    props.onShared(r.data);
  }

  return createPortal(
    <BottomSheet onClose={props.onClose} className="share-combo-modal">
      <h3 style={{ marginTop: 0 }}>🧑‍🤝‍🧑 사용자 콤보·셋업에 공유</h3>
      {!user ? (
        <p data-testid="share-combo-login">
          공유하려면 로그인이 필요합니다. <Link to="/login">로그인하기</Link>
        </p>
      ) : (
        <div className="stack gap-2" data-testid="share-combo-form">
          {s.alreadyShared && <p className="video-status-message">이미 공유한 항목입니다. 다시 공유하면 공유된 내용이 갱신됩니다(하트는 유지).</p>}
          <div className="chip-row" role="radiogroup" aria-label="종류">
            {(['combo', 'setup'] as SharedComboKind[]).map((k) => (
              <button key={k} type="button" className={`chip${kind === k ? ' active' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)} data-testid={`share-kind-${k}`}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <label className="field-label">
            이름
            <input className="select field-full" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} data-testid="share-name" />
          </label>
          <label className="field-label">
            목적 (무엇을 위한 {KIND_LABEL[kind]}인가요?)
            <input className="select field-full" value={purpose} maxLength={300} placeholder="예: 잽을 맞추기 위한 셋업" onChange={(e) => setPurpose(e.target.value)} data-testid="share-purpose" />
          </label>
          <div className="chip-row">
            {PURPOSE_EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="chip" onClick={() => setPurpose(ex)}>
                {ex}
              </button>
            ))}
          </div>
          {tags.length > 0 && (
            <p className="video-status-message" data-testid="share-tags">
              분류: {tags.map(tagLabel).join(' · ')}
            </p>
          )}
          <label className="field-label">
            설명 (선택)
            <textarea className="field-full" rows={3} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} data-testid="share-description" />
          </label>
          <div>
            <div className="field-label">기술 순서{martialArt ? ` · ${getMartialArt(martialArt)?.nameKo ?? martialArt}` : ''}</div>
            <ol className="share-steps">
              {steps.map((st, i) => (
                <li key={`${st.techniqueId}-${i}`}>
                  {st.name}
                  {st.note ? <span className="technique-row__sub"> — {st.note}</span> : null}
                </li>
              ))}
            </ol>
          </div>
          {errors.length > 0 && <p className="ai-inline-warning">{errors.join(' ')}</p>}
          {error && (
            <p className="ai-error" role="alert" data-testid="share-error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={props.onClose}>
              취소
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || errors.length > 0} onClick={() => void submit()} data-testid="share-submit">
              {busy ? '공유하는 중…' : s.alreadyShared ? '공유 내용 갱신' : '공유하기'}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>,
    document.body
  );
}
