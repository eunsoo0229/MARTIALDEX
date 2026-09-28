import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

// Reproduces the reported bug live: a deleted custom curriculum used to
// reappear within ~800ms because curriculumRepository had no delete
// tombstone, so syncCurriculaBidirectional's pull loop treated "cloud still
// has it, local doesn't" as "cloud has something new" and re-pulled it.
// Fixed by adding the same tombstone pattern already used by
// trainingHistory/gymRoutine/nutrition-meals repositories.

const STAMP = Date.now();
const USER_A = { email: `mdx.qa.curdel.a.${STAMP}@example.com`, password: 'MdxTest123!', nickname: 'QA삭제A' };

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function launch() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  let page = null;
  for (let i = 0; i < 30 && !page; i++) {
    page = app.windows().find((w) => w.url().startsWith('http://localhost:5173'));
    if (!page) await sleep(300);
  }
  if (!page) page = await app.firstWindow();
  await page.waitForLoadState('load');
  await sleep(1000);
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  return { app, page, consoleErrors };
}

async function goto(page, hash) {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
  await sleep(500);
}
async function waitUntil(conditionFn, timeoutMs = 12000, stepMs = 300) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await conditionFn()) return true;
    await sleep(stepMs);
  }
  return false;
}

async function fillSignup(page, user) {
  await goto(page, '#/signup');
  await page.fill('form input[type="email"]', user.email);
  const passwordInputs = await page.$$('form input[type="password"]');
  await passwordInputs[0].fill(user.password);
  await passwordInputs[1].fill(user.password);
  await page.fill('form input[type="text"]', user.nickname);
  await page.click('form button[type="submit"]');
  await waitUntil(async () => {
    const hash = await page.evaluate(() => location.hash);
    if (hash !== '#/signup') return true;
    return page.evaluate(() => document.querySelector('.ai-inline-warning') !== null);
  });
  await sleep(500);
}

async function getAccessToken(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!key) return null;
    try {
      return JSON.parse(localStorage.getItem(key)).access_token ?? null;
    } catch {
      return null;
    }
  });
}

async function restQuery(page, url, apikey, table, query, accessToken) {
  return page.evaluate(
    async ({ url, apikey, table, query, accessToken }) => {
      const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
        headers: { apikey, Authorization: `Bearer ${accessToken || apikey}` },
      });
      const status = res.status;
      const body = await res.json().catch(() => null);
      return { status, body };
    },
    { url, apikey, table, query, accessToken }
  );
}

function readEnvVar(name) {
  const envText = fs.readFileSync(path.join(APP_DIR, '.env'), 'utf8');
  const line = envText.split('\n').find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : null;
}

async function main() {
  const { app, page, consoleErrors } = await launch();
  const SUPABASE_URL = readEnvVar('VITE_SUPABASE_URL');
  const apikey = readEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('load');
  await sleep(800);

  await fillSignup(page, USER_A);
  const token = await getAccessToken(page);
  check('[1] 실제 Supabase 회원가입 및 로그인 성공', !!token);

  // Seed a real custom curriculum via the actual UI-facing service (not raw
  // localStorage), then confirm it's synced to Supabase.
  const curriculumId = await page.evaluate(async () => {
    const { createCustomCurriculum, addDay, addTechniqueToDay, saveCustomCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    const { allTechniques } = await import('/src/lib/loadData.ts');
    const bjj = allTechniques.filter((t) => t.martialArt === 'bjj');
    let c = createCustomCurriculum({ title: 'QA 삭제 테스트 커리큘럼', description: 'qa', martialArt: 'bjj', visibility: 'private' });
    c = addDay(c);
    c = addTechniqueToDay(c, 1, bjj[0].id);
    saveCustomCurriculum(c);
    return c.id;
  });
  check('[2] 커리큘럼 생성됨', !!curriculumId);

  await sleep(2500);
  let cloudBefore = null;
  if (SUPABASE_URL && token) {
    cloudBefore = await restQuery(page, SUPABASE_URL, apikey, 'curricula', `select=id&id=eq.${curriculumId}`, token);
  }
  check(
    '[3] 생성한 커리큘럼이 Supabase curricula 테이블에 자동 반영됨',
    cloudBefore?.status === 200 && cloudBefore.body?.length === 1,
    JSON.stringify(cloudBefore)
  );

  // ---- THE BUG: delete locally, then check it does NOT come back ----
  await goto(page, `#/learning/bjj/${curriculumId}`);
  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('삭제'))?.click();
  });
  await sleep(500);

  const localGoneImmediately = await page.evaluate(async (id) => {
    const { getCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    return getCurriculum(id) === undefined;
  }, curriculumId);
  check('[4] 삭제 직후 로컬에서 즉시 제거됨', localGoneImmediately);

  // This is exactly the window (~800ms debounce) where the bug used to
  // resurrect the curriculum via the automatic bidirectional sync.
  await sleep(3000);

  const stillGoneAfterSyncWindow = await page.evaluate(async (id) => {
    const { getCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    return getCurriculum(id) === undefined;
  }, curriculumId);
  check(
    '[5] 자동 동기화 창(3초) 이후에도 커리큘럼이 다시 살아나지 않음 (버그 수정 확인)',
    stillGoneAfterSyncWindow
  );

  let cloudAfter = null;
  if (SUPABASE_URL && token) {
    cloudAfter = await restQuery(page, SUPABASE_URL, apikey, 'curricula', `select=id&id=eq.${curriculumId}`, token);
  }
  check(
    '[6] Supabase curricula 테이블에서도 실제로 삭제됨 (더 이상 존재하지 않음)',
    cloudAfter?.status === 200 && cloudAfter.body?.length === 0,
    JSON.stringify(cloudAfter)
  );

  const progressCloudAfter = await restQuery(page, SUPABASE_URL, apikey, 'curriculum_progress', `select=curriculum_id&curriculum_id=eq.${curriculumId}`, token);
  check(
    '[7] Supabase curriculum_progress 테이블에서도 함께 삭제됨',
    progressCloudAfter?.status === 200 && progressCloudAfter.body?.length === 0,
    JSON.stringify(progressCloudAfter)
  );

  // ---- Navigating away and back (a real app restart) never resurrects it ----
  await app.close();
  const relaunched = await launch();
  await goto(relaunched.page, `#/learning/bjj`);
  const bodyAfterRestart = await relaunched.page.evaluate(() => document.body.innerText);
  check(
    '[8] 앱 재시작 후에도 삭제한 커리큘럼이 목록에 다시 나타나지 않음',
    !bodyAfterRestart.includes('QA 삭제 테스트 커리큘럼'),
    bodyAfterRestart.slice(0, 400)
  );

  check('[규약] 콘솔/페이지 에러 없음', consoleErrors.length === 0 && relaunched.consoleErrors.length === 0, JSON.stringify([...consoleErrors, ...relaunched.consoleErrors].slice(0, 5)));

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== SUMMARY: ${passed}/${results.length} PASSED ===`);
  if (passed < results.length) {
    console.log('FAILURES:');
    for (const r of results) if (!r.pass) console.log(' - ' + r.name + ' :: ' + r.detail);
  }
  console.log('\nTest account created (delete from Supabase Dashboard afterward if desired):', USER_A.email);

  await relaunched.app.close();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
