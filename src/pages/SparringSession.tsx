import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
import { finalizeSparringSession, getSparringSession, listSparringSessions, loadLastSparringRules, recordPastSparringSession, validatePastSparring } from '../lib/sparringSession/service';
import { todayDateKey } from '../lib/dateUtil';
import AutoGrowTextarea from '../components/AutoGrowTextarea';
import { listTrainingHistory } from '../lib/trainingHistory/service';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

const ROUND_SECONDS_PRESETS = [60, 120, 180, 300];
const ROUNDS_PRESETS = Array.from({ length: 12 }, (_, i) => i + 1);
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
function TechniqueChipPicker({ martialArt, ids, onAdd, onRemove, label, testId }: { martialArt: string; ids: string[]; onAdd: (id: string) => void; onRemove: (id: string) => void; label: string; testId?: string }) {
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
    <div data-testid={testId}>
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

function RuleFields({ rules, setRules, roundsLabel }: { rules: SparringRules; setRules: (fn: (r: SparringRules) => SparringRules) => void; roundsLabel: string }) {
  useCustomMartialArtLibraryVersion();
  const availableMartialArts = getUnifiedMartialArtSummaries();
  const [customRound, setCustomRound] = useState('');
  const [customRest, setCustomRest] = useState('');
  return (
    <div className="chip-row" style={{ marginBottom: 12 }}>
      <div>
        <label className="field-label">종목</label>
        <br />
        <select className="select" value={rules.martialArt} onChange={(e) => setRules((r) => ({ ...r, martialArt: e.target.value }))} data-testid="sparring-art">
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
        <label className="field-label">{roundsLabel}</label>
        <br />
        <select className="select" value={rules.plannedRounds} onChange={(e) => setRules((r) => ({ ...r, plannedRounds: Number(e.target.value) }))} data-testid="sparring-rounds">
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
            if (e.target.value === 'custom') {
              setRules((r) => ({ ...r, roundDurationSeconds: Number(customRound) > 0 ? Number(customRound) : 90 }));
              return;
            }
            setRules((r) => ({ ...r, roundDurationSeconds: Number(e.target.value) }));
          }}
          data-testid="sparring-round-time"
        >
          {ROUND_SECONDS_PRESETS.map((sec) => (
            <option key={sec} value={sec}>
              {sec / 60}분
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
            value={customRound || String(rules.roundDurationSeconds)}
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
          value={rules.restDurationSeconds === 0 ? 0 : REST_SECONDS_PRESETS.includes(rules.restDurationSeconds) ? rules.restDurationSeconds : 'custom'}
          onChange={(e) => {
            if (e.target.value === 'custom') {
              setRules((r) => ({ ...r, restDurationSeconds: Number(customRest) > 0 ? Number(customRest) : 45 }));
              return;
            }
            setRules((r) => ({ ...r, restDurationSeconds: Number(e.target.value) }));
          }}
        >
          {REST_SECONDS_PRESETS.map((sec) => (
            <option key={sec} value={sec}>
              {sec < 60 ? `${sec}초` : `${sec / 60}분`}
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
            value={customRest || String(rules.restDurationSeconds)}
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
  );
}

function EquipmentPartnerFields({ rules, setRules }: { rules: SparringRules; setRules: (fn: (r: SparringRules) => SparringRules) => void }) {
  function toggleEquipment(item: SparringEquipment) {
    setRules((r) => ({ ...r, equipment: r.equipment.includes(item) ? r.equipment.filter((e) => e !== item) : [...r.equipment, item] }));
  }
  return (
    <>
      <label className="field-label">보호장비</label>
      <div className="chip-row" style={{ marginTop: 4, marginBottom: 12 }}>
        {EQUIPMENT_OPTIONS.map((item) => (
          <button key={item} type="button" className={`chip${rules.equipment.includes(item) ? ' active' : ''}`} onClick={() => toggleEquipment(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="field-block" style={{ marginBottom: 12 }}>
        <label className="field-label">파트너 이름 (선택)</label>
        <input className="select" value={rules.partnerName ?? ''} onChange={(e) => setRules((r) => ({ ...r, partnerName: e.target.value.trim() ? e.target.value : null }))} data-testid="sparring-partner" />
      </div>
    </>
  );
}

function TechniqueRuleFields({ rules, setRules }: { rules: SparringRules; setRules: (fn: (r: SparringRules) => SparringRules) => void }) {
  return (
    <>
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
    </>
  );
}

function plannedText(rules: SparringRules): string {
  const round = rules.roundDurationSeconds % 60 === 0 ? `${rules.roundDurationSeconds / 60}분` : `${rules.roundDurationSeconds}초`;
  const rest = rules.restDurationSeconds > 0 ? ` · 휴식 ${rules.restDurationSeconds < 60 ? `${rules.restDurationSeconds}초` : `${rules.restDurationSeconds / 60}분`}` : '';
  return `${rules.plannedRounds} × ${round}${rest}`;
}

function SparringModeTabs({ mode, onChange }: { mode: 'log' | 'timer'; onChange: (m: 'log' | 'timer') => void }) {
  return (
    <div className="chip-row" style={{ marginBottom: 12 }} role="tablist">
      <button type="button" role="tab" aria-selected={mode === 'log'} className={`chip${mode === 'log' ? ' active' : ''}`} onClick={() => onChange('log')} data-testid="sparring-mode-log">
        📝 한 스파링 기록하기
      </button>
      <button type="button" role="tab" aria-selected={mode === 'timer'} className={`chip${mode === 'timer' ? ' active' : ''}`} onClick={() => onChange('timer')} data-testid="sparring-mode-timer">
        ⏱ 타이머로 진행하기
      </button>
    </div>
  );
}

function RecentSparringList() {
  const records = listSparringSessions().slice(0, 5);
  const history = listTrainingHistory();
  if (records.length === 0) return null;
  return (
    <div className="card info-card" style={{ marginTop: 12 }} data-testid="sparring-recent">
      <h3 style={{ marginTop: 0 }}>최근 스파링 기록</h3>
      <div className="stack gap-2">
        {records.map((r) => {
          const entry = history.find((e) => e.sparringSessionId === r.id);
          const art = getUnifiedMartialArtSummaries().find((a) => a.id === r.martialArt)?.nameKo ?? r.martialArt;
          const line = `${r.date} · ${art} · ${r.actualRounds}라운드 · ${formatMMSS(r.actualDurationSeconds * 1000)}${r.partnerName ? ` · ${r.partnerName}` : ''}`;
          return (
            <div key={r.id} className="technique-row__sub" data-testid="sparring-recent-row">
              {entry ? <Link to={`/training-analytics/${entry.id}`}>{line}</Link> : line}
              {r.entryMode !== 'manual' ? ' (타이머)' : ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Main use: a sparring that already happened, recorded afterwards. */
function SparringLogForm({ onSaved }: { onSaved: (recordId: string) => void }) {
  const [rules, setRulesState] = useState<SparringRules>(defaultRules);
  const setRules = (fn: (r: SparringRules) => SparringRules) => setRulesState(fn);
  const [date, setDate] = useState(todayDateKey());
  const [roundsDone, setRoundsDone] = useState<number | null>(null);
  const [minutes, setMinutes] = useState<string | null>(null);
  const [seconds, setSeconds] = useState<string | null>(null);
  const [usedTechniqueIds, setUsedTechniqueIds] = useState<string[]>([]);
  const [wentWell, setWentWell] = useState('');
  const [toImprove, setToImprove] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const hasLastRules = useMemo(() => loadLastSparringRules() !== null, []);

  // Until the user types their own, the done rounds / time follow the rules.
  const actualRounds = roundsDone ?? rules.plannedRounds;
  const autoSeconds = actualRounds * rules.roundDurationSeconds;
  const minutesValue = minutes ?? String(Math.floor(autoSeconds / 60));
  const secondsValue = seconds ?? String(autoSeconds % 60);
  const timeEdited = minutes !== null || seconds !== null;

  function handleSave() {
    if (saving) return;
    const input = {
      rules: { ...rules, partnerName: rules.partnerName?.trim() || null, notes: rules.notes?.trim() || null },
      date,
      actualRounds,
      actualDurationSeconds: Number(minutesValue || 0) * 60 + Number(secondsValue || 0),
      usedTechniqueIds,
      wentWell,
      toImprove,
    };
    const problem = validatePastSparring(input);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    const record = recordPastSparringSession(input);
    onSaved(record.id);
  }

  return (
    <div className="card info-card" data-testid="sparring-log-form">
      <p className="video-status-message" style={{ marginTop: 0 }}>
        이미 한 스파링을 기록합니다. 저장하면 훈련 기록과 영양(소모 칼로리) 집계에 그 날짜로 반영됩니다.
      </p>
      <div className="field-block" style={{ marginBottom: 12, maxWidth: 220 }}>
        <label className="field-label" htmlFor="sparring-date">
          스파링한 날짜
        </label>
        <input id="sparring-date" className="select" type="date" max={todayDateKey()} value={date} onChange={(e) => setDate(e.target.value)} data-testid="sparring-date" />
      </div>

      <RuleFields rules={rules} setRules={setRules} roundsLabel="정한 라운드" />

      <div className="chip-row" style={{ marginBottom: 12, alignItems: 'flex-end' }}>
        <div>
          <label className="field-label">실제로 한 라운드</label>
          <br />
          <input
            className="select"
            style={{ width: 90 }}
            type="number"
            min={1}
            max={50}
            value={actualRounds}
            onChange={(e) => setRoundsDone(Math.max(0, Math.round(Number(e.target.value) || 0)))}
            data-testid="sparring-actual-rounds"
          />
        </div>
        <div>
          <label className="field-label">실제 스파링 시간 (휴식 제외)</label>
          <br />
          <span className="chip-row" style={{ gap: 4 }}>
            <input className="select" style={{ width: 70 }} type="number" min={0} value={minutesValue} onChange={(e) => setMinutes(e.target.value)} data-testid="sparring-minutes" />
            <span>분</span>
            <input className="select" style={{ width: 70 }} type="number" min={0} max={59} value={secondsValue} onChange={(e) => setSeconds(e.target.value)} data-testid="sparring-seconds" />
            <span>초</span>
          </span>
        </div>
      </div>
      {!timeEdited && (
        <p className="video-status-message" style={{ marginTop: -6 }}>
          시간은 라운드 수 × 라운드 시간으로 채워 두었습니다. 실제와 다르면 고쳐 주세요.
        </p>
      )}

      <div style={{ marginBottom: 12 }}>
        <TechniqueChipPicker
          martialArt={rules.martialArt}
          ids={usedTechniqueIds}
          onAdd={(id) => setUsedTechniqueIds((ids) => [...new Set([...ids, id])])}
          onRemove={(id) => setUsedTechniqueIds((ids) => ids.filter((x) => x !== id))}
          label="사용한 기술 (선택)"
          testId="sparring-used-techniques"
        />
      </div>
      <div className="field-block" style={{ marginBottom: 12 }}>
        <label className="field-label" htmlFor="sparring-went-well">
          잘된 점 (선택)
        </label>
        <AutoGrowTextarea id="sparring-went-well" className="select" minRows={2} value={wentWell} onChange={(e) => setWentWell(e.target.value)} data-testid="sparring-went-well" />
      </div>
      <div className="field-block" style={{ marginBottom: 12 }}>
        <label className="field-label" htmlFor="sparring-to-improve">
          보완할 점 (선택)
        </label>
        <AutoGrowTextarea id="sparring-to-improve" className="select" minRows={2} value={toImprove} onChange={(e) => setToImprove(e.target.value)} data-testid="sparring-to-improve" />
      </div>

      <EquipmentPartnerFields rules={rules} setRules={setRules} />
      <div className="field-block" style={{ marginBottom: 12 }}>
        <label className="field-label" htmlFor="sparring-notes">
          메모 (선택)
        </label>
        <AutoGrowTextarea id="sparring-notes" className="select" minRows={2} value={rules.notes ?? ''} onChange={(e) => setRules((r) => ({ ...r, notes: e.target.value || null }))} />
      </div>
      <details style={{ marginBottom: 12 }}>
        <summary style={{ cursor: 'pointer' }}>허용·금지 기술 룰 (선택)</summary>
        <div style={{ marginTop: 8 }}>
          <TechniqueRuleFields rules={rules} setRules={setRules} />
        </div>
      </details>

      {error && (
        <p className="video-status-message" role="alert" data-testid="sparring-log-error">
          {error}
        </p>
      )}
      <div className="modal-actions modal-actions--start">
        {hasLastRules && (
          <button
            className="btn btn-secondary"
            onClick={() => {
              const last = loadLastSparringRules();
              if (last) {
                setRulesState(last);
                setRoundsDone(null);
                setMinutes(null);
                setSeconds(null);
              }
            }}
          >
            지난 룰 불러오기
          </button>
        )}
        <button className="btn btn-primary" onClick={handleSave} disabled={saving} data-testid="sparring-log-save">
          기록 저장
        </button>
      </div>
    </div>
  );
}

function SparringTimerSetup({ onStart }: { onStart: (rules: SparringRules) => void }) {
  const [rules, setRulesState] = useState<SparringRules>(defaultRules);
  const setRules = (fn: (r: SparringRules) => SparringRules) => setRulesState(fn);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasLastRules = useMemo(() => loadLastSparringRules() !== null, []);

  function handleStart() {
    if (rules.plannedRounds <= 0 || rules.roundDurationSeconds <= 0) {
      setErrorMessage('라운드 수와 라운드 시간을 확인해 주세요.');
      return;
    }
    setErrorMessage(null);
    onStart({ ...rules, partnerName: rules.partnerName?.trim() || null, notes: rules.notes?.trim() || null });
  }

  return (
    <div className="card info-card">
      <p className="video-status-message" style={{ marginTop: 0 }}>
        지금 스파링을 하면서 라운드·휴식 타이머를 사용합니다. 끝나면 실제 시간이 자동으로 기록됩니다.
      </p>
      <RuleFields rules={rules} setRules={setRules} roundsLabel="라운드" />
      <EquipmentPartnerFields rules={rules} setRules={setRules} />
      <TechniqueRuleFields rules={rules} setRules={setRules} />
      <div className="field-block" style={{ marginBottom: 12 }}>
        <label className="field-label" htmlFor="sparring-timer-notes">
          메모 (선택)
        </label>
        <AutoGrowTextarea id="sparring-timer-notes" className="select" minRows={2} value={rules.notes ?? ''} onChange={(e) => setRules((r) => ({ ...r, notes: e.target.value || null }))} />
      </div>

      <p className="video-status-message">예정: {plannedText(rules)}</p>
      {errorMessage && <p className="video-status-message">{errorMessage}</p>}

      <div className="modal-actions modal-actions--start">
        {hasLastRules && (
          <button
            className="btn btn-secondary"
            onClick={() => {
              const last = loadLastSparringRules();
              if (last) setRulesState(last);
            }}
          >
            지난 룰 불러오기
          </button>
        )}
        <button className="btn btn-primary" onClick={handleStart}>
          스파링 시작
        </button>
      </div>
    </div>
  );
}

function SparringSetup({ onStart, onSaved }: { onStart: (rules: SparringRules) => void; onSaved: (recordId: string) => void }) {
  const [params, setParams] = useSearchParams();
  const mode: 'log' | 'timer' = params.get('mode') === 'timer' ? 'timer' : 'log';
  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/free-training">자유훈련</Link>
          <span>/</span>
          <span>스파링 기록</span>
        </div>
        <div className="section-title">
          <h2>🤼 스파링 기록</h2>
        </div>
        <SparringModeTabs mode={mode} onChange={(m) => setParams(m === 'timer' ? { mode: 'timer' } : {}, { replace: true })} />
        {mode === 'log' ? <SparringLogForm onSaved={onSaved} /> : <SparringTimerSetup onStart={onStart} />}
        <RecentSparringList />
      </div>
    </div>
  );
}

function SparringSavedScreen({ recordId, onDone, onAnother }: { recordId: string; onDone: () => void; onAnother?: () => void }) {
  const entry = listTrainingHistory().find((e) => e.sparringSessionId === recordId);
  const record = getSparringSession(recordId);
  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="section-title">
          <h2>✅ 스파링 기록 저장 완료</h2>
        </div>
        {record && (
          <p className="video-status-message" data-testid="sparring-saved-summary">
            {record.date} · {record.actualRounds}라운드 · {formatMMSS(record.actualDurationSeconds * 1000)} — 훈련 기록과 영양 집계에 반영되었습니다.
          </p>
        )}
        <div className="modal-actions modal-actions--start">
          {entry && (
            <Link to={`/training-analytics/${entry.id}`} className="btn btn-secondary" data-testid="sparring-saved-detail">
              기록 상세 보기
            </Link>
          )}
          {onAnother && (
            <button className="btn btn-secondary" onClick={onAnother} data-testid="sparring-log-another">
              다른 스파링 기록하기
            </button>
          )}
          <button className="btn btn-primary" onClick={onDone}>
            자유훈련으로
          </button>
        </div>
        {/* The round/timer log has no video, so it can't be analysed for
            strengths/weaknesses without inventing them — point to the video
            analysis, which works from measured data. */}
        <p className="technique-row__sub" style={{ marginTop: 12 }}>
          잘한 점·개선할 점 AI 분석은 스파링 영상이 있어야 합니다. <Link to="/sparring">🎥 스파링 영상 AI 분석하기 →</Link>
        </p>
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
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null);

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
    if (savedRecordId) {
      return <SparringSavedScreen recordId={savedRecordId} onDone={() => navigate('/free-training')} onAnother={() => setSavedRecordId(null)} />;
    }
    return <SparringSetup onStart={(rules) => startSparringRun(rules)} onSaved={setSavedRecordId} />;
  }

  if (run.phase === 'finished') {
    if (savedRecordId) {
      return (
        <SparringSavedScreen
          recordId={savedRecordId}
          onDone={() => {
            clearSparringRun();
            navigate('/free-training');
          }}
        />
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
          setSavedRecordId(record.id);
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
