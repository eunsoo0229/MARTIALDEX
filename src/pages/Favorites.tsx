import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import BackButton from '../components/BackButton';
import EmptyState from '../components/EmptyState';
import TechniqueRow from '../components/TechniqueRow';
import { useFavorites } from '../lib/userData';
import { resolveTechniquesByIds } from '../lib/userTechniques/service';
import { removeFavoriteCombo, useFavoriteCombos } from '../lib/sharedCombo/localStores';
import { removeSharedCopy } from '../lib/sharedCombo/myComboCopy';
import { KIND_LABEL } from '../lib/sharedCombo/types';

type Tab = 'techniques' | 'combos';

/** 즐겨찾기 — 기술과 콤보·셋업을 나눠서 봅니다. */
export default function Favorites() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'combos' ? 'combos' : 'techniques';
  const { favorites } = useFavorites();
  const techniques = useMemo(() => resolveTechniquesByIds(favorites), [favorites]);
  const combos = useFavoriteCombos();

  function select(t: Tab) {
    const p = new URLSearchParams(params);
    if (t === 'techniques') p.delete('tab');
    else p.set('tab', t);
    setParams(p, { replace: true });
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>즐겨찾기</span>
        </div>
        <div className="section-title">
          <h2>★ 즐겨찾기</h2>
        </div>
        <div className="chip-row" role="tablist" aria-label="즐겨찾기 종류">
          <button type="button" role="tab" aria-selected={tab === 'techniques'} className={`chip${tab === 'techniques' ? ' active' : ''}`} onClick={() => select('techniques')} data-testid="fav-tab-techniques">
            기술 {techniques.length}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'combos'} className={`chip${tab === 'combos' ? ' active' : ''}`} onClick={() => select('combos')} data-testid="fav-tab-combos">
            콤보·셋업 {combos.length}
          </button>
        </div>

        {tab === 'techniques' &&
          (techniques.length === 0 ? (
            <EmptyState icon="★" text="아직 즐겨찾기한 기술이 없습니다. 기술 상세 페이지에서 별표를 눌러 추가해 보세요." />
          ) : (
            <div className="stack gap-2" data-testid="fav-techniques">
              {techniques.map((t) => (
                <TechniqueRow key={t.id} technique={t} />
              ))}
            </div>
          ))}

        {tab === 'combos' &&
          (combos.length === 0 ? (
            <EmptyState icon="☆" text="아직 즐겨찾기한 콤보·셋업이 없습니다. 사용자 콤보·셋업에서 ☆를 눌러 추가해 보세요." />
          ) : (
            <div className="stack gap-2" data-testid="fav-combos">
              {combos.map((c) => (
                <div key={c.id} className="card info-card shared-combo-card" data-testid="fav-combo" data-id={c.id}>
                  <div className="shared-combo-card__head">
                    <span className={`chip shared-kind shared-kind--${c.kind}`}>{KIND_LABEL[c.kind]}</span>
                    <Link to={`/user-combos/${c.id}`} className="shared-combo-card__title">
                      {c.name}
                    </Link>
                  </div>
                  <p className="shared-combo-card__purpose">🎯 {c.purpose}</p>
                  <p className="shared-combo-card__flow">{c.stepNames.map((n) => n.replace(/\s*\(.*\)$/, '')).join(' → ')}</p>
                  <div className="shared-combo-card__foot">
                    <span className="technique-row__sub">by {c.authorNickname || '익명'}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                        removeFavoriteCombo(c.id);
                        removeSharedCopy(c.id);
                      }} data-testid="fav-combo-remove">
                      ★ 즐겨찾기 해제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
