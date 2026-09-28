import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { hasLocalDataToBackup, backupLocalDataToCloud, restoreLocalDataFromCloud, getCloudBackupInfo } from '../../lib/cloudSync/dataBackup';
import { pushCurriculaToCloud, syncCurriculaBidirectional } from '../../lib/cloudSync/curriculumSync';
import { syncUserTechniquesBidirectional } from '../../lib/cloudSync/userTechniqueSync';
import { syncCombosBidirectional } from '../../lib/cloudSync/comboSync';
import { syncTacticsBidirectional } from '../../lib/cloudSync/tacticSync';
import { syncTrainingHistoryBidirectional } from '../../lib/cloudSync/trainingHistorySync';
import { syncSparringSessionsBidirectional } from '../../lib/cloudSync/sparringSessionSync';
import { syncGroundBattleMatchesBidirectional } from '../../lib/cloudSync/groundBattleSync';
import { syncGymRoutinesBidirectional } from '../../lib/cloudSync/gymRoutineSync';
import { syncNutritionMealsBidirectional, syncNutritionProfileBidirectional } from '../../lib/cloudSync/nutritionSync';
import { syncAddTeqFromCloud } from '../../lib/cloudSync/addTeqSync';
import { syncCustomMartialArtsFromCloud } from '../../lib/cloudSync/customMartialArtSync';
import { syncTechniqueVideoPicksBidirectional } from '../../lib/cloudSync/techniqueVideoPickSync';
import { syncPurchasedCurricula } from '../../lib/marketplace/purchaseSync';

function promptSeenKey(userId: string): string {
  return `mdx:backup-prompt-seen:${userId}`;
}

type Mode = 'push-offer' | 'restore-or-push-choice';

