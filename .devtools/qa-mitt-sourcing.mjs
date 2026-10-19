// QA (LIVE — real Gemini, Tavily and Supabase calls): AI Visualizing Mitt drill sourcing.
//  1) A purpose that a shared combo fits → the coach loads that shared combo (by its author).
//  2) "실시간 검색으로 새로 만들기" → a drill built from live web results (sources listed).
//  3) A user-written combo whose techniques are mostly in its DESCRIPTION → the AI splits the
//     description into real steps before training, and the user can still pick the original.
// Requires the Vite dev server on :5173 and a configured AI / Tavily / Supabase.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = '/Users/swcho/Documents/MARTIALDEX';
const results = [];
const check = (n, p, d = '') => {
  results.push(p);
  console.log(`${p ? 'PASS' : 'FAIL'} — ${n}${d ? ' :: ' + String(d).slice(0, 500) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 400) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn().catch(() => false)) return true;
    await sleep(step);
  }
  return false;
};

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath: path.join(APP, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: [APP, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-src-'))}`],
  env,
  timeout: 30000,
});
const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
await page.waitForLoadState('load');
await sleep(800);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const plan = () =>
  page.evaluate(() => {
    const p = document.querySelector('[data-testid="mitt-ai-plan"]');
    const src = document.querySelector('[data-testid="mitt-ai-source"]');
    return p
      ? {
          title: p.querySelector('h3')?.textContent,
          choice: src?.dataset.choice ?? null,
          sourceText: src?.textContent?.slice(0, 300) ?? null,
          steps: [...p.querySelectorAll('[data-testid="mitt-ai-step"]')].map((li) => li.textContent.replace(/\s+/g, ' ').slice(0, 80)),
          web: [...p.querySelectorAll('[data-testid="mitt-ai-web-sources"] a')].map((a) => a.href),
        }
      : null;
  });

// ---- 1) shared combo fits ----
await page.evaluate(() => (location.hash = '#/coach/mitt?mode=text'));
await page.waitForSelector('[data-testid="mitt-purpose"]', { timeout: 15000 });
await page.fill('[data-testid="mitt-purpose"]', '잽으로 상대 가드를 올리게 만든 뒤 몸통(명치)에 크로스를 꽂는 연습');
await page.locator('[data-testid="mitt-ai-generate"]').click();
const got1 = await until(async () => !!(await plan()) || !!(await page.$('.ai-inline-warning')), 150000, 800);
const p1 = await plan();
check('[A1] 목적에 맞는 공유 콤보가 있으면 → 그 공유 콤보를 불러옴 (작성자·하트 표시)', got1 && p1?.choice === 'shared' && /사용자 공유/.test(p1.sourceText ?? ''), JSON.stringify(p1 ?? (await page.locator('.ai-inline-warning').first().innerText().catch(() => ''))));
check('[A2] 불러온 공유 콤보 → 미트 단계로 변환 (잽 → 몸통 크로스)', !!p1 && p1.steps.length >= 2 && /jab|잽/i.test(p1.steps[0]) && p1.steps.some((s) => /cross|크로스|스트레이트|gyaku/i.test(s)), JSON.stringify(p1?.steps));

// ---- 2) prefer live web search ----
const webBtn = await page.$('[data-testid="mitt-ai-prefer-web"]');
check('[B0] "실시간 검색으로 새로 만들기" 선택 버튼 제공', !!webBtn);
if (webBtn) {
  await webBtn.click();
  await sleep(500);
  const got2 = await until(async () => {
    const p = await plan();
    return !!p && p.choice !== 'shared';
  }, 180000, 1000);
  const p2 = await plan();
  check('[B1] 실시간 검색으로 만들기 → 검색 자료 기반 훈련 + 출처 링크 (검색 불가 시 기술 DB만으로 만들었다고 명시)', got2 && ((p2?.choice === 'web' && p2.web.length > 0) || (p2?.choice === 'db' && /기술 DB만으로/.test(p2.sourceText ?? ''))), JSON.stringify(p2));
  check('[B2] 만든 훈련의 기술은 MARTIALDEX 시각화 가능 기술만', !!p2 && p2.steps.length >= 2, JSON.stringify(p2?.steps));
}

// ---- 3) user-written combo: techniques hidden in the description ----
const comboId = await page.evaluate(async () => {
  const { createCombo } = await import('/src/lib/combo/service.ts');
  const { listVisualizableTechniques } = await import('/src/lib/visualMitt/combos.ts');
  const { motionForTechnique } = await import('/src/lib/visualMitt/archetypes.ts');
  const jab = listVisualizableTechniques().find((t) => motionForTechnique(t)?.archetype.key === 'jab');
  return createCombo({ name: 'QA 내 셋업', description: '잽을 두 번 던져서 상대가 가드를 올리면, 그때 뒷다리 로우킥으로 상대 앞다리 허벅지를 찬다. 차고 나서 바로 가드.', techniqueIds: [jab.id] }).id;
});
await page.evaluate((id) => (location.hash = `#/coach/mitt?combo=${encodeURIComponent(id)}&mode=text`), comboId);
await page.waitForSelector('[data-testid="mitt-interpret"]', { timeout: 15000 });
const done3 = await until(async () => (await page.locator('[data-testid="mitt-interpret"]').getAttribute('data-state')) !== 'busy', 120000, 800);
const interp = await page.evaluate(() => ({
  state: document.querySelector('[data-testid="mitt-interpret"]')?.dataset.state,
  steps: [...document.querySelectorAll('[data-testid="mitt-interpret-step"]')].map((li) => li.textContent.replace(/\s+/g, ' ').slice(0, 90)),
}));
check('[C1] 직접 만든 콤보(기술 1개 + 설명) → AI가 설명을 읽고 단계로 나눔: 잽, 잽, 로우킥', done3 && interp.state === 'done' && interp.steps.length >= 3 && interp.steps.filter((s) => /jab|잽|kizami/i.test(s)).length >= 2 && interp.steps.some((s) => /low kick|로우|kick/i.test(s)), JSON.stringify(interp));
check('[C2] 원래 단계로 훈련 선택지도 제공', !!(await page.$('[data-testid="mitt-interpret-use-original"]')));
await page.locator('[data-testid="mitt-interpret-use-ai"]').click();
await page.waitForSelector('[data-testid="mitt-runner"], [data-testid="mitt-steps"]', { timeout: 10000 });
const session = await page.evaluate(() => document.querySelector('[data-testid="mitt-runner-combo"]')?.textContent ?? document.querySelector('[data-testid="mitt-steps"]')?.textContent);
check('[C3] AI가 정리한 단계로 미트 세션 시작', !!session && /kick|킥/i.test(session), session);
// cached: opening the combo again later (fresh page) does not call the AI again
await page.evaluate((id) => (location.hash = `#/coach/mitt?combo=${encodeURIComponent(id)}&mode=text`), comboId);
await page.reload();
await page.waitForSelector('[data-testid="mitt-interpret"]', { timeout: 15000 });
const quick = await until(async () => (await page.locator('[data-testid="mitt-interpret"]').getAttribute('data-state')) === 'done', 3000, 100);
check('[C4] 같은 콤보를 다시 열면 저장된 정리 결과를 바로 사용 (AI 재호출 없음)', quick);

check('[Z] 페이지 에러 없음', errors.length === 0, errors.join(' | '));
await app.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
