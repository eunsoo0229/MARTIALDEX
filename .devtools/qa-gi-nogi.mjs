// Gi / No-Gi 상세 화면 QA (Electron + Vite dev server on :5173).
// Picks real examples of each classification from data/curated/gi-nogi.json
// and checks the toggle, disabled styles, missing-data states and that
// non-grappling pages are unchanged. Run: node .devtools/qa-gi-nogi.mjs
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const APP_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SHOT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-gi-nogi-'));
const data = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'data/curated/gi-nogi.json'), 'utf8')).techniques;
const pick = (fn) => Object.entries(data).find(([, r]) => fn(r));

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail !== '' ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [APP_DIR], env, timeout: 30000 });
const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
await page.waitForLoadState('load');
await sleep(900);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/youtube|ytimg|googlevideo|Failed to load resource/i.test(m.text()) && errors.push(m.text()));
await page.evaluate(() => localStorage.removeItem('martialdex:grappling-style'));

// Signed-in app: the "기존 데이터를 계정에 저장할까요?" prompt can cover the page — always answer "나중에" (never upload).
async function dismissBackupPrompt() {
  await page.evaluate(() => [...document.querySelectorAll('.modal-overlay button')].find((b) => b.textContent?.trim() === '나중에')?.click());
}
async function open(id, r) {
  await page.evaluate((h) => (location.hash = h), `#/arts/${r.arts[0]}/techniques/${id}`);
  await sleep(1200);
  await dismissBackupPrompt();
  await page.waitForSelector('[data-testid="grappling-style"]', { timeout: 8000 }).catch(() => null);
}
const has = (sel) => page.evaluate((s) => !!document.querySelector(s), sel);
const attr = (sel, a) => page.evaluate(({ s, a }) => document.querySelector(s)?.getAttribute(a) ?? null, { s: sel, a });

// 1. Gi·No-Gi 공통 (차이 있음)
const both = pick((r) => r.classification === 'both_differs' && r.postures?.gi && r.postures?.noGi) ?? pick((r) => r.classification === 'both_differs');
if (both) {
  const [id, r] = both;
  await open(id, r);
  check(`[공통] ${id}: 스타일 패널 표시`, await has('[data-testid="grappling-style"]'));
  check('[공통] Gi·No-Gi 탭 모두 활성', (await attr('[data-testid="style-tab-gi"]', 'disabled')) === null && (await attr('[data-testid="style-tab-nogi"]', 'disabled')) === null);
  check('[공통] 차이 설명 표시', await has('[data-testid="style-difference"]'));
  await page.click('[data-testid="style-tab-gi"]');
  await sleep(400);
  const giText = await page.evaluate(() => document.querySelector('[data-testid="style-posture"], [data-testid="style-shared-posture"], [data-testid="style-posture-missing"]')?.textContent ?? '');
  const giVideos = await attr('[data-testid="related-videos"]', 'data-style');
  await page.click('[data-testid="style-tab-nogi"]');
  await sleep(400);
  const nogiText = await page.evaluate(() => document.querySelector('[data-testid="style-posture"], [data-testid="style-shared-posture"], [data-testid="style-posture-missing"]')?.textContent ?? '');
  const nogiVideos = await attr('[data-testid="related-videos"]', 'data-style');
  check('[공통] 탭 전환 시 영상 목록 스타일도 함께 전환', giVideos === 'gi' && nogiVideos === 'nogi', { giVideos, nogiVideos });
  if (r.postures?.gi && r.postures?.noGi) check('[공통] 탭 전환 시 자세 설명이 바뀜', giText !== nogiText && giText.length > 0 && nogiText.length > 0);
  else console.log('   (스타일별 자세 데이터가 있는 공통 기술이 없어 자세 전환 비교는 미검증)');
  await page.screenshot({ path: path.join(SHOT_DIR, '01-both.png'), fullPage: false });
  await page.reload();
  await sleep(1500);
  check('[공통] 마지막으로 고른 스타일(No-Gi) 유지', (await attr('[data-testid="style-tab-nogi"]', 'aria-selected')) === 'true');
} else check('[공통] 예시 기술 존재', false, 'both_differs 없음');

// 2. Gi 중심
const gi = pick((r) => r.classification === 'gi_centric');
if (gi) {
  const [id, r] = gi;
  await open(id, r);
  check(`[Gi 중심] ${id}: No-Gi 탭 비활성`, (await attr('[data-testid="style-tab-nogi"]', 'disabled')) !== null, { applicable: r.noGi.applicable });
  check('[Gi 중심] Gi 탭 선택 상태로 열림', (await attr('[data-testid="style-tab-gi"]', 'aria-selected')) === 'true');
}

// 3. 판단 보류 — must not borrow either style
const und = pick((r) => r.classification === 'undecided');
if (und) {
  const [id, r] = und;
  await open(id, r);
  const txt = await page.evaluate(() => document.querySelector('[data-testid="grappling-style"]')?.textContent ?? '');
  check(`[판단 보류] ${id}: 분류 "판단 보류" 표시`, txt.includes('판단 보류'), txt.slice(0, 120));
  check('[판단 보류] 스타일 전용 자세(AI 조사)를 보여 주지 않음', !(await has('[data-testid="style-posture"]')));
}

