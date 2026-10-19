import type { PoseFrame, PoseLandmarkPoint } from '../poseAnalysis/types';
import { point } from '../poseAnalysis/geometry';
import { searchTechniques } from '../search';
import { isSyntheticTrainingDomain } from '../loadData';
import type { FrameIdentity } from './attire';
import type { TrackedFrame } from './personTracker';
import type {
  MotionEvent,
  PostureSegment,
  SequenceAnalysisResult,
  SparringClip,
  SparringWeakness,
  WeaknessConfidenceBasis,
  WeaknessOccurrence,
  WeaknessStatus,
} from './types';

// 약점 장면 — weaknesses with WHEN they happen in the original video, found
// only from what the pipeline measured (tracked pose geometry + detected
// motion events), never from AI narration. Each weakness carries:
//   - observedEvidence (what the data shows) vs inference (interpretation),
//   - occurrences with original-video timestamps → clip windows,
//   - a provisional confidence built from stated factors (no ground-truth
//     calibration exists yet; the basis says so).
// Striking detectors run for striking sports, grappling detectors for
// wrestling / judo / sambo / bjj, and both for MMA. Grappling detectors read
// body geometry of BOTH tracked fighters (hip height, torso lean, distance,
// who is lower on the ground) — camera angle limits them, which their
// notes and (for top/bottom) a lower classification factor say.

const CLIP_BEFORE_SEC = 3;
const CLIP_AFTER_SEC = 3.5;
const CLIP_MAX_SEC = 12;
const MAX_CLIPS_PER_WEAKNESS = 2;
const GRAPPLING_SPORTS = ['bjj', 'judo', 'wrestling', 'sambo'];
const STRIKING_SPORTS = ['boxing', 'kickboxing', 'muay-thai', 'taekwondo', 'karate'];

type GuardState = 'up' | 'mid' | 'down';

function mid(a: PoseLandmarkPoint, b: PoseLandmarkPoint) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Hands relative to shoulders/torso (image y grows downward). null = not visible enough. */
export function guardState(pose: PoseFrame | null): GuardState | null {
  if (!pose) return null;
  const ls = point(pose, 'leftShoulder');
  const rs = point(pose, 'rightShoulder');
  const lh = point(pose, 'leftHip');
  const rh = point(pose, 'rightHip');
  const lw = point(pose, 'leftWrist');
  const rw = point(pose, 'rightWrist');
  if (!ls || !rs || !lh || !rh || !lw || !rw) return null;
  const sh = mid(ls, rs);
  const torso = Math.abs(mid(lh, rh).y - sh.y);
  if (torso < 0.02) return null;
  const lowest = Math.max(lw.y, rw.y);
  if (Math.max(lw.y, rw.y) <= sh.y) return 'up';
  if (lowest > sh.y + torso * 0.3) return 'down';
  return 'mid';
}

interface Ctx {
  martialArt: string;
  durationSec: number;
  me: TrackedFrame[];
  /** Opponent tracked on the same sample timestamps (personTracker.trackOpponent); [] when not tracked. */
  opponent?: TrackedFrame[];
  identity: FrameIdentity[];
  attireUsed: boolean;
  myEvents: MotionEvent[];
  opponentEvents: MotionEvent[];
  postureSegments: PostureSegment[];
  sequence?: SequenceAnalysisResult;
  sampleIntervalSec: number;
}

function framesIn(ctx: Ctx, from: number, to: number): { f: TrackedFrame; id: FrameIdentity }[] {
  const out: { f: TrackedFrame; id: FrameIdentity }[] = [];
  ctx.me.forEach((f, i) => {
    if (f.timestampSec > from && f.timestampSec <= to && f.matched && ctx.identity[i] !== 'opponent') out.push({ f, id: ctx.identity[i] });
  });
  return out;
}

function identityShare(ctx: Ctx, occ: WeaknessOccurrence[]): number {
  if (!ctx.attireUsed) return 0.6;
  let me = 0;
  let seen = 0;
  for (const o of occ) {
    for (const { id } of framesIn(ctx, o.startSec, o.endSec)) {
      if (id === 'unobserved') continue;
      seen++;
      if (id === 'me') me++;
    }
  }
  return seen ? me / seen : 0.5;
}

