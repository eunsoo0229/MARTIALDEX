// Thin wrapper over the browser-native Web Speech API — no new dependency,
// no API key, works in Electron (Chromium) out of the box; on Android/
// Capacitor WebView support varies by device/OS (spec section 7's "가능한
// 범위 내에서"), so every caller must treat isSupported()===false as a
// normal, handled case (visual-only fallback), never a crash.
export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function speak(text: string, lang = 'ko-KR'): void {
  if (!isTtsSupported() || !text.trim()) return;
  // Cancel whatever's still queued/speaking first — at a fast pace, letting
  // utterances queue up would make announcements drift further and further
  // behind the actual round timer instead of always saying the CURRENT cue.
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (isTtsSupported()) window.speechSynthesis.cancel();
}
