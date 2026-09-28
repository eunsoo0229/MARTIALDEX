import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import BottomSheet from '../BottomSheet';
import type { CommunityComment, CommunityPost } from '../../lib/communityPost/types';
import { addComment, deleteComment, listComments, listReplies } from '../../lib/communityPost/service';

interface CommentsSheetProps {
  post: CommunityPost;
  currentUserId: string | null;
  currentUserNickname: string | null;
  onClose: () => void;
  /** +1 on a successful add, -1 on a successful delete — lets the card update its own displayed count without a full post refetch. */
  onCommentCountChange: (delta: number) => void;
}

interface CommentRowProps {
  comment: CommunityComment;
  currentUserId: string | null;
  currentUserNickname: string | null;
  postId: string;
  onDeleted: (id: string) => void;
  /** Only top-level comments' delete affects the post's own comment count — a reply's delete doesn't (replies aren't counted in post.commentCount, only top-level comments are, matching the existing comment_count trigger which counts every row — see note below). */
  onCommentCountChange: (delta: number) => void;
}

/**
 * One top-level comment + its lazily-loaded replies (spec section 9's "댓글
 * 답글" — max depth 1, "너무 복잡해지지 않도록" — a reply can never itself be
 * replied to). Replies are fetched only once the user taps "답글 N개 보기",
 * never eagerly for every comment in the sheet.
 */
function CommentRow({ comment, currentUserId, currentUserNickname, postId, onDeleted, onCommentCountChange }: CommentRowProps) {
  const [replyCount, setReplyCount] = useState(comment.replyCount);
  const [replies, setReplies] = useState<CommunityComment[] | null>(null);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [replyBoxOpen, setReplyBoxOpen] = useState(false);
  const [replyInput, setReplyInput] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  async function handleExpandReplies() {
    if (replies !== null) {
      setReplies(null); // toggle closed
      return;
    }
    setRepliesLoading(true);
    const result = await listReplies(comment.id);
    setRepliesLoading(false);
    if (result.ok) setReplies(result.data);
  }

  async function handleSendReply() {
    if (!currentUserId || !currentUserNickname || !replyInput.trim() || sendingReply) return;
    setSendingReply(true);
    const result = await addComment(postId, currentUserId, currentUserNickname, replyInput.trim(), comment.id);
    setSendingReply(false);
    if (result.ok) {
      setReplies((prev) => [...(prev ?? []), result.data]);
      setReplyCount((n) => n + 1);
      setReplyInput('');
      setReplyBoxOpen(false);
      // A reply is still a row in community_post_comments, so the DB
      // trigger already counted it into post.comment_count — mirror that
      // here so the card's displayed count matches without a refetch.
      onCommentCountChange(1);
    }
  }

  async function handleDeleteReply(reply: CommunityComment) {
    if (!currentUserId) return;
    const result = await deleteComment(reply.id, currentUserId);
    if (result.ok) {
      setReplies((prev) => (prev ?? []).filter((r) => r.id !== reply.id));
      setReplyCount((n) => Math.max(0, n - 1));
      onCommentCountChange(-1);
    }
  }

  return (
    <div className="comments-sheet__item">
      <div className="comments-sheet__item-header">
        <strong>{comment.authorNickname}</strong>
        {currentUserId === comment.authorId && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDeleted(comment.id)}>
            삭제
          </button>
        )}
      </div>
      <p style={{ margin: '2px 0 0' }}>{comment.content}</p>
      <div className="modal-actions modal-actions--start" style={{ marginTop: 4, gap: 8 }}>
        {currentUserId && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReplyBoxOpen((v) => !v)}>
            답글
          </button>
        )}
        {replyCount > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleExpandReplies}>
            {repliesLoading ? '불러오는 중…' : replies !== null ? '답글 숨기기' : `답글 ${replyCount}개`}
          </button>
        )}
      </div>

      {replyBoxOpen && (
        <div className="comments-sheet__composer" style={{ marginTop: 6, marginLeft: 16 }}>
          <input
            className="select field-full"
            placeholder="답글을 입력하세요"
            value={replyInput}
            onChange={(e) => setReplyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
            disabled={sendingReply}
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={handleSendReply} disabled={sendingReply || !replyInput.trim()}>
            등록
          </button>
        </div>
      )}

      {replies !== null && replies.length > 0 && (
        <div className="comments-sheet__replies">
          {replies.map((r) => (
            <div key={r.id} className="comments-sheet__item comments-sheet__item--reply">
              <div className="comments-sheet__item-header">
                <strong>{r.authorNickname}</strong>
                {currentUserId === r.authorId && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDeleteReply(r)}>
                    삭제
                  </button>
                )}
              </div>
              <p style={{ margin: '2px 0 0' }}>{r.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Reuses the EXISTING BottomSheet (per the plan's explicit "이미 구현된
// BottomSheet를 다시 만들지 마라") — same portal-to-body pattern as
// AiAskModal.tsx, for the same backdrop-filter containing-block reason.
export default function CommentsSheet({ post, currentUserId, currentUserNickname, onClose, onCommentCountChange }: CommentsSheetProps) {
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listComments(post.id).then((result) => {
      if (!active) return;
      setLoading(false);
      if (result.ok) {
        setComments(result.data.comments);
        setNextCursor(result.data.nextCursor);
      } else {
        setError(result.message);
      }
    });
    return () => {
      active = false;
    };
  }, [post.id]);

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const result = await listComments(post.id, nextCursor);
    setLoadingMore(false);
    if (result.ok) {
      setComments((prev) => [...prev, ...result.data.comments]);
      setNextCursor(result.data.nextCursor);
    }
  }

  async function handleSend() {
    if (!currentUserId || !currentUserNickname || !input.trim() || sending) return;
    setSending(true);
    const result = await addComment(post.id, currentUserId, currentUserNickname, input.trim());
    setSending(false);
    if (result.ok) {
      setComments((prev) => [...prev, result.data]);
      setInput('');
      onCommentCountChange(1);
    } else {
      setError(result.message);
    }
  }

  async function handleDelete(commentId: string) {
    if (!currentUserId) return;
    const result = await deleteComment(commentId, currentUserId);
    if (result.ok) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      onCommentCountChange(-1);
    }
  }

  return createPortal(
    <BottomSheet onClose={onClose} className="comments-sheet">
      <h3>💬 댓글 {post.commentCount}개</h3>

      <div className="comments-sheet__list">
        {loading ? (
          <p className="video-status-message">불러오는 중…</p>
        ) : comments.length === 0 ? (
          <p className="video-status-message">아직 댓글이 없습니다. 첫 댓글을 남겨보세요.</p>
        ) : (
          comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              currentUserId={currentUserId}
              currentUserNickname={currentUserNickname}
              postId={post.id}
              onDeleted={handleDelete}
              onCommentCountChange={onCommentCountChange}
            />
          ))
        )}
        {nextCursor && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleLoadMore} disabled={loadingMore} style={{ marginTop: 8 }}>
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
        <div className="comments-sheet__composer">
          <input
            className="select field-full"
            placeholder="댓글을 입력하세요"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={sending}
          />
          <button type="button" className="btn btn-primary" onClick={handleSend} disabled={sending || !input.trim()}>
            등록
          </button>
        </div>
      ) : (
        <p className="video-status-message">댓글을 작성하려면 로그인이 필요합니다.</p>
      )}
    </BottomSheet>,
    document.body
  );
}