function window(ctx: Ctx, t: number): { startSec: number; endSec: number } {
  let start = Math.max(0, t - CLIP_BEFORE_SEC);
  let end = Math.min(ctx.durationSec, t + CLIP_AFTER_SEC);
  if (end - start > CLIP_MAX_SEC) end = start + CLIP_MAX_SEC;
  if (end - start < 2) {
    start = Math.max(0, end - 2);
    end = Math.min(ctx.durationSec, start + 2);
  }
  return { startSec: Math.round(start * 10) / 10, endSec: Math.round(end * 10) / 10 };
}

function relatedTechniques(martialArt: string, queries: string[]): string[] {
  const filters = martialArt === 'mma' ? {} : { martialArt };
  const ids: string[] = [];
  for (const q of queries) {
    for (const t of searchTechniques(q, 3, filters)) {
      if (!isSyntheticTrainingDomain(t.martialArt) && !ids.includes(t.id)) ids.push(t.id);
    }
    if (ids.length >= 3) break;
  }
  return ids.slice(0, 3);
}

function build(
  ctx: Ctx,
  partial: Omit<SparringWeakness, 'id' | 'subject' | 'martialArt' | 'startSec' | 'eventSec' | 'endSec' | 'confidence' | 'confidenceBasis' | 'status' | 'verifiedOnVideo' | 'curriculumId' | 'clipIds' | 'relatedTechniqueIds'>,
  /** All opportunities, including ones where the needed body points weren't visible (partial.opportunities = the visible ones). */
  totalOpportunities: number,
  classification: number,
  techniqueQueries: string[],
  extraNotes: string[] = []
): SparringWeakness | null {
  const occ = partial.occurrences;
  if (occ.length < 2 || partial.opportunities === 0) return null;
  const consistency = occ.length / partial.opportunities;
  if (consistency < 0.35) return null;
  const identity = identityShare(ctx, occ);
  const observability = totalOpportunities > 0 ? Math.min(1, partial.opportunities / totalOpportunities) : 0;
  const confidence = Math.round(100 * identity * (0.5 + 0.5 * observability) * (0.4 + 0.6 * consistency) * classification);
  const status: WeaknessStatus = confidence >= 60 && classification === 1 && occ.length >= 3 ? 'observed' : confidence >= 35 ? 'tentative' : 'on_hold';
  const basis: WeaknessConfidenceBasis = {
    identity: Math.round(identity * 100) / 100,
    observability: Math.round(observability * 100) / 100,
    consistency: Math.round(consistency * 100) / 100,
    classification,
    calibrated: false,
    notes: [
      ctx.attireUsed ? '선수 식별: 위치 추적 + 입력한 복장 색 비교' : '선수 식별: 위치 추적만 사용 (복장 정보 없음)',
      `프레임 간격 약 ${ctx.sampleIntervalSec.toFixed(1)}초 — 그 사이의 동작은 보지 못했습니다`,
      '정답 라벨이 있는 검증 영상으로 보정되지 않은 임시 지표입니다',
      ...extraNotes,
    ],
  };
  const first = occ[0];
  return {
    ...partial,
    id: `${partial.situationType}-${Math.round(first.eventSec * 10)}`,
    subject: 'me',
    martialArt: ctx.martialArt,
    startSec: first.startSec,
    eventSec: first.eventSec,
    endSec: first.endSec,
    confidence,
    confidenceBasis: basis,
    status,
    verifiedOnVideo: null,
    relatedTechniqueIds: relatedTechniques(ctx.martialArt, techniqueQueries),
    curriculumId: null,
    clipIds: [],
  };
}

const isAttack = (e: MotionEvent) => e.category === 'strike_like' || e.category === 'kick_like';
const isMove = (e: MotionEvent) => e.category === 'footwork_movement' || e.category === 'distance_exit_like';

