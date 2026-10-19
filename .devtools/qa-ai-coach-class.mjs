// AI 코치 수업 (집/체육관) + 배운 기술 + 다중 숙련도 변경 — real Electron app,
// real Gemini calls, real MARTIALDEX technique ids (no mocks).
// Scenarios A(집) B(체육관) C(배운 기술) D(검색/필터) E(다중 숙련도)
// F(AI 코치 연동) + session/Day-start integration.
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

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-cc-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.waitForLoadState('load');
  await sleep(800);
  const goto = async (hash) => {
    await page.evaluate(() => { window.location.hash = '#/'; });
    await sleep(300);
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    await sleep(1100);
  };
  // Techniques merged into one canonical record (e.g. boxing + kickboxing Jab)
  // are identified by their canonical id; the seed below still writes the
  // OLD ids on purpose (that is how existing users' data looks).
  const ID = await page.evaluate(async (ids) => {
    const c = await import('/src/lib/techniqueCanonical/index.ts');
    return Object.fromEntries(ids.map((id) => [id, c.canonicalTechniqueId(id)]));
  }, ['boxing__jab', 'boxing__cross', 'boxing__hook', 'boxing__uppercut', 'bjj__armbar', 'bjj__triangle', 'boxing__lateral-step', 'boxing__pivot']);
  const rows = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="learned-row"]')].map((r) => ({ id: r.dataset.techniqueId, status: r.dataset.status })));

  // ---------- Seed real learning history ----------
  // boxing jab/cross/hook/uppercut practiced (completed), bjj armbar practiced but stopped early,
  // bjj triangle known only via a user-set mastery (override), hook practiced then set back to 미학습,
  // bjj scissor-sweep override 미학습 only (never learned → must NOT appear).
  await page.evaluate(async () => {
    const h = await import('/src/lib/trainingHistory/service.ts');
    const o = await import('/src/lib/skillProgress/overrideStore.ts');
    h.recordTrainingSession({ curriculumId: null, dayNumber: null, techniqueIds: ['boxing__jab', 'boxing__cross'], completed: true, estimatedMinutes: 20, source: 'free_training' });
    h.recordTrainingSession({ curriculumId: null, dayNumber: null, techniqueIds: ['boxing__hook', 'boxing__uppercut', 'boxing__jab'], completed: true, estimatedMinutes: 20, source: 'free_training' });
    h.recordTrainingSession({ curriculumId: null, dayNumber: null, techniqueIds: ['bjj__armbar'], completed: false, estimatedMinutes: 10, source: 'free_training' });
    o.setOverride('bjj__triangle', 'average');
    o.setOverride('boxing__hook', 'not_started');
    o.setOverride('bjj__scissor-sweep', 'not_started');
  });
  const EXPECTED = [ID['boxing__jab'], ID['boxing__cross'], ID['boxing__hook'], ID['boxing__uppercut'], ID['bjj__armbar'], ID['bjj__triangle']];

  // ================= C. 배운 기술 =================
  await goto('#/learned-techniques');
  let r = await rows();
  check('[C1] "배운 기술"에 과거에 학습한 기술이 모두 표시됨 (6개)', EXPECTED.every((id) => r.some((x) => x.id === id)) && r.length === EXPECTED.length, r);
  check('[C2] 숙련도와 관계없이 표시 — 배웠다가 미학습으로 바꾼 Hook도 포함', r.find((x) => x.id === ID['boxing__hook'])?.status === 'not_started', r.find((x) => x.id === ID['boxing__hook']));
  check('[C3] 연습 기록 없이 미학습만 지정된 기술은 제외 (Scissor Sweep)', !r.some((x) => x.id === 'bjj__scissor-sweep'));
  check('[C4] 중간에 멈춘 연습(Armbar)도 배운 기술로 포함', r.some((x) => x.id === ID['bjj__armbar']));
  const total = await page.locator('[data-testid="learned-total"]').textContent();
  check('[C5] 배운 기술 개수 표시', total.trim() === '6', total);
  await page.locator('button', { hasText: /^메뉴/ }).first().click();
  await sleep(300);
  const menu = await page.evaluate(() => [...document.querySelectorAll('a')].some((a) => a.textContent.trim() === '배운 기술' && a.getAttribute('href')?.includes('/learned-techniques')));
  check('[C6] 메뉴에 "배운 기술" 링크', menu);
  await page.keyboard.press('Escape');
  await page.locator('button', { hasText: /^메뉴/ }).first().click().catch(() => {});

  // ================= D. 검색 / 필터 =================
  await page.locator('[data-testid="learned-art-filter"] button[data-art="boxing"]').click();
  await sleep(300);
  r = await rows();
  check('[D1] 무술 필터(복싱) → 복싱 기술만', r.length === 4 && r.every((x) => [ID['boxing__jab'], ID['boxing__cross'], ID['boxing__hook'], ID['boxing__uppercut']].includes(x.id)), r);
  await page.locator('[data-testid="learned-art-filter"] button', { hasText: '전체' }).first().click();
  await page.locator('[data-testid="learned-status-filter"]').selectOption('average');
  await sleep(300);
  r = await rows();
  check('[D2] 숙련도 필터(보통) → 보통인 기술만', r.length >= 1 && r.every((x) => x.status === 'average') && r.some((x) => x.id === ID['bjj__triangle']), r);
  await page.locator('[data-testid="learned-status-filter"]').selectOption('');
  await page.locator('[data-testid="learned-search"]').fill('JAB');
  await sleep(300);
  r = await rows();
  check('[D3] 기술명 검색(대소문자 무관) "JAB" → Jab만', r.length === 1 && r[0].id === ID['boxing__jab'], r);
  await page.locator('[data-testid="learned-search"]').fill('');
  await sleep(200);
  const detailHref = await page.locator(`[data-testid="learned-row"][data-technique-id="${ID['boxing__cross']}"] [data-testid="learned-detail-link"]`).getAttribute('href');
  check('[D4] 기술 카드 → 기술 상세 페이지 링크', detailHref?.includes(`/techniques/${ID['boxing__cross']}`), detailHref);

  // ================= E. 다중 숙련도 변경 =================
  const selCount = () => page.locator('[data-testid="learned-selected-count"]').textContent();
  await page.locator(`[data-testid="learned-row"][data-technique-id="${ID['boxing__jab']}"] .technique-row__main`).click();
  await page.locator(`[data-testid="learned-row"][data-technique-id="${ID['boxing__cross']}"] input[type="checkbox"]`).check();
  check('[E1] 개별 선택 + 선택 개수 표시', (await selCount()).includes('선택 2개'), await selCount());
  await page.locator(`[data-testid="learned-row"][data-technique-id="${ID['boxing__jab']}"] input[type="checkbox"]`).uncheck();
  check('[E2] 개별 선택 해제', (await selCount()).includes('선택 1개'), await selCount());
  await page.locator('[data-testid="learned-select-all"]').check();
  check('[E3] 전체 선택', (await selCount()).includes('선택 6개'), await selCount());
  await page.locator('[data-testid="learned-select-all"]').uncheck();
  check('[E4] 전체 선택 해제', (await selCount()).includes('선택 0개'), await selCount());
  // Filter state + select-all = only the visible (boxing) rows.
  await page.locator('[data-testid="learned-art-filter"] button[data-art="boxing"]').click();
  await sleep(200);
  await page.locator('[data-testid="learned-select-all"]').check();
  check('[E5] 필터 상태에서 전체 선택 → 보이는 4개만 선택', (await selCount()).includes('선택 4개'), await selCount());
  await page.locator('[data-testid="learned-bulk-change"]').click();
  await page.locator('[data-testid="learned-bulk-option-proficient"]').click();
  const confirmText = await page.locator('[data-testid="learned-bulk-confirm"]').textContent();
  check('[E6] 변경 전 확인 문구', confirmText.includes("4개 기술의 숙련도를 '숙련'(으)로 변경하시겠습니까?"), confirmText);
  await page.locator('[data-testid="learned-bulk-cancel"]').click();
  await page.locator('[data-testid="learned-bulk-sheet"]').waitFor();
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5); // close sheet via overlay
  await sleep(300);
  let ov = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:skill-status-overrides') || '{}'));
  check('[E7] 취소 시 아무것도 바뀌지 않음', ov[ID['boxing__jab']] === undefined && ov[ID['boxing__hook']] === 'not_started', ov);
  await page.locator('[data-testid="learned-bulk-change"]').click();
  await page.locator('[data-testid="learned-bulk-option-proficient"]').click();
  await page.locator('[data-testid="learned-bulk-apply"]').click();
  await sleep(400);
  const toast = await page.locator('[data-testid="learned-toast"]').textContent().catch(() => '');
  check('[E8] 저장 완료 피드백', toast.includes("4개 기술의 숙련도를 '숙련'(으)로 변경했습니다"), toast);
  ov = await page.evaluate(() => JSON.parse(localStorage.getItem('martialdex:skill-status-overrides') || '{}'));
  r = await rows();
  check(
    '[E9] 선택한 4개 기술 모두 숙련으로 일괄 저장 (기존 override 저장소/MasteryStatus 그대로)',
    [ID['boxing__jab'], ID['boxing__cross'], ID['boxing__hook'], ID['boxing__uppercut']].every((id) => ov[id] === 'proficient') && r.every((x) => x.status === 'proficient') && ov[ID['bjj__triangle']] === 'average',
    { ov, r }
  );
  check('[E10] 변경 후 선택 초기화', (await selCount()).includes('선택 0개'), await selCount());
  // 자동 계산으로 되돌리기 on armbar (override absent → stays computed), on triangle (override → cleared → leaves list since only override made it learned).
  await page.locator('[data-testid="learned-art-filter"] button', { hasText: '전체' }).first().click();
  await sleep(200);
  await page.locator(`[data-testid="learned-row"][data-technique-id="${ID['bjj__triangle']}"] input[type="checkbox"]`).check();
  await page.locator('[data-testid="learned-bulk-change"]').click();
  await page.locator('[data-testid="learned-bulk-option-learning"]').click();
  await page.locator('[data-testid="learned-bulk-apply"]').click();
  await sleep(300);
  r = await rows();
  check('[E11] 다른 숙련도로 다시 변경 (Triangle → 학습 중)', r.find((x) => x.id === ID['bjj__triangle'])?.status === 'learning', r);
  await goto('#/arts/boxing/techniques/boxing__jab');
  const detailText = await page.evaluate(() => document.body.innerText);
  check('[E12] 기술 상세의 숙련도도 같은 값(숙련)으로 표시 — 기존 숙련도 시스템과 호환', /숙련/.test(detailText) && detailText.includes('숙련도 변경'), detailText.match(/.{0,30}숙련.{0,30}/)?.[0]);

  // ================= Validation (deterministic, code-level) =================
  const v = await page.evaluate(async (ID) => {
    const s = await import('/src/lib/aiCoachCurriculum/service.ts');
    const input = { martialArt: 'boxing', location: 'home', equipment: [], goal: '', sessionMinutes: 30, days: 1 };
    const learned = new Set([ID['boxing__jab'], ID['boxing__cross']]);
    const fresh = new Set([ID['boxing__lateral-step'], ID['boxing__pivot']]);
    const drills = new Set();
    const out = s.validatePlanDay(
      [
        { techniqueId: 'boxing__made-up-punch', role: 'review', instruction: 'x', minutes: 5 },
        { techniqueId: ID['boxing__lateral-step'], role: 'review', instruction: 'not learned as review', minutes: 5 },
        { techniqueId: ID['boxing__jab'], role: 'review', instruction: '파트너와 주고받기', minutes: 5, needsPartner: true },
        { techniqueId: ID['boxing__cross'], role: 'review', instruction: '파트너 미트', minutes: 5, needsPartner: true, soloAlternative: '혼자 섀도로 크로스 반복' },
        { techniqueId: ID['boxing__lateral-step'], role: 'new', instruction: '새 기술', minutes: 5 },
        { techniqueId: ID['boxing__pivot'], role: 'new', instruction: '두 번째 새 기술', minutes: 5 },
      ],
      input,
      learned,
      fresh,
      drills
    );
    return { ids: out.items.map((i) => `${i.role}:${i.techniqueId}:${i.needsPartner}`), dropped: out.dropped, crossInstr: out.items.find((i) => i.techniqueId === ID['boxing__cross'])?.instruction };
  }, ID);
  check(
    '[V1] AI 결과 검증: 없는 기술·역할 위반·집에서 대안 없는 파트너 동작·하루 2번째 새 기술 제외, 대안은 솔로로 대체',
    v.dropped === 4 && v.ids.join(',') === `review:${ID['boxing__cross']}:false,new:${ID['boxing__lateral-step']}:false` && v.crossInstr === '혼자 섀도로 크로스 반복',
    v
  );

  // ================= A. 집 =================
  await goto('#/coach');
  await page.locator('[data-testid="coach-class-entry"] a', { hasText: 'AI 코치 수업 시작' }).click();
  await sleep(800);
  const pickerText = await page.locator('[data-testid="coach-location-picker"]').textContent();
  check('[A0] AI 코치 수업 시작 전 "오늘 어디에서 운동할까요?" + 집/체육관 두 가지', pickerText.includes('오늘 어디에서 운동할까요?') && pickerText.includes('집에서 운동') && pickerText.includes('체육관에서 운동'), pickerText);
  await page.locator('[data-testid="coach-location-home"]').click();
  await page.locator('[data-testid="coach-location-confirm"]').click();
  const art = await page.locator('[data-testid="coach-class-art"]').inputValue();
  check('[A1] 배운 기술이 가장 많은 무술(복싱)이 기본 선택', art === 'boxing', art);
  const learnedLine = await page.locator('[data-testid="coach-class-learned"]').textContent();
  check('[F1] 설정 화면에 배운 기술·숙련도 요약 (일괄 변경한 숙련 반영)', learnedLine.includes('배운 기술 4개') && learnedLine.includes('숙련 4'), learnedLine);
  // The exact context the AI receives (same function generate uses).
  const ctxHome = await page.evaluate(async () => {
    const s = await import('/src/lib/aiCoachCurriculum/service.ts');
    const p = await import('/src/lib/aiCoachCurriculum/profile.ts');
    const input = { martialArt: 'boxing', location: 'home', equipment: [], goal: '잽 크로스 연결 다듬기', sessionMinutes: 30, days: 3 };
    const prof = p.buildLearnerProfile('boxing');
    return s.buildPlanContext(input, prof, s.newTechniquePool(prof), s.drillPool('home', []));
  });
  check(
    '[F2] AI 컨텍스트에 장소·목표·배운 기술·기술별 숙련도·시간 포함',
    ctxHome.includes('운동 장소: 집 (home)') && ctxHome.includes('잽 크로스 연결 다듬기') && new RegExp(`${ID['boxing__jab']} \\| Jab.*숙련도: 숙련`).test(ctxHome) && ctxHome.includes('하루 30분, 총 3일') && !ctxHome.includes('bjj__armbar |'),
    ctxHome.slice(0, 600)
  );
  await page.locator('[data-testid="coach-class-goal"]').fill('잽 크로스 연결 다듬기');
  await page.locator('button', { hasText: '20분' }).click();
  await page.locator('button', { hasText: '3일' }).click();
  await page.locator('[data-testid="coach-class-generate"]').click();
  await page.locator('[data-testid="coach-class-result"]').waitFor({ timeout: 90000 });
  const home = await page.evaluate(async () => {
    const el = document.querySelector('[data-testid="coach-class-result"]');
    const { getCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
    const c = getCurriculum(el.dataset.curriculumId);
    const steps = c.days.flatMap((d) => d.coachPlan.map((i) => ({ ...i, day: d.day, art: resolveTechnique(i.techniqueId)?.martialArt ?? null })));
    return { source: el.dataset.source, id: c.id, art: c.martialArt, meta: c.aiCoachMeta, days: c.days.length, steps, newPerDay: c.days.map((d) => d.coachPlan.filter((i) => i.role === 'new').length) };
  });
  const learnedBoxing = [ID['boxing__jab'], ID['boxing__cross'], ID['boxing__hook'], ID['boxing__uppercut']];
  check('[A2] 집 커리큘럼 생성됨 (AI가 구성)', home.source === 'ai' && home.days === 3 && home.meta.location === 'home', { source: home.source, days: home.days });
  check('[A3] 모든 단계가 실제 MARTIALDEX DB 기술/운동', home.steps.length > 0 && home.steps.every((s) => s.art !== null), home.steps.map((s) => s.techniqueId));
  check('[A4] 집: 파트너가 필요한 단계 없음', home.steps.every((s) => s.needsPartner === false), home.steps.filter((s) => s.needsPartner));
  check('[A5] 복습·연결·응용은 배운 기술만 사용, 새 기술은 하루 최대 1개', home.steps.filter((s) => ['review', 'connection', 'application'].includes(s.role)).every((s) => learnedBoxing.includes(s.techniqueId)) && home.newPerDay.every((n) => n <= 1), {
    review: home.steps.filter((s) => s.role !== 'warmup' && s.role !== 'conditioning').map((s) => `${s.role}:${s.techniqueId}`),
    newPerDay: home.newPerDay,
  });
  check('[A6] 배운 기술을 우선 활용 (복습/연결 단계 존재)', home.steps.some((s) => ['review', 'connection'].includes(s.role)));
  check('[A7] 드릴은 장비 없이 가능한 실제 홈트 운동', home.steps.filter((s) => s.role === 'warmup' || s.role === 'conditioning').every((s) => s.art === 'home-training' || learnedBoxing.includes(s.techniqueId)), home.steps.filter((s) => s.role === 'warmup' || s.role === 'conditioning').map((s) => s.techniqueId));
  check('[A8] 단계 순서: 워밍업 → 복습 → 연결 → 응용 → 새 기술 → 마무리', home.steps.every((s, i, a) => i === 0 || a[i - 1].day !== s.day || ['warmup', 'review', 'connection', 'application', 'new', 'conditioning'].indexOf(a[i - 1].role) <= ['warmup', 'review', 'connection', 'application', 'new', 'conditioning'].indexOf(s.role)));
  check('[F3] 생성 당시 숙련도 스냅샷에 일괄 변경 결과(숙련) 반영', home.meta.learnedSnapshot.filter((x) => learnedBoxing.includes(x.techniqueId)).every((x) => x.status === 'proficient') && home.meta.learnedSnapshot.length === 4, home.meta.learnedSnapshot);
  const homeInstr = home.steps.map((s) => s.instruction).join(' / ');
  console.log('   집 수업 단계 예시:', homeInstr.slice(0, 500));

  // ---------- Session with location (집, text mode) ----------
  await page.locator('[data-testid="coach-class-start"]').click();
  await page.locator('button', { hasText: '입력으로 대화' }).click();
  await sleep(800);
  check('[S1] 수업 시작 → AI 코치 Day 세션 (장소 표시: 집)', (await page.locator('[data-testid="coach-location"]').getAttribute('data-location')) === 'home', page.url());
  // 1:1 수업: the lesson opens with a short explanation and a question (coach-lesson engine).
  await page.waitForFunction(() => document.querySelector('[data-testid="coach-step"]')?.dataset.step === 'lesson', null, { timeout: 60000 });
  const firstMsgs = await page.evaluate(() => [...document.querySelectorAll('[data-testid="coach-chat"] .ai-msg__bubble')].map((b) => b.textContent));
  check('[S2] 코치 첫 안내에 장소 반영 (집: 파트너 동작은 솔로 드릴로)', firstMsgs[0]?.includes('집에서 운동') && firstMsgs[0]?.includes('혼자'), firstMsgs[0]);
  check('[S3] 단계 설명: 실제 DB 이름 + 역할', /이번 단계\((워밍업|복습|기술 연결|응용|새 기술|체력·마무리)\)는 .+입니다/.test(firstMsgs[1] ?? ''), firstMsgs[1]?.slice(0, 160));
  // Walk every step: "준비됐어" (jump to video) → skip question → start → practise ~1.2s → stop → post-practice question (skip) → next.
  const stepCount = home.steps.filter((s) => s.day === 1).length;
  let feedbackSeen = false;
  let instructionSeen = false;
  for (let i = 0; i < stepCount; i++) {
    await page.waitForFunction(() => ['lesson', 'videos', 'mitt', 'recap', 'summary'].includes(document.querySelector('[data-testid="coach-step"]')?.dataset.step), null, { timeout: 180000 });
    if ((await page.locator('[data-testid="coach-step"]').getAttribute('data-step')) === 'recap') {
      await page.locator('[data-testid="coach-quick-skip"]').click();
      break;
    }
    if ((await page.locator('[data-testid="coach-step"]').getAttribute('data-step')) === 'lesson') {
      await page.fill('[data-testid="coach-text-input"]', '준비됐어');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('[data-testid="coach-step"]')?.dataset.step === 'videos', null, { timeout: 30000 });
    }
    // The tutor may connect the strikes just practised on the Visualizing Mitt (qa-ai-tutor-lesson covers it) — end it here.
    if ((await page.locator('[data-testid="coach-step"]').getAttribute('data-step')) === 'mitt') {
      await page.locator('[data-testid="mitt-runner-stop"]').click();
      i--;
      continue;
    }
    if ((await page.locator('[data-testid="coach-step"]').getAttribute('data-step')) === 'summary') break;
    await page.locator('button', { hasText: '질문 건너뛰기' }).click();
    await page.locator('[data-testid="coach-ready"] button').click();
    await page.locator('[data-testid="coach-posture-start"]').click(); // 자세 설명 → 실습 시작
    // practice = timer, the Visualizing Mitt (striking) or the solo call-out drill (wrestling/BJJ standing at home)
    await page.locator('[data-testid="coach-timer"], [data-testid="coach-mitt"], [data-testid="coach-drill"]').first().waitFor();
    instructionSeen ||= (await page.locator('[data-testid="coach-plan-instruction"]').count()) > 0;
    await sleep(1300);
    if (await page.locator('[data-testid="coach-timer"]').count()) await page.locator('button', { hasText: '여기서 끝내기' }).click();
    else if (await page.locator('[data-testid="coach-mitt"]').count()) await page.locator('[data-testid="mitt-runner-stop"]').click();
    else await page.locator('[data-testid="solo-drill-stop"]').click();
    // 수행 후 질문: the coach asks what was applied before moving on.
    await page.waitForFunction(() => document.querySelector('[data-testid="coach-step"]')?.dataset.step === 'review', null, { timeout: 10000 });
    feedbackSeen ||= await page.evaluate(() => [...document.querySelectorAll('[data-testid="coach-chat"] .ai-msg[data-kind="quiz"]')].some((m) => /방금 (하신 동작|실제로 적용|연습하면서)/.test(m.textContent) || /적용해 본 것/.test(m.textContent)));
    await page.locator('[data-testid="coach-quick-skip"]').click();
    await sleep(500);
  }
  check('[S4] 실습 화면에 장소별 수행 방법 표시', instructionSeen);
  check('[S5] 수행 후 AI 코치 질문(실습 후 확인) → 다음 운동', feedbackSeen);
  if ((await page.locator('[data-testid="coach-step"]').getAttribute('data-step')) === 'recap') await page.locator('[data-testid="coach-quick-skip"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="coach-step"]')?.dataset.step === 'summary', null, { timeout: 60000 });
  await page.locator('[data-testid="coach-summary"]').waitFor();
  const hist = await page.evaluate(async () => (await import('/src/lib/trainingHistory/service.ts')).listTrainingHistory()[0]);
  check('[S6] 수업 완료 → 학습 기록에 장소/모드 저장 (다음 수업 컨텍스트로 사용)', hist?.aiCoach?.location === 'home' && hist?.aiCoach?.mode === 'text' && hist.curriculumId === home.id, hist);
  const prev = await page.evaluate(async () => (await import('/src/lib/aiCoachCurriculum/profile.ts')).previousCoachClasses());
  check('[F4] 이전 AI 코치 수업 기록이 다음 커리큘럼 컨텍스트에 포함', prev.some((l) => l.includes('AI 코치 수업(집)')), prev);
  await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).clearCoachDayRun());

  // ================= B. 체육관 =================
  await goto('#/coach/class');
  await page.locator('[data-testid="coach-location-gym"]').click();
  await page.locator('[data-testid="coach-equip-heavy_bag"]').click();
  await page.locator('[data-testid="coach-equip-partner"]').click();
  await page.locator('[data-testid="coach-location-confirm"]').click();
  await page.locator('button', { hasText: '5일' }).click();
  const ctxGym = await page.evaluate(async () => {
    const s = await import('/src/lib/aiCoachCurriculum/service.ts');
    const p = await import('/src/lib/aiCoachCurriculum/profile.ts');
    const prof = p.buildLearnerProfile('boxing');
    return s.buildPlanContext({ martialArt: 'boxing', location: 'gym', equipment: ['heavy_bag', 'partner'], goal: '', sessionMinutes: 30, days: 3 }, prof, s.newTechniquePool(prof), s.drillPool('gym', ['heavy_bag', 'partner']));
  });
  check('[B1] 체육관 컨텍스트: 확인된 장비와 미확인 장비(가정 금지) 구분', ctxGym.includes('운동 장소: 체육관 (gym)') && ctxGym.includes('확인된 장비/환경: 샌드백, 연습 파트너') && /확인되지 않은 장비\/환경\(있다고 가정 금지\): 매트, 미트/.test(ctxGym), ctxGym.slice(0, 700));
  await page.locator('[data-testid="coach-class-generate"]').click();
  await page.locator('[data-testid="coach-class-result"]').waitFor({ timeout: 90000 });
  const gym = await page.evaluate(async () => {
    const el = document.querySelector('[data-testid="coach-class-result"]');
    const { getCurriculum } = await import('/src/lib/curriculum/curriculumService.ts');
    const c = getCurriculum(el.dataset.curriculumId);
    const notices = [...el.querySelectorAll('.ai-inline-warning')].map((n) => n.textContent);
    return { source: el.dataset.source, meta: c.aiCoachMeta, days: c.days.length, steps: c.days.flatMap((d) => d.coachPlan), notices };
  });
  check(
    '[B2] 체육관 5일 커리큘럼 생성됨 (AI가 구성, 장소/장비 저장)',
    gym.source === 'ai' && gym.days === 5 && gym.meta.location === 'gym' && gym.meta.equipment.join(',') === 'heavy_bag,partner' && !gym.notices.some((n) => n.includes('기본 구성')),
    { source: gym.source, days: gym.days, notices: gym.notices }
  );
  const gymText = gym.steps.map((s) => `${s.instruction} ${s.soloAlternative ?? ''}`).join(' ');
  check('[B3] 체육관 환경(샌드백/파트너 등)을 활용한 단계 포함', /샌드백|파트너|미트|매트|체육관/.test(gymText), gymText.slice(0, 400));
  check('[B4] 집과 다른 구성 — 체육관에서는 파트너 단계 가능', gym.steps.some((s) => s.needsPartner) || /파트너/.test(gymText));
  const unconfirmed = gym.steps.filter((s) => (s.equipment ?? []).some((e) => /미트|더미|매트|운동기구/.test(e)));
  check('[B5] 미확인 장비를 쓰는 단계에는 대안이 있음 (가정 금지)', unconfirmed.every((s) => !!s.soloAlternative), unconfirmed);
  console.log('   체육관 수업 단계 예시:', gymText.slice(0, 500));

  // ================= Day-start chooser on an ordinary curriculum =================
  await goto('#/learning/bjj/official__bjj/train');
  await page.locator('button', { hasText: /Day \d+ 훈련 시작/ }).first().click();
  await page.locator('button', { hasText: 'AI 코치와 하기' }).click();
  check('[H1] 일반 커리큘럼 Day의 AI 코치 시작에도 장소 선택', (await page.locator('[data-testid="coach-location-picker"]').count()) === 1);
  await page.locator('[data-testid="coach-location-gym"]').click();
  await page.locator('[data-testid="coach-equip-mitts"]').click();
  await page.locator('[data-testid="coach-location-confirm"]').click();
  const placeText = await page.locator('[data-testid="day-start-place"]').textContent();
  await page.locator('button', { hasText: '입력으로 대화' }).click();
  await sleep(800);
  check('[H2] 장소 → 대화 방식 → 세션 URL에 장소 전달', placeText.includes('체육관에서 운동') && page.url().includes('place=gym') && page.url().includes('equip=mitts'), page.url());
  await page.waitForFunction(() => document.querySelector('[data-testid="coach-step"]')?.dataset.step === 'lesson', null, { timeout: 60000 });
  const gymIntro = await page.evaluate(() => document.querySelector('[data-testid="coach-chat"] .ai-msg__bubble')?.textContent);
  check('[H3] 체육관 세션 첫 안내: 확인된 장비(미트) + 미확인은 대안', gymIntro?.includes('체육관') && gymIntro?.includes('미트') && gymIntro?.includes('대안'), gymIntro);
  const reply = await page.evaluate(async () => {
    const svc = await import('/src/lib/aiCoachDay/service.ts');
    const { resolveTechnique } = await import('/src/lib/userTechniques/service.ts');
    return svc.askCoach(resolveTechnique('bjj__armbar'), 'Day', [], '여기서 이 기술을 어떻게 연습하면 돼?', svc.coachPlaceContext('home', [], null));
  });
  check('[H4] 텍스트 질문에도 장소 컨텍스트 전달 (집 질문 → 답변 생성)', reply.ok && reply.text.length > 10, reply.ok ? reply.text.slice(0, 200) : reply.message);
  await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).clearCoachDayRun());

  // Direct link without a place → picker first, nothing starts before it.
  await goto('#/learning/bjj/official__bjj/coach/3?mode=text');
  const pickerFirst = (await page.locator('[data-testid="coach-location-picker"]').count()) === 1 && (await page.locator('[data-testid="coach-step"]').count()) === 0;
  await page.locator('[data-testid="coach-location-home"]').click();
  await page.locator('[data-testid="coach-location-confirm"]').click();
  await sleep(600);
  check('[H5] 장소 없이 들어온 세션은 장소 선택부터 → 선택 후 시작', pickerFirst && (await page.locator('[data-testid="coach-location"]').getAttribute('data-location')) === 'home', page.url());
  await page.evaluate(async () => (await import('/src/lib/aiCoachDay/sessionStore.ts')).clearCoachDayRun());

  // AI 코치 수업 curriculum: its place is fixed — Day-start goes straight to the talk mode.
  await goto(`#/learning/boxing/${home.id}/train`);
  await page.locator('button', { hasText: /Day \d+ 훈련 시작/ }).first().click();
  await page.locator('button', { hasText: 'AI 코치와 하기' }).click();
  const fixed = await page.locator('[data-testid="day-start-place"]').textContent().catch(() => '');
  check('[H6] AI 코치 수업 커리큘럼은 저장된 장소(집)로 바로 진행', fixed.includes('집에서 운동') && fixed.includes('이 수업의 장소'), fixed);
  await page.locator('button', { hasText: '혼자 하기' }).count();

  // Mobile width — 배운 기술 bulk UI still usable.
  await page.setViewportSize({ width: 375, height: 812 });
  await goto('#/learned-techniques');
  const mob = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, bar: !!document.querySelector('[data-testid="learned-bulk-change"]') }));
  check('[M1] 모바일(375px): 가로 스크롤 없이 배운 기술/일괄 변경 UI 표시', mob.overflow <= 1 && mob.bar, mob);
  await page.screenshot({ path: '/tmp/qa-learned-mobile.png' });

  check('[Z] 전체 흐름 동안 페이지 에러 없음', pageErrors.length === 0, pageErrors);
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
