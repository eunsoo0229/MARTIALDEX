import type { PoseFrame, PoseLandmarkPoint } from '../poseAnalysis/types';
import { point } from '../poseAnalysis/geometry';

// 복장 기반 선수 식별 — what the user said each fighter wears, compared with
// the real pixel colours under each detected pose's torso / shorts / gloves.
// No extra model: colours are averaged from the actual video frame at the
// pose landmarks MediaPipe already found. This only HELPS identification
// (it is combined with position continuity in personTracker.ts); similar
// outfits, motion blur, lighting and occlusion all make it unreliable, which
// is why every result carries an explicit confidence and an "unclear" state.

export type AttireColor = 'black' | 'white' | 'gray' | 'red' | 'blue' | 'navy' | 'green' | 'yellow' | 'orange' | 'purple' | 'pink' | 'brown';

export const ATTIRE_COLOR_LABEL: Record<AttireColor, string> = {
  black: '검정',
  white: '흰색',
  gray: '회색',
  red: '빨강',
  blue: '파랑',
  navy: '남색',
  green: '초록',
  yellow: '노랑',
  orange: '주황',
  purple: '보라',
  pink: '분홍',
  brown: '갈색',
};

export const ATTIRE_COLORS = Object.keys(ATTIRE_COLOR_LABEL) as AttireColor[];

export const TOP_TYPES = ['래시가드', '티셔츠', '도복', '민소매', '상의 없음'] as const;
export const BOTTOM_TYPES = ['반바지', '긴바지', '도복 하의', '레깅스'] as const;

export interface FighterAttire {
  /** Required: main colour of the top (상의 없음 → skin; then leave null and rely on bottom/gloves). */
  topColor: AttireColor | null;
  topType: string | null;
  /** Required. */
  bottomColor: AttireColor | null;
  bottomType: string | null;
  /** Optional. */
  gloveColor: AttireColor | null;
  memo: string | null;
}

export interface SparringAttire {
  me: FighterAttire;
  opponent: FighterAttire | null;
  /** BJJ etc. only; null = not specified (never assumed). */
  gi: 'gi' | 'nogi' | null;
}

export function emptyAttire(): FighterAttire {
  return { topColor: null, topType: null, bottomColor: null, bottomType: null, gloveColor: null, memo: null };
}

/** At least one clothing colour is needed to use attire at all. */
export function attireUsable(a: FighterAttire | null | undefined): boolean {
  return !!a && !!(a.topColor || a.bottomColor || a.gloveColor);
}

export function describeAttire(a: FighterAttire): string {
  const part = (color: AttireColor | null, type: string | null) => (color ? `${ATTIRE_COLOR_LABEL[color]}${type ? ` ${type}` : ''}` : type ?? '');
  return [part(a.topColor, a.topType), part(a.bottomColor, a.bottomType), a.gloveColor ? `${ATTIRE_COLOR_LABEL[a.gloveColor]} 글러브` : '', a.memo ?? ''].filter(Boolean).join(', ');
}

// ---------------------------------------------------------------- pixel sampling

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Colours actually measured under one pose in one frame (null = that part wasn't visible). */
export interface PersonColors {
  top: AttireColor | null;
  bottom: AttireColor | null;
  gloves: AttireColor | null;
}

function avgBox(img: ImageData, x0: number, y0: number, x1: number, y1: number): Rgb | null {
  const w = img.width;
  const h = img.height;
  const xa = Math.max(0, Math.floor(Math.min(x0, x1) * w));
  const xb = Math.min(w - 1, Math.ceil(Math.max(x0, x1) * w));
  const ya = Math.max(0, Math.floor(Math.min(y0, y1) * h));
  const yb = Math.min(h - 1, Math.ceil(Math.max(y0, y1) * h));
  if (xb - xa < 2 || yb - ya < 2) return null;
  const samples: Rgb[] = [];
  const step = Math.max(1, Math.floor(Math.min(xb - xa, yb - ya) / 12));
  for (let y = ya; y <= yb; y += step) {
    for (let x = xa; x <= xb; x += step) {
      const i = (y * w + x) * 4;
      samples.push({ r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] });
    }
  }
  if (samples.length < 4) return null;
  // Trim the brightest/darkest 20% (highlights, shadows, background bleed).
  samples.sort((a, b) => a.r + a.g + a.b - (b.r + b.g + b.b));
  const cut = Math.floor(samples.length * 0.2);
  const kept = samples.slice(cut, samples.length - cut);
  const n = kept.length || 1;
  return { r: kept.reduce((s, p) => s + p.r, 0) / n, g: kept.reduce((s, p) => s + p.g, 0) / n, b: kept.reduce((s, p) => s + p.b, 0) / n };
}

