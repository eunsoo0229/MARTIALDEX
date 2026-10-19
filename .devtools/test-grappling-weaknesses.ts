// Pure tests for the grappling weakness detectors (weaknessScenes.ts) with CONSTRUCTED pose
// sequences — there is no labelled grappling video in the repo, so these check the geometry
// rules and the "fire / don't fire" logic, not real-world accuracy.
// Run inside the app's Vite environment (the technique DB loader needs import.meta.glob):
//   node .devtools/run-grappling-weakness-tests.mjs
import { findWeaknessScenes, isGrounded, torsoLean } from '../src/lib/sparringAnalysis/weaknessScenes';
import type { PoseFrame } from '../src/lib/poseAnalysis/types';
import type { TrackedFrame } from '../src/lib/sparringAnalysis/personTracker';
import type { MotionEvent } from '../src/lib/sparringAnalysis/types';

let pass = 0;
let fail = 0;
const check = (n: string, ok: boolean, d = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${!ok && d ? ' :: ' + d : ''}`);
};

const P = (x: number, y: number) => ({ x, y, z: 0, visibility: 0.99 });
/** Upright fighter centred at cx (hip y ≈ 0.6). */
function standing(cx: number, hipY = 0.6): PoseFrame {
  return {
    timestampMs: 0,
    nose: P(cx, hipY - 0.32),
    leftShoulder: P(cx - 0.04, hipY - 0.25),
    rightShoulder: P(cx + 0.04, hipY - 0.25),
    leftWrist: P(cx - 0.03, hipY - 0.3),
    rightWrist: P(cx + 0.03, hipY - 0.3),
    leftHip: P(cx - 0.03, hipY),
    rightHip: P(cx + 0.03, hipY),
    leftKnee: P(cx - 0.03, hipY + 0.15),
    rightKnee: P(cx + 0.03, hipY + 0.15),
    leftAnkle: P(cx - 0.03, hipY + 0.3),
    rightAnkle: P(cx + 0.03, hipY + 0.3),
  };
}
/** Standing but bent forward ~55°, head below shoulders. */
function bent(cx: number): PoseFrame {
  return { ...standing(cx), nose: P(cx + 0.22, 0.47), leftShoulder: P(cx + 0.17, 0.44), rightShoulder: P(cx + 0.19, 0.45) };
}
/** Lying horizontally; hipY sets the height in the frame. */
function lying(cx: number, hipY: number): PoseFrame {
  return {
    timestampMs: 0,
    nose: P(cx - 0.3, hipY),
    leftShoulder: P(cx - 0.24, hipY - 0.01),
    rightShoulder: P(cx - 0.24, hipY + 0.01),
    leftHip: P(cx, hipY - 0.01),
    rightHip: P(cx, hipY + 0.01),
    leftKnee: P(cx + 0.14, hipY),
    rightKnee: P(cx + 0.14, hipY),
    leftAnkle: P(cx + 0.28, hipY),
    rightAnkle: P(cx + 0.28, hipY),
    leftWrist: P(cx - 0.2, hipY),
    rightWrist: P(cx - 0.2, hipY),
  };
}
const frames = (poses: (PoseFrame | null)[]): TrackedFrame[] => poses.map((p, i) => ({ timestampSec: i, landmarks: p, matched: !!p }));
const ev = (t: number, category: MotionEvent['category']): MotionEvent => ({ timestampSec: t, category, label: '', confidence: 'medium' });
const run = (o: Partial<Parameters<typeof findWeaknessScenes>[0]> & { me: TrackedFrame[] }) =>
  findWeaknessScenes({ martialArt: 'wrestling', durationSec: o.me.length, identity: o.me.map(() => 'unobserved'), attireUsed: false, myEvents: [], opponentEvents: [], postureSegments: [], sampleIntervalSec: 1, ...o });
const types = (r: ReturnType<typeof findWeaknessScenes>) => r.weaknesses.map((w) => w.situationType);

// geometry helpers
check('[G0] 서 있는 자세: 기울기 작음, 바닥 아님', (torsoLean(standing(0.4)) ?? 99) < 15 && isGrounded(standing(0.4)) === false);
check('[G0b] 누운 자세: 바닥으로 판정', isGrounded(lying(0.5, 0.8)) === true);
check('[G0c] 숙인 자세: 40° 이상', (torsoLean(bent(0.4)) ?? 0) > 40, String(torsoLean(bent(0.4))));

const N = 30;
// 1. 상대 진입에 방어 반응 없음 (opponent level changes at 5,12,20; I stay upright, no exit)
{
  const me = frames(Array.from({ length: N }, () => standing(0.4)));
  const opp = frames(Array.from({ length: N }, () => standing(0.6)));
  const r = run({ me, opponent: opp, opponentEvents: [ev(5, 'level_change_like'), ev(12, 'level_change_like'), ev(20, 'level_change_like')] });
  const w = r.weaknesses.find((x) => x.situationType === 'no_takedown_defense');
  check('[G1] 상대 레벨 체인지 3회에 무반응 → "상대 진입 방어 반응 늦음" (3/3, 타임스탬프 5·12·20초)', !!w && w.occurrences.length === 3 && w.occurrences.map((o) => o.eventSec).join() === '5,12,20', JSON.stringify(types(r)));
  // sprawl: my hips drop right after each shot
  const sprawl = frames(Array.from({ length: N }, (_, i) => ([5, 6, 12, 13, 20, 21].includes(i) && [6, 13, 21].includes(i) ? standing(0.4, 0.75) : standing(0.4))));
  const r2 = run({ me: sprawl, opponent: opp, opponentEvents: [ev(5, 'level_change_like'), ev(12, 'level_change_like'), ev(20, 'level_change_like')] });
  check('[G1b] 진입마다 엉덩이를 낮춰 스프롤 → 약점 아님', !types(r2).includes('no_takedown_defense'), JSON.stringify(types(r2)));
}
// 2. 근접 상황 상체 숙여짐 (close to opponent, bent in 3 separate episodes)
{
  const me = frames(Array.from({ length: N }, (_, i) => ([4, 5, 14, 15, 24].includes(i) ? bent(0.45) : standing(0.45))));
  const opp = frames(Array.from({ length: N }, () => standing(0.55)));
  const r = run({ me, opponent: opp });
  const w = r.weaknesses.find((x) => x.situationType === 'clinch_posture_break');
  check('[G2] 붙은 상태에서 상체 숙임 3번 → "근접 상황에서 상체가 숙여짐"', !!w && w.occurrences.length === 3, JSON.stringify(r.weaknesses.map((x) => [x.situationType, x.occurrences.length, x.opportunities])));
  const upright = run({ me: frames(Array.from({ length: N }, () => standing(0.45))), opponent: opp });
  check('[G2b] 붙어 있어도 상체를 세우고 있음 → 약점 아님', !types(upright).includes('clinch_posture_break'));
  const far = run({ me: frames(Array.from({ length: N }, (_, i) => ([4, 14, 24].includes(i) ? bent(0.1) : standing(0.1)))), opponent: frames(Array.from({ length: N }, () => standing(0.8))) });
  check('[G2c] 상대와 멀리 떨어져 숙인 것은 근접 자세로 세지 않음', !types(far).includes('clinch_posture_break'));
}
// 3. 그라운드 아래쪽 (both lying, my hips lower in 2 episodes of ≥2 frames)
{
  const me = frames(Array.from({ length: N }, (_, i) => ((i >= 5 && i <= 7) || (i >= 15 && i <= 17) ? lying(0.5, 0.85) : i >= 24 && i <= 25 ? lying(0.5, 0.7) : standing(0.4))));
  const opp = frames(Array.from({ length: N }, (_, i) => ((i >= 5 && i <= 7) || (i >= 15 && i <= 17) || (i >= 24 && i <= 25) ? lying(0.5, 0.78) : standing(0.6))));
  const r = run({ me, opponent: opp, martialArt: 'bjj' });
  const w = r.weaknesses.find((x) => x.situationType === 'bottom_position');
  check('[G3] 바닥에서 2번 아래쪽(각 3프레임), 1번 위쪽 → "아래쪽에 오래 머묾" 2/3 · 분류 계수 0.6(잠정)', !!w && w.occurrences.length === 2 && w.opportunities === 3 && w.confidenceBasis.classification === 0.6 && w.status !== 'observed', JSON.stringify(w ? [w.occurrences.length, w.opportunities, w.status] : types(r)));
}
// 4. 진입 후 마무리 없음 (my level changes, no clinch, opponent never goes down)
{
  const me = frames(Array.from({ length: N }, () => standing(0.3)));
  const opp = frames(Array.from({ length: N }, () => standing(0.7)));
  const r = run({ me, opponent: opp, myEvents: [ev(4, 'level_change_like'), ev(11, 'level_change_like'), ev(19, 'level_change_like')] });
  check('[G4] 레벨 체인지 3회 모두 접촉·넘어짐 없음 → "진입 후 마무리 연결 없음"', types(r).includes('takedown_no_finish'), JSON.stringify(types(r)));
  const finished = run({ me, opponent: opp, myEvents: [ev(4, 'level_change_like'), ev(5, 'clinch_like'), ev(11, 'level_change_like'), ev(12, 'clinch_like'), ev(19, 'level_change_like'), ev(20, 'clinch_like')] });
  check('[G4b] 진입마다 접촉(클린치)까지 이어짐 → 약점 아님', !types(finished).includes('takedown_no_finish'));
}
// 5. sport routing
{
  const me = frames(Array.from({ length: N }, () => standing(0.4)));
  const opp = frames(Array.from({ length: N }, () => standing(0.6)));
  const shots = [ev(5, 'level_change_like'), ev(12, 'level_change_like'), ev(20, 'level_change_like')];
  const boxing = run({ me, opponent: opp, opponentEvents: shots, martialArt: 'boxing' });
  const mma = run({ me, opponent: opp, opponentEvents: shots, martialArt: 'mma' });
  check('[G5] 복싱은 그래플링 감지를 적용하지 않음', !types(boxing).some((t) => ['takedown_no_finish', 'no_takedown_defense', 'clinch_posture_break', 'bottom_position'].includes(t)));
  check('[G5b] MMA는 그래플링 감지도 적용', types(mma).includes('no_takedown_defense'));
  check('[G5c] 그래플링 종목은 측정 한계 안내 포함', run({ me, opponent: opp, martialArt: 'judo' }).notes.some((n) => n.includes('그립')));
}
// 6. honesty: opponent not tracked → no opponent-dependent grappling weaknesses
{
  const me = frames(Array.from({ length: N }, (_, i) => ([4, 14, 24].includes(i) ? bent(0.45) : standing(0.45))));
  const r = run({ me, opponent: [] });
  check('[G6] 상대 추적 없음 → 근접 자세·그라운드·진입 방어 판단 안 함 + 안내', !types(r).some((t) => ['clinch_posture_break', 'bottom_position', 'no_takedown_defense'].includes(t)) && r.notes.some((n) => n.includes('상대가 추적되지 않아')), JSON.stringify(r.notes));
}

console.log(`\n${pass}/${pass + fail} passed`);
(globalThis as { __testResult?: { pass: number; fail: number } }).__testResult = { pass, fail };
