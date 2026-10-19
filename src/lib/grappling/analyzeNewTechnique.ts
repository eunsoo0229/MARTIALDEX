import type { Technique } from '../../types';
import type { WebSearchOutcome } from '../webSearch/types';
import type { GeminiJsonOutcome } from '../userTechniques/geminiJson';
import type { GiNoGiClass, GiNoGiRecord, StylePosture } from './types';

// Gi / No-Gi for a NEWLY ADDED grappling technique — the same decision rules
// scripts/build-gi-nogi.mjs applies to the official library, run once when
// the technique is added (the record is stored on the technique itself,
// Technique.giNoGi) or on demand from its detail page.
//
//   1. evidence: the app's web search (Tavily); if that is unavailable,
//      Gemini with Google Search grounding.
//   2. one AI call classifies it and writes per-style postures, citing the
//      evidence. Accepted only with sources, confidence high/medium, and — for
//      "공통·차이 있음" — concrete grip terms on BOTH sides; otherwise 판단 보류.
//   3. no evidence / no AI → 'pending' (조사 전). Nothing is guessed.

const GRAPPLING_ARTS = new Set(['bjj', 'judo', 'wrestling', 'sambo']);
const PURE_GRAPPLING = new Set(['bjj', 'judo', 'wrestling']);
const MMA_GRAPPLING = /(클린치|테이크다운|그라운드|서브미션|스크램블|그래플링|파운딩|clinch|takedown|ground|submission|scramble|grappl)/i;
const STRIKING = /(펀치|킥|니 \(무릎\)|팔꿈치|엘보|타격|punch|kick|strike|elbow)/i;
const GI_WORDS = /(깃|칼라|라펠|소매|슬리브|바지|도복|벨트|collar|lapel|sleeve|pants|belt|\bgi\b)/i;
// Same checks as the build script: a "difference" must name a gi grip AND a no-gi control.
export const GI_SIDE = /(깃|칼라|라펠|소매|슬리브|바지|팬츠|벨트|도복\s?(원단|자락)|collar|lapel|sleeve|pants|belt)/i;
export const NOGI_SIDE = /(손목|오버\s?훅|언더\s?훅|목|머리|바디\s?락|겨드랑|팔뚝|이두|삼두|발목|무릎|허리|wrist|overhook|underhook|neck|head|body\s?lock|collar\s?tie)/i;
// The evidence itself must talk about the jacket / no-gi for a style verdict.
const STYLE_MENTION = /\bgi\b|no[\s-]?gi|nogi|kimono|jacket|lapel|collar|sleeve|pants grip|belt grip|도복|노기|깃|소매|라펠/i;
const ART_EN: Record<string, string> = { bjj: 'BJJ', judo: 'judo', wrestling: 'wrestling', sambo: 'sambo', 'mixed-martial-arts': 'MMA' };
const VALID: GiNoGiClass[] = ['both_differs', 'gi_centric', 'nogi_centric', 'same', 'undecided'];

const artsOf = (t: Technique) => [...new Set([t.martialArt, ...(t.martialArts ?? [])])];

/** Is this a grappling technique that should have a Gi / No-Gi split? (same rule as the official library) */
export function isGiNoGiTarget(t: Technique): boolean {
  const own = [t.martialArt];
  if (STRIKING.test(t.category ?? '') && !own.some((a) => PURE_GRAPPLING.has(a))) return false;
  if (own.some((a) => GRAPPLING_ARTS.has(a))) return true;
  return t.martialArt === 'mixed-martial-arts' && MMA_GRAPPLING.test(`${t.category} ${(t.positions ?? []).join(' ')}`);
}

export interface GiNoGiDeps {
  search: (query: string) => Promise<WebSearchOutcome>;
  askJson: <T>(p: { systemInstruction: string; contextText: string; question: string; useSearchGrounding?: boolean; validate?: (d: unknown) => d is T }) => Promise<GeminiJsonOutcome<T>>;
}

async function defaultDeps(): Promise<GiNoGiDeps> {
  const [{ webSearchProvider }, { askGeminiForJsonWithGrounding }] = await Promise.all([import('../webSearch/provider'), import('../userTechniques/geminiJson')]);
  return { search: (q) => webSearchProvider.search(q), askJson: askGeminiForJsonWithGrounding };
}

interface RawStyle {
  grips?: unknown;
  steps?: unknown;
  keyPoints?: unknown;
  safety?: unknown;
}
interface RawAnswer {
  classification?: unknown;
  confidence?: unknown;
  giApplicable?: unknown;
  noGiApplicable?: unknown;
  reason?: unknown;
  difference?: unknown;
  sourceIds?: unknown;
  gi?: RawStyle | null;
  noGi?: RawStyle | null;
}
const isRaw = (d: unknown): d is RawAnswer => !!d && typeof d === 'object' && !Array.isArray(d) && 'classification' in (d as object);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const strList = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()).slice(0, n) : []);

