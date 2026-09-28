import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { createCombo, getCombo, updateCombo, validateCombo } from '../lib/combo/service';
import { resolveTechniquesByIds, searchAllTechniques } from '../lib/userTechniques/service';
import BackButton from '../components/BackButton';

// Same fix as SearchBar.tsx: searchAllTechniques over the ~1,310-technique
// corpus (Fuse fuzzy pass) measured at 40-220ms per call — unmemoized and
// re-run on every keystroke used to block the render that shows the typed
// character. Debouncing the value that actually drives the search (not the
// input's own displayed value) fixes that without changing which results show.
function TechniquePicker({ onPick }: { onPick: (techniqueId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 150);
    return () => window.clearTimeout(timer);
  }, [query]);
  const results = useMemo(() => (debouncedQuery.trim() ? searchAllTechniques(debouncedQuery, 8) : []), [debouncedQuery]);

  if (!open) {
    return (
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        + 콤보에 기술 추가
      </button>
    );
  }

  return (
    <div className="technique-picker">
      <input
        autoFocus
        className="select"
        style={{ width: '100%' }}
        placeholder="기술 이름으로 검색 (모든 무술)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      />
      {results.length > 0 && (
        <div className="technique-picker__results">
          {results.map((t) => (
            <div
              key={t.id}
              className="search-result-row"
              onClick={() => {
                onPick(t.id);
                setQuery('');
              }}
            >
              <div>
                <div className="search-result-row__name">
                  {t.name}
                  {t.koreanName && t.koreanName !== t.name ? ` · ${t.koreanName}` : ''}
                </div>
                <div className="search-result-row__meta">
                  {t.martialArt} · {t.category}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
        닫기
      </button>
    </div>
  );
}

export default function ComboBuilder() {
  const { comboId } = useParams();
  const navigate = useNavigate();
  const existing = comboId ? getCombo(comboId) : undefined;
  if (comboId && !existing) return <Navigate to="/combos" replace />;

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [techniqueIds, setTechniqueIds] = useState<string[]>(existing?.techniqueIds ?? []);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const techniques = resolveTechniquesByIds(techniqueIds);

  function addTechnique(id: string) {
    setTechniqueIds((prev) => [...prev, id]);
  }
  function removeTechnique(index: number) {
    setTechniqueIds((prev) => prev.filter((_, i) => i !== index));
  }
  function moveTechnique(index: number, direction: -1 | 1) {
    setTechniqueIds((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function reorderTo(fromIndex: number, toIndex: number) {
    setTechniqueIds((prev) => {
      if (fromIndex === toIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function handleSave() {
    const validation = validateCombo(name, techniqueIds);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors([]);
    if (existing) updateCombo(existing, { name, description, techniqueIds });
    else createCombo({ name, description, techniqueIds });
    navigate('/combos');
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/combos">콤보 북</Link>
          <span>/</span>
          <span>{existing ? '콤보 편집' : '새 콤보 만들기'}</span>
        </div>
        <div className="section-title">
          <h2>{existing ? '콤보 편집' : '새 콤보 만들기'}</h2>
        </div>

        <div className="card info-card">
          <label className="field-label">콤보 이름</label>
          <input
            className="select"
            style={{ width: '100%', marginBottom: 12 }}
            placeholder="예: 원투 태클"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="field-label">설명 (선택)</label>
          <textarea
            style={{ width: '100%', minHeight: 60, marginBottom: 12 }}
            placeholder="예: 나만의 압박 콤보"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="card info-card">
          <h3>기술 순서 (Timeline)</h3>
          <p className="video-status-message">기술을 드래그하거나 ◀ ▶ 버튼으로 순서를 바꿀 수 있습니다.</p>
          {techniques.length === 0 ? (
            <p className="video-status-message">아직 추가된 기술이 없습니다.</p>
          ) : (
            <div className="chip-row" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
              {techniques.map((t, i) => (
                <span key={`${t.id}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {i > 0 && <span aria-hidden="true">→</span>}
                  <span
                    className="chip active"
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== null) reorderTo(dragIndex, i);
                      setDragIndex(null);
                    }}
                    style={{ cursor: 'grab' }}
                  >
                    {t.name}
                    <button
                      aria-label="왼쪽으로 이동"
                      disabled={i === 0}
                      onClick={() => moveTechnique(i, -1)}
                      style={{ marginLeft: 6, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
                    >
                      ◀
                    </button>
                    <button
                      aria-label="오른쪽으로 이동"
                      disabled={i === techniques.length - 1}
                      onClick={() => moveTechnique(i, 1)}
                      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
                    >
                      ▶
                    </button>
                    <button
                      aria-label="삭제"
                      onClick={() => removeTechnique(i)}
                      style={{ marginLeft: 2, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
                    >
                      ×
                    </button>
                  </span>
                </span>
              ))}
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <TechniquePicker onPick={addTechnique} />
          </div>
        </div>

        {errors.length > 0 && (
          <div className="card info-card">
            {errors.map((e) => (
              <p key={e} className="video-status-message">
                {e}
              </p>
            ))}
          </div>
        )}

        <div className="modal-actions modal-actions--start">
          <button className="btn btn-primary" onClick={handleSave}>
            저장하기
          </button>
          <Link to="/combos" className="btn btn-ghost">
            취소
          </Link>
        </div>
      </div>
    </div>
  );
}
