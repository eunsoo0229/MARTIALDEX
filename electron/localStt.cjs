// 로컬 음성인식 (Mac 앱) — whisper.cpp `whisper-server` running on THIS
// machine. The renderer records the mic, cuts speech into short segments and
// sends each (16 kHz mono WAV) here; this module hands it to a whisper-server
// child process bound to 127.0.0.1 and returns the text. Nothing about the
// audio or the transcript leaves the machine — the ONLY network use is the
// one-time model download the user starts explicitly. No API key, no usage
// quota, no per-use cost.
//
// Model files live in <userData>/stt-models/. A download goes to a .part
// file and is accepted only when its size AND sha256 match the published
// values; a model that later fails to load is re-verified and, if damaged,
// deleted so the UI offers the download again.

const { app } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

/** Published whisper.cpp models (huggingface.co/ggerganov/whisper.cpp). */
const MODELS = {
  'small-q5_1': {
    file: 'ggml-small-q5_1.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin',
    size: 190085487,
    sha256: 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb',
    label: '기본 (small · 190MB, 한국어 정확도 좋음)',
  },
  'base-q5_1': {
    file: 'ggml-base-q5_1.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
    size: 59707625,
    sha256: '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898',
    label: '가벼움 (base · 60MB, 빠르지만 덜 정확)',
  },
};
const DEFAULT_MODEL = 'small-q5_1';
const IDLE_SHUTDOWN_MS = 10 * 60 * 1000; // frees ~300 MB when voice input isn't used for a while
const START_TIMEOUT_MS = 30000;

const modelDir = () => path.join(app.getPath('userData'), 'stt-models');
const modelPath = (id) => path.join(modelDir(), MODELS[id].file);
const binaryPath = () => path.join(__dirname, 'vendor', 'whisper', 'whisper-server');

let server = null; // { proc, port, model, ready: Promise, lastUse }
let idleTimer = null;
let queue = Promise.resolve(); // one inference at a time
let download = null; // { id, req, cancelled }
const corruptDeleted = new Set(); // models deleted because they were damaged — the reason is kept until a new download

function knownModel(id) {
  return Object.prototype.hasOwnProperty.call(MODELS, id) ? id : DEFAULT_MODEL;
}

function status(id) {
  const m = knownModel(id);
  const p = modelPath(m);
  let size = 0;
  try {
    size = fs.statSync(p).size;
  } catch {}
  const bin = binaryPath();
  return {
    engineAvailable: fs.existsSync(bin),
    model: m,
    models: Object.entries(MODELS).map(([k, v]) => ({ id: k, label: v.label, sizeBytes: v.size, downloaded: fileComplete(k) })),
    downloaded: size === MODELS[m].size,
    partial: size > 0 && size !== MODELS[m].size,
    sizeBytes: MODELS[m].size,
    path: p,
    downloading: download ? download.id : null,
    serverRunning: !!(server && server.model === m),
  };
}

function fileComplete(id) {
  try {
    return fs.statSync(modelPath(id)).size === MODELS[id].size;
  } catch {
    return false;
  }
}

function sha256File(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(p)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')));
  });
}

function get(url, onResponse, onError, redirects = 0) {
  const req = https.get(url, { headers: { 'User-Agent': 'MARTIALDEX' } }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
      res.resume();
      const next = new URL(res.headers.location, url).toString();
      download && (download.req = get(next, onResponse, onError, redirects + 1));
      return;
    }
    onResponse(res);
  });
  req.on('error', onError);
  return req;
}

