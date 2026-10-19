// AI 코치 운동 계획 파싱 + 세트/휴식 타이머 + 응원 — offline unit tests.
// Bundles the PURE modules (workoutPlan.ts, workoutTimer.ts) with esbuild
// and drives them with a fake clock. Run: node .devtools/test-coach-workout.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-workout-'));
const entry = path.join(dir, 'entry.ts');
fs.writeFileSync(entry, ['workoutPlan', 'workoutTimer'].map((m) => `export * from ${JSON.stringify(path.join(APP, 'src/lib/coachLesson', m + '.ts'))};`).join('\n'));
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: path.join(dir, 'out.mjs'), logLevel: 'error' });
const W = await import(pathToFileURL(path.join(dir, 'out.mjs')).href);

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail !== '' ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : ''));
}
const spec = (t) => W.parseWorkoutSpec(t);
const triple = (s) => [s.exerciseDurationSeconds, s.sets, s.restDurationSeconds];
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------- parsing
{
  const s = spec('잽과 크로스를 3분씩 3세트 연습해 보세요. 세트 사이에는 1분씩 휴식합니다.');
  check('[P1] "3분씩 3세트, 세트 사이 1분 휴식" → 180초 × 3세트, 휴식 60초', eq(triple(s), [180, 3, 60]), { s });
  check('[P1b] 근거 문구 보관', s.evidence.some((e) => e.includes('3세트')) && s.evidence.some((e) => e.includes('1분')), s.evidence);
}
const cases = [
  ['3분 × 3세트, 휴식 1분', [180, 3, 60]],
  ['3분 x 3세트', [180, 3, null]],
  ['90초씩 다섯 세트, 30초 쉬고', [90, 5, 30]],
  ['2분 30초 동안 2라운드, 휴식 45초', [150, 2, 45]],
  ['1분 반씩 4세트 하고 세트 사이 20초 휴식', [90, 4, 20]],
  ['3 rounds of 3 minutes with 60 seconds rest', [180, 3, 60]],
  ['3 x 2분', [120, 3, null]],
  ['휴식 없이 30초씩 6세트', [30, 6, 0]],
  ['쉐도우 복싱 3분', [180, null, null]],
  ['잽 10회씩 3세트', [null, 3, null]],
  ['잽을 연습해 보세요', [null, null, null]],
];
for (const [text, want] of cases) {
  const got = triple(spec(text));
  check(`[P2] "${text}" → ${JSON.stringify(want)}`, eq(got, want), got);
}
check('[P3] 시간이 없으면 지어내지 않음 (null 유지)', spec('잽 10회씩 3세트').exerciseDurationSeconds === null && spec('잽 10회씩 3세트').reps === 10);
{
  const d = W.draftFromSpec(spec('잽 10회씩 3세트'), null);
  check('[P4] 지난 설정이 없으면 빠진 값은 비워 둠 (사용자 확인 필요)', d.exerciseDurationSeconds === null && d.sets === 3 && d.restDurationSeconds === null && d.fromLastUsed.length === 0, d);
  const d2 = W.draftFromSpec(spec('잽 10회씩 3세트'), { exerciseDurationSeconds: 120, sets: 2, restDurationSeconds: 30 });
  check('[P5] 지난 설정 사용 시 어떤 값이 지난 설정인지 표시', d2.exerciseDurationSeconds === 120 && d2.sets === 3 && d2.restDurationSeconds === 30 && eq(d2.fromLastUsed, ['exercise', 'rest']), d2);
}
check('[P6] 검증: 0세트·5초·휴식 음수 거부', W.planErrors({ exerciseDurationSeconds: 5, sets: 0, restDurationSeconds: -1 }).length === 3 && W.planErrors({ exerciseDurationSeconds: 180, sets: 3, restDurationSeconds: 60 }).length === 0);
check('[P7] 계획 설명 문구', W.describePlan({ exerciseDurationSeconds: 180, sets: 3, restDurationSeconds: 60 }) === '3분 × 3세트, 세트 사이 1분 휴식', W.describePlan({ exerciseDurationSeconds: 180, sets: 3, restDurationSeconds: 60 }));

