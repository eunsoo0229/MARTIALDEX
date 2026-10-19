import type { Technique } from '../../types';
import { categoryInArt } from '../loadData';
import { canonicalTechniqueId, techniqueArts } from '../techniqueCanonical';
import { resolveTechnique } from '../userTechniques/service';
import { motionForTechnique } from '../visualMitt/archetypes';
import { listDbCombos, reviewConnections, stepsForIds } from '../visualMitt/combos';
import { decideDrill } from '../visualMitt/aiPlan';
import { drillMoves, drillPlanFor } from '../soloDrill/moves';
import { classifyMmaArea } from '../mmaCurriculum/areaClassifier';
import type { CoachLocation } from '../aiCoachCurriculum/types';
import { isSoloLocation } from '../aiCoachCurriculum/location';
import type { LessonDrillPlan, LessonMittPlan } from './types';

// How the AI coach runs a technique's PRACTICE. The Visualizing Mitt is
// always called when the technique (or the chain it belongs to) can be drawn
// — the user never has to ask for it — and practice never starts straight
// away: the coach first explains the stance and the technique's posture
// (from the curated posture data), then waits for "준비됐어".
//
//   striking / takedown entry          → mitt (that technique)
//   MMA striking                       → mitt: strike → takedown entry (striking + grappling mixed)
//   MMA takedown entry                 → mitt: setup strikes → entry
//   MMA grappling without a mitt motion → mitt: strikes → takedown, then the technique (drill / timer)
//   submission as the goal (MMA, or a submission-goal class) → takedown → (position) → submission
//   otherwise                          → solo call-out drill (home/limited) or the timer
//
// Every id below is a real MARTIALDEX technique; chains are kept only when
// reviewConnections() finds the order natural.

export const MMA_ART_IDS = new Set(['mma', 'mixed-martial-arts']);
const GRAPPLING_ARTS = new Set(['wrestling', 'bjj', 'judo', 'sambo']);
const JAB = 'boxing__jab';
const CROSS = 'boxing__cross';
const DOUBLE_LEG = 'wrestling__basic-double-leg';

export type PracticeMode = 'mitt' | 'mma_mix' | 'takedown_submission' | 'drill' | 'timer';

export interface PracticeSetup {
  techniqueId: string;
  mode: PracticeMode;
  /** The mitt part (asPractice is filled in when it actually starts). */
  mitt: Omit<LessonMittPlan, 'asPractice' | 'resume'> | null;
  /** What follows the mitt (or runs alone when there is no mitt). */
  after: 'drill' | 'timer' | null;
  drill: LessonDrillPlan | null;
  timerSeconds: number;
  /** One line said when the timer part starts (e.g. the submission finish). */
  timerText: string | null;
  /** How today's practice goes — said once, before the posture briefing. */
  intro: string;
  /** 자세 설명 — said before anything starts. */
  briefing: string[];
}

export function isSubmission(t: Technique): boolean {
  return classifyMmaArea(t) === 'submission' || /서브미션|submission|관절기|조르기|초크|choke|lock/i.test(categoryInArt(t, t.martialArt) || t.category);
}

export function isSubmissionGoal(text: string | null | undefined): boolean {
  return !!text && /(서브미션|submission|관절기|조르기|초크|암바|트라이앵글|기무라|길로틴|리어\s?네이키드|탭)/i.test(text);
}

const nameOf = (t: Technique) => t.koreanName || t.name;
const nameById = (id: string) => {
  const t = resolveTechnique(id);
  return t ? nameOf(t) : id;
};

/** ids → a natural chain (drawable steps, no awkward connections), or null. */
export function chain(ids: string[]): string[] | null {
  const real = ids.map((id) => resolveTechnique(id)?.id).filter((id): id is string => !!id);
  if (real.length !== ids.length) return null;
  const steps = stepsForIds(real);
  if (steps.length !== real.length || reviewConnections(steps).length) return null;
  return steps.map((s) => s.techniqueId);
}

