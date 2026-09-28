import { useEffect, useState } from 'react';
import type { Technique } from '../types';
import { getMartialArt } from '../lib/loadData';
import { buildYoutubeQuery } from '../lib/youtube';
import { videoSearchProvider } from '../lib/videoSearch/provider';
import type { VideoSearchItem } from '../lib/videoSearch/types';

const IFRAME_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

type SearchState =
  | { status: 'loading' }
  | { status: 'done'; results: VideoSearchItem[] }
  | { status: 'error'; message: string };

interface VideoPickerModalProps {
  technique: Technique;
  onClose: () => void;
  onSelect: (item: VideoSearchItem) => void;
}

/**
 * Spec sections 3-6's "관련 영상 찾기 / YouTube 영상 불러오기" search-and-pick
 * flow — a single shared component so the technique-detail screen and every
 * training screen (both already render RelatedVideos, which owns this
 * modal) get identical behavior instead of two parallel implementations.
 * Search-only here; YouTube search and any web/Tavily search stay separate
 * concerns (this never calls webSearchProvider) — the "자연어 조건" input
 * below only ever refines the YouTube query text itself.
 */
export default function VideoPickerModal({ technique, onClose, onSelect }: VideoPickerModalProps) {
  const art = getMartialArt(technique.martialArt);
  const baseQuery = buildYoutubeQuery(technique, art);
  const [refineInput, setRefineInput] = useState('');
  const [activeQuery, setActiveQuery] = useState(baseQuery);
  const [state, setState] = useState<SearchState>({ status: 'loading' });
  const [previewId, setPreviewId] = useState<string | null>(null);

  function runSearch(query: string) {
    setActiveQuery(query);
    setPreviewId(null);
    setState({ status: 'loading' });
    videoSearchProvider.search(query).then((outcome) => {
      if (outcome.ok) setState({ status: 'done', results: outcome.results });
      else setState({ status: 'error', message: outcome.message });
    });
  }

  useEffect(() => {
    runSearch(baseQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [technique.id]);

  function handleRefine() {
    const extra = refineInput.trim();
    // 사용자 조건을 기존 기술 정보(기본 검색어)와 결합 — spec section 4's
    // "기술 정보 + 사용자 조건" 결합. YouTube 자체 검색엔진이 한국어/영어가
    //섞인 자연어 조건을 그대로 처리할 수 있으므로 별도 AI 번역/재구성 없이
    // 문자열을 이어붙인다 (기존 buildYoutubeQuery 패턴과 동일한 방식).
    runSearch(extra ? `${baseQuery} ${extra}` : baseQuery);
  }

  return (
    <div className="card info-card">
      <h3>
        <span aria-hidden="true">🔎</span> 관련 영상 찾기
      </h3>
      <p className="video-status-message" style={{ margin: 0 }}>
        검색어: {activeQuery}
      </p>
      <div className="modal-actions modal-actions--start" style={{ marginTop: 8 }}>
        <input
          className="select"
          style={{ flex: 1 }}
          placeholder="예: 초보자에게 설명하는 영상으로 찾아줘"
          value={refineInput}
          onChange={(e) => setRefineInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRefine();
          }}
        />
        <button className="btn btn-secondary btn-sm" onClick={handleRefine}>
          다시 검색
        </button>
      </div>

      {state.status === 'loading' && <p className="video-status-message">영상을 검색하는 중...</p>}
      {state.status === 'error' && <p className="video-status-message">영상을 불러오지 못했습니다: {state.message}</p>}
      {state.status === 'done' && state.results.length === 0 && <p className="video-status-message">조건에 맞는 영상을 찾지 못했습니다. 조건을 바꿔 다시 검색해보세요.</p>}
      {state.status === 'done' && state.results.length > 0 && (
        <div className="video-embed-grid" style={{ marginTop: 8 }}>
          {state.results.map((v) =>
            previewId === v.videoId ? (
              <div key={v.videoId} className="video-embed">
                <div className="video-embed__frame-wrap">
                  <iframe
                    src={`https://www.youtube.com/embed/${v.videoId}?autoplay=1`}
                    title={v.title}
                    loading="lazy"
                    allow={IFRAME_ALLOW}
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
                <div className="video-embed__title">{v.title}</div>
                <div className="video-embed__channel">{v.channel}</div>
                <button className="btn btn-primary btn-sm" style={{ marginTop: 6 }} onClick={() => onSelect(v)}>
                  이 영상으로 저장
                </button>
              </div>
            ) : (
              <button key={v.videoId} className="video-search-result" onClick={() => setPreviewId(v.videoId)}>
                <div className="video-search-result__thumb-wrap">
                  <img src={v.thumbnailUrl} alt={v.title} className="video-search-result__thumb" loading="lazy" />
                  <span className="video-search-result__play" aria-hidden="true">
                    ▶
                  </span>
                </div>
                <div className="video-embed__title">{v.title}</div>
                <div className="video-embed__channel">{v.channel}</div>
              </button>
            )
          )}
        </div>
      )}

      <div className="modal-actions modal-actions--start" style={{ marginTop: 10 }}>
        <button className="btn btn-ghost" onClick={onClose}>
          취소
        </button>
      </div>
    </div>
  );
}