// 3b. 사용자 판단
const usr = pick((r) => r.method === 'user' && r.classification === 'both_differs' && !r.postures?.gi && !r.postures?.noGi);
if (usr) {
  const [id, r] = usr;
  await open(id, r);
  const txt = await page.evaluate(() => document.querySelector('[data-testid="grappling-style"]')?.textContent ?? '');
  check(`[사용자 판단] ${id}: "사용자 판단" 표시 + 입력한 차이 표시`, txt.includes('사용자 판단') && txt.includes((r.difference ?? '').slice(0, 10)), txt.slice(0, 160));
  check('[사용자 판단] AI 조사 자세가 없으면 스타일 전용 자세를 지어내지 않음', !(await has('[data-testid="style-posture"]')));
}
const usrGi = pick((r) => r.method === 'user' && r.classification === 'gi_centric');
if (usrGi) {
  const [id, r] = usrGi;
  await open(id, r);
  check(`[사용자 판단] ${id}: Gi 중심 → No-Gi 탭 비활성`, (await attr('[data-testid="style-tab-nogi"]', 'disabled')) !== null);
}

// 4. missing state wording — a technique with no style-specific posture
if (usr) await open(usr[0], usr[1]);
const missing = await page.evaluate(() => document.body.textContent?.includes('미등록') || document.body.textContent?.includes('검토 필요'));
check('[누락] 데이터가 없는 스타일은 "미등록 / 검토 필요" 표시', !!missing);

// 4b. 새로 추가된 기술 (add_teq — 계정 동기화로 받은 기술에 저장된 Gi/No-Gi 기록)
// The shared library is readable only when signed in: fetch the REAL rows with a QA account
// (QA_COMBO_ACCOUNTS) and put them in the app's add_teq cache, as the sign-in sync does.
const ADDED = ['bjj__이마나리-롤', 'bjj__코요테-가드-롤오버-스윕'];
let addedRows = null;
if (process.env.QA_COMBO_ACCOUNTS) {
  const { createClient } = await import('@supabase/supabase-js');
  const env = Object.fromEntries(fs.readFileSync(path.join(APP_DIR, '.env'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
  const [acc] = JSON.parse(fs.readFileSync(process.env.QA_COMBO_ACCOUNTS, 'utf8'));
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email: acc.email, password: acc.password });
  const { data } = await sb.from('add_teq').select('id, data').in('id', ADDED);
  addedRows = (data ?? []).map((r) => r.data);
  await page.evaluate((rows) => {
    const cur = JSON.parse(localStorage.getItem('martialdex:add-teq-cache') || '[]');
    localStorage.setItem('martialdex:add-teq-cache', JSON.stringify([...cur.filter((x) => !rows.some((r) => r.id === x.id)), ...rows]));
  }, addedRows);
  await page.reload();
  await page.waitForLoadState('load');
  await sleep(1200);
}
check('[추가 기술] 실서버 add_teq 행에 Gi/No-Gi 기록 저장됨', !!addedRows && addedRows.length === 2 && addedRows.every((r) => r.technique.giNoGi), addedRows ? addedRows.map((r) => [r.id, r.technique.giNoGi?.classification]) : 'QA_COMBO_ACCOUNTS 없음 — 미검증');
const addedPage = async (id) => {
  await page.evaluate((h) => (location.hash = h), `#/arts/bjj/techniques/${id}`);
  await sleep(1500);
  await dismissBackupPrompt();
  await sleep(500);
};
await addedPage(encodeURIComponent('bjj__이마나리-롤'));
const ksTxt = await page.evaluate(() => document.querySelector('[data-testid="grappling-style"]')?.textContent ?? '');
check('[추가 기술] 이마나리 롤: Gi/No-Gi 패널 + 웹 자료 근거', ksTxt.includes('공통') && ksTxt.includes('웹 자료'), ksTxt.slice(0, 120));
const clickTab = (t) => page.evaluate((sel) => document.querySelector(sel)?.click(), `[data-testid="style-tab-${t}"]`);
await dismissBackupPrompt();
await clickTab('gi');
await sleep(400);
const ksGi = await page.evaluate(() => document.querySelector('[data-testid="style-posture"]')?.textContent ?? '');
await clickTab('nogi');
await sleep(400);
const ksNoGi = await page.evaluate(() => document.querySelector('[data-testid="style-posture"]')?.textContent ?? '');
check('[추가 기술] Gi / No-Gi 자세가 각각 다르게 표시', !!ksGi && !!ksNoGi && ksGi !== ksNoGi, { gi: ksGi.slice(0, 60), nogi: ksNoGi.slice(0, 60) });
await addedPage(encodeURIComponent('bjj__코요테-가드-롤오버-스윕'));
const cyTxt = await page.evaluate(() => document.body.textContent ?? '');
check('[추가 기술] 코요테 가드 롤오버 스윕: 근거 부족 → 판단 보류 표시 (지어내지 않음)', cyTxt.includes('판단 보류') && !(await has('[data-testid="style-posture"]')));
check('[추가 기술] 판단 보류 기술에 "Gi / No-Gi 조사하기" 제공', await has('[data-testid="gi-nogi-research-run"]'));

// 5. non-grappling page unchanged
await page.evaluate(() => (location.hash = '#/arts/boxing/techniques/boxing__jab'));
await sleep(1200);
check('[비그래플링] 복싱 기술에는 Gi/No-Gi 패널 없음', !(await has('[data-testid="grappling-style"]')));
check('[비그래플링] 기존 영상 섹션 유지', await has('[data-testid="related-videos"]'));

check('콘솔 오류 없음', errors.length === 0, errors.slice(0, 3));
console.log('screenshots:', SHOT_DIR);
await app.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
