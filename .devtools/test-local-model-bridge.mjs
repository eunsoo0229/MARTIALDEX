// electron/ollama.cjs (자체 AI 코치 ↔ 로컬 모델) — timeout · one retry · cancel · not running,
// against a FAKE Ollama server on 127.0.0.1:11434 (the bridge's fixed host). No real model needed.
// Skips (exit 0) if something already listens on 11434 (a real Ollama) — stop it to run this.
// Run: node .devtools/test-local-model-bridge.mjs
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bridge = require('../electron/ollama.cjs');

let scenario = 'ok';
let generateCalls = 0;
const server = http.createServer((req, res) => {
  if (req.url === '/api/tags') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ models: [{ name: process.env.OLLAMA_MODEL || 'llama3.2:1b' }] }));
    return;
  }
  if (req.url === '/api/generate') {
    generateCalls++;
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const reply = (status, obj) => {
        if (res.writableEnded) return;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      if (scenario === 'ok') return reply(200, { response: '반대 손 가드를 끝까지 유지하세요.', eval_count: 12 });
      if (scenario === 'fail-once') return generateCalls === 1 ? reply(500, { error: 'boom' }) : reply(200, { response: '두 번째 시도 성공', eval_count: 5 });
      if (scenario === 'always500') return reply(500, { error: 'boom' });
      if (scenario === 'slow') return setTimeout(() => reply(200, { response: '늦은 답' }), 20000);
    });
    return;
  }
  res.writeHead(404).end();
});

const listening = await new Promise((resolve) => {
  server.once('error', () => resolve(false));
  server.listen(11434, '127.0.0.1', () => resolve(true));
});
if (!listening) {
  console.log('SKIP — 127.0.0.1:11434 is in use (a real Ollama?). Stop it to run the bridge test.');
  process.exit(0);
}

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + JSON.stringify(detail).slice(0, 300) : ''));
}
const ask = (extra = {}) => bridge.askLocalModel({ system: 's', prompt: '잽의 핵심은?', maxTokens: 50, ...extra });

scenario = 'ok';
generateCalls = 0;
let r = await ask();
check('[1] 정상 응답 → ok + 텍스트', r.ok && r.text.includes('가드') && r.attempts === 1, r);

scenario = 'fail-once';
generateCalls = 0;
r = await ask();
check('[2] 서버 오류(HTTP 500) 한 번 → 같은 시간 안에서 1회 재시도 후 성공', r.ok && r.attempts === 2 && generateCalls === 2, { r, generateCalls });

scenario = 'always500';
generateCalls = 0;
r = await ask();
check('[3] 계속 오류 → 재시도는 1회뿐, BAD_RESPONSE로 실패 반환 (Gemini 대체 없음)', !r.ok && r.code === 'BAD_RESPONSE' && generateCalls === 2, { r, generateCalls });

scenario = 'slow';
generateCalls = 0;
let t0 = Date.now();
r = await ask({ timeoutMs: 5000 });
let ms = Date.now() - t0;
check('[4] 응답 지연 → 요청별 시간 제한(5초)에서 TIMEOUT, 시간 초과는 재시도하지 않음', !r.ok && r.code === 'TIMEOUT' && ms < 7000 && generateCalls === 1, { r, ms, generateCalls });

generateCalls = 0;
t0 = Date.now();
const pending = ask({ timeoutMs: 60000, requestId: 'test-cancel-1' });
await new Promise((res) => setTimeout(res, 600));
const cancelled = bridge.cancelLocalModel('test-cancel-1');
r = await pending;
ms = Date.now() - t0;
check('[5] 기다리는 중 취소 → 즉시 CANCELLED, 재시도 없음', cancelled && !r.ok && r.code === 'CANCELLED' && ms < 3000 && generateCalls === 1, { r, ms, generateCalls });
check('[5b] 끝난/없는 요청 취소는 false', bridge.cancelLocalModel('test-cancel-1') === false && bridge.cancelLocalModel('nope') === false);

scenario = 'slow';
generateCalls = 0;
t0 = Date.now();
r = await ask({ timeoutMs: 1 });
ms = Date.now() - t0;
check('[6] 시간 제한은 최소 5초로 보정 (1ms를 줘도 바로 포기하지 않음)', !r.ok && r.code === 'TIMEOUT' && ms >= 4500 && ms < 7000, { r, ms });
await new Promise((res) => server.close(res));
server.closeAllConnections?.();
r = await ask();
check('[7] 서버가 꺼져 있으면 NOT_RUNNING (다른 AI로 바꾸지 않음)', !r.ok && r.code === 'NOT_RUNNING', r);

const failed = results.filter((x) => !x.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