function stylePosture(p: RawStyle | null | undefined, sources: { title: string; url: string }[]): StylePosture | undefined {
  if (!p || typeof p !== 'object') return undefined;
  const grips = str(p.grips);
  const steps = strList(p.steps, 6);
  if (!grips || steps.length < 2 || !sources.length) return undefined;
  return { grips, steps, keyPoints: strList(p.keyPoints, 4), safety: str(p.safety), status: 'ai_researched', sources };
}

function baseRecord(t: Technique): GiNoGiRecord {
  const own = [t.posture?.overview, ...(t.posture?.steps ?? []), ...(t.posture?.keyPoints ?? []), t.description].filter(Boolean).join(' ');
  return {
    name: t.name,
    koreanName: t.koreanName ?? null,
    arts: artsOf(t),
    category: t.category,
    classification: 'undecided',
    gi: { applicable: null },
    noGi: { applicable: null },
    method: 'pending',
    reason: null,
    difference: null,
    confidence: null,
    evidence: [],
    sources: [],
    basePostureStyle: t.posture ? (GI_WORDS.test(own) ? 'gi' : 'neutral') : null,
    postures: {},
  };
}

const SYSTEM = [
  '너는 그래플링 코치다. 기술 하나가 도복(Gi)과 노기(No-Gi)에서 어떻게 쓰이는지 판단하고, 확인되는 만큼만 스타일별 수행 방식을 정리한다.',
  'classification: "both_differs"(둘 다 쓰지만 그립·제어가 다름) | "gi_centric"(도복 깃·소매·바지·벨트가 있어야 성립) | "nogi_centric"(주로 노기에서 쓰임) | "same"(수행 방식이 같음) | "undecided"(근거 부족).',
  'difference(both_differs일 때만): Gi 쪽 구체적 그립(깃·소매·바지·벨트 등)과 No-Gi 쪽 구체적 제어(손목·언더훅·오버훅·목·바디락 등)를 둘 다 적은 1~2문장. 막연한 표현("도복 그립 체계가 다름")은 쓰지 않는다.',
  'gi / noGi(both_differs일 때만, 근거가 없는 스타일은 null): grips(1문장), steps(핵심 단계 3~5개), keyPoints(2~3개), safety(1문장). 두 스타일에 같은 문장을 복사하지 않는다.',
  'confidence: "high" | "medium" | "low". giApplicable / noGiApplicable: true | false | null.',
  '모든 문장은 한국어 존댓말 평서문. 근거로 확인되지 않는 내용은 쓰지 않는다.',
].join('\n');

/**
 * Researches one technique. Never throws; a failure yields a 'pending' record
 * (classification 판단 보류, reason says why) so the screen can offer a retry.
 */
