const { app, BrowserWindow, ipcMain, session, shell, powerSaveBlocker } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const isDev = !app.isPackaged;

// In dev, `.env` sits at the project root, one directory above this file —
// __dirname/../.env resolves correctly there.
//
// Once packaged, a single "next to the app" guess isn't reliable enough:
// a macOS user very commonly runs the app straight out of the mounted DMG
// without dragging MARTIALDEX.app to Applications/Desktop first — and a
// mounted DMG volume is READ-ONLY, so a `.env` literally cannot be saved
// there no matter how clearly the app explains where "next to the app" is.
// (The first fix for this only tried .../Contents/MacOS/MARTIALDEX -> up 3
// levels -> the app's containing folder, which works once the app has
// actually been moved somewhere writable, but not from an unmoved DMG.)
//
// So this checks, in order, every location a user might reasonably have
// placed .env, and uses the first one that actually exists:
//   1. app.getPath('userData') — a fixed, always-writable, per-app folder
//      Electron itself manages (macOS: ~/Library/Application Support/
//      MARTIALDEX/), unaffected by where the .app currently sits. This is
//      the recommended location and the one shown in the "not configured"
//      error message.
//   2. The folder containing the .app bundle (previous fix's location) —
//      kept for anyone who already placed .env there or prefers it.
//   3. (dev only) the project root.
// If NONE exist yet, resolveEnvPath() still returns the userData path (#1)
// so dotenv's "file doesn't exist" is a safe no-op and the error message
// below points at a location the user can actually write to.
function candidateEnvPaths() {
  if (!isDev) {
    const candidates = [path.join(app.getPath('userData'), '.env')];
    if (process.platform === 'darwin') {
      // .../MARTIALDEX.app/Contents/MacOS/MARTIALDEX -> up 3 -> folder containing the .app
      candidates.push(path.join(path.dirname(app.getPath('exe')), '..', '..', '..', '.env'));
    } else {
      candidates.push(path.join(path.dirname(app.getPath('exe')), '.env'));
    }
    return candidates;
  }
  return [path.join(__dirname, '..', '.env')];
}

function resolveEnvPath() {
  const candidates = candidateEnvPaths();
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
}

const resolvedEnvPath = resolveEnvPath();
require('dotenv').config({ path: resolvedEnvPath });
// Exposed so gemini.cjs's "API key not configured" message can tell the
// user exactly which path was actually checked, instead of a generic hint.
process.env.MARTIALDEX_ENV_PATH = resolvedEnvPath;
const { askGemini } = require('./gemini.cjs');
const { searchYoutube } = require('./youtubeSearch.cjs');
const { webSearch } = require('./webSearch.cjs');

ipcMain.handle('ai:ask', async (_event, request) => {
  if (!request || typeof request.question !== 'string' || !request.question.trim()) {
    return { ok: false, code: 'UNKNOWN', message: '질문 내용이 비어 있습니다.' };
  }
  try {
    return await askGemini(request);
  } catch {
    return { ok: false, code: 'UNKNOWN', message: 'AI 요청 중 알 수 없는 오류가 발생했습니다.' };
  }
});

ipcMain.handle('websearch:search', async (_event, query) => {
  try {
    return await webSearch(query);
  } catch {
    return { ok: false, code: 'UNKNOWN', message: '외부 검색 중 알 수 없는 오류가 발생했습니다.' };
  }
});

ipcMain.handle('youtube:search', async (_event, query) => {
  try {
    return await searchYoutube(query);
  } catch {
    return { ok: false, code: 'UNKNOWN', message: '영상 검색 중 알 수 없는 오류가 발생했습니다.' };
  }
});

// Sparring video recordings — saved under userData (deleted automatically
// if the app is uninstalled, same lifecycle as every other local-only
// piece of data this app keeps). Only ever written when the renderer
// explicitly calls this after the user taps "저장" on a just-recorded clip
// (see src/lib/sparringVideo/storage.ts) — never on a timer, never
// silently. base64 in (renderer-side MediaRecorder blobs are read via
// FileReader before crossing the IPC boundary, since Blobs themselves
// aren't structured-cloneable across contextBridge) / a plain absolute
// path back out, which the renderer turns into a `file://` <video src>.
const SPARRING_VIDEOS_DIR = path.join(app.getPath('userData'), 'sparring-videos');

ipcMain.handle('video:save', async (_event, { id, base64Data }) => {
  try {
    if (!id || typeof base64Data !== 'string') {
      return { ok: false, message: '저장할 영상 데이터가 없습니다.' };
    }
    fs.mkdirSync(SPARRING_VIDEOS_DIR, { recursive: true });
    const filePath = path.join(SPARRING_VIDEOS_DIR, `${id}.webm`);
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    return { ok: true, path: filePath };
  } catch {
    return { ok: false, message: '영상 저장 중 오류가 발생했습니다.' };
  }
});

ipcMain.handle('video:delete', async (_event, { path: filePath }) => {
  // The path-prefix check used to let a mismatched path fall through to
  // `return { ok: true }` below with the fs.rmSync call simply skipped —
  // i.e. "nothing was deleted" reported as success, which is exactly how a
  // real bug here could hide: storage.ts's caller had no way to tell "the
  // file is genuinely gone" apart from "we silently didn't even try."
  if (typeof filePath !== 'string' || !filePath.startsWith(SPARRING_VIDEOS_DIR)) {
    return { ok: false, message: '삭제할 파일의 경로가 올바르지 않습니다.' };
  }
  try {
    fs.rmSync(filePath, { force: true }); // force: true already makes a missing file a no-op success, not a thrown error
    return { ok: true };
  } catch {
    return { ok: false, message: '영상 삭제 중 오류가 발생했습니다.' };
  }
});

