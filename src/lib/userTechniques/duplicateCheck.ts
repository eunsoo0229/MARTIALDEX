import { askGeminiForJsonWithGrounding } from './geminiJson';
import type { DuplicateCheckResult } from './types';
// Deliberately imported from ./service (not ../search) so candidates are
// drawn from all three sources — official, shared add_teq, and this user's
// own local additions (spec section 4/10) — not just the 1,253 official
// techniques. searchAllTechniques and checkDuplicate reference each other's
// module (service.ts imports checkDuplicate too), which is a safe cycle
// here since both are plain hoisted function exports, never executed at
// module-init time.
import { findNormalizedDuplicate, searchAllTechniques } from './service';

const CANDIDATE_LIMIT = 5;

function isDuplicateCheckResult(data: unknown): data is DuplicateCheckResult {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.isDuplicate === 'boolean' &&
    (d.matchedTechniqueId === null || typeof d.matchedTechniqueId === 'string') &&
    (d.matchedTechniqueName === null || typeof d.matchedTechniqueName === 'string') &&
    typeof d.reason === 'string'
  );
}

/**
 * "앱에 이미 존재하는 기술인지" check (spec section 2/6) — never a plain
 * string-equality check. First narrows to real candidates via the app's own
 * search index (typos/aliases/translation get a fair shot at surfacing),
 * then asks Gemini to judge whether the user's input is actually the SAME
 * technique as any candidate (different spelling/language/abbreviation) —
 * only candidates that are ALREADY real Martialdex techniqueIds can ever be
 * returned as a match; nothing is invented here.
 */
export async function checkDuplicate(input: {
  name: string;
  martialArt: string;
  description?: string;
}): Promise<{ ok: true; result: DuplicateCheckResult } | { ok: false; message: string }> {
  // Exhaustive normalized-name/koreanName/alias match FIRST, across
  // official + add_teq + user_techniques, with zero AI cost (spec [문제 2]
  // steps 1-5) — catches case/whitespace/hyphen differences (e.g. "Von
  // Flue Choke" vs "von flue choke") that a small ranked candidate search
  // could otherwise miss entirely when many other techniques fuzzy-match
  // the same query better than the actual duplicate does.
  const exact = findNormalizedDuplicate(input.name);
  if (exact) {
    return {
      ok: true,
      result: { isDuplicate: true, matchedTechniqueId: exact.id, matchedTechniqueName: exact.name, reason: `입력하신 기술명이 기존 기술 '${exact.name}'과 표기 차이만 있을 뿐 동일합니다.` },
    };
  }

  const candidates = searchAllTechniques(input.name, CANDIDATE_LIMIT, { martialArt: input.martialArt });
  if (candidates.length === 0) {
    return { ok: true, result: { isDuplicate: false, matchedTechniqueId: null, matchedTechniqueName: null, reason: '유사한 기존 기술을 찾지 못했습니다.' } };
  }

  const candidateList = candidates
    .map((t) => `- id: ${t.id}, name: ${t.name}, koreanName: ${t.koreanName ?? '-'}, aliases: ${t.aliases.join(', ') || '-'}`)
    .join('\n');

  const result = await askGeminiForJsonWithGrounding<DuplicateCheckResult>({
    systemInstruction: [
      '사용자가 새 무술 기술을 등록하려고 한다. 사용자가 입력한 기술명이 아래 후보 목록의 기존 기술 중 하나와',
      '실제로 같은 기술인지 판단한다 (다른 표기, 영어/한국어 차이, 별칭, 약어, 띄어쓰기·철자 차이, 다른 이름 등을 고려).',
      '같은 기술이라고 확신할 수 있을 때만 isDuplicate: true로 답한다. matchedTechniqueId는 반드시 후보 목록에 있는 id',
      '중 하나를 그대로 사용하고, 새로운 id를 만들어내지 않는다. 확신할 수 없으면 isDuplicate: false로 답한다.',
      '출력 형식: {"isDuplicate": boolean, "matchedTechniqueId": string|null, "matchedTechniqueName": string|null, "reason": string(한국어)}',
    ].join('\n'),
    contextText: `기존 기술 후보 목록:\n${candidateList}`,
    question: `사용자 입력 기술명: "${input.name}"${input.description ? ` / 설명: "${input.description}"` : ''}`,
    validate: isDuplicateCheckResult,
  });

  if (!result.ok) return { ok: false, message: result.message };

  // Defense in depth — never trust an id the model invented even if it
  // claims a match; only accept it if it's one of the real candidates.
  const validIds = new Set(candidates.map((c) => c.id));
  if (result.data.isDuplicate && result.data.matchedTechniqueId && !validIds.has(result.data.matchedTechniqueId)) {
    return { ok: true, result: { isDuplicate: false, matchedTechniqueId: null, matchedTechniqueName: null, reason: '후보 기술 검증에 실패해 중복 아님으로 처리합니다.' } };
  }

  return { ok: true, result: result.data };
}
