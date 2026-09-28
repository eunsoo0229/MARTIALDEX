import { supabase } from '../supabase/client';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';
import { curriculumRepository } from '../curriculum/repository';
import type { Curriculum } from '../curriculum/types';
import { getPlatformFeeRateBp, computeFeeSplit } from './config';
import type {
  MarketplaceCurriculumContent,
  MarketplaceFilters,
  MarketplaceListing,
  MarketplaceOrder,
  MarketplaceReview,
} from './types';

const NOT_CONFIGURED = 'Supabase 설정이 필요합니다.';

function newId(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${rand}`;
}

function mapListing(row: Record<string, unknown>): MarketplaceListing {
  return {
    id: row.id as string,
    sellerUserId: row.seller_user_id as string,
    sellerNickname: row.seller_nickname as string,
    sourceCurriculumId: (row.source_curriculum_id as string) ?? null,
    title: row.title as string,
    description: (row.description as string) ?? '',
    martialArt: row.martial_art as string,
    difficulty: row.difficulty as MarketplaceListing['difficulty'],
    totalDays: row.total_days as number,
    techniqueCount: row.technique_count as number,
    coverIcon: (row.cover_icon as string) ?? null,
    priceKrw: row.price_krw as number,
    isFree: row.is_free as boolean,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    targetAudience: (row.target_audience as string) ?? '',
    learningGoals: Array.isArray(row.learning_goals) ? (row.learning_goals as string[]) : [],
    ratingAvg: Number(row.rating_avg ?? 0),
    ratingCount: row.rating_count as number,
    purchaseCount: row.purchase_count as number,
    status: row.status as MarketplaceListing['status'],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapOrder(row: Record<string, unknown>): MarketplaceOrder {
  return {
    id: row.id as string,
    curriculumId: row.curriculum_id as string,
    buyerUserId: row.buyer_user_id as string,
    sellerUserId: row.seller_user_id as string,
    priceKrw: row.price_krw as number,
    platformFeeKrw: row.platform_fee_krw as number,
    sellerEarningKrw: row.seller_earning_krw as number,
    status: row.status as MarketplaceOrder['status'],
    isTestPayment: row.is_test_payment as boolean,
    paidAt: (row.paid_at as string) ?? null,
    failureReason: (row.failure_reason as string) ?? null,
    createdAt: row.created_at as string,
  };
}

function mapReview(row: Record<string, unknown>): MarketplaceReview {
  return {
    id: row.id as string,
    curriculumId: row.curriculum_id as string,
    reviewerUserId: row.reviewer_user_id as string,
    reviewerNickname: row.reviewer_nickname as string,
    rating: row.rating as number,
    reviewText: (row.review_text as string) ?? '',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listMarketplaceListings(filters: MarketplaceFilters = {}): Promise<AuthResult<MarketplaceListing[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    let q = supabase.from('marketplace_curricula').select('*').eq('status', 'active');
    if (filters.martialArt) q = q.eq('martial_art', filters.martialArt);
    if (filters.difficulty) q = q.eq('difficulty', filters.difficulty);
    if (filters.priceMode === 'free') q = q.eq('is_free', true);
    if (filters.priceMode === 'paid') q = q.eq('is_free', false);

    const { data, error } = await q;
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    let listings = (data ?? []).map(mapListing);

    if (filters.query?.trim()) {
      const query = filters.query.trim().toLowerCase();
      listings = listings.filter(
        (l) =>
          l.title.toLowerCase().includes(query) ||
          l.description.toLowerCase().includes(query) ||
          l.tags.some((t) => t.toLowerCase().includes(query))
      );
    }

    const sort = filters.sort ?? 'recent';
    listings.sort((a, b) => {
      if (sort === 'popular') return b.purchaseCount - a.purchaseCount;
      if (sort === 'rating') return b.ratingAvg - a.ratingAvg;
      if (sort === 'price_asc') return a.priceKrw - b.priceKrw;
      if (sort === 'price_desc') return b.priceKrw - a.priceKrw;
      return b.createdAt.localeCompare(a.createdAt);
    });
    return { ok: true, data: listings };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function getMarketplaceListing(id: string): Promise<AuthResult<MarketplaceListing | null>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.from('marketplace_curricula').select('*').eq('id', id).maybeSingle();
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: data ? mapListing(data) : null };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

/** Returns null (not an error) when RLS hasn't authorized this caller yet (no purchase, not the seller) — the UI treats that as "구매 후 공개". */
export async function getMarketplaceCurriculumContent(id: string): Promise<AuthResult<MarketplaceCurriculumContent | null>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.from('marketplace_curriculum_content').select('data').eq('curriculum_id', id).maybeSingle();
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: data ? (data.data as MarketplaceCurriculumContent) : null };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export interface PublishInput {
  curriculum: Curriculum;
  sellerUserId: string;
  sellerNickname: string;
  title: string;
  description: string;
  difficulty: MarketplaceListing['difficulty'];
  coverIcon: string | null;
  priceKrw: number;
  tags: string[];
  targetAudience: string;
  learningGoals: string[];
}

/**
 * Publishes a REAL local curriculum as-is — days/techniqueIds are taken
 * directly from the caller's own Curriculum object, never re-authored or
 * copied into a second editable schema (spec section 2). The seller's own
 * local curriculum is left completely untouched except for the new
 * marketplaceListingId back-reference set by the caller after this returns.
 */
export async function publishCurriculumToMarketplace(input: PublishInput): Promise<AuthResult<MarketplaceListing>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const id = newId('mkt');
    const now = new Date().toISOString();
    const isFree = input.priceKrw <= 0;
    const row = {
      id,
      seller_user_id: input.sellerUserId,
      seller_nickname: input.sellerNickname,
      source_curriculum_id: input.curriculum.id,
      title: input.title.trim() || input.curriculum.title,
      description: input.description.trim(),
      martial_art: input.curriculum.martialArt,
      difficulty: input.difficulty,
      total_days: input.curriculum.days.length,
      technique_count: input.curriculum.techniqueCount,
      cover_icon: input.coverIcon,
      price_krw: isFree ? 0 : Math.round(input.priceKrw),
      is_free: isFree,
      tags: input.tags.filter(Boolean),
      target_audience: input.targetAudience.trim(),
      learning_goals: input.learningGoals.filter(Boolean),
      status: 'active',
      created_at: now,
      updated_at: now,
    };

    const { error: listingError } = await supabase.from('marketplace_curricula').insert(row);
    if (listingError) return { ok: false, message: toKoreanAuthMessage(listingError) };

    const { error: contentError } = await supabase.from('marketplace_curriculum_content').insert({
      curriculum_id: id,
      data: { days: input.curriculum.days, phases: input.curriculum.phases },
      updated_at: now,
    });
    if (contentError) {
      // Compensating cleanup — never leave a public listing with no content behind.
      await supabase.from('marketplace_curricula').delete().eq('id', id);
      return { ok: false, message: toKoreanAuthMessage(contentError) };
    }

    return { ok: true, data: mapListing(row) };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function unpublishListing(id: string): Promise<AuthResult<void>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { error } = await supabase.from('marketplace_curricula').update({ status: 'unpublished', updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export interface PurchaseResult {
  orderId: string;
  priceKrw: number;
  platformFeeKrw: number;
  sellerEarningKrw: number;
  alreadyPurchased: boolean;
}

/** The ONLY client entry point for buying (or free-claiming, price 0) a listing — the actual order row is created server-side by the RPC, never by a direct client insert (see migration comment). */
export async function purchaseMarketplaceCurriculum(curriculumId: string): Promise<AuthResult<PurchaseResult>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.rpc('purchase_marketplace_curriculum', { p_curriculum_id: curriculumId });
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { ok: false, message: '구매 처리 중 문제가 발생했습니다.' };
    return {
      ok: true,
      data: {
        orderId: row.order_id,
        priceKrw: row.price_krw,
        platformFeeKrw: row.platform_fee_krw,
        sellerEarningKrw: row.seller_earning_krw,
        alreadyPurchased: row.already_purchased,
      },
    };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

/** Materializes a purchased listing into the buyer's OWN local curricula — same repository path as every other curriculum (official/custom/AI/copied-via-share-code). Returns the existing local copy if one was already claimed, never a duplicate. */
export function claimPurchasedCurriculumLocally(listing: MarketplaceListing, content: MarketplaceCurriculumContent, order: { orderId: string; priceKrw: number }): Curriculum {
  const existing = curriculumRepository.listCustom().find((c) => c.marketplaceMeta?.listingId === listing.id);
  if (existing) return existing;

  const now = new Date().toISOString();
  const curriculum: Curriculum = {
    id: newId('custom'),
    martialArt: listing.martialArt,
    title: listing.title,
    subtitle: '마켓플레이스 커리큘럼',
    description: listing.description,
    source: 'custom',
    visibility: 'private',
    authorName: listing.sellerNickname,
    coverIcon: listing.coverIcon ?? undefined,
    totalDays: content.days.length,
    estimatedWeeks: Math.max(1, Math.ceil(content.days.length / 4)),
    phases: content.phases,
    days: content.days,
    techniqueCount: listing.techniqueCount,
    createdAt: now,
    updatedAt: now,
    marketplaceMeta: {
      listingId: listing.id,
      orderId: order.orderId,
      priceKrw: order.priceKrw,
      sellerNickname: listing.sellerNickname,
      purchasedAt: now,
    },
  };
  curriculumRepository.saveCustom(curriculum);
  return curriculum;
}

export async function listMyPurchaseOrders(userId: string): Promise<AuthResult<MarketplaceOrder[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.from('marketplace_orders').select('*').eq('buyer_user_id', userId).order('created_at', { ascending: false });
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: (data ?? []).map(mapOrder) };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function listMySellingListings(userId: string): Promise<AuthResult<MarketplaceListing[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.from('marketplace_curricula').select('*').eq('seller_user_id', userId).order('created_at', { ascending: false });
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: (data ?? []).map(mapListing) };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function listMySalesOrders(userId: string): Promise<AuthResult<MarketplaceOrder[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.from('marketplace_orders').select('*').eq('seller_user_id', userId).order('created_at', { ascending: false });
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: (data ?? []).map(mapOrder) };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function listReviews(curriculumId: string): Promise<AuthResult<MarketplaceReview[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.from('marketplace_reviews').select('*').eq('curriculum_id', curriculumId).order('created_at', { ascending: false });
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: (data ?? []).map(mapReview) };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

/** Insert is guarded server-side by RLS (verified-buyer + unique-per-reviewer, see migration) — this call cannot succeed for a non-buyer or a second review no matter what the client sends. */
export async function submitReview(curriculumId: string, reviewerUserId: string, reviewerNickname: string, rating: number, reviewText: string): Promise<AuthResult<MarketplaceReview>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const now = new Date().toISOString();
    const row = {
      id: newId('review'),
      curriculum_id: curriculumId,
      reviewer_user_id: reviewerUserId,
      reviewer_nickname: reviewerNickname,
      rating: Math.max(1, Math.min(5, Math.round(rating))),
      review_text: reviewText.trim(),
      created_at: now,
      updated_at: now,
    };
    const { error } = await supabase.from('marketplace_reviews').insert(row);
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: mapReview(row) };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export { getPlatformFeeRateBp, computeFeeSplit };
