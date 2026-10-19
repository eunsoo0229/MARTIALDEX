// QA: Mac 앱 로컬 음성인식 (whisper.cpp) — end to end in Electron.
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

// ---- model ----
if (!MODEL) {
  await openTutor();
  await page.locator('[data-testid="coach-mic"]').click();
  const prompt = await until(async () => !!(await page.$('[data-testid="coach-voice-model-download"]')), 10000);
  check('[M1] 모델이 없으면 마이크 대신 "모델 내려받기" 안내 (용량 표시)', prompt, await page.locator('[data-testid="coach-voice-model"]').innerText().catch(() => ''));
  await page.locator('[data-testid="coach-voice-model-download"]').click();
  const progressed = await until(async () => /내려받는 중/.test(await page.locator('[data-testid="coach-voice-model"]').innerText()), 15000);
  check('[M2] 내려받기 진행률 표시', progressed);
  const done = await until(async () => !(await page.$('[data-testid="coach-voice-model"]')), 600000, 1000);
  const st = await page.evaluate(() => window.martialdex.stt.status());
  check('[M3] 내려받기 완료 → 크기·해시 검증 후 저장 (userData/stt-models)', done && st.downloaded && st.path.includes('stt-models'), st);
}

// ---- AI 튜터 (커리큘럼 코치 세션) ----
await openTutor();
const engine = await page.locator('[data-testid="coach-voice-engine"]').innerText();
check('[T1] AI 튜터: 음성인식 엔진 = 이 Mac에서 직접 인식 (whisper.cpp)', /이 Mac에서 직접 인식/.test(engine), engine);
await page.locator('[data-testid="coach-text-input"]').fill('');
const before = await aiCalls();
const gumCount = await page.evaluate(() => {
  window.__gum = 0;
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = (c) => {
    window.__gum++;
    return orig(c);
  };
  return 0;
});
void gumCount;
// double tap: must not open two engines
await page.locator('[data-testid="coach-mic"]').dblclick().catch(() => {});
// the second tap lands while the first is still starting → ignored; wait for the single session to listen
const listening = await until(async () => (await page.locator('[data-testid="coach-voice-panel"]').getAttribute('data-phase')) === 'listening', 8000);
check('[T2] 마이크 켜짐 → 듣는 중', listening);
const t0 = Date.now();
const partialSeen = await until(async () => /잽|가드|준비/.test(await page.locator('[data-testid="coach-voice-partial"]').innerText().catch(() => '')), 20000, 300);
const partialText = await page.locator('[data-testid="coach-voice-partial"]').innerText().catch(() => '');
check('[T3] 말하는 도중 인식된 글자가 실시간(구간마다) 표시', partialSeen, `${partialText} (${Math.round((Date.now() - t0) / 100) / 10}s)`);
await until(async () => /준비|기술/.test(await page.locator('[data-testid="coach-voice-partial"]').innerText().catch(() => '')), 15000, 300);
await page.locator('[data-testid="coach-mic"]').click(); // 말하기 끝
const finalOk = await until(async () => (await page.locator('[data-testid="coach-text-input"]').inputValue()).length > 5, 20000, 300);
const typed = await page.locator('[data-testid="coach-text-input"]').inputValue();
const words = ['잽', '가드', '준비', '기술'].filter((w) => typed.includes(w));
check('[T4] 말하기 끝 → 최종 문장이 입력창에 들어감 (한국어 인식)', finalOk && words.length >= 3, typed);
const sentAuto = await page.evaluate((t) => [...document.querySelectorAll('.ai-msg--user .ai-msg__bubble, [data-role="user"]')].some((b) => b.textContent.includes(t.slice(0, 6))), typed);
check('[T5] 자동 전송 안 함 (입력창에서 확인·수정 후 보내기)', !sentAuto && typed.length > 5);
const gum = await page.evaluate(() => window.__gum);
check('[T6] 빠르게 두 번 눌러도 마이크·엔진은 하나만 열림', gum === 1, `getUserMedia ${gum}회`);
const used = (await aiCalls()) - before;
check('[T7] 음성인식에 Gemini 호출 0회', used === 0, `${used}회`);
// whisper-server listens on localhost only
const listen = execFileSync('/bin/sh', ['-c', 'lsof -nP -iTCP -sTCP:LISTEN | grep whisper || true']).toString();
check('[T8] 로컬 엔진은 127.0.0.1에서만 대기 (외부에 열리지 않음)', /127\.0\.0\.1:\d+ \(LISTEN\)/.test(listen) && !/\*:\d+ \(LISTEN\)/.test(listen), listen.trim());

// edit then send with the normal button — the edited text is what's sent
await page.locator('[data-testid="coach-text-input"]').fill(typed + ' (수정함)');
const editable = (await page.locator('[data-testid="coach-text-input"]').inputValue()).endsWith('(수정함)');
check('[T9] 인식된 글을 직접 고칠 수 있음', editable);
await page.locator('[data-testid="coach-text-input"]').fill('');

// cancel: nothing goes to the input
const micState = () => page.evaluate(() => ({ disabled: document.querySelector('[data-testid="coach-mic"]')?.disabled, label: document.querySelector('[data-testid="coach-mic"]')?.textContent, phase: document.querySelector('[data-testid="coach-voice-panel"]')?.dataset.phase, cancel: !!document.querySelector('[data-testid="coach-mic-cancel"]') }));
await until(async () => !(await micState()).disabled, 60000, 500);
console.log('DIAG before cancel test', JSON.stringify(await micState()));
await page.locator('[data-testid="coach-mic"]').click();
await until(async () => (await micState()).cancel, 15000);
console.log('DIAG listening', JSON.stringify(await micState()));
await sleep(1500);
await page.locator('[data-testid="coach-mic-cancel"]').click();
await sleep(2500);
check('[T10] 취소 → 입력창에 아무것도 들어가지 않음', (await page.locator('[data-testid="coach-text-input"]').inputValue()) === '' && (await page.locator('[data-testid="coach-voice-panel"]').getAttribute('data-phase')) === 'idle');

// mic permission denied (exact error a denial raises) — clear message, no Gemini fallback on the Mac
await page.evaluate(() => {
  window.__origGum = navigator.mediaDevices.getUserMedia;
  navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
});
await page.locator('[data-testid="coach-mic"]').click();
await until(async () => !!(await page.$('[data-testid="coach-voice-error"]')), 8000);
const denied = await page.evaluate(() => ({ code: document.querySelector('[data-testid="coach-voice-error"]')?.dataset.code, text: document.querySelector('[data-testid="coach-voice-error"]')?.textContent, fallback: !!document.querySelector('[data-testid="coach-voice-fallback"]') }));
check('[T11] 마이크 권한 거부 → 권한 안내 (엔진 오류와 구분), Mac에서는 Gemini 대체 버튼 없음', denied.code === 'PERMISSION_DENIED' && /권한/.test(denied.text ?? '') && !denied.fallback, denied);
await page.evaluate(() => (navigator.mediaDevices.getUserMedia = window.__origGum));

check('[Z] 페이지 에러 없음', errors.length === 0, errors.join(' | '));
await app.close();
try {
  execFileSync('pkill', ['-f', `stt-models`]);
} catch {}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
