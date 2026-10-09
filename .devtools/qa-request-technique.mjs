import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function launchDevice(profileDir) {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  // gemini-3.6-flash's free-tier daily quota is exhausted from earlier
  // sessions' testing; gemini-3.5-flash still has quota for plain calls
  // (Google Search grounding itself 429s on every model tested today,
  // confirmed via direct API probing — the verification module's
  // automatic no-grounding fallback is exactly what's being exercised here).
  cleanEnv.GEMINI_MODEL = 'gemini-3.1-flash-lite'; // gemini-3.6-flash AND gemini-3.5-flash daily quotas both exhausted from this session's testing
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${profileDir}`], env: cleanEnv, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await sleep(700);
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  return { app, page, consoleErrors };
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-req-tech-'));
  const device = await launchDevice(dir);
  const { page } = device;

  // ===================================================================
  // 1. 이미 존재하는 기술 입력 -> 기존 기술 안내
  // ===================================================================
  const r1 = await page.evaluate(async () => {
    const { runDuplicateStage } = await import('/src/lib/userTechniques/service.ts');
    return runDuplicateStage({ name: 'Armbar', martialArt: 'bjj' });
  });
  check('[1] Exact existing technique name -> duplicate detected', r1.ok && r1.duplicate.isDuplicate === true, JSON.stringify(r1));

  // ===================================================================
  // 2. 영어/한국어 이름이 다른 기존 기술 입력 -> 중복 감지 (alias/translation)
  // ===================================================================
  const r2 = await page.evaluate(async () => {
    const { runDuplicateStage } = await import('/src/lib/userTechniques/service.ts');
    // "Double Leg" vs the catalog's likely "Double Leg Takedown" naming -
    // exercises the nuanced alias/abbreviation matching (spec section 2),
    // not exact string equality.
    return runDuplicateStage({ name: 'Double Leg', martialArt: 'wrestling' });
  });
  check('[2] Abbreviated/alias name of an existing technique -> duplicate detected', r2.ok && r2.duplicate.isDuplicate === true, JSON.stringify(r2));

  await sleep(2000);

  // ===================================================================
  // 3. 실제 존재하는 새로운 기술 입력 -> 검증 -> 미리보기 -> 사용자 승인 -> 등록
  // ===================================================================
  // "Von Flue Choke" is a real, well-known BJJ/MMA submission (named after
  // Chris Von Flue) confirmed absent from Martialdex's current bjj dataset
  // via a direct searchTechniques probe — a genuine "real technique the app
  // doesn't have yet" case, unlike "Check Hook" which turned out to already
  // be in the catalog (boxing__check-hook) when first tried here.
  const r3 = await page.evaluate(async () => {
    const { runDuplicateStage, runVerificationStage, saveUserTechnique } = await import('/src/lib/userTechniques/service.ts');
    const dup = await runDuplicateStage({ name: 'Von Flue Choke', martialArt: 'bjj', description: '사이드 컨트롤에서 상대의 목을 눌러 조르는 초크' });
    if (!dup.ok || dup.duplicate.isDuplicate) return { stage: 'duplicate', dup };
    const verification = await runVerificationStage({ name: 'Von Flue Choke', martialArt: 'bjj', description: '사이드 컨트롤에서 상대의 목을 눌러 조르는 초크' });
    return { stage: 'verification', verification };
  });
  check('[3a] New real technique ("Von Flue Choke") is NOT flagged as a duplicate', r3.stage === 'verification', JSON.stringify(r3).slice(0, 300));
  check(
    '[3b][7][8][9] Verification accepted -> generated record has purpose/description/difficulty (real fields, no fabrication crash)',
    r3.verification?.ok === true && r3.verification.accepted === true && !!r3.verification.record?.technique?.purpose && !!r3.verification.record?.technique?.description,
    JSON.stringify(r3.verification).slice(0, 800)
  );
  check('[10] Situational usage folded into description ("사용 상황")', r3.verification?.accepted && r3.verification.record.technique.description.includes('사용 상황'), r3.verification?.record?.technique?.description?.slice(0, 200));
  check('[11] skillLevel(difficulty) uses only real project values', r3.verification?.accepted && ['beginner', 'intermediate', 'advanced', null].includes(r3.verification.record.technique.difficulty), String(r3.verification?.record?.technique?.difficulty));

  let savedId = null;
  if (r3.verification?.ok && r3.verification.accepted) {
    savedId = await page.evaluate(async (record) => {
      const { saveUserTechnique } = await import('/src/lib/userTechniques/service.ts');
      const saved = saveUserTechnique(record, null);
      return saved.id;
    }, r3.verification.record);
  }
  check('[3c] Saved technique id follows the martialArt__slug convention', typeof savedId === 'string' && savedId?.startsWith('bjj__'), String(savedId));

  // ===================================================================
  // 12. 연결 기술 -> 실제 존재하는 기술만 연결
  // ===================================================================
  const relatedValidity = await page.evaluate((id) => {
    return (async () => {
      const { getUserTechnique } = await import('/src/lib/userTechniques/service.ts');
      const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
      const rec = getUserTechnique(id);
      const relatedIds = rec?.technique.relatedTechniques ?? [];
      return { relatedIds, allResolve: relatedIds.every((rid) => !!resolveTechnique(rid)) };
    })();
  }, savedId);
  check('[12] Every relatedTechnique id (if any) resolves to a real technique', relatedValidity.allResolve, JSON.stringify(relatedValidity));

  // ===================================================================
  // 4. 존재하지 않는 기술 입력 -> 등록 거부
  // ===================================================================
  const r4 = await page.evaluate(async () => {
    const { runVerificationStage } = await import('/src/lib/userTechniques/service.ts');
    return runVerificationStage({ name: '판타지 드래곤 파이어 킥', martialArt: 'taekwondo', description: '용의 기운을 담아 불을 뿜는 발차기' });
  });
  check('[4] Fictional technique -> rejected, not accepted', r4.ok === true && r4.accepted === false, JSON.stringify(r4).slice(0, 400));

  // ===================================================================
  // 6. 기존 기술과 매우 유사한 기술 -> 중복 경고 (post-verification second check)
  // ===================================================================
  const r6 = await page.evaluate(async () => {
    const { runDuplicateStage } = await import('/src/lib/userTechniques/service.ts');
    return runDuplicateStage({ name: 'Arm Bar', martialArt: 'bjj' });
  });
  check('[6] "Arm Bar" (spacing variant of "Armbar") -> duplicate detected', r6.ok && r6.duplicate.isDuplicate === true, JSON.stringify(r6));

  // ===================================================================
  // 17. 기존 1284개 기술 -> 데이터 손상/변경 없음
  // ===================================================================
  // Since canonical-technique normalization (data/curated/technique-canonical.json)
  // the 1,284 source records are listed as 1,172 canonical techniques — every
  // one of the 1,284 original ids must still resolve (nothing lost).
  const official = await page.evaluate(async () => {
    const { allTechniques, getTechnique } = await import('/src/lib/loadData.ts');
    const files = ['bjj', 'boxing', 'judo', 'karate', 'kickboxing', 'mixed-martial-arts', 'muay-thai', 'sambo', 'taekwondo', 'wrestling'];
    let ids = 0, unresolved = 0;
    for (const f of files) {
      const j = await (await fetch(`/data/processed/${f}.json`)).json();
      for (const t of j.techniques) { ids++; if (!getTechnique(t.id)) unresolved++; }
    }
    return { canonical: allTechniques.length, ids, unresolved };
  });
  check('[17] 원본 1284개 기술 id 전부 그대로 해석 (정규 기술 1138개 — 통합·분리·최종 검수 후, 손실 0)', official.ids === 1284 && official.unresolved === 0 && official.canonical === 1138, official);

  // ===================================================================
  // 12 (search) / 7. 기술 검색 -> 새 기술 검색 가능
  // ===================================================================
  await page.evaluate(() => {
    location.hash = '#/techniques?q=Von+Flue';
  });
  await sleep(600);
  let text = await page.evaluate(() => document.body.innerText);
  check('[UI] "기술 추가 요청" entry button visible on technique list', text.includes('기술 추가 요청'), text.slice(0, 200));
  check('[12search] Newly added user technique appears in search results', text.includes('Von Flue Choke'), text.slice(0, 400));

  // ===================================================================
  // 12 (detail) -> technique detail page reuses the SAME UI for a user technique
  // ===================================================================
  await page.evaluate((id) => {
    location.hash = `#/arts/bjj/techniques/${id}`;
  }, savedId);
  await sleep(500);
  text = await page.evaluate(() => document.body.innerText);
  check('[21] User-added technique renders on the normal TechniqueDetail page (same UI)', text.includes('Von Flue Choke') && text.includes('사용자 추가 기술'), text.slice(0, 400));
  check('[23] Pose analysis correctly shows as unavailable (no fabricated analysis)', !text.includes('자세 분석 시작'), '');

  // ===================================================================
  // 13. 커리큘럼에서 새 기술 추가 가능 (TechniquePicker)
  // ===================================================================
  const curriculumResult = await page.evaluate(async (id) => {
    const { createCustomCurriculum, addDay, addTechniqueToDay, saveCustomCurriculum, ensureProgress } = await import('/src/lib/curriculum/curriculumService.ts');
    const { searchAllTechniques } = await import('/src/lib/userTechniques/service.ts');
    let c = createCustomCurriculum({ title: 'QA 사용자기술 커리큘럼', description: 'qa', martialArt: 'bjj', visibility: 'private' });
    c = addDay(c);
    // Exercise the exact TechniquePicker code path: searchAllTechniques then addTechniqueToDay.
    const found = searchAllTechniques('Von Flue Choke', 8);
    const foundUserTech = found.find((t) => t.id === id);
    c = addTechniqueToDay(c, 1, id);
    saveCustomCurriculum(c);
    ensureProgress(c);
    return { curriculumId: c.id, foundInPicker: !!foundUserTech, dayTechniqueIds: c.days[0].techniqueIds };
  }, savedId);
  check('[13a] User-added technique is findable via the curriculum TechniquePicker search', curriculumResult.foundInPicker, JSON.stringify(curriculumResult));
  check('[22] User-added technique successfully added to a curriculum Day', curriculumResult.dayTechniqueIds.includes(savedId), JSON.stringify(curriculumResult.dayTechniqueIds));

  // ===================================================================
  // 14. 훈련하기 -> Training Session에서 새 기술 사용 가능
  // ===================================================================
  await page.evaluate((id) => {
    location.hash = `#/learning/bjj/${id}/train`;
  }, curriculumResult.curriculumId);
  await sleep(400);
  await page.click('button:has-text("Day 1 훈련 시작")');
  await page.click('button:has-text("혼자 하기")'); // Day start now asks 혼자 하기 / AI 코치와 하기 first
  await sleep(700);
  text = await page.evaluate(() => document.body.innerText);
  check('[14][22] Training Session correctly loads and displays the user-added technique', text.includes('Von Flue Choke') && /SET \d \//.test(text), text.slice(0, 400));

  const sessionDetail = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:today-training-session') || 'null'));
  check('[14b] Set/rep/rest config resolved for the user-added technique (defaults applied correctly)', !!sessionDetail?.detail?.exercises?.[0]?.config, JSON.stringify(sessionDetail?.detail?.exercises?.[0]?.config));

  // ===================================================================
  // 11. YouTube 영상 -> 기존 영상 또는 실시간 검색 (new technique has no curated video -> must use live search)
  // ===================================================================
  await sleep(4000); // allow the real Electron-path YouTube live search to complete
  text = await page.evaluate(() => document.body.innerText);
  check('[11][13] YouTube fallback triggers for the new technique (no curated video exists yet)', text.includes('참고 영상') || text.includes('관련 영상'), text.slice(-400));

  check('[18] No console/page errors across the whole flow so far', device.consoleErrors.length === 0, JSON.stringify(device.consoleErrors));

  await device.app.close();
  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
