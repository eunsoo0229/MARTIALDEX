import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import BottomSheet from '../BottomSheet';
import type { PostTag } from '../../lib/communityPost/types';
import { aiCoachTarget, curriculumTarget, detailTarget, TAG_KIND_LABEL } from '../../lib/shorts/learn';

/**
 * 영상에 나온 내용 배우기 — the viewer picks what to learn (one of the tagged techniques /
 * combos-setups, or all of them for a curriculum) and HOW: AI 코치 수업, 관련 커리큘럼 만들기,
 * or the item's own page. Each opens prefilled; nothing starts without the viewer.
 */
export default function LearnSheet({ tags, initial, onClose }: { tags: PostTag[]; initial?: PostTag; onClose: () => void }) {
  const navigate = useNavigate();
  const [picked, setPicked] = useState<PostTag>(initial ?? tags[0]);
  const go = (to: string, state?: unknown) => {
    onClose();
    navigate(to, state ? { state } : undefined);
  };
  if (!tags.length) return null;
  const curriculum = curriculumTarget(tags.length > 1 && !initial ? tags : [picked]);

  return createPortal(
    <BottomSheet onClose={onClose} className="learn-sheet">
      <h3 style={{ marginTop: 0 }}>🎓 영상에 나온 내용 배우기</h3>
      {tags.length > 1 && (
        <div className="learn-sheet__tags" role="radiogroup" aria-label="배울 내용">
          {tags.map((t) => (
            <button key={`${t.type}:${t.id}`} type="button" role="radio" aria-checked={picked.id === t.id && picked.type === t.type} className={`chip${picked.id === t.id && picked.type === t.type ? ' active' : ''}`} onClick={() => setPicked(t)} data-testid="learn-tag">
              {TAG_KIND_LABEL(t)} · {t.name}
            </button>
          ))}
        </div>
      )}
      <p className="video-status-message" style={{ margin: '6px 0 10px' }}>
        <strong>{picked.name}</strong> ({TAG_KIND_LABEL(picked)}) — 어떻게 배울까요?
      </p>
      <div className="learn-sheet__actions">
        <button type="button" className="learn-sheet__action" onClick={() => go(aiCoachTarget(picked))} data-testid="learn-ai-coach">
          <span className="learn-sheet__icon">🤖</span>
          <span><strong>AI 코치에게 배우기</strong><small>이 {TAG_KIND_LABEL(picked)}로 1:1 수업을 시작합니다</small></span>
        </button>
        <button type="button" className="learn-sheet__action" onClick={() => go(curriculum.to, curriculum.state)} data-testid="learn-curriculum">
          <span className="learn-sheet__icon">📅</span>
          <span><strong>관련 커리큘럼 만들기</strong><small>{tags.length > 1 && !initial ? '태그된 내용 전체' : picked.name}를 익히는 여러 날 계획</small></span>
        </button>
        <button type="button" className="learn-sheet__action" onClick={() => go(detailTarget(picked))} data-testid="learn-detail">
          <span className="learn-sheet__icon">🔍</span>
          <span><strong>{TAG_KIND_LABEL(picked)} 자세히 보기</strong><small>{picked.type === 'technique' ? '자세·핵심 포인트·영상' : '단계별 동작과 설명'}</small></span>
        </button>
      </div>
    </BottomSheet>,
    document.body
  );
}
