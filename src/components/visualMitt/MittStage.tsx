import type { FootMove, MotionArchetype, Target } from '../../lib/visualMitt/archetypes';
import { TARGET_LABEL } from '../../lib/visualMitt/archetypes';

// AI Visualizing Mitt stage — two schematic SVG views driven by one
// progress value p (0 → 1) for the current step:
//   1) 정면 뷰: the mitt holder you face, the mitt/shield presented for this
//      technique, and the strike path being drawn toward it (impact flash at
//      the end). Feints draw a short dotted path that never reaches a mitt.
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

function targetPoint(a: MotionArchetype, target: Target, s: number): { x: number; y: number } {
  const center = a.limb === 'foot' && (a.path === 'thrust' || a.path === 'spin') ? 0.35 : 1;
  if (a.kind === 'entry') return target === 'leg' ? { x: 120 - s * 14, y: 182 } : { x: 120, y: 150 };
  if (a.limb === 'knee') return { x: 120 + s * 8, y: target === 'head' ? 60 : 118 };
  switch (target) {
    case 'head':
      return a.path === 'uppercut' ? { x: 120 + s * 12, y: 74 } : a.path === 'hook' || a.path === 'round' || a.path === 'backfist' ? { x: 120 + s * 32, y: 52 } : { x: 120 + s * 22, y: 54 };
    case 'body':
      return { x: 120 + s * 26 * center, y: 112 };
    case 'leg':
      return { x: 120 + s * 18, y: 180 };
    case 'hips':
      return { x: 120, y: 150 };
    default:
      return { x: 120 + s * 22, y: 54 };
  }
}

function strikePath(a: MotionArchetype, t: { x: number; y: number }, s: number): string {
  const ox = 120 + s * 38;
  switch (a.path) {
    case 'hook':
      return `M ${ox} 250 Q ${t.x + s * 70} ${t.y + 30} ${t.x} ${t.y}`;
    case 'uppercut':
      return `M ${t.x + s * 6} 250 Q ${t.x + s * 30} ${t.y + 70} ${t.x} ${t.y}`;
    case 'overhand':
      return `M ${ox} 250 Q ${t.x + s * 75} ${t.y - 45} ${t.x} ${t.y}`;
    case 'round':
      return `M ${120 + s * 60} 250 Q ${120 + s * 128} ${t.y + 35} ${t.x} ${t.y}`;
    case 'axe':
      return `M ${t.x + s * 34} 6 Q ${t.x + s * 34} ${t.y - 12} ${t.x} ${t.y}`;
    case 'knee':
      return `M ${t.x} 250 L ${t.x} ${t.y}`;
    case 'elbowH':
      return `M ${t.x + s * 48} ${t.y + 18} Q ${t.x + s * 40} ${t.y - 8} ${t.x} ${t.y}`;
    case 'elbowUp':
      return `M ${t.x + s * 8} ${t.y + 50} L ${t.x} ${t.y}`;
    case 'elbowDown':
      return `M ${t.x + s * 26} ${t.y - 38} L ${t.x} ${t.y}`;
    case 'backfist':
      return `M ${t.x + s * 52} ${t.y + 34} Q ${t.x + s * 58} ${t.y} ${t.x} ${t.y}`;
    case 'shot':
      return `M 120 250 L ${t.x} ${t.y}`;
    default:
      return `M ${ox} 250 L ${t.x} ${t.y}`;
  }
}

function Pad({ a, x, y, hit }: { a: MotionArchetype; x: number; y: number; hit: boolean }) {
  const shield = a.limb === 'foot' || a.limb === 'knee';
  const fill = hit ? 'var(--mitt-hit)' : 'var(--mitt-pad)';
  if (a.kind === 'entry') return <ellipse cx={x} cy={y} rx="20" ry="10" className="mitt-zone" data-testid="mitt-target" />;
  return shield ? (
    <rect x={x - 14} y={y - 22} width="28" height="44" rx="7" fill={fill} className="mitt-pad" data-testid="mitt-target" />
  ) : (
    <ellipse cx={x} cy={y} rx="12" ry="15" fill={fill} className="mitt-pad" data-testid="mitt-target" />
  );
}

export function FrontView({ archetype: a, target, stance, p }: { archetype: MotionArchetype; target: Target; stance: Stance; p: number }) {
  const s = sideSign(a, stance);
  const t = targetPoint(a, target, s);
  const path = strikePath(a, t, s);
  const feint = a.kind === 'feint';
  const drawn = feint ? 0.45 * ease(p) : ease(p);
  const hit = !feint && p >= 0.96;
  return (
    <svg viewBox="0 0 240 250" className="mitt-view mitt-view--front" role="img" aria-label={`정면: ${TARGET_LABEL[target]} ${feint ? '(페인트)' : '목표'}`} data-testid="mitt-front" data-path={a.path} data-side={a.side} data-hit={hit ? 'true' : 'false'}>
      {/* the holder you face */}
      <g className="mitt-holder">
        <circle cx="120" cy="40" r="15" />
        <path d="M 96 64 Q 120 58 144 64 L 138 150 L 102 150 Z" />
        <path d="M 104 150 L 98 236 M 136 150 L 142 236" className="mitt-holder__legs" />
      </g>
      {!feint && <Pad a={a} x={t.x} y={t.y} hit={hit} />}
      {a.kind === 'entry' && (
        <text x={t.x} y={t.y + 26} textAnchor="middle" className="mitt-label">
          {target === 'leg' ? '앞다리 목표' : '허리·골반 목표'}
        </text>
      )}
      <path d={path} pathLength={1} className={`mitt-path${feint ? ' mitt-path--feint' : ''}`} strokeDasharray={feint ? `${drawn} 1` : '1'} strokeDashoffset={feint ? 0 : 1 - drawn} data-testid="mitt-path" />
      {a.spin && (
        <text x={120 + s * 70} y="232" className="mitt-spin" textAnchor="middle">
          ↻ 회전
        </text>
      )}
      {a.levelChange && (
        <g className="mitt-level" opacity={Math.min(1, p * 2)}>
          <text x="8" y="140">자세 낮추기</text>
          <path d="M 20 150 L 20 196 M 12 186 L 20 198 L 28 186" />
        </g>
      )}
      {hit && (
        <circle cx={t.x} cy={t.y} r="24" className="mitt-impact" data-testid="mitt-impact">
          <title>미트 목표 도달 (도식)</title>
        </circle>
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
