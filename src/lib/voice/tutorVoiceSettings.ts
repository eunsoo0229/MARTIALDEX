// AI 튜터 음성 설정 — which system voice reads the coach's lines and how
// fast. Applies to every spoken coach line (tts.ts reads it at the moment
// each utterance starts), never to text mode. Stored under the martialdex:
// prefix so it survives restarts and rides the existing account backup.

export interface TutorVoiceSettings {
  /** SpeechSynthesisVoice.voiceURI of the chosen voice; null = the system's default voice for Korean. */
  aiTutorVoice: string | null;
  /** SpeechSynthesisUtterance.rate — limited to TUTOR_RATE_MIN..MAX. */
  aiTutorSpeechRate: number;
}

const KEY = 'martialdex:ai-tutor-voice-settings';
export const TUTOR_VOICE_EVENT = 'martialdex:ai-tutor-voice-updated';

// The Web Speech API accepts 0.1–10, but voices distort badly outside
// roughly 0.5–2 — the range the setting offers.
export const TUTOR_RATE_MIN = 0.5;
export const TUTOR_RATE_MAX = 2;
export const TUTOR_RATE_STEP = 0.05;
export const DEFAULT_TUTOR_VOICE_SETTINGS: TutorVoiceSettings = { aiTutorVoice: null, aiTutorSpeechRate: 1 };
export const RATE_PRESETS: { label: string; rate: number }[] = [
  { label: '느리게', rate: 0.75 },
  { label: '보통', rate: 1 },
  { label: '빠르게', rate: 1.25 },
  { label: '매우 빠르게', rate: 1.5 },
];

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.round(Math.min(TUTOR_RATE_MAX, Math.max(TUTOR_RATE_MIN, rate)) * 100) / 100;
}

export function getTutorVoiceSettings(): TutorVoiceSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_TUTOR_VOICE_SETTINGS };
    const v = JSON.parse(raw) as Partial<TutorVoiceSettings>;
    return {
      aiTutorVoice: typeof v.aiTutorVoice === 'string' && v.aiTutorVoice ? v.aiTutorVoice : null,
      aiTutorSpeechRate: clampRate(typeof v.aiTutorSpeechRate === 'number' ? v.aiTutorSpeechRate : 1),
    };
  } catch {
    return { ...DEFAULT_TUTOR_VOICE_SETTINGS };
  }
}

export function saveTutorVoiceSettings(next: TutorVoiceSettings): TutorVoiceSettings {
  const clean = { aiTutorVoice: next.aiTutorVoice || null, aiTutorSpeechRate: clampRate(next.aiTutorSpeechRate) };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    // storage unavailable — the setting just won't persist
  }
  window.dispatchEvent(new CustomEvent(TUTOR_VOICE_EVENT));
  return clean;
}

/** 1 → "1.0x", 1.25 → "1.25x", 0.5 → "0.5x". */
export function formatRate(rate: number): string {
  const r = clampRate(rate);
  return `${Math.round(r * 100) % 10 === 0 ? r.toFixed(1) : r.toFixed(2)}x`;
}
