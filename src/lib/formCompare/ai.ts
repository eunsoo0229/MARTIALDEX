import type { Technique } from '../../types';
import type { AiMediaPart } from '../ai/types';
import { askGeminiForJson } from '../fighterStyle/geminiJson';
import { getMartialArt } from '../loadData';
import type {
  CameraView,
  ClipFrame,
  ComparisonJudgement,
  Confidence,
  CriterionAspect,
  Importance,
  ReferenceCriterion,
  ReferencePhase,
  ReferenceProfile,
  ReferenceVideo,
  Verdict,
} from './types';
import { ASPECT_LABEL } from './types';

// The two AI steps (Gemini via the existing transport — Electron IPC or the
// gemini-ask Edge Function; the key never reaches this bundle):
//
//  1. buildReferenceProfile — once per reference video: what the
//     demonstration shows, split into phases, and the evaluation CRITERIA
//     (only what the reference actually shows; occluded/unclear aspects go
//     to `excluded`). No joint angles or tolerances are written by anyone.
//  2. judgeAttempt — per attempt: for each criterion a verdict + evidence
//     citing the frames. The model returns NO score (scoring.ts does).
//
// Video input: a YouTube reference is passed as a Gemini video URL part
// (public videos; the API reads it — nothing is downloaded by the app);
// file references and the user's attempt are passed as labelled keyframes.

const ASPECTS = Object.keys(ASPECT_LABEL) as CriterionAspect[];
const IMPORTANCES: Importance[] = ['core', 'support', 'minor'];
const VIEWS: CameraView[] = ['front', 'side', 'diagonal', 'back', 'unknown'];
const VERDICTS: Verdict[] = ['match', 'partial', 'mismatch', 'not_observable'];
const CONFIDENCES: Confidence[] = ['high', 'medium', 'low'];

const APPEARANCE_RULE =
  '배경, 조명, 복장 색, 체격·키, 성별, 카메라 화질, 시연자와의 거리 차이는 기술 수행과 무관하므로 절대 평가 근거로 쓰지 않는다. 오직 몸의 움직임과 자세만 본다.';

