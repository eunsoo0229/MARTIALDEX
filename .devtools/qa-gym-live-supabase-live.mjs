// LIVE multi-device QA for 체육관 실시간 훈련 (coach device → Supabase → student devices).
// One Electron app, one window per account, each on its own session partition (separate
// login/localStorage = separate "phone"). Requires the Vite dev server on :5173.
// Creates throwaway @example.com accounts in the linked Supabase project.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const PRELOAD = path.join(APP_DIR, 'electron/preload.cjs');
const STAMP = Date.now();
const SHOT_DIR = process.env.SHOT_DIR;
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (!pass && detail ? ' :: ' + String(detail).slice(0, 400) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUntil(fn, timeoutMs = 20000, step = 250) {
  const t = Date.now();
  while (Date.now() - t < timeoutMs) {
    if (await fn().catch(() => false)) return true;
    await sleep(step);
  }
  return false;
}

let app;
async function openDevice(name) {
  const winPromise = app.waitForEvent('window');
  await app.evaluate(
    ({ BrowserWindow }, { name, preload }) => {
      const w = new BrowserWindow({ width: 430, height: 900, webPreferences: { partition: `persist:${name}`, preload, contextIsolation: true, sandbox: true } });
      w.setTitle(name);
      void w.loadURL('http://localhost:5173/#/');
    },
    { name: `${name}-${STAMP}`, preload: PRELOAD }
  );
  const page = await winPromise;
  await page.waitForLoadState('load');
  await sleep(600);
  page.on('dialog', (d) => d.accept());
  page.__name = name;
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(e.message));
  return page;
}

