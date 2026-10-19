// QA: (1) AI 코치 lessons raise mastery (skillProgress + coachEvidence), (2) when YouTube finds no
// lesson video, the coach shows videos found on OTHER video platforms (live web search).
// Mastery uses real lesson-log entries as the lesson code writes them (saveLessonLog); videos use
// the real Tavily web search. Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = '/Users/swcho/Documents/MARTIALDEX';
const results = [];
const check = (n, p, d = '') => {
  results.push(p);
  console.log(`${p ? 'PASS' : 'FAIL'} — ${n}${d ? ' :: ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 400) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn().catch(() => false)) return true;
    await sleep(step);
  }
  return false;
};

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath: path.join(APP, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: [APP, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-cmv-'))}`],
  env,
  timeout: 60000,
});
const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
await page.waitForLoadState('load');
await sleep(1000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());

// ---------------- (1) mastery from AI 코치 lessons ----------------
const m = await page.evaluate(async () => {
  const { saveLessonLog } = await import('/src/lib/coachLesson/lessonLog.ts');
  const { computeSkillProgress } = await import('/src/lib/skillProgress/computeSkillProgress.ts');
  const { setOverride, clearOverride } = await import('/src/lib/skillProgress/overrideStore.ts');
  const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
  const T = 'boxing__jab';
  const t = resolveTechnique(T);
  const lesson = (day, overall, practiced, id = `${T}-${day}-${overall}`) =>
    saveLessonLog({
      id,
      kind: 'one_off',
      title: 'QA 잽 수업',
      date: day,
      startedAt: `${day}T10:00:00.000Z`,
      finishedAt: `${day}T10:30:00.000Z`,
      curriculumId: null,
      day: null,
      historyEntryId: null,
      techniques: [{ techniqueId: t.id, name: t.name, overall, practiced, concepts: [] }],
      qa: [],
      recap: null,
      updatedAt: `${day}T10:30:00.000Z`,
      coachKind: 'gemini',
    });
  const st = () => {
    const p = computeSkillProgress(t.id);
    return { status: p.status, lessons: p.coachLessonCount, days: p.coachMasteredDays };
  };
  const out = { before: st() };
  lesson('2026-10-10', 'partial', true);
  out.partial = st();
  lesson('2026-10-11', 'understood', true);
  out.oneDay = st();
  lesson('2026-10-12', 'understood', false);
  out.notPracticed = st();
  lesson('2026-10-13', 'understood', true);
  lesson('2026-10-14', 'understood', true);
  out.threeDays = st();
  lesson('2026-10-15', 'weak', true);
  out.weak = st();
  lesson('2026-10-16', 'understood', true);
  out.recovered = st();
  setOverride(t.id, 'learning');
  out.override = st();
  clearOverride(t.id);
  // a camera pose analysis (measured form) takes priority
  const KEY = Object.keys(localStorage).find((k) => /pose/i.test(k) && /record/i.test(k)) || 'martialdex:pose-analysis-records';
  out.poseKey = KEY;
  return { ...out, id: t.id };
});
check('[M0] 수업 전 → 미학습', m.before.status === 'not_started', m.before);
check('[M1] 부분 이해 수업 → 학습 중', m.partial.status === 'learning', m.partial);
check('[M2] 이해 + 연습까지 한 수업(1일) → 보통으로 오름', m.oneDay.status === 'average' && m.oneDay.days === 1, m.oneDay);
check('[M3] 이해했지만 연습 안 한 수업은 날짜로 세지 않음', m.notPracticed.days === 1, m.notPracticed);
check('[M4] 이해 + 연습 3일 → 숙련', m.threeDays.status === 'proficient' && m.threeDays.days === 3, m.threeDays);
check('[M5] 최근 수업에서 이해 약함 → 보완 필요', m.weak.status === 'needs_improvement', m.weak);
check('[M6] 다시 이해 + 연습 → 숙련 회복', m.recovered.status === 'proficient', m.recovered);
check('[M7] 사용자가 직접 지정한 숙련도가 항상 우선', m.override.status === 'learning', m.override);

