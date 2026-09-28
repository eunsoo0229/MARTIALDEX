import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const { testEmail, password } = JSON.parse(fs.readFileSync('/tmp/qa-multidevice-account2.json', 'utf8'));

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function launchDevice(profileDir) {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  cleanEnv.GEMINI_MODEL = 'gemini-3.5-flash'; // gemini-3.6-flash's free-tier daily quota is exhausted from this session's earlier testing
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${profileDir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);
  return { app, page };
}

async function login(page, email, pw) {
  await page.evaluate(() => {
    location.hash = '#/login';
  });
  await sleep(500);
  await page.evaluate(
    ({ email, pw }) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(document.querySelector('input[type=email]'), email);
      document.querySelector('input[type=email]').dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(document.querySelector('input[type=password]'), pw);
      document.querySelector('input[type=password]').dispatchEvent(new Event('input', { bubbles: true }));
    },
    { email, pw }
  );
  await page.click('button:has-text("로그인")');
  await sleep(1500);
}

async function main() {
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-ai-goal-sync-A-'));
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-ai-goal-sync-B-'));

  // ---- Device A: generate + save a real AI 맞춤 커리큘럼, then log in ----
  let device = await launchDevice(dirA);
  let { page } = device;

  const saved = await page.evaluate(async () => {
    const { generateGoalCurriculumPreview, saveGoalCurriculumPreview } = await import('/src/lib/aiCurriculum/service.ts');
    const result = await generateGoalCurriculumPreview({
      freeText: '킥복싱 로우킥 방어를 강화하고 싶어',
      martialArt: 'kickboxing',
      durationDays: 14,
      dailyMinutes: 30,
    });
    if (!result.ok) return { ok: false, result };
    const curriculum = saveGoalCurriculumPreview(result.preview);
    return { ok: true, curriculum };
  });
  check('[16 setup] AI 맞춤 커리큘럼 생성 + 저장 성공 (device A)', saved.ok, JSON.stringify(saved).slice(0, 300));

  await login(page, testEmail, password);
  await sleep(2500);
  const pushOfferVisible = await page.evaluate(() => document.body.innerText.includes('기존 데이터를 계정에 저장할까요?'));
  if (pushOfferVisible) {
    await page.click('button:has-text("저장하기")');
    await sleep(1500);
  }
  const pushedRows = await page.evaluate(async (id) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data: sess } = await supabase.auth.getSession();
    const { data, error } = await supabase.from('curricula').select('id, data').eq('user_id', sess.session.user.id).eq('id', id);
    return { data, error: error?.message };
  }, saved.curriculum?.id);
  check('[16] AI 맞춤 커리큘럼이 Supabase curricula 테이블에 자동 업로드됨', pushedRows.data?.length === 1 && !!pushedRows.data[0].data.aiGoalMeta, JSON.stringify(pushedRows).slice(0, 300));
  await device.app.close();

  // ---- Device B: fresh profile, log into the SAME account -> expect the AI 맞춤 커리큘럼 to come back automatically ----
  device = await launchDevice(dirB);
  page = device.page;
  await login(page, testEmail, password);
  await sleep(2500);

  const restored = await page.evaluate(async (id) => {
    const { getCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    return getCurriculum(id);
  }, saved.curriculum?.id);
  check(
    '[17] 다른 기기 로그인 -> AI 맞춤 커리큘럼이 자동 복원됨 (버튼 클릭 없이)',
    !!restored && !!restored.aiGoalMeta && restored.days.length === saved.curriculum.days.length,
    JSON.stringify({ found: !!restored, hasMeta: !!restored?.aiGoalMeta, days: restored?.days?.length })
  );
  // Postgres JSONB does not preserve object key order, so compare
  // canonicalized (key-sorted) JSON rather than raw JSON.stringify —
  // otherwise this would be a false failure on identical content.
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce((acc, k) => {
          acc[k] = canonical(value[k]);
          return acc;
        }, {});
    }
    return value;
  }
  check(
    '[17b] 복원된 커리큘럼도 빈 Day 없이 완전히 동일 (내용 손상 없음)',
    JSON.stringify(canonical(restored?.days)) === JSON.stringify(canonical(saved.curriculum?.days)),
    JSON.stringify({ restoredDay1: restored?.days?.[0], savedDay1: saved.curriculum?.days?.[0] }).slice(0, 400)
  );

  const restoredProgressCheck = await page.evaluate((id) => {
    location.hash = `#/learning/kickboxing/${id}`;
  }, saved.curriculum?.id);
  await sleep(500);
  const text = await page.evaluate(() => document.body.innerText);
  check('[17c] 복원된 커리큘럼도 훈련하기 버튼이 정상 작동', text.includes('훈련하기'), text.slice(0, 200));

  await device.app.close();

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
