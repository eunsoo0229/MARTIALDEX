import type { Technique } from '../../types';
import { askGeminiForJson } from '../fighterStyle/geminiJson';
import { aiProvider } from '../ai/provider';
import { searchTechniques } from '../search';
import { getMartialArt, isSyntheticTrainingDomain, martialArtSummaries } from '../loadData';
import { resolveTechnique } from '../userTechniques/service';
import { listLearnedTechniques } from '../learnedTechniques/service';
import { runExpandedWebResearch } from '../webSearch/expandedSearch';
import type { SearchResult } from '../webSearch/types';
import { COACH_SYSTEM_INSTRUCTION, techniqueData } from '../aiCoachDay/service';
import { politeFix } from '../aiCoachDay/politeSpeech';
import type { CoachMessage } from '../aiCoachDay/types';
import { buildConcepts, keyPointsReference } from './concepts';
import { buildScenarios } from './scenario';
import { getLearningRecord } from './records';
import { analyzeAnswer } from './analyzer';
import { classifyIntent } from './intent';
import { createLessonState, gradeChoice, lessonStep, type LessonContext } from './engine';
import { lessonPositionContext } from './service';
import type { CoachLessonState, LessonConcept, LessonStepResult, ScenarioItem } from './types';

// 「수업하고 싶은 거 입력하기」 — one free-text request → ONE lesson for today,
// taught by the existing Coach Lesson Engine. Never a curriculum: nothing
// here creates or saves a Curriculum/Day.
//
//   request ─▶ classify (technique named? topic/goal/situation?)
//            ─▶ live web search — ALWAYS, named technique or not
//            ─▶ lesson from the search material (+ the named technique's
//               MARTIALDEX data alongside it) ─▶ AI Coach
//
// Web search is the existing Tavily path (webSearch/expandedSearch.ts →
// webSearch/provider.ts → electron/webSearch.cjs or the web-search Edge
// Function). Search-derived lesson points must cite the sources they came
// from; with too little evidence the lesson is not generated rather than
// filled with unverified content.

export type OneOffMode = 'technique' | 'technique_goal' | 'topic';

export interface LessonSource {
  id: string;
  title: string;
  url: string;
  domain: string;
}

export interface OneOffClassification {
  mode: OneOffMode;
  techniqueId: string | null;
  martialArt: string | null;
  topic: string;
  /** Technique mode only: the request asks for practical use / strategy / mistakes / drills → search too. */
  needsWebSearch: boolean;
  searchQueries: string[];
  method: 'ai' | 'local';
}

export interface OneOffLesson {
  id: string;
  request: string;
  mode: OneOffMode;
  title: string;
  martialArt: string | null;
  techniqueId: string | null;
  intro: string;
  context: LessonContext;
  sources: LessonSource[];
  /** Whether live web search was actually called, and whether its results shaped the lesson. */
  webSearch: { called: boolean; queries: string[]; resultCount: number; used: boolean; note: string | null };
  /** Learned techniques the lesson connects to ("전에 배운 Jab을 …"). */
  linkedLearned: { techniqueId: string; name: string; line: string }[];
  practice: string;
  /** Grounded material text for coach Q&A and answer grading. */
  material: string;
  createdAt: string;
}

export type BuildOneOffResult =
  | { ok: true; lesson: OneOffLesson; classification: OneOffClassification }
  | { ok: false; code: 'EMPTY' | 'INSUFFICIENT_WEB_EVIDENCE' | 'SEARCH_UNAVAILABLE' | 'AI_FAILED'; message: string; classification?: OneOffClassification };

// ---------------------------------------------------------------- classification

/** Goal / theme words — even if a DB entry happens to share the name, these are training topics, not "one technique". */
const GOAL_TERMS = ['거리 조절', '거리조절', '거리', '공격', '방어', '압박', '스파링', '타격', '풋워크', '카운터', '체력', '페이스', '전략', '콤비네이션', '그래플링', '테이크다운 방어'];
/** Signals the request wants applied/outside material about a technique (→ DB + web search). */
const APPLIED_TERMS = /(활용|실전|실수|흔한|진입|전략|훈련법|드릴|응용|대응|연결|셋업|MMA에서|스파링에서|상황|방법|거리|타이밍|어떻게)/;

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s\-_.·]/g, '');
}

function techniqueNames(t: Technique): string[] {
  return [t.name, t.koreanName ?? '', ...(t.aliases ?? [])].map((n) => n?.trim()).filter((n): n is string => !!n && n.length >= 2);
}