function postAttackGuard(ctx: Ctx): SparringWeakness | null {
  const occ: WeaknessOccurrence[] = [];
  let opportunities = 0;
  let observed = 0;
  for (const e of ctx.myEvents.filter(isAttack)) {
    const frames = framesIn(ctx, e.timestampSec, e.timestampSec + 2);
    const states = frames.map(({ f }) => guardState(f.landmarks)).filter((s): s is GuardState => !!s);
    opportunities++;
    if (states.length === 0) continue;
    observed++;
    if (states.every((s) => s === 'down')) occ.push({ eventSec: e.timestampSec, ...window(ctx, e.timestampSec), note: '공격 직후 2초 동안 측정된 손 위치가 모두 어깨선 아래' });
  }
  return build(
    ctx,
    {
      situationType: 'post_attack_guard',
      title: '공격 후 가드가 늦게 올라옴',
      description: '공격 동작 뒤 손이 얼굴 높이로 돌아오지 않은 장면이 반복됐습니다.',
      observedEvidence: [`타격·킥 동작 ${opportunities}회 중 ${observed}회는 직후 손 위치를 확인할 수 있었고, 그중 ${occ.length}회는 손이 어깨선 아래에 머물렀습니다.`],
      inference: '공격 후 회수 동작보다 다음 동작으로 바로 넘어가면서 반격에 노출될 수 있는 상태로 보입니다(추론).',
      recommendation: '공격 1회마다 손을 턱 옆으로 되돌리는 "치고-회수" 동작을 거울 앞에서 천천히 반복한 뒤, 파트너가 가볍게 되받아치는 통제된 드릴로 넓힙니다.',
      occurrences: occ,
      opportunities: observed,
    },
    opportunities,
    1,
    ['guard', 'high guard', 'parry']
  );
}

function noReaction(ctx: Ctx): SparringWeakness | null {
  if (ctx.opponentEvents.length === 0) return null;
  const occ: WeaknessOccurrence[] = [];
  let opportunities = 0;
  let observed = 0;
  for (const e of ctx.opponentEvents.filter(isAttack)) {
    opportunities++;
    if (framesIn(ctx, e.timestampSec - 0.5, e.timestampSec + 1.5).length === 0) continue;
    observed++;
    const reacted = ctx.myEvents.some((m) => m.timestampSec >= e.timestampSec - 0.3 && m.timestampSec <= e.timestampSec + 1.5 && (isMove(m) || m.category === 'guard_hold_like' || isAttack(m)));
    if (!reacted) occ.push({ eventSec: e.timestampSec, ...window(ctx, e.timestampSec), note: '상대 공격성 동작 뒤 1.5초 안에 이동·가드·반격 동작이 감지되지 않음' });
  }
  return build(
    ctx,
    {
      situationType: 'no_reaction',
      title: '상대 공격에 반응이 늦음',
      description: '상대의 공격성 동작 직후 이동·가드·반격이 감지되지 않은 장면이 반복됐습니다.',
      observedEvidence: [`상대의 타격·킥 동작 ${opportunities}회 중 ${observed}회는 내 모습이 함께 보였고, 그중 ${occ.length}회는 1.5초 안에 반응 동작이 감지되지 않았습니다.`],
      inference: '상대 공격을 받는 동안 제자리에 머물러 있었을 가능성이 있습니다. 머리 움직임처럼 작은 회피는 감지되지 않을 수 있습니다(추론).',
      recommendation: '파트너가 정해진 공격을 천천히 던지면 매번 한 가지 반응(뒤로 빠지기, 옆으로 각도 바꾸기, 막기)을 고르는 반응 드릴부터 시작합니다.',
      occurrences: occ,
      opportunities: observed,
    },
    opportunities,
    1,
    ['slip', 'footwork', 'parry', 'block'],
    ['머리·상체의 작은 회피는 이 측정으로 보지 못합니다']
  );
}

