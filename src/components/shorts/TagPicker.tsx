import { useEffect, useMemo, useRef, useState } from 'react';
import type { PostTag } from '../../lib/communityPost/types';
import { MAX_POST_TAGS } from '../../lib/communityPost/types';
import { searchAllTechniques } from '../../lib/userTechniques/service';
import { listSharedCombos } from '../../lib/sharedCombo/service';
import type { SharedCombo } from '../../lib/sharedCombo/types';
import { TAG_KIND_LABEL } from '../../lib/shorts/learn';

/**
 * 기술·콤보/셋업 태그 — the author tags what the video shows: real MARTIALDEX techniques, or
 * shared 사용자 콤보·셋업 (shared ones only — viewers must be able to open what's tagged).
 */
export default function TagPicker({ value, onChange, viewerId }: { value: PostTag[]; onChange: (tags: PostTag[]) => void; viewerId: string | null }) {
  const [q, setQ] = useState('');
  const [combos, setCombos] = useState<SharedCombo[] | null>(null);
  const loading = useRef(false);
  useEffect(() => {
    if (q.trim().length < 1 || combos || loading.current) return;
    loading.current = true;
    void listSharedCombos(viewerId).then((r) => setCombos(r.ok ? r.data : []));
  }, [q, combos, viewerId]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [] as PostTag[];
    const techs: PostTag[] = searchAllTechniques(q, 6).map((t) => ({ type: 'technique', id: t.id, name: t.koreanName && t.koreanName !== t.name ? `${t.name} (${t.koreanName})` : t.name, martialArt: t.martialArt }));
    const cs: PostTag[] = (combos ?? [])
      .filter((c) => `${c.name} ${c.purpose}`.toLowerCase().includes(s))
      .slice(0, 6)
      .map((c) => ({ type: 'combo', id: c.id, name: c.name, martialArt: c.martialArt, kind: c.kind }));
    const has = (t: PostTag) => value.some((v) => v.type === t.type && v.id === t.id);
    return [...techs, ...cs].filter((t) => !has(t));
  }, [q, combos, value]);

  const full = value.length >= MAX_POST_TAGS;
  return (
    <div className="tag-picker" data-testid="tag-picker">
      <label className="field-label" htmlFor="tag-picker-q">🏷 영상 속 기술·콤보/셋업 태그 (선택)</label>
      {value.length > 0 && (
        <div className="chip-row" style={{ margin: '4px 0' }}>
          {value.map((t) => (
            <span key={`${t.type}:${t.id}`} className="chip active" data-testid="tag-picked">
              {TAG_KIND_LABEL(t)} · {t.name}
              <button type="button" className="tag-picker__remove" aria-label={`${t.name} 태그 빼기`} onClick={() => onChange(value.filter((v) => !(v.type === t.type && v.id === t.id)))}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <input id="tag-picker-q" className="select field-full" placeholder={full ? `태그는 ${MAX_POST_TAGS}개까지 붙일 수 있습니다` : '기술이나 콤보/셋업 이름 검색 (예: 잽, Armbar, 원투)'} value={q} onChange={(e) => setQ(e.target.value)} disabled={full} data-testid="tag-picker-input" />
      {results.length > 0 && (
        <div className="tag-picker__results">
          {results.map((t) => (
            <button
              key={`${t.type}:${t.id}`}
              type="button"
              className="tag-picker__result"
              onClick={() => {
                onChange([...value, t].slice(0, MAX_POST_TAGS));
                setQ('');
              }}
              data-testid="tag-picker-result"
              data-type={t.type}
            >
              <span className="chip">{TAG_KIND_LABEL(t)}</span> {t.name}
              {t.martialArt ? <small> · {t.martialArt}</small> : null}
            </button>
          ))}
        </div>
      )}
      {q.trim() && results.length === 0 && combos !== null && <p className="video-status-message">찾는 기술·콤보가 없습니다. 콤보는 사용자 콤보·셋업에 공유된 것만 태그할 수 있습니다.</p>}
    </div>
  );
}
