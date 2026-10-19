import type { Technique } from '../../types';
import type { MasteryStatus } from '../skillProgress/types';
import { computeSkillProgress } from '../skillProgress/computeSkillProgress';
import { askGeminiForJsonWithGrounding } from '../userTechniques/geminiJson';
import { resolveTechnique } from '../userTechniques/service';
import { techniqueArts } from '../techniqueCanonical';
import { politeFix, TUTOR_SPEECH_RULE, withObject } from '../aiCoachDay/politeSpeech';
import { KIND_LABEL, motionForTechnique } from './archetypes';
import { listVisualizableTechniques, stepsForIds, type MittCombo, type MittStep } from './combos';

// What the AI tutor decides for a Visualizing Mitt drill:
//   - decideDrill(): how many repetitions and at which visual speed, from
//     the user's REAL mastery of the techniques, the combo's length and
//     whether it contains a takedown entry (and the time left, if known),
//   - generateMittPlan(): a combo or a setup built from a natural-language
//     purpose ("잽으로 가드를 열고 바디로 연결"), using ONLY techniques that
//     exist in the MARTIALDEX DB and can be visualised. Every id the model
//     returns is re-checked against that pool.

export type MittSpeed = 'slow' | 'normal' | 'fast';
export type DrillType = 'combo' | 'setup';

export interface MittPlan {
  type: DrillType;
  name: string;
  purpose: string;
  /** Per step: why it's there (and, for a setup, the reaction it draws). */
  stepNotes: { techniqueId: string; note: string; opponentReaction: string | null }[];
  repetitions: number;
  speed: MittSpeed;
  coachingNote: string;
  /** Why this many repetitions / this speed (shown + spoken). */
  reason: string;
  combo: MittCombo;
  /** ai = built from the technique DB · web = built from a live web search · shared = a MARTIALDEX user's shared combo/setup · lesson = today's lesson. */
  source: 'ai' | 'lesson' | 'web' | 'shared';
  /** How the coach chose where the drill comes from (mittSourcing.ts). */
  decision?: { choice: 'shared' | 'web' | 'db'; reason: string };
  /** source 'web': the pages the drill was built from. */
  webSources?: { title: string; url: string }[];
  /** source 'shared': the shared combo/setup it was loaded from. */
  shared?: { id: string; authorNickname: string; likeCount: number; kind: 'combo' | 'setup' };
  /** Techniques the author wrote that MARTIALDEX could not match (never invented). */
  unmapped?: string[];
}

const MASTERY_WEIGHT: Record<MasteryStatus, number> = { not_started: 0, needs_improvement: 0, learning: 1, average: 2, proficient: 3 };

export function decideDrill(steps: MittStep[], opts: { minutesLeft?: number | null } = {}): { repetitions: number; speed: MittSpeed; reason: string } {
  const statuses = steps.map((s) => computeSkillProgress(s.techniqueId).status);
  const minMastery = Math.min(...statuses.map((st) => MASTERY_WEIGHT[st]));
  const hasEntry = steps.some((s) => s.motion.archetype.kind === 'entry');
  const n = steps.length;
  let repetitions = n <= 2 ? 8 : n === 3 ? 6 : 5;
  let speed: MittSpeed = minMastery >= 3 ? 'fast' : minMastery >= 2 ? 'normal' : 'slow';
  if (minMastery <= 1) repetitions += 2; // still learning → more, slower repetitions
  if (hasEntry) repetitions -= 1; // shots are tiring; fewer, cleaner reps
  if (opts.minutesLeft != null && opts.minutesLeft < 3) repetitions = Math.min(repetitions, 4);
  repetitions = Math.max(3, Math.min(10, repetitions));
  const weakest = steps[statuses.findIndex((st) => MASTERY_WEIGHT[st] === minMastery)];
  const reason =
    minMastery >= 3
      ? `모든 기술이 숙련 단계라 빠른 속도로 ${repetitions}회 반복합니다.`
      : minMastery <= 1
        ? `${withObject(weakest?.technique.name ?? '일부 기술')} 아직 익히는 중이라 느린 속도로 ${repetitions}회 반복합니다.`
        : `${n}개 동작을 보통 속도로 ${repetitions}회 반복합니다.`;
  return { repetitions, speed, reason: hasEntry ? `${reason} 테이크다운 진입이 있어 횟수를 조금 줄였습니다.` : reason };
}

