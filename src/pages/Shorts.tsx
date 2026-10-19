import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthProvider';
import { getPost, likePost, listFeed, savePost, unlikePost, unsavePost } from '../lib/communityPost/service';
import type { CommunityPost, PostTag } from '../lib/communityPost/types';
import CommentsSheet, { timeAgo } from '../components/community/CommentsSheet';
import LearnSheet from '../components/shorts/LearnSheet';
import { TAG_KIND_LABEL } from '../lib/shorts/learn';

/** The post's first video (a post can mix photos and videos). */
const videoOf = (p: CommunityPost) => p.media.find((m) => m.type === 'video') ?? null;

// Only the current video and its neighbours get a real <video src> — a phone can't keep
// dozens of decoders alive; the rest are placeholders until you swipe near them.
const LOAD_RADIUS = 1;

function ShortSlide({
  post,
  index,
  active,
  near,
  muted,
  onMute,
  userId,
  onLike,
  onSave,
  onComments,
  onLearn,
}: {
  post: CommunityPost;
  index: number;
  active: boolean;
  near: boolean;
  muted: boolean;
  onMute: () => void;
  userId: string | null;
  onLike: (p: CommunityPost, only?: 'on') => void;
  onSave: (p: CommunityPost) => void;
  onComments: (p: CommunityPost) => void;
  onLearn: (p: CommunityPost, tag?: PostTag) => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [burst, setBurst] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const video = videoOf(post);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (active && !paused) void v.play().catch(() => setPaused(true)); // autoplay can be refused → show ▶
    else v.pause();
  }, [active, paused, near]);
  useEffect(() => {
    if (!active) setPaused(false);
  }, [active]);

  const lastTap = useRef(0);
  function tap() {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      // double tap = like (never unlike), like TikTok / Instagram
      lastTap.current = 0;
      setBurst((n) => n + 1);
      onLike(post, 'on');
      return;
    }
    lastTap.current = now;
    window.setTimeout(() => {
      if (lastTap.current === now) setPaused((p) => !p);
    }, 290);
  }

  return (
    <section className="short" data-index={index} data-testid="short" data-post-id={post.id} data-active={active ? 'true' : 'false'}>
      <div className="short__stage" onClick={tap}>
        {video && near ? (
          <video ref={ref} className="short__video" src={video.url} poster={video.thumbnailUrl ?? undefined} muted={muted} loop playsInline preload={active ? 'auto' : 'metadata'} data-testid="short-video" />
        ) : (
          <div className="short__placeholder" aria-hidden="true" />
        )}
        {paused && active && <span className="short__paused" aria-label="일시정지됨">▶</span>}
        {burst > 0 && (
          <span key={burst} className="short__burst" aria-hidden="true">
            ♥
          </span>
        )}
      </div>

      <div className="short__rail">
        <span className="short__avatar" aria-hidden="true">{(post.authorNickname.trim()[0] ?? '?').toUpperCase()}</span>
        <button type="button" className={`short__act${post.viewerHasLiked ? ' is-on' : ''}`} onClick={() => onLike(post)} aria-pressed={post.viewerHasLiked} data-testid="short-like">
          <span aria-hidden="true">{post.viewerHasLiked ? '♥' : '♡'}</span>
          <small>{post.likeCount.toLocaleString()}</small>
        </button>
        <button type="button" className="short__act" onClick={() => onComments(post)} data-testid="short-comments">
          <span aria-hidden="true">💬</span>
          <small>{post.commentCount.toLocaleString()}</small>
        </button>
        <button type="button" className={`short__act${post.viewerHasSaved ? ' is-on' : ''}`} onClick={() => onSave(post)} aria-pressed={post.viewerHasSaved} data-testid="short-save" disabled={!userId}>
          <span aria-hidden="true">{post.viewerHasSaved ? '🔖' : '📑'}</span>
          <small>저장</small>
        </button>
        {post.tags.length > 0 && (
          <button type="button" className="short__act short__act--learn" onClick={() => onLearn(post)} data-testid="short-learn">
            <span aria-hidden="true">🎓</span>
            <small>배우기</small>
          </button>
        )}
        <button type="button" className="short__act" onClick={onMute} aria-label={muted ? '소리 켜기' : '소리 끄기'} data-testid="short-mute">
          <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
        </button>
      </div>

      <div className="short__info">
        <div className="short__author">
          @{post.authorNickname} <span className="short__time">· {timeAgo(post.createdAt)}</span>
        </div>
        {post.content && (
          <p className={`short__caption${expanded ? ' is-open' : ''}`} onClick={() => setExpanded((v) => !v)}>
            {post.content}
          </p>
        )}
        {post.tags.length > 0 && (
          <div className="short__tags" data-testid="short-tags">
            {post.tags.map((t) => (
              <button key={`${t.type}:${t.id}`} type="button" className="short__tag" onClick={() => onLearn(post, t)} data-testid="short-tag">
                {t.type === 'technique' ? '🥋' : t.kind === 'setup' ? '🧩' : '🔗'} {t.name}
                <small> {TAG_KIND_LABEL(t)}</small>
              </button>
            ))}
          </div>
        )}
        {post.tags.length > 0 && (
          <button type="button" className="short__learn-cta" onClick={() => onLearn(post)} data-testid="short-learn-cta">
            🎓 영상에 나온 내용 배우기
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * 숏폼 — MARTIALDEX community video posts, one per screen, swiped vertically like
 * TikTok / Reels. The video in view plays; the others pause. Comments open in the social
 * comments sheet; tagged techniques / combos open "영상에 나온 내용 배우기".
 */
export default function Shorts() {
  const { user, profile } = useAuth();
  const userId = user?.id ?? null;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [commentsFor, setCommentsFor] = useState<CommunityPost | null>(null);
  const [learn, setLearn] = useState<{ post: CommunityPost; tag?: PostTag } | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    const r = await listFeed(userId, { cursor, limit: 10, filter: 'video' });
    loadingRef.current = false;
    setLoading(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    const fresh = r.data.items.flatMap((i) => (i.kind === 'post' && videoOf(i.post) ? [i.post] : []));
    setPosts((prev) => [...prev, ...fresh.filter((p) => !prev.some((x) => x.id === p.id))]);
    setCursor(r.data.nextCursor);
    setHasMore(r.data.hasMore && !!r.data.nextCursor);
  }, [cursor, hasMore, userId]);

  // first page (+ a shared link "?post=<id>" opens on that video)
  useEffect(() => {
    let alive = true;
    void (async () => {
      const startId = params.get('post');
      if (startId) {
        const r = await getPost(startId, userId);
        if (alive && r.ok && r.data && videoOf(r.data)) setPosts([r.data]);
      }
      if (alive) await loadMore();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // which slide is on screen
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting && e.intersectionRatio >= 0.6) setActive(Number((e.target as HTMLElement).dataset.index));
      },
      { root, threshold: [0.6] }
    );
    root.querySelectorAll('[data-testid="short"]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [posts.length]);

  useEffect(() => {
    if (active >= posts.length - 2 && hasMore) void loadMore();
  }, [active, posts.length, hasMore, loadMore]);

  const update = (id: string, fn: (p: CommunityPost) => CommunityPost) => setPosts((list) => list.map((p) => (p.id === id ? fn(p) : p)));

  async function toggleLike(p: CommunityPost, only?: 'on') {
    if (!userId) {
      navigate('/login');
      return;
    }
    const on = only === 'on' ? true : !p.viewerHasLiked;
    if (on === p.viewerHasLiked) return;
    update(p.id, (x) => ({ ...x, viewerHasLiked: on, likeCount: Math.max(0, x.likeCount + (on ? 1 : -1)) }));
    const r = on ? await likePost(p.id, userId) : await unlikePost(p.id, userId);
    if (!r.ok) update(p.id, (x) => ({ ...x, viewerHasLiked: !on, likeCount: Math.max(0, x.likeCount + (on ? -1 : 1)) }));
  }
  async function toggleSave(p: CommunityPost) {
    if (!userId) return;
    const on = !p.viewerHasSaved;
    update(p.id, (x) => ({ ...x, viewerHasSaved: on }));
    const r = on ? await savePost(p.id, userId) : await unsavePost(p.id, userId);
    if (!r.ok) update(p.id, (x) => ({ ...x, viewerHasSaved: !on }));
  }

  return (
    <div className="shorts" data-testid="shorts">
      <div className="shorts__top">
        <button type="button" className="shorts__back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/community'))} aria-label="뒤로">
          ←
        </button>
        <strong>숏폼</strong>
        <Link to="/community" className="shorts__link">
          커뮤니티
        </Link>
      </div>
      <div className="shorts__scroller" ref={scroller}>
        {posts.map((p, i) => (
          <ShortSlide
            key={p.id}
            post={p}
            index={i}
            active={i === active}
            near={Math.abs(i - active) <= LOAD_RADIUS}
            muted={muted}
            onMute={() => setMuted((m) => !m)}
            userId={userId}
            onLike={toggleLike}
            onSave={toggleSave}
            onComments={setCommentsFor}
            onLearn={(post, tag) => setLearn({ post, tag })}
          />
        ))}
        {!loading && posts.length === 0 && (
          <div className="shorts__empty" data-testid="shorts-empty">
            {error ? <p>영상을 불러오지 못했습니다: {error}</p> : <p>아직 올라온 영상 게시물이 없습니다.</p>}
            <Link to="/community" className="btn btn-primary">
              커뮤니티에서 영상 올리기
            </Link>
          </div>
        )}
        {loading && <div className="shorts__loading">불러오는 중…</div>}
      </div>
      {commentsFor && (
        <CommentsSheet
          post={commentsFor}
          currentUserId={userId}
          currentUserNickname={profile?.nickname ?? null}
          onClose={() => setCommentsFor(null)}
          onCommentCountChange={(d) => update(commentsFor.id, (x) => ({ ...x, commentCount: Math.max(0, x.commentCount + d) }))}
        />
      )}
      {learn && <LearnSheet tags={learn.post.tags} initial={learn.tag} onClose={() => setLearn(null)} />}
    </div>
  );
}
