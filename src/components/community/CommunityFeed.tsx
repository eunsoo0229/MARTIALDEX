import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthProvider';
import { listFeed } from '../../lib/communityPost/service';
import type { CommunityFeedFilter, CommunityFeedItem } from '../../lib/communityPost/types';
import PostCard from './PostCard';
import PostComposer from './PostComposer';
import EmptyState from '../EmptyState';

const FILTERS: { key: CommunityFeedFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'curriculum', label: '커리큘럼' },
  { key: 'training', label: '훈련' },
  { key: 'video', label: '영상' },
  { key: 'photo', label: '사진' },
];

function itemKey(item: CommunityFeedItem): string {
  return item.kind === 'post' ? `post_${item.post.id}` : `repost_${item.repost.id}`;
}

/**
 * "게시물" tab content — additive to Community.tsx's existing local
 * curriculum-browse tab, never replacing it. First server-backed content on
 * this page (see communityPost/service.ts), so every read here is a live
 * Supabase call, not the local-first pattern the rest of the app uses.
 */
export default function CommunityFeed() {
  const { user, profile, isConfigured } = useAuth();
  const location = useLocation();
  const [filter, setFilter] = useState<CommunityFeedFilter>('all');
  // 해시태그 필터 (spec section 8) — 클릭하면 이 값이 채워지고, 위 타입 필터와
  // 동시에 적용된다(전체/커리큘럼/훈련 등 안에서 해시태그로 좁혀보기). 다른
  // 페이지(내 게시물/게시물 상세)에서 해시태그를 클릭하면 이 피드로 이동하며
  // navigate state로 태그를 전달한다 — 여기서 최초 1회만 읡어 초기값으로 쓴다.
  const [hashtagFilter, setHashtagFilter] = useState<string | null>((location.state as { hashtag?: string } | null)?.hashtag ?? null);
  const [items, setItems] = useState<CommunityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    listFeed(user?.id ?? null, { filter, hashtag: hashtagFilter ?? undefined }).then((result) => {
      if (!active) return;
      setLoading(false);
      if (result.ok) {
        setItems(result.data.items);
        setNextCursor(result.data.nextCursor);
        setHasMore(result.data.hasMore);
      } else {
        setError(result.message);
      }
    });
    return () => {
      active = false;
    };
  }, [filter, hashtagFilter, user?.id]);

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const result = await listFeed(user?.id ?? null, { filter, cursor: nextCursor, hashtag: hashtagFilter ?? undefined });
    setLoadingMore(false);
    if (result.ok) {
      // Appends only the new page — never refetches/rerenders the whole
      // list (spec's "전체 피드 리페치 없음" mobile-perf requirement).
      setItems((prev) => [...prev, ...result.data.items]);
      setNextCursor(result.data.nextCursor);
      setHasMore(result.data.hasMore);
    }
  }

  function handlePostDeleted(postId: string) {
    setItems((prev) => prev.filter((item) => !(item.kind === 'post' && item.post.id === postId)));
  }

  if (!isConfigured) {
    return <EmptyState icon="🌐" text="게시물 기능을 사용하려면 Supabase 설정이 필요합니다." />;
  }

  return (
    <>
      <div className="filter-bar">
        <div className="filter-bar__left chip-row">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`chip ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {user && profile && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setComposerOpen(true)}>
            ✍️ 새 게시물
          </button>
        )}
      </div>

      {hashtagFilter && (
        <p className="video-status-message">
          #{hashtagFilter} 태그 게시물만 보는 중{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHashtagFilter(null)}>
            해제 ✕
          </button>
        </p>
      )}

      {!user && (
        <p className="video-status-message">로그인하면 게시물을 작성하고 좋아요·댓글·저장·리포스트를 할 수 있습니다.</p>
      )}

      {loading ? (
        <p className="video-status-message">불러오는 중…</p>
      ) : error ? (
        <div className="ai-error" role="alert">
          {error}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon="📭" text="아직 게시물이 없습니다. 첫 게시물을 올려보세요." />
      ) : (
        <div className="stack gap-2">
          {items.map((item) => (
            <PostCard
              key={itemKey(item)}
              item={item}
              currentUserId={user?.id ?? null}
              currentUserNickname={profile?.nickname ?? null}
              onDeleted={handlePostDeleted}
              onHashtagClick={setHashtagFilter}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="modal-actions modal-actions--start" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? '불러오는 중…' : '더 보기'}
          </button>
        </div>
      )}

      {composerOpen && user && profile && (
        <PostComposer
          currentUserId={user.id}
          currentUserNickname={profile.nickname}
          onClose={() => setComposerOpen(false)}
          onCreated={(post) => {
            setItems((prev) => [{ kind: 'post', sortKey: post.createdAt, post }, ...prev]);
            setComposerOpen(false);
          }}
        />
      )}
    </>
  );
}
