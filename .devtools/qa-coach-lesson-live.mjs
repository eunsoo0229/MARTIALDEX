// AI 코치 1:1 수업 — live end-to-end in the real Electron app with real
// Gemini grading/answers. Text mode walks a whole Armbar lesson (question
// first, correct answer, "모르겠어요" → easier 선택형, wrong answer → no
// advance + new explanation, "준비됐어", video, pre-practice check,
// practice, post-practice question, scenario, recap, learning record).
// Voice mode checks: STT transcript → same lesson engine → TTS.
// Requires the Vite dev server on :5173.
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
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (d ? ' :: ' + d.slice(0, 600) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-lesson-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env, timeout: 60000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.waitForLoadState('load');
  await sleep(1000);
  return { app, page, errors };
}

const lessonOf = (page) =>
  page.evaluate(() => {
    const r = JSON.parse(localStorage.getItem('martialdex:ai-coach-day-run') ?? 'null');
    if (!r) return null;
    const id = r.techniqueIds[r.index];
    return { step: r.step, lesson: r.lessons?.[id] ?? null, outcomes: r.outcomes, recap: r.recap ?? null };
  });
const stepOf = (page) => page.evaluate(() => document.querySelector('[data-testid="coach-step"]')?.dataset.step ?? null);
const waitStep = (page, s, timeout = 90000) => page.waitForFunction((s) => document.querySelector('[data-testid="coach-step"]')?.dataset.step === s, s, { timeout });
const coachLines = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="coach-chat"] .ai-msg--model')].map((m) => ({ kind: m.dataset.kind, text: m.textContent })));
const msgCount = (page) => page.evaluate(() => document.querySelectorAll('[data-testid="coach-chat"] .ai-msg').length);
async function send(page, text) {
  await page.fill('[data-testid="coach-text-input"]', text);
  await page.locator('[data-testid="coach-input"] button', { hasText: '보내기' }).click();
}
/** Waits until the coach replied to the last student line (busy dots gone and a coach line after it). */
async function waitReply(page, before, timeout = 90000) {
  await page.waitForFunction(
    (n) => {
      const all = [...document.querySelectorAll('[data-testid="coach-chat"] .ai-msg')];
      const busy = !!document.querySelector('.ai-msg__bubble--loading');
      return !busy && all.length > n + 1 && all.at(-1).classList.contains('ai-msg--model');
    },
    before,
    { timeout }
  );
  await sleep(400);
}
async function answer(page, text) {
  const before = await msgCount(page);
  await send(page, text);
  await waitReply(page, before);
  const lines = await coachLines(page);
  return lines.slice(-4);
}

async function seed(page) {
  return page.evaluate(async () => {
    const cs = await import('/src/lib/curriculum/curriculumService.ts');
    const now = new Date().toISOString();
    localStorage.removeItem('martialdex:coach-lesson-records');
    cs.saveCustomCurriculum({
      id: 'qa-coach-lesson', martialArt: 'bjj', title: 'QA 1:1 수업', description: '', source: 'custom', visibility: 'private', authorName: 'QA', totalDays: 1, estimatedWeeks: 1, phases: [], techniqueCount: 1, createdAt: now, updatedAt: now,
      days: [{ day: 1, title: '암바', description: '', learningGoals: [], techniqueIds: ['bjj__armbar'], reviewTechniqueIds: [], difficulty: null, estimatedMinutes: 10, exerciseConfig: { 'bjj__armbar': { mode: 'time', sets: 1, targetReps: null, targetSeconds: 60, restSeconds: 0 } } }],
    });
    return 'qa-coach-lesson';
  });
}

