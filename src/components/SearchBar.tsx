import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Technique } from '../types';
import { searchAllTechniquesAsync } from '../lib/userTechniques/service';
import { getMartialArt } from '../lib/loadData';

// Measured live: the underlying search (~1,310-technique corpus) takes
// 2-4ms for the common case (exact/near-exact name match) but its fuzzy
// fallback (typos, very short queries, few exact matches) can still block
// for 50ms-1s+ — on throttled/low-end hardware, over a second — because
// approximate string matching across the whole corpus is inherently
// expensive, not a bug debouncing alone can fix (debouncing only reduces
// how OFTEN it runs, not its per-call cost). searchAllTechniquesAsync()
// runs that fallback on a Web Worker (see lib/searchWorker.ts) instead of
// the main thread, so even a slow fuzzy pass never freezes typing/scrolling
// here. The input's own displayed value (`query`) stays instant/
// undebounced; only the expensive search is deferred to `debouncedQuery`.
const SEARCH_DEBOUNCE_MS = 150;

export default function SearchBar({
  variant = 'header',
  autoFocus = false,
}: {
  variant?: 'header' | 'hero';
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Technique[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsSearching(true);
    searchAllTechniquesAsync(debouncedQuery, 8).then((r) => {
      if (requestIdRef.current !== requestId) return; // superseded by a newer query — discard
      setResults(r);
      setIsSearching(false);
    });
  }, [debouncedQuery]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function goToResults() {
    if (query.trim()) {
      navigate(`/techniques?q=${encodeURIComponent(query.trim())}`);
      setOpen(false);
    }
  }

  return (
    <div
      className={`search-box ${variant === 'hero' ? 'search-box--hero' : ''}`}
      ref={containerRef}
    >
      <span className="search-box__icon" aria-hidden="true">
        ⌕
      </span>
      <input
        type="text"
        placeholder="기술 이름, 한글 명, 태그로 검색... (예: 암바, Osoto Gari, 로우킥)"
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') goToResults();
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && query.trim() && (
        <div className="search-results-panel" style={isSearching ? { opacity: 0.6 } : undefined}>
          {results.length === 0 ? (
            <div className="search-result-row" style={{ cursor: 'default' }}>
              <span className="search-result-row__meta">일치하는 기술이 없습니다.</span>
            </div>
          ) : (
            <>
              {results.map((t) => {
                const art = getMartialArt(t.martialArt);
                const extraPositions = t.positions.filter((p) => p !== t.category).slice(0, 2);
                return (
                  <div
                    key={t.id}
                    className="search-result-row"
                    onClick={() => {
                      navigate(`/arts/${t.martialArt}/techniques/${t.id}`);
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    <div>
                      <div className="search-result-row__name">
                        {t.name}
                        {t.koreanName && t.koreanName !== t.name ? ` · ${t.koreanName}` : ''}
                      </div>
                      <div className="search-result-row__meta">
                        {art?.nameKo ?? t.martialArt} · {t.category}
                        {extraPositions.length > 0 ? ` · ${extraPositions.join(', ')}` : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="search-result-row" onClick={goToResults}>
                <span className="search-result-row__name" style={{ color: 'var(--accent)' }}>
                  "{query}" 전체 검색 결과 보기 →
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