/** A lesson-built combo (techniques the tutor just taught, in lesson order). */
export function lessonPlan(techniqueIds: string[], name?: string): MittPlan | null {
  const steps = stepsForIds(techniqueIds);
  if (steps.length < 2) return null;
  const d = decideDrill(steps);
  const combo: MittCombo = { id: `lesson:${techniqueIds.join('+')}`, name: name ?? steps.map((s) => s.technique.name).join(' → '), source: 'single', sourceLabel: '오늘 수업에서 배운 기술', steps, skipped: [], warnings: [] };
  return {
    type: 'combo',
    name: combo.name,
    purpose: '오늘 배운 기술을 하나의 연속 동작으로 연결',
    stepNotes: steps.map((s) => ({ techniqueId: s.techniqueId, note: s.motion.archetype.label, opponentReaction: null })),
    ...d,
    coachingNote: '각 동작 사이에서 가드를 다시 올리고, 마지막 동작 뒤에 자세를 회복합니다.',
    combo,
    source: 'lesson',
  };
}

interface RawPlan {
  type: string;
  name: string;
  purpose: string;
  steps: { techniqueId: string; note: string; opponentReaction?: string | null }[];
  repetitions: number;
  speed: string;
  coachingNote: string;
}
function isRawPlan(v: unknown): v is RawPlan {
  const o = v as RawPlan;
  return !!o && typeof o === 'object' && typeof o.name === 'string' && Array.isArray(o.steps);
}

