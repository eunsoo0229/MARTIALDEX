import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listMyPosts, listMyReposts, listSavedPosts } from '../../lib/communityPost/service';
import type { CommunityFeedItem, CommunityPost } from '../../lib/communityPost/types';
import PostCard from './PostCard';

type MyTab = 'posts' | 'saved' | 'reposts';

const TABS: { key: MyTab; label: string }[] = [
  { key: 'posts', label: '내 게시물' },
  { key: 'saved', label: '저장한 게시물' },
  { key: 'reposts', label: '내 리포스트' },
];

/** Profile page's "내 게시물 / 저장한 게시물 / 내 리포스트" section — a thin wrapper over communityPost/service.ts's per-tab list functions, reusing PostCard so edit/delete/like/save/repost all behave identically to the main feed. */
export default function MyCommunityPostsCard({ userId, nickname }: { userId: string; nickname: string }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<MyTab>('posts');
  const [items, setItems] = useState<CommunityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    async function run() {
      if (tab === 'posts') {
        const result = await listMyPosts(userId, userId);
        if (!active) return;
        if (result.ok) setItems(result.data.map((post: CommunityPost) => ({ kind: 'post' as const, sortKey: post.createdAt, post })));
        else setError(result.message);
      } else if (tab === 'saved') {
        const result = await listSavedPosts(userId);
        if (!active) return;
        if (result.ok) setItems(result.data.map((post: CommunityPost) => ({ kind: 'post' as const, sortKey: post.createdAt, post })));
        else setError(result.message);
      } else {
        const result = await listMyReposts(userId, userId);
        if (!active) return;
        if (result.ok) setItems(result.data);
        else setError(result.message);
      }
      if (active) setLoading(false);
    }
    void run();
    return () => {
      active = false;
    };
  }, [tab, userId]);

  function handleDeleted(postId: string) {
    setItems((prev) => prev.filter((item) => !(item.kind === 'post' && item.post.id === postId)));
  }

  return (
    <div className="card info-card">
      <h3>📱 내 커뮤니티 게시물</h3>
      <div className="chip-row" style={{ marginBottom: 10 }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`chip ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="video-status-message">불러오는 중…</p>
      ) : error ? (
        <div className="ai-error" role="alert">
          {error}
        </div>
      ) : items.length === 0 ? (
        <p className="video-status-message">
          {tab === 'posts' ? '아직 작성한 게시물이 없습니다.' : tab === 'saved' ? '저장한 게시물이 없습니다.' : '리포스트한 게시물이 없습니다.'}
        </p>
      ) : (
        <div className="stack gap-2">
          {items.map((item) => (
            <PostCard
              key={item.kind === 'post' ? `post_${item.post.id}` : `repost_${item.repost.id}`}
              item={item}
              currentUserId={userId}
              currentUserNickname={nickname}
              onDeleted={handleDeleted}
              onHashtagClick={(tag) => navigate('/community', { state: { hashtag: tag } })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
