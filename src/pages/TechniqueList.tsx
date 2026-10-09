import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams, Navigate } from 'react-router-dom';
import TechniqueRow from '../components/TechniqueRow';
import EmptyState from '../components/EmptyState';
import { techniqueTypeTags, uniqueSorted } from '../lib/search';
import { isTechniqueInArt, techniqueCategoryInArt } from '../lib/techniqueCanonical';
import { getUnifiedAllTechniques, getUnifiedMartialArt, getUnifiedMartialArtSummaries, searchAllTechniques } from '../lib/userTechniques/service';
import { ADD_TEQ_CACHE_EVENT } from '../lib/addTeq/repository';
import { useCustomMartialArtLibraryVersion } from '../lib/customMartialArt/useCustomMartialArtLibrary';
import BackButton from '../components/BackButton';
import RequestMissingTechnique from '../components/RequestMissingTechnique';

const RESULT_LIMIT = 2000; // effectively "no limit" for a corpus of ~1,100 techniques
// Confirmed real mobile-performance issue (perf audit): landing on this page
// with no filters (e.g. via Header's mobile search icon) hit searchTechniques's
// `!q` branch and rendered the ENTIRE technique corpus (~1,283+ rows) as DOM
// nodes at once, each TechniqueRow independently doing a synchronous
// localStorage read via useFavorites() on mount. PAGE_SIZE caps how many
// rows are ever rendered at once — filtering/search/counts are unaffected
// (`filtered` still holds the full matching set for the "N개 기술" count),
// only the DOM slice rendered is capped, with a "더 보기" button to reveal more.
const PAGE_SIZE = 60;

