import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../supabase/client';
import { getMyProfile, type Profile } from './authService';
import { guardAccountSwitch } from './deviceAccountGuard';


interface AuthContextValue {
  isConfigured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// One subscription for the whole app — every page reads auth state via
// useAuth() instead of calling supabase.auth.* directly, so there is a
// single source of truth for "am I logged in" and it survives route
// changes without re-subscribing.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  async function loadProfile(userId: string) {
    const result = await getMyProfile(userId);
    setProfile(result.ok ? result.data : null);
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        if (guardAccountSwitch(data.session?.user.id ?? null)) {
          window.location.reload();
          return;
        }
        setSession(data.session);
        if (data.session) void loadProfile(data.session.user.id);
      })
      .catch(() => {
        // No internet / Supabase unreachable at startup — fall back to
        // "signed out" rather than leaving the app stuck loading forever;
        // onAuthStateChange will still pick up a session once connectivity
        // returns and the user retries logging in.
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;
      if (guardAccountSwitch(newSession?.user.id ?? null)) {
        window.location.reload();
        return;
      }
      setSession(newSession);
      if (newSession) void loadProfile(newSession.user.id);
      else setProfile(null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session) await loadProfile(session.user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Every one of the 23 useAuth() consumers (Header + every page) re-rendered
  // on ANY AuthProvider state change — even ones reading only `isConfigured`
  // (a constant) — because a fresh object literal was passed to `value`
  // every render, which React Context treats as "the value changed" even
  // when every field inside is identical. Real, measured waste specifically
  // around auth transitions (initial getSession() resolving, loadProfile()
  // resolving, any onAuthStateChange firing — several renders in a row at
  // boot/login). Memoizing on the actual primitive/reference values means
  // consumers only re-render when something they could plausibly read
  // actually changed.
  const value = useMemo<AuthContextValue>(
    () => ({
      isConfigured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      profile,
      refreshProfile,
    }),
    [loading, session, profile, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
