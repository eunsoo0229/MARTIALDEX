// Standalone unit test for the PURE sparring-analysis computation functions
// (no Vite, no MediaPipe, no DOM) — run via `npx tsx .devtools/test-sparring-engine.ts`.
// These are the functions samplePosesFromVideo's real output would flow
// into; this verifies the math itself is correct using hand-built landmark
// sequences, independent of whether a real sparring video is available.
import { trackSelectedPerson, trackingLossRatio, centroidOf } from '../src/lib/sparringAnalysis/personTracker';
import { computePostureSegments, overallPostureScore } from '../src/lib/sparringAnalysis/postureMetrics';
import { detectMotionEvents } from '../src/lib/sparringAnalysis/motionEventDetector';
import { computeOverallScores, computeWeakAreas, detectLimitations } from '../src/lib/sparringAnalysis/scoringEngine';
import type { PoseFrame } from '../src/lib/poseAnalysis/types';
import type { SampledFrame } from '../src/lib/sparringAnalysis/frameSampler';
import type { TrackedFrame } from '../src/lib/sparringAnalysis/personTracker';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
    console.log('PASS —', name);
  } else {
    fail++;
    console.log('FAIL —', name, detail ? ':: ' + detail : '');
  }
}

function pt(x: number, y: number) {
  return { x, y, z: 0, visibility: 0.9 };
}

function basePose(overrides: Partial<PoseFrame> = {}): PoseFrame {
  return {
    timestampMs: 0,
    nose: pt(0.5, 0.15),
    leftShoulder: pt(0.45, 0.25),
    rightShoulder: pt(0.55, 0.25),
    leftElbow: pt(0.4, 0.35),
    rightElbow: pt(0.6, 0.35),
    leftWrist: pt(0.38, 0.2),
    rightWrist: pt(0.62, 0.2),
    leftHip: pt(0.47, 0.55),
    rightHip: pt(0.53, 0.55),
    leftKnee: pt(0.46, 0.75),
    rightKnee: pt(0.54, 0.75),
    leftAnkle: pt(0.45, 0.95),
    rightAnkle: pt(0.55, 0.95),
    ...overrides,
  };
}

// ---- 1. personTracker: nearest-centroid tracking across frames with a distractor ----
{
  const selfPoses = [0, 1, 2, 3, 4].map((i) => basePose({ leftHip: pt(0.47 + i * 0.01, 0.55), rightHip: pt(0.53 + i * 0.01, 0.55) }));
  const distractorPoses = [0, 1, 2, 3, 4].map(() => basePose({ leftHip: pt(0.85, 0.55), rightHip: pt(0.91, 0.55), leftShoulder: pt(0.85, 0.25), rightShoulder: pt(0.91, 0.25) }));
  const samples: SampledFrame[] = selfPoses.map((p, i) => ({ timestampSec: i, poses: [p, distractorPoses[i]] }));
  const refCentroid = centroidOf(selfPoses[0])!;
  const tracked = trackSelectedPerson(samples, 0, refCentroid);
  check('tracker follows the reference person across all frames, not the distractor', tracked.every((t) => t.matched), JSON.stringify(tracked.map((t) => t.matched)));
  const lastCentroid = centroidOf(tracked[4].landmarks!)!;
  check('tracked centroid stayed near the self trajectory (not jumped to distractor at x~0.88)', lastCentroid.x < 0.7, `x=${lastCentroid.x}`);
  check('trackingLossRatio is 0 when every frame matched', trackingLossRatio(tracked) === 0);
}

// ---- 2. personTracker: loses the person when nothing is close enough ----
{
  const samples: SampledFrame[] = [
    { timestampSec: 0, poses: [basePose()] },
    { timestampSec: 1, poses: [] }, // person left frame
    { timestampSec: 2, poses: [basePose()] },
  ];
  const tracked = trackSelectedPerson(samples, 0, centroidOf(basePose())!);
  check('tracker marks a frame with no detections as unmatched (never guesses)', tracked[1].matched === false);
  check('tracker re-acquires once the person reappears near the same spot', tracked[2].matched === true);
}

// ---- 3. postureMetrics: a steady guard-up stance scores reasonably and never crashes on short input ----
{
  const framesConst: TrackedFrame[] = Array.from({ length: 12 }, (_, i) => ({ timestampSec: i, landmarks: basePose(), matched: true }));
  const segments = computePostureSegments(framesConst);
  check('computePostureSegments returns early/mid/late segments for 12 steady frames', segments.length === 3, `count=${segments.length}`);
  const guardMetric = segments[0]?.metrics.find((m) => m.id === 'guard');
  check('guard metric present and scored well for hands-near-head pose', !!guardMetric && guardMetric.score > 60, JSON.stringify(guardMetric));
  check('computePostureSegments returns [] for too few frames (never fabricates a segment)', computePostureSegments([{ timestampSec: 0, landmarks: basePose(), matched: true }]).length === 0);
  const overall = overallPostureScore(segments);
  check('overallPostureScore returns a 0-100 number when segments exist', overall !== null && overall >= 0 && overall <= 100, String(overall));
}