// pose analysis (measured) takes priority
const pose = await page.evaluate(async (id) => {
  const { saveAnalysisResult } = await import('/src/lib/poseAnalysis/recordsService.ts');
  const { computeSkillProgress } = await import('/src/lib/skillProgress/computeSkillProgress.ts');
  saveAnalysisResult('boxing', { techniqueId: id, overallScore: 62, status: 'average', metricScores: [], strengths: [], improvements: [], frameCount: 30 });
  return computeSkillProgress(id);
}, m.id);
check('[M8] 카메라 자세 분석 기록이 있으면 그 측정 결과가 우선 (62점 → 보통)', pose.analysisCount === 1 && pose.status === 'average', { status: pose.status, analysis: pose.analysisCount });

// UI: 배운 기술 + 기술 상세
await page.evaluate(() => (location.hash = '#/learned-techniques'));
await sleep(1500);
const learned = await page.evaluate(() => document.body.innerText.includes('AI 코치 수업 기록 있음'));
check('[M9] 배운 기술: "AI 코치 수업 기록 있음" 근거로 표시', learned);
await page.evaluate((id) => (location.hash = `#/arts/boxing/techniques/${encodeURIComponent(id)}`), m.id);
await until(async () => !!(await page.$('[data-testid="skill-coach-lessons"]')), 10000);
const detail = await page.evaluate(() => document.querySelector('[data-testid="skill-coach-lessons"]')?.textContent ?? '');
check('[M10] 기술 상세: AI 코치 수업 횟수 · 이해+연습 일수 표시', /7회/.test(detail) && /4일/.test(detail), detail);

// ---------------- (2) videos from other platforms ----------------
const parse = await page.evaluate(async () => {
  const { parseVideoUrl, termEvidence } = await import('/src/lib/techniqueVideo/otherPlatformVideos.ts');
  const cases = {
    vimeo: parseVideoUrl('https://vimeo.com/123456789'),
    daily: parseVideoUrl('https://www.dailymotion.com/video/x8abcde'),
    naver: parseVideoUrl('https://tv.naver.com/v/12345678'),
    tiktok: parseVideoUrl('https://www.tiktok.com/@coach.kim/video/7234567890123456789'),
    bili: parseVideoUrl('https://www.bilibili.com/video/BV1xx411c7mD'),
    insta: parseVideoUrl('https://www.instagram.com/reel/Cabc123/'),
    yt: parseVideoUrl('https://youtu.be/dQw4w9WgXcQ'),
    channel: parseVideoUrl('https://vimeo.com/channels/staffpicks'),
    profile: parseVideoUrl('https://www.tiktok.com/@coach.kim'),
    blog: parseVideoUrl('https://blog.naver.com/abc/123'),
  };
  return { cases, hit: termEvidence('How to throw a perfect JAB - boxing basics', ['잽', 'Jab']), miss: termEvidence('Top 10 knockouts of 2024', ['잽', 'Jab']) };
});
const c = parse.cases;
check(
  '[V1] 영상 페이지 인식 + 앱 안 재생 주소 (Vimeo·Dailymotion·TikTok·Bilibili·YouTube), 네이버TV·Instagram은 새 창',
  c.vimeo?.embedUrl === 'https://player.vimeo.com/video/123456789' && c.daily?.embedUrl === 'https://geo.dailymotion.com/player.html?video=x8abcde' && c.naver?.platform === 'naver' && c.naver.embedUrl === null && c.tiktok?.platform === 'tiktok' && c.bili?.embedUrl?.includes('bvid=BV1xx411c7mD') && c.yt?.platform === 'youtube' && c.insta?.platform === 'instagram' && c.insta.embedUrl === null,
  c,
);
check('[V2] 채널·프로필·블로그 같은 영상이 아닌 페이지는 제외', !c.channel && !c.profile && !c.blog);
check('[V3] 페이지 제목·설명에 수업 단어가 있어야만 채택', parse.hit === 'Jab' && parse.miss === null, parse);