function staticAfterAttack(ctx: Ctx): SparringWeakness | null {
  const occ: WeaknessOccurrence[] = [];
  let opportunities = 0;
  let observed = 0;
  for (const e of ctx.myEvents.filter(isAttack)) {
    opportunities++;
    if (framesIn(ctx, e.timestampSec, e.timestampSec + 2.5).length === 0) continue;
    observed++;
    const moved = ctx.myEvents.some((m) => m.timestampSec > e.timestampSec && m.timestampSec <= e.timestampSec + 2.5 && isMove(m));
    if (!moved) occ.push({ eventSec: e.timestampSec, ...window(ctx, e.timestampSec), note: '공격 후 2.5초 안에 이동·거리 이탈이 감지되지 않음' });
  }
  return build(
    ctx,
    {
      situationType: 'static_after_attack',
      title: '공격 후 제자리에 머묾',
      description: '공격한 뒤 각도를 바꾸거나 빠지는 이동이 감지되지 않은 장면이 반복됐습니다.',
      observedEvidence: [`내 공격성 동작 ${observed}회 중 ${occ.length}회는 이후 2.5초 동안 이동이 감지되지 않았습니다.`],
      inference: '공격 뒤 같은 위치에 머물러 상대가 되받아치기 쉬운 거리에 남았을 수 있습니다(추론).',
      recommendation: '콤비네이션 마지막에 한 발 옆으로 빠지거나 피벗하는 동작을 붙여 섀도 → 미트 → 가벼운 스파링 순으로 연습합니다.',
      occurrences: occ,
      opportunities: observed,
    },
    opportunities,
    1,
    ['pivot', 'footwork', 'angle']
  );
}

function lateGuardDrop(ctx: Ctx): SparringWeakness | null {
  const guard = (seg: string) => ctx.postureSegments.find((s) => s.segment === seg)?.metrics.find((m) => m.id === 'guard')?.score ?? null;
  const early = guard('early');
  const late = guard('late');
  if (early == null || late == null || early - late < 12) return null;
  const lateStart = (ctx.durationSec * 2) / 3;
  const downs = framesIn(ctx, lateStart, ctx.durationSec).filter(({ f }) => guardState(f.landmarks) === 'down');
  const all = framesIn(ctx, lateStart, ctx.durationSec).filter(({ f }) => guardState(f.landmarks) !== null);
  const picks = downs.filter((_, i) => i % Math.max(1, Math.floor(downs.length / 3)) === 0).slice(0, 3);
  return build(
    ctx,
    {
      situationType: 'late_guard_drop',
      title: '후반으로 갈수록 가드가 내려감',
      description: `가드 점수가 초반 ${early}점에서 후반 ${late}점으로 떨어졌습니다.`,
      observedEvidence: [`가드 점수(0-100) 초반 ${early} → 후반 ${late}`, `후반 구간에서 손 위치를 확인한 ${all.length}개 프레임 중 ${downs.length}개는 손이 어깨선 아래`],
      inference: '시간이 지나며 팔이 무거워지거나 집중이 떨어졌을 가능성이 있습니다. 체력 자체는 측정하지 않았습니다(추론).',
      recommendation: '라운드 후반을 가정해 2~3분 섀도 마지막 30초에 가드 유지에만 집중하는 연습과, 어깨·팔 지구력 보강을 함께 합니다.',
      occurrences: picks.map(({ f }) => ({ eventSec: f.timestampSec, ...window(ctx, f.timestampSec), note: '후반 구간, 손이 어깨선 아래' })),
      opportunities: all.length,
    },
    all.length,
    1,
    ['guard', 'high guard'],
    ['체력·스태미나는 측정하지 않았습니다']
  );
}

function singleAttacks(ctx: Ctx): SparringWeakness | null {
  const tl = ctx.sequence?.timeline ?? [];
  if (tl.length < 4) return null;
  const occ: WeaknessOccurrence[] = [];
  tl.forEach((o, i) => {
    const next = tl[i + 1];
    const prev = tl[i - 1];
    const alone = (!next || next.timestampSec - o.timestampSec > 4) && (!prev || o.timestampSec - prev.timestampSec > 4);
    if (alone) occ.push({ eventSec: o.timestampSec, ...window(ctx, o.timestampSec), note: `${o.techniqueName}(AI 추정) 단독 사용 — 4초 안에 이어진 공격 없음` });
  });
  return build(
    ctx,
    {
      situationType: 'single_attacks',
      title: '공격이 한 번으로 끝나는 경우가 많음',
      description: '연결 없이 단발로 끝난 공격이 많았습니다.',
      observedEvidence: [`감지된 공격 ${tl.length}회 중 ${occ.length}회는 앞뒤 4초 안에 다른 공격이 없었습니다.`],
      inference: '공격을 연결하기보다 한 번씩 시도하는 패턴으로 보입니다. 기술명은 AI 추정이라 다를 수 있습니다(추론).',
      recommendation: '잘 쓰는 공격 하나 뒤에 붙일 두 번째 공격을 정해 2연타 → 3연타 순으로 미트·섀도에서 반복합니다.',
      occurrences: occ,
      opportunities: tl.length,
    },
    tl.length,
    0.6,
    ['combination', '1-2'],
    ['기술 분류는 AI 추정으로 검증되지 않았습니다']
  );
}