// Runs once per login per account (see promptSeenKey). Curricula/progress,
// combos, tactics, training history, gym routines, and nutrition (meals +
// goal profile) always sync automatically and silently — each of those
// merges is provably safe per-item (newest updatedAt wins), so none of them
// ever need a prompt or a user decision. The coarser martialdex:*
// backup blob (skill mastery, sparring, achievements, streak, myStyle,
// review — see dataBackup.ts) has no per-key timestamps to merge by, so
// this component only ever acts on it automatically when that's provably
// safe (nothing local to lose), and asks when it isn't:
//   - no local data, cloud backup exists  -> restore automatically, silently
//   - no local data, no cloud backup      -> nothing to do
//   - local data exists, no cloud backup  -> offer to push (original spec
//     item 10 flow, unchanged)
//   - local data exists AND cloud backup  -> can't safely guess which one
//     the user wants; ask instead of picking a side and risking their data
export default function LocalDataMigrationPrompt() {
  const { isConfigured, user } = useAuth();
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured || !user) {
      setMode(null);
      return;
    }
    let active = true;
    const userId = user.id;

    // Always-safe automatic sync — independent of the prompt below.
    void syncCurriculaBidirectional(userId);
    void syncUserTechniquesBidirectional(userId);
    void syncCombosBidirectional(userId);
    void syncTacticsBidirectional(userId);
    void syncTrainingHistoryBidirectional(userId);
    void syncSparringSessionsBidirectional(userId);
    void syncGroundBattleMatchesBidirectional(userId);
    void syncGymRoutinesBidirectional(userId);
    void syncNutritionMealsBidirectional(userId);
    void syncNutritionProfileBidirectional(userId);
    void syncPurchasedCurricula(userId);
    void syncAddTeqFromCloud();
    void syncCustomMartialArtsFromCloud();
    void syncTechniqueVideoPicksBidirectional(userId);

    if (window.localStorage.getItem(promptSeenKey(userId))) return;
    const localHasData = hasLocalDataToBackup();

    void getCloudBackupInfo(userId).then((result) => {
      if (!active) return;
      const cloudHasData = result.ok && !!result.data;

      if (!localHasData && cloudHasData) {
        // Nothing on this device to lose — just restore it, the same way a
        // fresh install of any cloud-synced app would.
        void restoreLocalDataFromCloud(userId).then((r) => {
          if (!active) return;
          window.localStorage.setItem(promptSeenKey(userId), '1');
          if (r.ok) window.location.reload();
        });
        return;
      }
      if (!localHasData && !cloudHasData) return; // genuinely nothing to do
      setMode(localHasData && cloudHasData ? 'restore-or-push-choice' : 'push-offer');
    });

    return () => {
      active = false;
    };
  }, [isConfigured, user]);

  // The sync above only runs on login (isConfigured/user change) — recording
  // a workout while ALREADY logged in never pushed to Supabase until the
  // NEXT login, for every trainingHistory source (curriculum/오늘의 훈련/자유
  // 훈련/gym routines alike, not just gym). Confirmed live against the real
  // Supabase project (a diagnostic check found 0 rows immediately after
  // finishing a free-training session while logged in). Fixed generically
  // here — listening for the SAME CustomEvents every local write already
  // dispatches (trainingHistoryRepository.add()/gymRoutineRepository's
  // writeAll(), see their own files) — rather than adding a sync call at
  // each of the 7+ places that call recordTrainingSession()/gym routine
  // mutations, which would scatter the same policy across many files.
  // Debounced so several rapid local writes (e.g. finishing a session right
  // after activating a routine) only trigger one push. mergeFromCloud() (the
  // PULL side of the sync above) also dispatches this same event when it
  // pulls fresh rows, so right after login this can fire one extra, harmless
  // no-op sync (nothing new left to push) — acceptable, still far better
  // than silently losing local-only data until the next login.
  useEffect(() => {
    if (!isConfigured || !user) return;
    const userId = user.id;
    let historyTimer: number | undefined;
    let routineTimer: number | undefined;
    let nutritionMealsTimer: number | undefined;
    let nutritionProfileTimer: number | undefined;
    let curriculaTimer: number | undefined;
    let comboTimer: number | undefined;
    let tacticTimer: number | undefined;
    let userTechniqueTimer: number | undefined;
    let videoPickTimer: number | undefined;
    const onHistoryUpdate = () => {
      window.clearTimeout(historyTimer);
      historyTimer = window.setTimeout(() => void syncTrainingHistoryBidirectional(userId), 800);
    };
    // Previously curricula only synced once at login (see the useEffect
    // above) — a curriculum deleted mid-session had no way to push that
    // deletion to Supabase until the NEXT login, and in the meantime the
    // stale cloud row was exactly what the tombstone fix in
    // curriculumRepository/curriculumSync.ts guards against once sync does
    // run. Same debounced pattern as every other store here closes that gap
    // so a delete (or create/edit) propagates within ~800ms, matching how
    // trainingHistory/gymRoutine/nutrition already behave.
    const onCurriculaUpdate = () => {
      window.clearTimeout(curriculaTimer);
      curriculaTimer = window.setTimeout(() => void syncCurriculaBidirectional(userId), 800);
    };
    const onRoutineUpdate = () => {
      window.clearTimeout(routineTimer);
      routineTimer = window.setTimeout(() => void syncGymRoutinesBidirectional(userId), 800);
    };
    const onNutritionMealsUpdate = () => {
      window.clearTimeout(nutritionMealsTimer);
      nutritionMealsTimer = window.setTimeout(() => void syncNutritionMealsBidirectional(userId), 800);
    };
    const onNutritionProfileUpdate = () => {
      window.clearTimeout(nutritionProfileTimer);
      nutritionProfileTimer = window.setTimeout(() => void syncNutritionProfileBidirectional(userId), 800);
    };
    // Combos/tactics/user-techniques had the exact same gap curricula did
    // (found during an account-data-isolation audit) — their repositories
    // already dispatch their own CustomEvent on every write
    // (combo/repository.ts, tactic/repository.ts, userTechniques/repository.ts)
    // but nothing here was listening, so a combo/tactic/user-technique
    // created or edited mid-session only ever reached Supabase on the NEXT
    // login. Same debounced pattern as everything else in this effect.
    const onComboUpdate = () => {
      window.clearTimeout(comboTimer);
      comboTimer = window.setTimeout(() => void syncCombosBidirectional(userId), 800);
    };
    const onTacticUpdate = () => {
      window.clearTimeout(tacticTimer);
      tacticTimer = window.setTimeout(() => void syncTacticsBidirectional(userId), 800);
    };
    const onUserTechniqueUpdate = () => {
      window.clearTimeout(userTechniqueTimer);
      userTechniqueTimer = window.setTimeout(() => void syncUserTechniquesBidirectional(userId), 800);
    };
    const onVideoPickUpdate = () => {
      window.clearTimeout(videoPickTimer);
      videoPickTimer = window.setTimeout(() => void syncTechniqueVideoPicksBidirectional(userId), 800);
    };
    window.addEventListener('martialdex:training-history-updated', onHistoryUpdate);
    window.addEventListener('martialdex:gym-routines-updated', onRoutineUpdate);
    window.addEventListener('martialdex:nutrition-meals-updated', onNutritionMealsUpdate);
    window.addEventListener('martialdex:nutrition-profile-updated', onNutritionProfileUpdate);
    window.addEventListener('martialdex:curricula-updated', onCurriculaUpdate);
    window.addEventListener('martialdex:combos-updated', onComboUpdate);
    window.addEventListener('martialdex:tactics-updated', onTacticUpdate);
    window.addEventListener('martialdex:user-techniques-updated', onUserTechniqueUpdate);
    window.addEventListener('martialdex:technique-video-picks-updated', onVideoPickUpdate);
    return () => {
      window.removeEventListener('martialdex:training-history-updated', onHistoryUpdate);
      window.removeEventListener('martialdex:gym-routines-updated', onRoutineUpdate);
      window.removeEventListener('martialdex:nutrition-meals-updated', onNutritionMealsUpdate);
      window.removeEventListener('martialdex:nutrition-profile-updated', onNutritionProfileUpdate);
      window.removeEventListener('martialdex:curricula-updated', onCurriculaUpdate);
      window.removeEventListener('martialdex:combos-updated', onComboUpdate);
      window.removeEventListener('martialdex:tactics-updated', onTacticUpdate);
      window.removeEventListener('martialdex:user-techniques-updated', onUserTechniqueUpdate);
      window.removeEventListener('martialdex:technique-video-picks-updated', onVideoPickUpdate);
      window.clearTimeout(historyTimer);
      window.clearTimeout(routineTimer);
      window.clearTimeout(nutritionMealsTimer);
      window.clearTimeout(nutritionProfileTimer);
      window.clearTimeout(curriculaTimer);
      window.clearTimeout(comboTimer);
      window.clearTimeout(tacticTimer);
      window.clearTimeout(userTechniqueTimer);
      window.clearTimeout(videoPickTimer);
    };
  }, [isConfigured, user]);

  if (!mode || !user) return null;

  function dismiss() {
    window.localStorage.setItem(promptSeenKey(user!.id), '1');
    setMode(null);
  }

  async function handlePush() {
    setBusy(true);
    setMessage(null);
    const curriculumResult = await pushCurriculaToCloud(user!.id);
    const backupResult = await backupLocalDataToCloud(user!.id);
    setBusy(false);
    if (!curriculumResult.ok || !backupResult.ok) {
      setMessage((!curriculumResult.ok ? curriculumResult.message : backupResult.ok ? '' : backupResult.message) || '저장 중 문제가 발생했습니다.');
      return;
    }
    window.localStorage.setItem(promptSeenKey(user!.id), '1');
    setMessage('기존 데이터를 계정에 저장했습니다.');
    setTimeout(() => setMode(null), 1500);
  }

  async function handleRestore() {
    setBusy(true);
    setMessage(null);
    const result = await restoreLocalDataFromCloud(user!.id);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    window.localStorage.setItem(promptSeenKey(user!.id), '1');
    window.location.reload();
  }

  return (
    <div className="modal-overlay">
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        {mode === 'push-offer' ? (
          <>
            <h3>기존 데이터를 계정에 저장할까요?</h3>
            <p>이 기기에 저장된 학습 기록, 커리큘럼, 스파링 기록 등을 방금 로그인한 계정에 백업하면 다른 기기에서도 이어서 사용할 수 있습니다.</p>
          </>
        ) : (
          <>
            <h3>이 계정에 저장된 클라우드 데이터가 있습니다</h3>
            <p>이 기기에도 이미 데이터가 있어, 둘 중 어느 쪽을 사용할지 선택이 필요합니다. 하나를 선택하면 반대쪽 데이터는 이 기기에서 대체됩니다.</p>
          </>
        )}
        {message && <p className="video-status-message">{message}</p>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={dismiss} disabled={busy}>
            나중에
          </button>
          {mode === 'restore-or-push-choice' && (
            <button className="btn btn-secondary" onClick={handleRestore} disabled={busy}>
              {busy ? '처리 중…' : '클라우드 데이터 불러오기'}
            </button>
          )}
          <button className="btn btn-primary" onClick={handlePush} disabled={busy}>
            {busy ? '저장 중…' : mode === 'push-offer' ? '저장하기' : '이 기기 데이터를 클라우드에 저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
