import type { Technique } from '../../types';
import { allTechniques } from '../loadData';
import { getUnifiedAllTechniques, getUnifiedTechniquesByMartialArt, resolveTechnique } from '../userTechniques/service';
import { libraryTechniques, isTechniqueInArt } from '../techniqueCanonical';
import { createCombo, listMyCombos } from '../combo/service';
import type { Combo } from '../combo/types';
import { recordTrainingSession } from '../trainingHistory/service';
import { KIND_LABEL, motionForTechnique, type TechniqueMotion } from './archetypes';

// Combos for AI Visualizing Mitt. Three sources, kept distinct:
//   - 'db'     : combination records that are IN the MARTIALDEX technique DB
//                ("Jab → Cross → Low Kick", boxing "1--2--3", karate
//                "Kizami-zuki → Gyaku-zuki", shared-library "Overhand to
//                Double Leg Takedown"…) — the encyclopedia's own, i.e. the
//                verified recommendations,
//   - 'saved'  : the user's combo book (Combo, technique ids only — same
//                storage/sync as 콤보 북; a Mitt-built combo is saved there),
//   - 'single' : one technique.
// Every step is a real technique id resolved through resolveTechnique(), so
// renamed/merged techniques keep working.

export type StepRole = 'setup' | 'strike' | 'entry' | 'followup';
export const ROLE_LABEL: Record<StepRole, string> = { setup: '셋업', strike: '타격', entry: '테이크다운 진입', followup: '후속 동작' };

export interface MittStep {
  techniqueId: string;
  technique: Technique;
  motion: TechniqueMotion;
  role: StepRole;
}

export interface MittCombo {
  id: string;
  name: string;
  source: 'db' | 'saved' | 'single';
  /** Where it comes from, shown to the user ("기술 DB · 킥복싱 · 대표적인 콤비네이션"). */
  sourceLabel: string;
  steps: MittStep[];
  /** Combo-book steps this mode cannot draw (kept in the combo, skipped here). */
  skipped: string[];
  /** Reviewed-rule notes about the order (custom/saved only — DB combos are the encyclopedia's own). */
  warnings: string[];
}

const BOXING_NUMBERS: Record<string, string> = { '1': 'Jab', '2': 'Cross', '3': 'Lead Hook', '4': 'Rear Hook', '5': 'Lead Uppercut', '6': 'Rear Uppercut' };
const STRIKING_ARTS = ['boxing', 'kickboxing', 'muay-thai', 'mixed-martial-arts', 'karate', 'taekwondo', 'wrestling'];

