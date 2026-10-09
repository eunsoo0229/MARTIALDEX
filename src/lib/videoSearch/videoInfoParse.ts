import type { VideoInfo } from './types';

// Pure parsing of YouTube's own player-response JSON — the TS twin of
// electron/youtubeSearch.cjs's infoFromPlayerResponse (keep in sync). Used
// by the Android on-device transport, which fetches from the phone itself.
export const PLAYER_ENDPOINT = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
export const PLAYER_CLIENT = { clientName: 'WEB', clientVersion: '2.20240726.00.00', hl: 'en', gl: 'US' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function infoFromPlayerResponse(videoId: string, data: any): VideoInfo | null {
  const details = data?.videoDetails;
  const status = data?.playabilityStatus?.status as string | undefined;
  if (!details || details.videoId !== videoId) return null;
  const micro = data.microformat?.playerMicroformatRenderer ?? {};
  return {
    videoId,
    title: details.title ?? '',
    channel: details.author ?? '',
    description: String(details.shortDescription ?? '').slice(0, 4000),
    lengthSeconds: Number(details.lengthSeconds) || 0,
    keywords: Array.isArray(details.keywords) ? details.keywords.slice(0, 40) : [],
    category: micro.category ?? null,
    // Streaming eligibility is not existence — only ERROR means gone/private.
    playable: status !== 'ERROR',
  };
}

export function infoFromWatchHtml(videoId: string, html: string): VideoInfo | null {
  const match = html.match(/var ytInitialPlayerResponse = (\{.*?\});(?:var |<\/script>)/s);
  if (!match) return null;
  try {
    return infoFromPlayerResponse(videoId, JSON.parse(match[1]));
  } catch {
    return null;
  }
}