/** A REAL DB combo that contains `id` and mixes strikes with a takedown entry (≤5 steps). */
function dbMixedComboWith(id: string): { ids: string[]; name: string } | null {
  const cid = canonicalTechniqueId(id);
  const c = listDbCombos().find(
    (c) =>
      c.steps.length >= 2 &&
      c.steps.length <= 5 &&
      c.steps.some((s) => canonicalTechniqueId(s.techniqueId) === cid) &&
      c.steps.some((s) => s.motion.archetype.kind === 'entry') &&
      c.steps.some((s) => s.motion.archetype.kind === 'strike') &&
      reviewConnections(c.steps).length === 0
  );
  return c ? { ids: c.steps.map((s) => s.techniqueId), name: c.name } : null;
}

export function mittFor(ids: string[], name: string, purpose: string): PracticeSetup['mitt'] {
  const steps = stepsForIds(ids);
  if (!steps.length) return null;
  const d = decideDrill(steps);
  return {
    techniqueIds: steps.map((s) => s.techniqueId),
    name,
    type: 'combo',
    purpose,
    repetitions: d.repetitions,
    speed: d.speed,
    reason: d.reason,
    coachingNote: '',
    stepNotes: steps.map((s) => ({ techniqueId: s.techniqueId, note: s.motion.archetype.label, opponentReaction: null })),
    source: 'lesson',
  };
}

const arrow = (ids: string[]) => ids.map(nameById).join(' → ');

function drillFor(t: Technique, seconds: number): LessonDrillPlan | null {
  const plan = drillPlanFor(t);
  if (!plan) return null;
  const cues = [...drillMoves(plan.group).map((m) => ({ id: m.id, call: m.call })), ...(plan.extra ? [plan.extra] : [])];
  const focus = plan.focusId ? cues.find((c) => c.id === plan.focusId) : plan.extra;
  return { techniqueId: t.id, group: plan.group, cues, focusId: focus?.id ?? null, seconds: Math.max(60, Math.min(seconds, 240)), pace: 'normal' };
}

export interface PracticeContext {
  location: CoachLocation | null;
  /** The class is an MMA class (curriculum / lesson art). */
  mma: boolean;
  /** The class goal is a submission ("서브미션으로 끝내고 싶어"). */
  submissionGoal: boolean;
  /** Planned practice length for this technique. */
  seconds: number;
}

export function isMmaContext(art: string | null | undefined, t?: Technique | null): boolean {
  if (art && MMA_ART_IDS.has(art)) return true;
  return !art && !!t && techniqueArts(t).some((a) => MMA_ART_IDS.has(a));
}

