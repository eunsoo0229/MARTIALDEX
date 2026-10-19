// Curriculum DAY start chooser + AI coach day session (text and voice).
// Real Gemini calls, real curriculum data (official__bjj Day 10 / Day 6 —
// single-technique Days with registered videos), real microphone path via
// Chromium's fake capture device fed a real recorded Korean question
// (.devtools/fixtures-voice-*.wav, generated with macOS `say`). No mocks of
// app logic. Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  const d = typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (d ? ' :: ' + d.slice(0, 400) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(extraArgs = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-coach-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`, ...extraArgs], env, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.waitForLoadState('load');
  await page.evaluate(() => localStorage.setItem('martialdex:coach-kind-pref', JSON.stringify({ last: 'gemini', remember: true }))); // 이 QA는 기존 Gemini 코치를 검증 — 수업 전 코치 선택(2026-10-19) 이후 Gemini를 명시적으로 선택
  await sleep(800);
  return { app, page, errors };
}
const goto = async (page, hash) => {
  await page.evaluate(() => { window.location.hash = '#/'; });
  await sleep(250);
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await sleep(900);
};
const stepOf = (page) => page.evaluate(() => document.querySelector('[data-testid="coach-step"]')?.getAttribute('data-step') ?? null);
async function waitStep(page, step, timeout = 90000) {
  await page.waitForFunction((s) => document.querySelector('[data-testid="coach-step"]')?.getAttribute('data-step') === s, step, { timeout });
}
const countKind = (page, kind) => page.evaluate((k) => document.querySelectorAll(`[data-testid="coach-chat"] [data-kind="${k}"]`).length, kind);
async function send(page, text) {
  await page.fill('[data-testid="coach-text-input"]', text);
  await page.locator('[data-testid="coach-input"] button', { hasText: '보내기' }).click();
}

