// 사용자 콤보·셋업 — LIVE end-to-end against the real Supabase project
// (migration 0037 applied), in the real Electron app, with two real test
// accounts: A shares from 콤보 북 and 전술 셋업 (and re-shares → update, not
// a duplicate); B sees it, hearts it (count + this-week ranking from the
// server), can't delete it, copies it into B's own combo book; A un-shares.
// Everything this test shared is deleted at the end.
// Accounts: JSON file [{email,password,nickname,userId}, …] in QA_COMBO_ACCOUNTS.
// Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const accountsFile = process.env.QA_COMBO_ACCOUNTS;
if (!accountsFile || !fs.existsSync(accountsFile)) {
  console.log('NOT TESTED — set QA_COMBO_ACCOUNTS to the test-accounts JSON file');
  process.exit(2);
}
const [A, B] = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  const d = typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (d ? ' :: ' + d.slice(0, 400) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = Date.now().toString(36);

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-ucombos-live-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env, timeout: 60000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.waitForLoadState('load');
  await sleep(1000);
  const go = async (hash, wait = 1500) => {
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    await sleep(wait);
  };
  /** Signs in through the app's own Supabase client (AuthProvider picks it up). */
  async function signIn(acc) {
    const r = await page.evaluate(async ({ email, password }) => {
      const { supabase } = await import('/src/lib/supabase/client.ts');
      await supabase.auth.signOut();
      const res = await supabase.auth.signInWithPassword({ email, password });
      return res.error?.message ?? null;
    }, acc);
    await sleep(2000);
    // Dismiss the first-login cloud-data prompt if it appears.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /나중에|건너뛰|닫기|취소/.test(x.textContent ?? '') && x.closest('.modal-panel, .modal, [role="dialog"]'));
      b?.click();
    });
    return r;
  }
  const svc = (fn, args) => page.evaluate(async ({ fn, args }) => (await import('/src/lib/sharedCombo/service.ts'))[fn](...args), { fn, args });

  // ================= A: share from 콤보 북 =================
  check('[A0] 테스트 계정 A 로그인', (await signIn(A)) === null);
  const comboName = `QA 잽 셋업 ${STAMP}`;
  await page.evaluate(async (name) => {
    const { createCombo } = await import('/src/lib/combo/service.ts');
    const { createTactic } = await import('/src/lib/tactic/service.ts');
    createCombo({ name, description: '슬립으로 상대 잽을 흘리고 바로 잽', techniqueIds: ['boxing__slip', 'boxing__jab'], visualMittMeta: { createdAt: new Date().toISOString(), stance: 'orthodox', type: 'setup', purpose: '잽을 맞추기 위한 셋업', source: 'user', stepNotes: [{ techniqueId: 'boxing__slip', note: '바깥으로 슬립', opponentReaction: null }, { techniqueId: 'boxing__jab', note: '', opponentReaction: null }] } });
    createTactic({ name: `${name} 전술`, situation: '상대가 계속 들어올 때 테이크다운을 노리는 셋업', techniqueIds: ['boxing__jab', 'wrestling__level-change', 'wrestling__basic-double-leg'] });
  }, comboName);
  await go('#/combos');
  const card = page.locator('.card', { hasText: comboName });
  await card.locator('[data-testid="combo-share"]').click();
  await page.waitForSelector('[data-testid="share-combo-form"]', { timeout: 10000 });
  const pre = await page.evaluate(() => ({ purpose: document.querySelector('[data-testid="share-purpose"]').value, setup: document.querySelector('[data-testid="share-kind-setup"]').getAttribute('aria-pressed'), tags: document.querySelector('[data-testid="share-tags"]')?.textContent ?? '' }));
  check('[A1] 공유 창: 셋업·목적이 원본에서 채워지고 분류 표시', pre.purpose === '잽을 맞추기 위한 셋업' && pre.setup === 'true' && /타격 적중/.test(pre.tags) && /잽/.test(pre.tags), pre);
  await page.click('[data-testid="share-submit"]');
  await page.waitForSelector('[data-testid="share-done"]', { timeout: 20000 });
  const sharedHref = await page.getAttribute('[data-testid="share-done"] a', 'href');
  const sharedId = sharedHref?.split('/').pop();
  check('[A2] 실제 서버에 공유됨 (공유 완료 안내 + 링크)', !!sharedId && sharedId.startsWith('sc_'), sharedHref);
  const row = await svc('getSharedCombo', [sharedId, null]);
  check('[A3] 서버 행: 작성자 닉네임·목적·태그·단계 메모·무술(복싱) 저장', row.ok && row.data?.authorNickname === A.nickname && row.data.purposeTags.includes('strike_setup') && row.data.steps[0].note === '바깥으로 슬립' && row.data.martialArt === 'boxing' && row.data.likeCount === 0, row.data ?? row);
  await sleep(1500);
  const label = await card.locator('[data-testid="combo-share"]').textContent();
  check('[A4] 콤보 북에 "공유됨" 표시', /공유됨/.test(label ?? ''), label);
  // re-share → update, not duplicate
  await card.locator('[data-testid="combo-share"]').click();
  await page.fill('[data-testid="share-description"]', '수정된 설명');
  await page.click('[data-testid="share-submit"]');
  await page.waitForSelector('[data-testid="share-done"]');
  await sleep(800);
  const mine = (await svc('listSharedCombos', [A.userId])).data.filter((c) => c.authorId === A.userId && c.name === comboName);
  check('[A5] 다시 공유 → 같은 항목이 갱신 (중복 생성 없음)', mine.length === 1 && mine[0].id === sharedId && mine[0].description === '수정된 설명', mine.map((c) => [c.id, c.description]));
  // tactic → setup
  await go('#/tactics');
  await page.locator('.card', { hasText: `${comboName} 전술` }).locator('[data-testid="tactic-share"]').click();
  await page.waitForSelector('[data-testid="share-combo-form"]');
  await page.click('[data-testid="share-submit"]');
  await page.waitForSelector('[data-testid="share-done"]', { timeout: 20000 });
  const tacticId = (await page.getAttribute('[data-testid="share-done"] a', 'href'))?.split('/').pop();
  const trow = await svc('getSharedCombo', [tacticId, null]);
  check('[A6] 전술 셋업 공유 → 셋업 + 상황이 목적 + 테이크다운 분류', trow.ok && trow.data?.kind === 'setup' && trow.data.purposeTags.includes('takedown') && trow.data.steps.length === 3, trow.data ?? trow);

  // ================= B: browse, heart, rank, copy =================
  check('[B0] 테스트 계정 B 로그인', (await signIn(B)) === null);
  await go('#/user-combos?sort=latest', 2500);
  const listed = await page.evaluate((id) => {
    const c = document.querySelector(`[data-testid="shared-combo-card"][data-id="${id}"]`);
    return c ? { text: c.textContent, liked: c.querySelector('[data-testid="combo-heart"]')?.dataset.liked, count: c.querySelector('[data-testid="combo-heart-count"]')?.textContent } : null;
  }, sharedId);
  check('[B1] 다른 사용자(B)의 사용자 콤보 탭에 A의 공유가 보임 (작성자 닉네임)', !!listed && listed.text.includes(A.nickname) && listed.count === '0' && listed.liked === 'false', listed);
  await page.locator(`[data-testid="shared-combo-card"][data-id="${sharedId}"] [data-testid="combo-heart"]`).click();
  await sleep(1500);
  let srv = await svc('getSharedCombo', [sharedId, B.userId]);
  check('[B2] 하트 → 서버 하트 수 1, 내가 누른 상태', srv.data?.likeCount === 1 && srv.data.viewerHasLiked === true, srv.data && { like: srv.data.likeCount, liked: srv.data.viewerHasLiked });
  await go('#/', 300);
  await go('#/user-combos?sort=week', 2500);
  const weekInfo = await page.evaluate((id) => {
    const cards = [...document.querySelectorAll('[data-testid="shared-combo-card"]')];
    const c = cards.find((x) => x.dataset.id === id);
    return { hearts: c?.querySelector('[data-testid="combo-period-hearts"]')?.textContent.trim(), liked: c?.querySelector('[data-testid="combo-heart"]')?.dataset.liked, rank: cards.findIndex((x) => x.dataset.id === id) };
  }, sharedId);
  check('[B3] 이번 주 인기: 서버 기간 집계로 "이번 주 ♥ 1", 새로고침 후에도 하트 유지', weekInfo.hearts === '이번 주 ♥ 1' && weekInfo.liked === 'true', weekInfo);
  const dup = await svc('likeSharedCombo', [sharedId, B.userId]);
  srv = await svc('getSharedCombo', [sharedId, B.userId]);
  check('[B4] 같은 사람이 하트를 다시 눌러도 1개 그대로', dup.ok && srv.data.likeCount === 1);
  const forged = await page.evaluate(async ({ id, uid }) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const like = await supabase.from('shared_combo_likes').insert({ combo_id: id, user_id: uid });
    const upd = await supabase.from('shared_combos').update({ like_count: 999, name: '탈취' }).eq('id', id).select();
    const del = await supabase.from('shared_combos').delete().eq('id', id).select();
    return { likeErr: like.error?.code ?? null, updRows: upd.data?.length ?? 0, delRows: del.data?.length ?? 0 };
  }, { id: sharedId, uid: A.userId });
  srv = await svc('getSharedCombo', [sharedId, B.userId]);
  check('[B5] B는 A 이름으로 하트·A의 공유 수정·삭제 불가 (RLS)', !!forged.likeErr && forged.updRows === 0 && forged.delRows === 0 && srv.data.likeCount === 1 && srv.data.name === comboName, { forged, like: srv.data.likeCount });
  await go(`#/user-combos/${sharedId}`, 2500);
  const detail = await page.evaluate(() => ({ steps: document.querySelectorAll('[data-testid="combo-step"]').length, posture: document.querySelectorAll('[data-testid="combo-step-posture"]').length, unshare: !!document.querySelector('[data-testid="combo-unshare"]') }));
  check('[B6] 상세: 단계·자세 안내, 남의 공유라 "공유 취소" 버튼 없음', detail.steps === 2 && detail.posture === 2 && !detail.unshare, detail);
  await page.click('[data-testid="combo-copy"]');
  await sleep(600);
  const copied = await page.evaluate(async (name) => (await import('/src/lib/combo/service.ts')).listMyCombos().find((c) => c.name === name), comboName);
  check('[B7] "내 콤보 북에 담기" → B의 콤보 북에 셋업으로 저장', !!copied && copied.techniqueIds.join() === 'boxing__slip,boxing__jab' && copied.visualMittMeta?.type === 'setup', copied && { ids: copied.techniqueIds, type: copied.visualMittMeta?.type });
  await page.click('[data-testid="combo-heart"]');
  await sleep(1500);
  srv = await svc('getSharedCombo', [sharedId, B.userId]);
  check('[B8] 하트 취소 → 0', srv.data.likeCount === 0 && srv.data.viewerHasLiked === false);
  await page.click('[data-testid="combo-heart"]');
  await sleep(1500);

  // ================= A: un-share =================
  check('[C0] 다시 A로 로그인', (await signIn(A)) === null);
  await go(`#/user-combos/${tacticId}`, 2500);
  const who = await page.evaluate(async () => (await (await import('/src/lib/supabase/client.ts')).supabase.auth.getUser()).data.user?.id ?? null);
  await page.click('[data-testid="combo-unshare"]');
  await sleep(3000);
  const gone = await svc('getSharedCombo', [tacticId, null]);
  const c1 = await page.evaluate(() => ({ hash: location.hash, err: document.querySelector('[data-testid="shared-combo-error"]')?.textContent ?? null }));
  check('[C1] 작성자의 "공유 취소" → 서버에서 삭제, 목록으로 이동', gone.ok && gone.data === null && c1.hash.startsWith('#/user-combos'), { who, isA: who === A.userId, c1, stillThere: !!gone.data });
  const stillMine = await page.evaluate(async (name) => (await import('/src/lib/tactic/service.ts')).listMyTactics().some((t) => t.name === name), `${comboName} 전술`);
  check('[C2] 공유 취소해도 내 전술 셋업 원본은 그대로', stillMine);

  // ================= cleanup =================
  const left = (await svc('listSharedCombos', [A.userId])).data.filter((c) => c.authorId === A.userId);
  for (const c of left) await svc('deleteSharedCombo', [c.id]);
  const after = (await svc('listSharedCombos', [null])).data.filter((c) => c.authorId === A.userId || c.authorId === B.userId);
  check('[Z1] 테스트로 공유한 항목 모두 정리 (하트도 함께 삭제)', after.length === 0, after.map((c) => c.id));
  check('[Z2] 전체 흐름 동안 페이지 에러 없음', errors.length === 0, errors);
  await page.evaluate(async () => (await import('/src/lib/supabase/client.ts')).supabase.auth.signOut());

  await app.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} PASSED ===`);
  for (const f of failed) console.log(' - ' + f.name);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error('DRIVER FAILED:', e); process.exit(1); });
