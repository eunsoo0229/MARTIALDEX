// READ-ONLY inventory for curating 사용자 콤보: signs in to the operator account
// (so the shared technique library syncs), then writes
//   - every technique of the requested arts (id, names, category, motion archetype)
//   - every combo/setup the operator already shared (name, source_ref, technique ids)
// to data/curated-combos/inventory.json. Publishes nothing.
//
//   ADMIN_ID=MARTIALDEX ADMIN_PASSWORD=... node .devtools/dump-combo-inventory.mjs
// The password is read from the environment only — never written anywhere.
// Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const ARTS = ['boxing', 'kickboxing', 'muay-thai', 'mixed-martial-arts', 'wrestling'];
const id = process.env.ADMIN_ID;
const password = process.env.ADMIN_PASSWORD;
if (!id || !password) {
  console.error('ADMIN_ID and ADMIN_PASSWORD are required');
  process.exit(2);
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ADMIN_PASSWORD;
const app = await electron.launch({ executablePath: path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [APP_DIR, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-inv-'))}`], env, timeout: 120000 });
const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
await page.waitForLoadState('load');
await new Promise((r) => setTimeout(r, 1500));

const result = await page.evaluate(
  async ({ id, password, ARTS }) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const auth = await import('/src/lib/auth/authService.ts');
    const signIn = await supabase.auth.signInWithPassword({ email: auth.loginEmailFor(id), password });
    if (signIn.error) return { error: `signIn: ${signIn.error.message}` };
    const user = signIn.data.user;
    await (await import('/src/lib/cloudSync/addTeqSync.ts')).syncAddTeqFromCloud();
    const { allTechniques, categoryInArt } = await import('/src/lib/loadData.ts');
    const { libraryTechniques, techniqueArts } = await import('/src/lib/techniqueCanonical/index.ts');
    const { motionForTechnique } = await import('/src/lib/visualMitt/archetypes.ts');
    const pool = [...allTechniques, ...libraryTechniques().addTeq];
    const techniques = pool
      .filter((t) => techniqueArts(t).some((a) => ARTS.includes(a)))
      .map((t) => {
        const m = motionForTechnique(t);
        return {
          id: t.id, name: t.name, koreanName: t.koreanName, aliases: t.aliases, martialArt: t.martialArt,
          arts: techniqueArts(t).filter((a) => ARTS.includes(a)), category: categoryInArt(t, t.martialArt),
          source: t.source ? 'library' : 'official', archetype: m?.archetype.key ?? null, target: m?.target ?? null,
          description: (t.description ?? '').slice(0, 160),
        };
      });
    const svc = await import('/src/lib/sharedCombo/service.ts');
    const listed = await svc.listSharedCombos(user.id);
    const shared = listed.ok ? listed.data.map((c) => ({ id: c.id, author: c.authorNickname, mine: c.authorId === user.id, kind: c.kind, name: c.name, art: c.martialArt, sourceRef: c.sourceRef, techniqueIds: c.techniqueIds })) : { error: listed.message };
    await supabase.auth.signOut();
    return { userId: user.id, techniques, shared };
  },
  { id, password, ARTS },
);
fs.mkdirSync(path.join(APP_DIR, 'data/curated-combos'), { recursive: true });
fs.writeFileSync(path.join(APP_DIR, 'data/curated-combos/inventory.json'), JSON.stringify({ ...result, dumpedAt: new Date().toISOString() }, null, 1) + '\n');
console.log(JSON.stringify({ error: result.error, techniques: result.techniques?.length, shared: Array.isArray(result.shared) ? result.shared.length : result.shared }, null, 1));
await app.close();
