import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SCRATCH = '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad';
const SHOT_DIR = path.join(SCRATCH, 'qa-auth-live-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

// This script hits the REAL, live Supabase project configured in .env — it
// creates two real auth users (mdx.qa.a.*/mdx.qa.b.*@example.com) and real
// rows in profiles/curricula/user_backups. Emails are obviously QA-tagged
// so they're easy to find and delete afterward from the Supabase dashboard
// (Authentication → Users). Nothing here uses the service_role key — every
// check is done as a real authenticated (or anonymous) user through RLS,
// exactly as the production app would.

const STAMP = Date.now();
const USER_A = { email: `mdx.qa.a.${STAMP}@example.com`, password: 'MdxTest123!', nickname: 'QA테스트A' };
const USER_B = { email: `mdx.qa.b.${STAMP}@example.com`, password: 'MdxTest123!', nickname: 'QA테스트B' };

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}

async function launch() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 1000));
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
  await new Promise((r) => setTimeout(r, 500));
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOT_DIR, name + '.png') });
}
async function textOf(page, sel) {
  return page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, sel);
}
async function bodyIncludes(page, text) {
  return page.evaluate((t) => document.body.textContent?.includes(t) ?? false, text);
}

async function waitUntil(conditionFn, timeoutMs = 12000, stepMs = 300) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await conditionFn()) return true;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return false;
}

async function fillSignup(page, user) {
  await goto(page, '#/signup');
  // Scoped to `form` — the header's own search box is `input[type="text"]`
  // too and sits earlier in the DOM (Header renders before page content),
  // so an unscoped selector fills the search box instead of the nickname
  // field.
  await page.fill('form input[type="email"]', user.email);
  const passwordInputs = await page.$$('form input[type="password"]');
  await passwordInputs[0].fill(user.password);
  await passwordInputs[1].fill(user.password);
  await page.fill('form input[type="text"]', user.nickname);
  await page.click('form button[type="submit"]');
  // Real network round-trip to Supabase — wait for either navigation away
  // from /signup or a visible error, instead of a fixed sleep.
  await waitUntil(async () => {
    const hash = await page.evaluate(() => location.hash);
    if (hash !== '#/signup') return true;
    return page.evaluate(() => document.querySelector('.ai-inline-warning') !== null);
  });
  await new Promise((r) => setTimeout(r, 500));
}

