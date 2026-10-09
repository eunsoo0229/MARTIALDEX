// Pure tests: 매칭 알고리즘 + 타임라인 계산. Run: npx tsx .devtools/test-gym-live-logic.ts
import { planRounds } from '../src/lib/gymLive/matching';
import { completedSetFlags, elapsedAt, viewAt, workSecondsPerSet } from '../src/lib/gymLive/timeline';
import type { LiveSession } from '../src/lib/gymLive/types';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${!ok && detail ? ' :: ' + detail : ''}`);
}

const key = (a: string, b: string) => [a, b].sort().join('|');

// ---------- matching ----------
const eight = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
let consecutive = 0;
let everyonePairedEveryRound = true;
let maxMeet = 0;
const layouts = new Set<string>();
for (let run = 0; run < 200; run++) {
  const plan = planRounds(eight, 3);
  const meet = new Map<string, number>();
  plan.forEach((r, i) => {
    const ids = r.pairs.flat();
    if (ids.length !== 8 || new Set(ids).size !== 8 || r.bye) everyonePairedEveryRound = false;
    for (const [a, b] of r.pairs) {
      meet.set(key(a, b), (meet.get(key(a, b)) ?? 0) + 1);
      if (i > 0 && plan[i - 1].pairs.some(([c, d]) => key(c, d) === key(a, b))) consecutive++;
    }
  });
  maxMeet = Math.max(maxMeet, ...meet.values());
  layouts.add(JSON.stringify(plan[0].pairs.map(([a, b]) => key(a, b)).sort()));
}
check('[M1] 8명 × 3라운드: 매 라운드 전원 2명씩 매칭(대기 없음)', everyonePairedEveryRound);
check('[M2] 8명: 직전 라운드 상대와 재대결 0회 (200회 시뮬레이션)', consecutive === 0, String(consecutive));
check('[M3] 8명 3라운드: 같은 상대와 2번 이상 붙지 않음', maxMeet === 1, String(maxMeet));
check('[M4] 무작위성: 1라운드 매칭이 매번 다름 (200회 중 서로 다른 조합 > 50)', layouts.size > 50, String(layouts.size));

let fiveByeFair = true;
let fiveByeRepeat = 0;
let fiveRematch = 0;
for (let run = 0; run < 200; run++) {
  const plan = planRounds(['A', 'B', 'C', 'D', 'E'], 5);
  const byes = plan.map((r) => r.bye);
  const counts = new Map<string, number>();
  byes.forEach((b) => b && counts.set(b, (counts.get(b) ?? 0) + 1));
  if (counts.size !== 5 || [...counts.values()].some((c) => c !== 1)) fiveByeFair = false;
  byes.forEach((b, i) => i > 0 && b === byes[i - 1] && fiveByeRepeat++);
  plan.forEach((r, i) => {
    if (i === 0) return;
    for (const [a, b] of r.pairs) if (plan[i - 1].pairs.some(([c, d]) => key(c, d) === key(a, b))) fiveRematch++;
  });
}
check('[M5] 5명 × 5라운드: 매 라운드 1명 대기, 5명이 정확히 1번씩 대기(특정 학생만 계속 쉬지 않음)', fiveByeFair);
check('[M6] 5명: 대기자가 다음 라운드에 연속 대기하지 않음', fiveByeRepeat === 0, String(fiveByeRepeat));
check('[M7] 5명: 직전 라운드 상대 재대결 0회', fiveRematch === 0, String(fiveRematch));

const three = planRounds(['A', 'B', 'C'], 3);
const threeByes = three.map((r) => r.bye);
check('[M8] 3명 × 3라운드: 매번 다른 1명 대기 (A,B,C 모두 1번씩)', new Set(threeByes).size === 3 && three.every((r) => r.pairs.length === 1), JSON.stringify(three));
check('[M9] 3명: 3라운드 동안 모든 조합(AB, AC, BC)이 한 번씩', new Set(three.map((r) => key(...r.pairs[0]))).size === 3);

const two = planRounds(['A', 'B'], 3);
check('[M10] 2명 × 3라운드: 연속 대결이 불가피해도 매 라운드 매칭 생성', two.length === 3 && two.every((r) => r.pairs.length === 1 && !r.bye));
check('[M11] 1명 이하면 매칭 없음 (오류 없이)', planRounds(['A'], 3).length === 0);
const big = planRounds(Array.from({ length: 20 }, (_, i) => `S${i}`), 4);
let bigRematch = 0;
big.forEach((r, i) => i > 0 && r.pairs.forEach(([a, b]) => big[i - 1].pairs.some(([c, d]) => key(c, d) === key(a, b)) && bigRematch++));
check('[M12] 20명(휴리스틱 경로): 전원 매칭 + 직전 상대 재대결 0', big.every((r) => r.pairs.length === 10) && bigRematch === 0, String(bigRematch));

// ---------- timeline ----------
const base: LiveSession = {
  id: 's', gymId: 'g', coachUserId: 'c', kind: 'drill', title: 'Jab', techniqueId: 'jab', techniqueName: 'Jab', martialArt: 'boxing',
  workSeconds: 30, restSeconds: 15, totalSets: 5, status: 'running', anchorAt: 1_000_000, anchorElapsedMs: 0, segments: [],
  startedAt: null, endedAt: null, endedElapsedMs: null, version: 1, createdAt: '',
};
const at = (ms: number) => viewAt(base, 1_000_000 + ms);
check('[T1] 시작 직후: SET 1 훈련 00:30', at(0).setIndex === 0 && at(0).phase === 'work' && at(0).remainingMs === 30000);
check('[T2] 13초 후: SET 1 훈련 17초 남음, 다음 휴식 15초', at(13000).remainingMs === 17000 && at(13000).next.phase === 'rest' && at(13000).next.durationMs === 15000);
check('[T3] 31초 후: SET 1 휴식 14초 남음', at(31000).phase === 'rest' && at(31000).setIndex === 0 && at(31000).remainingMs === 14000);
check('[T4] 45초 후: SET 2 훈련 시작', at(45000).phase === 'work' && at(45000).setIndex === 1 && at(45000).remainingMs === 30000);
check('[T5] 마지막 세트 뒤에는 휴식 없음 → 210초에 종료', at(209999).setIndex === 4 && at(209999).phase === 'work' && at(210000).phase === 'done' && at(500000).remainingMs === 0);
const paused: LiveSession = { ...base, status: 'paused', anchorElapsedMs: 50000, segments: [[0, 50000]] };
check('[T6] 일시정지: 시간이 흘러도 남은 시간 고정 (SET 2, 25초)', viewAt(paused, 9e9).remainingMs === 25000 && viewAt(paused, 9e9).phase === 'paused' && viewAt(paused, 9e9).underlyingPhase === 'work');
check('[T7] 서로 다른 기기라도 같은 서버 시각이면 같은 값', JSON.stringify(viewAt(base, 1_020_000)) === JSON.stringify(viewAt({ ...base }, 1_020_000)));
// 2세트 후 관장 종료: segments [0..80000] → sets 1,2 complete, set 3 had 5s.
const ended: LiveSession = { ...base, status: 'interrupted', anchorElapsedMs: 95000, endedElapsedMs: 95000, segments: [[0, 95000]] };
check('[T8] 중간 종료: 실제로 끝까지 한 2세트만 완료, 3세트는 5초만', JSON.stringify(completedSetFlags(ended, 0)) === '[true,true,false,false,false]' && workSecondsPerSet(ended, 0)[2] === 5, JSON.stringify(workSecondsPerSet(ended, 0)));
// 관장이 SET 1 훈련 10초 시점에 "다음 세트" → SET 1 미완료
const skipped: LiveSession = { ...base, anchorElapsedMs: 45000, anchorAt: 1_000_000, segments: [[0, 10000]] };
check('[T9] 훈련 중 다음 세트로 건너뜀 → 그 세트는 완료 아님 (10초만 기록)', !completedSetFlags(skipped, 1_000_000)[0] && workSecondsPerSet(skipped, 1_000_000)[0] === 10);
const done: LiveSession = { ...base, status: 'completed', segments: [[0, 210000]], anchorElapsedMs: 210000, endedElapsedMs: 210000 };
check('[T10] 정상 완료: 5/5 세트, 세트별 30초', completedSetFlags(done, 0).every(Boolean) && workSecondsPerSet(done, 0).every((s) => s === 30));
check('[T11] 일시정지/재개가 섞인 구간도 정확히 합산', JSON.stringify(workSecondsPerSet({ ...base, status: 'completed', segments: [[0, 12000], [12000, 210000]], endedElapsedMs: 210000 }, 0)) === '[30,30,30,30,30]');
check('[T12] 경과 시간은 총 길이를 넘지 않음', elapsedAt(base, 1_000_000 + 1e9) === 210000);
const noRest: LiveSession = { ...base, restSeconds: 0, totalSets: 2 };
check('[T13] 휴식 0초: 다음은 바로 훈련', viewAt(noRest, 1_010_000).next.phase === 'work' && viewAt(noRest, 1_030_000).setIndex === 1);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
