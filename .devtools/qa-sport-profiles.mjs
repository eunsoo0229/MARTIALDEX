// Unit-level QA for the sport-specific sparring analysis overhaul (spec
// section 15). This exercises the actual pipeline functions
// (applySportProfile / computeOverallScores / computeWeakAreas) directly
// against synthetic MotionEvent arrays, rather than requiring a real
// labeled sparring video for all 10 sports — the video→pose→motion-event
// step (motionEventDetector.ts) is unchanged geometry math (plus the new,
// separately-verifiable kick_like signal) and isn't what this task's bug
// was about; the bug was that a sport's PROFILE never filtered/weighted
// those events. That's exactly what's tested here, on real code paths
// (not reimplemented test doubles).
import esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const OUT = '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad/qa-sport-bundle.cjs';

const stubStyleCurriculumPlugin = {
  name: 'stub-style-curriculum-service',
  setup(build) {
    build.onResolve({ filter: /fighterStyle\/styleCurriculumService$/ }, () => ({
      path: path.join(APP_DIR, '.devtools/_stub-style-curriculum-service.ts'),
    }));
  },
};

await esbuild.build({
  entryPoints: [path.join(APP_DIR, '.devtools/_sport-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: OUT,
  logLevel: 'silent',
  plugins: [stubStyleCurriculumPlugin],
});

const mod = await import(OUT);
const { SPORT_ANALYSIS_PROFILES, applySportProfile, computeOverallScores, computeWeakAreas, MOTION_EVENT_LABEL } = mod;

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}

function ev(category, t, confidence = 'medium') {
  return { timestampSec: t, category, label: MOTION_EVENT_LABEL[category], confidence };
}

// A synthetic "everything happened" clip: some strikes, some kicks, some
// level-changes (takedown-shaped hip drops), some clinch, footwork, exits,
// guard holds. Every sport gets the SAME raw input — only the profile
// should determine what survives and how it's scored.
function syntheticEvents() {
  const out = [];
  for (let i = 0; i < 6; i++) out.push(ev('strike_like', i * 2));
  for (let i = 0; i < 6; i++) out.push(ev('kick_like', i * 2 + 1));
  for (let i = 0; i < 4; i++) out.push(ev('level_change_like', i * 3));
  for (let i = 0; i < 4; i++) out.push(ev('clinch_like', i * 3 + 1));
  for (let i = 0; i < 10; i++) out.push(ev('footwork_movement', i));
  for (let i = 0; i < 3; i++) out.push(ev('distance_exit_like', i * 4));
  for (let i = 0; i < 3; i++) out.push(ev('guard_hold_like', i * 5));
  return out;
}

const DURATION = 30;
const USABLE = 20;

for (const sportId of Object.keys(SPORT_ANALYSIS_PROFILES)) {
  const profile = SPORT_ANALYSIS_PROFILES[sportId];
  const raw = syntheticEvents();
  const { events, excludedCounts } = applySportProfile(raw, profile);
  const categoriesPresent = new Set(events.map((e) => e.category));

  for (const [cat, relevance] of Object.entries(profile.categories)) {
    if (relevance === 'unlikely') {
      check(`[${sportId}] '${cat}' (unlikely) is excluded from results`, !categoriesPresent.has(cat));
      check(`[${sportId}] excluded '${cat}' is reported honestly, not silently dropped`, (excludedCounts[cat] ?? 0) > 0);
    } else {
      check(`[${sportId}] '${cat}' (${relevance}) is kept in results`, categoriesPresent.has(cat));
    }
  }

  const scores = computeOverallScores([], events, USABLE, DURATION, profile);
  check(`[${sportId}] technique score is never fabricated (always null)`, scores.technique === null);
  if (profile.domain !== 'grappling') {
    // striking/hybrid sports must show a positive offense score once strikes/kicks happened
    check(`[${sportId}] offense score is computed from real events`, scores.offense !== null && scores.offense > 0, `offense=${scores.offense}`);
  }

  const weakAreas = computeWeakAreas(scores, [], profile);
  const usesGenericEnglishLabel = weakAreas.some((w) => ['Distance Management', 'Guard Recovery', 'Footwork', 'Attack Combination'].includes(w.label));
  check(`[${sportId}] weak-area labels are sport-flavored, not the old fixed English labels`, !usesGenericEnglishLabel, JSON.stringify(weakAreas.map((w) => w.label)));
}

// ===== Section-15-literal checks =====
const boxing = SPORT_ANALYSIS_PROFILES.boxing;
const boxingScoped = applySportProfile(syntheticEvents(), boxing);
check(
  'Boxing: takedown-shaped motion (level_change_like) is NEVER a primary result',
  boxing.categories.level_change_like === 'unlikely' && !boxingScoped.events.some((e) => e.category === 'level_change_like')
);

const wrestling = SPORT_ANALYSIS_PROFILES.wrestling;
const wrestlingScoped = applySportProfile(syntheticEvents(), wrestling);
check(
  'Wrestling: punch-shaped motion (strike_like) is NEVER a primary result',
  wrestling.categories.strike_like === 'unlikely' && !wrestlingScoped.events.some((e) => e.category === 'strike_like')
);
check(
  'Wrestling: kicks are also never surfaced (not part of wrestling vocabulary)',
  wrestling.categories.kick_like === 'unlikely' && !wrestlingScoped.events.some((e) => e.category === 'kick_like')
);

const muayThai = SPORT_ANALYSIS_PROFILES['muay-thai'];
check(
  'Muay Thai: punch + kick + clinch are all primary analysis targets',
  muayThai.categories.strike_like === 'primary' && muayThai.categories.kick_like === 'primary' && muayThai.categories.clinch_like === 'primary'
);

const mma = SPORT_ANALYSIS_PROFILES.mma;
check(
  'MMA: both striking (strike/kick) AND grappling (level_change/clinch) apply',
  mma.categories.strike_like !== 'unlikely' &&
    mma.categories.kick_like !== 'unlikely' &&
    mma.categories.level_change_like !== 'unlikely' &&
    mma.categories.clinch_like !== 'unlikely'
);

// Cross-sport label leakage check: no sport's scoreLabels should contain another
// domain's signature vocabulary that isn't appropriate for it.
const WRONG_VOCAB_FOR_STRIKING = ['테이크다운', '그립', '서브미션', '포지션'];
const WRONG_VOCAB_FOR_GRAPPLING = ['타격', '펀치', '발차기', '킥'];
for (const sportId of Object.keys(SPORT_ANALYSIS_PROFILES)) {
  const profile = SPORT_ANALYSIS_PROFILES[sportId];
  if (profile.domain === 'hybrid') continue; // MMA legitimately mixes vocab
  const labelText = Object.values(profile.scoreLabels).join(' ');
  const wrongVocab = profile.domain === 'striking' ? WRONG_VOCAB_FOR_STRIKING : WRONG_VOCAB_FOR_GRAPPLING;
  const leaked = wrongVocab.filter((w) => labelText.includes(w));
  check(`[${sportId}] result screen never shows the other domain's vocabulary`, leaked.length === 0, JSON.stringify(leaked));
}

const failed = results.filter((r) => !r.pass);
console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
if (failed.length) {
  console.log('FAILURES:');
  for (const f of failed) console.log(' -', f.name, '::', f.detail);
}
fs.writeFileSync(
  '/private/tmp/claude-501/-Users-swcho-Documents-MARTIALDEX/23498790-3cc2-4d25-a6bb-bdcf6a4acfef/scratchpad/qa-sport-profiles-results.json',
  JSON.stringify(results, null, 2)
);
process.exit(failed.length > 0 ? 1 : 0);