// ---------------------------------------------------------------- grappling

function hipMid(p: PoseFrame | null) {
  const lh = p ? point(p, 'leftHip') : null;
  const rh = p ? point(p, 'rightHip') : null;
  return lh && rh ? mid(lh, rh) : null;
}

function shoulderMid(p: PoseFrame | null) {
  const ls = p ? point(p, 'leftShoulder') : null;
  const rs = p ? point(p, 'rightShoulder') : null;
  return ls && rs ? mid(ls, rs) : null;
}

/** Torso lean from vertical in degrees (0 = upright, 90 = horizontal); null when not visible. */
export function torsoLean(p: PoseFrame | null): number | null {
  const sh = shoulderMid(p);
  const hp = hipMid(p);
  if (!sh || !hp) return null;
  const dx = sh.x - hp.x;
  const dy = hp.y - sh.y;
  if (Math.hypot(dx, dy) < 0.02) return null;
  return Math.abs((Math.atan2(Math.abs(dx), dy) * 180) / Math.PI);
}

/** On the ground: torso near horizontal, or hips about as low as the ankles. */
export function isGrounded(p: PoseFrame | null): boolean | null {
  const lean = torsoLean(p);
  const hp = hipMid(p);
  const sh = shoulderMid(p);
  if (lean === null || !hp || !sh) return null;
  if (lean > 62) return true;
  const ankles = [p && point(p, 'leftAnkle'), p && point(p, 'rightAnkle')].filter((a): a is PoseLandmarkPoint => !!a);
  if (!ankles.length) return null;
  const torso = Math.hypot(sh.x - hp.x, sh.y - hp.y);
  const ankleY = Math.max(...ankles.map((a) => a.y));
  return ankleY - hp.y < torso * 0.45;
}

function oppAt(ctx: Ctx, i: number): PoseFrame | null {
  const o = ctx.opponent?.[i];
  return o?.matched ? o.landmarks : null;
}

function centroidDist(a: PoseFrame | null, b: PoseFrame | null): number | null {
  const ha = hipMid(a);
  const hb = hipMid(b);
  return ha && hb ? Math.hypot(ha.x - hb.x, ha.y - hb.y) : null;
}

/** Groups frame indices into runs of consecutive samples (one run = one episode). */
function episodes(indices: number[]): number[][] {
  const runs: number[][] = [];
  for (const i of indices) {
    const last = runs[runs.length - 1];
    if (last && i - last[last.length - 1] <= 1) last.push(i);
    else runs.push([i]);
  }
  return runs;
}