export default function TechniqueList() {
  const { martialArtId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  // Re-renders the filter dropdown immediately when a custom martial art is
  // registered (spec "MARTIALDEX 긴급 안정화" 문제 D) — same hook AddMartialArt/
  // AiGoalCurriculum already use for this exact purpose.
  useCustomMartialArtLibraryVersion();
  // Canonical martial-art list (official + custom_martial_arts) — was
  // previously hardcoded to the static `martialArtSummaries` (official 9/10
  // only), so a newly-added martial art never appeared in this screen's own
  // filter even though it existed everywhere else in the app.
  const availableMartialArts = getUnifiedMartialArtSummaries();

  // getUnifiedMartialArt (not the official-only getMartialArt) so a
  // custom-added martial art (spec "MARTIALDEX 신규 무술 추가 시스템") resolves
  // here too — otherwise its technique list would 404-redirect immediately.
  const art = martialArtId ? getUnifiedMartialArt(martialArtId) : undefined;
  if (martialArtId && !art) return <Navigate to="/arts" replace />;

  const q = searchParams.get('q') ?? '';

  // The search input used to be bound directly to the URL param — every
  // keystroke called setSearchParams synchronously, which changed `q` and
  // re-ran the `filtered` useMemo below (searchAllTechniques over ~1,310
  // techniques with RESULT_LIMIT=2000, so the Fuse-skip optimization in
  // search.ts can never kick in here — the corpus itself is smaller than
  // the limit). Same measured cost as SearchBar.tsx (40-220ms per call),
  // so typing here blocked the very render that shows the typed character.
  // `qInput` is what the text field actually displays (instant); the URL
  // param (and therefore `filtered`) only updates ~150ms after typing
  // settles. Re-synced from `q` so external navigation (e.g. Header's
  // "전체 검색 결과 보기" link) still shows up immediately.
  const [qInput, setQInput] = useState(q);
  useEffect(() => {
    setQInput(q);
  }, [q]);
  const [missingTechniqueOpen, setMissingTechniqueOpen] = useState(false);
  const martialArtParam = martialArtId || (searchParams.get('martialArt') ?? '');
  const category = searchParams.get('category') ?? '';
  const position = searchParams.get('position') ?? '';
  const difficulty = searchParams.get('difficulty') ?? '';
  const type = searchParams.get('type') ?? '';

  // Re-renders when the user adds/removes a "기술 추가 요청" technique, or
  // when the shared add_teq library changes (a fresh login-time pull, or a
  // technique just discovered by an AI feature elsewhere) — so search
  // results/option lists reflect it immediately (spec [문제 3]) without
  // rebuilding the official search index at all.
  const [userTechniquesTick, setUserTechniquesTick] = useState(0);
  useEffect(() => {
    const onUpdate = () => setUserTechniquesTick((n) => n + 1);
    window.addEventListener('martialdex:user-techniques-updated', onUpdate);
    window.addEventListener(ADD_TEQ_CACHE_EVENT, onUpdate);
    return () => {
      window.removeEventListener('martialdex:user-techniques-updated', onUpdate);
      window.removeEventListener(ADD_TEQ_CACHE_EVENT, onUpdate);
    };
  }, []);

  // Options for every dropdown are derived from the real dataset, scoped to
  // whichever martial art is currently selected — so e.g. picking "유도"
  // narrows the category/position/type lists down to categories that
  // actually exist in judo, instead of showing all ~140 across every art.
  const scopedForOptions = useMemo(
    () => {
      const all = getUnifiedAllTechniques();
      return martialArtParam ? all.filter((t) => isTechniqueInArt(t, martialArtParam)) : all;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [martialArtParam, userTechniquesTick]
  );

  const categoryOptions = useMemo(
    () => uniqueSorted(scopedForOptions.map((t) => (martialArtParam ? techniqueCategoryInArt(t, martialArtParam) : t.category))),
    [scopedForOptions]
  );
  const positionOptions = useMemo(
    () => uniqueSorted(scopedForOptions.flatMap((t) => t.positions)),
    [scopedForOptions]
  );
  const typeOptions = useMemo(
    () => uniqueSorted(scopedForOptions.flatMap((t) => techniqueTypeTags(t))),
    [scopedForOptions]
  );

  const filtered = useMemo(
    () =>
      searchAllTechniques(q, RESULT_LIMIT, {
        martialArt: martialArtParam || undefined,
        category: category || undefined,
        position: position || undefined,
        difficulty: difficulty || undefined,
        type: type || undefined,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, martialArtParam, category, position, difficulty, type, userTechniquesTick]
  );

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [q, martialArtParam, category, position, difficulty, type]);
  const visibleResults = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (qInput === q) return; // already in sync (initial mount, or an external nav just updated qInput above) — no-op
    const timer = window.setTimeout(() => updateParam('q', qInput), 150);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  function clearFilters() {
    const next = new URLSearchParams(searchParams);
    for (const key of ['q', 'category', 'position', 'difficulty', 'type', 'martialArt']) next.delete(key);
    setSearchParams(next);
  }

  const hasActiveFilters = Boolean(q || category || position || difficulty || type || (!martialArtId && martialArtParam));

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          {art ? (
            <>
              <Link to="/arts">무술 목록</Link>
              <span>/</span>
              <Link to={`/arts/${art.id}`}>{art.nameKo}</Link>
              <span>/</span>
              <span>전체 기술</span>
            </>
          ) : (
            <span>전체 기술 검색</span>
          )}
        </div>

        <div className="section-title">
          <h2>{art ? `${art.nameKo} 기술 목록` : '전체 기술 검색'}</h2>
          <div className="chip-row" style={{ gap: 12 }}>
            {martialArtId && art && (
              <button type="button" className="see-all" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setMissingTechniqueOpen((v) => !v)}>
                + 없는 기술 요청
              </button>
            )}
            <Link to="/techniques/request" className="see-all">
              + 기술 추가 요청
            </Link>
          </div>
        </div>

        {missingTechniqueOpen && martialArtId && art && (
          <RequestMissingTechnique
            martialArtId={martialArtId}
            martialArtNameKo={art.nameKo}
            martialArtNameEn={art.nameEn}
            onClose={() => setMissingTechniqueOpen(false)}
            onRegistered={() => {}}
          />
        )}

        <div className="filter-bar">
          <div className="filter-bar__left">
            <input
              type="text"
              className="select filter-text-input"
              placeholder="기술 이름, 한글명, 태그로 검색..."
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
            {!martialArtId && (
              <select
                className="select"
                value={martialArtParam}
                onChange={(e) => {
                  // Build the whole next param set in one go — calling
                  // updateParam() multiple times here would have each call
                  // read the same stale searchParams snapshot and clobber
                  // the previous one instead of combining.
                  const next = new URLSearchParams(searchParams);
                  if (e.target.value) next.set('martialArt', e.target.value);
                  else next.delete('martialArt');
                  // reset filters that may no longer be valid for the new scope
                  next.delete('category');
                  next.delete('position');
                  next.delete('type');
                  setSearchParams(next);
                }}
              >
                <option value="">전체 무술</option>
                {availableMartialArts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nameKo}
                  </option>
                ))}
              </select>
            )}
            <select
              className="select"
              value={category}
              onChange={(e) => updateParam('category', e.target.value)}
            >
              <option value="">전체 카테고리</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={position}
              onChange={(e) => updateParam('position', e.target.value)}
            >
              <option value="">전체 포지션</option>
              {positionOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={difficulty}
              onChange={(e) => updateParam('difficulty', e.target.value)}
            >
              <option value="">전체 난이도</option>
              <option value="beginner">초급</option>
              <option value="intermediate">중급</option>
              <option value="advanced">고급</option>
            </select>
            <select className="select" value={type} onChange={(e) => updateParam('type', e.target.value)}>
              <option value="">전체 기술 유형</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/^#/, '')}
                </option>
              ))}
            </select>
            {hasActiveFilters && (
              <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
                필터 초기화
              </button>
            )}
          </div>
          <span className="result-count">{filtered.length}개 기술</span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon="🔍"
            text={
              q
                ? `"${q}"에 대한 검색 결과가 없습니다. 검색어나 필터를 조정해보세요.`
                : '조건에 맞는 기술이 없습니다. 필터를 조정해보세요.'
            }
          />
        ) : (
          <>
            <div className="stack gap-2">
              {visibleResults.map((t) => (
                <TechniqueRow key={t.id} technique={t} contextArt={martialArtParam || undefined} />
              ))}
            </div>
            {visibleCount < filtered.length && (
              <div className="modal-actions" style={{ justifyContent: 'center', marginTop: 12 }}>
                <button className="btn btn-secondary" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
                  더 보기 ({visibleResults.length}/{filtered.length})
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