/** Downloads (or re-downloads) a model; `onProgress(received, total)`. Resolves { ok } or { ok:false, code, message }. */
function downloadModel(id, onProgress) {
  const m = knownModel(id);
  if (download) return Promise.resolve({ ok: false, code: 'BUSY', message: '이미 모델을 내려받는 중입니다.' });
  const spec = MODELS[m];
  fs.mkdirSync(modelDir(), { recursive: true });
  const part = modelPath(m) + '.part';
  try {
    fs.rmSync(part, { force: true });
  } catch {}
  return new Promise((resolve) => {
    download = { id: m, req: null, cancelled: false };
    const finish = (r) => {
      download = null;
      resolve(r);
    };
    const fail = (message, code = 'DOWNLOAD_FAILED') => {
      try {
        fs.rmSync(part, { force: true });
      } catch {}
      finish({ ok: false, code, message });
    };
    download.req = get(
      spec.url,
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return fail(`모델 서버 응답 오류 (HTTP ${res.statusCode})`);
        }
        const out = fs.createWriteStream(part);
        let received = 0;
        let lastSent = 0;
        res.on('data', (chunk) => {
          if (download?.cancelled) return;
          received += chunk.length;
          const now = Date.now();
          if (now - lastSent > 200) {
            lastSent = now;
            onProgress?.(received, spec.size);
          }
        });
        res.on('error', () => fail('내려받는 중 연결이 끊어졌습니다.'));
        res.pipe(out);
        out.on('error', () => fail('모델 파일을 저장하지 못했습니다 (디스크 공간을 확인해 주세요).'));
        out.on('finish', async () => {
          if (download?.cancelled) return fail('내려받기를 취소했습니다.', 'CANCELLED');
          onProgress?.(received, spec.size);
          if (received !== spec.size) return fail(`내려받은 크기가 맞지 않습니다 (${received} / ${spec.size} 바이트).`, 'CORRUPT');
          const digest = await sha256File(part).catch(() => '');
          if (digest !== spec.sha256) return fail('내려받은 파일이 손상되었습니다 (해시 불일치). 다시 내려받아 주세요.', 'CORRUPT');
          stopServer();
          fs.renameSync(part, modelPath(m));
          corruptDeleted.delete(m);
          finish({ ok: true });
        });
      },
      (e) => fail(`내려받지 못했습니다: ${e.message} (인터넷 연결을 확인해 주세요)`),
    );
  });
}

function cancelDownload() {
  if (!download) return false;
  download.cancelled = true;
  try {
    download.req?.destroy();
  } catch {}
  return true;
}

function deleteModel(id) {
  const m = knownModel(id);
  if (server?.model === m) stopServer();
  try {
    fs.rmSync(modelPath(m), { force: true });
    fs.rmSync(modelPath(m) + '.part', { force: true });
  } catch {}
  return status(m);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function ping(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1000 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function stopServer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (server) {
    try {
      server.proc.kill();
    } catch {}
  }
  server = null;
}

function armIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(stopServer, IDLE_SHUTDOWN_MS);
}

async function ensureServer(m) {
  if (server && server.model === m && !server.proc.killed && server.proc.exitCode === null) return server.ready;
  stopServer();
  const bin = binaryPath();
  if (!fs.existsSync(bin)) throw Object.assign(new Error('이 앱에 음성인식 엔진이 포함되어 있지 않습니다.'), { code: 'NO_ENGINE' });
  if (!fileComplete(m)) {
    if (corruptDeleted.has(m)) throw Object.assign(new Error('음성인식 모델 파일이 손상되어 삭제했습니다. 다시 내려받아 주세요.'), { code: 'MODEL_CORRUPT' });
    throw Object.assign(new Error('음성인식 모델을 먼저 내려받아 주세요.'), { code: 'NO_MODEL' });
  }
  const port = await freePort();
  const threads = String(Math.max(2, Math.min(8, require('os').cpus().length)));
  const proc = spawn(bin, ['-m', modelPath(m), '--host', '127.0.0.1', '--port', String(port), '-l', 'ko', '-t', threads, '-nt', '--public', path.join(__dirname, 'vendor', 'whisper')], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => {
    stderr = (stderr + d.toString()).slice(-4000);
  });
  const s = { proc, port, model: m, ready: null };
  s.ready = new Promise((resolve, reject) => {
    const started = Date.now();
    let done = false;
    proc.on('exit', async (code) => {
      if (server === s) server = null;
      if (done) return;
      done = true;
      // Exited before it was ready: most often a damaged model file.
      const damaged = /failed to load|invalid model|bad magic|failed to initialize/i.test(stderr);
      if (damaged) {
        const digest = await sha256File(modelPath(m)).catch(() => '');
        if (digest !== MODELS[m].sha256) {
          try {
            fs.rmSync(modelPath(m), { force: true });
          } catch {}
          corruptDeleted.add(m);
          return reject(Object.assign(new Error('음성인식 모델 파일이 손상되어 삭제했습니다. 다시 내려받아 주세요.'), { code: 'MODEL_CORRUPT' }));
        }
      }
      reject(Object.assign(new Error(`음성인식 엔진이 시작되지 않았습니다 (종료 코드 ${code}).`), { code: 'ENGINE_FAILED' }));
    });
    const poll = async () => {
      if (done) return;
      if (await ping(port)) {
        done = true;
        return resolve(s);
      }
      if (Date.now() - started > START_TIMEOUT_MS) {
        done = true;
        try {
          proc.kill();
        } catch {}
        return reject(Object.assign(new Error('음성인식 엔진이 제때 준비되지 않았습니다.'), { code: 'ENGINE_FAILED' }));
      }
      setTimeout(poll, 300);
    };
    poll();
  });
  server = s;
  return s.ready;
}

