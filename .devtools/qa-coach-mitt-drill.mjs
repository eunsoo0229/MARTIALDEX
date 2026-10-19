// Operator account + DB combos in 사용자 콤보 + Visualizing Mitt reaction drill
// + AI coach practice through the mitt (striking) / solo call-out drill
// (wrestling·BJJ standing) — real Electron app, real Supabase, real data.
//   ADMIN_ID=MARTIALDEX ADMIN_PASSWORD=... env -u ELECTRON_RUN_AS_NODE node .devtools/qa-coach-mitt-drill.mjs
// Requires the Vite dev server on :5173. The password comes from the environment only.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const ADMIN_ID = process.env.ADMIN_ID;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  const d = typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (d ? ' :: ' + d.slice(0, 700) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ADMIN_PASSWORD;
  const app = await electron.launch({ executablePath: path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [APP_DIR, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-cmd-'))}`], env, timeout: 120000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await page.waitForLoadState('load');
  await page.evaluate(() => localStorage.setItem('martialdex:coach-kind-pref', JSON.stringify({ last: 'gemini', remember: true }))); // 이 QA는 기존 Gemini 코치를 검증 — 수업 전 코치 선택(2026-10-19) 이후 Gemini를 명시적으로 선택
  await sleep(1200);
  await page.evaluate(() => {
    window.__spoken = [];
    const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (u) => {
      window.__spoken.push({ text: u.text, at: Date.now() });
      orig(u);
    };
  });
  return { app, page };
}

async function main() {
  const { app, page } = await launch();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const goto = async (hash) => {
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    await sleep(1200);
  };

  // ---------- 1. operator account: sign in with the ID ----------
  if (ADMIN_ID && ADMIN_PASSWORD) {
    await goto('#/login');
    await page.locator('[data-testid="login-id"]').fill(ADMIN_ID);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.locator('form button[type="submit"]').click();
    // poll (an async predicate would resolve immediately as a truthy Promise)
    for (let i = 0; i < 40; i++) {
      const signedIn = await page.evaluate(async () => !!(await (await import('/src/lib/supabase/client.ts')).supabase.auth.getUser()).data.user);
      if (signedIn) break;
      await sleep(500);
    }
    const who = await page.evaluate(async () => {
      const { supabase } = await import('/src/lib/supabase/client.ts');
      const u = (await supabase.auth.getUser()).data.user;
      if (!u) return null;
      const { data } = await supabase.from('profiles').select('nickname').eq('user_id', u.id).maybeSingle();
      return { email: u.email, nickname: data?.nickname, id: u.id };
    });
    check('[1] 관리자 계정: 아이디 "MARTIALDEX"로 로그인 (내부 이메일 martialdex@martialdex.local), 닉네임 MARTIALDEX', who?.email === 'martialdex@martialdex.local' && who?.nickname === 'MARTIALDEX', who);

    // ---------- 2. DB combos published under the operator's name ----------
    const sc = await page.evaluate(async (uid) => {
      const svc = await import('/src/lib/sharedCombo/service.ts');
      const { listDbCombosForSharing } = await import('/src/lib/sharedCombo/dbCombos.ts');
      await (await import('/src/lib/cloudSync/addTeqSync.ts')).syncAddTeqFromCloud();
      const expected = listDbCombosForSharing();
      const listed = await svc.listSharedCombos(uid);
      const mine = listed.ok ? listed.data.filter((c) => c.authorId === uid) : [];
      const sources = await svc.mySharedSources(uid);
      const missing = expected.combos.filter((c) => !sources.ok || !sources.data.has(c.sourceRef)).map((c) => c.name);
      const jcl = mine.find((c) => /^Jab → Cross → Low Kick$/.test(c.name));
      const ld = await import('/src/lib/loadData.ts');
      const brokenSteps = mine.flatMap((c) => c.steps.filter((s) => !ld.getTechnique(s.techniqueId) && !s.techniqueId.includes('__')).map((s) => `${c.name}:${s.name}`));
      return { expected: expected.combos.length, skipped: expected.skipped.length, mine: mine.length, nick: [...new Set(mine.map((c) => c.authorNickname))], missing, jcl: jcl && { steps: jcl.steps.map((s) => s.techniqueId), purpose: jcl.purpose }, brokenSteps, kinds: [...new Set(mine.map((c) => c.kind))] };
    }, (await page.evaluate(async () => (await (await import('/src/lib/supabase/client.ts')).supabase.auth.getUser()).data.user?.id)));
    check(`[2] 기술 DB의 콤보 ${sc.expected}개 전부 "MARTIALDEX" 이름으로 사용자 콤보에 등록 (누락 0, 중복 없이 재실행 가능)`, sc.mine >= sc.expected && sc.missing.length === 0 && sc.nick.length === 1 && sc.nick[0] === 'MARTIALDEX', sc);
    check('[2] 등록된 콤보의 단계는 실제 기술 id (예: Jab → Cross → Low Kick)', !!sc.jcl && sc.jcl.steps.join() === 'kickboxing__jab,kickboxing__cross,kickboxing__low-kick' && sc.brokenSteps.length === 0, sc.jcl);
    await goto('#/combos');
    const usersTab = page.locator('button, a', { hasText: '사용자 콤보' }).first();
    if (await usersTab.count()) await usersTab.click();
    await sleep(2500);
    const shown = await page.evaluate(() => /MARTIALDEX/.test(document.body.innerText) && /Jab → Cross/.test(document.body.innerText));
    check('[2 화면] 사용자 콤보 목록에 MARTIALDEX가 올린 콤보 표시', shown);
    await page.evaluate(async () => (await import('/src/lib/supabase/client.ts')).supabase.auth.signOut());
  } else {
    console.log('SKIP — [1][2] ADMIN_ID / ADMIN_PASSWORD not set');
  }

  // ---------- 3. Visualizing Mitt reaction drill ----------
  const pool = await page.evaluate(async () => {
    const r = await import('/src/lib/visualMitt/reaction.ts');
    const p = r.reactionPool();
    return { n: p.length, offBasic: p.flatMap((c) => c.steps.filter((s) => !r.BASIC_ATTACKS.has(s.motion.archetype.key)).map((s) => s.technique.name)), sample: p.slice(0, 8).map((c) => `${c.name} = "${r.comboCallout(c)}"`), sources: [...new Set(p.map((c) => c.source))] };
  });
  check('[3] 반응 훈련 콤보 풀 = 기술 DB에 실제로 있는 콤보 중 기본 공격으로만 된 것', pool.n >= 8 && pool.offBasic.length === 0 && pool.sources.join() === 'db', pool);
  await goto('#/coach/mitt?mode=voice');
  await page.locator('[data-testid="mitt-tab-react"]').click();
  await page.locator('[data-testid="reaction-pace-fast"]').click();
  await page.locator('[data-testid="reaction-round-60"]').click();
  const spokenBefore = (await page.evaluate(() => window.__spoken.length));
  await page.locator('[data-testid="reaction-start"]').click();
  await sleep(12000); // each combo is called out in full before the mitt starts
  const r1 = await page.evaluate(() => ({ called: Number(document.querySelector('[data-testid="reaction-drill"]')?.dataset.called), combo: document.querySelector('[data-testid="reaction-call"]')?.dataset.combo, words: document.querySelector('.reaction-drill__words')?.textContent }));
  const spokenR = (await page.evaluate(() => window.__spoken)).slice(spokenBefore).map((s) => s.text);
  const allowed = /^(바디 )?(잽|크로스|훅|뒷손 훅|어퍼|뒷손 어퍼)$|^(앞발 )?(카프킥|로우킥)$|^(미들킥|하이킥|앞발 팁|뒷발 팁|더블렉|싱글렉)$/;
  const words = spokenR.flatMap((t) => t.split(', '));
  check('[3] 시작하면 실제 콤보를 무작위로 연속해서 불러 줌 (12초에 3개 이상), 불러 준 단어는 기본 공격뿐', r1.called >= 3 && words.length >= 6 && words.every((w) => allowed.test(w)), { r1, spoken: spokenR.slice(0, 6) });
  check('[3] 같은 콤보를 연달아 부르지 않음', spokenR.every((t, i) => i === 0 || t !== spokenR[i - 1]) || new Set(spokenR).size === 1, spokenR.slice(0, 8));
  await page.locator('[data-testid="reaction-pause"]').click();
  const pausedCalled = r1.called;
  await sleep(2500);
  const afterPause = await page.evaluate(() => Number(document.querySelector('[data-testid="reaction-drill"]')?.dataset.called));
  check('[3] 일시정지 중에는 새 콤보를 부르지 않음', afterPause <= pausedCalled + 1, { pausedCalled, afterPause });
  await page.locator('[data-testid="reaction-pause"]').click();
  await sleep(1500);
  await page.locator('[data-testid="reaction-stop"]').click();
  await sleep(500);
  const hist = await page.evaluate(async () => (await import('/src/lib/trainingHistory/service.ts')).listTrainingHistory().find((e) => /반응 훈련/.test(e.notes ?? '')));
  check('[3] 끝내면 훈련 기록에 반응 훈련 저장 (사용자 수행 기록)', !!hist && hist.source === 'visual_mitt' && /사용자 수행 기록/.test(hist.notes), hist?.notes);

  // ---------- 4. AI coach: striking practice → mitt, wrestling → solo drill, partner grappling → timer ----------
  const days = await page.evaluate(async () => {
    const off = await import('/src/lib/curriculum/officialData.ts');
    const coach = await import('/src/lib/aiCoachDay/service.ts');
    const a = await import('/src/lib/visualMitt/archetypes.ts');
    const d = await import('/src/lib/soloDrill/moves.ts');
    const find = (art, pred) => {
      const c = off.getOfficialCurriculum(art);
      for (const day of c.days) {
        const t = coach.coachTechniquesForDay(day)[0];
        if (t && pred(t)) return { curriculumId: c.id, day: day.day, technique: t.id, name: t.name };
      }
      return null;
    };
    return {
      striking: find('boxing', (t) => { const m = a.motionForTechnique(t); return m && m.archetype.kind !== 'entry' && !d.drillPlanFor(t); }),
      wrestling: find('wrestling', (t) => !!d.drillPlanFor(t) && !a.motionForTechnique(t)),
      bjjTimer: find('bjj', (t) => !d.drillPlanFor(t) && !a.motionForTechnique(t)),
    };
  });
  const toReady = async (art, info) => {
    await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).clearCoachDayRun());
    await goto(`#/learning/${art}/${info.curriculumId}/coach/${info.day}?mode=text&place=home`);
    await page.waitForFunction(() => !!document.querySelector('[data-testid="coach-step"]'), null, { timeout: 60000 });
    await sleep(1500);
    await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).updateCoachDayRun((r) => ({ ...r, step: 'ready' })));
    await page.locator('[data-testid="coach-ready"] button').first().waitFor({ timeout: 15000 });
    await page.locator('[data-testid="coach-ready"] button').first().click();
    await page.locator('[data-testid="coach-posture-start"]').click(); // 자세 설명 → 실습 시작
    await sleep(1500);
  };
  const stepNow = () => page.evaluate(() => document.querySelector('[data-testid="coach-step"]')?.dataset.step);
  const runNow = () => page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).getCoachDayRun());

  if (days.striking) {
    await toReady('boxing', days.striking);
    const r = await runNow();
    const lines = r.messages.slice(-3).map((m) => m.text).join(' / ');
    check(`[4] 타격 기술(${days.striking.name}) 실습: "몇 분 반복" 타이머 대신 Visualizing Mitt를 불러 실습`, (await stepNow()) === 'mitt' && !!r.mittPlan?.asPractice && (await page.locator('[data-testid="mitt-runner"]').count()) === 1 && !r.practice, lines);
    await sleep(2500);
    await page.locator('[data-testid="mitt-runner-stop"]').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="coach-step"]')?.dataset.step !== 'mitt', null, { timeout: 15000 });
    const r2 = await runNow();
    check('[4] 미트를 끝내면 그 시간이 이 기술의 실습 기록이 되고 수업이 이어짐', r2.outcomes[days.striking.technique]?.practicedSeconds > 0 && (r2.mittSessions ?? []).length >= 1 && r2.step !== 'mitt', { outcome: r2.outcomes[days.striking.technique], step: r2.step });
  } else check('[4] 복싱 Day에서 미트 실습 대상 기술 찾기', false, days);

  if (days.wrestling) {
    const spokenBeforeDrill = (await page.evaluate(() => window.__spoken.length));
    await toReady('wrestling', days.wrestling);
    const r = await runNow();
    check(`[4] 레슬링 기술(${days.wrestling.name}) 실습: 솔로 드릴 — 코치가 실제 기술 구령을 빠르게 부름`, (await stepNow()) === 'drill' && (await page.locator('[data-testid="solo-drill"]').count()) === 1 && r.drillPlan?.cues.length >= 5, { cues: r.drillPlan?.cues.map((c) => c.call) });
    await sleep(9000);
    const calls = await page.evaluate(() => Number(document.querySelector('[data-testid="solo-drill"]')?.dataset.calls));
    const spokenD = (await page.evaluate(() => window.__spoken)).slice(spokenBeforeDrill).map((s) => s.text);
    const cueWords = new Set(r.drillPlan.cues.map((c) => c.call));
    const spokenCues = spokenD.filter((t) => cueWords.has(t));
    check('[4] 구령(예: 태클·스프롤·다운블록)이 2~4개씩 빠르게 이어짐 — 입력 모드에서도 소리로', calls >= 4 && spokenCues.length >= 4, { calls, spokenCues: spokenCues.slice(0, 8) });
    const ld = await page.evaluate(async (ids) => { const l = await import('/src/lib/loadData.ts'); return ids.filter((id) => !l.getTechnique(id)); }, r.drillPlan.cues.map((c) => c.id));
    check('[4] 모든 구령이 실제 기술(기술 DB id)에 연결', ld.length === 0, ld);
    await page.locator('[data-testid="solo-drill-stop"]').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="coach-step"]')?.dataset.step !== 'drill', null, { timeout: 15000 });
    const r2 = await runNow();
    check('[4] 드릴을 끝내면 그 시간이 실습 기록이 되고 수업이 이어짐', r2.outcomes[days.wrestling.technique]?.practicedSeconds > 0 && (r2.drillSessions ?? []).length === 1, { outcome: r2.outcomes[days.wrestling.technique], drill: r2.drillSessions });
  } else check('[4] 레슬링 Day에서 솔로 드릴 대상 기술 찾기', false, days);

  if (days.bjjTimer) {
    await toReady('bjj', days.bjjTimer);
    check(`[4] 파트너가 필요한 그래플링 기술(${days.bjjTimer.name})은 기존처럼 타이머 실습`, (await stepNow()) === 'practice' && (await page.locator('[data-testid="coach-timer"]').count()) === 1, await stepNow());
    await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).clearCoachDayRun());
  }

  // ---------- 5. 자세 설명 먼저 · MMA 타격+그래플링 · 테이크다운 → 서브미션 ----------
  {
    await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).clearCoachDayRun());
    const info = days.striking;
    await goto(`#/learning/boxing/${info.curriculumId}/coach/${info.day}?mode=text&place=home`);
    await page.waitForFunction(() => !!document.querySelector('[data-testid="coach-step"]'), null, { timeout: 60000 });
    await sleep(1500);
    await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).updateCoachDayRun((r) => ({ ...r, step: 'ready' })));
    await page.locator('[data-testid="coach-ready"] button').first().click();
    await page.locator('[data-testid="coach-posture"]').waitFor({ timeout: 10000 });
    await sleep(2500);
    const pst = await page.evaluate(() => ({
      step: document.querySelector('[data-testid="coach-step"]')?.dataset.step,
      lines: [...document.querySelectorAll('[data-testid="coach-posture-lines"] li')].map((l) => l.textContent),
      running: !!document.querySelector('[data-testid="mitt-runner"], [data-testid="coach-timer"], [data-testid="solo-drill"]'),
    }));
    check('[5] "준비됐어" → 실습을 바로 시작하지 않고 자세(기본 자세 → 기술 자세)부터 설명하고 기다림', pst.step === 'posture' && !pst.running && /기본 자세/.test(pst.lines[0] ?? '') && pst.lines.length >= 2, pst);
    await page.fill('[data-testid="coach-text-input"]', '준비됐어');
    await page.keyboard.press('Enter');
    await page.locator('[data-testid="coach-mitt"] [data-testid="mitt-runner"]').waitFor({ timeout: 10000 });
    check('[5] 자세 확인 후 Visualizing Mitt를 요청 없이 자동으로 불러옴', (await stepNow()) === 'mitt');
    await page.locator('[data-testid="mitt-runner-stop"]').click();
    await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).clearCoachDayRun());
  }
  const mma = await page.evaluate(async () => {
    const pp = await import('/src/lib/aiCoachDay/practicePlan.ts');
    const s = await import('/src/lib/userTechniques/service.ts');
    const a = await import('/src/lib/visualMitt/archetypes.ts');
    const cc = await import('/src/lib/aiCoachCurriculum/service.ts');
    const kind = (id) => a.motionForTechnique(s.resolveTechnique(id))?.archetype.kind ?? null;
    const plan = (id, ctx) => {
      const x = pp.planPractice(s.resolveTechnique(id), { location: 'home', seconds: 180, mma: false, submissionGoal: false, ...ctx });
      return { mode: x.mode, ids: x.mitt?.techniqueIds ?? [], kinds: (x.mitt?.techniqueIds ?? []).map(kind), after: x.after, timerText: x.timerText, intro: x.intro, briefing: x.briefing };
    };
    return {
      strike: plan('boxing__jab', { mma: true }),
      entry: plan('wrestling__basic-double-leg', { mma: true, location: 'gym' }),
      sub: plan('bjj__armbar', { mma: true }),
      subGoal: plan('bjj__armbar', { submissionGoal: true, location: 'gym' }),
      subPlain: plan('bjj__armbar', { location: 'gym' }),
      boxing: plan('boxing__jab', {}),
      rules: cc.mmaRules({ martialArt: 'mma', goal: '서브미션으로 경기를 끝내고 싶어' }).join('\n'),
      rulesBoxing: cc.mmaRules({ martialArt: 'boxing', goal: '서브미션' }).length,
      allReal: [...new Set(['boxing__jab', 'boxing__cross', 'wrestling__basic-double-leg'])].every((id) => !!s.resolveTechnique(id)),
    };
  });
  check('[5] MMA 타격 기술 실습 = 미트에서 타격 → 테이크다운 (타격+그래플링 혼합)', mma.strike.mode === 'mma_mix' && mma.strike.kinds[0] === 'strike' && mma.strike.kinds.at(-1) === 'entry', mma.strike);
  check('[5] MMA 테이크다운 실습 = 타격으로 셋업한 뒤 진입', mma.entry.mode === 'mma_mix' && mma.entry.kinds[0] === 'strike' && mma.entry.kinds.at(-1) === 'entry', mma.entry);
  check('[5] MMA 서브미션 = 테이크다운(미트) → 서브미션 마무리', mma.sub.mode === 'takedown_submission' && mma.sub.kinds.includes('entry') && mma.sub.after === 'timer' && /테이크다운/.test(mma.sub.intro) && /서브미션/.test(mma.sub.intro), { intro: mma.sub.intro, ids: mma.sub.ids, timer: mma.sub.timerText });
  check('[5] 서브미션이 목표인 수업(MMA 아님)도 테이크다운 → 서브미션, 목표가 아니면 기존 타이머', mma.subGoal.mode === 'takedown_submission' && mma.subPlain.mode === 'timer' && mma.subPlain.ids.length === 0, { goal: mma.subGoal.mode, plain: mma.subPlain.mode });
  check('[5] MMA가 아닌 복싱 잽은 잽만 미트로 (테이크다운 섞지 않음)', mma.boxing.mode === 'mitt' && mma.boxing.ids.length === 1, mma.boxing);
  check('[5] 모든 실습 계획에 자세 설명 먼저(기본 자세 … "준비됐어" 안내)', [mma.strike, mma.entry, mma.sub, mma.boxing].every((p) => /기본 자세/.test(p.briefing[0]) && /준비됐어/.test(p.briefing.at(-1))), mma.sub.briefing);
  check('[5] AI 코치 수업 커리큘럼(MMA): 타격+그래플링 혼합 규칙, 서브미션 목표면 테이크다운 → 서브미션 순서 규칙 (MMA 아닐 땐 없음)', /타격.*그래플링/.test(mma.rules) && /테이크다운 → \(포지션 컨트롤\) → 서브미션/.test(mma.rules) && mma.rulesBoxing === 0, mma.rules);

  // ---------- 6. 「수업하고 싶은 거 입력하기」: 입력에서 나온 기술 → 미트 ----------
  const oneOff = await page.evaluate(async () => {
    const om = await import('/src/lib/coachLesson/oneOffMitt.ts');
    const wp = await import('/src/lib/coachLesson/workoutPlan.ts');
    const mk = (request, martialArt, practice = '') => ({ id: 'qa', request, mode: 'topic', title: request, martialArt, techniqueId: null, intro: '', context: { name: request, concepts: [], scenarios: [], keyPointsReference: '' }, sources: [], webSearch: { called: true, queries: [], resultCount: 0, used: true, note: null }, linkedLearned: [], practice, workout: { spec: wp.parseWorkoutSpec(practice), ai: null, mismatch: false }, videoQueries: [], videoTerms: [], personalization: [], material: '', createdAt: new Date().toISOString() });
    const run = (l) => { const p = om.oneOffPractice(l); return p ? { ids: p.mitt.techniqueIds, mode: p.mode, name: p.mitt.name, briefing: p.briefing.length } : null; };
    return {
      kb: run(mk('오늘 잽과 크로스 연결한 뒤 로우킥으로 마무리하는 걸 배우고 싶어', 'kickboxing')),
      mmaLesson: run(mk('MMA에서 잽 크로스 연결을 배우고 싶어', 'mma')),
      none: run(mk('오늘 복싱 거리 조절을 배우고 싶어', 'boxing', '거리 감각을 3분씩 2세트 연습합니다')),
    };
  });
  check('[6] 입력한 수업의 기술(잽·크로스·로우킥)을 조합해 미트 콤보로', !!oneOff.kb && oneOff.kb.ids.length === 3 && /jab/.test(oneOff.kb.ids[0]) && /cross/.test(oneOff.kb.ids[1]) && /low-kick/.test(oneOff.kb.ids[2]), oneOff.kb);
  check('[6] MMA 입력 수업은 타격 뒤 테이크다운까지 섞어서', !!oneOff.mmaLesson && oneOff.mmaLesson.mode === 'mma_mix' && /double-leg/.test(oneOff.mmaLesson.ids.at(-1)), oneOff.mmaLesson);
  check('[6] 그릴 수 있는 기술이 나오지 않은 수업은 미트를 지어내지 않음(기존 타이머)', oneOff.none === null, oneOff.none);
  // UI: the lesson reaches practice → posture first → the mitt, and the record notes it
  await page.evaluate(async () => {
    const o = await import('/src/lib/coachLesson/oneOff.ts');
    const wp = await import('/src/lib/coachLesson/workoutPlan.ts');
    const concept = { id: 'c1', label: '잽-크로스 연결', importance: 'core', explain: '잽 뒤에 크로스를 바로 칩니다.', variants: [], reference: '잽 뒤 크로스', keywords: ['잽', '크로스'], questions: {}, choice: null };
    const lesson = { id: `qa-${Date.now()}`, request: '오늘 잽과 크로스 연결을 연습하고 싶어', mode: 'topic', title: '잽-크로스 연결', martialArt: 'boxing', techniqueId: null, intro: '시작합니다.', context: { name: '잽-크로스 연결', concepts: [concept], scenarios: [], keyPointsReference: '잽 뒤 크로스' }, sources: [], webSearch: { called: true, queries: [], resultCount: 0, used: true, note: null }, linkedLearned: [], practice: '잽-크로스를 3분씩 2세트', workout: { spec: wp.parseWorkoutSpec('잽-크로스를 3분씩 2세트'), ai: null, mismatch: false }, videoQueries: [], videoTerms: [], personalization: [], material: '', createdAt: new Date().toISOString() };
    const first = o.startOneOffLesson(lesson);
    localStorage.setItem('martialdex:coach-oneoff-session', JSON.stringify({ v: 1, lesson, state: first.state, directive: 'video', messages: [], startedAt: Date.now(), recorded: false, plan: null, run: null, workoutResult: null, videos: { status: 'none', videos: [], queries: [], checked: 0, message: null } }));
  });
  await goto('#/coach/lesson');
  await page.locator('[data-testid="oneoff-chat"]').waitFor({ timeout: 30000 });
  // move the lesson to practice the way the engine does (video done → … → ready)
  for (let i = 0; i < 8 && (await page.locator('[data-testid="oneoff-posture"]').count()) === 0; i++) {
    const vd = page.locator('[data-testid="oneoff-video-done"]');
    if (await vd.count()) await vd.click();
    else {
      await page.fill('[data-testid="oneoff-answer"]', '건너뛸게');
      await page.keyboard.press('Enter');
    }
    await sleep(1500);
  }
  const op = await page.evaluate(() => ({
    posture: !!document.querySelector('[data-testid="oneoff-posture"]'),
    lines: document.querySelectorAll('[data-testid="oneoff-posture"] li').length,
    mitt: document.querySelector('[data-testid="oneoff-posture-mitt"]')?.textContent ?? '',
    workout: !!document.querySelector('[data-testid="workout-start"], [data-testid="workout-panel"]'),
    directive: document.querySelector('[data-testid="oneoff-chat"]')?.dataset.directive,
  }));
  check('[6] 입력 수업 실습: 자세 설명이 먼저 나오고 미트(잽 → 크로스)를 예고, 타이머는 숨김', op.posture && op.lines >= 2 && /잽|Jab/.test(op.mitt) && /크로스|Cross/.test(op.mitt) && !op.workout, op);
  if (op.posture) {
    await page.locator('[data-testid="oneoff-posture-start"]').click();
    await page.locator('[data-testid="oneoff-mitt"] [data-testid="mitt-runner"]').waitFor({ timeout: 10000 });
    await sleep(2000);
    await page.locator('[data-testid="mitt-runner-stop"]').click();
    await sleep(1500);
    const after = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('martialdex:coach-oneoff-session') || 'null');
      return { phase: s?.mitt?.phase, result: s?.mitt?.result, directive: s?.directive };
    });
    check('[6] 미트를 끝내면 실습 완료로 수업이 다음 단계로 진행 (수행 기록 저장)', after.phase === 'done' && !!after.result && after.directive !== 'ready', after);
  }
  await page.evaluate(() => localStorage.removeItem('martialdex:coach-oneoff-session'));

  // standalone solo drill plan rules
  const plans = await page.evaluate(async () => {
    const d = await import('/src/lib/soloDrill/moves.ts');
    const s = await import('/src/lib/userTechniques/service.ts');
    const p = (id) => { const t = s.resolveTechnique(id); const x = t && d.drillPlanFor(t); return x ? { group: x.group, focus: x.focusId, extra: x.extra?.call ?? null } : null; };
    return { sprawl: p('wrestling__sprawl'), highCrotch: p('bjj__high-crotch'), armbar: p('bjj__armbar'), jab: p('kickboxing__jab'), sitOut: p('wrestling__sit-out') };
  });
  check('[4] 드릴 대상 판정: 스프롤=스탠딩(자기 구령 강조), 하이 크로치=스탠딩(섀도 진입 구령 추가), 싯아웃=그라운드, 암바·잽=드릴 아님', plans.sprawl?.group === 'standing' && plans.sprawl.focus === 'wrestling__sprawl' && plans.highCrotch?.group === 'standing' && !!plans.highCrotch.extra && plans.sitOut?.group === 'ground' && plans.armbar === null && plans.jab === null, plans);

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
