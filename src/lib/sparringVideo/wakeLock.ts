// Keeps the screen from turning off while actively recording (spec: "화면이
// 꺼져도 촬영 가능"). Two independent mechanisms depending on platform:
// - Electron: the main process's powerSaveBlocker (see electron/main.cjs),
//   which genuinely prevents the OS display from sleeping — the renderer
//   process itself already keeps running while minimized/hidden (Electron
//   doesn't suspend it the way a mobile OS does), so this is the one thing
//   actually needed on desktop.
// - Browser/Capacitor WebView: the standard Screen Wake Lock API
//   (navigator.wakeLock) — best-effort. It keeps the IDLE screen-off timer
//   from firing while this app is the active, foreground tab/app, but it
//   cannot (and per the W3C spec, must not) survive the user manually
//   pressing the power button, nor keep a camera stream alive once the app
//   is truly backgrounded — that's an OS media-session restriction no web
//   API can override. This is the honest, best-effort mechanism available
//   short of a native background-capture plugin.
let wakeLockSentinel: { release: () => Promise<void> } | null = null;

async function requestBrowserWakeLock(): Promise<void> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (nav.wakeLock) wakeLockSentinel = await nav.wakeLock.request('screen');
  } catch {
    // Can legitimately fail (no user gesture, unsupported, low battery on
    // some platforms) — recording still proceeds either way, just without
    // the screen-stays-on guarantee.
  }
}

export async function acquireRecordingWakeLock(): Promise<void> {
  if (window.martialdex?.startPowerSaveBlocker) {
    await window.martialdex.startPowerSaveBlocker().catch(() => {});
    return;
  }
  await requestBrowserWakeLock();
}

export async function releaseRecordingWakeLock(): Promise<void> {
  if (window.martialdex?.stopPowerSaveBlocker) {
    await window.martialdex.stopPowerSaveBlocker().catch(() => {});
    return;
  }
  try {
    await wakeLockSentinel?.release();
  } catch {
    // already released / not supported — fine.
  } finally {
    wakeLockSentinel = null;
  }
}

/**
 * The browser Wake Lock API's sentinel is automatically released by the
 * platform whenever the document becomes hidden (spec-defined behavior, not
 * a bug this app can fix) — if the user briefly switches app and comes back
 * while still recording, this re-requests it so the screen stays awake for
 * the rest of the session, matching the "screen-off shouldn't stop this"
 * intent as closely as a web API allows. No-op on Electron (powerSaveBlocker
 * doesn't get released by visibility changes at all).
 */
export function reacquireWakeLockOnVisible(isStillRecording: () => boolean): () => void {
  function onVisibilityChange() {
    if (!document.hidden && isStillRecording() && !window.martialdex?.startPowerSaveBlocker) {
      void requestBrowserWakeLock();
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => document.removeEventListener('visibilitychange', onVisibilityChange);
}
