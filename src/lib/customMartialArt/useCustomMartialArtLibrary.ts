import { useEffect, useState } from 'react';
import { CUSTOM_MARTIAL_ART_CACHE_EVENT } from './repository';

/** Same "force a re-render on cache change" pattern as addTeq/useAddTeqLibrary.ts — any screen listing martial arts (getUnifiedMartialArtSummaries) calls this so a just-registered new martial art appears immediately without a page refresh. */
export function useCustomMartialArtLibraryVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const onUpdate = () => setVersion((v) => v + 1);
    window.addEventListener(CUSTOM_MARTIAL_ART_CACHE_EVENT, onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener(CUSTOM_MARTIAL_ART_CACHE_EVENT, onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, []);
  return version;
}
