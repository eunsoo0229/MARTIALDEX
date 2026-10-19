import type { PoseFrame, PoseLandmarkName, PoseLandmarkPoint } from '../poseAnalysis/types';
import type { CameraView, CaptureIssue, ClipSignals } from './types';

// Local, free helper signals from MediaPipe poses (no AI call, nothing sent
// anywhere). They are NOT the score: they find where the technique happens
// in a clip, align the reference and the user's attempt in time (different
// lengths and speeds), check that the capture is usable and estimate the
// camera direction. Everything is normalised by the person's own torso
// length, so body size, distance to the camera and position in the frame do
// not matter.

const MIN_VIS = 0.5;
const KEYPOINTS: PoseLandmarkName[] = ['nose', 'leftWrist', 'rightWrist', 'leftElbow', 'rightElbow', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'];

const pt = (f: PoseFrame, n: PoseLandmarkName): PoseLandmarkPoint | null => {
  const p = f[n];
  return p && p.visibility >= MIN_VIS ? p : null;
};
const mid = (a: PoseLandmarkPoint, b: PoseLandmarkPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Hip centre + torso length (shoulder centre ↔ hip centre), or null when the torso isn't visible. */
export function bodyFrame(f: PoseFrame): { origin: { x: number; y: number }; unit: number; shoulderWidth: number } | null {
  const ls = pt(f, 'leftShoulder');
  const rs = pt(f, 'rightShoulder');
  const lh = pt(f, 'leftHip');
  const rh = pt(f, 'rightHip');
  if (!ls || !rs || !lh || !rh) return null;
  const sc = mid(ls, rs);
  const hc = mid(lh, rh);
  const unit = dist(sc, hc);
  if (unit < 0.02) return null;
  return { origin: hc, unit, shoulderWidth: dist(ls, rs) };
}

/** Body-normalised key point positions (torso lengths from the hip centre); null entries = not visible. */
export function normalizedPoints(f: PoseFrame): ({ x: number; y: number } | null)[] | null {
  const b = bodyFrame(f);
  if (!b) return null;
  return KEYPOINTS.map((n) => {
    const p = pt(f, n);
    return p ? { x: (p.x - b.origin.x) / b.unit, y: (p.y - b.origin.y) / b.unit } : null;
  });
}

export function isUsableFrame(f: PoseFrame): boolean {
  return !!bodyFrame(f);
}
export function isFullBodyFrame(f: PoseFrame): boolean {
  return !!bodyFrame(f) && (!!pt(f, 'leftAnkle') || !!pt(f, 'rightAnkle') || (!!pt(f, 'leftKnee') && !!pt(f, 'rightKnee')));
}


/**
 * Body-normalised 3D-ish key points for movement: x/y plus MediaPipe's depth
 * estimate (z, half weight — it is noisier). Without depth a punch thrown
 * straight at a front camera barely moves in 2D.
 */
function movementPoints(f: PoseFrame): ({ x: number; y: number; z: number } | null)[] | null {
  const b = bodyFrame(f);
  if (!b) return null;
  return KEYPOINTS.map((n) => {
    const p = pt(f, n);
    return p ? { x: (p.x - b.origin.x) / b.unit, y: (p.y - b.origin.y) / b.unit, z: (0.5 * (p.z ?? 0)) / b.unit } : null;
  });
}

/** Speed is measured over this window, so a 60 fps live capture and a 12 fps file give the same signal (per-frame differences at 60 fps are mostly detection jitter). */
const SPEED_WINDOW_MS = 80;

/** Movement speed per frame (torso lengths per second, mean over visible key points, over ~80 ms). */
export function motionEnergy(frames: PoseFrame[]): number[] {
  const pts = frames.map(movementPoints);
  let j = 0;
  const raw = frames.map((f, i) => {
    while (j < i - 1 && f.timestampMs - frames[j + 1].timestampMs >= SPEED_WINDOW_MS) j++;
    if (i === 0) return 0;
    const k = f.timestampMs - frames[j].timestampMs >= SPEED_WINDOW_MS || j === i - 1 ? j : i - 1;
    const a = pts[k];
    const b = pts[i];
    const dt = (f.timestampMs - frames[k].timestampMs) / 1000;
    if (!a || !b || dt <= 0) return 0;
    let s = 0;
    let n = 0;
    for (let q = 0; q < a.length; q++) {
      const p = a[q];
      const r = b[q];
      if (p && r) {
        s += Math.hypot(p.x - r.x, p.y - r.y, p.z - r.z);
        n++;
      }
    }
    return n ? s / n / dt : 0;
  });
  // smooth over ~±80 ms whatever the frame rate
  const out = raw.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let q = i; q >= 0 && frames[i].timestampMs - frames[q].timestampMs <= SPEED_WINDOW_MS * 2; q--) {
      s += raw[q];
      n++;
    }
    for (let q = i + 1; q < raw.length && frames[q].timestampMs - frames[i].timestampMs <= SPEED_WINDOW_MS * 2; q++) {
      s += raw[q];
      n++;
    }
    return n ? s / n : 0;
  });
  return out;
}

