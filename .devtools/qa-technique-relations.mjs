// Technique relation audit — validates the whole technique DB in the real app
// after data/curated/technique-canonical.json v2 (splits, art links, merges).
//   under-linking: shared techniques really listed in every linked art
//   over-merging:  split records gone from every list, their parts distinct
//   references:    curricula / related / split parts / art links all resolve,
//                  no curated video lost, legacy ids still resolve
//   search, technique detail, AI Coach day, Visualizing Mitt, Combo
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
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (d ? ' :: ' + d.slice(0, 900) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-rel-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env, timeout: 120000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForLoadState('load');
  await sleep(1000);

  const r = await page.evaluate(async () => {
    const ld = await import('/src/lib/loadData.ts');
    const canon = (await import('/data/curated/technique-canonical.json?import')).default;
    const videos = (await import('/data/curated/videos.json?import')).default;
    const tc = await import('/src/lib/techniqueCanonical/index.ts');
    const off = await import('/src/lib/curriculum/officialData.ts');
    const norm = (s) => (s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const arts = ld.martialArtSummaries.map((a) => a.id);
    const listed = new Map(arts.map((a) => [a, ld.getTechniquesByMartialArt(a)]));
    const splitIds = new Set(canon.splits.map((s) => s.id));
    const hidden = new Set(canon.notTechniques.map((n) => n.id));
    const out = {};

    out.counts = { all: ld.allTechniques.length, splits: canon.splits.length, newTechniques: canon.newTechniques.length, artLinks: canon.artLinks.length, groups: canon.groups.length };
    // 1. no split / heading record listed anywhere, no duplicate id in a list
    out.listedSplit = [];
    out.dupIds = [];
    for (const [a, list] of listed) {
      const ids = list.map((t) => t.id);
      for (const t of list) if (splitIds.has(t.id) || hidden.has(t.id) || t.splitInto || t.notTechnique) out.listedSplit.push(`${a}:${t.id}`);
      if (new Set(ids).size !== ids.length) out.dupIds.push(a);
    }
    for (const t of ld.allTechniques) if (splitIds.has(t.id) || hidden.has(t.id)) out.listedSplit.push(`all:${t.id}`);
    // 2. every split part resolves, is distinct, and is listed in the split record's art
    out.splitProblems = [];
    for (const s of canon.splits) {
      const src = ld.getTechnique(s.id);
      if (!src?.splitInto?.length) out.splitProblems.push(`${s.id}: no splitInto`);
      const art = s.id.split('__')[0];
      for (const p of src?.splitInto ?? []) {
        const t = ld.getTechnique(p);
        if (!t) out.splitProblems.push(`${s.id}: part ${p} unresolved`);
        else if (!listed.get(art).some((x) => x.id === t.id)) out.splitProblems.push(`${s.id}: part ${p} not listed in ${art}`);
        else if (!tc.isTechniqueInArt(t, art)) out.splitProblems.push(`${s.id}: part ${p} not in art ${art}`);
      }
    }
    // 3. art links: technique has the art, is listed there, category set
    out.linkProblems = [];
    for (const l of canon.artLinks) {
      const t = ld.getTechnique(l.canonicalId);
      if (!t || !(t.martialArts ?? [t.martialArt]).includes(l.martialArt)) out.linkProblems.push(`${l.canonicalId}→${l.martialArt}: art missing`);
      else if (!listed.get(l.martialArt).some((x) => x.id === t.id)) out.linkProblems.push(`${l.canonicalId}→${l.martialArt}: not listed`);
      else if (!ld.categoryInArt(t, l.martialArt)) out.linkProblems.push(`${l.canonicalId}→${l.martialArt}: no category`);
    }
    // 4. same name twice inside one art (a duplicate canonical left behind) —
    // unless the two were reviewed as different techniques (e.g. punch Catch vs kick Catch)
    const reviewedIds = new Set([...canon.excluded.flatMap((e) => e.ids), ...canon.review.flatMap((e) => e.ids)]);
    const idsOf = (t) => t.mergedIds ?? [t.id];
    // a pair is reviewed if one entry names both, or a single-id exclusion names one of them ("wrestling__inside-control ≠ the clinch Inside Control")
    const reviewedPair = (a, b) => [...canon.excluded, ...canon.review].some((e) => (idsOf(a).some((id) => e.ids.includes(id)) && idsOf(b).some((id) => e.ids.includes(id))) || (e.ids.length === 1 && (idsOf(a).includes(e.ids[0]) || idsOf(b).includes(e.ids[0]))));
    out.sameNameInArt = [];
    for (const [a, list] of listed) {
      const seen = new Map();
      for (const t of list) {
        const k = norm(t.name);
        const prev = seen.get(k);
        if (prev && prev.id !== t.id && !reviewedPair(prev, t)) out.sameNameInArt.push(`${a}: ${t.name} (${prev.id} / ${t.id})`);
        seen.set(k, t);
      }
    }
    // same name across different canonical techniques — must all be reviewed exclusions
    const byName = new Map();
    for (const t of ld.allTechniques) {
      const k = norm(t.name);
      byName.set(k, [...(byName.get(k) ?? []), t]);
    }
    out.unreviewedSameName = [...byName.entries()].filter(([, ts]) => ts.length > 1).filter(([, ts]) => !ts.every((t) => (t.mergedIds ?? [t.id]).some((id) => reviewedIds.has(id)) || ts.filter((x) => x !== t).every((x) => (x.mergedIds ?? [x.id]).some((id) => reviewedIds.has(id))))).map(([k, ts]) => `${k}: ${ts.map((t) => t.id).join(', ')}`);
    // 5. references: official curricula, related techniques, legacy ids
    out.curriculumUnresolved = [];
    out.curriculumStillSplit = [];
    for (const c of off.listOfficialCurricula()) for (const d of c.days) for (const id of [...d.techniqueIds, ...(d.reviewTechniqueIds ?? [])]) {
      if (!ld.getTechnique(id)) out.curriculumUnresolved.push(`${c.id} D${d.day}: ${id}`);
      if (splitIds.has(id)) out.curriculumStillSplit.push(`${c.id} D${d.day}: ${id}`);
    }
    out.relatedUnresolved = [];
    for (const t of ld.allTechniques) for (const id of t.relatedTechniques) if (!ld.getTechnique(id)) out.relatedUnresolved.push(`${t.id}→${id}`);
    out.selfRelated = ld.allTechniques.filter((t) => t.relatedTechniques.includes(t.id)).map((t) => t.id);
    out.legacyUnresolved = [...splitIds, ...hidden, ...canon.groups.flatMap((g) => g.members)].filter((id) => !ld.getTechnique(id));
    // 6. no curated video lost: every video in videos.json is on some resolvable technique
    const reachable = new Set();
    const all = [...ld.allTechniques, ...[...splitIds, ...hidden].map((id) => ld.getTechnique(id)).filter(Boolean)];
    for (const t of all) for (const v of t.videos ?? []) reachable.add(v.videoId);
    out.lostVideos = Object.entries(videos).flatMap(([id, vs]) => vs.filter((v) => !reachable.has(v.videoId)).map((v) => `${id}:${v.videoId}`));
    // posture: every curated posture key still resolves to a technique
    const posture = (await import('/data/curated/posture.json?import')).default;
    out.lostPosture = Object.keys(posture).filter((id) => !id.startsWith('home') && !ld.getTechnique(id) && !id.startsWith('gym'));

    // representative cases
    const arts_ = (id) => { const t = ld.getTechnique(id); return t ? { id: t.id, name: t.name, arts: t.martialArts ?? [t.martialArt] } : null; };
    out.jab = arts_('boxing__jab');
    out.cross = arts_('boxing__cross');
    const mt = listed.get('muay-thai');
    out.mtJab = mt.some((t) => t.id === out.jab.id);
    out.teep = { lead: ld.getTechnique('muay-thai__lead-teep'), rear: ld.getTechnique('muay-thai__rear-teep') };
    out.teep = { lead: out.teep.lead && { id: out.teep.lead.id, name: out.teep.lead.name, videos: out.teep.lead.videos.length }, rear: out.teep.rear && { id: out.teep.rear.id, name: out.teep.rear.name, videos: out.teep.rear.videos.length }, mtListed: ['muay-thai__lead-teep', 'muay-thai__rear-teep'].every((id) => mt.some((t) => t.id === id)), legacy: ld.getTechnique('muay-thai__lead-teep-rear-teep')?.splitInto };
    const sambo = listed.get('sambo');
    const chokes = ['bjj__rear-naked-choke', 'bjj__guillotine', 'sambo__front-headlock-choke', 'bjj__arm-triangle', 'sambo__collar-choke'].map((id) => ld.getTechnique(id));
    out.chokes = { ids: chokes.map((t) => t?.id ?? null), names: chokes.map((t) => t?.name ?? null), distinct: new Set(chokes.map((t) => t?.id)).size === 5 && chokes.every(Boolean), inSambo: chokes.every((t) => t && sambo.some((x) => x.id === t.id)), legacy: ld.getTechnique('sambo__rear-naked-choke-guillotine-front-headlock-choke-arm-triangle-collar-choke-계열')?.splitInto };
    out.rncMerged = ['judo__hadaka-jime', 'bjj__rear-naked-choke'].map((id) => ld.getTechnique(id)?.id);
    out.catchSplit = [ld.getTechnique('boxing__catch')?.id, ld.getTechnique('kickboxing__catch')?.id, ld.getTechnique('kickboxing__킥-캐치')?.id];
    out.gripSplit = [ld.getTechnique('bjj__grip-fighting')?.id, ld.getTechnique('judo__grip-fighting')?.id];
    out.frontKick = arts_('taekwondo__앞차기');
    out.doubleLeg = arts_('judo__morote-gari');
    return out;
  });

  console.log('counts', JSON.stringify(r.counts));
  check('[1] 묶음(분리된) 기록·제목 항목이 어떤 무술 목록에도 기술로 나오지 않음, 목록 안 id 중복 없음', r.listedSplit.length === 0 && r.dupIds.length === 0, { listedSplit: r.listedSplit.slice(0, 10), dupIds: r.dupIds });
  check(`[2] 분리 ${r.counts.splits}건: 모든 파트가 존재하고 원래 무술 목록·관계에 포함`, r.splitProblems.length === 0, r.splitProblems.slice(0, 10));
  check(`[3] 무술 관계 ${r.counts.artLinks}건: 기술의 무술 목록·카테고리에 반영`, r.linkProblems.length === 0, r.linkProblems.slice(0, 10));
  check('[4] 한 무술 안에 같은 이름의 기술이 둘 이상 남지 않음 (중복 canonical 없음)', r.sameNameInArt.length === 0, r.sameNameInArt.slice(0, 12));
  check('[5] 무술 간 같은 이름 기술은 모두 검토된 예외(다른 기술)뿐', r.unreviewedSameName.length === 0, r.unreviewedSameName.slice(0, 12));
  check('[6] 공식 커리큘럼 참조: 끊긴 참조 0, 분리 전 묶음 id 0 (분리된 기술로 펼쳐짐)', r.curriculumUnresolved.length === 0 && r.curriculumStillSplit.length === 0, { unresolved: r.curriculumUnresolved.slice(0, 5), split: r.curriculumStillSplit.slice(0, 5) });
  check('[7] 관련 기술 참조: 끊긴 참조 0, 자기 참조 0', r.relatedUnresolved.length === 0 && r.selfRelated.length === 0, { unresolved: r.relatedUnresolved.slice(0, 8), self: r.selfRelated.slice(0, 8) });
  check('[8] 예전 id(분리된 기록·병합된 기록·제목 항목) 전부 계속 열림', r.legacyUnresolved.length === 0, r.legacyUnresolved.slice(0, 8));
  check('[9] 큐레이션 영상 손실 0, 자세 데이터 손실 0', r.lostVideos.length === 0 && r.lostPosture.length === 0, { lostVideos: r.lostVideos.slice(0, 8), lostPosture: r.lostPosture.slice(0, 8) });
  check('[사례1] Jab: 복싱·킥복싱·무에타이·MMA·삼보에 연결, 무에타이 목록에 단독 기술로 표시', ['boxing', 'kickboxing', 'muay-thai', 'mixed-martial-arts', 'sambo'].every((a) => r.jab.arts.includes(a)) && r.mtJab, r.jab);
  check('[사례2] Cross: 복싱·킥복싱·무에타이·MMA·삼보에 연결', ['boxing', 'kickboxing', 'muay-thai', 'mixed-martial-arts', 'sambo'].every((a) => r.cross.arts.includes(a)), r.cross);
  check('[사례3] Lead Teep ≠ Rear Teep (서로 다른 기술, 둘 다 무에타이 목록, 묶음 기록은 두 기술을 가리킴)', r.teep.lead && r.teep.rear && r.teep.lead.id !== r.teep.rear.id && r.teep.mtListed && r.teep.legacy?.length === 2, r.teep);
  check('[사례4] RNC·Guillotine·Front Headlock Choke·Arm Triangle·Collar Choke: 각각 독립 기술, 모두 삼보 목록에 표시', r.chokes.distinct && r.chokes.inSambo && r.chokes.legacy?.length === 5, r.chokes);
  check('[사례5] 같은 기술 다른 이름은 하나: 하다카지메 = RNC, 모로테가리 = 더블 레그(유도·레슬링·BJJ·MMA), 앞차기 = Front Kick(가라테·태권도·킥복싱)', r.rncMerged[0] === r.rncMerged[1] && ['judo', 'wrestling', 'bjj', 'mixed-martial-arts'].every((a) => r.doubleLeg.arts.includes(a)) && ['karate', 'taekwondo', 'kickboxing'].every((a) => r.frontKick.arts.includes(a)), { rnc: r.rncMerged, doubleLeg: r.doubleLeg, frontKick: r.frontKick });
  check('[사례6] 잘못 합쳐졌던 기술 분리: 복싱 Catch ≠ 킥복싱 Catch(=킥 캐치), BJJ ≠ 유도 Grip Fighting', r.catchSplit[0] !== r.catchSplit[1] && r.catchSplit[1] === r.catchSplit[2] && r.gripSplit[0] !== r.gripSplit[1], { catch: r.catchSplit, grip: r.gripSplit });

  // ---- search ----
  const search = await page.evaluate(async () => {
    const s = await import('/src/lib/userTechniques/service.ts');
    const q = (x, f) => s.searchAllTechniques(x, 8, f ?? {}).map((t) => t.id);
    return { jab: q('Jab'), jabMt: q('Jab', { martialArt: 'muay-thai' }), jabMma: q('Jab', { martialArt: 'mixed-martial-arts' }), leadTeep: q('Lead Teep'), rearTeep: q('Rear Teep'), rnc: q('Rear Naked Choke'), guillotine: q('Guillotine'), hadaka: q('Hadaka Jime'), compound: q('Lead Teep / Rear Teep') };
  });
  check('[검색1] "Jab" → Jab 하나, 무에타이·MMA 필터에서도 Jab', search.jab[0] === 'kickboxing__jab' && search.jabMt.includes('kickboxing__jab') && search.jabMma.includes('kickboxing__jab'), search);
  check('[검색2] "Lead Teep"과 "Rear Teep"은 각각 자기 기술이 첫 결과 (같은 기술로 취급 안 함)', search.leadTeep[0] === 'muay-thai__lead-teep' && search.rearTeep[0] === 'muay-thai__rear-teep', { lead: search.leadTeep, rear: search.rearTeep });
  check('[검색3] "Rear Naked Choke"와 "Guillotine"은 서로 다른 기술, "Hadaka Jime"은 RNC로', search.rnc[0] === 'bjj__rear-naked-choke' && search.guillotine[0] === 'bjj__guillotine' && search.rnc[0] !== search.guillotine[0] && search.hadaka[0] === 'bjj__rear-naked-choke', search);
  check('[검색4] 묶음 기록 자체는 검색 결과에 나오지 않음', !search.compound.includes('muay-thai__lead-teep-rear-teep'), search.compound);

  // ---- screens ----
  const visit = async (hash) => {
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    await sleep(1300);
    return page.evaluate(() => document.body.innerText);
  };
  const rowNames = () => page.evaluate(() => [...document.querySelectorAll('.technique-row__name')].map((e) => e.textContent.trim()));
  await visit('#/arts/muay-thai/techniques?q=Teep');
  const mtTeep = await rowNames();
  await visit('#/arts/muay-thai/techniques?q=Jab');
  const mtJab = await rowNames();
  check('[화면1] 무에타이 기술 목록: Jab·Lead Teep·Rear Teep 각각 표시, "Lead Teep / Rear Teep" 묶음 없음', mtJab.some((n) => /^Jab/.test(n)) && mtTeep.some((n) => /^Lead Teep/.test(n)) && mtTeep.some((n) => /^Rear Teep/.test(n)) && !mtTeep.some((n) => /Lead Teep \/ Rear Teep/.test(n)), { mtTeep, mtJab });
  const mma = {};
  for (const q of ['Jab', 'Rear Naked Choke', 'Double Leg']) {
    await visit(`#/arts/mixed-martial-arts/techniques?q=${encodeURIComponent(q)}`);
    mma[q] = await rowNames();
  }
  check('[화면2] MMA 기술 목록: Jab·Rear Naked Choke·Double Leg 표시', mma.Jab.some((n) => /^Jab/.test(n)) && mma['Rear Naked Choke'].some((n) => /^Rear Naked Choke/.test(n)) && mma['Double Leg'].some((n) => /Double Leg/.test(n)), mma);
  let text;
  text = await visit('#/arts/muay-thai/techniques/muay-thai__lead-teep-rear-teep');
  check('[화면3] 예전 묶음 기록 상세: 분리 안내 + Lead Teep·Rear Teep 링크', /여러 기술을 묶은 항목/.test(text) && (await page.locator('[data-testid="technique-split-into"] a').count()) === 2);
  text = await visit('#/arts/boxing/techniques/kickboxing__jab');
  check('[화면4] Jab 상세: "이 기술을 사용하는 무술"에 무에타이·MMA', /무에타이/.test((await page.locator('[data-testid="technique-arts"]').textContent()) ?? '') && /MMA|종합격투기/.test((await page.locator('[data-testid="technique-arts"]').textContent()) ?? ''), await page.locator('[data-testid="technique-arts"]').textContent());

  // ---- AI Coach / Tutor / Mitt / Combo ----
  const apps = await page.evaluate(async () => {
    const off = await import('/src/lib/curriculum/officialData.ts');
    const coach = await import('/src/lib/aiCoachDay/service.ts');
    const a = await import('/src/lib/visualMitt/archetypes.ts');
    const ld = await import('/src/lib/loadData.ts');
    const c = off.getOfficialCurriculum('muay-thai');
    const day = c.days.find((d) => d.techniqueIds.includes('muay-thai__lead-teep'));
    const coachIds = day ? coach.coachTechniquesForDay(day).map((t) => t.id) : [];
    const m = (id) => { const t = ld.getTechnique(id); const mo = t && a.motionForTechnique(t); return mo ? `${mo.archetype.key}/${mo.archetype.side}` : null; };
    const motions = { leadTeep: m('muay-thai__lead-teep'), rearTeep: m('muay-thai__rear-teep'), leadRound: m('muay-thai__lead-round-kick'), rearRound: m('muay-thai__rear-round-kick'), leadLow: m('muay-thai__lead-low-kick'), jab: m('kickboxing__jab'), frontKick: m('kickboxing__front-kick') };
    const combo = await import('/src/lib/combo/service.ts');
    const saved = combo.createCombo({ name: 'QA 관계 콤보', description: '', techniqueIds: ['muay-thai__lead-teep', 'kickboxing__jab', 'muay-thai__rear-teep'] });
    const comboOk = saved ? saved.techniqueIds.join() === 'muay-thai__lead-teep,kickboxing__jab,muay-thai__rear-teep' : null;
    return { day: day?.day, coachIds, motions, comboOk };
  });
  check('[AI 코치] 무에타이 Day가 묶음 대신 Lead Teep·Rear Teep을 각각 가르침', apps.coachIds.includes('muay-thai__lead-teep') && apps.coachIds.includes('muay-thai__rear-teep') && !apps.coachIds.includes('muay-thai__lead-teep-rear-teep'), apps);
  const mo = apps.motions;
  check('[Mitt] 분리된 기술이 각자 맞는 동작: Lead Teep(앞발)·Rear Teep(뒷발)·Lead Round Kick(앞발)·Rear Round Kick(뒷발)·Lead Low Kick(앞발)', mo.leadTeep && mo.rearTeep && mo.leadTeep !== mo.rearTeep && /lead/.test(mo.leadTeep) && /rear/.test(mo.rearTeep) && /lead/.test(mo.leadRound) && /rear/.test(mo.rearRound) && /lead/.test(mo.leadLow), mo);
  check('[콤보] 분리된 기술 id로 콤보 저장 — Lead Teep과 Rear Teep이 다른 id로 유지', apps.comboOk === true, apps);

  // ================= 2026-10 final review (4 items) =================
  const fr = await page.evaluate(async () => {
    const ld = await import('/src/lib/loadData.ts');
    const tc = await import('/src/lib/techniqueCanonical/index.ts');
    const canon = (await import('/data/curated/technique-canonical.json?import')).default;
    const s = await import('/src/lib/userTechniques/service.ts');
    const mma = ld.getTechniquesByMartialArt('mixed-martial-arts').map((t) => t.id);
    const removed = (canon.artLinksRemoved ?? []).map((l) => ({ id: l.id, inMmaArts: (ld.getTechnique(l.id)?.martialArts ?? []).includes('mixed-martial-arts'), listed: mma.includes(ld.getTechnique(l.id)?.id) }));
    const graded = canon.artLinks.filter((l) => l.martialArt === 'mixed-martial-arts' || (l.martialArt === 'bjj' && l.canonicalId === 'wrestling__basic-double-leg'));
    const ungraded = graded.filter((l) => !/^[AB]$/.test(l.grade ?? '') || !l.evidence).map((l) => `${l.canonicalId}→${l.martialArt}`);
    const reviewDecisions = canon.review.map((r) => r.decision);
    const kiz = ld.getTechnique('karate__kizami-zuki');
    const nm = (id, art) => { const t = ld.getTechnique(id); return t ? tc.techniqueNameInArt(t, art) : null; };
    const names = {
      frontKick: { canonical: ld.getTechnique('karate__mae-geri')?.name, kickboxing: nm('karate__mae-geri', 'kickboxing'), karate: nm('karate__mae-geri', 'karate'), taekwondo: nm('karate__mae-geri', 'taekwondo') },
      sideKick: { karate: nm('karate__yoko-geri', 'karate'), taekwondo: nm('karate__yoko-geri', 'taekwondo'), kickboxing: nm('karate__yoko-geri', 'kickboxing') },
      backKick: { karate: nm('karate__ushiro-geri', 'karate'), taekwondo: nm('karate__ushiro-geri', 'taekwondo') },
      roundKick: { karate: nm('karate__mawashi-geri', 'karate'), taekwondo: nm('karate__mawashi-geri', 'taekwondo'), kickboxing: nm('karate__mawashi-geri', 'kickboxing') },
      jab: { boxing: nm('boxing__jab', 'boxing'), karate: nm('boxing__jab', 'karate'), mma: nm('boxing__jab', 'mixed-martial-arts') },
      doubleLeg: { wrestling: nm('judo__morote-gari', 'wrestling'), judo: nm('judo__morote-gari', 'judo') },
    };
    const q = (x) => s.searchAllTechniques(x, 5).map((t) => t.id);
    const search = { 앞차기: q('앞차기'), 'Mae Geri': q('Mae Geri'), 'Front Kick': q('Front Kick'), 'Kizami-zuki': q('Kizami-zuki'), 돌려차기: q('돌려차기'), 'Yoko Geri': q('Yoko Geri'), 'Morote Gari': q('Morote Gari') };
    const BAD = ['양손 베기', '십자 굳히기', '맨손 조르기', '어깨 바퀴', '삼각 조르기'];
    const badCanonicalKo = ld.allTechniques.filter((t) => BAD.includes(t.koreanName) && t.name !== (t.namesByArt?.[t.martialArt]?.name ?? t.name)).map((t) => `${t.id}:${t.koreanName}`)
      .concat(['wrestling__basic-double-leg', 'bjj__armbar', 'bjj__rear-naked-choke', 'sambo__fireman-s-carry', 'bjj__triangle-choke'].map((id) => ld.getTechnique(id)).filter((t) => BAD.includes(t.koreanName)).map((t) => `${t.id}:${t.koreanName}`));
    return { removed, ungraded, gradedCount: graded.length, reviewDecisions, kiz: { id: kiz?.id, arts: kiz?.martialArts }, names, search, badCanonicalKo };
  });
  check('[검수1] 최종 검수에서 뺀 MMA 킥 4건은 전수 감사에서 B로 재판정되어 다시 연결 (MMA 킥복싱 범주 S1 + 통합 규정 S2)', fr.removed.length === 4 && fr.removed.every((x) => x.inMmaArts && x.listed), fr.removed);
  check(`[검수1] MMA·BJJ 관계 ${fr.gradedCount}건 모두 근거 등급(A/B)과 근거 기록`, fr.gradedCount >= 26 && fr.ungraded.length === 0, fr.ungraded);
  check('[검수2] REVIEW 항목 모두 최종 결정 기록 (merge/separate/review) — 최종 검수 14건 + 전수 감사 추가분', fr.reviewDecisions.length >= 14 && fr.reviewDecisions.every((d) => ['merge', 'separate', 'review'].includes(d)), fr.reviewDecisions);
  check('[검수2] Kizami-zuki = Jab 병합 (가라테 데이터 한국어명 "잽")', fr.kiz.id === 'kickboxing__jab' && fr.kiz.arts.includes('karate'), fr.kiz);
  const n = fr.names;
  check('[검수3] Front Kick: 킥복싱 "Front Kick" / 가라테 "Mae Geri"(앞차기) / 태권도 "앞차기" — 다른 이름도 함께 표시', n.frontKick.canonical === 'Front Kick' && n.frontKick.kickboxing.name === 'Front Kick' && n.frontKick.karate.name === 'Mae Geri' && n.frontKick.karate.koreanName === '앞차기' && n.frontKick.taekwondo.name === '앞차기' && n.frontKick.taekwondo.otherNames.includes('Front Kick') && n.frontKick.taekwondo.otherNames.includes('Mae Geri'), n.frontKick);
  check('[검수3] Side/Back/Round Kick·Jab·Double Leg도 무술마다 그 무술의 이름', n.sideKick.karate.name === 'Yoko Geri' && n.sideKick.taekwondo.name === '옆차기' && n.sideKick.kickboxing.name === 'Side Kick' && n.backKick.karate.name === 'Ushiro Geri' && n.backKick.taekwondo.name === '뒤차기' && n.roundKick.karate.name === 'Mawashi Geri' && n.roundKick.taekwondo.name === '돌려차기' && n.roundKick.kickboxing.name === 'Round Kick' && n.jab.boxing.name === 'Jab' && n.jab.karate.name === 'Kizami-zuki' && n.jab.mma.name === 'Jab' && n.doubleLeg.wrestling.name === 'Basic Double Leg' && n.doubleLeg.judo.name === 'Morote Gari', n);
  const sr = fr.search;
  check('[검수3] 검색: 앞차기 / Mae Geri / Front Kick 모두 같은 기술, Kizami-zuki → Jab, 돌려차기·Yoko Geri·Morote Gari → 각 canonical', sr['앞차기'][0] === 'kickboxing__front-kick' && sr['Mae Geri'][0] === 'kickboxing__front-kick' && sr['Front Kick'][0] === 'kickboxing__front-kick' && sr['Kizami-zuki'][0] === 'kickboxing__jab' && sr['돌려차기'][0] === 'kickboxing__round-kick' && sr['Yoko Geri'][0] === 'kickboxing__side-kick' && sr['Morote Gari'][0] === 'wrestling__basic-double-leg', sr);
  check('[검수3] 대표 이름에 다른 기술명 직역 한국어명 없음 (양손 베기·십자 굳히기·맨손 조르기·어깨 바퀴·삼각 조르기)', fr.badCanonicalKo.length === 0, fr.badCanonicalKo);
  // UI: taekwondo / karate list rows
  await visit('#/arts/taekwondo/techniques?q=' + encodeURIComponent('앞차기'));
  const tkdRow = await page.evaluate(() => [...document.querySelectorAll('[data-technique-id="kickboxing__front-kick"] [data-testid="technique-row-name"]')].map((e) => e.textContent.trim()));
  await visit('#/arts/karate/techniques?q=' + encodeURIComponent('Mae Geri'));
  const karRow = await page.evaluate(() => [...document.querySelectorAll('[data-technique-id="kickboxing__front-kick"] [data-testid="technique-row-name"]')].map((e) => e.textContent.trim()));
  await visit('#/arts/karate/techniques/kickboxing__front-kick');
  const karTitle = await page.locator('[data-testid="technique-title"]').textContent();
  const karOther = await page.locator('[data-testid="technique-other-names"]').textContent().catch(() => '');
  check('[검수3 화면] 태권도 목록 "앞차기 (Front Kick / Mae Geri)", 가라테 목록·상세 "Mae Geri" + 앞차기 + 다른 이름', /^앞차기/.test(tkdRow[0] ?? '') && /Front Kick/.test(tkdRow[0] ?? '') && /^Mae Geri/.test(karRow[0] ?? '') && /앞차기/.test(karRow[0] ?? '') && karTitle === 'Mae Geri' && /Front Kick/.test(karOther), { tkdRow, karRow, karTitle, karOther });

  // ---- user records on a split (old list) record ----
  const ud = await page.evaluate(async () => {
    const h = await import('/src/lib/trainingHistory/service.ts');
    const ov = await import('/src/lib/skillProgress/overrideStore.ts');
    const we = await import('/src/lib/skillProgress/weaknessEngine.ts');
    const lt = await import('/src/lib/learnedTechniques/service.ts');
    h.recordTrainingSession({ curriculumId: null, dayNumber: null, techniqueIds: ['sambo__single-leg-double-leg'], completed: true, estimatedMinutes: 10, source: 'free_training' });
    (ov.setOverride ?? ((id, s) => ov.setOverrides([id], s)))('muay-thai__lead-hook-rear-hook', 'average');
    const legacy = we.legacySplitSkillEntries().map((e) => ({ id: e.technique.id, status: e.progress.status, practice: e.progress.practiceCount, splitInto: e.technique.splitInto }));
    const all = we.computeAllSkillProgress();
    const inAll = all.filter((e) => ['sambo__single-leg-double-leg', 'muay-thai__lead-hook-rear-hook'].includes(e.technique.id)).length;
    const parts = all.filter((e) => ['kickboxing__lead-hook', 'kickboxing__rear-hook', 'wrestling__basic-double-leg', 'sambo__single-leg'].includes(e.technique.id)).map((e) => ({ id: e.technique.id, override: e.progress.userOverride, practice: e.progress.practiceCount }));
    const weak = we.rankWeakness(all, { limit: 50 }).map((w) => w.technique?.id ?? w.techniqueId);
    const historyKept = h.listTrainingHistory().some((e) => e.techniqueIds.includes('sambo__single-leg-double-leg'));
    const overrideKept = (ov.getAllOverrides())['muay-thai__lead-hook-rear-hook'];
    return { legacy, inAll, parts, weakHasLegacy: weak.some((id) => /single-leg-double-leg|lead-hook-rear-hook/.test(id ?? '')), historyKept, overrideKept };
  });
  check('[검수4] 묶음 기록 위 사용자 기록(연습 1회·숙련도 "보통") 보존 + 기존 기록으로 표시 대상', ud.historyKept && ud.overrideKept === 'average' && ud.legacy.some((x) => x.id === 'sambo__single-leg-double-leg' && x.practice === 1) && ud.legacy.some((x) => x.id === 'muay-thai__lead-hook-rear-hook' && x.status === 'average'), ud.legacy);
  check('[검수4] 숙련도·연습 기록을 분리된 기술에 복사하지 않음 (Lead/Rear Hook·Double Leg·Single Leg 영향 없음)', ud.parts.every((p) => p.override === null && p.practice === 0), ud.parts);
  check('[검수4] 묶음 기록은 기술 목록·추천·약점 분석에 들어가지 않음', ud.inAll === 0 && !ud.weakHasLegacy, ud);
  await visit('#/learned-techniques');
  const legacyRows = await page.evaluate(() => [...document.querySelectorAll('[data-testid="learned-row"]')].filter((r) => r.querySelector('[data-testid="legacy-split-note"]')).map((r) => r.dataset.techniqueId));
  check('[검수4 화면] 배운 기술: 묶음 기록 2건이 "여러 기술을 묶은 기존 기록"으로 표시', legacyRows.includes('sambo__single-leg-double-leg') && legacyRows.includes('muay-thai__lead-hook-rear-hook'), legacyRows);

  // ================= full technique × art matrix audit =================
  const mx = await page.evaluate(async () => {
    const ld = await import('/src/lib/loadData.ts');
    const tc = await import('/src/lib/techniqueCanonical/index.ts');
    const dec = (await import('/data/audit/technique-art-decisions.json?import')).default.decisions;
    const before = new Set((await import('/data/audit/matrix-before.json?import')).default.linked);
    const listed = new Map(ld.martialArtSummaries.map((a) => [a.id, new Set(ld.getTechniquesByMartialArt(a.id).map((t) => t.id))]));
    const wrong = [];
    for (const d of dec) {
      const t = ld.getTechnique(d.techniqueId);
      const inArt = t && tc.isTechniqueInArt(t, d.art) && listed.get(d.art).has(t.id);
      if (d.decision === 'add' && !inArt) wrong.push(`add not applied: ${d.techniqueId}→${d.art}`);
      if (d.decision !== 'add' && inArt && !before.has(`${d.techniqueId}|${d.art}`)) wrong.push(`${d.decision} but linked: ${d.techniqueId}→${d.art}`);
      if (d.decision === 'add' && t && !ld.categoryInArt(t, d.art)) wrong.push(`no category: ${d.techniqueId}→${d.art}`);
    }
    const lost = [...before].filter((k) => { const [id, art] = k.split('|'); const t = ld.getTechnique(id); return !t || !tc.isTechniqueInArt(t, art); });
    const sizes = Object.fromEntries([...listed].map(([a, s]) => [a, s.size]));
    const s = await import('/src/lib/userTechniques/service.ts');
    const first = (q) => s.searchAllTechniques(q, 3)[0];
    const CASES = ['Jab', 'Cross', 'Hook', 'Uppercut', 'Overhand', 'Teep', 'Lead Teep', 'Rear Teep', 'Front Kick', 'Round Kick', 'Low Kick', 'Straight Knee', 'Horizontal Elbow', 'Basic Double Leg', 'Single Leg', 'High Crotch', 'Ankle Pick', "Fireman's Carry", 'Snap Down', 'Body Lock', 'Underhook', 'Overhook', 'Mount', 'Back Control', 'Side Control', 'Half Guard', 'Closed Guard', 'Front Headlock', 'Rear Naked Choke', 'Guillotine', 'Arm Triangle', 'Triangle Choke', 'Armbar', 'Kimura', 'Americana', "D'Arce Choke", 'Anaconda Choke', 'Collar Choke', 'Cross Collar Choke', 'Bow and Arrow Choke'];
    const cases = Object.fromEntries(CASES.map((q) => { const t = first(q); return [q, t ? { id: t.id, name: t.name, arts: tc.techniqueArts(t), aliases: t.aliases.length, mmaCategory: tc.isTechniqueInArt(t, 'mixed-martial-arts') ? ld.categoryInArt(t, 'mixed-martial-arts') : null } : null]; }));
    const prof = await import('/src/lib/aiCoachCurriculum/profile.ts');
    const mmaProfile = prof.buildLearnerProfile('mixed-martial-arts');
    const a = await import('/src/lib/visualMitt/archetypes.ts');
    const mmaMittable = ld.getTechniquesByMartialArt('mixed-martial-arts').filter((t) => a.motionForTechnique(t)).length;
    return { wrong, lost, sizes, cases, mmaProfileOk: !!mmaProfile, mmaMittable, jabMmaSearch: s.searchAllTechniques('Jab', 5, { martialArt: 'mixed-martial-arts' })[0]?.id };
  });
  check('[전수1] 결정 1,333건이 그대로 반영: 추가 = 그 무술 관계·목록·카테고리, 해당 없음/REVIEW = 새로 연결되지 않음', mx.wrong.length === 0, mx.wrong.slice(0, 10));
  check('[전수2] 감사 전 관계 1,417개 손실 0', mx.lost.length === 0, mx.lost.slice(0, 10));
  check('[전수3] MMA 목록 545개 (감사 전 55)', mx.sizes['mixed-martial-arts'] === 545, mx.sizes);
  const c = mx.cases;
  const has = (q, arts) => c[q] && arts.every((x) => c[q].arts.includes(x));
  check('[전수4 타격] Jab·Cross·Hook·Uppercut·Overhand·Teep 변형·Front/Round/Low Kick·Knee·Elbow가 실제 무술과 MMA에 연결, Lead/Rear Teep은 서로 다른 기술', has('Jab', ['boxing', 'kickboxing', 'muay-thai', 'mixed-martial-arts', 'sambo', 'karate']) && has('Cross', ['boxing', 'kickboxing', 'muay-thai', 'mixed-martial-arts', 'sambo']) && has('Hook', ['boxing', 'mixed-martial-arts']) && has('Overhand', ['mixed-martial-arts']) && has('Front Kick', ['kickboxing', 'karate', 'taekwondo', 'mixed-martial-arts']) && has('Round Kick', ['kickboxing', 'karate', 'taekwondo', 'mixed-martial-arts']) && has('Low Kick', ['kickboxing', 'muay-thai', 'sambo', 'mixed-martial-arts']) && has('Straight Knee', ['kickboxing', 'muay-thai', 'mixed-martial-arts']) && has('Lead Teep', ['muay-thai', 'mixed-martial-arts']) && has('Rear Teep', ['muay-thai', 'mixed-martial-arts']) && c['Lead Teep'].id !== c['Rear Teep'].id, c);
  check('[전수4 테이크다운] Double Leg·Single Leg·High Crotch·Ankle Pick·Fireman\'s Carry·Snap Down·Body Lock — MMA 포함', has('Basic Double Leg', ['wrestling', 'judo', 'bjj', 'sambo', 'mixed-martial-arts']) && has('High Crotch', ['bjj', 'wrestling', 'sambo', 'mixed-martial-arts']) && has('Ankle Pick', ['wrestling', 'mixed-martial-arts']) && has("Fireman's Carry", ['wrestling', 'judo', 'mixed-martial-arts']) && has('Snap Down', ['wrestling', 'mixed-martial-arts']) && has('Body Lock', ['wrestling', 'mixed-martial-arts']), { dl: c['Basic Double Leg'], hc: c['High Crotch'], fc: c["Fireman's Carry"] });
  check('[전수4 그래플링] Underhook·Overhook·Mount·Back Control·Side Control·Half/Closed Guard·Front Headlock — MMA 포함', ['Underhook', 'Overhook', 'Mount', 'Back Control', 'Side Control', 'Half Guard', 'Closed Guard', 'Front Headlock'].every((q) => has(q, ['mixed-martial-arts'])), Object.fromEntries(['Mount', 'Side Control', 'Front Headlock'].map((q) => [q, c[q]])));
  check('[전수4 서브미션] RNC·Guillotine·Arm Triangle·Triangle·Armbar·Kimura·Americana·D\'Arce·Anaconda는 서로 다른 기술로 MMA 포함, 도복 초크(Collar·Cross Collar·Bow and Arrow)는 MMA 제외', ['Rear Naked Choke', 'Guillotine', 'Arm Triangle', 'Triangle Choke', 'Armbar', 'Kimura', 'Americana', "D'Arce Choke", 'Anaconda Choke'].every((q) => has(q, ['mixed-martial-arts'])) && new Set(['Rear Naked Choke', 'Guillotine', 'Arm Triangle', 'Triangle Choke', "D'Arce Choke", 'Anaconda Choke'].map((q) => c[q].id)).size === 6 && ['Cross Collar Choke', 'Bow and Arrow Choke'].every((q) => c[q] && !c[q].arts.includes('mixed-martial-arts')), Object.fromEntries(['Collar Choke', 'Cross Collar Choke', 'Bow and Arrow Choke', "D'Arce Choke"].map((q) => [q, c[q]])));
  check('[전수5] MMA: 검색 필터에서 Jab, AI 코치 학습 프로필, Visualizing Mitt로 그릴 수 있는 MMA 기술', mx.jabMmaSearch === 'kickboxing__jab' && mx.mmaProfileOk && mx.mmaMittable >= 40, { jab: mx.jabMmaSearch, mittable: mx.mmaMittable });
  const mmaRows = {};
  for (const q of ['Jab', 'Rear Naked Choke', 'Double Leg', 'Lead Teep', 'Kimura']) {
    await visit(`#/arts/mixed-martial-arts/techniques?q=${encodeURIComponent(q)}`);
    mmaRows[q] = await page.evaluate(() => [...document.querySelectorAll('[data-testid="technique-row"]')].map((r) => r.dataset.techniqueId));
  }
  await visit('#/arts/mixed-martial-arts');
  const mmaSummary = await page.evaluate(() => document.body.innerText.match(/(\d+)\s*개/g)?.slice(0, 4) ?? []);
  check('[전수5 화면] MMA 기술 목록에서 새로 연결된 기술 검색·표시 (Jab·RNC·Double Leg·Lead Teep·Kimura), MMA 화면 기술 수 545', mmaRows.Jab.includes('kickboxing__jab') && mmaRows['Rear Naked Choke'].includes('bjj__rear-naked-choke') && mmaRows['Double Leg'].includes('wrestling__basic-double-leg') && mmaRows['Lead Teep'].includes('muay-thai__lead-teep') && mmaRows.Kimura.includes('bjj__kimura') && mmaSummary.some((x) => x.startsWith('545')), { mmaRows, mmaSummary });

  check('[Z] 페이지 에러 없음', errors.length === 0, errors);
  await app.close();
  const passed = results.filter((x) => x.pass).length;
  console.log(`=== SUMMARY: ${passed}/${results.length} PASSED ===`);
  if (passed !== results.length) console.log('FAILURES:', results.filter((x) => !x.pass).map((x) => x.name));
  process.exit(passed === results.length ? 0 : 1);
}
main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
