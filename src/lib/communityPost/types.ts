// Community "게시물"(SNS post) types — deliberately a SEPARATE data shape
// from src/lib/curriculum/types.ts's Curriculum. The existing curriculum
// "공유" feature (Community.tsx's browsable list, shareCode.ts) keeps its
// own local-only data untouched; a post that shares a curriculum only
// carries a lightweight snapshot (see CommunityCurriculumSnapshot below),
// never the full Day/technique content.

export type CommunityPostType = 'text' | 'media' | 'curriculum' | 'mixed';
export type CommunityMediaType = 'image' | 'video';

export interface CommunityPostMedia {
  id: string;
  type: CommunityMediaType;
  url: string;
  thumbnailUrl: string | null;
  order: number;
}

/** Summary-only — never the full Curriculum (that table's RLS is self-select-only anyway, so a live join couldn't work cross-user even if we wanted it to). */
export interface CommunityCurriculumSnapshot {
  curriculumId: string;
  title: string;
  martialArt: string;
  totalDays: number;
  techniqueCount: number;
}

/** A technique or a shared combo/setup the author tagged on the post (숏폼 "영상에 나온 내용 배우기"). */
export interface PostTag {
  type: 'technique' | 'combo';
  /** technique id, or shared_combos id */
  id: string;
  name: string;
  martialArt: string | null;
  /** combo tags: 'combo' | 'setup' */
  kind?: 'combo' | 'setup';
}
export const MAX_POST_TAGS = 10;

export interface CommunityPost {
  id: string;
  authorId: string;
  authorNickname: string;
  content: string;
  /** Derived from `content` (see hashtags.ts's extractHashtags) — never a separate stored field, so it can never drift out of sync with the text itself. */
  hashtags: string[];
  postType: CommunityPostType;
  media: CommunityPostMedia[];
  gymId: string | null;
  gymName: string | null;
  curriculumSnapshot: CommunityCurriculumSnapshot | null;
  /** Techniques / combos-setups the author tagged (empty for older posts). */
  tags: PostTag[];
  likeCount: number;
  commentCount: number;
  saveCount: number;
  repostCount: number;
  createdAt: string;
  updatedAt: string;
  /** Per-viewer state, populated by a separate targeted query and merged in — never a column on the shared row (a like row's existence is per-user, not per-post). */
  viewerHasLiked: boolean;
  viewerHasSaved: boolean;
  viewerHasReposted: boolean;
}

export interface CommunityComment {
  id: string;
  postId: string;
  authorId: string;
  authorNickname: string;
  content: string;
  createdAt: string;
  /** Null for a top-level comment; the parent comment's id for a reply (spec section 9's "댓글 답글"). Future @멘션 support can key off this same relationship without a further migration. */
  parentCommentId: string | null;
  /** Denormalized, maintained by a DB trigger (see 0030_community_comment_replies.sql) — real count of comments whose parentCommentId is this one's id, never client-computed from a partial page. */
  replyCount: number;
  /** Maintained by a DB trigger (0039). */
  likeCount: number;
  /** Per-viewer, merged in from community_comment_likes. */
  viewerHasLiked: boolean;
}

export interface CommunityRepost {
  id: string;
  userId: string;
  reposterNickname: string;
  /** Null once the original post has been deleted — original_post_id is ON DELETE SET NULL, never CASCADE, so the repost itself keeps existing with its denormalized snippet. */
  originalPostId: string | null;
  originalAuthorNickname: string;
  originalContentSnippet: string;
  createdAt: string;
}

/** One feed row — a real post OR someone's repost of one, time-ordered together (see service.ts's listFeed merge). */
export type CommunityFeedItem =
  | { kind: 'post'; sortKey: string; post: CommunityPost }
  | { kind: 'repost'; sortKey: string; repost: CommunityRepost; originalPost: CommunityPost | null };

export type CommunityFeedFilter = 'all' | 'curriculum' | 'training' | 'video' | 'photo';
