import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getMartialArt } from '../lib/loadData';
import { useAllSkillProgress } from '../lib/skillProgress/useSkillProgress';
import { legacySplitSkillEntries } from '../lib/skillProgress/weaknessEngine';
import LegacySplitNote from '../components/LegacySplitNote';
import { MASTERY_ICON, MASTERY_LABEL, type MasteryStatus } from '../lib/skillProgress/types';
import { setOverrides } from '../lib/skillProgress/overrideStore';
import { LEARNED_BASIS_LABEL, learnedBasis, listLearnedTechniques, practicedTechniqueIdSet, type LearnedBasis } from '../lib/learnedTechniques/service';
import { techniqueCategoryInArt } from '../lib/techniqueCanonical';
import BackButton from '../components/BackButton';
import { isTechniqueInArt, techniqueArts } from '../lib/techniqueCanonical';
import BottomSheet from '../components/BottomSheet';
import EmptyState from '../components/EmptyState';
import LoginToBackupBanner from '../components/auth/LoginToBackupBanner';

// "배운 기술" — every technique the user has EVER studied (see
// learnedTechniques/service.ts), whatever its mastery now, with search,
// art/mastery filters and multi-select bulk mastery change. Mastery values
// are the app's existing 5-state MasteryStatus, written through the same
// override store TechniqueDetail's single-technique "숙련도 변경" uses.

/** Same options and order as TechniqueDetail's single-technique change. */
const MASTERY_OPTIONS: MasteryStatus[] = ['learning', 'average', 'proficient', 'needs_improvement', 'not_started'];
const FILTER_ORDER: MasteryStatus[] = ['proficient', 'average', 'learning', 'needs_improvement', 'not_started'];
/** null = 자동 계산으로 되돌리기 (clears the user override). */
type BulkTarget = MasteryStatus | null;

