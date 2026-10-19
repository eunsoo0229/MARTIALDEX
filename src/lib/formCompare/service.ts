import type { Technique } from '../../types';
import { parseYoutubeVideoId } from '../techniqueVideo/urlVerification';
import { videoInfoProvider } from '../videoSearch/provider';
import { poseRecordsRepository } from '../poseAnalysis/recordsRepository';
import { classifyScore } from '../poseAnalysis/scoring';
import type { PoseAnalysisRecord } from '../poseAnalysis/types';
import { buildReferenceProfile, frameParts, judgeAttempt, referenceMediaParts } from './ai';
import { compositePair, cropToPerson, poseAt, sampleVideoBlob } from './clipCapture';
import { alignTimes, alignTimesFromUser, blockingIssues, extremeMs, linearTimes, pickFrames, poseDifferences, VIEW_LABEL, viewWarning } from './motion';
import type { AiMediaPart } from '../ai/types';
import { getMedia, getReference, MAX_STORED_FILE_BYTES, newId, putMedia, saveCompareRecord, saveReference } from './referenceStore';
import { scoreComparison } from './scoring';
import type { AlignmentInfo, CameraView, CaptureIssue, ClipFrame, ComparisonJudgement, FormCompareRecord, PreparedClip, ReferenceProfile, ReferenceVideo } from './types';
import { CAPTURE_ISSUE_LABEL } from './types';

// 기준 영상 비교 자세 평가 — orchestration.
//   register (YouTube URL → checked playable, or a video file) → profile
//   (auto criteria) → capture → align → AI judgement → score → records.

export const MAX_REFERENCE_SECONDS = 30;

type Fail = { ok: false; message: string };

// ---------------------------------------------------------------- registering a reference

export async function checkYoutubeReference(url: string): Promise<{ ok: true; videoId: string; title: string; channel: string; lengthSeconds: number } | Fail> {
  const videoId = parseYoutubeVideoId(url);
  if (!videoId) return { ok: false, message: '올바른 YouTube 영상 주소가 아닙니다. (예: https://www.youtube.com/watch?v=...)' };
  const info = await videoInfoProvider.get(videoId);
  if (!info.ok) return { ok: false, message: `영상 정보를 확인하지 못했습니다: ${info.message}` };
  if (!info.info.playable) return { ok: false, message: '재생할 수 없는 영상입니다(비공개·삭제·연령 제한·지역 제한 등). 다른 영상을 선택해 주세요.' };
  return { ok: true, videoId, title: info.info.title, channel: info.info.channel, lengthSeconds: info.info.lengthSeconds };
}

function checkRange(start: number, end: number, length: number): string | null {
  if (!(start >= 0) || !(end > start)) return '기술이 나오는 구간의 시작·끝 시간을 확인해 주세요 (끝이 시작보다 뒤여야 합니다).';
  if (length > 0 && end > length + 0.5) return `영상 길이(${Math.round(length)}초)보다 긴 구간입니다.`;
  if (end - start < 1) return '구간이 너무 짧습니다 (1초 이상).';
  if (end - start > MAX_REFERENCE_SECONDS) return `구간은 ${MAX_REFERENCE_SECONDS}초 이하로 지정해 주세요 — 기술 한 번이 보이는 부분만 고르면 분석이 정확하고 비용도 줄어듭니다.`;
  return null;
}

export async function registerYoutubeReference(t: Technique, input: { url: string; startSeconds: number; endSeconds: number; cameraView: CameraView; replaceId?: string | null }): Promise<{ ok: true; reference: ReferenceVideo } | Fail> {
  const check = await checkYoutubeReference(input.url);
  if (!check.ok) return check;
  const bad = checkRange(input.startSeconds, input.endSeconds, check.lengthSeconds);
  if (bad) return { ok: false, message: bad };
  const now = new Date().toISOString();
  const prev = input.replaceId ? getReference(input.replaceId) : null;
  const ref: ReferenceVideo = {
    id: prev?.id ?? newId('ref'),
    techniqueId: t.id,
    martialArt: t.martialArt,
    source: { kind: 'youtube', videoId: check.videoId, url: `https://www.youtube.com/watch?v=${check.videoId}`, title: check.title, channel: check.channel, lengthSeconds: check.lengthSeconds },
    startSeconds: input.startSeconds,
    endSeconds: input.endSeconds,
    cameraView: input.cameraView,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    profile: null,
    hasLocalMedia: false,
  };
  return { ok: true, reference: saveReference(ref) };
}

