import { supabase } from '../supabase/client';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';
import { getProgress, listMyCurricula } from '../curriculum/curriculumService';
import { curriculumRepository } from '../curriculum/repository';
import type { Curriculum, CurriculumProgress } from '../curriculum/types';
import { isStillCurrentUser } from './syncGuard';

const NOT_CONFIGURED_MESSAGE = 'Supabase 설정이 필요합니다.';
const NOT_LOGGED_IN_MESSAGE = '로그인이 필요합니다.';

// Every curriculum sync operation runs one-at-a-time through this chain.
// Without it, the debounced auto-sync (LocalDataMigrationPrompt.tsx) could
// overlap itself — a pull writes local data, which fires
// 'martialdex:curricula-updated', which schedules another sync — and an
// older run holding a cloud fetch taken BEFORE a delete could resume after
// a newer run had already flushed that delete and cleared its tombstone,
// see "cloud has it, local doesn't", and pull the deleted curriculum back.
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(run: () => Promise<T>): Promise<T> {
  const next = chain.then(run, run);
  chain = next.catch(() => undefined);
  return next;
}

/**
 * Deletes one curriculum's cloud rows and CONFIRMS they are gone. A
 * Supabase DELETE that RLS filters out (e.g. a stale session where
 * auth.uid() no longer matches) returns no error and simply deletes 0
 * rows — trusting the missing error alone used to clear the tombstone for
 * a row that still existed, so the next sync pulled it right back. Only a
 * follow-up SELECT, made while `userId` is verifiably the signed-in user,
 * proves the row is really gone. Progress rows go with it (they belong to
 * the curriculum); training history is a separate table and is never touched.
 */
async function deleteCloudRowsVerified(userId: string, id: string): Promise<AuthResult<void>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  if (!(await isStillCurrentUser(userId))) return { ok: false, message: NOT_LOGGED_IN_MESSAGE };
  const { error: deleteError } = await supabase.from('curricula').delete().eq('id', id).eq('user_id', userId);
  if (deleteError) return { ok: false, message: toKoreanAuthMessage(deleteError) };
  const { error: progressError } = await supabase.from('curriculum_progress').delete().eq('curriculum_id', id).eq('user_id', userId);
  if (progressError) return { ok: false, message: toKoreanAuthMessage(progressError) };
  const { data: remaining, error: verifyError } = await supabase.from('curricula').select('id').eq('id', id).eq('user_id', userId);
  if (verifyError) return { ok: false, message: toKoreanAuthMessage(verifyError) };
  if ((remaining ?? []).length > 0) return { ok: false, message: '서버에서 커리큘럼이 삭제되지 않았습니다.' };
  return { ok: true, data: undefined };
}

/** Flushes queued local deletions; a tombstone is cleared only after deleteCloudRowsVerified confirms the row is gone. */
async function flushPendingDeletions(userId: string): Promise<void> {
  for (const id of curriculumRepository.listDeletedIds()) {
    const result = await deleteCloudRowsVerified(userId, id);
    if (result.ok) curriculumRepository.clearDeleted(id);
  }
}

/**
 * "커리큘럼 삭제" (curriculum/deleteCurriculum.ts) — server first, then
 * local, inside the same lock as every other sync: the Supabase rows are
 * deleted and confirmed gone, and only then is `deleteLocal` run. The local
 * copy (and so the UI) changes only after the server agreed, a failure
 * leaves everything exactly as it was, and no sync can run in between to
 * re-push the still-local copy or re-pull the cloud row.
 */
export function deleteCurriculumEverywhere(userId: string, id: string, deleteLocal: () => void): Promise<AuthResult<void>> {
  return exclusive(async () => {
    try {
      const result = await deleteCloudRowsVerified(userId, id);
      if (!result.ok) return result;
      deleteLocal();
      curriculumRepository.clearDeleted(id); // the cloud side is already confirmed gone
      return result;
    } catch (e) {
      return { ok: false, message: toKoreanAuthMessage(e) };
    }
  });
}

