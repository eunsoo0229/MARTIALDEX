import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dotenv from 'dotenv';

dotenv.config({ quiet: true, path: path.join('/Users/swcho/Documents/MARTIALDEX', '.env') });
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const accounts = JSON.parse(fs.readFileSync('/tmp/qa-marketplace-accounts.json', 'utf8'));
const PASSWORD = 'TestPassw0rd!23456';
const [seller, buyer, thirdParty] = accounts;

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

async function callEdge(page, actionName, requestParams) {
  const body = JSON.stringify({ action: actionName, ...requestParams });
  return page.evaluate(
    async ([supabaseUrl, anonKey, requestBody]) => {
      const mod = await import('/src/lib/supabase/client.ts');
      const { data: sess } = await mod.supabase.auth.getSession();
      const token = sess.session.access_token;
      const res = await fetch(supabaseUrl + '/functions/v1/payment-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: 'Bearer ' + token },
        body: requestBody,
      });
      const json = await res.json();
      return { status: res.status, json };
    },
    [SUPABASE_URL, SUPABASE_ANON_KEY, body]
  );
}

async function main() {
  const dirSeller = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-pay-seller-'));
  const dirBuyer = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-pay-buyer-'));
  const dirThird = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-pay-third-'));
  const consoleErrors = [];

  // ============ SELLER: publish a real paid listing ============
  let device = await launchDevice(dirSeller);
  let { page } = device;
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  const curriculumId = await page.evaluate(async () => {
    const { createCustomCurriculum, addDay, addTechniqueToDay, saveCustomCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    let c = createCustomCurriculum({ title: 'QA 결제 보안 테스트', description: '보안 테스트', martialArt: 'judo', visibility: 'private' });
    c = addDay(c);
    c = addTechniqueToDay(c, 1, 'judo__o-goshi');
    return saveCustomCurriculum(c).id;
  });
  await login(page, seller.email, PASSWORD);
  await sleep(2000);

  const listingId = await page.evaluate(async ({ curriculumId, sellerId }) => {
    const { getCurriculum, saveCustomCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    const { publishCurriculumToMarketplace } = await import('/src/lib/marketplace/service.ts');
    const c = getCurriculum(curriculumId);
    const res = await publishCurriculumToMarketplace({
      curriculum: c, sellerUserId: sellerId, sellerNickname: 'QA판매자', title: c.title, description: 'test',
      difficulty: 'beginner', coverIcon: '🥋', priceKrw: 10000, tags: [], targetAudience: '', learningGoals: [],
    });
    saveCustomCurriculum({ ...c, marketplaceListingId: res.data.id });
    return res.data.id;
  }, { curriculumId, sellerId: seller.id });
  check('[setup] 유료(10,000원) 리스팅 게시', !!listingId);

  // Extra listings for the cancel/failure paths — MUST be published while
  // still logged in as the seller (publishCurriculumToMarketplace's insert
  // is RLS-gated to seller_user_id = auth.uid(), so this cannot be done
  // from the buyer's session later).
  const cancelListingId = await page.evaluate(async (sellerId) => {
    const { createCustomCurriculum, addDay, saveCustomCurriculum, getCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    const { publishCurriculumToMarketplace } = await import('/src/lib/marketplace/service.ts');
    let c = createCustomCurriculum({ title: 'QA 취소 테스트', description: '', martialArt: 'sambo', visibility: 'private' });
    c = addDay(c);
    c = saveCustomCurriculum(c);
    const res = await publishCurriculumToMarketplace({
      curriculum: getCurriculum(c.id), sellerUserId: sellerId, sellerNickname: 'QA판매자', title: c.title, description: '', difficulty: 'beginner', coverIcon: null, priceKrw: 5000, tags: [], targetAudience: '', learningGoals: [],
    });
    return res.ok ? res.data.id : null;
  }, seller.id);
  check('[setup] 취소 테스트용 리스팅(5,000원) 게시', !!cancelListingId);

  const failListingId = await page.evaluate(async (sellerId) => {
    const { createCustomCurriculum, addDay, saveCustomCurriculum, getCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    const { publishCurriculumToMarketplace } = await import('/src/lib/marketplace/service.ts');
    let c = createCustomCurriculum({ title: 'QA 실패 테스트', description: '', martialArt: 'karate', visibility: 'private' });
    c = addDay(c);
    c = saveCustomCurriculum(c);
    const res = await publishCurriculumToMarketplace({
      curriculum: getCurriculum(c.id), sellerUserId: sellerId, sellerNickname: 'QA판매자', title: c.title, description: '', difficulty: 'beginner', coverIcon: null, priceKrw: 7000, tags: [], targetAudience: '', learningGoals: [],
    });
    return res.ok ? res.data.id : null;
  }, seller.id);
  check('[setup] 실패 테스트용 리스팅(7,000원) 게시', !!failListingId);

  await device.app.close();

  // ============ BUYER: full architecture-shape test + attack attempts ============
  device = await launchDevice(dirBuyer);
  page = device.page;
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  await login(page, buyer.email, PASSWORD);
  await sleep(2000);

  // ---- 4. 금액 검증: 클라이언트가 가격을 조작해서 보내도 무시되고 실제 리스팅 가격이 쓰임 ----
  const tamperedCreate = await callEdge(page, 'create_pending', { curriculumId: listingId, priceKrw: 1, amount: 1 });
  check('[4. 금액 검증] 클라이언트가 "1원"을 보내도 서버가 실제 가격(10,000원)으로 주문 생성', tamperedCreate.json.ok && tamperedCreate.json.order.priceKrw === 10000, JSON.stringify(tamperedCreate.json));
  const orderId = tamperedCreate.json.order.orderId;

  // ---- 14. 결제 상태 조작: finalize_marketplace_order를 직접 'paid'로 호출 시도 ----
  const directPaidAttempt = await page.evaluate(async (orderId) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { error } = await supabase.rpc('finalize_marketplace_order', { p_order_id: orderId, p_new_status: 'paid' });
    return { blocked: !!error, message: error?.message };
  }, orderId);
  check('[14. 결제 상태 조작][1. 클라이언트가 결제 성공 여부를 조작 불가] 클라이언트가 직접 주문을 paid로 전환 시도 -> 차단됨(FORBIDDEN_DIRECT_PAID_TRANSITION)', directPaidAttempt.blocked && directPaidAttempt.message.includes('FORBIDDEN_DIRECT_PAID_TRANSITION'), JSON.stringify(directPaidAttempt));

  // ---- 14. order_id 조작: 존재하지 않는 주문 id로 confirm 시도 ----
  const fakeOrderConfirm = await callEdge(page, 'confirm', { orderId: 'order_does_not_exist_xyz', providerReceipt: 'x' });
  check('[14. order_id 조작] 존재하지 않는 주문 id로 결제 승인 시도 -> 차단됨', !fakeOrderConfirm.json.ok && fakeOrderConfirm.json.code === 'ORDER_NOT_FOUND', JSON.stringify(fakeOrderConfirm.json));

  // ---- 7. 존재하지 않는 커리큘럼 구매 시도 ----
  const nonexistentListing = await callEdge(page, 'create_pending', { curriculumId: 'mkt_does_not_exist' });
  check('[7. 존재하지 않는 상품 구매] 존재하지 않는 커리큘럼 id로 주문 생성 시도 -> 차단됨', !nonexistentListing.json.ok && nonexistentListing.json.code === 'LISTING_NOT_FOUND', JSON.stringify(nonexistentListing.json));

  // ---- Now actually confirm the REAL pending order (legit path) ----
  const realConfirm = await callEdge(page, 'confirm', { orderId, providerReceipt: 'TEST_RECEIPT' });
  check('[6. 결제 성공 후 처리] 정상 결제 승인 -> 주문 상태 paid, paid_at 기록', realConfirm.json.ok && realConfirm.json.order.status === 'paid' && !!realConfirm.json.order.paidAt, JSON.stringify(realConfirm.json));

  // ---- 6. 중복 결제 방지: 같은 order를 다시 confirm ----
  const doubleConfirm = await callEdge(page, 'confirm', { orderId, providerReceipt: 'TEST_RECEIPT_2' });
  check('[6. 중복 결제 방지] 이미 paid된 주문을 다시 confirm해도 중복 처리되지 않음(그대로 paid 반환)', doubleConfirm.json.ok && doubleConfirm.json.order.status === 'paid', JSON.stringify(doubleConfirm.json));

  // ---- 7. 이미 구매한 커리큘럼 재구매 시도 ----
  const rePurchaseCreate = await callEdge(page, 'create_pending', { curriculumId: listingId });
  check('[7. 이미 구매한 커리큘럼 재구매] create_pending 재호출 시 새 pending 없이 기존 완료 주문 반환', rePurchaseCreate.json.ok && rePurchaseCreate.json.order.alreadyPurchased === true && rePurchaseCreate.json.order.orderId === orderId, JSON.stringify(rePurchaseCreate.json));

  // ---- 12. 구매 권한: 콘텐츠 접근 확인 ----
  const contentAccess = await page.evaluate(async (id) => {
    const { getMarketplaceCurriculumContent } = await import('/src/lib/marketplace/service.ts');
    return getMarketplaceCurriculumContent(id);
  }, listingId);
  check('[12. 구매 권한] 결제 완료 후 전체 콘텐츠 접근 가능', contentAccess.ok && !!contentAccess.data, '');

  // ---- 7. 결제 취소 흐름: 새 pending 주문을 만들고 취소 ----
  const cancelPending = await callEdge(page, 'create_pending', { curriculumId: cancelListingId });
  const cancelResult = await callEdge(page, 'cancel', { orderId: cancelPending.json.order.orderId, reason: 'user cancelled' });
  check('[7. 결제 취소 처리] 결제 취소 -> 주문 상태 cancelled', cancelResult.json.ok && cancelResult.json.order.status === 'cancelled', JSON.stringify(cancelResult.json));
  const contentAfterCancel = await page.evaluate(async (id) => {
    const { getMarketplaceCurriculumContent } = await import('/src/lib/marketplace/service.ts');
    return getMarketplaceCurriculumContent(id);
  }, cancelListingId);
  check('[7. 결제 취소 처리] 취소된 주문은 콘텐츠 접근 권한을 부여하지 않음', contentAfterCancel.ok && contentAfterCancel.data === null, '');

  // ---- 7. 결제 실패 시뮬레이션 ----
  const failPending = await callEdge(page, 'create_pending', { curriculumId: failListingId });
  const failResult = await callEdge(page, 'simulate_failure', { orderId: failPending.json.order.orderId, reason: '테스트: PG 승인 실패' });
  check('[7. 결제 실패 처리] 결제 실패 시뮬레이션 -> 주문 상태 failed', failResult.json.ok && failResult.json.order.status === 'failed', JSON.stringify(failResult.json));

  // ---- 5. 플랫폼 수수료: 정수 연산 재확인 (10,000원 * 10% = 1,000원, 9,000원) ----
  check('[5. 플랫폼 수수료] 10,000원의 10% 수수료 = 1,000원, 판매자 수익 = 9,000원 (정수)', realConfirm.json.order.platformFeeKrw === 1000 && realConfirm.json.order.sellerEarningKrw === 9000, '');

  // ---- 13. 환불(정산 예정액 계산용 상태) ----
  const refundResult = await callEdge(page, 'refund', { orderId });
  check('[13. 정산 예정액][환불] 환불 요청 -> 주문 상태 refunded', refundResult.json.ok && refundResult.json.order.status === 'refunded', JSON.stringify(refundResult.json));
  const contentAfterRefund = await page.evaluate(async (id) => {
    const { getMarketplaceCurriculumContent } = await import('/src/lib/marketplace/service.ts');
    return getMarketplaceCurriculumContent(id);
  }, listingId);
  check('[12. 구매 권한] 환불 후 콘텐츠 접근 권한이 서버 기준으로 취소됨(RLS)', contentAfterRefund.ok && contentAfterRefund.data === null, '');

  await device.app.close();

  // ============ THIRD PARTY: cross-user access / tampering attempts ============
  device = await launchDevice(dirThird);
  page = device.page;
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  await login(page, thirdParty.email, PASSWORD);
  await sleep(2000);

  // ---- 14. 다른 사용자의 주문 접근 ----
  const crossOrderAccess = await page.evaluate(async (orderId) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data } = await supabase.from('marketplace_orders').select('*').eq('id', orderId);
    return data;
  }, orderId);
  check('[14. 다른 사용자의 주문 접근] 제3자는 남의 주문을 조회할 수 없음(RLS, 빈 결과)', Array.isArray(crossOrderAccess) && crossOrderAccess.length === 0, JSON.stringify(crossOrderAccess));

  // ---- 14. 다른 사용자의 구매 권한(콘텐츠) 접근 ----
  const crossContentAccess = await page.evaluate(async (id) => {
    const { getMarketplaceCurriculumContent } = await import('/src/lib/marketplace/service.ts');
    return getMarketplaceCurriculumContent(id);
  }, listingId);
  check('[14. 다른 사용자의 구매 권한 접근] 구매하지 않은 제3자는 콘텐츠에 접근할 수 없음', crossContentAccess.ok && crossContentAccess.data === null, '');

  // ---- 14. 다른 사용자의 pending 주문을 confirm 시도 (order_id 탈취 시나리오) ----
  const hijackAttempt = await page.evaluate(async (orderId) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { error } = await supabase.rpc('finalize_marketplace_order', { p_order_id: orderId, p_new_status: 'cancelled' });
    return { blocked: !!error, message: error?.message };
  }, orderId);
  check('[14. order_id 조작][다른 사용자 주문 탈취] 남의 주문 id로 상태 변경 시도 -> 차단됨(NOT_YOUR_ORDER)', hijackAttempt.blocked && hijackAttempt.message.includes('NOT_YOUR_ORDER'), JSON.stringify(hijackAttempt));

  // ---- 14. 판매자 자신의 판매 데이터 조작(다른 사용자 관점에서 조작 시도) ----
  const statsTamperAttempt = await page.evaluate(async (id) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    await supabase.from('marketplace_curricula').update({ purchase_count: 88888, rating_avg: 5, price_krw: 1 }).eq('id', id);
    const { data } = await supabase.from('marketplace_curricula').select('purchase_count, rating_avg, price_krw').eq('id', id).maybeSingle();
    return data;
  }, listingId);
  check('[14. 판매자 자신의 판매 데이터 조작][9. 플랫폼 수수료 조작] 제3자의 다른 판매자 리스팅 조작 시도 -> 반영되지 않음', statsTamperAttempt && statsTamperAttempt.purchase_count !== 88888 && statsTamperAttempt.price_krw !== 1, JSON.stringify(statsTamperAttempt));

  // ---- Edge Function 자체 인증 게이트 (토큰 없이 호출) ----
  const noAuthAttempt = await page.evaluate(async ([supabaseUrl, anonKey]) => {
    const res = await fetch(supabaseUrl + '/functions/v1/payment-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ action: 'create_pending', curriculumId: 'anything' }),
    });
    return { status: res.status, json: await res.json() };
  }, [SUPABASE_URL, SUPABASE_ANON_KEY]);
  check('[8. Edge Function 보안] 로그인 토큰 없이 결제 요청 시도 -> 401 차단', noAuthAttempt.status === 401 && !noAuthAttempt.json.ok, JSON.stringify(noAuthAttempt));

  await device.app.close();

  check('[regression] 전체 흐름에서 콘솔/페이지 에러 없음', consoleErrors.length === 0, JSON.stringify(consoleErrors));

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
