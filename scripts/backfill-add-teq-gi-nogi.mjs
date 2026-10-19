// Backfill Gi / No-Gi for grappling techniques already in the shared add_teq
// library (added before the add flow researched it). Runs the SAME analyzer
// the app uses (src/lib/grappling/analyzeNewTechnique.ts), with evidence from
// a file (collected web results) instead of the app's live search, and the
// app's Gemini transport without search grounding.
//
//   node scripts/backfill-add-teq-gi-nogi.mjs --techniques t.json --evidence w1.json,w2.json --results out.json --sql out.sql
//
// t.json: array of Technique objects (add_teq data.technique).
// w*.json: { "<id>": { query, results: [{ title, url, text }] } }.
// out.json is resumable (re-run skips ids already analyzed without an AI failure).
// out.sql: one UPDATE per technique setting ONLY data.technique.giNoGi — apply with
//   npx supabase db query --linked -f out.sql
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : null;
};
const techniques = JSON.parse(fs.readFileSync(arg('--techniques'), 'utf8'));
const evidence = Object.assign({}, ...arg('--evidence').split(',').map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))));
const resultsPath = arg('--results');
const sqlPath = arg('--sql');
const results = fs.existsSync(resultsPath) ? JSON.parse(fs.readFileSync(resultsPath, 'utf8')) : {};

require('dotenv').config({ path: path.join(ROOT, '.env') });
const { askGemini } = require(path.join(ROOT, 'electron/gemini.cjs'));
globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} };
const server = await createServer({ root: ROOT, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const A = await server.ssrLoadModule('/src/lib/grappling/analyzeNewTechnique.ts');
await server.close();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PREAMBLE = '당신은 JSON만 반환하는 백엔드 API입니다. 마크다운 코드 펜스(```), 설명 문장, 인사말 없이 요청받은 JSON 객체 또는 배열 하나만 출력하세요.';

async function askJson(p) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await askGemini({ systemInstruction: `${PREAMBLE}\n\n${p.systemInstruction}`, contextText: p.contextText, history: [], question: p.question, useSearchGrounding: false });
    if (!r.ok) {
      if (r.code === 'RATE_LIMIT' || r.code === 'NETWORK') {
        console.log(`   AI ${r.code} — ${r.code === 'RATE_LIMIT' ? 65 : 10}초 후 재시도`);
        await sleep(r.code === 'RATE_LIMIT' ? 65000 : 10000);
        continue;
      }
      return { ok: false, code: r.code, message: r.message };
    }
    try {
      const data = JSON.parse(r.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
      if (p.validate && !p.validate(data)) continue;
      return { ok: true, data, groundingSources: [], usedSearchGrounding: false, webSearchQueries: [] };
    } catch {
      continue;
    }
  }
  return { ok: false, code: 'UNKNOWN', message: 'AI 응답 실패' };
}

let n = 0;
for (const t of techniques) {
  n++;
  if (!A.isGiNoGiTarget(t) || t.id.startsWith('link__')) continue;
  const prev = results[t.id];
  if (prev && prev.method !== 'pending') continue;
  const ev = evidence[t.id];
  const search = async () => (ev ? { ok: true, results: (ev.results ?? []).map((x) => ({ title: x.title, url: x.url, snippet: x.text })) } : { ok: false, code: 'UNKNOWN', message: 'no evidence' });
  // No collected evidence → the analyzer would fall back to grounding; mark it 조사 전 instead.
  if (!ev || !(ev.results ?? []).length) {
    results[t.id] = { ...(await A.analyzeGiNoGi(t, { search, askJson: async () => ({ ok: false, code: 'UNKNOWN', message: 'no evidence' }) })), method: 'pending', reason: '웹 근거 자료를 찾지 못해 아직 조사하지 못했습니다.' };
  } else {
    results[t.id] = await A.analyzeGiNoGi(t, { search, askJson });
    await sleep(6000);
  }
  const r = results[t.id];
  console.log(`${n}/${techniques.length} ${t.id} → ${r.classification} (${r.method}) 자세 ${Object.keys(r.postures).join('+') || '-'}`);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 1));
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = Object.entries(results)
  .map(([id, r]) => `update public.add_teq set data = jsonb_set(data, '{technique,giNoGi}', ${q(JSON.stringify(r))}::jsonb), updated_at = now() where id = ${q(id)} and not (data->'technique' ? 'giNoGi');`)
  .join('\n');
fs.writeFileSync(sqlPath, sql + '\n');
const count = (k) => Object.values(results).reduce((m, r) => ((m[r[k]] = (m[r[k]] ?? 0) + 1), m), {});
console.log(JSON.stringify({ total: Object.keys(results).length, classification: count('classification'), method: count('method'), withPostures: Object.values(results).filter((r) => Object.keys(r.postures).length).length }));
