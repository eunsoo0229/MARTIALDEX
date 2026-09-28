import { useEffect, useState } from 'react';
import type { TechniqueSkillSummary } from './types';
import { getAllRecords, getRecordsForTechnique, getTechniqueSkillSummary } from './recordsService';

function useSynced<T>(read: () => T): T {
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    const onUpdate = () => setValue(read());
    window.addEventListener('martialdex:pose-records-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener('martialdex:pose-records-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

export function useTechniqueSkillSummary(techniqueId: string): TechniqueSkillSummary {
  return useSynced(() => getTechniqueSkillSummary(techniqueId));
}

export function useTechniqueRecords(techniqueId: string) {
  return useSynced(() => getRecordsForTechnique(techniqueId));
}

export function useAllPoseRecords() {
  return useSynced(() => getAllRecords());
}
