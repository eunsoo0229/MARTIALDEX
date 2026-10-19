// AI 튜터 수업 — the whole lesson as a user goes through it, in the real
// Electron app with real Gemini, real YouTube search + verification, the
// app's real recording → WAV → transcription path, and the real Visualizing
// Mitt engine. Uses the reported lesson: 동적 스트레칭 콤보 (World's Greatest
// Stretch) → Jab → Cross, at home, voice mode. speechSynthesis.speak is
// wrapped to RECORD each utterance (text/rate) so the spoken output and its
// timing can be checked.
// Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const results = [];
const skipped = [];
function skip(name, why) {
  skipped.push(name);
  console.log(`SKIP — ${name} :: ${why}`);
}
function check(name, pass, detail = '') {
  results.push({ name, pass });
  const d = typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (d ? ' :: ' + d.slice(0, 700) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-tutor-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env, timeout: 120000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.waitForLoadState('load');
  await page.evaluate(() => localStorage.setItem('martialdex:coach-kind-pref', JSON.stringify({ last: 'gemini', remember: true }))); // 이 QA는 기존 Gemini 코치를 검증 — 수업 전 코치 선택(2026-10-19) 이후 Gemini를 명시적으로 선택
  await sleep(1000);
  const question = fs.readFileSync(path.join(APP_DIR, '.devtools/fixtures-voice-question.wav')).toString('base64');
  await page.evaluate(() => {
    window.__spoken = [];
    window.speechSynthesis.speak = (u) => window.__spoken.push({ text: u.text, rate: u.rate, at: Date.now() });
  });
  const step = () => page.evaluate(() => document.querySelector('[data-testid="coach-step"]')?.dataset.step);
  const waitStep = (s, timeout = 90000) => page.waitForFunction((s) => document.querySelector('[data-testid="coach-step"]')?.dataset.step === s, s, { timeout });
  // 1:1 수업: each technique opens with a short explanation + question; "준비됐어" jumps to the video.
  const toVideos = async (timeout = 120000) => {
    await page.waitForFunction(() => ['lesson', 'videos'].includes(document.querySelector('[data-testid="coach-step"]')?.dataset.step), null, { timeout });
    if ((await step()) === 'lesson') {
      await page.locator('[data-testid="coach-text-input"]').fill('준비됐어');
      await page.keyboard.press('Enter');
    }
    await waitStep('videos', 30000);
  };
  // After practice the coach asks one question (수행 후 질문); skip it, and the end-of-day recap.
  const skipReview = async () => {
    await page.waitForFunction(() => ['review', 'mitt', 'recap', 'summary', 'explain', 'lesson'].includes(document.querySelector('[data-testid="coach-step"]')?.dataset.step), null, { timeout: 20000 });
    if ((await step()) === 'review') await page.locator('[data-testid="coach-quick-skip"]').click();
    await sleep(300);
  };
  const coachLines = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="coach-chat"] .ai-msg--model')].map((m) => ({ kind: m.dataset.kind, text: m.textContent })));

  // ---- the lesson: WGS (warm-up) → Jab → Cross ----
  const cid = await page.evaluate(async () => {
    const cs = await import('/src/lib/curriculum/curriculumService.ts');
    const now = new Date().toISOString();
    const c = cs.saveCustomCurriculum({
      id: 'qa-tutor-lesson', martialArt: 'boxing', title: 'QA 튜터 수업', description: '', source: 'custom', visibility: 'private', authorName: 'QA', totalDays: 1, estimatedWeeks: 1, phases: [], techniqueCount: 0, createdAt: now, updatedAt: now,
      days: [{ day: 1, title: '워밍업과 원투', description: '', learningGoals: [], techniqueIds: ['home-training__worlds-greatest-stretch', 'boxing__jab', 'boxing__cross'], reviewTechniqueIds: [], difficulty: null, estimatedMinutes: 15, exerciseConfig: {
        'home-training__worlds-greatest-stretch': { mode: 'time', sets: 1, targetReps: null, targetSeconds: 60, restSeconds: 0 },
        'boxing__jab': { mode: 'time', sets: 1, targetReps: null, targetSeconds: 60, restSeconds: 0 },
        'boxing__cross': { mode: 'time', sets: 1, targetReps: null, targetSeconds: 60, restSeconds: 0 },
      } }],
    });
    localStorage.setItem('martialdex:ai-tutor-voice-settings', JSON.stringify({ aiTutorVoice: null, aiTutorSpeechRate: 1 }));
    return c.id;
  });
  await page.evaluate((h) => { window.location.hash = h; }, `#/learning/boxing/${cid}/coach/1?mode=voice&place=home`);
  await waitStep('lesson');
  let lines = await coachLines();
  check('[T1b] 수업은 짧은 설명 → 질문으로 시작 (자세 데이터를 한 번에 낭독하지 않음)', lines.at(-1)?.kind === 'quiz' && !lines.some((l) => /^자세를 안내하겠습니다/.test(l.text)), lines.slice(-2));
  await toVideos();
  lines = await coachLines();
  check('[T1] 수업 시작: 장소 안내 → 오늘 구성 → 기술 소개(DB 이름)', /집에서 운동하겠습니다/.test(lines[0]?.text) && lines.some((l) => /오늘은 3개 기술을 함께 연습하겠습니다\. 이번 기술은 동적 스트레칭 콤보\(World's Greatest Stretch\)입니다/.test(l.text)), lines.slice(0, 2));
  check('[T2] 자세 설명: 자세 데이터(시작 자세·핵심)를 나눠서 가르치고 자세 카드 표시', (await page.locator('[data-testid="coach-posture"]').count()) === 1, lines.filter((l) => l.kind === 'explain').map((l) => l.text.slice(0, 80)));
  check('[T3] 영상이 없다고 바로 끝내지 않음: "찾고 확인하겠습니다"', lines.some((l) => /관련 영상을 찾고 내용이 이 기술과 맞는지 확인하겠습니다/.test(l.text)) && !lines.some((l) => /아직 등록된 영상이 없어요/.test(l.text)));
  // video search + verification (real)
  await page.waitForFunction(() => document.querySelector('[data-testid="coach-videos"]')?.dataset.videoStatus === 'done', null, { timeout: 180000 });
  const video = await page.evaluate(() => ({ player: document.querySelector('[data-testid="coach-video-player"]')?.dataset.videoId ?? null, iframe: document.querySelector('[data-testid="coach-video-player"] iframe')?.getAttribute('src') ?? null, none: !!document.querySelector('[data-testid="coach-video-none"]'), title: document.querySelector('[data-testid="coach-video-player"] .video-embed__title')?.textContent ?? null, verified: document.querySelector('[data-testid="coach-video-chip"]')?.dataset.source ?? null }));
  lines = await coachLines();
  console.log('   영상 검색 결과:', JSON.stringify(video), '|', lines.at(-1)?.text);
  check('[T4] 관련 영상 검색 → 내용 검증(실제 메타데이터+AI)을 통과한 영상을 플레이어로 표시, 실패 시에만 "찾지 못했습니다"', (video.player && video.iframe?.includes(video.player) && video.verified === 'verified') || (video.none && lines.some((l) => /현재 등록된 관련 영상을 찾지 못했습니다\(후보 \d+개를 확인/.test(l.text))), video);
  check('[T5] 영상에서 확인할 점(핵심 포인트) 안내', (await page.locator('[data-testid="coach-videos"]').textContent()).includes('영상에서 확인할 점'));
  // "준비됐어" while the video is up → the question first (never straight to practice)
  await page.locator('[data-testid="coach-text-input"]').fill('준비됐어');
  await page.keyboard.press('Enter');
  await waitStep('quiz', 10000);
  check('[T6] 영상 단계에서 "준비됐어" → 바로 실습이 아니라 이해 확인 질문', (await step()) === 'quiz');
  const q = (await coachLines()).filter((l) => l.kind === 'quiz').at(-1)?.text ?? '';
  check('[T7] 동작에 맞는 실습 전 확인 질문 (드릴 → 어떤 동작인지/핵심)', /(어떤 동작인지|핵심 포인트|중요할까요|맞는 것은)/.test(q), q);
  await sleep(4000);
  check('[T8] 답하기 전에는 다음 단계·타이머로 넘어가지 않음 (4초 대기 후에도 질문 상태)', (await step()) === 'quiz' && (await page.locator('[data-testid="coach-timer"]').count()) === 0);
  // The macOS audio clock must actually run for any recording test to mean anything.
  const audioOk = await page.evaluate(async () => {
    const c = new AudioContext();
    await Promise.race([c.resume(), new Promise((r) => setTimeout(r, 2000))]);
    const t0 = c.currentTime;
    await new Promise((r) => setTimeout(r, 600));
    const ok = c.currentTime - t0 > 0.3;
    void c.close();
    return ok;
  });
  if (!audioOk) {
    skip('[T9] 음성 답변 → 받아쓰기 → 채점', '이 Mac의 오디오 시스템(coreaudiod)이 멈춰 있어 오디오 시계가 진행되지 않음 — 녹음 자체가 불가능한 환경이라 실행하지 않음');
    await page.locator('[data-testid="coach-text-input"]').fill('킥이나 레벨 체인지 전에 고관절과 햄스트링, 몸 전체를 풀기 위한 동적 스트레칭입니다.');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => ['ready', 'quiz'].includes(document.querySelector('[data-testid="coach-step"]')?.dataset.step) && !document.querySelector('.ai-msg__bubble--loading'), null, { timeout: 90000 });
    await sleep(500);
    const fbText = (await coachLines()).filter((l) => l.kind === 'feedback').at(-1)?.text ?? '';
    check('[T9b] 텍스트 답변 → 의미 기반 판단 → 코치 피드백', fbText.length > 3, fbText);
    if ((await step()) === 'quiz') await page.locator('[data-testid="coach-quick-skip"]').click();
    await waitStep('ready', 10000);
  } else {
  // voice answer through the real recording → WAV → transcription path
  await page.evaluate((b64) => {
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
  }, question);
  await page.locator('[data-testid="coach-mic"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="coach-mic-phase"]')?.dataset.phase === 'listening', null, { timeout: 10000 });
  const phaseListening = await page.locator('[data-testid="coach-mic-phase"]').textContent();
  await sleep(2600);
  await page.locator('[data-testid="coach-mic"]').click();
  try {
    await page.waitForFunction(() => document.querySelectorAll('.ai-msg--user').length > 0 && !document.querySelector('.ai-msg__bubble--loading') && ['ready', 'quiz'].includes(document.querySelector('[data-testid="coach-step"]')?.dataset.step) && document.querySelector('.ai-msg:last-child')?.classList.contains('ai-msg--model'), null, { timeout: 90000 });
  } catch (e) {
    console.log('T9 DEBUG', JSON.stringify(await page.evaluate(() => ({ step: document.querySelector('[data-testid="coach-step"]')?.dataset.step, phase: document.querySelector('[data-testid="coach-mic-phase"]')?.dataset.phase, err: document.querySelector('[data-testid="coach-voice-error"]')?.textContent, users: [...document.querySelectorAll('.ai-msg--user')].map((m) => m.textContent), last: [...document.querySelectorAll('.ai-msg--model')].slice(-2).map((m) => m.textContent) }))));
    throw e;
  }
  lines = await coachLines();
  const userMsgs = await page.evaluate(() => [...document.querySelectorAll('[data-testid="coach-chat"] .ai-msg--user')].map((m) => m.textContent));
  const fb = lines.filter((l) => l.kind === 'feedback').at(-1)?.text ?? '';
  const lastCoach = lines.at(-1)?.text ?? '';
  check('[T9] 음성 답변: 듣는 중 표시 → 받아쓰기 결과가 수업 엔진으로 들어가 코치가 응답', /듣고 있습니다/.test(phaseListening) && userMsgs.some((t) => /언제/.test(t)) && (fb.length > 3 || lines.some((l) => l.kind === 'answer')), { userMsgs, fb, lastCoach });
  if ((await step()) === 'quiz') await page.locator('[data-testid="coach-quick-skip"]').click();
  await waitStep('ready', 10000);
  }
  // meaning-based grading on the three example answers
  const grades = await page.evaluate(async () => {
    const svc = await import('/src/lib/aiCoachDay/service.ts');
    const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
    const t = resolveTechnique('home-training__worlds-greatest-stretch');
    const q = svc.quizQuestionFor(t);
    const a = await svc.gradeQuizAnswer(t, q, '킥이나 레벨 체인지 전에 몸을 풀기 위해 사용합니다.');
    const b = await svc.gradeQuizAnswer(t, q, '햄스트링과 고관절을 움직여 줍니다.');
    const c = await svc.gradeQuizAnswer(t, q, '상대를 넘어뜨리는 기술입니다.');
    return [a, b, c].map((g) => ({ verdict: g.verdict, method: g.method, fb: g.feedback.slice(0, 80) }));
  });
  check('[T10] 의미 기반 채점: 정답 / (부분)정답 / 오답 구분', grades[0].verdict === 'correct' && ['partial', 'correct'].includes(grades[1].verdict) && grades[2].verdict === 'incorrect' && grades.every((g) => g.method === 'ai'), grades);
  // practice WGS briefly
  await page.locator('[data-testid="coach-ready"] button').click();
  await page.locator('[data-testid="coach-posture-start"]').click(); // 자세 설명 → 실습 시작
  await page.locator('[data-testid="coach-timer"]').waitFor();
  await sleep(1200);
  await page.locator('button', { hasText: '여기서 끝내기' }).click();
  await skipReview();
  // Jab, then Cross — skip their questions quickly
  for (const name of ['Jab', 'Cross']) {
    await toVideos();
    await page.waitForFunction(() => document.querySelector('[data-testid="coach-videos"]')?.dataset.videoStatus === 'done', null, { timeout: 180000 });
    await page.locator('[data-testid="coach-videos"] button', { hasText: '질문 건너뛰기' }).click();
    await waitStep('ready', 10000);
    await page.locator('[data-testid="coach-ready"] button').click();
    await page.locator('[data-testid="coach-posture-start"]').click(); // 자세 설명 → 실습 시작
    // a striking technique is practised on the Visualizing Mitt (not "N분 동안 반복" with a timer)
    await page.locator('[data-testid="coach-mitt"] [data-testid="mitt-runner"]').waitFor({ timeout: 15000 });
    const asPractice = await page.evaluate(async () => !!(await import('/src/lib/aiCoachDay/sessionStore.ts')).getCoachDayRun()?.mittPlan?.asPractice);
    check(`[T10b] ${name} 실습 = Visualizing Mitt (타이머 대신)`, asPractice && (await page.locator('[data-testid="coach-timer"]').count()) === 0);
    await sleep(1500);
    await page.locator('[data-testid="mitt-runner-stop"]').click();
    await skipReview();
    console.log('   practised', name);
  }
  // after Jab + Cross the tutor connects them on the Visualizing Mitt
  await waitStep('mitt', 20000);
  lines = await coachLines();
  const offer = lines.find((l) => /방금 배운 기술을 연결해서 연습해 보겠습니다/.test(l.text))?.text ?? '';
  const reps = Number(offer.match(/(\d+)회 반복하겠습니다/)?.[1]);
  check('[T11] AI 튜터가 수업 중 Visualizing Mitt 호출: "방금 배운 기술을 연결 … N회 반복하겠습니다" (반복 횟수는 튜터가 결정)', /Jab → Cross/.test(offer) && reps >= 3 && reps <= 10, offer);
  const runner = () => page.evaluate(() => { const r = document.querySelector('[data-testid="mitt-runner"]'); return { rep: Number(r?.dataset.rep), step: Number(r?.dataset.step), done: r?.dataset.done, repText: document.querySelector('[data-testid="mitt-runner-rep"]')?.textContent, combo: document.querySelector('[data-testid="mitt-runner-combo"]')?.textContent }; });
  await page.locator('[data-testid="mitt-runner-speed-fast"]').click();
  const spokenBefore = (await page.evaluate(() => window.__spoken)).length;
  const t0 = Date.now();
  const seenReps = new Set();
  const stepTimes = [];
  let lastStep = 0;
  for (;;) {
    const r = await runner();
    // the runner unmounts as soon as the drill ends and the lesson resumes
    if (r.done === 'true' || !Number.isFinite(r.step)) break;
    seenReps.add(r.rep);
    if (r.step !== lastStep) {
      stepTimes.push(Date.now());
      lastStep = r.step;
    }
    if (Date.now() - t0 > 90000) break;
    await sleep(40);
  }
  const elapsed = Date.now() - t0;
  const spokenDuring = (await page.evaluate(() => window.__spoken)).slice(spokenBefore).filter((s) => s.at <= t0 + elapsed);
  // step changes within one rep only (the jump back to step 1 includes the rep pause)
  const gaps = stepTimes.slice(1).map((t, i) => t - stepTimes[i]).filter((g) => g < 1500);
  check('[T12] 반복이 자동 진행 1/N → N/N (사용자가 매번 누르지 않음)', [...seenReps].includes(1) && [...seenReps].includes(reps) && elapsed < 85000, { reps: [...seenReps], elapsed });
  check('[T13] 콤보 속도: 동작 간격이 짧음 (빠르게: 동작 전환 평균 < 0.7초)', gaps.length >= 2 && gaps.reduce((a, b) => a + b, 0) / gaps.length < 700, { avgMs: Math.round(gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length)), elapsed });
  // Allowed while the combo runs: the one short "last rep" cue, and the end-of-drill
  // feedback/resume line spoken the moment it finishes. Never a per-technique call-out.
  const allowedDuring = (t) => /^마지막 1회입니다\.$/.test(t) || /회 모두 반복했습니다|반복했습니다\.|오늘 학습을 모두 마쳤습니다|오늘 배운 걸 마지막으로/.test(t);
  check('[T14] 콤보 수행 중 기술마다 TTS 없음 (마지막 1회 짧은 안내 + 종료 피드백만)', spokenDuring.every((s) => allowedDuring(s.text)) && !spokenDuring.some((s) => /^(Jab|Cross|잽|크로스)\.?$/.test(s.text)), spokenDuring.map((s) => s.text));
  await page.waitForFunction(() => ['recap', 'summary'].includes(document.querySelector('[data-testid="coach-step"]')?.dataset.step), null, { timeout: 30000 });
  if ((await step()) === 'recap') await page.locator('[data-testid="coach-quick-skip"]').click();
  await waitStep('summary', 30000);
  lines = await coachLines();
  check('[T15] 콤보 종료 후 튜터 피드백 → 수업 복귀 → 다음 단계(수업 요약)', lines.some((l) => /좋습니다\. Jab → Cross를 \d+회 모두 반복했습니다/.test(l.text)) && (await step()) === 'summary');
  const hist = await page.evaluate(async () => (await import('/src/lib/trainingHistory/service.ts')).listTrainingHistory()[0]);
  check('[T16] 수업 기록에 Visualizing Mitt 수행 결과 연동 — 실습 미트(Jab·Cross) + 연결 콤보 (사용자 수행 기록, 측정 아님)', /Visualizing Mitt .*Jab → Cross \d+\/\d+회.* \(사용자 수행 기록, 동작 측정 아님\)/.test(hist?.notes ?? '') && /(Jab|잽) \d+\/\d+회/.test(hist?.notes ?? ''), hist?.notes);

  // ---- natural-language request → AI setup → Mitt → back to the lesson ----
  await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).clearCoachDayRun());
  await page.evaluate((h) => { window.location.hash = '#/'; setTimeout(() => (window.location.hash = h), 200); }, `#/learning/boxing/${cid}/coach/1?mode=text&place=home`);
  await toVideos();
  await page.waitForFunction(() => document.querySelector('[data-testid="coach-videos"]')?.dataset.videoStatus === 'done', null, { timeout: 180000 });
  await page.locator('[data-testid="coach-videos"] button', { hasText: '질문 건너뛰기' }).click();
  await waitStep('ready', 10000);
  await page.locator('[data-testid="coach-text-input"]').fill('잽으로 상대 가드를 열고 바디 공격으로 연결하는 콤보를 만들어줘');
  await page.keyboard.press('Enter');
  await waitStep('mitt', 120000);
  const ai = await page.evaluate(async () => {
    const r = (await import('/src/lib/aiCoachDay/sessionStore.ts')).getCoachDayRun();
    const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
    const a = await import('/src/lib/visualMitt/archetypes.ts');
    return { plan: r.mittPlan, real: r.mittPlan.techniqueIds.every((id) => resolveTechnique(id) && a.motionForTechnique(resolveTechnique(id))) };
  });
  check('[T17] "잽으로 가드를 열고 바디로 연결하는 콤보" → 실제 DB 기술로 콤보 생성, 반복 횟수 AI 결정, Mitt 실행', ai.real && ai.plan.techniqueIds.length >= 2 && ai.plan.repetitions >= 3 && ai.plan.repetitions <= 10 && (await page.locator('[data-testid="mitt-runner"]').count()) === 1, ai.plan);
  await page.locator('[data-testid="mitt-runner-speed-fast"]').click();
  await page.locator('[data-testid="mitt-runner-stop"]').click();
  await waitStep('ready', 10000);
  check('[T18] Mitt 종료 → 원래 수업 단계(준비)로 복귀', (await step()) === 'ready' && (await coachLines()).some((l) => /수업으로 돌아가겠습니다/.test(l.text)));
  await page.locator('[data-testid="coach-text-input"]').fill('상대가 앞으로 들어올 때 대응하는 셋업을 만들어줘');
  await page.keyboard.press('Enter');
  await waitStep('mitt', 120000);
  const setup = await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).getCoachDayRun().mittPlan);
  check('[T19] "앞으로 들어올 때 대응하는 셋업" → Setup 분류 + 상대 반응/목적 포함', setup.type === 'setup' && setup.stepNotes.some((n) => n.opponentReaction) && !!setup.purpose, setup);
  await page.locator('[data-testid="mitt-runner-stop"]').click();
  await waitStep('ready', 10000);

  // ---- 존댓말: every coach line of the whole lesson ----
  const allCoach = await page.evaluate(async () => {
    const ps = await import('/src/lib/aiCoachDay/politeSpeech.ts');
    const r = (await import('/src/lib/aiCoachDay/sessionStore.ts')).getCoachDayRun();
    return r.messages.filter((m) => m.role === 'coach').map((m) => ({ text: m.text, bad: ps.informalEndings(m.text) })).filter((x) => x.bad.length);
  });
  const spokenAll = await page.evaluate(async () => {
    const ps = await import('/src/lib/aiCoachDay/politeSpeech.ts');
    return window.__spoken.map((s) => ({ text: s.text.slice(0, 60), bad: ps.informalEndings(s.text) })).filter((x) => x.bad.length);
  });
  check('[T20] 존댓말 일관: 텍스트·음성 모든 코치 문장에 반말/해요체 혼용 없음', allCoach.length === 0 && spokenAll.length === 0, { text: allCoach.slice(0, 4), spoken: spokenAll.slice(0, 4) });

  // ---- TTS speech rate actually applied (0.75 / 1.0 / 1.25 / 1.5) ----
  const rates = await page.evaluate(async () => {
    const tts = await import('/src/lib/voice/tts.ts');
    const out = [];
    for (const r of [0.75, 1, 1.25, 1.5]) {
      localStorage.setItem('martialdex:ai-tutor-voice-settings', JSON.stringify({ aiTutorVoice: null, aiTutorSpeechRate: r }));
      window.__spoken = [];
      tts.speak('속도 확인입니다.');
      out.push(window.__spoken[0]?.rate);
    }
    return out;
  });
  check('[T21] 말하기 속도 0.75x/1.0x/1.25x/1.5x가 실제 TTS 재생에 적용', JSON.stringify(rates) === JSON.stringify([0.75, 1, 1.25, 1.5]), rates);

  // ---- STT error states are specific ----
  const sttErrors = !audioOk ? null : await page.evaluate(async () => {
    const stt = await import('/src/lib/voice/stt.ts');
    const make = (amp) => async () => {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g);
      const dest = ctx.createMediaStreamDestination();
      g.connect(dest);
      osc.start();
      return dest.stream;
    };
    const run = async (gum) => {
      navigator.mediaDevices.getUserMedia = gum;
      const s = await stt.startRecording(5);
      if (!s.ok) return s.code;
      await new Promise((r) => setTimeout(r, 1200));
      const r = await s.recorder.stop();
      return r.ok ? 'OK' : r.code;
    };
    return {
      silent: await run(make(0)),
      quiet: await run(make(0.001)),
      denied: await run(() => Promise.reject(new DOMException('x', 'NotAllowedError'))),
    };
  });
  if (sttErrors) check('[T22] 음성 오류 구분: 완전 무음(장치/권한) / 너무 작은 소리 / 권한 거부가 각각 다른 안내', sttErrors.silent === 'MIC_SILENT' && sttErrors.quiet === 'NO_SPEECH' && sttErrors.denied === 'PERMISSION_DENIED', sttErrors);
  else skip('[T22] 음성 오류 구분', '오디오 시스템 정지로 실행 불가 (위와 같음)');

  check('[Z] 페이지 에러 없음', errors.length === 0, errors);
  await Promise.race([app.close(), sleep(8000)]);
  const passed = results.filter((x) => x.pass).length;
  console.log(`=== SUMMARY: ${passed}/${results.length} PASSED${skipped.length ? `, ${skipped.length} SKIPPED (환경)` : ''} ===`);
  if (passed !== results.length) console.log('FAILURES:', results.filter((x) => !x.pass).map((x) => x.name));
  process.exit(passed === results.length ? 0 : 1);
}
main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
