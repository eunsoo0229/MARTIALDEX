import { useState } from 'react';

const IFRAME_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

/**
 * A YouTube video that costs one thumbnail image until it's tapped. A real embed loads
 * YouTube's player (~1 MB of script + its own layout/decoding) per video — a technique page
 * with several of them was the heaviest thing on phones. Tap → the real player, autoplaying.
 */
export default function YouTubeLite({ videoId, title }: { videoId: string; title: string }) {
  const [play, setPlay] = useState(false);
  if (play) {
    return <iframe src={`https://www.youtube.com/embed/${videoId}?autoplay=1`} title={title} allow={IFRAME_ALLOW} referrerPolicy="strict-origin-when-cross-origin" allowFullScreen data-testid="youtube-player" />;
  }
  return (
    <button type="button" className="youtube-lite" onClick={() => setPlay(true)} aria-label={`${title} 재생`} data-testid="youtube-lite" data-video-id={videoId}>
      <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" />
      <span className="youtube-lite__play" aria-hidden="true">▶</span>
    </button>
  );
}
