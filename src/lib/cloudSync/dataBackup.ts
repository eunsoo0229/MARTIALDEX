import { supabase } from '../supabase/client';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';
import { isStillCurrentUser } from './syncGuard';
import { getDeviceInfo } from '../device/deviceInfo';

const NOT_CONFIGURED_MESSAGE = 'Supabase 설정이 필요합니다.';
const NOT_LOGGED_IN_MESSAGE = '로그인이 필요합니다.';
const PREFIX = 'martialdex:';

// Backup metadata ("어느 기기에서 언제") rides INSIDE the snapshot under a
// key outside the martialdex: prefix, so it is replaced together with the
// data on every backup (never stale), restore skips it, and backups made
// before it existed simply have none ("백업 정보 없음"). No schema change.
export const BACKUP_META_KEY = 'mdx:backup-meta';
/** This device's own copy of the last successful backup's metadata (not itself backed up). */
const LAST_BACKUP_LOCAL_KEY = 'mdx:last-backup';

export interface BackupMeta {
  deviceName: string;
  /** Local date/time strings at the moment the backup succeeded, as shown on the backing-up device. */
  backupDate: string;
  backupTime: string;
  /** ISO 8601 UTC — what every screen formats in the viewer's local time. */
  backupTimestamp: string;
  appVersion: string;
  platform: string;
}

export function formatBackupDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}
export function formatBackupTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
}

function parseMeta(raw: unknown): BackupMeta | null {
  try {
    const m = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!m || typeof m !== 'object' || typeof (m as BackupMeta).backupTimestamp !== 'string' || Number.isNaN(Date.parse((m as BackupMeta).backupTimestamp))) return null;
    const meta = m as BackupMeta;
    return { ...meta, deviceName: meta.deviceName || '이 기기', appVersion: meta.appVersion ?? '', platform: meta.platform ?? '' };
  } catch {
    return null;
  }
}

export function getLocalLastBackup(): BackupMeta | null {
  try {
    return parseMeta(window.localStorage.getItem(LAST_BACKUP_LOCAL_KEY));
  } catch {
    return null;
  }
}

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

export async function backupLocalDataToCloud(userId: string): Promise<AuthResult<{ keyCount: number; meta: BackupMeta }>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  if (!userId) return { ok: false, message: NOT_LOGGED_IN_MESSAGE };
  try {
    const snapshot = snapshotLocalData();
    const keyCount = Object.keys(snapshot).length;
    const device = await getDeviceInfo();
    const at = new Date();
    const meta: BackupMeta = {
      deviceName: device.deviceName,
      backupDate: formatBackupDate(at.toISOString()),
      backupTime: formatBackupTime(at.toISOString()),
      backupTimestamp: at.toISOString(),
      appVersion: device.appVersion,
      platform: device.platform,
    };
    const { error } = await supabase.from('user_backups').upsert({ user_id: userId, data: { ...snapshot, [BACKUP_META_KEY]: JSON.stringify(meta) }, updated_at: meta.backupTimestamp });
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    // Recorded only after the cloud write succeeded — a failed backup never shows as "마지막 백업".
    try {
      window.localStorage.setItem(LAST_BACKUP_LOCAL_KEY, JSON.stringify(meta));
    } catch {
      // display-only cache; the cloud copy is the source of truth
    }
    return { ok: true, data: { keyCount, meta } };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export interface BackupInfo {
  keyCount: number;
  updatedAt: string;
  /** null for backups made before backup metadata existed. */
  meta: BackupMeta | null;
}

export async function getCloudBackupInfo(userId: string): Promise<AuthResult<BackupInfo | null>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  if (!userId) return { ok: false, message: NOT_LOGGED_IN_MESSAGE };
  try {
    const { data, error } = await supabase.from('user_backups').select('data, updated_at').eq('user_id', userId).maybeSingle();
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    if (!data) return { ok: true, data: null };
    const snapshot = (data.data ?? {}) as Record<string, string>;
    return { ok: true, data: { keyCount: Object.keys(snapshot).filter((k) => k !== BACKUP_META_KEY).length, updatedAt: data.updated_at as string, meta: parseMeta(snapshot[BACKUP_META_KEY]) } };
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
    let keyCount = 0;
    for (const [key, value] of Object.entries(snapshot)) {
      if (key === BACKUP_META_KEY) continue; // metadata, not app data
      window.localStorage.setItem(key, value);
      keyCount++;
    }
    return { ok: true, data: { keyCount } };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}
