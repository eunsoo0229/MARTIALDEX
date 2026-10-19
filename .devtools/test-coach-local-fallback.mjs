// 자체 AI 코치 — 로컬 모델이 실패·지연·이상한 답을 낼 때도 수업이 계속되는지 (offline).
// Drives the REAL lesson service (respondToStudent + martialdexCoach) with a scripted
// fake window.martialdex.localAi, and counts Gemini (askAi) calls — must stay 0.
// Run: node .devtools/test-coach-local-fallback.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { viteGlobPlugin } from './lib/viteGlobPlugin.mjs';

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-local-fallback-'));
const out = path.join(dir, 'f.mjs');
const entry = path.join(dir, 'entry.ts');
const mod = (p) => JSON.stringify(path.join(APP, p));
fs.writeFileSync(
  entry,
  [
    `export * from ${mod('src/lib/coachLesson/service.ts')};`,
    `export { martialdexCoach } from ${mod('src/lib/coachProvider/backend.ts')};`,
    `export { resetLocalModelBackoff, answerFromEvidence } from ${mod('src/lib/coachKnowledge/answer.ts')};`,
    `export { currentLocalModelWait, cancelLocalModelWait } from ${mod('src/lib/coachProvider/localModel.ts')};`,
    `export { resolveTechnique } from ${mod('src/lib/userTechniques/service.ts')};`,
  ].join('\n')
);

// scripted local model: each ask() takes the next behaviour
let script = [];
const calls = { ask: 0, gemini: 0, cancel: 0 };
let pendingResolve = null;
const mem = new Map();
globalThis.window = {
  localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) },
  dispatchEvent: () => true,
  addEventListener() {},
  removeEventListener() {},
  setTimeout: () => 0,
  clearTimeout() {},
  location: { href: 'http://localhost/', search: '', hash: '' },
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  martialdex: {
    askAi: async () => {
      calls.gemini++;
      return { ok: false, code: 'UNEXPECTED', message: 'Gemini must not be called by the 자체 AI 코치' };
    },
    localAi: {
      status: async () => ({ ok: true, running: true, model: 'fake', models: ['fake'], reason: null }),
      ask: async () => {
        calls.ask++;
        const step = script.shift() ?? { ok: false, code: 'TIMEOUT', message: '로컬 모델 응답이 45초 안에 오지 않아 중단했습니다.' };
        if (step === 'hang') return new Promise((res) => (pendingResolve = res));
        return step;
      },
      cancel: async () => {
        calls.cancel++;
        pendingResolve?.({ ok: false, code: 'CANCELLED', message: '로컬 모델 요청을 취소했습니다.' });
        pendingResolve = null;
        return true;
      },
    },
  },
};
globalThis.localStorage = window.localStorage;
globalThis.CustomEvent ??= class { constructor(t) { this.type = t; } };
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error', define: { 'import.meta.env': '{}' }, plugins: [viteGlobPlugin] });
const S = await import(pathToFileURL(out).href);

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : ''));
}

const jab = S.resolveTechnique('boxing__jab');
const TIMEOUT = { ok: false, code: 'TIMEOUT', message: '로컬 모델 응답이 45초 안에 오지 않아 중단했습니다.' };
const http500 = { ok: false, code: 'BAD_RESPONSE', message: '로컬 모델 응답 오류 (HTTP 500).' };
const ok = (text) => ({ ok: true, text, model: 'fake', evalCount: 10, ms: 1000 });

// a lesson waiting on an open question
let r = S.startLesson(jab);
const firstPending = r.state.pending;
async function ask(question) {
  const res = await S.respondToStudent({ technique: jab, state: r.state, text: question, dayContext: '', history: [], place: '', coach: S.martialdexCoach });
  const answer = res.actions.find((a) => a.type === 'ANSWER')?.content ?? '';
  return { res, answer };
}

