// 백업 기기명/날짜/시간 + 기술·카테고리 정규화 — real Electron app, real
// Supabase account (fresh test signup), real Gemini verification for the
// MMA + Granby Roll link. TEST 1–20 of the spec + data validation.
// Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  const d = typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (d ? ' :: ' + d.slice(0, 600) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const curatedVideos = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'data/curated/videos.json'), 'utf8'));
const USER_VIDEO = curatedVideos['boxing__jab'][0]; // a real video id, added as the user's own pick
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-norm-'));
const EMAIL = `qa-norm-${Date.now()}@martialdex-test.local`;
const PASSWORD = 'QaNorm!2026Test';

async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${PROFILE}`], env, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.waitForLoadState('load');
  await sleep(900);
  return { app, page, errors };
}
/** Quit the way a user does so localStorage reaches disk (see qa-curriculum.mjs). */
async function quit(app) {
  const exited = new Promise((r) => app.process().once('exit', r));
  await app.evaluate(({ app: a }) => { setTimeout(() => a.quit(), 0); });
  await exited;
}
async function evalRetry(page, fn, arg) {
  for (let i = 0; i < 4; i++) {
    try {
      return await page.evaluate(fn, arg);
    } catch (e) {
      if (!String(e).includes('Execution context was destroyed') || i === 3) throw e;
      await sleep(1500);
    }
  }
}

async function main() {
  let { app, page, errors } = await launch();
  const goto = async (hash) => {
    await page.evaluate(() => { window.location.hash = '#/'; });
    await sleep(300);
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    await sleep(1200);
  };

  // ================= Data validation (static canonical layer) =================
  const data = await page.evaluate(async () => {
    const ld = await import('/src/lib/loadData.ts');
    const canon = (await (await fetch('/data/curated/technique-canonical.json')).json());
    const members = canon.groups.flatMap((g) => g.members);
    const unresolvedMembers = members.filter((id) => !ld.getTechnique(id));
    const wrongTarget = canon.groups.filter((g) => g.members.some((id) => ld.getTechnique(id)?.id !== g.canonicalId)).map((g) => g.canonicalId);
    const ids = new Set(ld.allTechniques.map((t) => t.id));
    const dupIdsInAll = ld.allTechniques.length - ids.size;
    const orphanRelated = ld.allTechniques.flatMap((t) => t.relatedTechniques.filter((r) => !ld.getTechnique(r)).map((r) => `${t.id}->${r}`));
    const selfRelated = ld.allTechniques.filter((t) => t.relatedTechniques.includes(t.id)).length;
    // Every merged-away record's data survives in its canonical technique.
    const lost = [];
    for (const g of canon.groups) {
      const c = ld.getTechnique(g.canonicalId);
      const memberVideos = new Set();
      // a video moved on purpose (filed under the wrong technique, canonical.videoMoves) is not "lost"
      const moved = new Set((canon.videoMoves ?? []).filter((m) => g.members.includes(m.from)).map((m) => m.videoId));
      for (const id of g.members) for (const v of (await (await fetch('/data/curated/videos.json')).json())[id] ?? []) if (!moved.has(v.videoId)) memberVideos.add(v.videoId);
      const cv = new Set(c.videos.map((v) => v.videoId));
      if ([...memberVideos].some((v) => !cv.has(v))) lost.push(`${g.canonicalId}: video`);
      const posture = (await (await fetch('/data/curated/posture.json')).json());
      if (g.members.some((id) => posture[id]) && !c.posture) lost.push(`${g.canonicalId}: posture`);
      const diff = (await (await fetch('/data/curated/difficulty.json')).json());
      if (g.members.some((id) => diff[id]) && !c.difficulty) lost.push(`${g.canonicalId}: difficulty`);
      if (!g.members.every((id) => c.martialArts.includes(id.split('__')[0]))) lost.push(`${g.canonicalId}: art`);
    }
    const summaries = ld.martialArtSummaries.map((a) => ({ id: a.id, count: a.techniqueCount, unique: new Set(ld.getTechniquesByMartialArt(a.id).map((t) => t.id)).size }));
    // expected count from the reviewed data: official records − merged-away − split/heading records + techniques created by splits
    const expectedCanonical = 1284 - (members.length - canon.groups.length) - (canon.splits?.length ?? 0) - (canon.notTechniques?.length ?? 0) + (canon.newTechniques?.length ?? 0);
    return { expectedCanonical, canonicalCount: ld.allTechniques.length, groups: canon.groups.length, members: members.length, unresolvedMembers, wrongTarget, dupIdsInAll, orphanRelated: orphanRelated.slice(0, 5), orphanCount: orphanRelated.length, selfRelated, lost, summaries };
  });
  check('[DATA] 정규화 전 1,284 → 정규 기술 수 = 1,284 − 통합 − 분리·제목 기록 + 분리로 생긴 기술 (2026-10 관계 감사 반영)', data.canonicalCount === data.expectedCanonical, { canonical: data.canonicalCount, expected: data.expectedCanonical, groups: data.groups, merged: data.members - data.groups });
  check('[DATA] 통합된 모든 옛 technique_id가 정규 기술로 연결 (orphan 0)', data.unresolvedMembers.length === 0 && data.wrongTarget.length === 0, data);
  check('[DATA] 전체 목록에 중복 id 없음, 관련 기술 orphan reference 0, 자기 참조 0', data.dupIdsInAll === 0 && data.orphanCount === 0 && data.selfRelated === 0, { dup: data.dupIdsInAll, orphan: data.orphanRelated, self: data.selfRelated });
  check('[DATA/16·17·18] 통합 시 영상·자세·난이도·무술 관계 손실 0', data.lost.length === 0, data.lost);
  check('[DATA/I] 무술별 기술 수 = 그 무술의 정규 기술 수 (중복 계산 없음)', data.summaries.every((s) => s.count === s.unique), data.summaries);

  // ================= TEST 8–11 static part: Granby Roll =================
  const gr = await page.evaluate(async () => {
    const svc = await import('/src/lib/userTechniques/service.ts');
    const c = await import('/src/lib/techniqueCanonical/index.ts');
    const queries = ['Granby', 'Granby Roll', 'Granby roll', '그랜비 롤'];
    // Exactly one result IS Granby Roll (other techniques that merely contain the word, e.g. "Granby Roll to Reversal", are different techniques).
    const search = Object.fromEntries(queries.map((q) => {
      const r = svc.searchAllTechniques(q, 30);
      return [q, { granbyRollHits: r.filter((t) => t.name === 'Granby Roll' || t.mergedIds?.includes('wrestling__granby')).map((t) => t.id), first: r[0]?.id }];
    }));
    const t = svc.resolveTechnique('bjj__granby-roll');
    const inArt = (art) => svc.getUnifiedTechniquesByMartialArt(art).filter((x) => x.name === 'Granby Roll').map((x) => x.id);
    return { search, canonicalId: t.id, oldIdsResolve: [svc.resolveTechnique('bjj__granby-roll')?.id, svc.resolveTechnique('wrestling__granby-roll')?.id], arts: c.techniqueArts(t), aliases: t.aliases, bjj: inArt('bjj'), wrestling: inArt('wrestling'), mma: inArt('mixed-martial-arts'), catBjj: c.techniqueCategoryInArt(t, 'bjj'), catWr: c.techniqueCategoryInArt(t, 'wrestling') };
  });
  check('[TEST 8] Granby / Granby Roll / Granby roll / 그랜비 롤 검색 → 정규 Granby Roll 하나만 (첫 결과)', Object.values(gr.search).every((r) => r.granbyRollHits.length === 1 && r.granbyRollHits[0] === gr.canonicalId && r.first === gr.canonicalId), gr.search);
  check('[C-6] 레슬링 "Granby"(약칭) 레코드도 같은 Granby Roll로 통합, alias로 검색', gr.aliases.includes('Granby') && gr.aliases.includes('그랜비 롤'), gr.aliases);
  check('[C-2] BJJ·Wrestling Granby Roll 두 레코드 → 하나의 정규 기술 (옛 id 모두 연결)', gr.oldIdsResolve.every((id) => id === gr.canonicalId) && gr.arts.includes('bjj') && gr.arts.includes('wrestling'), gr);
  check('[TEST 9] BJJ 필터 → Granby Roll 표시 (BJJ 카테고리 유지)', gr.bjj.length === 1 && gr.catBjj === '터틀 (Turtle)', { bjj: gr.bjj, cat: gr.catBjj });
  check('[TEST 10] Wrestling 필터 → Granby Roll 표시', gr.wrestling.length === 1 && gr.catWr === '기본 자세와 움직임', { wr: gr.wrestling, cat: gr.catWr });

  // ================= Fresh account (backup + add_teq library) =================
  const signup = await evalRetry(page, async ({ email, password }) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { ok: !error, hasSession: !!data?.session, err: error?.message ?? null };
  }, { email: EMAIL, password: PASSWORD });
  check('[SETUP] 테스트 계정 로그인', signup.ok && signup.hasSession, signup);
  await sleep(4000);
  await evalRetry(page, async () => (await import('/src/lib/cloudSync/addTeqSync.ts')).syncAddTeqFromCloud());

  // ---- TEST 4 (first half): an account with no backup yet ----
  await goto('#/profile');
  await page.locator('[data-testid="last-backup"]').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="last-backup-none"]')?.textContent?.includes('불러오는 중'), null, { timeout: 15000 });
  const noBackup = await page.locator('[data-testid="last-backup"]').textContent();
  check('[TEST 4a] 백업이 없는 계정 → "백업 정보 없음" (오류 없음)', noBackup.includes('백업 정보 없음'), noBackup);

  // ---- Seed user data on the OLD (merged-away) ids — TEST 14–20 ----
  await page.evaluate(async ({ video }) => {
    const h = await import('/src/lib/trainingHistory/service.ts');
    h.recordTrainingSession({ curriculumId: null, dayNumber: null, techniqueIds: ['bjj__granby-roll', 'bjj__knee-cut'], completed: true, estimatedMinutes: 20, source: 'free_training' });
    const raw = JSON.parse(localStorage.getItem('martialdex:skill-status-overrides') || '{}');
    raw['bjj__granby-roll'] = 'proficient';
    localStorage.setItem('martialdex:skill-status-overrides', JSON.stringify(raw));
    localStorage.setItem('martialdex:favorites', JSON.stringify(['bjj__granby-roll', 'wrestling__granby-roll']));
    const vr = await import('/src/lib/techniqueVideo/repository.ts');
    vr.techniqueVideoPickRepository.save({ techniqueId: 'bjj__granby-roll', videos: [{ title: video.title, videoId: video.videoId, channel: video.channel }], source: 'user_selected', updatedAt: new Date().toISOString() });
    window.dispatchEvent(new CustomEvent('martialdex:skill-overrides-updated'));
  }, { video: USER_VIDEO });
  const ud = await page.evaluate(async ({ vid }) => {
    const sp = await import('/src/lib/skillProgress/computeSkillProgress.ts');
    const lt = await import('/src/lib/learnedTechniques/service.ts');
    const vs = await import('/src/lib/techniqueVideo/service.ts');
    const svc = await import('/src/lib/userTechniques/service.ts');
    const prof = await import('/src/lib/aiCoachCurriculum/profile.ts');
    const t = svc.resolveTechnique('wrestling__granby-roll');
    const p = sp.computeSkillProgress(t.id);
    const learned = lt.listLearnedTechniques().filter((e) => /granby roll|knee cut/i.test(e.technique.name)).map((e) => e.technique.id);
    const videos = vs.getTechniqueVideos(t).map((v) => v.videoId);
    const bjjProfile = prof.buildLearnerProfile('bjj').learned.map((l) => `${l.technique.id}:${l.status}`);
    const wrProfile = prof.buildLearnerProfile('wrestling').learned.map((l) => `${l.technique.id}:${l.status}`);
    return { status: p.status, practiceCount: p.practiceCount, learned, videos, hasUserVideo: videos.includes(vid), base: t.videos.length, bjjProfile, wrProfile };
  }, { vid: USER_VIDEO.videoId });
  check('[TEST 14] 옛 id(bjj__granby-roll)로 학습한 기록 → 정규 기술의 학습 상태 유지 (배운 기술 1건)', ud.practiceCount === 1 && ud.learned.filter((id) => id === 'wrestling__granby-roll').length === 1, ud);
  check('[TEST 15] 옛 id로 지정한 숙련도(숙련) 그대로 유지', ud.status === 'proficient', ud.status);
  check('[TEST 16] 옛 id에 추가한 사용자 영상 + 기본 영상 모두 유지', ud.hasUserVideo && ud.videos.length >= ud.base + 1, ud.videos);
  check('[TEST 20] AI Coach: BJJ·레슬링 어느 쪽 수업에서도 같은 기술·숙련도로 인식', ud.bjjProfile.includes('wrestling__granby-roll:proficient') && ud.wrProfile.includes('wrestling__granby-roll:proficient'), { bjj: ud.bjjProfile, wr: ud.wrProfile });
  check('[E] 무술 내 중복(Knee Cut ↔ Knee Cut Pass)도 하나로, 옛 id 학습 기록 유지', ud.learned.filter((id) => id === 'bjj__knee-cut-pass').length === 1 && !ud.learned.includes('bjj__knee-cut'), ud.learned);

  // TEST 19: every official curriculum technique reference still resolves.
  const cur = await page.evaluate(async () => {
    const off = await import('/src/lib/curriculum/officialData.ts');
    const svc = await import('/src/lib/userTechniques/service.ts');
    const list = off.listOfficialCurricula();
    let refs = 0, broken = 0, mergedRefs = 0;
    const canon = (await (await fetch('/data/curated/technique-canonical.json')).json());
    const merged = new Set(canon.groups.flatMap((g) => g.members.filter((m) => m !== g.canonicalId)));
    for (const c of list) for (const d of c.days) for (const id of [...d.techniqueIds, ...d.reviewTechniqueIds]) { refs++; if (!svc.resolveTechnique(id)) broken++; if (merged.has(id)) mergedRefs++; }
    return { curricula: list.length, refs, broken, mergedRefs };
  });
  check('[TEST 19] 공식 커리큘럼의 기술 참조 전부 정상 (통합된 옛 id 포함)', cur.curricula > 0 && cur.refs > 0 && cur.broken === 0 && cur.mergedRefs > 0, cur);

  // ---- UI: technique detail opened by an old id, in each art ----
  await goto('#/arts/bjj/techniques/bjj__granby-roll');
  const detail = await page.evaluate(() => ({
    url: location.hash,
    h1: document.querySelector('.detail-hero h1')?.textContent,
    arts: [...document.querySelectorAll('[data-testid="technique-art-chip"]')].map((a) => a.dataset.art),
    cat: document.querySelector('[data-testid="technique-category"]')?.textContent,
    fav: document.querySelector('.detail-hero .favorite-btn, button[aria-label="즐겨찾기"]')?.textContent ?? '',
    text: document.body.innerText,
  }));
  check('[UI] 옛 id 링크로 열어도 정규 Granby Roll 상세 (BJJ에서 보기, 무술 칩 BJJ·레슬링)', detail.h1 === 'Granby Roll' && detail.arts.includes('bjj') && detail.arts.includes('wrestling') && detail.cat === '터틀 (Turtle)', { h1: detail.h1, arts: detail.arts, cat: detail.cat });
  check('[UI/16] 상세에서 숙련도 "숙련" + 자세/영상 영역 정상', /숙련/.test(detail.text) && /관련 영상/.test(detail.text), detail.text.match(/.{0,20}숙련.{0,20}/)?.[0]);
  await goto('#/arts/wrestling/techniques?q=Granby');
  const wrRows = await page.evaluate(() => [...document.querySelectorAll('[data-testid="technique-row"]')].filter((r) => /^Granby Roll(?! to)/.test(r.textContent)).map((r) => `${r.dataset.techniqueId}|${r.textContent}|${r.closest('[class]')?.parentElement?.className ?? ''}`));
  check('[TEST 10/F] 레슬링 기술 목록에 Granby Roll 1번만 (주짓수 · 레슬링 표시)', wrRows.length === 1 && wrRows[0].includes('주짓수') && wrRows[0].includes('레슬링'), wrRows);
  await goto('#/techniques?q=Granby');
  const allRows = await page.evaluate(() => [...document.querySelectorAll('[data-testid="technique-row"]')].filter((r) => /^Granby Roll(?! to)/.test(r.textContent)).length);
  check('[F] 전체 기술 화면에서 Granby Roll 중복 표시 없음', allRows === 1, allRows);

  // ================= Category (TEST 5–7) =================
  const cats = await page.evaluate(async () => {
    const svc = await import('/src/lib/userTechniques/service.ts');
    const c = await import('/src/lib/techniqueCanonical/index.ts');
    const cat = await import('/src/lib/techniqueCanonical/category.ts');
    const out = {};
    for (const art of ['wrestling', 'bjj', 'mixed-martial-arts', 'boxing', 'judo', 'muay-thai']) {
      const ts = svc.getUnifiedTechniquesByMartialArt(art);
      const counts = {};
      for (const t of ts) counts[c.techniqueCategoryInArt(t, art)] = (counts[c.techniqueCategoryInArt(t, art)] ?? 0) + 1;
      const official = new Set(cat.officialCategoriesOf(art));
      const keys = Object.keys(counts).map(cat.normalizeCategoryKey);
      out[art] = { categories: Object.keys(counts), nonCanonical: Object.keys(counts).filter((k) => !official.has(k)), dupKeys: keys.length - new Set(keys).size, total: ts.length, uniqueIds: new Set(ts.map((t) => t.id)).size, sum: Object.values(counts).reduce((a, b) => a + b, 0) };
    }
    return out;
  });
  check('[TEST 5] 카테고리 목록: 공식(정규) 카테고리만, 의미가 같은 카테고리 중복 없음', Object.values(cats).every((v) => v.nonCanonical.length === 0 && v.dupKeys === 0), Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, v.nonCanonical])));
  check('[TEST 7] 카테고리 숫자 합 = 그 무술의 정규 기술 수 (중복 계산 없음)', Object.values(cats).every((v) => v.sum === v.total && v.total === v.uniqueIds), Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, `${v.sum}/${v.total}/${v.uniqueIds}`])));
  await goto('#/arts/wrestling');
  const wrCats = await page.evaluate(() => [...document.querySelectorAll('a[href*="/techniques?category="]')].map((a) => a.textContent.trim()));
  const bad = wrCats.filter((t) => /^(takedown|escape|grip|pinning|conditioning|defensive|escapes)/i.test(t));
  check('[TEST 5 UI] 레슬링 카테고리 화면에 takedown/escape/Escapes·Reversals/conditioning… 사라짐', wrCats.length > 0 && bad.length === 0, wrCats);
  await goto(`#/arts/wrestling/techniques?category=${encodeURIComponent('탈출 (Escape)')}`);
  const escRows = await page.evaluate(() => [...document.querySelectorAll('[data-testid="technique-row"]')].map((r) => r.textContent));
  check('[TEST 6] 카테고리 필터(탈출): AI가 "escape"로 만든 기술(Short Sit-Out 등)도 정규 카테고리로 표시', escRows.some((t) => /Short Sit-Out/i.test(t)) && escRows.every((t) => t.includes('탈출 (Escape)')), escRows.slice(0, 6));

  // add_teq duplicates of official techniques (MMA Guillotine etc.)
  const dupLib = await page.evaluate(async () => {
    const svc = await import('/src/lib/userTechniques/service.ts');
    const g = svc.resolveTechnique('mixed-martial-arts__guillotine-choke');
    const mmaGuillotine = svc.getUnifiedTechniquesByMartialArt('mixed-martial-arts').filter((t) => /guillotine choke$/i.test(t.name) || t.id === 'bjj__guillotine').map((t) => t.id);
    const all = svc.getUnifiedAllTechniques().filter((t) => t.id === 'mixed-martial-arts__guillotine-choke').length;
    return { resolvesTo: g?.id, mmaGuillotine, separateCopyListed: all };
  });
  check('[C-4] 공유 라이브러리의 중복 등록(MMA Guillotine Choke) → 정규 Guillotine에 MMA 연결, 별도 기술로 안 보임', dupLib.resolvesTo === 'bjj__guillotine' && dupLib.mmaGuillotine.includes('bjj__guillotine') && dupLib.separateCopyListed === 0, dupLib);

  // ================= TEST 11–13: MMA + Granby Roll request =================
  const mmaBefore = await page.evaluate(async () => (await import('/src/lib/userTechniques/service.ts')).getUnifiedTechniquesByMartialArt('mixed-martial-arts').some((t) => t.name === 'Granby Roll'));
  await goto('#/techniques/request');
  await page.locator('.card select.select').first().selectOption('mixed-martial-arts');
  await page.locator('input[placeholder="예: Check Hook"]').fill('Granby Roll');
  await page.locator('button', { hasText: 'AI로 기술 확인' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="request-link"], [data-testid="request-duplicate"], [data-testid="request-linked"]') || /오류|실패/.test(document.body.innerText.slice(-400)), null, { timeout: 90000 });
  const stage = await page.evaluate(() => (document.querySelector('[data-testid="request-link"]') ? 'link' : document.querySelector('[data-testid="request-duplicate"]') ? 'duplicate' : 'other'));
  const linkText = stage === 'link' ? await page.locator('[data-testid="request-link"]').textContent() : await page.evaluate(() => document.body.innerText.slice(0, 600));
  if (mmaBefore) {
    check('[TEST 12] (이미 다른 실행에서 MMA 연결됨) → 중복 기술 오류 대신 "이미 MMA에 등록" 처리', stage === 'duplicate' && linkText.includes('이미'), linkText);
  } else {
    check('[TEST 12a] MMA + Granby Roll 요청 → "이미 존재" 차단이 아니라 기존 기술에 MMA 연결 제안', stage === 'link' && linkText.includes('Granby Roll') && linkText.includes('연결'), linkText);
    const linkCat = await page.locator('[data-testid="request-link-category"]').textContent();
    check('[B-5] 연결 시 MMA의 기존 정규 카테고리 사용 (새 카테고리 생성 안 함)', ['스크램블 (Scramble)', '그라운드 컨트롤 (Ground Control)', '방어 (Defense)', 'MMA 전환 동작 (Transitions)'].includes(linkCat), linkCat);
    await page.locator('[data-testid="request-link-confirm"]').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="request-linked"], [data-testid="request-link-error"]'), null, { timeout: 120000 });
    const linked = await page.evaluate(() => document.querySelector('[data-testid="request-linked"]')?.textContent ?? document.querySelector('[data-testid="request-link-error"]')?.textContent);
    check('[TEST 12b] 검증 후 기존 Granby Roll에 MMA 연결 (공유 라이브러리)', /연결했습니다/.test(linked) && /모든 사용자에게 공유/.test(linked), linked);
  }
  const after = await page.evaluate(async () => {
    const svc = await import('/src/lib/userTechniques/service.ts');
    const c = await import('/src/lib/techniqueCanonical/index.ts');
    const t = svc.resolveTechnique('wrestling__granby-roll');
    const mma = svc.getUnifiedTechniquesByMartialArt('mixed-martial-arts').filter((x) => x.name === 'Granby Roll').map((x) => x.id);
    const search = svc.searchAllTechniques('Granby Roll', 30, { martialArt: 'mixed-martial-arts' }).map((x) => x.id);
    const copies = svc.getUnifiedAllTechniques().filter((x) => x.name === 'Granby Roll' || x.id === 'wrestling__granby').length;
    return { arts: c.techniqueArts(t), mma, search, copies, cat: c.techniqueCategoryInArt(t, 'mixed-martial-arts') };
  });
  check('[TEST 11] MMA 필터 → Granby Roll 표시 (MMA용 별도 기술 없음, 전체 1개)', after.mma.length === 1 && after.mma[0] === 'wrestling__granby-roll' && after.search.includes('wrestling__granby-roll') && after.copies === 1, after);
  check('[C-2] Granby Roll → BJJ · Wrestling · MMA', ['bjj', 'wrestling', 'mixed-martial-arts'].every((a) => after.arts.includes(a)), after.arts);
  await goto('#/arts/mixed-martial-arts/techniques/wrestling__granby-roll');
  const mmaDetail = await page.evaluate(() => [...document.querySelectorAll('[data-testid="technique-art-chip"]')].map((a) => a.dataset.art));
  check('[TEST 11 UI] MMA 경로에서 Granby Roll 상세 열림 (무술: 주짓수·레슬링·MMA 포함 — 삼보는 관계 감사로 추가)', mmaDetail.includes('mixed-martial-arts') && ['bjj', 'wrestling'].every((a) => mmaDetail.includes(a)), mmaDetail);
  // TEST 13: request again → genuine duplicate.
  await goto('#/techniques/request');
  await page.locator('.card select.select').first().selectOption('mixed-martial-arts');
  await page.locator('input[placeholder="예: Check Hook"]').fill('Granby Roll');
  await page.locator('button', { hasText: 'AI로 기술 확인' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="request-link"], [data-testid="request-duplicate"]'), null, { timeout: 90000 });
  const again = await page.evaluate(() => document.querySelector('[data-testid="request-duplicate"]')?.textContent ?? 'LINK OFFERED AGAIN');
  check('[TEST 13] 이미 MMA에 연결된 Granby Roll 재요청 → 중복 요청으로 처리', again.includes('이미 MMA에 등록된 기술입니다'), again);

  // ================= TEST 1–3: backup metadata =================
  await goto('#/profile');
  await page.locator('[data-testid="last-backup"]').waitFor();
  const before = Date.now();
  await page.locator('button', { hasText: '계정에 백업하기' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="last-backup-device"]'), null, { timeout: 30000 });
  const ui = await page.evaluate(() => ({
    device: document.querySelector('[data-testid="last-backup-device"]')?.textContent,
    date: document.querySelector('[data-testid="last-backup-date"]')?.textContent,
    time: document.querySelector('[data-testid="last-backup-time"]')?.textContent,
  }));
  const cloud = await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data: u } = await supabase.auth.getUser();
    const { data } = await supabase.from('user_backups').select('data, updated_at').eq('user_id', u.user.id).maybeSingle();
    return { meta: data?.data?.['mdx:backup-meta'] ? JSON.parse(data.data['mdx:backup-meta']) : null, updatedAt: data?.updated_at };
  });
  const ts = cloud.meta ? Date.parse(cloud.meta.backupTimestamp) : NaN;
  const expectDate = new Date(ts).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const expectTime = new Date(ts).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  check('[TEST 1] 백업 → 기기명·날짜·시간·timestamp·앱 버전이 백업에 저장 (호스트명 아님)', !!cloud.meta && cloud.meta.deviceName === 'iMac' && !!cloud.meta.backupDate && !!cloud.meta.backupTime && ts >= before - 5000 && ts <= Date.now() && cloud.meta.appVersion === '0.1.0' && !cloud.meta.deviceName.includes(os.userInfo().username), cloud.meta);
  check('[TEST 2] 백업 성공 즉시 화면 갱신 (새로고침 없음, 로컬 시간 형식)', ui.device === 'iMac' && ui.date === expectDate && ui.time === expectTime && /\d{4}년 \d{1,2}월 \d{1,2}일/.test(ui.date) && /(오전|오후) \d{1,2}:\d{2}/.test(ui.time), ui);
  // Restore must not write the metadata into app data.
  const restore = await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data: u } = await supabase.auth.getUser();
    const db = await import('/src/lib/cloudSync/dataBackup.ts');
    const before = localStorage.getItem('martialdex:favorites');
    const r = await db.restoreLocalDataFromCloud(u.user.id);
    return { ok: r.ok, keyCount: r.ok ? r.data.keyCount : null, metaKeyWritten: localStorage.getItem('mdx:backup-meta') !== null, favoritesSame: localStorage.getItem('martialdex:favorites') === before };
  });
  check('[A-9] 복원: 데이터는 그대로 복원, 메타데이터는 앱 데이터로 쓰지 않음', restore.ok && restore.keyCount > 0 && !restore.metaKeyWritten && restore.favoritesSame, restore);

  // TEST 3: quit + relaunch → still shown.
  await quit(app);
  ({ app, page, errors } = await launch());
  await goto('#/profile');
  await page.waitForFunction(() => document.querySelector('[data-testid="last-backup-device"]'), null, { timeout: 20000 });
  const ui2 = await page.evaluate(() => ({ device: document.querySelector('[data-testid="last-backup-device"]')?.textContent, date: document.querySelector('[data-testid="last-backup-date"]')?.textContent, time: document.querySelector('[data-testid="last-backup-time"]')?.textContent }));
  check('[TEST 3] 앱 종료/재실행 후에도 마지막 백업 정보 유지', ui2.device === ui.device && ui2.date === ui.date && ui2.time === ui.time, ui2);

  // TEST 4b: an old-format backup (no metadata) → date from updated_at, no error.
  const legacy = await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('user_backups').upsert({ user_id: u.user.id, data: { 'martialdex:favorites': '[]' }, updated_at: '2026-09-01T10:30:00.000Z' });
    localStorage.removeItem('mdx:last-backup');
    return error?.message ?? null;
  });
  await goto('#/');
  await goto('#/profile');
  await page.waitForFunction(() => document.querySelector('[data-testid="last-backup-device"]'), null, { timeout: 20000 });
  const ui3 = await page.evaluate(() => ({ device: document.querySelector('[data-testid="last-backup-device"]')?.textContent, date: document.querySelector('[data-testid="last-backup-date"]')?.textContent, time: document.querySelector('[data-testid="last-backup-time"]')?.textContent }));
  const legacyDate = new Date('2026-09-01T10:30:00.000Z').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  check('[TEST 4b] 메타데이터 없는 기존 백업 → 오류 없이 "기기 정보 없음" + 기존 백업 날짜 사용', legacy === null && ui3.device === '기기 정보 없음' && ui3.date === legacyDate, { legacy, ui3 });
  // Restore the account's real data shape for cleanliness.
  await page.locator('button', { hasText: '계정에 백업하기' }).click().catch(() => {});
  await sleep(2500);

  check('[Z] 전체 흐름 동안 페이지 에러 없음', errors.length === 0, errors);
  await quit(app);
  const passed = results.filter((x) => x.pass).length;
  console.log(`=== SUMMARY: ${passed}/${results.length} PASSED ===`);
  if (passed !== results.length) console.log('FAILURES:', results.filter((x) => !x.pass).map((x) => x.name));
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
