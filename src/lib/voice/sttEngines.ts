import { Capacitor } from '@capacitor/core';
import { SpeechRecognition as AndroidSpeech } from '@capacitor-community/speech-recognition';
import { audioCtxFor, cleanWhisperText, encodeWav16k, joinText, readRecognitionResults, SpeechSegmenter, STT_RATE } from './sttText';

// Speech-recognition engines, one per platform:
//   local   — Mac app: whisper.cpp on this Mac (electron/localStt.cjs). Offline
//             after a one-time model download; no API key, quota or cost.
//   android — APK: the phone's own speech recognizer (SpeechRecognizer via
//             @capacitor-community/speech-recognition). Whether it runs
//             on-device or through the phone maker's/Google's service depends
//             on the phone — never advertised as offline.
//   web     — browsers with the Web Speech API (Chrome sends audio to its
//             own speech service — not offline).
//   gemini  — the previous AI-server transcription, offered ONLY as an
//             explicit "AI 받아쓰기" choice on the web/APK when their engine
//             is missing or fails. Never used on the Mac, never automatic.
// Only one recognition session runs at a time across the whole app.

export type SttEngineId = 'local' | 'android' | 'web' | 'gemini' | 'none';
export type SttErrorCode =
  | 'UNSUPPORTED'
  | 'PERMISSION_DENIED'
  | 'MIC_SILENT'
  | 'NO_SPEECH'
  | 'NOT_UNDERSTOOD'
  | 'TRANSCRIBE_FAILED'
  | 'NO_AUDIO'
  | 'NO_MODEL'
  | 'ENGINE_FAILED'
  | 'CANCELLED';
export type SttResult = { ok: true; text: string } | { ok: false; code: SttErrorCode; message: string };
export type SttStartResult<S> = { ok: true; session: S } | { ok: false; code: SttErrorCode; message: string };

export interface SttEngineInfo {
  id: SttEngineId;
  label: string;
  /** 'yes' only for the local engine (after the model is downloaded); otherwise never promised. */
  offline: 'yes' | 'no' | 'unknown';
  /** An explicit fallback the UI may offer when this engine is missing or fails. */
  fallback: 'gemini' | null;
}

export interface SttSessionOptions {
  maxSeconds: number;
  /** Names likely to be said (technique names) — spelling help for engines that take a prompt. */
  hints?: string[];
  /** Live text while listening (finished part + the part still being recognized). */
  onPartial?: (text: string) => void;
  /** The engine stopped by itself with an error (network, permission revoked …) while listening. */
  onEnded?: (r: SttResult) => void;
}

export interface SttSession {
  engine: SttEngineId;
  stop: () => Promise<SttResult>;
  cancel: () => void;
  /** Input level 0–1 for a meter; -1 when the engine doesn't expose one. */
  level: () => number;
}

const ENGINE_OVERRIDE_KEY = 'martialdex:stt-engine'; // QA / troubleshooting only
export const LOCAL_MODEL_KEY = 'martialdex:stt-local-model';

type SRConstructor = new () => SpeechRecognitionLike;
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export function webSpeechConstructor(): SRConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const isAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

const INFO: Record<SttEngineId, SttEngineInfo> = {
  local: { id: 'local', label: '이 Mac에서 직접 인식 (whisper.cpp)', offline: 'yes', fallback: null },
  android: { id: 'android', label: '휴대폰 기본 음성인식', offline: 'unknown', fallback: 'gemini' },
  web: { id: 'web', label: '브라우저 음성인식', offline: 'no', fallback: 'gemini' },
  gemini: { id: 'gemini', label: 'AI 서버 받아쓰기 (Gemini · 사용량 한도 있음)', offline: 'no', fallback: null },
  none: { id: 'none', label: '음성인식 엔진 없음', offline: 'no', fallback: 'gemini' },
};

