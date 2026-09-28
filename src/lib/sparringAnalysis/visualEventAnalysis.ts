import { askGeminiForJson } from '../fighterStyle/geminiJson';
import { getMartialArt } from '../loadData';
import { captureFramesAt } from './frameCapture';
import type { HitAssessment, MotionEvent, VisualEventInsight } from './types';

// The one place this feature asks Gemini to actually LOOK at the video
// (everything else — motionEventDetector.ts, sequenceAnalysis.ts — is pure
// geometry/timestamp math). Entirely optional and best-effort, same contract
// as techniqueHypothesis.ts's hypothesizeTechniques: any failure returns an
// empty array, never blocks the rest of the analysis.

// Sending one frame per detected strike/kick would burn tokens and this
// app's tight free-tier quota fast — capped, and biased toward the events
// the geometry layer itself was more confident about (medium over low),
// since those are the ones most likely to actually show a clean moment.
const MAX_FRAMES = 8;

function selectMoments(motionEvents: MotionEvent[]): MotionEvent[] {
  const candidates = motionEvents.filter((e) => e.category === 'strike_like' || e.category === 'kick_like');
  const sorted = [...candidates].sort((a, b) => {
    if (a.confidence === b.confidence) return a.timestampSec - b.timestampSec;
    return a.confidence === 'medium' ? -1 : 1;
  });
  return sorted.slice(0, MAX_FRAMES);
}

const VALID_HIT: HitAssessment[] = ['landed', 'missed', 'unclear'];

interface VisualResponseItem {
  frameIndex: number;
  hitAssessment: string;
  opponentReaction: string | null;
  confidence: 'low' | 'medium' | 'high';
  evidence: string;
}

function isVisualResponse(data: unknown): data is VisualResponseItem[] {
  return (
    Array.isArray(data) &&
    data.every((d) => {
      if (!d || typeof d !== 'object') return false;
      const o = d as Record<string, unknown>;
      return typeof o.frameIndex === 'number' && typeof o.hitAssessment === 'string' && typeof o.evidence === 'string';
    })
  );
}

/**
 * Extracts real video frames at the app's own most confident strike/kick
 * moments and asks Gemini, per frame, whether the strike appears to have
 * landed and what the opponent's reaction looks like — with an explicit,
 * repeated instruction to answer "확인 불가"/null rather than guess when the
 * frame doesn't make it visually clear. One request for all frames (never
 * one call per frame) to keep call count — and quota usage — minimal.
 */
export async function analyzeKeyMomentsVisually(video: HTMLVideoElement, martialArtId: string, motionEvents: MotionEvent[]): Promise<VisualEventInsight[]> {
  const moments = selectMoments(motionEvents);
  if (moments.length === 0) return [];

  const frames = await captureFramesAt(
    video,
    moments.map((m) => m.timestampSec)
  );
  if (frames.length === 0) return [];

  const art = getMartialArt(martialArtId);
  const result = await askGeminiForJson<VisualResponseItem[]>({
    systemInstruction: [
      `${frames.length}장의 스파링 영상 프레임 이미지가 순서대로 주어진다(0번부터 시작하는 인덱스).`,
      '각 이미지는 코드가 이미 "타격성/킥성 동작"으로 감지한 순간의 실제 장면이다.',
      '이미지마다 다음을 판단한다:',
      '- hitAssessment: 공격이 상대에게 실제로 닿은 것으로 보이면 "landed", 빗나간 것으로 보이면 "missed",',
      '  이미지만으로 명확히 판단할 수 없으면 반드시 "unclear"로 답한다 — 애매하면 절대 landed/missed로 추측하지 않는다.',
      '- opponentReaction: 상대의 반응(예: "가드를 올림", "뒤로 물러남", "타격을 맞고 움찔함")이 이미지에서 명확히',
      '  보이는 경우에만 한국어 짧은 구로 답하고, 명확하지 않으면 반드시 null로 답한다 — 상대의 심리 상태나',
      '  느낌을 추측하지 않는다(예: "위축됨"처럼 확인할 수 없는 심리적 판단 금지).',
      '- confidence: "low"|"medium"|"high" — 이 판단에 대한 스스로의 확신 정도.',
      '- evidence: 위 판단의 근거가 되는, 이미지에서 실제로 보이는 것을 한국어 1문장으로 설명(추측이 아닌 관찰).',
      '반드시 받은 이미지 개수와 정확히 같은 길이의 배열로, frameIndex 순서대로 응답한다.',
      '출력 형식: [{"frameIndex": number, "hitAssessment": "landed"|"missed"|"unclear", "opponentReaction": string | null, "confidence": "low"|"medium"|"high", "evidence": string}, ...]',
    ].join('\n'),
    contextText: `종목: ${art?.nameKo ?? martialArtId}`,
    question: '각 이미지를 순서대로 분석해줘.',
    validate: isVisualResponse,
    imageParts: frames.map((f) => f.image),
  });

  if (!result.ok) return [];

  const insights: VisualEventInsight[] = [];
  for (const item of result.data) {
    const frame = frames[item.frameIndex];
    if (!frame) continue; // out-of-range index from a malformed response — drop just this item
    insights.push({
      timestampSec: frame.timestampSec,
      techniqueId: null,
      hitAssessment: VALID_HIT.includes(item.hitAssessment as HitAssessment) ? (item.hitAssessment as HitAssessment) : 'unclear',
      opponentReaction: item.opponentReaction?.trim() || null,
      confidence: item.confidence,
      evidence: item.evidence,
    });
  }
  return insights;
}
