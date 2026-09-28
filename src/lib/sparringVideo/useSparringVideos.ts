import { useEffect, useState } from 'react';
import type { SparringVideo } from './types';
import { listAllSparringVideos } from './service';
import { SPARRING_VIDEOS_UPDATED_EVENT } from './repository';

function useSynced<T>(read: () => T): T {
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    const onUpdate = () => setValue(read());
    window.addEventListener(SPARRING_VIDEOS_UPDATED_EVENT, onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener(SPARRING_VIDEOS_UPDATED_EVENT, onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

export function useSparringVideos(): SparringVideo[] {
  return useSynced(listAllSparringVideos);
}
