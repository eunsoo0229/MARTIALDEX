// Ground Battle QA — real Electron + real app modules + real Supabase test
// account (no mocking), isolated --user-data-dir per run (same convention
// as qa-sparring-session.mjs). Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  const d = typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (d ? ' :: ' + d.slice(0, 400) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Learned subset: deliberately NOT the whole roster, so unlearned gating is testable.
const LEARNED = ['bjj__armbar', 'bjj__triangle', 'bjj__scissor-sweep', 'bjj__hip-escape', 'bjj__knee-cut-pass', 'bjj__wrist-control', 'bjj__rear-naked-choke', 'bjj__high-mount'];
const NOT_LEARNED_BUT_ROSTER = 'bjj__kimura'; // guard_bottom submission, in roster, never practiced

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-gb-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: electronBin, args: [APP_DIR, `--user-data-dir=${dir}`], env, timeout: 30000 });
  const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.waitForLoadState('load');
  await sleep(800);
  const goto = async (hash) => {
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    await sleep(900);
  };
  const bodyText = () => page.evaluate(() => document.body.innerText);

  // ---------- A. Entry + empty-roster honesty ----------
  await goto('#/free-training');
  const chip = await page.locator('a.chip', { hasText: '그라운드 배틀' }).count();
  check('[A1] 자유훈련 화면에 "그라운드 배틀" 진입 링크 존재', chip === 1, chip);
  await page.locator('a.chip', { hasText: '그라운드 배틀' }).click();
  await sleep(900);
  check('[A2] 그라운드 배틀 홈으로 이동', page.url().includes('#/free-training/ground-battle'), page.url());
  await goto('#/free-training/ground-battle/setup');
  check('[A3] 학습 기술 0개일 때 매치 시작 대신 정직한 빈 상태 안내', (await bodyText()).includes('그라운드 기술을 아직 학습하지 않았습니다'));

  // Real learning path: practicing techniques via recordTrainingSession (same as any real training entry).
  await page.evaluate(async (ids) => {
    const { recordTrainingSession } = await import('/src/lib/trainingHistory/service.ts');
    recordTrainingSession({ curriculumId: null, dayNumber: null, techniqueIds: ids, completed: true, estimatedMinutes: 10, source: 'free_training' });
  }, LEARNED);

  const roster = await page.evaluate(async () => {
    const { getPlayerGroundBattleRoster } = await import('/src/lib/groundBattle/service.ts');
    return getPlayerGroundBattleRoster().map((t) => t.techniqueId);
  });
  check('[A4] 로드아웃 = 학습 기술 ∩ 큐레이션 로스터 (정확히 일치)', roster.length === LEARNED.length && LEARNED.every((id) => roster.includes(id)), roster);
  check('[A5] 학습하지 않은 로스터 기술은 로드아웃에서 제외', !roster.includes(NOT_LEARNED_BUT_ROSTER));

  // ---------- B. Roster integrity (no invented techniques) ----------
  const integrity = await page.evaluate(async () => {
    const { CURATED_GROUND_TECHNIQUES } = await import('/src/lib/groundBattle/curatedRoster.ts');
    const { getUnifiedAllTechniques } = await import('/src/lib/userTechniques/service.ts');
    const ids = new Set(getUnifiedAllTechniques().map((t) => t.id));
    const states = ['guard_top','guard_bottom','half_guard_top','half_guard_bottom','side_control_top','side_control_bottom','mount_top','mount_bottom','knee_on_belly_top','knee_on_belly_bottom','back_control_top','back_control_bottom','turtle_top','turtle_bottom'];
    const perState = Object.fromEntries(states.map((s) => [s, CURATED_GROUND_TECHNIQUES.filter((t) => t.usableFrom.includes(s)).length]));
    return {
      total: CURATED_GROUND_TECHNIQUES.length,
      unknown: CURATED_GROUND_TECHNIQUES.filter((t) => !ids.has(t.techniqueId)).map((t) => t.techniqueId),
      allBjj: CURATED_GROUND_TECHNIQUES.every((t) => t.techniqueId.startsWith('bjj__')),
      perState,
      submissionsHaveProgress: CURATED_GROUND_TECHNIQUES.filter((t) => t.isSubmissionFinish).every((t) => (t.submissionProgressNeeded ?? 0) > 0),
      nonSubmissionsHaveOutcome: CURATED_GROUND_TECHNIQUES.filter((t) => !t.isSubmissionFinish).every((t) => !!t.onSuccess),
    };
  });
  check('[B1] 큐레이션 로스터의 모든 기술 ID가 실제 DB에 존재 (가짜 기술 0개)', integrity.unknown.length === 0 && integrity.allBjj, integrity);
  check('[B2] 14개 포지션 상태 모두 최소 2개 이상의 선택지 보유 (소프트락 없음)', Object.values(integrity.perState).every((n) => n >= 2), integrity.perState);
  check('[B3] 서브미션은 진행도, 비서브미션은 성공 시 포지션 결과를 가짐', integrity.submissionsHaveProgress && integrity.nonSubmissionsHaveOutcome);

  // ---------- C/D/F/H. Pure engine checks with deterministic rolls ----------
  const engine = await page.evaluate(async ({ LEARNED, NOT_LEARNED_BUT_ROSTER }) => {
    const { resolveTurn, checkMatchEnd, CONSTANTS } = await import('/src/lib/groundBattle/combatEngine.ts');
    const { stateFor } = await import('/src/lib/groundBattle/positionUtil.ts');
    const { getTechniquesForPosition } = await import('/src/lib/groundBattle/curatedRoster.ts');
    const base = (family, topRole) => ({
      id: 'qa', difficulty: 'easy', mode: 'ai', startedAt: new Date().toISOString(), finishedAt: null, turnNumber: 1, phase: 'player_turn',
      position: { family, topRole },
      player: { hp: 100, stamina: 100, lastActionCategory: null, controlBonus: 0 },
      opponent: { hp: 100, stamina: 100, lastActionCategory: null, controlBonus: 0 },
      activeSubmissionThreat: null, turnLog: [], outcome: null, rngSeed: 42, playerLoadoutTechniqueIds: LEARNED,
    });
    const always = (v) => () => v;
    const out = {};

    // C1: position-illegal (armbar is guard_bottom only; player is side_control_bottom)
    const s1 = base('side_control', 'opponent');
    let rolls = 0;
    const r1 = resolveTurn(s1, 'player', 'bjj__armbar', () => { rolls++; return 0; });
    out.c1 = { outcome: r1.outcome, samePos: JSON.stringify(r1.newState.position) === JSON.stringify(s1.position), sameStamina: r1.newState.player.stamina === 100, rolls };
    // C2: legal position but not learned (kimura from guard_bottom)
    const s2 = base('guard', 'opponent');
    out.c2 = resolveTurn(s2, 'player', NOT_LEARNED_BUT_ROSTER, always(0)).outcome;
    // C3: technique not in roster at all
    out.c3 = resolveTurn(s2, 'player', 'bjj__this-does-not-exist', always(0)).outcome;
    // C4: AI has no learned gate (opponent on top in guard -> guard_top pass is legal for AI)
    out.c4 = resolveTurn({ ...s2, phase: 'opponent_turn' }, 'opponent', 'bjj__torreando-pass', always(0)).outcome;

    // H1: hip escape success from bottom side control -> player ends in guard, bottom
    const h1 = resolveTurn(base('side_control', 'opponent'), 'player', 'bjj__hip-escape', always(0));
    out.h1 = { outcome: h1.outcome, family: h1.newState.position.family, player: stateFor('player', h1.newState.position) };
    // H2: knee cut pass success from top guard -> side control, player on top
    const h2 = resolveTurn(base('guard', 'player'), 'player', 'bjj__knee-cut-pass', always(0));
    out.h2 = { outcome: h2.outcome, player: stateFor('player', h2.newState.position) };
    // H3: reversal flips the top role
    const h3 = resolveTurn(base('guard', 'player'), 'player', 'bjj__knee-cut-pass', always(0.999));
    out.h3 = { outcome: h3.outcome, topRole: h3.newState.position.topRole };
    // H4: a plain fail keeps the position. Uses the AI side (no mastery
    // modifier): torreando-pass base 0.38, equal stamina -> fail band is
    // [0.38, 0.53), so a 0.45 roll is a deterministic fail.
    const h4 = resolveTurn({ ...base('guard', 'opponent'), phase: 'opponent_turn' }, 'opponent', 'bjj__torreando-pass', () => 0.45);
    out.h4 = { outcome: h4.outcome, opponent: stateFor('opponent', h4.newState.position) };

    // F1: submission needs 2 successful ticks -> win
    let sub = base('guard', 'opponent');
    const t1 = resolveTurn(sub, 'player', 'bjj__armbar', always(0));
    sub = t1.newState;
    const afterOne = checkMatchEnd(sub);
    const t2 = resolveTurn({ ...sub, turnNumber: 2 }, 'player', 'bjj__armbar', always(0));
    out.f1 = { afterOne, afterTwo: checkMatchEnd(t2.newState), progress: t2.newState.activeSubmissionThreat?.progress };
    // F1b: failed submission clears the threat
    const t3 = resolveTurn(t1.newState, 'player', 'bjj__armbar', always(0.999));
    out.f1b = t3.newState.activeSubmissionThreat;
    // F2: condition (HP) to zero from dominant-position attack -> TKO
    const koState = { ...base('mount', 'player'), opponent: { hp: 3, stamina: 100, lastActionCategory: null, controlBonus: 0 }, playerLoadoutTechniqueIds: [...LEARNED, 'bjj__gift-wrap'] };
    const ko = resolveTurn(koState, 'player', 'bjj__gift-wrap', always(0));
    out.f2 = { hp: ko.newState.opponent.hp, end: checkMatchEnd(ko.newState) };
    // F3: turn cap -> decision, never hangs
    out.f3 = checkMatchEnd({ ...base('guard', 'player'), turnNumber: CONSTANTS.MAX_TURNS });

    // B4: invariant over many random legal turns — exactly one top fighter, always a real state
    let bad = 0;
    let st = base('guard', 'player');
    let seed = 1;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 600; i++) {
      const actor = i % 2 === 0 ? 'player' : 'opponent';
      const legal = getTechniquesForPosition(stateFor(actor, st.position));
      const pick = legal[Math.floor(rnd() * legal.length)];
      st = { ...st, playerLoadoutTechniqueIds: legal.map((t) => t.techniqueId).concat(LEARNED), player: { ...st.player, stamina: 100 }, opponent: { ...st.opponent, stamina: 100 }, activeSubmissionThreat: null };
      const r = resolveTurn(st, actor, pick.techniqueId, rnd);
      st = r.newState;
      const ps = stateFor('player', st.position), os = stateFor('opponent', st.position);
      const oneTop = ps.endsWith('_top') !== os.endsWith('_top');
      const valid = getTechniquesForPosition(ps).length > 0 && getTechniquesForPosition(os).length > 0;
      if (!oneTop || !valid || r.outcome === 'illegal') bad++;
    }
    out.b4 = bad;
    return out;
  }, { LEARNED, NOT_LEARNED_BUT_ROSTER });

  check('[C1] 현재 포지션에서 성립하지 않는 기술(학습했어도) → illegal, 포지션/스태미나 변화 없음, 판정 롤 미소모', engine.c1.outcome === 'illegal' && engine.c1.samePos && engine.c1.sameStamina && engine.c1.rolls === 0, engine.c1);
  check('[C2] 포지션은 맞지만 학습하지 않은 기술 → 엔진 자체에서 차단(illegal)', engine.c2 === 'illegal', engine.c2);
  check('[C3] 로스터에 없는 기술 ID → illegal (조용한 성공 없음)', engine.c3 === 'illegal', engine.c3);
  check('[C4] AI는 학습 제약 없이 동일 엔진/규칙 사용', engine.c4 === 'success', engine.c4);
  check('[H1] 하단 사이드 컨트롤 + Hip Escape 성공 → 하단 가드', engine.h1.outcome === 'success' && engine.h1.player === 'guard_bottom', engine.h1);
  check('[H2] 상단 가드 + Knee Cut Pass 성공 → 상단 사이드 컨트롤', engine.h2.outcome === 'success' && engine.h2.player === 'side_control_top', engine.h2);
  check('[H3] 역전(reversal) 시 위/아래 역할이 뒤집힘', engine.h3.outcome === 'reversal' && engine.h3.topRole === 'opponent', engine.h3);
  check('[H4] 실패 시 포지션 유지', engine.h4.outcome === 'fail' && engine.h4.opponent === 'guard_top', engine.h4);
  check('[F1] 서브미션 1회 성공만으로는 종료 안 됨, 2회 연속 성공 시 서브미션 승리', engine.f1.afterOne === null && engine.f1.afterTwo === 'player_submission_win' && engine.f1.progress === 2, engine.f1);
  check('[F1b] 서브미션 실패/역전 시 위협 해제 (다음 턴에 도망 가능)', engine.f1b === null, engine.f1b);
  check('[F2] 지배 포지션 공격으로 컨디션 0 → 경기 종료', engine.f2.hp === 0 && engine.f2.end === 'player_tko_win', engine.f2);
  check('[F3] 턴 상한 도달 시 판정/무승부로 반드시 종료', ['decision_player', 'decision_opponent', 'draw'].includes(engine.f3), engine.f3);
  check('[B4] 600턴 무작위 진행 동안 위/아래 불변식 유지 + 항상 실제 포지션 상태', engine.b4 === 0, engine.b4);

  // ---------- D. Turn alternation via the real store ----------
  const turns = await page.evaluate(async (LEARNED) => {
    const store = await import('/src/lib/groundBattle/matchStore.ts');
    store.startMatch('easy', 'ai', LEARNED, { family: 'guard', topRole: 'opponent' });
    const first = store.submitActorAction('player', 'bjj__wrist-control');
    const dup = store.submitActorAction('player', 'bjj__wrist-control');
    const aiDuringOpp = store.submitActorAction('opponent', 'bjj__torreando-pass').turnOutcome !== null;
    const afterAi = store.getGroundBattleRun();
    const playerAgain = store.submitActorAction('player', 'bjj__wrist-control');
    // Play to completion with legal-ish random picks; must terminate.
    let guard = 0;
    while (store.getGroundBattleRun().phase !== 'finished' && guard++ < 200) {
      const r = store.getGroundBattleRun();
      if (r.phase === 'opponent_turn') store.runAiTurn();
      else store.submitActorAction('player', LEARNED[guard % LEARNED.length]);
    }
    const end = store.getGroundBattleRun();
    const afterEnd = store.submitActorAction('player', 'bjj__armbar');
    return {
      firstOutcome: first.turnOutcome, firstPhase: first.state.phase, firstLog: first.state.turnLog.length,
      dupOutcome: dup.turnOutcome, dupLog: dup.state.turnLog.length,
      aiDuringOpp, phaseAfterAi: afterAi.phase, logAfterAi: afterAi.turnLog.length,
      playerAgainLog: playerAgain.state.turnLog.length,
      endPhase: end.phase, endOutcome: end.outcome, loops: guard, afterEndOutcome: afterEnd.turnOutcome, afterEndLog: afterEnd.state.turnLog.length === end.turnLog.length,
    };
  }, LEARNED);
  check('[D1] 플레이어 행동 1회 → 턴 소비, 로그 1건, 상대 턴으로 전환', turns.firstOutcome !== null && turns.firstLog === 1 && turns.firstPhase === 'opponent_turn', turns);
  check('[D2] 같은 턴에 중복 행동 거부 (turnOutcome null, 로그 증가 없음)', turns.dupOutcome === null && turns.dupLog === 1, turns);
  check('[D3] 상대 턴 1회 후 다시 플레이어 턴으로 전환', turns.aiDuringOpp && turns.phaseAfterAi === 'player_turn' && turns.logAfterAi === 2, turns);
  check('[D4] 매치가 반드시 종료됨 (무한 루프 없음)', turns.endPhase === 'finished' && !!turns.endOutcome, turns);
  check('[D5] 종료 후 추가 입력 거부', turns.afterEndOutcome === null && turns.afterEndLog, turns);

  // local 2 player: pass_device interstitial between turns
  const local = await page.evaluate(async (LEARNED) => {
    const store = await import('/src/lib/groundBattle/matchStore.ts');
    store.startMatch('easy', 'local_2p', LEARNED, { family: 'guard', topRole: 'opponent' });
    const a = store.submitActorAction('player', 'bjj__wrist-control');
    const blocked = store.submitActorAction('opponent', 'bjj__torreando-pass');
    const aiBlocked = store.runAiTurn();
    const b = store.advancePastPassDevice();
    const c = store.submitActorAction('opponent', 'bjj__torreando-pass');
    const d = store.advancePastPassDevice();
    return { afterP1: a.state.phase, blocked: blocked.turnOutcome, aiBlocked: aiBlocked.turnOutcome, afterPass: b.phase, afterP2: c.state.phase, backToP1: d.phase };
  }, LEARNED);
  check('[D6] 로컬 2인: 행동 후 화면 넘김 단계 → 선수 2 차례 → 화면 넘김 → 선수 1 차례, AI 개입 없음', local.afterP1 === 'pass_device' && local.blocked === null && local.aiBlocked === null && local.afterPass === 'opponent_turn' && local.afterP2 === 'pass_device' && local.backToP1 === 'player_turn', local);

  // ---------- E. AI validity ----------
  const ai = await page.evaluate(async () => {
    const { chooseAiAction } = await import('/src/lib/groundBattle/aiOpponent.ts');
    const { getCuratedTechnique } = await import('/src/lib/groundBattle/curatedRoster.ts');
    const { stateFor } = await import('/src/lib/groundBattle/positionUtil.ts');
    const fams = ['guard', 'half_guard', 'side_control', 'mount', 'knee_on_belly', 'back_control', 'turtle'];
    let invalid = 0, total = 0;
    const picksByDifficulty = { easy: new Set(), normal: new Set() };
    for (const difficulty of ['easy', 'normal']) {
      for (let i = 0; i < 140; i++) {
        const family = fams[i % fams.length];
        const topRole = i % 2 ? 'player' : 'opponent';
        const state = { id: 'x', difficulty, mode: 'ai', startedAt: '', finishedAt: null, turnNumber: i + 1, phase: 'opponent_turn', position: { family, topRole },
          player: { hp: 30 + (i % 70), stamina: 20 + (i % 80), lastActionCategory: null, controlBonus: 0 },
          opponent: { hp: 20 + (i % 80), stamina: 15 + (i % 85), lastActionCategory: null, controlBonus: 0 },
          activeSubmissionThreat: null, turnLog: [], outcome: null, rngSeed: 1000 + i, playerLoadoutTechniqueIds: [] };
        const { techniqueId } = chooseAiAction(state, difficulty);
        const t = getCuratedTechnique(techniqueId);
        total++;
        if (!t || !t.usableFrom.includes(stateFor('opponent', state.position))) invalid++;
        picksByDifficulty[difficulty].add(techniqueId);
      }
    }
    return { invalid, total, easyVariety: picksByDifficulty.easy.size, normalVariety: picksByDifficulty.normal.size };
  });
  check('[E1] Easy/Normal AI 280회 선택 중 불가능한 기술 0회', ai.invalid === 0, ai);
  check('[E2] AI가 한 기술만 반복하지 않음 (선택 다양성)', ai.easyVariety > 10 && ai.normalVariety > 5, ai);

  // ---------- G. finalize -> training_history, idempotent ----------
  const hist = await page.evaluate(async () => {
    const store = await import('/src/lib/groundBattle/matchStore.ts');
    const { finalizeGroundBattleMatch, listGroundBattleMatches } = await import('/src/lib/groundBattle/service.ts');
    const { listTrainingHistory } = await import('/src/lib/trainingHistory/service.ts');
    const run = store.getGroundBattleRun(); // the local_2p run from D6 isn't finished; end it
    const ended = store.endMatchNow();
    const rec1 = finalizeGroundBattleMatch(ended);
    const rec2 = finalizeGroundBattleMatch(ended);
    const linked = listTrainingHistory().filter((e) => e.groundBattleMatchId === rec1.id);
    const usedByPlayer = [...new Set(ended.turnLog.filter((e) => e.actor === 'player').map((e) => e.techniqueId))];
    return {
      sameId: rec1.id === rec2.id, linkedCount: linked.length, source: linked[0]?.source,
      techniqueIdsMatch: JSON.stringify(linked[0]?.techniqueIds) === JSON.stringify(usedByPlayer),
      matchesSaved: listGroundBattleMatches().filter((m) => m.id === rec1.id).length, id: rec1.id, hadRun: !!run,
    };
  });
  check('[G1] 매치 종료 기록을 2번 저장해도 훈련 기록은 정확히 1건 (source=ground_battle)', hist.sameId && hist.linkedCount === 1 && hist.source === 'ground_battle' && hist.matchesSaved === 1, hist);
  check('[G2] 훈련 기록의 기술 = 이번 매치에서 실제로 사용한 기술만 (로드아웃 전체 아님)', hist.techniqueIdsMatch, hist);

  // ---------- A (UI). Full screen flow, no hints before a choice ----------
  await goto('#/free-training/ground-battle');
  await goto('#/free-training/ground-battle/setup');
  const setupText = await bodyText();
  check('[A6] 설정 화면: VS AI / 로컬 2인 / 난이도 / 시작 포지션 표시', ['VS AI', '로컬 2인', '쉬움', '보통', '시작 포지션'].every((s) => setupText.includes(s)));
  check('[A7] 설정 화면은 카테고리별 개수만 보여주고 기술 이름은 노출하지 않음', !setupText.includes('Armbar') && !setupText.includes('암바') && setupText.includes('서브미션'), setupText.slice(0, 300));
  await page.selectOption('select', 'side_control');
  await page.getByText('전투 시작', { exact: true }).click();
  await sleep(1000);
  check('[A8] 전투 시작 → 매치 화면', page.url().includes('/ground-battle/battle'), page.url());
  let battle = await bodyText();
  const noTechniqueNamesBeforeChoice = !['Armbar', 'Hip Escape', 'Scissor Sweep', 'Rear Naked Choke', 'Knee Cut Pass'].some((n) => battle.includes(n));
  check('[A9] 매치 화면: 포지션/컨디션/스태미나/행동 카테고리 표시, 선택 전 기술 이름·추천 없음', battle.includes('사이드 컨트롤') && battle.includes('컨디션') && battle.includes('스태미나') && battle.includes('서브미션') && noTechniqueNamesBeforeChoice && !battle.includes('추천'), battle.slice(0, 400));
  const arenaOk = await page.evaluate(() => {
    const top = document.querySelector('.ground-battle-arena__fighter--top');
    const bottom = document.querySelector('.ground-battle-arena__fighter--bottom');
    return !!top && !!bottom && top.className.includes('is-') && bottom.className.includes('is-') && top.className !== bottom.className;
  });
  check('[A10] 탑/바텀 시각화: 위·아래 선수가 구분되어 표시', arenaOk);

  // If it's the player's turn, open the SUBMISSION category: learned submissions must ALL show,
  // including ones not usable from side control (proves no situational filtering).
  const runNow = await page.evaluate(async () => (await import('/src/lib/groundBattle/matchStore.ts')).getGroundBattleRun());
  if (runNow.phase === 'opponent_turn') await sleep(1600);
  await page.locator('button.chip', { hasText: '서브미션' }).click();
  await sleep(300);
  battle = await bodyText();
  check('[A11] 카테고리 선택 후: 학습한 서브미션이 현재 포지션 성립 여부와 무관하게 전부 표시 (상황별 필터링 없음)', battle.includes('Armbar') && battle.includes('Triangle') && battle.includes('Rear Naked Choke'), battle.slice(0, 500));
  check('[A12] 학습하지 않은 기술은 선택지에 없음', !battle.includes('Kimura'), '');
  await page.getByRole('button', { name: /Armbar/ }).first().click();
  await sleep(2200); // player result + AI's reply
  const afterPick = await bodyText();
  check('[A13] 선택 후에만 결과 표시 (시도한 기술 + 판정)', afterPick.includes('Armbar 시도') && /(시도할 수 없음|성공|부분 성공|실패|역전당함)/.test(afterPick), afterPick.slice(0, 500));
  const stateAfterPick = await page.evaluate(async () => (await import('/src/lib/groundBattle/matchStore.ts')).getGroundBattleRun());
  check('[A14] AI가 자동으로 응수하고 다시 플레이어 차례 (또는 종료)', ['player_turn', 'finished'].includes(stateAfterPick.phase) && stateAfterPick.turnLog.length >= 2, { phase: stateAfterPick.phase, log: stateAfterPick.turnLog.length });

  if (stateAfterPick.phase !== 'finished') {
    await page.getByText('매치 종료', { exact: true }).click();
    await sleep(1200);
  }
  check('[A15] 매치 종료 → 결과 화면 이동', page.url().includes('/ground-battle/result/'), page.url());
  const resultText = await bodyText();
  check('[A16] 결과 화면: 성공/실패 기술 + 턴 기록 제공', resultText.includes('성공한 기술') && resultText.includes('실패한 기술') && resultText.includes('턴별 기록'), resultText.slice(0, 400));
  await goto('#/free-training/ground-battle/history');
  const histText = await bodyText();
  check('[A17] 전적 화면: 실제 기록 기반 경기 수/승패 표시', /경기 \d+/.test(histText) && histText.includes('승') && histText.includes('패'), histText.slice(0, 300));
  await goto('#/training-analytics/history');
  check('[A18] 훈련 기록 목록에 그라운드 배틀 항목 표시', (await bodyText()).includes('그라운드 배틀'));

  // ---------- I. Supabase round trip (real test account) ----------
  const sb = await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const email = `qa-gb-${Date.now()}@martialdex-test.local`;
    const { data: sign, error: signErr } = await supabase.auth.signUp({ email, password: 'QaGround!2026' });
    if (signErr) return { ok: false, stage: 'signup', msg: signErr.message };
    const userId = sign.user.id;
    await new Promise((r) => setTimeout(r, 1500));
    const { syncGroundBattleMatchesBidirectional } = await import('/src/lib/cloudSync/groundBattleSync.ts');
    const { groundBattleRepository } = await import('/src/lib/groundBattle/repository.ts');
    const push = await syncGroundBattleMatchesBidirectional(userId);
    const { data: rows, error } = await supabase.from('ground_battle_matches').select('id, outcome, mode').eq('user_id', userId);
    const localCount = groundBattleRepository.list().length;
    for (const r of groundBattleRepository.list()) groundBattleRepository.delete(r.id);
    const pull = await syncGroundBattleMatchesBidirectional(userId);
    return { ok: push.ok && !error, push: push.ok ? push.data : push.message, rowCount: rows?.length ?? 0, localCount, pull: pull.ok ? pull.data : pull.message, restored: groundBattleRepository.list().length, err: error?.message };
  });
  check('[I1] 로그인 후 동기화 → ground_battle_matches에 실제 행 저장', sb.ok && sb.rowCount === sb.localCount && sb.rowCount > 0, sb);
  check('[I2] 로컬 삭제 후 동기화 → 클라우드에서 복원', sb.pull && sb.pull.pulled === sb.rowCount && sb.restored === sb.rowCount, sb);

  // ---------- J. Regression smoke ----------
  for (const [hash, must, label] of [
    ['#/techniques', '기술', '[J1] 전체 기술 목록'],
    ['#/arts/bjj/techniques/bjj__armbar', 'Armbar', '[J2] 기술 상세'],
    ['#/free-training', '자유훈련', '[J3] 자유훈련'],
    ['#/free-training/sparring', '스파링', '[J4] 스파링'],
    ['#/learning/bjj', '커리큘럼', '[J5] 커리큘럼'],
    ['#/ai-curriculum', 'AI', '[J5b] AI 커리큘럼'],
    ['#/community', '커뮤니티', '[J6] 커뮤니티'],
  ]) {
    await goto(hash);
    const t = await bodyText();
    check(`${label} 정상 렌더링`, t.includes(must) && !t.includes('문제가 발생했습니다'), t.slice(0, 120));
  }
  check('[J7] 전체 흐름 동안 페이지 에러 없음', pageErrors.length === 0, pageErrors);

  await app.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} PASSED ===`);
  for (const f of failed) console.log(' - ' + f.name);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('DRIVER FAILED:', e); process.exit(1); });
