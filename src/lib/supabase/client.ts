import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// The Supabase anon/publishable key is DESIGNED to ship in frontend bundles
// — unlike the Gemini API key (main-process-only, see src/lib/ai/provider.ts
// and README "환경변수 설정"), Supabase's security model puts the boundary
// at Row Level Security in the database, not at key secrecy. The
// service_role key (which DOES bypass RLS) must never appear here or
// anywhere in this codebase — only VITE_SUPABASE_PUBLISHABLE_KEY (anon key).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

function createSupabaseClient(): SupabaseClient | null {
  if (!url || !publishableKey) return null;
  try {
    return createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  } catch {
    // A malformed URL/key would throw synchronously here — treated the same
    // as "not configured" so the rest of the app (encyclopedia, search,
    // techniques) keeps working instead of the whole bundle failing to load.
    return null;
  }
}

// Every call site must handle `supabase` being null (env vars missing or
// invalid) — the whole app must keep working with zero Supabase
// configuration; only login/signup/personal-data features are unavailable,
// and they degrade to a clear message rather than a crash.
export const supabase: SupabaseClient | null = createSupabaseClient();
export const isSupabaseConfigured = supabase !== null;
