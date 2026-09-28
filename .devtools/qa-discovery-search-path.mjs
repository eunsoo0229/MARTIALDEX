import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const results = [];
function check(name, pass, detail = '') { results.push({ name, pass, detail }); console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : '')); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-discovery-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(800);

  // Exact-name / exact-koreanName resolution never calls Gemini at all (cheapest path in discoverTechnique).
  const result = await page.evaluate(async () => {
    const { discoverTechnique } = await import('/src/lib/techniqueDiscovery/service.ts');
    const a = await discoverTechnique({ name: 'Rear Naked Choke', martialArt: 'bjj', userId: null });
    const b = await discoverTechnique({ name: 'rear naked choke', martialArt: 'bjj', userId: null }); // case-insensitive
    return { a, b };
  });
  check('[7] "Rear Naked Choke" 정확히 일치 -> 기존 기술로 resolve, AI 호출 없음', result.a.status === 'existing' && result.a.techniqueId === 'bjj__rear-naked-choke', JSON.stringify(result.a));
  check('[5] 대소문자 다른 표기도 동일 기술로 resolve', result.b.status === 'existing' && result.b.techniqueId === 'bjj__rear-naked-choke', JSON.stringify(result.b));

  await app.close();
  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  process.exit(failed.length > 0 ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