async function main() {
  // ================= Launch 1: chooser + text mode =================
  let { app, page, errors } = await launch();

  await goto(page, '#/learning/bjj/official__bjj/train');
  const startBtn = page.locator('button', { hasText: /Day \d+ 훈련 시작/ });
  await startBtn.click();
  await sleep(300);
  const chooser = await page.locator('[data-testid="day-start-chooser"]').textContent().catch(() => '');
  check('[C1] DAY 시작 시 "혼자 하기 / AI 코치와 하기" 선택 제공', chooser.includes('혼자 하기') && chooser.includes('AI 코치와 하기'), chooser);
  await page.locator('button', { hasText: '혼자 하기' }).click();
  await sleep(900);
  const solo = await page.evaluate(() => ({ url: location.hash, text: document.body.innerText.slice(0, 400) }));
  check('[C2] 혼자 하기 → 기존 학습(오늘의 훈련, 세트 진행) 그대로', solo.url.includes('/today-training') && /SET 1 \//.test(solo.text), solo);

  await goto(page, '#/learning/bjj/official__bjj/train');
  await page.locator('button', { hasText: '다른 Day로 훈련하기' }).click();
  await page.locator('button:text-is("Day 10")').click();
  await page.locator('button', { hasText: 'AI 코치와 하기' }).click();
  // AI 코치 수업 now asks the place (집/체육관) first — covered in depth by qa-ai-coach-class.mjs.
  await page.locator('[data-testid="coach-location-home"]').click();
  await page.locator('[data-testid="coach-location-confirm"]').click();
  const coachChoice = await page.locator('[data-testid="day-start-chooser"]').textContent();
  check('[C3] AI 코치 선택 후 "말로 대화 / 입력으로 대화" 선택', coachChoice.includes('말로 대화') && coachChoice.includes('입력으로 대화'), coachChoice);
  await page.locator('button', { hasText: '입력으로 대화' }).click();
  await sleep(600);
  check('[C3b] 입력 모드 코치 화면으로 이동', page.url().includes('/coach/10?mode=text'), page.url());

  const day10 = await page.evaluate(async () => {
    const { getCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    const { coachTechniquesForDay } = await import('/src/lib/aiCoachDay/service.ts');
    const { getTechniqueVideos } = await import('/src/lib/techniqueVideo/service.ts');
    const { practiceSecondsFor } = await import('/src/lib/aiCoachDay/config.ts');
    const c = getCurriculum('official__bjj');
    const d = c.days.find((x) => x.day === 10);
    const ts = coachTechniquesForDay(d);
    return { names: ts.map((t) => [t.name, t.koreanName]), videos: getTechniqueVideos(ts[0]).map((v) => v.videoId), seconds: practiceSecondsFor(d, ts[0], ts.length), est: d.estimatedMinutes };
  });

  // 1:1 수업: short explanation → question; "준비됐어" jumps ahead to the video (core concepts are still checked before practice).
  await waitStep(page, 'lesson');
  check('[C4a] 수업은 짧은 설명 후 질문으로 시작 (답을 기다림)', (await countKind(page, 'quiz')) >= 1 && (await page.locator('[data-testid="coach-awaiting"]').count()) === 1);
  const explain = await page.evaluate(() => [...document.querySelectorAll('[data-testid="coach-chat"] [data-kind="explain"]')].map((e) => e.textContent).join(' '));
  const mentions = day10.names.flat().filter(Boolean).some((n) => explain.includes(n));
  check('[C4] STEP 1: 오늘 기술 안내(이름 포함) 표시', explain.length > 30 && mentions, explain.slice(0, 200));
  await send(page, '준비됐어');
  await waitStep(page, 'videos', 20000);
  const chips = await page.locator('[data-testid="coach-videos"] .chip').count();
  check('[C5] STEP 2: 등록된 관련 영상 수만큼 선택지 제공 (가정 없음)', chips === day10.videos.length && chips > 0, { chips, registered: day10.videos.length });
  await page.locator('[data-testid="coach-videos"] .chip', { hasText: `영상 ${day10.videos.length}` }).click();
  await sleep(300);
  const iframeSrc = await page.getAttribute('[data-testid="coach-videos"] iframe', 'src');
  check('[C5b] 선택한 영상 재생', !!iframeSrc && iframeSrc.includes(day10.videos[day10.videos.length - 1]), iframeSrc);

  // The video step now looks for (and verifies) a related video first; the button enables when that is done.
  await page.waitForFunction(() => document.querySelector('[data-testid="coach-videos"]')?.dataset.videoStatus === 'done', null, { timeout: 180000 });
  const quizBefore = await countKind(page, 'quiz');
  await page.locator('[data-testid="coach-video-done"]').click();
  await sleep(300);
  check('[C6] 실습 전 확인 질문 제시', (await stepOf(page)) === 'quiz' && (await countKind(page, 'quiz')) === quizBefore + 1);
  // Answer (or, after a couple of tries, skip) until the coach says it's time to practise.
  for (let i = 0; i < 4 && (await stepOf(page)) === 'quiz'; i++) {
    const n = await page.evaluate(() => document.querySelectorAll('[data-testid="coach-chat"] .ai-msg').length);
    if (i >= 2) await page.locator('[data-testid="coach-quick-skip"]').click();
    else await send(page, '스탠딩에서 상대 다리를 잡고 테이크다운할 때 써요');
    await page.waitForFunction((n) => document.querySelectorAll('[data-testid="coach-chat"] .ai-msg').length > n + 1 && !document.querySelector('.ai-msg__bubble--loading'), n, { timeout: 90000 });
    await sleep(300);
  }
  await waitStep(page, 'ready');
  check('[C6b] 답에 대한 피드백 후 실습 준비 단계', (await countKind(page, 'feedback')) >= 1);

  await send(page, '시작 자세가 뭐야?');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="coach-chat"] [data-kind="answer"]').length >= 1, null, { timeout: 90000 });
  check('[C7] 텍스트 질문에 코치가 답변, "시작 자세" 질문을 실습 시작으로 오인하지 않음', (await stepOf(page)) === 'ready');
  const answerText = await page.evaluate(() => [...document.querySelectorAll('[data-testid="coach-chat"] [data-kind="answer"]')].pop()?.textContent ?? '');
  check('[C7b] 코치가 사용자를 "보고 있다"고 말하지 않음 (카메라 없음)', !/(보니|보이네요|자세가 좋|잘 하고 계시|화면으로 보)/.test(answerText), answerText.slice(0, 200));

  // High Crotch is a BJJ standing takedown entry and the class is at home → "준비됐어요" first
  // brings the posture briefing (nothing starts), then the Visualizing Mitt is ALWAYS called,
  // then the solo call-out drill (cues called quickly) — never "N분 동안 반복" with a timer.
  await send(page, '준비됐어요');
  await waitStep(page, 'posture', 10000);
  const posture = await page.evaluate(() => ({
    lines: [...document.querySelectorAll('[data-testid="coach-posture-lines"] li')].map((l) => l.textContent),
    mitt: document.querySelector('[data-testid="coach-posture-mitt"]')?.textContent ?? '',
    running: !!document.querySelector('[data-testid="mitt-runner"], [data-testid="solo-drill"], [data-testid="coach-timer"]'),
  }));
  check('[C8a] "준비됐어요" → 바로 실습하지 않고 자세 설명부터 (기본 자세 + 기술 자세, 미트 예고)', posture.lines.length >= 2 && /기본 자세/.test(posture.lines[0]) && /High Crotch|하이 크로치/.test(posture.lines.join(' ')) && /Visualizing Mitt/.test(posture.mitt) && !posture.running, posture);
  await send(page, '준비됐어');
  await waitStep(page, 'mitt', 10000);
  check('[C8b] 자세 확인 후 Visualizing Mitt를 자동으로 불러옴 (요청 없이)', (await page.locator('[data-testid="coach-mitt"] [data-testid="mitt-runner"]').count()) === 1);
  await page.locator('[data-testid="mitt-runner-stop"]').click();
  await waitStep(page, 'drill', 10000);
  const drillInfo = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('martialdex:ai-coach-day-run'));
    return { cues: raw.drillPlan?.cues?.map((c) => c.call) ?? [], seconds: raw.drillPlan?.seconds, timer: !!raw.practice };
  });
  check('[C8] 미트 뒤 (집 · BJJ 스탠딩 테이크다운) 솔로 드릴로 이어짐 — 실제 기술 구령, 타이머 아님', (await page.locator('[data-testid="solo-drill"]').count()) === 1 && drillInfo.cues.length >= 5 && !drillInfo.timer && drillInfo.cues.includes('High Crotch'), drillInfo);
  await sleep(6000);
  const calls = await page.evaluate(() => Number(document.querySelector('[data-testid="solo-drill"]')?.dataset.calls));
  // Fast-forward the stored drill (not the logic): finish it now.
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('martialdex:ai-coach-day-run'));
    raw.drillPlan.seconds = 7;
    localStorage.setItem('martialdex:ai-coach-day-run', JSON.stringify(raw));
    window.dispatchEvent(new CustomEvent('martialdex:ai-coach-day-updated'));
  });
  // 수행 후 질문 → (상황 판단) → 복습 — skipped here; qa-coach-lesson-live.mjs answers them.
  await waitStep(page, 'review', 30000);
  check('[C9a] 실습 후 바로 끝내지 않고 수행 후 질문', (await page.locator('[data-testid="coach-awaiting"]').count()) === 1);
  for (let i = 0; i < 4 && ['review', 'recap'].includes(await stepOf(page)); i++) {
    await page.locator('[data-testid="coach-quick-skip"]').click();
    await sleep(600);
  }
  await waitStep(page, 'summary', 30000);
  const cues = await page.evaluate(() => [...document.querySelectorAll('[data-testid="coach-chat"] [data-kind="cue"]')].map((e) => e.textContent));
  const drillRun = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:ai-coach-day-run'))?.drillSessions ?? []);
  check('[C9] 솔로 드릴: 구령이 이어졌고(6초에 2번 이상) 끝까지 진행하면 완료로 기록', calls >= 2 && drillRun.length === 1 && drillRun[0].finished === true, { calls, drillRun });
  check('[C10] 드릴에는 타이머용 시간 알림(1분 경과·10초 남음)이 섞이지 않음 — 타이머 알림 규칙은 C14·C15에서 검증', !cues.some((c) => /1분이 지났습니다|10초 남았습니다/.test(c)), cues);

  const summaryText = await page.textContent('[data-testid="coach-summary"]');
  const hist = await page.evaluate(async () => {
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    const { getProgress } = await import('/src/lib/curriculum/curriculumService.ts').catch(() => ({}));
    const e = listTrainingHistory().filter((x) => x.curriculumId === 'official__bjj' && x.dayNumber === 10 && (x.notes ?? '').includes('AI 코치'));
    const prog = JSON.parse(localStorage.getItem('martialdex:curriculum-progress') ?? '{}');
    return { count: e.length, entry: e[0] ?? null, progressRaw: JSON.stringify(prog).slice(0, 300), hasGetProgress: typeof getProgress === 'function' };
  });
  check('[C11] 학습 종료 요약: 기술·학습 시간·완료 여부 표시', summaryText.includes('총 실습 시간') && summaryText.includes('완료'), summaryText.slice(0, 200));
  check('[C12] 기존 training history에 1건 기록 (source=curriculum, Day 10, 실제 실습 시간)', hist.count === 1 && hist.entry.source === 'curriculum' && hist.entry.completed === true && hist.entry.actualMinutes >= 1, hist.entry);
  await page.reload();
  await sleep(1500);
  const histAfterReload = await page.evaluate(async () => (await import('/src/lib/trainingHistory/service.ts')).listTrainingHistory().filter((x) => x.curriculumId === 'official__bjj' && x.dayNumber === 10 && (x.notes ?? '').includes('AI 코치')).length);
  check('[C12b] 요약 화면 새로고침해도 중복 기록 없음', histAfterReload === 1, histAfterReload);
  const lessonLog = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:coach-lesson-log') || '[]'));
  check('[C12c] 수업 요약(전 수업내용 복습용) 1건 저장 · 기술·개념 이해 결과 포함 · 새로고침해도 1건', lessonLog.length === 1 && lessonLog[0].kind === 'curriculum_day' && lessonLog[0].techniques.some((t) => t.techniqueId === 'bjj__high-crotch' && t.concepts.length > 0), lessonLog.map((l) => ({ kind: l.kind, techniques: l.techniques.map((t) => [t.techniqueId, t.concepts.length]), qa: l.qa.length })));
  const dayDone = await page.evaluate(async () => {
    const { getCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    const m = await import('/src/lib/curriculum/curriculumService.ts');
    const c = getCurriculum('official__bjj');
    const p = (m.getCurriculumProgress ?? m.ensureProgress)?.(c);
    return p?.completedDays?.includes(10) ?? null;
  });
  check('[C13] 모든 기술 실습 완료 시 Day 완료로 표시 (기존 진행도와 연동)', dayDone === true, dayDone);

  // ---------- Pure logic ----------
  const pure = await page.evaluate(async () => {
    const { evaluateCues } = await import('/src/lib/aiCoachDay/cues.ts');
    const { PRACTICE_CUES, practiceSecondsFor, COACH_DAY_CONFIG } = await import('/src/lib/aiCoachDay/config.ts');
    const { isReadyIntent } = await import('/src/lib/aiCoachDay/service.ts');
    // Simulate a 180s run second by second with the real function.
    const start = 1_000_000;
    let p = { techniqueId: 't', totalSeconds: 180, startedAt: '', phaseEndTimestamp: start + 180000, pausedRemainingMs: null, paused: false, firedCueIds: [] };
    const timeline = [];
    for (let s = 0; s <= 181; s += 0.25) {
      const { fired } = evaluateCues(p, PRACTICE_CUES, start + s * 1000, { name: 'X', point: 'P' });
      for (const f of fired) timeline.push([f.id, Math.floor(s)]);
      p = { ...p, firedCueIds: [...p.firedCueIds, ...fired.map((f) => f.id)] };
    }
    const mk = (d, estimatedMinutes, exerciseConfig) => ({ day: 1, title: '', description: '', learningGoals: [], techniqueIds: ['a'], reviewTechniqueIds: [], difficulty: null, estimatedMinutes, exerciseConfig });
    const tech = { id: 'a', name: 'A', martialArt: 'bjj', category: '', positions: [], aliases: [], tags: [], principles: [], variations: [], counters: [], defenses: [], transitions: [], relatedTechniques: [], relatedMartialArts: [], description: '', purpose: null, koreanName: null, difficulty: null, youtubeSearchQuery: null, videos: [] };
    return {
      timeline,
      timeCfg: practiceSecondsFor(mk(1, 30, { a: { mode: 'time', sets: 3, targetReps: null, targetSeconds: 60, restSeconds: 30 } }), tech, 1),
      fromDay: practiceSecondsFor(mk(1, 10, undefined), tech, 2),
      clampHigh: practiceSecondsFor(mk(1, 120, undefined), tech, 1),
      clampLow: practiceSecondsFor(mk(1, 1, undefined), tech, 4),
      limits: [COACH_DAY_CONFIG.minPracticeSeconds, COACH_DAY_CONFIG.maxPracticeSeconds],
      ready: ['준비됐어', '준비됐어.', '준비 됐어요!', '시작', '시작해', '불러줘', 'ready'].map(isReadyIntent),
      notReady: ['시작 자세가 뭐야?', '손은 어디에 둬?', '이 기술은 언제 사용해?', '준비 운동은 어떻게 해?'].map(isReadyIntent),
    };
  });
  check('[C14] 180초 실습 타임라인: 60초·90초(포인트)·120초·170초·180초에 각 1번씩만 알림', JSON.stringify(pure.timeline) === JSON.stringify([['elapsed_60', 60], ['reminder_mid', 90], ['elapsed_120', 120], ['remaining_10', 170], ['end', 180]]), pure.timeline);
  check('[C15] 실습 시간은 설정에서: 시간형 운동 설정(3세트×60초=180) / Day 예상시간 분배 / 최소·최대 제한', pure.timeCfg === 180 && pure.fromDay === 180 && pure.clampHigh === pure.limits[1] && pure.clampLow === pure.limits[0], pure);
  check('[C16] "준비됐어/시작/불러줘" 인식, 일반 질문은 실습 시작으로 오인하지 않음', pure.ready.every(Boolean) && pure.notReady.every((x) => !x), { ready: pure.ready, notReady: pure.notReady });

  // ---------- Voice fallback: mic permission denied ----------
  await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).clearCoachDayRun());
  await goto(page, '#/learning/bjj/official__bjj/coach/6?mode=voice&place=home');
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    window.speechSynthesis.speak = () => {};
  });
  await waitStep(page, 'lesson');
  await page.locator('[data-testid="coach-mic"]').click();
  await sleep(500);
  const denied = await page.textContent('[data-testid="coach-voice-error"]').catch(() => '');
  const textStillThere = (await page.locator('[data-testid="coach-text-input"]').count()) === 1;
  check('[C17] 마이크 권한 거부 시 안내 + 입력 대화로 계속 가능', denied.includes('마이크 권한') && textStillThere, denied);
  check('[C18] 텍스트 모드 흐름 동안 페이지 에러 없음', errors.length === 0, errors);
  await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).clearCoachDayRun());
  await app.close();

  // ================= Launch 2: real voice path =================
  // Electron's fake capture device doesn't deliver file audio (verified:
  // silent, peak 0), so ONLY the OS microphone is substituted: a real
  // recorded Korean question is played through Web Audio into the stream
  // getUserMedia returns. Everything after that — MediaRecorder, decode,
  // resample, WAV encode, Gemini transcription, coach answer, TTS — is the
  // real app code path.
  ({ app, page, errors } = await launch());
  const questionB64 = fs.readFileSync(path.join(APP_DIR, '.devtools/fixtures-voice-question.wav')).toString('base64');
  await page.evaluate((b64) => {
    window.__spoken = [];
    const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); orig(u); };
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext();
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const buf = await ctx.decodeAudioData(bytes.buffer);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const dest = ctx.createMediaStreamDestination();
      src.connect(dest);
      src.start();
      return dest.stream;
    };
  }, questionB64);
  await goto(page, '#/learning/bjj/official__bjj/coach/6?mode=voice&place=home');
  await waitStep(page, 'lesson');
  await sleep(500);
  const spoken1 = await page.evaluate(() => window.__spoken.slice());
  const explain6 = await page.evaluate(() => document.querySelector('[data-testid="coach-chat"] [data-kind="explain"]')?.textContent ?? '');
  check('[V1] 음성 모드: 코치 설명을 음성(TTS)으로 읽어줌', spoken1.some((s) => s === explain6) && spoken1.length >= 1, { spokenCount: spoken1.length });
  await page.locator('[data-testid="coach-mic"]').click();
  await sleep(4500);
  await page.locator('[data-testid="coach-mic"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="coach-chat"] .ai-msg--user').length >= 1 || !!document.querySelector('[data-testid="coach-voice-error"]'), null, { timeout: 60000 });
  const userMsg = await page.evaluate(() => [...document.querySelectorAll('[data-testid="coach-chat"] .ai-msg--user')].map((e) => e.textContent));
  const vErr = await page.textContent('[data-testid="coach-voice-error"]').catch(() => null);
  check('[V2] 마이크로 말한 질문을 실제로 알아들음 (녹음 → WAV → 받아쓰기)', userMsg.some((t) => t.includes('언제')), { userMsg, vErr });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="coach-chat"] [data-kind="answer"]').length >= 1, null, { timeout: 90000 });
  const answer = await page.evaluate(() => [...document.querySelectorAll('[data-testid="coach-chat"] [data-kind="answer"]')].pop()?.textContent ?? '');
  await sleep(300);
  const spoken2 = await page.evaluate(() => window.__spoken.slice());
  // Long lines are spoken in sentence chunks (tts.ts splits at ≤160 chars) — compare the spoken text joined.
  const flat = (x) => x.replace(/\s+/g, '');
  check('[V3] 음성 질문에 코치가 답하고 그 답을 음성으로 읽어줌', answer.length > 5 && flat(spoken2.join('')).includes(flat(answer)), { len: answer.length, answer: answer.slice(0, 160) });
  const readyVoice = await page.evaluate(async (b64) => {
    const { transcribeWav } = await import('/src/lib/voice/stt.ts');
    const { isReadyIntent } = await import('/src/lib/aiCoachDay/service.ts');
    const r = await transcribeWav(b64);
    return { r, ready: r.ok ? isReadyIntent(r.text) : false };
  }, fs.readFileSync(path.join(APP_DIR, '.devtools/fixtures-voice-ready.wav')).toString('base64'));
  check('[V4] 음성 "준비됐어" → 받아쓰기 후 실습 시작 의도로 인식', readyVoice.ready, readyVoice);
  check('[V5] 음성 모드 흐름 동안 페이지 에러 없음', errors.length === 0, errors);
  await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).clearCoachDayRun());
  await app.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} PASSED ===`);
  for (const f of failed) console.log(' - ' + f.name);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error('DRIVER FAILED:', e); process.exit(1); });
