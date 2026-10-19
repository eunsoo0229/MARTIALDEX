import { useEffect, useState } from 'react';
import type { CuratedVideo, Technique } from '../types';
import { getMartialArt } from '../lib/loadData';
import { buildYoutubeQuery } from '../lib/youtube';
import { openExternal, youtubeSearchUrl } from '../lib/externalLink';
import { videoSearchProvider } from '../lib/videoSearch/provider';
import { getCachedVideoSearch, setCachedVideoSearch } from '../lib/videoSearch/cache';
import type { VideoSearchItem } from '../lib/videoSearch/types';
import { addTechniqueVideo, getTechniqueVideos, isUserAddedVideo, LIMIT_MESSAGE, MAX_RELATED_VIDEOS, removeTechniqueVideo } from '../lib/techniqueVideo/service';
import YouTubeLite from './YouTubeLite';
import VideoPickerModal from './VideoPickerModal';
import { detectVideoStyle, STYLE_LABEL, videosForStyle, type GiNoGiRecord, type GrapplingStyle } from '../lib/grappling/giNoGi';

const IFRAME_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; results: VideoSearchItem[] }
  | { status: 'error'; message: string };

interface RelatedVideosProps {
  technique: Technique;
  /**
   * When true and the technique has no curated video, search YouTube live
   * (lazy, cached — see src/lib/videoSearch/) instead of only showing the
   * external "search on YouTube" link. Only enable this on a screen that
   * shows ONE technique at a time (e.g. the training screen) — turning it
   * on where several techniques render at once (e.g. a Day's full
   * technique list) would fire one search per technique instead of lazily,
   * one at a time.
   */
  liveSearchFallback?: boolean;
  /**
   * Grappling Gi / No-Gi tab: show only this style's videos (and ones tagged
   * for both); unclassified videos are listed separately, the other style's
   * are not shown. Absent = every video, as before.
   */
  style?: GrapplingStyle;
  styleRecord?: GiNoGiRecord;
}