/** Which engine this runtime has — checked for real, never assumed. */
export async function detectSttEngine(): Promise<SttEngineInfo> {
  try {
    const forced = window.localStorage.getItem(ENGINE_OVERRIDE_KEY) as SttEngineId | null;
    if (forced && INFO[forced]) return INFO[forced];
  } catch {
    // storage blocked — detect normally
  }
  if (window.martialdex?.stt) return INFO.local; // the Mac app never uses the browser engine (it fails with "network" there)
  if (isAndroidApp()) {
    try {
      const { available } = await AndroidSpeech.available();
      return available ? INFO.android : INFO.none;
    } catch {
      return INFO.none;
    }
  }
  return webSpeechConstructor() ? INFO.web : INFO.none;
}

export function engineInfo(id: SttEngineId): SttEngineInfo {
  return INFO[id];
}

export function localModelChoice(): string {
  try {
    return window.localStorage.getItem(LOCAL_MODEL_KEY) || 'small-q5_1';
  } catch {
    return 'small-q5_1';
  }
}

// ---------------------------------------------------------------- one at a time
let active: SttSession | null = null;
function claim(s: SttSession): SttSession {
  if (active && active !== s) active.cancel();
  active = s;
  return s;
}
function release(s: SttSession) {
  if (active === s) active = null;
}

// ---------------------------------------------------------------- mic capture (local engine)
const MIC_DENIED_MAC = '마이크 권한이 꺼져 있습니다. 시스템 설정 › 개인정보 보호 및 보안 › 마이크에서 MARTIALDEX를 허용한 뒤 다시 시도해 주세요. 입력창에 적어 주셔도 됩니다.';

async function osMicDenied(): Promise<boolean> {
  const ask = window.martialdex?.requestMicAccess;
  if (!ask) return false;
  try {
    const s = await ask();
    return s === 'denied' || s === 'restricted';
  } catch {
    return false;
  }
}

function micError(e: unknown): { code: SttErrorCode; message: string } {
  const name = (e as DOMException)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return { code: 'PERMISSION_DENIED', message: '마이크 권한이 필요합니다. 앱 또는 브라우저 설정에서 마이크를 허용해 주세요. 입력창에 적어 주셔도 됩니다.' };
  if (name === 'NotFoundError') return { code: 'UNSUPPORTED', message: '사용할 수 있는 마이크를 찾지 못했습니다. 마이크 연결을 확인해 주세요.' };
  return { code: 'UNSUPPORTED', message: `마이크를 시작하지 못했습니다(${name ?? '알 수 없는 오류'}). 잠시 후 다시 시도하시거나 입력창에 적어 주세요.` };
}

// The worklet just forwards raw input frames; resampling to 16 kHz happens on the main thread.
const WORKLET = `class F extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}registerProcessor('mdx-pcm',F);`;

interface PcmCapture {
  level: () => number;
  /** Highest absolute sample seen (0 = the OS delivered pure silence: muted / no permission). */
  peak: () => number;
  stop: () => void;
}