function takedownNoFinish(ctx: Ctx): SparringWeakness | null {
  const occ: WeaknessOccurrence[] = [];
  let opportunities = 0;
  let observed = 0;
  for (const e of ctx.myEvents.filter((x) => x.category === 'level_change_like')) {
    opportunities++;
    if (framesIn(ctx, e.timestampSec, e.timestampSec + 3).length === 0) continue;
    observed++;
    const contact = ctx.myEvents.some((m) => m.category === 'clinch_like' && m.timestampSec >= e.timestampSec - 0.5 && m.timestampSec <= e.timestampSec + 3);
    const oppDown = (ctx.opponent ?? []).some((o, i) => o.timestampSec > e.timestampSec && o.timestampSec <= e.timestampSec + 4 && isGrounded(oppAt(ctx, i)) === true);
    if (!contact && !oppDown) occ.push({ eventSec: e.timestampSec, ...window(ctx, e.timestampSec), note: '레벨 체인지 후 3초 안에 접촉(클린치)이나 상대가 넘어지는 장면이 감지되지 않음' });
  }
  return build(
    ctx,
    {
      situationType: 'takedown_no_finish',
      title: '진입 후 마무리 연결이 없음',
      description: '자세를 낮춰 들어간 뒤 상대와 붙거나 넘어뜨리는 데까지 이어지지 않은 장면이 반복됐습니다.',
      observedEvidence: [`레벨 체인지 ${opportunities}회 중 ${observed}회는 이후 장면이 보였고, 그중 ${occ.length}회는 3초 안에 접촉·넘어짐이 감지되지 않았습니다.`],
      inference: '진입 거리나 타이밍이 멀어 상대에게 닿기 전에 멈췄거나, 진입 후 두 번째 동작으로 이어가지 못했을 가능성이 있습니다(추론).',
      recommendation: '벽이나 파트너를 두고 레벨 체인지 → 페네트레이션 스텝 → 머리 위치·양손 연결까지 한 동작으로 이어지게 천천히 반복한 뒤, 상대가 가볍게 저항하는 체인 레슬링 드릴로 넓힙니다.',
      occurrences: occ,
      opportunities: observed,
    },
    opportunities,
    1,
    ['double leg', 'single leg', 'penetration step'],
    ['진입 성공은 접촉(근접)·상대가 넘어짐으로만 추정합니다 — 그립 상태는 측정하지 않습니다']
  );
}

function noTakedownDefense(ctx: Ctx): SparringWeakness | null {
  if (ctx.opponentEvents.length === 0) return null;
  const occ: WeaknessOccurrence[] = [];
  let opportunities = 0;
  let observed = 0;
  for (const e of ctx.opponentEvents.filter((x) => x.category === 'level_change_like')) {
    opportunities++;
    const near = ctx.me.map((f, i) => ({ f, i })).filter(({ f }) => f.matched && f.timestampSec >= e.timestampSec - 1.5 && f.timestampSec <= e.timestampSec + 1.5);
    if (near.length < 2) continue;
    observed++;
    const hipYs = near.map(({ f }) => hipMid(f.landmarks)?.y).filter((y): y is number => y != null);
    const torso = near.map(({ f }) => {
      const sh = shoulderMid(f.landmarks);
      const hp = hipMid(f.landmarks);
      return sh && hp ? Math.hypot(sh.x - hp.x, sh.y - hp.y) : null;
    }).find((x) => x != null);
    const sprawled = hipYs.length >= 2 && torso ? Math.max(...hipYs) - hipYs[0] > torso * 0.3 : false;
    const reacted = sprawled || ctx.myEvents.some((m) => m.timestampSec >= e.timestampSec - 0.3 && m.timestampSec <= e.timestampSec + 1.5 && (m.category === 'distance_exit_like' || m.category === 'level_change_like'));
    if (!reacted) {
      const wentDown = ctx.me.some((f) => f.matched && f.timestampSec > e.timestampSec && f.timestampSec <= e.timestampSec + 3 && isGrounded(f.landmarks) === true);
      occ.push({ eventSec: e.timestampSec, ...window(ctx, e.timestampSec), note: `상대 레벨 체인지 후 1.5초 안에 엉덩이를 낮추거나 빠지는 반응이 감지되지 않음${wentDown ? ' — 이후 3초 안에 내가 넘어짐' : ''}` });
    }
  }
  return build(
    ctx,
    {
      situationType: 'no_takedown_defense',
      title: '상대 진입에 대한 방어 반응이 늦음',
      description: '상대가 자세를 낮춰 들어올 때 엉덩이를 낮추거나(스프롤) 빠지는 반응이 감지되지 않은 장면이 반복됐습니다.',
      observedEvidence: [`상대 레벨 체인지 ${opportunities}회 중 ${observed}회는 내 모습이 함께 보였고, 그중 ${occ.length}회는 1.5초 안에 방어 반응이 감지되지 않았습니다.`],
      inference: '상대의 진입 신호(레벨 변화)를 늦게 알아차렸거나 스탠스가 높아 반응이 늦었을 가능성이 있습니다(추론).',
      recommendation: '파트너가 신호 없이 천천히 슛을 들어오면 스프롤 또는 각도 빼기 중 하나로 반응하는 드릴부터 시작해, 속도를 단계적으로 올립니다.',
      occurrences: occ,
      opportunities: observed,
    },
    opportunities,
    1,
    ['sprawl', 'takedown defense', 'underhook'],
    ['손으로 막는 방어(언더훅·크로스페이스)는 이 측정으로 보지 못합니다']
  );
}

