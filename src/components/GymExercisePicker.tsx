import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Technique } from '../types';
import { GYM_MARTIAL_ART_ID } from '../lib/gymTraining/library';
import { getUnifiedTechniquesByMartialArt } from '../lib/userTechniques/service';
import { ADD_TEQ_CACHE_EVENT } from '../lib/addTeq/repository';
import { GYM_BODY_PART_LABEL, GYM_BODY_PARTS } from '../lib/gymTraining/recovery';

const RESULT_CAP = 60;

// The mobile-performance-safe fix for TechniqueList.tsx's confirmed real
// issue (unfiltered full-corpus render + per-row synchronous localStorage
// reads): zero rows render until a body-part chip, equipment chip, or search
// query is active. ~150 exercises is a small enough in-memory array that a
// plain .filter() (no Fuse/search-index) is instant even on low-end mobile.
export default function GymExercisePicker({ onSelect, excludeIds = [] }: { onSelect: (technique: Technique) => void; excludeIds?: string[] }) {
  const [bodyPart, setBodyPart] = useState<string>('');
  const [equipment, setEquipment] = useState<string>('');
  const [query, setQuery] = useState('');

  // getUnifiedTechniquesByMartialArt merges the static 147-bundle with any
  // user-discovered gym exercises (add_teq — see RequestGymExercise.tsx),
  // so a newly-registered exercise shows up here immediately, not just in
  // the static library. Re-read on the same events TechniqueList.tsx
  // already reacts to, so a fresh add_teq pull or a just-registered
  // exercise appears without remounting this component.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onUpdate = () => setTick((n) => n + 1);
    window.addEventListener('martialdex:user-techniques-updated', onUpdate);
    window.addEventListener(ADD_TEQ_CACHE_EVENT, onUpdate);
    return () => {
      window.removeEventListener('martialdex:user-techniques-updated', onUpdate);
      window.removeEventListener(ADD_TEQ_CACHE_EVENT, onUpdate);
    };
  }, []);
  const gymExercises = useMemo(() => getUnifiedTechniquesByMartialArt(GYM_MARTIAL_ART_ID), [tick]);

  const equipmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of gymExercises) for (const e of t.gymEquipment ?? []) set.add(e);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [gymExercises]);

  const filterActive = !!bodyPart || !!equipment || query.trim().length > 0;

  // Already-added exercises are still shown (disabled, "이미 추가됨") instead
  // of silently vanishing from the results — hiding them entirely made a
  // successfully-added exercise look like a broken search when a user
  // searched for it again in the same day.
  const results = useMemo(() => {
    if (!filterActive) return [];
    const q = query.trim().toLowerCase();
    const matched = gymExercises
      .filter((t) => !bodyPart || t.gymBodyPart === bodyPart)
      .filter((t) => !equipment || (t.gymEquipment ?? []).includes(equipment))
      .filter((t) => !q || t.name.toLowerCase().includes(q) || (t.primaryMuscle ?? '').toLowerCase().includes(q));
    const available = matched.filter((t) => !excludeIds.includes(t.id));
    const alreadyAdded = matched.filter((t) => excludeIds.includes(t.id));
    return [...available, ...alreadyAdded].slice(0, RESULT_CAP).map((t) => ({ technique: t, alreadyAdded: excludeIds.includes(t.id) }));
  }, [gymExercises, bodyPart, equipment, query, filterActive, excludeIds]);

  return (
    <div>
      <div className="gym-picker-chip-row">
        <button type="button" className={`chip${bodyPart === '' ? ' active' : ''}`} onClick={() => setBodyPart('')}>
          전체 부위
        </button>
        {GYM_BODY_PARTS.map((bp) => (
          <button key={bp} type="button" className={`chip${bodyPart === bp ? ' active' : ''}`} onClick={() => setBodyPart(bp === bodyPart ? '' : bp)}>
            {GYM_BODY_PART_LABEL[bp]}
          </button>
        ))}
      </div>
      <div className="gym-picker-chip-row">
        <button type="button" className={`chip${equipment === '' ? ' active' : ''}`} onClick={() => setEquipment('')}>
          전체 장비
        </button>
        {equipmentOptions.map((eq) => (
          <button key={eq} type="button" className={`chip${equipment === eq ? ' active' : ''}`} onClick={() => setEquipment(eq === equipment ? '' : eq)}>
            {eq}
          </button>
        ))}
      </div>
      <input
        className="select field-full"
        style={{ marginBottom: 10 }}
        type="text"
        placeholder="운동 이름으로 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!filterActive && <p className="video-status-message">부위/장비를 선택하거나 검색어를 입력하면 운동 목록이 표시됩니다.</p>}
      {filterActive && results.length === 0 && <p className="video-status-message">조건에 맞는 운동이 없습니다.</p>}
      {results.length > 0 && (
        <div className="stack gap-2">
          {results.map(({ technique: t, alreadyAdded }) => (
            <button
              key={t.id}
              type="button"
              className="technique-row"
              style={{ width: '100%', textAlign: 'left', opacity: alreadyAdded ? 0.5 : 1, cursor: alreadyAdded ? 'default' : 'pointer' }}
              disabled={alreadyAdded}
              onClick={() => onSelect(t)}
            >
              <div className="technique-row__main">
                <div className="technique-row__name">
                  {t.name}
                  {alreadyAdded ? ' (이미 추가됨)' : ''}
                </div>
                <div className="technique-row__sub">
                  {(t.gymBodyPart ? GYM_BODY_PART_LABEL[t.gymBodyPart] : null) ?? t.category} · {t.primaryMuscle} · {(t.gymEquipment ?? []).join('/')}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {filterActive && (
        <p className="video-status-message" style={{ marginTop: 8 }}>
          찾는 운동이 없나요? <Link to="/training/exercises/request">➕ 새 운동 추가 요청하기</Link>
        </p>
      )}
    </div>
  );
}
