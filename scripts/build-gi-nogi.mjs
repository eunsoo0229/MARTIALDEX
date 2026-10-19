// Gi / No-Gi — 그래플링 기술 전수 조사 → data/curated/gi-nogi.json
//
//   node scripts/build-gi-nogi.mjs                 # rules only (no network)
//   node scripts/build-gi-nogi.mjs --ai-classify   # + grounded AI for undecided techniques
//   node scripts/build-gi-nogi.mjs --ai-postures   # + grounded AI style postures (공통·차이 있음)
//   options: --limit N (AI items this run), --only id1,id2
//
// Targets: every technique in the REAL library (src/lib/loadData.ts, loaded
// through Vite like audit-technique-art-matrix.mjs) whose art is a grappling
// art (bjj, judo, wrestling, sambo) or an MMA grappling category, canonical
// ids only (merged duplicates are one technique).
//
// Decisions, in order — each one keeps its evidence:
//  1. Rules (data only, no AI): the BJJ source document's own section
//     "기(Gi)에서 특히 중요한 기술", or a gi-garment grip in the technique's
//     NAME → Gi 중심. Nothing else is decided by rules: a collar grip
//     mentioned in a guard's posture text doesn't make the guard gi-only, and
//     "노기에서 자주 등장" doesn't make a technique no-gi-only.
//  2. --ai-classify: the rest, in batches, Gemini WITH Google Search
//     grounding (the app's own electron/gemini.cjs). Accepted only when the
//     batch returned real web sources and the model's confidence is high or
//     medium; otherwise the technique stays 판단 보류 (undecided).
//  3. --ai-postures: for 공통(차이 있음) techniques, style-specific grips /
//     steps / key points / differences, grounded, with sources, stored as
//     status "ai_researched" (shown as "AI 조사 · 검토 전" — never as verified).
// AI results are cached in data/audit/gi-nogi-ai-cache.json so reruns are
// incremental and reproducible.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const LIMIT = Number(opt('--limit') ?? Infinity);
const ONLY = opt('--only')?.split(',') ?? null;
// --web tavily: gather evidence with the app's Tavily search (one cached search per
// technique) and let Gemini answer ONLY from those pages (no grounding needed).
const WEB = opt('--web');

const CACHE_PATH = path.join(ROOT, 'data/audit/gi-nogi-ai-cache.json');
const OUT_PATH = path.join(ROOT, 'data/curated/gi-nogi.json');
const cache = fs.existsSync(CACHE_PATH) ? JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) : { classify: {}, postures: {} };
cache.web ??= {};
cache.videoMeta ??= {};
const saveCache = () => fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 1));

