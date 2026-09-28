import { askGeminiForJsonWithGrounding } from './geminiJson';
import type { VerificationResult, VerificationVerdict } from './types';

const VALID_VERDICTS: VerificationVerdict[] = ['confirmed', 'alias_of_existing', 'uncertain', 'fictional', 'insufficient_evidence'];

interface RawVerification {
  verdict: string;
  confidence: number;
  martialArtConfirmed: string | null;
  category: string | null;
  evidenceNotes: string[];
  canonicalName: string | null;
  reason: string;
}

// verdict is validated as a plain string here, NOT restricted to
// VALID_VERDICTS — the model is asked for an exact lowercase enum value but
// doesn't always comply (observed live: "CONFIRMED" uppercase, and
// entirely off-vocabulary labels like "rejected"). Restricting it here used
// to hard-fail the ENTIRE verification as a PARSE_ERROR even though the
// rest of the response (evidenceNotes, reason, confidence) was perfectly
// usable. The enum is now enforced by normalizeVerdict() below, after
// parsing succeeds, with a safe fallback instead of a hard failure.
function isRawVerification(data: unknown): data is RawVerification {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.verdict === 'string' &&
    typeof d.confidence === 'number' &&
    (d.martialArtConfirmed === null || typeof d.martialArtConfirmed === 'string') &&
    (d.category === null || typeof d.category === 'string') &&
    Array.isArray(d.evidenceNotes) &&
    d.evidenceNotes.every((x) => typeof x === 'string') &&
    (d.canonicalName === null || typeof d.canonicalName === 'string') &&
    typeof d.reason === 'string'
  );
}

/**
 * Normalizes case first (handles the common "CONFIRMED" vs "confirmed"
 * drift). Anything still unrecognized after that falls back to
 * 'uncertain' rather than throwing a PARSE_ERROR — 'uncertain' never
 * passes passesVerificationGate() below, so this never loosens the
 * accept/reject safety gate; it just turns what used to be a hard,
 * generic "AI 응답 형식이 올바르지 않았습니다" failure into an honest,
 * specific "확인하기 어렵습니다" outcome for the user.
 */
function normalizeVerdict(raw: string): VerificationVerdict {
  const lower = raw.toLowerCase().trim();
  return (VALID_VERDICTS as string[]).includes(lower) ? (lower as VerificationVerdict) : 'uncertain';
}

/**
 * "실제 존재하는 무술 기술인지" verification (spec sections 3-5, 20) — the
 * single most important AI-hallucination guard in this feature. Tries
 * Google Search grounding first so the verdict is based on real external
 * sources, not just the model's training data, per spec section 5's
 * explicit request. Never returns a bare "yes/no" — always a verdict +
 * numeric confidence + evidence notes, so the caller (validator.ts) can
 * apply its own conservative threshold on top of the model's own judgment
 * instead of trusting a single boolean.
 */