/** A video file the user may use. Poses/frames are extracted locally; the file itself is kept on this device only (≤ 40 MB). */
export async function registerFileReference(
  t: Technique,
  input: { file: File; startSeconds: number; endSeconds: number; cameraView: CameraView; replaceId?: string | null; onProgress?: (done: number, total: number) => void }
): Promise<{ ok: true; reference: ReferenceVideo } | Fail> {
  if (!/^video\//.test(input.file.type) && !/\.(mp4|webm|mov|m4v)$/i.test(input.file.name)) return { ok: false, message: '영상 파일(MP4, WebM, MOV)을 선택해 주세요.' };
  let sampled: Awaited<ReturnType<typeof sampleVideoBlob>>;
  try {
    sampled = await sampleVideoBlob(input.file, { fps: 12, startSeconds: input.startSeconds, endSeconds: input.endSeconds, onProgress: input.onProgress });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '영상을 분석하지 못했습니다.' };
  }
  const bad = checkRange(input.startSeconds, Math.min(input.endSeconds, sampled.durationSeconds || input.endSeconds), sampled.durationSeconds);
  if (bad) return { ok: false, message: bad };
  const block = blockingIssues(sampled.signals);
  if (block.length) return { ok: false, message: `기준 영상으로 쓸 수 없습니다: ${block.map((i) => CAPTURE_ISSUE_LABEL[i]).join(' ')}` };
  const now = new Date().toISOString();
  const prev = input.replaceId ? getReference(input.replaceId) : null;
  const id = prev?.id ?? newId('ref');
  await putMedia({ id, frames: sampled.frames, poses: sampled.poses, signals: sampled.signals, file: input.file.size <= MAX_STORED_FILE_BYTES ? input.file : null });
  const ref: ReferenceVideo = {
    id,
    techniqueId: t.id,
    martialArt: t.martialArt,
    source: { kind: 'file', fileName: input.file.name, mimeType: input.file.type || 'video/mp4', sizeBytes: input.file.size, durationSeconds: sampled.durationSeconds },
    startSeconds: input.startSeconds,
    endSeconds: Math.min(input.endSeconds, sampled.durationSeconds || input.endSeconds),
    cameraView: input.cameraView === 'unknown' ? sampled.signals.cameraView : input.cameraView,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    profile: null,
    hasLocalMedia: true,
  };
  return { ok: true, reference: saveReference(ref) };
}

/** Keyframes of a file reference used to build its criteria: the start posture + evenly through the performed segment + the finish. */
function profileFrames(frames: ClipFrame[], seg: { startMs: number; endMs: number } | null): ClipFrame[] {
  if (!frames.length) return [];
  const s = seg ?? { startMs: frames[0].tMs, endMs: frames[frames.length - 1].tMs };
  const times = [Math.max(frames[0].tMs, s.startMs - 300), ...linearTimes(s, [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1]), Math.min(frames[frames.length - 1].tMs, s.endMs + 300)];
  return pickFrames(frames, times);
}

/** Builds (or rebuilds) the evaluation criteria from the reference video itself. */
export async function ensureProfile(t: Technique, ref: ReferenceVideo, force = false): Promise<{ ok: true; reference: ReferenceVideo } | Fail> {
  if (ref.profile && !force) return { ok: true, reference: ref };
  let frames: ClipFrame[] | null = null;
  if (ref.source.kind === 'file') {
    const media = await getMedia(ref.id);
    if (!media) return { ok: false, message: '이 기기에 기준 영상 데이터가 없습니다. 영상 파일을 다시 등록해 주세요.' };
    frames = await cropToPerson(profileFrames(media.frames, media.signals.segment), media.poses, media.signals.segment);
  }
  const built = await buildReferenceProfile(t, ref, frames);
  if (!built.ok) return built;
  if (!built.profile.techniqueVisible || built.profile.criteria.length < 2) return { ok: false, message: '기준 영상에서 이 기술의 동작을 충분히 확인하지 못해 평가 기준을 만들 수 없었습니다. 기술이 잘 보이는 구간이나 다른 영상을 선택해 주세요.' };
  return { ok: true, reference: saveReference({ ...ref, profile: built.profile, updatedAt: new Date().toISOString() }) };
}