export function pushCurriculaToCloud(userId: string): Promise<AuthResult<{ curriculumCount: number; progressCount: number }>> {
  return exclusive(async () => {
    if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
    if (!userId) return { ok: false, message: NOT_LOGGED_IN_MESSAGE };

    try {
      // Same tombstone flush as syncCurriculaBidirectional below — without
      // this, a curriculum deleted locally but never yet auto-synced (e.g.
      // deleted while offline) would leave its stale cloud row in place, and
      // this manual "백업" push wouldn't remove it since it only upserts
      // CURRENT local curricula.
      await flushPendingDeletions(userId);

      const curricula = listMyCurricula();
      const now = new Date().toISOString();

      if (curricula.length > 0) {
        const rows = curricula.map((c) => ({
          id: c.id,
          user_id: userId,
          title: c.title,
          martial_art: c.martialArt,
          total_days: c.totalDays,
          data: c,
          updated_at: now,
        }));
        const { error } = await supabase.from('curricula').upsert(rows);
        if (error) return { ok: false, message: toKoreanAuthMessage(error) };
      }

      const progressRows = curricula
        .map((c) => getProgress(c.id))
        .filter((p): p is CurriculumProgress => !!p)
        .map((p) => ({ curriculum_id: p.curriculumId, user_id: userId, data: p, updated_at: now }));
      if (progressRows.length > 0) {
        const { error } = await supabase.from('curriculum_progress').upsert(progressRows);
        if (error) return { ok: false, message: toKoreanAuthMessage(error) };
      }

      return { ok: true, data: { curriculumCount: curricula.length, progressCount: progressRows.length } };
    } catch (e) {
      return { ok: false, message: toKoreanAuthMessage(e) };
    }
  });
}

// Pulls the user's cloud curricula/progress down and merges them into the
// local repository — an id already present locally is unconditionally
// overwritten with the cloud copy (this is the explicit, user-confirmed
// "restore from cloud" action on the Profile page — see
// src/pages/Profile.tsx's confirm() dialog before calling this). Saved via
// curriculumRepository.saveCustom directly (not saveCustomCurriculum, which
// stamps a fresh updatedAt) so the restored copy keeps the cloud row's real
// updatedAt — overwriting it here would make every pulled curriculum look
// "just edited on this device", breaking syncCurriculaBidirectional's
// timestamp comparison the next time it runs.
export function pullCurriculaFromCloud(userId: string): Promise<AuthResult<{ curriculumCount: number; progressCount: number }>> {
  return exclusive(async () => {
    if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
    if (!userId) return { ok: false, message: NOT_LOGGED_IN_MESSAGE };

    try {
      const { data: curriculaRows, error: curriculaError } = await supabase.from('curricula').select('data').eq('user_id', userId);
      if (curriculaError) return { ok: false, message: toKoreanAuthMessage(curriculaError) };
      // Account-switch race guard — see syncGuard.ts. This is an explicit,
      // user-confirmed "restore" action (Profile.tsx), but still async and
      // still writes into shared local storage, so still worth guarding.
      if (!(await isStillCurrentUser(userId))) return { ok: true, data: { curriculumCount: 0, progressCount: 0 } };
      // Never resurrect a curriculum still queued for cloud deletion (its
      // tombstone hasn't cleared yet — see syncCurriculaBidirectional's doc
      // comment on the same race) even on this explicit "restore from cloud"
      // action; a curriculum the user just deleted should never come back
      // just because its cloud row hasn't been cleaned up yet.
      const pendingDeleteIds = new Set(curriculumRepository.listDeletedIds());
      const restoredCurricula = (curriculaRows ?? []).map((row) => row.data as Curriculum).filter((c) => !pendingDeleteIds.has(c.id));
      curriculumRepository.saveManyCustom(restoredCurricula);

      const { data: progressRows, error: progressError } = await supabase.from('curriculum_progress').select('data').eq('user_id', userId);
      if (progressError) return { ok: false, message: toKoreanAuthMessage(progressError) };
      if (!(await isStillCurrentUser(userId))) return { ok: true, data: { curriculumCount: 0, progressCount: 0 } };
      curriculumRepository.saveManyProgress((progressRows ?? []).map((row) => row.data as CurriculumProgress));

      return { ok: true, data: { curriculumCount: curriculaRows?.length ?? 0, progressCount: progressRows?.length ?? 0 } };
    } catch (e) {
      return { ok: false, message: toKoreanAuthMessage(e) };
    }
  });
}

