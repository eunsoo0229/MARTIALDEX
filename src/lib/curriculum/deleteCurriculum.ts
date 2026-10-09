import { curriculumRepository } from './repository';
import { deleteCurriculumEverywhere } from '../cloudSync/curriculumSync';

export type DeleteCurriculumResult = { ok: true } | { ok: false; message: string };

const FAILED_MESSAGE = '삭제하지 못했습니다. 잠시 후 다시 시도해주세요.';

/**
 * "커리큘럼 삭제" end to end — the UI treats the curriculum as deleted only
 * when this resolves ok:
 *   - signed in: delete the Supabase rows and confirm with a re-select FIRST,
 *     and only then delete locally (curriculumSync.ts's
 *     deleteCurriculumEverywhere). Until the server confirms, nothing local
 *     changes, so the curriculum never disappears from the screen early and
 *     a failure needs no undo;
 *   - signed out: local delete only (nothing exists in the cloud);
 *   - either way, storage is re-read afterwards to confirm it is really
 *     gone; if the local write itself threw part-way, the curriculum is
 *     restored exactly (position, progress).
 * Only data that belongs to the curriculum (its own progress) is removed.
 * Training history, learned techniques and sparring records are separate
 * stores and stay untouched (history entries keep their curriculumId as a
 * plain historical reference).
 */
export async function deleteCurriculumVerified(id: string, userId: string | null): Promise<DeleteCurriculumResult> {
  const before = curriculumRepository.listCustom();
  const index = before.findIndex((c) => c.id === id);
  if (index === -1) return { ok: false, message: '삭제할 커리큘럼을 찾을 수 없습니다.' };
  const snapshot = before[index];
  const progress = curriculumRepository.getProgress(id);
  const deleteLocal = () => curriculumRepository.deleteCustom(id);

  try {
    if (userId) {
      const result = await deleteCurriculumEverywhere(userId, id, deleteLocal);
      if (!result.ok) return { ok: false, message: FAILED_MESSAGE };
    } else {
      deleteLocal();
    }
  } catch {
    if (!curriculumRepository.getCustom(id)) curriculumRepository.restoreDeletedCustom(snapshot, index, progress);
    return { ok: false, message: FAILED_MESSAGE };
  }

  // Re-read storage: the delete only counts if the curriculum is really gone.
  if (curriculumRepository.getCustom(id)) return { ok: false, message: FAILED_MESSAGE };
  return { ok: true };
}
