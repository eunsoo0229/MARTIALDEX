// AI 코치 선택 — real Electron app. Verifies that the coach chosen before a
// lesson really decides the call path: the main-process IPC handlers for
// Gemini ('ai:ask'), Tavily ('websearch:search') and the local model
// ('localai:ask') are wrapped with COUNTERS that forward to the real modules,
// so "자체 AI 코치 → Gemini 0 calls" is measured on the real transport.
// Real Gemini/Tavily are called only in the Gemini-coach scenarios.
// Requires the Vite dev server on :5173.  Run: node .devtools/qa-coach-select.mjs
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  const d = typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (d ? ' :: ' + d.slice(0, 600) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [APP_DIR, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-coachsel-'))}`], env, timeout: 120000 });
const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.waitForLoadState('load');
await sleep(1500);

// ---- counting wrappers around the real IPC handlers (main process)
await app.evaluate(({ ipcMain }) => {
  // Electron keeps ipcMain.handle() handlers in an internal map: wrap the ORIGINAL handlers
  // (real Gemini / Tavily / Ollama) with counters — the real call still happens.
  const map = ipcMain._invokeHandlers;
  if (!map || typeof map.get !== 'function') throw new Error('ipcMain._invokeHandlers not available');
  globalThis.__calls = { 'ai:ask': [], 'websearch:search': [], 'localai:ask': [] };
  for (const ch of Object.keys(globalThis.__calls)) {
    const original = map.get(ch);
    if (!original) throw new Error(`no handler for ${ch}`);
    map.set(ch, async (e, arg) => {
      globalThis.__calls[ch].push(typeof arg === 'object' ? String(arg?.question ?? arg?.prompt ?? '').slice(0, 80) : String(arg).slice(0, 80));
      return original(e, arg);
    });
  }
});
const calls = () => app.evaluate(() => JSON.parse(JSON.stringify(globalThis.__calls)));
const resetCalls = () => app.evaluate(() => { for (const k of Object.keys(globalThis.__calls)) globalThis.__calls[k] = []; });
const goto = async (hash) => {
  await page.evaluate(() => { window.location.hash = '#/'; });
  await sleep(300);
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await sleep(1800);
};
const run = () => page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:ai-coach-day-run') ?? 'null'));
/** Coach lines on either lesson screen (curriculum: .ai-msg--model, one-off: .oneoff-msg[data-role=coach]). */
const COACH_LINE = '.ai-msg--model, .oneoff-msg[data-role="coach"]';
const coachLines = () => page.evaluate((sel) => document.querySelectorAll(sel).length, COACH_LINE);
/** Types + Enter, then waits until the coach has replied (input enabled again, nothing loading, a new coach line). */
const send = async (text, input = '[data-testid="coach-text-input"]') => {
  const box = page.locator(input);
  await box.waitFor({ timeout: 30000 });
  await page.waitForFunction((sel) => !document.querySelector(sel)?.disabled, input, { timeout: 300000 });
  const n = await coachLines();
  await box.fill(text);
  await box.press('Enter');
  await page.waitForFunction(
    ({ sel, n, line }) => !document.querySelector(sel)?.disabled && !document.querySelector('.ai-msg__bubble--loading') && document.querySelectorAll(line).length > n,
    { sel: input, n, line: COACH_LINE },
    { timeout: 300000 }
  );
  await sleep(600);
};
const lastCoach = (sel) => page.evaluate((s) => [...document.querySelectorAll(`${s} .ai-msg--model .ai-msg__bubble`)].map((x) => x.textContent).slice(-3), sel);

const DAY = '#/learning/bjj/official__bjj/coach/6?mode=text&place=home';

// ================================================================ A. picker before the lesson
await page.evaluate(() => { localStorage.removeItem('martialdex:coach-kind-pref'); localStorage.removeItem('martialdex:ai-coach-day-run'); });
await goto(DAY);
const pickerShown = await page.locator('[data-testid="coach-picker"]').count();
const status = await page.locator('[data-testid="coach-pick-martialdex"]').getAttribute('data-local-status');
check('[A1] 수업 시작 전 코치 선택 화면, 선택 전에는 수업 세션이 만들어지지 않음', pickerShown === 1 && (await run()) === null, { pickerShown });
check('[A2] 두 코치 카드 표시 + 자체 코치 카드에 이 기기의 로컬 모델 상태 표시', (await page.locator('[data-testid="coach-pick-gemini"]').count()) === 1 && !!status && status !== 'checking', { status });

// ================================================================ B. 자체 AI 코치 → no Gemini, no web search
await resetCalls();
await page.locator('[data-testid="coach-pick-martialdex"]').click();
await page.locator('[data-testid="coach-pick-confirm"]').click();
await sleep(2500);
let r = await run();
check('[B1] 자체 코치 선택이 세션에 저장되고 화면에 표시', r?.coachKind === 'martialdex' && (await page.locator('[data-testid="coach-kind"]').getAttribute('data-coach')) === 'martialdex' && page.url().includes('coach=martialdex'), { coachKind: r?.coachKind, url: page.url() });
const techId = r?.techniqueIds?.[r.index];
await send('발은 어떻게 해요?');
const qa1 = await lastCoach('[data-testid="coach-chat"]');
await send('상대를 잡고 넘기는 기술 같아요');
const qa2 = await lastCoach('[data-testid="coach-chat"]');
let c = await calls();
check('[B2] 자체 코치: 질문 답변·답변 채점 동안 Gemini(ai:ask) 0회, 웹 검색 0회', c['ai:ask'].length === 0 && c['websearch:search'].length === 0, { calls: { ai: c['ai:ask'].length, web: c['websearch:search'].length, local: c['localai:ask'].length }, techId });
check('[B3] 자료에 근거한 답(또는 "자료에 없음" 안내)이고, 로컬 모델이 없으면 그 사실을 알림', qa1.some((t) => /MARTIALDEX/.test(t) && (/자료에 따르면|내용이 없습니다|확인되지 않/.test(t))), qa1);
check('[B4] 답변 채점은 결정론적 판정 문구로 진행 (Gemini 피드백 아님)', qa2.some((t) => /짚으셨습니다|한 가지가 더|다르게 생각|흔히 하는 실수|자료가 부족/.test(t)), qa2);

// ================================================================ C. switch mid-lesson → Gemini, explicit, progress kept
const before = await run();
await page.locator('[data-testid="coach-switch-open"]').click();
await page.locator('[data-testid="coach-switch"] [data-testid="coach-pick-gemini"]').click();
await page.locator('[data-testid="coach-switch"] [data-testid="coach-pick-confirm"]').click();
await page.locator('[data-testid="coach-switch-confirm"]').waitFor();
const confirmText = await page.locator('[data-testid="coach-switch-confirm"]').textContent();
await page.locator('[data-testid="coach-switch-keep"]').click();
await sleep(1500);
r = await run();
check('[C1] 수업 중 전환은 어떻게 할지 묻고(진행 유지/처음부터), 진행 유지 시 같은 세션에 전환 기록', /진행 유지/.test(confirmText) && /처음부터/.test(confirmText) && r.id === before.id && r.coachKind === 'gemini' && r.coachSwitches?.length === 1 && r.coachSwitches[0].from === 'martialdex' && r.messages.length >= before.messages.length, { id: r.id === before.id, coachKind: r.coachKind, switches: r.coachSwitches });
await resetCalls();
await send('이 기술은 언제 쓰나요?');
c = await calls();
const gemAnswer = await lastCoach('[data-testid="coach-chat"]');
check('[C2] Gemini 코치로 바꾼 뒤 질문은 기존 Gemini 경로(ai:ask)로 감', c['ai:ask'].length >= 1 && c['localai:ask'].length === 0, { ai: c['ai:ask'], answer: gemAnswer.slice(-1) });

// ================================================================ D. legacy run (no coach) is resumed, not guessed
const legacy = { ...(await run()) };
delete legacy.coachKind;
delete legacy.coachSwitches;
await page.evaluate((x) => localStorage.setItem('martialdex:ai-coach-day-run', JSON.stringify(x)), legacy);
await goto(DAY);
check('[D1] 코치 정보 없는 이전 세션: 코치를 묻고(Gemini로 추정 안 함)', (await page.locator('[data-testid="coach-picker"]').count()) === 1, '');
await page.locator('[data-testid="coach-pick-martialdex"]').click();
await page.locator('[data-testid="coach-pick-confirm"]').click();
await sleep(2000);
r = await run();
check('[D2] 고른 코치로 같은 세션을 이어가고 "이전 세션" 안내 + 전환 기록(from unknown)', r.id === legacy.id && r.coachKind === 'martialdex' && r.coachSwitches?.[0]?.from === 'unknown' && r.messages.some((m) => m.text.includes('코치 정보가 없던 이전 세션')), { id: r.id === legacy.id, coachKind: r.coachKind, sw: r.coachSwitches });

// ================================================================ E. one-off lesson: separate session, own coach
await resetCalls();
await page.evaluate(() => localStorage.removeItem('martialdex:coach-oneoff-session'));
await goto('#/coach/lesson');
await page.locator('[data-testid="oneoff-request"]').fill('오늘 잽을 배우고 싶어');
await page.locator('[data-testid="oneoff-build"]').click();
await page.locator('[data-testid="coach-picker"]').waitFor({ timeout: 10000 });
await page.locator('[data-testid="coach-pick-martialdex"]').click();
await page.locator('[data-testid="coach-pick-confirm"]').click();
await page.locator('[data-testid="oneoff-lesson"]').waitFor({ timeout: 30000 });
const oneoff = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:coach-oneoff-session') ?? 'null'));
c = await calls();
check('[E1] 1회성 수업도 만들기 전에 코치 선택 → 자체 코치는 DB 기술로 수업 생성, Gemini·웹 검색 0회', oneoff?.coachKind === 'martialdex' && !!oneoff.lesson.techniqueId && oneoff.lesson.webSearch.called === false && c['ai:ask'].length === 0 && c['websearch:search'].length === 0, { kind: oneoff?.coachKind, tech: oneoff?.lesson.techniqueId, calls: { ai: c['ai:ask'].length, web: c['websearch:search'].length } });
check('[E2] 커리큘럼 세션의 코치(자체)와 1회성 세션의 코치가 각자 저장 — 섞이지 않음', (await run()).coachKind === 'martialdex' && oneoff.coachKind === 'martialdex' && (await run()).id === legacy.id, '');
const oneoffSend = '[data-testid="oneoff-answer"]';
await send('잽 칠 때 발은 어떻게 해요?', oneoffSend);
const oneoffAnswer = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:coach-oneoff-session') ?? 'null')?.messages.filter((m) => m.role === 'coach').map((m) => m.text).slice(-2));
c = await calls();
check('[E3] 1회성 자체 코치 질문 답변도 Gemini 없이 기술 자료로 (잽의 발 위치는 자료에 있음)', c['ai:ask'].length === 0 && (oneoffAnswer ?? []).some((t) => /발 위치|MARTIALDEX 자료/.test(t)), { ai: c['ai:ask'].length, oneoffAnswer, sendFound: !!oneoffSend });

// not in DB → refused, Gemini only offered, never auto-used
await page.evaluate(() => localStorage.removeItem('martialdex:coach-oneoff-session'));
await goto('#/coach/lesson');
await resetCalls();
await page.locator('[data-testid="oneoff-request"]').fill('오늘은 거리 조절 전략을 배우고 싶어');
await page.locator('[data-testid="oneoff-build"]').click();
await page.locator('[data-testid="coach-pick-martialdex"]').click();
await page.locator('[data-testid="coach-pick-confirm"]').click();
await sleep(1500);
const err = await page.locator('[data-testid="oneoff-error"]').textContent().catch(() => '');
c = await calls();
check('[E4] DB에 없는 주제: 자체 코치는 거절하고 Gemini는 버튼으로만 제안 (자동 전환·호출 없음)', /DB에 있는 기술만/.test(err) && (await page.locator('[data-testid="oneoff-use-gemini"]').count()) === 1 && c['ai:ask'].length === 0 && c['websearch:search'].length === 0, { err, ai: c['ai:ask'].length });

// ================================================================ F. remember the choice
await page.evaluate(() => localStorage.removeItem('martialdex:ai-coach-day-run'));
await goto(DAY);
await page.locator('[data-testid="coach-pick-gemini"]').click();
await page.locator('[data-testid="coach-pick-remember"]').check();
await page.locator('[data-testid="coach-pick-confirm"]').click();
await sleep(1500);
await page.evaluate(() => localStorage.removeItem('martialdex:ai-coach-day-run'));
await goto('#/learning/bjj/official__bjj/coach/6?mode=text&place=home');
r = await run();
check('[F1] "다음부터 묻지 않기"를 고르면 다음 수업은 그 코치로 바로 시작 (화면에서 바꿀 수 있음)', (await page.locator('[data-testid="coach-picker"]').count()) === 0 && r?.coachKind === 'gemini' && (await page.locator('[data-testid="coach-switch-open"]').count()) === 1, { coachKind: r?.coachKind });
await page.evaluate(() => localStorage.removeItem('martialdex:coach-kind-pref'));

// ================================================================ G. local model path (only when Ollama is running)
const localStatus = await page.evaluate(() => window.martialdex?.localAi?.status());
if (localStatus?.ok) {
  await page.evaluate(() => localStorage.removeItem('martialdex:coach-oneoff-session'));
  await goto('#/coach/lesson');
  await resetCalls();
  await page.locator('[data-testid="oneoff-request"]').fill('오늘 잽을 배우고 싶어');
  await page.locator('[data-testid="oneoff-build"]').click();
  await page.locator('[data-testid="coach-pick-martialdex"]').click();
  await page.locator('[data-testid="coach-pick-confirm"]').click();
  await page.locator('[data-testid="oneoff-lesson"]').waitFor({ timeout: 30000 });
  const t0 = Date.now();
  await send('잽의 핵심 포인트가 뭐예요?', '[data-testid="oneoff-answer"]');
  const ms = Date.now() - t0;
  c = await calls();
  const ans = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:coach-oneoff-session') ?? 'null')?.messages.filter((m) => m.role === 'coach' && m.kind === 'answer').map((m) => m.text).slice(-1)[0] ?? '');
  const usedModel = !/기술 자료의 내용을 그대로 안내합니다/.test(ans);
  check('[G1] 로컬 모델 사용 가능 시: 자체 코치 질문은 로컬 모델(localai:ask)로, Gemini 0회', c['localai:ask'].length >= 1 && c['ai:ask'].length === 0, { local: c['localai:ask'].length, ai: c['ai:ask'].length, ms });
  check('[G2] 로컬 모델 답은 검사 통과 시에만 사용, 통과 못 하면 자료 원문 + 이유 안내', usedModel ? ans.length > 8 && !/kỹ|다리를 가슴에 올려서 다리를/.test(ans) : /확인되지 않아|기술 자료의 내용을 그대로/.test(ans), { usedModel, ans: ans.slice(0, 300) });
  const before = c['localai:ask'].length;
  await send('잽 칠 때 골반은 어떻게 해요?', '[data-testid="oneoff-answer"]');
  c = await calls();
  const ans2 = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:coach-oneoff-session') ?? 'null')?.messages.filter((m) => m.role === 'coach' && m.kind === 'answer').map((m) => m.text).slice(-1)[0] ?? '');
  check('[G3] 근거가 없는 질문(잽의 골반)은 로컬 모델도 호출하지 않고 "자료에 없음"', c['localai:ask'].length === before && /내용이 없습니다/.test(ans2), { calls: c['localai:ask'].length - before, ans2: ans2.slice(0, 200) });
} else {
  console.log('SKIP — [G] 로컬 모델 경로: Ollama가 실행 중이 아니어서 건너뜀', JSON.stringify(localStatus));
}

// ================================================================ H. one-off: Korean names, choosing among same-named techniques, waiting on the local model
await page.evaluate(() => { localStorage.removeItem('martialdex:coach-oneoff-session'); localStorage.removeItem('martialdex:coach-kind-pref'); });
await goto('#/coach/lesson');
await resetCalls();
await page.locator('[data-testid="oneoff-request"]').fill('오늘 암바 배우고 싶어');
await page.locator('[data-testid="oneoff-build"]').click();
await page.locator('[data-testid="coach-pick-martialdex"]').click();
await page.locator('[data-testid="coach-pick-confirm"]').click();
await page.locator('[data-testid="oneoff-lesson"]').waitFor({ timeout: 30000 });
let h = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:coach-oneoff-session') ?? 'null'));
c = await calls();
check('[H1] 자체 코치 1회성 수업: "암바"(한국어 이름) 요청 → Armbar 수업, Gemini·웹 검색 0회', h?.lesson.techniqueId === 'bjj__armbar' && c['ai:ask'].length === 0 && c['websearch:search'].length === 0, { tech: h?.lesson.techniqueId, ai: c['ai:ask'].length });
await page.evaluate(() => localStorage.removeItem('martialdex:coach-oneoff-session'));
await goto('#/coach/lesson');
await page.locator('[data-testid="oneoff-request"]').fill('페인트 배우고 싶어');
await page.locator('[data-testid="oneoff-build"]').click();
await page.locator('[data-testid="coach-pick-martialdex"]').click();
await page.locator('[data-testid="coach-pick-confirm"]').click();
await page.locator('[data-testid="oneoff-technique-choices"]').waitFor({ timeout: 10000 });
const choiceIds = await page.locator('[data-testid="oneoff-technique-choice"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-technique-id')));
const lessonBeforePick = await page.evaluate(() => localStorage.getItem('martialdex:coach-oneoff-session'));
await page.locator('[data-testid="oneoff-technique-choice"]').nth(1).click();
await page.locator('[data-testid="oneoff-lesson"]').waitFor({ timeout: 30000 });
h = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:coach-oneoff-session') ?? 'null'));
c = await calls();
check('[H2] 같은 이름의 기술이 여러 개("페인트")면 자동으로 고르지 않고 후보 버튼 → 고른 기술로 수업', choiceIds.length >= 2 && lessonBeforePick === null && h?.lesson.techniqueId === choiceIds[1] && c['ai:ask'].length === 0, { choiceIds, picked: h?.lesson.techniqueId });