function mid(a: PoseLandmarkPoint, b: PoseLandmarkPoint): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Named colour of an RGB value (HSV rules). */
export function classifyColor({ r, g, b }: Rgb): AttireColor {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const v = max;
  const s = max === 0 ? 0 : (max - min) / max;
  if (v < 0.2) return 'black';
  if (s < 0.18) return v > 0.78 ? 'white' : v < 0.38 ? 'black' : 'gray';
  let h = 0;
  const d = max - min;
  if (d > 0) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  if (h < 15 || h >= 340) return v < 0.45 ? 'brown' : s < 0.45 && v > 0.7 ? 'pink' : 'red';
  if (h < 40) return v < 0.55 ? 'brown' : 'orange';
  if (h < 70) return 'yellow';
  if (h < 165) return 'green';
  if (h < 255) return v < 0.45 ? 'navy' : 'blue';
  if (h < 300) return 'purple';
  return 'pink';
}

/** Measures top / bottom / glove colours under one pose. */
export function measurePersonColors(img: ImageData, pose: PoseFrame): PersonColors {
  const ls = point(pose, 'leftShoulder');
  const rs = point(pose, 'rightShoulder');
  const lh = point(pose, 'leftHip');
  const rh = point(pose, 'rightHip');
  const lk = point(pose, 'leftKnee');
  const rk = point(pose, 'rightKnee');
  let top: AttireColor | null = null;
  let bottom: AttireColor | null = null;
  let gloves: AttireColor | null = null;
  if (ls && rs && lh && rh) {
    const sh = mid(ls, rs);
    const hp = mid(lh, rh);
    const halfW = Math.abs(ls.x - rs.x) * 0.3;
    const rgb = avgBox(img, sh.x - halfW, sh.y + (hp.y - sh.y) * 0.2, sh.x + halfW, sh.y + (hp.y - sh.y) * 0.8);
    if (rgb) top = classifyColor(rgb);
  }
  if (lh && rh && (lk || rk)) {
    const hp = mid(lh, rh);
    const kn = lk && rk ? mid(lk, rk) : (lk ?? rk)!;
    const halfW = Math.max(0.01, Math.abs(lh.x - rh.x) * 0.45);
    const rgb = avgBox(img, hp.x - halfW, hp.y + (kn.y - hp.y) * 0.1, hp.x + halfW, hp.y + (kn.y - hp.y) * 0.55);
    if (rgb) bottom = classifyColor(rgb);
  }
  const wrists = [point(pose, 'leftWrist'), point(pose, 'rightWrist')].filter((p): p is PoseLandmarkPoint => !!p);
  if (wrists.length && ls && rs) {
    const r = Math.max(0.006, Math.abs(ls.x - rs.x) * 0.18);
    const rgbs = wrists.map((w) => avgBox(img, w.x - r, w.y - r, w.x + r, w.y + r)).filter((x): x is Rgb => !!x);
    if (rgbs.length) gloves = classifyColor({ r: rgbs.reduce((s, c) => s + c.r, 0) / rgbs.length, g: rgbs.reduce((s, c) => s + c.g, 0) / rgbs.length, b: rgbs.reduce((s, c) => s + c.b, 0) / rgbs.length });
  }
  return { top, bottom, gloves };
}

