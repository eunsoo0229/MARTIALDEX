import { supabase } from '../supabase/client';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';
import type { Curriculum } from '../curriculum/types';
import { uploadCommunityMedia, deleteCommunityMedia } from './storage';
import { extractHashtags, postHasHashtag } from './hashtags';
import type {
  CommunityComment,
  CommunityCurriculumSnapshot,
  CommunityFeedFilter,
  CommunityFeedItem,
  CommunityPost,
  CommunityPostMedia,
  CommunityPostType,
  CommunityRepost,
  PostTag,
} from './types';
import { MAX_POST_TAGS } from './types';

// Same "live Supabase read, no local cache" pattern as marketplace/service.ts
// and gymClass/service.ts — this is other users' content, so a local-first
// cache would just show stale data. Every function returns AuthResult<T>
// (never throws) for the same reason those two do.

const NOT_CONFIGURED = 'Supabase 설정이 필요합니다.';
const PAGE_OVERFETCH_MULTIPLIER = 3;

function isDuplicateKeyError(error: { code?: string } | null): boolean {
  return !!error && (error as { code?: string }).code === '23505';
}

function mapMedia(row: Record<string, unknown>): CommunityPostMedia {
  return {
    id: row.id as string,
    type: row.type as CommunityPostMedia['type'],
    url: row.url as string,
    thumbnailUrl: (row.thumbnail_url as string | null) ?? null,
    order: row.order_index as number,
  };
}

/** Tags from the row — only well-formed entries (the column is free-form jsonb). */
export function sanitizeTags(v: unknown): PostTag[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((t): t is PostTag => !!t && typeof t === 'object' && (t.type === 'technique' || t.type === 'combo') && typeof t.id === 'string' && typeof t.name === 'string')
    .map((t) => ({ type: t.type, id: t.id, name: t.name, martialArt: typeof t.martialArt === 'string' ? t.martialArt : null, ...(t.kind === 'combo' || t.kind === 'setup' ? { kind: t.kind } : {}) }))
    .slice(0, MAX_POST_TAGS);
}

function mapPost(row: Record<string, unknown>, media: CommunityPostMedia[]): CommunityPost {
  const content = row.content as string;
  return {
    id: row.id as string,
    authorId: row.author_id as string,
    authorNickname: row.author_nickname as string,
    content,
    hashtags: extractHashtags(content),
    postType: row.post_type as CommunityPostType,
    media,
    gymId: (row.gym_id as string | null) ?? null,
    gymName: (row.gym_name as string | null) ?? null,
    curriculumSnapshot: (row.curriculum_snapshot as CommunityCurriculumSnapshot | null) ?? null,
    tags: sanitizeTags(row.tags),
    likeCount: row.like_count as number,
    commentCount: row.comment_count as number,
    saveCount: row.save_count as number,
    repostCount: row.repost_count as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    viewerHasLiked: false,
    viewerHasSaved: false,
    viewerHasReposted: false,
  };
}

function mapComment(row: Record<string, unknown>): CommunityComment {
  return {
    id: row.id as string,
    postId: row.post_id as string,
    authorId: row.author_id as string,
    authorNickname: row.author_nickname as string,
    content: row.content as string,
    createdAt: row.created_at as string,
    parentCommentId: (row.parent_comment_id as string | null | undefined) ?? null,
    replyCount: (row.reply_count as number | undefined) ?? 0,
    likeCount: (row.like_count as number | undefined) ?? 0,
    viewerHasLiked: false,
  };
}

function mapRepost(row: Record<string, unknown>): CommunityRepost {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    reposterNickname: row.reposter_nickname as string,
    originalPostId: (row.original_post_id as string | null) ?? null,
    originalAuthorNickname: row.original_author_nickname as string,
    originalContentSnippet: row.original_content_snippet as string,
    createdAt: row.created_at as string,
  };
}

