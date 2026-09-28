import { useEffect, useState } from 'react';
import type { SparringSession } from './types';
import { listSparringSessions } from './sparringSessionService';

function useSynced<T>(read: () => T): T {
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    const onUpdate = () => setValue(read());
    window.addEventListener('martialdex:sparring-sessions-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener('martialdex:sparring-sessions-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

export function useSparringSessions(): SparringSession[] {
  return useSynced(listSparringSessions);
}