/** Grabs the current video frame (downscaled) so colours can be measured — returns null if the canvas is unavailable/tainted. */
export function grabFrame(video: HTMLVideoElement, maxWidth = 320): ImageData | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const scale = Math.min(1, maxWidth / vw);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- matching

const RELATED: Partial<Record<AttireColor, AttireColor[]>> = {
  navy: ['blue', 'black'],
  blue: ['navy'],
  black: ['navy', 'gray'],
  gray: ['black', 'white'],
  white: ['gray'],
  red: ['pink', 'orange', 'brown'],
  pink: ['red'],
  orange: ['red', 'yellow', 'brown'],
  brown: ['orange', 'red', 'black'],
  purple: ['navy', 'pink'],
};

function colorSimilarity(declared: AttireColor, observed: AttireColor): number {
  if (declared === observed) return 1;
  return RELATED[declared]?.includes(observed) ? 0.5 : 0;
}

/** 0–1 match of measured colours against a declared outfit, plus how much of it could be compared at all. */
export function attireMatch(colors: PersonColors, attire: FighterAttire): { score: number; coverage: number } {
  const parts: [AttireColor | null, AttireColor | null, number][] = [
    [attire.topColor, colors.top, 0.45],
    [attire.bottomColor, colors.bottom, 0.35],
    [attire.gloveColor, colors.gloves, 0.2],
  ];
  let weight = 0;
  let declaredWeight = 0;
  let total = 0;
  for (const [declared, observed, w] of parts) {
    if (!declared) continue;
    declaredWeight += w;
    if (!observed) continue;
    weight += w;
    total += w * colorSimilarity(declared, observed);
  }
  return { score: weight ? total / weight : 0, coverage: declaredWeight ? weight / declaredWeight : 0 };
}

/** "Which detected person is me?" from attire — a suggestion with a margin, never a forced answer. */
export function suggestMe(candidateColors: PersonColors[], attire: SparringAttire): { index: number; confidence: number; reason: string } | null {
  if (!attireUsable(attire.me) || candidateColors.length === 0) return null;
  const scored = candidateColors.map((c, i) => {
    const me = attireMatch(c, attire.me);
    const opp = attire.opponent && attireUsable(attire.opponent) ? attireMatch(c, attire.opponent) : null;
    return { i, me, value: me.score * me.coverage - (opp ? opp.score * opp.coverage * 0.5 : 0) };
  });
  scored.sort((a, b) => b.value - a.value);
  const best = scored[0];
  const second = scored[1];
  if (best.me.coverage === 0 || best.me.score < 0.5) return null;
  const margin = second ? best.value - second.value : best.value;
  const confidence = Math.max(0, Math.min(1, best.me.score * best.me.coverage * (second ? Math.min(1, margin / 0.4) : 1)));
  return { index: best.i, confidence, reason: second && margin < 0.2 ? '복장이 비슷한 사람이 있어 확실하지 않습니다' : '입력한 복장 색과 화면의 색이 일치합니다' };
}

export type FrameIdentity = 'me' | 'opponent' | 'unclear' | 'unobserved';

/** Per-frame check that the tracked person still looks like "me" and not the opponent. */
export function identityOf(colors: PersonColors | null, attire: SparringAttire): FrameIdentity {
  if (!colors || !attireUsable(attire.me)) return 'unobserved';
  const me = attireMatch(colors, attire.me);
  if (me.coverage === 0) return 'unobserved';
  const opp = attire.opponent && attireUsable(attire.opponent) ? attireMatch(colors, attire.opponent) : null;
  if (opp && opp.coverage > 0 && opp.score - me.score >= 0.4) return 'opponent';
  if (me.score >= 0.6 && (!opp || me.score - opp.score >= 0.2)) return 'me';
  return 'unclear';
}
