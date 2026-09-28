import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-score-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await new Promise((r) => setTimeout(r, 800));

  const result = await page.evaluate(async () => {
    const { matchGoalToTechniques } = await import('/src/lib/aiCurriculum/techniqueMatcher.ts');
    const analysis = {
      martialArt: 'wrestling', estimatedLevel: 'intermediate',
      weaknesses: [], desiredStyle: [], desiredTechniques: ['double leg'], goals: [],
      priority: ['double leg'], referencedFighterName: null, clarifyingQuestion: null,
      summary: '', suggestedDurationDays: 30, durationReason: '',
    };
    const id = 'wrestling__basic-double-leg';
    const base = matchGoalToTechniques(analysis, 'wrestling').find((m) => m.techniqueId === id);
    const proficientMap = new Map([[id, 'proficient']]);
    const needsMap = new Map([[id, 'needs_improvement']]);
    const withProficient = matchGoalToTechniques(analysis, 'wrestling', proficientMap).find((m) => m.techniqueId === id);
    const withNeeds = matchGoalToTechniques(analysis, 'wrestling', needsMap).find((m) => m.techniqueId === id);
    return { base: base?.relevanceScore, proficient: withProficient?.relevanceScore, needs: withNeeds?.relevanceScore };
  });
  console.log(JSON.stringify(result));
  await app.close();
  const ok = result.proficient < result.base && result.needs >= result.base;
  console.log(ok ? 'PASS — mastery reweighting changes relevanceScore in the expected direction' : 'FAIL');
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