async function startPcmCapture(onChunk: (pcm16k: Float32Array) => void): Promise<{ ok: true; capture: PcmCapture } | { ok: false; code: SttErrorCode; message: string }> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 }, video: false });
  } catch (e) {
    return { ok: false, ...micError(e) };
  }
  // Preferred: read the mic track's raw samples directly (no audio graph, no output device needed).
  const direct = startTrackReader(stream, onChunk);
  if (direct) return { ok: true, capture: direct };
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  src.connect(analyser);
  const ratio = ctx.sampleRate / STT_RATE;
  let carry = 0; // fractional read position between chunks
  let last = 0;
  let peak = 0;
  const resample = (input: Float32Array) => {
    const out: number[] = [];
    let pos = carry;
    while (pos < input.length - 1) {
      const i = Math.floor(pos);
      const f = pos - i;
      const a = i < 0 ? last : input[i];
      out.push(a + (input[i + 1] - a) * f);
      pos += ratio;
    }
    carry = pos - input.length;
    last = input[input.length - 1] ?? 0;
    for (let i = 0; i < input.length; i++) peak = Math.max(peak, Math.abs(input[i]));
    onChunk(Float32Array.from(out));
  };
  let node: AudioNode;
  try {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const w = new AudioWorkletNode(ctx, 'mdx-pcm');
    w.port.onmessage = (ev) => resample(ev.data as Float32Array);
    node = w;
  } catch {
    // older engines: ScriptProcessor fallback
    const sp = ctx.createScriptProcessor(4096, 1, 1);
    sp.onaudioprocess = (ev) => resample(new Float32Array(ev.inputBuffer.getChannelData(0)));
    node = sp;
  }
  // keep the graph pulling audio without playing it back
  const mute = ctx.createGain();
  mute.gain.value = 0;
  src.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);
  const buf = new Float32Array(512);
  let stopped = false;
  return {
    ok: true,
    capture: {
      level() {
        if (stopped) return 0;
        analyser.getFloatTimeDomainData(buf);
        let s = 0;
        for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        return Math.min(1, Math.sqrt(s / buf.length) * 4);
      },
      peak: () => peak,
      stop() {
        if (stopped) return;
        stopped = true;
        stream.getTracks().forEach((t) => t.stop());
        try {
          node.disconnect();
        } catch {}
        ctx.close().catch(() => {});
      },
    },
  };
}

/** Resampler from any rate to 16 kHz (linear, keeps its phase across chunks). */
function makeResampler(fromRate: number) {
  const ratio = fromRate / STT_RATE;
  let carry = 0;
  let last = 0;
  return (input: Float32Array): Float32Array => {
    const out: number[] = [];
    let pos = carry;
    while (pos < input.length - 1) {
      const i = Math.floor(pos);
      const f = pos - i;
      const a = i < 0 ? last : input[i];
      out.push(a + (input[i + 1] - a) * f);
      pos += ratio;
    }
    carry = pos - input.length;
    last = input[input.length - 1] ?? 0;
    return Float32Array.from(out);
  };
}

type TrackProcessorCtor = new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<{ numberOfFrames: number; sampleRate: number; copyTo: (dest: Float32Array, opts: { planeIndex: number; format?: string }) => void; close: () => void }> };

