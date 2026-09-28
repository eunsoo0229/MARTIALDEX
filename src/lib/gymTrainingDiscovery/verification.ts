// Mirrors homeTrainingDiscovery/verification.ts exactly in shape, but asks
// about a GYM/WEIGHT-TRAINING exercise specifically (not "any exercise" —
// the question is scoped to strength/weight-training movements so the AI
// doesn't confirm e.g. a stretch or a cardio drill that belongs in the home-
// training library instead) — kept as its own file so neither existing
// discovery flow's prompt is at risk from this feature's changes.
import { askGeminiForJsonWithGrounding } from '../userTechniques/geminiJson';
import type { VerificationResult, VerificationVerdict } from '../userTechniques/types';

const VALID_VERDICTS: VerificationVerdict[] = ['confirmed', 'alias_of_existing', 'uncertain', 'fictional', 'insufficient_evidence'];

interface RawGymVerification {
  verdict: string;
  confidence: number;
  category: string | null;
  evidenceNotes: string[];
  canonicalName: string | null;
  reason: string;
}

function isRawGymVerification(data: unknown): data is RawGymVerification {
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
 * "실제 존재하는 헬스/웨이트 트레이닝 운동인지" verification — the gym-domain
 * counterpart of userTechniques/verifyTechnique and
 * homeTrainingDiscovery/verifyExercise. Same Google-Search-grounding-first,
 * never-a-bare-boolean design.
 */
export async function verifyGymExercise(input: {
  name: string;
  description?: string;
}): Promise<{ ok: true; result: VerificationResult } | { ok: false; message: string }> {
  const systemInstruction = [
    '사용자가 새로운 헬스/웨이트 트레이닝 운동(바벨/덤벨/머신/케이블/맨몸 저항 운동 등)을 Martialdex에',
    '등록하려고 한다. 이 운동이 실제로 존재하는 헬스장/웨이트 트레이닝 운동인지 엄격하게 검증한다.',
    '',
    '확인할 것:',
    '- 실제로 헬스장/보디빌딩/파워리프팅/스트렝스 트레이닝에서 사용되는 운동인지',
    '- 운동명이 실제로 통용되는 명칭인지 (특정 개인/유튜버가 지어낸 이름이거나 마케팅 용어는 아닌지)',
    '- 다른 운동의 잘못된 명칭일 가능성은 없는지',
    '- 완전히 지어낸 운동일 가능성은 없는지',
    '- 스트레칭/유산소/맨몸 컨디셔닝 드릴처럼 "홈트레이닝" 쪽에 더 맞는 운동은 아닌지(그런 경우 uncertain으로 판단)',
    '',
    'verdict는 다음 중 하나다:',
    '- "confirmed": 실제로 널리 알려진 헬스/웨이트 트레이닝 운동으로 확인됨',
    '- "alias_of_existing": 실제 운동이지만 표준 명칭이 아니라 특정 커뮤니티/개인의 별칭으로 보임',
    '- "uncertain": 존재할 수도 있지만 확신하기 어렵거나, 헬스보다 다른 카테고리(홈트/스트레칭/유산소)에 더 맞음',
    '- "fictional": 실제로 존재하지 않는 지어낸 운동으로 보임',
    '- "insufficient_evidence": 판단할 근거(자료)가 충분하지 않음',
    '',
    'confidence(0~100)는 verdict에 대한 스스로의 확신도다. 근거가 부족하거나 출처가 불명확하면 confidence를 낮게(30 이하) 준다.',
    '절대 근거 없이 confirmed를 주지 않는다 — 확신할 수 없으면 uncertain 또는 insufficient_evidence를 사용한다.',
    'evidenceNotes에는 실제로 확인/검색한 내용을 간단히 적되, 확인하지 못한 내용을 지어내지 않는다. 자료가 없으면 빈 배열로 둔다.',
    '',
    'category에는 이 운동이 대상으로 하는 부위 하나를 정확히 다음 14개 중에서만 고른다:',
    '가슴, 등, 어깨, 이두, 삼두, 전완, 복근, 둔근, 대퇴사두근, 햄스트링, 종아리, 허리, 유산소, 전신',
    '',
    'canonicalName: 입력한 운동명이 줄임말/다른 표기라면 표준적인 정식 명칭(한국어 또는 영문)을 적는다.',
    '입력한 이름이 이미 정식 명칭이면 그 이름을 그대로 적는다. 정식 명칭을 알 수 없으면 null로 둔다.',
    '',
    '출력 형식: {"verdict": string, "confidence": number, "category": string|null, "evidenceNotes": string[], "canonicalName": string|null, "reason": string(한국어)}',
  ].join('\n');

  const question = `운동명: "${input.name}"${input.description ? ` / 사용자 설명: "${input.description}"` : ''}`;

  let result = await askGeminiForJsonWithGrounding<RawGymVerification>({
    systemInstruction,
    contextText: '',
    question,
    useSearchGrounding: true,
    validate: isRawGymVerification,
  });

  if (!result.ok && result.code === 'RATE_LIMIT') {
    result = await askGeminiForJsonWithGrounding<RawGymVerification>({
      systemInstruction,
      contextText: '',
      question,
      useSearchGrounding: false,
      validate: isRawGymVerification,
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

// Same elevated bar as homeTrainingDiscovery (65, higher than
// userTechniques' 55) — "is this a real exercise" is harder to ground with
// web search than "is this a real martial arts technique."
const CONFIDENCE_THRESHOLD = 65;

export function passesGymVerificationGate(result: VerificationResult): boolean {
  if (result.verdict !== 'confirmed') return false;
  if (result.confidence < CONFIDENCE_THRESHOLD) return false;
  if (result.evidenceNotes.length === 0 && result.groundingSources.length === 0) return false;
  return true;
}