// ---- 4. postureMetrics: guard dropping over time produces the "후반부" note ----
{
  const early: TrackedFrame[] = Array.from({ length: 4 }, (_, i) => ({ timestampSec: i, landmarks: basePose(), matched: true }));
  // hands drop well below the "guard" threshold in the late segment
  const late: TrackedFrame[] = Array.from({ length: 4 }, (_, i) => ({
    timestampSec: 8 + i,
    landmarks: basePose({ leftWrist: pt(0.4, 0.6), rightWrist: pt(0.6, 0.6) }),
    matched: true,
  }));
  const mid: TrackedFrame[] = Array.from({ length: 4 }, (_, i) => ({ timestampSec: 4 + i, landmarks: basePose(), matched: true }));
  const segments = computePostureSegments([...early, ...mid, ...late]);
  const lateSeg = segments.find((s) => s.segment === 'late');
  check('a real guard-drop trend produces the honest "관찰됨" note (not a diagnosis)', !!lateSeg?.note && lateSeg.note.includes('관찰'), lateSeg?.note ?? 'none');
}

// ---- 5. motionEventDetector: a fast wrist extension is flagged as strike_like ----
{
  const tracked: TrackedFrame[] = [
    { timestampSec: 0, landmarks: basePose(), matched: true },
    { timestampSec: 1, landmarks: basePose({ rightWrist: pt(0.95, 0.25) }), matched: true }, // big fast reach
    { timestampSec: 2, landmarks: basePose(), matched: true },
  ];
  const samples: SampledFrame[] = tracked.map((t) => ({ timestampSec: t.timestampSec, poses: [t.landmarks!] }));
  const events = detectMotionEvents(tracked, samples);
  check('fast wrist extension produces a strike_like event', events.some((e) => e.category === 'strike_like'), JSON.stringify(events));
  check('every event carries a non-"high" confidence (never claims certainty)', events.every((e) => e.confidence === 'low' || e.confidence === 'medium'));
}

// ---- 6. motionEventDetector: a hip drop is flagged as level_change_like ----
{
  const tracked: TrackedFrame[] = [
    { timestampSec: 0, landmarks: basePose(), matched: true },
    { timestampSec: 1, landmarks: basePose({ leftHip: pt(0.47, 0.75), rightHip: pt(0.53, 0.75), leftKnee: pt(0.46, 0.85), rightKnee: pt(0.54, 0.85) }), matched: true },
  ];
  const samples: SampledFrame[] = tracked.map((t) => ({ timestampSec: t.timestampSec, poses: [t.landmarks!] }));
  const events = detectMotionEvents(tracked, samples);
  check('a sharp hip drop produces a level_change_like event', events.some((e) => e.category === 'level_change_like'), JSON.stringify(events));
}

// ---- 7. motionEventDetector: proximity to another detected pose is flagged as clinch_like ----
{
  const selfFrames: TrackedFrame[] = [
    { timestampSec: 0, landmarks: basePose(), matched: true },
    { timestampSec: 1, landmarks: basePose(), matched: true },
  ];
  const opponentFar = basePose({ leftHip: pt(0.9, 0.55), rightHip: pt(0.96, 0.55), leftShoulder: pt(0.9, 0.25), rightShoulder: pt(0.96, 0.25) });
  const opponentClose = basePose({ leftHip: pt(0.5, 0.55), rightHip: pt(0.56, 0.55), leftShoulder: pt(0.5, 0.25), rightShoulder: pt(0.56, 0.25) });
  const samples: SampledFrame[] = [
    { timestampSec: 0, poses: [selfFrames[0].landmarks!, opponentFar] },
    { timestampSec: 1, poses: [selfFrames[1].landmarks!, opponentClose] },
  ];
  const events = detectMotionEvents(selfFrames, samples);
  check('moving close to another detected person produces a clinch_like event', events.some((e) => e.category === 'clinch_like'), JSON.stringify(events));
}

// ---- 8. scoringEngine: no score fabrication when there isn't enough usable data ----
{
  const scores = computeOverallScores([], [], 1, 60);
  check('computeOverallScores returns all-null when usable frame count is too low', Object.values(scores).every((v) => v === null), JSON.stringify(scores));
  check('"technique" (execution quality) is ALWAYS null — no reliable local signal exists for it', scores.technique === null);
}

// ---- 9. scoringEngine: weak areas only include what was actually computed, sorted worst-first ----
{
  const weak = computeWeakAreas({ technique: null, movement: 40, distance: 90, defense: 55, offense: null, posture: null }, []);
  check('weak areas exclude high scores (>=70) and null scores', !weak.some((w) => w.label === 'Distance Management'));
  check('weak areas are sorted lowest score first', weak.length >= 2 && (weak[0].score ?? 100) <= (weak[1].score ?? 100), JSON.stringify(weak));
}

// ---- 10. scoringEngine: limitation detection reflects real inputs, not guesses ----
{
  const lims = detectLimitations({ width: 320, height: 240 }, 5, 0.6, 1);
  check('low resolution is flagged', lims.some((l) => l.code === 'low_resolution'));
  check('short clip is flagged', lims.some((l) => l.code === 'short_clip'));
  check('high tracking loss is flagged', lims.some((l) => l.code === 'person_lost'));
  check('single-person-at-once is flagged', lims.some((l) => l.code === 'single_person_detected'));
  const clean = detectLimitations({ width: 1920, height: 1080 }, 90, 0.05, 2);
  check('a clean, well-tracked, two-person, HD clip has no limitations flagged', clean.length === 0, JSON.stringify(clean));
}

console.log(`\n=== SUMMARY: ${pass}/${pass + fail} PASSED ===`);
process.exit(fail > 0 ? 1 : 0);
