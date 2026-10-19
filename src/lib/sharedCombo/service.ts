import { supabase } from '../supabase/client';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';
import { derivePurposeTags } from './purpose';
import type { SharedCombo, SharedComboKind, SharedComboStep } from './types';

// 사용자 콤보·셋업 — live Supabase reads/writes (other users' content, so no
// local cache; same approach as communityPost/service.ts). Every function
// returns AuthResult<T> and never throws. Reading works signed out (public
// select); sharing and hearts need a signed-in user.

const TABLE = 'shared_combos';
const LIKES = 'shared_combo_likes';
const LIST_LIMIT = 500;
const NOT_CONFIGURED = 'Supabase 설정이 필요합니다.';

/** The table doesn't exist yet → say so plainly (migration 0037 not applied). */
function message(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  if (e && (e.code === 'PGRST205' || e.code === '42P01' || /shared_combo/.test(e.message ?? '') && /does not exist|schema cache/.test(e.message ?? ''))) {
    return '사용자 콤보 공유 서버가 아직 준비되지 않았습니다(데이터베이스 마이그레이션 0037 적용 필요).';
  }
  return toKoreanAuthMessage(error);
}

function isDuplicate(error: { code?: string } | null): boolean {
  return !!error && error.code === '23505';
}

function mapRow(r: Record<string, unknown>): SharedCombo {
  const steps = Array.isArray(r.steps) ? (r.steps as SharedComboStep[]) : [];
  return {
    id: r.id as string,
    authorId: r.author_id as string,
    authorNickname: (r.author_nickname as string) ?? '',
    kind: r.kind as SharedComboKind,
    name: r.name as string,
    purpose: r.purpose as string,
    purposeTags: Array.isArray(r.purpose_tags) ? (r.purpose_tags as string[]) : [],
    description: (r.description as string) ?? '',
    martialArt: (r.martial_art as string | null) ?? null,
    steps,
    techniqueIds: Array.isArray(r.technique_ids) ? (r.technique_ids as string[]) : steps.map((s) => s.techniqueId),
    sourceRef: (r.source_ref as string | null) ?? null,
    likeCount: Number(r.like_count ?? 0),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

async function viewerLikes(viewerId: string | null, ids: string[]): Promise<Set<string>> {
  if (!supabase || !viewerId || !ids.length) return new Set();
  const { data } = await supabase.from(LIKES).select('combo_id').eq('user_id', viewerId);
  return new Set((data ?? []).map((r) => r.combo_id as string));
}

export async function listSharedCombos(viewerId: string | null): Promise<AuthResult<SharedCombo[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false }).limit(LIST_LIMIT);
    if (error) return { ok: false, message: message(error) };
    const combos = (data ?? []).map(mapRow);
    const liked = await viewerLikes(viewerId, combos.map((c) => c.id));
    return { ok: true, data: combos.map((c) => ({ ...c, viewerHasLiked: liked.has(c.id) })) };
  } catch (e) {
    return { ok: false, message: message(e) };
  }
}

export async function getSharedCombo(id: string, viewerId: string | null): Promise<AuthResult<SharedCombo | null>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) return { ok: false, message: message(error) };
    if (!data) return { ok: true, data: null };
    const c = mapRow(data);
    const liked = await viewerLikes(viewerId, [c.id]);
    return { ok: true, data: { ...c, viewerHasLiked: liked.has(c.id) } };
  } catch (e) {
    return { ok: false, message: message(e) };
  }
}

/** Hearts given since `since`, per combo (count-only server function — no user info). */
export async function periodLikeCounts(since: Date): Promise<AuthResult<Map<string, number>>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.rpc('shared_combo_like_counts', { p_since: since.toISOString() });
    if (error) return { ok: false, message: message(error) };
    return { ok: true, data: new Map(((data ?? []) as { combo_id: string; likes: number }[]).map((r) => [r.combo_id, Number(r.likes)])) };
  } catch (e) {
    return { ok: false, message: message(e) };
  }
}

