import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import BackButton from '../components/BackButton';
import PostureSection from '../components/PostureSection';
import SharedComboCard, { FavoriteComboButton, HeartButton, stepFlow } from '../components/sharedCombo/SharedComboCard';
import { useAuth } from '../lib/auth/AuthProvider';
import { getMartialArt } from '../lib/loadData';
import { resolveTechnique } from '../lib/userTechniques/service';
import { createCombo } from '../lib/combo/service';
import { deleteSharedCombo, getSharedCombo, listSharedCombos } from '../lib/sharedCombo/service';
import { recordInterest } from '../lib/sharedCombo/localStores';
import { intentTags, tagLabel } from '../lib/sharedCombo/purpose';
import { similarCombos } from '../lib/sharedCombo/ranking';
import { KIND_LABEL, type SharedCombo } from '../lib/sharedCombo/types';
import type { Technique } from '../types';

function firstSentence(s: string | null | undefined): string {
  if (!s) return '';
  const line = s.split('\n')[0].trim();
  const m = line.match(/^(.+?[.!?。])(\s|$)/);
  return (m ? m[1] : line).slice(0, 220);
}

/** How to do one step — from the technique's own MARTIALDEX data only. */
function StepGuide(props: { index: number; total: number; name: string; technique: Technique | undefined; note?: string; opponentReaction?: string; open: boolean }) {
  const t = props.technique;
  const role = props.index === 0 ? '시작' : props.index === props.total - 1 ? '마무리' : '연결';
  const about = t ? firstSentence(t.posture?.overview) || firstSentence(t.description) || firstSentence(t.purpose) : '';
  return (
    <li className="combo-step" data-testid="combo-step">
      <div className="combo-step__head">
        <span className="combo-step__num">{props.index + 1}</span>
        <strong>{props.name}</strong>
        <span className="chip chip--sm">{role}</span>
        {t && (
          <Link className="see-all" to={`/arts/${t.martialArt}/techniques/${t.id}`}>
            기술 상세 →
          </Link>
        )}
      </div>
      {about && <p className="combo-step__about">{about}</p>}
      {props.note && <p className="combo-step__note">📝 작성자 메모: {props.note}</p>}
      {props.opponentReaction && <p className="combo-step__note">👀 예상 상대 반응: {props.opponentReaction}</p>}
      {t?.posture?.keyPoints?.length ? (
        <p className="combo-step__key" data-testid="combo-step-key">
          핵심: {t.posture.keyPoints.slice(0, 2).join(' · ')}
        </p>
      ) : null}
      {t?.posture ? (
        <details open={props.open} className="combo-step__posture" data-testid="combo-step-posture">
          <summary>자세 안내</summary>
          <PostureSection posture={t.posture} />
        </details>
      ) : (
        <p className="video-status-message">{t ? '이 기술의 자세 설명은 준비 중입니다.' : '이 기술은 작성자가 직접 추가한 기술이라 자세 정보를 볼 수 없습니다.'}</p>
      )}
    </li>
  );
}

/**
 * 사용자 콤보·셋업 상세 — what it is for, the steps in order with how to do
 * each one (real technique data + the author's notes), hearts, favorites,
 * "내 콤보 북에 담기", and similar combos/setups at the bottom.
 */