export default function RelatedVideos({ technique, liveSearchFallback = false, style, styleRecord }: RelatedVideosProps) {
  // The user's own persisted pick (spec section 7) overlays the technique's
  // base curated/add_teq videos — never mutates `technique.videos` itself,
  // so this stays correct even for a technique shared across users (see
  // src/lib/techniqueVideo/types.ts's doc comment on why this is a
  // per-user overlay, not a write to the shared record).
  const [videoPickVersion, setVideoPickVersion] = useState(0);
  // Base videos + the user's added ones, de-duped, capped at 5.
  const allVideos = getTechniqueVideos(technique);
  const split = style && styleRecord ? videosForStyle(allVideos, style, styleRecord) : null;
  const videos = split ? split.shown : allVideos;
  const unclassified = split?.unknown ?? [];
  const canAdd = allVideos.length < MAX_RELATED_VIDEOS;
  const heading = style ? `${STYLE_LABEL[style]} 관련 영상` : '관련 영상';
  const [addMessage, setAddMessage] = useState<string | null>(null);
  const [searchState, setSearchState] = useState<SearchState>({ status: 'idle' });
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const onUpdate = () => setVideoPickVersion((v) => v + 1);
    window.addEventListener('martialdex:technique-video-picks-updated', onUpdate);
    return () => window.removeEventListener('martialdex:technique-video-picks-updated', onUpdate);
  }, []);
  // videoPickVersion is read only to force a re-render when a pick changes
  // elsewhere (e.g. cloud sync pulling one in) — referenced here so eslint
  // doesn't flag it as unused.
  void videoPickVersion;

  useEffect(() => {
    setPlayingId(null);

    if (!liveSearchFallback || videos.length > 0) {
      setSearchState({ status: 'idle' });
      return;
    }

    const cached = getCachedVideoSearch(technique.id);
    if (cached) {
      setSearchState({ status: 'done', results: cached });
      return;
    }

    let active = true;
    setSearchState({ status: 'loading' });
    const art = getMartialArt(technique.martialArt);
    const query = buildYoutubeQuery(technique, art);
    videoSearchProvider.search(query).then((outcome) => {
      if (!active) return;
      if (outcome.ok) {
        setCachedVideoSearch(technique.id, outcome.results);
        setSearchState({ status: 'done', results: outcome.results });
      } else {
        setSearchState({ status: 'error', message: outcome.message });
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [technique.id, liveSearchFallback, videos.length]);

  function handleVideoPicked(item: VideoSearchItem | CuratedVideo): boolean {
    // Style comes ONLY from the video's own title — never from which tab it was added in.
    const detected = style ? detectVideoStyle(item.title) : undefined;
    const picked: CuratedVideo = { title: item.title, videoId: item.videoId, channel: item.channel, ...(detected ? { style: detected } : {}) };
    const result = addTechniqueVideo(technique, picked);
    if (!result.ok) {
      setAddMessage(result.message);
      return false;
    }
    setAddMessage(
      style && detected && detected !== style && detected !== 'both'
        ? detected === 'unknown'
          ? `영상 제목에서 ${STYLE_LABEL[style]} 여부를 확인하지 못해 '스타일 미확인 영상'으로 저장했습니다.`
          : `영상 제목이 ${STYLE_LABEL[detected]} 영상이라 ${STYLE_LABEL[detected]} 탭에 저장했습니다.`
        : null
    );
    setPickerOpen(false);
    return true;
  }

  const unclassifiedList =
    unclassified.length > 0 ? (
      <details className="video-unclassified" data-testid="videos-unclassified" style={{ marginTop: 10 }}>
        <summary>스타일(Gi/No-Gi)이 확인되지 않은 영상 {unclassified.length}개</summary>
        <p className="video-status-message">영상 제목·설명에서 Gi인지 No-Gi인지 확인되지 않은 영상입니다. 어느 스타일의 영상으로도 표시하지 않습니다.</p>
        <div className="video-embed-grid">
          {unclassified.map((v) => (
            <div key={v.videoId} className="video-embed">
              <div className="video-embed__frame-wrap">
                <YouTubeLite videoId={v.videoId} title={v.title} />
              </div>
              <div className="video-embed__title">{v.title}</div>
              <div className="video-embed__channel">{v.channel}</div>
            </div>
          ))}
        </div>
      </details>
    ) : null;

  if (pickerOpen) {
    return (
      <VideoPickerModal
        technique={technique}
        existingVideoIds={allVideos.map((v) => v.videoId)}
        remainingSlots={MAX_RELATED_VIDEOS - allVideos.length}
        queryHint={style === 'gi' ? 'gi' : style === 'nogi' ? 'no gi' : undefined}
        onClose={() => setPickerOpen(false)}
        onSelect={handleVideoPicked}
      />
    );
  }

  if (videos.length > 0) {
    return (
      <div className="card info-card" data-testid="related-videos" data-style={style ?? ''}>
        <h3>
          <span aria-hidden="true">▶</span> {heading}
        </h3>
        <div className="video-embed-grid">
          {videos.map((v) => (
            <div key={v.videoId} className="video-embed">
              <div className="video-embed__frame-wrap">
                <YouTubeLite videoId={v.videoId} title={v.title} />
              </div>
              <div className="video-embed__title">{v.title}</div>
              <div className="video-embed__channel">{v.channel}</div>
              {isUserAddedVideo(technique.id, v.videoId) && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeTechniqueVideo(technique.id, v.videoId)}>
                  내가 추가한 영상 삭제
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="modal-actions modal-actions--start" style={{ marginTop: 10 }}>
          {canAdd ? (
            <button className="btn btn-secondary" data-testid="related-videos-add" onClick={() => setPickerOpen(true)}>
              ＋ {style ? `${STYLE_LABEL[style]} ` : ''}관련 영상 추가 ({allVideos.length}/{MAX_RELATED_VIDEOS})
            </button>
          ) : (
            <p className="video-status-message" data-testid="related-videos-limit" style={{ margin: 0 }}>
              {LIMIT_MESSAGE}
            </p>
          )}
        </div>
        {addMessage && <p className="video-status-message">{addMessage}</p>}
        {unclassifiedList}
      </div>
    );
  }

  if (!liveSearchFallback) {
    return (
      <div className="card info-card" data-testid="related-videos" data-style={style ?? ''}>
        <h3>
          <span aria-hidden="true">▶</span> {heading}
        </h3>
        <p className="video-status-message" data-testid={style ? 'style-videos-missing' : undefined}>
          {style
            ? `이 기술의 ${STYLE_LABEL[style]} 영상이 아직 등록되지 않았습니다(누락). 다른 스타일의 영상으로 대신하지 않습니다.`
            : '아직 이 기술에 등록된 영상이 없습니다. 관련 영상을 찾아 이 기술에 연결하거나, YouTube에서 직접 검색해볼 수 있습니다.'}
        </p>
        <div className="modal-actions modal-actions--start">
          <button className="btn btn-secondary" onClick={() => setPickerOpen(true)} disabled={!canAdd}>
            🔎 {style ? `${STYLE_LABEL[style]} ` : ''}관련 영상 찾기
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              const art = getMartialArt(technique.martialArt);
              openExternal(youtubeSearchUrl(`${buildYoutubeQuery(technique, art)}${style === 'gi' ? ' gi' : style === 'nogi' ? ' no gi' : ''}`));
            }}
          >
            ▶ YouTube에서 바로 보기
          </button>
        </div>
        {addMessage && <p className="video-status-message">{addMessage}</p>}
        {unclassifiedList}
      </div>
    );
  }

  return (
    <div className="card info-card">
      <h3>
        <span aria-hidden="true">🎥</span> 참고 영상
      </h3>
      {searchState.status === 'loading' && <p className="video-status-message">영상을 검색하는 중...</p>}
      {searchState.status === 'error' && <p className="video-status-message">영상을 불러오지 못했습니다.</p>}
      {searchState.status === 'done' && searchState.results.length === 0 && (
        <p className="video-status-message">관련 영상을 찾지 못했습니다.</p>
      )}
      {searchState.status === 'done' && searchState.results.length > 0 && (
        <>
          <p className="video-status-message">등록된 영상이 없어 YouTube에서 관련 영상을 찾았습니다. 마음에 드는 영상이 없다면 조건을 바꿔 다시 찾아볼 수 있습니다.</p>
          <div className="video-embed-grid">
            {searchState.results.map((v) =>
              playingId === v.videoId ? (
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
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => handleVideoPicked(v)}>
                    이 영상을 기술 영상으로 저장
                  </button>
                </div>
              ) : (
                <button key={v.videoId} className="video-search-result" onClick={() => setPlayingId(v.videoId)}>
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
        </>
      )}
      <div className="modal-actions modal-actions--start" style={{ marginTop: 10 }}>
        <button className="btn btn-secondary" onClick={() => setPickerOpen(true)}>
          📥 YouTube 영상 불러오기
        </button>
      </div>
    </div>
  );
}
