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
//
// What this layer adds on top of speechSynthesis.speak():
//  - every utterance is tracked through its REAL onstart / onend / onerror
//    events (a line counts as played only when the engine says it started
//    and ended — never just because speak() was called), and the outcome is
//    published as a TTS state (TTS_EVENT) the UI can show;
//  - utterances stay referenced until they finish (Chromium can garbage-
//    collect an unreferenced utterance mid-sentence and stop silently);
//  - long text is split at sentence boundaries (Chromium stops long single
//    utterances after ~15 s on several platforms);
//  - pause / resume / stop, and a watchdog that reports "the engine never
//    started speaking" instead of failing silently.

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

export type SpeakOutcome = { ok: true; playedMs: number } | { ok: false; reason: 'unsupported' | 'empty' | 'canceled' | 'failed'; message?: string };

export type TtsStatus = 'idle' | 'speaking' | 'paused' | 'unsupported';

export interface TtsState {
  status: TtsStatus;
  /** Text of the chunk being spoken right now. */
  current: string | null;
  /** Chunks waiting (including the current one). */
  pending: number;
  /** Last real playback failure (cleared by the next successful line). */
  lastError: string | null;
  /** Last chunk the engine really started AND finished — evidence that audio was produced. */
  lastPlayed: { text: string; ms: number; at: number } | null;
  /** Lines played successfully in this app session. */
  playedCount: number;
}

export const TTS_EVENT = 'martialdex:tts-state';

interface Chunk {
  text: string;
  utterance: SpeechSynthesisUtterance;
  startedAt: number | null;
  settled: boolean;
  resolve: (o: SpeakOutcome) => void;
}

const live: Chunk[] = [];
let paused = false;
let state: TtsState = { status: 'idle', current: null, pending: 0, lastError: null, lastPlayed: null, playedCount: 0 };
/** How long the engine may take to start the FIRST chunk in line before it is reported as not playing. */
const START_TIMEOUT_MS = 6000;

function publish(patch: Partial<TtsState> = {}) {
  const speakingNow = live.find((c) => c.startedAt !== null && !c.settled);
  state = {
    ...state,
    ...patch,
    status: !isTtsSupported() ? 'unsupported' : paused && live.length ? 'paused' : live.length ? 'speaking' : 'idle',
    current: speakingNow?.text ?? (live[0]?.text ?? null),
    pending: live.length,
  };
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(TTS_EVENT));
}

export function getTtsState(): TtsState {
  return { ...state, status: isTtsSupported() ? state.status : 'unsupported' };
}

/** True while a line is being spoken or waits in the queue (also true for utterances queued by other code). */
export function isSpeaking(): boolean {
  if (!isTtsSupported()) return false;
  return live.length > 0 || window.speechSynthesis.speaking || window.speechSynthesis.pending;
}

const ERROR_MESSAGE: Record<string, string> = {
  'synthesis-failed': '음성 엔진이 문장을 읽지 못했습니다.',
  'synthesis-unavailable': '이 기기에서 음성 엔진을 사용할 수 없습니다.',
  'audio-busy': '다른 앱이 오디오 장치를 사용 중이라 재생하지 못했습니다.',
  'audio-hardware': '오디오 출력 장치를 찾지 못했습니다.',
  'language-unavailable': '한국어 음성이 이 기기에 설치되어 있지 않습니다.',
  'voice-unavailable': '선택한 음성을 사용할 수 없습니다. AI 튜터 음성 설정을 확인해 주세요.',
  'not-allowed': '브라우저가 음성 재생을 막았습니다. 화면을 한 번 누른 뒤 다시 시도해 주세요.',
  network: '네트워크 음성을 불러오지 못했습니다.',
  'text-too-long': '문장이 너무 길어 읽지 못했습니다.',
};

function settle(c: Chunk, outcome: SpeakOutcome) {
  if (c.settled) return;
  c.settled = true;
  const i = live.indexOf(c);
  if (i >= 0) live.splice(i, 1);
  c.resolve(outcome);
}

