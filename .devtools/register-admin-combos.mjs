// Creates (or signs in to) the MARTIALDEX operator account and publishes every
// combination record of the technique DB to 사용자 콤보 (shared_combos) under
// that account's name. Re-runnable: each record has a stable source_ref, so a
// second run updates instead of duplicating.
//
//   ADMIN_ID=MARTIALDEX ADMIN_PASSWORD=... env -u ELECTRON_RUN_AS_NODE node .devtools/register-admin-combos.mjs
//
// The password is read from the environment only — never written anywhere.
// Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const id = process.env.ADMIN_ID;
const password = process.env.ADMIN_PASSWORD;
if (!id || !password) {
  console.error('ADMIN_ID and ADMIN_PASSWORD are required');
  process.exit(2);
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ADMIN_PASSWORD;
const app = await electron.launch({ executablePath: path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [APP_DIR, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-admin-'))}`], env, timeout: 120000 });
const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
await page.waitForLoadState('load');
await new Promise((r) => setTimeout(r, 1500));

const result = await page.evaluate(
  async ({ id, password }) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const auth = await import('/src/lib/auth/authService.ts');
    const email = auth.loginEmailFor(id);
    const nickname = id;
    let account = 'existing';
    let signIn = await supabase.auth.signInWithPassword({ email, password });
    if (signIn.error) {
      const up = await supabase.auth.signUp({ email, password, options: { data: { nickname } } });
      if (up.error) return { error: `signUp: ${up.error.message}` };
      if (!up.data.session) return { error: 'signUp needs e-mail confirmation (no session)' };
      account = 'created';
      signIn = { data: { user: up.data.user, session: up.data.session }, error: null };
    }
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return { error: 'no user after sign-in' };
    // profile nickname = MARTIALDEX (the trigger set it from metadata on creation; make sure)
    await supabase.from('profiles').update({ nickname }).eq('user_id', user.id);
    // the shared library, so its combination records are included
    await (await import('/src/lib/cloudSync/addTeqSync.ts')).syncAddTeqFromCloud();
    const { listDbCombosForSharing } = await import('/src/lib/sharedCombo/dbCombos.ts');
    const svc = await import('/src/lib/sharedCombo/service.ts');
    const { combos, skipped } = listDbCombosForSharing();
    const published = [];
    const failed = [];
    for (const c of combos) {
      const r = await svc.shareCombo({ userId: user.id, nickname, kind: 'combo', name: c.name, purpose: c.purpose, description: c.description, martialArt: c.martialArt, steps: c.steps, sourceRef: c.sourceRef });
      if (r.ok) published.push({ id: r.data.id, name: c.name, art: c.martialArt, sourceRef: c.sourceRef });
      else failed.push({ name: c.name, message: r.message });
    }
    const mine = await svc.mySharedSources(user.id);
    const listed = await svc.listSharedCombos(user.id);
    const byAdmin = listed.ok ? listed.data.filter((x) => x.authorId === user.id) : [];
    return { account, email, userId: user.id, combos: combos.length, published: published.length, failed, skipped, sharedByAdmin: byAdmin.length, nicknames: [...new Set(byAdmin.map((x) => x.authorNickname))], sources: mine.ok ? mine.data.size : null, sample: published.slice(0, 5) };
  },
  { id, password },
);
fs.writeFileSync(path.join(APP_DIR, 'data/audit/admin-combos-publish.json'), JSON.stringify({ ...result, ranAt: new Date().toISOString() }, null, 1) + '\n');
console.log(JSON.stringify({ ...result, skipped: result.skipped?.length }, null, 1));
await app.close();
