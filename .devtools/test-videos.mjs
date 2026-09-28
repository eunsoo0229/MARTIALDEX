import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const SHOT_DIR = '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/91b22777-cd8e-44fb-a23d-f5efab2e512e/scratchpad/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

async function main() {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 1000));

  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  await page.evaluate(() => { location.hash = '#/arts/bjj/techniques/bjj__armbar'; });
  await new Promise((r) => setTimeout(r, 1200));

  const info = await page.evaluate(() => {
    const iframes = [...document.querySelectorAll('.video-embed__frame-wrap iframe')];
    return iframes.map((f) => ({
      src: f.getAttribute('src'),
      title: f.closest('.video-embed')?.querySelector('.video-embed__title')?.textContent,
      channel: f.closest('.video-embed')?.querySelector('.video-embed__channel')?.textContent,
    }));
  });
  console.log('rendered iframes:', JSON.stringify(info, null, 2));
  await page.screenshot({ path: path.join(SHOT_DIR, 'video-iframe-armbar.png'), fullPage: true });

  console.log('\n=== technique with NO curated videos (fallback) ===');
  await page.evaluate(() => { location.hash = '#/arts/judo/techniques/judo__juji-gatame'; });
  await new Promise((r) => setTimeout(r, 700));
  const fallback = await page.evaluate(() => ({
    hasIframe: !!document.querySelector('.video-embed__frame-wrap iframe'),
    statusText: document.querySelector('.video-status-message')?.textContent,
    buttonText: document.querySelector('.info-card button')?.textContent,
  }));
  console.log(fallback);

  console.log('\n=== console errors ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors));

  await app.close();
}
main().catch((e) => { console.error('FAILED', e); process.exit(1); });
