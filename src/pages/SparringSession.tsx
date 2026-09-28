import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { martialArtSummaries } from '../lib/loadData';
import { getUnifiedMartialArtSummaries, searchAllTechniques, resolveTechniquesByIds } from '../lib/userTechniques/service';
import { useCustomMartialArtLibraryVersion } from '../lib/customMartialArt/useCustomMartialArtLibrary';
import {
  EQUIPMENT_OPTIONS,
  INTENSITY_LABEL,
  SPARRING_TYPE_LABEL,
  type SparringEquipment,
  type SparringIntensity,
  type SparringRules,
  type SparringType,
} from '../lib/sparringSession/types';
import { clearSparringRun, getPhaseRemainingMs, startSparringRun } from '../lib/sparringSession/sessionStore';
import { useSparringRun } from '../lib/sparringSession/useSparringRun';
import { finalizeSparringSession, loadLastSparringRules } from '../lib/sparringSession/service';
import { listTrainingHistory } from '../lib/trainingHistory/service';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

const ROUND_SECONDS_PRESETS = [60, 120, 180, 300];
const ROUNDS_PRESETS = [1, 2, 3, 4, 5];
const REST_SECONDS_PRESETS = [30, 60, 120];
const INTENSITIES: SparringIntensity[] = ['light', 'moderate', 'hard'];
const SPARRING_TYPES: SparringType[] = ['striking', 'grappling', 'mma'];

