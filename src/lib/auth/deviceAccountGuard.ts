// Every local-first repository (trainingHistory, curriculum, gymRoutine,
// nutrition, combo, tactic, ...) stores its data in flat `martialdex:`-
// prefixed localStorage keys with NO per-account namespacing — by design,
// since the app is built around one person using their own device. The gap:
// LocalDataMigrationPrompt.tsx's "always-safe" bidirectional syncs run
// unconditionally on every login, so if a SECOND, DIFFERENT real account
// logs in on the same device (without either an explicit "저장하기" or
// "클라우드 데이터 불러오기" choice being what runs first), whatever is
// still sitting in local storage from the FIRST account gets silently
// pushed up to the second account's cloud data the moment it authenticates.
// Confirmed live during gym-class multi-account E2E testing (an
// instructor's freshly-created account ended up with a student's
// just-recorded workout in its own training_history rows).
//
// This detects that exact transition — a real account replacing a
// DIFFERENT previously-remembered one — and wipes local app data first, so
// the new account always starts clean and only ever pulls its OWN cloud
// data. A first-ever login (no previously-remembered account) is left
// alone, preserving the legitimate "이 기기의 기존 데이터를 계정에
// 저장할까요?" push-offer flow for someone using the app locally before
// ever signing up.
// Deliberately NOT `martialdex:`-prefixed — dataBackup.ts's
// hasLocalDataToBackup() treats ANY `martialdex:`-prefixed key as "real
// user data to offer backing up," so a tracking key under that prefix would
// make every single login look like it has local data to back up, showing
// the "기존 데이터를 계정에 저장할까요?" prompt even on a genuinely fresh
// signup with nothing else in local storage (confirmed live — this is
// exactly what happened before this key was moved off the `martialdex:`
// prefix). `mdx:` matches the same convention LocalDataMigrationPrompt
// itself already uses for its own non-backupable tracking key
// (promptSeenKey, `mdx:backup-prompt-seen:<userId>`).
const LAST_USER_KEY = 'mdx:last-auth-user-id';

// Device/UI preferences, not user data — kept across an account switch.
const PRESERVE_KEYS = new Set(['martialdex:theme']);

/**
 * Call with the newly-authenticated user's id (or null when signed out)
 * BEFORE any other code reacts to the new session. Returns true if a
 * different account's local data was just cleared — the caller should
 * reload the page in that case so every already-mounted component re-reads
 * its state from the now-empty (soon to be freshly synced) local storage,
 * matching the same reload-after-bulk-change convention
 * LocalDataMigrationPrompt already uses for its own restore flow.
 */
export function guardAccountSwitch(newUserId: string | null): boolean {
  if (!newUserId) return false;

  const lastUserId = window.localStorage.getItem(LAST_USER_KEY);
  const switched = !!lastUserId && lastUserId !== newUserId;

  if (switched) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith('martialdex:') && key !== LAST_USER_KEY && !PRESERVE_KEYS.has(key)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) window.localStorage.removeItem(key);
  }

  window.localStorage.setItem(LAST_USER_KEY, newUserId);
  return switched;
}
