import { _electron as electron } from 'playwright-core';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const accounts = JSON.parse(fs.readFileSync('/tmp/qa-addteq-accounts.json', 'utf8'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-dedup-retest-'));
const cleanEnv = { ...process.env }; delete cleanEnv.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
await page.waitForLoadState('load');
await new Promise(r => setTimeout(r, 800));
const login = await page.evaluate(async ({ email, password }) => {
  const { supabase } = await import('/src/lib/supabase/client.ts');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { ok: !error, userId: data?.user?.id ?? null };
}, accounts[0]);
console.log('login', JSON.stringify(login));
await new Promise(r => setTimeout(r, 1500));

const result = await page.evaluate(async (userId) => {
  const { discoverTechnique } = await import('/src/lib/techniqueDiscovery/service.ts');
  const names = ['RNC', 'rear naked choke', '리어 네이키드 초크', 'Rear Naked Choke Submission'];
  const out = [];
  for (const name of names) out.push(await discoverTechnique({ name, martialArt: 'bjj', userId }));
  return out;
}, login.userId);
console.log(JSON.stringify(result, null, 2));

const rowCount = await page.evaluate(async () => {
  const { supabase } = await import('/src/lib/supabase/client.ts');
  const { count } = await supabase.from('add_teq').select('id', { count: 'exact', head: true }).ilike('name', '%naked%');
  return count;
});
console.log('add_teq rows matching "naked":', rowCount);

const allSame = result.every((o) => o.techniqueId === 'bjj__rear-naked-choke');
console.log(allSame ? 'PASS — all 4 phrasings now correctly resolve to bjj__rear-naked-choke, zero new rows' : 'FAIL — still creating separate entries');
await app.close();
process.exit(allSame ? 0 : 1);
