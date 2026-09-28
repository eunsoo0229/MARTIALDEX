import { supabase } from '../supabase/client';

// Closes the account-switch race the wipe-on-login guard (deviceAccountGuard.ts)
// cannot: every syncXBidirectional function below captures a `userId`
// argument in its closure and then does one or more `await`s (network round
// trips) before writing pulled cloud data into the SHARED, non-account-
// scoped local storage keys (see deviceAccountGuard.ts's own header comment
// for the real incident this whole area of code exists to prevent). If the
// user logs out of that account and into a different one WHILE one of those
// awaits is still pending, the promise resumes in a JS context that still
// believes `userId` is "the current user" even though it no longer is —
// deviceAccountGuard's wipe-and-reload already happened for the NEW login
// (LAST_USER_KEY was already updated), so nothing will re-wipe what this
// stale write is about to (re-)write. The fix is not "cancel the promise"
// (browsers/Node give no such hook for an in-flight fetch here) but "check,
// immediately before every write that touches shared local storage or shared
// per-account cloud rows, whether userId is STILL the actively authenticated
// user" — and silently skip the write (never treated as an error) if not.
//
// Deliberately uses getSession() (the SDK's own fast, locally-cached read),
// not getUser() (which re-validates the JWT against the network) — this is
// a client-side UX/correctness guard against a same-device race, not a
// security boundary (that boundary is, correctly, Supabase RLS's own
// `auth.uid() = user_id` checks on every table these functions touch).
export async function isStillCurrentUser(userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id === userId;
}