// ---------------------------------------------------------------- comparing one attempt

export interface CompareOutcome {
  record: FormCompareRecord;
  userFrames: (ClipFrame & { note: string })[];
  refFrames: (ClipFrame & { note: string })[];
}

function phaseAt(profile: ReferenceProfile, times: { phaseId: string; userMs: number }[], tMs: number): string {
  let label = '준비';
  for (const p of times) if (tMs >= p.userMs - 1) label = profile.phases.find((x) => x.id === p.phaseId)?.name ?? label;
  return label;
}

export async function compareAttempt(t: Technique, ref: ReferenceVideo, clip: PreparedClip): Promise<{ ok: true; outcome: CompareOutcome } | (Fail & { retake?: CaptureIssue[] })> {
  const block = blockingIssues(clip.signals);
  if (block.length) return { ok: false, retake: block, message: block.map((i) => CAPTURE_ISSUE_LABEL[i]).join(' ') };
  const profile = ref.profile;
  if (!profile) return { ok: false, message: '기준 영상의 평가 기준이 아직 없습니다.' };
  if (!profile.matchesTechnique) return { ok: false, message: `기준 영상이 ${t.name}가 아닌 것으로 분석되었습니다(${profile.observedTechnique || '다른 동작'}). 기준 영상을 바꿔 주세요.` };
  const input = await prepareComparison(ref, profile, clip);
  const { mediaParts, poseHints, qualityNote } = input;
  const judged = await judgeAttempt({ technique: t, ref, profile, mediaParts, qualityNote, poseHints });
  if (!judged.ok) return judged;
  return finishComparison(t, ref, profile, clip, judged.judgement, input);
}

/**
 * Everything before the AI call — alignment, the frame pairs, the pose hints,
 * the capture note. Pure local work (no network); exported for testing.
 */