export function planPractice(t: Technique, ctx: PracticeContext): PracticeSetup {
  const motion = motionForTechnique(t);
  const solo = !!ctx.location && isSoloLocation(ctx.location);
  const name = nameOf(t);
  const grappling = techniqueArts(t).some((a) => GRAPPLING_ARTS.has(a)) || !!classifyMmaArea(t)?.match(/takedown|ground|submission|clinch|transition|ground_and_pound/);
  const base = { techniqueId: t.id, timerSeconds: ctx.seconds, timerText: null as string | null, drill: null as LessonDrillPlan | null };
  const finish = (setup: Omit<PracticeSetup, 'briefing'>): PracticeSetup => ({ ...setup, briefing: postureBriefing(t, setup.mitt?.techniqueIds ?? [], setup.mode) });

  // takedown → (position) → submission
  if (isSubmission(t) && (ctx.mma || ctx.submissionGoal)) {
    const td = chain([JAB, CROSS, DOUBLE_LEG]) ?? chain([DOUBLE_LEG]);
    const position = t.positions.find(Boolean);
    const timerSeconds = Math.max(60, Math.min(ctx.seconds, 180));
    return finish({
      ...base,
      mode: 'takedown_submission',
      mitt: td ? mittFor(td, `${arrow(td)} → ${name}`, `테이크다운으로 넘긴 뒤 ${name}로 끝내기`) : null,
      after: 'timer',
      timerSeconds,
      timerText: `이제 테이크다운 뒤 ${position ? `${position} 포지션을 잡고 ` : '포지션을 잡고 '}${name}로 마무리하는 동작을 반복합니다. 파트너나 더미가 있으면 함께, 없으면 자세만 천천히 따라 해 주세요.`,
      intro: `서브미션이 목표이므로 테이크다운 → ${position ? `${position} → ` : '포지션 → '}${name} 순서로 연습하겠습니다. 먼저 Visualizing Mitt로 ${td ? arrow(td) : '테이크다운 진입'}을 치고, 이어서 ${name} 마무리를 반복합니다.`,
    });
  }

  if (ctx.mma && motion && motion.archetype.kind !== 'entry') {
    const db = dbMixedComboWith(t.id);
    const ids = db?.ids ?? chain([t.id, DOUBLE_LEG]) ?? chain([JAB, t.id, DOUBLE_LEG]);
    if (ids) {
      return finish({
        ...base,
        mode: 'mma_mix',
        mitt: mittFor(ids, db?.name ?? arrow(ids), `MMA 타격 → 테이크다운 연결`),
        after: null,
        intro: `MMA는 타격과 그래플링을 섞어서 연습합니다. ${name}를 친 뒤 바로 테이크다운으로 들어가는 ${arrow(ids)}를 Visualizing Mitt로 하겠습니다.${db ? ' MARTIALDEX에 등록된 실제 콤보입니다.' : ''}`,
      });
    }
  }

  if (ctx.mma && motion?.archetype.kind === 'entry') {
    const db = dbMixedComboWith(t.id);
    const ids = db?.ids ?? chain([JAB, CROSS, t.id]) ?? chain([JAB, t.id]);
    if (ids) {
      return finish({
        ...base,
        mode: 'mma_mix',
        mitt: mittFor(ids, db?.name ?? arrow(ids), `타격으로 시선을 올린 뒤 ${name} 진입`),
        ...(solo && drillFor(t, ctx.seconds) ? { after: 'drill' as const, drill: drillFor(t, ctx.seconds) } : { after: null }),
        intro: `MMA에서는 타격으로 상대의 가드를 올린 뒤 테이크다운에 들어갑니다. ${arrow(ids)}를 Visualizing Mitt로 연습하겠습니다.`,
      });
    }
  }

  if (motion) {
    // A grappling takedown entry without a partner: the mitt first, then the solo call-out drill.
    const drill = solo && motion.archetype.kind === 'entry' ? drillFor(t, ctx.seconds) : null;
    return finish({
      ...base,
      mode: 'mitt',
      mitt: mittFor([t.id], name, `${name} 실습`),
      after: drill ? 'drill' : null,
      drill,
      intro: `${name}는 Visualizing Mitt를 불러 연습하겠습니다. 미트가 나오는 위치에 맞춰 ${motion.archetype.kind === 'entry' ? '들어가' : '쳐'} 주세요.${drill ? ` 미트가 끝나면 제가 "${drill.cues.slice(0, 3).map((c) => c.call).join(' → ')}"처럼 구령을 부르는 솔로 드릴로 이어 가겠습니다.` : ''}`,
    });
  }

  // No mitt motion of its own.
  const drill = solo ? drillFor(t, ctx.seconds) : null;
  if (ctx.mma && grappling) {
    const td = chain([JAB, CROSS, DOUBLE_LEG]);
    if (td) {
      return finish({
        ...base,
        mode: 'mma_mix',
        mitt: mittFor(td, `${arrow(td)} → ${name}`, `타격 → 테이크다운 → ${name}`),
        after: drill ? 'drill' : 'timer',
        drill,
        timerSeconds: Math.max(60, Math.min(ctx.seconds, 180)),
        timerText: drill ? null : `테이크다운 뒤 이어지는 ${name}를 반복합니다.`,
        intro: `MMA는 타격과 그래플링을 섞어서 연습합니다. 먼저 Visualizing Mitt로 ${arrow(td)}를 치고, 테이크다운 뒤 ${name}로 이어 가겠습니다.`,
      });
    }
  }
  if (drill) {
    return finish({
      ...base,
      mode: 'drill',
      mitt: null,
      after: 'drill',
      drill,
      intro: `${name}는 혼자서도 할 수 있도록 솔로 드릴로 연습하겠습니다. 제가 "${drill.cues.slice(0, 3).map((c) => c.call).join(' → ')}"처럼 구령을 빠르게 부르면 들리는 대로 바로 움직여 주세요.`,
    });
  }
  return finish({ ...base, mode: 'timer', mitt: null, after: 'timer', intro: `${name}는 미트로 그릴 수 있는 동작이 아니어서 시간을 정해 반복하겠습니다.` });
}

// ---------------------------------------------------------------- posture briefing

