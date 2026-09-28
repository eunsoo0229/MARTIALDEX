import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthProvider';
import { getPost } from '../lib/communityPost/service';
import type { CommunityPost } from '../lib/communityPost/types';
import PostCard from '../components/community/PostCard';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

export default function PostDetail() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [post, setPost] = useState<CommunityPost | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!postId) return;
    let active = true;
    setPost(undefined);
    getPost(postId, user?.id ?? null).then((result) => {
      if (!active) return;
      if (result.ok) setPost(result.data);
      else setError(result.message);
    });
    return () => {
      active = false;
    };
  }, [postId, user?.id]);

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/community">커뮤니티</Link>
          <span>/</span>
          <span>게시물</span>
        </div>
        <div className="section-title">
          <h2>게시물</h2>
        </div>

        {error && (
          <div className="ai-error" role="alert">
            {error}
          </div>
        )}
        {post === undefined && !error && <p className="video-status-message">불러오는 중…</p>}
        {post === null && <EmptyState icon="🔍" text="게시물을 찾을 수 없습니다. 삭제되었을 수 있습니다." />}
        {post && (
          <PostCard
            item={{ kind: 'post', sortKey: post.createdAt, post }}
            currentUserId={user?.id ?? null}
            currentUserNickname={profile?.nickname ?? null}
            onDeleted={() => setPost(null)}
            onHashtagClick={(tag) => navigate('/community', { state: { hashtag: tag } })}
          />
        )}
      </div>
    </div>
  );
}