export async function likeSharedCombo(id: string, userId: string): Promise<AuthResult<void>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { error } = await supabase.from(LIKES).insert({ combo_id: id, user_id: userId });
    if (error && !isDuplicate(error)) return { ok: false, message: message(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: message(e) };
  }
}

export async function unlikeSharedCombo(id: string, userId: string): Promise<AuthResult<void>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { error } = await supabase.from(LIKES).delete().eq('combo_id', id).eq('user_id', userId);
    if (error) return { ok: false, message: message(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: message(e) };
  }
}

export interface ShareInput {
  userId: string;
  nickname: string;
  kind: SharedComboKind;
  name: string;
  purpose: string;
  description: string;
  martialArt: string | null;
  steps: SharedComboStep[];
  /** e.g. "combo:<id>" / "tactic:<id>" — sharing the same source again updates the shared copy. */
  sourceRef: string | null;
}

export function validateShare(input: Pick<ShareInput, 'name' | 'purpose' | 'steps'>): string[] {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push('이름을 입력해 주세요.');
  if (input.name.trim().length > 80) errors.push('이름은 80자 이하로 입력해 주세요.');
  if (!input.purpose.trim()) errors.push('목적을 입력해 주세요. (예: 잽을 맞추기 위한 셋업)');
  if (input.purpose.trim().length > 300) errors.push('목적은 300자 이하로 입력해 주세요.');
  if (input.steps.length < 1) errors.push('기술이 1개 이상 있어야 합니다.');
  if (input.steps.length > 12) errors.push('기술은 12개까지 공유할 수 있습니다.');
  return errors;
}

/** Shares (or re-shares → updates) a combo/setup. */
export async function shareCombo(input: ShareInput): Promise<AuthResult<SharedCombo>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const errors = validateShare(input);
  if (errors.length) return { ok: false, message: errors.join(' ') };
  const row = {
    author_nickname: input.nickname || '익명',
    kind: input.kind,
    name: input.name.trim(),
    purpose: input.purpose.trim(),
    purpose_tags: derivePurposeTags({ purpose: input.purpose, description: input.description, stepNames: input.steps.map((s) => s.name) }),
    description: input.description.trim(),
    martial_art: input.martialArt,
    steps: input.steps,
    technique_ids: input.steps.map((s) => s.techniqueId),
    source_ref: input.sourceRef,
  };
  try {
    if (input.sourceRef) {
      const { data: existing, error: findErr } = await supabase.from(TABLE).select('id').eq('author_id', input.userId).eq('source_ref', input.sourceRef).maybeSingle();
      if (findErr) return { ok: false, message: message(findErr) };
      if (existing) {
        const { data, error } = await supabase.from(TABLE).update(row).eq('id', existing.id).select('*').single();
        if (error) return { ok: false, message: message(error) };
        return { ok: true, data: mapRow(data) };
      }
    }
    const id = `sc_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`}`;
    const { data, error } = await supabase.from(TABLE).insert({ id, author_id: input.userId, ...row }).select('*').single();
    if (error) return { ok: false, message: message(error) };
    return { ok: true, data: mapRow(data) };
  } catch (e) {
    return { ok: false, message: message(e) };
  }
}

export async function deleteSharedCombo(id: string): Promise<AuthResult<void>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) return { ok: false, message: message(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: message(e) };
  }
}

/** Which of my sources are already shared (to show "공유됨 · 다시 공유하면 갱신"). */
export async function mySharedSources(userId: string): Promise<AuthResult<Map<string, string>>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.from(TABLE).select('id, source_ref').eq('author_id', userId);
    if (error) return { ok: false, message: message(error) };
    return { ok: true, data: new Map((data ?? []).filter((r) => r.source_ref).map((r) => [r.source_ref as string, r.id as string])) };
  } catch (e) {
    return { ok: false, message: message(e) };
  }
}