// 1. model fails (HTTP 500 after the bridge's own retry) → the data's own sentence, lesson goes on
S.resetLocalModelBackoff();
script = [http500];
let q = await ask('잽의 핵심 포인트가 뭐예요?');
check('[1] 로컬 모델 오류 → 자료 문장으로 답하고 같은 질문으로 수업 복귀 (중단 없음)', /MARTIALDEX 자료에 따르면/.test(q.answer) && /HTTP 500/.test(q.answer) && q.res.state.pending?.text === firstPending?.text, q.answer);

// 2. guard-rejected text (mixed language, repeated) → data sentence
script = [ok('잽은 expose expose expose expose 반대 손 가드 becomes 중요합니다 중요합니다 중요합니다 중요합니다')];
q = await ask('잽에서 흔한 실수는 뭐예요?');
check('[2] 반복·영어 섞인 모델 답은 쓰지 않고 자료 문장으로', /MARTIALDEX 자료에 따르면/.test(q.answer) && /확인되지 않아/.test(q.answer) && !/expose/.test(q.answer), q.answer);

// 3. a good reworded answer is used
script = [ok('잽을 칠 때는 반대 손 가드를 끝까지 유지하고, 타격 후 손을 즉시 회수하세요.')];
q = await ask('잽의 핵심 포인트가 뭐예요?');
check('[3] 검사를 통과한 모델 문장은 그대로 사용', q.answer.startsWith('잽을 칠 때는 반대 손 가드를'), q.answer);

// 4. the student cancels while waiting → data sentence at once
script = ['hang'];
const pending = ask('잽의 핵심 포인트가 뭐예요?');
await new Promise((res) => setImmediate(res));
const waiting = S.currentLocalModelWait();
await S.cancelLocalModelWait();
q = await pending;
check('[4] 기다리는 중 "자료 원문으로 보기"(취소) → 즉시 자료 문장, 수업 계속', !!waiting && waiting.timeoutMs === 45000 && calls.cancel === 1 && /기다리지 않고/.test(q.answer) && S.currentLocalModelWait() === null, { waiting, answer: q.answer });

// 5. two timeouts in a row → the model is paused, the next question is answered from data without waiting
S.resetLocalModelBackoff();
script = [TIMEOUT, TIMEOUT];
await ask('잽의 핵심 포인트가 뭐예요?');
await ask('잽에서 흔한 실수는 뭐예요?');
const before = calls.ask;
q = await ask('잽 칠 때 발은 어떻게 둬요?');
const q2 = await ask('잽의 핵심 포인트가 뭐예요?');
check('[5] 연속 시간 초과 2회 → 잠시 모델을 부르지 않고 바로 자료 문장 (안내는 한 번만)', calls.ask === before && /분 동안은 기술 자료 문장으로/.test(q.answer) && !/분 동안은/.test(q2.answer) && /MARTIALDEX 자료에 따르면/.test(q2.answer), { asks: calls.ask - before, a1: q.answer.slice(-80), a2: q2.answer.slice(-60) });

// 6. unanswerable question → no model call at all
S.resetLocalModelBackoff();
const n0 = calls.ask;
const rnc = S.resolveTechnique('bjj__rear-naked-choke');
const g = await S.answerFromEvidence(rnc, '리어 네이키드 초크 할 때 발은 어떻게 해요?', { useModel: true });
check('[6] 자료에 없는 질문은 모델을 부르지 않고 "자료에 없음"', calls.ask === n0 && !g.modelCalled && /내용이 없습니다/.test(g.text), g.text);

// 7. grading never touches a model
const n1 = calls.ask;
let lesson = S.startLesson(jab);
lesson = await S.respondToStudent({ technique: jab, state: lesson.state, text: '반대 손 가드를 끝까지 유지해요', dayContext: '', history: [], place: '', coach: S.martialdexCoach });
check('[7] 답변 채점은 결정론적 (로컬 모델·Gemini 호출 없음)', calls.ask === n1 && lesson.actions.some((a) => a.type === 'FEEDBACK'), lesson.actions.map((a) => a.type));

check('[8] 전 과정에서 Gemini(askAi) 호출 0회', calls.gemini === 0, calls);

const failed = results.filter((x) => !x.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
