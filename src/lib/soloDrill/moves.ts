import type { Technique } from '../../types';
import { categoryInArt } from '../loadData';
import { canonicalTechniqueId, techniqueArts } from '../techniqueCanonical';
import { resolveTechnique } from '../userTechniques/service';
import { motionForTechnique } from '../visualMitt/archetypes';

// 솔로 드릴 (wrestling / BJJ without a partner): the coach calls short cues
// quickly — "태클 → 스프롤 → 다운블록" — and the user moves on each call.
// Every cue is a REAL technique of the DB (canonical id); `call` is only the
// word a coach shouts for it. Two groups: standing movement (the stance-to-
// shot-to-defense chain) and bottom/ground solo movement.

export type DrillGroup = 'standing' | 'ground';

export interface DrillMove {
  id: string;
  call: string;
  group: DrillGroup;
}

export const DRILL_MOVES: DrillMove[] = [
  { id: 'wrestling__penetration-step', call: '태클', group: 'standing' },
  { id: 'wrestling__sprawl', call: '스프롤', group: 'standing' },
  { id: 'wrestling__down-block', call: '다운블록', group: 'standing' },
  { id: 'wrestling__level-change', call: '레벨 체인지', group: 'standing' },
  { id: 'wrestling__basic-double-leg', call: '더블렉', group: 'standing' },
  { id: 'wrestling__high-single', call: '싱글렉', group: 'standing' },
  { id: 'wrestling__fake-shot', call: '페이크 샷', group: 'standing' },
  { id: 'wrestling__drop-step', call: '드롭 스텝', group: 'standing' },
  { id: 'wrestling__shuffle-step', call: '셔플', group: 'standing' },
  { id: 'wrestling__motion-circle', call: '서클', group: 'standing' },
  { id: 'wrestling__back-step', call: '백 스텝', group: 'standing' },
  { id: 'bjj__technical-stand-up', call: '테크니컬 스탠드업', group: 'standing' },
  { id: 'wrestling__stand-up', call: '스탠드업', group: 'ground' },
  { id: 'wrestling__sit-out', call: '싯아웃', group: 'ground' },
  { id: 'wrestling__hip-heist', call: '힙 헤이스트', group: 'ground' },
  { id: 'wrestling__granby-roll', call: '그랜비', group: 'ground' },
  { id: 'bjj__hip-escape', call: '새우빼기', group: 'ground' },
  { id: 'judo__bridge', call: '브릿지', group: 'ground' },
];

const GRAPPLING = new Set(['wrestling', 'bjj', 'judo', 'sambo']);

export interface ResolvedDrillMove extends DrillMove {
  technique: Technique;
}

/** DRILL_MOVES that resolve to a technique in this build (canonical ids). */
export function drillMoves(group?: DrillGroup): ResolvedDrillMove[] {
  return DRILL_MOVES.filter((m) => !group || m.group === group)
    .map((m) => {
      const t = resolveTechnique(m.id);
      return t ? { ...m, id: t.id, technique: t } : null;
    })
    .filter((m): m is ResolvedDrillMove => !!m);
}

export interface DrillPlan {
  group: DrillGroup;
  /** The lesson's technique when it is itself one of the cues (called more often). */
  focusId: string | null;
  /** A takedown entry that isn't a stock cue gets its own cue (shadow shot). */
  extra: { id: string; call: string } | null;
  moveIds: string[];
}

/**
 * Should this technique be practised as a solo call-out drill, and with which
 * cues? Only grappling arts; standing techniques (stance, movement, shots,
 * entries) or solo ground movement. Partner-only techniques (submissions,
 * guards, passes) → null (the lesson keeps its timer).
 */
export function drillPlanFor(t: Technique): DrillPlan | null {
  if (!techniqueArts(t).some((a) => GRAPPLING.has(a))) return null;
  const id = canonicalTechniqueId(t.id);
  const own = DRILL_MOVES.find((m) => canonicalTechniqueId(m.id) === id);
  const category = categoryInArt(t, t.martialArt);
  const motion = motionForTechnique(t);
  const standing = own?.group === 'standing' || motion?.archetype.kind === 'entry' || /스탠딩|테이크다운|싱글|더블|공격 진입|기본 자세와 움직임|발목|Takedown|Standing/i.test(category);
  const ground = own?.group === 'ground' || /탈출|Escape|바텀/i.test(category);
  const group: DrillGroup | null = own ? own.group : standing ? 'standing' : ground ? 'ground' : null;
  if (!group) return null;
  const moves = drillMoves(group);
  const extra = !own && motion?.archetype.kind === 'entry' ? { id: t.id, call: t.koreanName || t.name } : null;
  if (!own && !extra && group === 'ground' && !ground) return null;
  return { group, focusId: own ? id : null, extra, moveIds: moves.map((m) => m.id) };
}

export type DrillPace = 'slow' | 'normal' | 'fast';
/** Seconds between cues inside one burst, and the reset pause between bursts. */
export const DRILL_PACE: Record<DrillPace, { label: string; between: number; reset: number }> = {
  slow: { label: '천천히', between: 2.2, reset: 3.2 },
  normal: { label: '보통', between: 1.5, reset: 2.4 },
  fast: { label: '빠르게', between: 0.95, reset: 1.6 },
};

export interface DrillCue {
  id: string;
  call: string;
}

/** One burst of 2–4 cues, never the same cue twice in a row; the focus cue appears more often. */
export function nextBurst(cues: DrillCue[], focusId: string | null, random: () => number = Math.random): DrillCue[] {
  if (cues.length === 0) return [];
  const weighted = cues.flatMap((c) => (c.id === focusId ? [c, c, c] : [c]));
  const len = 2 + Math.floor(random() * 3);
  const out: DrillCue[] = [];
  for (let i = 0; i < len; i++) {
    const options = weighted.filter((c) => c.id !== out.at(-1)?.id);
    out.push(options[Math.floor(random() * options.length)] ?? weighted[0]);
  }
  return out;
}