// ---------------- load the real library
const server = await createServer({ root: ROOT, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
let ld;
try {
  ld = await server.ssrLoadModule('/src/lib/loadData.ts');
} finally {
  await server.close();
}

const GRAPPLING_ARTS = new Set(['bjj', 'judo', 'wrestling', 'sambo']);
const MMA_GRAPPLING = /(클린치|테이크다운|그라운드|서브미션|스크램블|그래플링|파운딩|clinch|takedown|ground|submission|scramble|grappl)/i;
const GI_SECTION = '기(Gi)에서 특히 중요한 기술';
const NOGI_SECTION = '노기(No-Gi)에서 자주 등장하는 포지션';

function arts(t) {
  return [...new Set([t.martialArt, ...(t.martialArts ?? [])])];
}
// Combat sambo / MMA also file punches & kicks (a canonical Jab lists sambo among its arts) —
// a striking category is not a grappling technique unless a pure grappling art files it.
const STRIKING = /(펀치|킥|니 \(무릎\)|팔꿈치|엘보|타격|punch|kick|strike|elbow)/i;
const PURE_GRAPPLING = new Set(['bjj', 'judo', 'wrestling']);
function isGrappling(t) {
  if (t.notTechnique) return false;
  const a = arts(t);
  if (STRIKING.test(t.category ?? '') && !a.some((x) => PURE_GRAPPLING.has(x))) return false;
  if (a.some((x) => GRAPPLING_ARTS.has(x))) return true;
  return a.includes('mixed-martial-arts') && MMA_GRAPPLING.test(`${t.category} ${(t.positions ?? []).join(' ')}`);
}

const all = ld.allTechniques;
const targets = [...new Map(all.filter(isGrappling).map((t) => [t.id, t])).values()].sort((a, b) => a.id.localeCompare(b.id));

// Text written for THIS technique (not shared category boilerplate).
const freq = (field) => {
  const m = new Map();
  for (const t of all) {
    const v = (t[field] ?? '').trim();
    if (v) m.set(v, (m.get(v) ?? 0) + 1);
  }
  return m;
};
const descFreq = freq('description');
const purposeFreq = freq('purpose');
function ownText(t) {
  const p = t.posture ?? {};
  const parts = [p.overview, p.startingPosition, ...(p.steps ?? []), ...(p.keyPoints ?? []), ...(p.commonMistakes ?? []), ...Object.values(p.bodyPosition ?? {})];
  if (t.description && (descFreq.get(t.description.trim()) ?? 0) < 3) parts.push(t.description);
  if (t.purpose && (purposeFreq.get(t.purpose.trim()) ?? 0) < 3) parts.push(t.purpose);
  return parts.filter(Boolean).join(' ');
}
const nameText = (t) => [t.name, t.koreanName, ...(t.aliases ?? [])].filter(Boolean).join(' ');

// Gi-garment grip words. Wrestling "collar tie" (a neck tie, no garment) and "seatbelt" are NOT gi.
const NOT_GI = /(collar\s?tie|칼라\s?타이|넥\s?타이|seat\s?belt|시트\s?벨트|belt\s?line)/gi;
const GI_WORD = /(도복|기모노|칼라|깃|라펠|소매|슬리브|바지\s?(그립|잡)|팬츠\s?그립|벨트\s?(그립|잡)|오비|쿠미\s?카타|collar|lapel|sleeve|pants?\s?grip|belt\s?grip|kimono|\bgi\b|jacket|kurtka|куртк|ворот|рукав|пояс)/i;
const NOGI_WORD = /(no[\s-]?gi|노\s?기|노-기|도복\s?(없이|그립이\s?없))/i;
const hasGi = (s) => GI_WORD.test((s ?? '').replace(NOT_GI, ' '));
const hasNoGi = (s) => NOGI_WORD.test(s ?? '');

// ---------------- 1. rules
const records = {};
for (const t of targets) {
  const own = ownText(t);
  const evidence = [];
  const cats = [t.category, ...(t.positions ?? [])];
  if (cats.includes(GI_SECTION)) evidence.push({ type: 'data', text: `BJJ 원문 분류: "${GI_SECTION}"${t.category === GI_SECTION ? ' (주 분류)' : ''}` });
  if (cats.includes(NOGI_SECTION)) evidence.push({ type: 'data', text: `BJJ 원문 분류: "${NOGI_SECTION}"${t.category === NOGI_SECTION ? ' (주 분류)' : ''} — 노기에서 자주 쓰인다는 뜻이지 노기 전용이라는 뜻은 아님` });
  if (hasGi(nameText(t))) evidence.push({ type: 'data', text: `기술 이름에 도복 그립 표현: ${nameText(t).slice(0, 80)}` });
  if (hasGi(own)) evidence.push({ type: 'data', text: '이 기술의 자세·설명에 도복(깃·소매·라펠 등) 그립 언급' });
  if (hasNoGi(own)) evidence.push({ type: 'data', text: '이 기술의 자세·설명에 노기 언급' });
  if (arts(t).includes('wrestling') && !arts(t).some((a) => a === 'bjj' || a === 'judo' || a === 'sambo')) evidence.push({ type: 'data', text: '레슬링 기술(레슬링은 도복을 입지 않는 경기)' });

  let classification = 'undecided';
  let method = 'pending';
  if (t.category === GI_SECTION || (cats.includes(GI_SECTION) && hasGi(own)) || hasGi(nameText(t))) {
    classification = 'gi_centric';
    method = 'rule';
  }
  records[t.id] = {
    name: t.name,
    koreanName: t.koreanName ?? null,
    arts: arts(t),
    category: t.category,
    classification,
    gi: { applicable: classification === 'gi_centric' ? true : null },
    // A gi-garment grip/choke can't be done without a gi.
    noGi: { applicable: classification === 'gi_centric' ? false : null },
    method,
    reason: classification === 'gi_centric' ? '원문 분류 또는 기술 이름이 도복 그립을 직접 가리킵니다.' : null,
    difference: null,
    confidence: classification === 'gi_centric' ? 'data' : null,
    evidence,
    sources: [],
    basePostureStyle: t.posture ? (hasGi(ownText({ ...t, description: null, purpose: null })) ? 'gi' : 'neutral') : null,
    postures: {},
  };
}

// ---------------- AI helpers (grounded, the app's own Gemini transport)
let askGemini = null;
async function ask(request) {
  if (!askGemini) {
    require('dotenv').config({ path: path.join(ROOT, '.env') });
    askGemini = require(path.join(ROOT, 'electron/gemini.cjs')).askGemini;
  }
  // Free-tier pacing: a pause between calls, and a minute's wait on a rate limit.
  for (let i = 0; i < 5; i++) {
    await new Promise((res) => setTimeout(res, 8000));
    const r = await askGemini({ history: [], contextText: '', useSearchGrounding: !WEB, ...request });
    if (r.ok) return r;
    const wait = r.code === 'RATE_LIMIT' ? 65000 : 5000 * (i + 1);
    console.log(`   AI 실패(${r.code}): ${r.message?.slice(0, 60)} — ${i < 4 ? `${Math.round(wait / 1000)}초 후 재시도` : '포기'}`);
    if (i < 4) await new Promise((res) => setTimeout(res, wait));
  }
  return null;
}
function parseJson(text) {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}
// ---------------- web evidence (Tavily)
let webSearch = null;
const ART_EN = { bjj: 'BJJ', judo: 'judo', wrestling: 'wrestling', sambo: 'sambo', 'mixed-martial-arts': 'MMA' };
function relevantText(text, t) {
  const sentences = (text ?? '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/);
  const key = new RegExp(`(\\bgi\\b|no[\\s-]?gi|nogi|collar|lapel|sleeve|grip|${t.name.split(/\\s+/)[0].replace(/[^\\w]/g, '')})`, 'i');
  const picked = sentences.filter((x) => key.test(x));
  return (picked.length ? picked : sentences).join(' ').slice(0, 900);
}
async function evidenceFor(t) {
  if (cache.web[t.id]) return cache.web[t.id];
  if (!webSearch) {
    require('dotenv').config({ path: path.join(ROOT, '.env') });
    webSearch = require(path.join(ROOT, 'electron/webSearch.cjs')).webSearch;
  }
  const art = ART_EN[arts(t).find((a) => ART_EN[a])] ?? 'grappling';
  const query = `${t.name} ${art} gi vs no-gi grips technique`;
  const r = await webSearch(query);
  if (!r.ok) {
    console.log(`   검색 실패(${r.code}) ${t.id}`);
    return null;
  }
  const results = r.results.slice(0, 5).map((x, i) => ({ id: `S${i + 1}`, title: x.title, url: x.url, text: relevantText(x.content ?? x.snippet ?? '', t) })).filter((x) => x.text.length > 60);
  cache.web[t.id] = { query, results, at: new Date().toISOString() };
  saveCache();
  return cache.web[t.id];
}
const webBlock = (t, ev) => (ev?.results ?? []).map((r) => `  [${t.id}:${r.id}] ${r.title} (${r.url})\n  ${r.text}`).join('\n');

const brief = (t) => {
  const own = ownText(t).replace(/\s+/g, ' ').slice(0, 260);
  return `- id: ${t.id}\n  이름: ${t.name}${t.koreanName ? ` / ${t.koreanName}` : ''}${t.aliases?.length ? ` (별칭: ${t.aliases.slice(0, 3).join(', ')})` : ''}\n  무술: ${arts(t).join(', ')} · 분류: ${t.category}\n  앱 데이터: ${own || '(없음)'}`;
};

// ---------------- 2. AI classification
if (flag('--ai-classify')) {
  // With --web, a verdict made without any search results (search failed / quota) is retried.
  const todo = targets.filter((t) => records[t.id].classification === 'undecided' && (!cache.classify[t.id] || (WEB && !cache.web[t.id])) && (!ONLY || ONLY.includes(t.id))).slice(0, LIMIT);
  console.log(`AI 분류 대상 ${todo.length}개 (캐시 ${Object.keys(cache.classify).length}개)`);
  const BATCH = WEB ? 6 : 10;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const r = await ask({
      systemInstruction: [
        '너는 그래플링(주짓수·유도·레슬링·삼보) 기술 분류 검토자다. 각 기술이 도복(Gi)과 노기(No-Gi)에서 어떻게 수행되는지 웹 자료로 확인해 분류한다.',
        'classification:',
        '- "both_differs": 두 스타일 모두에서 쓰이고, 그립·제어 방식·수행 단계에 의미 있는 차이가 있다(예: Gi는 깃·소매 그립, No-Gi는 손목·목·오버훅 컨트롤).',
        '- "gi_centric": 도복의 깃·소매·바지·벨트를 잡거나 이용해야 성립한다(No-Gi에서는 사실상 불가하거나 다른 기술이 된다).',
        '- "nogi_centric": 주로 No-Gi에서 쓰인다(예: 도복 경기 규정상 제한되거나, 도복이 있으면 마찰·그립 때문에 거의 쓰이지 않는다).',
        '- "same": 두 스타일 모두에서 쓰이고 수행 방식에 의미 있는 차이가 없다.',
        '- "undecided": 확실한 근거가 없다. 추측하지 말고 이것을 선택한다.',
        'giApplicable / noGiApplicable: 해당 스타일에서 이 기술을 쓸 수 있으면 true, 사실상 불가하면 false.',
        'reason: 한국어 1문장, 그립·제어 방식 등 수행 방식 근거. difference: both_differs일 때만 Gi와 No-Gi 차이 1문장(한국어), 아니면 null.',
        'difference에는 Gi 쪽의 구체적인 그립(예: 소매·깃·라펠·바지·벨트)과 No-Gi 쪽의 구체적인 제어(예: 손목·오버훅·언더훅·목·바디락)를 둘 다 적는다. 자료로 구체적인 차이를 확인할 수 없으면 both_differs 대신 "undecided"를 선택한다.',
        'confidence: "high" | "medium" | "low" — 웹 자료로 확인한 정도.',
        '앱 데이터의 이름이 실제 기술이 아닌 그립·포지션 이름이어도 같은 기준으로 판단한다.',
        WEB
          ? '근거는 각 기술 아래의 [웹 자료]뿐이다. 자료에 없는 내용으로 판단하지 않는다. sourceIds에 판단 근거가 된 자료 id(예: "S1","S3")를 넣는다. 근거 자료가 없거나 자료가 이 기술을 다루지 않으면 "undecided".'
          : '',
        '출력: JSON 배열만. [{"id","classification","giApplicable","noGiApplicable","reason","difference","confidence"' + (WEB ? ',"sourceIds"' : '') + '}]',
      ].filter(Boolean).join('\n'),
      question: WEB
        ? `다음 기술들을 분류해 줘:\n${(await Promise.all(batch.map(async (t) => `${brief(t)}\n  [웹 자료]\n${webBlock(t, await evidenceFor(t)) || '  (자료 없음)'}`))).join('\n')}`
        : `다음 기술들을 분류해 줘:\n${batch.map(brief).join('\n')}`,
    });
    const parsed = r ? parseJson(r.text) : null;
    const groundSources = (r?.groundingSources ?? []).map((s) => ({ title: s.title ?? '', url: s.uri ?? s.url ?? '' })).filter((s) => s.url).slice(0, 8);
    for (const t of batch) {
      const item = Array.isArray(parsed) ? parsed.find((x) => x && x.id === t.id) : null;
      if (!r) continue; // request failed — not cached, retried next run
      // Tavily mode: sources = only the pages the model cited, and only ones we actually gave it.
      const web = cache.web[t.id]?.results ?? [];
      const cited = WEB && item && Array.isArray(item.sourceIds) ? web.filter((w) => item.sourceIds.map((x) => String(x).replace(/^.*:/, '')).includes(w.id)).map((w) => ({ title: w.title, url: w.url })) : [];
      const sources = WEB ? cited : groundSources;
      cache.classify[t.id] = item ? { ...item, sources, evidenceMode: WEB ? 'tavily' : 'grounding', at: new Date().toISOString() } : { error: 'parse', at: new Date().toISOString() };
    }
    saveCache();
    console.log(`   ${Math.min(i + BATCH, todo.length)}/${todo.length} · 인용된 근거 ${batch.reduce((n, t) => n + (cache.classify[t.id]?.sources?.length ?? 0), 0)}개`);
  }
}

const GI_SIDE = /(깃|칼라|라펠|소매|슬리브|바지|팬츠|벨트|도복\s?(원단|자락)|collar|lapel|sleeve|pants|belt)/i;
const NOGI_SIDE = /(손목|오버\s?훅|언더\s?훅|목|머리|바디\s?락|겨드랑|팔뚝|이두|삼두|발목|무릎|허리|wrist|overhook|underhook|neck|head|body\s?lock|collar\s?tie)/i;
const VALID = new Set(['both_differs', 'gi_centric', 'nogi_centric', 'same', 'undecided']);
for (const t of targets) {
  const rec = records[t.id];
  const c = cache.classify[t.id];
  if (rec.classification !== 'undecided' || !c || c.error) continue;
  if (c.evidenceMode === 'tavily' && !cache.web[t.id]) {
    // The web search itself failed (e.g. Tavily quota) — not researched yet, not "rejected".
    rec.method = 'pending';
    rec.reason = '웹 검색을 수행하지 못해(검색 한도 초과 등) 아직 조사하지 못했습니다.';
    continue;
  }
  const ok = VALID.has(c.classification) && (c.confidence === 'high' || c.confidence === 'medium') && c.sources?.length > 0;
  if (!ok) {
    rec.method = 'ai_rejected';
    rec.reason = c.sources?.length ? `AI 판단의 확신도가 낮아(${c.confidence}) 보류했습니다.` : '웹 근거 자료가 확인되지 않아 보류했습니다.';
    continue;
  }
  // "공통·차이 있음" needs a concrete difference on BOTH sides — a vague "도복 그립 체계가 추가" is not evidence.
  if (c.classification === 'both_differs' && !(GI_SIDE.test(c.difference ?? '') && NOGI_SIDE.test(c.difference ?? ''))) {
    rec.method = 'ai_rejected';
    rec.reason = '두 스타일의 차이가 구체적으로 확인되지 않아 보류했습니다.';
    continue;
  }
  rec.classification = c.classification;
  rec.method = c.evidenceMode === 'tavily' ? 'ai_web_sources' : 'ai_grounded';
  rec.reason = c.reason ?? null;
  rec.difference = c.classification === 'both_differs' ? c.difference ?? null : null;
  rec.confidence = c.confidence;
  rec.sources = c.sources;
  rec.gi.applicable = typeof c.giApplicable === 'boolean' ? c.giApplicable : null;
  rec.noGi.applicable = typeof c.noGiApplicable === 'boolean' ? c.noGiApplicable : null;
  // Code-level consistency: a gi-centric technique isn't "not applicable in Gi", etc.
  if (rec.classification === 'gi_centric') rec.gi.applicable = true;
  if (rec.classification === 'nogi_centric') rec.noGi.applicable = true;
  if (rec.classification === 'both_differs' || rec.classification === 'same') {
    rec.gi.applicable = true;
    rec.noGi.applicable = true;
  }
}

// ---------------- 2b. the user's own judgements (data/curated/gi-nogi-user.json) — override rule/AI.
const USER_PATH = path.join(ROOT, 'data/curated/gi-nogi-user.json');
const userJudged = fs.existsSync(USER_PATH) ? JSON.parse(fs.readFileSync(USER_PATH, 'utf8')).techniques ?? {} : {};
for (const t of targets) {
  const u = userJudged[t.id];
  const rec = records[t.id];
  if (!u || !VALID.has(u.classification) || u.classification === 'undecided') continue;
  rec.classification = u.classification;
  rec.method = 'user';
  rec.reason = '사용자가 직접 판단했습니다.';
  rec.difference = u.classification === 'both_differs' ? u.difference ?? null : null;
  rec.confidence = 'user';
  rec.sources = [];
  rec.evidence = [...rec.evidence.filter((e) => e.type === 'data'), { type: 'user', text: `사용자 판단 (${String(u.at ?? '').slice(0, 10)})` }];
  rec.gi.applicable = u.classification === 'nogi_centric' ? null : true;
  rec.noGi.applicable = u.classification === 'gi_centric' ? false : true;
}

// ---------------- 3. AI style postures
if (flag('--ai-postures')) {
  const todo = targets.filter((t) => records[t.id].classification === 'both_differs' && !cache.postures[t.id] && (!ONLY || ONLY.includes(t.id))).slice(0, LIMIT);
  console.log(`AI 스타일별 자세 대상 ${todo.length}개`);
  const BATCH = 2;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const r = await ask({
      systemInstruction: [
        '너는 그래플링 코치다. 각 기술을 도복(Gi)과 노기(No-Gi)로 나눠, 웹에서 확인되는 일반적인 수행 방식만 짧게 정리한다. 확인되지 않는 세부 동작은 쓰지 않는다.',
        '각 스타일: grips(그립 또는 신체 제어 방식 1문장), steps(핵심 단계 3~5개, 각 1문장), keyPoints(2~3개), safety(안전 주의 1문장, 관절기·조르기는 탭하면 즉시 풀기 등).',
        'Gi는 깃·소매·바지·벨트 그립을, No-Gi는 손목·목·오버훅/언더훅·바디락 등 도복 없는 제어를 정확히 구분한다. 두 스타일에 똑같은 문장을 복사하지 않는다.',
        'difference: 두 스타일의 핵심 차이 1~2문장. 모든 문장은 한국어 존댓말 평서문.',
        WEB ? '근거는 [앱 데이터]와 [웹 자료]뿐이다. 자료로 확인되지 않는 그립·단계는 쓰지 않고, 확인되는 만큼만 쓴다(단계가 2개 미만이면 그 스타일은 null). sourceIds에 근거 자료 id를 넣는다.' : '',
        '출력: JSON 배열만. [{"id","gi":{"grips","steps","keyPoints","safety"}|null,"noGi":{"grips","steps","keyPoints","safety"}|null,"difference"' + (WEB ? ',"sourceIds"' : '') + '}]',
      ].filter(Boolean).join('\n'),
      question: WEB
        ? `다음 기술의 Gi / No-Gi 수행 방식을 정리해 줘:\n${(await Promise.all(batch.map(async (t) => `${brief(t)}\n  [웹 자료]\n${webBlock(t, await evidenceFor(t)) || '  (자료 없음)'}`))).join('\n')}`
        : `다음 기술의 Gi / No-Gi 수행 방식을 정리해 줘:\n${batch.map(brief).join('\n')}`,
    });
    const parsed = r ? parseJson(r.text) : null;
    const groundSources = (r?.groundingSources ?? []).map((s) => ({ title: s.title ?? '', url: s.uri ?? s.url ?? '' })).filter((s) => s.url).slice(0, 8);
    for (const t of batch) {
      const item = Array.isArray(parsed) ? parsed.find((x) => x && x.id === t.id) : null;
      if (!r) continue;
      const web = cache.web[t.id]?.results ?? [];
      const cited = WEB && item && Array.isArray(item.sourceIds) ? web.filter((w) => item.sourceIds.map((x) => String(x).replace(/^.*:/, '')).includes(w.id)).map((w) => ({ title: w.title, url: w.url })) : [];
      // Unparsed answers are NOT cached — the next run retries them.
      if (item) cache.postures[t.id] = { ...item, sources: WEB ? cited : groundSources, evidenceMode: WEB ? cache.web[t.id]?.provider ?? 'tavily' : 'grounding', at: new Date().toISOString() };
    }
    saveCache();
    const got = batch.filter((t) => cache.postures[t.id]).length;
    console.log(`   ${Math.min(i + BATCH, todo.length)}/${todo.length} · 자세 ${got}/${batch.length}개 저장`);
  }
}

const strList = (v, n) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, n) : []);
function stylePosture(p, sources) {
  if (!p || typeof p !== 'object') return null;
  const steps = strList(p.steps, 6);
  if (!p.grips || steps.length < 2) return null;
  return { grips: String(p.grips).trim(), steps, keyPoints: strList(p.keyPoints, 4), safety: typeof p.safety === 'string' ? p.safety.trim() : null, status: 'ai_researched', sources };
}
for (const t of targets) {
  const rec = records[t.id];
  const c = cache.postures[t.id];
  if (rec.classification !== 'both_differs' || !c || c.error || !c.sources?.length) continue;
  const gi = stylePosture(c.gi, c.sources);
  const noGi = stylePosture(c.noGi, c.sources);
  // Same text for both styles = no real distinction → not used.
  if (gi && noGi && gi.steps.join() === noGi.steps.join()) continue;
  if (gi) rec.postures.gi = gi;
  if (noGi) rec.postures.noGi = noGi;
  if (!rec.difference && typeof c.difference === 'string') rec.difference = c.difference.trim();
}