if ((await page.evaluate(() => window.martialdex?.localAi?.status()))?.ok) {
  // fresh renderer state (the model back-off of earlier sections is per app session)
  await page.reload();
  await page.waitForLoadState('load');
  await sleep(1500);
  await page.evaluate(() => { localStorage.removeItem('martialdex:coach-oneoff-session'); localStorage.setItem('martialdex:coach-kind-pref', JSON.stringify({ last: 'martialdex', remember: true })); });
  await goto('#/coach/lesson');
  await page.locator('[data-testid="oneoff-request"]').fill('오늘 잽을 배우고 싶어');
  await page.locator('[data-testid="oneoff-build"]').click();
  await page.locator('[data-testid="oneoff-lesson"]').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="oneoff-answer"]')?.disabled, null, { timeout: 60000 });
  await page.locator('[data-testid="oneoff-answer"]').fill('잽의 핵심 포인트가 뭐예요?');
  await page.locator('[data-testid="oneoff-answer"]').press('Enter');
  const waitShown = await page.locator('[data-testid="local-model-wait"]').waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  const waitText = waitShown ? await page.locator('[data-testid="local-model-wait"]').textContent() : '';
  await sleep(2500);
  const t0 = Date.now();
  if (waitShown) await page.locator('[data-testid="local-model-wait-cancel"]').click().catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-testid="oneoff-answer"]')?.disabled, null, { timeout: 60000 });
  const afterCancelMs = Date.now() - t0;
  const ansH = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:coach-oneoff-session') ?? 'null')?.messages.filter((m) => m.role === 'coach' && m.kind === 'answer').map((m) => m.text).slice(-1)[0] ?? '');
  check('[H3] 로컬 모델 대기 중 경과 시간·제한(45초) 표시, "자료 원문으로 보기"로 바로 취소 → 자료 문장으로 수업 계속', waitShown && /최대 45초/.test(waitText) && afterCancelMs < 5000 && /기다리지 않고/.test(ansH) && (await page.locator('[data-testid="local-model-wait"]').count()) === 0, { waitText, afterCancelMs, ansH: ansH.slice(0, 200) });
  await page.evaluate(() => localStorage.removeItem('martialdex:coach-kind-pref'));
} else {
  console.log('SKIP — [H3] 로컬 모델 대기·취소: Ollama가 실행 중이 아니어서 건너뜀');
}

