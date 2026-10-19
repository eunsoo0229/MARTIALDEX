import { useState } from 'react';
import { openExternal } from '../../lib/externalLink';
import type { LessonVideoResult } from '../../lib/coachLesson/lessonVideos';
import OtherPlatformVideos from './OtherPlatformVideos';

const IFRAME_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

/**
 * 수업 영상 — only videos actually found and checked for this lesson. Shows
 * searching / none / failed honestly; plays inside the app (YouTube embed)
 * with a link to the original as a fallback.
 */
export default function LessonVideoPanel(props: { result: LessonVideoResult | null; progress: string | null; highlight?: boolean; onRetry: () => void; title?: string; testId?: string; subject?: string }) {
  const subject = props.subject ?? '수업 주제';
  const { result } = props;
  const [active, setActive] = useState<string | null>(null);
  const videos = result?.videos ?? [];
  const current = videos.find((v) => v.videoId === active) ?? videos[0];
  const status = !result ? 'searching' : result.status;

  return (
    <div className={`card info-card lesson-videos${props.highlight ? ' lesson-videos--now' : ''}`} data-testid={props.testId ?? 'lesson-videos'} data-status={status} data-count={videos.length + (result?.otherVideos?.length ?? 0)}>
      <h3 style={{ marginTop: 0 }}>{props.title ?? '▶ 수업 영상'}</h3>
      {status === 'searching' && (
        <p className="video-status-message" data-testid="lesson-videos-searching">
          <span className="spinner" /> {props.progress ?? `${subject}에 맞는 영상을 찾는 중입니다…`}
        </p>
      )}
      {status === 'none' && (
        <p className="video-status-message" data-testid="lesson-videos-none">
          {result!.message ?? `${subject}와 맞는 영상을 찾지 못했습니다.`} 영상 없이도 계속 진행할 수 있습니다.
        </p>
      )}
      {status === 'error' && (
        <div data-testid="lesson-videos-error">
          <p className="ai-inline-warning" style={{ margin: 0 }}>
            영상 검색에 실패했습니다: {result!.message}
          </p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={props.onRetry} style={{ marginTop: 6 }}>
            다시 검색
          </button>
        </div>
      )}
      {!current && result?.otherVideos && result.otherVideos.length > 0 && <OtherPlatformVideos videos={result.otherVideos} testId="lesson-other-videos" />}
      {current && (
        <>
          <div className="lesson-videos__list">
            {videos.map((v) => (
              <button key={v.videoId} type="button" className={`lesson-video-item${current.videoId === v.videoId ? ' active' : ''}`} onClick={() => setActive(v.videoId)} data-testid="lesson-video-item" data-video-id={v.videoId} data-source={v.source}>
                <img src={v.thumbnailUrl} alt="" loading="lazy" />
                <span className="lesson-video-item__text">
                  <strong>{v.title}</strong>
                  <span>{v.channel}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="video-embed" data-testid="lesson-video-player" data-video-id={current.videoId}>
            <div className="video-embed__frame-wrap">
              <iframe src={`https://www.youtube.com/embed/${current.videoId}`} title={current.title} allow={IFRAME_ALLOW} referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
            </div>
            <div className="video-embed__title">{current.title}</div>
            <p className="video-status-message" style={{ margin: '4px 0 0' }}>
              {current.channel} · {current.source === 'saved' ? 'MARTIALDEX에 등록된 영상' : `영상 정보를 확인해 ${subject}와 맞는 교육 영상으로 판단했습니다${current.reason ? ` (${current.reason})` : ''}`}{' '}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => openExternal(current.url)} data-testid="lesson-video-open">
                YouTube에서 열기
              </button>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