// ---------------- timer
const plan = { title: '잽-크로스', focus: ['가드 복귀', '어깨 회전'], exerciseDurationSeconds: 180, sets: 3, restDurationSeconds: 60 };
const T0 = 1_000_000;
/** Drives the timer with a 250 ms poll from `from` to `to` (ms after T0). */
function drive(run, from, to, cheer = 'normal', step = 250) {
  const events = [];
  for (let t = from; t <= to; t += step) {
    const r = W.tickWorkout(run, T0 + t, cheer);
    run = r.run;
    events.push(...r.events.map((e) => ({ ...e, t })));
  }
  return { run, events };
}
{
  const { run, events: startEv } = W.startWorkout(plan, T0);
  check('[T1] 시작: 1세트 작업, 남은 시간 180초', run.phase === 'work' && run.set === 1 && W.remainingMs(run, T0) === 180000 && startEv[0].type === 'set_start');
  check('[T2] 카운트다운: 1초 뒤 179초, 90초 뒤 90초', Math.ceil(W.remainingMs(run, T0 + 1000) / 1000) === 179 && W.remainingMs(run, T0 + 90000) === 90000);
  const a = drive(run, 0, 180000);
  check('[T3] 180초 → 휴식으로 전환 (1세트 완료, 실제 작업 180초)', a.run.phase === 'rest' && a.run.completedSets === 1 && a.run.workedMs === 180000, a.run);
  const b = drive(a.run, 180250, 240000);
  check('[T4] 1분 휴식 후 2세트 시작', b.run.phase === 'work' && b.run.set === 2 && b.events.some((e) => e.type === 'set_start' && e.set === 2));
  const c = drive(b.run, 240250, 3 * 180000 + 2 * 60000 + 1000);
  check('[T5] 마지막 세트 후 완료 (3세트, 작업 540초, 휴식 시간 제외)', c.run.phase === 'done' && c.run.completedSets === 3 && c.run.workedMs === 540000, { phase: c.run.phase, sets: c.run.completedSets, worked: c.run.workedMs });
  const all = [...a.events, ...b.events, ...c.events];
  const starts = all.filter((e) => e.type === 'set_start').map((e) => e.set);
  check('[T6] 세트가 두 번 넘어가지 않음 (2, 3세트 시작 각 1회, 완료 1회)', eq(starts, [2, 3]) && all.filter((e) => e.type === 'done').length === 1 && all.filter((e) => e.type === 'rest_start').length === 2, { starts });
  const cues = all.filter((e) => e.type === 'cue');
  const ids = cues.map((e) => e.id);
  check('[D1] 응원: 세트마다 절반·마지막 30초, 휴식 중 다음 세트 예고 (보통)', eq(ids, ['1:work:w_half', '1:work:w_last30', '1:rest:r_next', '2:work:w_half', '2:work:w_last30', '2:rest:r_next', '3:work:w_half', '3:work:w_last30']), ids);
  check('[D2] 같은 응원이 같은 세트에서 반복되지 않음', new Set(ids).size === ids.length);
  const last30 = cues.find((e) => e.id === '1:work:w_last30');
  check('[D3] 마지막 30초 응원은 실제 남은 30초 시점 (150초 ± 250ms)', last30.t >= 150000 && last30.t <= 150250, last30.t);
  const rnext = cues.find((e) => e.id === '1:rest:r_next');
  check('[D4] 휴식 안내는 다음 세트 예고 + 수업 포인트 (작업/휴식 구분)', /곧 2세트입니다/.test(rnext.text) && rnext.text.includes('어깨 회전'), rnext.text);
  check('[D5] 응원 문구는 미리 준비된 텍스트 (AI 호출 없음)', cues.every((e) => typeof e.text === 'string' && e.text.length > 5));
  // Re-ticking the same moment changes nothing.
  const again = W.tickWorkout(c.run, T0 + 999999, 'normal');
  check('[T7] 같은 시각 재호출/완료 후 재호출 시 아무 일도 없음 (중복 실행 없음)', again.events.length === 0 && again.run === c.run);
}
{
  // Pause / resume
  let { run } = W.startWorkout(plan, T0);
  ({ run } = drive(run, 0, 60000));
  run = W.pauseWorkout(run, T0 + 60000);
  const frozen = W.remainingMs(run, T0 + 60000);
  const during = drive(run, 60000, 200000);
  check('[T8] 일시정지: 남은 시간 고정, 전환·응원 없음', W.remainingMs(during.run, T0 + 200000) === frozen && frozen === 120000 && during.events.length === 0, { frozen });
  run = W.resumeWorkout(during.run, T0 + 200000);
  check('[T9] 재개: 멈춘 지점부터 이어서 (남은 120초)', W.remainingMs(run, T0 + 200000) === 120000 && W.remainingMs(run, T0 + 230000) === 90000);
  const after = drive(run, 200250, 200000 + 120000);
  const half = after.events.find((e) => e.id === '1:work:w_half');
  check('[D6] 일시정지 동안 예정 응원이 잘못 실행되지 않음 (절반 응원은 재개 후 실제 90초 지점)', half && half.t >= 200000 + 30000 && half.t <= 200000 + 30250, half?.t);
  check('[T10] 재개 후 정상적으로 휴식 전환', after.run.phase === 'rest' && after.run.workedMs === 180000);
}
{
  // Background tab: no ticks for 5 minutes, then one tick.
  let { run } = W.startWorkout(plan, T0);
  ({ run } = drive(run, 0, 10000));
  const r = W.tickWorkout(run, T0 + 10000 + 300000, 'normal');
  // 180 work + 60 rest = 240 → set 2 starts at 240 s; at 310 s set 2 has 110 s left.
  check('[T11] 탭 비활성 5분 후 한 번의 틱: 경과 시간 기준으로 정확히 따라잡음 (2세트, 남은 110초)', r.run.phase === 'work' && r.run.set === 2 && W.remainingMs(r.run, T0 + 310000) === 110000, { set: r.run.set, rem: W.remainingMs(r.run, T0 + 310000) });
  const spoken = r.events.filter((e) => !e.stale);
  // While away: 1세트 끝(180 s) → 휴식 → 2세트 시작(240 s). Both are past → shown as stale, not spoken late.
  check('[T12] 지나간 전환은 늦게 말하지 않음 (stale 표시)', r.events.length === 2 && r.events.every((e) => e.stale) && spoken.length === 0, r.events.map((e) => [e.id, e.stale]));
  const r2 = W.tickWorkout(r.run, T0 + 330000, 'normal');
  check('[T12b] 돌아온 뒤 다음 응원(2세트 절반, 330초)은 제때 실행', r2.events.length === 1 && r2.events[0].id === '2:work:w_half' && !r2.events[0].stale, r2.events.map((e) => e.id));
}
{
  // Early stop
  let { run } = W.startWorkout(plan, T0);
  ({ run } = drive(run, 0, 45000));
  run = W.stopWorkout(run, T0 + 45000);
  const res = W.workoutResult(run, T0 + 45000);
  check('[T13] 조기 종료: 완료 상태 + 실제 작업 시간 45초 기록', run.phase === 'done' && res.endedEarly && res.workedSeconds === 45 && res.completedSets === 0, res);
  check('[T14] 종료 후 틱해도 아무 이벤트 없음 (예약된 응원 실행 안 됨)', W.tickWorkout(run, T0 + 200000, 'frequent').events.length === 0);
}
{
  // Cheer levels
  const ids = (lvl) => drive(W.startWorkout(plan, T0).run, 0, 240000, lvl).events.filter((e) => e.type === 'cue').map((e) => e.id.split(':')[2]);
  check('[D7] 응원 끄기: 응원 0개 (전환 안내는 유지)', ids('off').length === 0 && drive(W.startWorkout(plan, T0).run, 0, 240000, 'off').events.some((e) => e.type === 'rest_start'));
  check('[D8] 최소: 세트 전환 예고만', eq(ids('minimal'), ['r_next']), ids('minimal'));
  check('[D9] 자주: 1/3·절반·2/3·마지막 30초', eq(ids('frequent'), ['w_third', 'w_half', 'w_twothird', 'w_last30', 'r_next']), ids('frequent'));
}
{
  // Short sets: 30 s × 2, rest 10 s
  const short = { ...plan, exerciseDurationSeconds: 30, sets: 2, restDurationSeconds: 10 };
  const r = drive(W.startWorkout(short, T0).run, 0, 75000);
  check('[T15] 짧은 세트(30초×2, 휴식 10초): 10초 남음 응원, 불가능한 "마지막 30초" 없음, 완료', r.run.phase === 'done' && r.events.filter((e) => e.id.endsWith('w_last10')).length === 2 && !r.events.some((e) => e.id.endsWith('w_last30')), r.events.map((e) => e.id));
  // No rest: sets chain directly
  const nr = drive(W.startWorkout({ ...plan, exerciseDurationSeconds: 20, sets: 3, restDurationSeconds: 0 }, T0).run, 0, 61000);
  check('[T16] 휴식 0초: 세트가 바로 이어지고 60초에 완료', nr.run.phase === 'done' && nr.events.filter((e) => e.type === 'rest_start').length === 0 && nr.run.finishedAt === T0 + 60000);
}
{
  // Plan change while running
  let { run } = W.startWorkout(plan, T0);
  ({ run } = drive(run, 0, 30000));
  run = W.changeRunPlan(run, { ...plan, exerciseDurationSeconds: 60, sets: 4, restDurationSeconds: 30 });
  check('[T17] 실행 중 설정 변경: 현재 세트 시간은 유지(남은 150초), 세트 수 즉시 반영', W.remainingMs(run, T0 + 30000) === 150000 && run.plan.sets === 4);
  const r = drive(run, 30250, 180000 + 30000 + 60000 + 1000);
  check('[T18] 변경된 휴식(30초)·운동 시간(60초)은 다음 단계부터 적용', r.run.set === 2 && r.run.phase === 'rest' && r.run.workedMs === 180000 + 60000, { set: r.run.set, phase: r.run.phase, worked: r.run.workedMs });
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