// ================================================================ I. a whole lesson with the 자체 AI 코치 (curriculum)
// explain → question → "모르겠어요" → re-explanation → the student says the key point → graded → feedback → next concept → … → video
await page.evaluate(() => { localStorage.removeItem('martialdex:ai-coach-day-run'); localStorage.removeItem('martialdex:coach-kind-pref'); });
await goto(DAY);
await page.locator('[data-testid="coach-pick-martialdex"]').click();
await page.locator('[data-testid="coach-pick-confirm"]').click();
await sleep(2500);
await resetCalls();
const lessonOf = async () => {
  const x = await run();
  return { run: x, lesson: x?.lessons?.[x.techniqueIds[x.index]] ?? null };
};
let saidDontKnow = false;
const trace = [];
for (let turn = 0; turn < 24; turn++) {
  const { run: x, lesson } = await lessonOf();
  if (!lesson?.pending || ['VIDEO', 'PRACTICE', 'PRE_PRACTICE_CHECK', 'COMPLETE'].includes(lesson.currentStage)) break;
  const p = lesson.pending;
  const coachTexts = x.messages.filter((m) => m.role === 'coach').map((m) => m.text);
  let answer;
  if (p.choice) answer = String.fromCharCode(65 + p.choice.answerIndex);
  else if (p.type === 'confirm') answer = '네 이해했어요';
  else if (!saidDontKnow && p.conceptId?.startsWith('kp-')) {
    answer = '모르겠어요';
    saidDontKnow = true;
  } else {
    // the student repeats what the coach taught, in their words: the quoted key point / the technique description
    const lastExplain = [...coachTexts].reverse().find((t) => /핵심은|정리하면|기술입니다|동작입니다|입니다\./.test(t)) ?? '';
    const quoted = lastExplain.match(/"([^"]{6,})"/)?.[1] ?? lastExplain.match(/핵심은 (.{6,}?)(?:하는 것)?입니다/)?.[1] ?? lastExplain.split(/[.!?]/)[0];
    answer = `${quoted.replace(/[“”"]/g, '').trim()}요`;
  }
  await send(answer);
  const after = await lessonOf();
  trace.push({ q: p.type, concept: p.conceptId, answer: answer.slice(0, 40), stage: after.lesson?.currentStage, done: after.lesson?.completedConcepts });
}
const fin = await lessonOf();
const msgs = fin.run.messages;
c = await calls();
const dontKnowAt = msgs.findIndex((m) => m.role === 'user' && m.text === '모르겠어요');
const reexplained = dontKnowAt >= 0 && msgs.slice(dontKnowAt + 1, dontKnowAt + 4).some((m) => m.role === 'coach' && (m.kind === 'explain' || m.kind === 'feedback'));
const understoodFeedback = msgs.some((m) => m.role === 'coach' && m.kind === 'feedback' && /짚으셨습니다|맞습니다|좋습니다/.test(m.text));
check('[I1] 자체 코치 수업: 설명 → 질문 → "모르겠어요" → 재설명 → 핵심을 말한 답 → 이해 판정 → 다음 개념, 영상/실습 단계까지 진행', reexplained && understoodFeedback && (fin.lesson?.completedConcepts?.length ?? 0) >= 2 && ['VIDEO', 'PRACTICE', 'PRE_PRACTICE_CHECK', 'COMPLETE'].includes(fin.lesson?.currentStage ?? fin.run.step?.toUpperCase()), { stage: fin.lesson?.currentStage, step: fin.run.step, done: fin.lesson?.completedConcepts, trace });
check('[I2] 수업 전체에서 Gemini 0회 · 웹 검색 0회 (채점은 결정론적)', c['ai:ask'].length === 0 && c['websearch:search'].length === 0, { ai: c['ai:ask'].length, web: c['websearch:search'].length, local: c['localai:ask'].length });
console.log('    수업 기록 (자체 코치):');
for (const m of msgs.slice(-40)) console.log(`      ${m.role === 'user' ? '학생' : `코치[${m.kind ?? ''}]`}: ${m.text.slice(0, 160)}`);

check('[Z] 페이지 오류 없음', errors.length === 0, errors);
await app.close();
const failed = results.filter((x) => !x.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
