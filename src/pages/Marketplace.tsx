import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { martialArtSummaries } from '../lib/loadData';
import { useAuth } from '../lib/auth/AuthProvider';
import { listMarketplaceListings } from '../lib/marketplace/service';
import type { MarketplaceListing, MarketplaceSortMode } from '../lib/marketplace/types';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

const DIFFICULTY_LABEL: Record<string, string> = { beginner: '초급', intermediate: '중급', advanced: '고급', mixed: '혼합' };
const SORT_LABEL: Record<MarketplaceSortMode, string> = { recent: '최신순', popular: '인기순', rating: '평점순', price_asc: '가격 낮은순', price_desc: '가격 높은순' };
const SORT_ORDER: MarketplaceSortMode[] = ['recent', 'popular', 'rating', 'price_asc', 'price_desc'];

export default function Marketplace() {
  const { isConfigured, user, loading: authLoading } = useAuth();
  const [listings, setListings] = useState<MarketplaceListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [martialArt, setMartialArt] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [priceMode, setPriceMode] = useState<'all' | 'free' | 'paid'>('all');
  const [sort, setSort] = useState<MarketplaceSortMode>('recent');

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    void listMarketplaceListings({
      martialArt: martialArt || undefined,
      difficulty: (difficulty as MarketplaceListing['difficulty']) || undefined,
      priceMode,
      sort,
      query,
    }).then((result) => {
      if (!active) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
      setListings(result.data);
    });
    return () => {
      active = false;
    };
  }, [user, martialArt, difficulty, priceMode, sort, query]);

  const filtered = useMemo(() => listings ?? [], [listings]);

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>커리큘럼 마켓</span>
        </div>

        <div className="section-title">
          <h2>🛒 커리큘럼 마켓</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          다른 사용자가 만든 커리큘럼을 무료로 받거나 구매할 수 있습니다. 현재는 테스트 결제만 지원됩니다.
        </p>

        {!isConfigured || authLoading ? (
          <EmptyState icon="🛒" text="마켓을 불러오는 중입니다." />
        ) : !user ? (
          <div className="card info-card">
            <p className="video-status-message">마켓플레이스는 로그인 후 이용할 수 있습니다.</p>
            <div className="modal-actions modal-actions--start">
              <Link to="/login" className="btn btn-primary">
                로그인
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="filter-bar">
              <div className="filter-bar__left">
                <input
                  type="text"
                  className="select filter-text-input"
                  placeholder="검색 (제목, 설명, 태그)"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select className="select" value={martialArt} onChange={(e) => setMartialArt(e.target.value)}>
                  <option value="">전체 무술</option>
                  {martialArtSummaries.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nameKo}
                    </option>
                  ))}
                  <option value="mma">MMA</option>
                </select>
                <select className="select" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  <option value="">전체 난이도</option>
                  <option value="beginner">초급</option>
                  <option value="intermediate">중급</option>
                  <option value="advanced">고급</option>
                  <option value="mixed">혼합</option>
                </select>
                <select className="select" value={priceMode} onChange={(e) => setPriceMode(e.target.value as typeof priceMode)}>
                  <option value="all">전체</option>
                  <option value="free">무료</option>
                  <option value="paid">유료</option>
                </select>
                <select className="select" value={sort} onChange={(e) => setSort(e.target.value as MarketplaceSortMode)}>
                  {SORT_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {SORT_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <span className="result-count">{filtered.length}개 커리큘럼</span>
            </div>

            {error && <div className="banner banner--error" role="alert">{error}</div>}

            {loading ? (
              <p className="video-status-message row gap-1" style={{ justifyContent: 'center' }}>
                <span className="spinner" /> 불러오는 중...
              </p>
            ) : filtered.length === 0 ? (
              <EmptyState icon="🛒" text="조건에 맞는 커리큘럼이 없습니다." />
            ) : (
              <div className="stack gap-2">
                {filtered.map((l) => (
                  <Link key={l.id} to={`/marketplace/${l.id}`} className="card info-card" style={{ display: 'block' }}>
                    <div className="chip-row">
                      <strong style={{ fontSize: 'var(--fs-card-title)' }}>
                        {l.coverIcon ? `${l.coverIcon} ` : ''}
                        {l.title}
                      </strong>
                      {l.isFree ? <span className="chip active">무료</span> : <span className="chip">{l.priceKrw.toLocaleString()}원</span>}
                    </div>
                    <div className="technique-row__sub" style={{ marginTop: 4 }}>
                      제작자 {l.sellerNickname} · {l.martialArt}
                      {l.ratingCount > 0 && ` · ⭐ ${l.ratingAvg.toFixed(1)} (${l.ratingCount})`}
                    </div>
                    <p style={{ margin: '8px 0' }}>{l.description || '(설명 없음)'}</p>
                    <div className="technique-row__sub">
                      {DIFFICULTY_LABEL[l.difficulty] ?? l.difficulty} · {l.totalDays}일 · 기술 {l.techniqueCount}개 · 구매 {l.purchaseCount}회 · 구매하기 →
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