export async function generateMittPlan(input: {
  purpose: string;
  martialArt?: string | null;
  /** Techniques from the current lesson — preferred when they fit. */
  contextTechniqueIds?: string[];
  /** The previous plan, when the user asks to change it ("더 쉽게", "더 빠르게"). */
  previous?: MittPlan | null;
  /** Live web search results to build from (titles, urls, excerpts) — see mittSourcing.ts. */
  researchText?: string;
}): Promise<{ ok: true; plan: MittPlan } | { ok: false; message: string }> {
  const all = listVisualizableTechniques();
  const pool = (input.martialArt ? all.filter((t) => techniqueArts(t).includes(input.martialArt!) || ['boxing', 'kickboxing', 'wrestling'].some((a) => techniqueArts(t).includes(a))) : all).slice(0, 120);
  const context = (input.contextTechniqueIds ?? []).map((id) => resolveTechnique(id)).filter((t): t is Technique => !!t && !!motionForTechnique(t));
  const byId = new Map([...pool, ...context].map((t) => [t.id, t]));
  const line = (t: Technique) => {
    const m = motionForTechnique(t)!;
    return `${t.id} | ${t.name}${t.koreanName && t.koreanName !== t.name ? ` (${t.koreanName})` : ''} | ${KIND_LABEL[m.archetype.kind]} · ${m.archetype.label} | 숙련도: ${computeSkillProgress(t.id).status}`;
  };
  const r = await askGeminiForJsonWithGrounding<RawPlan>({
    systemInstruction: [
      '당신은 MARTIALDEX AI 튜터다. 사용자의 목적에 맞는 타격 콤보 또는 셋업을 [사용 가능한 기술]만으로 만든다.',
      '- techniqueId는 반드시 목록의 id를 그대로 쓴다. 목록에 없는 기술을 만들지 않는다.',
      '- type: "combo"(연속 공격 조합) 또는 "setup"(상대 반응을 유도하고 그 반응을 이용해 후속 기술로 연결). setup이면 반응을 유도하는 단계의 opponentReaction에 예상 반응을 쓴다.',
      '- 2~5단계. 실제로 자연스럽게 이어지는 순서만 쓴다. 테이크다운 진입은 보통 마지막에 둔다.',
      '- [오늘 수업 기술]이 목적에 맞으면 우선 사용한다. 숙련도가 낮으면 더 단순하게 만든다.',
      '- repetitions(3~10)와 speed("slow"|"normal"|"fast")를 숙련도·복잡도에 맞게 정한다.',
      input.researchText ? '- [실시간 검색 자료]에서 이 목적에 맞는 미트 훈련 방법을 참고해 만든다. 자료에 나온 기술도 반드시 [사용 가능한 기술] 목록의 id로만 쓰고, 자료에 없는 내용을 지어내지 않는다.' : '',
      `- note, purpose, coachingNote는 짧은 한국어. ${TUTOR_SPEECH_RULE}`,
      '출력: {"type": "combo"|"setup", "name": string, "purpose": string, "steps": [{"techniqueId": string, "note": string, "opponentReaction": string|null}], "repetitions": number, "speed": string, "coachingNote": string}',
    ].filter(Boolean).join("\n"),
    contextText: [
      `[사용 가능한 기술]\n${[...byId.values()].map(line).join('\n')}`,
      context.length ? `[오늘 수업 기술]\n${context.map(line).join('\n')}` : '',
      input.researchText ? `[실시간 검색 자료]\n${input.researchText}` : '',
      input.previous ? `[이전에 만든 연습]\n${input.previous.type} ${input.previous.name}: ${input.previous.combo.steps.map((s) => s.technique.name).join(' → ')} (${input.previous.repetitions}회, ${input.previous.speed})` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    question: `목적: ${input.purpose}`,
    useSearchGrounding: false,
    validate: isRawPlan,
  });
  if (!r.ok) return { ok: false, message: `AI가 콤보를 만들지 못했습니다: ${r.message}` };
  const valid = r.data.steps.filter((s) => typeof s.techniqueId === 'string' && byId.has(s.techniqueId)).slice(0, 5);
  const steps = stepsForIds(valid.map((s) => s.techniqueId));
  if (steps.length < 2) return { ok: false, message: 'MARTIALDEX에 있는 기술만으로 이 목적에 맞는 연습을 만들지 못했습니다. 목적을 조금 바꿔 다시 말씀해 주세요.' };
  const type: DrillType = r.data.type === 'setup' && valid.some((s) => s.opponentReaction) ? 'setup' : 'combo';
  const fallback = decideDrill(steps);
  const reps = Number.isFinite(r.data.repetitions) ? Math.max(3, Math.min(10, Math.round(r.data.repetitions))) : fallback.repetitions;
  const speed: MittSpeed = r.data.speed === 'slow' || r.data.speed === 'normal' || r.data.speed === 'fast' ? r.data.speed : fallback.speed;
  const name = politeFix(r.data.name.trim()) || steps.map((s) => s.technique.name).join(' → ');
  const combo: MittCombo = { id: `ai:${Date.now()}`, name, source: 'single', sourceLabel: type === 'setup' ? 'AI 튜터가 만든 셋업' : 'AI 튜터가 만든 콤보', steps, skipped: [], warnings: [] };
  return {
    ok: true,
    plan: {
      type,
      name,
      purpose: politeFix(r.data.purpose ?? input.purpose),
      stepNotes: valid.map((s) => ({ techniqueId: s.techniqueId, note: politeFix(s.note ?? ''), opponentReaction: s.opponentReaction ? politeFix(s.opponentReaction) : null })),
      repetitions: reps,
      speed,
      coachingNote: politeFix(r.data.coachingNote ?? ''),
      reason: `AI 튜터가 숙련도와 동작 수(${steps.length}개)를 보고 ${reps}회 · ${speed === 'fast' ? '빠른' : speed === 'normal' ? '보통' : '느린'} 속도로 정했습니다.`,
      combo,
      source: 'ai',
    },
  };
}

/** "이걸 콤보로 연습하고 싶어", "셋업으로 연결해줘", "테이크다운으로 연결해줘", "더 빠른 콤보" … */
export function isMittRequest(text: string): boolean {
  return /(콤보|셋업|setup|combo|연결해|이어서 연습|테이크다운으로|미트)/i.test(text) && !/\?$|뭐야|무엇|왜/.test(text.trim());
}
