import { getTutorVoiceSettings, type TutorVoiceSettings } from './tutorVoiceSettings';

// Speech OUTPUT (TTS). Thin wrapper over the browser-native Web Speech API — no new dependency,
// no API key, works in Electron (Chromium) out of the box; on Android/
// Capacitor WebView support varies by device/OS (가능한
// 범위 내에서), so every caller must treat isSupported()===false as a
// normal, handled case (visual-only fallback), never a crash.
//
// Voice + rate come from the AI 튜터 음성 설정 (tutorVoiceSettings.ts),
// read when each utterance is created — so a change made mid-lesson applies
// from the NEXT line, without cutting off the one being spoken.
export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** The voices this device's TTS actually provides. Chromium loads them asynchronously, so this waits briefly for them. */
export function listVoices(timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> {
  if (!isTtsSupported()) return Promise.resolve([]);
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', done);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener('voiceschanged', done);
    window.setTimeout(done, timeoutMs);
  });
}

export function isKoreanVoice(v: Pick<SpeechSynthesisVoice, 'lang'>): boolean {
  return /^ko(-|_|$)/i.test(v.lang);
}

/** The voice to use for a saved choice — null (system default) when unset or not installed on this device. */
export function resolveVoice(voiceURI: string | null): SpeechSynthesisVoice | null {
  if (!voiceURI || !isTtsSupported()) return null;
  return window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceURI) ?? null;
}

export interface SpeakOptions {
  lang?: string;
  /**
   * true: drop whatever is queued/speaking and say this now (timer cues —
   * at a fast pace, queued cues would drift behind the actual timer).
   * false (default): queue after what is being said, so several coach lines
   * added at once (수업 안내 + 기술 설명 + 영상 안내) are all heard.
   */
  interrupt?: boolean;
  /** Explicit voice/rate (미리듣기 of an unsaved choice); defaults to the saved tutor settings. */
  settings?: TutorVoiceSettings;
}

export function speak(text: string, opts: SpeakOptions | string = {}): void {
  if (!isTtsSupported() || !text.trim()) return;
  const o: SpeakOptions = typeof opts === 'string' ? { lang: opts } : opts;
  if (o.interrupt) window.speechSynthesis.cancel();
  const settings = o.settings ?? getTutorVoiceSettings();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = resolveVoice(settings.aiTutorVoice);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = o.lang ?? 'ko-KR';
  }
  utterance.rate = settings.aiTutorSpeechRate;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (isTtsSupported()) window.speechSynthesis.cancel();
}
