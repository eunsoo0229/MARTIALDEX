import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Gemini's free-tier quota was exhausted for this whole session (confirmed
// via repeated RATE_LIMIT responses over 10+ minutes across earlier tests),
// so a genuinely live discoverTechnique() call (which needs the
// checkDuplicate + verifyTechnique AI calls) cannot be exercised end-to-end
// right now. To still honestly test "does a NEWLY DISCOVERED technique
// connect to Combo -> 자유훈련 exactly like an official one" without
// pretending an AI call happened, this test calls saveUserTechnique()
// directly with a hand-built record shaped EXACTLY like what
// runVerificationStage() would have produced on a real accepted
// verification (same fields, same 'pending' status, same verification
// metadata shape) — i.e. it tests everything AFTER the AI call succeeds,
// which is the part this task actually asks to re-verify (technique_id
// propagation into Combo/자유훈련), while being transparent that the AI
// verification call itself is not exercised live here due to quota.

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const results = [];
function check(name, pass, detail = '') { results.push({ name, pass, detail }); console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : '')); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-discovered-'));
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  await page.waitForLoadState('load');
  await sleep(800);

  const registered = await page.evaluate(async () => {
    const { saveUserTechnique } = await import('/src/lib/userTechniques/service.ts');
    const { generateUserTechniqueId } = await import('/src/lib/userTechniques/idGenerator.ts');
    const id = generateUserTechniqueId('bjj', 'Twister');
    const now = new Date().toISOString();
    const record = {
      id,
      technique: {
        id,
        martialArt: 'bjj',
        name: 'Twister',
        koreanName: '트위스터',
        aliases: ['Twister Lock'],
        category: '레그락 (Leg Lock)',
        positions: ['레그락 (Leg Lock)'],
        description: '크로치 라이드에서 목을 함께 꺾어 척추를 비틀어 제출을 받아내는 서브미션. 10th Planet Jiu-Jitsu에서 대중화되었다.',
        purpose: '레그 엔탱글먼트에서 크로치 라이드를 잡았을 때 넥크랭크와 척추 비틀기를 결합해 제출을 받아낸다.',
        principles: ['크로치 라이드를 먼저 확보한다', '목과 몸통을 동시에 반대 방향으로 비튼다'],
        variations: [],
        counters: [],
        defenses: [],
        transitions: [],
        relatedTechniques: ['bjj__calf-slicer'],
        relatedMartialArts: [],
        difficulty: 'advanced',
        tags: ['martialArt:bjj', 'category:레그락-leg-lock'],
        youtubeSearchQuery: 'bjj Twister tutorial',
        videos: [],
        source: 'user_added',
      },
      status: 'pending',
      addedByUserId: null,
      duplicateCheck: { isDuplicate: false, matchedTechniqueId: null, matchedTechniqueName: null, reason: '' },
      verification: {
        verdict: 'confirmed',
        confidence: 82,
        martialArtConfirmed: 'bjj',
        category: '레그락 (Leg Lock)',
        evidenceNotes: ["BJJ 레그락 계열 서브미션으로 다수의 코칭 자료에서 'Twister'로 설명됨"],
        groundingSources: [{ title: 'BJJ Leg Lock Systems Reference', uri: 'https://example.com/bjj-twister' }],
        usedSearchGrounding: true,
        reason: '실제 BJJ 레그락 서브미션으로 확인됨 (시뮬레이션 — 이번 세션은 Gemini 쿼터 소진으로 실제 AI 호출 대신 동일 스키마로 직접 구성)',
      },
      createdAt: now,
      updatedAt: now,
    };
    const saved = saveUserTechnique(record, null);
    return { id: saved.id, status: saved.status, hasRelated: saved.technique.relatedTechniques.length > 0 };
  });
  check('[2] saveUserTechnique() 호출 시 technique_id가 즉시 반환됨', !!registered.id, JSON.stringify(registered));

  // 1) resolveTechnique/getTechniquesByIds — same official-or-user-aware lookup every existing feature already uses
  const resolved = await page.evaluate(async (id) => {
    const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
    const t = resolveTechnique(id);
    return t ? { id: t.id, name: t.name, source: t.source } : null;
  }, registered.id);
  check('[9] resolveTechnique()로 신규 등록 기술을 즉시 조회 가능(기존 기술과 동일 경로)', resolved?.id === registered.id && resolved?.source === 'user_added', JSON.stringify(resolved));

  // 2) technique detail page renders it exactly like any other technique
  await page.evaluate((id) => { location.hash = `#/arts/bjj/techniques/${id}`; }, registered.id);
  await sleep(500);
  let bodyText = await page.evaluate(() => document.body.innerText);
  check('[9] 기술 상세 페이지에서 신규 등록 기술이 정상 렌더링됨', bodyText.includes('Twister') && bodyText.includes('트위스터'), bodyText.slice(0, 200));
  check('[9] "사용자 추가 기술" 표시가 보임(기존 UI 그대로 재사용)', bodyText.includes('사용자 추가 기술'), '');
  check('[9] relatedTechniques로 연결된 기존 기술(Calf Slicer)도 함께 표시됨', bodyText.includes('Calf Slicer'), '');

  // 3) mastery works on it exactly like an official technique
  const masteryResult = await page.evaluate(async (id) => {
    const { setOverride } = await import('/src/lib/skillProgress/overrideStore.ts');
    setOverride(id, 'learning');
    const { computeSkillProgress } = await import('/src/lib/skillProgress/computeSkillProgress.ts');
    return computeSkillProgress(id);
  }, registered.id);
  check('[3 대비] 신규 등록 기술의 숙련도 설정도 정상 동작', masteryResult.status === 'learning' && masteryResult.userOverride === 'learning', JSON.stringify(masteryResult));

  // 4) Combo -> reuses createCombo() exactly, real technique id, resolvable
  const comboResult = await page.evaluate(async (newId) => {
    const { createCombo, validateCombo } = await import('/src/lib/combo/service.ts');
    const techniqueIds = ['bjj__calf-slicer', newId];
    const validation = validateCombo('QA 신규기술 콤보', techniqueIds);
    if (!validation.ok) return { ok: false, errors: validation.errors };
    const combo = createCombo({ name: 'QA 신규기술 콤보', description: '', techniqueIds });
    return { ok: true, id: combo.id, techniqueIds: combo.techniqueIds };
  }, registered.id);
  check('[2] 신규 등록 기술을 포함한 콤보가 validateCombo() 통과 후 정상 저장됨', comboResult.ok, JSON.stringify(comboResult));

  await page.evaluate((id) => { location.hash = `#/combos/${id}/edit`; }, comboResult.id);
  await sleep(500);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[2] 콤보 편집 화면에서 신규 등록 기술이 정상적으로 표시됨', bodyText.includes('Twister'), bodyText.slice(0, 200));

  // 5) 자유훈련 draft로 추가 — exact same flow AiComboGenerator's "자유훈련에 추가" uses
  const draftResult = await page.evaluate(async (id) => {
    const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
    const { getDefaultExerciseConfig } = await import('/src/lib/todayTraining/exerciseDefaults.ts');
    const { setDraftMartialArt, addDraftEntry, readDraft } = await import('/src/lib/freeTraining/draftStore.ts');
    const t = resolveTechnique(id);
    setDraftMartialArt('bjj');
    addDraftEntry({ techniqueId: t.id, config: getDefaultExerciseConfig(t) });
    return readDraft();
  }, registered.id);
  check('[2] 신규 등록 기술이 자유훈련 draft에 정상적으로 추가됨(기존 기술과 동일한 방식)', draftResult.entries.some((e) => e.techniqueId === registered.id), JSON.stringify(draftResult));

  // 6) 자유훈련 화면에서 실제로 보이고 시작 가능한지 확인
  await page.evaluate(() => { location.hash = '#/free-training'; });
  await sleep(500);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[2] 자유훈련 빌더 화면에 신규 등록 기술이 실제로 표시됨', bodyText.includes('Twister'), bodyText.slice(0, 300));

  const startClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '훈련 시작');
    if (btn) { btn.click(); return true; }
    return false;
  });
  await sleep(500);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('[2] 신규 등록 기술 포함 자유훈련이 실제로 시작됨(기존 기술과 완전히 동일하게 동작)', startClicked && bodyText.includes('자유훈련'), bodyText.slice(0, 200));

  check('[regression] 콘솔/페이지 에러 없음', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  await app.close();
  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(' -', f.name, '::', f.detail);
  }
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
