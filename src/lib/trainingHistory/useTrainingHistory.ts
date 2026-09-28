import { useEffect, useState } from 'react';
import type { TrainingHistoryEntry } from './types';
import { listTrainingHistory } from './service';

function useSynced<T>(read: () => T): T {
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    const onUpdate = () => setValue(read());
    window.addEventListener('martialdex:training-history-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener('martialdex:training-history-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

export function useTrainingHistory(): TrainingHistoryEntry[] {
  return useSynced(listTrainingHistory);
}
