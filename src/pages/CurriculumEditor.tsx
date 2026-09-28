import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { martialArtSummaries } from '../lib/loadData';
import { getUnifiedMartialArtSummaries, resolveTechnique, searchAllTechniques } from '../lib/userTechniques/service';
import type { Curriculum, CurriculumDay, CurriculumVisibility, ExerciseConfig, ExerciseMode } from '../lib/curriculum/types';
import {
  addDay,
  addTechniqueToDay,
  createCustomCurriculum,
  getCurriculum,
  removeDay,
  removeTechniqueFromDay,
  reorderDay,
  reorderTechniqueInDay,
  saveCustomCurriculum,
  setExerciseConfig,
  updateDay,
} from '../lib/curriculum/curriculumService';
import { getDefaultExerciseConfig } from '../lib/todayTraining/exerciseDefaults';
import BackButton from '../components/BackButton';
import NumberField from '../components/NumberField';

function ExerciseConfigEditor({
  day,
  techniqueId,
  onSave,
}: {
  day: CurriculumDay;
  techniqueId: string;
  onSave: (config: ExerciseConfig) => void;
}) {
  const technique = resolveTechnique(techniqueId);
  const initial = day.exerciseConfig?.[techniqueId] ?? (technique ? getDefaultExerciseConfig(technique) : null);
  const [config, setConfig] = useState<ExerciseConfig>(
    initial ?? { mode: 'reps', sets: 3, targetReps: 10, targetSeconds: null, restSeconds: 45 }
  );

  function update(patch: Partial<ExerciseConfig>) {
    const next = { ...config, ...patch };
    setConfig(next);
    onSave(next);
  }

  return (
    <div className="card info-card" style={{ marginTop: 6, marginBottom: 10 }}>
      <div className="chip-row" style={{ marginBottom: 8 }}>
        <div>
          <label className="field-label">훈련 방식</label>
          <br />
          <select
            className="select"
            value={config.mode}
            onChange={(e) => {
              const mode = e.target.value as ExerciseMode;
              update(mode === 'reps' ? { mode, targetReps: config.targetReps ?? 10, targetSeconds: null } : { mode, targetSeconds: config.targetSeconds ?? 60, targetReps: null });
            }}
          >
            <option value="reps">횟수 기반</option>
            <option value="time">시간 기반</option>
          </select>
        </div>
        <div>
          <label className="field-label">세트 수</label>
          <br />
          <NumberField className="select" style={{ width: 80 }} min={1} value={config.sets} onCommit={(n) => update({ sets: n ?? config.sets })} />
        </div>
        {config.mode === 'reps' ? (
          <div>
            <label className="field-label">목표 횟수</label>
            <br />
            <NumberField
              className="select"
              style={{ width: 90 }}
              min={1}
              value={config.targetReps ?? 10}
              onCommit={(n) => update({ targetReps: n ?? config.targetReps })}
            />
          </div>
        ) : (
          <div>
            <label className="field-label">목표 시간(초)</label>
            <br />
            <NumberField
              className="select"
              style={{ width: 90 }}
              min={1}
              value={config.targetSeconds ?? 60}
              onCommit={(n) => update({ targetSeconds: n ?? config.targetSeconds })}
            />
          </div>
        )}
        <div>
          <label className="field-label">세트 사이 휴식(초)</label>
          <br />
          <div className="chip-row" style={{ marginBottom: 4 }}>
            {[30, 60, 90, 120].map((preset) => (
              <button
                key={preset}
                type="button"
                className={`chip${config.restSeconds === preset ? ' active' : ''}`}
                onClick={() => update({ restSeconds: preset })}
              >
                {preset}초
              </button>
            ))}
          </div>
          <NumberField
            className="select"
            style={{ width: 90 }}
            min={0}
            value={config.restSeconds}
            onCommit={(n) => update({ restSeconds: n ?? config.restSeconds })}
          />
        </div>
      </div>
    </div>
  );
}

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
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        + 기술 추가
      </button>
    );
  }

  return (
    <div className="technique-picker">
      <input
        autoFocus
        className="select field-full"
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

export default function CurriculumEditor() {
  const { martialArtId, curriculumId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const createdRef = useRef(false);

  const [curriculum, setCurriculum] = useState<Curriculum | null>(() =>
    curriculumId ? getCurriculum(curriculumId) ?? null : null
  );
  const [expandedTechnique, setExpandedTechnique] = useState<string | null>(null);
  // Day-level accordion (spec 4-10) — every Day starts expanded (unchanged
  // default behavior); a Day's number lives in this set only while
  // collapsed, so a long curriculum can be collapsed down to just its
  // titles without the initial view suddenly looking empty.
  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(() => new Set());
  function toggleDayCollapsed(dayNumber: number) {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayNumber)) next.delete(dayNumber);
      else next.add(dayNumber);
      return next;
    });
  }

  // Creating a brand-new curriculum: persist an empty draft immediately so
  // every subsequent edit (day/technique add) has a real id to save
  // against, then swap the URL to the normal edit route.
  useEffect(() => {
    if (curriculumId || createdRef.current) return;
    createdRef.current = true;
    const draft = createCustomCurriculum({
      title: '새 커리큘럼',
      description: '',
      martialArt: searchParams.get('martialArt') || martialArtSummaries[0].id,
      visibility: 'private',
    });
    setCurriculum(draft);
    navigate(`/learning/${draft.martialArt}/${draft.id}/edit`, { replace: true });
  }, [curriculumId]);

  if (curriculumId && (!curriculum || curriculum.source !== 'custom' || curriculum.martialArt !== martialArtId)) {
    return <Navigate to={martialArtId ? `/learning/${martialArtId}` : '/learning'} replace />;
  }
  if (!curriculum) return null;

  function persist(next: Curriculum) {
    const saved = saveCustomCurriculum(next);
    setCurriculum(saved);
  }

  return (
    <div className="page">
      <div className="container curriculum-editor">
        <BackButton />
        <div className="section-title">
          <h2>커리큘럼 편집</h2>
        </div>

        <div className="card info-card">
          <label className="field-label">이름</label>
          <input
            className="select field-full"
            style={{ marginBottom: 12 }}
            value={curriculum.title}
            onChange={(e) => persist({ ...curriculum, title: e.target.value })}
          />

          <label className="field-label">설명</label>
          <textarea
            className="field-full"
            style={{ minHeight: 70, marginBottom: 12 }}
            value={curriculum.description}
            onChange={(e) => persist({ ...curriculum, description: e.target.value })}
          />

          <div className="chip-row" style={{ marginBottom: 12 }}>
            <div>
              <label className="field-label">대표 무술</label>
              <br />
              <select
                className="select"
                value={curriculum.martialArt}
                onChange={(e) => {
                  const next = { ...curriculum, martialArt: e.target.value };
                  persist(next);
                  navigate(`/learning/${next.martialArt}/${next.id}/edit`, { replace: true });
                }}
              >
                {getUnifiedMartialArtSummaries().map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nameKo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">공개 여부</label>
              <br />
              <select
                className="select"
                value={curriculum.visibility}
                onChange={(e) => persist({ ...curriculum, visibility: e.target.value as CurriculumVisibility })}
              >
                <option value="private">비공개</option>
                <option value="unlisted">링크를 가진 사람만</option>
                <option value="public">공개</option>
              </select>
            </div>
            <div>
              <label className="field-label">커버 아이콘 (이모지)</label>
              <br />
              <input
                className="select"
                style={{ width: 70 }}
                maxLength={4}
                value={curriculum.coverIcon ?? ''}
                onChange={(e) => persist({ ...curriculum, coverIcon: e.target.value })}
              />
            </div>
          </div>
        </div>

        {curriculum.days.map((day) => {
          const collapsed = collapsedDays.has(day.day);
          return (
          <div className="card info-card curriculum-editor-day" key={day.day}>
            <div className="curriculum-editor-day__header">
              <button
                type="button"
                className="curriculum-editor-day__toggle"
                onClick={() => toggleDayCollapsed(day.day)}
                aria-expanded={!collapsed}
              >
                <span className="curriculum-editor-day__chevron" aria-hidden="true">{collapsed ? '▶' : '▼'}</span>
                <strong>Day {day.day}</strong>
                {collapsed && (day.title || day.techniqueIds.length > 0) && (
                  <span className="curriculum-editor-day__summary">
                    {day.title ? `${day.title} · ` : ''}기술 {day.techniqueIds.length}개
                  </span>
                )}
              </button>
              <div className="curriculum-editor-day__controls">
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={day.day === 1}
                  onClick={() => persist(reorderDay(curriculum, day.day, day.day - 1))}
                >
                  ▲
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={day.day === curriculum.days.length}
                  onClick={() => persist(reorderDay(curriculum, day.day, day.day + 1))}
                >
                  ▼
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => persist(removeDay(curriculum, day.day))}>
                  Day 삭제
                </button>
              </div>
            </div>

            {!collapsed && (
            <>
            <input
              className="select field-full"
              style={{ marginBottom: 8 }}
              placeholder="Day 제목"
              value={day.title}
              onChange={(e) => persist(updateDay(curriculum, day.day, { title: e.target.value }))}
            />
            <textarea
              className="field-full"
              style={{ minHeight: 50, marginBottom: 8 }}
              placeholder="Day 설명"
              value={day.description}
              onChange={(e) => persist(updateDay(curriculum, day.day, { description: e.target.value }))}
            />
            <textarea
              className="field-full"
              style={{ minHeight: 40, marginBottom: 8 }}
              placeholder="학습 목표 (한 줄에 하나씩)"
              value={day.learningGoals.join('\n')}
              onChange={(e) =>
                persist(updateDay(curriculum, day.day, { learningGoals: e.target.value.split('\n').filter(Boolean) }))
              }
            />
            <div className="chip-row" style={{ marginBottom: 8 }}>
              <label className="field-label">예상 학습 시간(분)</label>
              <NumberField
                className="select"
                style={{ width: 90 }}
                min={5}
                value={day.estimatedMinutes}
                onCommit={(n) => persist(updateDay(curriculum, day.day, { estimatedMinutes: n ?? day.estimatedMinutes }))}
              />
            </div>

            <label className="field-label">기술 (세트/횟수/시간/휴식은 ⚙로 설정)</label>
            <div className="chip-row" style={{ marginTop: 6, marginBottom: 6 }}>
              {day.techniqueIds.map((id, idx) => (
                <span className="chip active" key={id}>
                  {resolveTechnique(id)?.name ?? id}
                  <button
                    aria-label="순서 위로"
                    disabled={idx === 0}
                    onClick={() => persist(reorderTechniqueInDay(curriculum, day.day, idx, idx - 1))}
                    className="icon-action-btn"
                    style={{ marginLeft: 6 }}
                  >
                    ▲
                  </button>
                  <button
                    aria-label="순서 아래로"
                    disabled={idx === day.techniqueIds.length - 1}
                    onClick={() => persist(reorderTechniqueInDay(curriculum, day.day, idx, idx + 1))}
                    className="icon-action-btn"
                  >
                    ▼
                  </button>
                  <button
                    aria-label="훈련 설정"
                    onClick={() => setExpandedTechnique(expandedTechnique === `${day.day}:${id}` ? null : `${day.day}:${id}`)}
                    className="icon-action-btn"
                    style={{ marginLeft: 6 }}
                  >
                    ⚙
                  </button>
                  <button
                    aria-label="기술 제거"
                    onClick={() => persist(removeTechniqueFromDay(curriculum, day.day, id))}
                    className="icon-action-btn"
                    style={{ marginLeft: 2 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            {day.techniqueIds
              .filter((id) => expandedTechnique === `${day.day}:${id}`)
              .map((id) => (
                <ExerciseConfigEditor
                  key={id}
                  day={day}
                  techniqueId={id}
                  onSave={(config) => persist(setExerciseConfig(curriculum, day.day, id, config))}
                />
              ))}
            <TechniquePicker onPick={(id) => persist(addTechniqueToDay(curriculum, day.day, id))} />
            </>
            )}
          </div>
          );
        })}

        <button className="btn btn-secondary" onClick={() => persist(addDay(curriculum))}>
          + Day 추가
        </button>

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/learning/${curriculum.martialArt}/${curriculum.id}`)}
          >
            저장하고 보기
          </button>
        </div>
      </div>
    </div>
  );
}
