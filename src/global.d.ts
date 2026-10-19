import type { AskAiRequest, AskAiResult } from './lib/ai/types';
import type { VideoInfoOutcome, VideoSearchOutcome } from './lib/videoSearch/types';
import type { WebSearchOutcome } from './lib/webSearch/types';
import type { LocalSttApi } from './lib/voice/localSttTypes';
import type { LocalAskRequest, LocalAskResult, LocalModelStatus } from './lib/coachProvider/types';

declare global {
  interface Window {
    martialdex?: {
      openExternal: (url: string) => void;
      openInApp: (url: string) => void;
      askAi: (request: AskAiRequest) => Promise<AskAiResult>;
      /** MARTIALDEX 자체 AI 코치 — local Ollama model (Mac 앱 only, electron/ollama.cjs). Never Gemini. */
      localAi?: { status: () => Promise<LocalModelStatus>; ask: (request: LocalAskRequest) => Promise<LocalAskResult>; cancel?: (requestId: string) => Promise<boolean> };
      searchYoutube: (query: string) => Promise<VideoSearchOutcome>;
      requestMicAccess?: () => Promise<'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'>;
      /** 로컬 음성인식 (Mac 앱 only). */
      stt?: LocalSttApi;
      /** macOS camera permission (TCC) — asks once when not determined. */
      requestCameraAccess?: () => Promise<'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'>;
      openCameraSettings?: () => Promise<boolean>;
      getDeviceInfo?: () => Promise<{ deviceName: string; platform: string; appVersion: string }>;
      getYoutubeVideoInfo: (videoId: string) => Promise<VideoInfoOutcome>;
      webSearch: (query: string) => Promise<WebSearchOutcome>;
      saveVideo: (id: string, base64Data: string) => Promise<{ ok: true; path: string } | { ok: false; message: string }>;
      deleteVideo: (path: string) => Promise<{ ok: boolean; message?: string }>;
      revealVideo: (path: string) => void;
      openVideo: (path: string) => Promise<{ ok: boolean; message?: string }>;
      /** Read-only bytes of a saved recording inside the app's sparring-videos folder (스파링 분석 2.0). */
      readVideo?: (path: string) => Promise<{ ok: true; data: Uint8Array<ArrayBuffer> } | { ok: false; message: string }>;
      startPowerSaveBlocker: () => Promise<{ ok: boolean }>;
      stopPowerSaveBlocker: () => Promise<{ ok: boolean }>;
    };
  }
}
