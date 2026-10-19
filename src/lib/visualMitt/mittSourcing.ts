import type { Technique } from '../../types';
import type { Combo } from '../combo/types';
import { askGeminiForJson } from '../fighterStyle/geminiJson';
import { politeFix, TUTOR_SPEECH_RULE } from '../aiCoachDay/politeSpeech';
import { resolveTechnique } from '../userTechniques/service';
import { listSharedCombos } from '../sharedCombo/service';
import { derivePurposeTags } from '../sharedCombo/purpose';
import type { SharedCombo } from '../sharedCombo/types';
import { runExpandedWebResearch } from '../webSearch/expandedSearch';
import { KIND_LABEL, motionForTechnique } from './archetypes';
import { listVisualizableTechniques, stepsForIds, type MittCombo, type MittStep } from './combos';
import { decideDrill, generateMittPlan, type MittPlan } from './aiPlan';

// Where a mitt drill comes from, decided by the AI coach before training:
//   1) a combo/setup MARTIALDEX users shared (shared_combos) that already
//      fits the purpose — loaded as the author wrote it, or
//   2) a new drill built from a LIVE web search for that purpose (still only
//      with techniques in the MARTIALDEX DB).
// And, for any user-written combo/setup (shared or in the combo book), the
// AI reads the name / purpose / description / step notes together and
// splits them into the real technique steps the mitt plays — authors often
// put a technique only in the description, or two techniques in one step.
// The AI never adds techniques the author did not write; what it cannot
// match is listed as 'unmapped', not guessed.

export interface UserComboText {
  name: string;
  kind: 'combo' | 'setup';
  purpose: string;
  description: string;
  martialArt: string | null;
  steps: { name: string; techniqueId?: string | null; note?: string | null; opponentReaction?: string | null }[];
  /** Step names the author wrote that could not be resolved to a technique. */
  missing?: string[];
}

export interface InterpretedCombo {
  type: 'combo' | 'setup';
  steps: MittStep[];
  stepNotes: { techniqueId: string; note: string; opponentReaction: string | null }[];
  unmapped: string[];
  summary: string;
}

interface RawInterpretation {
  type: string;
  steps: { techniqueId: string; note?: string; opponentReaction?: string | null }[];
  unmapped?: unknown[];
  summary?: string;
}
const isRawInterpretation = (v: unknown): v is RawInterpretation => {
  const o = v as RawInterpretation;
  return !!o && typeof o === 'object' && Array.isArray(o.steps);
};

const CACHE_PREFIX = 'martialdex:mitt-interpret:';

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function readCache(key: string): RawInterpretation | null {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return isRawInterpretation(v) ? v : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, v: RawInterpretation) {
  try {
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(v));
  } catch {
    // storage unavailable — it's only a cache
  }
}

/** True when there is author text beyond the bare technique list — i.e. something for the AI to read. */
export function hasAuthorText(c: UserComboText): boolean {
  return !!c.description.trim() || !!c.purpose.trim() || (c.missing?.length ?? 0) > 0 || c.steps.some((s) => s.note?.trim() || s.opponentReaction?.trim());
}

export function comboBookText(c: Combo): UserComboText {
  const notes = [...(c.sharedMeta?.stepNotes ?? c.visualMittMeta?.stepNotes ?? [])];
  return {
    name: c.name,
    kind: c.sharedMeta?.kind ?? c.visualMittMeta?.type ?? 'combo',
    purpose: c.sharedMeta?.purpose ?? c.visualMittMeta?.purpose ?? '',
    description: c.description ?? '',
    martialArt: null,
    steps: c.techniqueIds.map((id) => {
      const t = resolveTechnique(id);
      const i = notes.findIndex((n) => n.techniqueId === id);
      const n = i >= 0 ? notes.splice(i, 1)[0] : null;
      return { name: t?.name ?? id, techniqueId: id, note: n?.note ?? null, opponentReaction: n?.opponentReaction ?? null };
    }),
    missing: c.sharedMeta?.missingSteps ?? [],
  };
}

export function sharedComboText(c: SharedCombo): UserComboText {
  return {
    name: c.name,
    kind: c.kind,
    purpose: c.purpose,
    description: c.description,
    martialArt: c.martialArt,
    steps: c.steps.map((s) => ({ name: s.name, techniqueId: resolveTechnique(s.techniqueId) ? s.techniqueId : null, note: s.note ?? null, opponentReaction: s.opponentReaction ?? null })),
  };
}