async function main() {
  // ===================== TEXT MODE =====================
  let { app, page, errors } = await launch();
  await seed(page);
  await page.evaluate(() => { window.location.hash = '#/learning/bjj/qa-coach-lesson/coach/1?mode=text&place=gym'; });
  await waitStep(page, 'lesson', 30000);
  await sleep(500);
  let lines = await coachLines(page);
  const longest = Math.max(...lines.map((l) => l.text.length));
  check('[T1] 수업 시작: 짧은 설명 후 바로 질문 (긴 독백 없음)', lines.at(-1).kind === 'quiz' && longest < 220 && lines.length <= 4, { n: lines.length, longest, lines });
  check('[T2] 진행 패널 + "답변 차례" 표시', (await page.locator('[data-testid="coach-lesson-progress"]').count()) === 1 && (await page.locator('[data-testid="coach-awaiting"]').count()) === 1);
  const firstQ = (await lessonOf(page)).lesson.pending.text;
  await sleep(4000);
  check('[T3] 답하지 않으면 다음 단계로 자동 진행하지 않음', (await stepOf(page)) === 'lesson' && (await lessonOf(page)).lesson.pending.text === firstQ);

  // Case 4/5: student question first, then back
  lines = await answer(page, '근데 상대가 팔을 굽혀서 버티면 어떻게 해요?');
  let st = await lessonOf(page);
  check('[Case4] 학생 질문에 먼저 답변 (질문 기록됨)', lines.some((l) => l.kind === 'answer' && l.text.length > 10) && st.lesson.studentQuestions.length === 1, lines);
  check('[Case5] 답변 후 원래 질문으로 복귀', st.lesson.pending?.text === firstQ && lines.at(-1).text.includes(firstQ), lines.at(-1));

  // Correct answer, graded by meaning by real Gemini
  lines = await answer(page, '클로즈드 가드에서 상대 팔을 다리 사이에 가두고 엉덩이를 들어서 팔꿈치를 펴서 꺾는 관절기예요');
  st = await lessonOf(page);
  check('[Case1] 의미가 맞는 답 → 이해로 판단, 다음 개념으로', st.lesson.understanding.concepts.purpose.status === 'understood' && st.lesson.conceptIndex >= 1, { status: st.lesson.understanding.concepts.purpose, lines });

  // "모르겠어요" → easier
  const qBefore = st.lesson.pending?.text;
  const before = await msgCount(page);
  await page.locator('[data-testid="coach-quick-dont-know"]').click();
  await waitReply(page, before);
  lines = await coachLines(page);
  st = await lessonOf(page);
  check('[Case3] "모르겠어요" → 다독임 + 다른 설명 + 더 쉬운(선택형) 질문', lines.slice(-3).some((l) => l.text.startsWith('괜찮습니다')) && st.lesson.pending?.text !== qBefore && ['choice', 'scenario', 'confirm'].includes(st.lesson.pending?.type), { type: st.lesson.pending?.type, lines: lines.slice(-3) });
  if (st.lesson.pending?.type === 'choice') {
    const n = await page.locator('[data-testid="coach-choice-option"]').count();
    check('[Case3b] 선택형 보기 버튼 표시', n >= 2, n);
    const conceptIdx = st.lesson.conceptIndex;
    const b2 = await msgCount(page);
    await page.locator('[data-testid="coach-choice-option"]').nth(st.lesson.pending.choice.answerIndex).click();
    await waitReply(page, b2);
    st = await lessonOf(page);
    check('[Case3c] 선택형 정답 → API 호출 없이 바로 판단, 다음으로 진행', st.lesson.conceptIndex > conceptIdx || st.step !== 'lesson', st.lesson.conceptIndex);
  } else {
    await answer(page, '다리를 머리 위로 완전히 넘겨서 빠져나갈 공간을 막는 거요');
    st = await lessonOf(page);
  }

  // Wrong answer → no advance, a different explanation
  if (st.step === 'lesson' && st.lesson.pending) {
    const cid = st.lesson.pending.conceptId;
    const explainedBefore = (await coachLines(page)).filter((l) => l.kind === 'explain').map((l) => l.text);
    lines = await answer(page, '그냥 팔을 최대한 세게 당기면 돼요');
    st = await lessonOf(page);
    const newExplain = lines.filter((l) => l.kind === 'explain').map((l) => l.text);
    check('[Case2] 잘못된 답 → 같은 개념 유지, 맞은/틀린 부분 짚고 새로운 방식으로 재설명', st.lesson.pending?.conceptId === cid && st.lesson.understanding.concepts[cid].status !== 'understood' && newExplain.length >= 1 && newExplain.every((t) => !explainedBefore.includes(t)), { lines, status: st.lesson.understanding.concepts[cid] });
    check('[Case2b] 기계적인 "틀렸습니다/아닙니다" 없이 피드백', !lines.some((l) => /^(틀렸|아닙니다|오답)/.test(l.text)), lines.find((l) => l.kind === 'feedback'));
  }

  // "이해했어" → not a free pass
  if (st.step === 'lesson' && st.lesson.pending) {
    const before3 = st.lesson.conceptIndex;
    lines = await answer(page, '이해했어요');
    st = await lessonOf(page);
    check('[Case6] "이해했어요" → 바로 넘어가지 않고 확인 질문', st.lesson.pending && st.lesson.conceptIndex === before3, lines.slice(-2));
  }

  // Jump ahead: 준비됐어 → video
  await answer(page, '준비됐어').catch(() => {});
  await waitStep(page, 'videos', 20000).catch(() => {});
  check('[F1] 설명 중 "준비됐어" → 영상 단계로', (await stepOf(page)) === 'videos', await stepOf(page));
  await page.waitForFunction(() => document.querySelector('[data-testid="coach-videos"]')?.dataset.videoStatus === 'done', null, { timeout: 180000 });
  const b4 = await msgCount(page);
  await page.locator('[data-testid="coach-video-done"]').click();
  await sleep(600);
  st = await lessonOf(page);
  check('[F2] 영상 후 핵심 미확인이면 실습 전 확인 질문 (quiz 단계)', st.step === 'quiz' && st.lesson.pending?.purpose === 'pre_practice', { step: st.step, pending: st.lesson.pending });
  let guard = 0;
  while ((await stepOf(page)) === 'quiz' && guard++ < 6) {
    const p = (await lessonOf(page)).lesson.pending;
    if (p?.choice) {
      const b = await msgCount(page);
      await page.locator('[data-testid="coach-choice-option"]').nth(p.choice.answerIndex).click();
      await waitReply(page, b);
    } else await answer(page, '무릎을 좁게 조여서 팔이 빠지지 않게 하고, 다리를 상대 머리 위로 완전히 넘겨서 탈출 공간을 막아야 합니다');
  }
  check('[F3] 실습 전 확인 통과 → 실습 준비', (await stepOf(page)) === 'ready', await stepOf(page));
  await send(page, '준비됐어');
  await waitStep(page, 'practice', 10000);
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('martialdex:ai-coach-day-run'));
    raw.practice.phaseEndTimestamp = Date.now() + 1500;
    localStorage.setItem('martialdex:ai-coach-day-run', JSON.stringify(raw));
    window.dispatchEvent(new CustomEvent('martialdex:ai-coach-day-updated'));
  });
  await waitStep(page, 'review', 20000);
  st = await lessonOf(page);
  check('[Case11] 수행 후 바로 넘어가지 않고 질문', st.lesson.pending?.purpose === 'practice_review' && (await page.locator('[data-testid="coach-awaiting"]').count()) === 1, st.lesson.pending);
  lines = await answer(page, '다리를 상대 머리 위로 완전히 넘기고 무릎을 조여서 팔이 안 빠지게 한 거요');
  st = await lessonOf(page);
  if (st.step === 'review' && st.lesson.pending?.purpose === 'scenario') {
    check('[Case12] 상황 판단 문제 출제', lines.some((l) => l.text.includes('상황')), lines.at(-1));
    lines = await answer(page, '다리를 머리 위로 완전히 넘겨야 합니다. 그래야 탈출 공간이 안 생겨요');
    check('[Case12b] 상황 답 후 정답·이유·단서 설명', lines.some((l) => /단서/.test(l.text)), lines.slice(-3));
  }
  await waitStep(page, 'recap', 20000).catch(() => {});
  check('[RC1] 수업 종료 전 복습 질문', (await stepOf(page)) === 'recap', await stepOf(page));
  lines = await answer(page, '다리를 머리 위로 완전히 넘기기, 무릎을 조이기');
  await waitStep(page, 'summary', 30000);
  check('[RC2] 복습 답 분석 후 피드백, 요약으로', lines.some((l) => /정확합니다|기억하고 계십니다|정리해 보겠습니다/.test(l.text)), lines.slice(-2));

  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:coach-lesson-records') ?? '{}')['bjj__armbar'] ?? null);
  check('[L1] 학습 기록: 개념별 이해도·질문·복습 필요 저장', rec && rec.concepts.length >= 2 && rec.questions.length >= 1 && Array.isArray(rec.needsReview) && rec.practiced === true, rec);
  const hist = await page.evaluate(async () => (await import('/src/lib/trainingHistory/service.ts')).listTrainingHistory().filter((x) => x.curriculumId === 'qa-coach-lesson'));
  check('[L2] training history 1건 + 이해도 메모', hist.length === 1 && /이해도 확인/.test(hist[0].notes ?? ''), hist[0]?.notes);
  const summary = await page.textContent('[data-testid="coach-summary"]');
  check('[L3] 요약에 기술별 이해도 표시', /이해도:/.test(summary), summary.slice(0, 300));

  const all = await coachLines(page);
  const { informal } = await page.evaluate(async (texts) => {
    const { informalEndings } = await import('/src/lib/aiCoachDay/politeSpeech.ts');
    return { informal: texts.flatMap((t) => informalEndings(t)) };
  }, all.map((l) => l.text));
  check('[S1] 코치 말투 일관(합쇼체)', informal.length === 0, informal);
  check('[S2] 텍스트 모드 동안 페이지 에러 없음', errors.length === 0, errors);
  console.log('\n--- TEXT TRANSCRIPT ---');
  for (const m of await page.evaluate(() => [...document.querySelectorAll('[data-testid="coach-chat"] .ai-msg')].map((m) => `${m.classList.contains('ai-msg--user') ? '학생' : `코치[${m.dataset.kind}]`}: ${m.textContent}`))) console.log(m);
  await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).clearCoachDayRun());
  await app.close();

  // ===================== VOICE MODE =====================
  ({ app, page, errors } = await launch());
  await seed(page);
  const questionB64 = fs.readFileSync(path.join(APP_DIR, '.devtools/fixtures-voice-question.wav')).toString('base64');
  await page.evaluate((b64) => {
    window.__spoken = [];
    window.speechSynthesis.speak = (u) => window.__spoken.push(u.text);
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
  await page.evaluate(() => { window.location.hash = '#/learning/bjj/qa-coach-lesson/coach/1?mode=voice&place=gym'; });
  await waitStep(page, 'lesson', 30000);
  await sleep(800);
  const spoken = await page.evaluate(() => window.__spoken.slice());
  const firstQuestion = (await lessonOf(page)).lesson.pending.text;
  check('[Case8a] 음성 모드: 같은 엔진의 설명·질문을 TTS로 읽음', spoken.some((s) => s.includes(firstQuestion)), spoken);
  check('[Case8b] 답변 차례 패널에 "말해서 답하기"', (await page.locator('[data-testid="coach-turn-mic"]').count()) === 1);
  const vb = await msgCount(page);
  await page.locator('[data-testid="coach-turn-mic"]').click();
  await sleep(4500);
  await page.locator('[data-testid="coach-turn-mic"]').click();
  await waitReply(page, vb, 120000).catch(() => {});
  const vUser = await page.evaluate(() => [...document.querySelectorAll('[data-testid="coach-chat"] .ai-msg--user')].map((e) => e.textContent));
  const vLines = await coachLines(page);
  const vSt = await lessonOf(page);
  const spoken2 = await page.evaluate(() => window.__spoken.slice());
  check('[Case8c] 음성 입력 → 받아쓰기 → 수업 엔진(질문으로 판단, 답변 후 복귀)', vUser.length >= 1 && vSt.lesson.studentQuestions.length >= 1 && vSt.lesson.pending?.text === firstQuestion, { vUser, q: vSt.lesson.studentQuestions });
  check('[Case8d] 코치 답변도 음성으로 읽음', vLines.filter((l) => l.kind === 'answer').every((l) => spoken2.includes(l.text)) && vLines.some((l) => l.kind === 'answer'), vLines.slice(-2));
  check('[Case8e] 음성 모드 동안 페이지 에러 없음', errors.length === 0, errors);
  await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).clearCoachDayRun());
  await app.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} PASSED ===`);
  for (const f of failed) console.log(' - ' + f.name);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error('DRIVER FAILED:', e); process.exit(1); });
