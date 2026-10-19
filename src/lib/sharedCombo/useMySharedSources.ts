import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { mySharedSources } from './service';

/** Which of my combos/tactics are already shared ("combo:<id>" → shared id). Empty when signed out or the server is unavailable. */
export function useMySharedSources(): { shared: Map<string, string>; refresh: () => void } {
  const { user } = useAuth();
  const [shared, setShared] = useState<Map<string, string>>(new Map());
  const refresh = useCallback(() => {
    if (!user) {
      setShared(new Map());
      return;
    }
    void mySharedSources(user.id).then((r) => setShared(r.ok ? r.data : new Map()));
  }, [user]);
  useEffect(refresh, [refresh]);
  return { shared, refresh };
}
