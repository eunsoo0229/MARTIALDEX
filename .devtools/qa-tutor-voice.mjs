// AI 튜터 음성 / 말하기 속도 — real Electron app, the device's real Web
// Speech voices, real Gemini replies. speechSynthesis.speak is wrapped to
// RECORD every utterance (text, voice, rate) instead of playing it, so each
// spoken path can be checked for the chosen settings.
// Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-voice-'));
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  const d = typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (d ? ' :: ' + d.slice(0, 500) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${PROFILE}`], env, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForLoadState('load');
  await sleep(900);
  await page.evaluate(() => {
    window.__spoken = [];
    window.__cancels = 0;
    window.speechSynthesis.speak = (u) => window.__spoken.push({ text: u.text, voice: u.voice?.voiceURI ?? null, rate: u.rate, at: Date.now() });
    const cancel = window.speechSynthesis.cancel.bind(window.speechSynthesis);
    window.speechSynthesis.cancel = () => {
      window.__cancels++;
      cancel();
    };
  });
  return { app, page, errors };
}
async function quit(app) {
  const exited = new Promise((r) => app.process().once('exit', r));
  await app.evaluate(({ app: a }) => { setTimeout(() => a.quit(), 0); });
  await exited;
}
const spoken = (page) => page.evaluate(() => window.__spoken);

async function main() {
  let { app, page, errors } = await launch();
  const goto = async (hash) => {
    await page.evaluate(() => { window.location.hash = '#/'; });
    await sleep(300);
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    await sleep(1200);
  };

  const real = await page.evaluate(() => new Promise((res) => {
    const go = () => res(speechSynthesis.getVoices().map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang })));
    if (speechSynthesis.getVoices().length) go();
    else setTimeout(go, 2000);
  }));
  const realKo = real.filter((v) => /^ko/i.test(v.lang));
  const otherVoice = real.find((v) => v.lang === 'ja-JP') ?? real.find((v) => !/^ko/i.test(v.lang));

  // ---------- Settings screen (profile) ----------
  await goto('#/profile');
  await page.locator('[data-testid="profile-tutor-voice"] [data-testid="tutor-voice-select"]').waitFor();
  await sleep(500);
  const opts = await page.locator('[data-testid="profile-tutor-voice"] [data-testid="tutor-voice-select"] option').evaluateAll((os) => os.map((o) => o.value));
  check('[V1] 음성 목록 = 이 기기 TTS가 실제 제공하는 한국어 음성 (+기본), 없는 음성 없음', opts[0] === '' && opts.slice(1).length === realKo.length && opts.slice(1).every((u) => realKo.some((v) => v.uri === u)), { options: opts, realKo: realKo.map((v) => v.name) });
  await page.locator('[data-testid="profile-tutor-voice"] [data-testid="tutor-voice-show-other"]').check();
  const allOpts = await page.locator('[data-testid="profile-tutor-voice"] [data-testid="tutor-voice-select"] option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  check('[V1b] "다른 언어 음성도 보기" → 실제 설치된 다른 음성만 추가', allOpts.length === real.length && allOpts.every((u) => real.some((v) => v.uri === u)), `${allOpts.length}/${real.length}`);
  const rateLabel = await page.locator('[data-testid="profile-tutor-voice"] [data-testid="tutor-rate-value"]').textContent();
  check('[R1] 말하기 속도 기본값 1.0x, 범위 0.5x–2.0x', rateLabel === '1.0x' && (await page.locator('[data-testid="profile-tutor-voice"] [data-testid="tutor-rate-slider"]').getAttribute('min')) === '0.5' && (await page.locator('[data-testid="profile-tutor-voice"] [data-testid="tutor-rate-slider"]').getAttribute('max')) === '2', rateLabel);

  // Choose the device's Korean voice + 1.25x, preview it.
  const yuna = realKo[0];
  await page.locator('[data-testid="profile-tutor-voice"] [data-testid="tutor-voice-select"]').selectOption(yuna.uri);
  await page.locator('[data-testid="profile-tutor-voice"] [data-testid="tutor-rate-preset-1.25"]').click();
  await page.locator('[data-testid="profile-tutor-voice"] [data-testid="tutor-voice-preview"]').click();
  await sleep(200);
  let s = await spoken(page);
  check('[V2] 미리듣기: 선택한 음성·속도로 실제 재생', s.length === 1 && s[0].voice === yuna.uri && s[0].rate === 1.25 && s[0].text.includes('AI 튜터'), s);
  await page.locator('[data-testid="profile-tutor-voice"] [data-testid="tutor-rate-slider"]').fill('1.75');
  const label2 = await page.locator('[data-testid="profile-tutor-voice"] [data-testid="tutor-rate-value"]').textContent();
  check('[R2] 슬라이더로 속도 조절 + 현재 값 표시', label2 === '1.75x', label2);
  await page.locator('[data-testid="profile-tutor-voice"] [data-testid="tutor-rate-preset-1.25"]').click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:ai-tutor-voice-settings')));
  check('[S1] aiTutorVoice / aiTutorSpeechRate 저장', stored.aiTutorVoice === yuna.uri && stored.aiTutorSpeechRate === 1.25, stored);

  // Persistence across restart.
  await quit(app);
  ({ app, page, errors } = await launch());
  await goto('#/profile');
  await page.locator('[data-testid="profile-tutor-voice"] [data-testid="tutor-voice-select"]').waitFor();
  await sleep(600);
  const after = { voice: await page.locator('[data-testid="profile-tutor-voice"] [data-testid="tutor-voice-select"]').inputValue(), rate: await page.locator('[data-testid="profile-tutor-voice"] [data-testid="tutor-rate-value"]').textContent() };
  check('[S2] 앱 종료/재실행 후에도 음성·속도 유지', after.voice === yuna.uri && after.rate === '1.25x', after);

  // ---------- Before a lesson (Day start → AI 코치 → 장소 → 말로 대화) ----------
  await goto('#/learning/bjj/official__bjj/train');
  await page.locator('button', { hasText: /Day \d+ 훈련 시작/ }).first().click();
  await page.locator('button', { hasText: 'AI 코치와 하기' }).click();
  await page.locator('[data-testid="coach-location-home"]').click();
  await page.locator('[data-testid="coach-location-confirm"]').click();
  const pre = await page.locator('[data-testid="prestart-voice-settings"]').count();
  check('[UI1] 수업 시작 전(말로 대화 선택 화면)에 AI 튜터 음성·속도 설정', pre === 1);

  // ---------- Every spoken path in a real voice lesson ----------
  await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).clearCoachDayRun());
  await goto('#/learning/bjj/official__bjj/coach/6?mode=voice&place=home');
  await page.evaluate(() => { window.__spoken = []; window.__cancels = 0; });
  await page.waitForFunction(() => document.querySelector('[data-testid="coach-step"]')?.dataset.step === 'videos', null, { timeout: 60000 });
  await sleep(300);
  const coachLines = async () => page.evaluate(() => [...document.querySelectorAll('[data-testid="coach-chat"] .ai-msg--model .ai-msg__bubble')].map((b) => b.textContent));
  let lines = await coachLines();
  s = await spoken(page);
  check('[P1] 수업 시작 안내 + 기술 설명 + 영상 안내가 모두 읽힘 (함께 추가된 문장이 서로 끊지 않음)', lines.length >= 3 && lines.every((l) => s.some((x) => x.text === l)) && (await page.evaluate(() => window.__cancels)) === 0, { lines: lines.length, spoken: s.length });
  check('[P2] 그 모든 음성에 선택한 음성·속도 적용', s.length > 0 && s.every((x) => x.voice === yuna.uri && x.rate === 1.25), s.map((x) => `${x.rate}/${x.voice ? 'yuna' : 'default'}`));

  // Quiz + feedback (AI grading).
  // The video step now looks for (and verifies) a related video first; the button enables when that is done.
  await page.waitForFunction(() => document.querySelector('[data-testid="coach-videos"]')?.dataset.videoStatus === 'done', null, { timeout: 180000 });
  await page.locator('[data-testid="coach-video-done"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="coach-step"]')?.dataset.step === 'quiz', null, { timeout: 20000 });
  await page.locator('[data-testid="coach-text-input"]').fill('서서 상대를 넘어뜨릴 때 쓰는 기술');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-testid="coach-step"]')?.dataset.step === 'ready', null, { timeout: 60000 });
  await sleep(300);
  s = await spoken(page);
  const kinds = await page.evaluate(() => [...document.querySelectorAll('[data-testid="coach-chat"] .ai-msg--model')].map((m) => m.dataset.kind));
  check('[P3] 복습 질문·피드백·다음 단계 안내도 같은 설정으로 읽힘', kinds.includes('quiz') && kinds.includes('feedback') && s.every((x) => x.voice === yuna.uri && x.rate === 1.25) && (await coachLines()).every((l) => s.some((x) => x.text === l)), kinds);

  // ---------- Change during the lesson → applies from the next line ----------
  const otherUri = otherVoice.uri;
  await page.locator('[data-testid="coach-voice-settings"] summary').click();
  await page.locator('[data-testid="coach-voice-settings"] [data-testid="tutor-voice-show-other"]').check();
  await page.locator('[data-testid="coach-voice-settings"] [data-testid="tutor-voice-select"]').selectOption(otherUri);
  await page.locator('[data-testid="coach-voice-settings"] [data-testid="tutor-rate-preset-1.5"]').click();
  const beforeApply = (await spoken(page)).length;
  const cancelsBefore = await page.evaluate(() => window.__cancels);
  await page.locator('[data-testid="coach-voice-settings"] [data-testid="tutor-voice-apply"]').click();
  const applyMsg = await page.locator('[data-testid="tutor-voice-applied"]').textContent();
  check('[C1] 수업 중 설정 변경 → [적용], 재생 중인 음성은 끊지 않음', applyMsg.includes('다음 음성부터') && (await page.evaluate(() => window.__cancels)) === cancelsBefore && (await spoken(page)).length === beforeApply, applyMsg);
  // AI Coach voice answer to a question.
  await page.locator('[data-testid="coach-text-input"]').fill('이 기술에서 가장 중요한 포인트가 뭐야?');
  await page.keyboard.press('Enter');
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="coach-chat"] .ai-msg--model[data-kind="answer"]').length >= n, 1, { timeout: 60000 });
  await sleep(300);
  s = await spoken(page);
  const answer = s.slice(beforeApply);
  check('[C2/P4] 적용 후 다음 음성(코치 음성 응답)부터 새 음성·속도', answer.length >= 1 && answer.every((x) => x.voice === otherUri && x.rate === 1.5) && s.slice(0, beforeApply).every((x) => x.rate === 1.25), answer.map((x) => `${x.rate}/${x.voice}`));

  // Practice start + countdown cues + end/next-step lines.
  await page.locator('[data-testid="coach-ready"] button').click();
  await page.locator('[data-testid="coach-posture-start"]').click(); // 자세 설명 → 실습 시작
  await page.locator('[data-testid="coach-timer"]').waitFor();
  await sleep(300);
  // Jump the (real, Date.now()-based) timer to its last 11 seconds instead of waiting minutes.
  await page.evaluate(async () => {
    const st = await import('/src/lib/aiCoachDay/sessionStore.ts');
    st.updateCoachDayRun((r) => ({ ...r, practice: { ...r.practice, phaseEndTimestamp: Date.now() + 11500 } }));
  });
  await page.waitForFunction(() => ['practiced', 'explain', 'videos', 'summary'].includes(document.querySelector('[data-testid="coach-step"]')?.dataset.step), null, { timeout: 30000 });
  await sleep(1500);
  s = await spoken(page);
  const cueTexts = await page.evaluate(() => [...document.querySelectorAll('[data-testid="coach-chat"] .coach-cue .ai-msg__bubble')].map((b) => b.textContent));
  const tail = s.slice(beforeApply);
  check('[P5] 실습 시작·카운트다운(10초 남음/종료) 코칭 음성에도 새 설정 적용', cueTexts.some((t) => /10초/.test(t)) && cueTexts.every((t) => tail.some((x) => x.text === t && x.voice === otherUri && x.rate === 1.5)) && tail.some((x) => /시작하겠습니다|시작합니다/.test(x.text)), { cueTexts, tail: tail.map((x) => x.text.slice(0, 20)) });
  const cancelsInPractice = await page.evaluate(() => window.__cancels);
  // Cues spoken within 100 ms of each other fired in the same tick (one batch).
  const cueAts = tail.filter((x) => cueTexts.includes(x.text)).map((x) => x.at).sort((a, b) => a - b);
  const batches = cueAts.filter((t, i) => i === 0 || t - cueAts[i - 1] > 100).length;
  check('[P5b] 동시에 생긴 시간 안내들도 모두 들림 (묶음마다 첫 안내만 앞 음성을 끊음)', cueAts.length === cueTexts.length && batches < cueTexts.length && cancelsInPractice - cancelsBefore === batches, { cues: cueTexts.length, batches, cancels: cancelsInPractice - cancelsBefore });
  check('[P6] 실습 후 피드백 · 다음 단계(다음 기술 설명) 안내도 새 설정', tail.some((x) => /어려웠던 점/.test(x.text)) && tail.every((x) => x.voice === otherUri && x.rate === 1.5), tail.length);

  // ---------- Text mode: nothing is spoken ----------
  await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).clearCoachDayRun());
  await goto('#/learning/bjj/official__bjj/coach/6?mode=text&place=home');
  await page.evaluate(() => { window.__spoken = []; });
  await page.waitForFunction(() => document.querySelector('[data-testid="coach-step"]')?.dataset.step === 'videos', null, { timeout: 60000 });
  await sleep(500);
  check('[T1] 텍스트 모드에는 영향 없음 (음성 0개, 설정 패널 없음)', (await spoken(page)).length === 0 && (await page.locator('[data-testid="coach-voice-settings"]').count()) === 0);
  await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).clearCoachDayRun());

  // Unavailable saved voice → falls back safely.
  await page.evaluate(() => localStorage.setItem('martialdex:ai-tutor-voice-settings', JSON.stringify({ aiTutorVoice: 'not-a-real-voice', aiTutorSpeechRate: 9 })));
  const fb = await page.evaluate(async () => {
    const t = await import('/src/lib/voice/tts.ts');
    window.__spoken = [];
    t.speak('테스트');
    return window.__spoken[0];
  });
  check('[S3] 이 기기에 없는 저장 음성 → 기본 음성, 범위 밖 속도 → 2.0x로 제한 (오류 없음)', fb.voice === null && fb.rate === 2, fb);

  check('[Z] 페이지 에러 없음', errors.length === 0, errors);
  await quit(app);
  const passed = results.filter((x) => x.pass).length;
  console.log(`=== SUMMARY: ${passed}/${results.length} PASSED ===`);
  if (passed !== results.length) console.log('FAILURES:', results.filter((x) => !x.pass).map((x) => x.name));
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