export async function verifyTechnique(input: {
  name: string;
  martialArt: string;
  description?: string;
}): Promise<{ ok: true; result: VerificationResult } | { ok: false; message: string }> {
  const systemInstruction = [
    '사용자가 새로운 무술 기술을 Martialdex에 등록하려고 한다. 이 기술이 실제로 존재하는 무술 기술인지 엄격하게 검증한다.',
    '',
    '확인할 것:',
    '- 실제 해당 무술에서 사용되는 기술인지',
    '- 기술명이 실제로 사용되는 명칭인지 (인터넷에서 잘못 퍼진 이름이거나 특정 체육관만의 비공식 명칭은 아닌지)',
    '- 다른 기술의 잘못된 명칭일 가능성은 없는지',
    '- 완전히 허구의 기술일 가능성은 없는지',
    '',
    'verdict는 다음 중 하나다:',
    '- "confirmed": 실제로 존재하는 공식적인 기술 명칭으로 확인됨',
    '- "alias_of_existing": 실제 기술이지만 공식 명칭이 아니라 특정 체육관/커뮤니티의 별칭으로 보임',
    '- "uncertain": 존재할 수도 있지만 확신하기 어려움',
    '- "fictional": 실제로 존재하지 않는 허구의 기술로 보임',
    '- "insufficient_evidence": 판단할 근거(자료)가 충분하지 않음',
    '',
    'confidence(0~100)는 verdict에 대한 스스로의 확신도다. 근거가 부족하거나 출처가 불명확하면 confidence를 낮게(30 이하) 준다.',
    '절대 근거 없이 confirmed를 주지 않는다 — 확신할 수 없으면 uncertain 또는 insufficient_evidence를 사용한다.',
    'evidenceNotes에는 실제로 확인/검색한 내용을 간단히 적되(예: "복싱 코칭 자료에서 카운터 훅의 일종으로 설명됨"),',
    '확인하지 못한 내용을 지어내지 않는다. 자료가 없으면 빈 배열로 둔다.',
    '',
    'canonicalName: 입력한 기술명이 약칭/줄임말/다른 표기(예: "RNC", "리어 네이키드 초크", "RNC 서브미션")라면,',
    '그 기술의 표준적인 정식 영문 명칭(예: "Rear Naked Choke")을 적는다. 입력한 이름이 이미 정식 명칭이면 그 이름을',
    '그대로 적는다. 정식 명칭을 알 수 없으면 null로 둔다.',
    '',
    'verdict 값은 반드시 소문자 영어 단어로, 위 다섯 개(confirmed, alias_of_existing, uncertain, fictional, insufficient_evidence) 중 정확히 하나여야 한다 — 대문자나 다른 단어(예: "rejected")를 사용하지 않는다.',
    '',
    '출력 형식: {"verdict": string, "confidence": number, "martialArtConfirmed": string|null, "category": string|null, "evidenceNotes": string[], "canonicalName": string|null, "reason": string(한국어)}',
  ].join('\n');

  const question = `기술명: "${input.name}" / 무술: ${input.martialArt}${input.description ? ` / 사용자 설명: "${input.description}"` : ''}`;

  let result = await askGeminiForJsonWithGrounding<RawVerification>({
    systemInstruction,
    contextText: '',
    question,
    useSearchGrounding: true,
    validate: isRawVerification,
  });

  // Google Search grounding has its own separate quota/plan requirement —
  // a plain (non-grounded) call to the same model can still succeed when a
  // grounded one is rate-limited. Falling back keeps the feature usable on
  // a plan without grounding access; usedSearchGrounding correctly reports
  // false in that case so the UI shows the "internal knowledge only"
  // disclaimer instead of implying real web verification happened.
  if (!result.ok && result.code === 'RATE_LIMIT') {
    result = await askGeminiForJsonWithGrounding<RawVerification>({
      systemInstruction,
      contextText: '',
      question,
      useSearchGrounding: false,
      validate: isRawVerification,
    });
  }

  if (!result.ok) return { ok: false, message: result.message };

  return {
    ok: true,
    result: {
      verdict: normalizeVerdict(result.data.verdict),
      confidence: Math.max(0, Math.min(100, Math.round(result.data.confidence))),
      martialArtConfirmed: result.data.martialArtConfirmed,
      category: result.data.category,
      evidenceNotes: result.data.evidenceNotes,
      canonicalName: result.data.canonicalName,
      groundingSources: result.groundingSources,
      usedSearchGrounding: result.usedSearchGrounding,
      reason: result.data.reason,
    },
  };
}

const CONFIDENCE_THRESHOLD = 55;

/**
 * The actual accept/reject gate (spec section 20) — independent of what
 * label the model chose. A "confirmed" verdict with low confidence or zero
 * evidence is still rejected; this function is the single place that
 * decides "can this proceed to a preview", so the strict rule lives in one
 * spot rather than being re-implemented (and possibly loosened by mistake)
 * at each call site.
 */
export function passesVerificationGate(result: VerificationResult): boolean {
  if (result.verdict !== 'confirmed') return false;
  if (result.confidence < CONFIDENCE_THRESHOLD) return false;
  if (result.evidenceNotes.length === 0 && result.groundingSources.length === 0) return false;
  return true;
}
