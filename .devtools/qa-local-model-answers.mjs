// 자체 AI 코치 × 실제 로컬 모델(Ollama) — 질문 답변 품질 측정 (live, optional).
// For real techniques/questions: builds the grounded prompt exactly as the coach does
// (answerability → localPrompt), asks the local model through electron/ollama.cjs
// (45 s budget, as in lessons), runs the output guard, and prints what the student
// would see. Checks: every turn ends with a text (model or the data's own text),
// unanswerable questions never call the model, accepted text passes every guard rule.
// Requires `ollama serve` with the model (OLLAMA_MODEL, default llama3.2:1b); SKIPs otherwise.
// Run: node .devtools/qa-local-model-answers.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { viteGlobPlugin } from './lib/viteGlobPlugin.mjs';

const require = createRequire(import.meta.url);
const bridge = require('../electron/ollama.cjs');
const status = await bridge.localModelStatus();
if (!status.ok) {
  console.log(`SKIP — local model not available (${status.reason}, model ${status.model}).`);
  process.exit(0);
}

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-local-answers-'));
const out = path.join(dir, 'a.mjs');
const entry = path.join(dir, 'entry.ts');
fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(APP, 'src/lib/coachKnowledge/answer.ts'))};`);
const mem = new Map();
globalThis.window = {
  localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) },
  dispatchEvent: () => true,
  addEventListener() {},
  removeEventListener() {},
  setTimeout: () => 0, // the app's idle warm-ups (search worker) are not run here
  clearTimeout() {},
  location: { href: 'http://localhost/', search: '', hash: '' },
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  // the renderer's IPC bridge, pointed straight at the main-process module
  martialdex: { localAi: { status: bridge.localModelStatus, ask: bridge.askLocalModel, cancel: async (id) => bridge.cancelLocalModel(id) } },
};
globalThis.localStorage = window.localStorage;
globalThis.CustomEvent ??= class { constructor(t) { this.type = t; } };
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error', define: { 'import.meta.env': '{}' }, plugins: [viteGlobPlugin] });
const A = await import(pathToFileURL(out).href);

// resolve techniques through a second tiny bundle (keeps answer.ts's bundle as the coach ships it)
const svcEntry = path.join(dir, 'svc.ts');
fs.writeFileSync(svcEntry, `export { resolveTechnique } from ${JSON.stringify(path.join(APP, 'src/lib/userTechniques/service.ts'))};`);
await build({ entryPoints: [svcEntry], bundle: true, format: 'esm', platform: 'node', outfile: path.join(dir, 'svc.mjs'), logLevel: 'error', define: { 'import.meta.env': '{}' }, plugins: [viteGlobPlugin] });
const S = await import(pathToFileURL(path.join(dir, 'svc.mjs')).href);

const QUESTIONS = [
  ['boxing__jab', '잽 칠 때 핵심 포인트가 뭐예요?'],
  ['boxing__jab', '잽 칠 때 발은 어떻게 둬요?'],
  ['boxing__jab', '잽에서 흔한 실수는 뭐예요?'],
  ['bjj__armbar', '암바 할 때 다리는 어떻게 해요?'],
  ['bjj__armbar', '암바에서 고관절은 왜 들어요?'],
  ['bjj__armbar', '암바 순서 알려 주세요'],
  ['wrestling__basic-double-leg', '더블 레그에서 머리 위치는요?'],
  ['bjj__rear-naked-choke', '리어 네이키드 초크 할 때 발은 어떻게 해요?'],
  ['bjj__kimura', '키무라 그립은 어떻게 잡아요?'],
  ['kickboxing__teep', '티프는 언제 써요?'],
];

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''));
}

const stats = { called: 0, accepted: 0, rejected: 0, failed: 0, ms: [] };
for (const [id, q] of QUESTIONS) {
  const t = S.resolveTechnique(id);
  const t0 = Date.now();
  const a = await A.answerFromEvidence(t, q, { useModel: true });
  const ms = Date.now() - t0;
  if (a.modelCalled) {
    stats.called++;
    stats.ms.push(ms);
    if (a.source === 'local_model') stats.accepted++;
    else if (/확인되지 않아/.test(a.modelNote ?? '')) stats.rejected++;
    else stats.failed++;
  }
  const ok = a.text.trim().length > 0 && (a.answerability.status !== 'unanswerable' || !a.modelCalled);
  check(`[${id}] "${q}" → ${a.answerability.status} · ${a.source}${a.modelCalled ? ` · ${(ms / 1000).toFixed(1)}s` : ' · 모델 호출 없음'}`, ok, `${a.text}${a.modelNote ? `  [${a.modelNote}]` : ''}`);
}
const avg = stats.ms.length ? stats.ms.reduce((x, y) => x + y, 0) / stats.ms.length / 1000 : 0;
console.log(`\nmodel ${status.model}: called ${stats.called} · accepted ${stats.accepted} · rejected by guard ${stats.rejected} · failed/timeout ${stats.failed} · avg ${avg.toFixed(1)}s`);
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
