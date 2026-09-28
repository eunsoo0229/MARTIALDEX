import { useCallback, useEffect, useState } from 'react';
import type { Curriculum, CurriculumProgress } from './types';
import * as curriculumService from './curriculumService';

// Same "custom event + storage event" sync trick as useRecentlyViewedSynced
// in lib/userData.ts — repository.ts dispatches these whenever it writes, so
// every open page reflects a change made from another page (or, once a real
// backend exists, from another device) without prop-drilling.
function useSyncedValue<T>(eventName: string, read: () => T): T {
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    const onUpdate = () => setValue(read());
    window.addEventListener(eventName, onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener(eventName, onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventName]);
  return value;
}

export function useMyCurricula(): Curriculum[] {
  return useSyncedValue('martialdex:curricula-updated', curriculumService.listMyCurricula);
}

export function useBrowsableCurricula(): Curriculum[] {
  return useSyncedValue('martialdex:curricula-updated', curriculumService.listBrowsableCurricula);
}

export function useMyActiveProgress(): { curriculum: Curriculum; progress: CurriculumProgress }[] {
  return useSyncedValue('martialdex:progress-updated', curriculumService.listMyActiveProgress);
}

export function useCurriculumProgress(curriculum: Curriculum | undefined) {
  const [progress, setProgress] = useState<CurriculumProgress | undefined>(
    curriculum ? curriculumService.getProgress(curriculum.id) : undefined
  );

  useEffect(() => {
    setProgress(curriculum ? curriculumService.getProgress(curriculum.id) : undefined);
  }, [curriculum?.id]);

  useEffect(() => {
    if (!curriculum) return;
    const onUpdate = () => setProgress(curriculumService.getProgress(curriculum.id));
    window.addEventListener('martialdex:progress-updated', onUpdate);
    return () => window.removeEventListener('martialdex:progress-updated', onUpdate);
  }, [curriculum?.id]);

  const setDayComplete = useCallback(
    (day: number, complete: boolean) => {
      if (!curriculum) return;
      setProgress(curriculumService.setDayComplete(curriculum, day, complete));
    },
    [curriculum]
  );

  const start = useCallback(() => {
    if (!curriculum) return;
    setProgress(curriculumService.ensureProgress(curriculum));
  }, [curriculum]);

  return { progress, setDayComplete, start };
}