function formatMMSS(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(totalMs / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function defaultRules(): SparringRules {
  return {
    martialArt: martialArtSummaries[0]?.id ?? 'boxing',
    sparringType: 'mma',
    plannedRounds: 3,
    roundDurationSeconds: 300,
    restDurationSeconds: 60,
    intensity: 'moderate',
    equipment: [],
    allowedTechniqueIds: [],
    prohibitedTechniqueIds: [],
    partnerName: null,
    notes: null,
  };
}

// Same "own local copy, scoped to this screen's exact needs" convention
// already used 4 times in this codebase (ComboBuilder/TacticBuilder/
// CurriculumEditor/FreeTraining each define their own TechniquePicker) —
// this is a 5th, for allowed/prohibited technique selection specifically.
function TechniqueChipPicker({ martialArt, ids, onAdd, onRemove, label }: { martialArt: string; ids: string[]; onAdd: (id: string) => void; onRemove: (id: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 150);
    return () => window.clearTimeout(timer);
  }, [query]);
  const results = useMemo(() => (debouncedQuery.trim() ? searchAllTechniques(debouncedQuery, 8, { martialArt }) : []), [debouncedQuery, martialArt]);
  const picked = useMemo(() => resolveTechniquesByIds(ids), [ids]);

  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="chip-row" style={{ marginTop: 4 }}>
        {picked.map((t) => (
          <span key={t.id} className="chip active">
            {t.koreanName || t.name}
            <button
              type="button"
              aria-label={`${t.name} 제거`}
              onClick={() => onRemove(t.id)}
              style={{ marginLeft: 6, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
            >
              ✕
            </button>
          </span>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)}>
          + 기술 추가
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 6 }}>
          <input className="select" style={{ width: '100%' }} placeholder="기술 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
          {results.map((t) => (
            <div
              key={t.id}
              className="search-result-row"
              onClick={() => {
                onAdd(t.id);
                setQuery('');
              }}
            >
              {t.koreanName || t.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SparringSetup({ onStart }: { onStart: (rules: SparringRules) => void }) {
  useCustomMartialArtLibraryVersion();
  const availableMartialArts = getUnifiedMartialArtSummaries();
  const [rules, setRules] = useState<SparringRules>(defaultRules);
  const [customRound, setCustomRound] = useState('');
  const [customRest, setCustomRest] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasLastRules = useMemo(() => loadLastSparringRules() !== null, []);

  function toggleEquipment(item: SparringEquipment) {
    setRules((r) => ({ ...r, equipment: r.equipment.includes(item) ? r.equipment.filter((e) => e !== item) : [...r.equipment, item] }));
  }

  function handleLoadLastRules() {
    const last = loadLastSparringRules();
    if (last) setRules(last);
  }

  function handleStart() {
    if (rules.plannedRounds <= 0 || rules.roundDurationSeconds <= 0) {
      setErrorMessage('라운드 수와 라운드 시간을 확인해주세요.');
      return;
    }
    setErrorMessage(null);
    onStart(rules);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/free-training">자유훈련</Link>
          <span>/</span>
          <span>스파링 설정</span>
        </div>
        <div className="section-title">
          <h2>🤼 스파링 설정</h2>
        </div>

        <div className="card info-card">
          <div className="chip-row" style={{ marginBottom: 12 }}>
            <div>
              <label className="field-label">종목</label>
              <br />
              <select className="select" value={rules.martialArt} onChange={(e) => setRules((r) => ({ ...r, martialArt: e.target.value }))}>
                {availableMartialArts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nameKo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">유형</label>
              <br />
              <select className="select" value={rules.sparringType} onChange={(e) => setRules((r) => ({ ...r, sparringType: e.target.value as SparringType }))}>
                {SPARRING_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SPARRING_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">라운드</label>
              <br />
              <select className="select" value={rules.plannedRounds} onChange={(e) => setRules((r) => ({ ...r, plannedRounds: Number(e.target.value) }))}>
                {ROUNDS_PRESETS.map((n) => (
                  <option key={n} value={n}>
                    {n}라운드
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">라운드 시간</label>
              <br />
              <select
                className="select"
                value={ROUND_SECONDS_PRESETS.includes(rules.roundDurationSeconds) ? rules.roundDurationSeconds : 'custom'}
                onChange={(e) => {
                  if (e.target.value === 'custom') return;
                  setRules((r) => ({ ...r, roundDurationSeconds: Number(e.target.value) }));
                }}
              >
                {ROUND_SECONDS_PRESETS.map((s) => (
                  <option key={s} value={s}>
                    {s / 60}분
                  </option>
                ))}
                <option value="custom">직접 입력</option>
              </select>
              {!ROUND_SECONDS_PRESETS.includes(rules.roundDurationSeconds) && (
                <input
                  className="select"
                  style={{ marginTop: 4, width: 90 }}
                  type="number"
                  min={10}
                  placeholder="초"
                  value={customRound}
                  onChange={(e) => {
                    setCustomRound(e.target.value);
                    const v = Number(e.target.value);
                    if (v > 0) setRules((r) => ({ ...r, roundDurationSeconds: v }));
                  }}
                />
              )}
            </div>
            <div>
              <label className="field-label">휴식 시간</label>
              <br />
              <select
                className="select"
                value={REST_SECONDS_PRESETS.includes(rules.restDurationSeconds) ? rules.restDurationSeconds : 'custom'}
                onChange={(e) => {
                  if (e.target.value === 'custom') return;
                  setRules((r) => ({ ...r, restDurationSeconds: Number(e.target.value) }));
                }}
              >
                {REST_SECONDS_PRESETS.map((s) => (
                  <option key={s} value={s}>
                    {s < 60 ? `${s}초` : `${s / 60}분`}
                  </option>
                ))}
                <option value={0}>없음</option>
                <option value="custom">직접 입력</option>
              </select>
              {!REST_SECONDS_PRESETS.includes(rules.restDurationSeconds) && rules.restDurationSeconds !== 0 && (
                <input
                  className="select"
                  style={{ marginTop: 4, width: 90 }}
                  type="number"
                  min={0}
                  placeholder="초"
                  value={customRest}
                  onChange={(e) => {
                    setCustomRest(e.target.value);
                    const v = Number(e.target.value);
                    if (v >= 0) setRules((r) => ({ ...r, restDurationSeconds: v }));
                  }}
                />
              )}
            </div>
            <div>
              <label className="field-label">강도</label>
              <br />
              <select className="select" value={rules.intensity} onChange={(e) => setRules((r) => ({ ...r, intensity: e.target.value as SparringIntensity }))}>
                {INTENSITIES.map((i) => (
                  <option key={i} value={i}>
                    {INTENSITY_LABEL[i]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="field-label">보호장비</label>
          <div className="chip-row" style={{ marginTop: 4, marginBottom: 12 }}>
            {EQUIPMENT_OPTIONS.map((item) => (
              <button key={item} type="button" className={`chip${rules.equipment.includes(item) ? ' active' : ''}`} onClick={() => toggleEquipment(item)}>
                {item}
              </button>
            ))}
          </div>

          <div style={{ marginBottom: 12 }}>
            <TechniqueChipPicker
              martialArt={rules.martialArt}
              ids={rules.allowedTechniqueIds}
              onAdd={(id) => setRules((r) => ({ ...r, allowedTechniqueIds: [...new Set([...r.allowedTechniqueIds, id])] }))}
              onRemove={(id) => setRules((r) => ({ ...r, allowedTechniqueIds: r.allowedTechniqueIds.filter((x) => x !== id) }))}
              label="허용 기술 (선택)"
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <TechniqueChipPicker
              martialArt={rules.martialArt}
              ids={rules.prohibitedTechniqueIds}
              onAdd={(id) => setRules((r) => ({ ...r, prohibitedTechniqueIds: [...new Set([...r.prohibitedTechniqueIds, id])] }))}
              onRemove={(id) => setRules((r) => ({ ...r, prohibitedTechniqueIds: r.prohibitedTechniqueIds.filter((x) => x !== id) }))}
              label="금지 기술 (선택)"
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="field-label">파트너 이름 (선택)</label>
            <br />
            <input className="select" value={rules.partnerName ?? ''} onChange={(e) => setRules((r) => ({ ...r, partnerName: e.target.value.trim() || null }))} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="field-label">메모 (선택)</label>
            <br />
            <textarea style={{ width: '100%', minHeight: 50 }} value={rules.notes ?? ''} onChange={(e) => setRules((r) => ({ ...r, notes: e.target.value.trim() || null }))} />
          </div>

          <p className="video-status-message">
            예정: {rules.plannedRounds} × {Math.round(rules.roundDurationSeconds / 60) || Math.round(rules.roundDurationSeconds)}
            {rules.roundDurationSeconds % 60 === 0 ? '분' : '초'}
            {rules.restDurationSeconds > 0 ? ` · 휴식 ${rules.restDurationSeconds < 60 ? `${rules.restDurationSeconds}초` : `${rules.restDurationSeconds / 60}분`}` : ''}
          </p>
          {errorMessage && <p className="video-status-message">{errorMessage}</p>}

          <div className="modal-actions modal-actions--start">
            {hasLastRules && (
              <button className="btn btn-secondary" onClick={handleLoadLastRules}>
                지난 룰 불러오기
              </button>
            )}
            <button className="btn btn-primary" onClick={handleStart}>
              스파링 시작
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Reasonable sanity bound for the manual time-edit field on the end screen
// (spec section 9's "정상적인 범위의 시간만 허용") — never below 0, never
// beyond roughly double the planned total (covers legitimate overrun/extra
// rounds without allowing an obviously-wrong typo like an extra digit).
function isValidActualSeconds(seconds: number, plannedSeconds: number): boolean {
  return Number.isFinite(seconds) && seconds > 0 && seconds <= Math.max(plannedSeconds * 2, 3600);
}

function SparringEndScreen({ actualSeconds, plannedSeconds, rounds, plannedRounds, intensity, onSave, onCancel }: {
  actualSeconds: number;
  plannedSeconds: number;
  rounds: number;
  plannedRounds: number;
  intensity: SparringIntensity;
  onSave: (finalSeconds: number) => void;
  onCancel: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [minutesInput, setMinutesInput] = useState(String(Math.floor(actualSeconds / 60)));
  const [secondsInput, setSecondsInput] = useState(String(actualSeconds % 60));
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const finalSeconds = editing ? Number(minutesInput || 0) * 60 + Number(secondsInput || 0) : actualSeconds;
    if (!isValidActualSeconds(finalSeconds, plannedSeconds)) {
      setError('올바른 시간 범위를 입력해주세요.');
      return;
    }
    onSave(finalSeconds);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/free-training">자유훈련</Link>
          <span>/</span>
          <span>스파링 완료</span>
        </div>
        <div className="section-title">
          <h2>🎉 스파링 완료</h2>
        </div>
        <div className="card info-card text-center">
          <p className="video-status-message">
            예정: {plannedRounds} × {Math.round(plannedSeconds / plannedRounds / 60) || Math.round(plannedSeconds / plannedRounds)}
            {plannedSeconds / plannedRounds % 60 === 0 ? '분' : '초'}
          </p>
          <h3>실제 스파링 시간</h3>
          {editing ? (
            <div className="chip-row" style={{ justifyContent: 'center' }}>
              <input className="select" style={{ width: 70 }} type="number" min={0} value={minutesInput} onChange={(e) => setMinutesInput(e.target.value)} />
              <span>분</span>
              <input className="select" style={{ width: 70 }} type="number" min={0} max={59} value={secondsInput} onChange={(e) => setSecondsInput(e.target.value)} />
              <span>초</span>
            </div>
          ) : (
            <div className="timer-display">{formatMMSS(actualSeconds * 1000)}</div>
          )}
          <p className="video-status-message">완료 라운드 {rounds}/{plannedRounds} · 강도 {INTENSITY_LABEL[intensity]}</p>
          {error && <p className="video-status-message">{error}</p>}
          <div className="modal-actions" style={{ justifyContent: 'center' }}>
            {!editing && (
              <button className="btn btn-secondary" onClick={() => setEditing(true)}>
                시간 수정
              </button>
            )}
            <button className="btn btn-primary" onClick={handleSave}>
              기록 저장
            </button>
            <button className="btn btn-ghost" onClick={onCancel}>
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SparringSession() {
  const navigate = useNavigate();
  const { run, pause, resume, endNow } = useSparringRun();
  const [saved, setSaved] = useState(false);
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null);

  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!run || run.paused || run.phase === 'finished') return;
    const id = window.setInterval(() => forceTick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [run?.paused, run?.phase]);

  function handleCancel() {
    clearSparringRun();
    navigate('/free-training');
  }

  if (!run) {
    return <SparringSetup onStart={(rules) => startSparringRun(rules)} />;
  }

  if (run.phase === 'finished') {
    if (saved) {
      return (
        <div className="page">
          <div className="container">
            <BackButton />
            <div className="section-title">
              <h2>✅ 스파링 기록 저장 완료</h2>
            </div>
            <div className="modal-actions modal-actions--start">
              {savedEntryId && (
                <Link to={`/training-analytics/${savedEntryId}`} className="btn btn-secondary">
                  기록 상세 보기
                </Link>
              )}
              <button
                className="btn btn-primary"
                onClick={() => {
                  clearSparringRun();
                  navigate('/free-training');
                }}
              >
                자유훈련으로
              </button>
            </div>
          </div>
        </div>
      );
    }
    const actualSeconds = Math.round((run.accumulatedRoundMs ?? 0) / 1000);
    return (
      <SparringEndScreen
        actualSeconds={actualSeconds}
        plannedSeconds={run.rules.plannedRounds * run.rules.roundDurationSeconds}
        rounds={run.completedRounds}
        plannedRounds={run.rules.plannedRounds}
        intensity={run.rules.intensity}
        onSave={(finalSeconds) => {
          const record = finalizeSparringSession(run, { actualDurationSeconds: finalSeconds });
          // Find the training_history entry we just linked, for the "상세 보기" link.
          const entry = listTrainingHistory().find((e) => e.sparringSessionId === record.id);
          setSavedEntryId(entry?.id ?? null);
          setSaved(true);
        }}
        onCancel={handleCancel}
      />
    );
  }

  const remainingMs = getPhaseRemainingMs(run);

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/free-training">자유훈련</Link>
          <span>/</span>
          <span>스파링</span>
        </div>
        <div className="chip-row">
          <span className="chip active">
            ROUND {run.currentRound} / {run.rules.plannedRounds}
          </span>
          <span className="chip">{run.phase === 'round' ? '스파링 중' : '휴식'}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => (run.paused ? resume() : pause())} style={{ marginLeft: 'auto' }}>
            {run.paused ? '▶ 재개' : '⏸ 일시정지'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => endNow()}>
            ■ 종료
          </button>
        </div>

        {run.paused ? (
          <div className="card info-card text-center">
            <h3>일시정지됨</h3>
            <p>진행 상황은 그대로 저장되어 있습니다. 준비되면 재개하세요.</p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={resume}>
                ▶ 재개
              </button>
            </div>
          </div>
        ) : (
          <div className="card info-card text-center">
            <h3>{run.phase === 'round' ? 'ROUND' : 'REST'}</h3>
            <div className="timer-display">{formatMMSS(remainingMs)}</div>
          </div>
        )}

        <EmptyState icon="🤼" text="종료 버튼을 누르면 지금까지의 실제 스파링 시간을 확인하고 기록을 저장할 수 있습니다." />
      </div>
    </div>
  );
}
