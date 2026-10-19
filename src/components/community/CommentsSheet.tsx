import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import BottomSheet from '../BottomSheet';
import type { CommunityComment, CommunityPost } from '../../lib/communityPost/types';
import { addComment, deleteComment, likeComment, listComments, listReplies, unlikeComment, type CommentSort } from '../../lib/communityPost/service';

interface CommentsSheetProps {
  post: CommunityPost;
  currentUserId: string | null;
  currentUserNickname: string | null;
  onClose: () => void;
  /** +1 on a successful add, -1 on a successful delete — lets the card update its own displayed count without a full post refetch. */
  onCommentCountChange: (delta: number) => void;
}

/** "방금", "3분 전", "2시간 전", "5일 전", then the date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
  return iso.slice(0, 10);
}

const initialOf = (name: string) => (name.trim()[0] ?? '?').toUpperCase();

interface ReplyTarget {
  /** the top-level comment the reply goes under (depth stays 1) */
  parentId: string;
  nickname: string;
}

/** One comment line: avatar · nickname (+작성자) · time · text · 답글 달기 / 삭제 · ♥ count. */
function CommentLine({
  c,
  postAuthorId,
  currentUserId,
  onReply,
  onDelete,
  onToggleLike,
  reply,
}: {
  c: CommunityComment;
  postAuthorId: string;
  currentUserId: string | null;
  onReply: (c: CommunityComment) => void;
  onDelete: (c: CommunityComment) => void;
  onToggleLike: (c: CommunityComment) => void;
  reply?: boolean;
}) {
  return (
    <div className={`cmt${reply ? ' cmt--reply' : ''}`} data-testid={reply ? 'comment-reply' : 'comment'} data-id={c.id}>
      <span className="cmt__avatar" aria-hidden="true">{initialOf(c.authorNickname)}</span>
      <div className="cmt__body">
        <div className="cmt__meta">
          <strong>{c.authorNickname}</strong>
          {c.authorId === postAuthorId && <span className="cmt__badge">작성자</span>}
          <span className="cmt__time">{timeAgo(c.createdAt)}</span>
        </div>
        <p className="cmt__text">{c.content}</p>
        <div className="cmt__actions">
          {currentUserId && (
            <button type="button" className="cmt__link" onClick={() => onReply(c)} data-testid="comment-reply-btn">
              답글 달기
            </button>
          )}
          {currentUserId === c.authorId && (
            <button type="button" className="cmt__link" onClick={() => onDelete(c)}>
              삭제
            </button>
          )}
        </div>
      </div>
      <button type="button" className={`cmt__like${c.viewerHasLiked ? ' is-on' : ''}`} onClick={() => onToggleLike(c)} aria-pressed={c.viewerHasLiked} aria-label={c.viewerHasLiked ? '좋아요 취소' : '좋아요'} data-testid="comment-like">
        <span aria-hidden="true">{c.viewerHasLiked ? '♥' : '♡'}</span>
        {c.likeCount > 0 && <small>{c.likeCount}</small>}
      </button>
    </div>
  );
}

/**
 * Comments — TikTok / Instagram style: most-liked first (or newest), a heart on every comment,
 * one input at the bottom for both comments and replies ("@닉네임에게 답글"), replies folded
 * under "── 답글 N개 보기" (depth 1: replying to a reply goes under the same top comment).
 */