function postInference(port, wav, fields) {
  return new Promise((resolve, reject) => {
    const boundary = `----martialdex${crypto.randomBytes(8).toString('hex')}`;
    const parts = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null || v === '') continue;
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    }
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="speech.wav"\r\nContent-Type: audio/wav\r\n\r\n`));
    parts.push(Buffer.from(wav));
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(parts);
    const req = http.request(
      { host: '127.0.0.1', port, path: '/inference', method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length }, timeout: 60000 },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode !== 200) return reject(Object.assign(new Error(`음성인식 엔진 오류 (HTTP ${res.statusCode})`), { code: 'ENGINE_FAILED' }));
          try {
            resolve(String(JSON.parse(text).text ?? ''));
          } catch {
            reject(Object.assign(new Error('음성인식 결과를 읽지 못했습니다.'), { code: 'ENGINE_FAILED' }));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(Object.assign(new Error('음성인식이 너무 오래 걸립니다.'), { code: 'ENGINE_FAILED' })));
    req.on('error', reject);
    req.end(body);
  });
}

/**
 * Transcribes one speech segment. `wav`: 16 kHz mono PCM16 WAV bytes.
 * `audioCtx` trims whisper's 30 s window to the segment length (much faster on CPU).
 */
function transcribe(wav, opts = {}) {
  const m = knownModel(opts.model);
  const job = queue.then(async () => {
    try {
      const s = await ensureServer(m);
      armIdle();
      const text = await postInference(s.port, wav, {
        response_format: 'json',
        language: 'ko',
        temperature: '0',
        beam_size: '1',
        best_of: '1',
        audio_ctx: opts.audioCtx ? String(Math.max(256, Math.min(1500, Math.round(opts.audioCtx)))) : undefined,
        prompt: opts.prompt ? String(opts.prompt).slice(0, 200) : undefined,
      });
      return { ok: true, text: text.replace(/\s+/g, ' ').trim() };
    } catch (e) {
      return { ok: false, code: e.code || 'ENGINE_FAILED', message: e.message || String(e) };
    }
  });
  queue = job.then(() => undefined, () => undefined);
  return job;
}

/** Starts the engine ahead of time (the first request then doesn't wait for the model to load). */
async function warmUp(id) {
  try {
    await ensureServer(knownModel(id));
    armIdle();
    return { ok: true };
  } catch (e) {
    return { ok: false, code: e.code || 'ENGINE_FAILED', message: e.message };
  }
}

module.exports = { MODELS, DEFAULT_MODEL, status, downloadModel, cancelDownload, deleteModel, transcribe, warmUp, stopServer };
