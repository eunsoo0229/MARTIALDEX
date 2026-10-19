import type { Technique } from '../../types';
import { listDbCombos, listVisualizableTechniques, singleCombo, type MittCombo } from './combos';
import { motionForTechnique } from './archetypes';
import { calloutFor, comboCallout, reactionPool } from './reaction';
import { kickExtraMs, restMsFor, tempoLabel, type MittTempo } from './tempo';
import { recordTrainingSession } from '../trainingHistory/service';

// 공격 지시 (pad-holder calls) — the mitt holder shouts what to throw ("잽!",
// "원투!", "훅!") at random moments and presents the mitt for it; the user
// throws on the call. Calls are real MARTIALDEX techniques (one basic attack)
// or real DB combos made only of basic attacks (the same pool as 반응 훈련).
// Nothing watches the user — what was called and for how long is recorded.

export type CommandLevel = 'single' | 'mixed' | 'combo';
export const COMMAND_LEVEL_LABEL: Record<CommandLevel, string> = { single: '단타', mixed: '단타 + 콤보', combo: '콤보' };

const PUNCH_KEYS = ['jab', 'cross', 'leadHook', 'rearHook', 'leadUppercut', 'rearUppercut'];
const KICK_KEYS = ['lowKick', 'roundKick', 'highKick', 'teep'];
// Where a technique of each kind is most likely recorded under its plain name.
const PREFERRED_ART: Record<string, string[]> = { hand: ['boxing', 'kickboxing', 'muay-thai'], foot: ['kickboxing', 'muay-thai', 'mixed-martial-arts'] };

const DEFENSE_EXTRA_MS = 600;

/** One real technique per basic attack (head height for punches, plus body jab / body hook when the DB has them). */
export function singleCalls(withKicks: boolean, techniques: Technique[] = listVisualizableTechniques()): MittCombo[] {
  const keys = withKicks ? [...PUNCH_KEYS, ...KICK_KEYS] : PUNCH_KEYS;
  const out: MittCombo[] = [];
  const pick = (key: string, target: 'default' | 'body') => {
    const hits = techniques.filter((t) => {
      const m = motionForTechnique(t);
      return m?.archetype.key === key && (target === 'body' ? m.target === 'body' : m.target === m.archetype.target);
    });
    if (!hits.length) return;
    const limb = motionForTechnique(hits[0])!.archetype.limb;
    const rank = (t: Technique) => {
      const i = (PREFERRED_ART[limb] ?? []).indexOf(t.martialArt);
      return i < 0 ? 99 : i;
    };
    const best = [...hits].sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length)[0];
    const c = singleCombo(best.id);
    if (c) out.push(c);
  };
  for (const k of keys) pick(k, 'default');
  for (const k of ['jab', 'leadHook', 'rearHook']) pick(k, 'body');
  return out;
}

// 방어 포함: the holder throws and you answer — one real technique per defense, and the DB's
// own defense → counter records ("Slip → Cross", "Parry → Jab", "Roll → Hook" …).
const DEFENSE_KEYS = ['slip', 'slipInside', 'duck', 'roll', 'leanBack', 'parry', 'catchPunch', 'block', 'cover'];
const KICK_DEFENSE_KEYS = ['check', 'kickCatch'];
export function defenseCalls(withKicks: boolean, techniques: Technique[] = listVisualizableTechniques()): MittCombo[] {
  const out: MittCombo[] = [];
  for (const k of withKicks ? [...DEFENSE_KEYS, ...KICK_DEFENSE_KEYS] : DEFENSE_KEYS) {
    const hit = techniques.filter((t) => motionForTechnique(t)?.archetype.key === k).sort((a, b) => a.name.length - b.name.length)[0];
    const c = hit ? singleCombo(hit.id) : null;
    if (c) out.push(c);
  }
  return out;
}
export function counterCombos(withKicks: boolean, db: MittCombo[] = listDbCombos()): MittCombo[] {
  return db.filter(
    (c) =>
      c.steps.length >= 2 &&
      c.steps.length <= 4 &&
      c.steps[0].motion.archetype.kind === 'defense' &&
      c.steps.slice(1).every((s) => s.motion.archetype.kind === 'strike') &&
      (withKicks || c.steps.every((s) => s.motion.archetype.limb !== 'foot' && s.motion.archetype.limb !== 'knee')),
  );
}

