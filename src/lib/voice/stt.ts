import { aiProvider } from '../ai/provider';

// Speech INPUT. The Web Speech recognition API is not usable here: in
// Electron it needs Google API keys Chromium doesn't ship (it errors with
// "network"), and Android System WebView doesn't implement it at all. So the
// mic is recorded locally (getUserMedia + MediaRecorder, both supported in
// Electron and the Android WebView), converted to 16 kHz mono WAV (a format
// Gemini accepts; Chromium's own recording format, webm/opus, isn't on its
// supported list), and transcribed through the SAME Gemini transport every
// other AI feature uses (Electron IPC / gemini-ask Edge Function). No new
// key, no new dependency.
//
// Lifecycle (what the UI shows): IDLE → REQUEST_PERMISSION → LISTENING
// (live input level) → RECOGNIZING → RESULT, or one specific error. Every
// failure says WHICH step failed — "마이크 권한 없음", "입력이 완전히 무음
// (장치/권한)", "소리가 너무 작음", "녹음은 됐지만 알아듣지 못함", "받아쓰기
// 서버 오류" — instead of one generic "말소리가 들리지 않았습니다".
//
// Capture: the tutor's own TTS is stopped while the mic is open, so
// browser echo-cancellation / noise-suppression (which on real hardware
// mangled the recording badly enough that the speech model could not
// understand it) are turned off; the recording is level-normalised before
// it is sent instead.

export type SttErrorCode = 'UNSUPPORTED' | 'PERMISSION_DENIED' | 'MIC_SILENT' | 'NO_SPEECH' | 'NOT_UNDERSTOOD' | 'TRANSCRIBE_FAILED' | 'NO_AUDIO';
export type SttResult = { ok: true; text: string } | { ok: false; code: SttErrorCode; message: string };
export type SttPhase = 'idle' | 'requesting' | 'listening' | 'recognizing' | 'result' | 'error';

export function isVoiceInputSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && typeof window.AudioContext !== 'undefined';
}

export interface Recorder {
  /** Stops recording and resolves with the transcript (or a specific error). */
  stop: (hints?: string[]) => Promise<SttResult>;
  cancel: () => void;
  /** Current input level 0–1 (RMS), for a live meter while listening. */
  level: () => number;
}

const TARGET_RATE = 16000;
/** Below this the input is treated as "nothing said" (≈ -50 dBFS). Exact zeros mean the OS gave a muted stream. */
const MIN_SPEECH_PEAK = 0.003;

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Decodes whatever MediaRecorder produced, resamples to 16 kHz mono and normalises the level (quiet speech is boosted, never clipped). */
export async function blobToWavBase64(blob: Blob): Promise<{ base64: string; seconds: number; peak: number }> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const length = Math.max(1, Math.round(decoded.duration * TARGET_RATE));
    const offline = new OfflineAudioContext(1, length, TARGET_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    if (peak >= MIN_SPEECH_PEAK && peak < 0.5) {
      const gain = Math.min(20, 0.9 / peak);
      for (let i = 0; i < samples.length; i++) samples[i] *= gain;
    }
    return { base64: toBase64(encodeWav(samples, TARGET_RATE)), seconds: decoded.duration, peak };
  } finally {
    ctx.close().catch(() => {});
  }
}

/**
 * Transcribes Korean (or mixed Korean/English technique names) speech from a base64 WAV via Gemini.
 * `hints`: names likely to be said (the current technique etc.) so they are spelled right.
 */
