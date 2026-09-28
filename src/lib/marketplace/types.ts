// "커리큘럼 마켓플레이스" — see supabase/migrations/0009_marketplace.sql for the
// full server-side design (why orders/stats are trigger/RPC-protected, why
// content is split into its own gated table). Every shape here mirrors a
// real Supabase row 1:1 — no client-only fields that could drift from what
// the server actually enforces.

export type MarketplaceDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'mixed';
export type MarketplaceListingStatus = 'active' | 'unpublished';
export type MarketplaceSortMode = 'popular' | 'recent' | 'rating' | 'price_asc' | 'price_desc';

/** Public preview row — visible to every logged-in user for any 'active' listing (marketplace_curricula). Never contains Day/technique content — that's gated separately (see MarketplaceCurriculumContent). */
export interface MarketplaceListing {
  id: string;
  sellerUserId: string;
  sellerNickname: string;
  sourceCurriculumId: string | null;
  title: string;
  description: string;
  martialArt: string;
  difficulty: MarketplaceDifficulty;
  totalDays: number;
  techniqueCount: number;
  coverIcon: string | null;
  priceKrw: number;
  isFree: boolean;
  tags: string[];
  targetAudience: string;
  learningGoals: string[];
  ratingAvg: number;
  ratingCount: number;
  purchaseCount: number;
  status: MarketplaceListingStatus;
  createdAt: string;
  updatedAt: string;
}

/** Gated full content (marketplace_curriculum_content.data) — same Curriculum JSON shape as everywhere else in the app, never a redesigned schema. Only fetchable by the seller or a completed buyer (enforced by RLS, not by client code). */
export interface MarketplaceCurriculumContent {
  days: import('../curriculum/types').CurriculumDay[];
  phases: import('../curriculum/types').CurriculumPhaseRange[];
}

export interface MarketplaceOrder {
  id: string;
  curriculumId: string;
  buyerUserId: string;
  sellerUserId: string;
  priceKrw: number;
  platformFeeKrw: number;
  sellerEarningKrw: number;
  /** 31단계에서 pending/paid/cancelled/refunded로 확장됨 — see src/lib/payments/types.ts's OrderStatus (같은 값 집합, 마켓플레이스 쪽 별도 재정의 없이 재사용). */
  status: import('../payments/types').OrderStatus;
  isTestPayment: boolean;
  paidAt: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface MarketplaceReview {
  id: string;
  curriculumId: string;
  reviewerUserId: string;
  reviewerNickname: string;
  rating: number;
  reviewText: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceFilters {
  query?: string;
  martialArt?: string;
  difficulty?: MarketplaceDifficulty;
  priceMode?: 'all' | 'free' | 'paid';
  sort?: MarketplaceSortMode;
}
