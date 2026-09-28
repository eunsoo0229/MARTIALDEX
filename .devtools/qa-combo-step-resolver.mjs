import { _electron as electron } from 'playwright-core';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-validator-'));
const cleanEnv = { ...process.env }; delete cleanEnv.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
await page.waitForLoadState('load');
await new Promise(r => setTimeout(r, 800));
const result = await page.evaluate(async () => {
  // Simulate the exact resolution logic without a real Gemini call by
  // constructing a valid ComboGoalAnalysis by hand and feeding it directly
  // into resolveComboStep — this proves the deterministic half of the
  // pipeline (mastery-aware step resolution + discovery fallback wiring)
  // independent of the live analyzeComboGoal call, which is currently
  // blocked by Gemini free-tier quota.
  const { resolveComboStep } = await import('/src/lib/aiCombo/stepResolver.ts');
  const usedIds = new Set();
  const steps = [
    { phrase: 'Jab', purpose: '상대의 시선을 앞으로 유도' },
    { phrase: 'Cross', purpose: '상대를 뒤로 밀어냄' },
    { phrase: 'Level Change', purpose: '타격 대응 유도' },
    { phrase: 'Double Leg', purpose: '최종 테이크다운' },
  ];
  const results = [];
  for (const s of steps) results.push(await resolveComboStep(s, 'mixed-martial-arts', undefined, usedIds, null));
  return results.map(r => ({ phrase: r.step.phrase, techniqueId: r.techniqueId, techniqueName: r.techniqueName, discovered: r.discovered }));
});
console.log(JSON.stringify(result, null, 2));
const allResolved = result.every(r => r.techniqueId);
const allUnique = new Set(result.map(r => r.techniqueId)).size === result.length;
console.log(allResolved && allUnique ? 'PASS — all 4 steps resolved to distinct real technique ids without any AI call needed' : 'FAIL');
await app.close();
process.exit(allResolved && allUnique ? 0 : 1);