/** MediaStreamTrackProcessor capture (Chromium 94+, i.e. the Electron app). Null when unavailable. */
function startTrackReader(stream: MediaStream, onChunk: (pcm16k: Float32Array) => void): PcmCapture | null {
  const Ctor = (window as unknown as { MediaStreamTrackProcessor?: TrackProcessorCtor }).MediaStreamTrackProcessor;
  const track = stream.getAudioTracks()[0];
  if (!Ctor || !track) return null;
  let reader: ReadableStreamDefaultReader<{ numberOfFrames: number; sampleRate: number; copyTo: (d: Float32Array, o: { planeIndex: number; format?: string }) => void; close: () => void }>;
  try {
    reader = new Ctor({ track }).readable.getReader();
  } catch {
    return null;
  }
  let stopped = false;
  let peak = 0;
  let level = 0;
  let resample: ((x: Float32Array) => Float32Array) | null = null;
  void (async () => {
    while (!stopped) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done || !value) break;
      try {
        const buf = new Float32Array(value.numberOfFrames);
        value.copyTo(buf, { planeIndex: 0, format: 'f32-planar' });
        resample ??= makeResampler(value.sampleRate);
        let s = 0;
        for (let i = 0; i < buf.length; i++) {
          const a = Math.abs(buf[i]);
          if (a > peak) peak = a;
          s += buf[i] * buf[i];
        }
        level = Math.min(1, Math.sqrt(s / Math.max(1, buf.length)) * 4);
        onChunk(resample(buf));
      } finally {
        value.close();
      }
    }
  })();
  return {
    level: () => (stopped ? 0 : level),
    peak: () => peak,
    stop() {
      if (stopped) return;
      stopped = true;
      void reader.cancel().catch(() => undefined);
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

// ---------------------------------------------------------------- local (Mac · whisper.cpp)
export async function startLocalSession(opts: SttSessionOptions): Promise<SttStartResult<SttSession>> {
  const api = window.martialdex?.stt;
  if (!api) return { ok: false, code: 'UNSUPPORTED', message: '이 환경에서는 로컬 음성인식을 사용할 수 없습니다.' };
  const model = localModelChoice();
  const st = await api.status(model).catch(() => null);
  if (!st?.engineAvailable) return { ok: false, code: 'ENGINE_FAILED', message: '이 앱 빌드에 음성인식 엔진이 포함되어 있지 않습니다. 입력창에 적어 주세요.' };
  if (!st.downloaded) return { ok: false, code: 'NO_MODEL', message: '한국어 음성인식 모델을 처음 한 번 내려받아야 합니다.' };
  if (await osMicDenied()) return { ok: false, code: 'PERMISSION_DENIED', message: MIC_DENIED_MAC };
  void api.warmUp(model); // loads the model while the user starts talking

  const segmenter = new SpeechSegmenter();
  const texts: string[] = [];
  let pending = 0;
  let failure: SttResult | null = null;
  let heardSpeech = false;
  let chain = Promise.resolve();
  let cancelled = false;
  const prompt = opts.hints?.filter(Boolean).length ? `무술 수업 대화입니다. 기술 이름: ${opts.hints.filter(Boolean).slice(0, 8).join(', ')}.` : undefined;
  const emit = () => opts.onPartial?.(joinText(texts) + (pending > 0 ? ' …' : ''));
  const enqueue = (seg: Float32Array) => {
    heardSpeech = true;
    const idx = texts.length;
    texts.push('');
    pending++;
    emit();
    chain = chain.then(async () => {
      if (cancelled) return;
      const r = await api.transcribe(encodeWav16k(seg), { model, prompt, audioCtx: audioCtxFor(seg.length) }).catch((e: unknown) => ({ ok: false as const, code: 'ENGINE_FAILED', message: String(e) }));
      pending--;
      if (r.ok) texts[idx] = cleanWhisperText(r.text, seg.length / STT_RATE);
      else if (!failure) failure = { ok: false, code: r.code === 'NO_MODEL' || r.code === 'MODEL_CORRUPT' ? 'NO_MODEL' : 'ENGINE_FAILED', message: r.message };
      emit();
    });
  };

  const started = await startPcmCapture((pcm) => {
    for (const seg of segmenter.push(pcm)) enqueue(seg);
  });
  if (!started.ok) return started;
  const cap = started.capture;
  const autoStop = window.setTimeout(() => {
    cap.stop();
    const last = segmenter.flush();
    if (last) enqueue(last);
  }, opts.maxSeconds * 1000);

  const session: SttSession = {
    engine: 'local',
    level: () => cap.level(),
    async stop() {
      window.clearTimeout(autoStop);
      cap.stop();
      const last = segmenter.flush();
      if (last) enqueue(last);
      await chain;
      release(session);
      const text = joinText(texts);
      if (text) return { ok: true, text };
      if (failure) return failure;
      if (cap.peak() === 0) return { ok: false, code: 'MIC_SILENT', message: '마이크에서 소리가 전혀 들어오지 않습니다. 시스템의 마이크 권한과 입력 장치(음소거 여부)를 확인해 주세요.' };
      if (!heardSpeech) return { ok: false, code: 'NO_SPEECH', message: '말소리가 감지되지 않았습니다. 마이크 가까이에서 다시 말씀해 주세요.' };
      return { ok: false, code: 'NOT_UNDERSTOOD', message: '녹음은 되었지만 알아듣지 못했습니다. 또렷하게 다시 말씀해 주세요.' };
    },
    cancel() {
      cancelled = true;
      window.clearTimeout(autoStop);
      cap.stop();
      segmenter.flush();
      release(session);
    },
  };
  return { ok: true, session: claim(session) };
}

// ---------------------------------------------------------------- web (Web Speech API)
function webError(err: string): { code: SttErrorCode; message: string } {
  if (err === 'not-allowed') return { code: 'PERMISSION_DENIED', message: '마이크 권한이 거부되었습니다. 브라우저 주소창의 권한 설정에서 마이크를 허용해 주세요.' };
  if (err === 'service-not-allowed') return { code: 'ENGINE_FAILED', message: '이 브라우저에서는 음성인식 서비스를 사용할 수 없습니다.' };
  if (err === 'network') return { code: 'ENGINE_FAILED', message: '브라우저 음성인식 서버에 연결하지 못했습니다 (네트워크 오류).' };
  if (err === 'audio-capture') return { code: 'UNSUPPORTED', message: '마이크를 찾지 못했습니다. 마이크 연결을 확인해 주세요.' };
  if (err === 'language-not-supported') return { code: 'ENGINE_FAILED', message: '이 브라우저 음성인식은 한국어를 지원하지 않습니다.' };
  if (err === 'no-speech') return { code: 'NO_SPEECH', message: '말소리가 감지되지 않았습니다. 다시 말씀해 주세요.' };
  return { code: 'ENGINE_FAILED', message: `브라우저 음성인식 오류 (${err}).` };
}

export async function startWebSession(opts: SttSessionOptions): Promise<SttStartResult<SttSession>> {
  const Ctor = webSpeechConstructor();
  if (!Ctor) return { ok: false, code: 'UNSUPPORTED', message: '이 브라우저는 음성인식을 지원하지 않습니다.' };
  let base = ''; // text committed by earlier runs (the engine ends itself after pauses and is restarted)
  let final = '';
  let interim = '';
  let stopping = false;
  let error: { code: SttErrorCode; message: string } | null = null;
  let restarts = 0;
  let endResolve: (() => void) | null = null;
  // set once the start promise is answered — an engine failure before that IS the start result
  let settled = false;
  let failStart: ((e: { code: SttErrorCode; message: string }) => void) | null = null;
  const startedAt = Date.now();
  let rec: SpeechRecognitionLike;
  const text = () => joinText([base, final]);
  const run = () => {
    rec = new Ctor();
    rec.lang = 'ko-KR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      // rebuilt from the full list every time → a repeated event can never duplicate text
      const r = readRecognitionResults(e.results);
      final = r.final;
      interim = r.interim;
      opts.onPartial?.(joinText([base, final, interim]));
    };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return;
      if (e.error === 'no-speech' && (stopping || text())) return;
      error = webError(e.error);
      if (!settled && error.code !== 'NO_SPEECH') failStart?.(error);
    };
    rec.onend = () => {
      const keepGoing = !stopping && !error && Date.now() - startedAt < opts.maxSeconds * 1000 && restarts < 30;
      if (keepGoing) {
        base = joinText([base, final || interim]);
        final = '';
        interim = '';
        restarts++;
        try {
          run();
          return;
        } catch {
          // fall through to finish
        }
      }
      endResolve?.();
      if (!stopping && error && settled) opts.onEnded?.({ ok: false, ...error });
    };
    rec.start();
  };
  return await new Promise<SttStartResult<SttSession>>((resolve) => {
    failStart = (e) => {
      if (settled) return;
      settled = true;
      try {
        rec.abort();
      } catch {}
      resolve({ ok: false, ...e });
    };
    try {
      run();
    } catch (e) {
      resolve({ ok: false, code: 'ENGINE_FAILED', message: `브라우저 음성인식을 시작하지 못했습니다 (${String(e)}).` });
      return;
    }
    const ended = new Promise<void>((r) => (endResolve = r));
    // Early failures (permission, engine) arrive right after start — report them as a start failure.
    window.setTimeout(() => {
      if (settled) return;
      settled = true;
      if (error && error.code !== 'NO_SPEECH') {
        resolve({ ok: false, ...error });
        return;
      }
      const session: SttSession = {
        engine: 'web',
        level: () => -1,
        async stop() {
          stopping = true;
          try {
            rec.stop();
          } catch {}
          await Promise.race([ended, new Promise((r) => window.setTimeout(r, 3000))]);
          release(session);
          const t = joinText([base, final || interim]);
          if (t) return { ok: true, text: t };
          if (error) return { ok: false, ...error };
          return { ok: false, code: 'NO_SPEECH', message: '말소리가 감지되지 않았습니다. 다시 말씀해 주세요.' };
        },
        cancel() {
          stopping = true;
          try {
            rec.abort();
          } catch {}
          release(session);
        },
      };
      resolve({ ok: true, session: claim(session) });
    }, 400);
  });
}

