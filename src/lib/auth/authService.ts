import { supabase } from '../supabase/client';
import { toKoreanAuthMessage } from './authErrors';

export type AuthResult<T = void> = { ok: true; data: T } | { ok: false; message: string };

const NOT_CONFIGURED_MESSAGE = 'Supabase 설정이 필요합니다. 앱 관리자에게 문의해주세요.';

export interface Profile {
  id: string;
  user_id: string;
  nickname: string;
  avatar: string | null;
  created_at: string;
  updated_at: string;
}

// nickname is passed via signUp's user-metadata; the `profiles` row itself
// is created server-side by a SECURITY DEFINER trigger on auth.users insert
// (see supabase/migrations/0001_profiles.sql) — NOT from this client call.
// Inserting it here would race against Supabase's "confirm your email"
// setting: right after signUp, there may be no active session yet (RLS
// would reject an insert as an anonymous request), but the trigger runs
// with elevated privileges regardless of session state.
export async function signUpWithEmail(email: string, password: string, nickname: string): Promise<AuthResult<{ needsEmailConfirmation: boolean }>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nickname } },
    });
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: { needsEmailConfirmation: !data.session } };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function signOutUser(): Promise<AuthResult> {
  if (!supabase) return { ok: true, data: undefined };
  try {
    const { error } = await supabase.auth.signOut();
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

// Sends a reset-password email only — Electron has no web origin to receive
// the callback link without additional deep-link/custom-protocol setup, so
// completing the reset (setting a new password from the emailed link) is
// out of scope for this stage (documented as a known limitation in README).
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function getMyProfile(userId: string): Promise<AuthResult<Profile | null>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle();
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: data as Profile | null };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}
