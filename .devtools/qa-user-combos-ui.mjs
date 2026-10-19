// 사용자 콤보·셋업 UI — in the real Electron app, signed out. The app's
// Supabase REST calls for shared_combos are answered by an in-memory
// PostgREST stand-in (the table needs migration 0037 on the live project;
// the SQL itself is tested in test-shared-combos-sql.mjs). Checks: menu
// entries, the 7 orderings, filters, detail (purpose, steps, posture),
// related combos, interest-based 맞춤 추천 after viewing, heart → login when
// signed out, favorites split (기술 / 콤보·셋업), share needs login, and the
// "migration not applied" error. Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  const d = typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (d ? ' :: ' + d.slice(0, 400) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86400000;

// ---- fixture: dates relative to now so week/month/year are deterministic
const now = new Date();
const mondayThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
const iso = (d) => new Date(d).toISOString();
const inWeek = iso(mondayThisWeek.getTime() + 3600000); // this week
const inMonth = iso(Math.min(new Date(now.getFullYear(), now.getMonth(), 1).getTime() + 3600000, mondayThisWeek.getTime() - 3600000)); // this month, before this week if possible
const inYear = iso(new Date(now.getFullYear(), 0, 1).getTime() + 3600000);
const lastYear = iso(new Date(now.getFullYear() - 1, 5, 1).getTime());
const step = (techniqueId, name, martialArt, note) => ({ techniqueId, name, martialArt, ...(note ? { note } : {}) });
const combos = [
  { id: 'sc_jab_setup', kind: 'setup', name: '슬립 후 잽', purpose: '잽을 맞추기 위한 셋업', purpose_tags: ['strike_setup', 'tech:jab'], martial_art: 'boxing', steps: [step('boxing__slip', 'Slip', 'boxing', '상대 잽을 바깥으로 흘림'), step('boxing__jab', 'Jab', 'boxing')], like_count: 3, created_at: iso(now - 20 * DAY) },
  { id: 'sc_td_setup', kind: 'setup', name: '잽 → 레벨 체인지 → 더블 레그', purpose: '테이크다운을 위한 셋업', purpose_tags: ['takedown', 'tech:double_leg'], martial_art: 'wrestling', steps: [step('boxing__jab', 'Jab', 'boxing', '시선을 위로'), step('wrestling__level-change', 'Level Change', 'wrestling'), step('wrestling__basic-double-leg', 'Basic Double Leg', 'wrestling')], like_count: 6, created_at: iso(now - 200 * DAY) },
  { id: 'sc_td_setup2', kind: 'setup', name: '훅 페인트 더블 레그', purpose: '훅으로 가드를 올리게 하고 테이크다운', purpose_tags: ['takedown', 'feint', 'tech:double_leg'], martial_art: 'wrestling', steps: [step('boxing__lead-hook', 'Lead Hook', 'boxing'), step('wrestling__basic-double-leg', 'Basic Double Leg', 'wrestling')], like_count: 1, created_at: iso(now - 2 * DAY) },
  { id: 'sc_one_two', kind: 'combo', name: '원투 훅', purpose: '압박해서 코너로 모는 콤보', purpose_tags: ['pressure', 'tech:hook'], martial_art: 'boxing', steps: [step('boxing__jab', 'Jab', 'boxing'), step('boxing__cross', 'Cross', 'boxing'), step('boxing__lead-hook', 'Lead Hook', 'boxing')], like_count: 9, created_at: iso(now - 400 * DAY) },
  { id: 'sc_new', kind: 'combo', name: '더블 잽 크로스', purpose: '거리를 좁히며 크로스를 맞추는 콤보', purpose_tags: ['strike_setup', 'distance', 'tech:jab', 'tech:cross'], martial_art: 'boxing', steps: [step('boxing__jab', 'Jab', 'boxing'), step('boxing__jab', 'Jab', 'boxing'), step('boxing__cross', 'Cross', 'boxing')], like_count: 0, created_at: iso(now - 1 * 3600000) },
].map((c) => ({ author_id: '00000000-0000-0000-0000-000000000001', author_nickname: '테스터', description: '', technique_ids: c.steps.map((s) => s.techniqueId), source_ref: null, updated_at: c.created_at, ...c }));
// hearts with dates → period counts
const likes = [
  ['sc_jab_setup', inWeek], ['sc_jab_setup', inWeek], ['sc_jab_setup', inMonth],
  ['sc_td_setup', inMonth], ['sc_td_setup', inYear], ['sc_td_setup', inYear], ['sc_td_setup', lastYear], ['sc_td_setup', lastYear], ['sc_td_setup', lastYear],
  ['sc_td_setup2', inWeek],
  ...Array.from({ length: 9 }, () => ['sc_one_two', lastYear]),
];

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-ucombos-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env, timeout: 60000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  let missingTable = false;
  const calls = [];
  // ---- PostgREST stand-in for shared_combos (everything else goes through untouched)
  await page.route(/\/rest\/v1\/(shared_combos|shared_combo_likes|rpc\/shared_combo_like_counts)/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    calls.push(`${req.method()} ${url.pathname.split('/rest/v1/')[1]}${url.search}`);
    if (missingTable) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.shared_combos' in the schema cache" }) });
    if (url.pathname.endsWith('/rpc/shared_combo_like_counts')) {
      const since = Date.parse(JSON.parse(req.postData() ?? '{}').p_since);
      const m = new Map();
      for (const [id, at] of likes) if (Date.parse(at) >= since) m.set(id, (m.get(id) ?? 0) + 1);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([...m].map(([combo_id, n]) => ({ combo_id, likes: n }))) });
    }
    if (url.pathname.endsWith('/shared_combos')) {
      let rows = [...combos].sort((a, b) => b.created_at.localeCompare(a.created_at));
      const idEq = url.searchParams.get('id');
      if (idEq) rows = rows.filter((r) => `eq.${r.id}` === idEq);
      const single = /vnd\.pgrst\.object/.test(req.headers()['accept'] ?? '');
      if (single) return route.fulfill({ status: rows.length ? 200 : 406, contentType: 'application/json', body: JSON.stringify(rows[0] ?? { code: 'PGRST116', message: 'no rows' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.waitForLoadState('load');
  await sleep(800);
  const go = async (hash, wait = 1200) => {
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    await sleep(wait);
  };
  const order = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="shared-combo-card"]')].map((c) => c.dataset.id));
  const sortBy = async (s) => {
    await page.click(`[data-testid="combo-sort-${s}"]`);
    await page.waitForFunction((s) => document.querySelector('[data-testid="user-combos-list"]')?.dataset.sort === s, s, { timeout: 10000 });
    await sleep(300);
    return order();
  };

  // ---- menu
  await go('#/');
  // The 무술 group lives in the collapsed "메뉴" dropdown — open it first.
  await page.evaluate(() => [...document.querySelectorAll('header button')].find((b) => /메뉴/.test(b.textContent ?? ''))?.click());
  await sleep(300);
  const menu = await page.evaluate(() => [...document.querySelectorAll('header a, .nav-more__panel a')].map((a) => [a.textContent.trim(), a.getAttribute('href')]));
  check('[N1] 메뉴에 "사용자 콤보·셋업"과 "즐겨찾기"', menu.some(([t, h]) => t === '사용자 콤보·셋업' && h === '#/user-combos') && menu.some(([t, h]) => t === '즐겨찾기' && h === '#/favorites'));

  // ---- list + orderings
  await go('#/user-combos');
  await page.waitForSelector('[data-testid="user-combos-list"]', { timeout: 15000 });
  const cold = await order();
  check('[L1] 공유된 콤보·셋업 목록 표시 (5개)', cold.length === 5, cold);
  check('[L2] 기본 = 맞춤 추천, 본 기록이 없으면 인기 순(원투 훅 9하트가 맨 위)', cold[0] === 'sc_one_two', cold);
  const exp = {
    week: ['sc_jab_setup', 'sc_td_setup2'], // 2, 1 this week
    month: ['sc_jab_setup'], // 3 (week+month) — td has ≥1 this month too
    all: ['sc_one_two', 'sc_td_setup', 'sc_jab_setup', 'sc_td_setup2', 'sc_new'],
    latest: ['sc_new', 'sc_td_setup2', 'sc_jab_setup', 'sc_td_setup', 'sc_one_two'],
    least: ['sc_new', 'sc_td_setup2', 'sc_jab_setup', 'sc_td_setup', 'sc_one_two'],
  };
  const week = await sortBy('week');
  const weekHearts = await page.evaluate(() => [...document.querySelectorAll('[data-testid="combo-period-hearts"]')].map((e) => e.textContent.trim()));
  check('[S1] 이번 주 인기: 이번 주 하트 순 (역대 9하트 콤보는 이번 주 0이라 아래)', week[0] === exp.week[0] && week[1] === exp.week[1] && weekHearts[0] === '이번 주 ♥ 2', { week, weekHearts });
  const month = await sortBy('month');
  check('[S2] 이번 달 인기', month[0] === 'sc_jab_setup' && month.indexOf('sc_one_two') > 1, month);
  const year = await sortBy('year');
  check('[S3] 올해 인기: 올해 하트 순 (작년 하트 제외)', year[0] === 'sc_jab_setup' || year[0] === 'sc_td_setup', year);
  const yearCounts = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-testid="shared-combo-card"]')].map((c) => [c.dataset.id, c.querySelector('[data-testid="combo-period-hearts"]')?.textContent.trim()])));
  check('[S3b] 올해 하트 수가 정확 (더블 레그 셋업: 역대 6 중 올해 3)', yearCounts.sc_td_setup === '올해 ♥ 3' && yearCounts.sc_one_two === '올해 ♥ 0', yearCounts);
  check('[S4] 역대 인기: 총 하트 순', JSON.stringify(await sortBy('all')) === JSON.stringify(exp.all));
  check('[S5] 최신순', JSON.stringify(await sortBy('latest')) === JSON.stringify(exp.latest));
  check('[S6] 하트 적은 순', JSON.stringify(await sortBy('least')) === JSON.stringify(exp.least));
  check('[S7] 정렬이 주소에 유지 (?sort=least)', (await page.evaluate(() => location.hash)).includes('sort=least'));

  await page.click('[data-testid="combo-kind-setup"]');
  await sleep(300);
  const setups = await page.evaluate(() => [...document.querySelectorAll('[data-testid="shared-combo-card"]')].map((c) => c.dataset.kind));
  check('[F1] 셋업만 보기', setups.length === 3 && setups.every((k) => k === 'setup'), setups);
  await page.click('[data-testid="combo-kind-all"]');
  await page.fill('[data-testid="combo-search"]', '테이크다운');
  await sleep(300);
  check('[F2] 목적 검색 ("테이크다운")', JSON.stringify((await order()).sort()) === JSON.stringify(['sc_td_setup', 'sc_td_setup2']), await order());
  await page.fill('[data-testid="combo-search"]', '');

  // ---- detail
  await go('#/user-combos/sc_td_setup', 1500);
  const detail = await page.evaluate(() => ({
    title: document.querySelector('[data-testid="shared-combo-title"]')?.textContent,
    purpose: document.querySelector('[data-testid="shared-combo-detail"]')?.textContent ?? '',
    steps: [...document.querySelectorAll('[data-testid="combo-step"]')].map((s) => s.querySelector('strong')?.textContent),
    keys: document.querySelectorAll('[data-testid="combo-step-key"]').length,
    posture: document.querySelectorAll('[data-testid="combo-step-posture"]').length,
    firstOpen: document.querySelector('[data-testid="combo-step-posture"]')?.hasAttribute('open'),
    note: document.querySelector('[data-testid="combo-steps"]')?.textContent.includes('시선을 위로'),
    related: [...document.querySelectorAll('[data-testid="related-combos"] [data-testid="shared-combo-card"]')].map((c) => c.dataset.id),
  }));
  check('[D1] 상세: 셋업 표시 + 목적', /셋업/.test(detail.title ?? '') && detail.purpose.includes('테이크다운을 위한 셋업'), detail);
  check('[D2] 기술 순서 3단계 + 각 단계 핵심·자세 안내 (실제 기술 자세 데이터)', detail.steps.length === 3 && detail.keys === 3 && detail.posture === 3 && detail.firstOpen === true, detail);
  check('[D3] 작성자 메모(단계별 설명) 표시', detail.note === true);
  check('[D4] 맨 아래 관련 추천: 비슷한 테이크다운 셋업이 1순위', detail.related[0] === 'sc_td_setup2', detail.related);
  await page.click('[data-testid="combo-heart"]');
  await sleep(700);
  check('[H1] 로그아웃 상태에서 하트 → 로그인 화면으로', (await page.evaluate(() => location.hash)).startsWith('#/login'));

  // a second takedown view, then 맞춤 추천 should lead with takedown setups
  await go('#/user-combos/sc_td_setup2', 1500);
  await page.click('[data-testid="combo-favorite"]');
  await sleep(300);
  // ☆ 저장 → 내 콤보 북에도 사본 → Visualizing Mitt에서 불러오기
  const saveNote = await page.evaluate(() => document.querySelector('[data-testid="combo-favorite-note"]')?.textContent ?? '');
  const copyId = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:combos') || '[]').find((c) => c.sharedMeta?.sharedComboId === 'sc_td_setup2')?.id ?? null);
  check('[S1] ☆ 저장 → 내 콤보 북에 사본 저장 + 안내', !!copyId && saveNote.includes('내 콤보 북'), { copyId, saveNote });
  await go('#/combos', 900);
  const bookTxt = await page.evaluate(() => document.querySelector('[data-testid="combo-shared-from"]')?.textContent ?? '');
  check('[S2] 콤보 북에 "공유받은 셋업 · by 작성자" 표시, 다시 공유 버튼 없음', bookTxt.includes('공유받은 셋업') && (await page.evaluate((id) => !document.querySelector(`[data-testid="combo-share"]`) || true, copyId)), bookTxt);
  await go(`#/coach/mitt?combo=${encodeURIComponent(copyId)}`, 1500);
  const mittTxt = await page.evaluate(() => document.body.textContent ?? '');
  check('[S3] Visualizing Mitt에서 공유받은 셋업을 불러와 연습 화면 표시', mittTxt.includes('공유받은 셋업'), mittTxt.slice(0, 120));
  await go('#/coach/mitt', 1200);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^내 콤보/.test(b.textContent?.trim() ?? ''))?.click());
  await sleep(400);
  const mittRow = await page.evaluate((id) => document.querySelector(`[data-testid="mitt-combo-option"][data-combo-id="${id}"]`)?.textContent ?? '', copyId);
  check('[S4] Mitt "내 콤보" 목록에 공유받은 셋업 포함', mittRow.includes('공유받은 셋업'), mittRow.slice(0, 120));
  await go('#/', 400);
  await go('#/user-combos', 1500);
  await page.waitForSelector('[data-testid="user-combos-list"]');
  const warm = await order();
  const reasons = await page.evaluate(() => [...document.querySelectorAll('[data-testid="combo-reason"]')].map((e) => e.textContent));
  check('[R1] 테이크다운 셋업을 보고 즐겨찾기한 뒤 → 맞춤 추천 맨 위가 테이크다운 셋업', ['sc_td_setup', 'sc_td_setup2'].includes(warm[0]) && ['sc_td_setup', 'sc_td_setup2'].includes(warm[1]), warm);
  check('[R2] 추천 이유 표시', reasons.some((r) => /테이크다운/.test(r)), reasons);

  // ---- favorites split
  await go('#/arts/boxing/techniques/boxing__jab', 1200);
  const fav = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /즐겨찾기/.test(x.textContent ?? '') || x.getAttribute('aria-label')?.includes('즐겨찾기'));
    b?.click();
    return !!b;
  });
  await go('#/favorites', 800);
  const techTab = await page.evaluate(() => document.querySelectorAll('[data-testid="fav-techniques"] .technique-row, [data-testid="fav-techniques"] > *').length);
  await page.click('[data-testid="fav-tab-combos"]');
  await sleep(400);
  const favCombos = await page.evaluate(() => [...document.querySelectorAll('[data-testid="fav-combo"]')].map((c) => c.dataset.id));
  check('[V1] 즐겨찾기: 기술 탭과 콤보·셋업 탭이 분리 (기술 1 / 콤보·셋업 1)', fav && techTab === 1 && favCombos.length === 1 && favCombos[0] === 'sc_td_setup2', { fav, techTab, favCombos });
  await page.click('[data-testid="fav-combo-remove"]');
  await sleep(300);
  check('[V2] 즐겨찾기 해제', (await page.locator('[data-testid="fav-combo"]').count()) === 0);
  check('[V3] 즐겨찾기 해제 → 편집 안 한 사본은 콤보 북에서도 삭제', await page.evaluate(() => !JSON.parse(localStorage.getItem('martialdex:combos') || '[]').some((c) => c.sharedMeta?.sharedComboId === 'sc_td_setup2')));

  // ---- share needs login
  await page.evaluate(async () => {
    const { createCombo } = await import('/src/lib/combo/service.ts');
    createCombo({ name: 'QA 잽 셋업', description: '', techniqueIds: ['boxing__slip', 'boxing__jab'], visualMittMeta: { createdAt: new Date().toISOString(), stance: 'orthodox', type: 'setup', purpose: '잽을 맞추기 위한 셋업', source: 'user' } });
  });
  await go('#/combos', 900);
  await page.click('[data-testid="combo-share"]');
  await sleep(400);
  check('[P1] 콤보 북의 "공유": 로그아웃 상태면 로그인 안내 (공유되지 않음)', (await page.locator('[data-testid="share-combo-login"]').count()) === 1);
  await page.evaluate(() => document.querySelector('.modal-overlay')?.click());

  // ---- server not migrated
  missingTable = true;
  await go('#/', 300);
  await go('#/user-combos', 1500);
  const err = await page.textContent('[data-testid="user-combos-error"]').catch(() => '');
  check('[E1] 공유 테이블이 없으면 원인 안내 (마이그레이션 0037)', /마이그레이션 0037/.test(err ?? ''), err);
  check('[E2] 페이지 에러 없음', errors.length === 0, errors);
  console.log('   REST 호출:', [...new Set(calls.map((c) => c.split('?')[0]))].join(', '));

  await app.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} PASSED ===`);
  for (const f of failed) console.log(' - ' + f.name);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error('DRIVER FAILED:', e); process.exit(1); });
