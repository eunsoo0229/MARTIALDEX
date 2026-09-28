import type { Technique } from '../../types';
import { allTechniques, getTechniquesByMartialArt } from '../loadData';
import { searchTechniques } from '../search';
import { STYLE_CURRICULUM_MARTIAL_ART } from '../fighterStyle/styleCurriculumService';
import { getTechniqueConnections } from '../techniqueGraph/buildGraph';
import { getCategoryKeywords } from './categoryKeywords';
import type { SituationCategory } from './types';
import { isSyntheticTrainingDomain } from '../loadData';

// A free-text situation description can be a full sentence — same honesty
// rule as techniqueGraph/buildGraph.ts (16단계): past this length it no
// longer reliably names one thing, so it's skipped as a search query rather
// than risking a spurious fuzzy match.
const MAX_FREE_TEXT_QUERY_LENGTH = 60;
const MAX_MATCHES_PER_KEYWORD = 6;

function martialArtPool(martialArt: string): Technique[] {
  return martialArt === STYLE_CURRICULUM_MARTIAL_ART ? allTechniques : getTechniquesByMartialArt(martialArt);
}

// If the user names a real technique by name in their situation text (e.g.
// "상대가 더블렉을 시도해"), pull ITS real counter/escape/next connections
// (16단계 기술 그래프) — these are exactly "how to respond to this named
// technique", a strong, real signal beyond generic category keywords.
function findMentionedTechniqueConnections(situationText: string, pool: Technique[]): Technique[] {
  if (!situationText) return [];
  const lower = situationText.toLowerCase();
  const mentioned = pool.filter((t) => t.name.length >= 4 && lower.includes(t.name.toLowerCase()));
  const extra = new Map<string, Technique>();
  for (const m of mentioned) {
    const conn = getTechniqueConnections(m);
    for (const c of [...conn.counter, ...conn.escape, ...conn.next]) {
      const t = pool.find((p) => p.id === c.techniqueId);
      if (t) extra.set(t.id, t);
    }
  }
  return [...extra.values()];
}

export function buildSituationCandidatePool(martialArt: string, category: SituationCategory | null, situationText: string): Technique[] {
  const filters = martialArt === STYLE_CURRICULUM_MARTIAL_ART ? {} : { martialArt };
  const pool = new Map<string, Technique>();

  if (category) {
    for (const kw of getCategoryKeywords(category)) {
      for (const t of searchTechniques(kw, MAX_MATCHES_PER_KEYWORD, filters)) pool.set(t.id, t);
    }
  }

  const trimmed = situationText.trim();
  if (trimmed && trimmed.length <= MAX_FREE_TEXT_QUERY_LENGTH) {
    for (const t of searchTechniques(trimmed, 8, filters)) pool.set(t.id, t);
  }

  for (const t of findMentionedTechniqueConnections(trimmed, martialArtPool(martialArt))) {
    pool.set(t.id, t);
  }

  // `searchTechniques` (search.ts) deliberately includes home-training
  // exercises so global search can find e.g. "스쿼트" — but when martialArt
  // is the MMA pseudo-id, `filters` above is `{}` (unscoped), so without
  // this guard a home-training drill could surface as a live sparring-
  // situation recommendation (e.g. "Squat" for a takedown-defense query).
  for (const [id, t] of pool) {
    if (isSyntheticTrainingDomain(t.martialArt)) pool.delete(id);
  }

  return [...pool.values()];
}
