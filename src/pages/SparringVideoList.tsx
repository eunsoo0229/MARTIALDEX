import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSparringVideos } from '../lib/sparringVideo/useSparringVideos';
import { deleteSparringVideo, resolvePlayableSrc, revealSparringVideoFile, setSparringVideoTrim } from '../lib/sparringVideo/service';
import {
  formatFileSize,
  isDurationPreviewable,
  isSaveToGallerySupported,
  isVideoExternalOpenSupported,
  openVideoFileLocation,
  openVideoInGallery,
  saveVideoToDeviceGallery,
} from '../lib/sparringVideo/gallery';
import type { SparringVideo } from '../lib/sparringVideo/types';
import BackButton from '../components/BackButton';
import EmptyState from '../components/EmptyState';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Trims are stored, never applied to the file itself (see SparringVideo.
// trimStartSec/trimEndSec) — this player is what actually "cuts" playback,
// by seeking to the start point on load and stopping at the end point.
// `onError` is the runtime half of the preview-availability decision (spec
// section 5's "60분 이하 + 미리보기 로딩 실패") — duration alone (checked by
// the caller, VideoCard) only rules out the KNOWN-bad case ahead of time;
// this still needs to catch an actual load/decode failure (unsupported
// codec, missing file, etc.) that only shows up once the browser tries.
function VideoPreview({ video, onError }: { video: SparringVideo; onError: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const start = video.trimStartSec ?? 0;
  const end = video.trimEndSec ?? video.durationSeconds;

  return (
    <video
      ref={videoRef}
      src={resolvePlayableSrc(video.localUri)}
      controls
      playsInline
      className="sparring-record-video"
      onLoadedMetadata={() => {
        if (videoRef.current) videoRef.current.currentTime = start;
      }}
      onTimeUpdate={() => {
        const el = videoRef.current;
        if (el && end > start && el.currentTime >= end) {
          el.pause();
          el.currentTime = start;
        }
      }}
      onError={onError}
    />
  );
}

// The fallback UI spec sections 2/5/6 require whenever a preview can't (or
// shouldn't even try to) be shown — a long clip (>60분, checked by the
// caller BEFORE this ever mounts a <video>) or an actual playback failure.
// Both action buttons are best-effort and platform-dispatched (see
// gallery.ts) — a failure here is always reported inline, never thrown.
function LongVideoFallback({ video }: { video: SparringVideo }) {
  const [galleryMessage, setGalleryMessage] = useState<string | null>(null);
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const supported = isVideoExternalOpenSupported();

  async function handleGallery() {
    setGalleryMessage(null);
    const result = await openVideoInGallery(video);
    if (!result.ok) setGalleryMessage(result.message ?? '갤러리에서 열 수 없습니다.');
  }

  async function handleFileLocation() {
    setFileMessage(null);
    const result = await openVideoFileLocation(video);
    if (!result.ok) setFileMessage(result.message ?? '파일 위치를 열 수 없습니다.');
  }

  return (
    <div className="banner banner--warning" style={{ marginTop: 8, flexDirection: 'column', alignItems: 'stretch' }}>
      <div>영상 길이가 길어 미리보기가 불가할 수 있습니다.</div>
      {supported ? (
        <div className="modal-actions modal-actions--start" style={{ marginTop: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={handleGallery}>
            갤러리에서 보기
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleFileLocation}>
            파일로 이동하기
          </button>
        </div>
      ) : (
        <div className="video-status-message" style={{ marginTop: 6 }}>
          이 환경에서는 갤러리/파일 이동 기능을 지원하지 않습니다.
        </div>
      )}
      {galleryMessage && (
        <p className="video-status-message" style={{ marginTop: 4 }}>
          {galleryMessage}
        </p>
      )}
      {fileMessage && (
        <p className="video-status-message" style={{ marginTop: 4 }}>
          {fileMessage}
        </p>
      )}
    </div>
  );
}

function TrimEditor({ video, onClose }: { video: SparringVideo; onClose: () => void }) {
  const [startInput, setStartInput] = useState(String(video.trimStartSec ?? 0));
  const [endInput, setEndInput] = useState(String(video.trimEndSec ?? video.durationSeconds));
  const [message, setMessage] = useState<string | null>(null);

  function clampToRange(n: number): number {
    return Math.max(0, Math.min(video.durationSeconds, n));
  }

  function handleApply() {
    const start = clampToRange(Number(startInput) || 0);
    const end = clampToRange(Number(endInput) || video.durationSeconds);
    if (end <= start) {
      setMessage('끝 시간은 시작 시간보다 커야 합니다.');
      return;
    }
    setSparringVideoTrim(video.id, start, end);
    setMessage('자르기 구간이 저장되었습니다. 재생 시 이 구간만 재생됩니다.');
  }

  function handleReset() {
    setSparringVideoTrim(video.id, null, null);
    setStartInput('0');
    setEndInput(String(video.durationSeconds));
    setMessage('전체 길이로 초기화되었습니다.');
  }

  return (
    <div className="card info-card" style={{ marginTop: 8 }}>
      <label className="field-label">자르기 (시작~끝, 초 단위 · 전체 {video.durationSeconds}초)</label>
      <p className="video-status-message" style={{ marginTop: 2 }}>
        원본 파일은 그대로 유지되고, 지정한 구간만 재생/표시되도록 저장됩니다.
      </p>
      <div className="chip-row" style={{ marginTop: 8 }}>
        <label className="field-label">
          시작(초)
          <br />
          <input type="number" className="select gym-num-input" min={0} max={video.durationSeconds} value={startInput} onChange={(e) => setStartInput(e.target.value)} />
        </label>
        <label className="field-label">
          끝(초)
          <br />
          <input type="number" className="select gym-num-input" min={0} max={video.durationSeconds} value={endInput} onChange={(e) => setEndInput(e.target.value)} />
        </label>
      </div>
      {message && <p className="video-status-message">{message}</p>}
      <div className="modal-actions modal-actions--start" style={{ marginTop: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={handleApply}>
          적용
        </button>
        <button className="btn btn-ghost btn-sm" onClick={handleReset}>
          전체 길이로 초기화
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}

function VideoCard({ video }: { video: SparringVideo }) {
  const [showPlayer, setShowPlayer] = useState(false);
  const [showTrim, setShowTrim] = useState(false);
  // Two independent signals feed into one "can we even try a preview?"
  // decision (spec section 5): duration alone (known up front, never even
  // mounts a <video> past 60분) and an actual load/decode failure (only
  // discoverable once VideoPreview's onError actually fires).
  const [playerFailed, setPlayerFailed] = useState(false);
  const previewableByDuration = isDurationPreviewable(video.durationSeconds);
  const previewable = previewableByDuration && !playerFailed;
  const hasTrim = video.trimStartSec != null || video.trimEndSec != null;
  const canRevealInFolder = typeof window !== 'undefined' && !!window.martialdex?.revealVideo;
  const canSaveToGallery = isSaveToGallerySupported();
  const [saveToGalleryStatus, setSaveToGalleryStatus] = useState<string | null>(null);
  const [savingToGallery, setSavingToGallery] = useState(false);
  const [saveToGalleryPercent, setSaveToGalleryPercent] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm('이 영상을 삭제할까요? 되돌릴 수 없습니다.')) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteSparringVideo(video.id);
      // Only a genuine failure leaves a message — on success the card
      // itself disappears (useSparringVideos re-reads the list), so there's
      // nothing left to show a message on.
      if (!result.ok) setDeleteError(result.message ?? '영상을 삭제하지 못했습니다.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveToGallery() {
    setSavingToGallery(true);
    setSaveToGalleryStatus(null);
    setSaveToGalleryPercent(0);
    try {
      // A long clip can take real time to copy — showing a live percentage
      // (from the native side's "galleryProgress" events, see gallery.ts)
      // is what actually answers "되는건지 안되는건지 알 수가 없네": the
      // number moving is the proof it's still working, not stuck.
      const result = await saveVideoToDeviceGallery(video, (percent) => setSaveToGalleryPercent(percent));
      setSaveToGalleryStatus(result.ok ? '갤러리에 저장되었습니다.' : (result.message ?? '갤러리에 저장하지 못했습니다.'));
    } finally {
      setSavingToGallery(false);
      setSaveToGalleryPercent(null);
    }
  }

  return (
    <div className="card info-card">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {video.thumbnailDataUrl ? (
          <img
            src={video.thumbnailDataUrl}
            alt=""
            style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 'var(--radius-sm)', flexShrink: 0, cursor: previewable ? 'pointer' : 'default' }}
            onClick={previewable ? () => setShowPlayer((v) => !v) : undefined}
          />
        ) : (
          <div
            style={{ width: 96, height: 72, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', flexShrink: 0, cursor: previewable ? 'pointer' : 'default' }}
            onClick={previewable ? () => setShowPlayer((v) => !v) : undefined}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{new Date(video.createdAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}</strong>
          <p className="video-status-message">
            {formatDuration(video.durationSeconds)}
            {hasTrim ? ` (자르기: ${formatDuration(video.trimStartSec ?? 0)}~${formatDuration(video.trimEndSec ?? video.durationSeconds)})` : ''} ·{' '}
            {video.cameraMode === 'dual' ? '전면+후면' : video.facing === 'user' ? '전면' : '후면'} · {formatFileSize(video.fileSizeBytes)}
            {video.notes ? ` · ${video.notes}` : ''}
          </p>
          <p className="video-status-message">{previewable ? '✓ 미리보기 가능' : '⚠ 미리보기 제한됨'}</p>
          <p className="video-status-message sparring-video-location" title={video.localUri}>
            📁 {video.localUri}
          </p>
          <div className="modal-actions modal-actions--start" style={{ gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
            {previewable && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPlayer((v) => !v)}>
                {showPlayer ? '닫기' : '미리보기'}
              </button>
            )}
            <Link className="btn btn-secondary btn-sm" to={`/sparring?video=${encodeURIComponent(video.id)}`} data-testid="sparring-video-analyze">
              🧠 AI 분석
            </Link>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowTrim((v) => !v)}>
              {showTrim ? '자르기 닫기' : '자르기'}
            </button>
            {canRevealInFolder && (
              <button className="btn btn-ghost btn-sm" onClick={() => revealSparringVideoFile(video.localUri)}>
                파일 위치 열기
              </button>
            )}
            {canSaveToGallery && (
              <button className="btn btn-ghost btn-sm" onClick={handleSaveToGallery} disabled={savingToGallery}>
                {savingToGallery ? `저장 중... ${saveToGalleryPercent ?? 0}%` : '갤러리로 저장'}
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? '삭제 중...' : '삭제'}
            </button>
          </div>
          {deleteError && <p className="video-status-message" style={{ color: 'var(--accent)' }}>{deleteError}</p>}
          {saveToGalleryStatus && <p className="video-status-message">{saveToGalleryStatus}</p>}
        </div>
      </div>
      {!previewable && <LongVideoFallback video={video} />}
      {showPlayer && previewable && (
        <div className="sparring-record-grid" style={{ marginTop: 10 }}>
          <VideoPreview video={video} onError={() => setPlayerFailed(true)} />
        </div>
      )}
      {showTrim && <TrimEditor video={video} onClose={() => setShowTrim(false)} />}
    </div>
  );
}

export default function SparringVideoList() {
  const videos = useSparringVideos();

  return (
    <div className="page">
      <div className="container">
        <BackButton fallback="/sparring" />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/sparring">스파링 분석</Link>
          <span>/</span>
          <span>촬영한 영상</span>
        </div>
        <div className="section-title">
          <h2>🎥 촬영한 영상</h2>
          <Link to="/sparring/record" className="see-all">
            + 새로 촬영
          </Link>
        </div>

        {videos.length === 0 ? (
          <EmptyState icon="🎥" text="아직 촬영한 영상이 없습니다." />
        ) : (
          <div className="stack gap-2">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
