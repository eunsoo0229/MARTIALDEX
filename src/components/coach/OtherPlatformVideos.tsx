import { useState } from 'react';
import { openExternal } from '../../lib/externalLink';
import { PLATFORM_LABEL, type PlatformVideo } from '../../lib/techniqueVideo/otherPlatformVideos';

const IFRAME_ALLOW = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';

/** Videos found on other platforms (YouTube had none): in-app player where the platform allows it, else a link. */
export default function OtherPlatformVideos({ videos, testId = 'other-videos' }: { videos: PlatformVideo[]; testId?: string }) {
  const [active, setActive] = useState(0);
  const cur = videos[Math.min(active, videos.length - 1)];
  if (!cur) return null;
  return (
    <div className="other-videos" data-testid={testId}>
      <p className="video-status-message" style={{ margin: '0 0 6px' }}>
        유튜브에서 맞는 영상을 찾지 못해 다른 영상 플랫폼에서 찾았습니다. 페이지 제목·설명에 오늘 배우는 내용이 언급된 영상만 보여 줍니다 (영상 내용을 AI가 확인한 것은 아닙니다).
      </p>
      <div className="coach-video-list">
        {videos.map((v, i) => (
          <button key={v.url} type="button" className={`chip${i === active ? ' active' : ''}`} onClick={() => setActive(i)} data-testid={`${testId}-chip`} data-platform={v.platform}>
            {PLATFORM_LABEL[v.platform]} {i + 1}
          </button>
        ))}
      </div>
      <div className="video-embed" data-testid={`${testId}-player`} data-platform={cur.platform} data-embed={cur.embedUrl ? 'yes' : 'no'}>
        {cur.embedUrl ? (
          <div className="video-embed__frame-wrap">
            <iframe src={cur.embedUrl} title={cur.title} allow={IFRAME_ALLOW} referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
          </div>
        ) : (
          <div className="other-videos__link">
            {PLATFORM_LABEL[cur.platform]}은(는) 앱 안에서 재생할 수 없어 새 창에서 열어야 합니다.
          </div>
        )}
        <div className="video-embed__title">
          [{PLATFORM_LABEL[cur.platform]}] {cur.title}
        </div>
        <p className="video-status-message" style={{ margin: '4px 0 0' }}>
          {cur.reason} ·{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openExternal(cur.url)} data-testid={`${testId}-open`}>
            새 창에서 보기 ↗
          </button>
        </p>
      </div>
    </div>
  );
}
