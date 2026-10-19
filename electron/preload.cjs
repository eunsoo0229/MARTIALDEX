const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('martialdex', {
  // shell isn't available to a sandboxed preload's require('electron'), so
  // this is forwarded to main.cjs, which does the actual shell.openExternal.
  openExternal: (url) => {
    ipcRenderer.send('shell:open-external', url);
  },
  // Opens a link in a second MARTIALDEX (Electron) window instead of the
  // OS's separate default browser app — see main.cjs's 'shell:open-in-app'.
  openInApp: (url) => {
    ipcRenderer.send('shell:open-in-app', url);
  },
  // Forwards to the main process, which is the only place that ever holds
  // GEMINI_API_KEY. The renderer only ever sees plain text in and out.
  askAi: (request) => ipcRenderer.invoke('ai:ask', request),
  // MARTIALDEX 자체 AI 코치: the local Ollama model on 127.0.0.1 (electron/ollama.cjs) — never Gemini.
  localAi: {
    status: () => ipcRenderer.invoke('localai:status'),
    ask: (request) => ipcRenderer.invoke('localai:ask', request),
    cancel: (requestId) => ipcRenderer.invoke('localai:cancel', requestId),
  },
  // Forwards to the main process, which does the actual youtube.com fetch
  // (no API key involved — see electron/youtubeSearch.cjs).
  searchYoutube: (query) => ipcRenderer.invoke('youtube:search', query),
  // Single-video metadata (title/channel/description) for URL verification.
  requestMicAccess: () => ipcRenderer.invoke('media:mic-access'),
  // 로컬 음성인식 (whisper.cpp in the main process — electron/localStt.cjs).
  stt: {
    status: (model) => ipcRenderer.invoke('stt:status', model),
    download: (model) => ipcRenderer.invoke('stt:download', model),
    cancelDownload: () => ipcRenderer.invoke('stt:cancel-download'),
    deleteModel: (model) => ipcRenderer.invoke('stt:delete-model', model),
    warmUp: (model) => ipcRenderer.invoke('stt:warm-up', model),
    transcribe: (wav, opts) => ipcRenderer.invoke('stt:transcribe', { wav, model: opts?.model, prompt: opts?.prompt, audioCtx: opts?.audioCtx }),
    onDownloadProgress: (cb) => {
      const listener = (_e, p) => cb(p);
      ipcRenderer.on('stt:download-progress', listener);
      return () => ipcRenderer.removeListener('stt:download-progress', listener);
    },
  },
  requestCameraAccess: () => ipcRenderer.invoke('media:camera-access'),
  openCameraSettings: () => ipcRenderer.invoke('media:open-camera-settings'),
  getDeviceInfo: () => ipcRenderer.invoke('device:info'),
  getYoutubeVideoInfo: (videoId) => ipcRenderer.invoke('youtube:video-info', videoId),
  // Forwards to the main process, which is the only place that ever holds
  // TAVILY_API_KEY — see electron/webSearch.cjs.
  webSearch: (query) => ipcRenderer.invoke('websearch:search', query),
  // Sparring video recording save/delete — see main.cjs's handlers.
  saveVideo: (id, base64Data) => ipcRenderer.invoke('video:save', { id, base64Data }),
  deleteVideo: (path) => ipcRenderer.invoke('video:delete', { path }),
  revealVideo: (path) => ipcRenderer.send('video:reveal', path),
  openVideo: (path) => ipcRenderer.invoke('video:open', path),
  readVideo: (path) => ipcRenderer.invoke('video:read', path),
  // Keeps the display awake while actively recording — see main.cjs's
  // powerSaveBlocker handlers.
  startPowerSaveBlocker: () => ipcRenderer.invoke('power-save-blocker:start'),
  stopPowerSaveBlocker: () => ipcRenderer.invoke('power-save-blocker:stop'),
});