function techniqueBrief(t: Technique): string {
  const art = getMartialArt(t.martialArt)?.nameKo ?? t.martialArt;
  const p = t.posture;
  return [
    `기술: ${t.name}${t.koreanName ? ` (${t.koreanName})` : ''} · 무술: ${art} · 분류: ${t.category}`,
    t.description ? `설명: ${t.description.slice(0, 300)}` : '',
    p?.steps?.length ? `MARTIALDEX 자세 단계: ${p.steps.join(' / ')}` : '',
    p?.keyPoints?.length ? `핵심 포인트: ${p.keyPoints.join(' / ')}` : '',
    p?.commonMistakes?.length ? `흔한 실수: ${p.commonMistakes.join(' / ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function frameParts(label: string, frames: { tMs: number; image: string; note?: string }[]): AiMediaPart[] {
  return frames.flatMap((f, i) => [
    { kind: 'text' as const, text: `[${label}${i + 1} · ${(f.tMs / 1000).toFixed(2)}초${f.note ? ` · ${f.note}` : ''}]` },
    { kind: 'image' as const, mimeType: 'image/jpeg', data: f.image.replace(/^data:image\/\w+;base64,/, '') },
  ]);
}

export function referenceMediaParts(ref: ReferenceVideo, refFrames: ClipFrame[] | null, notes?: string[]): AiMediaPart[] {
  if (ref.source.kind === 'youtube') {
    return [
      { kind: 'text', text: `[기준 영상] YouTube ${ref.startSeconds.toFixed(1)}초 ~ ${ref.endSeconds.toFixed(1)}초 구간` },
      { kind: 'youtube', url: ref.source.url, startSeconds: ref.startSeconds, endSeconds: ref.endSeconds, fps: Math.min(8, Math.max(2, Math.round(40 / Math.max(1, ref.endSeconds - ref.startSeconds)))) },
    ];
  }
  return [{ kind: 'text', text: '[기준 영상 프레임 R — 시간은 기준 구간 시작부터]' }, ...frameParts('R', (refFrames ?? []).map((f, i) => ({ ...f, note: notes?.[i] })))];
}

// ---------------------------------------------------------------- 1. reference profile

interface RawProfile {
  techniqueVisible: boolean;
  matchesTechnique: boolean;
  observedTechnique: string;
  cameraView: string;
  visibleBodyParts: string[];
  activeStartFraction: number;
  activeEndFraction: number;
  phases: { id: string; name: string; description: string; startFraction: number | null; endFraction: number | null }[];
  criteria: { id: string; phaseId: string | null; aspect: string; description: string; importance: string; evidence: string }[];
  excluded: { aspect: string; reason: string }[];
  summary: string;
}
const isRawProfile = (v: unknown): v is RawProfile => {
  const o = v as RawProfile;
  return !!o && typeof o === 'object' && Array.isArray(o.phases) && Array.isArray(o.criteria);
};

const clamp01 = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : null);

export async function buildReferenceProfile(t: Technique, ref: ReferenceVideo, refFrames: ClipFrame[] | null): Promise<{ ok: true; profile: ReferenceProfile } | { ok: false; message: string }> {
  const r = await askGeminiForJson<RawProfile>({
    systemInstruction: [
      '너는 격투기 기술 코치이자 동작 분석가다. [기준 영상]은 한 기술의 모범 시연이다. 이 시연을 기준으로 다른 사람의 같은 기술 수행을 평가할 "평가 기준"을 만든다.',
      '규칙:',
      '- 기준 영상에서 실제로 보이는 것만 기준으로 만든다. 가려졌거나 화면 밖이거나 카메라 각도 때문에 판단할 수 없는 요소는 criteria에 넣지 말고 excluded에 이유와 함께 넣는다.',
      '- 카메라를 향하거나 멀어지는 방향(깊이 방향)의 세부 — 예: 정면 카메라에서 앞으로 뻗은 팔꿈치가 끝까지 펴졌는지, 앞뒤 거리 — 는 2D 영상으로 확실히 판단할 수 없으므로 criteria에 넣지 말고 excluded에 넣는다. 화면에서 위아래·좌우로 보이는 위치와 궤적만 기준으로 삼는다.',
      '- 관절 각도 숫자나 허용 오차를 쓰지 않는다. "앞손이 턱 높이에서 일직선으로 뻗었다가 같은 길로 돌아온다"처럼 관찰 가능한 위치·움직임·순서로 쓴다.',
      `- aspect는 다음 중 하나: ${ASPECTS.map((a) => `${a}(${ASPECT_LABEL[a]})`).join(', ')}. 모든 aspect를 억지로 채우지 말고 이 기술에 중요한 것만 고른다.`,
      '- importance: core(이 기술을 이 기술답게 만드는 핵심 — 틀리면 다른 기술이 되거나 효과가 없음), support(효율·안전에 중요), minor(세부).',
      '- phases 2~5개(준비 → 실행 → 마무리 등 실제 보이는 단계). startFraction/endFraction은 보여 준 기준 구간 전체를 0~1로 볼 때의 위치.',
      '- activeStartFraction/activeEndFraction: 구간 안에서 기술 동작이 실제로 시작/끝나는 위치(앞뒤 대기 시간 제외).',
      '- criteria 4~10개, 각 기준에는 그 기준이 기준 영상의 어디에서 보이는지 evidence(시간 또는 R 프레임 번호)를 쓴다.',
      '- [기술 데이터]는 참고용이다. 기준 영상과 다르면 기준 영상을 따른다. 기준 영상이 이 기술이 아니면 matchesTechnique=false.',
      `- ${APPEARANCE_RULE}`,
      '- 모든 문장은 한국어.',
      '출력: {"techniqueVisible": boolean, "matchesTechnique": boolean, "observedTechnique": string, "cameraView": "front"|"side"|"diagonal"|"back"|"unknown", "visibleBodyParts": string[], "activeStartFraction": number, "activeEndFraction": number, "phases": [{"id":"P1","name":string,"description":string,"startFraction":number|null,"endFraction":number|null}], "criteria": [{"id":"C1","phaseId":"P1"|null,"aspect":string,"description":string,"importance":"core"|"support"|"minor","evidence":string}], "excluded": [{"aspect":string,"reason":string}], "summary": string}',
    ].join('\n'),
    contextText: `[기술 데이터]\n${techniqueBrief(t)}\n[사용자가 알려 준 촬영 방향] ${ref.cameraView}`,
    question: '기준 영상을 분석해 평가 기준을 JSON으로 만들어 줘.',
    mediaParts: referenceMediaParts(ref, refFrames),
    temperature: 0.1,
    maxOutputTokens: 4096,
    validate: isRawProfile,
  });
  if (!r.ok) return { ok: false, message: `기준 영상 분석에 실패했습니다: ${r.message}` };
  const d = r.data;
  const phases: ReferencePhase[] = d.phases
    .filter((p) => p && typeof p.name === 'string')
    .slice(0, 5)
    .map((p, i) => ({ id: typeof p.id === 'string' && p.id ? p.id : `P${i + 1}`, name: p.name.trim(), description: String(p.description ?? '').trim(), startSec: null, endSec: null, startFraction: clamp01(p.startFraction), endFraction: clamp01(p.endFraction) }));
  const phaseIds = new Set(phases.map((p) => p.id));
  const seen = new Set<string>();
  const criteria: ReferenceCriterion[] = d.criteria
    .filter((c) => c && typeof c.description === 'string' && c.description.trim() && ASPECTS.includes(c.aspect as CriterionAspect))
    .slice(0, 10)
    .map((c, i) => {
      let id = typeof c.id === 'string' && c.id ? c.id : `C${i + 1}`;
      if (seen.has(id)) id = `C${i + 1}`;
      seen.add(id);
      return {
        id,
        phaseId: c.phaseId && phaseIds.has(c.phaseId) ? c.phaseId : null,
        aspect: c.aspect as CriterionAspect,
        description: c.description.trim(),
        importance: IMPORTANCES.includes(c.importance as Importance) ? (c.importance as Importance) : 'support',
        evidence: String(c.evidence ?? '').trim(),
      };
    });
  const clipLen = ref.endSeconds - ref.startSeconds;
  for (const p of phases) {
    p.startSec = p.startFraction !== null ? Math.round(p.startFraction * clipLen * 10) / 10 : null;
    p.endSec = p.endFraction !== null ? Math.round(p.endFraction * clipLen * 10) / 10 : null;
  }
  const aS = clamp01(d.activeStartFraction) ?? 0;
  const aE = clamp01(d.activeEndFraction) ?? 1;
  return {
    ok: true,
    profile: {
        builtAt: new Date().toISOString(),
        model: 'gemini',
        techniqueVisible: d.techniqueVisible !== false,
        matchesTechnique: d.matchesTechnique !== false,
        observedTechnique: String(d.observedTechnique ?? ''),
        cameraView: VIEWS.includes(d.cameraView as CameraView) ? (d.cameraView as CameraView) : 'unknown',
        visibleBodyParts: Array.isArray(d.visibleBodyParts) ? d.visibleBodyParts.map(String).slice(0, 12) : [],
        phases,
        criteria,
        excluded: Array.isArray(d.excluded) ? d.excluded.filter((x) => x && x.aspect).map((x) => ({ aspect: String(x.aspect), reason: String(x.reason ?? '') })) : [],
        summary: String(d.summary ?? '').trim(),
        active: aE > aS ? { start: aS, end: aE } : { start: 0, end: 1 },
    },
  };
}

// ---------------------------------------------------------------- 2. judging one attempt

interface RawJudgement {
  hintChecks?: { hint: string; confirmed: boolean; criterionId: string | null }[];
  sameTechnique: boolean;
  techniquePerformed: boolean;
  criteria: { criterionId: string; verdict: string; confidence: string; observation: string; referenceObservation: string }[];
  phases: { phaseId: string; summary: string }[];
  strengths: string[];
  differences: { criterionId: string | null; what: string; why: string }[];
  focus: string[];
  drills: string[];
  limitations: string[];
}
const isRawJudgement = (v: unknown): v is RawJudgement => {
  const o = v as RawJudgement;
  return !!o && typeof o === 'object' && Array.isArray(o.criteria);
};
const strs = (v: unknown, n = 6) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()).slice(0, n) : []);

export async function judgeAttempt(input: {
  technique: Technique;
  ref: ReferenceVideo;
  profile: ReferenceProfile;
  /** Reference + user media, ideally as aligned pairs (service.ts builds them). */
  mediaParts: AiMediaPart[];
  qualityNote: string;
  /** Local pose-difference hints after time alignment (may be empty). Numbered H1… in the prompt. */
  poseHints: string[];
  samples?: number;
}): Promise<{ ok: true; judgement: ComparisonJudgement } | { ok: false; message: string }> {
  const { profile } = input;
  const criteriaText = profile.criteria.map((c) => `${c.id} [${c.importance} · ${ASPECT_LABEL[c.aspect]}${c.phaseId ? ` · ${c.phaseId}` : ''}] ${c.description} (기준 영상 근거: ${c.evidence || '-'})`).join('\n');
  const ask = () => askGeminiForJson<RawJudgement>({
    systemInstruction: [
      '너는 격투기 코치다. [기준 영상]의 모범 시연과 [사용자 프레임 U]의 수행을 [평가 기준]별로 비교한다. 점수는 매기지 않는다.',
      '- 짝에 "보조 신호(확인 필요)"가 붙어 있으면 그 짝의 해당 신체 부위를 반드시 직접 비교하고, 프레임에서 확인되면 관련 기준 판정에 반영한다(확인되지 않으면 무시).',
      '- 같은 단계의 기준 프레임 R과 사용자 프레임 U가 짝지어 있으면 그 짝을 직접 비교한다. 특히 "정점"(동작이 가장 크게 뻗은 순간) 짝에서 양손·팔꿈치·머리 위치 차이를 꼼꼼히 본다.',
      '각 기준마다:',
      '- verdict: match(기준 영상과 같게 수행) | partial(일부만 맞음) | mismatch(다르게 수행) | not_observable(사용자 프레임에서 그 부분이 안 보이거나 가려져 판단 불가).',
      '- 보이지 않는 것을 맞았다고 추정하지 않는다. 판단 근거가 없으면 반드시 not_observable.',
      '- 카메라를 향하는 깊이 방향 움직임이라 프레임에서 확실히 구분되지 않는 세부(예: 정면에서 본 팔꿈치가 완전히 펴졌는지)는 추측하지 말고 not_observable(confidence low)로 둔다.',
      '- observation: 사용자 프레임에서 실제로 본 것(U 번호를 인용). referenceObservation: 기준 영상에서 같은 부분이 어떻게 보이는지.',
      '- confidence: high(여러 프레임에서 분명) | medium | low(한 프레임·흐릿함·각도 문제).',
      `- ${APPEARANCE_RULE} 전체 모습이 비슷해도 핵심 동작이 다르면 mismatch다.`,
      '- 프레임 사이 시간 간격이 기준 영상과 달라도(빠르거나 느리게 수행) 속도 자체는 감점 이유가 아니다. 단계 순서와 동작 모양을 본다.',
      '- sameTechnique: 사용자가 기준 영상과 같은 기술을 시도했는가. techniquePerformed: 사용자 프레임에 기술 수행 동작이 있는가(가만히 서 있기만 하면 false).',
      '- strengths: 잘한 점(구체적으로). differences: 기준과 다른 주요 부분 {criterionId, what(무엇이 다른가), why(왜 고쳐야 하는가 — 효과·안전·방어)}. focus: 다음 수행에서 집중할 1~3가지. drills: 고치기 위한 구체적 연습 1~3가지. limitations: 이번 평가의 한계(가려진 부분, 각도, 화질).',
      '- 모든 문장은 한국어 존댓말, 짧고 구체적으로.',
      '- hintChecks: 보조 신호 H1, H2 … 마다 {"hint": "H1", "confirmed": 프레임에서 실제로 그 차이가 보이면 true, "criterionId": 그 차이가 해당하는 기준 id 또는 null}. 보조 신호가 없으면 [].',
      '출력: {"sameTechnique": boolean, "techniquePerformed": boolean, "hintChecks": [{"hint": string, "confirmed": boolean, "criterionId": string|null}], "criteria": [{"criterionId": string, "verdict": string, "confidence": string, "observation": string, "referenceObservation": string}], "phases": [{"phaseId": string, "summary": string}], "strengths": string[], "differences": [{"criterionId": string|null, "what": string, "why": string}], "focus": string[], "drills": string[], "limitations": string[]}',
    ].join('\n'),
    contextText: [
      `[기술]\n${techniqueBrief(input.technique)}`,
      `[기준 영상 단계]\n${profile.phases.map((p) => `${p.id} ${p.name}: ${p.description}`).join('\n')}`,
      `[평가 기준]\n${criteriaText}`,
      profile.excluded.length ? `[기준 영상으로 판단할 수 없어 평가하지 않는 것]\n${profile.excluded.map((x) => `${x.aspect}: ${x.reason}`).join('\n')}` : '',
      `[촬영 정보]\n${input.qualityNote}`,
      input.poseHints.length
        ? `[자세 추정 보조 신호 — 시간 정렬 후 기준 영상과 위치 차이가 큰 신체 부위 (MediaPipe 추정치, 틀릴 수 있음). 각각 프레임에서 직접 확인해 hintChecks에 답한다]\n${input.poseHints.map((h, i) => `H${i + 1}. ${h}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    question: '모든 평가 기준에 대해 판정하고 JSON으로 답해 줘.',
    mediaParts: input.mediaParts,
    temperature: 0.1,
    maxOutputTokens: 8192,
    thinkingLevel: 'low',
    validate: isRawJudgement,
  });
  // Two independent judgements in parallel, merged per criterion (self-consistency):
  // one sample alone was seen to flip a borderline criterion between runs.
  // One call by default — the free tier of the main model is ~20 requests/day for the whole
  // app. `samples: 2` (self-consistency, merged by mergeJudgements) is available when quota allows.
  const runs = await Promise.all(Array.from({ length: Math.max(1, Math.min(2, input.samples ?? 1)) }, () => ask()));
  const ok = runs.filter((x): x is Extract<typeof x, { ok: true }> => x.ok).map((x) => parseJudgement(x.data, profile));
  if (!ok.length) {
    const first = runs[0];
    return { ok: false, message: `영상 비교에 실패했습니다: ${first.ok ? '' : first.message}` };
  }
  return { ok: true, judgement: mergeJudgements(ok, profile) };
}

function parseJudgement(d: RawJudgement, profile: ReferenceProfile): ComparisonJudgement {
  const ids = new Set(profile.criteria.map((c) => c.id));
  const got = new Map<string, ComparisonJudgement['criteria'][number]>();
  for (const c of d.criteria) {
    if (!c || !ids.has(c.criterionId) || got.has(c.criterionId)) continue;
    got.set(c.criterionId, {
      criterionId: c.criterionId,
      verdict: VERDICTS.includes(c.verdict as Verdict) ? (c.verdict as Verdict) : 'not_observable',
      confidence: CONFIDENCES.includes(c.confidence as Confidence) ? (c.confidence as Confidence) : 'low',
      observation: String(c.observation ?? '').trim(),
      referenceObservation: String(c.referenceObservation ?? '').trim(),
    });
  }
  // A criterion the model skipped is NOT assumed correct.
  for (const c of profile.criteria) if (!got.has(c.id)) got.set(c.id, { criterionId: c.id, verdict: 'not_observable', confidence: 'low', observation: 'AI가 이 기준을 판정하지 않았습니다.', referenceObservation: '' });
  // Consistency with the AI's own confirmation: a pose difference it CONFIRMED on the frames
  // cannot leave the criterion it belongs to at "match".
  const confirmedHints: string[] = [];
  for (const h of Array.isArray(d.hintChecks) ? d.hintChecks : []) {
    if (!h || h.confirmed !== true || !h.criterionId || !got.has(h.criterionId)) continue;
    const c = got.get(h.criterionId)!;
    confirmedHints.push(`${String(h.hint)}→${h.criterionId}`);
    if (c.verdict === 'match') got.set(h.criterionId, { ...c, verdict: 'partial', confidence: c.confidence === 'high' ? 'medium' : c.confidence, observation: `${c.observation} (자세 추정에서 기준과 차이가 확인되어 부분 일치로 조정)` });
  }
  return {
    confirmedHints,
    sameTechnique: d.sameTechnique !== false,
    techniquePerformed: d.techniquePerformed !== false,
    criteria: profile.criteria.map((c) => got.get(c.id)!),
    phases: Array.isArray(d.phases) ? d.phases.filter((p) => p && typeof p.summary === 'string').map((p) => ({ phaseId: String(p.phaseId), summary: p.summary.trim() })) : [],
    strengths: strs(d.strengths),
    differences: Array.isArray(d.differences) ? d.differences.filter((x) => x && typeof x.what === 'string').slice(0, 6).map((x) => ({ criterionId: x.criterionId && ids.has(x.criterionId) ? x.criterionId : null, what: x.what.trim(), why: String(x.why ?? '').trim() })) : [],
    focus: strs(d.focus, 3),
    drills: strs(d.drills, 3),
    limitations: strs(d.limitations, 4),
    agreement: 1,
    samples: 1,
  };
}

const V: Record<Exclude<Verdict, 'not_observable'>, number> = { match: 1, partial: 0.5, mismatch: 0 };

/**
 * Merge per criterion: same verdict → kept (lowest confidence of the two);
 * different → the mean verdict value (≥ 0.75 match, ≥ 0.4 partial, else
 * mismatch) with LOW confidence; observed vs not observable → the observed
 * one, low confidence. Texts come from the sample closest to the merged verdicts.
 * `agreement` = share of criteria both samples judged the same (→ reliability).
 */
export function mergeJudgements(js: ComparisonJudgement[], profile: ReferenceProfile): ComparisonJudgement {
  if (js.length === 1) return js[0];
  let same = 0;
  const criteria = profile.criteria.map((c, i) => {
    const xs = js.map((j) => j.criteria[i]);
    if (xs.every((x) => x.verdict === xs[0].verdict)) {
      same++;
      const order: Confidence[] = ['low', 'medium', 'high'];
      const conf = xs.map((x) => x.confidence).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
      return { ...xs[0], confidence: conf };
    }
    const observed = xs.filter((x) => x.verdict !== 'not_observable');
    if (observed.length === 1) return { ...observed[0], confidence: 'low' as Confidence };
    const mean = observed.reduce((sum, x) => sum + V[x.verdict as keyof typeof V], 0) / observed.length;
    const verdict: Verdict = mean >= 0.75 ? 'match' : mean >= 0.4 ? 'partial' : 'mismatch';
    const pick = observed.find((x) => x.verdict === verdict) ?? observed.find((x) => x.verdict !== 'match') ?? observed[0];
    return { ...pick, verdict, confidence: 'low' as Confidence, observation: `${pick.observation} (두 번의 판정이 엇갈려 중간값으로 정함)` };
  });
  const dist = (j: ComparisonJudgement) => j.criteria.reduce((sum, x, i) => sum + (x.verdict === criteria[i].verdict ? 0 : 1), 0);
  const base = [...js].sort((a, b) => dist(a) - dist(b))[0];
  return {
    ...base,
    sameTechnique: js.filter((j) => j.sameTechnique).length * 2 >= js.length,
    techniquePerformed: js.some((j) => j.techniquePerformed),
    criteria,
    agreement: Math.round((same / Math.max(1, profile.criteria.length)) * 100) / 100,
    samples: js.length,
  };
}
