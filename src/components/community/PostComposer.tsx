import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import TagPicker from '../shorts/TagPicker';
import type { PostTag } from '../../lib/communityPost/types';
import BottomSheet from '../BottomSheet';
import { useMyCurricula } from '../../lib/curriculum/useCurriculum';
import { listMyGyms } from '../../lib/gymClass/service';
import type { MyGymMembership } from '../../lib/gymClass/types';
import { buildCurriculumSnapshot, createPost } from '../../lib/communityPost/service';
import type { CommunityPost } from '../../lib/communityPost/types';

const MAX_MEDIA_ITEMS = 6;

interface PendingMedia {
  file: File;
  type: 'image' | 'video';
  previewUrl: string;
}

interface PostComposerProps {
  onClose: () => void;
  onCreated: (post: CommunityPost) => void;
  currentUserId: string;
  currentUserNickname: string;
}

// A BottomSheet-based modal (spec 4-11 lists "게시물 작성" among the modals
// that must use it) — every media combination is optional: text-only,
// photo-only, video-only, any mix, with or without a gym tag or attached
// curriculum, matches the spec's "모든 조합 지원" requirement.
export default function PostComposer({ onClose, onCreated, currentUserId, currentUserNickname }: PostComposerProps) {
  const myCurricula = useMyCurricula();
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<PendingMedia[]>([]);
  const [gyms, setGyms] = useState<MyGymMembership[]>([]);
  const [selectedGymId, setSelectedGymId] = useState('');
  const [selectedCurriculumId, setSelectedCurriculumId] = useState('');
  const [tags, setTags] = useState<PostTag[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Best-effort — no gyms yet (or logged out) just means the gym-tag
    // picker stays empty; never blocks posting. Per the plan: never
    // bulk-generate fake gym data, only surface what already exists.
    listMyGyms(currentUserId).then((result) => {
      if (result.ok) setGyms(result.data);
    });
  }, [currentUserId]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    const room = MAX_MEDIA_ITEMS - media.length;
    if (room <= 0) return;
    const next: PendingMedia[] = [];
    for (const file of files.slice(0, room)) {
      const type: 'image' | 'video' | null = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : null;
      if (!type) continue;
      next.push({ file, type, previewUrl: URL.createObjectURL(file) });
    }
    setMedia((prev) => [...prev, ...next]);
  }

  function removeMedia(index: number) {
    setMedia((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit() {
    if (submitting) return;
    if (!content.trim() && media.length === 0 && !selectedCurriculumId) {
      setError('내용을 입력하거나 사진/영상/커리큘럼을 추가해주세요.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const selectedGym = gyms.find((g) => g.gym.id === selectedGymId);
    const selectedCurriculum = myCurricula.find((c) => c.id === selectedCurriculumId);
    const result = await createPost({
      authorId: currentUserId,
      authorNickname: currentUserNickname,
      content: content.trim(),
      media: media.map((m) => ({ file: m.file, type: m.type })),
      gym: selectedGym ? { id: selectedGym.gym.id, name: selectedGym.gym.name } : null,
      curriculumSnapshot: selectedCurriculum ? buildCurriculumSnapshot(selectedCurriculum) : null,
      tags,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    for (const m of media) URL.revokeObjectURL(m.previewUrl);
    onCreated(result.data);
  }

  return createPortal(
    <BottomSheet onClose={onClose} className="post-composer">
      <h3>✍️ 새 게시물</h3>

      <textarea
        className="field-full"
        style={{ minHeight: 90 }}
        placeholder="무슨 훈련을 하셨나요? (예: #BJJ #스파링)"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        autoFocus
      />

      {media.length > 0 && (
        <div className="post-composer__media-preview">
          {media.map((m, i) => (
            <div key={i} className="post-composer__media-preview-item">
              {m.type === 'image' ? <img src={m.previewUrl} alt="" /> : <video src={m.previewUrl} muted />}
              <button type="button" className="post-composer__media-remove" onClick={() => removeMedia(i)} aria-label="제거">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="chip-row" style={{ marginTop: 8 }}>
        <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
          📷 사진/영상 추가
          <input type="file" accept="image/*,video/*" multiple hidden onChange={handleFileChange} disabled={media.length >= MAX_MEDIA_ITEMS} />
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <TagPicker value={tags} onChange={setTags} viewerId={currentUserId} />
      </div>

      <div className="chip-row" style={{ marginTop: 12 }}>
        {gyms.length > 0 && (
          <div>
            <label className="field-label">📍 체육관 태그 (선택)</label>
            <br />
            <select className="select" value={selectedGymId} onChange={(e) => setSelectedGymId(e.target.value)}>
              <option value="">태그 안 함</option>
              {gyms.map((g) => (
                <option key={g.gym.id} value={g.gym.id}>
                  {g.gym.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {myCurricula.length > 0 && (
          <div>
            <label className="field-label">🧠 커리큘럼 공유 (선택)</label>
            <br />
            <select className="select" value={selectedCurriculumId} onChange={(e) => setSelectedCurriculumId(e.target.value)}>
              <option value="">공유 안 함</option>
              {myCurricula.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="ai-error" role="alert">
          {error}
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
          취소
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? '올리는 중…' : '게시하기'}
        </button>
      </div>
    </BottomSheet>,
    document.body
  );
}
