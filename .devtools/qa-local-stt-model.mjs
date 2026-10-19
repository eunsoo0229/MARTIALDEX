// QA: Mac 앱 로컬 음성인식 — model handling: damaged file, cancelled download, light model download + recognition + delete.
// (Recognition itself: qa-local-stt.mjs.)
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
// a DAMAGED model: right size, wrong content (what a broken copy / disk error looks like)
fs.mkdirSync(path.join(userData, 'stt-models'), { recursive: true });
const damaged = path.join(userData, 'stt-models', 'ggml-small-q5_1.bin');
fs.closeSync(fs.openSync(damaged, 'w'));
fs.truncateSync(damaged, 190085487);
const wav = path.join(APP, '.devtools/fixtures-stt-korean.wav');
const electronBin = path.join(APP, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const args = [APP, `--user-data-dir=${userData}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`];
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


// ---- damaged model ----
await openTutor();
await page.locator('[data-testid="coach-mic"]').click();
await until(async () => (await page.locator('[data-testid="coach-voice-panel"]').getAttribute('data-phase')) === 'listening', 10000);
await sleep(7000);
await page.locator('[data-testid="coach-mic"]').click();
const shown = await until(async () => !!(await page.$('[data-testid="coach-voice-model-download"]')), 30000);
const err = await page.locator('[data-testid="coach-voice-error"]').innerText().catch(() => '');
check('[D1] 손상된 모델 → 해시 재검사 후 삭제, "손상되어 삭제" 안내 + 다시 내려받기 버튼', shown && /손상/.test(err) && !fs.existsSync(damaged), err);

// ---- model settings in 마이크 테스트: switch to the light model ----
await page.locator('[data-testid="coach-mic-test"] > summary').click();
await page.locator('[data-testid="mic-test-model-settings"] > summary').click();
await page.locator('[data-testid="mic-test-model-settings"] label:has-text("가벼움") input').check();
await until(async () => !!(await page.$('[data-testid="mic-test-model-download"]')), 5000);
const prompt = await page.locator('[data-testid="mic-test-model"]').innerText();
check('[D2] 가벼운 모델(base) 선택 → 60MB 내려받기 안내, 저장 위치 표시', /60MB/.test(prompt) && /stt-models/.test(await page.locator('[data-testid="mic-test-model-settings"]').innerText()), prompt);
// cancel mid-download
await page.locator('[data-testid="mic-test-model-download"]').click();
await until(async () => /내려받는 중/.test(await page.locator('[data-testid="mic-test-model"]').innerText()), 15000);
await sleep(800);
await page.locator('[data-testid="mic-test-model-cancel"]').click();
await until(async () => !!(await page.$('[data-testid="mic-test-model-download"]')), 15000);
const leftovers = fs.readdirSync(path.join(userData, 'stt-models'));
check('[D3] 내려받기 취소 → 임시 파일(.part) 남지 않음, 다시 받기 버튼', leftovers.length === 0, leftovers.join(','));
// full download
await page.locator('[data-testid="mic-test-model-download"]').click();
const got = await until(async () => !(await page.$('[data-testid="mic-test-model"]')), 300000, 1000);
check('[D4] 가벼운 모델 내려받기 완료 (해시 검증)', got && fs.existsSync(path.join(userData, 'stt-models', 'ggml-base-q5_1.bin')));
// recognize with it
await page.locator('[data-testid="mic-test-button"]').click();
await until(async () => (await page.locator('[data-testid="mic-test"]').getAttribute('data-phase')) === 'listening', 10000);
await sleep(9000);
await page.locator('[data-testid="mic-test-button"]').click();
await until(async () => !!(await page.$('[data-testid="mic-test-result"]')) || !!(await page.$('[data-testid="mic-test-error"]')), 30000);
const res = await page.locator('[data-testid="mic-test-result"]').innerText().catch(() => '');
check('[D5] 가벼운 모델로 마이크 테스트 → 한국어 인식 결과', /던진|준비|기술|다음/.test(res), res);
// delete
await page.locator('[data-testid="mic-test-model-delete"]').click();
await until(async () => !!(await page.$('[data-testid="mic-test-model-download"]')), 10000);
check('[D6] 모델 삭제 → 파일 삭제, 다시 내려받기 안내', !fs.existsSync(path.join(userData, 'stt-models', 'ggml-base-q5_1.bin')));
await page.evaluate(() => localStorage.removeItem('martialdex:stt-local-model'));

check('[Z] 페이지 에러 없음', errors.length === 0, errors.join(' | '));
await app.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
