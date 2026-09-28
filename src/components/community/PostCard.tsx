import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CommunityFeedItem, CommunityPost } from '../../lib/communityPost/types';
import { deletePost, likePost, repost, savePost, unlikePost, unrepost, unsavePost, updatePostContent } from '../../lib/communityPost/service';
import { openInApp } from '../../lib/externalLink';
import CommentsSheet from './CommentsSheet';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return iso.slice(0, 10);
}

function LazyVideo({ url, thumbnailUrl }: { url: string; thumbnailUrl: string | null }) {
  // Mirrors RelatedVideos.tsx's "lazy iframe" principle for user-uploaded
  // video: never auto-load/auto-play media in a scrolling feed — only mount
  // the real <video> element after the viewer taps play.
  const [playing, setPlaying] = useState(false);
  if (playing) {
    return <video className="community-post-media__video" src={url} controls autoPlay playsInline />;
  }
  return (
    <button type="button" className="community-post-media__video-poster" onClick={() => setPlaying(true)} aria-label="영상 재생">
      {thumbnailUrl ? <img src={thumbnailUrl} alt="" loading="lazy" /> : <div className="community-post-media__video-poster-fallback" />}
      <span className="community-post-media__play">▶</span>
    </button>
  );
}

function PostMediaGrid({ media }: { media: CommunityPost['media'] }) {
  if (media.length === 0) return null;
  return (
    <div className={`community-post-media community-post-media--count-${Math.min(media.length, 4)}`}>
      {media.map((m) =>
        m.type === 'image' ? (
          <img key={m.id} className="community-post-media__image" src={m.url} alt="" loading="lazy" />
        ) : (
          <LazyVideo key={m.id} url={m.url} thumbnailUrl={m.thumbnailUrl} />
        )
      )}
    </div>
  );
}