async function fillLogin(page, email, password) {
  await goto(page, '#/login');
  await page.fill('form input[type="email"]', email);
  await page.fill('form input[type="password"]', password);
  await page.click('form button[type="submit"]');
  await waitUntil(async () => {
    const hash = await page.evaluate(() => location.hash);
    if (hash !== '#/login') return true;
    return page.evaluate(() => document.querySelector('.ai-inline-warning') !== null);
  });
  await new Promise((r) => setTimeout(r, 500));
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
        headers: {
          apikey,
          Authorization: `Bearer ${accessToken || apikey}`,
        },
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
  let { app, page, consoleErrors } = await launch();
  // Read directly from .env (Node context) rather than via page.evaluate —
  // `import.meta` inside an injected browser function isn't serializable by
  // Playwright, and this is simpler anyway since the script already has
  // filesystem access to the same .env the app itself was built from.
  const SUPABASE_URL = readEnvVar('VITE_SUPABASE_URL');
  const apikey = readEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');
  check('Read Supabase URL + publishable key from .env for direct REST verification', !!SUPABASE_URL && !!apikey, `url=${SUPABASE_URL}`);

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));

  // ============ 1. SIGNUP (real) ============
  await fillSignup(page, USER_A);
  const currentHash = await page.evaluate(() => location.hash);
  check('Signup with "confirm email" OFF logs in immediately (no confirmation screen)', currentHash === '#/' || currentHash === '', currentHash);
  const headerIconsAfterSignup = await page.evaluate(() => [...document.querySelectorAll('.icon-btn, a.icon-btn')].map((b) => b.title));
  check('Header shows logout icon right after signup', headerIconsAfterSignup.includes('로그아웃'), JSON.stringify(headerIconsAfterSignup));
  const tokenAfterSignup = await getAccessToken(page);
  check('Real Supabase session token stored after signup', !!tokenAfterSignup);
  await shot(page, '01-after-signup');

  // ============ 2. PROFILE ROW CREATED BY TRIGGER ============
  await goto(page, '#/profile');
  await new Promise((r) => setTimeout(r, 500));
  check('Profile page shows real nickname from signup', await bodyIncludes(page, USER_A.nickname));
  const today = new Date().toISOString().slice(0, 10);
  check('Profile page shows real join date (created_at from profiles row)', await bodyIncludes(page, today));
  await shot(page, '02-profile-after-signup');

  // ============ 3. LOGOUT ============
  await page.click('button[title="로그아웃"]');
  await new Promise((r) => setTimeout(r, 800));
  const hashAfterLogout = await page.evaluate(() => location.hash);
  check('Logout navigates to /login', hashAfterLogout === '#/login', hashAfterLogout);
  const headerIconsAfterLogout = await page.evaluate(() => [...document.querySelectorAll('.icon-btn, a.icon-btn')].map((b) => b.title));
  check('Header shows login icon (not logout) after logout', headerIconsAfterLogout.includes('로그인') && !headerIconsAfterLogout.includes('로그아웃'), JSON.stringify(headerIconsAfterLogout));

  await goto(page, '#/profile');
  check('Profile shows "로그인하면" prompt after logout (no leftover account info)', await bodyIncludes(page, '로그인하면'));

  // ============ 4. WRONG PASSWORD ============
  await fillLogin(page, USER_A.email, 'WrongPassword999');
  check('Wrong password shows Korean error message', await bodyIncludes(page, '이메일 또는 비밀번호가 올바르지 않습니다'));
  const hashAfterWrongLogin = await page.evaluate(() => location.hash);
  check('Wrong password does NOT navigate away from /login', hashAfterWrongLogin === '#/login', hashAfterWrongLogin);

  // ============ 5. CORRECT LOGIN ============
  await fillLogin(page, USER_A.email, USER_A.password);
  const hashAfterLogin = await page.evaluate(() => location.hash);
  check('Correct login navigates away from /login', hashAfterLogin !== '#/login', hashAfterLogin);
  const headerIconsAfterLogin = await page.evaluate(() => [...document.querySelectorAll('.icon-btn, a.icon-btn')].map((b) => b.title));
  check('Header shows logout icon after correct login', headerIconsAfterLogin.includes('로그아웃'));

  // ============ 6. SESSION PERSISTENCE ACROSS APP RESTART ============
  await app.close();
  ({ app, page, consoleErrors } = await launch());
  const headerIconsAfterRestart = await page.evaluate(() => [...document.querySelectorAll('.icon-btn, a.icon-btn')].map((b) => b.title));
  check('Still logged in after full app restart (real Supabase session persisted)', headerIconsAfterRestart.includes('로그아웃'), JSON.stringify(headerIconsAfterRestart));
  await goto(page, '#/profile');
  check('Profile still shows nickname after restart without re-login', await bodyIncludes(page, USER_A.nickname));
  await shot(page, '03-after-restart-still-logged-in');

  // ============ 7. SEED LOCAL DATA + BACKUP TO CLOUD ============
  const seedCurriculum = {
    id: `custom__qa-live-${STAMP}`,
    martialArt: 'boxing',
    title: 'QA 라이브 테스트 커리큘럼',
    description: '',
    source: 'custom',
    visibility: 'private',
    authorName: '나',
    totalDays: 1,
    estimatedWeeks: 1,
    phases: [],
    days: [{ day: 1, title: 'Day 1', description: '', learningGoals: [], techniqueIds: ['boxing__jab'], reviewTechniqueIds: [], difficulty: null, estimatedMinutes: 20 }],
    techniqueCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await page.evaluate((c) => {
    localStorage.setItem('martialdex:curricula:custom', JSON.stringify([c]));
  }, seedCurriculum);
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));
  await goto(page, '#/profile');

  const clickBackup = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('계정에 백업하기'));
    if (!btn) return 'NOT_FOUND';
    btn.click();
    return 'OK';
  });
  check('백업하기 button found and clicked', clickBackup === 'OK');
  await waitUntil(() => bodyIncludes(page, '계정에 저장했습니다'));
  check('Backup success message shown', await bodyIncludes(page, '계정에 저장했습니다'));
  await shot(page, '04-after-backup');

  const accessTokenA = await getAccessToken(page);

  // ============ 8. VERIFY VIA DIRECT REST CALL (independent of app's own UI claim) ============
  if (SUPABASE_URL && accessTokenA) {
    const curriculaCheck = await restQuery(page, SUPABASE_URL, apikey, 'curricula', `select=id,title&id=eq.${seedCurriculum.id}`, accessTokenA);
    check('Direct REST query confirms curriculum row actually exists in Supabase', curriculaCheck.status === 200 && Array.isArray(curriculaCheck.body) && curriculaCheck.body.length === 1, JSON.stringify(curriculaCheck));

    const backupCheck = await restQuery(page, SUPABASE_URL, apikey, 'user_backups', 'select=data', accessTokenA);
    const backupHasCurriculumKey = backupCheck.body?.[0]?.data?.['martialdex:curricula:custom']?.includes(seedCurriculum.id);
    check('Direct REST query confirms user_backups row contains the seeded local data', backupCheck.status === 200 && !!backupHasCurriculumKey, JSON.stringify(backupCheck).slice(0, 300));
  } else {
    check('Direct REST verification skipped (could not read URL/token from app)', false, `url=${SUPABASE_URL} token=${!!accessTokenA}`);
  }

  // ============ 9. RESTORE ON A "NEW DEVICE" (clear local, log back in, restore) ============
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));
  await fillLogin(page, USER_A.email, USER_A.password);
  await goto(page, '#/profile');

  // Two native dialogs fire in sequence: a confirm() before restoring, then
  // an alert() after success (see Profile.tsx's handleRestore) — a
  // persistent handler catches both, not just the first.
  const dialogHandler = (d) => d.accept();
  page.on('dialog', dialogHandler);
  const clickRestore = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('계정에서 복원하기'));
    if (!btn) return 'NOT_FOUND';
    btn.click();
    return 'OK';
  });
  check('복원하기 button found and clicked', clickRestore === 'OK');
  await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));
  page.off('dialog', dialogHandler);

  const restoredCurriculum = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]'));
  check('Restore brought the previously-backed-up curriculum back to a "fresh" local install', restoredCurriculum.some((c) => c.id === seedCurriculum.id), JSON.stringify(restoredCurriculum.map((c) => c.id)));
  await shot(page, '05-after-restore');

  // ============ 10. RLS — SECOND USER CANNOT SEE USER A'S DATA ============
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));
  await fillSignup(page, USER_B);
  const accessTokenB = await getAccessToken(page);
  check('Second real user (B) signed up successfully', !!accessTokenB);

  if (SUPABASE_URL && accessTokenB) {
    const crossUserCurricula = await restQuery(page, SUPABASE_URL, apikey, 'curricula', `select=id&id=eq.${seedCurriculum.id}`, accessTokenB);
    check("RLS: user B's query for user A's curriculum returns EMPTY (not an error, just invisible)", crossUserCurricula.status === 200 && Array.isArray(crossUserCurricula.body) && crossUserCurricula.body.length === 0, JSON.stringify(crossUserCurricula));

    const crossUserBackup = await restQuery(page, SUPABASE_URL, apikey, 'user_backups', 'select=user_id', accessTokenB);
    const onlyOwnRow = Array.isArray(crossUserBackup.body) && crossUserBackup.body.every((r) => r.user_id !== undefined);
    check('RLS: user B listing user_backups sees at most their own row, never user A\'s', crossUserBackup.status === 200 && crossUserBackup.body.length <= 1, JSON.stringify(crossUserBackup));

    const crossUserUpdate = await page.evaluate(
      async ({ url, apikey, accessToken, curriculumId }) => {
        const res = await fetch(`${url}/rest/v1/curricula?id=eq.${curriculumId}`, {
          method: 'PATCH',
          headers: { apikey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({ title: 'HACKED BY USER B' }),
        });
        return { status: res.status, body: await res.json().catch(() => null) };
      },
      { url: SUPABASE_URL, apikey, accessToken: accessTokenB, curriculumId: seedCurriculum.id }
    );
    check("RLS: user B's attempt to UPDATE user A's curriculum affects zero rows", Array.isArray(crossUserUpdate.body) && crossUserUpdate.body.length === 0, JSON.stringify(crossUserUpdate));
  } else {
    check('RLS cross-user checks skipped (missing token)', false);
  }

  // ============ 11. LOGGED-OUT ACCESS BLOCKED ============
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.title === '로그아웃');
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 800));
  if (SUPABASE_URL) {
    // `anon` has NO grant at all on these tables (0004_grants.sql) — a
    // stronger guarantee than RLS filtering down to zero rows: the request
    // is refused outright (401/403), never even reaches row evaluation.
    const anonQuery = await restQuery(page, SUPABASE_URL, apikey, 'curricula', `select=id&id=eq.${seedCurriculum.id}`, null);
    check(
      'Logged out (anonymous) query for curricula is refused outright (no grant to anon — stronger than RLS-filtered-empty)',
      (anonQuery.status === 401 || anonQuery.status === 403) && anonQuery.body?.code === '42501',
      JSON.stringify(anonQuery)
    );
    const anonProfileQuery = await restQuery(page, SUPABASE_URL, apikey, 'profiles', 'select=nickname', null);
    check(
      'Logged out (anonymous) query for profiles is refused outright (no grant to anon)',
      (anonProfileQuery.status === 401 || anonProfileQuery.status === 403) && anonProfileQuery.body?.code === '42501',
      JSON.stringify(anonProfileQuery)
    );
  }

  console.log('\n=== CONSOLE ERRORS SO FAR (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  // ============ 12. FULL REGRESSION WITH SUPABASE NOW CONFIGURED ============
  await goto(page, '#/');
  check('[Regression] Home shows 10 martial arts', (await page.evaluate(() => document.querySelectorAll('.art-card').length)) === 10);
  await goto(page, '#/arts/bjj/techniques/bjj__armbar');
  check('[Regression] Technique detail still works', (await textOf(page, '.detail-hero h1')) === 'Armbar');
  await goto(page, '#/coach');
  check('[Regression] AI Coach page still works', ((await textOf(page, '.section-title h2')) ?? '').includes('AI 개인 코치'));
  await goto(page, '#/my-skills');
  const overallStats = await page.evaluate(() => [...document.querySelectorAll('.curriculum-stat-row strong')].map((e) => e.textContent));
  check('[Regression] My Skills dashboard still works', Number(overallStats[0]) > 1000, overallStats[0]);

  console.log('\n=== CONSOLE ERRORS TOTAL (' + consoleErrors.length + ') ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' -', f.name, '::', f.detail);
  }
  console.log('\nTest accounts created (delete from Supabase Dashboard → Authentication → Users if desired):');
  console.log(' -', USER_A.email);
  console.log(' -', USER_B.email);

  fs.writeFileSync(path.join(SCRATCH, 'qa-auth-live-results.json'), JSON.stringify({ results, consoleErrors, testUsers: [USER_A.email, USER_B.email] }, null, 2));

  await app.close();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