/**
 * A technique happened when the movement peak clearly stands out from the
 * clip's own noise floor (detection jitter, idle sway): at least
 * PEAK_OVER_NOISE × the noise floor AND an absolute minimum.
 */
export const MIN_PEAK_ENERGY = 0.12;
export const PEAK_OVER_NOISE = 4;

/** Noise floor = the 20th-percentile speed (a short clip can be mostly movement, so not the median). */
function noiseFloor(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length * 0.2)] : 0;
}

/**
 * The performed segment: the contiguous region around the movement peak where
 * speed stays above a share of the peak (short dips bridged), plus a margin.
 */
export function detectSegment(frames: PoseFrame[], energy = motionEnergy(frames)): { startMs: number; endMs: number; peakMs: number; peak: number } | null {
  if (frames.length < 3) return null;
  let peakIdx = 0;
  for (let i = 1; i < energy.length; i++) if (energy[i] > energy[peakIdx]) peakIdx = i;
  const peak = energy[peakIdx];
  const noise = noiseFloor(energy.slice(1));
  if (peak < MIN_PEAK_ENERGY || peak < PEAK_OVER_NOISE * noise) return null;
  const thr = Math.max(noise * 2, peak * 0.2);
  const gapMs = 400;
  const t = (i: number) => frames[i].timestampMs;
  let s = peakIdx;
  let lastActive = peakIdx;
  for (let i = peakIdx - 1; i >= 0; i--) {
    if (energy[i] >= thr) lastActive = i;
    else if (t(lastActive) - t(i) > gapMs) break;
    s = lastActive;
  }
  let e = peakIdx;
  lastActive = peakIdx;
  for (let i = peakIdx + 1; i < energy.length; i++) {
    if (energy[i] >= thr) lastActive = i;
    else if (t(i) - t(lastActive) > gapMs) break;
    e = lastActive;
  }
  const margin = 250;
  return { startMs: Math.max(t(0), t(s) - margin), endMs: Math.min(t(frames.length - 1), t(e) + margin), peakMs: t(peakIdx), peak };
}

/** Front / side / diagonal from the shoulder width relative to the torso (median over still frames). */
export function estimateCameraView(frames: PoseFrame[]): CameraView {
  const ratios = frames
    .map(bodyFrame)
    .filter((b): b is NonNullable<ReturnType<typeof bodyFrame>> => !!b)
    .map((b) => b.shoulderWidth / b.unit)
    .sort((a, b) => a - b);
  if (ratios.length < 3) return 'unknown';
  const m = ratios[Math.floor(ratios.length / 2)];
  return m >= 0.5 ? 'front' : m <= 0.28 ? 'side' : 'diagonal';
}

export const VIEW_LABEL: Record<CameraView, string> = { front: '정면', side: '측면', diagonal: '대각선', back: '뒤', unknown: '알 수 없음' };

/** A warning when the two clips were clearly filmed from different directions (never blocks the comparison). */
export function viewWarning(reference: CameraView, user: CameraView): string | null {
  if (reference === 'unknown' || user === 'unknown' || reference === user) return null;
  if ((reference === 'diagonal' && user !== 'back') || (user === 'diagonal' && reference !== 'back')) return null;
  return `기준 영상은 ${VIEW_LABEL[reference]}, 내 영상은 ${VIEW_LABEL[user]}에서 촬영된 것으로 보입니다. 가려진 동작은 평가에서 제외되거나 신뢰도가 낮아집니다. 가능하면 기준 영상과 같은 방향에서 다시 촬영해 주세요.`;
}