const STEP_PREFIX = /^\s*\d+\s*단계\s*(?:[—–:-]\s*)?(?:[^:：]{1,12}[:：]\s*)?/;
const clean = (s: string) => s.replace(STEP_PREFIX, '').trim().replace(/[.。]?$/, '.');

function stanceIdFor(t: Technique, kind: 'strike' | 'grappling'): string {
  if (kind === 'grappling') return 'wrestling__wrestling-stance';
  const arts = techniqueArts(t);
  if (arts.includes('boxing') && t.martialArt === 'boxing') return 'boxing__orthodox';
  if (arts.includes('muay-thai') && t.martialArt === 'muay-thai') return 'muay-thai__orthodox-southpaw';
  return arts.includes('boxing') && !motionForTechnique(t)?.archetype.limb.match(/foot|knee/) ? 'boxing__orthodox' : 'kickboxing__orthodox';
}

/** The stance's own posture data, in one sentence (feet · hands · head). */
function stanceLine(stance: Technique): string | null {
  const b = stance.posture?.bodyPosition;
  const parts = [b?.feet, b?.legs, b?.arms, b?.head, b?.upperBody].filter((x): x is string => !!x).slice(0, 3);
  if (!parts.length && !stance.posture?.overview) return null;
  return `기본 자세(${nameOf(stance)})부터 잡겠습니다. ${(parts.length ? parts : [stance.posture!.overview]).map(clean).join(' ')}`;
}

/** The technique's own posture: start position / steps / key point / mistake — curated data, or the mitt motion's cue. */
function techniqueLines(t: Technique): string[] {
  const p = t.posture;
  const name = nameOf(t);
  const out: string[] = [];
  const steps = (p?.steps ?? []).slice(0, 3).map(clean);
  if (p?.startingPosition) out.push(`${name} 시작 자세: ${clean(p.startingPosition)}`);
  if (steps.length) out.push(`${name} 동작 순서: ${steps.join(' ')}`);
  else if (!p?.startingPosition) {
    const m = motionForTechnique(t);
    if (m) out.push(`${name}: ${m.archetype.cue}${m.archetype.footwork.length ? ` 발은 ${m.archetype.footwork.map((f) => f.label).join(', ')}.` : ''}`);
    else if (p?.overview) out.push(`${name}: ${clean(p.overview)}`);
  }
  if (p?.keyPoints?.[0]) out.push(`핵심: ${clean(p.keyPoints[0])}`);
  if (p?.commonMistakes?.[0]) out.push(`자주 하는 실수: ${clean(p.commonMistakes[0])}`);
  return out;
}

export const POSTURE_READY_LINE = '자세가 잡히셨으면 "준비됐어"라고 말씀하시거나 아래 "자세 확인 — 실습 시작" 버튼을 눌러 주세요. 그때 실습을 시작하겠습니다.';

export function postureBriefing(t: Technique, mittIds: string[], mode: PracticeMode): string[] {
  const own = motionForTechnique(t);
  const grapplingFirst = !own && mittIds.length === 0;
  const startsWithStrike = mittIds.length ? stepsForIds([mittIds[0]])[0]?.motion.archetype.kind !== 'entry' : own?.archetype.kind !== 'entry';
  const stance = resolveTechnique(stanceIdFor(resolveTechnique(mittIds[0] ?? '') ?? t, grapplingFirst || !startsWithStrike ? 'grappling' : 'strike'));
  const lines: string[] = [];
  const s = stance ? stanceLine(stance) : null;
  if (s) lines.push(s);
  // The other steps of the chain: one short cue each.
  const others = mittIds.filter((id) => canonicalTechniqueId(id) !== canonicalTechniqueId(t.id));
  const cues = others
    .map((id) => stepsForIds([id])[0])
    .filter(Boolean)
    .map((st) => `${nameOf(st.technique)}: ${st.motion.archetype.cue}`);
  if (mode === 'takedown_submission' || (mode === 'mma_mix' && !own)) {
    lines.push(...cues.slice(0, 3));
    lines.push(...techniqueLines(t));
  } else {
    lines.push(...techniqueLines(t));
    lines.push(...cues.slice(0, 2));
  }
  lines.push(POSTURE_READY_LINE);
  return lines;
}