// live: AI 코치 path (findLessonVideos) with the YouTube search failing
const live = await page.evaluate(async () => {
  const { findLessonVideos } = await import('/src/lib/coachLesson/lessonVideos.ts');
  const r = await findLessonVideos(
    { technique: null, topic: '복싱 잽', terms: ['잽', 'jab'], martialArt: 'boxing', queries: ['boxing jab technique'] },
    { search: async () => ({ ok: false, code: 'NETWORK', message: 'QA: 유튜브 검색 차단' }) },
  );
  return { status: r.status, yt: r.videos.length, other: (r.otherVideos ?? []).map((v) => ({ p: v.platform, url: v.url, embed: !!v.embedUrl, reason: v.reason })) };
});
check('[V4] (실검색) 유튜브 검색 실패 → 다른 플랫폼 영상을 찾아 보여 줌 (수업 단어 근거 포함)', live.status === 'found' && live.yt === 0 && live.other.length >= 1 && live.other.every((o) => /언급/.test(o.reason)), live);

// live: AI 튜터 page — YouTube search cut off in the main process → other platforms in the lesson
await app.evaluate(({ ipcMain }) => {
  ipcMain.removeHandler('youtube:search');
  ipcMain.handle('youtube:search', async () => ({ ok: false, code: 'NETWORK', message: 'QA: 유튜브 검색 차단' }));
});
await page.evaluate(() => (location.hash = '#/'));
await sleep(300);
// a Day whose technique has NO registered video (boxing Day 13 · Rear Hand Parry)
await page.evaluate(() => (location.hash = '#/learning/boxing/official__boxing/coach/13?mode=text&place=home'));
let step = '';
for (let i = 0; i < 120; i++) {
  const own = await page.$('text=Gemini AI 코치');
  const go = await page.$('button:has-text("이 코치로 수업 시작")');
  if (own && go) {
    await own.click();
    await go.click();
  }
  step = await page.evaluate(() => document.querySelector('[data-testid="coach-step"]')?.dataset.step ?? '');
  if (step === 'videos') break;
  // move the lesson forward to its video step
  const ready = await page.$('[data-testid="coach-text-input"]');
  if (ready && step === 'lesson' && i % 10 === 5) {
    await page.locator('[data-testid="coach-text-input"]').fill('준비됐어');
    await page.keyboard.press('Enter');
  }
  await sleep(1000);
}
check('[V5] AI 튜터 수업이 영상 단계에 도달', step === 'videos', step);
if (step === 'videos') {
  const done = await until(async () => (await page.locator('[data-testid="coach-videos"]').getAttribute('data-video-status')) === 'done', 180000, 1000);
  const shown = await page.evaluate(() => ({
    other: !!document.querySelector('[data-testid="coach-other-videos"]'),
    chips: [...document.querySelectorAll('[data-testid="coach-other-videos-chip"]')].map((b) => b.dataset.platform),
    embed: document.querySelector('[data-testid="coach-other-videos-player"]')?.dataset.embed,
    src: document.querySelector('[data-testid="coach-other-videos-player"] iframe')?.getAttribute('src') ?? null,
    none: document.querySelector('[data-testid="coach-video-none"]')?.textContent ?? null,
  }));
  check('[V6] AI 튜터: 유튜브 검색 실패 시 다른 플랫폼 영상 표시', done && shown.other && shown.chips.length >= 1, shown);
  if (shown.src) {
    await sleep(4000);
    const cspBlocked = errors.some((e) => /frame-src|Content Security Policy/i.test(e));
    check('[V7] 앱 안 재생 iframe이 보안 정책(CSP)에 막히지 않음', !cspBlocked, shown.src);
  }
}

check('[Z] 페이지 에러 없음', errors.filter((e) => !/Content Security Policy/.test(e)).length === 0, errors.join(' | '));
await app.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
