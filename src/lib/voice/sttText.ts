// Pure helpers shared by the speech-recognition engines (unit-tested in
// .devtools/test-stt-logic.ts): pause-based segmentation of 16 kHz audio for
// the local whisper engine, whisper's well-known "silence hallucinations",
// and de-duplicated accumulation of browser / Android recognition results.

export const STT_RATE = 16000;

export interface SegmenterConfig {
  frameMs: number;
  /** Speech must last this long before a segment opens (ignores clicks). */
  minSpeechMs: number;
  /** A pause this long closes the segment. */
  endSilenceMs: number;
  /** Long speech is cut here (the local engine's fast window is ~10 s). */
  maxSegmentMs: number;
  /** Audio kept from just before speech started (the first syllable). */
  preRollMs: number;
  /** RMS floor below which nothing counts as speech (≈ -46 dBFS). */
  minRms: number;
}

export const DEFAULT_SEGMENTER: SegmenterConfig = { frameMs: 30, minSpeechMs: 150, endSilenceMs: 700, maxSegmentMs: 9500, preRollMs: 250, minRms: 0.005 };

/**
 * Cuts a live 16 kHz mono stream into speech segments at pauses. The speech
 * threshold adapts to the room's noise floor (3× the quietest recent level),
 * never below `minRms`. `push` returns the segments completed by this chunk.
 */
export class SpeechSegmenter {
  private cfg: SegmenterConfig;
  private frameLen: number;
  private pending = new Float32Array(0);
  private pre: Float32Array[] = [];
  private seg: Float32Array[] = [];
  private inSpeech = false;
  private speechRun = 0;
  private silenceRun = 0;
  private segFrames = 0;
  private voicedFrames = 0;
  private noise = 0.002;

  constructor(cfg: Partial<SegmenterConfig> = {}) {
    this.cfg = { ...DEFAULT_SEGMENTER, ...cfg };
    this.frameLen = Math.round((STT_RATE * this.cfg.frameMs) / 1000);
  }

  get speaking(): boolean {
    return this.inSpeech;
  }

  push(chunk: Float32Array): Float32Array[] {
    const out: Float32Array[] = [];
    const buf = new Float32Array(this.pending.length + chunk.length);
    buf.set(this.pending);
    buf.set(chunk, this.pending.length);
    let off = 0;
    while (off + this.frameLen <= buf.length) {
      const frame = buf.slice(off, off + this.frameLen);
      off += this.frameLen;
      const done = this.frame(frame);
      if (done) out.push(done);
    }
    this.pending = buf.slice(off);
    return out;
  }

  /** The segment in progress, if it holds real speech (call when recording stops). */
  flush(): Float32Array | null {
    const seg = this.inSpeech && this.voicedFrames * this.cfg.frameMs >= this.cfg.minSpeechMs ? concat(this.seg) : null;
    this.reset();
    return seg;
  }

  private reset() {
    this.seg = [];
    this.inSpeech = false;
    this.speechRun = 0;
    this.silenceRun = 0;
    this.segFrames = 0;
    this.voicedFrames = 0;
  }

  private frame(f: Float32Array): Float32Array | null {
    let sum = 0;
    for (let i = 0; i < f.length; i++) sum += f[i] * f[i];
    const rms = Math.sqrt(sum / f.length);
    const voiced = rms > Math.max(this.cfg.minRms, this.noise * 3);
    // the noise floor learns only from non-speech frames (quiet ones fast, louder ones slowly) —
    // learning from speech too would make long continuous speech count as "noise" after a while
    if (!voiced) this.noise = rms < this.noise ? this.noise * 0.9 + rms * 0.1 : this.noise * 0.98 + rms * 0.02;
    const preFrames = Math.ceil(this.cfg.preRollMs / this.cfg.frameMs);

    if (!this.inSpeech) {
      this.pre.push(f);
      if (this.pre.length > preFrames + Math.ceil(this.cfg.minSpeechMs / this.cfg.frameMs)) this.pre.shift();
      this.speechRun = voiced ? this.speechRun + 1 : 0;
      if (this.speechRun * this.cfg.frameMs >= this.cfg.minSpeechMs) {
        this.inSpeech = true;
        this.seg = this.pre.splice(0);
        this.segFrames = this.seg.length;
        this.voicedFrames = this.speechRun;
        this.silenceRun = 0;
      }
      return null;
    }
    this.seg.push(f);
    this.segFrames++;
    if (voiced) {
      this.voicedFrames++;
      this.silenceRun = 0;
    } else this.silenceRun++;
    const ended = this.silenceRun * this.cfg.frameMs >= this.cfg.endSilenceMs;
    const tooLong = this.segFrames * this.cfg.frameMs >= this.cfg.maxSegmentMs;
    if (ended || tooLong) {
      // drop most of the trailing silence (keep a little so the last word isn't clipped)
      const keepTail = ended ? this.seg.length - Math.max(0, this.silenceRun - 6) : this.seg.length;
      const seg = concat(this.seg.slice(0, keepTail));
      this.reset();
      return seg;
    }
    return null;
  }
}

export function concat(parts: Float32Array[]): Float32Array {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** 16-bit PCM WAV (mono, 16 kHz), level-normalised so quiet speech is boosted (never clipped). */
export function encodeWav16k(samples: Float32Array): Uint8Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const gain = peak > 0.003 && peak < 0.5 ? Math.min(20, 0.9 / peak) : 1;
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, STT_RATE, true);
  view.setUint32(28, STT_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] * gain));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

/** whisper's audio window for a segment of this length (30 s = 1500); shorter is much faster on CPU. */
export function audioCtxFor(samples: number): number {
  const sec = samples / STT_RATE;
  return Math.max(256, Math.min(1500, Math.ceil((sec / 30) * 1500) + 64));
}

// Phrases whisper is known to produce from silence / noise in Korean
// (subtitle-style endings from its training data) — dropped when they are
// the WHOLE result of a segment.
const HALLUCINATIONS = [
  /^(시청|구독)?\s*해\s*주셔서\s*감사합니다\.?$/,
  /^시청해주셔서 감사합니다\.?$/,
  /^구독과 좋아요(.*)부탁드립니다\.?$/,
  /^(감사합니다|고맙습니다)\.?$/,
  /^(MBC|KBS|SBS|YTN)\s*뉴스.*$/i,
  /^자막\s*(제공|by).*/i,
  /^\(?(음악|박수|웃음|침묵)\)?$/,
  /^\.+$/,
  /^[\s.,!?…~-]*$/,
];

export function cleanWhisperText(text: string, segmentSeconds: number): string {
  const t = text.replace(/\[[^\]]*\]|\([^)]*\)/g, (m) => (/(음악|박수|웃음|music|applause|silence)/i.test(m) ? '' : m)).replace(/\s+/g, ' ').trim();
  if (!t) return '';
  // "감사합니다" alone can be real — only drop it when the segment is short noise-like audio
  const generic = /^(감사합니다|고맙습니다)\.?$/.test(t);
  if (HALLUCINATIONS.some((re) => re.test(t)) && (!generic || segmentSeconds < 1.2)) return '';
  return t;
}

export function joinText(parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** A browser/Android result list → finished text + the live (not yet final) tail. */
export function readRecognitionResults(results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>): { final: string; interim: string } {
  const fin: string[] = [];
  const mid: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    (r.isFinal ? fin : mid).push(r[0].transcript);
  }
  return { final: joinText(fin), interim: joinText(mid) };
}