function clinchPostureBreak(ctx: Ctx): SparringWeakness | null {
  if (!ctx.opponent?.length) return null;
  const close: number[] = [];
  const broken: number[] = [];
  ctx.me.forEach((f, i) => {
    if (!f.matched || ctx.identity[i] === 'opponent') return;
    const d = centroidDist(f.landmarks, oppAt(ctx, i));
    if (d === null || d > 0.22 || isGrounded(f.landmarks) !== false) return;
    close.push(i);
    const lean = torsoLean(f.landmarks);
    const nose = f.landmarks ? point(f.landmarks, 'nose') : null;
    const sh = shoulderMid(f.landmarks);
    if (lean !== null && lean > 40 && nose && sh && nose.y > sh.y) broken.push(i);
  });
  const occ = episodes(broken).map((run) => {
    const t = ctx.me[run[0]].timestampSec;
    return { eventSec: t, ...window(ctx, t), note: `상대와 붙은 상태에서 상체가 ${Math.round(torsoLean(ctx.me[run[0]].landmarks) ?? 0)}° 숙여지고 머리가 어깨보다 낮음` };
  });
  const closeEpisodes = episodes(close).length;
  return build(
    ctx,
    {
      situationType: 'clinch_posture_break',
      title: '근접 상황에서 상체가 숙여짐',
      description: '서서 상대와 붙어 있을 때 상체가 크게 숙여지고 머리가 내려간 장면이 반복됐습니다.',
      observedEvidence: [`서서 붙어 있던 ${close.length}개 프레임 중 ${broken.length}개에서 상체가 40° 넘게 숙여지고 머리가 어깨선 아래였습니다.`],
      inference: '상대에게 머리·목을 눌려 자세가 무너졌거나, 무게 중심이 앞으로 쏠렸을 가능성이 있습니다(추론).',
      recommendation: '클린치에서 머리를 세우고 엉덩이를 넣어 상체를 세우는 자세 회복 드릴(파트너가 가볍게 누르면 세우기)을 반복합니다.',
      occurrences: occ,
      opportunities: closeEpisodes,
    },
    closeEpisodes,
    1,
    ['posture', 'clinch', 'collar tie'],
    ['카메라가 옆에서 찍지 않으면 숙임 각도가 작게 보일 수 있습니다']
  );
}

function bottomPosition(ctx: Ctx): SparringWeakness | null {
  if (!ctx.opponent?.length) return null;
  const ground: number[] = [];
  const bottom: number[] = [];
  ctx.me.forEach((f, i) => {
    if (!f.matched || ctx.identity[i] === 'opponent') return;
    const opp = oppAt(ctx, i);
    if (isGrounded(f.landmarks) !== true || isGrounded(opp) !== true) return;
    ground.push(i);
    const me = hipMid(f.landmarks);
    const them = hipMid(opp);
    if (me && them && me.y > them.y + 0.03) bottom.push(i);
  });
  const occ = episodes(bottom)
    .filter((run) => run.length >= 2)
    .map((run) => {
      const t = ctx.me[run[0]].timestampSec;
      const dur = ctx.me[run[run.length - 1]].timestampSec - t;
      return { eventSec: t, ...window(ctx, t), note: `둘 다 바닥에 있는 상태에서 약 ${Math.max(dur, ctx.sampleIntervalSec).toFixed(0)}초 동안 내가 아래쪽` };
    });
  const groundEpisodes = episodes(ground).length;
  return build(
    ctx,
    {
      situationType: 'bottom_position',
      title: '그라운드에서 아래쪽에 오래 머묾',
      description: '바닥 상황에서 상대 아래에 깔린 상태가 이어진 장면이 반복됐습니다.',
      observedEvidence: [`둘 다 바닥에 있던 ${ground.length}개 프레임 중 ${bottom.length}개에서 내 엉덩이가 상대보다 아래(화면 기준)였습니다.`],
      inference: '하위 포지션에서 탈출이나 가드 회복으로 이어가지 못하고 머물렀을 가능성이 있습니다. 카메라 각도에 따라 위·아래 판단이 틀릴 수 있습니다(추론).',
      recommendation: '하위 포지션에서 새우빼기(힙 이스케이프) → 무릎 넣기 → 가드 회복을 파트너가 가볍게 누른 상태에서 반복하고, 브릿지 탈출을 함께 연습합니다.',
      occurrences: occ,
      opportunities: groundEpisodes,
    },
    groundEpisodes,
    0.6,
    ['shrimp', 'guard recovery', 'bridge escape'],
    ['위·아래는 화면상 엉덩이 높이로만 판단하며 카메라 각도에 영향을 받습니다', '탈출 시도 자체는 측정하지 않습니다']
  );
}

