// LIVE Supabase QA: 커리큘럼 삭제가 실제 DB에서 성공하는지, 동기화 경합 중에도
// 되살아나지 않는지, 재로그인(새 기기) 후에도 다시 나타나지 않는지 검증.
// Creates one throwaway @example.com test account (same pattern as the other *-supabase-live scripts).
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const STAMP = Date.now();
const USER = { email: `mdx.qa.curdel.${STAMP}@example.com`, password: 'MdxTest123!', nickname: 'QA삭제' };
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (!pass && detail ? ' :: ' + detail : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function readEnvVar(name) {
  const line = fs.readFileSync(path.join(APP_DIR, '.env'), 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : null;
}
async function launch(dir) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(1000);
  return { app, page };
}
async function waitUntil(fn, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await sleep(300);
  }
  return false;
}
const goto = async (page, hash) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await sleep(700);
};

async function main() {
  const URL = readEnvVar('VITE_SUPABASE_URL');
  const apikey = readEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');
  const rest = (page, query) =>
    page.evaluate(
      async ({ URL, apikey, query }) => {
        const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
        const token = key ? JSON.parse(localStorage.getItem(key)).access_token : apikey;
        const res = await fetch(`${URL}/rest/v1/curricula?${query}`, { headers: { apikey, Authorization: `Bearer ${token}` } });
        return { status: res.status, body: await res.json().catch(() => null) };
      },
      { URL, apikey, query }
    );

  let { app, page } = await launch(fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-curdel-a-')));
  await goto(page, '#/signup');
  await page.fill('form input[type="email"]', USER.email);
  const pw = await page.$$('form input[type="password"]');
  await pw[0].fill(USER.password);
  await pw[1].fill(USER.password);
  await page.fill('form input[type="text"]', USER.nickname);
  await page.click('form button[type="submit"]');
  const signedIn = await waitUntil(async () => !!(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token')))));
  check('[0] 테스트 계정 가입/로그인', signedIn);
  await sleep(1500);
  // Dismiss any migration prompt so only the automatic sync runs.
  const ids = await page.evaluate(async () => {
    const svc = await import('/src/lib/curriculum/curriculumService.ts');
    const mk = (t) => svc.createCustomCurriculum({ title: t, description: '', martialArt: 'boxing', visibility: 'private' }).id;
    return { a: mk('LIVE 커리큘럼 A'), b: mk('LIVE 커리큘럼 B'), c: mk('LIVE 커리큘럼 C') };
  });
  const uploaded = await waitUntil(async () => ((await rest(page, `select=id&id=in.(${Object.values(ids).join(',')})`)).body ?? []).length === 3, 20000);
  check('[1] 커리큘럼 3개 Supabase 업로드 (자동 동기화)', uploaded);

  // Delete B through the UI while a sync is also in flight (the old resurrection race).
  await goto(page, `#/learning/boxing/${ids.b}`);
  page.once('dialog', (d) => d.accept());
  await page.evaluate(async () => {
    const { syncCurriculaBidirectional } = await import('/src/lib/cloudSync/curriculumSync.ts');
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data } = await supabase.auth.getSession();
    void syncCurriculaBidirectional(data.session.user.id); // deliberately overlapping
  });
  await page.locator('.detail-actions button:has-text("삭제")').click();
  const left = await waitUntil(async () => (await page.evaluate(() => location.hash)) === '#/learning/boxing', 20000);
  check('[2] UI 삭제: 서버 확인 후에만 목록으로 이동', left);
  let row = await rest(page, `select=id&id=eq.${ids.b}`);
  check('[3] Supabase에서 실제 행 삭제됨 (REST 조회 0건)', row.status === 200 && Array.isArray(row.body) && row.body.length === 0, JSON.stringify(row));
  await sleep(4000); // let every debounced sync settle
  const local = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]').map((c) => c.id));
  row = await rest(page, `select=id&id=eq.${ids.b}`);
  check('[4] 동기화 경합 후에도 로컬/서버 모두 되살아나지 않음', !local.includes(ids.b) && row.body.length === 0, JSON.stringify({ local, row: row.body }));
  const tomb = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:curricula:deleted') || '{}'));
  check('[5] 서버 삭제 확인 후 툴스톤 정리', !(ids.b in tomb), JSON.stringify(tomb));
  const others = await rest(page, `select=id&id=in.(${ids.a},${ids.c})`);
  check('[6] 다른 커리큘럼(A, C)은 서버에 그대로', (others.body ?? []).length === 2);

  // Reload → still gone.
  await page.reload();
  await page.waitForLoadState('load');
  await sleep(3000);
  const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]').map((c) => c.id));
  check('[7] 새로고침 후에도 삭제 유지', !afterReload.includes(ids.b) && afterReload.includes(ids.a));
  await app.close();

  // Fresh device + re-login → cloud pull must not bring B back.
  ({ app, page } = await launch(fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-curdel-b-'))));
  await goto(page, '#/login');
  await page.fill('form input[type="email"]', USER.email);
  await page.fill('form input[type="password"]', USER.password);
  await page.click('form button[type="submit"]');
  await waitUntil(async () => (await page.evaluate(() => location.hash)) !== '#/login');
  const restored = await waitUntil(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]').length)) >= 2, 20000);
  const reLogin = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]').map((c) => c.id));
  check('[8] 재로그인(새 기기): A, C만 복원, 삭제한 B는 없음', restored && !reLogin.includes(ids.b) && reLogin.includes(ids.a) && reLogin.includes(ids.c), JSON.stringify(reLogin));

  // Delete the last two from this device.
  for (const id of [ids.a, ids.c]) {
    await goto(page, `#/learning/boxing/${id}`);
    page.once('dialog', (d) => d.accept());
    const t0 = Date.now();
    await page.locator('.detail-actions button:has-text("삭제")').click();
    const ok = await waitUntil(async () => (await page.evaluate(() => location.hash)) === '#/learning/boxing', 60000);
    check(`[9-${id.slice(-4)}] 새 기기에서 삭제 완료 (${Date.now() - t0}ms)`, ok);
  }
  const none = await rest(page, `select=id&id=in.(${ids.a},${ids.b},${ids.c})`);
  check('[9] 마지막 커리큘럼까지 삭제 → 서버 0건', (none.body ?? []).length === 0, JSON.stringify(none));
  await app.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  console.log('Test account created (delete from Supabase Dashboard afterward if desired):', USER.email);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
