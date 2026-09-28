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

  async function goto(hash) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await new Promise((r) => setTimeout(r, 900)); // allow the async IPC call + render to settle
  }

  async function readVideoSection() {
    return page.evaluate(() => {
      const cards = [...document.querySelectorAll('.info-card')];
      const card = cards.find((c) => c.querySelector('h3')?.textContent?.includes('관련 영상'));
      if (!card) return { found: false };
      return {
        found: true,
        statusMessage: card.querySelector('.video-status-message')?.textContent ?? null,
        loadingMessage: card.querySelector('.video-loading')?.textContent ?? null,
        videoCount: card.querySelectorAll('.video-card').length,
        fallbackButtonText: card.querySelector('.video-fallback-row button, button')?.textContent ?? null,
      };
    });
  }

  const cases = [
    ['bjj', 'bjj__armbar', 'BJJ Armbar'],
    ['judo', 'judo__juji-gatame', 'Judo Juji Gatame'],
    ['muay-thai', 'muay-thai__round-kick-low-kick-계열', 'Muay Thai (round kick category id guess)'],
  ];

  // Find a real muay-thai roundhouse-kick-ish technique id dynamically instead of guessing.
  const muayThaiId = await page.evaluate(async () => {
    return null; // placeholder, filled below via direct fetch of processed json is not available in renderer; we instead browse via UI
  });

  for (const [artId, techId, label] of [
    ['bjj', 'bjj__armbar', 'BJJ Armbar'],
    ['judo', 'judo__juji-gatame', 'Judo Juji Gatame'],
  ]) {
    console.log(`\n=== ${label} (${artId}/${techId}) ===`);
    await goto(`#/arts/${artId}/techniques/${techId}`);
    const before = await readVideoSection();
    console.log('immediately after nav:', before);
    await new Promise((r) => setTimeout(r, 600));
    const after = await readVideoSection();
    console.log('after settle:', after);
    const query = await page.evaluate(() => document.querySelector('.video-fallback-row button')?.textContent ?? document.querySelector('.info-card button')?.textContent);
    console.log('fallback button label:', query);
  }

  // navigate to a muay-thai technique via clicking through the list UI (avoids guessing an id)
  console.log('\n=== Muay Thai technique via UI navigation ===');
  await goto('#/arts/muay-thai/techniques?q=Round%20Kick');
  const firstRowClicked = await page.evaluate(() => {
    const row = document.querySelector('.technique-row');
    if (!row) return null;
    const name = row.querySelector('.technique-row__name')?.textContent;
    row.click();
    return name;
  });
  console.log('clicked technique:', firstRowClicked);
  await new Promise((r) => setTimeout(r, 900));
  console.log('url:', await page.evaluate(() => location.hash));
  console.log('video section:', await readVideoSection());
  await page.screenshot({ path: path.join(SHOT_DIR, 'youtube-nokey.png'), fullPage: true });

  console.log('\n=== rapid re-visit (session cache should skip a 2nd IPC round-trip, but shouldn\'t break anything) ===');
  await goto('#/arts/bjj/techniques/bjj__armbar');
  console.log('revisit video section:', await readVideoSection());

  console.log('\n=== CONSOLE ERRORS ===');
  console.log(consoleErrors.length === 0 ? 'none' : JSON.stringify(consoleErrors, null, 2));

  await app.close();
}

main().catch((e) => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