export function clipSignals(frames: PoseFrame[], meanBrightness: number | null): ClipSignals {
  const durationMs = frames.length ? frames[frames.length - 1].timestampMs - frames[0].timestampMs : 0;
  const usable = frames.filter(isUsableFrame).length;
  const full = frames.filter(isFullBodyFrame).length;
  const visibleRatio = frames.length ? usable / frames.length : 0;
  const fullBodyRatio = frames.length ? full / frames.length : 0;
  const energy = motionEnergy(frames);
  const seg = detectSegment(frames, energy);
  const issues: CaptureIssue[] = [];
  if (durationMs < 1200) issues.push('too_short');
  if (frames.length < 10) issues.push('few_frames');
  if (visibleRatio < 0.4) issues.push('no_person');
  else if (fullBodyRatio < 0.5) issues.push('body_cut_off');
  if (meanBrightness !== null && meanBrightness < 40) issues.push('too_dark');
  if (!seg && visibleRatio >= 0.4) issues.push('no_movement');
  return {
    durationMs,
    frameCount: frames.length,
    visibleRatio,
    fullBodyRatio,
    meanBrightness,
    segment: seg ? { startMs: seg.startMs, endMs: seg.endMs, peakMs: seg.peakMs } : null,
    peakEnergy: seg?.peak ?? Math.max(0, ...energy),
    // camera direction from the still (non-performing) frames — the technique itself turns the shoulders
    cameraView: estimateCameraView(stillFrames(frames, seg)),
    issues,
  };
}

function stillFrames(frames: PoseFrame[], seg: { startMs: number; endMs: number } | null): PoseFrame[] {
  const still = seg ? frames.filter((f) => f.timestampMs < seg.startMs || f.timestampMs > seg.endMs) : frames;
  return still.filter(isUsableFrame).length >= 5 ? still : frames;
}

/** Issues that make a comparison pointless (re-record instead of guessing). */
export function blockingIssues(s: ClipSignals): CaptureIssue[] {
  return s.issues.filter((i) => i === 'no_person' || i === 'no_movement' || i === 'too_short' || i === 'few_frames');
}

// ---------------------------------------------------------------- time alignment (DTW)

/** Feature vector per frame for alignment: the normalised key points (missing → previous frame's). */
export function featureSequence(frames: PoseFrame[]): { tMs: number; v: number[] }[] {
  const out: { tMs: number; v: number[] }[] = [];
  let last: number[] | null = null;
  for (const f of frames) {
    const pts = normalizedPoints(f);
    if (!pts) continue;
    const v = pts.flatMap((p, k) => (p ? [p.x, p.y] : last ? [last[2 * k], last[2 * k + 1]] : [0, 0]));
    last = v;
    out.push({ tMs: f.timestampMs, v });
  }
  return out;
}

function resample<T>(xs: T[], max: number): T[] {
  if (xs.length <= max) return xs;
  return Array.from({ length: max }, (_, i) => xs[Math.round((i * (xs.length - 1)) / (max - 1))]);
}

/**
 * Dynamic time warping between two feature sequences (Sakoe–Chiba band).
 * Mirror-invariant per pair is NOT applied — stance matters. Returns the
 * warping path (index pairs) and the mean per-step distance.
 */
export function dtw(a: number[][], b: number[][], band = 0.3): { path: [number, number][]; cost: number } {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return { path: [], cost: Infinity };
  const w = Math.max(Math.ceil(Math.max(n, m) * band), Math.abs(n - m) + 1);
  const D = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(Infinity));
  D[0][0] = 0;
  const d = (i: number, j: number) => {
    let s = 0;
    for (let k = 0; k < a[i].length; k++) s += (a[i][k] - b[j][k]) ** 2;
    return Math.sqrt(s / a[i].length);
  };
  for (let i = 1; i <= n; i++) {
    const jc = Math.round((i * m) / n);
    for (let j = Math.max(1, jc - w); j <= Math.min(m, jc + w); j++) {
      D[i][j] = d(i - 1, j - 1) + Math.min(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1]);
    }
  }
  const path: [number, number][] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    path.push([i - 1, j - 1]);
    const diag = D[i - 1][j - 1];
    const up = D[i - 1][j];
    const left = D[i][j - 1];
    if (diag <= up && diag <= left) {
      i--;
      j--;
    } else if (up <= left) i--;
    else j--;
  }
  path.reverse();
  return { path, cost: D[n][m] / path.length };
}

