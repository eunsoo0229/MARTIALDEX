import type { Technique } from '../../types';
import { getMartialArt } from '../loadData';
import { searchTechniques } from '../search';
import { askGeminiForJson } from '../fighterStyle/geminiJson';
import { STYLE_CURRICULUM_MARTIAL_ART } from '../fighterStyle/styleCurriculumService';
import type { MotionEvent, TechniqueGuess } from './types';
import { getCriteriaLabels, getSportAnalysisProfile } from './sportAnalysisProfiles';
import { isSyntheticTrainingDomain } from '../loadData';

// Exactly the same anti-fabrication guarantee as fighterStyle/techniqueMatcher.ts
// (stage 11) and aiCoach/coachEngine.ts (stage 12): the candidate pool is
// built from the REAL technique database via the same searchTechniques()
// used by the search bar, and any id Gemini returns that isn't in that pool
// is discarded. This step is entirely optional — if it fails or is skipped,
// the motion-event timeline (motionEventDetector.ts) still stands on its own
// with generic labels, never named technique guesses.
function buildCandidatePool(martialArtId: string): Technique[] {
  const labels = getCriteriaLabels(martialArtId);
  const filters = martialArtId === STYLE_CURRICULUM_MARTIAL_ART ? {} : { martialArt: martialArtId };
  const excluded = getSportAnalysisProfile(martialArtId)?.excludedTechniqueKeywords ?? [];
  const pool = new Map<string, Technique>();
  for (const label of labels) {
    for (const t of searchTechniques(label, 5, filters)) {
      // Defensive on top of the martialArt filter above (which already makes
      // cross-sport technique names structurally impossible for the 9 real
      // sports) — this only matters for the shared MMA pseudo-id, which is
      // intentionally unfiltered by martialArt but still shouldn't be here.
      if (excluded.some((kw) => t.name.toLowerCase().includes(kw.toLowerCase()))) continue;
      // Same unfiltered-MMA-pseudo-id gap: home-training exercises are in
      // search.ts's corpus (so global search finds them) but must never be
      // hypothesized as the technique performed in a sparring clip.
      if (isSyntheticTrainingDomain(t.martialArt)) continue;
      pool.set(t.id, t);
    }
  }
  return [...pool.values()];
}

interface HypothesisItem {
  timestampSec: number;
  techniqueId: string | null;
}

function isHypothesisResponse(data: unknown): data is HypothesisItem[] {
  return Array.isArray(data) && data.every((d) => d && typeof d === 'object' && typeof (d as Record<string, unknown>).timestampSec === 'number');
}

export async function hypothesizeTechniques(martialArtId: string, events: MotionEvent[]): Promise<TechniqueGuess[]> {
  if (events.length === 0) return [];
  const candidates = buildCandidatePool(martialArtId);
  if (candidates.length === 0) return [];

  const art = getMartialArt(martialArtId);
  const result = await askGeminiForJson<HypothesisItem[]>({
    systemInstruction: [
      '스파링 영상에서 코드가 감지한 "일반적인 동작 패턴" 목록이 주어진다.',
      '각 동작이 아래 후보 기술 목록 중 어떤 실제 기술과 가장 비슷해 보이는지 추정한다.',
      '반드시 후보 목록에 있는 techniqueId만 사용하고, 목록에 없는 기술을 새로 만들어 답하지 않는다.',
      '확신이 없으면 techniqueId를 null로 응답한다 — 억지로 아무 기술이나 고르지 않는다.',
      '입력받은 동작 개수와 정확히 같은 길이의 배열로 응답한다.',
      '출력 형식: [{"timestampSec": number, "techniqueId": string | null}, ...]',
    ].join('\n'),
    contextText: [
      `종목: ${art?.nameKo ?? martialArtId}`,
      '후보 기술 목록 (이 목록의 id만 사용):',
      ...candidates.map((t) => `- ${t.id}: ${t.name}`),
      '',
      '감지된 동작 목록:',
      ...events.map((e) => `- ${e.timestampSec}초: ${e.label}`),
    ].join('\n'),
    question: '각 동작에 대해 가장 비슷한 후보 기술을 추정해줘.',
    validate: isHypothesisResponse,
  });

  if (!result.ok) return [];

  const candidateIds = new Set(candidates.map((t) => t.id));
  const byTechnique = new Map<string, number[]>();
  for (const item of result.data) {
    if (!item.techniqueId || !candidateIds.has(item.techniqueId)) continue;
    const list = byTechnique.get(item.techniqueId) ?? [];
    list.push(item.timestampSec);
    byTechnique.set(item.techniqueId, list);
  }

  return [...byTechnique.entries()].map(([techniqueId, occurrences]) => {
    const t = candidates.find((c) => c.id === techniqueId)!;
    return { techniqueId, techniqueName: t.name, martialArt: t.martialArt, occurrences, estimated: true as const };
  });
}
