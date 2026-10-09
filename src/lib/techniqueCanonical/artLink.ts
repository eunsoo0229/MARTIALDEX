import type { Technique } from '../../types';
import type { AddTeqRecord } from '../addTeq/types';
import type { UserTechniqueRecord, VerificationResult } from '../userTechniques/types';
import { insertAddTeqTechnique } from '../addTeq/service';
import { userTechniqueRepository } from '../userTechniques/repository';
import { passesVerificationGate, verifyTechnique } from '../userTechniques/verification';
import { getTechnique, getTechniquesByMartialArt } from '../loadData';
import { canonicalCategoryFor, officialCategoriesOf } from './category';
import { canonicalTechniqueId, isTechniqueInArt } from './index';

// 기술 요청 — "기술이 이미 있는가" and "그 무술에 연결돼 있는가" are two
// separate questions. Existing technique + not yet in the requested art →
// the request becomes a LINK (one canonical technique, one more art), never
// a second copy and never a flat "이미 존재하는 기술" refusal.

export type ArtLinkCheck =
  | { kind: 'already_in_art'; technique: Technique }
  | { kind: 'link_available'; technique: Technique; category: string };

/** The category the technique gets in the newly linked art — one of that art's canonical categories. */
export function linkCategoryFor(technique: Technique, martialArtId: string): string {
  if (technique.categoryByArt?.[martialArtId]) return technique.categoryByArt[martialArtId];
  for (const c of [technique.category, ...Object.values(technique.categoryByArt ?? {})]) {
    const mapped = canonicalCategoryFor(martialArtId, c, technique);
    if (mapped) return mapped;
  }
  const official = officialCategoriesOf(martialArtId);
  if (official.length === 0) return technique.category;
  // No keyword fits: file it with the art's techniques that share a position
  // with it (an existing category, never a new one).
  const tally = new Map<string, number>();
  for (const t of getTechniquesByMartialArt(martialArtId)) {
    if (!t.positions.some((p) => technique.positions.includes(p))) continue;
    const c = t.categoryByArt?.[martialArtId] ?? t.category;
    tally.set(c, (tally.get(c) ?? 0) + 1);
  }
  return [...tally.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? official[0];
}

export function checkArtLink(matchedTechniqueId: string, martialArtId: string, resolve: (id: string) => Technique | undefined): ArtLinkCheck | null {
  const technique = resolve(canonicalTechniqueId(matchedTechniqueId)) ?? resolve(matchedTechniqueId);
  if (!technique) return null;
  if (isTechniqueInArt(technique, martialArtId)) return { kind: 'already_in_art', technique };
  return { kind: 'link_available', technique, category: linkCategoryFor(technique, martialArtId) };
}

export function linkRecordId(martialArtId: string, canonicalId: string): string {
  return `link__${martialArtId}__${canonicalId}`;
}

/**
 * Verifies the technique is really used in that art (same grounded
 * verification gate a brand-new technique must pass), then writes the link:
 * shared add_teq row when logged in (every user sees the link), local
 * user_techniques otherwise. Nothing about the canonical technique itself
 * is copied or changed.
 */
export async function linkTechniqueToArt(
  technique: Technique,
  martialArtId: string,
  userId: string | null
): Promise<{ ok: true; linkId: string; category: string; shared: boolean } | { ok: false; message: string; verification?: VerificationResult }> {
  if (isTechniqueInArt(technique, martialArtId)) return { ok: false, message: '이미 이 무술에 연결된 기술입니다.' };
  const verified = await verifyTechnique({ name: technique.name, martialArt: martialArtId, description: `${technique.description}`.slice(0, 300) || undefined });
  if (!verified.ok) return { ok: false, message: verified.message };
  if (!passesVerificationGate(verified.result)) {
    return { ok: false, verification: verified.result, message: '이 무술에서 실제로 쓰이는 기술인지 충분히 확인할 수 없어 연결하지 않았습니다.' };
  }
  const canonicalId = technique.id;
  const category = linkCategoryFor(technique, martialArtId);
  const now = new Date().toISOString();
  const id = linkRecordId(martialArtId, canonicalId);
  const official = getTechnique(canonicalId);
  const linkTechnique: Technique = {
    ...(official ?? technique),
    id,
    martialArt: martialArtId,
    category,
    linkOf: canonicalId,
    source: 'user_added',
    martialArts: undefined,
    categoryByArt: undefined,
    mergedIds: undefined,
    usageByArt: undefined,
  };
  const duplicateCheck = { isDuplicate: true, matchedTechniqueId: canonicalId, matchedTechniqueName: technique.name, reason: `기존 기술 '${technique.name}'에 무술을 연결` };
  if (userId) {
    const record: AddTeqRecord = { id, technique: linkTechnique, status: 'approved', duplicateCheck, verification: verified.result, createdAt: now, updatedAt: now };
    const inserted = await insertAddTeqTechnique(record);
    if (inserted.ok) return { ok: true, linkId: id, category, shared: true };
  }
  const local: UserTechniqueRecord = { id, technique: linkTechnique, status: 'approved', addedByUserId: userId, duplicateCheck, verification: verified.result, createdAt: now, updatedAt: now };
  userTechniqueRepository.save(local);
  return { ok: true, linkId: id, category, shared: false };
}
