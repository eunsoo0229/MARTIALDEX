import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const accounts = JSON.parse(fs.readFileSync('/tmp/qa-addteq-accounts.json', 'utf8'));
const [userA, userB] = accounts;

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function launchDevice(profileDir) {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${profileDir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);
  return { app, page };
}

async function loginViaSupabase(page, email, password) {
  // Sign in directly through the app's real Supabase client (same client
  // the whole app uses) so the session is genuinely established, rather
  // than driving the login form (already covered by other QA suites).
  return page.evaluate(async ({ email, password }) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { ok: !error, userId: data?.user?.id ?? null, error: error?.message };
  }, { email, password });
}

async function main() {
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-addteq-a-'));
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-addteq-b-'));

  // ============ USER A ============
  let device = await launchDevice(dirA);
  let { page } = device;
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('A: pageerror: ' + err.message));

  const loginA = await loginViaSupabase(page, userA.email, userA.password);
  check('[사전] 사용자 A 로그인', loginA.ok, JSON.stringify(loginA));
  await sleep(1500); // let the login-triggered sync list (incl. add_teq pull) run

  // ---- TEST 1: existing official technique -> existing id, no add_teq row ----
  const test1 = await page.evaluate(async () => {
    const { discoverTechnique } = await import('/src/lib/techniqueDiscovery/service.ts');
    return discoverTechnique({ name: 'Rear Naked Choke', martialArt: 'bjj', userId: (await (await import('/src/lib/supabase/client.ts')).supabase.auth.getSession()).data.session?.user.id ?? null });
  });
  check('[TEST 1] 기존 공식 기술 요청 -> 기존 ID 반환, AI 호출 없음', test1.status === 'existing' && test1.techniqueId === 'bjj__rear-naked-choke' && test1.usedInternetResearch === false, JSON.stringify(test1));

  // ---- TEST 2: genuinely missing real technique -> internet verify -> add_teq -> techniqueId ----
  const test2 = await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id ?? null;
    const { discoverTechnique } = await import('/src/lib/techniqueDiscovery/service.ts');
    const outcome = await discoverTechnique({
      name: 'Twister',
      martialArt: 'bjj',
      description: 'a spinal lock combining a crotch ride with a neck crank, popularized by 10th Planet Jiu-Jitsu',
      userId,
    });
    return { outcome, userId };
  });
  check(
    '[TEST 2] 존재하지 않는 실제 기술("Twister") 요청 -> 검증 -> add_teq 등록 -> techniqueId 반환',
    !!test2.outcome.techniqueId && (test2.outcome.status === 'new' || test2.outcome.status === 'variant'),
    JSON.stringify(test2.outcome)
  );
  const twisterId = test2.outcome.techniqueId;

  // Verify directly against the REAL Supabase add_teq table (not just the local cache) — proves it actually landed in the shared table, not just localStorage.
  const rowCheck = twisterId
    ? await page.evaluate(async (id) => {
        const { supabase } = await import('/src/lib/supabase/client.ts');
        const { data, error } = await supabase.from('add_teq').select('id, martial_art, name, status, data').eq('id', id);
        return { error: error?.message, rows: data };
      }, twisterId)
    : null;
  check('[TEST 2] Supabase add_teq 테이블에 실제로 1개 행이 저장됨', !!rowCheck && !rowCheck.error && rowCheck.rows.length === 1, JSON.stringify(rowCheck));
  check('[TEST 2] status가 기본값 pending으로 저장됨', rowCheck?.rows?.[0]?.status === 'pending', String(rowCheck?.rows?.[0]?.status));

  // ---- TEST 3: same technique requested again -> found in add_teq, no duplicate row, same id ----
  const test3 = await page.evaluate(async () => {
    const { discoverTechnique } = await import('/src/lib/techniqueDiscovery/service.ts');
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data: session } = await supabase.auth.getSession();
    return discoverTechnique({ name: 'Twister', martialArt: 'bjj', userId: session.session?.user.id ?? null });
  });
  check('[TEST 3] 동일 기술 재요청 -> add_teq에서 발견, 동일 techniqueId 반환', test3.status === 'existing' && test3.techniqueId === twisterId && test3.usedInternetResearch === false, JSON.stringify(test3));

  const rowCountAfter = twisterId
    ? await page.evaluate(async (id) => {
        const { supabase } = await import('/src/lib/supabase/client.ts');
        const { count } = await supabase.from('add_teq').select('id', { count: 'exact', head: true }).eq('name', 'Twister');
        return count;
      }, twisterId)
    : null;
  check('[TEST 3] add_teq에 "Twister" 중복 행이 생성되지 않음(정확히 1개)', rowCountAfter === 1, String(rowCountAfter));

  // ---- TEST 5-lite: alternate phrasing dedup (RNC family, spec section 10) ----
  const dedupPhrases = await page.evaluate(async (userId) => {
    const { discoverTechnique } = await import('/src/lib/techniqueDiscovery/service.ts');
    const names = ['RNC', 'rear naked choke', '리어 네이키드 초크', 'Rear Naked Choke Submission'];
    const out = [];
    for (const name of names) out.push(await discoverTechnique({ name, martialArt: 'bjj', userId }));
    return out;
  }, loginA.userId);
  check(
    '[section 10] RNC/rear naked choke/리어 네이키드 초크/Rear Naked Choke Submission 모두 동일 기술로 처리됨',
    dedupPhrases.every((o) => o.techniqueId === 'bjj__rear-naked-choke'),
    JSON.stringify(dedupPhrases)
  );

  await device.app.close();

  // ============ USER B (different account/device) ============
  device = await launchDevice(dirB);
  page = device.page;
  page.on('pageerror', (err) => consoleErrors.push('B: pageerror: ' + err.message));
  const loginB = await loginViaSupabase(page, userB.email, userB.password);
  check('[사전] 사용자 B 로그인(다른 계정)', loginB.ok, JSON.stringify(loginB));
  await sleep(1500);

  // ---- TEST 8: different user resolves the add_teq technique user A discovered ----
  const test8 = await page.evaluate(async (id) => {
    const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
    return resolveTechnique(id);
  }, twisterId);
  check('[TEST 8] 사용자 B가 사용자 A가 발견한 add_teq 기술을 resolve 가능', test8?.id === twisterId && test8?.name === 'Twister', JSON.stringify(test8));

  // 사용자 B가 검색으로도 찾을 수 있는지 (동일 techniqueId 사용, 재등록 없이)
  const test8b = await page.evaluate(async (userId) => {
    const { discoverTechnique } = await import('/src/lib/techniqueDiscovery/service.ts');
    return discoverTechnique({ name: 'Twister', martialArt: 'bjj', userId });
  }, loginB.userId);
  check('[TEST 8/2] 사용자 B가 동일 기술을 다시 발견 요청해도 재등록 없이 동일 ID 사용', test8b.techniqueId === twisterId && test8b.status === 'existing', JSON.stringify(test8b));

  // 기술 상세 페이지에서 정상 렌더링
  await page.evaluate((id) => { location.hash = `#/arts/bjj/techniques/${id}`; }, twisterId);
  await sleep(500);
  const bodyText = await page.evaluate(() => document.body.innerText);
  check('[TEST 8] 기술 상세 페이지에서 정상 렌더링됨', bodyText.includes('Twister'), bodyText.slice(0, 200));

  check('[regression] 콘솔/페이지 에러 없음', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  await device.app.close();

  fs.writeFileSync('/tmp/qa-addteq-twister-id.json', JSON.stringify({ twisterId }));

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' -', f.name, '::', f.detail);
  }
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
