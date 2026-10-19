import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthProvider';
import { likeSharedCombo, unlikeSharedCombo } from '../../lib/sharedCombo/service';
import { isFavoriteCombo, recordInterest } from '../../lib/sharedCombo/localStores';
import { findSharedCopy, toggleFavoriteWithCopy } from '../../lib/sharedCombo/myComboCopy';
import { intentTags, tagLabel } from '../../lib/sharedCombo/purpose';
import { KIND_LABEL, type SharedCombo } from '../../lib/sharedCombo/types';

/**
 * Heart toggle for a shared combo — optimistic, rolled back with the error
 * if the server refuses. Signed out → goes to login instead of failing.
 */
export function HeartButton(props: { combo: SharedCombo; onChange: (c: SharedCombo) => void; size?: 'sm' | 'md' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = props.combo;
  async function toggle() {
    if (!user) {
      navigate('/login');
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    const liked = !c.viewerHasLiked;
    const optimistic = { ...c, viewerHasLiked: liked, likeCount: Math.max(0, c.likeCount + (liked ? 1 : -1)) };
    props.onChange(optimistic);
    const r = liked ? await likeSharedCombo(c.id, user.id) : await unlikeSharedCombo(c.id, user.id);
    setBusy(false);
    if (!r.ok) {
      props.onChange(c);
      setError(r.message);
      return;
    }
    if (liked) recordInterest('like', c);
  }
  return (
    <span className="heart-wrap">
      <button
        type="button"
        className={`btn btn-ghost ${props.size === 'md' ? '' : 'btn-sm'} heart-btn${c.viewerHasLiked ? ' heart-btn--on' : ''}`}
        aria-pressed={!!c.viewerHasLiked}
        aria-label={c.viewerHasLiked ? '하트 취소' : '하트'}
        onClick={toggle}
        disabled={busy}
        data-testid="combo-heart"
        data-liked={String(!!c.viewerHasLiked)}
      >
        {c.viewerHasLiked ? '♥' : '♡'} <span data-testid="combo-heart-count">{c.likeCount}</span>
      </button>
      {error && (
        <span className="ai-inline-warning heart-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

export function FavoriteComboButton(props: { combo: SharedCombo }) {
  const { user } = useAuth();
  const [on, setOn] = useState(() => isFavoriteCombo(props.combo.id));
  const [note, setNote] = useState<{ text: string; mittId?: string } | null>(null);

  function toggle() {
    const r = toggleFavoriteWithCopy(props.combo, user?.id ?? null);
    setOn(r.on);
    const kind = KIND_LABEL[props.combo.kind];
    if (!r.on) setNote(r.removed ? { text: `내 콤보 북에서도 뺐습니다.` } : findSharedCopy(props.combo.id) ? { text: '내 콤보 북의 사본은 편집한 적이 있어 그대로 두었습니다.' } : null);
    else if (r.copy?.status === 'saved' || r.copy?.status === 'exists')
      setNote({ text: `내 콤보 북에 ${kind}을(를) 저장했습니다${r.copy.combo.sharedMeta?.missingSteps.length ? ` (내 기술 목록에 없는 단계 ${r.copy.combo.sharedMeta.missingSteps.length}개 제외)` : ''}.`, mittId: r.copy.combo.id });
    else if (r.copy?.status === 'no_steps') setNote({ text: `즐겨찾기에만 추가했습니다. 이 ${kind}의 기술이 내 기술 목록에 없어 내 콤보 북에는 저장하지 못했습니다.` });
    else setNote(null);
  }

  return (
    <span className="favorite-combo">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-pressed={on}
        aria-label={on ? '즐겨찾기 해제' : '즐겨찾기 · 내 콤보에 저장'}
        title={on ? '즐겨찾기 해제' : '즐겨찾기하면 내 콤보 북에도 저장되어 콤보 훈련·Visualizing Mitt에서 쓸 수 있습니다'}
        onClick={toggle}
        data-testid="combo-favorite"
        data-on={String(on)}
      >
        {on ? '★ 저장됨' : '☆ 저장'}
      </button>
      {note && (
        <span className="technique-row__sub" data-testid="combo-favorite-note">
          {note.text}{' '}
          {note.mittId && (
            <>
              <Link to={`/coach/mitt?combo=${encodeURIComponent(note.mittId)}`}>Mitt로 연습</Link> · <Link to="/combos">콤보 북</Link>
            </>
          )}
        </span>
      )}
    </span>
  );
}

export function stepFlow(c: Pick<SharedCombo, 'steps'>): string {
  return c.steps.map((s) => s.name.replace(/\s*\(.*\)$/, '')).join(' → ');
}

export default function SharedComboCard(props: { combo: SharedCombo; hearts?: number; heartsLabel?: string; reason?: string | null; onChange: (c: SharedCombo) => void }) {
  const c = props.combo;
  const intents = intentTags(c.purposeTags);
  return (
    <div className="card info-card shared-combo-card" data-testid="shared-combo-card" data-id={c.id} data-kind={c.kind}>
      <div className="shared-combo-card__head">
        <span className={`chip shared-kind shared-kind--${c.kind}`}>{KIND_LABEL[c.kind]}</span>
        <Link to={`/user-combos/${c.id}`} className="shared-combo-card__title" onClick={() => recordInterest('view', c)}>
          {c.name}
        </Link>
      </div>
      <p className="shared-combo-card__purpose">🎯 {c.purpose}</p>
      <p className="shared-combo-card__flow">{stepFlow(c)}</p>
      {intents.length > 0 && (
        <div className="chip-row">
          {intents.map((t) => (
            <span key={t} className="chip chip--sm">
              {tagLabel(t)}
            </span>
          ))}
        </div>
      )}
      {props.reason && (
        <p className="video-status-message shared-combo-card__reason" data-testid="combo-reason">
          ✨ {props.reason}
        </p>
      )}
      <div className="shared-combo-card__foot">
        <span className="technique-row__sub">by {c.authorNickname || '익명'}</span>
        {props.heartsLabel && (
          <span className="technique-row__sub" data-testid="combo-period-hearts">
            {props.heartsLabel} ♥ {props.hearts ?? 0}
          </span>
        )}
        <span className="shared-combo-card__actions">
          <HeartButton combo={c} onChange={props.onChange} />
          <FavoriteComboButton combo={c} />
        </span>
      </div>
    </div>
  );
}
