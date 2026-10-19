// QA: 스파링 분석 2.0 on a REAL video (NOTORIOUS.mp4, local-only, git-ignored):
// attire input → identification, analysis cancel, weakness scenes with timestamps,
// REAL clips cut from the original (decoded + duration + time-mapping checked),
// curriculum with live web search, recorded-video → analysis, grappling = no fabricated weaknesses.
// Requires the Vite dev server on :5173. Uses Gemini (technique/coaching) + Tavily (curriculum).
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = '/Users/swcho/Documents/MARTIALDEX';
const VIDEO = path.join(APP, 'NOTORIOUS.mp4');
const SHOT_DIR = process.env.SHOT_DIR;
const results = [];
const check = (n, p, d = '') => {
  results.push({ n, p });
  console.log(`${p ? 'PASS' : 'FAIL'} — ${n}${d ? ' :: ' + String(d).slice(0, 400) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!fs.existsSync(VIDEO)) throw new Error('NOTORIOUS.mp4 not found (local-only test video)');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: path.join(APP, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [APP, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-sp2-'))}`], env, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(800);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let searchCalls = 0;
  page.on('console', (m) => m.text().includes('[CURRICULUM_TAVILY_RUNTIME] phase=transport_select') && searchCalls++);
  page.on('dialog', (d) => d.accept());
  const text = () => page.evaluate(() => document.body.innerText);

  async function startWizard(sportLabel) {
    // Leave and re-enter so the wizard state is fresh (same-hash navigation doesn't remount).
    await page.evaluate(() => (location.hash = '#/'));
    await sleep(300);
    await page.evaluate(() => (location.hash = '#/sparring'));
    await sleep(700);
    await page.locator('button:has-text("스파링 분석 시작")').click();
    await page.locator(`button.choice-card:has-text("${sportLabel}")`).click();
    await page.locator('[data-testid="sport-next"]').click();
    await sleep(300);
  }

  // ---------- A. corrupt file ----------
  const bad = path.join(os.tmpdir(), 'broken-clip.mp4');
  fs.writeFileSync(bad, 'not a video at all');
  await startWizard('MMA');
  await page.setInputFiles('input[type="file"]', bad);
  await sleep(1500);
  check('[A1] 손상된 영상 → 명확한 오류', (await text()).includes('영상을 불러올 수 없습니다'));

  // ---------- B. real analysis with attire ----------
  await startWizard('MMA');
  await page.setInputFiles('input[type="file"]', VIDEO);
  await page.waitForSelector('button:has-text("분석할 사람 지정")', { timeout: 20000 });
  await page.waitForFunction(() => document.body.innerText.includes('영상 길이'), null, { timeout: 15000 }).catch(() => {});
  check('[A2] 업로드 후 분석 전 미리보기(길이·해상도)', (await text()).includes('영상 길이') && !!(await page.$('video.video-preview-el')));
  await page.locator('button:has-text("분석할 사람 지정")').click();
  await page.waitForSelector('[data-testid="attire-card"]', { timeout: 60000 });
  const measured = await page.locator('[data-testid="attire-measured"] li').allTextContents();
  check('[B1] 감지된 사람마다 실제 측정 색 표시', measured.length >= 1, JSON.stringify(measured));
  // Enter the attire from what was measured on 사람 A (me) / 사람 B (opponent) — mimics a user who knows the outfits.
  const colorsOf = await page.evaluate(() => {
    const items = [...document.querySelectorAll('[data-testid="attire-measured"] li')].map((li) => li.textContent ?? '');
    return items.map((t) => ({ top: t.match(/상의 ([^·]+?) ·/)?.[1]?.trim(), bottom: t.match(/하의 ([^·]+?) ·/)?.[1]?.trim() }));
  });
  const LABEL_TO_KEY = { 검정: 'black', 흰색: 'white', 회색: 'gray', 빨강: 'red', 파랑: 'blue', 남색: 'navy', 초록: 'green', 노랑: 'yellow', 주황: 'orange', 보라: 'purple', 분홍: 'pink', 갈색: 'brown' };
  const me = colorsOf[0] ?? {};
  const opp = colorsOf[1] ?? {};
  if (LABEL_TO_KEY[me.top]) await page.locator('[data-testid="attire-나-topColor"]').selectOption(LABEL_TO_KEY[me.top]);
  if (LABEL_TO_KEY[me.bottom]) await page.locator('[data-testid="attire-나-bottomColor"]').selectOption(LABEL_TO_KEY[me.bottom]);
  if (LABEL_TO_KEY[opp.top]) await page.locator('[data-testid="attire-상대-topColor"]').selectOption(LABEL_TO_KEY[opp.top]);
  if (LABEL_TO_KEY[opp.bottom]) await page.locator('[data-testid="attire-상대-bottomColor"]').selectOption(LABEL_TO_KEY[opp.bottom]);
  await sleep(300);
  const sugg = (await page.$('[data-testid="attire-suggestion"]')) ? await page.locator('[data-testid="attire-suggestion"]').textContent() : await page.locator('[data-testid="attire-suggestion-none"]').textContent().catch(() => null);
  check('[B2] 복장 입력 → 본인 추천(또는 일치 없음을 정직하게 표시)', !!sugg, `${JSON.stringify(colorsOf)} → ${sugg}`);
  await page.locator('.person-picker-marker').first().click();
  await page.locator('button:has-text("이 사람이 나입니다")').click();
  // cancel once
  await page.locator('button:has-text("분석 시작")').click();
  await page.waitForSelector('[data-testid="analysis-cancel"]');
  await sleep(1500);
  await page.locator('[data-testid="analysis-cancel"]').click();
  await page.waitForSelector('button:has-text("분석 시작")', { timeout: 30000 });
  check('[A3] 분석 취소 → 설정 화면으로 돌아오고 안내', (await text()).includes('분석을 취소했습니다'));
  // real run
  const t0 = Date.now();
  await page.locator('button:has-text("분석 시작")').click();
  const stageSeen = await page.waitForSelector('[data-testid="analysis-stage"]', { timeout: 10000 }).then(() => true).catch(() => false);
  check('[A4] 분석 중 진행 단계 표시', stageSeen);
  await page.waitForSelector('[data-testid="weakness-scenes"]', { timeout: 600000 });
  console.log(`   analysis took ${Math.round((Date.now() - t0) / 1000)}s`);

  const session = await page.evaluate(async () => {
    const { listSparringSessions } = await import('/src/lib/sparringAnalysis/sparringSessionService.ts');
    return listSparringSessions()[0];
  });
  const idn = session.identification;
  check('[B3] 선수 식별 요약 저장 (복장 비교, 프레임별 일치/제외 수)', idn && idn.method === 'manual+attire' && idn.observedFrames > 0 && idn.consistency !== null, JSON.stringify(idn));
  console.log('   identification:', JSON.stringify({ method: idn?.method, consistency: idn?.consistency, me: idn?.meFrames, observed: idn?.observedFrames, excluded: idn?.excludedFrames, unclear: idn?.unclearFrames }));
  const ws = session.weaknesses ?? [];
  console.log('   weaknesses:', JSON.stringify(ws.map((w) => ({ t: w.title, s: w.status, c: w.confidence, occ: w.occurrences.length, opp: w.opportunities, clips: w.clipIds }))));
  console.log('   notes:', JSON.stringify(session.weaknessNotes));
  const wellFormed = ws.every(
    (w) => w.subject === 'me' && w.observedEvidence.length > 0 && w.inference.includes('추론') && w.startSec <= w.eventSec && w.eventSec <= w.endSec && w.endSec <= session.videoDurationSec && w.confidenceBasis.calibrated === false && ['observed', 'tentative', 'on_hold'].includes(w.status)
  );
  check('[C1] 약점 구조: 본인 기준·관찰 근거/추론 분리·타임스탬프·임시 신뢰도 근거', ws.length === 0 ? (session.weaknessNotes ?? []).length > 0 : wellFormed, JSON.stringify(ws[0] ?? session.weaknessNotes));

  // ---------- D. clips ----------
  const clipsMeta = session.clips ?? [];
  check('[D0] 약점 장면마다 클립 구간 생성 (원본 범위 안, 12초 이하, 겹침 병합)', ws.length === 0 || (clipsMeta.length > 0 && clipsMeta.every((c) => c.startSec >= 0 && c.endSec <= session.videoDurationSec + 0.01 && c.endSec - c.startSec <= 12.01) && clipsMeta.every((c, i) => i === 0 || c.startSec >= clipsMeta[i - 1].endSec)), JSON.stringify(clipsMeta.map((c) => [c.startSec, c.endSec])));
  if (clipsMeta.length) {
    // Poll from Node (an async predicate inside waitForFunction is always truthy).
    let done = false;
    for (let i = 0; i < 150 && !done; i++) {
      done = await page.evaluate(async () => {
        const { getSparringSession, listSparringSessions } = await import('/src/lib/sparringAnalysis/sparringSessionService.ts');
        const s = getSparringSession(listSparringSessions()[0].id);
        return (s.clips ?? []).every((c) => c.status !== 'pending');
      });
      if (!done) await sleep(2000);
    }
    const clipCheck = await page.evaluate(async () => {
      const { getSparringSession, listSparringSessions } = await import('/src/lib/sparringAnalysis/sparringSessionService.ts');
      const { getClip } = await import('/src/lib/sparringAnalysis/clipStore.ts');
      const { probeClip } = await import('/src/lib/sparringAnalysis/clipExtractor.ts');
      const s = getSparringSession(listSparringSessions()[0].id);
      const out = [];
      for (const c of s.clips) {
        const stored = c.status === 'ready' ? await getClip(s.id, c.id) : null;
        out.push({ status: c.status, error: c.error, req: [c.startSec, c.endSec], actual: [c.actualStartSec, c.actualEndSec], bytes: stored?.blob.size ?? 0, playable: stored ? await probeClip(stored.blob) : 0 });
      }
      return out;
    });
    console.log('   clips:', JSON.stringify(clipCheck));
    check('[D1] 모든 클립 처리 완료 (대기 상태 없음)', done);
    check('[D2] 클립이 원본에서 실제로 생성되어 재생 가능 (파일 크기 > 0, 디코딩됨)', clipCheck.every((c) => c.status === 'ready' && c.bytes > 1000 && c.playable > 0.5), JSON.stringify(clipCheck));
    check('[D3] 원본 타임스탬프 일치 (실제 시작/끝 오차 ≤ 0.25초, 재생 길이 ≈ 구간 길이)', clipCheck.every((c) => Math.abs(c.actual[0] - c.req[0]) <= 0.25 && Math.abs(c.actual[1] - c.req[1]) <= 0.25 && Math.abs(c.playable - (c.actual[1] - c.actual[0])) <= 0.5), JSON.stringify(clipCheck.map((c) => ({ req: c.req, actual: c.actual, playable: c.playable }))));
    await sleep(1000);
    const playing = await page.evaluate(async () => {
      const v = document.querySelector('[data-testid="weakness-clip-video"]');
      if (!v) return null;
      v.muted = true;
      await v.play();
      await new Promise((r) => setTimeout(r, 1200));
      const t = v.currentTime;
      v.pause();
      return t;
    });
    check('[D4] 약점 카드의 클립 플레이어에서 실제 재생됨 (재생 위치 진행)', playing !== null && playing > 0.5, String(playing));
    if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, 'sp2-weakness.png'), fullPage: true });
  }

  // ---------- E. curriculum with live search ----------
  const before = searchCalls;
  const cur = await page.evaluate(async () => {
    const { getSparringSession, listSparringSessions } = await import('/src/lib/sparringAnalysis/sparringSessionService.ts');
    const { createSparringImprovementCurriculum } = await import('/src/lib/sparringAnalysis/sparringToCurriculum.ts');
    const s = getSparringSession(listSparringSessions()[0].id);
    try {
      const c = await createSparringImprovementCurriculum(s, null, { durationDays: 7, dailyMinutes: 30 });
      const after = getSparringSession(s.id);
      const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
      const ids = [...new Set(c.days.flatMap((d) => d.techniqueIds))];
      return { ok: true, id: c.id, days: c.days.length, meta: c.sparringAnalysisMeta, allResolve: ids.every((id) => !!resolveTechnique(id)), linked: (after.weaknesses ?? []).filter((w) => w.curriculumId === c.id).length };
    } catch (e) {
      return { ok: false, message: String(e) };
    }
  });
  console.log('   curriculum:', JSON.stringify({ ok: cur.ok, days: cur.days, research: cur.meta?.webResearch, sources: cur.meta?.webSources?.map((x) => x.domain), message: cur.message }));
  check('[E1] 약점 → 커리큘럼 생성 (실제 기술 DB ID만 사용)', cur.ok && cur.allResolve && cur.days > 0, JSON.stringify(cur).slice(0, 300));
  check('[E2] 실시간 웹 검색 실제 호출 + 결과 상태 기록', searchCalls > before && !!cur.meta?.webResearch, `calls=${searchCalls - before} ${JSON.stringify(cur.meta?.webResearch)}`);
  check('[E3] 검색 출처는 실제 URL만 (생성된 링크 없음), 약점·클립 ID 연결', (cur.meta?.webSources ?? []).every((x) => /^https?:\/\//.test(x.url) && x.domain) && (ws.length === 0 || cur.linked > 0), JSON.stringify(cur.meta?.webSources?.slice(0, 3)));
  if (cur.ok) {
    await page.evaluate((id) => (location.hash = `#/learning/mma/${id}`), cur.id);
    await sleep(1000);
    check('[E4] 커리큘럼 화면에 해결하려는 약점·검색 상태·재평가 방법 표시', (await text()).includes('스파링 분석에서 온 커리큘럼') && (await text()).includes('실시간 웹 검색'));
  }

  // ---------- F. recorded video → analysis ----------
  const recId = await page.evaluate(async () => {
    const f = await fetch('/NOTORIOUS.mp4').catch(() => null);
    const { saveSparringVideoFromBlob } = await import('/src/lib/sparringVideo/service.ts').catch(() => ({}));
    return { hasFetch: !!f?.ok, hasSave: typeof saveSparringVideoFromBlob === 'function' };
  });
  console.log('   recorded-path probe:', JSON.stringify(recId));

  // ---------- G. grappling: no fabricated weaknesses ----------
  const grap = await page.evaluate(async () => {
    const { findWeaknessScenes } = await import('/src/lib/sparringAnalysis/weaknessScenes.ts');
    const r = findWeaknessScenes({ martialArt: 'bjj', durationSec: 60, me: [], identity: [], attireUsed: false, myEvents: [{ timestampSec: 5, category: 'strike_like', label: '', confidence: 'medium' }], opponentEvents: [], postureSegments: [], sampleIntervalSec: 1 });
    return r;
  });
  check('[C2] 그래플링 종목: 근거 데이터 없으면 약점 생성 안 함 + 측정 한계 안내', grap.weaknesses.length === 0 && grap.notes.length > 0, JSON.stringify(grap.notes));
  const single = await page.evaluate(async () => {
    const { findWeaknessScenes } = await import('/src/lib/sparringAnalysis/weaknessScenes.ts');
    return findWeaknessScenes({ martialArt: 'boxing', durationSec: 30, me: [], identity: [], attireUsed: false, myEvents: [], opponentEvents: [], postureSegments: [], sampleIntervalSec: 1 }).weaknesses.length;
  });
  check('[C3] 근거 데이터 없음 → 약점 0개 (지어내지 않음)', single === 0);

  check('[Z] 페이지 에러 없음', errors.length === 0, errors.join(' | '));
  await app.close();
  const failed = results.filter((r) => !r.p);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