export default function CommentsSheet({ post, currentUserId, currentUserNickname, onClose, onCommentCountChange }: CommentsSheetProps) {
  const [sort, setSort] = useState<CommentSort>('popular');
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [replies, setReplies] = useState<Record<string, CommunityComment[] | undefined>>({});
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(post.commentCount);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setReplies({});
    listComments(post.id, null, 20, { sort, viewerUserId: currentUserId }).then((result) => {
      if (!active) return;
      setLoading(false);
      if (result.ok) {
        setComments(result.data.comments);
        setNextCursor(result.data.nextCursor);
      } else setError(result.message);
    });
    return () => {
      active = false;
    };
  }, [post.id, sort, currentUserId]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const result = await listComments(post.id, nextCursor, 20, { sort, viewerUserId: currentUserId });
    setLoadingMore(false);
    if (result.ok) {
      setComments((prev) => [...prev, ...result.data.comments.filter((c) => !prev.some((p) => p.id === c.id))]);
      setNextCursor(result.data.nextCursor);
    }
  }

  async function toggleReplies(c: CommunityComment) {
    if (replies[c.id]) {
      setReplies((r) => ({ ...r, [c.id]: undefined }));
      return;
    }
    const result = await listReplies(c.id, currentUserId);
    if (result.ok) setReplies((r) => ({ ...r, [c.id]: result.data }));
  }

  function startReply(c: CommunityComment) {
    const parentId = c.parentCommentId ?? c.id;
    setReplyTo({ parentId, nickname: c.authorNickname });
    setInput((v) => (v.startsWith(`@${c.authorNickname} `) ? v : `@${c.authorNickname} `));
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const patch = (id: string, fn: (c: CommunityComment) => CommunityComment) => {
    setComments((list) => list.map((c) => (c.id === id ? fn(c) : c)));
    setReplies((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v?.map((c) => (c.id === id ? fn(c) : c))])));
  };

  async function toggleLike(c: CommunityComment) {
    if (!currentUserId) {
      setError('좋아요를 누르려면 로그인이 필요합니다.');
      return;
    }
    const on = !c.viewerHasLiked;
    patch(c.id, (x) => ({ ...x, viewerHasLiked: on, likeCount: Math.max(0, x.likeCount + (on ? 1 : -1)) }));
    const r = on ? await likeComment(c.id, currentUserId) : await unlikeComment(c.id, currentUserId);
    if (!r.ok) {
      patch(c.id, (x) => ({ ...x, viewerHasLiked: !on, likeCount: Math.max(0, x.likeCount + (on ? -1 : 1)) }));
      setError(r.message);
    }
  }

  async function send() {
    const text = input.trim();
    if (!currentUserId || !currentUserNickname || !text || sending) return;
    setSending(true);
    const result = await addComment(post.id, currentUserId, currentUserNickname, text, replyTo?.parentId ?? null);
    setSending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (replyTo) {
      const pid = replyTo.parentId;
      setReplies((r) => ({ ...r, [pid]: [...(r[pid] ?? []), result.data] }));
      setComments((list) => list.map((c) => (c.id === pid ? { ...c, replyCount: c.replyCount + 1 } : c)));
    } else {
      setComments((list) => [result.data, ...list]);
    }
    setInput('');
    setReplyTo(null);
    setCount((n) => n + 1);
    onCommentCountChange(1);
  }

  async function remove(c: CommunityComment) {
    if (!currentUserId) return;
    const result = await deleteComment(c.id, currentUserId);
    if (!result.ok) return;
    if (c.parentCommentId) {
      const pid = c.parentCommentId;
      setReplies((r) => ({ ...r, [pid]: (r[pid] ?? []).filter((x) => x.id !== c.id) }));
      setComments((list) => list.map((x) => (x.id === pid ? { ...x, replyCount: Math.max(0, x.replyCount - 1) } : x)));
    } else setComments((list) => list.filter((x) => x.id !== c.id));
    setCount((n) => Math.max(0, n - 1));
    onCommentCountChange(-1);
  }

  return createPortal(
    <BottomSheet onClose={onClose} className="comments-sheet comments-sheet--social">
      <div className="cmt-head">
        <h3>댓글 {count.toLocaleString()}개</h3>
        <div className="cmt-head__sort" role="tablist" aria-label="댓글 정렬">
          {(['popular', 'latest'] as CommentSort[]).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={sort === s} className={`cmt-head__tab${sort === s ? ' is-on' : ''}`} onClick={() => setSort(s)} data-testid={`comment-sort-${s}`}>
              {s === 'popular' ? '인기순' : '최신순'}
            </button>
          ))}
        </div>
        <button type="button" className="cmt-head__close" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>

      <div className="comments-sheet__list" data-testid="comments-list">
        {loading ? (
          <p className="video-status-message">불러오는 중…</p>
        ) : comments.length === 0 ? (
          <p className="video-status-message cmt-empty">아직 댓글이 없습니다. 첫 댓글을 남겨보세요.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="cmt-thread">
              <CommentLine c={c} postAuthorId={post.authorId} currentUserId={currentUserId} onReply={startReply} onDelete={remove} onToggleLike={toggleLike} />
              {c.replyCount > 0 && (
                <button type="button" className="cmt-thread__toggle" onClick={() => toggleReplies(c)} data-testid="comment-replies-toggle">
                  <span aria-hidden="true">──</span> {replies[c.id] ? '답글 숨기기' : `답글 ${c.replyCount}개 보기`}
                </button>
              )}
              {replies[c.id]?.map((r) => <CommentLine key={r.id} c={r} postAuthorId={post.authorId} currentUserId={currentUserId} onReply={startReply} onDelete={remove} onToggleLike={toggleLike} reply />)}
            </div>
          ))
        )}
        {nextCursor && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadMore} disabled={loadingMore} style={{ marginTop: 8 }}>
            {loadingMore ? '불러오는 중…' : '댓글 더 보기'}
          </button>
        )}
      </div>

      {error && (
        <div className="ai-error" role="alert">
          {error}
        </div>
      )}

      {currentUserId ? (
        <div className="cmt-composer">
          {replyTo && (
            <div className="cmt-composer__replying" data-testid="comment-replying">
              <span>@{replyTo.nickname}님에게 답글 다는 중</span>
              <button
                type="button"
                className="cmt__link"
                onClick={() => {
                  setReplyTo(null);
                  setInput((v) => v.replace(/^@\S+\s/, ''));
                }}
                aria-label="답글 취소"
              >
                ✕
              </button>
            </div>
          )}
          <div className="cmt-composer__row">
            <span className="cmt__avatar" aria-hidden="true">{initialOf(currentUserNickname ?? '나')}</span>
            <input
              ref={inputRef}
              className="cmt-composer__input"
              placeholder={replyTo ? '답글 추가…' : '댓글 추가…'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && send()}
              disabled={sending}
              maxLength={1000}
              data-testid="comment-input"
            />
            <button type="button" className="cmt-composer__send" onClick={send} disabled={sending || !input.trim()} data-testid="comment-send">
              게시
            </button>
          </div>
        </div>
      ) : (
        <p className="video-status-message">댓글을 작성하려면 로그인이 필요합니다.</p>
      )}
    </BottomSheet>,
    document.body
  );
}
