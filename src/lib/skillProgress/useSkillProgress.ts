import { useEffect, useState } from 'react';
import type { SkillProgress } from './types';
import { computeSkillProgress } from './computeSkillProgress';
import { computeAllSkillProgress, type TechniqueSkillEntry } from './weaknessEngine';
import { ADD_TEQ_CACHE_EVENT } from '../addTeq/repository';

// ADD_TEQ_CACHE_EVENT: 나의 기술/숙련도 대시보드가 방금 등록되었거나 새로
// 동기화된 add_teq 기술도 즉시 반영하도록(spec [문제 1/3]).
const SYNC_EVENTS = ['martialdex:pose-records-updated', 'martialdex:training-history-updated', 'martialdex:skill-overrides-updated', ADD_TEQ_CACHE_EVENT, 'storage'];

function useSynced<T>(read: () => T): T {
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    const onUpdate = () => setValue(read());
    for (const evt of SYNC_EVENTS) window.addEventListener(evt, onUpdate);
    return () => {
      for (const evt of SYNC_EVENTS) window.removeEventListener(evt, onUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

export function useSkillProgress(techniqueId: string): SkillProgress {
  return useSynced(() => computeSkillProgress(techniqueId));
}

export function useAllSkillProgress(): TechniqueSkillEntry[] {
  return useSynced(computeAllSkillProgress);
}
