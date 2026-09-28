import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// This script performs EXACTLY ONE call to discoverTechnique() for ONE
// technique. No loop, no retry, no repeated invocation of any kind. Run
// this file at most once per invocation of the user's request.

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const accounts = JSON.parse(fs.readFileSync('/tmp/qa-addteq-accounts.json', 'utf8'));

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-single-verify-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));

  const login = await page.evaluate(async ({ email, password }) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { ok: !error, userId: data?.user?.id ?? null };
  }, accounts[0]);
  if (!login.ok) {
    console.log(JSON.stringify({ ok: false, stage: 'login', login }));
    await app.close();
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 1200)); // let login-triggered add_teq cache pull finish (read-only, no Gemini calls)

  // ===== THE ONE AND ONLY discoverTechnique() CALL THIS SCRIPT MAKES =====
  const outcome = await page.evaluate(async (userId) => {
    const { discoverTechnique } = await import('/src/lib/techniqueDiscovery/service.ts');
    return discoverTechnique({
      name: 'Von Flue Choke',
      martialArt: 'bjj',
      description: 'a choke applied from side control when the opponent holds onto a failed armbar attempt, using the opponent\'s own shoulder to compress their neck',
      userId,
    });
  }, login.userId);
  // ===== END — no further discoverTechnique/verifyTechnique calls below this line =====

  console.log(JSON.stringify({ ok: true, outcome }, null, 2));
  await app.close();
}

main().catch((e) => {
  console.error('DRIVER FAILED (no retry will be attempted):', e.message);
  process.exit(1);
});