/** A technique counts as "named" only if one of its names literally appears in the request (and isn't a goal word). */
function literallyNamed(request: string, t: Technique): boolean {
  const r = norm(request);
  return techniqueNames(t).some((n) => {
    const k = norm(n);
    return k.length >= 2 && r.includes(k) && !GOAL_TERMS.some((g) => norm(g) === k);
  });
}

function detectArt(request: string): string | null {
  const r = norm(request);
  for (const a of martialArtSummaries) {
    if ([a.nameKo, a.nameEn, a.id].some((n) => n && norm(n).length >= 2 && r.includes(norm(n)))) return a.id;
  }
  return null;
}

function candidatesFor(request: string, martialArt: string | null): Technique[] {
  const filters = martialArt ? { martialArt } : {};
  const pool = [...searchTechniques(request, 10, filters), ...(martialArt ? searchTechniques(request, 5) : [])];
  const seen = new Set<string>();
  return pool.filter((t) => !isSyntheticTrainingDomain(t.martialArt) && !seen.has(t.id) && seen.add(t.id)).slice(0, 12);
}

function defaultQueries(topic: string, artLabel: string | null, technique: Technique | null): string[] {
  const art = artLabel ?? '';
  const base = technique ? `${technique.name} ${topic}` : topic;
  return [`${art} ${base} 훈련 방법`.trim(), `${art} ${base} coaching drills tips`.trim(), `${art} ${base} common mistakes how to`.trim()];
}

/** Deterministic fallback when the classifier AI is unavailable. */
export function classifyLocally(request: string, selectedArt: string | null): OneOffClassification {
  const art = detectArt(request) ?? selectedArt;
  const named = candidatesFor(request, art).filter((t) => literallyNamed(request, t));
  const technique = named[0] ?? null;
  const goalLeft = GOAL_TERMS.some((g) => request.includes(g)) || APPLIED_TERMS.test(request.replace(technique?.koreanName ?? '\u0000', '').replace(technique?.name ?? '\u0000', ''));
  const mode: OneOffMode = !technique ? 'topic' : goalLeft ? 'technique_goal' : 'technique';
  const topic = request.replace(/^(오늘|오늘은)\s*/, '').replace(/(을|를)?\s*(제대로\s*)?(배우고|연습하고|잘하고|수업하고|하고)\s*싶(어|어요|다|습니다)?.*$/, '').trim() || request;
  const artLabel = art ? getMartialArt(art)?.nameKo ?? null : null;
  return { mode, techniqueId: technique?.id ?? null, martialArt: technique?.martialArt ?? art, topic, needsWebSearch: true, searchQueries: defaultQueries(topic, artLabel, technique), method: 'local' };
}

interface RawClassification {
  mode: string;
  techniqueId: string | null;
  topic: string;
  needsWebSearch: boolean;
  searchQueries: string[];
}

function isRawClassification(v: unknown): v is RawClassification {
  const d = v as RawClassification;
  return !!d && typeof d.mode === 'string' && typeof d.topic === 'string' && typeof d.needsWebSearch === 'boolean' && Array.isArray(d.searchQueries) && (d.techniqueId === null || typeof d.techniqueId === 'string');
}

