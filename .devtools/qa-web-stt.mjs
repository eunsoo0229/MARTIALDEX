// QA: 브라우저 음성인식 엔진 (Web Speech API) — forced in Electron with the QA override.
// Real Electron SpeechRecognition (fails with "network" — exactly why the Mac app doesn't use it) and a
// scripted mock recognizer for interim/final/duplicate/restart handling.
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
async function openTutor(kind = 'MARTIALDEX 자체 AI 코치') {
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


await page.evaluate(() => localStorage.setItem('martialdex:stt-engine', 'web'));
const errOf = () => page.evaluate(() => ({ code: document.querySelector('[data-testid="coach-voice-error"]')?.dataset.code, text: document.querySelector('[data-testid="coach-voice-error"]')?.textContent ?? '', fallback: document.querySelector('[data-testid="coach-voice-fallback"]')?.textContent ?? null }));

// ---- Gemini 코치: the real Electron engine fails → fallback offered ----
await page.evaluate(() => localStorage.removeItem('martialdex:coach-preference'));
await openTutor('Gemini AI 코치');
const label = await page.locator('[data-testid="coach-voice-engine"]').innerText();
check('[W1] 브라우저 엔진 표시 + "오프라인 보장 안 됨" 안내', /브라우저 음성인식/.test(label) && /오프라인은 보장되지 않습니다/.test(label), label);
await page.locator('[data-testid="coach-mic"]').click();
await until(async () => !!(await errOf()).code, 10000);
const e1 = await errOf();
check('[W2] Electron의 실제 브라우저 엔진은 network 오류 (그래서 Mac 앱은 로컬 엔진 사용) → 네트워크 안내, Mac에서는 Gemini 대체 없음', e1.code === 'ENGINE_FAILED' && /네트워크/.test(e1.text) && e1.fallback === null, e1);

// ---- mock recognizer: interim → final, a duplicated event, an engine restart ----
await page.evaluate(() => {
  window.__srLog = [];
  class MockSR {
    constructor() {
      window.__srLog.push('new');
      window.__lastSR = this;
      this.lang = '';
    }
    start() {
      window.__srLog.push('start:' + this.lang);
      const run = window.__srLog.filter((x) => x === 'new').length;
      const R = (t, f) => Object.assign([{ transcript: t }], { isFinal: f });
      const emit = (list) => this.onresult?.({ results: list });
      if (run === 1) {
        setTimeout(() => emit([R('잽을', false)]), 200);
        setTimeout(() => emit([R('잽을 던진', false)]), 450);
        setTimeout(() => emit([R('잽을 던진 다음에', true)]), 700);
        setTimeout(() => emit([R('잽을 던진 다음에', true)]), 750); // the same event again
        setTimeout(() => this.onend?.(), 1100); // the engine ends itself after a pause → restarted
      } else {
        setTimeout(() => emit([R('가드를', false)]), 300);
        setTimeout(() => emit([R('가드를 올려요', true)]), 600);
      }
    }
    stop() {
      window.__srLog.push('stop');
      setTimeout(() => this.onend?.(), 50);
    }
    abort() {
      window.__srLog.push('abort');
      setTimeout(() => this.onend?.(), 10);
    }
  }
  window.SpeechRecognition = MockSR;
});
await page.locator('[data-testid="coach-text-input"]').fill('');
const before = await aiCalls();
await page.locator('[data-testid="coach-mic"]').click();
const partials = [];
for (let i = 0; i < 30; i++) {
  const t = await page.locator('[data-testid="coach-voice-partial"]').innerText().catch(() => '');
  if (t && partials.at(-1) !== t) partials.push(t);
  await sleep(100);
}
check('[W3] 듣는 동안 중간 결과 → 확정 결과가 실시간 표시', partials.some((p) => p.includes('잽을 던진')) && partials.some((p) => p.includes('가드를')), JSON.stringify(partials));
await page.locator('[data-testid="coach-mic"]').click();
await until(async () => (await page.locator('[data-testid="coach-text-input"]').inputValue()).length > 3, 6000);
const final = await page.locator('[data-testid="coach-text-input"]').inputValue();
check('[W4] 재시작 전 확정분 + 새 결과가 이어지고, 같은 이벤트가 두 번 와도 중복 없음', final === '잽을 던진 다음에 가드를 올려요', final);
const log = await page.evaluate(() => window.__srLog);
check('[W5] 한국어(ko-KR) 설정, 엔진이 스스로 끝나면 이어서 재시작', log.filter((x) => x === 'start:ko-KR').length === 2, log.join(' '));
check('[W6] 브라우저 음성인식에 Gemini 호출 0회', (await aiCalls()) - before === 0);

// ---- permission refused: a permission message, NOT an engine error, no fallback ----
await page.evaluate(() => {
  window.SpeechRecognition = class {
    start() {
      setTimeout(() => this.onerror?.({ error: 'not-allowed' }), 50);
      setTimeout(() => this.onend?.(), 80);
    }
    stop() {}
    abort() {}
  };
});
await page.locator('[data-testid="coach-mic"]').click();
await until(async () => (await errOf()).code === 'PERMISSION_DENIED', 6000);
const e2 = await errOf();
check('[W7] 권한 거부(not-allowed) → 권한 안내, 엔진 오류와 구분 (대체 버튼 없음)', e2.code === 'PERMISSION_DENIED' && /권한/.test(e2.text) && e2.fallback === null, e2);

// ---- 자체 코치: never offers the Gemini fallback ----
await page.evaluate(() => {
  delete window.SpeechRecognition;
  localStorage.removeItem('martialdex:coach-preference');
});
await openTutor('MARTIALDEX 자체 AI 코치');
await page.locator('[data-testid="coach-mic"]').click();
await until(async () => !!(await errOf()).code, 10000);
const e3 = await errOf();
check('[W8] 자체 AI 코치: 엔진 오류여도 Gemini 대체 버튼 없음', e3.code === 'ENGINE_FAILED' && e3.fallback === null, e3);

await page.evaluate(() => localStorage.removeItem('martialdex:stt-engine'));
check('[Z] 페이지 에러 없음', errors.length === 0, errors.join(' | '));
await app.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