/** Attaches media + this viewer's own like/save/repost state to a batch of raw post rows. */
async function hydratePosts(rows: Record<string, unknown>[], viewerUserId: string | null): Promise<CommunityPost[]> {
  if (!supabase || rows.length === 0) return [];
  const ids = rows.map((r) => r.id as string);

  const { data: mediaRows } = await supabase.from('community_post_media').select('*').in('post_id', ids).order('order_index', { ascending: true });
  const mediaByPost = new Map<string, CommunityPostMedia[]>();
  for (const m of mediaRows ?? []) {
    const postId = (m as Record<string, unknown>).post_id as string;
    const list = mediaByPost.get(postId) ?? [];
    list.push(mapMedia(m as Record<string, unknown>));
    mediaByPost.set(postId, list);
  }

  let likedIds = new Set<string>();
  let savedIds = new Set<string>();
  let repostedIds = new Set<string>();
  if (viewerUserId) {
    const [{ data: likeRows }, { data: saveRows }, { data: repostRows }] = await Promise.all([
      supabase.from('community_post_likes').select('post_id').eq('user_id', viewerUserId).in('post_id', ids),
      supabase.from('community_post_saves').select('post_id').eq('user_id', viewerUserId).in('post_id', ids),
      supabase.from('community_post_reposts').select('original_post_id').eq('user_id', viewerUserId).in('original_post_id', ids),
    ]);
    likedIds = new Set((likeRows ?? []).map((r: Record<string, unknown>) => r.post_id as string));
    savedIds = new Set((saveRows ?? []).map((r: Record<string, unknown>) => r.post_id as string));
    repostedIds = new Set((repostRows ?? []).map((r: Record<string, unknown>) => r.original_post_id as string));
  }

  return rows.map((row) => {
    const id = row.id as string;
    const post = mapPost(row, mediaByPost.get(id) ?? []);
    post.viewerHasLiked = likedIds.has(id);
    post.viewerHasSaved = savedIds.has(id);
    post.viewerHasReposted = repostedIds.has(id);
    return post;
  });
}

/** Resolves repost rows into full CommunityFeedItem entries (fetching + hydrating each unique original post once). */
async function hydrateReposts(repostRows: Record<string, unknown>[], viewerUserId: string | null): Promise<CommunityFeedItem[]> {
  if (!supabase) return [];
  const originalIds = [...new Set(repostRows.map((r) => r.original_post_id as string | null).filter((id): id is string => !!id))];
  const originalPostsById = new Map<string, CommunityPost>();
  if (originalIds.length > 0) {
    const { data: originalRows } = await supabase.from('community_posts').select('*').in('id', originalIds);
    const hydrated = await hydratePosts(originalRows ?? [], viewerUserId);
    for (const p of hydrated) originalPostsById.set(p.id, p);
  }
  return repostRows.map((r) => {
    const originalId = r.original_post_id as string | null;
    return {
      kind: 'repost' as const,
      sortKey: r.created_at as string,
      repost: mapRepost(r),
      originalPost: originalId ? (originalPostsById.get(originalId) ?? null) : null,
    };
  });
}

function matchesFilter(post: CommunityPost, filter: CommunityFeedFilter): boolean {
  switch (filter) {
    case 'curriculum':
      return post.postType === 'curriculum' || post.postType === 'mixed';
    case 'training':
      return !!post.gymId;
    case 'video':
      return post.media.some((m) => m.type === 'video');
    case 'photo':
      return post.media.some((m) => m.type === 'image');
    case 'all':
    default:
      return true;
  }
}