// ---------------------------------------------------------------- android (device recognizer)
export async function startAndroidSession(opts: SttSessionOptions): Promise<SttStartResult<SttSession>> {
  try {
    const { available } = await AndroidSpeech.available();
    if (!available) return { ok: false, code: 'ENGINE_FAILED', message: '이 휴대폰에서 기본 음성인식 서비스를 찾지 못했습니다.' };
    let perm = await AndroidSpeech.checkPermissions();
    if (perm.speechRecognition !== 'granted') perm = await AndroidSpeech.requestPermissions();
    if (perm.speechRecognition !== 'granted') return { ok: false, code: 'PERMISSION_DENIED', message: '마이크 권한이 필요합니다. 휴대폰 설정 › 앱 › MARTIALDEX › 권한에서 마이크를 허용해 주세요.' };
  } catch (e) {
    return { ok: false, code: 'ENGINE_FAILED', message: `휴대폰 음성인식을 시작하지 못했습니다 (${String(e)}).` };
  }
  let base = '';
  let current = '';
  let stopping = false;
  let restarts = 0;
  const startedAt = Date.now();
  const listeners = [
    await AndroidSpeech.addListener('partialResults', (d) => {
      current = d.matches?.[0] ?? current;
      opts.onPartial?.(joinText([base, current]));
    }),
  ];
  const begin = () => AndroidSpeech.start({ language: 'ko-KR', partialResults: true, popup: false, maxResults: 1 });
  try {
    await begin();
  } catch (e) {
    listeners.forEach((l) => void l.remove());
    return { ok: false, code: 'ENGINE_FAILED', message: `휴대폰 음성인식을 시작하지 못했습니다 (${String(e)}).` };
  }
  // The recognizer ends by itself after a pause (and reports errors only to its first call):
  // keep it going while the user is still talking, keeping the text so far.
  const watch = window.setInterval(async () => {
    if (stopping) return;
    if (Date.now() - startedAt > opts.maxSeconds * 1000) {
      void session.stop();
      return;
    }
    const { listening } = await AndroidSpeech.isListening().catch(() => ({ listening: true }));
    if (!listening && restarts < 30) {
      base = joinText([base, current]);
      current = '';
      restarts++;
      await begin().catch(() => undefined);
    }
  }, 1000);
  let result: Promise<SttResult> | null = null;
  const session: SttSession = {
    engine: 'android',
    level: () => -1,
    stop() {
      result ??= (async () => {
        stopping = true;
        window.clearInterval(watch);
        await AndroidSpeech.stop().catch(() => undefined);
        await new Promise((r) => window.setTimeout(r, 700)); // the final result arrives just after stop
        listeners.forEach((l) => void l.remove());
        release(session);
        const t = joinText([base, current]);
        return t ? { ok: true, text: t } : { ok: false, code: 'NO_SPEECH', message: '말소리가 인식되지 않았습니다. 다시 말씀해 주세요.' };
      })();
      return result;
    },
    cancel() {
      stopping = true;
      window.clearInterval(watch);
      void AndroidSpeech.stop().catch(() => undefined);
      listeners.forEach((l) => void l.remove());
      release(session);
    },
  };
  return { ok: true, session: claim(session) };
}

export { claim as claimSttSession, release as releaseSttSession };
