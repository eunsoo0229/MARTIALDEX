// Technique × martial-art relation audit — the AUTOMATIC half.
//
//   npm run audit:technique-relations
//
// Loads the technique DB exactly as the app does (src/lib/loadData.ts through
// Vite, so canonical groups / splits / art links are applied) and, for EVERY
// canonical technique × EVERY official martial art, records:
//   current      — is the technique linked to the art now, and why
//                  (native record in that art's document / split part /
//                   reviewed link with its evidence grade)
//   evidence     — every place MARTIALDEX's own data mentions the technique
//                  in connection with that art:
//                    doc      the art's source document (data/raw/*.md) names it
//                    record   one of the art's technique records names it or
//                             lists it as related
//                    library  a shared-library (add_teq) record filed under the
//                             art names it or lists it as related
//   autoStatus   — LINKED / CANDIDATE (not linked, but the art's data mentions
//                  it → needs a human/AI decision) / NONE (not linked, no
//                  mention anywhere)
//
// It decides nothing on its own: whether a mentioned technique is really used
// in that art (vs. "unlike boxing…", "the counter to X") is a judgement, kept
// with its evidence and confidence in data/audit/technique-art-decisions.json.
// Outputs:
//   data/audit/technique-martial-art-matrix.json   (every pair)
//   data/audit/technique-art-candidates.json       (CANDIDATE pairs with snippets)
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const server = await createServer({ root: ROOT, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
let ld;
try {
  ld = await server.ssrLoadModule('/src/lib/loadData.ts');
} finally {
  await server.close();
}

const canon = read('data/curated/technique-canonical.json');
const library = read('data/audit/add-teq-snapshot.json').rows;
const arts = ld.martialArtSummaries.map((a) => ({ id: a.id, nameKo: a.nameKo }));
const RAW_FILE = { bjj: 'bjj', boxing: '복싱', judo: '유도', karate: '가라테', kickboxing: '킥복싱', 'muay-thai': '무에타이', sambo: '삼보', taekwondo: '태권도', wrestling: '레슬링' };
const rawDir = path.join(ROOT, 'data/raw');
const docLines = {};
for (const a of arts) {
  const f = RAW_FILE[a.id] && fs.readdirSync(rawDir).find((x) => x.startsWith(`${RAW_FILE[a.id]}_`));
  docLines[a.id] = f ? fs.readFileSync(path.join(rawDir, f), 'utf8').split('\n') : null;
}
const officialById = new Map();
for (const f of fs.readdirSync(path.join(ROOT, 'data/processed')).filter((x) => x.endsWith('.json') && !x.startsWith('_'))) {
  for (const t of read(`data/processed/${f}`).techniques) officialById.set(t.id, t);
}
const recordsByArt = new Map(arts.map((a) => [a.id, [...officialById.values()].filter((t) => t.martialArt === a.id)]));
const libraryArt = (r) => (r.martial_art === 'mma' ? 'mixed-martial-arts' : r.martial_art);

// ---- name variants used to look for mentions ----
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function variants(t) {
  const names = new Set([t.name, t.koreanName, ...(t.aliases ?? []), ...Object.values(t.namesByArt ?? {}).flatMap((n) => [n.name, n.koreanName])].filter(Boolean));
  const out = [];
  for (const n of names) {
    const s = n.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    if (!s || s.includes('/') || s.includes(',')) continue;
    const latin = /^[\x20-\x7e]+$/.test(s);
    if (latin && s.replace(/[^a-z]/gi, '').length < 3) continue;
    if (!latin && s.replace(/\s/g, '').length < 2) continue;
    // latin: whole word(s); hangul: not glued to other hangul syllables
    out.push({ name: s, re: latin ? new RegExp(`(^|[^A-Za-z])${esc(s).replace(/\\? |-/g, '[\\s-]?')}(?![A-Za-z])`, 'i') : new RegExp(`(^|[^가-힣])${esc(s)}(?![가-힣])`) });
  }
  return out;
}
const memberIds = (t) => new Set([t.id, ...(t.mergedIds ?? []), ...(t.splitFrom ?? [])]);
const linkByKey = new Map(canon.artLinks.map((l) => [`${l.canonicalId}|${l.martialArt}`, l]));

function currentSource(t, art) {
  const arts_ = t.martialArts ?? [t.martialArt];
  if (!arts_.includes(art)) return null;
  const native = [...memberIds(t)].some((id) => officialById.get(id)?.martialArt === art) || (t.splitFrom && t.martialArt === art);
  if (native) return { type: 'native', note: 'that art\'s own source-document record' };
  const l = linkByKey.get(`${t.id}|${art}`);
  if (l?.sourceId) return { type: 'split-part', note: `listed on the art's record ${l.sourceId}` };
  if (l) return { type: 'reviewed-link', grade: l.grade ?? null, note: l.evidence ?? l.reason };
  return { type: 'library-link', note: 'shared-library link record' };
}

function evidenceFor(t, art) {
  const ev = [];
  const vs = variants(t);
  const ids = memberIds(t);
  const lines = docLines[art];
  if (lines) {
    for (let i = 0; i < lines.length && ev.filter((e) => e.type === 'doc').length < 4; i++) {
      const v = vs.find((x) => x.re.test(lines[i]));
      if (v) ev.push({ type: 'doc', where: `data/raw ${art} line ${i + 1}`, match: v.name, snippet: lines.slice(Math.max(0, i - 1), i + 2).join(' ').replace(/\s+/g, ' ').slice(0, 260) });
    }
  }
  for (const r of recordsByArt.get(art)) {
    if (ids.has(r.id)) continue;
    const rel = (r.relatedTechniques ?? []).find((x) => ids.has(x));
    const text = [r.description, r.purpose, ...(r.principles ?? []), ...(r.variations ?? []), ...(r.counters ?? []), ...(r.defenses ?? []), ...(r.transitions ?? [])].filter(Boolean).join(' / ');
    const v = vs.find((x) => x.re.test(text) || x.re.test(r.name));
    if (rel || v) ev.push({ type: 'record', where: r.id, match: rel ? `relatedTechniques:${rel}` : v.name, snippet: `${r.name}: ${text}`.slice(0, 260) });
    if (ev.filter((e) => e.type === 'record').length >= 4) break;
  }
  for (const r of library) {
    if (libraryArt(r) !== art || ids.has(r.id)) continue;
    const rel = (r.related_techniques ?? []).find((x) => ids.has(x));
    const text = [r.name, r.description, r.purpose, ...(r.principles ?? []), ...(r.variations ?? []), ...(r.transitions ?? [])].filter(Boolean).join(' / ');
    const v = vs.find((x) => x.re.test(text));
    if (rel || v) ev.push({ type: 'library', where: `add_teq ${r.id}`, match: rel ? `related_techniques:${rel}` : v.name, snippet: text.slice(0, 260) });
  }
  return ev;
}

const matrix = [];
const candidates = [];
for (const t of ld.allTechniques) {
  for (const a of arts) {
    const current = currentSource(t, a.id);
    const evidence = evidenceFor(t, a.id);
    const autoStatus = current ? 'LINKED' : evidence.length ? 'CANDIDATE' : 'NONE';
    const row = { techniqueId: t.id, name: t.name, primaryArt: t.martialArt, category: ld.categoryInArt(t, t.martialArt), art: a.id, current: !!current, currentSource: current, autoStatus, evidenceCount: evidence.length };
    matrix.push(evidence.length ? { ...row, evidence } : row);
    if (autoStatus === 'CANDIDATE') candidates.push({ ...row, koreanName: t.koreanName, description: (t.description ?? '').slice(0, 200), evidence });
  }
}
fs.mkdirSync(path.join(ROOT, 'data/audit'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data/audit/technique-martial-art-matrix.json'), JSON.stringify({ generatedBy: 'scripts/audit-technique-art-matrix.mjs', techniques: ld.allTechniques.length, arts, pairs: matrix.length, rows: matrix }) + '\n');
fs.writeFileSync(path.join(ROOT, 'data/audit/technique-art-candidates.json'), JSON.stringify(candidates, null, 1) + '\n');
// ---- automatic identity checks (patterns B–E; pattern A = CANDIDATE above) ----
const norm = (x) => (x ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const identity = { manyNames: [], differingDescriptions: [], libraryRedirects: [], smallArts: [], sameNameDifferentCanonical: [] };
for (const t of ld.allTechniques) {
  const names = new Set([...(t.mergedIds ?? [])].map((id) => norm(officialById.get(id)?.name)).filter(Boolean));
  if (names.size >= 3) identity.manyNames.push({ id: t.id, names: [...(t.mergedIds ?? [])].map((id) => `${officialById.get(id)?.martialArt}:${officialById.get(id)?.name}`), reviewed: canon.groups.find((g) => g.canonicalId === t.id)?.reason ?? null });
  if (t.usageByArt && Object.keys(t.usageByArt).length) identity.differingDescriptions.push({ id: t.id, primary: (t.description ?? '').slice(0, 120), byArt: t.usageByArt });
}
for (const d of canon.addTeqDuplicates) identity.libraryRedirects.push({ libraryId: d.id, canonical: d.canonical, reason: d.reason });
for (const r of library) if (/^link__/.test(r.id)) identity.libraryRedirects.push({ libraryId: r.id, canonical: r.id.split('__').slice(2).join('__'), reason: 'link record (기존 기술에 무술 연결)' });
const counts = arts.map((a) => ({ art: a.id, linked: matrix.filter((r) => r.art === a.id && r.current).length }));
const sortedCounts = counts.map((c) => c.linked).sort((x, y) => x - y);
const median = sortedCounts[Math.floor(sortedCounts.length / 2)];
for (const c of counts) if (c.linked < median / 2) identity.smallArts.push({ ...c, median, note: 'fewer than half the median — explain from data (source document? records?)', hasSourceDocument: !!docLines[c.art], records: recordsByArt.get(c.art).length });
const byName = new Map();
for (const t of ld.allTechniques) byName.set(norm(t.name), [...(byName.get(norm(t.name)) ?? []), t.id]);
const reviewedIds = new Set([...canon.excluded.flatMap((e) => e.ids), ...canon.review.flatMap((e) => e.ids)]);
for (const [k, ids] of byName) if (ids.length > 1) identity.sameNameDifferentCanonical.push({ name: k, ids, reviewed: ids.filter((id) => [...(ld.getTechnique(id)?.mergedIds ?? [id])].some((m) => reviewedIds.has(m))).length >= ids.length - 1 });
fs.writeFileSync(path.join(ROOT, 'data/audit/technique-identity-checks.json'), JSON.stringify(identity, null, 1) + '\n');

const perArt = Object.fromEntries(arts.map((a) => [a.id, { linked: matrix.filter((r) => r.art === a.id && r.current).length, candidates: candidates.filter((r) => r.art === a.id).length }]));
console.log(JSON.stringify({ identity: { manyNames: identity.manyNames.length, differingDescriptions: identity.differingDescriptions.length, libraryRedirects: identity.libraryRedirects.length, smallArts: identity.smallArts, sameNameDifferentCanonical: identity.sameNameDifferentCanonical.length, unreviewedSameName: identity.sameNameDifferentCanonical.filter((x) => !x.reviewed) }, techniques: ld.allTechniques.length, arts: arts.length, pairs: matrix.length, linked: matrix.filter((r) => r.current).length, candidates: candidates.length, perArt }, null, 1));