/** Everything that may be called at this level (combos: the reaction-drill DB pool, punches only unless kicks are on; defenses when asked). */
export function commandPool(level: CommandLevel, withKicks: boolean, combos: MittCombo[] = reactionPool(), singles?: MittCombo[], withDefense = false): MittCombo[] {
  const s = level === 'combo' ? [] : (singles ?? singleCalls(withKicks));
  const c = level === 'single' ? [] : combos.filter((x) => withKicks || x.steps.every((st) => st.motion.archetype.limb === 'hand'));
  const d = !withDefense ? [] : [...(level === 'combo' ? [] : defenseCalls(withKicks)), ...(level === 'single' ? [] : counterCombos(withKicks))];
  return [...s, ...c, ...d];
}

const isHead = (c: MittCombo) => c.steps.every((s) => s.motion.target === 'head');
const keysOf = (c: MittCombo) => c.steps.map((s) => s.motion.archetype.key).join('+');
// The short words pad holders actually shout for the most common punch sequences.
const SHORTHAND: Record<string, string> = { 'jab+jab': '더블 잽', 'jab+cross': '원투', 'jab+cross+leadHook': '원투 훅', 'jab+cross+leadHook+cross': '원투 훅 투' };

/** What the holder shouts for one call. */
export function commandCallout(c: MittCombo): string {
  if (isHead(c) && SHORTHAND[keysOf(c)]) return SHORTHAND[keysOf(c)];
  return c.steps.length === 1 ? calloutFor(c.steps[0]) : comboCallout(c);
}

type Tempo = Pick<MittTempo, 'stepMs' | 'callGapMs'>;

/** Timing of one call: call → mitt gap (the reaction window), one slot per strike (kicks a little longer), then recovery. */
export function commandTiming(c: MittCombo, tempo: Tempo): { reactMs: number; slots: number[]; restMs: number; totalMs: number } {
  // a defense step needs the holder's attack to be SEEN coming (MittStage draws it ~2.4× slower)
  const slots = c.steps.map((s) => tempo.stepMs + (s.motion.archetype.kind === 'defense' || s.motion.archetype.kind === 'trap' ? DEFENSE_EXTRA_MS : s.motion.archetype.limb === 'hand' ? 0 : kickExtraMs(tempo.stepMs)));
  const restMs = restMsFor(tempo.stepMs);
  return { reactMs: tempo.callGapMs, slots, restMs, totalMs: tempo.callGapMs + slots.reduce((a, b) => a + b, 0) + restMs };
}

/** Where `ms` (since the call) falls: which strike is on screen and how far into its slot; null slot = reaction window or recovery. */
export function commandPhase(c: MittCombo, tempo: Tempo, ms: number): { phase: 'react' | 'strike' | 'rest'; step: number; local: number } {
  const { reactMs, slots } = commandTiming(c, tempo);
  if (ms < reactMs) return { phase: 'react', step: 0, local: 0 };
  let t = ms - reactMs;
  for (let i = 0; i < slots.length; i++) {
    if (t < slots[i]) return { phase: 'strike', step: i, local: t };
    t -= slots[i];
  }
  return { phase: 'rest', step: slots.length - 1, local: t };
}

/** One round → one training_history entry (what was CALLED — self-reported, nothing measured). */
export function recordCommandSession(input: { called: MittCombo[]; seconds: number; finished: boolean; stepMs: number; level: CommandLevel }) {
  if (!input.called.length || input.seconds < 5) return null;
  const ids = [...new Set(input.called.flatMap((c) => c.steps.map((s) => s.techniqueId)))];
  const minutes = Math.max(1, Math.round(input.seconds / 60));
  const strikes = input.called.reduce((n, c) => n + c.steps.length, 0);
  return recordTrainingSession({
    curriculumId: null,
    dayNumber: null,
    techniqueIds: ids,
    completed: input.finished,
    estimatedMinutes: minutes,
    actualMinutes: minutes,
    notes: `AI Visualizing Mitt · 공격 지시 (${COMMAND_LEVEL_LABEL[input.level]}, ${tempoLabel(input.stepMs)} · 기술 간격 ${(input.stepMs / 1000).toFixed(2)}초) · 지시 ${input.called.length}번 · 타격 ${strikes}회 — 사용자 수행 기록, 동작 측정 아님`,
    source: 'visual_mitt',
    visualMitt: {
      comboId: null,
      comboName: `공격 지시 (${input.called.length}번)`,
      stepTechniqueIds: input.called.flatMap((c) => c.steps.map((s) => s.techniqueId)),
      completedSteps: [],
      repetitions: input.called.length,
      stance: 'orthodox',
      selfReported: true,
    },
  });
}
