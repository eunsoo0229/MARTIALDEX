// Copies text to the system clipboard across every platform this app ships
// on (Electron desktop, Android/Capacitor WebView, plain browser).
//
// window.prompt() used to be the fallback here, but it's actively broken in
// Electron — Electron's renderer throws "prompt() is and will not be
// supported." synchronously, so the old fallback failed louder than the
// thing it was supposed to fall back from. It's also not guaranteed to show
// anything in an Android WebView (Capacitor doesn't implement a JS prompt()
// dialog by default). Neither platform issue is worked around here — the
// real fix for Electron is allowing the 'clipboard-sanitized-write'
// permission in electron/main.cjs's session handlers, which makes the
// primary path below succeed there. This module exists for the cases that
// even that doesn't cover.
export type CopyResult = 'clipboard-api' | 'legacy-exec-command' | 'failed';

function legacyCopy(text: string): boolean {
  // The older execCommand('copy') path goes through a completely different
  // permission model than the async Clipboard API (no Permissions-API gate
  // at all) — it "just works" in more embedded/sandboxed WebViews, at the
  // cost of needing a real DOM element and a user-gesture call stack, both
  // of which every call site here already has (all copy handlers run
  // directly inside an onClick).
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  const previousFocus = document.activeElement as HTMLElement | null;
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  previousFocus?.focus?.();
  return ok;
}

/**
 * Copies `text` to the clipboard, trying the modern Clipboard API first and
 * a legacy execCommand fallback second. Never throws. Returns which method
 * (if any) actually worked so callers can show an honest "완전 자동 복사가
 *안 됐다" state instead of a false "복사됨" when both fail.
 */
export async function copyToClipboard(text: string): Promise<CopyResult> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return 'clipboard-api';
    } catch {
      // fall through to the legacy path
    }
  }
  return legacyCopy(text) ? 'legacy-exec-command' : 'failed';
}
