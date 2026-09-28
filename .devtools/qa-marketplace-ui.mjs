import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const accounts = JSON.parse(fs.readFileSync('/tmp/qa-marketplace-accounts.json', 'utf8'));
const PASSWORD = 'TestPassw0rd!23456';
const [seller, buyer] = accounts;

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
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${profileDir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);
  return { app, page };
}

async function login(page, email, pw) {
  await page.evaluate(() => { location.hash = '#/login'; });
  await sleep(500);
  await page.evaluate(({ email, pw }) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(document.querySelector('input[type=email]'), email);
    document.querySelector('input[type=email]').dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(document.querySelector('input[type=password]'), pw);
    document.querySelector('input[type=password]').dispatchEvent(new Event('input', { bubbles: true }));
  }, { email, pw });
  await page.click('button:has-text("로그인")');
  await sleep(1500);
}

async function dismissMigrationPrompt(page) {
  await sleep(1000);
  const bodyText = await page.evaluate(() => document.body.innerText);
  if (bodyText.includes('클라우드 데이터가 있습니다')) {
    await page.click('button:has-text("이 기기 데이터를 클라우드에 저장")');
    await sleep(1200);
  } else if (bodyText.includes('저장할까요?')) {
    await page.click('button:has-text("저장하기")');
    await sleep(1200);
  }
}

async function main() {
  const dirSeller = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-market-ui-seller-'));
  const dirBuyer = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-market-ui-buyer-'));
  const consoleErrors = [];

  // ============ SELLER: create a curriculum, publish via the real UI form ============
  let device = await launchDevice(dirSeller);
  let { page } = device;
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  const curriculumId = await page.evaluate(async () => {
    const { createCustomCurriculum, addDay, addTechniqueToDay, saveCustomCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    let c = createCustomCurriculum({ title: 'QA UI 킥복싱 커리큘럼', description: 'UI 테스트', martialArt: 'kickboxing', visibility: 'private' });
    c = addDay(c);
    c = addTechniqueToDay(c, 1, 'kickboxing__jab');
    c = saveCustomCurriculum(c);
    return c.id;
  });

  await login(page, seller.email, PASSWORD);
  await sleep(2000);
  await dismissMigrationPrompt(page);

  await page.evaluate((id) => { location.hash = `#/learning/kickboxing/${id}`; }, curriculumId);
  await sleep(600);
  let bodyText = await page.evaluate(() => document.body.innerText);
  check('[UI][2. 커리큘럼 화면] "마켓에 게시" 버튼이 표시됨', bodyText.includes('마켓에 게시'), '');

  await page.click('a:has-text("마켓에 게시")');
  await sleep(600);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[UI][2. 판매 등록 화면] 게시 폼(이름/설명/난이도/가격/태그 등) 표시', bodyText.includes('커리큘럼 이름') && bodyText.includes('태그') && bodyText.includes('추천 대상') && bodyText.includes('학습 목표'), '');

  await page.fill('textarea', 'UI를 통해 게시한 테스트 커리큘럼입니다.');
  await page.uncheck('input[type="checkbox"]');
  await page.fill('input[type="number"]', '3000');
  const tagsInputs = await page.$$('input.select');
  // title input, tags input, target-audience input are all `input.select` — fill by order after the number input.
  await page.fill('input[placeholder*="초보자, 테이크다운"]', 'UI테스트, 킥복싱');
  await page.fill('input[placeholder*="주짓수를 막 시작한"]', 'UI 테스트 대상');
  await page.click('button:has-text("마켓에 게시")');
  await sleep(1200);

  const afterPublishUrl = await page.evaluate(() => location.href);
  check('[UI][2. 게시 완료] 게시 후 마켓 상세 페이지로 이동', /\/marketplace\/mkt_/.test(afterPublishUrl), afterPublishUrl);
  const listingId = afterPublishUrl.split('/marketplace/')[1];

  bodyText = await page.evaluate(() => document.body.innerText);
  check('[UI][3. 상세 페이지] 판매자 본인은 게시 즉시 전체 내용을 볼 수 있음', bodyText.includes('Day 1') && bodyText.includes('Day별 커리큘럼'), bodyText.slice(0, 300));

  await page.evaluate((id) => { location.hash = `#/learning/kickboxing/${id}`; }, curriculumId);
  await sleep(500);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[UI][2. 게시 후 상태] 같은 커리큘럼에서 다시 "마켓에서 보기"로 표시됨(중복 게시 아님)', bodyText.includes('마켓에서 보기') && !bodyText.includes('마켓에 게시'), '');

  await device.app.close();

  // ============ BUYER: browse via the UI, view gated detail, purchase via the UI button ============
  device = await launchDevice(dirBuyer);
  page = device.page;
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  await login(page, buyer.email, PASSWORD);
  await sleep(2000);
  await dismissMigrationPrompt(page);

  await page.evaluate(() => { location.hash = '#/marketplace'; });
  await sleep(600);
  await page.fill('input.filter-text-input', 'UI 킥복싱');
  await sleep(500);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[UI][1. 마켓플레이스 화면] 카드에 이름/제작자/무술/난이도/기간/기술개수/가격 표시', bodyText.includes('QA UI 킥복싱 커리큘럼') && bodyText.includes('제작자') && bodyText.includes('3,000원'), bodyText.slice(0, 400));

  await page.click('a:has-text("QA UI 킥복싱 커리큘럼")');
  await sleep(600);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[UI][3. 상세 페이지][구매 전 비공개] 구매 전에는 Day 내용이 보이지 않고 안내 문구만 표시', !bodyText.includes('Day별 커리큘럼') && bodyText.includes('공개되지 않습니다'), bodyText.slice(0, 400));
  check('[UI][5/6. 결제 시스템] 테스트 결제 안내 문구와 수수료 분해 표시', bodyText.includes('테스트 결제 안내') && bodyText.includes('플랫폼 수수료'), '');

  await page.click('button:has-text("테스트 구매")');
  await page.waitForSelector('text=주문번호', { timeout: 10000 });
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[UI][1. 결제 구조][31단계] 결제창(PaymentModal)이 서버가 계산한 실제 금액으로 표시됨', bodyText.includes('결제 금액') && bodyText.includes('3,000원') && bodyText.includes('주문번호'), bodyText.slice(bodyText.indexOf('주문번호') - 200, bodyText.indexOf('주문번호') + 100));

  await page.click('button:has-text("테스트 결제 진행")');
  await page.waitForFunction(() => !document.body.innerText.includes('처리 중'), { timeout: 15000 });
  await sleep(1500);
  bodyText = await page.evaluate(() => document.body.innerText);
  const afterPurchaseUrl = await page.evaluate(() => location.href);
  check('[UI][6. 결제 성공 후 처리][8. 잠금 해제] 서버 검증 완료 후 자동으로 내 커리큘럼 화면으로 이동', /\/learning\/kickboxing\//.test(afterPurchaseUrl), afterPurchaseUrl);

  check('[regression] 전체 흐름에서 콘솔/페이지 에러 없음', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  await device.app.close();

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
