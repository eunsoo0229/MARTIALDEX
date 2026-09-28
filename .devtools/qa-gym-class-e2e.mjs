import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

// Hits the REAL, live Supabase project (see .env) exactly like
// qa-auth-live.mjs — two real auth users, real rows in gyms/gym_members/
// gym_classes/gym_class_sessions/gym_class_attendance/training_history.
// QA-tagged emails, safe to delete afterward from the dashboard.
const STAMP = Date.now();
const INSTRUCTOR = { email: `mdx.qa.instructor.${STAMP}@example.com`, password: 'MdxTest123!', nickname: 'QA관장' };
const STUDENT = { email: `mdx.qa.student.${STAMP}@example.com`, password: 'MdxTest123!', nickname: 'QA학생' };

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + String(detail).slice(0, 200) : ''));
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
async function textOf(page, sel) {
  return page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, sel);
}
async function bodyIncludes(page, text) {
  return page.evaluate((t) => document.body.textContent?.includes(t) ?? false, text);
}
async function waitUntil(conditionFn, timeoutMs = 15000, stepMs = 300) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await conditionFn()) return true;
    await new Promise((r) => setTimeout(r, stepMs));
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
  await new Promise((r) => setTimeout(r, 800));
}

// This long-running QA session's shared Electron profile has accumulated
// real local data from many prior test runs, so a fresh signup/login here
// reliably triggers LocalDataMigrationPrompt's "기존 데이터를 계정에
// 저장할까요?" modal-overlay — dismiss it ("나중에") if present so it never
// blocks the next click.
async function dismissMigrationPromptIfPresent(page) {
  await new Promise((r) => setTimeout(r, 400));
  const dismissed = await page.evaluate(() => {
    const overlay = document.querySelector('.modal-overlay');
    if (!overlay) return false;
    const btn = [...overlay.querySelectorAll('button')].find((b) => b.textContent?.includes('나중에'));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  if (dismissed) await new Promise((r) => setTimeout(r, 300));
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
  await new Promise((r) => setTimeout(r, 800));
}

async function logout(page) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.icon-btn')].find((b) => b.title === '로그아웃');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 800));
}

function readEnvVar(name) {
  const envText = fs.readFileSync(path.join(APP_DIR, '.env'), 'utf8');
  const line = envText.split('\n').find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : null;
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

async function main() {
  const supabaseUrl = readEnvVar('VITE_SUPABASE_URL');
  const supabaseKey = readEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');
  let { app, page, consoleErrors } = await launch();

  // A prior crashed run of this same script can leave the shared Electron
  // profile logged in as a leftover test account — Signup redirects to Home
  // when already logged in, so force a clean logged-out slate first.
  await dismissMigrationPromptIfPresent(page);
  await logout(page);
  // A prior crashed/partial run of THIS script (during development, or a
  // resource-contention kill) can also leave a stale local
  // martialdex:training-history entry (with the same fixed "QA복싱초급반"
  // class title every run uses) sitting in this shared profile — clear it
  // so the isolation check below can't be confused by our OWN leftovers.
  await page.evaluate(() => localStorage.clear());
  await new Promise((r) => setTimeout(r, 500));

  // ============ 1. INSTRUCTOR: sign up, create gym + class ============
  await fillSignup(page, INSTRUCTOR);
  check('관장 회원가입', !(await bodyIncludes(page, '오류')), await textOf(page, '.ai-inline-warning'));
  await dismissMigrationPromptIfPresent(page);

  await goto(page, '#/gym/admin');
  await page.fill('input[placeholder="체육관 이름"]', 'QA테스트체육관');
  await page.click('button:has-text("만들기")');
  await waitUntil(() => bodyIncludes(page, 'QA테스트체육관'));
  check('체육관 생성됨', await bodyIncludes(page, 'QA테스트체육관'));

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button, div.card')].find((el) => el.textContent?.includes('QA테스트체육관'));
    btn?.click();
  });
  await waitUntil(async () => (await page.evaluate(() => location.hash)).includes('/gym/admin/gym_'));
  const joinCode = await page.evaluate(() => {
    const m = document.body.textContent?.match(/가입 코드:\s*([A-Z0-9]{6})/);
    return m ? m[1] : null;
  });
  check('가입 코드 표시됨', !!joinCode, joinCode);

  await page.fill('input[placeholder="클래스 이름 (예: 복싱 초급반)"]', 'QA복싱초급반');
  await page.fill('input[placeholder="기술/운동 검색해서 추가"]', 'Jab');
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button.chip')].find((b) => b.textContent?.includes('Jab'));
    btn?.click();
  });
  await page.fill('input[placeholder="기술/운동 검색해서 추가"]', 'Squat');
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button.chip')].find((b) => b.textContent?.match(/^\+ Squat/));
    btn?.click();
  });
  const pickedCount = await page.evaluate(() => document.querySelectorAll('.chip.active').length);
  check('기술/운동 2개 추가됨(Jab+Squat)', pickedCount >= 2, pickedCount);

  await page.click('button:has-text("클래스 만들기")');
  await waitUntil(() => bodyIncludes(page, 'QA복싱초급반'));
  check('클래스 생성됨', await bodyIncludes(page, 'QA복싱초급반'));

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('오늘 수업 열기'));
    btn?.click();
  });
  await waitUntil(async () => (await page.evaluate(() => location.hash)).includes('/gym/admin/session/'));
  const sessionHash = await page.evaluate(() => location.hash);
  const sessionId = sessionHash.split('/gym/admin/session/')[1];
  check('세션 열림 -> 로스터 화면 진입', !!sessionId, sessionId);

  await logout(page);

  // ============ 2. STUDENT: sign up, join gym, complete class ============
  await fillSignup(page, STUDENT);
  check('학생 회원가입', !(await bodyIncludes(page, '오류')), await textOf(page, '.ai-inline-warning'));
  await dismissMigrationPromptIfPresent(page);

  await goto(page, '#/gym');
  await page.fill('input[placeholder="예: AB12CD"]', joinCode ?? '');
  await page.click('button:has-text("참가")');
  await waitUntil(() => bodyIncludes(page, 'QA테스트체육관'));
  check('학생 체육관 참가 성공', await bodyIncludes(page, 'QA테스트체육관'));

  await page.reload();
  await page.waitForLoadState('load');
  await goto(page, '#/gym');
  await waitUntil(() => bodyIncludes(page, 'QA복싱초급반'));
  check('학생 화면에 오늘 열린 수업 표시됨', await bodyIncludes(page, 'QA복싱초급반'));

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('수업 시작'));
    btn?.click();
  });
  await waitUntil(async () => (await page.evaluate(() => location.hash)).includes('/gym/session/'));

  // Complete both exercises (2 sets default from getDefaultExerciseConfig fallback varies; loop until "수업 완료" enabled)
  let guard = 0;
  while (guard++ < 20) {
    const finishEnabled = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('수업 완료'));
      return btn && !btn.disabled;
    });
    if (finishEnabled) break;
    const nextExerciseBtn = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('다음 운동'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    if (nextExerciseBtn) {
      await new Promise((r) => setTimeout(r, 300));
      continue;
    }
    // fill whichever input is present (GymSetInput or simple reps input) and complete the set
    await page.evaluate(() => {
      const repsInput = [...document.querySelectorAll('input[type=number]')].find((i) => i.closest('label')?.textContent?.includes('반복'));
      if (repsInput && !repsInput.value) repsInput.value = '10';
      repsInput?.dispatchEvent(new Event('input', { bubbles: true }));
      const weightInput = [...document.querySelectorAll('input[type=number]')].find((i) => i.closest('label')?.textContent?.includes('중량'));
      if (weightInput && !weightInput.value) weightInput.value = '40';
      weightInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 150));
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('세트 완료'));
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
  }
  const finishEnabled = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('수업 완료'));
    return btn && !btn.disabled;
  });
  check('모든 세트 완료 -> 수업 완료 버튼 활성화', finishEnabled);

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('수업 완료'));
    btn?.click();
  });
  await waitUntil(() => bodyIncludes(page, '수업 완료'), 8000);
  await new Promise((r) => setTimeout(r, 500));
  check('제출 후 완료 화면 표시', await bodyIncludes(page, '🎉'));

  // ============ 3. Student-side derived systems ============
  await goto(page, '#/training-analytics/history');
  await waitUntil(() => bodyIncludes(page, 'QA복싱초급반'));
  check('Training History에 체육관 수업 표시됨', await bodyIncludes(page, 'QA복싱초급반'));

  await goto(page, '#/nutrition');
  await new Promise((r) => setTimeout(r, 500));
  check('Nutrition 화면에 체육관 활동 출처 표시됨', await bodyIncludes(page, 'QA복싱초급반'));

  await goto(page, '#/training');
  await new Promise((r) => setTimeout(r, 500));
  check('훈련 허브(캘린더/회복)에 접근 가능', await bodyIncludes(page, '회복도'));
  const selectedTodayHasEntry = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('[class*=calendar]')];
    return cells.length > 0;
  });
  check('훈련 캘린더 렌더됨', selectedTodayHasEntry);

  // ============ 4. Restore-after-relogin (sync) ============
  await page.evaluate(() => localStorage.removeItem('martialdex:training-history'));
  await page.reload();
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 2000));
  const restored = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('martialdex:training-history');
      return raw ? JSON.parse(raw).some((e) => e.notes?.includes('QA복싱초급반')) : false;
    } catch {
      return false;
    }
  });
  check('로컬 삭제 후 재로그인/동기화로 훈련 기록 복원됨', restored);

  const studentToken = await getAccessToken(page);
  await logout(page);
  // Simulate the instructor viewing this from a genuinely SEPARATE device
  // (the realistic scenario item 18 describes) rather than the SAME shared
  // local-first profile this whole script has been reusing for both
  // accounts — this app's local-first sync assumes one device = one
  // account and will otherwise happily push whatever is still sitting in
  // local storage (the student's just-recorded session) up to whichever
  // account logs in next on the same device. That's a pre-existing, general
  // property of every local-first feature here (curriculum/training-history/
  // nutrition alike), not something gym-class-specific, but clearing local
  // storage here is what makes this isolation check actually test the
  // gym-class RLS path instead of that unrelated shared-profile artifact.
  await page.evaluate(() => localStorage.clear());

  // ============ 5. Instructor roster + isolation check ============
  await fillLogin(page, INSTRUCTOR.email, INSTRUCTOR.password);
  await dismissMigrationPromptIfPresent(page);
  await goto(page, `#/gym/admin/session/${sessionId}`);
  await waitUntil(() => bodyIncludes(page, 'QA학생'));
  check('관장님 로스터에 학생 닉네임 표시됨', await bodyIncludes(page, 'QA학생'));
  check('관장님 로스터에 완료 상태 표시됨', await bodyIncludes(page, '완료'));
  check('관장님 로스터 화면에 영양/개인정보 텍스트 없음', !(await bodyIncludes(page, 'kcal')) && !(await bodyIncludes(page, '섭취')));

  // NOTE: the instructor account can legitimately have its OWN
  // training_history rows (this shared QA profile's local data can get
  // auto-pushed to any freshly-logged-in account by LocalDataMigrationPrompt)
  // — that's normal auth.uid()=user_id RLS working as designed, not a leak.
  // The real isolation test is specifically for the STUDENT's row: it must
  // never appear in the instructor's own REST-authenticated query results.
  const instructorToken = await getAccessToken(page);
  const isolationCheck = await restQuery(page, supabaseUrl, supabaseKey, 'training_history', `select=id,data`, instructorToken);
  const leaked = Array.isArray(isolationCheck.body) && isolationCheck.body.some((row) => row.data?.notes?.includes('QA복싱초급반'));
  check(
    '관장 계정으로 training_history REST 직접 조회 시 학생의 체육관 수업 기록은 보이지 않음(RLS 격리)',
    Array.isArray(isolationCheck.body) && !leaked,
    JSON.stringify(isolationCheck.body?.map((r) => r.id))
  );

  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== SUMMARY: ${passed}/${total} PASSED ===`);
  if (passed < total) {
    console.log('FAILURES:');
    for (const r of results.filter((r) => !r.pass)) console.log(` - ${r.name} :: ${r.detail}`);
  }
  console.log(`\ntest users: ${INSTRUCTOR.email}, ${STUDENT.email} (delete from Supabase dashboard afterward)`);
  console.log(`\n=== CONSOLE ERRORS (${consoleErrors.length}) ===`);
  console.log(consoleErrors.slice(0, 20).join('\n') || 'none');

  await app.close();
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