// Splits post content into plain-text, clickable-hashtag, and clickable-link
// segments — content itself is the single source of truth for both hashtags
// (see communityPost/hashtags.ts) and links (a link is just a URL the author
// typed, never a separate attachment field), this only affects how it's
// RENDERED, never what's stored. Links open via openInApp() (never a plain
// <a target="_blank">, which Electron's setWindowOpenHandler would hand off
// to the OS's separate default browser anyway) so a link shared in a post
// stays inside MARTIALDEX.
function renderContentWithHashtags(content: string, onHashtagClick: (tag: string) => void) {
  const parts = content.split(/(#[\p{L}\p{N}_]+|https?:\/\/[^\s#]+[^\s#.,;:!?)\]'"])/gu);
  return parts.map((part, i) => {
    if (part.startsWith('#')) {
      return (
        <button key={i} type="button" className="community-post-card__hashtag" onClick={() => onHashtagClick(part.slice(1))}>
          {part}
        </button>
      );
    }
    if (part.startsWith('http://') || part.startsWith('https://')) {
      return (
        <button key={i} type="button" className="community-post-card__link" onClick={() => openInApp(part)}>
          {part}
        </button>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

interface PostBodyProps {
  post: CommunityPost;
  currentUserId: string | null;
  currentUserNickname: string | null;
  onDeleted: (postId: string) => void;
  showRepostAction: boolean;
  onHashtagClick: (tag: string) => void;
}

function PostBody({ post: initialPost, currentUserId, currentUserNickname, onDeleted, showRepostAction, onHashtagClick }: PostBodyProps) {
  const [post, setPost] = useState(initialPost);
  const [busy, setBusy] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(initialPost.content);
  const isOwn = !!currentUserId && post.authorId === currentUserId;

  async function handleToggleLike() {
    if (!currentUserId || busy) return;
    setBusy(true);
    const wasLiked = post.viewerHasLiked;
    setPost((p) => ({ ...p, viewerHasLiked: !wasLiked, likeCount: p.likeCount + (wasLiked ? -1 : 1) }));
    const result = wasLiked ? await unlikePost(post.id, currentUserId) : await likePost(post.id, currentUserId);
    if (!result.ok) setPost((p) => ({ ...p, viewerHasLiked: wasLiked, likeCount: p.likeCount + (wasLiked ? 1 : -1) }));
    setBusy(false);
  }

  async function handleToggleSave() {
    if (!currentUserId || busy) return;
    setBusy(true);
    const wasSaved = post.viewerHasSaved;
    setPost((p) => ({ ...p, viewerHasSaved: !wasSaved, saveCount: p.saveCount + (wasSaved ? -1 : 1) }));
    const result = wasSaved ? await unsavePost(post.id, currentUserId) : await savePost(post.id, currentUserId);
    if (!result.ok) setPost((p) => ({ ...p, viewerHasSaved: wasSaved, saveCount: p.saveCount + (wasSaved ? 1 : -1) }));
    setBusy(false);
  }

  async function handleToggleRepost() {
    if (!currentUserId || !currentUserNickname || busy) return;
    setBusy(true);
    const wasReposted = post.viewerHasReposted;
    setPost((p) => ({ ...p, viewerHasReposted: !wasReposted, repostCount: p.repostCount + (wasReposted ? -1 : 1) }));
    const result = wasReposted ? await unrepost(currentUserId, post.id) : await repost(currentUserId, currentUserNickname, post);
    if (!result.ok) setPost((p) => ({ ...p, viewerHasReposted: wasReposted, repostCount: p.repostCount + (wasReposted ? 1 : -1) }));
    setBusy(false);
  }

  async function handleDelete() {
    if (!currentUserId || !window.confirm('이 게시물을 삭제할까요?')) return;
    const result = await deletePost(post.id, currentUserId, post.media.map((m) => m.url));
    if (result.ok) onDeleted(post.id);
  }

  async function handleSaveEdit() {
    if (!currentUserId || !editText.trim()) return;
    const result = await updatePostContent(post.id, currentUserId, editText.trim());
    if (result.ok) {
      setPost((p) => ({ ...p, content: editText.trim() }));
      setEditing(false);
    }
  }

  return (
    <>
      <div className="community-post-card__header">
        <div className="community-post-card__author">
          <span className="community-post-card__avatar" aria-hidden="true">
            {post.authorNickname.slice(0, 1)}
          </span>
          <div>
            <div className="community-post-card__name">{post.authorNickname}</div>
            <Link to={`/community/post/${post.id}`} className="video-status-message" style={{ margin: 0 }}>
              {timeAgo(post.createdAt)}
            </Link>
          </div>
        </div>
        {isOwn && !editing && (
          <div className="community-post-card__owner-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
              수정
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleDelete}>
              삭제
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="community-post-card__edit">
          <textarea className="field-full" value={editText} onChange={(e) => setEditText(e.target.value)} />
          <div className="modal-actions modal-actions--start">
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveEdit}>
              저장
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setEditText(post.content); }}>
              취소
            </button>
          </div>
        </div>
      ) : (
        post.content && <p className="community-post-card__content">{renderContentWithHashtags(post.content, onHashtagClick)}</p>
      )}

      <PostMediaGrid media={post.media} />

      {post.curriculumSnapshot && (
        <Link to={`/learning/${post.curriculumSnapshot.martialArt}/${post.curriculumSnapshot.curriculumId}`} className="community-post-card__curriculum-chip">
          🧠 {post.curriculumSnapshot.title} · {post.curriculumSnapshot.totalDays}일 · 기술 {post.curriculumSnapshot.techniqueCount}개
        </Link>
      )}

      {post.gymName && <div className="community-post-card__gym">📍 {post.gymName}</div>}

      <div className="community-post-card__actions">
        <button type="button" className={`community-post-card__action-btn ${post.viewerHasLiked ? 'is-active' : ''}`} onClick={handleToggleLike} disabled={!currentUserId}>
          {post.viewerHasLiked ? '♥' : '♡'} <span>{post.likeCount}</span>
        </button>
        <button type="button" className="community-post-card__action-btn" onClick={() => setCommentsOpen(true)}>
          💬 <span>{post.commentCount}</span>
        </button>
        <button type="button" className={`community-post-card__action-btn ${post.viewerHasSaved ? 'is-active' : ''}`} onClick={handleToggleSave} disabled={!currentUserId}>
          {post.viewerHasSaved ? '🔖' : '🔗'} <span>{post.saveCount}</span>
        </button>
        {showRepostAction && (
          <button type="button" className={`community-post-card__action-btn ${post.viewerHasReposted ? 'is-active' : ''}`} onClick={handleToggleRepost} disabled={!currentUserId}>
            🔁 <span>{post.repostCount}</span>
          </button>
        )}
      </div>

      {commentsOpen && (
        <CommentsSheet
          post={post}
          currentUserId={currentUserId}
          currentUserNickname={currentUserNickname}
          onClose={() => setCommentsOpen(false)}
          onCommentCountChange={(delta) => setPost((p) => ({ ...p, commentCount: Math.max(0, p.commentCount + delta) }))}
        />
      )}
    </>
  );
}

interface PostCardProps {
  item: CommunityFeedItem;
  currentUserId: string | null;
  currentUserNickname: string | null;
  onDeleted: (postId: string) => void;
  onHashtagClick: (tag: string) => void;
}

function PostCardInner({ item, currentUserId, currentUserNickname, onDeleted, onHashtagClick }: PostCardProps) {
  if (item.kind === 'repost') {
    return (
      <div className="card info-card community-post-card">
        <div className="community-post-card__repost-banner">🔁 {item.repost.reposterNickname}님이 리포스트</div>
        {item.originalPost ? (
          <PostBody post={item.originalPost} currentUserId={currentUserId} currentUserNickname={currentUserNickname} onDeleted={onDeleted} showRepostAction={false} onHashtagClick={onHashtagClick} />
        ) : (
          <p className="video-status-message">
            원본 게시물이 삭제되었습니다 — "{item.repost.originalContentSnippet}" ({item.repost.originalAuthorNickname})
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="card info-card community-post-card">
      <PostBody post={item.post} currentUserId={currentUserId} currentUserNickname={currentUserNickname} onDeleted={onDeleted} showRepostAction onHashtagClick={onHashtagClick} />
    </div>
  );
}

// React.memo — a like/save/repost click updates only THIS card's own local
// state (see PostBody above), so the parent feed list re-rendering for an
// unrelated reason (pagination, another card's click) must not force every
// other card to re-render too.
export default memo(PostCardInner);