export interface WeaknessScenesResult {
  weaknesses: SparringWeakness[];
  clips: SparringClip[];
  /** Why nothing (or less) was reported — shown, never hidden. */
  notes: string[];
}

export function findWeaknessScenes(ctx: Ctx): WeaknessScenesResult {
  const grappling = GRAPPLING_SPORTS.includes(ctx.martialArt) || ctx.martialArt === 'mma';
  const striking = STRIKING_SPORTS.includes(ctx.martialArt) || ctx.martialArt === 'mma' || (!grappling && !STRIKING_SPORTS.includes(ctx.martialArt));
  const candidates = [
    ...(striking ? [postAttackGuard(ctx), noReaction(ctx), staticAfterAttack(ctx), lateGuardDrop(ctx), singleAttacks(ctx)] : []),
    ...(grappling ? [takedownNoFinish(ctx), noTakedownDefense(ctx), clinchPostureBreak(ctx), bottomPosition(ctx)] : []),
  ];
  const found = candidates.filter((w): w is SparringWeakness => !!w);
  found.sort((a, b) => b.confidence - a.confidence);
  const notes: string[] = [];
  if (ctx.opponentEvents.length === 0 && !(ctx.opponent ?? []).some((o) => o.matched)) {
    notes.push(grappling ? '상대가 추적되지 않아 상대 진입 방어·근접 자세·그라운드 위치는 분석하지 않았습니다.' : '상대 동작이 추적되지 않아 "상대 공격에 대한 반응"은 분석하지 않았습니다.');
  }
  if (grappling) notes.push('그래플링 판단은 두 선수의 자세 좌표(엉덩이 높이·상체 기울기·거리)로만 하며, 그립·관절기·압박은 측정하지 않습니다.');
  if (found.length === 0) notes.push('반복해서 확인되는 약점 장면을 찾지 못했습니다 (한 번만 나온 장면은 약점으로 만들지 않습니다).');

  // Clip windows: up to 2 per weakness, merged when they overlap (one clip may serve several weaknesses).
  const clips: SparringClip[] = [];
  const now = new Date().toISOString();
  for (const w of found) {
    const picks = w.occurrences.length <= MAX_CLIPS_PER_WEAKNESS ? w.occurrences : [w.occurrences[0], w.occurrences[Math.floor(w.occurrences.length / 2)]];
    for (const o of picks) {
      const existing = clips.find((c) => o.startSec < c.endSec && o.endSec > c.startSec);
      if (existing) {
        const start = Math.min(existing.startSec, o.startSec);
        const end = Math.min(start + CLIP_MAX_SEC, Math.max(existing.endSec, o.endSec));
        existing.startSec = start;
        existing.endSec = end;
        if (!existing.weaknessIds.includes(w.id)) existing.weaknessIds.push(w.id);
        if (!w.clipIds.includes(existing.id)) w.clipIds.push(existing.id);
        continue;
      }
      const clip: SparringClip = { id: `clip-${clips.length + 1}-${Math.round(o.startSec * 10)}`, startSec: o.startSec, endSec: o.endSec, actualStartSec: null, actualEndSec: null, weaknessIds: [w.id], status: 'pending', error: null, sizeBytes: null, mimeType: null, createdAt: now };
      clips.push(clip);
      w.clipIds.push(clip.id);
    }
  }
  clips.sort((a, b) => a.startSec - b.startSec);
  return { weaknesses: found, clips, notes };
}

export type { Ctx as WeaknessSceneInput };
