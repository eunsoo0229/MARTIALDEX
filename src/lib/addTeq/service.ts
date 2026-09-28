import type { Technique } from '../../types';
import type { TechniqueFilters } from '../search';
import { supabase } from '../supabase/client';
import { addTeqRepository } from './repository';
import type { AddTeqRecord } from './types';

const NOT_CONFIGURED_MESSAGE = 'Supabase 설정이 필요합니다.';

/** Pulls the whole shared library into the local cache — deliberately ALL
 * statuses (including 'pending'), since discovery/dedup correctness across
 * every AI feature depends on seeing what any other user already
 * registered regardless of moderation state (spec section 3/10). A future
 * "일반 브라우징은 approved만" filter belongs in the UI layer that renders
 * a browse list, not here. */
export async function pullAddTeqFromCloud(): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  const { data, error } = await supabase.from('add_teq').select('id, data');
  if (error) return { ok: false, message: error.message };
  const records = (data ?? []).map((row) => row.data as AddTeqRecord);
  addTeqRepository.upsertMany(records);
  return { ok: true, count: records.length };
}

/** Inserts a newly-discovered technique into the shared library — only
 * ever called for a logged-in user (RLS requires `auth.uid() is not
 * null`); the caller falls back to the existing local-only
 * userTechniques/saveUserTechnique path when logged out (spec section 16). */
export async function insertAddTeqTechnique(record: AddTeqRecord): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  const t = record.technique;
  const row = {
    id: record.id,
    martial_art: t.martialArt,
    name: t.name,
    korean_name: t.koreanName,
    aliases: t.aliases,
    category: t.category,
    description: t.description,
    purpose: t.purpose,
    principles: t.principles,
    difficulty: t.difficulty,
    tags: t.tags,
    positions: t.positions,
    variations: t.variations,
    counters: t.counters,
    defenses: t.defenses,
    transitions: t.transitions,
    related_techniques: t.relatedTechniques,
    related_martial_arts: t.relatedMartialArts,
    youtube_search_query: t.youtubeSearchQuery,
    videos: t.videos,
    posture: t.posture ?? null,
    source: t.source ?? 'user_added',
    status: record.status,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    data: record,
  };
  const { error } = await supabase.from('add_teq').insert(row);
  if (error) return { ok: false, message: error.message };
  addTeqRepository.upsertOne(record);
  return { ok: true };
}

export function resolveAddTeqTechnique(id: string): Technique | undefined {
  return addTeqRepository.get(id)?.technique;
}

export function resolveAddTeqTechniquesByIds(ids: string[]): Technique[] {
  return ids.map((id) => resolveAddTeqTechnique(id)).filter((t): t is Technique => !!t);
}

/** Same substring-match shape as userTechniques/service.ts's `mine` filter
 * in searchAllTechniques — mirrored here so that function can compose this
 * with the official + user_techniques results with identical semantics. */
export function searchAddTeqTechniques(query: string, filters: TechniqueFilters = {}): Technique[] {
  const q = query.trim().toLowerCase();
  return addTeqRepository
    .list()
    .map((r) => r.technique)
    .filter((t) => (filters.martialArt ? t.martialArt === filters.martialArt : true))
    .filter((t) => (filters.category ? t.category === filters.category : true))
    .filter((t) => (filters.position ? t.positions.includes(filters.position) : true))
    .filter((t) => (filters.difficulty ? t.difficulty === filters.difficulty : true))
    .filter((t) => (filters.type ? t.tags.includes(filters.type) : true))
    .filter((t) => !q || t.name.toLowerCase().includes(q) || (t.koreanName ?? '').includes(query.trim()) || t.aliases.some((a) => a.toLowerCase().includes(q)));
}
