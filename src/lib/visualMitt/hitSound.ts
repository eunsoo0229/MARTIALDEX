export type StrikeType = 'jab' | 'straight' | 'hook';

// 타격 효과음 — synthesized with WebAudio (short filtered noise burst + low
// thump), so there is no audio file to load or license. The AudioContext
// and the noise buffer are created once, on the user's own tap (browsers
// block audio before a user gesture); each hit only schedules a few nodes,
// so back-to-back strikes play without loading delay. Game-style feedback,
// not a measurement of impact.

const SETTINGS_KEY = 'martialdex:padwork-sound';

export interface HitSoundSettings {
  volume: number; // 0–1
  muted: boolean;
}

export function loadHitSoundSettings(): HitSoundSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<HitSoundSettings>) : {};
    return { volume: typeof v.volume === 'number' ? Math.max(0, Math.min(1, v.volume)) : 0.7, muted: !!v.muted };
  } catch {
    return { volume: 0.7, muted: false };
  }
}

export function saveHitSoundSettings(s: HitSoundSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // storage unavailable — setting just isn't remembered
  }
}

const TONE: Record<StrikeType, { thumpHz: number; filterHz: number }> = {
  jab: { thumpHz: 120, filterHz: 2400 },
  straight: { thumpHz: 90, filterHz: 1800 },
  hook: { thumpHz: 75, filterHz: 1300 },
};

export class HitSound {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  settings: HitSoundSettings = loadHitSoundSettings();
  /** Number of sounds actually scheduled (for tests/diagnostics). */
  played = 0;

  /** Call from a user gesture (e.g. the camera start button). Safe to call repeatedly. */
  unlock(): boolean {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return false;
        this.ctx = new Ctor();
        const len = Math.floor(this.ctx.sampleRate * 0.12);
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    } catch {
      return false;
    }
  }

  setSettings(s: HitSoundSettings) {
    this.settings = s;
    saveHitSoundSettings(s);
  }

  /** One sound per call — the caller plays it once per valid strike event. */
  play(type: StrikeType): void {
    if (this.settings.muted || this.settings.volume <= 0 || !this.ctx || !this.noise) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const v = this.settings.volume;
    const tone = TONE[type];

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = tone.filterHz;
    bp.Q.value = 0.9;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.9 * v, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(bp).connect(ng).connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(tone.thumpHz * 1.8, t);
    osc.frequency.exponentialRampToValueAtTime(tone.thumpHz, t + 0.06);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.8 * v, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(og).connect(ctx.destination);

    src.start(t);
    src.stop(t + 0.12);
    osc.start(t);
    osc.stop(t + 0.16);
    this.played++;
  }

  close() {
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.noise = null;
  }
}