export async function classifyRequest(request: string, selectedArt: string | null): Promise<OneOffClassification> {
  const local = classifyLocally(request, selectedArt);
  const art = detectArt(request) ?? selectedArt;
  const candidates = candidatesFor(request, art);
  const r = await askGeminiForJson<RawClassification>({
    systemInstruction: [
      '사용자가 "오늘 배우고 싶은 것"을 한 문장으로 입력한다. 이것은 커리큘럼이 아니라 오늘 하루의 1회성 수업이다.',
      '먼저 사용자가 특정 기술 하나를 명확하게 지목했는지 판단한다.',
      '- "technique": 특정 기술 자체를 배우고 싶다(예: "오늘 Jab을 배우고 싶어", "Double Leg을 제대로 배우고 싶어").',
      '- "technique_goal": 특정 기술을 지목했지만 그 기술의 활용/실전 응용/전략/흔한 실수/진입 방법/특정 상황 사용을 배우고 싶다(예: "잽으로 거리를 조절하는 법", "Double Leg의 흔한 실수", "MMA에서 Double Leg").',
      '- "topic": 특정 기술을 지목하지 않았다 — 무술만 지정(“복싱 수업”), 목표(“공격을 잘하고 싶어”, “거리 조절”, “방어”, “스파링 잘하기”), 상황(“키 큰 상대”, “상대가 계속 들어올 때”).',
      '기술 이름과 비슷한 단어가 있어도 사용자가 그 기술 하나를 배우겠다고 한 게 아니면 topic이다. "거리 조절", "공격", "방어", "압박", "스파링"은 기술이 아니라 주제다.',
      'techniqueId: technique/technique_goal일 때만 [후보 기술]의 id 중 하나, 아니면 null. 후보에 없으면 null.',
      'needsWebSearch: 항상 true (이 수업은 기술 지목 여부와 상관없이 항상 실시간 검색을 사용한다).',
      'searchQueries: 이 수업을 위해 웹에서 찾을 검색어 3개(한국어 1~2개, 영어 1~2개). 무술 이름을 포함한다.',
      'topic: 오늘 수업 주제를 짧은 한국어 구로.',
    ].join('\n'),
    contextText: [
      `[사용자 입력] ${request}`,
      `[선택된 무술] ${art ? getMartialArt(art)?.nameKo ?? art : '없음'}`,
      '[후보 기술]',
      ...(candidates.length ? candidates.map((t) => `${t.id}: ${t.name}${t.koreanName ? ` / ${t.koreanName}` : ''} (${getMartialArt(t.martialArt)?.nameKo ?? t.martialArt})`) : ['(없음)']),
    ].join('\n'),
    question: 'JSON {"mode","techniqueId","topic","needsWebSearch","searchQueries"} 로 답해줘.',
    validate: isRawClassification,
  });
  if (!r.ok) return local;

  const raw = r.data;
  let mode: OneOffMode = raw.mode === 'technique' || raw.mode === 'technique_goal' ? raw.mode : 'topic';
  let technique = raw.techniqueId ? candidates.find((t) => t.id === raw.techniqueId) ?? null : null;
  // Code guard: a technique mode needs the technique to be literally named in the request.
  if (mode !== 'topic' && (!technique || !literallyNamed(request, technique))) {
    technique = local.techniqueId ? resolveTechnique(local.techniqueId) ?? null : null;
    mode = technique ? (mode === 'technique' && local.mode === 'technique' ? 'technique' : 'technique_goal') : 'topic';
  }
  if (mode === 'technique' && local.mode === 'technique_goal') mode = 'technique_goal';
  const queries = raw.searchQueries.map((q) => q.trim()).filter(Boolean).slice(0, 4);
  return {
    mode,
    techniqueId: technique?.id ?? null,
    martialArt: technique?.martialArt ?? art,
    topic: raw.topic.trim() || local.topic,
    needsWebSearch: true,
    searchQueries: queries.length ? queries : local.searchQueries,
    method: 'ai',
  };
}

// ---------------------------------------------------------------- research

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Results with real text, de-duplicated, at most 2 per domain so no single site dominates. */
function usableSources(results: SearchResult[]): (SearchResult & { domain: string })[] {
  const perDomain = new Map<string, number>();
  const out: (SearchResult & { domain: string })[] = [];
  for (const r of results) {
    const text = (r.content ?? r.snippet ?? '').trim();
    const domain = domainOf(r.url);
    if (text.length < 120 || !domain) continue;
    if ((perDomain.get(domain) ?? 0) >= 2) continue;
    perDomain.set(domain, (perDomain.get(domain) ?? 0) + 1);
    out.push({ ...r, domain });
    if (out.length >= 8) break;
  }
  return out;
}

// ---------------------------------------------------------------- lesson building

interface RawConcept {
  label: string;
  importance: string;
  explain: string;
  variants: string[];
  reference: string;
  keywords: string[];
  confirm: string;
  explainQuestion: string;
  why: string;
  sourceIds: string[];
}

interface RawScenario {
  situation: string;
  question: string;
  answer: string;
  why: string;
  cue: string;
  keywords: string[];
  sourceIds: string[];
}