export async function transcribeWav(base64: string, hints: string[] = []): Promise<SttResult> {
  const result = await aiProvider.ask({
    systemInstruction: [
      '당신은 한국어 음성 받아쓰기 엔진이다. 첨부된 음성에서 사람이 말한 내용을 그대로 한국어로 받아 적는다.',
      '마이크 녹음이라 잡음이 있거나 소리가 작을 수 있다. 사람 목소리가 들리면 가장 가능성이 높은 문장을 적는다.',
      '무술 기술 이름(예: Armbar, 암바, Jab, 잽)은 들린 대로 적는다.',
      hints.length
        ? `철자 참고용 이름 목록(이 이름이 음성에서 실제로 들렸을 때만 이 철자로 적는다. 들리지 않은 이름은 절대 적지 않는다. 목록을 그대로 출력하지 않는다): ${hints.slice(0, 12).join(', ')}`
        : '',
      '음성에서 실제로 들린 말만 적는다. 짐작으로 문장을 만들거나 앞의 대화·목록의 말을 끼워 넣지 않는다.',
      '설명, 따옴표, 머리말 없이 받아쓴 문장만 출력한다. 사람 목소리가 전혀 없을 때만 정확히 "(없음)"을 출력한다.',
    ]
      .filter(Boolean)
      .join('\n'),
    contextText: '',
    history: [],
    question: '이 음성을 받아 적어 주세요.',
    imageParts: [{ mimeType: 'audio/wav', data: base64 }],
  });
  if (!result.ok) return { ok: false, code: 'TRANSCRIBE_FAILED', message: `음성을 글로 바꾸는 중 오류가 발생했습니다: ${result.message} 입력창에 적어 주셔도 됩니다.` };
  const text = result.text.trim().replace(/^["'“”]+|["'“”]+$/g, '');
  if (!text || text === '(없음)') return { ok: false, code: 'NOT_UNDERSTOOD', message: '녹음은 되었지만 말씀하신 내용을 알아듣지 못했습니다. 마이크 가까이에서 또렷하게 다시 말씀해 주세요.' };
  return { ok: true, text };
}

/** Electron/macOS: the OS-level microphone permission (the browser prompt alone isn't enough there). */
async function ensureOsMicAccess(): Promise<SttResult | null> {
  const ask = window.martialdex?.requestMicAccess;
  if (!ask) return null;
  try {
    const status = await ask();
    if (status === 'denied' || status === 'restricted') {
      return {
        ok: false,
        code: 'PERMISSION_DENIED',
        message: '마이크 권한이 꺼져 있습니다. 시스템 설정 › 개인정보 보호 및 보안 › 마이크에서 MARTIALDEX를 허용한 뒤 다시 시도해 주세요. 입력창에 적어 주셔도 됩니다.',
      };
    }
  } catch {
    // unknown → let getUserMedia decide
  }
  return null;
}

export async function startRecording(maxSeconds: number): Promise<{ ok: true; recorder: Recorder } | { ok: false; code: SttErrorCode; message: string }> {
  if (!isVoiceInputSupported()) return { ok: false, code: 'UNSUPPORTED', message: '이 기기에서는 음성 입력을 사용할 수 없습니다. 입력창에 적어서 대화해 주세요.' };
  const denied = await ensureOsMicAccess();
  if (denied && !denied.ok) return denied;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 }, video: false });
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return { ok: false, code: 'PERMISSION_DENIED', message: '마이크 권한이 필요합니다. 앱 또는 브라우저 설정에서 마이크를 허용해 주세요. 입력창에 적어 주셔도 됩니다.' };
    if (name === 'NotFoundError') return { ok: false, code: 'UNSUPPORTED', message: '사용할 수 있는 마이크를 찾지 못했습니다. 마이크 연결을 확인해 주세요.' };
    return { ok: false, code: 'UNSUPPORTED', message: `마이크를 시작하지 못했습니다(${name ?? '알 수 없는 오류'}). 잠시 후 다시 시도하시거나 입력창에 적어 주세요.` };
  }
  // Live level meter (does not affect what is recorded).
  let meterCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  try {
    meterCtx = new AudioContext();
    analyser = meterCtx.createAnalyser();
    analyser.fftSize = 512;
    meterCtx.createMediaStreamSource(stream).connect(analyser);
  } catch {
    analyser = null;
  }
  const buf = new Float32Array(512);
  const chunks: Blob[] = [];
  const rec = new MediaRecorder(stream);
  rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunks.push(ev.data); };
  const release = () => {
    stream.getTracks().forEach((t) => t.stop());
    // stop() and cancel() can both end a recording — close the meter only once.
    if (meterCtx && meterCtx.state !== 'closed') meterCtx.close().catch(() => {});
    meterCtx = null;
  };
  const stopped = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });
  rec.start();
  const autoStop = window.setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, maxSeconds * 1000);

  return {
    ok: true,
    recorder: {
      level() {
        if (!analyser) return 0;
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        return Math.min(1, Math.sqrt(sum / buf.length) * 4);
      },
      async stop(hints = []) {
        window.clearTimeout(autoStop);
        if (rec.state !== 'inactive') rec.stop();
        await stopped;
        release();
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (blob.size === 0) return { ok: false, code: 'MIC_SILENT', message: '녹음된 데이터가 없습니다. 마이크 연결과 권한을 확인해 주세요.' };
        let wav: { base64: string; seconds: number; peak: number };
        try {
          wav = await blobToWavBase64(blob);
        } catch {
          return { ok: false, code: 'TRANSCRIBE_FAILED', message: '녹음을 처리하지 못했습니다. 다시 시도하시거나 입력창에 적어 주세요.' };
        }
        if (wav.peak === 0) return { ok: false, code: 'MIC_SILENT', message: '마이크에서 소리가 전혀 들어오지 않습니다. 시스템의 마이크 권한과 입력 장치(음소거 여부)를 확인해 주세요.' };
        if (wav.seconds < 0.3 || wav.peak < MIN_SPEECH_PEAK) return { ok: false, code: 'NO_SPEECH', message: '음성이 인식되지 않았습니다. 마이크 가까이에서 다시 말씀해 주세요.' };
        return transcribeWav(wav.base64, hints);
      },
      cancel() {
        window.clearTimeout(autoStop);
        if (rec.state !== 'inactive') rec.stop();
        release();
      },
    },
  };
}