// Safe, automatic two-way sync run on every login (see
// CloudSyncOnLogin.tsx) — unlike pushCurriculaToCloud/pullCurriculaFromCloud
// above (explicit, user-confirmed, unconditional-overwrite actions on the
// Profile page), this NEVER overwrites a newer edit with an older one: per
// curriculum id, whichever side has the more recent `updatedAt` wins, and an
// id that exists on only one side is simply copied to the other. This is
// what makes "log into a second device" actually restore data automatically
// instead of requiring a trip to the Profile page's manual buttons.
export function syncCurriculaBidirectional(userId: string): Promise<AuthResult<{ pulled: number; pushed: number }>> {
  return exclusive(async () => {
    if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
    if (!userId) return { ok: false, message: NOT_LOGGED_IN_MESSAGE };

    try {
      // Flush pending local deletions BEFORE fetching cloudRows below — a
      // curriculum deleted locally (online or while offline) is queued as a
      // tombstone (curriculumRepository) since deleteCustomCurriculum() has no
      // network access. Deleting the Supabase rows here first, before the
      // fetch, means the pull loop below can never see the deleted id and
      // mistake "no local copy" for "cloud has something new" — which used to
      // resurrect a just-deleted curriculum within ~800ms (this sync runs on
      // the same debounced event deleteCustomCurriculum's local write fires).
      await flushPendingDeletions(userId);

      const { data: cloudRows, error: fetchError } = await supabase
        .from('curricula')
        .select('id, data, updated_at')
        .eq('user_id', userId);
      if (fetchError) return { ok: false, message: toKoreanAuthMessage(fetchError) };

      // Account-switch race guard — see syncGuard.ts.
      if (!(await isStillCurrentUser(userId))) return { ok: true, data: { pulled: 0, pushed: 0 } };

      // Defense-in-depth against the exact resurrection bug the flush loop
      // above exists to prevent: if that flush's delete call failed (network
      // error, offline, RLS hiccup) rather than throwing, `clearDeleted` never
      // ran and the id is STILL in listDeletedIds() here — the cloud row we
      // just fetched is then stale-but-undeleted, and without this check
      // `!local` (true, since the local hard-delete already happened) would
      // make the loop below "pull" it right back. Ordering the flush before
      // the fetch alone only closes the happy path; this closes the failure
      // path too.
      const pendingDeleteIds = new Set(curriculumRepository.listDeletedIds());
      const cloudById = new Map((cloudRows ?? []).map((r) => [r.id, r]));
      const localCurricula = listMyCurricula();
      const localById = new Map(localCurricula.map((c) => [c.id, c]));

      let pulled = 0;
      let pushed = 0;
      const toPush: Curriculum[] = [];
      const toPull: Curriculum[] = [];

      // Cloud has it, local doesn't (or cloud is strictly newer) -> pull.
      // Collected and written once via saveManyCustom() below rather than
      // once per row — see saveManyCustom()'s doc comment (this loop used to
      // do a full read+write of the whole custom-curricula array PER row).
      for (const row of cloudRows ?? []) {
        if (pendingDeleteIds.has(row.id as string)) continue;
        const local = localById.get(row.id);
        const cloudCurriculum = row.data as Curriculum;
        const cloudTime = new Date(row.updated_at as string).getTime();
        const localTime = local?.updatedAt ? new Date(local.updatedAt).getTime() : -Infinity;
        if (!local || cloudTime > localTime) {
          toPull.push(cloudCurriculum);
          pulled++;
        }
      }
      curriculumRepository.saveManyCustom(toPull);

      // Local has it, cloud doesn't (or local is strictly newer) -> push.
      for (const local of localCurricula) {
        const row = cloudById.get(local.id);
        const cloudTime = row ? new Date(row.updated_at as string).getTime() : -Infinity;
        const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
        if (!row || localTime > cloudTime) toPush.push(local);
      }
      if (toPush.length > 0) {
        const now = new Date().toISOString();
        const rows = toPush.map((c) => ({ id: c.id, user_id: userId, title: c.title, martial_art: c.martialArt, total_days: c.totalDays, data: c, updated_at: c.updatedAt ?? now }));
        const { error } = await supabase.from('curricula').upsert(rows);
        if (error) return { ok: false, message: toKoreanAuthMessage(error) };
        pushed = toPush.length;
      }

      // Progress has no local "which is newer" signal worth the complexity —
      // lastStudiedAt is compared the same way updatedAt is above.
      const { data: progressRows, error: progressFetchError } = await supabase
        .from('curriculum_progress')
        .select('curriculum_id, data, updated_at')
        .eq('user_id', userId);
      if (progressFetchError) return { ok: false, message: toKoreanAuthMessage(progressFetchError) };

      // Account-switch race guard — see syncGuard.ts. A second check here (not
      // just after the curricula fetch above) because a real await happened in
      // between (the curricula push), widening the same race window again.
      if (!(await isStillCurrentUser(userId))) return { ok: true, data: { pulled, pushed } };

      const cloudProgressById = new Map((progressRows ?? []).map((r) => [r.curriculum_id, r]));
      // Same batching as the curricula pull loop above — localProgressById is
      // read once (instead of calling getProgress(), a full PROGRESS_KEY
      // parse, once per row) and writes collect into progressToPull for a
      // single saveManyProgress() call after the loop.
      const localProgressById = new Map(curriculumRepository.listProgress().map((p) => [p.curriculumId, p]));
      const progressToPull: CurriculumProgress[] = [];
      for (const row of progressRows ?? []) {
        // Same tombstone guard as the curricula pull loop above — a deleted
        // curriculum's progress row must never resurrect either.
        if (pendingDeleteIds.has(row.curriculum_id as string)) continue;
        const local = localProgressById.get(row.curriculum_id as string);
        const cloudTime = new Date(row.updated_at as string).getTime();
        const localTime = local?.lastStudiedAt ? new Date(local.lastStudiedAt).getTime() : -Infinity;
        if (!local || cloudTime > localTime) progressToPull.push(row.data as CurriculumProgress);
      }
      curriculumRepository.saveManyProgress(progressToPull);
      const progressToPush = curriculumRepository
        .listProgress()
        .filter((p) => {
          const row = cloudProgressById.get(p.curriculumId);
          const cloudTime = row ? new Date(row.updated_at as string).getTime() : -Infinity;
          const localTime = p.lastStudiedAt ? new Date(p.lastStudiedAt).getTime() : 0;
          return !row || localTime > cloudTime;
        });
      if (progressToPush.length > 0) {
        const now = new Date().toISOString();
        const rows = progressToPush.map((p) => ({ curriculum_id: p.curriculumId, user_id: userId, data: p, updated_at: p.lastStudiedAt || now }));
        const { error } = await supabase.from('curriculum_progress').upsert(rows);
        if (error) return { ok: false, message: toKoreanAuthMessage(error) };
      }

      return { ok: true, data: { pulled, pushed } };
    } catch (e) {
      return { ok: false, message: toKoreanAuthMessage(e) };
    }
  });
}
