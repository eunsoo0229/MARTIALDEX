import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import BackButton from '../components/BackButton';
import EmptyState from '../components/EmptyState';
import SharedComboCard from '../components/sharedCombo/SharedComboCard';
import { useAuth } from '../lib/auth/AuthProvider';
import { getMartialArt } from '../lib/loadData';
import { listSharedCombos, periodLikeCounts } from '../lib/sharedCombo/service';
import { listInterestEvents } from '../lib/sharedCombo/localStores';
import { periodStart, rankCombos } from '../lib/sharedCombo/ranking';
import { KIND_LABEL, SORT_LABEL, SORT_ORDER, type SharedCombo, type SharedComboKind, type SharedComboSort } from '../lib/sharedCombo/types';

const PERIOD_LABEL: Partial<Record<SharedComboSort, string>> = { week: '이번 주', month: '이번 달', year: '올해' };

/**
 * 사용자 콤보·셋업 — combos and setups shared by users. Ordered by the
 * student's own interests (맞춤 추천), by hearts this week / month / year /
 * of all time, newest, or fewest hearts.
 */
export default function UserCombos() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const rawSort = params.get('sort') as SharedComboSort | null;
  const sort: SharedComboSort = rawSort && SORT_ORDER.includes(rawSort) ? rawSort : 'recommended';
  const [kind, setKind] = useState<SharedComboKind | 'all'>('all');
  const [art, setArt] = useState('');
  const [query, setQuery] = useState('');
  const [combos, setCombos] = useState<SharedCombo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periodLikes, setPeriodLikes] = useState<{ sort: SharedComboSort; map: Map<string, number> } | null>(null);
  const [periodError, setPeriodError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setCombos(null);
    void listSharedCombos(user?.id ?? null).then((r) => {
      if (r.ok) setCombos(r.data);
      else {
        setCombos([]);
        setError(r.message);
      }
    });
  }, [user?.id]);
  useEffect(load, [load]);

  useEffect(() => {
    if (sort !== 'week' && sort !== 'month' && sort !== 'year') return;
    setPeriodError(null);
    void periodLikeCounts(periodStart(sort, new Date())).then((r) => {
      if (r.ok) setPeriodLikes({ sort, map: r.data });
      else setPeriodError(r.message);
    });
  }, [sort]);

  const arts = useMemo(() => [...new Set((combos ?? []).map((c) => c.martialArt).filter((a): a is string => !!a))], [combos]);
  const ranked = useMemo(() => {
    if (!combos) return [];
    const q = query.trim().toLowerCase();
    const filtered = combos.filter(
      (c) => (kind === 'all' || c.kind === kind) && (!art || c.martialArt === art) && (!q || `${c.name} ${c.purpose} ${c.description} ${c.steps.map((s) => s.name).join(' ')}`.toLowerCase().includes(q))
    );
    const pl = periodLikes?.sort === sort ? periodLikes.map : undefined;
    return rankCombos(filtered, sort, { now: Date.now(), periodLikes: pl, events: sort === 'recommended' ? listInterestEvents() : [] });
  }, [combos, kind, art, query, sort, periodLikes]);

  function update(c: SharedCombo) {
    setCombos((prev) => (prev ? prev.map((x) => (x.id === c.id ? c : x)) : prev));
  }
  function selectSort(s: SharedComboSort) {
    const p = new URLSearchParams(params);
    if (s === 'recommended') p.delete('sort');
    else p.set('sort', s);
    setParams(p, { replace: true });
  }
  const waitingPeriod = !!PERIOD_LABEL[sort] && periodLikes?.sort !== sort && !periodError;

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>사용자 콤보·셋업</span>
        </div>
        <div className="section-title">
          <h2>🧑‍🤝‍🧑 사용자 콤보·셋업</h2>
          <Link to="/combos" className="see-all">
            + 내 콤보 공유하기
          </Link>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          사용자들이 직접 만들어 공유한 콤보와 셋업입니다. 마음에 들면 ♥를 눌러 주세요 — 하트가 많을수록 인기 순위에 올라가고, 내가 자주 보는 목적(예: 잽을 맞추기 위한 셋업, 테이크다운을 위한 셋업)의 콤보가 맞춤 추천 맨 위에 옵니다. 공유는 <Link to="/combos">콤보 북</Link>·<Link to="/tactics">전술 셋업</Link>의 "공유" 버튼으로 할 수 있습니다.
        </p>

        <div className="chip-row" role="tablist" aria-label="정렬" data-testid="combo-sorts">
          {SORT_ORDER.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={sort === s} className={`chip${sort === s ? ' active' : ''}`} onClick={() => selectSort(s)} data-testid={`combo-sort-${s}`}>
              {SORT_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="user-combos__filters">
          <div className="chip-row">
            {(['all', 'combo', 'setup'] as const).map((k) => (
              <button key={k} type="button" className={`chip${kind === k ? ' active' : ''}`} onClick={() => setKind(k)} data-testid={`combo-kind-${k}`}>
                {k === 'all' ? '전체' : KIND_LABEL[k]}
              </button>
            ))}
          </div>
          {arts.length > 1 && (
            <select className="select" value={art} onChange={(e) => setArt(e.target.value)} aria-label="무술">
              <option value="">모든 무술</option>
              {arts.map((a) => (
                <option key={a} value={a}>
                  {getMartialArt(a)?.nameKo ?? a}
                </option>
              ))}
            </select>
          )}
          <input className="select" placeholder="이름·목적·기술 검색" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="combo-search" />
        </div>

        {sort === 'recommended' && listInterestEvents().length === 0 && combos && combos.length > 0 && (
          <p className="video-status-message">아직 본 콤보가 없어 인기·최신 순으로 보여 드립니다. 콤보를 열어 보거나 ♥를 누르면 관심 있는 목적에 맞춰 추천이 바뀝니다.</p>
        )}
        {periodError && <p className="ai-inline-warning">기간별 하트를 불러오지 못했습니다: {periodError}</p>}

        {combos === null || waitingPeriod ? (
          <p className="video-status-message">
            <span className="spinner" /> 불러오는 중…
          </p>
        ) : error ? (
          <div className="ai-error" role="alert" data-testid="user-combos-error">
            {error}{' '}
            <button type="button" className="btn btn-ghost btn-sm" onClick={load}>
              다시 시도
            </button>
          </div>
        ) : ranked.length === 0 ? (
          <EmptyState icon="🥊" text={combos.length ? '조건에 맞는 콤보·셋업이 없습니다.' : '아직 공유된 콤보·셋업이 없습니다. 콤보 북에서 첫 번째로 공유해 보세요.'} />
        ) : (
          <div className="stack gap-2" data-testid="user-combos-list" data-sort={sort}>
            {ranked.map((r) => (
              <SharedComboCard key={r.combo.id} combo={r.combo} hearts={r.hearts} heartsLabel={PERIOD_LABEL[sort]} reason={sort === 'recommended' ? r.reason : null} onChange={update} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