export async function analyzeGiNoGi(t: Technique, deps?: GiNoGiDeps): Promise<GiNoGiRecord> {
  const d = deps ?? (await defaultDeps());
  const rec = baseRecord(t);
  const art = ART_EN[t.martialArt] ?? 'grappling';
  const query = `${t.name} ${art} gi vs no-gi grips technique`;

  // 1. evidence
  let web: { id: string; title: string; url: string; text: string }[] = [];
  try {
    const r = await d.search(query);
    if (r.ok) web = r.results.slice(0, 5).map((x, i) => ({ id: `S${i + 1}`, title: x.title, url: x.url, text: (x.snippet || x.content || '').replace(/\s+/g, ' ').slice(0, 400) })).filter((x) => x.url && x.text);
  } catch {
    web = [];
  }
  const useGrounding = web.length === 0;

  const context = [
    `[기술]\n이름: ${t.name}${t.koreanName ? ` / ${t.koreanName}` : ''}\n무술: ${artsOf(t).join(', ')} · 분류: ${t.category}\n설명: ${(t.posture?.overview ?? t.description ?? '').slice(0, 400)}`,
    useGrounding ? '' : `[웹 자료]\n${web.map((w) => `[${w.id}] ${w.title} (${w.url})\n${w.text}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const outFormat = `출력: {"classification","confidence","giApplicable","noGiApplicable","reason","difference",${useGrounding ? '' : '"sourceIds",'}"gi":{"grips","steps","keyPoints","safety"}|null,"noGi":{...}|null}`;
  const r = await d.askJson<RawAnswer>({
    systemInstruction: [SYSTEM, useGrounding ? '웹 검색으로 확인한 내용만 근거로 쓴다.' : '근거는 [웹 자료]뿐이다. sourceIds에 실제로 근거가 된 자료 id(S1 등)를 넣는다.', outFormat].join('\n'),
    contextText: context,
    question: `"${t.name}"의 Gi / No-Gi 분류와 스타일별 수행 방식을 정리해 줘.`,
    useSearchGrounding: useGrounding,
    validate: isRaw,
  });

  if (!r.ok) {
    rec.reason = `기술을 추가할 때 Gi/No-Gi 조사를 하지 못했습니다(${r.code === 'RATE_LIMIT' ? 'AI 사용량 한도' : 'AI 응답 실패'}). 상세 화면에서 다시 조사할 수 있습니다.`;
    return rec;
  }

  const a = r.data;
  const sources = useGrounding
    ? r.groundingSources.map((s) => ({ title: s.title ?? '', url: s.uri ?? '' })).filter((s) => s.url).slice(0, 6)
    : web.filter((w) => strList(a.sourceIds, 10).map((x) => x.replace(/^.*:/, '')).includes(w.id)).map((w) => ({ title: w.title, url: w.url }));
  const cls = (VALID as unknown[]).includes(a.classification) ? (a.classification as GiNoGiClass) : 'undecided';
  const confidence = str(a.confidence);
  const difference = str(a.difference);
  rec.confidence = confidence;

  if (!sources.length) {
    rec.method = 'ai_rejected';
    rec.reason = '웹 근거 자료가 확인되지 않아 보류했습니다.';
    return rec;
  }
  // A source that never talks about gi / no-gi can't support ANY style verdict ("no difference mentioned" ≠ "same").
  const citedText = web.filter((w) => sources.some((x) => x.url === w.url)).map((w) => `${w.title} ${w.text}`).join(' ');
  if (!useGrounding && !STYLE_MENTION.test(citedText.replace(/no gi\/no-gi distinction given/gi, ''))) {
    rec.method = 'ai_rejected';
    rec.reason = '인용된 자료가 Gi/No-Gi 수행 방식을 직접 다루지 않아 보류했습니다.';
    return rec;
  }
  if (cls === 'undecided' || (confidence !== 'high' && confidence !== 'medium')) {
    rec.method = 'ai_rejected';
    rec.reason = `AI 판단의 확신도가 낮아(${confidence ?? '알 수 없음'}) 보류했습니다.`;
    return rec;
  }
  if (cls === 'both_differs' && !(difference && GI_SIDE.test(difference) && NOGI_SIDE.test(difference))) {
    rec.method = 'ai_rejected';
    rec.reason = '두 스타일의 차이가 구체적으로 확인되지 않아 보류했습니다.';
    return rec;
  }

  rec.classification = cls;
  rec.method = useGrounding ? 'ai_grounded' : 'ai_web_sources';
  rec.reason = str(a.reason);
  rec.difference = cls === 'both_differs' ? difference : null;
  rec.sources = sources;
  rec.gi.applicable = typeof a.giApplicable === 'boolean' ? a.giApplicable : null;
  rec.noGi.applicable = typeof a.noGiApplicable === 'boolean' ? a.noGiApplicable : null;
  if (cls === 'gi_centric') {
    rec.gi.applicable = true;
    // Like the official gi-centric techniques: gi grips are what make it work.
    rec.noGi.applicable = false;
  }
  if (cls === 'nogi_centric') rec.noGi.applicable = true;
  if (cls === 'both_differs' || cls === 'same') {
    rec.gi.applicable = true;
    rec.noGi.applicable = true;
  }
  if (cls === 'both_differs') {
    const gi = stylePosture(a.gi, sources);
    const noGi = stylePosture(a.noGi, sources);
    rec.postures = { ...(gi ? { gi } : {}), ...(noGi ? { noGi } : {}) };
  }
  return rec;
}

/** The technique with its Gi / No-Gi record attached — unchanged when it isn't a grappling technique or already has one. */
export async function withGiNoGi(t: Technique, deps?: GiNoGiDeps): Promise<Technique> {
  if (t.giNoGi || !isGiNoGiTarget(t)) return t;
  try {
    return { ...t, giNoGi: await analyzeGiNoGi(t, deps) };
  } catch {
    return t;
  }
}

// ---------------- on-demand re-research (detail page) — kept on this device

const LOCAL_KEY = 'martialdex:gi-nogi-local';
export const LOCAL_GI_NOGI_EVENT = 'martialdex:gi-nogi-local-updated';

function readLocal(): Record<string, GiNoGiRecord> {
  try {
    const v = JSON.parse(window.localStorage.getItem(LOCAL_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
export function getLocalGiNoGi(id: string): GiNoGiRecord | null {
  return readLocal()[id] ?? null;
}
export function saveLocalGiNoGi(id: string, r: GiNoGiRecord): void {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...readLocal(), [id]: r }));
  } catch {
    // storage full — the result is still shown this session
  }
  window.dispatchEvent(new CustomEvent(LOCAL_GI_NOGI_EVENT));
}
