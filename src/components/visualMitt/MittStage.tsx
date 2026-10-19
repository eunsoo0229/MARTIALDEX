import type { FootMove, MotionArchetype, Target } from '../../lib/visualMitt/archetypes';
import { TARGET_LABEL, THROW_DIR_LABEL } from '../../lib/visualMitt/archetypes';

// AI Visualizing Mitt stage — two schematic SVG views driven by one
// progress value p (0 → 1) for the current step:
//   1) 1인칭 뷰: the mitt holder seen through your eyes, presenting the mitt/
//      shield for this technique, with your own glove (or shin) travelling to
//      it (impact flash at the end). Feints stop short of any mitt.
//   2) 풋워크 뷰 (위에서 본 발): your feet (and the opponent's for takedown
//      entries) moving to where the archetype's footwork puts them, with
//      pivots, a centre-of-gravity marker and a level-change indicator.
// It is a diagram of the motion's path and footwork — not a full-body
// animation, and it measures nothing about the user.

export type Stance = 'orthodox' | 'southpaw';

function mirror(x: number, stance: Stance): number {
  return stance === 'orthodox' ? x : 240 - x;
}
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

/** Viewer-space side sign: an orthodox lead (left) hand lands on the holder's right = viewer's left. */
function sideSign(a: MotionArchetype, stance: Stance): number {
  const s = a.side === 'lead' ? -1 : 1;
  return stance === 'orthodox' ? s : -s;
}

// ---- punch timing ----
// The punch itself always moves at real speed, whatever the combo tempo: a
// slower drill only waits longer BETWEEN techniques, it never shows a slow
// jab. From the moment a technique starts: the mitt pops up (PRESENT), the
// glove/shin snaps to it (TRAVEL), holds on impact (HOLD), snaps back (RETRACT).
export const POV_PRESENT_MS = 60;
export const POV_TRAVEL_MS = 150;
export const POV_HOLD_MS = 110;
export const POV_RETRACT_MS = 140;
/** Moment of impact after the technique starts. */
export const POV_IMPACT_MS = POV_PRESENT_MS + POV_TRAVEL_MS;

/**
 * View progress for `ms` since the technique started: p 0→1 (present + strike), back 0→1 (retract).
 * A defense / guard-control step is drawn about 2.4× slower: the holder's attack has to be SEEN
 * coming before you can answer it (it lands ≈ 0.5 s in, instead of a punch's 0.21 s).
 */
export const DEFENSE_TIME_SCALE = 0.42;
export function povTiming(ms: number, a?: Pick<MotionArchetype, 'kind'>): { p: number; back: number } {
  const t = a && (a.kind === 'defense' || a.kind === 'trap') ? ms * DEFENSE_TIME_SCALE : ms;
  const p = Math.max(0, Math.min(1, t / POV_IMPACT_MS));
  const back = Math.max(0, Math.min(1, (t - POV_IMPACT_MS - POV_HOLD_MS) / POV_RETRACT_MS));
  return { p, back };
}

// ---- 1인칭 미트 뷰 ----
// What you see standing in front of the mitt holder: the holder close up
// (head, shoulders, both mitts), your own two gloves at the bottom of the
// screen, and — for the current technique — the holder presenting the right
// mitt (front-facing for straights, turned sideways for hooks, face-down for
// uppercuts, a kick shield for kicks) while your glove/shin travels to it.
// Viewer coordinates: 320 × 240. s = −1 → screen left, +1 → screen right.

