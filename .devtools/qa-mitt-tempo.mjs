// QA: 미트 템포 sliders (콤보 속도 · 음성 → 미트 간격) in 공격 지시, 반응 훈련 and 콤보 연속 실행.
// Measures real on-screen timing: when the voice call was handed to speechSynthesis
// (window.speechSynthesis.speak is wrapped to timestamp it), and when each mitt hit shows.
// Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = '/Users/swcho/Documents/MARTIALDEX';
const results = [];
const check = (n, p, d = '') => {
  results.push(p);
  console.log(`${p ? 'PASS' : 'FAIL'} — ${n}${d ? ' :: ' + String(d).slice(0, 400) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath: path.join(APP, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: [APP, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-tempo-'))}`],
  env,
  timeout: 30000,
});
const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
await page.waitForLoadState('load');
await sleep(800);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

/** Sets a range input like a user drag (React listens to input events). */
async function setRange(testId, value) {
  await page.evaluate(
    ({ testId, value }) => {
      const el = document.querySelector(`[data-testid="${testId}"]`);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, String(value));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    { testId, value },
  );
}

/** Records voice calls and hit frames for `ms`. */
async function observe(ms) {
  return page.evaluate(async (ms) => {
    const calls = [];
    const hits = [];
    const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (u) => {
      const rec = { t: performance.now(), text: u.text, end: null };
      u.addEventListener('end', () => (rec.end = performance.now()));
      calls.push(rec);
      return orig(u);
    };
    let wasHit = false;
    const t0 = performance.now();
    await new Promise((res) => {
      const tick = () => {
        const f = document.querySelector('[data-testid="mitt-front"]');
        const hit = f?.dataset.hit === 'true';
        if (hit && !wasHit) hits.push(performance.now());
        wasHit = hit;
        if (performance.now() - t0 < ms) requestAnimationFrame(tick);
        else res();
      };
      tick();
    });
    window.speechSynthesis.speak = orig;
    return { calls, hits };
  }, ms);
}

await page.evaluate(() => (location.hash = '#/coach/mitt?mode=voice'));
await page.waitForSelector('[data-testid="mitt-tab-command"]', { timeout: 15000 });
await page.locator('[data-testid="mitt-tab-command"]').click();
await page.waitForSelector('[data-testid="command-drill"]');

// ---- sliders present, bounds ----
const bounds = await page.evaluate(() => {
  const s = document.querySelector('[data-testid="mitt-tempo-speed"]');
  const g = document.querySelector('[data-testid="mitt-tempo-gap"]');
  return { sMin: Number(s?.min), sMax: Number(s?.max), gMin: Number(g?.min), gMax: Number(g?.max) };
});
check('[T1] 공격 지시: 콤보 속도 바 + 음성→미트 간격 바 (최소·최대 범위 있음)', bounds.sMin === 250 && bounds.sMax === 1500 && bounds.gMin === 0 && bounds.gMax === 1200, JSON.stringify(bounds));
await setRange('mitt-tempo-speed', 1500); // right end = fastest (250 ms per technique)
await setRange('mitt-tempo-gap', 600);
const shown = await page.evaluate(() => ({ step: document.querySelector('[data-testid="mitt-tempo-speed"]').dataset.stepMs, gap: document.querySelector('[data-testid="mitt-tempo-gap"]').dataset.gapMs, label: document.querySelector('[data-testid="mitt-tempo-speed-value"]').textContent }));
check('[T2] 바 오른쪽 끝 = 실전 최고 속도 (기술 간격 0.25초), 간격 0.6초 표시', shown.step === '250' && shown.gap === '600' && /실전 최고 속도/.test(shown.label), JSON.stringify(shown));

// ---- measured timing in a round (combos only, so there are consecutive strikes) ----
await page.locator('[data-testid="command-level-combo"]').click();
await page.locator('[data-testid="command-voice"]').check().catch(() => {});
const obsP = observe(14000); // record from before the round starts so the first call is included
await sleep(100);
await page.locator('[data-testid="command-start"]').click();
const obs = await obsP;
// every spoken call that finished: its first hit comes gap (0.6 s) + glove travel (0.21 s) after the speech END
const ends = obs.calls.filter((c) => c.end !== null);
const endToHit = ends.map((c) => {
  const h = obs.hits.find((x) => x > c.end);
  return h ? Math.round(h - c.end) : null;
}).filter((x) => x !== null);
const callToEnd = ends.map((c) => Math.round(c.end - c.t));
check('[T3] 말이 끝난 뒤 → 첫 미트 타격 = 간격(0.6초) + 주먹 도달(0.21초) ≈ 0.81초 (말 시작 기준이 아님)', endToHit.length > 0 && endToHit.every((d) => Math.abs(d - 810) <= 120), JSON.stringify({ endToHit, speechMs: callToEnd }));
const diffs = [];
for (let i = 1; i < obs.hits.length; i++) diffs.push(Math.round(obs.hits[i] - obs.hits[i - 1]));
const inCombo = diffs.filter((d) => d < 600);
check('[T4] 콤보 안의 연속 타격 간격 ≈ 0.25초 (실제 미트 속도)', inCombo.length > 0 && inCombo.every((d) => Math.abs(d - 250) <= 60), JSON.stringify(diffs));
await page.locator('[data-testid="command-stop"]').click();

