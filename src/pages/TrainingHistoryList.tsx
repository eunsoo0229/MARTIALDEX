import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deleteTrainingHistoryEntry } from '../lib/trainingHistory/service';
import { useTrainingHistory } from '../lib/trainingHistory/useTrainingHistory';
import { PERIOD_LABEL, type PeriodKey } from '../lib/statsHub/types';
import { isWithinPeriod } from '../lib/statsHub/periodUtils';
import { getMartialArt, martialArtSummaries } from '../lib/loadData';
import { HOME_TRAINING_MARTIAL_ART_ID } from '../lib/homeTraining/library';
import { GYM_MARTIAL_ART_ID } from '../lib/gymTraining/library';
import { filterHistory, groupHistoryByDate } from '../lib/trainingAnalytics/historyView';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';
import TrainingEntryRow from '../components/TrainingEntryRow';

const PERIOD_ORDER: PeriodKey[] = ['7d', '30d', '90d', 'all'];

export default function TrainingHistoryList() {
  // The stable array itself (only changes when history actually changes,
  // via useTrainingHistory's setState-on-event pattern) MUST be a memo
  // dependency — a delete/edit re-renders this component (the hook forces
  // that), but the previous version discarded the hook's return value
  // entirely and keyed its useMemo only on [period, martialArt, query], so
  // a deleted entry never actually disappeared from this screen until one
  // of those filters was also touched.
  const allEntries = useTrainingHistory();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [martialArt, setMartialArt] = useState('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const all = allEntries.filter((e) => isWithinPeriod(e.completedAt, period));
    return filterHistory(all, { martialArt, query });
  }, [allEntries, period, martialArt, query]);

  const groups = useMemo(() => groupHistoryByDate(filtered), [filtered]);

  return (
    <div className="page">
      <div className="container">
        <BackButton fallback="/training-analytics" />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/training-analytics">훈련 분석</Link>
          <span>/</span>
          <span>전체 훈련 기록</span>
        </div>

        <div className="section-title">
          <h2>📜 전체 훈련 기록</h2>
        </div>

        <div className="chip-row">
          {PERIOD_ORDER.map((p) => (
            <button key={p} className={`chip ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>

        <div className="chip-row" style={{ marginTop: 6 }}>
          <select className="select" value={martialArt} onChange={(e) => setMartialArt(e.target.value)}>
            <option value="all">전체 무술</option>
            {martialArtSummaries.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nameKo}
              </option>
            ))}
            <option value={HOME_TRAINING_MARTIAL_ART_ID}>{getMartialArt(HOME_TRAINING_MARTIAL_ART_ID)?.nameKo ?? '홈트'}</option>
            <option value={GYM_MARTIAL_ART_ID}>{getMartialArt(GYM_MARTIAL_ART_ID)?.nameKo ?? '웨이트'}</option>
          </select>
          <input
            className="select"
            type="text"
            placeholder="기술명 또는 커리큘럼명 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, minWidth: 180 }}
          />
        </div>

        {groups.length === 0 ? (
          <EmptyState icon="📜" text="조건에 맞는 훈련 기록이 없습니다." />
        ) : (
          groups.map((group) => (
            <div key={group.dateKey} className="card info-card">
              <div className="chip-row" style={{ alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>{group.label}</h3>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => {
                    if (window.confirm(`${group.label}의 훈련 기록 ${group.entries.length}개를 모두 삭제할까요? 되돌릴 수 없습니다.`)) {
                      for (const entry of group.entries) deleteTrainingHistoryEntry(entry.id);
                    }
                  }}
                >
                  이 날짜 전체 삭제
                </button>
              </div>
              <div className="stack gap-2">
                {group.entries.map((entry) => (
                  <TrainingEntryRow
                    key={entry.id}
                    entry={entry}
                    onClick={() => navigate(`/training-analytics/${entry.id}`)}
                    onDelete={() => {
                      if (window.confirm('이 훈련 기록을 삭제할까요? 되돌릴 수 없습니다.')) deleteTrainingHistoryEntry(entry.id);
                    }}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