export default function SharedComboDetail() {
  const { comboId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [combo, setCombo] = useState<SharedCombo | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState<SharedCombo[]>([]);
  const [copied, setCopied] = useState<{ id: string; skipped: number } | null>(null);

  useEffect(() => {
    setCombo(undefined);
    setError(null);
    setCopied(null);
    void getSharedCombo(comboId, user?.id ?? null).then((r) => {
      if (!r.ok) {
        setError(r.message);
        setCombo(null);
        return;
      }
      setCombo(r.data);
      if (r.data) recordInterest('view', r.data);
    });
    void listSharedCombos(user?.id ?? null).then((r) => r.ok && setAll(r.data));
    window.scrollTo?.(0, 0);
  }, [comboId, user?.id]);

  const techniques = useMemo(() => (combo ? combo.steps.map((s) => resolveTechnique(s.techniqueId)) : []), [combo]);
  const related = useMemo(() => (combo ? similarCombos(combo, all) : []), [combo, all]);

  function copyToBook() {
    if (!combo) return;
    const ids = combo.steps.map((s) => s.techniqueId).filter((id) => !!resolveTechnique(id));
    if (!ids.length) return;
    const c = createCombo({
      name: combo.name,
      description: `${combo.purpose} (사용자 ${KIND_LABEL[combo.kind]} · ${combo.authorNickname || '익명'})`,
      techniqueIds: ids,
      visualMittMeta: { createdAt: new Date().toISOString(), stance: 'orthodox', type: combo.kind, purpose: combo.purpose, source: 'user', stepNotes: combo.steps.filter((s) => ids.includes(s.techniqueId)).map((s) => ({ techniqueId: s.techniqueId, note: s.note ?? '', opponentReaction: s.opponentReaction ?? null })) },
    });
    setCopied({ id: c.id, skipped: combo.steps.length - ids.length });
  }

  async function remove() {
    if (!combo || !window.confirm('공유를 취소할까요? 다른 사용자에게서 사라지고 하트도 함께 삭제됩니다. 내 콤보 북의 원본은 그대로 남습니다.')) return;
    const r = await deleteSharedCombo(combo.id);
    if (r.ok) navigate('/user-combos');
    else setError(r.message);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/user-combos">사용자 콤보·셋업</Link>
          <span>/</span>
          <span>{combo?.name ?? '상세'}</span>
        </div>

        {combo === undefined && (
          <p className="video-status-message">
            <span className="spinner" /> 불러오는 중…
          </p>
        )}
        {error && (
          <div className="ai-error" role="alert" data-testid="shared-combo-error">
            {error}
          </div>
        )}
        {combo === null && !error && <p className="video-status-message">공유가 취소되었거나 없는 콤보·셋업입니다.</p>}

        {combo && (
          <>
            <div className="section-title">
              <h2 data-testid="shared-combo-title">
                <span className={`chip shared-kind shared-kind--${combo.kind}`}>{KIND_LABEL[combo.kind]}</span> {combo.name}
              </h2>
            </div>
            <div className="card info-card" data-testid="shared-combo-detail" data-id={combo.id}>
              <p className="shared-combo-card__purpose" style={{ fontSize: 'var(--fs-body)' }}>
                🎯 목적: {combo.purpose}
              </p>
              <div className="chip-row">
                {intentTags(combo.purposeTags).map((t) => (
                  <span key={t} className="chip chip--sm">
                    {tagLabel(t)}
                  </span>
                ))}
                {combo.martialArt && <span className="chip chip--sm">{getMartialArt(combo.martialArt)?.nameKo ?? combo.martialArt}</span>}
              </div>
              <p className="shared-combo-card__flow">{stepFlow(combo)}</p>
              {combo.description && <p style={{ whiteSpace: 'pre-wrap' }}>{combo.description}</p>}
              <p className="technique-row__sub">
                by {combo.authorNickname || '익명'} · {new Date(combo.createdAt).toLocaleDateString('ko-KR')}
              </p>
              <div className="modal-actions modal-actions--start">
                <HeartButton combo={combo} onChange={setCombo} size="md" />
                <FavoriteComboButton combo={combo} />
                <button type="button" className="btn btn-secondary btn-sm" onClick={copyToBook} disabled={!techniques.some(Boolean)} data-testid="combo-copy">
                  📥 내 콤보 북에 담기
                </button>
                {user?.id === combo.authorId && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove()} data-testid="combo-unshare">
                    공유 취소
                  </button>
                )}
              </div>
              {copied && (
                <p className="video-status-message" data-testid="combo-copied">
                  내 콤보 북에 담았습니다{copied.skipped ? ` (내 기기에 없는 기술 ${copied.skipped}개는 제외)` : ''}. <Link to={`/combos/${copied.id}/train`}>바로 훈련하기</Link> · <Link to="/coach/mitt">Visualizing Mitt로 연습</Link>
                </p>
              )}
            </div>

            <h3 className="ai-catalog__section">이렇게 합니다 — 기술 순서와 자세</h3>
            <p className="video-status-message" style={{ marginTop: -4 }}>
              {combo.kind === 'setup'
                ? `앞 동작으로 상대의 반응을 끌어낸 뒤 마지막 ${combo.steps.at(-1)?.name.replace(/\s*\(.*\)$/, '') ?? '기술'}로 목적("${combo.purpose}")을 이룹니다.`
                : `${combo.steps.length}개의 기술을 끊기지 않게 이어서 칩니다. 각 동작이 끝나는 자세가 다음 동작의 시작 자세가 되도록 연결해 주세요.`}{' '}
              각 단계의 자세는 MARTIALDEX 기술 자료에서 가져왔습니다.
            </p>
            <ol className="combo-steps" data-testid="combo-steps">
              {combo.steps.map((s, i) => (
                <StepGuide key={`${s.techniqueId}-${i}`} index={i} total={combo.steps.length} name={s.name} technique={techniques[i]} note={s.note} opponentReaction={s.opponentReaction} open={i === 0} />
              ))}
            </ol>

            <h3 className="ai-catalog__section">관련 추천 {KIND_LABEL[combo.kind]}</h3>
            {related.length === 0 ? (
              <p className="video-status-message" data-testid="related-empty">
                아직 비슷한 콤보·셋업이 없습니다.
              </p>
            ) : (
              <div className="stack gap-2" data-testid="related-combos">
                {related.map((r) => (
                  <SharedComboCard key={r.combo.id} combo={r.combo} onChange={(c) => setAll((prev) => prev.map((x) => (x.id === c.id ? c : x)))} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
