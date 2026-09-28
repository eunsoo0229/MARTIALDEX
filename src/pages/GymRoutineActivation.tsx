import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GymRoutine, Weekday } from '../lib/gymRoutine/types';
import { deactivateGymRoutine, listMyGymRoutines, setActiveGymRoutine } from '../lib/gymRoutine/service';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

const WEEKDAY_LABEL: Record<Weekday, string> = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 7: '일' };

function summarizeRoutine(r: GymRoutine): string {
  const activeDays = r.days.filter((d) => d.exercises.length > 0);
  if (activeDays.length === 0) return '구성된 요일 없음';
  const weekdayLabel = activeDays
    .map((d) => d.weekday)
    .sort((a, b) => a - b)
    .map((w) => WEEKDAY_LABEL[w])
    .join('/');
  const exerciseCount = new Set(activeDays.flatMap((d) => d.exercises.map((e) => e.techniqueId))).size;
  return `${weekdayLabel} · ${exerciseCount}개 운동`;
}

/**
 * "훈련 루틴 관리" — a dedicated, lightweight list+toggle screen, separate
 * from GymRoutineManager.tsx's deep per-weekday exercise editor (which
 * requires expanding a routine to see/change anything). This screen exists
 * purely so a user with several routines can see all of them and flip which
 * one feeds 오늘의 훈련 in one tap, without drilling into any of them.
 *
 * Reuses gymRoutine/service.ts entirely — no new active-state system.
 * GymRoutine.active is the SAME field todayResolver.ts's
 * getTodayGymRoutineDay() already reads (via getActiveGymRoutine()), so a
 * toggle here takes effect in 오늘의 훈련 with zero additional wiring, and
 * gymRoutineSync.ts already syncs `active` to Supabase like any other field
 * change (via each save()'s updatedAt bump + the existing debounced
 * gym-routines-updated listener in LocalDataMigrationPrompt.tsx).
 *
 * "Exactly one routine active at a time" is an existing, intentional
 * invariant (see GymRoutine.active's doc comment and setActiveGymRoutine) —
 * NOT a new restriction introduced here. Rendering independent toggles that
 * could all be ON simultaneously would recreate exactly the bug this
 * feature was asked to prevent ("여러 루틴을 활성화했을 때 잘못된 루틴의
 * 운동이 섞이는 문제"): 오늘의 훈련 only ever merges ONE gym routine's
 * today-weekday exercises, so a second "active" routine would just be
 * silently ignored while looking active in the UI. Activating one routine
 * here therefore visibly flips every other routine's switch off, and a note
 * at the top says so explicitly instead of leaving it as a surprise.
 */
export default function GymRoutineActivation() {
  const [routines, setRoutines] = useState<GymRoutine[]>(() => listMyGymRoutines());

  useEffect(() => {
    const onUpdate = () => setRoutines(listMyGymRoutines());
    window.addEventListener('martialdex:gym-routines-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener('martialdex:gym-routines-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, []);

  const activeCount = routines.filter((r) => r.active).length;

  function handleToggle(routine: GymRoutine) {
    if (routine.active) deactivateGymRoutine(routine.id);
    else setActiveGymRoutine(routine.id);
  }

  return (
    <div className="page">
      <div className="container container--narrow">
        <BackButton fallback="/training/routines" />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/training">훈련</Link>
          <span>/</span>
          <Link to="/training/routines">요일별 루틴</Link>
          <span>/</span>
          <span>루틴 관리</span>
        </div>
        <div className="section-title">
          <h2>🔀 훈련 루틴 관리</h2>
        </div>
        <p className="video-status-message">
          활성 루틴 {activeCount}개 · 한 번에 하나의 루틴만 활성화할 수 있습니다 — 다른 루틴을 켜면 이전 루틴은 자동으로 꺼지고, 오늘의 훈련에는
          현재 활성 루틴의 내용만 반영됩니다.
        </p>

        {routines.length === 0 ? (
          <EmptyState icon="🔀" text="아직 만든 루틴이 없습니다." />
        ) : (
          <div className="stack gap-2">
            {routines.map((r) => (
              <div key={r.id} className="card info-card routine-toggle-row">
                <div className="routine-toggle-row__info">
                  <div className="routine-toggle-row__name">🏋️ {r.name}</div>
                  <div className="technique-row__sub">{summarizeRoutine(r)}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={r.active}
                  aria-label={`${r.name} ${r.active ? '비활성화' : '활성화'}`}
                  className={`routine-toggle${r.active ? ' routine-toggle--on' : ''}`}
                  onClick={() => handleToggle(r)}
                >
                  {r.active ? '활성 ●' : '비활성 ○'}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions modal-actions--start" style={{ marginTop: 16 }}>
          <Link to="/training/routines" className="btn btn-secondary">
            루틴 편집/생성하기
          </Link>
        </div>
      </div>
    </div>
  );
}