// ---------------- 4. videos → style, from evidence only
// title > keywords > description (description only when it names ONE style —
// "we teach gi and no-gi" channel blurbs prove nothing about this video).
function styleIn(text) {
  const t = text ?? '';
  const both = /gi\s*(&|and|\/|or|vs\.?)\s*no[\s-]?gi|no[\s-]?gi\s*(&|and|\/|or|vs\.?)\s*gi/i.test(t);
  const nogi = /\bno[\s-]?gi\b|\bnogi\b|노\s?기/i.test(t);
  const gi = /\bgi\b(?![\s-]?(and|&)\s*no)|kimono|도복|(collar|lapel|sleeve)\s?(grip|choke|drag)/i.test(t.replace(/no[\s-]?gi/gi, ' '));
  return { both, nogi, gi };
}
function decide(text, strict) {
  const r = styleIn(text);
  if (r.both) return strict ? null : 'both';
  if (r.nogi && r.gi) return strict ? null : 'both';
  if (r.nogi) return 'nogi';
  if (r.gi) return 'gi';
  return null;
}
const curated = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/curated/videos.json'), 'utf8'));
const targetIds = new Set(targets.map((t) => t.id));
const videoStyles = {};
if (flag('--video-meta')) {
  require('dotenv').config({ path: path.join(ROOT, '.env') });
  const { getVideoInfo } = require(path.join(ROOT, 'electron/youtubeSearch.cjs'));
  const ids = [...new Set(targets.flatMap((t) => (t.videos ?? []).map((v) => v.videoId)))].filter((id) => !cache.videoMeta[id]);
  console.log(`영상 메타데이터 수집 ${ids.length}개`);
  for (const [i, id] of ids.entries()) {
    const r = await getVideoInfo(id).catch(() => null);
    if (r?.ok) cache.videoMeta[id] = { title: r.info.title, description: (r.info.description ?? '').slice(0, 1500), keywords: (r.info.keywords ?? []).slice(0, 30), at: new Date().toISOString() };
    else cache.videoMeta[id] = { error: r?.code ?? 'request', at: new Date().toISOString() };
    if (i % 20 === 19) saveCache();
    await new Promise((res) => setTimeout(res, 400));
  }
  saveCache();
}
for (const [tid, vids] of Object.entries(curated)) {
  for (const v of vids) {
    const meta = cache.videoMeta[v.videoId];
    let style = decide(v.title ?? '', false);
    let basis = style ? 'title' : null;
    if (!style && meta && !meta.error) {
      style = decide((meta.keywords ?? []).join(' '), true);
      basis = style ? 'keywords' : null;
      if (!style) {
        style = decide(meta.description ?? '', true);
        basis = style ? 'description' : null;
      }
    }
    // An instructional video of a technique that only exists in the Gi is a Gi video.
    const owner = records[tid] ?? null;
    if (!style && owner && owner.classification === 'gi_centric' && owner.noGi.applicable === false) {
      style = 'gi';
      basis = 'technique_gi_only';
    }
    videoStyles[v.videoId] = { techniqueId: tid, style: style ?? 'unknown', basis, ...(targetIds.has(tid) ? {} : { nonGrappling: true }) };
  }
}

// ---------------- output
const out = {
  version: 1,
  generatedAt: new Date().toISOString(),
  note: 'scripts/build-gi-nogi.mjs가 생성. classification/postures는 근거(evidence/sources)와 함께 저장되며, ai_researched는 검토 전 자료입니다.',
  techniques: records,
  videoStyles,
};
fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 1));

const counts = {};
for (const r of Object.values(records)) counts[r.classification] = (counts[r.classification] ?? 0) + 1;
console.log(`그래플링 대상 ${targets.length}개 →`, counts, `· 스타일별 자세 ${Object.values(records).filter((r) => r.postures.gi || r.postures.noGi).length}개`);
