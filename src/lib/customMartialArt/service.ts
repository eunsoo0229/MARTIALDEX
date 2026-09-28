import { supabase } from '../supabase/client';
import { customMartialArtRepository } from './repository';
import type { CustomMartialArt } from './types';

const NOT_CONFIGURED_MESSAGE = 'Supabase 설정이 필요합니다.';
const NOT_LOGGED_IN_MESSAGE = '로그인이 필요합니다.';

/** Pulls the whole shared custom-martial-art registry into the local cache — same rationale as addTeq/service.ts's pullAddTeqFromCloud. */
export async function pullCustomMartialArtsFromCloud(): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  const { data, error } = await supabase.from('custom_martial_arts').select('id, data');
  if (error) return { ok: false, message: error.message };
  const records = (data ?? []).map((row) => row.data as CustomMartialArt);
  customMartialArtRepository.upsertMany(records);
  return { ok: true, count: records.length };
}

/** Inserts a newly-verified martial art into the shared registry — only ever called after verifyNewMartialArt() has already confirmed real web evidence (spec section 8); this function itself does no verification. Requires login (RLS: auth.uid() is not null) — the caller must already be logged in before reaching this step (registering a globally-shared martial art while logged out has no local-only fallback, unlike a single technique). */
export async function insertCustomMartialArt(record: CustomMartialArt): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  if (!record.addedBy) return { ok: false, message: NOT_LOGGED_IN_MESSAGE };
  const row = {
    id: record.id,
    name_ko: record.nameKo,
    name_en: record.nameEn,
    description: record.description,
    source: record.source,
    verified: record.verified,
    verified_at: record.verifiedAt,
    added_by: record.addedBy,
    sources: record.sources,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    data: record,
  };
  const { error } = await supabase.from('custom_martial_arts').insert(row);
  if (error) return { ok: false, message: error.message };
  customMartialArtRepository.upsertOne(record);
  return { ok: true };
}

export function listCustomMartialArts(): CustomMartialArt[] {
  return customMartialArtRepository.list();
}

export function getCustomMartialArt(id: string): CustomMartialArt | undefined {
  return customMartialArtRepository.get(id);
}
