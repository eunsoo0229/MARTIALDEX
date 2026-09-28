import { supabase } from '../supabase/client';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';
import { isStillCurrentUser } from './syncGuard';

const NOT_CONFIGURED_MESSAGE = 'Supabase 설정이 필요합니다.';
const NOT_LOGGED_IN_MESSAGE = '로그인이 필요합니다.';
const PREFIX = 'martialdex:';

// Every one of the app's local-first modules (curriculum, poseAnalysis,
// trainingHistory, sparringAnalysis, achievements, streak, myStyle, review,
// etc. — see README for the full list) writes under a `martialdex:` key.
// Rather than hand-listing every key (and risking missing one, or the list
// going stale as new features add keys), the backup snapshots whatever
// actually exists under that prefix at backup time — a genuine, complete
// copy of "everything this app has stored for you" in one row.
function snapshotLocalData(): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(PREFIX)) continue;
    const value = window.localStorage.getItem(key);
    if (value !== null) snapshot[key] = value;
  }
  return snapshot;
}

export function hasLocalDataToBackup(): boolean {
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith(PREFIX)) return true;
  }
  return false;
}

export async function backupLocalDataToCloud(userId: string): Promise<AuthResult<{ keyCount: number }>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  if (!userId) return { ok: false, message: NOT_LOGGED_IN_MESSAGE };
  try {
    const snapshot = snapshotLocalData();
    const { error } = await supabase.from('user_backups').upsert({ user_id: userId, data: snapshot, updated_at: new Date().toISOString() });
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: { keyCount: Object.keys(snapshot).length } };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export interface BackupInfo {
  keyCount: number;
  updatedAt: string;
}

export async function getCloudBackupInfo(userId: string): Promise<AuthResult<BackupInfo | null>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  if (!userId) return { ok: false, message: NOT_LOGGED_IN_MESSAGE };
  try {
    const { data, error } = await supabase.from('user_backups').select('data, updated_at').eq('user_id', userId).maybeSingle();
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    if (!data) return { ok: true, data: null };
    return { ok: true, data: { keyCount: Object.keys(data.data as Record<string, string>).length, updatedAt: data.updated_at as string } };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

// Overwrites local martialdex:* keys with the cloud snapshot. Callers must
// confirm with the user first — this replaces whatever is currently on this
// device. A full reload afterward (not just a state update) is the simplest
// way to guarantee every reactive hook across the app re-reads the restored
// data, since a direct localStorage write bypasses each module's own
// write-and-dispatch-event functions.
export async function restoreLocalDataFromCloud(userId: string): Promise<AuthResult<{ keyCount: number }>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  if (!userId) return { ok: false, message: NOT_LOGGED_IN_MESSAGE };
  try {
    const { data, error } = await supabase.from('user_backups').select('data').eq('user_id', userId).maybeSingle();
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    if (!data) return { ok: true, data: { keyCount: 0 } };
    // Account-switch race guard — see syncGuard.ts. This path in particular
    // is invoked automatically/silently from LocalDataMigrationPrompt.tsx
    // (no user confirmation click in between the fetch above and this
    // write), so it's exactly the shape of call this guard exists for.
    if (!(await isStillCurrentUser(userId))) return { ok: true, data: { keyCount: 0 } };
    const snapshot = data.data as Record<string, string>;
    for (const [key, value] of Object.entries(snapshot)) window.localStorage.setItem(key, value);
    return { ok: true, data: { keyCount: Object.keys(snapshot).length } };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}
