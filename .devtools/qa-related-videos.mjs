// Related videos: 5-per-technique cap, dedupe, base data preserved, and
// "YouTube URL 직접 추가" AI verification with REAL video metadata (no mocks).
// Test videos come from data/curated/videos.json (already human-verified),
// never guessed ids. Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const envText = fs.readFileSync(path.join(APP_DIR, '.env'), 'utf8');
const envVar = (k) => (envText.match(new RegExp(`^${k}=(.*)$`, 'm')) ?? [])[1]?.trim();
const SUPA = { url: envVar('VITE_SUPABASE_URL'), key: envVar('VITE_SUPABASE_PUBLISHABLE_KEY') };
const curated = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'data/curated/videos.json'), 'utf8'));
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  const d = typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (d ? ' :: ' + d.slice(0, 500) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ARMBAR = curated['bjj__armbar'];
const TRIANGLE = curated['bjj__triangle'];
const JAB = curated['boxing__jab'];
// Real, distinct ids to fill the cap with (content doesn't matter for the cap test).
const FILLERS = [TRIANGLE[0], TRIANGLE[1], JAB[0], JAB[1]];

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-rv-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.waitForLoadState('load');
  await sleep(800);
  const goto = async (hash) => {
    await page.evaluate(() => { window.location.hash = '#/'; });
    await sleep(300);
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    await sleep(1100);
  };

  // ---------- Cap / dedupe / preservation (service layer) ----------
  const cap = await page.evaluate(async ({ FILLERS }) => {
    const svc = await import('/src/lib/techniqueVideo/service.ts');
    const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
    const t = resolveTechnique('bjj__armbar');
    const base = t.videos.map((v) => v.videoId);
    const steps = [svc.getTechniqueVideos(t).length];
    const adds = [];
    for (const f of FILLERS) {
      const r = svc.addTechniqueVideo(t, f);
      adds.push(r.ok ? 'ok' : r.code);
      steps.push(svc.getTechniqueVideos(t).length);
    }
    const dup = svc.addTechniqueVideo(t, t.videos[0]);
    const dupUser = svc.addTechniqueVideo(t, FILLERS[0]);
    const merged = svc.getTechniqueVideos(t).map((v) => v.videoId);
    const baseKept = base.every((id, i) => merged[i] === id) && t.videos.length === base.length;
    const unique = new Set(merged).size === merged.length;
    // Remove one user video -> back under the cap.
    svc.removeTechniqueVideo('bjj__armbar', FILLERS[0].videoId);
    const afterRemove = svc.getTechniqueVideos(t).length;
    const canRemoveBase = svc.isUserAddedVideo('bjj__armbar', base[0]);
    // Technique with 0 base videos: 0 -> 5 then blocked.
    const zero = { id: 'qa-zero-video-technique', videos: [] };
    const zeroSteps = [];
    for (const f of [...FILLERS, t.videos[0], t.videos[1]]) {
      const r = svc.addTechniqueVideo(zero, f);
      zeroSteps.push(r.ok ? svc.getTechniqueVideos(zero).length : r.code);
    }
    // Legacy single-video pick (old saveTechniqueVideoPick API) is still shown.
    svc.saveTechniqueVideoPick('qa-legacy-pick', [FILLERS[2]]);
    const legacy = svc.getTechniqueVideos({ id: 'qa-legacy-pick', videos: [] }).map((v) => v.videoId);
    return { base, steps, adds, dup: dup.ok ? 'ok' : dup.code, dupUser: dupUser.ok ? 'ok' : dupUser.code, merged, baseKept, unique, afterRemove, canRemoveBase, zeroSteps, legacy, limitMsg: svc.LIMIT_MESSAGE };
  }, { FILLERS });
  // bjj__armbar's base count depends on what was merged into it (2 before the 2026-10 relation audit, 4 after judo juji gatame joined) — check the growth from whatever it is up to 5.
  const n0 = cap.base.length;
  const expectSteps = Array.from({ length: 5 - n0 + 1 }, (_, i) => n0 + i);
  check(`[V1] 기존 영상 ${n0}개 기술: 추가할 때마다 1개씩 늘어 5개에서 멈춤`, n0 < 5 && JSON.stringify(cap.steps.slice(0, expectSteps.length)) === JSON.stringify(expectSteps) && cap.steps.slice(expectSteps.length - 1).every((x) => x === 5), cap);
  check('[V2] 5개 도달 후 추가 차단 (LIMIT)', cap.adds[3] === 'LIMIT' && cap.steps[4] === 5, cap.adds);
  check('[V3] 중복 videoId 차단 (기존 영상/사용자 추가 영상 모두)', cap.dup === 'DUPLICATE' && cap.dupUser === 'DUPLICATE', cap);
  check('[V4] 기존 큐레이션 영상 데이터 유지 (앞순서·원본 배열 그대로), 목록 내 중복 없음', cap.baseKept && cap.unique, cap.merged);
  check('[V5] 사용자 추가 영상 삭제 가능, 기존 큐레이션 영상은 삭제 대상 아님', cap.afterRemove === 4 && cap.canRemoveBase === false, cap);
  check('[V6] 영상 0개 기술: 1→2→3→4→5 추가 후 6번째 차단', JSON.stringify(cap.zeroSteps) === '[1,2,3,4,5,"LIMIT"]', cap.zeroSteps);
  check('[V7] 이전 방식으로 저장된 1개짜리 영상 기록도 그대로 표시', cap.legacy.length === 1 && cap.legacy[0] === FILLERS[2].videoId, cap.legacy);

  // ---------- UI: add button and limit message ----------
  await goto('#/arts/bjj/techniques/bjj__armbar');
  const addBtn = await page.locator('[data-testid="related-videos-add"]').textContent().catch(() => null);
  check('[V8] 영상이 있어도(4개) 추가 버튼 표시 + 개수 표시', !!addBtn && addBtn.includes('4/5'), addBtn);
  await page.evaluate(async ({ FILLERS }) => {
    const svc = await import('/src/lib/techniqueVideo/service.ts');
    const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
    svc.addTechniqueVideo(resolveTechnique('bjj__armbar'), FILLERS[0]);
  }, { FILLERS });
  await sleep(500);
  const limitText = await page.locator('[data-testid="related-videos-limit"]').textContent().catch(() => null);
  const addGone = (await page.locator('[data-testid="related-videos-add"]').count()) === 0;
  check('[V9] 5개일 때 추가 버튼 대신 "최대 5개" 안내', !!limitText && limitText.includes('최대 5개의 관련 영상까지 등록할 수 있습니다') && addGone, limitText);
  const iframes = await page.locator('.video-embed iframe').count();
  check('[V10] 기술 상세에 5개 영상 모두 표시', iframes === 5, iframes);

  // ---------- URL parsing ----------
  const parsed = await page.evaluate(async (id) => {
    const { parseYoutubeVideoId } = await import('/src/lib/techniqueVideo/urlVerification.ts');
    return [
      parseYoutubeVideoId(`https://www.youtube.com/watch?v=${id}&t=30s`),
      parseYoutubeVideoId(`https://youtu.be/${id}?si=abc`),
      parseYoutubeVideoId(`https://m.youtube.com/watch?v=${id}`),
      parseYoutubeVideoId(`https://www.youtube.com/shorts/${id}`),
      parseYoutubeVideoId(`youtube.com/embed/${id}`),
      parseYoutubeVideoId('https://vimeo.com/123456'),
      parseYoutubeVideoId('not a url'),
    ];
  }, ARMBAR[0].videoId);
  check('[U1] watch/youtu.be/m./shorts/embed 주소에서 videoId 추출, 다른 사이트·잘못된 입력 거부', parsed.slice(0, 5).every((p) => p === ARMBAR[0].videoId) && parsed[5] === null && parsed[6] === null, parsed);

  // ---------- Code-level evidence checks (deterministic, no network) ----------
  const guards = await page.evaluate(async () => {
    const { applyEvidenceChecks } = await import('/src/lib/techniqueVideo/urlVerification.ts');
    const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
    const t = resolveTechnique('bjj__armbar');
    const info = { videoId: 'x'.repeat(11), title: 'BJJ Armbar Tutorial', channel: 'c', description: 'In this lesson we break down the armbar from closed guard step by step.', lengthSeconds: 400, keywords: ['bjj'], category: 'Sports', playable: true };
    const base = { verdict: 'VERIFIED', identifiedTechnique: 'Armbar', identifiedMartialArt: 'BJJ', contentType: 'tutorial', reason: 'r' };
    return {
      fabricatedQuote: applyEvidenceChecks(t, info, { ...base, evidenceQuotes: ['John Danaher explains the armbar'] }).verdict,
      titleOnly: applyEvidenceChecks(t, info, { ...base, evidenceQuotes: ['BJJ Armbar Tutorial'] }).verdict,
      noTechniqueName: applyEvidenceChecks(t, info, { ...base, evidenceQuotes: ['step by step'] }).verdict,
      highlight: applyEvidenceChecks(t, info, { ...base, contentType: 'competition_highlight', evidenceQuotes: ['break down the armbar from closed guard'] }).verdict,
      genuine: applyEvidenceChecks(t, info, { ...base, evidenceQuotes: ['break down the armbar from closed guard'] }).verdict,
      modelNotMatched: applyEvidenceChecks(t, info, { ...base, verdict: 'NOT_MATCHED', evidenceQuotes: [] }).verdict,
      unknownVerdict: applyEvidenceChecks(t, info, { ...base, verdict: 'MAYBE', evidenceQuotes: [] }).verdict,
    };
  });
  check('[U2] AI가 VERIFIED라 해도 영상 정보에 없는 인용(지어낸 근거) → INSUFFICIENT_EVIDENCE', guards.fabricatedQuote === 'INSUFFICIENT_EVIDENCE', guards);
  check('[U3] 제목만 근거인 VERIFIED → INSUFFICIENT_EVIDENCE (제목만으로 등록 금지)', guards.titleOnly === 'INSUFFICIENT_EVIDENCE', guards);
  check('[U4] 근거에 현재 기술 이름이 없으면 → INSUFFICIENT_EVIDENCE', guards.noTechniqueName === 'INSUFFICIENT_EVIDENCE', guards);
  check('[U5] 경기 하이라이트는 기술명이 맞아도 → NOT_MATCHED', guards.highlight === 'NOT_MATCHED', guards);
  check('[U6] 설명에 실제 근거가 있는 강좌만 VERIFIED 유지, 알 수 없는 판정은 INSUFFICIENT', guards.genuine === 'VERIFIED' && guards.modelNotMatched === 'NOT_MATCHED' && guards.unknownVerdict === 'INSUFFICIENT_EVIDENCE', guards);

  // ---------- Real end-to-end verification (real metadata + real Gemini) ----------
  const real = await page.evaluate(async ({ ARMBAR, TRIANGLE, JAB }) => {
    const { verifyTechniqueVideoUrl } = await import('/src/lib/techniqueVideo/urlVerification.ts');
    const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
    const armbar = resolveTechnique('bjj__armbar');
    const pick = (r) => ({ verdict: r.verdict, reason: r.reason, title: r.info?.title, identified: r.identifiedTechnique, art: r.identifiedMartialArt, type: r.contentType, down: r.downgradedFrom ?? null });
    return {
      same: pick(await verifyTechniqueVideoUrl(armbar, `https://www.youtube.com/watch?v=${ARMBAR[1].videoId}`)),
      otherTechnique: pick(await verifyTechniqueVideoUrl(armbar, `https://youtu.be/${TRIANGLE[0].videoId}`)),
      otherArt: pick(await verifyTechniqueVideoUrl(armbar, `https://www.youtube.com/watch?v=${JAB[0].videoId}`)),
      missing: pick(await verifyTechniqueVideoUrl(armbar, 'https://www.youtube.com/watch?v=AAAAAAAAAAA')),
      invalidUrl: pick(await verifyTechniqueVideoUrl(armbar, 'https://example.com/video')),
    };
  }, { ARMBAR, TRIANGLE, JAB });
  check('[U7] 실제 Armbar 강좌 URL → VERIFIED', real.same.verdict === 'VERIFIED', real.same);
  check('[U8] 같은 무술(BJJ)의 다른 기술(Triangle) 영상 → NOT_MATCHED (제목에 BJJ가 있어도 거부)', real.otherTechnique.verdict === 'NOT_MATCHED', real.otherTechnique);
  check('[U9] 다른 무술(복싱 Jab) 영상 → NOT_MATCHED', real.otherArt.verdict === 'NOT_MATCHED', real.otherArt);
  check('[U10] 존재하지 않는 영상 → INSUFFICIENT_EVIDENCE (등록 보류)', real.missing.verdict === 'INSUFFICIENT_EVIDENCE', real.missing);
  check('[U11] YouTube가 아닌 주소 → INSUFFICIENT_EVIDENCE', real.invalidUrl.verdict === 'INSUFFICIENT_EVIDENCE', real.invalidUrl);

  // ---------- UI: URL tab flow on a technique with room ----------
  await page.evaluate(async () => {
    const svc = await import('/src/lib/techniqueVideo/service.ts');
    svc.clearTechniqueVideoPick('bjj__armbar'); // back to the 2 base videos
  });
  await goto('#/arts/bjj/techniques/bjj__armbar');
  await page.locator('[data-testid="related-videos-add"]').click();
  await sleep(400);
  const tabs = await page.locator('[role="tab"]').allTextContents();
  check('[U12] 추가 화면에 "AI 검색" / "URL 직접 추가" 두 방법 제공', tabs.some((t) => t.includes('AI가 관련 영상 검색')) && tabs.some((t) => t.includes('YouTube URL 직접 추가')), tabs);
  await page.locator('[role="tab"]', { hasText: 'YouTube URL 직접 추가' }).click();
  // A different-technique URL first: must NOT offer an add button.
  await page.fill('[data-testid="video-url-panel"] input', `https://www.youtube.com/watch?v=${TRIANGLE[1].videoId}`);
  await page.locator('[data-testid="video-url-panel"] button', { hasText: '검증하기' }).click();
  await page.waitForSelector('[data-testid="video-verify-result"]', { timeout: 60000 });
  const wrongVerdict = await page.getAttribute('[data-testid="video-verify-result"]', 'data-verdict');
  const wrongHasAdd = (await page.locator('[data-testid="video-verify-result"] button', { hasText: '영상 추가' }).count()) > 0;
  check('[U13] UI: 다른 기술 URL은 등록 버튼 없이 거부 메시지', wrongVerdict !== 'VERIFIED' && !wrongHasAdd, wrongVerdict);
  // A base video's URL: verified but already registered -> no add, no duplicate.
  await page.fill('[data-testid="video-url-panel"] input', `https://www.youtube.com/watch?v=${ARMBAR[0].videoId}`);
  await page.locator('[data-testid="video-url-panel"] button', { hasText: '검증하기' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="video-verify-result"]')?.textContent?.includes('How To Do The Perfect Armbar'), null, { timeout: 60000 });
  const dupText = await page.locator('[data-testid="video-verify-result"]').textContent();
  const dupVerdict = await page.getAttribute('[data-testid="video-verify-result"]', 'data-verdict');
  check('[U14] UI: 이미 등록된 영상 URL은 확인되어도 중복 추가 버튼 없음', !dupText.includes('영상 추가') && (dupVerdict !== 'VERIFIED' || dupText.includes('이미 등록된 영상입니다')), { dupVerdict, text: dupText.slice(0, 160) });
  const beforeCount = await page.locator('.video-embed iframe').count().catch(() => 0);
  check('[U15] 검증만으로는 DB에 추가되지 않음 (사용자 확인 전 등록 없음)', await page.evaluate(async () => (await import('/src/lib/techniqueVideo/service.ts')).getTechniqueVideoPick('bjj__armbar') === undefined), beforeCount);

  // ---------- Supabase edge-function transport (Android/web path), real account ----------
  const edge = await page.evaluate(async ({ id, SUPA }) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { error } = await supabase.auth.signUp({ email: `qa-rv-${Date.now()}@martialdex-test.local`, password: 'QaVideo!2026' });
    if (error) return { ok: false, stage: 'signup', msg: error.message };
    const { data } = await supabase.auth.getSession();
    const res = await fetch(`${SUPA.url}/functions/v1/youtube-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPA.key, Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ videoId: id }),
    });
    const body = await res.json();
    const noAuth = await fetch(`${SUPA.url}/functions/v1/youtube-search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPA.key }, body: JSON.stringify({ videoId: id }),
    });
    const search = await fetch(`${SUPA.url}/functions/v1/youtube-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPA.key, Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ query: 'bjj armbar tutorial' }),
    }).then((r) => r.json());
    return { status: res.status, ok: body.ok, title: body.info?.title, descLen: body.info?.description?.length ?? 0, noAuthStatus: noAuth.status, searchStillWorks: search.ok && search.results?.length > 0 };
  }, { id: ARMBAR[0].videoId, SUPA });
  check('[E1] Edge Function(Android 경로)에서도 실제 영상 정보 조회', edge.status === 200 && edge.ok && edge.title === ARMBAR[0].title && edge.descLen > 0, edge);
  check('[E2] Edge Function 비로그인 요청 거부(401), 기존 검색 기능 정상', edge.noAuthStatus === 401 && edge.searchStillWorks, edge);

  check('[R1] 전체 흐름 동안 페이지 에러 없음', pageErrors.length === 0, pageErrors);
  await app.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} PASSED ===`);
  for (const f of failed) console.log(' - ' + f.name);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error('DRIVER FAILED:', e); process.exit(1); });