const ev = (page, fn, arg) => page.evaluate(fn, arg);
let emailSeq = 0;
async function signUp(page, nickname) {
  const email = `mdx.qa.live.u${++emailSeq}.${STAMP}@example.com`;
  const r = await ev(page, async ({ email, nickname }) => {
    const { signUpWithEmail } = await import('/src/lib/auth/authService.ts');
    const res = await signUpWithEmail(email, 'MdxTest123!', nickname);
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const { data } = await supabase.auth.getSession();
    return { ok: res.ok, msg: res.ok ? '' : res.message, userId: data.session?.user.id ?? null };
  }, { email, nickname });
  if (!r.userId) throw new Error(`signup failed for ${nickname}: ${r.msg}`);
  await sleep(800);
  return { page, nickname, userId: r.userId, email };
}
const goto = async (page, hash) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await sleep(500);
};
const text = (page) => page.evaluate(() => document.body.innerText).catch(() => '');
async function readTimer(page) {
  return page.evaluate(() => {
    const q = (id) => document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null;
    return { set: q('live-timer-set'), clock: q('live-timer-clock'), phase: q('live-timer-phase'), hash: location.hash };
  });
}
const toSec = (clock) => (clock ? Number(clock.split(':')[0]) * 60 + Number(clock.split(':')[1]) : NaN);
/** Precise remaining (ms) each device computes from its own copy of the session + its own server clock, normalized to one instant. */
async function preciseRemaining(pages, sessionId) {
  const rows = await Promise.all(
    pages.map((p) =>
      p.evaluate(async (id) => {
        const { serverNow } = await import('/src/lib/gymLive/serverClock.ts');
        const { viewAt } = await import('/src/lib/gymLive/timeline.ts');
        const { getLiveSession } = await import('/src/lib/gymLive/service.ts');
        const s = (await getLiveSession(id)).data;
        const stamp = performance.timeOrigin + performance.now();
        const v = viewAt(s, serverNow());
        return { remaining: v.remainingMs, set: v.setIndex, phase: v.phase, stamp };
      }, sessionId)
    )
  );
  const ref = rows[0].stamp;
  return rows.map((r) => ({ ...r, normalized: r.remaining + (r.stamp - ref) }));
}
async function readHistoryEntry(page, sessionId) {
  return page.evaluate(async (id) => {
    const { getTrainingHistoryEntry } = await import('/src/lib/trainingHistory/service.ts');
    return getTrainingHistoryEntry(`gymlive__${id}`) ?? null;
  }, sessionId);
}
async function coachCreateViaUi(coach, gymId, { mode, students, technique, work, rest, sets }) {
  await goto(coach, `#/gym/admin/${gymId}`);
  await coach.waitForSelector('[data-testid="live-launcher"]');
  const modeLabel = { drill: '개인 훈련', pair: '2인 스파링', all: '전체 스파링' }[mode];
  await coach.locator(`[data-testid="live-launcher"] button.chip:has-text("${modeLabel}")`).click();
  await sleep(200);
  if (mode === 'all') {
    // 전체 선택 is applied by switching mode; deselect anyone not in `students`.
    for (const chip of await coach.locator('[data-testid="live-student-chip"]').all()) {
      const label = (await chip.textContent()) ?? '';
      const nick = label.replace(/^[●○]\s*/, '').trim();
      if (!students.includes(nick)) await chip.click();
    }
  } else {
    for (const nick of students) await coach.locator(`[data-testid="live-student-chip"]:has-text("${nick}")`).click();
  }
  if (technique) {
    await coach.locator('[data-testid="live-launcher"] input[placeholder^="기술/운동 검색"]').fill(technique);
    await sleep(300);
    await coach.locator('[data-testid="live-launcher"] button.chip:has-text("+ ")').first().click();
  }
  await coach.locator('[data-testid="live-work"]').fill(String(work));
  await coach.locator('[data-testid="live-rest"]').fill(String(rest));
  await coach.locator('[data-testid="live-sets"]').fill(String(sets));
  await coach.locator('[data-testid="live-create"]').click();
  await waitUntil(async () => (await coach.evaluate(() => location.hash)).startsWith('#/gym/admin/live/'));
  const hash = await coach.evaluate(() => location.hash);
  return hash.split('#/gym/admin/live/')[1];
}
async function coachAct(coach, label) {
  await coach.locator(`button:has-text("${label}")`).first().click();
  await sleep(300);
}
/** ms from `t0` until each page's phase label stops being `fromPhase` — how fast the coach's action reached each device. */
async function latencies(pages, fromPhase, t0, timeoutMs = 10000) {
  return Promise.all(
    pages.map(async (p) => {
      while (Date.now() - t0 < timeoutMs) {
        const t = await readTimer(p).catch(() => ({ phase: fromPhase }));
        if (t.phase && t.phase !== fromPhase) return Date.now() - t0;
        await sleep(50);
      }
      return Infinity;
    })
  );
}
const allOnLive = (pages, id) => waitUntil(async () => (await Promise.all(pages.map((p) => p.evaluate(() => location.hash)))).every((h) => h === `#/gym/live/${id}`), 20000);

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-gymlive-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env, timeout: 30000 });
  const mainWin = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  await mainWin.waitForLoadState('load');

  // ---------- accounts & gym ----------
  const coach = await signUp(await openDevice('coach'), 'QA코치');
  const names = ['민수', '준호', '지훈', '현우', '우진', '도윤', '서준', '준영'];
  const students = [];
  for (const n of names) students.push(await signUp(await openDevice(`s-${n}`), `QA${n}`));
  const outsider = await signUp(await openDevice('outsider'), 'QA외부인');
  const gym = await ev(coach.page, async ({ userId }) => {
    const { createGym } = await import('/src/lib/gymClass/service.ts');
    const r = await createGym('QA 실시간 체육관', userId, 'QA코치');
    return r.ok ? r.data : null;
  }, { userId: coach.userId });
  check('[0] 관장 가입 + 체육관 생성', !!gym);
  for (const s of students) {
    const ok = await ev(s.page, async ({ code, userId, nick }) => {
      const { joinGymByCode } = await import('/src/lib/gymClass/service.ts');
      return (await joinGymByCode(code, userId, nick)).ok;
    }, { code: gym.joinCode, userId: s.userId, nick: s.nickname });
    if (!ok) throw new Error('join failed ' + s.nickname);
  }
  check('[0b] 학생 8명 체육관 가입', true);
  const [A, B] = students;

  // ================= 1. 1명 실시간 훈련 =================
  const drillId = await coachCreateViaUi(coach.page, gym.id, { mode: 'drill', students: [A.nickname], technique: 'jab', work: 6, rest: 4, sets: 3 });
  check('[D1] 관장 UI로 1명 훈련 세션 생성 (READY)', !!drillId && (await waitUntil(async () => (await text(coach.page)).includes('READY'), 10000)));
  const appeared = await allOnLive([A.page], drillId);
  check('[D2] 학생이 아무 조작 없이 훈련 화면이 자동으로 열림', appeared, await A.page.evaluate(() => location.hash));
  await A.page.waitForSelector('[data-testid="live-timer-clock"]', { timeout: 15000 });
  const aReady = await readTimer(A.page);
  check('[D3] 학생 READY 표시: SET 1 / 3, 00:06 준비', aReady.set === 'SET 1 / 3' && aReady.clock === '00:06' && aReady.phase === '준비', JSON.stringify(aReady));
  // Clock skew: this student's device clock is 7s fast — the server offset must absorb it.
  await A.page.evaluate(async () => {
    const real = Date.now.bind(Date);
    Date.now = () => real() + 7000;
    const { syncServerClock } = await import('/src/lib/gymLive/serverClock.ts');
    await syncServerClock(3, true);
    // The app recovers through its own path: returning to the app (focus) forces a clock re-sync.
    window.dispatchEvent(new Event('focus'));
  });
  await sleep(1500);
  await coachAct(coach.page, '▶ 시작');
  await waitUntil(async () => (await readTimer(A.page)).phase === '훈련', 8000);
  await sleep(1300);
  let pr = await preciseRemaining([coach.page, A.page], drillId);
  check('[D4] 관장/학생(시계 +7초 틀어진 기기) 남은 시간 차이 < 400ms', Math.abs(pr[0].normalized - pr[1].normalized) < 400, JSON.stringify(pr));
  let [ct, at] = await Promise.all([readTimer(coach.page), readTimer(A.page)]);
  check('[D5] 화면 표시 일치 (세트/단계/시계 ±1초)', ct.set === at.set && ct.phase === at.phase && Math.abs(toSec(ct.clock) - toSec(at.clock)) <= 1, JSON.stringify({ ct, at }));
  await waitUntil(async () => (await readTimer(A.page)).phase === '휴식', 10000);
  [ct, at] = await Promise.all([readTimer(coach.page), readTimer(A.page)]);
  check('[D6] 자동으로 휴식 전환, 양쪽 동일 (SET 1 / 3 휴식)', ct.phase === '휴식' && at.phase === '휴식' && at.set === 'SET 1 / 3', JSON.stringify({ ct, at }));
  // pause/resume
  await waitUntil(async () => (await readTimer(A.page)).set === 'SET 2 / 3' && (await readTimer(A.page)).phase === '훈련', 10000);
  await coachAct(coach.page, '⏸ 일시정지');
  const pausedOk = await waitUntil(async () => (await readTimer(A.page)).phase.startsWith('일시정지'), 6000);
  const p1 = await readTimer(A.page);
  await sleep(2000);
  const p2 = await readTimer(A.page);
  check('[D7] 관장 일시정지 → 학생 타이머도 정지 (2초 후에도 같은 값)', pausedOk && p1.clock === p2.clock && p1.clock === (await readTimer(coach.page)).clock, JSON.stringify({ p1, p2 }));
  await coachAct(coach.page, '▶ 재개');
  await waitUntil(async () => (await readTimer(A.page)).phase === '훈련', 6000);
  pr = await preciseRemaining([coach.page, A.page], drillId);
  check('[D8] 재개 후 동일한 서버 기준으로 다시 진행', Math.abs(pr[0].normalized - pr[1].normalized) < 400 && pr[0].set === pr[1].set, JSON.stringify(pr));
  const doneOk = await waitUntil(async () => !!(await A.page.$('[data-testid="live-student-done"]')), 30000);
  const doneText = await text(A.page);
  check('[D9] 끝까지 진행 → 학생 화면 "훈련 완료 3 / 3 세트 완료 / 기록이 저장되었습니다."', doneOk && doneText.includes('훈련 완료') && doneText.includes('3 / 3 세트 완료') && (await waitUntil(async () => (await text(A.page)).includes('기록이 저장되었습니다'), 8000)), doneText.slice(0, 300));
  const entry = await readHistoryEntry(A.page, drillId);
  check(
    '[D10] 학생 개인 기록 자동 저장 (gym_class, 3/3, 세트당 6초, 휴식 4초, completed)',
    entry && entry.source === 'gym_class' && entry.gymLive.status === 'completed' && entry.gymLive.completedSets === 3 && entry.gymLive.coachUserId === coach.userId &&
      JSON.stringify(entry.exerciseDetails[0].actualSeconds) === '[6,6,6]' && entry.exerciseDetails[0].restSeconds === 4 && entry.completed === true,
    JSON.stringify(entry)
  );
  const stats = await A.page.evaluate(async (tid) => {
    const { computeTrainingReport } = await import('/src/lib/trainingAnalytics/report.ts');
    const r = computeTrainingReport('7d');
    return r.topTechniques.find((t) => t.techniqueId === tid)?.count ?? 0;
  }, entry?.techniqueIds?.[0]);
  check('[D11] 가장 많이 훈련한 기술 통계에 1회 반영', stats === 1, String(stats));
  await A.page.evaluate(() => location.reload());
  await A.page.waitForLoadState('load');
  await sleep(2500);
  const afterReload = await A.page.evaluate(async (id) => {
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    return listTrainingHistory().filter((e) => e.gymLive?.sessionId === id).length;
  }, drillId);
  check('[D12] 재방문/재시도해도 기록 중복 없음 (1건)', afterReload === 1, String(afterReload));
  const coachSees = await waitUntil(async () => (await text(coach.page)).includes('기록 저장됨'), 10000);
  check('[D13] 관장 화면에 "기록 저장됨" 표시', coachSees);

  // ---------- 중단(INTERRUPTED) + 중복 세션 ----------
  const intId = await coachCreateViaUi(coach.page, gym.id, { mode: 'drill', students: [A.nickname], technique: 'jab', work: 6, rest: 2, sets: 5 });
  await allOnLive([A.page], intId);
  const dup = await ev(coach.page, async ({ gymId, a }) => {
    const { createLiveSession } = await import('/src/lib/gymLive/service.ts');
    return createLiveSession({ gymId, kind: 'drill', title: 'Cross', techniqueId: null, techniqueName: 'Cross', martialArt: 'boxing', workSeconds: 10, restSeconds: 5, totalSets: 2, students: [a] });
  }, { gymId: gym.id, a: { userId: A.userId, nickname: A.nickname } });
  check('[X1] 진행 중인 학생에게 새 세션 → "이미 진행 중인 훈련" 거부', !dup.ok && dup.busyNicknames?.includes(A.nickname), JSON.stringify(dup));
  await goto(coach.page, `#/gym/admin/live/${intId}`);
  await coachAct(coach.page, '▶ 시작');
  await waitUntil(async () => (await readTimer(A.page)).set === 'SET 2 / 3' || (await readTimer(A.page)).set === 'SET 2 / 5', 15000);
  await sleep(1500);
  await coachAct(coach.page, '■ 종료');
  await waitUntil(async () => !!(await A.page.$('[data-testid="live-student-done"]')), 10000);
  await waitUntil(async () => !!(await readHistoryEntry(A.page, intId)), 10000);
  const intEntry = await readHistoryEntry(A.page, intId);
  check('[X2] 관장이 SET 2 도중 종료 → INTERRUPTED, 완료 1/5 (안 한 세트는 완료 아님)', intEntry?.gymLive.status === 'interrupted' && intEntry.gymLive.completedSets === 1 && (await text(A.page)).includes('1 / 5 세트 완료'), JSON.stringify(intEntry?.gymLive));
  // replace flow: active session for A, then coach confirms replacement
  const r1 = await ev(coach.page, async ({ gymId, a }) => {
    const { createLiveSession } = await import('/src/lib/gymLive/service.ts');
    const first = await createLiveSession({ gymId, kind: 'drill', title: 'Hook', techniqueId: null, techniqueName: 'Hook', martialArt: 'boxing', workSeconds: 10, restSeconds: 5, totalSets: 2, students: [a] });
    const second = await createLiveSession({ gymId, kind: 'drill', title: 'Cross', techniqueId: null, techniqueName: 'Cross', martialArt: 'boxing', workSeconds: 10, restSeconds: 5, totalSets: 2, students: [a], replaceActive: true });
    const { getLiveSession } = await import('/src/lib/gymLive/service.ts');
    return { firstStatus: (await getLiveSession(first.data.id)).data.status, second: second.ok ? second.data.id : null };
  }, { gymId: gym.id, a: { userId: A.userId, nickname: A.nickname } });
  check('[X3] 관장이 확인 후 새 세션 → 기존 세션 종료(CANCELLED, 시작 전이었음) + 새 세션 생성 (동시 참가 없음)', r1.firstStatus === 'cancelled' && !!r1.second, JSON.stringify(r1));
  await ev(coach.page, async (id) => (await import('/src/lib/gymLive/service.ts')).controlLiveSession(id, 'cancel'), r1.second);

  // ================= 2. 2명 스파링 + 네트워크 =================
  const pairId = await coachCreateViaUi(coach.page, gym.id, { mode: 'pair', students: [A.nickname, B.nickname], work: 8, rest: 4, sets: 3 });
  check('[P1] 두 학생 모두 자동으로 스파링 화면 열림', await allOnLive([A.page, B.page], pairId));
  const aOpp = await A.page.evaluate(() => document.querySelector('[data-testid="live-title"]')?.textContent);
  const tStart = Date.now();
  await coach.page.locator('button:has-text("▶ 시작")').first().click();
  const lat = await latencies([A.page, B.page], '준비', tStart);
  console.log('LATENCY start→student screens (ms):', JSON.stringify(lat));
  check('[P0] 관장 시작 → 두 학생 화면 반영 지연 < 2초 (Realtime)', lat.every((ms) => ms < 2000), JSON.stringify(lat));
  const [ta, tb] = await Promise.all([text(A.page), text(B.page)]);
  check('[P2b] 실시간 훈련 화면은 다른 팝업(백업 안내 등)으로 가려지지 않음', !(await A.page.$('.modal-overlay')) && !(await B.page.$('.modal-overlay')));
  check('[P2] 각자 상대 표시 (민수 화면: 준호, 준호 화면: 민수), SPARRING ROUND 1 / 3', aOpp === 'SPARRING' && ta.includes(B.nickname) && tb.includes(A.nickname) && (await readTimer(A.page)).set === 'ROUND 1 / 3', JSON.stringify({ ta: ta.slice(0, 120), tb: tb.slice(0, 120) }));
  await sleep(1000);
  pr = await preciseRemaining([coach.page, A.page, B.page], pairId);
  check('[P3] 관장/학생A/학생B 남은 시간 차이 < 400ms', Math.max(...pr.map((r) => r.normalized)) - Math.min(...pr.map((r) => r.normalized)) < 400, JSON.stringify(pr));
  // Network drop on B: coach pauses while B is offline; B recovers to the authoritative state.
  const cdpB = await B.page.context().newCDPSession(B.page);
  await cdpB.send('Network.enable');
  await cdpB.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await coachAct(coach.page, '⏸ 일시정지');
  await sleep(2500);
  const coachPaused = await readTimer(coach.page);
  await cdpB.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await B.page.evaluate(() => window.dispatchEvent(new Event('online')));
  const recovered = await waitUntil(async () => (await readTimer(B.page)).phase.startsWith('일시정지') && (await readTimer(B.page)).clock === coachPaused.clock, 12000);
  check('[N1] 학생 연결 끊김 중 관장 일시정지 → 재연결 시 서버 상태(일시정지, 같은 시간)로 복구', recovered, JSON.stringify({ b: await readTimer(B.page), coachPaused }));
  await coachAct(coach.page, '▶ 재개');
  // Reload (재접속) and freeze (백그라운드) on A.
  await A.page.evaluate(() => location.reload());
  await A.page.waitForLoadState('load');
  await waitUntil(async () => (await readTimer(A.page)).phase === 'SPARRING' || (await readTimer(A.page)).phase === '휴식', 10000);
  pr = await preciseRemaining([coach.page, A.page], pairId);
  check('[N2] 학생 앱 재접속(새로고침) 후 진행 중 세션 그대로 복구', (await A.page.evaluate(() => location.hash)) === `#/gym/live/${pairId}` && Math.abs(pr[0].normalized - pr[1].normalized) < 400, JSON.stringify(pr));
  const cdpA = await A.page.context().newCDPSession(A.page);
  await cdpA.send('Page.setWebLifecycleState', { state: 'frozen' });
  await sleep(3000);
  await cdpA.send('Page.setWebLifecycleState', { state: 'active' });
  await sleep(700);
  [ct, at] = await Promise.all([readTimer(coach.page), readTimer(A.page)]);
  check('[N3] 앱 백그라운드(페이지 동결 3초) 후에도 타이머 일치', ct.set === at.set && Math.abs(toSec(ct.clock) - toSec(at.clock)) <= 1, JSON.stringify({ ct, at }));
  // Skip deliberately in the middle of a ROUND (not during REST) → that round must not count.
  await waitUntil(async () => {
    const t = await readTimer(coach.page);
    return t.phase === 'SPARRING' && toSec(t.clock) >= 3 && t.set !== 'ROUND 3 / 3';
  }, 20000);
  const skippedAt = await readTimer(coach.page);
  await coachAct(coach.page, '⏭ 다음 라운드');
  await waitUntil(async () => (await readTimer(A.page)).set !== skippedAt.set, 8000);
  const pairDone = await waitUntil(async () => !!(await A.page.$('[data-testid="live-student-done"]')) && !!(await B.page.$('[data-testid="live-student-done"]')), 60000);
  check('[P4] 두 학생 모두 스파링 종료 화면', pairDone);
  await waitUntil(async () => !!(await readHistoryEntry(B.page, pairId)), 10000);
  const [ea, eb] = await Promise.all([readHistoryEntry(A.page, pairId), readHistoryEntry(B.page, pairId)]);
  const spRec = await B.page.evaluate(async (id) => (await import('/src/lib/sparringSession/service.ts')).getSparringSession(`gymlive__${id}`) ?? null, pairId);
  check('[P5] 두 학생 모두 스파링 기록 저장 (상대 이름 포함, sparring_session)', ea?.source === 'sparring_session' && eb?.source === 'sparring_session' && eb.notes.includes(A.nickname) && spRec?.partnerName === A.nickname && spRec.gymLive?.sessionId === pairId, JSON.stringify({ eb, spRec }));
  check('[P6] 라운드 도중 관장이 다음 라운드로 넘김 → 그 라운드는 미완료 (2/3, INTERRUPTED)', ea && ea.gymLive.completedSets === 2 && ea.gymLive.status === 'interrupted' && eb?.gymLive.completedSets === 2, JSON.stringify(ea?.gymLive));

  // ================= 3. 전체 학생 8명 =================
  const allId = await coachCreateViaUi(coach.page, gym.id, { mode: 'all', students: students.map((s) => s.nickname), work: 5, rest: 3, sets: 3 });
  check('[A1] 8명 전원 자동으로 스파링 화면 열림', await allOnLive(students.map((s) => s.page), allId));
  const coachParts = await ev(coach.page, async (id) => (await import('/src/lib/gymLive/service.ts')).listLiveParticipants(id).then((r) => r.data), allId);
  let wellFormed = true;
  let consecutive = 0;
  for (let r = 1; r <= 3; r++) {
    const opp = new Map(coachParts.map((p) => [p.userId, p.pairings.find((x) => x.round === r)?.opponentUserId]));
    for (const [u, o] of opp) if (!o || opp.get(o) !== u) wellFormed = false;
    if (r > 1) for (const p of coachParts) if (p.pairings.find((x) => x.round === r)?.opponentUserId === p.pairings.find((x) => x.round === r - 1)?.opponentUserId) consecutive++;
  }
  check('[A2] 라운드마다 8명이 서로 짝지어진 2인 매칭 (대칭)', wellFormed);
  check('[A3] 같은 상대와 연속 대결 0회', consecutive === 0, String(consecutive));
  const ownRows = await Promise.all(students.map((s) => ev(s.page, async (id) => (await import('/src/lib/gymLive/service.ts')).listLiveParticipants(id).then((r) => r.data.length), allId)));
  check('[A4] 각 학생은 자기 참가 행(자기 매칭)만 조회 가능 (다른 매치 비공개)', ownRows.every((n) => n === 1), JSON.stringify(ownRows));
  const tAll = Date.now();
  await coach.page.locator('button:has-text("▶ 시작")').first().click();
  const latAll = await latencies(students.map((s) => s.page), '준비', tAll);
  console.log('LATENCY start→8 student screens (ms):', JSON.stringify(latAll));
  check('[A4b] 관장 시작 → 8명 화면 반영 지연 < 2초 (Realtime)', latAll.every((ms) => ms < 2000), JSON.stringify(latAll));
  await sleep(500);
  const shown = await Promise.all(students.map((s) => text(s.page)));
  const expectedOpp = students.map((s) => coachParts.find((p) => p.userId === s.userId).pairings.find((x) => x.round === 1).opponentNickname);
  check('[A5] 각 학생 화면에 자기 상대만 표시 (ROUND 1)', shown.every((t, i) => t.includes(expectedOpp[i])), JSON.stringify(expectedOpp));
  const matchCard = await text(coach.page);
  check('[A6] 관장 화면: ROUND 1 매칭 목록 4경기 + 진행 중', (matchCard.match(/ vs /g) ?? []).length >= 4 && matchCard.includes('● 진행 중'));
  if (SHOT_DIR) await coach.page.screenshot({ path: path.join(SHOT_DIR, 'live-coach-all.png'), fullPage: true });
  if (SHOT_DIR) await students[0].page.screenshot({ path: path.join(SHOT_DIR, 'live-student.png') });
  pr = await preciseRemaining([coach.page, ...students.map((s) => s.page)], allId);
  check('[A7] 관장 + 8명 모든 기기 타이머 차이 < 500ms', Math.max(...pr.map((r) => r.normalized)) - Math.min(...pr.map((r) => r.normalized)) < 500, JSON.stringify(pr.map((r) => Math.round(r.normalized))));
  await waitUntil(async () => (await readTimer(students[3].page)).set === 'ROUND 2 / 3' && (await readTimer(students[3].page)).phase === 'SPARRING', 15000);
  const r2 = await text(students[3].page);
  const r2Exp = coachParts.find((p) => p.userId === students[3].userId).pairings.find((x) => x.round === 2).opponentNickname;
  check('[A8] ROUND 2에 새 상대로 자동 재매칭 표시', r2.includes(r2Exp), r2Exp);
  const allDone = await waitUntil(async () => (await Promise.all(students.map((s) => s.page.$('[data-testid="live-student-done"]')))).every(Boolean), 40000);
  check('[A9] 8명 모두 완료 화면', allDone);
  await waitUntil(async () => (await Promise.all(students.map((s) => readHistoryEntry(s.page, allId)))).every(Boolean), 15000);
  const allEntries = await Promise.all(students.map((s) => readHistoryEntry(s.page, allId)));
  check('[A10] 8명 모두 개인 스파링 기록 저장 (3/3 라운드, 자기 상대 3명)', allEntries.every((e) => e && e.gymLive.completedSets === 3 && e.gymLive.status === 'completed' && e.gymLive.opponents.filter(Boolean).length === 3), JSON.stringify(allEntries.map((e) => e?.gymLive)));

  // ================= 4. 홀수 5명 =================
  const five = students.slice(0, 5);
  const oddId = await coachCreateViaUi(coach.page, gym.id, { mode: 'all', students: five.map((s) => s.nickname), work: 5, rest: 2, sets: 5 });
  await allOnLive(five.map((s) => s.page), oddId);
  const oddParts = await ev(coach.page, async (id) => (await import('/src/lib/gymLive/service.ts')).listLiveParticipants(id).then((r) => r.data), oddId);
  const byesPerRound = [1, 2, 3, 4, 5].map((r) => oddParts.filter((p) => !p.pairings.find((x) => x.round === r)?.opponentUserId).map((p) => p.nickname));
  const byeCounts = new Map();
  byesPerRound.flat().forEach((n) => byeCounts.set(n, (byeCounts.get(n) ?? 0) + 1));
  check('[O1] 5명: 라운드마다 정확히 1명 대기', byesPerRound.every((b) => b.length === 1), JSON.stringify(byesPerRound));
  check('[O2] 5라운드 동안 5명이 1번씩 대기 (특정 학생만 계속 쉬지 않음, 연속 대기 없음)', byeCounts.size === 5 && [...byeCounts.values()].every((c) => c === 1) && byesPerRound.every((b, i) => i === 0 || b[0] !== byesPerRound[i - 1][0]), JSON.stringify(byesPerRound));
  await coachAct(coach.page, '▶ 시작');
  await sleep(1200);
  const byeStudent = five.find((s) => s.nickname === byesPerRound[0][0]);
  check('[O3] 대기 학생 화면: "이번 라운드 대기"', (await text(byeStudent.page)).includes('이번 라운드 대기'));
  await waitUntil(async () => (await Promise.all(five.map((s) => s.page.$('[data-testid="live-student-done"]')))).every(Boolean), 60000);
  await waitUntil(async () => (await Promise.all(five.map((s) => readHistoryEntry(s.page, oddId)))).every(Boolean), 15000);
  const oddEntries = await Promise.all(five.map((s) => readHistoryEntry(s.page, oddId)));
  check('[O4] 홀수 기록: 대기 라운드는 스파링 횟수에서 제외 (각자 4/4 라운드)', oddEntries.every((e) => e && e.gymLive.completedSets === 4), JSON.stringify(oddEntries.map((e) => e?.gymLive.completedSets)));

  // ================= 5. 권한 =================
  const perm = await ev(A.page, async ({ gymId, bId, allId }) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const create = await supabase.rpc('gym_live_create', { p_id: 'gymlive_hack', p_gym_id: gymId, p_kind: 'drill', p_title: 'x', p_technique_id: null, p_technique_name: null, p_martial_art: null, p_work_seconds: 10, p_rest_seconds: 5, p_total_sets: 1, p_participants: [{ userId: bId, nickname: 'x', pairings: [] }], p_replace_active: false });
    const control = await supabase.rpc('gym_live_control', { p_id: allId, p_action: 'start' });
    const insert = await supabase.from('gym_live_sessions').insert({ id: 'gymlive_hack2', gym_id: gymId, coach_user_id: bId, kind: 'drill', title: 'x', work_seconds: 10, rest_seconds: 5, total_sets: 1 });
    const update = await supabase.from('gym_live_sessions').update({ status: 'completed' }).eq('id', allId).select();
    const history = await supabase.from('training_history').select('id').eq('user_id', bId);
    return { create: !!create.error, control: !!control.error, insert: !!insert.error, updateRows: update.data?.length ?? 0, historyRows: history.data?.length ?? 0 };
  }, { gymId: gym.id, bId: B.userId, allId });
  check('[S1] 학생은 세션 생성 불가 (gym_live_create 거부)', perm.create);
  check('[S2] 학생은 세션 제어 불가 (gym_live_control 거부)', perm.control);
  check('[S3] 테이블 직접 쓰기 불가 (insert 거부, update 0행)', perm.insert && perm.updateRows === 0, JSON.stringify(perm));
  check('[S4] 학생 A는 학생 B의 훈련 기록 조회 불가 (0행)', perm.historyRows === 0, JSON.stringify(perm));
  const out = await ev(outsider.page, async (ids) => {
    const { getLiveSession, listLiveParticipants } = await import('/src/lib/gymLive/service.ts');
    const s = await Promise.all(ids.map((id) => getLiveSession(id)));
    const p = await Promise.all(ids.map((id) => listLiveParticipants(id)));
    return { sessions: s.filter((r) => r.ok && r.data).length, parts: p.reduce((n, r) => n + (r.ok ? r.data.length : 0), 0) };
  }, [drillId, pairId, allId, oddId]);
  check('[S5] 다른 체육관/외부 사용자는 세션·참가자 조회 불가', out.sessions === 0 && out.parts === 0, JSON.stringify(out));

  const errs = [coach, ...students, outsider].flatMap((d) => d.page.__errors.map((e) => `${d.nickname}: ${e}`));
  check('[Z] 모든 기기 페이지 에러 없음', errs.length === 0, errs.join(' | '));
  await app.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  console.log(`Test accounts: mdx.qa.live.*.${STAMP}@example.com (delete from Supabase dashboard if desired)`);
  process.exit(failed.length ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  await app?.close().catch(() => {});
  process.exit(1);
});
