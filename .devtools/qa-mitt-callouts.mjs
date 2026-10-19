// AI Visualizing Mitt — pad-holder calls ("잽!") during 콤보 연속 실행 and the
// 🎯 공격 지시 (미트 콜) drill. Real Electron app + real technique DB.
// speechSynthesis.speak is replaced by a RECORDER (text + performance.now());
// step changes of the runner are recorded by a MutationObserver so each call
// can be timed against the moment its technique starts.
// Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-callouts-'));
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  const d = typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (d ? ' :: ' + d.slice(0, 700) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
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
    // a fake engine that behaves like a real one: starts, then FINISHES ~0.4 s later (the mitt waits for the end)
    window.speechSynthesis.speak = (u) => {
      window.__spoken.push({ text: u.text, at: performance.now() });
      setTimeout(() => u.onstart?.(new Event('start')), 10);
      setTimeout(() => u.onend?.(new Event('end')), 400);
    };
  });
  const goto = async (hash) => {
    await page.evaluate(() => { window.location.hash = '#/'; });
    await sleep(300);
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    await sleep(1300);
  };
  const watchSteps = () => page.evaluate(() => {
    window.__steps = [];
    const el = document.querySelector('[data-testid="mitt-runner"]');
    const obs = new MutationObserver(() => window.__steps.push({ step: el.dataset.step, rep: el.dataset.rep, at: performance.now() }));
    obs.observe(el, { attributes: true, attributeFilter: ['data-step'] });
    window.__stepObs = obs;
  });

  const comboId = await page.evaluate(async () => (await import('/src/lib/visualMitt/combos.ts')).listDbCombos().find((x) => x.name === 'Jab → Cross → Low Kick').id);

  // ---------- [C1] voice mode, continuous run: a call for every technique, ahead of it ----------
  await goto(`#/coach/mitt?combo=${encodeURIComponent(comboId)}&mode=voice`);
  const reason = await page.locator('[data-testid="mitt-drill-reason"]').textContent();
  const reps = Number(reason.match(/(\d+)회/)?.[1]);
  await page.locator('[data-testid="mitt-runner-speed-normal"]').click();
  await page.evaluate(() => { window.__spoken = []; });
  await watchSteps();
  await page.locator('[data-testid="mitt-runner-play"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="mitt-runner"]')?.dataset.done === 'true', null, { timeout: 60000 });
  await sleep(300);
  const spoken = await page.evaluate(() => window.__spoken);
  const steps = await page.evaluate(() => window.__steps);
  const calls = spoken.filter((s) => s.text.endsWith('!'));
  const expected = [];
  for (let r = 0; r < reps; r++) expected.push(`${r === reps - 1 && reps > 1 ? '마지막, ' : ''}잽!`, '크로스!', '로우킥!');
  check('[C1a] 음성 모드 콤보 연속 실행: 기술마다 콜 (잽! 크로스! 로우킥! × 반복, 마지막 반복은 "마지막, 잽!")', JSON.stringify(calls.map((c) => c.text)) === JSON.stringify(expected), { reps, calls: calls.map((c) => c.text) });
  check('[C1b] 콜이 "마지막"을 말했으므로 "마지막 1회입니다." 중복 안내 없음', !spoken.some((s) => s.text.includes('마지막 1회입니다')), spoken.map((s) => s.text));
  // step-start moments (data-step changes); the first technique starts with the run, its call is matched separately
  const leads = steps.map((st, i) => {
    const c = calls[i + 1];
    return c ? Math.round(st.at - c.at) : null;
  }).filter((x) => x !== null);
  // the call must FINISH (≈0.4 s of speech) the 말 끝 → 미트 gap (default 0.3 s) before its technique → starts ≈0.7 s ahead
  check('[C1c] 콜은 말이 끝나고 간격(0.3초) 뒤에 해당 기술이 시작되도록 미리 나옴 — 늦게 따라오지 않음', leads.length >= 3 && leads.slice(3).every((d) => d >= 550 && d <= 900), { leads });
  check('[C1d] 끝난 뒤 완료 안내 1회', spoken.filter((s) => s.text.startsWith('좋습니다.')).length === 1, spoken.slice(-2).map((s) => s.text));

  // ---------- [C2] callouts off → no calls, the host's last-rep line comes back ----------
  await page.locator('[data-testid="mitt-runner-restart"]').waitFor();
  await page.locator('[data-testid="mitt-runner-callouts"]').uncheck();
  await page.evaluate(() => { window.__spoken = []; });
  await page.locator('[data-testid="mitt-runner-restart"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="mitt-runner"]')?.dataset.done === 'true', null, { timeout: 60000 });
  await sleep(300);
  const spokenOff = (await page.evaluate(() => window.__spoken)).map((s) => s.text);
  check('[C2] 🗣 공격 콜 끄면 기술 콜 없음, "마지막 1회입니다." 안내는 그대로', !spokenOff.some((t) => t.endsWith('!')) && spokenOff.some((t) => t.includes('마지막 1회입니다')), spokenOff);

  // ---------- [C3] text mode: no speech, but the call word is shown on the stage ----------
  await goto(`#/coach/mitt?combo=${encodeURIComponent(comboId)}&mode=text`);
  await page.evaluate(() => { window.__spoken = []; });
  check('[C3a] 글 모드에는 🗣 공격 콜 스위치 없음', (await page.locator('[data-testid="mitt-runner-callouts"]').count()) === 0);
  await page.locator('[data-testid="mitt-runner-play"]').click();
  await sleep(5300);
  const shown = new Set();
  for (let i = 0; i < 30; i++) {
    const t = await page.locator('[data-testid="mitt-runner-callout"]').textContent().catch(() => null);
    if (t) shown.add(t);
    await sleep(80);
  }
  await page.locator('[data-testid="mitt-runner-stop"]').click();
  check('[C3b] 글 모드: 화면에 콜 표시(잽! 크로스! 로우킥!), 음성은 없음', ['잽!', '크로스!', '로우킥!'].every((w) => shown.has(w)) && (await page.evaluate(() => window.__spoken.length)) === 0, [...shown]);

  // ---------- [C4] 🎯 공격 지시 drill ----------
  await goto('#/coach/mitt?mode=voice');
  await page.locator('[data-testid="mitt-tab-command"]').click();
  await page.locator('[data-testid="command-drill"]').waitFor();
  await page.locator('[data-testid="command-pace-fast"]').click();
  await page.locator('[data-testid="command-round-60"]').click();
  await page.evaluate(() => { window.__spoken = []; });
  await page.locator('[data-testid="command-start"]').click();
  await sleep(1500);
  const cd = await page.locator('[data-testid="command-ready-countdown"] strong').textContent().catch(() => null);
  check('[C4a] 시작하면 5초 준비 카운트다운 (그동안 지시 없음)', ['3', '4'].includes(cd) && (await page.evaluate(() => window.__spoken.length)) === 0, { cd });
  await sleep(4000);
  const frames = [];
  for (let i = 0; i < 70; i++) {
    frames.push(await page.evaluate(() => ({
      call: document.querySelector('[data-testid="command-call"]')?.textContent ?? null,
      front: !!document.querySelector('[data-testid="mitt-front"]'),
      hit: document.querySelector('[data-testid="mitt-front"]')?.dataset.hit ?? null,
      called: Number(document.querySelector('[data-testid="command-drill"]')?.dataset.called),
    })));
    await sleep(100);
  }
  const cmdSpoken = (await page.evaluate(() => window.__spoken)).map((s) => s.text);
  const allowedWord = /^(바디 )?(잽|크로스|훅|뒷손 훅|어퍼|뒷손 어퍼)$|^(더블 잽|원투|원투 훅|원투 훅 투)$/;
  const words = cmdSpoken.flatMap((t) => t.replace(/!$/, '').split(', '));
  check('[C4b] 7초 동안 지시 3번 이상, 모두 "…!" 형태의 기본 펀치 (킥 포함 꺼짐)', cmdSpoken.length >= 3 && cmdSpoken.every((t) => t.endsWith('!')) && words.every((w) => allowedWord.test(w)), cmdSpoken);
  check('[C4c] 같은 지시를 연달아 반복하지 않음', cmdSpoken.every((t, i) => i === 0 || t !== cmdSpoken[i - 1]), cmdSpoken);
  check('[C4d] 화면: 지시 문구 표시 + 미트 잡이가 미트를 내밀고 타격 표시(hit)까지 그려짐', frames.some((f) => f.call && f.front) && frames.some((f) => f.hit === 'true') && frames.at(-1).called >= 3, { last: frames.at(-1), calls: [...new Set(frames.map((f) => f.call))] });
  await page.locator('[data-testid="command-stop"]').click();
  await sleep(300);
  const end = (await page.evaluate(() => window.__spoken)).map((s) => s.text).at(-1);
  check('[C4e] 그만하기 → 마무리 안내 + 종료 상태', /지시 \d+번까지 연습했습니다/.test(end) && (await page.locator('[data-testid="command-drill"]').getAttribute('data-done')) === 'true', end);

  // ---------- [C5] 단타 only, kicks on ----------
  await page.locator('[data-testid="command-level-single"]').click();
  await page.locator('[data-testid="command-kicks"]').check();
  await page.evaluate(() => { window.__spoken = []; });
  await page.locator('[data-testid="command-start"]').click();
  await sleep(5300 + 9000);
  await page.locator('[data-testid="command-stop"]').click();
  const single = (await page.evaluate(() => window.__spoken)).map((s) => s.text).filter((t) => t.endsWith('!'));
  check('[C5] 단타 + 킥 포함: 지시마다 기술 하나 (쉼표 없음)', single.length >= 3 && single.every((t) => !t.includes(',')), single);

  check('[C6] 페이지 오류 없음', errors.length === 0, errors);
  const exited = new Promise((r) => app.process().once('exit', r));
  await app.evaluate(({ app: a }) => { setTimeout(() => a.quit(), 0); });
  await exited;
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