function techniqueLine(t: Technique): string {
  const m = motionForTechnique(t)!;
  return `${t.id} | ${t.name}${t.koreanName && t.koreanName !== t.name ? ` (${t.koreanName})` : ''} | ${KIND_LABEL[m.archetype.kind]} · ${m.archetype.label}`;
}

/** Reads a user-written combo/setup and returns the technique steps for the mitt (cached per text). */
export async function interpretUserCombo(input: UserComboText): Promise<{ ok: true; result: InterpretedCombo } | { ok: false; message: string }> {
  const pool = listVisualizableTechniques();
  const byId = new Map(pool.map((t) => [t.id, t]));
  const key = hash(JSON.stringify(input));
  let raw = readCache(key);
  if (!raw) {
    const text = [
      `이름: ${input.name}`,
      `종류: ${input.kind === 'setup' ? '셋업 (상대 반응을 끌어내 연결)' : '콤보 (연속 공격)'}`,
      input.martialArt ? `무술: ${input.martialArt}` : '',
      input.purpose ? `목적: ${input.purpose}` : '',
      input.description ? `설명: ${input.description}` : '',
      '작성자가 나눈 단계:',
      ...input.steps.map((s, i) => `${i + 1}. ${s.name}${s.techniqueId ? ` [${s.techniqueId}]` : ' [DB에서 못 찾음]'}${s.note ? ` — 메모: ${s.note}` : ''}${s.opponentReaction ? ` — 예상 반응: ${s.opponentReaction}` : ''}`),
      input.missing?.length ? `작성자가 적었지만 DB에서 못 찾은 단계: ${input.missing.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const r = await askGeminiForJson<RawInterpretation>({
      systemInstruction: [
        '당신은 MARTIALDEX 미트 코치다. 사용자가 직접 만든 콤보/셋업은 설명과 단계가 애매하게 나뉘어 있을 수 있다. 이름·목적·설명·단계·메모를 모두 읽고, 미트에서 실제로 쳐야 할 기술을 순서대로 다시 나눈다.',
        '- 설명이나 메모에만 적힌 기술도 작성자가 의도한 순서의 단계로 넣는다.',
        '- 한 단계에 기술이 둘 이상 적혀 있으면 각각의 단계로 나눈다 (예: "잽 두 번 후 크로스" → 잽, 잽, 크로스).',
        '- 기술이 아닌 내용(거리, 타이밍, 의도, 주의점)은 해당 단계의 note로 옮긴다.',
        '- 셋업이면 상대 반응을 끌어내는 단계에 opponentReaction을 쓴다. 작성자가 적은 반응을 우선한다.',
        '- 작성자가 쓰지 않은 기술을 새로 추가하지 않는다. techniqueId는 [사용 가능한 기술] 목록의 id만 쓴다.',
        '- 목록에 없는 기술(그라운드 기술, 방어 등)은 steps에 넣지 말고 unmapped에 작성자가 쓴 이름 그대로 넣는다.',
        `- note와 summary는 짧은 한국어 존댓말. ${TUTOR_SPEECH_RULE}`,
        '출력: {"type": "combo"|"setup", "steps": [{"techniqueId": string, "note": string, "opponentReaction": string|null}], "unmapped": string[], "summary": string}',
      ].join('\n'),
      contextText: `[사용 가능한 기술]\n${pool.map(techniqueLine).join('\n')}`,
      question: `[작성자의 콤보/셋업]\n${text}`,
      validate: isRawInterpretation,
    });
    if (!r.ok) return { ok: false, message: `AI가 콤보 설명을 읽지 못했습니다: ${r.message}` };
    raw = r.data;
  }
  const valid = raw.steps.filter((s) => typeof s.techniqueId === 'string' && byId.has(s.techniqueId)).slice(0, 8);
  const steps = stepsForIds(valid.map((s) => s.techniqueId));
  if (!steps.length) return { ok: false, message: '설명에서 미트로 연습할 수 있는 기술을 찾지 못했습니다.' };
  writeCache(key, raw);
  return {
    ok: true,
    result: {
      type: raw.type === 'setup' ? 'setup' : 'combo',
      steps,
      stepNotes: valid.map((s) => ({ techniqueId: s.techniqueId, note: politeFix(s.note ?? ''), opponentReaction: s.opponentReaction ? politeFix(s.opponentReaction) : null })),
      unmapped: (raw.unmapped ?? []).filter((x): x is string => typeof x === 'string' && !!x.trim()),
      summary: politeFix(raw.summary ?? ''),
    },
  };
}

/** The interpreted steps as a playable combo (author notes attached to their steps). */
export function interpretedCombo(base: Pick<MittCombo, 'id' | 'name' | 'sourceLabel'>, r: InterpretedCombo): MittCombo {
  const notes = [...r.stepNotes];
  const steps = r.steps.map((st) => {
    const i = notes.findIndex((n) => n.techniqueId === st.techniqueId);
    if (i < 0) return st;
    const [n] = notes.splice(i, 1);
    return { ...st, ...(n.note ? { note: n.note } : {}), ...(n.opponentReaction ? { opponentReaction: n.opponentReaction } : {}) };
  });
  return { id: base.id, name: base.name, source: 'saved', sourceLabel: `${base.sourceLabel} · AI가 설명을 읽고 단계 정리`, steps, skipped: [], warnings: [] };
}

// ---------------- 공유 콤보 vs 실시간 검색 ----------------

/** Rough fit of a shared combo to the purpose (tags + words + art + hearts) — only to shortlist for the AI. */
export function shortlistShared(all: SharedCombo[], purpose: string, martialArt: string | null, limit = 8): SharedCombo[] {
  const tags = new Set(derivePurposeTags({ purpose }));
  const words = (purpose.match(/[\p{L}\p{N}]{2,}/gu) ?? []).map((w) => w.toLowerCase()).filter((w) => !/^(위한|하는|하고|싶어|싶다|연습|훈련|콤보|셋업|미트|만들어|주세요)$/.test(w));
  const scored = all.map((c) => {
    const text = `${c.name} ${c.purpose} ${c.description} ${c.steps.map((s) => s.name).join(' ')}`.toLowerCase();
    let score = c.purposeTags.filter((t) => tags.has(t)).length * 3;
    score += words.filter((w) => text.includes(w)).length;
    if (martialArt && c.martialArt === martialArt) score += 1;
    if (score > 0) score += Math.log10(1 + c.likeCount);
    return { c, score };
  });
  return scored
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c);
}

interface RawDecision {
  choice: string;
  sharedId?: string | null;
  reason: string;
  searchQueries?: unknown[];
}
const isRawDecision = (v: unknown): v is RawDecision => {
  const o = v as RawDecision;
  return !!o && typeof o === 'object' && typeof o.choice === 'string' && typeof o.reason === 'string';
};

export type MittSourcePreference = 'auto' | 'shared' | 'web';

/**
 * The AI coach's drill for a purpose: a fitting shared combo/setup, or a new
 * drill from a live web search. `prefer` lets the user override the choice.
 */
export async function planMittTraining(input: {
  purpose: string;
  martialArt?: string | null;
  contextTechniqueIds?: string[];
  previous?: MittPlan | null;
  viewerId?: string | null;
  prefer?: MittSourcePreference;
}): Promise<{ ok: true; plan: MittPlan } | { ok: false; message: string }> {
  const prefer = input.prefer ?? 'auto';
  const art = input.martialArt ?? null;
  const fallbackQueries = [`${input.purpose} 미트 훈련 콤보`, `${input.purpose} pad work drill combination`];
  let candidates: SharedCombo[] = [];
  if (prefer !== 'web') {
    const list = await listSharedCombos(input.viewerId ?? null);
    if (list.ok) candidates = shortlistShared(list.data.filter((c) => c.steps.length >= 1), input.purpose, art);
  }

  let choice: 'shared' | 'web' = 'web';
  let sharedPick: SharedCombo | null = null;
  let reason = candidates.length ? '' : prefer === 'web' ? '실시간 검색으로 새로 만들도록 선택하셨습니다.' : 'MARTIALDEX 사용자들이 공유한 콤보·셋업 중 이 목적에 맞는 것이 없어 실시간 검색으로 만듭니다.';
  let queries = fallbackQueries;

  if (candidates.length) {
    const d = await askGeminiForJson<RawDecision>({
      systemInstruction: [
        '당신은 MARTIALDEX 미트 코치다. 미트 훈련을 시작하기 전에, 사용자의 목적에 맞는 훈련을 어디서 가져올지 정한다.',
        '- "shared": [공유 콤보·셋업 후보] 중 목적과 기술이 실제로 맞는 것이 있으면 그것을 그대로 불러온다. 하트 수는 참고만 한다.',
        '- "web": 맞는 후보가 없거나 애매하면, 실시간 웹 검색으로 목적에 맞는 미트 훈련을 새로 만든다.',
        prefer === 'shared' ? '- 사용자가 공유 콤보에서 고르기를 원한다. 가장 잘 맞는 후보를 고른다.' : '',
        '- reason은 사용자에게 보여 줄 한두 문장 한국어 존댓말. searchQueries는 web일 때 쓸 검색어 2~3개(한국어 1개 이상, 영어 1개 이상).',
        '출력: {"choice": "shared"|"web", "sharedId": string|null, "reason": string, "searchQueries": string[]}',
      ]
        .filter(Boolean)
        .join('\n'),
      contextText: `[공유 콤보·셋업 후보]\n${candidates
        .map((c) => `id=${c.id} | ${c.kind === 'setup' ? '셋업' : '콤보'} | ${c.name} | 목적: ${c.purpose} | 단계: ${c.steps.map((s) => s.name).join(' → ')} | 설명: ${c.description.slice(0, 160)} | ♥${c.likeCount} | by ${c.authorNickname || '익명'}`)
        .join('\n')}`,
      question: `사용자 목적: ${input.purpose}${art ? ` (무술: ${art})` : ''}`,
      validate: isRawDecision,
    });
    if (d.ok) {
      reason = politeFix(d.data.reason);
      const qs = (d.data.searchQueries ?? []).filter((q): q is string => typeof q === 'string' && !!q.trim()).slice(0, 3);
      if (qs.length) queries = qs;
      const pick = d.data.choice === 'shared' ? candidates.find((c) => c.id === d.data.sharedId) : undefined;
      if (pick) {
        choice = 'shared';
        sharedPick = pick;
      }
    } else if (prefer === 'shared') {
      choice = 'shared';
      sharedPick = candidates[0];
      reason = '목적과 가장 많이 겹치는 공유 콤보·셋업을 불러왔습니다.';
    } else {
      reason = '공유 콤보·셋업을 비교하지 못해 실시간 검색으로 만듭니다.';
    }
  }

  if (choice === 'shared' && sharedPick) {
    const interp = await interpretUserCombo(sharedComboText(sharedPick));
    if (interp.ok) {
      const r = interp.result;
      const d = decideDrill(r.steps);
      const combo: MittCombo = {
        id: `shared:${sharedPick.id}`,
        name: sharedPick.name,
        source: 'saved',
        sourceLabel: `사용자 공유 ${sharedPick.kind === 'setup' ? '셋업' : '콤보'} · by ${sharedPick.authorNickname || '익명'} · ♥${sharedPick.likeCount}`,
        steps: interpretedCombo({ id: '', name: '', sourceLabel: '' }, r).steps,
        skipped: [],
        warnings: [],
      };
      return {
        ok: true,
        plan: {
          type: r.type,
          name: sharedPick.name,
          purpose: sharedPick.purpose,
          stepNotes: r.stepNotes,
          ...d,
          coachingNote: r.summary,
          combo,
          source: 'shared',
          decision: { choice: 'shared', reason },
          shared: { id: sharedPick.id, authorNickname: sharedPick.authorNickname, likeCount: sharedPick.likeCount, kind: sharedPick.kind },
          unmapped: r.unmapped,
        },
      };
    }
    reason = `${reason} (공유 셋업의 기술을 미트 동작으로 옮기지 못해 실시간 검색으로 만듭니다.)`;
  }

  // Live web search → drill built only from MARTIALDEX techniques.
  const research = await runExpandedWebResearch([queries]);
  // Social posts carry almost no text to learn a drill from — prefer real articles/guides.
  const social = /(^|\.)(instagram|tiktok|facebook|twitter|x|threads)\.com$/i;
  const host = (u: string) => {
    try {
      return new URL(u).hostname;
    } catch {
      return '';
    }
  };
  const used = research.ok ? research.collected.filter((x) => (x.snippet || x.content) && !social.test(host(x.url))).slice(0, 6) : [];
  const researchText = used.map((x, i) => `[${i + 1}] ${x.title} (${x.url})\n${(x.content ?? x.snippet ?? '').replace(/\s+/g, ' ').slice(0, 700)}`).join('\n\n');
  const gen = await generateMittPlan({ purpose: input.purpose, martialArt: art, contextTechniqueIds: input.contextTechniqueIds, previous: input.previous, researchText: researchText || undefined });
  if (!gen.ok) return gen;
  if (used.length) {
    return { ok: true, plan: { ...gen.plan, source: 'web', decision: { choice: 'web', reason }, webSources: used.map((x) => ({ title: x.title, url: x.url })) } };
  }
  const why = research.notConfigured ? '실시간 검색이 설정되어 있지 않아' : `실시간 검색에 실패해${research.errorMessage ? ` (${research.errorMessage})` : ''}`;
  return { ok: true, plan: { ...gen.plan, decision: { choice: 'db', reason: `${reason} ${why} MARTIALDEX 기술 DB만으로 만들었습니다.`.trim() } } };
}

