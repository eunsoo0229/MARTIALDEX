// QA: AI 코치 「수업하고 싶은 거 입력하기」(OneOffCoachLesson) — voice input through CoachVoiceBar with the
// Mac's local engine. The lesson is built by the MARTIALDEX 자체 AI 코치 (no Gemini).
// The microphone is Chromium's fake capture device fed a REAL Korean recording
// (.devtools/fixtures-stt-korean.wav, macOS `say -v Yuna`: "잽을 던진 다음에 바로
// 가드를 올리는 게 맞나요?" … "준비됐어요. 다음 기술로 넘어가 주세요."), so the whole
// path runs: getUserMedia → AudioWorklet → pause segmentation → IPC → whisper-server
// (127.0.0.1) → text → the AI 튜터 input box. Gemini IPC calls are counted to prove
// recognition never uses it.
//   OFFLINE=1  runs Electron inside a macOS sandbox that blocks all outbound network
//              except localhost (the Vite dev server and whisper-server).
//   MODEL=<path to ggml-small-q5_1.bin>  a downloaded model to preload (else downloads).
// Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = '/Users/swcho/Documents/MARTIALDEX';
const OFFLINE = process.env.OFFLINE === '1';
const MODEL = process.env.MODEL;
const results = [];
const check = (n, p, d = '') => {
  results.push(p);
  console.log(`${p ? 'PASS' : 'FAIL'} — ${n}${d ? ' :: ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400) : ''}`);
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

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-stt-'));
if (MODEL) {
  fs.mkdirSync(path.join(userData, 'stt-models'), { recursive: true });
  fs.linkSync(MODEL, path.join(userData, 'stt-models', 'ggml-small-q5_1.bin'));
}
const wav = path.join(APP, '.devtools/fixtures-stt-korean.wav');
// PACKAGED=1 → the built app (release/mac/MARTIALDEX.app) instead of the dev Electron + Vite
const PACKAGED = process.env.PACKAGED === '1';
const electronBin = PACKAGED ? path.join(APP, 'release/mac/MARTIALDEX.app/Contents/MacOS/MARTIALDEX') : path.join(APP, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const args = [...(PACKAGED ? [] : [APP]), `--user-data-dir=${userData}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`];
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let executablePath = electronBin;
let launchArgs = args;
if (OFFLINE) {
  // sandbox-exec wrapper: everything allowed except network, then localhost re-allowed
  const wrapper = path.join(userData, 'offline-electron.sh');
  fs.writeFileSync(
    wrapper,
    `#!/bin/bash\nexec /usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))(allow network-outbound (remote unix-socket))' "${electronBin}" "$@"\n`,
  );
  fs.chmodSync(wrapper, 0o755);
  executablePath = wrapper;
  // Chromium's own sandbox can't nest inside sandbox-exec — test-only flags
  launchArgs = [...args, '--no-sandbox', '--disable-gpu'];
}
const app = await electron.launch({ executablePath, args: launchArgs, env, timeout: 60000 });
const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
await page.waitForLoadState('load');
await sleep(800);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());

// The microphone = a REAL Korean recording played into a MediaStream (same technique as qa-ai-coach-day.mjs).
const __micB64 = fs.readFileSync('/Users/swcho/Documents/MARTIALDEX/.devtools/fixtures-stt-korean.wav').toString('base64');
await page.evaluate((b64) => {
  navigator.mediaDevices.getUserMedia = async () => {
    const ctx = new AudioContext();
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const buf = await ctx.decodeAudioData(bytes.buffer);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const dest = ctx.createMediaStreamDestination();
    src.connect(dest);
    src.start(ctx.currentTime + 0.3);
    return dest.stream;
  };
}, __micB64);

/** The lesson first asks which coach to use — pick the MARTIALDEX 자체 AI 코치 (no external AI). */
async function openTutor() {
  await page.evaluate(() => (location.hash = '#/'));
  await sleep(300);
  await page.evaluate(() => (location.hash = '#/learning/bjj/official__bjj/coach/6?mode=voice&place=home'));
  for (let i = 0; i < 60; i++) {
    if (await page.$('[data-testid="coach-mic"]')) return;
    const own = await page.$('text=MARTIALDEX 자체 AI 코치');
    const startBtn = await page.$('button:has-text("이 코치로 수업 시작")');
    if (own && startBtn) {
      await own.click();
      await startBtn.click();
    }
    await sleep(500);
  }
  throw new Error('AI 튜터 수업 화면에 마이크 버튼이 나오지 않음');
}

// count Gemini requests made through the main process from here on
await app.evaluate(({ ipcMain }) => {
  globalThis.__aiCalls = 0;
  ipcMain.removeHandler('ai:ask');
  ipcMain.handle('ai:ask', async () => {
    globalThis.__aiCalls++;
    return { ok: false, code: 'NETWORK', message: 'QA: AI 호출 차단됨' };
  });
});
const aiCalls = () => app.evaluate(() => globalThis.__aiCalls);

if (OFFLINE) {
  const net = await page.evaluate(async () => {
    try {
      await fetch('https://huggingface.co', { mode: 'no-cors' });
      return 'reachable';
    } catch {
      return 'blocked';
    }
  });
  check('[O0] 오프라인 모드: 외부 인터넷 차단 확인', net === 'blocked', net);
}


await page.evaluate(() => (location.hash = '#/coach/lesson'));
await page.waitForSelector('[data-testid="oneoff-request"]', { timeout: 20000 });
await page.locator('[data-testid="oneoff-request"]').fill('오늘 복싱 잽을 배우고 싶어');
await page.locator('[data-testid="oneoff-build"]').click();
// coach choice → the MARTIALDEX 자체 AI 코치
for (let i = 0; i < 20; i++) {
  if (await page.$('[data-testid="oneoff-lesson"]')) break;
  const own = await page.$('text=MARTIALDEX 자체 AI 코치');
  const go = await page.$('button:has-text("이 코치로 오늘 수업 만들기")');
  if (own && go) {
    await own.click();
    await go.click();
  }
  await sleep(500);
}
const built = await until(async () => !!(await page.$('[data-testid="oneoff-lesson"]')), 180000, 1000);
check('[A0] 자체 AI 코치로 오늘 수업 생성', built, built ? '' : await page.evaluate(() => document.body.innerText.slice(0, 300)));
if (built) {
  const hasBar = await until(async () => !!(await page.$('[data-testid="coach-mic"]')), 20000);
  check('[A1] AI 코치 수업 화면에 음성 입력 (로컬 엔진)', hasBar && /이 Mac에서 직접 인식/.test(await page.locator('[data-testid="coach-voice-engine"]').innerText().catch(() => '')));
  const before = await aiCalls();
  await page.locator('[data-testid="oneoff-answer"]').fill('');
  await until(async () => !(await page.locator('[data-testid="coach-mic"]').isDisabled()), 60000, 500);
  await page.locator('[data-testid="coach-mic"]').click();
  await until(async () => (await page.locator('[data-testid="coach-voice-panel"]').getAttribute('data-phase')) === 'listening', 10000);
  await until(async () => /준비|기술/.test(await page.evaluate(() => document.querySelector('[data-testid="coach-voice-partial"]')?.textContent ?? '')), 25000, 300);
  await page.locator('[data-testid="coach-mic"]').click();
  await until(async () => (await page.locator('[data-testid="oneoff-answer"]').inputValue()).length > 5, 20000, 300);
  const typed = await page.locator('[data-testid="oneoff-answer"]').inputValue();
  check('[A2] AI 코치: 말한 내용이 답변 입력창에 들어감 (자동 전송 안 함, 한국어)', ['잽', '가드', '준비', '기술'].filter((w) => typed.includes(w)).length >= 3, typed);
  check('[A3] AI 코치 음성인식에 Gemini 호출 0회', (await aiCalls()) - before === 0);
}
check('[Z] 페이지 에러 없음', errors.length === 0, errors.join(' | '));
await app.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