interface RawLesson {
  title: string;
  intro: string;
  concepts: RawConcept[];
  scenarios: RawScenario[];
  practice: string;
  learnedLinks: { techniqueId: string; line: string }[];
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isStrs = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

function isRawLesson(v: unknown): v is RawLesson {
  const d = v as RawLesson;
  return (
    !!d && isStr(d.title) && isStr(d.intro) && isStr(d.practice) &&
    Array.isArray(d.concepts) && d.concepts.every((c) => c && isStr(c.label) && isStr(c.explain) && isStr(c.reference) && isStrs(c.variants) && isStrs(c.keywords) && isStrs(c.sourceIds)) &&
    Array.isArray(d.scenarios) && d.scenarios.every((s) => s && isStr(s.situation) && isStr(s.question) && isStr(s.answer) && isStr(s.why) && isStrs(s.sourceIds)) &&
    Array.isArray(d.learnedLinks)
  );
}

function toConcept(c: RawConcept, i: number): LessonConcept {
  return {
    id: `web-${i}`,
    label: c.label.trim().slice(0, 40),
    importance: c.importance === 'support' ? 'support' : 'core',
    explain: c.explain.trim(),
    variants: c.variants.map((v) => v.trim()).filter(Boolean).slice(0, 3),
    reference: c.reference.trim(),
    keywords: c.keywords.map((k) => k.trim()).filter(Boolean).slice(0, 8),
    questions: {
      ...(isStr(c.confirm) && c.confirm.trim() ? { confirm: c.confirm.trim() } : {}),
      ...(isStr(c.explainQuestion) && c.explainQuestion.trim() ? { explain: c.explainQuestion.trim() } : {}),
      ...(isStr(c.why) && c.why.trim() ? { why: c.why.trim() } : {}),
    },
    choice: null,
  };
}

function newLessonId(): string {
  return `oneoff_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
}

/** Builds today's single lesson. Never creates or stores a curriculum. */
export async function buildOneOffLesson(request: string, selectedArt: string | null): Promise<BuildOneOffResult> {
  const text = request.trim();
  if (!text) return { ok: false, code: 'EMPTY', message: '오늘 배우고 싶은 것을 입력해 주세요.' };

  const classification = await classifyRequest(text, selectedArt);
  const technique = classification.techniqueId ? resolveTechnique(classification.techniqueId) ?? null : null;
  const artLabel = classification.martialArt ? getMartialArt(classification.martialArt)?.nameKo ?? classification.martialArt : null;

  // Live web search ALWAYS runs — whether or not a technique was named.
  // A named technique's MARTIALDEX data is only added alongside the search
  // material; there is no DB-only lesson.
  const dbConcepts = technique ? buildConcepts(technique) : [];
  const dbScenarios = technique ? buildScenarios(technique) : [];
  const queries = classification.searchQueries.length ? classification.searchQueries : defaultQueries(classification.topic, artLabel, technique);
  const research = await runExpandedWebResearch([queries.slice(0, 2), queries.slice(2)]);
  const webSearch: OneOffLesson['webSearch'] = {
    called: !research.notConfigured,
    queries: research.executedQueries,
    resultCount: research.collected.length,
    used: false,
    note: null,
  };
  const sources: (SearchResult & { domain: string })[] = research.ok ? usableSources(research.collected) : [];
  if (sources.length < 2 || new Set(sources.map((x) => x.domain)).size < 2) {
    return research.notConfigured
      ? { ok: false, code: 'SEARCH_UNAVAILABLE', message: '실시간 검색을 사용할 수 없어 오늘 수업 자료를 찾지 못했습니다. 로그인 상태와 네트워크를 확인해 주세요.', classification }
      : { ok: false, code: 'INSUFFICIENT_WEB_EVIDENCE', message: `"${classification.topic}"에 대해 믿을 만한 자료를 충분히 찾지 못했습니다 (검색 결과 ${research.collected.length}개). 확인되지 않은 내용으로 수업을 만들지 않았습니다. 조금 더 구체적으로 입력해 주세요.`, classification };
  }

  const labeledSources: LessonSource[] = sources.map((s, i) => ({ id: `S${i + 1}`, title: s.title, url: s.url, domain: s.domain }));
  const learned = listLearnedTechniques()
    .filter((e) => !classification.martialArt || e.technique.martialArt === classification.martialArt)
    .slice(0, 15)
    .map((e) => ({ id: e.technique.id, name: e.technique.koreanName || e.technique.name }));

  // --- lesson from the search material (+ the named technique's MARTIALDEX data, if any)
  const plan = await askGeminiForJson<RawLesson>({
    systemInstruction: [
      '너는 MARTIALDEX AI 코치다. 사용자가 오늘 배우고 싶다고 한 것을 오늘 하루의 1회성 수업(약 20분)으로 만든다. 커리큘럼이나 여러 날짜 계획을 만들지 않는다.',
      '근거는 [검색 자료](와 기술이 있으면 [MARTIALDEX 기술 데이터])뿐이다. 자료에 없는 내용을 지어내지 않는다.',
      '여러 자료에서 공통으로 확인되는 내용을 우선하고, 한 사이트의 내용을 그대로 옮기지 않는다. 확인이 안 되는 내용은 넣지 않는다.',
      '수업 흐름: 기본 개념 → 몸의 사용/움직임 → 적용 → 상황 대응 → 실습 → 복습. concepts 3~6개, 순서대로 가르친다.',
      '각 concept: label(짧은 이름), importance("core"|"support"), explain(1~2문장, 말하듯), variants(다른 설명 2개), reference(정답에 들어갈 핵심), keywords(채점용 핵심 단어 3~6개),',
      '  confirm/explainQuestion/why(학생에게 물을 질문 — 확인, 네 말로 설명, 이유), sourceIds(근거가 된 검색 자료 id, 예 ["S1","S3"]; 검색 자료가 없으면 기술 데이터 근거로 ["DB"]).',
      'scenarios 0~2개: 실전 상황 판단 문제 {situation, question, answer, why, cue, keywords, sourceIds}.',
      'practice: 혼자 또는 파트너와 오늘 할 구체적 실습(시간/횟수 포함) 1~2문장.',
      'learnedLinks: [사용자가 이미 배운 기술] 중 이 수업과 실제로 연결되는 것만 {techniqueId, line}("전에 배운 잽을 거리 조절에 활용해 보겠습니다" 같은 한 문장). 없으면 [].',
      'intro: 오늘 수업을 여는 코치의 첫 말 1~2문장. 모든 문장은 존댓말, 마크다운/이모지 없이.',
    ].join('\n'),
    contextText: [
      `[사용자 요청] ${text}`,
      `[수업 주제] ${classification.topic}${artLabel ? ` (${artLabel})` : ''}`,
      technique ? `[MARTIALDEX 기술 데이터]\n${techniqueData(technique)}` : '',
      labeledSources.length ? '[검색 자료]' : '',
      ...sources.map((s, i) => `[S${i + 1}] ${s.title} (${s.domain})\n${(s.content ?? s.snippet ?? '').replace(/\s+/g, ' ').slice(0, 1400)}`),
      `[사용자가 이미 배운 기술] ${learned.length ? learned.map((l) => `${l.id}: ${l.name}`).join(', ') : '없음'}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    question: 'JSON {"title","intro","concepts","scenarios","practice","learnedLinks"} 로 오늘 수업을 만들어줘.',
    validate: isRawLesson,
  });
  if (!plan.ok) return { ok: false, code: 'AI_FAILED', message: `수업을 구성하지 못했습니다: ${plan.message}`, classification };

  const validIds = new Set([...labeledSources.map((s) => s.id), ...(technique ? ['DB'] : [])]);
  // Accept "S1", "s1", "[S1]", "1" alike — the AI's citation format varies.
  const normId = (id: string) => {
    const t = String(id).trim().toUpperCase().replace(/[[\]\s]/g, '');
    if (t === 'DB') return 'DB';
    const n = t.match(/^S?(\d+)$/);
    return n ? `S${Number(n[1])}` : t;
  };
  for (const c of plan.data.concepts) c.sourceIds = c.sourceIds.map(normId);
  for (const sc of plan.data.scenarios) sc.sourceIds = sc.sourceIds.map(normId);
  const grounded = plan.data.concepts.filter((c) => c.sourceIds.some((id) => validIds.has(id)));
  if (grounded.length < 2) {
    return { ok: false, code: 'INSUFFICIENT_WEB_EVIDENCE', message: '검색 자료로 근거가 확인되는 수업 내용이 부족해 수업을 만들지 않았습니다. 조금 더 구체적으로 입력해 주세요.', classification };
  }
  const webConcepts = grounded.slice(0, 6).map(toConcept);
  const scenarios: ScenarioItem[] = plan.data.scenarios
    .filter((s) => s.sourceIds.some((id) => validIds.has(id)))
    .slice(0, 2)
    .map((s, i) => ({ id: `web-sc-${i}`, situation: s.situation, question: s.question, answer: s.answer, why: s.why, cue: isStr(s.cue) ? s.cue : '', keywords: isStrs(s.keywords) ? s.keywords : [] }));
  // DB + search: the technique's own core concepts first, then the applied material.
  const concepts = technique ? [...dbConcepts.slice(0, 2), ...webConcepts].slice(0, 7) : webConcepts;
  const learnedIds = new Set(learned.map((l) => l.id));
  const linkedLearned = (Array.isArray(plan.data.learnedLinks) ? plan.data.learnedLinks : [])
    .filter((l) => l && isStr(l.techniqueId) && isStr(l.line) && learnedIds.has(l.techniqueId))
    .slice(0, 2)
    .map((l) => ({ techniqueId: l.techniqueId, name: learned.find((x) => x.id === l.techniqueId)!.name, line: l.line.trim() }));
  webSearch.used = webConcepts.some((c, i) => grounded[i].sourceIds.some((id) => id.startsWith('S')));

  const name = plan.data.title.trim() || classification.topic;
  const material = [
    technique ? `[MARTIALDEX 기술 데이터]\n${techniqueData(technique)}` : '',
    '[오늘 수업 핵심]',
    ...concepts.map((c) => `- ${c.label}: ${c.reference}`),
    sources.length ? '[근거 자료 요약]' : '',
    ...sources.map((s, i) => `[S${i + 1}] ${s.title}: ${(s.content ?? s.snippet ?? '').replace(/\s+/g, ' ').slice(0, 500)}`),
  ]
    .filter(Boolean)
    .join('\n');

  return {
    ok: true,
    classification,
    lesson: {
      id: newLessonId(),
      request: text,
      mode: classification.mode,
      title: name,
      martialArt: classification.martialArt,
      techniqueId: technique?.id ?? null,
      intro: politeFix(plan.data.intro.trim()),
      context: {
        name,
        concepts,
        scenarios: [...scenarios, ...dbScenarios].slice(0, 3),
        keyPointsReference: concepts.map((c) => `${c.label}: ${c.reference}`).join(' / '),
        prior: technique ? getLearningRecord(technique.id) : null,
      },
      sources: labeledSources,
      webSearch,
      linkedLearned,
      practice: plan.data.practice.trim(),
      material,
      createdAt: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------- running the lesson

const ONE_OFF_RULE =
  '이 수업은 사용자가 오늘 배우고 싶다고 한 주제의 1회성 수업이다. [수업 자료]에 있는 내용만 근거로 답하고, 자료에 없으면 확인되지 않았다고 말한다.';

export function startOneOffLesson(lesson: OneOffLesson): LessonStepResult {
  const lead = [lesson.intro, ...lesson.linkedLearned.map((l) => l.line)].filter(Boolean).join(' ');
  return lessonStep(createLessonState(lesson.techniqueId ?? lesson.id, lesson.context), lesson.context, { type: 'START', lead });
}

export async function respondOneOff(lesson: OneOffLesson, state: CoachLessonState, text: string, history: CoachMessage[]): Promise<LessonStepResult> {
  const ctx = lesson.context;
  const technique = lesson.techniqueId ? resolveTechnique(lesson.techniqueId) ?? null : null;
  const intent = classifyIntent(text, state.pending);

  if (intent === 'question') {
    const res = await aiProvider.ask({
      systemInstruction: `${COACH_SYSTEM_INSTRUCTION}\n- ${ONE_OFF_RULE}`,
      contextText: `[수업 자료]\n${lesson.material}\n\n${lessonPositionContext(state, ctx)}`,
      history: history.slice(-8).map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text })),
      question: text,
    });
    return lessonStep(state, ctx, { type: 'STUDENT', text, intent, answer: res.ok ? politeFix(res.text.trim()) : `지금은 답변을 가져오지 못했습니다: ${res.message}` });
  }

  if (intent === 'answer' && state.pending && gradeChoice(state.pending, text) === null) {
    const concept = ctx.concepts.find((c) => c.id === state.pending!.conceptId) ?? null;
    const scenario = ctx.scenarios.find((s) => s.id === state.pending!.conceptId) ?? null;
    const reference = scenario ? `${scenario.answer} (${scenario.why})` : ctx.keyPointsReference;
    const used = concept ? [concept.explain, ...concept.variants].slice(0, state.understanding.concepts[concept.id]?.explained ?? 1) : [];
    const analysis = await analyzeAnswer({ technique, material: lesson.material, concept, reference, pending: state.pending, answer: text, level: state.level, alreadyExplained: used });
    return lessonStep(state, ctx, { type: 'STUDENT', text, intent, analysis, answer: analysis.reply });
  }
  return lessonStep(state, ctx, { type: 'STUDENT', text, intent });
}

export function oneOffEvent(lesson: OneOffLesson, state: CoachLessonState, event: { type: 'VIDEO_DONE' } | { type: 'PRACTICE_DONE'; completed: boolean }): LessonStepResult {
  return lessonStep(state, lesson.context, event);
}