// "위치 열기" — reveals the saved clip in Finder/Explorer. Same path-prefix
// safety check as video:delete above (never lets the renderer point this at
// an arbitrary filesystem path).
ipcMain.on('video:reveal', (_event, filePath) => {
  if (typeof filePath === 'string' && filePath.startsWith(SPARRING_VIDEOS_DIR)) {
    shell.showItemInFolder(filePath);
  }
});

// Desktop's closest equivalent of "갤러리에서 보기" — there's no OS photo/video
// gallery app concept on Windows/macOS the way there is on Android, so this
// opens the clip with whatever the user's OS has registered as the default
// video player (QuickTime/Photos on macOS, Movies & TV on Windows, etc.),
// same path-prefix safety check as the handlers above. Never copies/moves
// the file — shell.openPath just launches an app pointed at the existing path.
ipcMain.handle('video:open', async (_event, filePath) => {
  if (typeof filePath !== 'string' || !filePath.startsWith(SPARRING_VIDEOS_DIR)) {
    return { ok: false, message: '잘못된 파일 경로입니다.' };
  }
  try {
    const errorMessage = await shell.openPath(filePath);
    // shell.openPath resolves with an empty string on success, or a
    // human-readable error string on failure — it never rejects/throws.
    if (errorMessage) return { ok: false, message: '영상을 열 수 있는 앱을 찾지 못했습니다.' };
    return { ok: true };
  } catch {
    return { ok: false, message: '영상을 여는 중 오류가 발생했습니다.' };
  }
});

// Keeps the display from sleeping while a sparring recording is running
// (spec: "화면이 꺼져도 촬영 가능") — only ever active between an explicit
// video:power-save-blocker:start and :stop call from SparringRecord.tsx (start
// on "촬영 시작", stop on pause/stop/discard/unmount), never left running
// otherwise. 'prevent-display-sleep' (not 'prevent-app-suspension') is the
// correct level here: it stops the SCREEN from turning off, which is what
// actually matters for an unattended tripod-mounted recording — the
// renderer process itself already keeps running in the background
// regardless (Electron doesn't suspend hidden/minimized windows the way a
// mobile OS does), so there's nothing else to additionally keep alive.
let activePowerSaveBlockerId = null;
ipcMain.handle('power-save-blocker:start', () => {
  if (activePowerSaveBlockerId !== null && powerSaveBlocker.isStarted(activePowerSaveBlockerId)) {
    return { ok: true };
  }
  activePowerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  return { ok: true };
});
ipcMain.handle('power-save-blocker:stop', () => {
  if (activePowerSaveBlockerId !== null) {
    powerSaveBlocker.stop(activePowerSaveBlockerId);
    activePowerSaveBlockerId = null;
  }
  return { ok: true };
});

// A sandboxed preload can't call shell.openExternal itself (shell isn't in
// the module allowlist available to require('electron') under sandbox:
// true), so the renderer's "open in browser" action is routed through main
// via IPC instead.
ipcMain.on('shell:open-external', (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) {
    shell.openExternal(url);
  }
});

// "게시물 링크를 앱 안에서 바로 열기" — a second native BrowserWindow of THIS
// same Electron app (never shell.openExternal, which would hand the link off
// to the OS's separate default browser application). One window is reused
// across clicks (loadURL on the same window) rather than piling up new
// windows per link.
let inAppBrowserWindow = null;
ipcMain.on('shell:open-in-app', (_event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return;
  if (inAppBrowserWindow && !inAppBrowserWindow.isDestroyed()) {
    inAppBrowserWindow.loadURL(url);
    inAppBrowserWindow.focus();
    return;
  }
  inAppBrowserWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    title: 'MARTIALDEX',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  inAppBrowserWindow.setMenuBarVisibility(false);
  inAppBrowserWindow.loadURL(url);
  inAppBrowserWindow.on('closed', () => {
    inAppBrowserWindow = null;
  });
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#111318',
    title: 'MARTIALDEX',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Any link that tries to open a new window (target=_blank, window.open)
  // is sent to the user's default browser instead of a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'));
  }
}

app.whenReady().then(() => {
  // The pose-analysis feature needs the camera. Electron denies all
  // getUserMedia requests unless the app explicitly allows them here — the
  // user still sees (and must accept) the OS-level camera permission
  // prompt; this only lets that prompt happen instead of Electron silently
  // refusing it. 'clipboard-sanitized-write' is what navigator.clipboard.
  // writeText() checks (curriculum share-code copy button) — allowed
  // read-only... write-only, rather: 'clipboard-read' stays denied since
  // nothing in the app needs to read the system clipboard. Nothing else
  // (geolocation, notifications, etc.) is allowed. Must run after
  // whenReady() — session.defaultSession throws if accessed any earlier.
  const ALLOWED_PERMISSIONS = new Set(['media', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => ALLOWED_PERMISSIONS.has(permission));

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