function normalize(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

export default function LearnedTechniques() {
  const skillEntries = useAllSkillProgress(); // re-computes on override / history / pose-record changes
  // + old records split by the relation audit that hold this user's history/mastery (marked, data kept as is)
  const learned = useMemo(() => listLearnedTechniques([...skillEntries, ...legacySplitSkillEntries()]), [skillEntries]);

  const [searchParams, setSearchParams] = useSearchParams();
  const artFilter = searchParams.get('martialArt') ?? '';
  const statusFilter = (searchParams.get('status') ?? '') as MasteryStatus | '';
  const query = searchParams.get('q') ?? '';
  const categoryFilter = searchParams.get('category') ?? '';
  const basisFilter = (searchParams.get('basis') ?? '') as LearnedBasis | '';
  const practiced = useMemo(() => practicedTechniqueIdSet(), [skillEntries]);
  const catOf = (t: (typeof learned)[number]['technique']) => techniqueCategoryInArt(t, artFilter || t.martialArt);
  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pending, setPending] = useState<{ target: BulkTarget } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const arts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of learned) for (const art of techniqueArts(e.technique)) counts.set(art, (counts.get(art) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, count, name: getMartialArt(id)?.nameKo ?? id }));
  }, [learned]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    return learned.filter((e) => {
      if (artFilter && !isTechniqueInArt(e.technique, artFilter)) return false;
      if (statusFilter && e.progress.status !== statusFilter) return false;
      if (categoryFilter && catOf(e.technique) !== categoryFilter) return false;
      if (basisFilter && !learnedBasis(e.progress, practiced).includes(basisFilter)) return false;
      if (q) {
        const t = e.technique;
        const hay = [t.name, t.koreanName ?? '', ...t.aliases].map(normalize);
        if (!hay.some((h) => h.includes(q))) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learned, artFilter, statusFilter, query, categoryFilter, basisFilter, practiced]);
  const categories = useMemo(() => [...new Set(learned.filter((e) => !artFilter || techniqueArts(e.technique).includes(artFilter)).map((e) => catOf(e.technique)))].sort((a, b) => a.localeCompare(b, 'ko')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [learned, artFilter]);

  // Selection survives filter changes; only still-learned ids count.
  const learnedIds = useMemo(() => new Set(learned.map((e) => e.technique.id)), [learned]);
  const selectedIds = [...selected].filter((id) => learnedIds.has(id));
  const visibleIds = filtered.map((e) => e.technique.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const hiddenSelected = selectedIds.filter((id) => !visibleIds.includes(id)).length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function targetLabel(t: BulkTarget): string {
    return t ? MASTERY_LABEL[t] : '자동 계산';
  }

  function applyBulk() {
    if (!pending) return;
    const ids = selectedIds;
    setOverrides(ids, pending.target);
    setToast(`${ids.length}개 기술의 숙련도를 '${targetLabel(pending.target)}'(으)로 변경했습니다.`);
    setPending(null);
    setSheetOpen(false);
    setSelected(new Set());
    window.setTimeout(() => setToast(null), 4000);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>배운 기술</span>
        </div>
        <div className="section-title">
          <h2>📚 배운 기술</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          커리큘럼·훈련·자세 분석 등으로 한 번이라도 학습한 기술입니다. 지금 숙련도와 관계없이 모두 표시합니다.
        </p>
        <LoginToBackupBanner featureName="기술 숙련도" />

        <div className="curriculum-stat-row">
          <div>
            <strong data-testid="learned-total">{learned.length}</strong>
            <span>배운 기술</span>
          </div>
          {FILTER_ORDER.slice(0, 4).map((s) => (
            <div key={s}>
              <strong>{learned.filter((e) => e.progress.status === s).length}</strong>
              <span>
                {MASTERY_ICON[s]} {MASTERY_LABEL[s]}
              </span>
            </div>
          ))}
        </div>

        {learned.length === 0 ? (
          <EmptyState icon="📚" text="아직 학습한 기술이 없습니다. 커리큘럼이나 훈련으로 기술을 연습하면 여기에 모입니다." />
        ) : (
          <>
            <div className="chip-row" data-testid="learned-art-filter">
              <button className={`chip ${!artFilter ? 'active' : ''}`} onClick={() => updateParam('martialArt', '')}>
                전체
              </button>
              {arts.map((a) => (
                <button key={a.id} className={`chip ${artFilter === a.id ? 'active' : ''}`} data-art={a.id} onClick={() => updateParam('martialArt', a.id)}>
                  {a.name} {a.count}
                </button>
              ))}
            </div>

            <div className="filter-bar">
              <div className="filter-bar__left">
                <input
                  type="text"
                  className="select filter-text-input"
                  placeholder="기술 이름으로 검색"
                  data-testid="learned-search"
                  value={query}
                  onChange={(e) => updateParam('q', e.target.value)}
                />
                <select className="select" data-testid="learned-category-filter" value={categoryFilter} onChange={(e) => updateParam('category', e.target.value)}>
                  <option value="">전체 카테고리</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select className="select" data-testid="learned-basis-filter" value={basisFilter} onChange={(e) => updateParam('basis', e.target.value)}>
                  <option value="">전체 학습 상태</option>
                  {(Object.keys(LEARNED_BASIS_LABEL) as LearnedBasis[]).map((b) => (
                    <option key={b} value={b}>
                      {LEARNED_BASIS_LABEL[b]}
                    </option>
                  ))}
                </select>
                <select className="select" data-testid="learned-status-filter" value={statusFilter} onChange={(e) => updateParam('status', e.target.value)}>
                  <option value="">전체 숙련도</option>
                  {FILTER_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {MASTERY_ICON[s]} {MASTERY_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <span className="result-count" data-testid="learned-count">
                {filtered.length}개
              </span>
            </div>

            <div className="learned-bulk-bar" data-testid="learned-bulk-bar">
              <label className="learned-check">
                <input type="checkbox" data-testid="learned-select-all" checked={allVisibleSelected} onChange={toggleAllVisible} disabled={visibleIds.length === 0} />
                <span>{allVisibleSelected ? '전체 선택 해제' : '전체 선택'}</span>
              </label>
              <span className="learned-bulk-bar__count" data-testid="learned-selected-count">
                선택 {selectedIds.length}개{hiddenSelected > 0 ? ` (현재 목록 밖 ${hiddenSelected}개 포함)` : ''}
              </span>
              <div className="learned-bulk-bar__actions">
                {selectedIds.length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
                    선택 해제
                  </button>
                )}
                <button className="btn btn-primary btn-sm" data-testid="learned-bulk-change" disabled={selectedIds.length === 0} onClick={() => setSheetOpen(true)}>
                  숙련도 변경
                </button>
              </div>
            </div>

            {toast && (
              <div className="ai-inline-warning learned-toast" role="status" data-testid="learned-toast">
                ✅ {toast}
              </div>
            )}

            {filtered.length === 0 ? (
              <EmptyState icon="🔍" text="조건에 맞는 배운 기술이 없습니다." />
            ) : (
              <div className="stack gap-2" data-testid="learned-list">
                {filtered.map(({ technique, progress }) => {
                  const on = selected.has(technique.id);
                  return (
                    <div key={technique.id} className={`technique-row learned-row${on ? ' learned-row--selected' : ''}`} data-testid="learned-row" data-technique-id={technique.id} data-status={progress.status}>
                      <label className="learned-check" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={on} onChange={() => toggle(technique.id)} aria-label={`${technique.name} 선택`} />
                      </label>
                      <div className="technique-row__main" onClick={() => toggle(technique.id)}>
                        <div className="technique-row__name">
                          {technique.name}
                          {technique.koreanName && technique.koreanName !== technique.name ? <span className="learned-row__ko"> {technique.koreanName}</span> : null}
                        </div>
                        {technique.splitInto && (
                          <div className="technique-row__sub">
                            <LegacySplitNote technique={technique} />
                          </div>
                        )}
                        <div className="technique-row__sub">
                          {techniqueArts(technique).map((a) => getMartialArt(a)?.nameKo ?? a).join(' · ')} · 숙련도: {MASTERY_LABEL[progress.status]}
                          {progress.userOverride ? ' (직접 지정)' : ''}
                          {progress.practiceCount > 0 ? ` · 연습 ${progress.practiceCount}회` : ''}
                          {` · ${catOf(technique)} · ${learnedBasis(progress, practiced).map((b) => LEARNED_BASIS_LABEL[b]).join(', ')}`}
                        </div>
                      </div>
                      <div className="technique-row__right">
                        <span className={`chip ${progress.status !== 'not_started' ? 'active' : ''}`}>
                          {MASTERY_ICON[progress.status]} {MASTERY_LABEL[progress.status]}
                        </span>
                        <Link to={`/arts/${technique.martialArt}/techniques/${technique.id}`} className="btn btn-ghost btn-sm" data-testid="learned-detail-link">
                          상세 →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {sheetOpen && (
          <BottomSheet
            onClose={() => {
              setSheetOpen(false);
              setPending(null);
            }}
          >
            {!pending ? (
              <div data-testid="learned-bulk-sheet">
                <h3 style={{ marginTop: 0 }}>선택한 {selectedIds.length}개 기술</h3>
                <p className="video-status-message">숙련도 변경:</p>
                <div className="stack gap-1">
                  {MASTERY_OPTIONS.map((s) => (
                    <button key={s} className="choice-card" data-testid={`learned-bulk-option-${s}`} onClick={() => setPending({ target: s })}>
                      <span className="choice-card__title">
                        {MASTERY_ICON[s]} {MASTERY_LABEL[s]}
                      </span>
                    </button>
                  ))}
                  <button className="choice-card" data-testid="learned-bulk-option-auto" onClick={() => setPending({ target: null })}>
                    <span className="choice-card__title">↺ 자동 계산으로 되돌리기</span>
                  </button>
                </div>
                <div className="modal-actions">
                  <button className="btn btn-ghost" onClick={() => setSheetOpen(false)}>
                    닫기
                  </button>
                </div>
              </div>
            ) : (
              <div data-testid="learned-bulk-confirm">
                <h3 style={{ marginTop: 0 }}>숙련도 변경 확인</h3>
                <p>
                  {selectedIds.length}개 기술의 숙련도를 '{targetLabel(pending.target)}'(으)로 변경하시겠습니까?
                </p>
                {pending.target === null && <p className="video-status-message">직접 지정한 숙련도를 지우고 학습 기록으로 계산한 값으로 되돌립니다.</p>}
                <div className="modal-actions">
                  <button className="btn btn-ghost" data-testid="learned-bulk-cancel" onClick={() => setPending(null)}>
                    취소
                  </button>
                  <button className="btn btn-primary" data-testid="learned-bulk-apply" onClick={applyBulk}>
                    변경
                  </button>
                </div>
              </div>
            )}
          </BottomSheet>
        )}
      </div>
    </div>
  );
}