function norm(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** A component name inside a combination record → the real technique, same art first. "Double Leg" also matches "Basic Double Leg"; a trailing "Takedown" is ignored. */
function resolveComponent(rawName: string, art: string, artPool: (a: string) => Technique[]): Technique | null {
  const name = rawName.replace(/\btakedown\b/i, '').trim();
  const keys = new Set([norm(name), `basic${norm(name)}`]);
  const matches = (t: Technique) => [t.name, t.koreanName ?? '', ...t.aliases].some((n) => n && keys.has(norm(n)));
  const pools = [art, ...STRIKING_ARTS.filter((a) => a !== art)];
  for (const a of pools) {
    const hit = artPool(a).find((t) => matches(t) && motionForTechnique(t));
    if (hit) return hit;
  }
  return null;
}

function splitComboName(name: string, art: string): string[][] {
  // "Jab--Cross / Jab--Hook" holds several combos; "1--2--3" uses boxing numbers.
  return name
    .split(/\s\/\s/)
    .map((part) => part.split(/\s*(?:→|->|--|\bto\b)\s*/i).map((x) => x.trim()).filter(Boolean))
    .filter((parts) => parts.length >= 2)
    .map((parts) => (art === 'boxing' && parts.every((p) => BOXING_NUMBERS[p]) ? parts.map((p) => BOXING_NUMBERS[p]) : parts));
}

function rolesFor(motions: TechniqueMotion[]): StepRole[] {
  let seenEntry = false;
  return motions.map((m, i) => {
    if (seenEntry) return 'followup';
    if (m.archetype.kind === 'entry') {
      seenEntry = true;
      return 'entry';
    }
    if (m.archetype.kind === 'feint' || (i === 0 && motions.length > 1 && m.archetype.key === 'jab')) return 'setup';
    return 'strike';
  });
}

function buildSteps(techniques: Technique[]): { steps: MittStep[]; skipped: string[] } {
  const usable = techniques.map((t) => ({ t, m: motionForTechnique(t) }));
  const kept = usable.filter((u): u is { t: Technique; m: TechniqueMotion } => !!u.m);
  const roles = rolesFor(kept.map((k) => k.m));
  return { steps: kept.map((k, i) => ({ techniqueId: k.t.id, technique: k.t, motion: k.m, role: roles[i] })), skipped: usable.filter((u) => !u.m).map((u) => u.t.name) };
}

/**
 * Notes about an order the user chose — reviewed general rules only, shown
 * as 참고 (never blocking): the combo is still theirs to practise.
 */
export function reviewConnections(steps: MittStep[]): string[] {
  const notes: string[] = [];
  steps.forEach((s, i) => {
    const prev = steps[i - 1];
    if (!prev) return;
    const a = prev.motion.archetype;
    const b = s.motion.archetype;
    if (a.kind === 'entry' && b.kind !== 'entry') notes.push(`${i}→${i + 1}단계: 테이크다운 진입 뒤 다시 타격 거리로 돌아가는 연결은 일반적인 순서가 아닙니다.`);
    if (a.kind === 'entry' && b.kind === 'entry') notes.push(`${i}→${i + 1}단계: 진입 두 번이 이어집니다 — 첫 진입이 막혔을 때의 체인 레슬링으로 연습하세요.`);
    if (a.spin && b.spin) notes.push(`${i}→${i + 1}단계: 회전 기술 두 개가 연속입니다 — 균형을 되찾을 시간이 필요합니다.`);
    if (a.limb === 'foot' && b.limb === 'foot' && a.side === b.side && a.side === 'rear') notes.push(`${i}→${i + 1}단계: 같은 뒷다리 킥이 연속입니다 — 다리를 내려 자세를 다시 잡은 뒤 이어 가세요.`);
    if (a.kind === 'feint' && b.kind === 'feint') notes.push(`${i}→${i + 1}단계: 페인트 뒤에 또 페인트입니다 — 마지막에는 실제 공격으로 마무리하세요.`);
  });
  return notes;
}

let dbCache: { libraryCount: number; combos: MittCombo[] } | null = null;
/** Combination records in the technique DB (official + shared library) whose every step can be visualized. */
export function listDbCombos(): MittCombo[] {
  const library = libraryTechniques().addTeq;
  if (dbCache && dbCache.libraryCount === library.length) return dbCache.combos;
  const pools = new Map<string, Technique[]>();
  const artPool = (a: string) => {
    if (!pools.has(a)) pools.set(a, getUnifiedTechniquesByMartialArt(a));
    return pools.get(a)!;
  };
  const out: MittCombo[] = [];
  const candidates = [...allTechniques, ...library].filter((t) => /→|->|--|\bto\b/i.test(t.name));
  for (const t of candidates) {
    splitComboName(t.name, t.martialArt).forEach((parts, i) => {
      const resolved = parts.map((p) => resolveComponent(p, t.martialArt, artPool));
      if (resolved.some((r) => !r)) return;
      const { steps, skipped } = buildSteps(resolved as Technique[]);
      if (skipped.length || steps.length < 2) return;
      out.push({
        id: `db:${t.id}${i ? `#${i}` : ''}`,
        name: steps.map((s) => s.technique.name).join(' → '),
        source: 'db',
        sourceLabel: `기술 DB · ${t.martialArt} · ${t.category}${t.source ? ' (공유 라이브러리)' : ''}`,
        steps,
        skipped: [],
        warnings: [],
      });
    });
  }
  const seen = new Set<string>();
  const combos = out.filter((c) => {
    const k = c.steps.map((s) => s.techniqueId).join('>');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  dbCache = { libraryCount: library.length, combos };
  return combos;
}

export function comboFromBook(c: Combo): MittCombo {
  const techniques = c.techniqueIds.map((id) => resolveTechnique(id)).filter((t): t is Technique => !!t);
  const { steps, skipped } = buildSteps(techniques);
  return { id: c.id, name: c.name, source: 'saved', sourceLabel: c.visualMittMeta ? '내 콤보 (Visualizing Mitt에서 만듦)' : '내 콤보 북', steps, skipped, warnings: reviewConnections(steps) };
}

export function listBookCombos(): MittCombo[] {
  return listMyCombos().map(comboFromBook);
}

export function singleCombo(techniqueId: string): MittCombo | null {
  const t = resolveTechnique(techniqueId);
  const m = t ? motionForTechnique(t) : null;
  if (!t || !m) return null;
  return { id: `single:${t.id}`, name: t.name, source: 'single', sourceLabel: `단일 기술 · ${KIND_LABEL[m.archetype.kind]}`, steps: [{ techniqueId: t.id, technique: t, motion: m, role: m.archetype.kind === 'entry' ? 'entry' : m.archetype.kind === 'feint' ? 'setup' : 'strike' }], skipped: [], warnings: [] };
}

export function resolveMittCombo(id: string): MittCombo | null {
  if (id.startsWith('db:')) return listDbCombos().find((c) => c.id === id) ?? null;
  if (id.startsWith('single:')) return singleCombo(id.slice(7));
  const c = listMyCombos().find((x) => x.id === id);
  return c ? comboFromBook(c) : null;
}

/** Techniques that can be visualized (for single-technique practice and the combo builder). */
export function listVisualizableTechniques(martialArt?: string): Technique[] {
  return getUnifiedAllTechniques().filter((t) => (!martialArt || isTechniqueInArt(t, martialArt)) && !!motionForTechnique(t));
}

export function stepsForIds(ids: string[]): MittStep[] {
  return buildSteps(ids.map((id) => resolveTechnique(id)).filter((t): t is Technique => !!t)).steps;
}

/** Saves a Mitt-built combo into the user's combo book (local first; cloud via the existing combo sync when logged in). */
export function saveMittCombo(name: string, techniqueIds: string[], stance: 'orthodox' | 'southpaw', extra: Omit<NonNullable<Combo['visualMittMeta']>, 'createdAt' | 'stance'> = {}): Combo {
  const kind = extra.type === 'setup' ? '셋업' : '콤보';
  return createCombo({
    name,
    description: extra.purpose ? `${extra.purpose} (AI Visualizing Mitt ${kind})` : `AI Visualizing Mitt에서 만든 ${kind}`,
    techniqueIds,
    visualMittMeta: { createdAt: new Date().toISOString(), stance, ...extra },
  });
}

/** One training-history entry for a Mitt session — everything is user-reported (no motion is measured in this mode). */
export function recordMittSession(input: { combo: MittCombo; completedSteps: number[]; repetitions: number; stance: 'orthodox' | 'southpaw'; minutes: number; markedComplete: boolean }) {
  const ids = [...new Set(input.combo.steps.map((s) => s.techniqueId))];
  return recordTrainingSession({
    curriculumId: null,
    dayNumber: null,
    techniqueIds: ids,
    completed: input.markedComplete,
    estimatedMinutes: Math.max(1, input.minutes),
    actualMinutes: Math.max(1, input.minutes),
    notes: `AI Visualizing Mitt · ${input.combo.name} · 반복 ${input.repetitions}회 · 완료 표시 ${input.completedSteps.length}/${input.combo.steps.length}단계 (사용자 표시 — 자세 측정 아님)`,
    source: 'visual_mitt',
    visualMitt: {
      comboId: input.combo.source === 'saved' ? input.combo.id : input.combo.source === 'db' ? input.combo.id : null,
      comboName: input.combo.name,
      stepTechniqueIds: input.combo.steps.map((s) => s.techniqueId),
      completedSteps: input.completedSteps,
      repetitions: input.repetitions,
      stance: input.stance,
      selfReported: true,
    },
  });
}

export { ROLE_LABEL as MITT_ROLE_LABEL };
