import { useEffect, useState } from 'react';
import { ADD_TEQ_CACHE_EVENT } from './repository';

/**
 * Forces a re-render whenever the local add_teq cache changes — a fresh
 * pull from Supabase (login, or a Discovery Service call refreshing it), or
 * a just-registered technique being upserted locally. Any screen that
 * shows a count/list which should include add_teq (전체 기술 수, 무술별
 *기술 수, 기술 검색 결과, ...) calls this alongside the existing
 * `martialdex:user-techniques-updated` listener pattern already used for
 * the same purpose elsewhere, so a newly-discovered technique appears
 * immediately without a page refresh (spec [문제 3]). The returned number
 * itself carries no meaning — components read it only to trigger the
 * re-render; the actual data is (re)computed fresh via
 * getUnifiedTechniqueCount()/getUnifiedMartialArtSummaries()/
 * searchAllTechniques() etc. on that render.
 */
export function useAddTeqLibraryVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const onUpdate = () => setVersion((v) => v + 1);
    window.addEventListener(ADD_TEQ_CACHE_EVENT, onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener(ADD_TEQ_CACHE_EVENT, onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, []);
  return version;
}