/** Splits at sentence ends, keeping chunks short enough for every engine (≤ ~160 chars). */
export function splitForSpeech(text: string, max = 160): string[] {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?。…]+[.!?。…]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = '';
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length > max) {
      if (cur) out.push(cur);
      cur = '';
      // A very long sentence: split at commas/spaces.
      let rest = s;
      while (rest.length > max) {
        const cut = Math.max(rest.lastIndexOf(',', max), rest.lastIndexOf(' ', max));
        const at = cut > max / 2 ? cut + 1 : max;
        out.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      if (rest) cur = rest;
      continue;
    }
    if ((cur + ' ' + s).trim().length > max) {
      out.push(cur);
      cur = s;
    } else cur = `${cur} ${s}`.trim();
  }
  if (cur) out.push(cur);
  return out.length ? out : [text];
}

function speakChunk(text: string, settings: TutorVoiceSettings, lang: string | undefined): Promise<SpeakOutcome> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = resolveVoice(settings.aiTutorVoice);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = lang ?? 'ko-KR';
    }
    utterance.rate = settings.aiTutorSpeechRate;
    const chunk: Chunk = { text, utterance, startedAt: null, settled: false, resolve };
    live.push(chunk);
    utterance.onstart = () => {
      chunk.startedAt = Date.now();
      publish();
    };
    utterance.onend = () => {
      if (chunk.startedAt === null) {
        // Some engines skip onstart for very short lines — still a real end event.
        chunk.startedAt = Date.now();
      }
      const ms = Date.now() - chunk.startedAt;
      settle(chunk, { ok: true, playedMs: ms });
      publish({ lastError: null, lastPlayed: { text, ms, at: Date.now() }, playedCount: state.playedCount + 1 });
    };
    utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
      if (e.error === 'interrupted' || e.error === 'canceled') {
        settle(chunk, { ok: false, reason: 'canceled' });
        publish();
        return;
      }
      const message = ERROR_MESSAGE[e.error] ?? `음성을 재생하지 못했습니다(${e.error}).`;
      settle(chunk, { ok: false, reason: 'failed', message });
      publish({ lastError: message });
    };
    // Chromium can be left in a paused state by an earlier page — make sure it plays.
    if (!paused) window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
    publish();
    watchStart(chunk);
  });
}

/** Reports a chunk the engine never starts (no voice engine / stuck queue) instead of waiting forever. */
function watchStart(chunk: Chunk) {
  const check = () => {
    if (chunk.settled || chunk.startedAt !== null) return;
    // Still waiting behind other lines, or paused by the user → keep waiting.
    const ahead = live.indexOf(chunk) > 0;
    if (ahead || paused) {
      window.setTimeout(check, START_TIMEOUT_MS);
      return;
    }
    const message = '음성이 재생되지 않았습니다(이 기기의 음성 엔진이 응답하지 않습니다). 화면의 글로 수업을 계속할 수 있습니다.';
    settle(chunk, { ok: false, reason: 'failed', message });
    publish({ lastError: message });
  };
  window.setTimeout(check, START_TIMEOUT_MS);
}

/**
 * Speaks a coach line. Resolves when the engine really finished it (or
 * failed / was canceled) — callers may ignore the promise (fire-and-forget
 * keeps working exactly as before).
 */
export function speak(text: string, opts: SpeakOptions | string = {}): Promise<SpeakOutcome> {
  if (!isTtsSupported()) return Promise.resolve({ ok: false, reason: 'unsupported' });
  if (!text.trim()) return Promise.resolve({ ok: false, reason: 'empty' });
  const o: SpeakOptions = typeof opts === 'string' ? { lang: opts } : opts;
  if (o.interrupt) stopSpeaking();
  const settings = o.settings ?? getTutorVoiceSettings();
  const parts = splitForSpeech(text);
  const results = parts.map((p) => speakChunk(p, settings, o.lang));
  return Promise.all(results).then((all) => {
    const failed = all.find((r) => !r.ok && r.reason === 'failed');
    if (failed) return failed;
    const canceled = all.find((r) => !r.ok);
    if (canceled) return canceled;
    return { ok: true, playedMs: all.reduce((s, r) => s + (r.ok ? r.playedMs : 0), 0) };
  });
}

export function stopSpeaking(): void {
  if (!isTtsSupported()) return;
  paused = false;
  for (const c of [...live]) settle(c, { ok: false, reason: 'canceled' });
  window.speechSynthesis.cancel();
  publish();
}

export function pauseSpeaking(): void {
  if (!isTtsSupported() || !live.length) return;
  paused = true;
  window.speechSynthesis.pause();
  publish();
}

export function resumeSpeaking(): void {
  if (!isTtsSupported()) return;
  paused = false;
  window.speechSynthesis.resume();
  publish();
}
