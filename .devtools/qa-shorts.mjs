// 숏폼 / 소셜 댓글 / 영상 내용 배우기 — in-app QA with the Supabase REST responses mocked
// (no real posts are created). Electron + Vite dev server on :5173.  Run: node .devtools/qa-shorts.mjs
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const APP_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SHOT = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-shorts-'));
const results = [];
const check = (n, p, d = '') => (results.push(p), console.log((p ? 'PASS' : 'FAIL') + ' — ' + n + (d !== '' ? ' :: ' + JSON.stringify(d).slice(0, 300) : '')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = Date.now();
const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();
const POSTS = [
  { id: 'qa_p1', author_id: 'u_coach', author_nickname: '코치A', content: '잽-크로스 뒤 원투 셋업 연습했습니다 #복싱 #원투', post_type: 'media', gym_id: null, gym_name: null, curriculum_snapshot: null, tags: [{ type: 'technique', id: 'kickboxing__jab', name: 'Jab', martialArt: 'kickboxing' }, { type: 'combo', id: 'sc_qa', name: '원투 셋업', martialArt: 'boxing', kind: 'setup' }], like_count: 3, comment_count: 3, save_count: 0, repost_count: 0, created_at: iso(5), updated_at: iso(5) },
  { id: 'qa_p2', author_id: 'u_b', author_nickname: '레슬러B', content: '더블렉 진입', post_type: 'media', gym_id: null, gym_name: null, curriculum_snapshot: null, tags: [], like_count: 0, comment_count: 0, save_count: 0, repost_count: 0, created_at: iso(60), updated_at: iso(60) },
];
const MEDIA = [
  { id: 'm1', post_id: 'qa_p1', type: 'video', url: 'https://example.invalid/qa1.mp4', thumbnail_url: null, order_index: 0 },
  { id: 'm2', post_id: 'qa_p2', type: 'video', url: 'https://example.invalid/qa2.mp4', thumbnail_url: null, order_index: 0 },
];
const COMMENTS = [
  { id: 'qa_c1', post_id: 'qa_p1', author_id: 'u_x', author_nickname: '수련생', content: '훅 각도가 좋네요', created_at: iso(3), parent_comment_id: null, reply_count: 1, like_count: 12 },
  { id: 'qa_c2', post_id: 'qa_p1', author_id: 'u_coach', author_nickname: '코치A', content: '감사합니다!', created_at: iso(2), parent_comment_id: null, reply_count: 0, like_count: 2 },
];
const REPLIES = [{ id: 'qa_r1', post_id: 'qa_p1', author_id: 'u_coach', author_nickname: '코치A', content: '@수련생 다음엔 바디로도 해볼게요', created_at: iso(1), parent_comment_id: 'qa_c1', reply_count: 0, like_count: 1 }];

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [APP_DIR, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-shorts-'))}`], env, timeout: 30000 });
await sleep(2500);
const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
await page.route('**/rest/v1/community_posts**', (r) => r.fulfill(json(r.request().url().includes('id=eq.') ? POSTS.filter((p) => r.request().url().includes(p.id)) : POSTS)));
await page.route('**/rest/v1/community_post_media**', (r) => r.fulfill(json(MEDIA)));
await page.route('**/rest/v1/community_post_reposts**', (r) => r.fulfill(json([])));
await page.route('**/rest/v1/community_comment_likes**', (r) => r.fulfill(json([])));
await page.route('**/rest/v1/community_post_comments**', (r) => {
  const u = r.request().url();
  if (u.includes('parent_comment_id=eq.')) return r.fulfill(json(REPLIES));
  const sorted = u.includes('like_count.desc') ? [...COMMENTS].sort((a, b) => b.like_count - a.like_count) : [...COMMENTS].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return r.fulfill(json(sorted));
});
await page.route('https://example.invalid/**', (r) => r.fulfill({ status: 404, body: '' }));
await page.setViewportSize({ width: 390, height: 800 });

await page.evaluate(() => (location.hash = '#/shorts'));
await page.waitForSelector('[data-testid="short"]', { timeout: 15000 }).catch(() => null);
await sleep(800);
const slides = await page.evaluate(() => [...document.querySelectorAll('[data-testid="short"]')].map((s) => ({ id: s.getAttribute('data-post-id'), active: s.getAttribute('data-active') })));
check('[숏폼] 영상 게시물 2개가 한 화면씩 표시, 첫 영상 재생 대상', slides.length === 2 && slides[0].active === 'true', slides);
const first = await page.evaluate(() => {
  const s = document.querySelector('[data-testid="short"]');
  return { like: s?.querySelector('[data-testid="short-like"] small')?.textContent, comments: s?.querySelector('[data-testid="short-comments"] small')?.textContent, learn: !!s?.querySelector('[data-testid="short-learn"]'), tags: [...(s?.querySelectorAll('[data-testid="short-tag"]') ?? [])].map((t) => t.textContent), video: !!s?.querySelector('video') };
});
check('[숏폼] 오른쪽 좋아요·댓글 수 + 배우기 버튼 + 태그', first.like === '3' && first.comments === '3' && first.learn && first.tags.length === 2 && first.video, first);
const second = await page.evaluate(() => !document.querySelectorAll('[data-testid="short"]')[1]?.querySelector('[data-testid="short-learn"]'));
check('[숏폼] 태그 없는 영상엔 배우기 버튼 없음', second);
await page.screenshot({ path: path.join(SHOT, '01-shorts.png') });

// comments sheet (logged out)
await page.click('[data-testid="short"] [data-testid="short-comments"]');
await page.waitForSelector('[data-testid="comment"]', { timeout: 8000 }).catch(() => null);
await sleep(300);
const c = await page.evaluate(() => ({
  title: document.querySelector('.cmt-head h3')?.textContent,
  popularOn: document.querySelector('[data-testid="comment-sort-popular"]')?.getAttribute('aria-selected'),
  order: [...document.querySelectorAll('[data-testid="comment"]')].map((e) => e.getAttribute('data-id')),
  hearts: [...document.querySelectorAll('[data-testid="comment"] [data-testid="comment-like"] small')].map((e) => e.textContent),
  badge: !!document.querySelector('[data-testid="comment"][data-id="qa_c2"] .cmt__badge'),
  toggle: document.querySelector('[data-testid="comment-replies-toggle"]')?.textContent,
  loginMsg: document.body.textContent?.includes('댓글을 작성하려면 로그인'),
}));
check('[댓글] 틱톡식: "댓글 3개", 인기순 기본, 좋아요 많은 순', c.title === '댓글 3개' && c.popularOn === 'true' && c.order.join() === 'qa_c1,qa_c2' && c.hearts.join() === '12,2', c);
check('[댓글] 게시자 댓글에 "작성자" 배지 + "답글 1개 보기"', c.badge && /답글 1개 보기/.test(c.toggle ?? ''), c);
await page.click('[data-testid="comment-replies-toggle"]');
await sleep(500);
const rep = await page.evaluate(() => document.querySelector('[data-testid="comment-reply"]')?.textContent ?? '');
check('[댓글] 답글 펼치기', rep.includes('다음엔 바디로도'), rep.slice(0, 80));
await page.click('[data-testid="comment-sort-latest"]');
await sleep(600);
const latest = await page.evaluate(() => [...document.querySelectorAll('[data-testid="comment"]')].map((e) => e.getAttribute('data-id')));
check('[댓글] 최신순 전환', latest.join() === 'qa_c1,qa_c2' && (await page.evaluate(() => document.querySelector('[data-testid="comment-sort-latest"]')?.getAttribute('aria-selected'))) === 'true', latest);
check('[댓글] 로그아웃 상태에선 입력창 대신 로그인 안내', c.loginMsg);
await page.screenshot({ path: path.join(SHOT, '02-comments.png') });
await page.click('.cmt-head__close');
await sleep(300);

// learn → AI coach (prefilled)
await page.click('[data-testid="short"] [data-testid="short-learn"]');
await sleep(400);
const learn = await page.evaluate(() => ({ radios: document.querySelectorAll('[data-testid="learn-tag"]').length, actions: ['learn-ai-coach', 'learn-curriculum', 'learn-detail'].every((id) => !!document.querySelector(`[data-testid="${id}"]`)) }));
check('[배우기] 태그 2개 중 선택 + 3가지 방법(AI 코치·커리큘럼·자세히 보기)', learn.radios === 2 && learn.actions, learn);
await page.screenshot({ path: path.join(SHOT, '03-learn.png') });
await page.click('[data-testid="learn-ai-coach"]');
await page.waitForSelector('[data-testid="oneoff-request"]', { timeout: 10000 }).catch(() => null);
const ai = await page.evaluate(() => ({ hash: location.hash, value: document.querySelector('[data-testid="oneoff-request"]')?.value, art: document.querySelector('[data-testid="oneoff-art"]')?.value }));
check('[배우기→AI 코치] 수업 화면에 요청이 미리 채워짐 (자동 시작 안 함)', ai.hash.startsWith('#/coach/lesson') && /Jab 기술을 배우고 싶어/.test(ai.value ?? '') && ai.art === 'kickboxing', ai);

// learn → curriculum
await page.evaluate(() => (location.hash = '#/shorts'));
await page.waitForSelector('[data-testid="short-learn"]', { timeout: 10000 });
await sleep(500);
await page.click('[data-testid="short"] [data-testid="short-learn"]');
await sleep(300);
await page.click('[data-testid="learn-curriculum"]');
await sleep(1500);
const cur = await page.evaluate(() => ({ hash: location.hash, text: [...document.querySelectorAll('textarea')].map((t) => t.value).join(' | ') }));
check('[배우기→커리큘럼] AI 목적 커리큘럼에 목표가 미리 채워짐 (태그 전체)', cur.hash.startsWith('#/ai-curriculum') && cur.text.includes('Jab') && cur.text.includes('원투 셋업'), cur);

// tag → combo detail
await page.evaluate(() => (location.hash = '#/shorts'));
await page.waitForSelector('[data-testid="short-tag"]', { timeout: 10000 });
await sleep(500);
await page.evaluate(() => [...document.querySelectorAll('[data-testid="short"] [data-testid="short-tag"]')][1]?.click());
await sleep(300);
const pickedCombo = await page.evaluate(() => document.querySelector('[data-testid="learn-tag"][aria-checked="true"]')?.textContent);
await page.click('[data-testid="learn-detail"]');
await sleep(800);
check('[배우기→자세히 보기] 누른 태그(셋업)가 선택된 상태로 열리고 상세 페이지로 이동', /원투 셋업/.test(pickedCombo ?? '') && (await page.evaluate(() => location.hash)).startsWith('#/user-combos/sc_qa'), pickedCombo);

// swipe to the next video
await page.evaluate(() => (location.hash = '#/shorts'));
await page.waitForSelector('[data-testid="short"]', { timeout: 10000 });
await sleep(500);
await page.evaluate(() => document.querySelector('.shorts__scroller')?.scrollTo({ top: document.querySelector('.shorts__scroller').clientHeight, behavior: 'instant' }));
await sleep(900);
const act = await page.evaluate(() => [...document.querySelectorAll('[data-testid="short"]')].map((s) => s.getAttribute('data-active')));
check('[숏폼] 아래로 넘기면 다음 영상이 재생 대상', act.join() === 'false,true', act);

// community entry point
await page.evaluate(() => (location.hash = '#/community'));
await sleep(1500);
check('[커뮤니티] "숏폼으로 보기" 진입 버튼', !!(await page.$('[data-testid="open-shorts"]')));

check('페이지 오류 없음', errors.length === 0, errors.slice(0, 3));
console.log('screenshots:', SHOT);
await app.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
