export function openExternal(url: string) {
  if (window.martialdex?.openExternal) {
    window.martialdex.openExternal(url);
  } else {
    // Fallback for running in a plain browser tab during development.
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Opens a link WITHOUT handing off to a separate browser application
 * (community-post links — 게시물에 첨부된 링크는 별도 브라우저 없이 MARTIALDEX
 * 안에서 바로 열려야 한다, and must work even on a device with NO browser app
 * installed at all):
 * - Electron: a second native window of this SAME app (electron/main.cjs's
 *   'shell:open-in-app'), never shell.openExternal.
 * - Android (Capacitor native): InAppBrowserPlugin — a native
 *   android.webkit.WebView screen inside THIS app's own process. Deliberately
 *   NOT @capacitor/browser (Chrome Custom Tabs), which only works when a
 *   separate browser app like Chrome is actually installed on the device to
 *   render it — WebView is an OS-level system component present on virtually
 *   every Android device regardless of whether a user-facing browser app is.
 * - Plain web (dev fallback, no better in-app surface exists there): falls
 *   back to openExternal's own new-tab behavior.
 */
export async function openInApp(url: string) {
  if (window.martialdex?.openInApp) {
    window.martialdex.openInApp(url);
    return;
  }
  const { isNativeInAppBrowserAvailable, openInNativeInAppBrowser } = await import('./browser/inAppBrowserPlugin');
  if (isNativeInAppBrowserAvailable()) {
    await openInNativeInAppBrowser(url);
    return;
  }
  openExternal(url);
}

export function youtubeSearchUrl(query: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
