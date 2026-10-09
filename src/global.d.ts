import type { AskAiRequest, AskAiResult } from './lib/ai/types';
import type { VideoInfoOutcome, VideoSearchOutcome } from './lib/videoSearch/types';
import type { WebSearchOutcome } from './lib/webSearch/types';

declare global {
  interface Window {
    martialdex?: {
      openExternal: (url: string) => void;
      openInApp: (url: string) => void;
      askAi: (request: AskAiRequest) => Promise<AskAiResult>;
      searchYoutube: (query: string) => Promise<VideoSearchOutcome>;
      requestMicAccess?: () => Promise<'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'>;
      getDeviceInfo?: () => Promise<{ deviceName: string; platform: string; appVersion: string }>;
      getYoutubeVideoInfo: (videoId: string) => Promise<VideoInfoOutcome>;
      webSearch: (query: string) => Promise<WebSearchOutcome>;
      saveVideo: (id: string, base64Data: string) => Promise<{ ok: true; path: string } | { ok: false; message: string }>;
      deleteVideo: (path: string) => Promise<{ ok: boolean; message?: string }>;
      revealVideo: (path: string) => void;
      openVideo: (path: string) => Promise<{ ok: boolean; message?: string }>;
      startPowerSaveBlocker: () => Promise<{ ok: boolean }>;
      stopPowerSaveBlocker: () => Promise<{ ok: boolean }>;
    };
  }
}
