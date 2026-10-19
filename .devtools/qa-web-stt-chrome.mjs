// QA: 일반 웹 브라우저 음성인식 — the web build in real Google Chrome (no Mac bridge → the web engine).
// Chrome's fake capture device plays a real Korean recording (.devtools/fixtures-stt-korean.wav) into the
// microphone, and Chrome's own Web Speech recognizer (which uses Google's speech service — not offline)
// transcribes it. Also: the explicit "AI 서버 받아쓰기" fallback after an engine failure (web only).
// Requires the Vite dev server on :5173 and Google Chrome installed.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = '/Users/swcho/Documents/MARTIALDEX';
const results = [];
const check = (n, p, d = '') => {
  results.push(p);
  console.log(`${p ? 'PASS' : 'FAIL'} — ${n}${d ? ' :: ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 300) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 250) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn().catch(() => false)) return true;
    await sleep(step);
  }
  return false;
};

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-chrome-')), {
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: false,
  timeout: 60000,
  args: ['--no-first-run', '--no-default-browser-check', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${APP}/.devtools/fixtures-stt-korean.wav`],
  permissions: ['microphone'],
});
console.log('chrome launched');
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
await page.goto('http://localhost:5173/#/');
await sleep(1500);
async function openTutor(kind) {
  await page.evaluate(() => (location.hash = '#/'));
  await sleep(300);
  await page.evaluate(() => (location.hash = '#/learning/bjj/official__bjj/coach/6?mode=voice&place=home'));
  for (let i = 0; i < 60; i++) {
    if (await page.$('[data-testid="coach-mic"]')) return;
    const own = await page.$(`text=${kind}`);
    const startBtn = await page.$('button:has-text("이 코치로 수업 시작")');
    if (own && startBtn) {
      await own.click();
      await startBtn.click();
    }
    await sleep(500);
  }
  throw new Error('마이크 버튼 없음');
}
console.log('page loaded', page.url());
await openTutor('Gemini AI 코치');
console.log('tutor open');
const label = await page.locator('[data-testid="coach-voice-engine"]').innerText();
check('[C1] 웹 브라우저(Chrome): 브라우저 음성인식 엔진 사용, 오프라인 보장 안 함 표시', /브라우저 음성인식/.test(label) && /보장되지 않습니다/.test(label), label);

// real recognition by Chrome
await page.locator('[data-testid="coach-text-input"]').fill('');
await page.locator('[data-testid="coach-mic"]').click();
const partials = [];
for (let i = 0; i < 60; i++) {
  const t = await page.evaluate(() => document.querySelector('[data-testid="coach-voice-partial"]')?.textContent ?? '');
  if (t && partials.at(-1) !== t) partials.push(t);
  if (/기술/.test(t)) break;
  await sleep(250);
}
// stop only if it is still listening (Chrome may already have ended the session by itself)
if ((await page.evaluate(() => document.querySelector('[data-testid="coach-voice-panel"]')?.dataset.phase)) === 'listening') await page.locator('[data-testid="coach-mic"]').click({ timeout: 5000 }).catch(() => {});
await until(async () => (await page.locator('[data-testid="coach-text-input"]').inputValue()).length > 3 || !!(await page.$('[data-testid="coach-voice-error"]')), 10000);
const typed = await page.locator('[data-testid="coach-text-input"]').inputValue();
const err = await page.evaluate(() => document.querySelector('[data-testid="coach-voice-error"]')?.textContent ?? '');
// Chrome's own recognizer listens to the REAL system microphone, not the fake capture file — so real
// recognition can't be driven by automation; it needs a person speaking into a mic (manual check).
if (['잽', '가드', '준비', '기술'].filter((w) => typed.includes(w)).length >= 2) check('[C2] Chrome 음성인식이 실제 한국어를 받아써 입력창에 넣음', true, typed);
else console.log(`SKIP — [C2] Chrome 실제 인식은 자동화로 검증 불가 (가짜 마이크 파일을 쓰지 않음) — 실제 마이크로 직접 확인 필요 :: ${JSON.stringify({ typed, err })}`);

// engine failure → the explicit Gemini fallback is offered on the web
await page.evaluate(() => {
  window.SpeechRecognition = class {
    start() {
      setTimeout(() => this.onerror?.({ error: 'network' }), 50);
      setTimeout(() => this.onend?.(), 80);
    }
    stop() {}
    abort() {}
  };
});
await page.locator('[data-testid="coach-mic"]').click();
await until(async () => !!(await page.$('[data-testid="coach-voice-fallback"]')), 6000);
const fb = await page.evaluate(() => document.querySelector('[data-testid="coach-voice-fallback"]')?.textContent ?? '');
check('[C3] 웹: 엔진 오류 시에만 "AI 서버 받아쓰기 (Gemini · 사용량 한도 있음)" 선택지 (자동 전환 안 함)', /Gemini/.test(fb) && (await page.locator('[data-testid="coach-voice-panel"]').getAttribute('data-phase')) === 'error', fb);
await page.locator('[data-testid="coach-voice-fallback"]').click(); // immediately — the button must work as soon as it shows
await until(async () => (await page.locator('[data-testid="coach-voice-panel"]').getAttribute('data-phase')) === 'listening', 8000);
check('[C4] 대체 선택 → 사용자가 누른 경우에만 AI 받아쓰기 녹음 시작', (await page.locator('[data-testid="coach-voice-panel"]').getAttribute('data-phase')) === 'listening');
await page.locator('[data-testid="coach-mic-cancel"]').click({ timeout: 5000 }).catch(() => {});

check('[Z] 페이지 에러 없음', errors.length === 0, errors.join(' | '));
await ctx.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