/** DTW over the two performed segments (feature sequences resampled to ≤ 60 steps). */
export function alignSegments(refFrames: PoseFrame[], refSeg: { startMs: number; endMs: number }, userFrames: PoseFrame[], userSeg: { startMs: number; endMs: number }) {
  const rf = resample(featureSequence(refFrames.filter((f) => f.timestampMs >= refSeg.startMs && f.timestampMs <= refSeg.endMs)), 60);
  const uf = resample(featureSequence(userFrames.filter((f) => f.timestampMs >= userSeg.startMs && f.timestampMs <= userSeg.endMs)), 60);
  if (rf.length < 4 || uf.length < 4) return null;
  const { path, cost } = dtw(rf.map((x) => x.v), uf.map((x) => x.v));
  return { rf, uf, path, cost };
}

/**
 * Maps reference times (ms within the reference clip) to user clip times by
 * DTW over the two performed segments. Works across different speeds and
 * lengths; idle time outside the segments is ignored.
 */
export function alignTimes(refFrames: PoseFrame[], refSeg: { startMs: number; endMs: number }, userFrames: PoseFrame[], userSeg: { startMs: number; endMs: number }, refTimesMs: number[]): { userTimesMs: number[]; cost: number } | null {
  const a = alignSegments(refFrames, refSeg, userFrames, userSeg);
  if (!a) return null;
  const { rf, uf, path, cost } = a;
  const userTimesMs = refTimesMs.map((t) => {
    // nearest reference index, then the mean user time it was matched to
    let best = 0;
    for (let k = 1; k < rf.length; k++) if (Math.abs(rf[k].tMs - t) < Math.abs(rf[best].tMs - t)) best = k;
    const matched = path.filter(([ri]) => ri === best).map(([, ui]) => uf[ui].tMs);
    return matched.length ? matched.reduce((s, x) => s + x, 0) / matched.length : uf[0].tMs;
  });
  return { userTimesMs, cost };
}

/** User times → the matching reference times (inverse of alignTimes, same DTW path). */
export function alignTimesFromUser(refFrames: PoseFrame[], refSeg: { startMs: number; endMs: number }, userFrames: PoseFrame[], userSeg: { startMs: number; endMs: number }, userTimesMs: number[]): number[] | null {
  const a = alignSegments(refFrames, refSeg, userFrames, userSeg);
  if (!a) return null;
  return userTimesMs.map((t) => {
    let best = 0;
    for (let k = 1; k < a.uf.length; k++) if (Math.abs(a.uf[k].tMs - t) < Math.abs(a.uf[best].tMs - t)) best = k;
    const matched = a.path.filter(([, ui]) => ui === best).map(([ri]) => a.rf[ri].tMs);
    return matched.length ? matched.reduce((x, y) => x + y, 0) / matched.length : a.rf[0].tMs;
  });
}

/** Person box over a clip (normalised 0–1 image coordinates; poses have x × aspect, so pass the aspect). */
export function personBox(frames: PoseFrame[], aspect: number, seg?: { startMs: number; endMs: number } | null): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const f of frames) {
    if (seg && (f.timestampMs < seg.startMs - 400 || f.timestampMs > seg.endMs + 400)) continue;
    for (const [k, p] of Object.entries(f)) {
      if (k === 'timestampMs' || !p || typeof p !== 'object' || p.visibility < MIN_VIS) continue;
      const x = p.x / aspect;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
  }
  if (!Number.isFinite(x0)) return null;
  const w = x1 - x0;
  const h = y1 - y0;
  // margins: the nose is not the top of the head, the ankles are not the floor, fists reach past the wrists
  return { x0: Math.max(0, x0 - w * 0.3 - 0.03), x1: Math.min(1, x1 + w * 0.3 + 0.03), y0: Math.max(0, y0 - h * 0.22 - 0.02), y1: Math.min(1, y1 + h * 0.08 + 0.02) };
}

/**
 * The moment of largest extension: when any single key point (with depth)
 * is furthest from where it was at the start of the performed segment —
 * a strike at full reach, a kick at its highest, a shot at its deepest.
 */