type Pt = { x: number; y: number };
type Facing = 'front' | 'side' | 'down' | 'up' | 'shield';
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function quad(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

/** Where the holder presents the mitt and how it faces, for this archetype + target. */
function povTarget(a: MotionArchetype, target: Target, s: number): { pt: Pt; facing: Facing } {
  if (a.kind === 'entry') return { pt: { x: 160, y: target === 'none' ? 150 : target === 'leg' ? 226 : 214 }, facing: 'front' }; // the contact zone
  if (a.limb === 'foot' || a.limb === 'knee') {
    const y = a.limb === 'knee' ? (target === 'head' ? 110 : 168) : target === 'head' ? 92 : target === 'leg' ? 208 : 160;
    if (a.path === 'stomp') return { pt: { x: 160 + s * 22, y: 214 }, facing: 'up' };
    if (a.path === 'crescent') return { pt: { x: 160 + s * 30, y }, facing: 'shield' };
    // hook / twist kicks land on the side opposite to a roundhouse with the same leg
    if (a.path === 'hookKick' || a.path === 'twist') return { pt: { x: 160 - s * 92, y }, facing: 'shield' };
    const center = (a.limb === 'knee' && a.path !== 'round') || a.path === 'thrust' || a.path === 'spin' || a.path === 'axe';
    return { pt: { x: center ? 160 + s * 14 : 160 + s * 92, y }, facing: 'shield' };
  }
  if (a.wide) return { pt: { x: 160 + s * 112, y: target === 'body' ? 170 : 104 }, facing: 'side' };
  if (a.path === 'elbowBack') return { pt: { x: 160 + s * 128, y: 196 }, facing: 'side' };
  if (a.path === 'hammer') return { pt: { x: 160 + s * 40, y: target === 'body' ? 176 : 132 }, facing: 'up' };
  if (target === 'body') return { pt: { x: 160 + s * (a.path === 'hook' ? 58 : 42), y: 182 }, facing: a.path === 'hook' ? 'side' : 'front' };
  switch (a.path) {
    case 'hook':
      // held beside the holder's head on the mirror side, face turned in toward the incoming hook
      return { pt: { x: 160 + s * 66, y: 104 }, facing: 'side' };
    case 'overhand':
      // the cross mitt, held a little higher and turned in — the fist loops over the top into it
      return { pt: { x: 160 + s * 66, y: 86 }, facing: 'side' };
    case 'elbowH':
    case 'backfist':
    case 'chop':
      return { pt: { x: 160 + s * 92, y: 104 }, facing: 'side' };
    case 'uppercut':
    case 'elbowUp':
      return { pt: { x: 160 + s * 26, y: 150 }, facing: 'down' };
    default:
      return { pt: { x: 160 + s * 46, y: 104 }, facing: 'front' };
  }
}

/** The striking glove/shin's route from its guard position to the mitt. */
function strikeRoute(a: MotionArchetype, from: Pt, to: Pt, s: number): { at: (t: number) => Pt; d: string } {
  let c: Pt | null = null;
  // A hand hook swings out on its own side, then comes across level into the mitt's inner face.
  if (a.path === 'hook' && a.limb === 'hand') c = { x: from.x + s * 64, y: to.y + 8 };
  else if (a.path === 'hook' || a.path === 'elbowH' || a.path === 'backfist' || a.path === 'chop') c = { x: to.x + s * 95, y: from.y - 30 };
  else if (a.path === 'hammer') c = { x: to.x + s * 30, y: to.y - 110 };
  else if (a.path === 'elbowSide' || a.path === 'elbowBack') c = { x: (from.x + to.x) / 2, y: to.y + 10 };
  else if (a.path === 'hookKick') c = { x: 160 - s * 230, y: to.y - 50 };
  else if (a.path === 'twist') c = { x: 160, y: to.y + 70 };
  else if (a.path === 'crescent') c = { x: 160 + s * 170, y: -40 };
  else if (a.path === 'stomp') c = { x: to.x + s * 40, y: 60 };
  else if (a.path === 'overhand') c = { x: to.x + s * 80, y: to.y - 70 };
  else if (a.path === 'uppercut' || a.path === 'elbowUp') c = { x: to.x + s * 6, y: 250 };
  else if (a.path === 'round') c = { x: 160 + s * 175, y: to.y + 20 };
  else if (a.path === 'axe') c = { x: to.x + s * 10, y: -40 };
  if (!c) return { at: (t) => lerpPt(from, to, t), d: `M ${from.x} ${from.y} L ${to.x} ${to.y}` };
  const cc = c;
  return { at: (t) => quad(from, cc, to, t), d: `M ${from.x} ${from.y} Q ${cc.x} ${cc.y} ${to.x} ${to.y}` };
}

function Mitt({ x, y, facing, hit, scale = 1, s, testId }: { x: number; y: number; facing: Facing; hit?: boolean; scale?: number; s: number; testId?: string }) {
  const face = hit ? 'var(--mitt-hit)' : 'var(--pov-mitt-face)';
  const k = hit ? scale * 0.94 : scale; // a hit pushes the mitt back a little
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`} className="pov-mitt" data-testid={testId} data-facing={facing}>
      {facing === 'front' && (
        <>
          <ellipse rx="30" ry="34" className="pov-mitt__rim" />
          <ellipse rx="22" ry="26" fill={face} className="pov-mitt__face" />
          <circle r="7" className="pov-mitt__spot" />
        </>
      )}
      {facing === 'side' && (
        <>
          <ellipse rx="14" ry="34" className="pov-mitt__rim" />
          <ellipse cx={-s * 5} rx="8" ry="27" fill={face} className="pov-mitt__face" />
        </>
      )}
      {facing === 'down' && (
        <>
          <ellipse rx="33" ry="13" className="pov-mitt__rim" />
          <ellipse cy="3" rx="25" ry="8" fill={face} className="pov-mitt__face" />
        </>
      )}
      {facing === 'up' && (
        <>
          <ellipse rx="33" ry="13" className="pov-mitt__rim" />
          <ellipse cy="-3" rx="25" ry="8" fill={face} className="pov-mitt__face" />
        </>
      )}
      {facing === 'shield' && (
        <>
          <rect x="-21" y="-40" width="42" height="80" rx="12" className="pov-mitt__rim" />
          <rect x="-15" y="-33" width="30" height="66" rx="9" fill={face} className="pov-mitt__face" />
        </>
      )}
    </g>
  );
}

function Glove({ p, scale, s, color, base = { x: 160 + s * 112, y: 262 } }: { p: Pt; scale: number; s: number; color: string; base?: Pt }) {
  // forearm from the edge of the screen into the glove
  const w0 = 26;
  const w1 = 15 * scale;
  return (
    <g className="pov-glove">
      <path d={`M ${base.x - w0} ${base.y} L ${p.x - w1} ${p.y + 10 * scale} L ${p.x + w1} ${p.y + 10 * scale} L ${base.x + w0} ${base.y} Z`} className="pov-glove__arm" />
      <g transform={`translate(${p.x} ${p.y}) scale(${scale})`}>
        <rect x="-19" y="14" width="38" height="20" rx="6" className="pov-glove__cuff" />
        <ellipse rx="32" ry="29" fill={color} className="pov-glove__fist" />
        <ellipse cx={s * -24} cy="8" rx="9" ry="14" fill={color} className="pov-glove__fist" />
        <path d="M -20 -12 Q 0 -22 20 -12" className="pov-glove__shine" />
      </g>
    </g>
  );
}

/** Throw direction, seen from your eyes: back = away from you, front/over = toward you. */
function ThrowArrow({ dir, s, t }: { dir: NonNullable<MotionArchetype['throwDir']>; s: number; t: number }) {
  const paths: Record<typeof dir, string> = {
    back: 'M 160 150 L 160 70',
    front: 'M 160 120 L 160 205',
    side: `M 160 150 L ${160 + s * 110} 150`,
    over: 'M 160 140 Q 160 20 160 205',
    down: 'M 160 110 L 160 215',
  };
  return (
    <g className="pov-throw" data-testid="mitt-throw" data-dir={dir} opacity={0.35 + 0.65 * t}>
      <path d={paths[dir]} className="pov-throw__line" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - t} markerEnd="url(#pov-arrow)" />
      <defs>
        <marker id="pov-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="pov-throw__head" />
        </marker>
      </defs>
      <text x={dir === 'side' ? 160 + s * 60 : 236} y={dir === 'side' ? 136 : dir === 'back' ? 84 : 140} textAnchor="middle" className="pov-label">
        {THROW_DIR_LABEL[dir]}
      </text>
    </g>
  );
}

// ---- defense / guard control (the holder attacks, you answer) ----
// The holder mirrors your stance: their lead hand is on your screen's right when you stand orthodox.
// Evasions move YOUR view (the holder and the punch shift the other way, so the punch lands where
// your head was — a miss); guards bring your glove/shin/shoulder to where the attack lands.
const holderX = (side: 'lead' | 'rear', st: number) => (side === 'lead' ? st : -st);
const yourX = (side: 'lead' | 'rear', st: number) => (side === 'lead' ? -st : st);
const FACE: Pt = { x: 160, y: 150 };

function incomingRoute(inc: NonNullable<MotionArchetype['incoming']>, hs: number, st: number): { from: Pt; to: Pt; c: Pt | null; shield: boolean } {
  const from = { x: 160 + hs * 34, y: 112 };
  const body = inc.target === 'body';
  switch (inc.path) {
    case 'hook':
      return { from, to: body ? { x: 160 + hs * 34, y: 202 } : { x: 160 + hs * 30, y: 142 }, c: { x: 160 + hs * 175, y: body ? 214 : 118 }, shield: false };
    case 'uppercut':
      return { from, to: { x: 160 + hs * 8, y: body ? 205 : 152 }, c: { x: 160 + hs * 26, y: 248 }, shield: false };
    case 'kick': {
      const leg = inc.target === 'leg';
      const at = { x: 160 + yourX('lead', st) * (leg ? 78 : 52), y: leg ? 226 : 200 };
      return { from: { x: 160 + hs * 70, y: leg ? 214 : 190 }, to: at, c: { x: 160 + hs * 200, y: at.y + 10 }, shield: true };
    }
    case 'teep':
      return { from: { x: 160 + hs * 24, y: 196 }, to: { x: 160 + hs * 4, y: 206 }, c: null, shield: true };
    default:
      return { from, to: body ? { x: 160 + hs * 10, y: 204 } : { x: 160 + hs * 6, y: 150 }, c: null, shield: false };
  }
}
const routeAt = (r: { from: Pt; to: Pt; c: Pt | null }, t: number): Pt => (r.c ? quad(r.from, r.c, r.to, t) : lerpPt(r.from, r.to, t));

function DefenseView({ archetype: a, stance, p, back }: { archetype: MotionArchetype; stance: Stance; p: number; back: number }) {
  const st = stance === 'orthodox' ? 1 : -1;
  const ret = 1 - ease(back);
  const glove = (side: number) => (side === -1 ? 'var(--pov-glove-left)' : 'var(--pov-glove-right)');
  const guardPt = (side: number): Pt => ({ x: 160 + side * 86, y: 226 });
  const idleMitt = (side: number): Pt => ({ x: 160 + side * 34, y: 112 });

  // ---------- trap: reach the holder's guard hand and drive it down
  if (a.kind === 'trap' && a.trap) {
    const th = holderX(a.trap.hand, st);
    const gs = yourX(a.side, st);
    const reach = ease(clamp01(p / 0.55)) * ret;
    const down = ease(clamp01((p - 0.55) / 0.35)) * ret * (a.trap.how === 'paw' ? 22 : 62);
    const mitt = { x: idleMitt(th).x, y: idleMitt(th).y + down };
    const g = lerpPt(guardPt(gs), { x: mitt.x, y: mitt.y - 6 }, reach);
    const done = p >= 0.9 && back === 0;
    return (
      <svg viewBox="0 0 320 240" className="mitt-view mitt-view--front mitt-view--pov" role="img" aria-label={`1인칭: ${a.label}`} data-testid="mitt-front" data-kind="trap" data-path="trap" data-side={a.side} data-hit={done ? 'true' : 'false'}>
        <rect width="320" height="240" className="pov-wall" />
        <path d="M 0 196 L 320 196 L 320 240 L 0 240 Z" className="pov-floor" />
        <path d="M 96 160 Q 160 138 224 160 L 248 250 L 72 250 Z" className="pov-holder__shirt" />
        <rect x="149" y="118" width="22" height="28" rx="6" className="pov-holder__skin" />
        <ellipse cx="160" cy="96" rx="25" ry="30" className="pov-holder__skin" />
        <circle cx="151" cy="94" r="2" className="pov-holder__eye" />
        <circle cx="169" cy="94" r="2" className="pov-holder__eye" />
        {[-1, 1].map((side) => {
          const m = side === th ? mitt : idleMitt(side);
          const S = { x: 160 + side * 60, y: 166 };
          return <path key={`arm${side}`} d={`M ${S.x} ${S.y} L ${m.x + side * 16} ${Math.max(m.y + 58, S.y + 22)} L ${m.x} ${m.y + 16}`} className="pov-holder__arm" />;
        })}
        {[-1, 1].map((side) => <Mitt key={`m${side}`} x={side === th ? mitt.x : idleMitt(side).x} y={side === th ? mitt.y : idleMitt(side).y} facing="front" scale={side === th ? 1 : 0.72} s={side} testId={side === th ? 'mitt-target' : undefined} />)}
        {done && (
          <g data-testid="mitt-defense-result">
            <ellipse cx={160 + th * 16} cy="96" rx="22" ry="26" className="mitt-zone" />
            <text x={160 + th * 16} y="56" textAnchor="middle" className="pov-pow">{a.trap.how === 'paw' ? '툭!' : '가드 내림!'}</text>
          </g>
        )}
        {[-1, 1].map((side) => (
          <Glove key={`g${side}`} p={side === gs ? g : guardPt(side)} scale={side === gs ? 1 - 0.35 * reach : 1} s={side} color={glove(side)} />
        ))}
        <text x="160" y="22" textAnchor="middle" className="pov-label">{a.label} — 상대 {a.trap.hand === 'lead' ? '앞손' : '뒷손'} 가드를 {a.trap.how === 'paw' ? '툭 쳐서 흔들기' : '눌러 내리기'}</text>
      </svg>
    );
  }

  // ---------- defense
  const inc = a.incoming ?? { side: 'lead' as const, path: 'straight' as const, target: 'head' as const };
  const hs = holderX(inc.side, st);
  const route = incomingRoute(inc, hs, st);
  const atk = ease(clamp01(p / 0.92)) * ret; // the holder's attack (reaches you at p ≈ 0.92)
  const resp = ease(clamp01((p - 0.28) / 0.55)) * ret; // your answer, ready before impact
  const ev = a.evade;
  // A roll is timed to the punch: the bottom of the U is while the hook sweeps over (u ≈ 0.5–0.9),
  // and with `angle` you keep travelling past the arm and come up at the holder's side (사각).
  const u = ev?.u ? clamp01((p - 0.4) / 0.6) : 0;
  // you STAY at the angle (no drift back to the front) — the next technique, the counter, starts from there
  const angleK = ev?.angle ? ease(clamp01((u - 0.6) / 0.4)) : 0;
  const keep = ev?.angle ? 1 : ret;
  // drawn a little larger than life so the miss reads clearly on a small screen
  const ex = ev ? (ev.u ? ev.dx * (1.6 + (ev.angle ? 0.6 : 0)) * st * ease(u) * keep : ev.dx * 1.6 * st * resp) : 0;
  const ey = ev ? (ev.u ? ev.dy * 1.2 * Math.sin(Math.PI * u) * keep : ev.dy * 1.2 * resp) : 0;
  const sc = ev?.back ? 1 - ev.back * resp : 1;
  const gs = yourX(a.side, st);
  const g = a.guard;

  // where your guard meets the attack (null = no contact: an evasion)
  let stop: Pt | null = null;
  const gloves: Record<number, Pt> = { [-1]: guardPt(-1), [1]: guardPt(1) };
  let shin: Pt | null = null;
  let shoulder: Pt | null = null;
  let deflect: Pt = { x: 0, y: 0 };
  if (g === 'parry' || g === 'kickParry') {
    const meet = routeAt(route, 0.8);
    gloves[gs] = lerpPt(guardPt(gs), meet, resp);
    deflect = inc.target === 'body' && g === 'parry' ? { x: 0, y: 46 } : { x: -gs * 70, y: 6 };
  } else if (g === 'catch') {
    stop = { x: 160 + gs * 14, y: 150 };
    gloves[gs] = lerpPt(guardPt(gs), stop, resp);
  } else if (g === 'block') {
    stop = { x: 160 + hs * 42, y: 140 };
    gloves[gs] = lerpPt(guardPt(gs), stop, resp);
  } else if (g === 'cover') {
    gloves[-1] = lerpPt(guardPt(-1), { x: 132, y: 142 }, resp);
    gloves[1] = lerpPt(guardPt(1), { x: 188, y: 142 }, resp);
    stop = { x: 160 + hs * 30, y: 142 };
  } else if (g === 'elbowBlock') {
    stop = { x: 160 + hs * 52, y: 202 };
    gloves[gs] = lerpPt(guardPt(gs), { x: 160 + gs * 52, y: 176 }, resp);
  } else if (g === 'shoulderRoll') {
    shoulder = lerpPt({ x: 160 + yourX('lead', st) * 92, y: 290 }, { x: 160 + yourX('lead', st) * 46, y: 196 }, resp);
    stop = { x: shoulder.x, y: shoulder.y - 26 };
  } else if (g === 'check') {
    gloves[-1] = lerpPt(guardPt(-1), { x: 128, y: 150 }, resp);
    gloves[1] = lerpPt(guardPt(1), { x: 192, y: 150 }, resp);
    shin = lerpPt({ x: 160 + yourX('lead', st) * 92, y: 262 }, { x: 160 + yourX('lead', st) * 80, y: 214 }, resp);
    stop = { x: shin.x, y: shin.y };
  } else if (g === 'kickCatch') {
    stop = { x: 160 + gs * 56, y: 204 };
    gloves[gs] = lerpPt(guardPt(gs), stop, resp);
    gloves[-gs] = lerpPt(guardPt(-gs), { x: 160 - gs * 30, y: 150 }, resp); // other hand guards the face
  }

  // the incoming fist / shield (scene coordinates — it moves with the holder)
  let ip = routeAt(route, atk);
  if (stop && atk > 0.8) ip = lerpPt(routeAt(route, 0.8), stop, (atk - 0.8) / 0.2);
  if ((g === 'parry' || g === 'kickParry') && atk > 0.8) {
    const k = (atk - 0.8) / 0.2;
    ip = { x: ip.x + deflect.x * k, y: ip.y + deflect.y * k };
  }
  const iScale = route.shield ? 0.9 + 0.3 * atk : 0.72 + 0.5 * atk;
  const contact = p >= 0.9 && back === 0;
  const evaded = !g || g === 'shoulderRoll' ? !!ev : false;
  const result = !contact ? null : evaded && !g ? (ev?.angle ? '사각 확보!' : '피했다!') : g === 'parry' || g === 'kickParry' ? '흘렸다!' : g === 'catch' || g === 'kickCatch' ? '잡았다!' : '막았다!';
  const ATTACK_LABEL: Record<string, string> = { straight: inc.side === 'lead' ? '잽' : '크로스', hook: inc.side === 'lead' ? '리드 훅' : '뒷손 훅', uppercut: '어퍼', kick: inc.target === 'leg' ? '로우킥' : '미들킥', teep: '팁' };
  const attackName = `${inc.target === 'body' && inc.path !== 'kick' && inc.path !== 'teep' ? '바디 ' : ''}${ATTACK_LABEL[inc.path]}`;
  const dirLabel = ev ? (ev.back ? '뒤로' : Math.abs(ev.dy) > Math.abs(ev.dx) && !ev.u ? '아래로' : ev.u ? (ev.dx * st > 0 ? 'U자 → 오른쪽' : 'U자 → 왼쪽') : ev.dx * st > 0 ? '오른쪽으로' : '왼쪽으로') : '';
  // at the angle the holder is beside you, still facing where you were — drawn turned away a little
  const sceneT = `translate(${-ex} ${-ey}) translate(160 130) rotate(${-st * 9 * angleK}) scale(${sc}) translate(-160 -130)`;

  return (
    <svg viewBox="0 0 320 240" className="mitt-view mitt-view--front mitt-view--pov" role="img" aria-label={`1인칭: 상대 ${attackName} → ${a.label}`} data-testid="mitt-front" data-kind="defense" data-path={inc.path} data-side={a.side} data-hit={contact ? 'true' : 'false'}>
      <rect width="320" height="240" className="pov-wall" />
      <g transform={sceneT}>
        <path d="M -160 196 L 480 196 L 480 320 L -160 320 Z" className="pov-floor" />
        <path d="M 96 160 Q 160 138 224 160 L 248 250 L 72 250 Z" className="pov-holder__shirt" />
        <rect x="149" y="118" width="22" height="28" rx="6" className="pov-holder__skin" />
        <ellipse cx="160" cy="96" rx="25" ry="30" className="pov-holder__skin" />
        <circle cx="151" cy="94" r="2" className="pov-holder__eye" />
        <circle cx="169" cy="94" r="2" className="pov-holder__eye" />
        {[-1, 1].map((side) => {
          const S = { x: 160 + side * 60, y: 166 };
          const punching = side === hs && !route.shield;
          const m = punching ? ip : idleMitt(side);
          // the punching arm extends from the shoulder to the mitt; the other stays in guard
          return <path key={`arm${side}`} d={punching ? `M ${S.x} ${S.y} L ${m.x} ${m.y + 6}` : `M ${S.x} ${S.y} L ${m.x + side * 16} ${Math.max(m.y + 58, S.y + 22)} L ${m.x} ${m.y + 16}`} className="pov-holder__arm" />;
        })}
        {[-1, 1].map((side) => (side === hs && !route.shield ? null : <Mitt key={`idle${side}`} x={idleMitt(side).x} y={idleMitt(side).y} facing="front" scale={0.72} s={side} />))}
        {route.c && atk > 0.02 && atk < 0.98 && <path d={`M ${route.from.x} ${route.from.y} Q ${route.c.x} ${route.c.y} ${route.to.x} ${route.to.y}`} className="mitt-path pov-route mitt-path--incoming" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - atk} />}
        <g data-testid="mitt-incoming">
          <Mitt x={ip.x} y={ip.y} facing={route.shield ? 'shield' : 'front'} scale={iScale} s={hs} hit={contact && !!stop} testId="mitt-target" />
        </g>
      </g>
      {/* where YOUR head / body is — the attack aims here */}
      {inc.target !== 'leg' && <ellipse cx={FACE.x} cy={inc.target === 'body' ? 204 : FACE.y} rx="24" ry="28" className="pov-self-zone" data-testid="mitt-self-zone" />}
      {ev && resp > 0.05 && (() => {
        // the arrow shows the direction; capped so it stays on screen
        const ax = Math.max(-110, Math.min(110, ex * 1.5));
        const y0 = inc.target === 'body' ? 204 : 150;
        const ay = Math.min(70, ey * 1.2) + (ev.back ? -18 * resp : 0);
        return (
          <g className="mitt-level" data-testid="mitt-evade" data-dir={dirLabel}>
            <path d={`M 160 ${y0} L ${160 + ax} ${y0 + ay}`} markerEnd="url(#pov-def-arrow)" />
            <text x={Math.max(40, Math.min(280, 160 + ax))} y={Math.min(232, y0 + ay + 22)} textAnchor="middle">{dirLabel}</text>
          </g>
        );
      })()}
      <defs>
        <marker id="pov-def-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="pov-throw__head" />
        </marker>
      </defs>
      {shin && (
        <g className="pov-shin">
          <line x1={160 + yourX('lead', st) * 96} y1={262} x2={shin.x} y2={shin.y} strokeWidth={34} />
          <circle cx={shin.x} cy={shin.y} r={16} />
        </g>
      )}
      {shoulder && <ellipse cx={shoulder.x} cy={shoulder.y} rx="64" ry="34" className="pov-glove__arm" data-testid="mitt-shoulder" />}
      {[-1, 1].map((side) => {
        const moved = gloves[side].x !== guardPt(side).x || gloves[side].y !== guardPt(side).y;
        return <Glove key={`g${side}`} p={gloves[side]} scale={moved ? 0.92 : 1} s={side} color={glove(side)} />;
      })}
      <text x="160" y="22" textAnchor="middle" className="pov-label" data-testid="mitt-incoming-label">
        상대 {attackName} → {a.label}
      </text>
      {result && (
        <text x="160" y="62" textAnchor="middle" className="pov-pow" data-testid="mitt-defense-result">
          {result}
        </text>
      )}
      {ev?.angle && angleK > 0.5 && (
        <text x="160" y="84" textAnchor="middle" className="pov-label" data-testid="mitt-angle">
          상대 {inc.side === 'lead' ? '앞손' : '뒷손'} 바깥 사각 — 바로 카운터
        </text>
      )}
    </svg>
  );
}

export function FrontView({ archetype: a, target, stance, p, back = 0 }: { archetype: MotionArchetype; target: Target; stance: Stance; p: number; back?: number }) {
  const s = sideSign(a, stance);
  if (a.kind === 'defense' || a.kind === 'trap') return <DefenseView archetype={a} stance={stance} p={p} back={back} />;
  const feint = a.kind === 'feint';
  const entry = a.kind === 'entry';
  const handLike = a.limb === 'hand' || a.limb === 'elbow';
  // Pad holding mirrors you: your lead hand's punches go to the holder's mitt OPPOSITE it (orthodox
  // jab → holder's left mitt, on your right side), and a hook lands on that SAME mitt turned inward
  // (jab + lead hook → one mitt, cross + rear hook → the other) — the standard pad convention.
  // Overhands and uppercuts follow the same rule (rear overhand → the cross mitt, angled down).
  // A punch thrown out to the SIDE (옆지르기) stays on its own side.
  const ts = handLike && !a.wide && (a.path === 'straight' || a.path === 'hook' || a.path === 'overhand' || a.path === 'uppercut') ? -s : s;
  const { pt: T, facing } = povTarget(a, target, ts);
  // Timeline of one step: the holder presents (0–0.25), the strike travels (0.25–0.96), impact (≥ 0.96).
  const split = POV_PRESENT_MS / POV_IMPACT_MS;
  const present = ease(clamp01(p / split));
  const travel = ease(clamp01((p - split) / (1 - split))) * (1 - ease(back));
  const hit = !feint && !entry && p >= 0.99 && back === 0;
  const guardPt = (side: number): Pt => ({ x: 160 + side * 86, y: 226 });
  const idleMitt = (side: number): Pt => ({ x: 160 + side * 34, y: 112 });
  const mittPos = lerpPt(idleMitt(ts), T, present);
  const from = handLike ? guardPt(s) : { x: 160 + s * 120, y: 262 };
  const route = strikeRoute(a, from, T, s);
  const reach = feint ? 0.45 * Math.sin(Math.PI * clamp01((p - split) / (1 - split))) * (1 - ease(back)) : travel;
  const tip = route.at(reach);
  const tipScale = 1 - 0.5 * reach;
  const drawn = feint ? 0.45 * ease(p) : ease(clamp01((p - split) / (1 - split)));
  const lift = entry && a.levelChange ? -24 * ease(p) : 0; // levelling down makes the holder appear higher
  return (
    <svg viewBox="0 0 320 240" className="mitt-view mitt-view--front mitt-view--pov" role="img" aria-label={`1인칭: ${TARGET_LABEL[target]} ${feint ? '(페인트)' : '목표'}`} data-testid="mitt-front" data-path={a.path} data-side={a.side} data-hit={hit ? 'true' : 'false'}>
      <rect width="320" height="240" className="pov-wall" />
      <path d="M 0 196 L 320 196 L 320 240 L 0 240 Z" className="pov-floor" />
      <g className="pov-bag">
        <line x1="44" y1="0" x2="44" y2="14" />
        <rect x="30" y="14" width="28" height="104" rx="9" />
      </g>
      <g transform={`translate(0 ${lift})`}>
        {/* the mitt holder */}
        <path d="M 96 160 Q 160 138 224 160 L 248 250 L 72 250 Z" className="pov-holder__shirt" />
        <rect x="149" y="118" width="22" height="28" rx="6" className="pov-holder__skin" />
        <ellipse cx="160" cy="96" rx="25" ry="30" className="pov-holder__skin" />
        <circle cx="151" cy="94" r="2" className="pov-holder__eye" />
        <circle cx="169" cy="94" r="2" className="pov-holder__eye" />
        {[-1, 1].map((side) => {
          const m = side === ts && !feint && !entry ? mittPos : idleMitt(side);
          // shoulder → elbow (low, outside) → forearm up into the mitt
          const S = { x: 160 + side * 60, y: 166 };
          const E = { x: m.x + side * 16, y: Math.max(m.y + 58, S.y + 22) };
          return <path key={`arm${side}`} d={`M ${S.x} ${S.y} L ${E.x} ${E.y} L ${m.x} ${m.y + 16}`} className="pov-holder__arm" />;
        })}
        {[-1, 1].map((side) => {
          const active = side === ts && !feint && !entry;
          const m = active ? mittPos : idleMitt(side);
          return <Mitt key={`mitt${side}`} x={m.x} y={m.y} facing={active ? (present > 0.5 ? facing : 'front') : 'front'} scale={active ? 1 : 0.72} hit={active && hit} s={side} testId={active ? 'mitt-target' : undefined} />;
        })}
        {entry && (
          <>
            {target === 'none' ? (
              <ellipse cx="160" cy="150" rx="70" ry="26" className="mitt-zone" data-testid="mitt-target" />
            ) : (
              <ellipse cx="160" cy={target === 'leg' ? 226 : 214} rx="46" ry="16" className="mitt-zone" data-testid="mitt-target" />
            )}
            <text x="160" y={target === 'none' ? 116 : 190} textAnchor="middle" className="pov-label">
              {target === 'leg' ? '다리 목표' : target === 'none' ? '상체·팔 잡기' : '허리·골반 목표'}
            </text>
          </>
        )}
        {entry && a.throwDir && <ThrowArrow dir={a.throwDir} s={s} t={ease(clamp01((p - split) / (1 - split)))} />}
      </g>
      {feint && (
        <text x="160" y="60" textAnchor="middle" className="pov-label">
          페인트 — 반응만 유도
        </text>
      )}
      <path d={route.d} pathLength={1} className={`mitt-path pov-route${feint ? ' mitt-path--feint' : ''}`} strokeDasharray={feint ? `${drawn} 1` : '1'} strokeDashoffset={feint ? 0 : 1 - drawn} data-testid="mitt-path" />
      {/* your gloves (and shin for kicks/knees) */}
      {!handLike && !entry && (
        <g className="pov-shin" opacity={reach > 0.02 ? 1 : 0}>
          <line x1={from.x} y1={from.y} x2={tip.x} y2={tip.y} strokeWidth={30 * tipScale + 8} />
          <circle cx={tip.x} cy={tip.y} r={16 * tipScale + 4} />
        </g>
      )}
      {[-1, 1].map((side) => {
        const striking = handLike && side === s;
        // hooks come in bent from the side, everything else from below
        const looping = striking && (a.path === 'hook' || a.path === 'overhand' || a.path === 'elbowH' || a.path === 'backfist');
        const base = looping ? lerpPt({ x: 160 + side * 112, y: 262 }, { x: 160 + side * 200, y: tip.y + 40 }, reach) : undefined;
        return <Glove key={`glove${side}`} p={striking ? tip : guardPt(side)} scale={striking ? tipScale : 1} s={side} base={base} color={side === -1 ? 'var(--pov-glove-left)' : 'var(--pov-glove-right)'} />;
      })}
      {hit && (
        <g data-testid="mitt-impact" className="pov-impact">
          <circle cx={T.x} cy={T.y} r="24" className="mitt-impact" />
          <text x={T.x} y={T.y - 40} textAnchor="middle" className="pov-pow">
            팡!
          </text>
        </g>
      )}
      {a.turnIn && (
        <text x="160" y="30" className="mitt-spin" textAnchor="middle">
          ↻ 몸 돌려 등 붙이기
        </text>
      )}
      {a.jump && (
        <text x={160 - s * 110} y="30" className="mitt-spin" textAnchor="middle">
          ⤒ 점프
        </text>
      )}
      {a.spin && (
        <text x={160 + s * 110} y="30" className="mitt-spin" textAnchor="middle">
          ↻ 회전
        </text>
      )}
      {a.levelChange && (
        <g className="mitt-level" opacity={Math.min(1, p * 2)}>
          <text x="8" y="140">자세 낮추기</text>
          <path d="M 20 150 L 20 196 M 12 186 L 20 198 L 28 186" />
        </g>
      )}
    </svg>
  );
}

// ---- footwork (top-down) ----
const LEAD = { x: 100, y: 150 };
const REAR = { x: 140, y: 185 };
const BASE_ANGLE = { lead: 20, rear: 45 };

function footAt(moves: FootMove[], foot: 'lead' | 'rear', p: number) {
  // Moves play one after another across p.
  const base = foot === 'lead' ? LEAD : REAR;
  let x = base.x;
  let y = base.y;
  let angle = BASE_ANGLE[foot];
  const n = Math.max(1, moves.length);
  moves.forEach((m, i) => {
    const local = Math.min(1, Math.max(0, p * n - i));
    if (m.foot !== foot) return;
    // A returning move (kick/knee) reaches out (impact ≈ 75 %) and comes back to stance.
    const e = m.returns ? (local < 0.75 ? ease(local / 0.75) : 1 - ease((local - 0.75) / 0.25)) : ease(local);
    x += m.dx * e;
    y += m.dy * e;
    angle += (m.pivot ?? 0) * e;
  });
  return { x, y, angle };
}

function FootShape({ x, y, angle, label, ghost, stance, testId }: { x: number; y: number; angle: number; label: string; ghost?: boolean; stance: Stance; testId?: string }) {
  const mx = mirror(x, stance);
  const a = stance === 'orthodox' ? angle : -angle;
  return (
    <g transform={`translate(${mx} ${y}) rotate(${a})`} className={ghost ? 'mitt-foot mitt-foot--ghost' : 'mitt-foot'} data-testid={testId} data-x={Math.round(mx)} data-y={Math.round(y)}>
      <ellipse rx="9" ry="17" />
      {!ghost && (
        <text y="4" textAnchor="middle" transform={`rotate(${-a})`}>
          {label}
        </text>
      )}
    </g>
  );
}

export function FootworkView({ archetype: a, stance, p }: { archetype: MotionArchetype; stance: Stance; p: number }) {
  const lead = footAt(a.footwork, 'lead', p);
  const rear = footAt(a.footwork, 'rear', p);
  const leadEnd = footAt(a.footwork, 'lead', 1);
  const rearEnd = footAt(a.footwork, 'rear', 1);
  const cog = { x: mirror((lead.x + rear.x) / 2, stance), y: (lead.y + rear.y) / 2 };
  const n = Math.max(1, a.footwork.length);
  const activeMove = a.footwork[Math.min(n - 1, Math.floor(p * n))];
  return (
    <svg viewBox="0 0 240 230" className="mitt-view mitt-view--feet" role="img" aria-label="위에서 본 발 위치와 이동" data-testid="mitt-feet">
      <text x="120" y="14" textAnchor="middle" className="mitt-label">
        상대 쪽 ↑
      </text>
      {a.kind === 'entry' && (
        <g className="mitt-opponent-feet" data-testid="mitt-opponent-feet">
          <ellipse cx={mirror(136, stance)} cy="66" rx="9" ry="16" transform={`rotate(${stance === 'orthodox' ? -20 : 20} ${mirror(136, stance)} 66)`} />
          <ellipse cx={mirror(98, stance)} cy="34" rx="9" ry="16" transform={`rotate(${stance === 'orthodox' ? -45 : 45} ${mirror(98, stance)} 34)`} />
          <text x={mirror(160, stance)} y="70" className="mitt-label">
            상대 앞발
          </text>
        </g>
      )}
      {/* start positions + where each foot ends */}
      <FootShape {...LEAD} angle={BASE_ANGLE.lead} label="" ghost stance={stance} />
      <FootShape {...REAR} angle={BASE_ANGLE.rear} label="" ghost stance={stance} />
      {a.footwork.map((m, i) => {
        const from = m.foot === 'lead' ? LEAD : REAR;
        const end = m.foot === 'lead' ? leadEnd : rearEnd;
        const to = m.returns ? { x: from.x + m.dx, y: from.y + m.dy } : end;
        if (Math.abs(m.dx) + Math.abs(m.dy) < 2) {
          return (
            <text key={i} x={mirror(from.x + (m.foot === 'lead' ? -28 : 26), stance)} y={from.y + 4} textAnchor="middle" className="mitt-pivot">
              ⟳
            </text>
          );
        }
        return (
          <path
            key={i}
            d={`M ${mirror(from.x, stance)} ${from.y} L ${mirror(to.x, stance)} ${to.y}`}
            className={`mitt-step-arrow${m.returns ? ' mitt-step-arrow--return' : ''}`}
            markerEnd="url(#mitt-arrow)"
            markerStart={m.returns ? 'url(#mitt-arrow)' : undefined}
          />
        );
      })}
      <defs>
        <marker id="mitt-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="mitt-arrow-head" />
        </marker>
      </defs>
      <FootShape {...lead} label="앞" stance={stance} testId="mitt-foot-lead" />
      <FootShape {...rear} label="뒤" stance={stance} testId="mitt-foot-rear" />
      <circle cx={cog.x} cy={cog.y} r={a.levelChange ? 6 + 4 * ease(p) : 6} className={`mitt-cog${a.levelChange && p > 0.3 ? ' mitt-cog--low' : ''}`} data-testid="mitt-cog">
        <title>무게 중심</title>
      </circle>
      <text x="120" y="224" textAnchor="middle" className="mitt-label" data-testid="mitt-footwork-label">
        {activeMove ? activeMove.label : '발은 자세를 유지'}
      </text>
    </svg>
  );
}
