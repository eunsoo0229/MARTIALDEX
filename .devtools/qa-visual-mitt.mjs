// AI Visualizing Mitt — real Electron app, real technique DB, real Gemini
// answers, real Supabase (fresh test account) for combo sync.
// speechSynthesis.speak is wrapped to RECORD utterances (voice/rate).
// Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-mitt-'));
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
    window.speechSynthesis.speak = (u) => window.__spoken.push({ text: u.text, voice: u.voice?.voiceURI ?? null, rate: u.rate });
  });
  return { app, page, errors };
}
async function quit(app) {
  const exited = new Promise((r) => app.process().once('exit', r));
  await app.evaluate(({ app: a }) => { setTimeout(() => a.quit(), 0); });
  await exited;
}

async function main() {
  let { app, page, errors } = await launch();
  const goto = async (hash) => {
    await page.evaluate(() => { window.location.hash = '#/'; });
    await sleep(300);
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    await sleep(1300);
    // Combos open in 콤보 연속 실행 by default; the step-by-step checks below use 단계별 익히기.
    if (hash.includes('combo=') && (await page.locator('[data-testid="mitt-mode-steps"]').count())) await page.locator('[data-testid="mitt-mode-steps"]').click();
  };
  const current = () => page.evaluate(() => {
    const c = document.querySelector('[data-testid="mitt-current"]');
    const f = document.querySelector('[data-testid="mitt-front"]');
    const lead = document.querySelector('[data-testid="mitt-foot-lead"]');
    return { index: Number(c?.dataset.index), archetype: c?.dataset.archetype, kind: c?.dataset.kind, path: f?.dataset.path, hit: f?.dataset.hit, p: Number(document.querySelector('[data-testid="mitt-progress"]')?.dataset.p), leadX: Number(lead?.dataset.x), leadY: Number(lead?.dataset.y), targets: document.querySelectorAll('[data-testid="mitt-target"]').length, opp: !!document.querySelector('[data-testid="mitt-opponent-feet"]'), reps: Number(document.querySelector('[data-testid="mitt-reps"]')?.textContent) };
  });

  // ---------- entry ----------
  await goto('#/coach');
  await page.locator('[data-testid="visual-mitt-entry"] a').click();
  await sleep(1200);
  const setup = await page.evaluate(() => ({ url: location.hash, tabs: [...document.querySelectorAll('[data-testid^="mitt-tab-"]')].map((t) => t.textContent) }));
  check('[M1] AI 코치 화면 → AI Visualizing Mitt 진입 (AI 요청/공격 지시/반응 훈련/추천/내 콤보/단일/만들기)', setup.url.includes('/coach/mitt') && setup.tabs.length === 7 && setup.tabs.some((t) => t.startsWith('반응 훈련')) && setup.tabs.some((t) => t.includes('공격 지시')), setup);
  const data = await page.evaluate(async () => {
    const c = await import('/src/lib/visualMitt/combos.ts');
    const db = c.listDbCombos();
    const tech = c.listVisualizableTechniques();
    return { db: db.length, names: db.map((x) => `${x.name} [${x.sourceLabel}]`), single: tech.length, kinds: [...new Set(tech.map((t) => t.name))].length };
  });
  check('[M2] 기술 DB 수록 조합에서 추천 콤보 생성 (모든 단계가 실제 DB 기술)', data.db >= 20 && data.names.some((n) => /Jab → Cross → Low Kick/.test(n)) && data.names.some((n) => /Jab → Cross → Lead Hook/.test(n)), { count: data.db, sample: data.names.slice(0, 8) });
  const strikeToTd = data.names.filter((n) => /Double Leg|Single|Crotch/.test(n));
  console.log('   타격→테이크다운 DB 콤보:', strikeToTd.join(' | ') || '없음');
  console.log('   추천 콤보 전체:', data.names.join(' | ').slice(0, 1500));

  // ---------- single strike: Jab ----------
  const jabId = await page.evaluate(async () => (await import('/src/lib/techniqueCanonical/index.ts')).canonicalTechniqueId('boxing__jab'));
  await goto(`#/coach/mitt?combo=${encodeURIComponent(`single:${jabId}`)}&mode=text`);
  let c0 = await current();
  check('[M3a] 단일 타격(잽) 화면: 정면 미트 목표 + 직선 궤적 + 발 위치', c0.archetype === 'jab' && c0.path === 'straight' && c0.targets === 1 && c0.p === 0, c0);
  // 주먹 속도는 일정: 빠른/느린 설정 모두 시작 후 비슷한 시간(≈0.2초)에 미트 도달
  const timeToHit = async () => {
    const t0 = Date.now();
    await page.locator('[data-testid="mitt-play"]').click();
    const ms = await page.evaluate(() => new Promise((res) => {
      const s = performance.now();
      const tick = () => (document.querySelector('[data-testid="mitt-front"]')?.dataset.hit === 'true' ? res(performance.now() - s) : performance.now() - s > 3000 ? res(-1) : requestAnimationFrame(tick));
      tick();
    }));
    void t0;
    return ms;
  };
  await page.locator('[data-testid="mitt-speed-fast"]').click();
  const hitFast = await timeToHit();
  await sleep(1300);
  const endJab = await current();
  await page.locator('[data-testid="mitt-pause"]').click().catch(() => {});
  await page.locator('[data-testid="mitt-speed-slow"]').click();
  await page.locator('[data-testid="mitt-replay"]').click();
  const hitSlow = await timeToHit();
  await page.locator('[data-testid="mitt-pause"]').click().catch(() => {});
  await page.locator('[data-testid="mitt-speed-fast"]').click();
  check('[M3b] 재생 → 미트 도달 표시, 주먹 속도는 속도 설정과 무관하게 빠름(≤0.4초), 앞발 반 걸음 이동', hitFast > 0 && hitSlow > 0 && hitFast <= 400 && hitSlow <= 400 && Math.abs(hitFast - hitSlow) < 150 && endJab.leadY < 150, { hitFast, hitSlow, end: endJab });
  // southpaw mirror
  await page.locator('[data-testid="mitt-pause"]').click().catch(() => {});
  const xOrth = await page.evaluate(() => Number(document.querySelector('[data-testid="mitt-foot-lead"]').dataset.x));
  await page.locator('[data-testid="mitt-southpaw"]').check();
  const xSouth = await page.evaluate(() => Number(document.querySelector('[data-testid="mitt-foot-lead"]').dataset.x));
  check('[M3c] 사우스포 전환 시 좌우 반전', xOrth < 120 && xSouth > 120, { xOrth, xSouth });

  // ---------- DB combo Jab → Cross → Low Kick: auto progress, reps ----------
  const comboId = await page.evaluate(async () => (await import('/src/lib/visualMitt/combos.ts')).listDbCombos().find((x) => x.name === 'Jab → Cross → Low Kick').id);
  await goto(`#/coach/mitt?combo=${encodeURIComponent(comboId)}&mode=text`);
  await page.locator('[data-testid="mitt-speed-fast"]').click();
  await page.locator('[data-testid="mitt-play"]').click();
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const c = await current();
    seen.add(`${c.index}:${c.archetype}:${c.path}`);
    if (c.reps >= 1) break;
    await sleep(150);
  }
  const afterPass = await current();
  check('[M4] 콤보 자동 진행: 잽(직선) → 크로스(직선) → 로우킥(라운드, 다리 목표) → 한 바퀴 후 반복 1회', [...seen].some((x) => x.startsWith('0:jab')) && [...seen].some((x) => x.startsWith('1:cross')) && [...seen].some((x) => x.startsWith('2:lowKick:round')) && afterPass.reps === 1, [...seen]);
  // continuous mode (default for a combo): one motion, tutor-decided reps, automatic
  await page.locator('[data-testid="mitt-mode-continuous"]').click();
  const reason = await page.locator('[data-testid="mitt-drill-reason"]').textContent();
  const target = Number(reason.match(/(\d+)회/)?.[1]);
  await page.locator('[data-testid="mitt-runner-speed-fast"]').click();
  await page.locator('[data-testid="mitt-runner-play"]').click();
  // 5초 준비 카운트다운: 숫자 표시 중에는 동작이 진행되지 않음
  await sleep(1500);
  const ready = await page.evaluate(() => ({ num: document.querySelector('[data-testid="mitt-ready-countdown"] strong')?.textContent, step: document.querySelector('[data-testid="mitt-runner"]').dataset.step, rep: document.querySelector('[data-testid="mitt-runner"]').dataset.rep }));
  check('[M16a] 시작 누르면 5초 준비 카운트다운 (그동안 진행 안 함)', ['3', '4'].includes(ready.num) && ready.step === '1' && ready.rep === '1', ready);
  await sleep(4200);
  check('[M16b] 카운트다운 끝나면 오버레이 사라지고 콤보 시작', !(await page.$('[data-testid="mitt-ready-countdown"]')));
  await page.waitForFunction(() => document.querySelector('[data-testid="mitt-runner"]')?.dataset.done === 'true', null, { timeout: 60000 });
  const contRep = await page.locator('[data-testid="mitt-runner-rep"]').textContent();
  check('[M16] 콤보 연속 실행: AI 튜터가 정한 횟수만큼 자동 반복 후 종료', target >= 3 && contRep.replace(/\s/g, '').includes(`${target}/${target}`), { reason, contRep });
  await page.locator('[data-testid="mitt-mode-steps"]').click();
  // controls
  await page.locator('[data-testid="mitt-pause"]').click();
  const pauseP = (await current()).p;
  await sleep(600);
  check('[M5a] 일시정지: 진행 멈춤', (await current()).p === pauseP, pauseP);
  await page.locator('[data-testid="mitt-step-chip"]').nth(1).click();
  await sleep(150);
  check('[M5b] 단계 칩으로 이동 (2단계)', (await current()).index === 1);
  await page.locator('[data-testid="mitt-next"]').click();
  await sleep(150);
  check('[M5c] 다음 단계', (await current()).index === 2);
  await page.locator('[data-testid="mitt-prev"]').click();
  await sleep(150);
  check('[M5d] 이전 단계', (await current()).index === 1);
  await page.locator('[data-testid="mitt-loop-step"]').click();
  await page.locator('[data-testid="mitt-play"]').click();
  await sleep(3200);
  const looped = await current();
  check('[M5e] 현재 단계 반복: 계속 같은 단계(2단계)에 머묾', looped.index === 1, looped);
  await page.locator('[data-testid="mitt-loop-step"]').click();
  await page.locator('[data-testid="mitt-pause"]').click();
  await page.locator('[data-testid="mitt-replay"]').click();
  await sleep(150);
  check('[M5f] 다시 보기: 현재 단계를 처음부터', (await current()).p === 0);
  await page.locator('[data-testid="mitt-repeat-all"]').click();
  await sleep(150);
  check('[M5g] 전체 콤보 처음부터', (await current()).index === 0);
  await page.locator('[data-testid="mitt-pause"]').click();
  await page.locator('[data-testid="mitt-mark-step"]').click();
  const tutorBefore = await page.evaluate(() => localStorage.getItem('martialdex:ai-tutor-voice-settings'));
  await page.locator('[data-testid="mitt-speed-slow"]').click();
  check('[M9a] 시각화 속도 변경은 TTS 말하기 속도 설정을 바꾸지 않음', (await page.evaluate(() => localStorage.getItem('martialdex:ai-tutor-voice-settings'))) === tutorBefore, tutorBefore);
  // AI coach question (real Gemini)
  await page.locator('[data-testid="mitt-ask-input"]').fill('잽을 칠 때 앞발은 어떻게 해?');
  await page.locator('[data-testid="mitt-ask"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="mitt-chat"] .ai-msg--model[data-kind="answer"]'), null, { timeout: 60000 });
  const ans = await page.evaluate(() => document.querySelector('[data-testid="mitt-chat"] .ai-msg--model[data-kind="answer"]').textContent);
  check('[M11] 수업 중 AI 코치 질문 → 현재 단계 맥락의 답변', ans.length > 10 && !/가져오지 못했/.test(ans), ans.slice(0, 160));
  const lines = await page.evaluate(() => [...document.querySelectorAll('[data-testid="mitt-chat"] .ai-msg--model[data-kind="explain"]')].map((m) => m.textContent));
  check('[M7] AI 코치가 단계별로 안내 (n/N단계 · 역할 · 기술 · 방법 · 목표)', lines.some((l) => /^1\/3단계, 셋업: Jab/.test(l)) && lines.some((l) => /^3\/3단계, 타격: Low Kick.*목표는 다리/.test(l)), lines.slice(0, 3));
  // end + record
  await page.locator('[data-testid="mitt-end"]').click();
  await page.locator('[data-testid="mitt-save-record"]').click();
  await page.locator('[data-testid="mitt-record-link"]').waitFor();
  const rec = await page.evaluate(async () => (await import('/src/lib/trainingHistory/service.ts')).listTrainingHistory()[0]);
  check('[M12] 수업 기록: source visual_mitt · 콤보·단계·반복·완료 표시 · 사용자 표시(측정 아님)', rec.source === 'visual_mitt' && rec.visualMitt?.selfReported === true && rec.visualMitt.repetitions >= 1 && rec.visualMitt.completedSteps.includes(0) && rec.visualMitt.stepTechniqueIds.length === 3 && /사용자 표시 — 자세 측정 아님/.test(rec.notes), rec);
  await page.locator('[data-testid="mitt-record-link"]').click();
  await sleep(1200);
  const detail = await page.evaluate(() => document.body.innerText);
  check('[M12b] 학습 기록 상세에 AI Visualizing Mitt 표시', /AI Visualizing Mitt/.test(detail), detail.match(/.{0,30}Visualizing.{0,40}/)?.[0]);

  // ---------- setup (feint) → strike, takedown entry ----------
  const feintCombo = await page.evaluate(async () => (await import('/src/lib/visualMitt/combos.ts')).listDbCombos().find((x) => /Level Change Feint → High Kick/.test(x.name))?.id);
  await goto(`#/coach/mitt?combo=${encodeURIComponent(feintCombo)}&mode=text`);
  const f0 = await current();
  check('[M8a] 셋업 연결: 레벨 체인지 페인트(셋업, 목표 없음) → 하이킥', f0.kind === 'feint' && f0.path === 'feint' && f0.targets === 0, f0);
  const dlId = await page.evaluate(async () => (await import('/src/lib/techniqueCanonical/index.ts')).canonicalTechniqueId('wrestling__basic-double-leg'));
  await goto(`#/coach/mitt?combo=${encodeURIComponent(`single:${dlId}`)}&mode=text`);
  await page.locator('[data-testid="mitt-speed-fast"]').click();
  const d0 = await current();
  await page.locator('[data-testid="mitt-play"]').click();
  // fast = 800 ms move + 500 ms hold, then the single step loops back — sample inside the hold.
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="mitt-progress"]')?.dataset.p) === 1, null, { timeout: 5000 });
  const d1 = await current();
  check('[M6] 페네트레이션 스텝(더블 레그): 상대 발 표시 · 앞발 깊게 진입 · 뒷발 따라옴 · 자세 낮추기', d0.kind === 'entry' && d0.opp && d1.leadY < d0.leadY - 60 && (await page.locator('.mitt-level').count()) === 1, { before: d0.leadY, after: d1.leadY });

  // ---------- build custom combo: strike → takedown, save, reload ----------
  await goto('#/coach/mitt?mode=text');
  await page.locator('[data-testid="mitt-tab-build"]').click();
  const add = async (q, id) => {
    await page.locator('[data-testid="mitt-search"]').fill(q);
    await sleep(200);
    await page.locator(`[data-testid="mitt-technique-option"][data-technique-id="${id}"] [data-testid="mitt-add-step"]`).click();
  };
  const ohId = await page.evaluate(async () => (await import('/src/lib/techniqueCanonical/index.ts')).canonicalTechniqueId('boxing__overhand'));
  await add('Jab', jabId);
  await add('Overhand', ohId);
  await add('Basic Double Leg', dlId);
  let notes = await page.locator('[data-testid="mitt-draft-notes"]').count();
  check('[M8b] 타격 → 테이크다운 연결 콤보 구성 (잽 → 오버핸드 → 더블 레그), 경고 없음', (await page.locator('[data-testid="mitt-draft-step"]').count()) === 3 && notes === 0);
  await add('Jab', jabId);
  const noteText = await page.locator('[data-testid="mitt-draft-notes"]').textContent();
  check('[M8c] 근거 없는 연결(진입 후 다시 타격)은 참고 경고 — 사용자 지정 콤보로 구분', /테이크다운 진입 뒤/.test(noteText) && /연결 검증 안 됨/.test(noteText), noteText);
  await page.locator('[data-testid="mitt-draft-step"]').nth(3).locator('button[aria-label="삭제"]').click();
  await page.locator('[data-testid="mitt-draft-name"]').fill('QA 잽-오버핸드-더블레그');
  await page.locator('[data-testid="mitt-draft-save"]').click();
  await sleep(1200);
  // combos open in continuous mode by default; the step view is one click away
  check('[M10e] 저장한 콤보는 연속 콤보 모드로 열림', (await page.locator('[data-testid="mitt-runner"]').count()) === 1);
  await page.locator('[data-testid="mitt-mode-steps"]').click();
  await sleep(300);
  const savedCombo = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:combos') || '[]').find((c) => c.name === 'QA 잽-오버핸드-더블레그'));
  const sess = await current();
  check('[M10a] 콤보 저장 (기술 ID 기반, 콤보 북) → 바로 연습 화면', !!savedCombo && savedCombo.techniqueIds.length === 3 && savedCombo.visualMittMeta && sess.index === 0 && sess.archetype === 'jab', savedCombo);
  // logged-out: local only
  check('[M10b] 비로그인: 로컬 저장 (userId 없음)', savedCombo.userId === null);
  await quit(app);
  ({ app, page, errors } = await launch());
  await goto('#/coach/mitt?mode=text');
  await page.locator('[data-testid="mitt-tab-mine"]').click();
  const mineRow = page.locator('[data-testid="mitt-combo-option"]', { hasText: 'QA 잽-오버핸드-더블레그' });
  check('[M10c] 앱 재시작 후 내 콤보에서 다시 불러오기', (await mineRow.count()) === 1);
  await mineRow.locator('[data-testid="mitt-combo-start"]').click();
  await sleep(800);
  await page.locator('[data-testid="mitt-mode-steps"]').click();
  await sleep(300);
  const reload = await page.evaluate(() => [...document.querySelectorAll('[data-testid="mitt-step-chip"]')].map((b) => b.textContent));
  check('[M10d] 불러온 콤보의 단계 순서 유지', reload.length === 3 && /Jab/.test(reload[0]) && /Overhand/.test(reload[1]) && /Double Leg/.test(reload[2]), reload);

  // ---------- voice: existing AI 튜터 settings applied ----------
  await page.evaluate(() => localStorage.setItem('martialdex:ai-tutor-voice-settings', JSON.stringify({ aiTutorVoice: null, aiTutorSpeechRate: 1.25 })));
  await goto(`#/coach/mitt?combo=${encodeURIComponent(`single:${jabId}`)}&mode=voice`);
  await page.evaluate(() => { window.__spoken = []; });
  await page.locator('[data-testid="mitt-replay"]').click();
  await sleep(400);
  const spoken = await page.evaluate(() => window.__spoken);
  check('[M9b] 음성 모드: 단계 안내를 기존 AI 튜터 음성 설정(1.25x)으로 읽음, 별도 음성 설정 없음', spoken.length >= 1 && spoken.every((s) => s.rate === 1.25) && (await page.locator('[data-testid="mitt-voice-settings"] [data-testid="tutor-voice-settings"]').count()) === 1, spoken.map((s) => s.rate));
  await goto(`#/coach/mitt?combo=${encodeURIComponent(`single:${jabId}`)}&mode=text`);
  await page.evaluate(() => { window.__spoken = []; });
  await page.locator('[data-testid="mitt-replay"]').click();
  await sleep(400);
  check('[M9c] 텍스트 모드: 음성 없음', (await page.evaluate(() => window.__spoken.length)) === 0);

  // ---------- AI Coach day lesson integration ----------
  await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).clearCoachDayRun());
  // A boxing Day whose first coached technique has a Mitt motion.
  const mittDay = await page.evaluate(async () => {
    const off = await import('/src/lib/curriculum/officialData.ts');
    const svc = await import('/src/lib/aiCoachDay/service.ts');
    const a = await import('/src/lib/visualMitt/archetypes.ts');
    const c = off.getOfficialCurriculum('boxing');
    return c.days.find((d) => { const t = svc.coachTechniquesForDay(d)[0]; return t && a.motionForTechnique(t); })?.day;
  });
  await goto(`#/learning/boxing/official__boxing/coach/${mittDay}?mode=text&place=limited`);
  // The coach session opens with the 1:1 lesson (explain → question); "준비됐어" moves on to the video step.
  await page.waitForFunction(() => ['lesson', 'videos'].includes(document.querySelector('[data-testid="coach-step"]')?.dataset.step), null, { timeout: 60000 });
  if ((await page.evaluate(() => document.querySelector('[data-testid="coach-step"]')?.dataset.step)) === 'lesson') {
    await page.fill('[data-testid="coach-text-input"]', '준비됐어');
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => document.querySelector('[data-testid="coach-step"]')?.dataset.step === 'videos', null, { timeout: 60000 });
  const lesson = await page.evaluate(() => ({ button: !!document.querySelector('[data-testid="coach-mitt-start"]'), suggest: [...document.querySelectorAll('[data-testid="coach-chat"] .ai-msg__bubble')].some((b) => /실습 때는 AI Visualizing Mitt를 불러/.test(b.textContent)), place: document.querySelector('[data-testid="coach-location"]')?.dataset.location }));
  check('[M14] AI 코치 수업: 실습 때 Visualizing Mitt를 불러온다고 미리 안내 (선택 버튼 없이 무조건)', lesson.place === 'limited' && lesson.suggest && !lesson.button, lesson);
  // in-lesson: ready → posture briefing → the Mitt opens inside the lesson (no page change) with the current technique
  await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).updateCoachDayRun((r) => ({ ...r, step: 'ready' })));
  await page.locator('[data-testid="coach-ready"] button').click();
  await page.locator('[data-testid="coach-posture-start"]').click();
  await page.locator('[data-testid="coach-mitt"]').waitFor({ timeout: 10000 });
  check('[M14b] 수업 안에서 Visualizing Mitt 실행 (현재 기술, 수업 화면 유지)', (await page.locator('[data-testid="mitt-runner"]').count()) === 1 && /\/coach\//.test(page.url()));
  await page.locator('[data-testid="mitt-runner-stop"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="coach-step"]')?.dataset.step !== 'mitt', null, { timeout: 10000 });
  await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).clearCoachDayRun());

  // ---------- logged-in: combo syncs to the cloud ----------
  const signup = await page.evaluate(async ({ email }) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data, error } = await supabase.auth.signUp({ email, password: 'QaMitt!2026x' });
    return { ok: !error && !!data.session, userId: data?.user?.id };
  }, { email: `qa-mitt-${Date.now()}@martialdex-test.local` });
  await sleep(3000);
  const cloud = await page.evaluate(async ({ userId }) => {
    const sync = await import('/src/lib/cloudSync/comboSync.ts');
    await sync.syncCombosBidirectional(userId);
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data } = await supabase.from('combos').select('id, data').eq('user_id', userId);
    return (data ?? []).map((r) => ({ name: r.data.name, ids: r.data.techniqueIds.length, meta: !!r.data.visualMittMeta }));
  }, { userId: signup.userId });
  const libCombos = await page.evaluate(async () => {
    await (await import('/src/lib/cloudSync/addTeqSync.ts')).syncAddTeqFromCloud();
    return (await import('/src/lib/visualMitt/combos.ts')).listDbCombos().filter((x) => x.steps.some((s) => s.motion.archetype.kind === 'entry')).map((x) => `${x.name} [${x.sourceLabel}]`);
  });
  check('[M8d] 로그인 시 공유 라이브러리 조합에서 타격 → 테이크다운 추천 콤보', libCombos.length >= 1, libCombos);
  check('[M10e] 로그인 사용자: Mitt 콤보가 기존 콤보 동기화로 클라우드(본인 행, RLS)에 저장', signup.ok && cloud.some((c) => c.name === 'QA 잽-오버핸드-더블레그' && c.ids === 3 && c.meta), cloud);

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
