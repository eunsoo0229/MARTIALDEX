// QA: 촬영(저장)한 스파링 영상 → "AI 분석" → 같은 분석 파이프라인 (Electron).
// Saves a real recording via the app's own saveRecording (main-process file),
// opens it from 스파링 영상 목록, and confirms the analysis gets a same-origin
// video (person detection + colour sampling work) via the path-safe video:read IPC.
// Also checks video:read refuses paths outside the app's sparring-videos folder.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = '/Users/swcho/Documents/MARTIALDEX';
const results = [];
const check = (n, p, d = '') => {
  results.push(p);
  console.log(`${p ? 'PASS' : 'FAIL'} — ${n}${d ? ' :: ' + String(d).slice(0, 300) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: path.join(APP, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [APP, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-rec-'))}`], env, timeout: 30000 });
const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
await page.waitForLoadState('load');
await sleep(800);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.evaluate(() => {
  const i = document.createElement('input');
  i.type = 'file';
  i.id = 'rec-src';
  document.body.appendChild(i);
});
await page.setInputFiles('#rec-src', path.join(APP, 'NOTORIOUS.mp4'));
const saved = await page.evaluate(async () => {
  const f = document.getElementById('rec-src').files[0];
  const { saveRecording } = await import('/src/lib/sparringVideo/service.ts');
  const r = await saveRecording({ blob: f, facing: 'environment', cameraMode: 'single', durationSeconds: 147 });
  return r.ok ? { id: r.video.id, uri: r.video.localUri } : { error: r.message };
});
check('[R1] 녹화 영상 저장 (앱 폴더)', !!saved.id, JSON.stringify(saved));

const guard = await page.evaluate(async (uri) => {
  const bad1 = await window.martialdex.readVideo(uri.replace(/sparring-videos.*/, 'sparring-videos/../Preferences'));
  const bad2 = await window.martialdex.readVideo('/etc/hosts');
  const bad3 = await window.martialdex.readVideo(uri.replace('sparring-videos', 'sparring-videos-x'));
  const good = await window.martialdex.readVideo(uri);
  return { bad: [bad1.ok, bad2.ok, bad3.ok], good: good.ok ? good.data.byteLength : good.message };
}, saved.uri);
check('[R2] video:read는 앱 영상 폴더 밖 경로 거부 (.., 절대경로, 비슷한 폴더명)', guard.bad.every((x) => x === false), JSON.stringify(guard));
check('[R3] video:read로 저장된 녹화 파일을 읽음', typeof guard.good === 'number' && guard.good > 1_000_000, JSON.stringify(guard.good));

await page.evaluate(() => (location.hash = '#/sparring/videos'));
await sleep(800);
await page.locator('[data-testid="sparring-video-analyze"]').first().click();
await page.waitForSelector('[data-testid="sport-next"]', { timeout: 30000 });
check('[R4] 영상 목록 "AI 분석" → 분석 화면(종목 선택)으로 녹화 영상 전달', true);
await page.locator('button.choice-card:has-text("MMA")').click();
await page.locator('[data-testid="sport-next"]').click();
await page.waitForSelector('button:has-text("분석할 사람 지정")', { timeout: 30000 });
const name = await page.evaluate(() => document.body.innerText.match(/녹화-[^\n]+/)?.[0] ?? null);
check('[R5] 업로드와 같은 미리보기 단계로 진입 (녹화 파일 이름)', !!name, String(name));
await page.locator('button:has-text("분석할 사람 지정")').click();
await page.waitForSelector('[data-testid="attire-card"]', { timeout: 60000 });
const measured = await page.locator('[data-testid="attire-measured"] li').allTextContents();
check('[R6] 녹화 영상에서 사람 감지 + 복장 색 측정 성공 (같은 출처 영상)', measured.length > 0 && measured.some((t) => !t.includes('상의 확인 불가')), JSON.stringify(measured));
check('[Z] 페이지 에러 없음', errors.length === 0, errors.join(' | '));
await app.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
