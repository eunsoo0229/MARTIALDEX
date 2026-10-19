// Runs .devtools/test-grappling-weaknesses.ts inside the Electron app (Vite dev server on :5173).
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const APP = '/Users/swcho/Documents/MARTIALDEX';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: path.join(APP, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [APP, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-gw-'))}`], env });
const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
await page.waitForLoadState('load');
page.on('console', (m) => console.log(m.text()));
const r = await page.evaluate(async () => {
  await import('/.devtools/test-grappling-weaknesses.ts');
  return globalThis.__testResult;
});
await app.close();
process.exit(r && r.fail === 0 ? 0 : 1);
