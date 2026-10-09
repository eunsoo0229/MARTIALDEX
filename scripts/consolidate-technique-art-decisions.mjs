// Technique × martial-art audit — merges the JUDGED half into one decisions file.
//
//   node scripts/consolidate-technique-art-decisions.mjs
//
// Inputs: data/audit/judgements/*.json — one object per judged pair
//   { id, art?, decision: add|none|review, confidence: A|B|C, reason, evidence }
//   (mma-*.json judge MMA for every technique not yet linked to it;
//    cross.json judges pairs where another art's own data mentions a technique)
// These are AI judgements made against written criteria
// (data/audit/judgement-criteria/*.md) with MARTIALDEX data + cited external
// sources (data/audit/external-sources.json). They are kept as they were made;
// a reviewer's override goes in data/audit/reviewer-overrides.json with its reason.
//
// Output: data/audit/technique-art-decisions.json — every judged pair with the
// art category it would be filed under (the art's own canonical category,
// chosen by techniqueCanonical/category.ts rules). build-technique-canonical.mjs
// turns the "add" decisions into art links.
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = path.join(ROOT, 'data/audit/judgements');

/** Reviewer overrides of a judgement (data/audit/reviewer-overrides.json): key "techniqueId|art" → { decision, confidence, reason }. */
const OVERRIDES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/audit/reviewer-overrides.json'), 'utf8'));

const server = await createServer({ root: ROOT, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
let ld, cat;
try {
  ld = await server.ssrLoadModule('/src/lib/loadData.ts');
  cat = await server.ssrLoadModule('/src/lib/techniqueCanonical/category.ts');
} finally {
  await server.close();
}

// Where a technique linked to MMA is filed: decided from the technique's OWN
// art and category first (a grappling art's "Kneebar" is a submission, not a
// knee strike; "Heel Hook" is not a punch), then its name. Only official MMA
// categories are used.
const GRAPPLING = new Set(['bjj', 'wrestling', 'judo', 'sambo']);
const has = (s, re) => re.test(s);
function mmaCategory(t) {
  const own = ld.categoryInArt(t, t.martialArt);
  const name = `${t.name} ${t.koreanName ?? ''}`;
  if (GRAPPLING.has(t.martialArt)) {
    if (has(own, /관절기|조르기|서브미션|Kansetsu|Shime|뤄착|Рычаг|하체 관절기|목\/조르기/i) || has(name, /choke|armbar|arm bar|kimura|americana|omoplata|(?<!body )triangle(?! .*sweep)|guillotine|necktie|lock$|locks$|ankle lock|heel hook|kneebar|toe hold|calf slicer|slicer|рычаг|узел|ущемление|jime|garami|juji/i)) return '서브미션 (Submission)';
    if (has(own, /방어|리샷|카운터|Defense/i) || has(name, /sprawl|defense|whizzer|down block/i)) return '방어 (Defense)';
    if (has(own, /테이크다운|던지기|발기술|손기술|허리기술|희생|싱글 레그|더블 레그|발목·무릎|공격 진입|Waza|진입|등으로|어깨·팔로|다리 기술|무너뜨리기|투사/i) || has(name, /takedown|single|double leg|throw|trip|ankle pick|high crotch|snap down|duck under|arm drag|go-behind|fireman|suplex|lift|gari|otoshi|nage|goshi|guruma|бросок|подсечка|зацеп|отхват|подхват|мельница/i)) return '테이크다운 (Takedown)';
    if (has(own, /그립|스탠딩 포지션|바디락|클린치|잡기|Kumi|Захват/i)) return '클린치 (Clinch)';
    if (has(name, /scramble/i)) return '스크램블 (Scramble)';
    return '그라운드 컨트롤 (Ground Control)';
  }
  if (has(own, /클린치|Clinch/i) || has(name, /clinch|collar tie|plum|underhook|overhook/i)) return '클린치 (Clinch)';
  if (has(own, /방어|막기|Uke|Defense/i) && !has(name, /counter|return|after|→/i)) return '방어 (Defense)';
  if (has(name, /kick|teep|knee|khao|차기|geri|킥|티프|니(?![가-힣])/i) || has(own, /킥|니 \(|발차기|Geri|Khao|티프/i)) return 'MMA 킥복싱';
  if (has(own, /가드/i) || has(name, /block|parry|slip|duck|roll|cover|guard|catch|check|evade|lean back|pull/i)) return '방어 (Defense)';
  if (has(name, /elbow|empi|팔굽|sok /i)) return '스트라이킹 (Striking)';
  if (has(name, /jab|cross|hook|uppercut|punch|overhand|backfist|bolo|zuki|지르기|주먹|1-|2-|combination|콤비/i) || has(own, /펀치|조합|손기술|카운터/i)) return 'MMA 복싱';
  return '스트라이킹 (Striking)';
}
function categoryIn(t, art) {
  if (art === 'mixed-martial-arts') return { category: mmaCategory(t), how: 'MMA: own art + category, then name' };
  const own = ld.categoryInArt(t, t.martialArt);
  const c = cat.canonicalCategoryFor(art, own, t) ?? cat.canonicalCategoryFor(art, t.name, t);
  if (c) return { category: c, how: 'category rules' };
  return { category: own, how: 'own category (no match in target art)' };
}

const decisions = [];
const problems = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const source = f.replace(/\.json$/, '');
  for (const j of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) {
    const art = j.art ?? (source.startsWith('mma-') ? 'mixed-martial-arts' : null);
    const t = ld.getTechnique(j.id);
    if (!t || !art) {
      problems.push(`${source}: ${j.id} ${art ?? '(no art)'} — unknown technique/art`);
      continue;
    }
    if (!['add', 'none', 'review'].includes(j.decision)) problems.push(`${source}: ${j.id} bad decision ${j.decision}`);
    const key = `${t.id}|${art}`;
    const o = OVERRIDES[key];
    const decision = o?.decision ?? j.decision;
    const placed = decision === 'add' ? categoryIn(t, art) : null;
    decisions.push({
      techniqueId: t.id,
      name: t.name,
      art,
      decision,
      confidence: o?.confidence ?? j.confidence,
      reason: o?.reason ?? j.reason,
      evidence: j.evidence,
      judgedBy: o ? 'reviewer override' : `AI judgement (${source})`,
      ...(placed ? { category: placed.category, categoryBy: placed.how } : {}),
    });
  }
}
const dup = new Map();
for (const d of decisions) dup.set(`${d.techniqueId}|${d.art}`, (dup.get(`${d.techniqueId}|${d.art}`) ?? 0) + 1);
for (const [k, n] of dup) if (n > 1) problems.push(`duplicate judgement ${k}`);
fs.writeFileSync(path.join(ROOT, 'data/audit/technique-art-decisions.json'), JSON.stringify({ generatedBy: 'scripts/consolidate-technique-art-decisions.mjs', decisions }, null, 1) + '\n');
const count = (pred) => decisions.filter(pred).length;
console.log(JSON.stringify({ judged: decisions.length, add: count((d) => d.decision === 'add'), none: count((d) => d.decision === 'none'), review: count((d) => d.decision === 'review'), mmaAdd: count((d) => d.art === 'mixed-martial-arts' && d.decision === 'add'), problems }, null, 1));
