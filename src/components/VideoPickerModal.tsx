import { useEffect, useState } from 'react';
import type { Technique } from '../types';
import { getMartialArt } from '../lib/loadData';
import { buildYoutubeQuery } from '../lib/youtube';
import { videoSearchProvider } from '../lib/videoSearch/provider';
import type { VideoSearchItem } from '../lib/videoSearch/types';
import { verifyTechniqueVideoUrl, type VideoVerificationResult } from '../lib/techniqueVideo/urlVerification';
import { LIMIT_MESSAGE } from '../lib/techniqueVideo/service';

const IFRAME_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

type SearchState =
  | { status: 'loading' }
  | { status: 'done'; results: VideoSearchItem[] }
  | { status: 'error'; message: string };

interface VideoPickerModalProps {
  technique: Technique;
  /** videoIds already shown for this technique (base + user) — marked and not re-addable. */
  existingVideoIds?: string[];
  /** How many more can be added before the 5-video cap. */
  remainingSlots?: number;
  onClose: () => void;
  /** Returns false when the add was refused (cap/duplicate) so the picker stays open. */
  onSelect: (item: VideoSearchItem | { title: string; videoId: string; channel: string }) => boolean | void;
}

type Method = 'search' | 'url';

/**
 * Spec sections 3-6's "관련 영상 찾기 / YouTube 영상 불러오기" search-and-pick
 * flow — a single shared component so the technique-detail screen and every
 * training screen (both already render RelatedVideos, which owns this
 * modal) get identical behavior instead of two parallel implementations.
 * Search-only here; YouTube search and any web/Tavily search stay separate
 * concerns (this never calls webSearchProvider) — the "자연어 조건" input
 * below only ever refines the YouTube query text itself.
 */
export default function VideoPickerModal({ technique, existingVideoIds = [], remainingSlots = 1, onClose, onSelect }: VideoPickerModalProps) {
  const [method, setMethod] = useState<Method>('search');
  const full = remainingSlots <= 0;
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
      <div className="chip-row" style={{ marginBottom: 8 }} role="tablist">
        <button type="button" role="tab" aria-selected={method === 'search'} className={`chip${method === 'search' ? ' active' : ''}`} onClick={() => setMethod('search')}>
          AI가 관련 영상 검색
        </button>
        <button type="button" role="tab" aria-selected={method === 'url'} className={`chip${method === 'url' ? ' active' : ''}`} onClick={() => setMethod('url')}>
          YouTube URL 직접 추가
        </button>
      </div>
      {full && <p className="video-status-message">{LIMIT_MESSAGE}</p>}
      {method === 'url' ? (
        <UrlVerifyPanel technique={technique} existingVideoIds={existingVideoIds} disabled={full} onAdd={onSelect} />
      ) : (
      <>
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
                {existingVideoIds.includes(v.videoId) ? (
                  <p className="video-status-message" style={{ margin: '6px 0 0' }}>이미 등록된 영상입니다.</p>
                ) : (
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 6 }} disabled={full} onClick={() => onSelect(v)}>
                    이 영상으로 저장
                  </button>
                )}
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
      </>
      )}

      <div className="modal-actions modal-actions--start" style={{ marginTop: 10 }}>
        <button className="btn btn-ghost" onClick={onClose}>
          취소
        </button>
      </div>
    </div>
  );
}

type VerifyState = { status: 'idle' } | { status: 'checking' } | { status: 'done'; result: VideoVerificationResult };

function UrlVerifyPanel({
  technique,
  existingVideoIds,
  disabled,
  onAdd,
}: {
  technique: Technique;
  existingVideoIds: string[];
  disabled: boolean;
  onAdd: VideoPickerModalProps['onSelect'];
}) {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<VerifyState>({ status: 'idle' });

  async function handleVerify() {
    if (!url.trim()) return;
    setState({ status: 'checking' });
    const result = await verifyTechniqueVideoUrl(technique, url);
    setState({ status: 'done', result });
  }

  const result = state.status === 'done' ? state.result : null;
  const duplicate = !!result?.videoId && existingVideoIds.includes(result.videoId);

  return (
    <div data-testid="video-url-panel">
      <p className="video-status-message" style={{ margin: 0 }}>
        영상 주소를 붙여 넣으면 AI가 영상 정보(제목·설명·키워드)를 확인해 이 기술과 같은 기술인지 검증합니다. 확인된 영상만 추가할 수 있습니다.
      </p>
      <div className="modal-actions modal-actions--start" style={{ marginTop: 8 }}>
        <input
          className="select"
          style={{ flex: 1 }}
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setState({ status: 'idle' });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleVerify();
          }}
        />
        <button className="btn btn-secondary btn-sm" disabled={disabled || state.status === 'checking' || !url.trim()} onClick={() => void handleVerify()}>
          검증하기
        </button>
      </div>
      {state.status === 'checking' && <p className="video-status-message">영상 정보를 확인하고 AI가 검증하는 중...</p>}
      {result && (
        <div className={`video-verify-result is-${result.verdict.toLowerCase()}`} data-testid="video-verify-result" data-verdict={result.verdict}>
          {result.info && (
            <p style={{ margin: '0 0 4px' }}>
              <strong>{result.info.title}</strong> <span className="video-status-message">· {result.info.channel}</span>
            </p>
          )}
          {result.verdict === 'VERIFIED' && <p style={{ margin: 0 }}>✅ 이 영상은 현재 기술과 관련된 영상으로 확인되었습니다.</p>}
          {result.verdict === 'NOT_MATCHED' && <p style={{ margin: 0 }}>❌ 현재 기술과 일치하는 영상으로 확인되지 않았습니다.</p>}
          {result.verdict === 'INSUFFICIENT_EVIDENCE' && <p style={{ margin: 0 }}>⚠️ 영상 내용을 충분히 확인할 수 없어 자동 등록할 수 없습니다.</p>}
          {result.reason && <p className="video-status-message" style={{ margin: '4px 0 0' }}>{result.reason}</p>}
          {result.verdict === 'VERIFIED' && result.videoId && result.info && (
            duplicate ? (
              <p className="video-status-message">이미 등록된 영상입니다.</p>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                style={{ marginTop: 6 }}
                disabled={disabled}
                onClick={() => onAdd({ title: result.info!.title, videoId: result.videoId!, channel: result.info!.channel })}
              >
                영상 추가
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
