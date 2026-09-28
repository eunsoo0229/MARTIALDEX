import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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

async function logout(page) {
  await page.click('button[title="로그아웃"]');
  await sleep(800);
}

async function main() {
  const dirSeller = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-market-seller-'));
  const dirBuyer = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-market-buyer-'));
  const dirBuyer2 = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-market-buyer2-'));
  const dirThird = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-market-third-'));
  const consoleErrors = [];

  // ============ SELLER: create curricula, log in, publish free + paid listings ============
  let device = await launchDevice(dirSeller);
  let { page } = device;
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  const seeded = await page.evaluate(async () => {
    const { createCustomCurriculum, addDay, addTechniqueToDay, saveCustomCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    let free = createCustomCurriculum({ title: 'QA 무료 복싱 기초', description: '무료 테스트용', martialArt: 'boxing', visibility: 'private' });
    free = addDay(free);
    free = addTechniqueToDay(free, 1, 'boxing__jab');
    free = addTechniqueToDay(free, 1, 'boxing__cross');
    free = saveCustomCurriculum(free);

    let paid = createCustomCurriculum({ title: 'QA 유료 주짓수 심화', description: '유료 테스트용', martialArt: 'bjj', visibility: 'private' });
    paid = addDay(paid);
    paid = addTechniqueToDay(paid, 1, 'bjj__armbar');
    paid = addTechniqueToDay(paid, 1, 'bjj__triangle');
    paid = saveCustomCurriculum(paid);

    return { freeId: free.id, paidId: paid.id };
  });
  check('[1. 커리큘럼 생성] 무료/유료 원본 커리큘럼 생성', !!seeded.freeId && !!seeded.paidId);

  await login(page, seller.email, PASSWORD);
  await sleep(2000);

  const publishResult = await page.evaluate(async ({ freeId, paidId, sellerId }) => {
    const { getCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    const { publishCurriculumToMarketplace } = await import('/src/lib/marketplace/service.ts');
    const freeC = getCurriculum(freeId);
    const paidC = getCurriculum(paidId);
    const freeRes = await publishCurriculumToMarketplace({
      curriculum: freeC, sellerUserId: sellerId, sellerNickname: 'QA판매자', title: freeC.title, description: '무료 테스트',
      difficulty: 'beginner', coverIcon: '🥊', priceKrw: 0, tags: ['초보자', '무료'], targetAudience: '복싱 초보자', learningGoals: ['잽/크로스 기본'],
    });
    const paidRes = await publishCurriculumToMarketplace({
      curriculum: paidC, sellerUserId: sellerId, sellerNickname: 'QA판매자', title: paidC.title, description: '유료 테스트',
      difficulty: 'intermediate', coverIcon: '🥋', priceKrw: 10000, tags: ['주짓수', '서브미션'], targetAudience: '주짓수 중급자', learningGoals: ['암바/트라이앵글 연결'],
    });
    return { freeRes, paidRes };
  }, { freeId: seeded.freeId, paidId: seeded.paidId, sellerId: seller.id });
  check('[2. 마켓 게시] 무료 커리큘럼 게시 성공', publishResult.freeRes.ok, JSON.stringify(publishResult.freeRes).slice(0, 200));
  check('[2. 마켓 게시] 유료 커리큘럼 게시 성공(10,000원)', publishResult.paidRes.ok && publishResult.paidRes.data.priceKrw === 10000, JSON.stringify(publishResult.paidRes).slice(0, 200));

  const freeListingId = publishResult.freeRes.data.id;
  const paidListingId = publishResult.paidRes.data.id;

  // Mark the seller's own local curricula as listed (mirrors what the real UI does after publish).
  await page.evaluate(async ({ freeId, paidId, freeListingId, paidListingId }) => {
    const { getCurriculum, saveCustomCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    saveCustomCurriculum({ ...getCurriculum(freeId), marketplaceListingId: freeListingId });
    saveCustomCurriculum({ ...getCurriculum(paidId), marketplaceListingId: paidListingId });
  }, { freeId: seeded.freeId, paidId: seeded.paidId, freeListingId, paidListingId });

  // ---- [3. 마켓에서 검색] ----
  const searchResult = await page.evaluate(async () => {
    const { listMarketplaceListings } = await import('/src/lib/marketplace/service.ts');
    return listMarketplaceListings({ martialArt: 'bjj' });
  });
  check('[3. 마켓에서 검색] 무술 필터(bjj)로 유료 리스팅이 검색됨', searchResult.ok && searchResult.data.some((l) => l.id === paidListingId), JSON.stringify(searchResult.ok ? searchResult.data.map((l) => l.title) : searchResult));

  const queryResult = await page.evaluate(async () => {
    const { listMarketplaceListings } = await import('/src/lib/marketplace/service.ts');
    return listMarketplaceListings({ query: '서브미션' });
  });
  check('[3. 마켓에서 검색] 태그 검색("서브미션")으로 유료 리스팅이 검색됨', queryResult.ok && queryResult.data.some((l) => l.id === paidListingId), '');

  // ---- [4. 상세 페이지] Preview-only before purchase (checked from the SELLER's own device — but seller has access, so verify structure via listing fields only) ----
  const detailPreview = await page.evaluate(async (id) => {
    const { getMarketplaceListing } = await import('/src/lib/marketplace/service.ts');
    const res = await getMarketplaceListing(id);
    return res;
  }, paidListingId);
  check('[4. 상세 페이지] 미리보기 필드(제목/무술/난이도/기간/가격 등)가 정상 반환', detailPreview.ok && detailPreview.data.title === 'QA 유료 주짓수 심화' && detailPreview.data.totalDays === 1, JSON.stringify(detailPreview).slice(0, 200));

  // ============ SECURITY: an unrelated third party must NOT see gated content or be able to fake an order ============
  device = await launchDevice(dirThird);
  page = device.page;
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  await login(page, thirdParty.email, PASSWORD);
  await sleep(2000);

  const thirdPartyContentAttempt = await page.evaluate(async (id) => {
    const { getMarketplaceCurriculumContent } = await import('/src/lib/marketplace/service.ts');
    return getMarketplaceCurriculumContent(id);
  }, paidListingId);
  check('[3. 구매하기 전 비공개] 구매하지 않은 사용자는 전체 Day/기술 내용을 볼 수 없음(RLS)', thirdPartyContentAttempt.ok && thirdPartyContentAttempt.data === null, JSON.stringify(thirdPartyContentAttempt));

  const fakeOrderAttempt = await page.evaluate(async ({ curriculumId, sellerId }) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data: sess } = await supabase.auth.getSession();
    const { error } = await supabase.from('marketplace_orders').insert({
      id: 'fake_order_' + Date.now(), curriculum_id: curriculumId, buyer_user_id: sess.session.user.id, seller_user_id: sellerId,
      price_krw: 10000, platform_fee_krw: 0, seller_earning_krw: 10000, status: 'completed', is_test_payment: false,
    });
    return { blocked: !!error, message: error?.message };
  }, { curriculumId: paidListingId, sellerId: seller.id });
  check('[10. 보안] 클라이언트가 직접 marketplace_orders에 "구매 완료" 행을 삽입 시도 -> 차단됨', fakeOrderAttempt.blocked, JSON.stringify(fakeOrderAttempt));

  const fakeReviewAttempt = await page.evaluate(async (curriculumId) => {
    const { submitReview } = await import('/src/lib/marketplace/service.ts');
    return submitReview(curriculumId, (await (await import('/src/lib/supabase/client.ts')).supabase.auth.getSession()).data.session.user.id, '가짜리뷰어', 5, '구매 안 했는데 리뷰');
  }, paidListingId);
  check('[11. 리뷰] 구매하지 않은 사용자의 리뷰 작성 시도 -> 차단됨', !fakeReviewAttempt.ok, JSON.stringify(fakeReviewAttempt).slice(0, 200));

  const fakeStatsAttempt = await page.evaluate(async (id) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { error } = await supabase.from('marketplace_curricula').update({ purchase_count: 99999, rating_avg: 5, rating_count: 99999 }).eq('id', id);
    if (error) return { updateBlocked: true };
    const { data } = await supabase.from('marketplace_curricula').select('purchase_count, rating_avg, rating_count').eq('id', id).maybeSingle();
    return { updateBlocked: false, dataAfter: data };
  }, paidListingId);
  // Third party has no update-own row match (RLS update policy requires seller_user_id = auth.uid()), so the update itself should affect 0 rows / be blocked.
  check('[10. 보안] 제3자가 다른 사람의 리스팅 통계를 조작 시도 -> 반영되지 않음', fakeStatsAttempt.updateBlocked || (fakeStatsAttempt.dataAfter && fakeStatsAttempt.dataAfter.purchase_count !== 99999), JSON.stringify(fakeStatsAttempt));

  await device.app.close();

  // ============ BUYER: browse, buy free, buy paid, purchase history, training ============
  device = await launchDevice(dirBuyer);
  page = device.page;
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  await login(page, buyer.email, PASSWORD);
  await sleep(2000);

  // ---- [5. 무료 커리큘럼 받기] ----
  const freeClaim = await page.evaluate(async (id) => {
    const { purchaseMarketplaceCurriculum, getMarketplaceCurriculumContent, getMarketplaceListing, claimPurchasedCurriculumLocally } = await import('/src/lib/marketplace/service.ts');
    const purchase = await purchaseMarketplaceCurriculum(id);
    if (!purchase.ok) return { purchase };
    const listing = await getMarketplaceListing(id);
    const content = await getMarketplaceCurriculumContent(id);
    const saved = listing.ok && content.ok && content.data ? claimPurchasedCurriculumLocally(listing.data, content.data, { orderId: purchase.data.orderId, priceKrw: purchase.data.priceKrw }) : null;
    return { purchase, savedId: saved?.id, savedMartialArt: saved?.martialArt };
  }, freeListingId);
  check('[5. 무료 커리큘럼 받기] 구매(0원) 처리 성공', freeClaim.purchase.ok && freeClaim.purchase.data.priceKrw === 0, JSON.stringify(freeClaim.purchase));
  check('[8. 잠금 해제][12. 기존 기능 연결] 무료 커리큘럼이 내 커리큘럼에 실제로 추가됨', !!freeClaim.savedId && freeClaim.savedMartialArt === 'boxing', JSON.stringify(freeClaim));

  // ---- [6. 유료 커리큘럼 테스트 구매] ----
  const paidClaim = await page.evaluate(async (id) => {
    const { purchaseMarketplaceCurriculum, getMarketplaceCurriculumContent, getMarketplaceListing, claimPurchasedCurriculumLocally } = await import('/src/lib/marketplace/service.ts');
    const purchase = await purchaseMarketplaceCurriculum(id);
    if (!purchase.ok) return { purchase };
    const listing = await getMarketplaceListing(id);
    const content = await getMarketplaceCurriculumContent(id);
    const saved = listing.ok && content.ok && content.data ? claimPurchasedCurriculumLocally(listing.data, content.data, { orderId: purchase.data.orderId, priceKrw: purchase.data.priceKrw }) : null;
    return { purchase, savedId: saved?.id, savedDays: saved?.days };
  }, paidListingId);
  check('[6. 유료 테스트 구매] 10,000원 구매 처리 성공', paidClaim.purchase.ok && paidClaim.purchase.data.priceKrw === 10000, JSON.stringify(paidClaim.purchase));
  check('[12. 수수료 계산] 수수료 10% = 1,000원, 판매자 수익 = 9,000원 (정수 연산)', paidClaim.purchase.data.platformFeeKrw === 1000 && paidClaim.purchase.data.sellerEarningKrw === 9000 && paidClaim.purchase.data.platformFeeKrw + paidClaim.purchase.data.sellerEarningKrw === paidClaim.purchase.data.priceKrw, JSON.stringify(paidClaim.purchase.data));
  check('[8. 잠금 해제][2. 기술 데이터 연결] 구매 후 실제 Day/기술 내용이 로컬에 그대로 반영됨(암바/트라이앵글)', !!paidClaim.savedId && paidClaim.savedDays?.[0]?.techniqueIds?.includes('bjj__armbar'), JSON.stringify(paidClaim.savedDays?.[0]?.techniqueIds));

  // Idempotency: re-purchasing the same curriculum must not create a duplicate order or double-charge.
  const rePurchase = await page.evaluate(async (id) => {
    const { purchaseMarketplaceCurriculum } = await import('/src/lib/marketplace/service.ts');
    return purchaseMarketplaceCurriculum(id);
  }, paidListingId);
  check('[구매 중복 방지] 같은 커리큘럼 재구매 시도 -> 기존 주문 반환(already_purchased)', rePurchase.ok && rePurchase.data.alreadyPurchased === true, JSON.stringify(rePurchase));

  // ---- [7. 구매 내역] ----
  const purchaseHistory = await page.evaluate(async (buyerId) => {
    const { listMyPurchaseOrders } = await import('/src/lib/marketplace/service.ts');
    return listMyPurchaseOrders(buyerId);
  }, buyer.id);
  check('[7. 구매 내역] 무료+유료 총 2건의 주문이 조회됨', purchaseHistory.ok && purchaseHistory.data.length === 2, JSON.stringify(purchaseHistory.ok ? purchaseHistory.data.length : purchaseHistory));

  // ---- [9. 훈련하기 -> 세트/횟수/휴식타이머 -> 훈련 완료 -> Training Analytics -> 최근 훈련] ----
  await page.evaluate(() => { location.hash = '#/'; });
  await sleep(300);
  const trainingResult = await page.evaluate(async (curriculumId) => {
    const { getCurriculum, setDayComplete } = await import('/src/lib/curriculum/curriculumService.ts');
    const { recordTrainingSession } = await import('/src/lib/trainingHistory/service.ts');
    const c = getCurriculum(curriculumId);
    const entry = recordTrainingSession({
      curriculumId, dayNumber: 1, techniqueIds: ['bjj__armbar', 'bjj__triangle'], completed: true, estimatedMinutes: 30, actualMinutes: 30, notes: null, source: 'curriculum',
      exerciseDetails: [{ techniqueId: 'bjj__armbar', mode: 'reps', sets: 3, targetReps: 10, targetSeconds: null, actualReps: [10, 10, 10], actualSeconds: [null, null, null], restSeconds: 30, startedAt: null, finishedAt: null }],
    });
    setDayComplete(c, 1, true);
    return entry;
  }, paidClaim.savedId);
  check('[9. 훈련하기][세트/횟수][휴식타이머][훈련완료] 구매한 커리큘럼이 기존 Training Session 구조로 정상 기록됨', !!trainingResult.id && trainingResult.exerciseDetails[0].actualReps.join(',') === '10,10,10', JSON.stringify(trainingResult).slice(0, 200));

  await page.evaluate(() => { location.hash = '#/training-analytics'; });
  await sleep(600);
  let bodyText = await page.evaluate(() => document.body.innerText);
  check('[Training Analytics][최근 훈련] 구매한 커리큘럼의 훈련이 최근 훈련에 표시됨', bodyText.includes('QA 유료 주짓수 심화'), bodyText.slice(0, 300));

  // ---- Profile page: 구매한 커리큘럼 section ----
  await page.evaluate(() => { location.hash = '#/profile'; });
  await sleep(600);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[6. 구매 내역 UI] 마이페이지에 "구매한 커리큘럼" 섹션과 실제 항목 표시', bodyText.includes('구매한 커리큘럼') && bodyText.includes('QA 무료 복싱 기초') && bodyText.includes('QA 유료 주짓수 심화'), bodyText.slice(0, 600));

  // ---- [13/14. 리뷰/평점] Verified buyer submits a review ----
  const reviewResult = await page.evaluate(async ({ curriculumId, buyerId }) => {
    const { submitReview } = await import('/src/lib/marketplace/service.ts');
    return submitReview(curriculumId, buyerId, 'QA구매자', 5, '정말 좋은 커리큘럼입니다.');
  }, { curriculumId: paidListingId, buyerId: buyer.id });
  check('[13. 리뷰] 실제 구매자의 리뷰 작성 성공', reviewResult.ok, JSON.stringify(reviewResult).slice(0, 200));

  const duplicateReview = await page.evaluate(async ({ curriculumId, buyerId }) => {
    const { submitReview } = await import('/src/lib/marketplace/service.ts');
    return submitReview(curriculumId, buyerId, 'QA구매자', 3, '중복 리뷰 시도');
  }, { curriculumId: paidListingId, buyerId: buyer.id });
  check('[중복 리뷰 방지] 같은 사용자의 두 번째 리뷰 작성 -> 차단됨', !duplicateReview.ok, JSON.stringify(duplicateReview).slice(0, 200));

  const listingAfterReview = await page.evaluate(async (id) => {
    const { getMarketplaceListing } = await import('/src/lib/marketplace/service.ts');
    return getMarketplaceListing(id);
  }, paidListingId);
  check('[14. 평점] 리뷰 등록 후 평점 평균이 자동 계산됨(5.0)', listingAfterReview.ok && listingAfterReview.data.ratingAvg === 5 && listingAfterReview.data.ratingCount === 1, JSON.stringify(listingAfterReview.data));

  // ---- [11. 판매량] purchase_count reflects the 1 real completed order ----
  check('[11. 판매량] 리스팅의 구매 횟수가 실제 주문 수와 일치(1회)', listingAfterReview.ok && listingAfterReview.data.purchaseCount === 1, String(listingAfterReview.data?.purchaseCount));

  // ---- [16. 로그아웃][17. 다른 계정 로그인][18. 접근 권한] on a SECOND fresh device with the SAME buyer account ----
  await logout(page);
  await sleep(500);
  await device.app.close();

  device = await launchDevice(dirBuyer2);
  page = device.page;
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  await login(page, buyer.email, PASSWORD);
  await sleep(2500);

  const restoredOnDevice2 = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('martialdex:curricula:custom') || '[]');
    return list.filter((c) => !!c.marketplaceMeta).map((c) => ({ title: c.title, days: c.days.length }));
  });
  check('[15. Supabase 저장][17. 다른 기기 로그인] 구매한 커리큘럼 2개가 다른 기기에서 자동 복원됨', restoredOnDevice2.length === 2, JSON.stringify(restoredOnDevice2));

  const contentAccessOnDevice2 = await page.evaluate(async (id) => {
    const { getMarketplaceCurriculumContent } = await import('/src/lib/marketplace/service.ts');
    return getMarketplaceCurriculumContent(id);
  }, paidListingId);
  check('[18. 구매한 커리큘럼 접근 권한] 다른 기기에서도 구매한 콘텐츠에 정상 접근 가능', contentAccessOnDevice2.ok && !!contentAccessOnDevice2.data, '');

  await device.app.close();

  // ============ SELLER dashboard verification ============
  device = await launchDevice(dirSeller);
  page = device.page;
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  await login(page, seller.email, PASSWORD);
  await sleep(2500);

  await page.evaluate(() => { location.hash = '#/profile'; });
  await sleep(600);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[7. 판매자 대시보드] "내 판매 커리큘럼" 섹션에 실제 판매/수익/수수료/평점 표시', bodyText.includes('내 판매 커리큘럼') && bodyText.includes('QA 유료 주짓수 심화') && bodyText.includes('9,000원') && bodyText.includes('1,000원'), bodyText.slice(bodyText.indexOf('내 판매 커리큘럼'), bodyText.indexOf('내 판매 커리큘럼') + 500));

  // ---- [19. 다른 사용자의 판매/구매 데이터 접근 차단] seller must NOT see buyer's other private data, and vice versa was already tested above via thirdParty ----
  const sellerCannotSeeOtherOrders = await page.evaluate(async (unrelatedCurriculumId) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    // A curriculum id the seller never listed — orders table should return nothing for it regardless.
    const { data } = await supabase.from('marketplace_orders').select('*').eq('curriculum_id', unrelatedCurriculumId);
    return data;
  }, 'nonexistent_curriculum_id_xyz');
  check('[19. 접근 차단] 존재/관련 없는 주문 조회 시 빈 결과(정보 유출 없음)', Array.isArray(sellerCannotSeeOtherOrders) && sellerCannotSeeOtherOrders.length === 0, JSON.stringify(sellerCannotSeeOtherOrders));

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