await setRange('mitt-tempo-gap', 0);
const obs0P = observe(10000);
await sleep(100);
await page.locator('[data-testid="command-start"]').click();
const obs0 = await obs0P;
const c0 = obs0.calls.find((c) => c.end !== null);
const h0 = c0 ? obs0.hits.find((h) => h > c0.end) : null;
const endToHit0 = c0 && h0 ? Math.round(h0 - c0.end) : null;
check('[T5] 간격 0 → 말이 끝나자마자 미트 (타격까지 ≈ 0.21초)', endToHit0 !== null && Math.abs(endToHit0 - 210) <= 100, String(endToHit0));
await page.locator('[data-testid="command-stop"]').click();

// ---- shared + remembered ----
await page.reload();
await page.waitForSelector('[data-testid="mitt-tab-react"]', { timeout: 15000 });
await page.locator('[data-testid="mitt-tab-react"]').click();
await page.waitForSelector('[data-testid="reaction-drill"]');
const react = await page.evaluate(() => ({ step: document.querySelector('[data-testid="mitt-tempo-speed"]')?.dataset.stepMs, gap: document.querySelector('[data-testid="mitt-tempo-gap"]')?.dataset.gapMs }));
check('[T6] 설정은 이 기기에 저장되고 반응 훈련에도 그대로 적용', react.step === '250' && react.gap === '0', JSON.stringify(react));

// ---- 반응 훈련: speech-end timing + 타격음 ----
await setRange('mitt-tempo-gap', 500);
await page.evaluate(() => {
  window.__osc = 0;
  const orig = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function () {
    window.__osc++;
    return orig.call(this);
  };
});
const robsP = observe(12000);
await sleep(100);
await page.locator('[data-testid="reaction-start"]').click();
const robs = await robsP;
await page.locator('[data-testid="reaction-stop"]').click().catch(() => {});
const rEnds = robs.calls.filter((c) => c.end !== null && c.text && !/수고|연습했습니다/.test(c.text));
const rEndToHit = rEnds.map((c) => {
  const h = robs.hits.find((x) => x > c.end);
  return h ? Math.round(h - c.end) : null;
}).filter((x) => x !== null);
check('[T9] 반응 훈련: 말이 끝난 뒤 간격(0.5초) + 주먹 도달(0.21초) ≈ 0.71초 뒤 첫 미트', rEndToHit.length > 0 && rEndToHit.every((d) => Math.abs(d - 710) <= 120), JSON.stringify(rEndToHit));
const osc = await page.evaluate(() => window.__osc);
check('[T10] 반응 훈련: 미트 타격마다 타격음 재생', robs.hits.length > 0 && osc >= robs.hits.length, `hits ${robs.hits.length} · sounds ${osc}`);

// ---- 콤보 연속 실행 ----
const comboId = await page.evaluate(async () => {
  const { listDbCombos } = await import('/src/lib/visualMitt/combos.ts');
  return listDbCombos().find((c) => c.steps.length >= 3 && c.steps.every((s) => s.motion.archetype.limb === 'hand'))?.id;
});
await page.evaluate((id) => (location.hash = `#/coach/mitt?combo=${encodeURIComponent(id)}&mode=voice`), comboId);
await page.waitForSelector('[data-testid="mitt-runner"]', { timeout: 15000 });
const runner = await page.evaluate(() => ({ step: document.querySelector('[data-testid="mitt-runner"]').dataset.stepMs, label: document.querySelector('[data-testid="mitt-runner-speed"]').textContent }));
check('[T7] 콤보 연속 실행: 저장된 속도(사용자가 바꾼 값)가 AI 추천 속도보다 우선', runner.step === '250' && runner.label === '실전 최고 속도', JSON.stringify(runner));
// moderate tempo so each call is heard in full (at 0.25 s a new call cuts the previous one off)
await setRange('mitt-tempo-speed', 250 + 1500 - 900); // 0.9 s per technique
await setRange('mitt-tempo-gap', 300);
await page.locator('[data-testid="mitt-runner-play"]').click();
await sleep(5200);
const ro = await page.evaluate(async () => {
  const calls = [];
  const starts = [];
  const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
  window.speechSynthesis.speak = (u) => {
    const rec = { t: performance.now(), end: null };
    u.addEventListener('end', () => (rec.end = performance.now()));
    calls.push(rec);
    return orig(u);
  };
  let last = '';
  const t0 = performance.now();
  await new Promise((res) => {
    const tick = () => {
      const r = document.querySelector('[data-testid="mitt-runner"]');
      const k = `${r.dataset.rep}:${r.dataset.step}`;
      if (k !== last) starts.push(performance.now());
      last = k;
      if (performance.now() - t0 < 9000 && r.dataset.done !== 'true') requestAnimationFrame(tick);
      else res();
    };
    tick();
  });
  window.speechSynthesis.speak = orig;
  return { calls, starts };
});
// after the speech-length estimate settles (first 3 calls), each call ENDS ≈ 0.3 s before its technique starts
const settled = ro.calls.slice(3).filter((c) => c.end !== null);
const endToStart = settled.map((c) => {
  const s2 = ro.starts.find((x) => x > c.end);
  return s2 ? Math.round(s2 - c.end) : null;
}).filter((x) => x !== null);
const speech = ro.calls.filter((c) => c.end !== null).map((c) => Math.round(c.end - c.t));
check('[T8] 콤보 연속 실행: 각 콜이 끝나고 간격(0.3초) 뒤에 그 기술 시작 (말 길이를 측정해 미리 부름)', endToStart.length >= 3 && endToStart.filter((d) => Math.abs(d - 300) <= 150).length >= Math.ceil(endToStart.length * 0.75), JSON.stringify({ endToStart, speech }));

check('[Z] 페이지 에러 없음', errors.length === 0, errors.join(' | '));
await app.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