export interface CommunityFeedPage {
  items: CommunityFeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Merges real posts and reposts into one time-ordered feed (spec's "🔁 OO님이
 * 리포스트" entries must appear inline, not as a separate list) via a small
 * k-way merge over two independently-paginated sources. Reposts are only
 * merged in on the unfiltered (전체) tab — a repost's own row doesn't carry
 * enough of the original post's shape to filter cheaply, and re-fetching
 * every original just to filter reposts on every tab isn't worth the cost
 * for a feature this size.
 */
export async function listFeed(
  viewerUserId: string | null,
  opts: { cursor?: string | null; limit?: number; filter?: CommunityFeedFilter; hashtag?: string } = {}
): Promise<AuthResult<CommunityFeedPage>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const limit = opts.limit ?? 20;
  const filter = opts.filter ?? 'all';
  const hashtag = opts.hashtag?.trim() || null;
  try {
    let postsQuery = supabase
      .from('community_posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit * PAGE_OVERFETCH_MULTIPLIER);
    if (opts.cursor) postsQuery = postsQuery.lt('created_at', opts.cursor);
    const { data: postRows, error: postsError } = await postsQuery;
    if (postsError) return { ok: false, message: toKoreanAuthMessage(postsError) };

    let repostRows: Record<string, unknown>[] = [];
    if (filter === 'all') {
      let repostsQuery = supabase.from('community_post_reposts').select('*').order('created_at', { ascending: false }).limit(limit);
      if (opts.cursor) repostsQuery = repostsQuery.lt('created_at', opts.cursor);
      const { data, error } = await repostsQuery;
      if (error) return { ok: false, message: toKoreanAuthMessage(error) };
      repostRows = data ?? [];
    }

    const hydratedPosts = await hydratePosts(postRows ?? [], viewerUserId);
    const filteredPosts = hydratedPosts.filter((p) => matchesFilter(p, filter) && (!hashtag || postHasHashtag(p.content, hashtag)));
    // A repost of a post that matches the hashtag should also show up under
    // that hashtag filter — reposts carry only a snippet, not the full
    // content, but the snippet is real text taken from the original post
    // (see buildRepostSnippet-equivalent at repost() below), so the same
    // extraction applies.
    const repostItems = hashtag
      ? (await hydrateReposts(repostRows, viewerUserId)).filter((r) => r.kind === 'repost' && postHasHashtag(r.repost.originalContentSnippet, hashtag))
      : await hydrateReposts(repostRows, viewerUserId);

    const postItems: CommunityFeedItem[] = filteredPosts.map((post) => ({ kind: 'post' as const, sortKey: post.createdAt, post }));
    const merged = [...postItems, ...repostItems].sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0)).slice(0, limit);

    const hasMore = (postRows?.length ?? 0) >= limit * PAGE_OVERFETCH_MULTIPLIER || repostRows.length >= limit;
    const nextCursor = merged.length > 0 ? merged[merged.length - 1].sortKey : null;
    return { ok: true, data: { items: merged, nextCursor, hasMore: hasMore && merged.length > 0 } };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function getPost(postId: string, viewerUserId: string | null): Promise<AuthResult<CommunityPost | null>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.from('community_posts').select('*').eq('id', postId).maybeSingle();
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    if (!data) return { ok: true, data: null };
    const [post] = await hydratePosts([data], viewerUserId);
    return { ok: true, data: post };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function listMyPosts(userId: string, viewerUserId: string | null): Promise<AuthResult<CommunityPost[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.from('community_posts').select('*').eq('author_id', userId).order('created_at', { ascending: false });
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: await hydratePosts(data ?? [], viewerUserId) };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function listSavedPosts(userId: string): Promise<AuthResult<CommunityPost[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.from('community_post_saves').select('post_id, created_at').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    const ids = (data ?? []).map((r: Record<string, unknown>) => r.post_id as string);
    if (ids.length === 0) return { ok: true, data: [] };
    const { data: postRows, error: postsError } = await supabase.from('community_posts').select('*').in('id', ids);
    if (postsError) return { ok: false, message: toKoreanAuthMessage(postsError) };
    const hydrated = await hydratePosts(postRows ?? [], userId);
    const byId = new Map(hydrated.map((p) => [p.id, p]));
    // Preserve save-order (most recently saved first), not post creation order.
    return { ok: true, data: ids.map((id) => byId.get(id)).filter((p): p is CommunityPost => !!p) };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function listMyReposts(userId: string, viewerUserId: string | null): Promise<AuthResult<CommunityFeedItem[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.from('community_post_reposts').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: await hydrateReposts(data ?? [], viewerUserId) };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export function buildCurriculumSnapshot(curriculum: Curriculum): CommunityCurriculumSnapshot {
  return {
    curriculumId: curriculum.id,
    title: curriculum.title,
    martialArt: curriculum.martialArt,
    totalDays: curriculum.totalDays,
    techniqueCount: curriculum.techniqueCount,
  };
}

export interface CreatePostInput {
  authorId: string;
  authorNickname: string;
  content: string;
  media: { file: File; type: 'image' | 'video' }[];
  gym?: { id: string; name: string } | null;
  curriculumSnapshot?: CommunityCurriculumSnapshot | null;
  tags?: PostTag[];
}

/** Every combination is supported (text-only / photo / video / photo+video / +curriculum) — media is entirely optional, matching AiMealPhotoModal's own "no photo required" precedent. */
export async function createPost(input: CreatePostInput): Promise<AuthResult<CommunityPost>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const hasMedia = input.media.length > 0;
  const hasCurriculum = !!input.curriculumSnapshot;
  const postType: CommunityPostType = hasMedia && hasCurriculum ? 'mixed' : hasCurriculum ? 'curriculum' : hasMedia ? 'media' : 'text';
  const id = `post_${crypto.randomUUID()}`;
  try {
    const uploaded: { type: 'image' | 'video'; url: string }[] = [];
    for (const m of input.media) {
      const result = await uploadCommunityMedia(m.file, input.authorId, m.type);
      if (!result.ok) return { ok: false, message: result.message };
      uploaded.push({ type: m.type, url: result.url });
    }

    const { error: postError } = await supabase.from('community_posts').insert({
      id,
      author_id: input.authorId,
      author_nickname: input.authorNickname,
      content: input.content,
      post_type: postType,
      gym_id: input.gym?.id ?? null,
      gym_name: input.gym?.name ?? null,
      curriculum_snapshot: input.curriculumSnapshot ?? null,
      // only sent when there are tags, so untagged posts keep working on a DB without the column yet
      ...(input.tags?.length ? { tags: sanitizeTags(input.tags) } : {}),
    });
    if (postError) return { ok: false, message: toKoreanAuthMessage(postError) };

    if (uploaded.length > 0) {
      const mediaRows = uploaded.map((m, i) => ({
        id: `media_${crypto.randomUUID()}`,
        post_id: id,
        type: m.type,
        url: m.url,
        thumbnail_url: null,
        order_index: i,
      }));
      const { error: mediaError } = await supabase.from('community_post_media').insert(mediaRows);
      if (mediaError) return { ok: false, message: toKoreanAuthMessage(mediaError) };
    }

    const { data: row, error: fetchError } = await supabase.from('community_posts').select('*').eq('id', id).maybeSingle();
    if (fetchError || !row) return { ok: false, message: '게시물을 불러오지 못했습니다.' };
    const [post] = await hydratePosts([row], input.authorId);
    return { ok: true, data: post };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function updatePostContent(postId: string, authorId: string, content: string): Promise<AuthResult<void>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { error } = await supabase
      .from('community_posts')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', postId)
      .eq('author_id', authorId);
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

function extractStoragePath(url: string): string | null {
  const marker = '/community-media/';
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}

/** RLS's `community_posts_delete_own` (author_id = auth.uid()) is the real enforcement — a non-owner's delete call simply matches zero rows. Media/likes/comments/saves/reposts cascade via ON DELETE CASCADE. */
export async function deletePost(postId: string, authorId: string, mediaUrls: string[]): Promise<AuthResult<void>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { error } = await supabase.from('community_posts').delete().eq('id', postId).eq('author_id', authorId);
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    for (const url of mediaUrls) {
      const path = extractStoragePath(url);
      if (path) void deleteCommunityMedia(path);
    }
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

// Likes/saves rely on the (post_id, user_id) primary key to make a duplicate
// insert (e.g. a fast double-click race) fail with postgres's 23505 rather
// than create a second row — treated as an idempotent success, not an error.

export async function likePost(postId: string, userId: string): Promise<AuthResult<void>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { error } = await supabase.from('community_post_likes').insert({ post_id: postId, user_id: userId });
    if (error && !isDuplicateKeyError(error)) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function unlikePost(postId: string, userId: string): Promise<AuthResult<void>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { error } = await supabase.from('community_post_likes').delete().eq('post_id', postId).eq('user_id', userId);
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function savePost(postId: string, userId: string): Promise<AuthResult<void>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { error } = await supabase.from('community_post_saves').insert({ post_id: postId, user_id: userId });
    if (error && !isDuplicateKeyError(error)) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function unsavePost(postId: string, userId: string): Promise<AuthResult<void>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { error } = await supabase.from('community_post_saves').delete().eq('post_id', postId).eq('user_id', userId);
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

/**
 * `original` must always be a real CommunityPost — never a repost wrapper —
 * which structurally prevents chaining: a CommunityFeedItem of kind
 * 'repost' has no `id`/`content`/etc of its own to repost, only a `repost`
 * and `originalPost`. Re-reposting a repost card in the UI means calling
 * this with `item.originalPost`, so community_post_reposts.original_post_id
 * always points at a genuine community_posts row.
 */
export async function repost(userId: string, reposterNickname: string, original: CommunityPost): Promise<AuthResult<void>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { error } = await supabase.from('community_post_reposts').insert({
      id: `repost_${crypto.randomUUID()}`,
      user_id: userId,
      reposter_nickname: reposterNickname,
      original_post_id: original.id,
      original_author_nickname: original.authorNickname,
      original_content_snippet: original.content.slice(0, 200),
    });
    if (error && !isDuplicateKeyError(error)) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function unrepost(userId: string, originalPostId: string): Promise<AuthResult<void>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { error } = await supabase.from('community_post_reposts').delete().eq('user_id', userId).eq('original_post_id', originalPostId);
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

/** This viewer's likes on a batch of comments. */
async function withViewerLikes(comments: CommunityComment[], viewerUserId: string | null): Promise<CommunityComment[]> {
  if (!supabase || !viewerUserId || comments.length === 0) return comments;
  const { data, error } = await supabase.from('community_comment_likes').select('comment_id').eq('user_id', viewerUserId).in('comment_id', comments.map((c) => c.id));
  if (error) return comments; // likes table not deployed yet → just no hearts lit
  const liked = new Set((data ?? []).map((r) => (r as { comment_id: string }).comment_id));
  return comments.map((c) => ({ ...c, viewerHasLiked: liked.has(c.id) }));
}

export type CommentSort = 'popular' | 'latest';

/**
 * Top-level comments only (parentCommentId null) — replies come from listReplies(), lazily.
 * 'popular' (TikTok/Instagram default): most liked first (offset cursor "p:<n>");
 * 'latest': oldest → newest by time (created_at cursor), the original behaviour.
 */
export async function listComments(
  postId: string,
  cursor?: string | null,
  limit = 20,
  opts: { sort?: CommentSort; viewerUserId?: string | null } = {}
): Promise<AuthResult<{ comments: CommunityComment[]; nextCursor: string | null }>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const sort = opts.sort ?? 'latest';
  try {
    if (sort === 'popular') {
      const offset = cursor?.startsWith('p:') ? Number(cursor.slice(2)) || 0 : 0;
      const { data, error } = await supabase
        .from('community_post_comments')
        .select('*')
        .eq('post_id', postId)
        .is('parent_comment_id', null)
        .order('like_count', { ascending: false })
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1);
      if (!error) {
        const comments = await withViewerLikes((data ?? []).map(mapComment), opts.viewerUserId ?? null);
        return { ok: true, data: { comments, nextCursor: comments.length === limit ? `p:${offset + limit}` : null } };
      }
      // like_count not deployed yet → fall through to time order
    }
    let q = supabase
      .from('community_post_comments')
      .select('*')
      .eq('post_id', postId)
      .is('parent_comment_id', null)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (cursor && !cursor.startsWith('p:')) q = q.gt('created_at', cursor);
    const { data, error } = await q;
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    const comments = await withViewerLikes((data ?? []).map(mapComment), opts.viewerUserId ?? null);
    const nextCursor = comments.length === limit ? comments[comments.length - 1].createdAt : null;
    return { ok: true, data: { comments, nextCursor } };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

/** All replies to one top-level comment, oldest first — called only when the user expands that comment. Capped at 200. */
export async function listReplies(parentCommentId: string, viewerUserId: string | null = null): Promise<AuthResult<CommunityComment[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase
      .from('community_post_comments')
      .select('*')
      .eq('parent_comment_id', parentCommentId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: await withViewerLikes((data ?? []).map(mapComment), viewerUserId) };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function likeComment(commentId: string, userId: string): Promise<AuthResult<void>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { error } = await supabase.from('community_comment_likes').insert({ comment_id: commentId, user_id: userId });
    if (error && !isDuplicateKeyError(error)) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function unlikeComment(commentId: string, userId: string): Promise<AuthResult<void>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { error } = await supabase.from('community_comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId);
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function addComment(
  postId: string,
  authorId: string,
  authorNickname: string,
  content: string,
  parentCommentId: string | null = null
): Promise<AuthResult<CommunityComment>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const nowRow = { id: `comment_${crypto.randomUUID()}`, post_id: postId, author_id: authorId, author_nickname: authorNickname, content, parent_comment_id: parentCommentId };
    const { error } = await supabase.from('community_post_comments').insert(nowRow);
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: mapComment({ ...nowRow, created_at: new Date().toISOString() }) };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

/** RLS's `community_post_comments_delete_own` (author_id = auth.uid()) is the real enforcement — matches spec's "본인 댓글만 삭제 가능". */
export async function deleteComment(commentId: string, authorId: string): Promise<AuthResult<void>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { error } = await supabase.from('community_post_comments').delete().eq('id', commentId).eq('author_id', authorId);
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}
