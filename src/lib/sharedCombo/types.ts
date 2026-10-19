// 사용자 콤보·셋업 — a combo or setup a user shared for everyone (table
// shared_combos, migration 0037). The author's private combo book / tactics
// stay private; this is the published snapshot.

export type SharedComboKind = 'combo' | 'setup';

export const KIND_LABEL: Record<SharedComboKind, string> = { combo: '콤보', setup: '셋업' };

export interface SharedComboStep {
  techniqueId: string;
  /** Name snapshot — the author's own techniques can't be resolved by other users. */
  name: string;
  martialArt: string | null;
  note?: string;
  opponentReaction?: string;
}

export interface SharedCombo {
  id: string;
  authorId: string;
  authorNickname: string;
  kind: SharedComboKind;
  name: string;
  /** "잽을 맞추기 위한 셋업", "테이크다운을 위한 셋업" … */
  purpose: string;
  purposeTags: string[];
  description: string;
  martialArt: string | null;
  steps: SharedComboStep[];
  techniqueIds: string[];
  sourceRef: string | null;
  likeCount: number;
  createdAt: string;
  updatedAt: string;
  /** Viewer state (only when signed in). */
  viewerHasLiked?: boolean;
}

/** List orderings offered in the 사용자 콤보 tab. */
export type SharedComboSort = 'recommended' | 'week' | 'month' | 'year' | 'all' | 'latest' | 'least';

export const SORT_LABEL: Record<SharedComboSort, string> = {
  recommended: '맞춤 추천',
  week: '이번 주 인기',
  month: '이번 달 인기',
  year: '올해 인기',
  all: '역대 인기',
  latest: '최신순',
  least: '하트 적은 순',
};

export const SORT_ORDER: SharedComboSort[] = ['recommended', 'week', 'month', 'year', 'all', 'latest', 'least'];

export type InterestEventType = 'view' | 'like' | 'favorite' | 'share';

/** One thing the user did with a combo — the interest profile is built from these (kept on this device). */
export interface InterestEvent {
  type: InterestEventType;
  comboId: string;
  kind: SharedComboKind;
  purposeTags: string[];
  techniqueIds: string[];
  martialArt: string | null;
  at: number;
}
