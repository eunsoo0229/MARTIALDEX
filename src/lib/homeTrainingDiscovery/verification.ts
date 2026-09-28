// Mirrors userTechniques/verification.ts exactly in shape, but asks a
// different question ("is this a real EXERCISE/training drill" rather than
// "is this a real martial arts technique") — kept as a fully separate file
// (not a parameterized version of verifyTechnique) so the existing
// technique-request flow's prompt/behavior is never at risk from this
// feature's changes.
import { askGeminiForJsonWithGrounding } from '../userTechniques/geminiJson';
import type { VerificationResult, VerificationVerdict } from '../userTechniques/types';

const VALID_VERDICTS: VerificationVerdict[] = ['confirmed', 'alias_of_existing', 'uncertain', 'fictional', 'insufficient_evidence'];

interface RawExerciseVerification {
  verdict: string;
  confidence: number;
  category: string | null;
  evidenceNotes: string[];
  canonicalName: string | null;
  reason: string;
}

function isRawExerciseVerification(data: unknown): data is RawExerciseVerification {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.verdict === 'string' &&
    VALID_VERDICTS.includes(d.verdict as VerificationVerdict) &&
    typeof d.confidence === 'number' &&
    (d.category === null || typeof d.category === 'string') &&
    Array.isArray(d.evidenceNotes) &&
    d.evidenceNotes.every((x) => typeof x === 'string') &&
    (d.canonicalName === null || typeof d.canonicalName === 'string') &&
    typeof d.reason === 'string'
  );
}

/**
 * "실제 존재하는 운동/훈련 방법인지" verification — the exercise-domain
 * counterpart of userTechniques/verifyTechnique. Same Google-Search-
 * grounding-first, never-a-bare-boolean design.
 */
export async function verifyExercise(input: {
  name: string;
  description?: string;
}): Promise<{ ok: true; result: VerificationResult } | { ok: false; message: string }> {
  const systemInstruction = [
    '사용자가 새로운 홈트레이닝 운동(맨몸 운동, 스트레칭, 컨디셔닝 드릴, 격투기 훈련용 움직임 등)을 Martialdex에',
    '등록하려고 한다. 이 운동이 실제로 존재하는 운동/훈련 방법인지 엄격하게 검증한다.',
    '',
    '확인할 것:',
    '- 실제로 피트니스/스포츠/격투기 훈련에서 사용되는 운동인지',
    '- 운동명이 실제로 통용되는 명칭인지 (특정 개인이 지어낸 이름이거나 마케팅 용어는 아닌지)',
    '- 다른 운동의 잘못된 명칭일 가능성은 없는지',
    '- 완전히 지어낸 운동일 가능성은 없는지',
    '',
    'verdict는 다음 중 하나다:',
    '- "confirmed": 실제로 널리 알려진 운동/훈련 방법으로 확인됨',
    '- "alias_of_existing": 실제 운동이지만 표준 명칭이 아니라 특정 커뮤니티/개인의 별칭으로 보임',
    '- "uncertain": 존재할 수도 있지만 확신하기 어려움',
    '- "fictional": 실제로 존재하지 않는 지어낸 운동으로 보임',
    '- "insufficient_evidence": 판단할 근거(자료)가 충분하지 않음',
    '',
    'confidence(0~100)는 verdict에 대한 스스로의 확신도다. 근거가 부족하거나 출처가 불명확하면 confidence를 낮게(30 이하) 준다.',
    '절대 근거 없이 confirmed를 주지 않는다 — 확신할 수 없으면 uncertain 또는 insufficient_evidence를 사용한다.',
    'evidenceNotes에는 실제로 확인/검색한 내용을 간단히 적되, 확인하지 못한 내용을 지어내지 않는다. 자료가 없으면 빈 배열로 둔다.',
    '',
    'category에는 "하체"/"상체"/"코어"/"컨디셔닝"/"가동성"/"유연성"/"회복" 등 이 운동에 맞는 한국어 분류 하나를 적는다.',
    '',
    'canonicalName: 입력한 운동명이 줄임말/다른 표기라면 표준적인 정식 명칭(영문)을 적는다.',
    '입력한 이름이 이미 정식 명칭이면 그 이름을 그대로 적는다. 정식 명칭을 알 수 없으면 null로 둔다.',
    '',
    '출력 형식: {"verdict": string, "confidence": number, "category": string|null, "evidenceNotes": string[], "canonicalName": string|null, "reason": string(한국어)}',
  ].join('\n');

  const question = `운동명: "${input.name}"${input.description ? ` / 사용자 설명: "${input.description}"` : ''}`;

  let result = await askGeminiForJsonWithGrounding<RawExerciseVerification>({
    systemInstruction,
    contextText: '',
    question,
    useSearchGrounding: true,
    validate: isRawExerciseVerification,
  });

  if (!result.ok && result.code === 'RATE_LIMIT') {
    result = await askGeminiForJsonWithGrounding<RawExerciseVerification>({
      systemInstruction,
      contextText: '',
      question,
      useSearchGrounding: false,
      validate: isRawExerciseVerification,
    });
  }

  if (!result.ok) return { ok: false, message: result.message };

  return {
    ok: true,
    result: {
      verdict: result.data.verdict as VerificationVerdict,
      confidence: Math.max(0, Math.min(100, Math.round(result.data.confidence))),
      martialArtConfirmed: null,
      category: result.data.category,
      evidenceNotes: result.data.evidenceNotes,
      canonicalName: result.data.canonicalName,
      groundingSources: result.groundingSources,
      usedSearchGrounding: result.usedSearchGrounding,
      reason: result.data.reason,
    },
  };
}

// Higher than userTechniques' 55 — "is this a real exercise" is a harder
// question to ground with web search than "is this a real martial arts
// technique" (per the plan's explicit design-review finding: exercise
// names are more prone to marketing/personal-trainer-coined variants that
// LOOK plausible but aren't standardized), so this feature deliberately
// requires stronger evidence before auto-registering into the shared
// add_teq library.
const CONFIDENCE_THRESHOLD = 65;

export function passesExerciseVerificationGate(result: VerificationResult): boolean {
  if (result.verdict !== 'confirmed') return false;
  if (result.confidence < CONFIDENCE_THRESHOLD) return false;
  if (result.evidenceNotes.length === 0 && result.groundingSources.length === 0) return false;
  return true;
}