export async function prepareComparison(ref: ReferenceVideo, profile: ReferenceProfile, clip: PreparedClip) {
  const seg = clip.signals.segment!;
  const clipLenMs = (ref.endSeconds - ref.startSeconds) * 1000;

  // --- time alignment: reference phase starts → user times
  const media = ref.source.kind === 'file' ? await getMedia(ref.id) : null;
  const phases = profile.phases.map((p, i) => ({ id: p.id, f: p.startFraction ?? i / Math.max(1, profile.phases.length) }));
  let alignment: AlignmentInfo;
  const dtw = media?.signals.segment ? alignTimes(media.poses, media.signals.segment, clip.poses, seg, phases.map((p) => p.f * clipLenMs)) : null;
  if (dtw && media?.signals.segment) {
    const refLen = media.signals.segment.endMs - media.signals.segment.startMs;
    alignment = { method: 'dtw', speedRatio: Math.round(((seg.endMs - seg.startMs) / Math.max(1, refLen)) * 100) / 100, phaseTimes: phases.map((p, i) => ({ phaseId: p.id, refMs: Math.round(p.f * clipLenMs), userMs: Math.round(dtw.userTimesMs[i]) })) };
  } else {
    const { start: aS, end: aE } = profile.active;
    const rel = phases.map((p) => (p.f - aS) / Math.max(0.05, aE - aS));
    alignment = { method: 'segment', speedRatio: null, phaseTimes: phases.map((p, i) => ({ phaseId: p.id, refMs: Math.round(p.f * clipLenMs), userMs: Math.round(linearTimes(seg, [rel[i]])[0]) })) };
  }
  alignment.phaseTimes.sort((a, b) => a.userMs - b.userMs);

  // --- frames for the AI. File reference: aligned PAIRS (same moment in both clips —
  // start posture, each phase start/middle, the point of largest extension).
  // YouTube reference: the user's frames at the mapped moments (the model watches the clip itself).
  const userExtreme = extremeMs(clip.poses, seg);
  let userFrames: (ClipFrame & { note: string })[] = [];
  let refFrames: (ClipFrame & { note: string })[] = [];
  let mediaParts: AiMediaPart[];
  let poseHints: string[] = [];
  if (media?.signals.segment) {
    const refSeg = media.signals.segment;
    const refExtreme = extremeMs(media.poses, refSeg);
    const refTimeline = alignment.phaseTimes.map((p) => ({ phaseId: p.phaseId, userMs: p.refMs ?? 0 }));
    // Evenly through the user's WHOLE performed segment (that is what is judged — phase
    // boundaries alone, or reference times squeezed by the alignment, can skip the decisive
    // instant), + the start posture + both largest-extension moments; each mapped to the
    // matching reference instant by the same DTW path.
    const userTimes = [...new Set([...linearTimes(seg, Array.from({ length: 9 }, (_, i) => i / 8)), ...(userExtreme !== null ? [userExtreme] : [])].map((x) => Math.round(x)))].sort((x, y) => x - y);
    const toRef = alignTimesFromUser(media.poses, refSeg, clip.poses, seg, userTimes) ?? linearTimes(refSeg, userTimes.map((u) => (u - seg.startMs) / Math.max(1, seg.endMs - seg.startMs)));
    const refExtUser = refExtreme !== null ? alignTimes(media.poses, refSeg, clip.poses, seg, [refExtreme])?.userTimesMs[0] ?? null : null;
    const pairs = [
      { r: Math.max(0, refSeg.startMs - 250), u: Math.max(clip.frames[0]?.tMs ?? 0, seg.startMs - 250), extreme: false },
      ...userTimes.map((u, i) => ({ r: Math.round(toRef[i]), u, extreme: u === (userExtreme !== null ? Math.round(userExtreme) : -1) })),
      ...(refExtreme !== null && refExtUser !== null ? [{ r: Math.round(refExtreme), u: Math.round(refExtUser), extreme: true }] : []),
    ]
      .sort((x, y) => x.u - y.u)
      .filter((p, i, arr) => i === 0 || p.extreme || Math.abs(p.u - arr[i - 1].u) >= 100)
      .slice(0, 12);
    const near = <T extends { tMs: number }>(xs: T[], t: number) => xs.reduce((b, x) => (Math.abs(x.tMs - t) < Math.abs(b.tMs - t) ? x : b), xs[0]);
    for (const p of pairs) {
      const note = `${phaseAt(profile, refTimeline, p.r)}${p.extreme ? ' · 정점' : ''}`;
      refFrames.push({ ...near(media.frames, p.r), note });
      userFrames.push({ ...near(clip.frames, p.u), note });
    }
    const diffs = poseDifferences(media.poses, refSeg, clip.poses, seg);
    // each hint is attached to the pair nearest to where its difference is largest
    const pairHint = pairs.map(() => [] as string[]);
    for (const d of diffs) {
      let k = 0;
      for (let i = 1; i < pairs.length; i++) if (Math.abs(pairs[i].u - d.userMs) < Math.abs(pairs[k].u - d.userMs)) k = i;
      pairHint[k].push(`${d.part} ${d.direction} ${d.max}`);
    }
    refFrames = await cropToPerson(refFrames, media.poses, refSeg);
    userFrames = await cropToPerson(userFrames, clip.poses, seg);
    const composites = await Promise.all(pairs.map((p, i) => compositePair(refFrames[i].image, userFrames[i].image, poseAt(media.poses, p.r), poseAt(clip.poses, p.u))));
    mediaParts = [
      {
        kind: 'text',
        text: '[짝 이미지 — 시간 정렬(DTW)로 맞춘 같은 순간. 각 이미지: 왼쪽 = 기준 R 사진 | 가운데 = 사용자 U 사진 | 오른쪽 = 두 자세의 골격을 엉덩이 중심·몸통 길이로 맞춰 겹친 그림 (파랑 = 기준, 빨강 = 사용자; 큰 점 = 머리, 작은 점 = 손목). 골격 그림은 외모·배경·체격·거리 차이를 없앤 자세 비교용이며 MediaPipe 추정이라 손끝·깊이는 부정확할 수 있다.]',
      },
      ...pairs.flatMap((_, i) => [
        { kind: 'text' as const, text: `[짝 ${i + 1} · ${refFrames[i].note} · 기준 R${i + 1} ${(refFrames[i].tMs / 1000).toFixed(2)}초 ↔ 사용자 U${i + 1} ${(userFrames[i].tMs / 1000).toFixed(2)}초${pairHint[i].length ? ` · 보조 신호(확인 필요): 기준 대비 ${pairHint[i].join(', ')} 몸통 길이 차이` : ''}]` },
        { kind: 'image' as const, mimeType: 'image/jpeg', data: composites[i].replace(/^data:image\/\w+;base64,/, '') },
      ]),
    ];
    poseHints = diffs.map(
      (d) => `${d.part}(사람 기준 좌우): 같은 순간 기준보다 ${d.direction} 최대 ${d.max} 몸통 길이 (평균 ${d.mean}) — 기준 ${(d.refMs / 1000).toFixed(2)}초 ↔ 사용자 ${(d.userMs / 1000).toFixed(2)}초`
    );
  } else {
    const wanted = [Math.max(clip.frames[0]?.tMs ?? 0, seg.startMs - 250), ...linearTimes(seg, Array.from({ length: 9 }, (_, i) => i / 8)), ...(userExtreme !== null ? [userExtreme] : [seg.peakMs])];
    userFrames = pickFrames(clip.frames, wanted)
      .slice(0, 11)
      .map((f) => ({ ...f, note: `${phaseAt(profile, alignment.phaseTimes, f.tMs)}${userExtreme !== null && Math.abs(f.tMs - userExtreme) < 60 ? ' · 정점' : ''}` }));
    userFrames = await cropToPerson(userFrames, clip.poses, seg);
    mediaParts = [...referenceMediaParts(ref, null), { kind: 'text', text: '[사용자 프레임 U — 시간은 사용자 영상 시작부터, 괄호 안은 시간 정렬로 추정한 기준 단계]' }, ...frameParts('U', userFrames)];
  }

  const vw = viewWarning(profile.cameraView !== 'unknown' ? profile.cameraView : ref.cameraView, clip.signals.cameraView);
  const qualityNote = [
    `사람 인식 프레임 ${Math.round(clip.signals.visibleRatio * 100)}%, 전신 인식 ${Math.round(clip.signals.fullBodyRatio * 100)}%`,
    `사용자 촬영 방향(자세 추정): ${VIEW_LABEL[clip.signals.cameraView]} / 기준 영상: ${VIEW_LABEL[profile.cameraView]}`,
    alignment.speedRatio ? `수행 시간은 기준 영상의 ${alignment.speedRatio}배 (속도 차이는 감점 이유가 아님)` : '',
    clip.signals.issues.length ? `촬영 문제: ${clip.signals.issues.map((i) => CAPTURE_ISSUE_LABEL[i]).join(' ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { alignment, userFrames, refFrames, mediaParts, poseHints, vw, qualityNote };
}

function finishComparison(t: Technique, ref: ReferenceVideo, profile: ReferenceProfile, clip: PreparedClip, judgement: ComparisonJudgement, input: Awaited<ReturnType<typeof prepareComparison>>): { ok: true; outcome: CompareOutcome } {
  const { alignment, userFrames, refFrames, poseHints, vw } = input;
  const judged = { judgement };
  const breakdown = scoreComparison({ criteria: profile.criteria, phases: profile.phases, judgement: judged.judgement, signals: clip.signals, viewMatches: !vw });

  // --- records: the detailed comparison + (when scored) the existing pose-analysis history
  let poseRecordId: string | null = null;
  if (breakdown.status === 'scored' && breakdown.score !== null) {
    const values: Record<string, number> = { match: 100, partial: 50, mismatch: 0 };
    const pr: PoseAnalysisRecord = {
      recordId: newId('pose'),
      techniqueId: t.id,
      martialArtId: t.martialArt,
      score: breakdown.score,
      status: classifyScore(breakdown.score),
      metricScores: Object.fromEntries(judged.judgement.criteria.filter((c) => c.verdict !== 'not_observable').map((c) => [c.criterionId, values[c.verdict]])),
      analyzedAt: new Date().toISOString(),
      method: 'video_compare',
      referenceId: ref.id,
      reliability: breakdown.reliability,
    };
    poseRecordsRepository.add(pr);
    poseRecordId = pr.recordId;
  }
  const record: FormCompareRecord = {
    id: newId('cmp'),
    techniqueId: t.id,
    martialArt: t.martialArt,
    referenceId: ref.id,
    createdAt: new Date().toISOString(),
    breakdown,
    judgement: judged.judgement,
    criteria: profile.criteria,
    signals: clip.signals,
    alignment,
    viewWarning: vw,
    poseHints,
    poseRecordId,
  };
  saveCompareRecord(record);
  return { ok: true, outcome: { record, userFrames, refFrames } };
}

/** Frame parts helper re-exported for tests (labelled the same way the AI sees them). */
export { frameParts };