export function extremeMs(frames: PoseFrame[], seg: { startMs: number; endMs: number }): number | null {
  const inSeg = frames.filter((f) => f.timestampMs >= seg.startMs && f.timestampMs <= seg.endMs);
  const pts = inSeg.map(movementPoints);
  const first = pts.findIndex(Boolean);
  if (first < 0 || inSeg.length < 3) return null;
  const p0 = pts[first]!;
  let bestT: number | null = null;
  let bestD = -1;
  pts.forEach((p, i) => {
    if (!p) return;
    for (let k = 0; k < p.length; k++) {
      const a = p0[k];
      const b = p[k];
      if (!a || !b) continue;
      const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      if (d > bestD) {
        bestD = d;
        bestT = inSeg[i].timestampMs;
      }
    }
  });
  return bestT;
}

const PART_LABEL: Record<string, string> = {
  nose: '머리',
  leftWrist: '왼손목',
  rightWrist: '오른손목',
  leftElbow: '왼팔꿈치',
  rightElbow: '오른팔꿈치',
  leftKnee: '왼무릎',
  rightKnee: '오른무릎',
  leftAnkle: '왼발목',
  rightAnkle: '오른발목',
};

export interface PoseDifference {
  part: string;
  /** Mean distance over the aligned segment, torso lengths. */
  mean: number;
  /** Largest distance and where (reference / user time) it occurred. */
  max: number;
  refMs: number;
  userMs: number;
  /** Direction of the user's point relative to the reference at that moment (image axes). */
  direction: string;
}

/**
 * Data-driven pose differences after time alignment — no per-technique
 * thresholds: every key point is compared with the SAME point of the
 * reference at the aligned moment (both torso-normalised). Only parts whose
 * largest difference is clear (≥ 0.35 torso lengths) are reported, biggest
 * first. A helper for the AI, not a score.
 */
export function poseDifferences(refFrames: PoseFrame[], refSeg: { startMs: number; endMs: number }, userFrames: PoseFrame[], userSeg: { startMs: number; endMs: number }): PoseDifference[] {
  const a = alignSegments(refFrames, refSeg, userFrames, userSeg);
  if (!a) return [];
  const out: PoseDifference[] = [];
  KEYPOINTS.forEach((name, k) => {
    let sum = 0;
    let best = { d: -1, ri: 0, ui: 0, dx: 0, dy: 0 };
    for (const [ri, ui] of a.path) {
      const dx = a.uf[ui].v[2 * k] - a.rf[ri].v[2 * k];
      const dy = a.uf[ui].v[2 * k + 1] - a.rf[ri].v[2 * k + 1];
      const d = Math.hypot(dx, dy);
      sum += d;
      if (d > best.d) best = { d, ri, ui, dx, dy };
    }
    const mean = sum / a.path.length;
    if (best.d < 0.35) return;
    const dir = [Math.abs(best.dy) >= 0.2 ? (best.dy > 0 ? '아래로' : '위로') : '', Math.abs(best.dx) >= 0.2 ? (best.dx > 0 ? '화면 오른쪽으로' : '화면 왼쪽으로') : ''].filter(Boolean).join(' · ') || '위치 차이';
    out.push({ part: PART_LABEL[name] ?? name, mean: Math.round(mean * 100) / 100, max: Math.round(best.d * 100) / 100, refMs: Math.round(a.rf[best.ri].tMs), userMs: Math.round(a.uf[best.ui].tMs), direction: dir });
  });
  return out.sort((x, y) => y.max - x.max).slice(0, 4);
}

/** Linear mapping of relative positions inside the segment — used when the reference has no local poses (YouTube). */
export function linearTimes(seg: { startMs: number; endMs: number }, fractions: number[]): number[] {
  return fractions.map((f) => seg.startMs + Math.min(1, Math.max(0, f)) * (seg.endMs - seg.startMs));
}

/** Indices of the frames closest to the wanted times (unique, in time order). */
export function pickFrames<T extends { tMs: number }>(frames: T[], timesMs: number[]): T[] {
  const chosen = new Set<number>();
  for (const t of timesMs) {
    let best = -1;
    for (let i = 0; i < frames.length; i++) if (!chosen.has(i) && (best < 0 || Math.abs(frames[i].tMs - t) < Math.abs(frames[best].tMs - t))) best = i;
    if (best >= 0) chosen.add(best);
  }
  return [...chosen].sort((a, b) => a - b).map((i) => frames[i]);
}
