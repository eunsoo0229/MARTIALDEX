// Local language model (Ollama) for the MARTIALDEX 자체 AI 코치 — main process only.
//
// - Host is FIXED to the loopback Ollama server (http://127.0.0.1:11434): the
//   renderer can't point this at another host, and nothing is opened to the
//   network (no OLLAMA_ORIGINS / CORS needed — Node fetch has no CORS).
// - The model must be one the local server actually lists (/api/tags); the
//   preferred one comes from OLLAMA_MODEL in .env (default llama3.2:1b).
// - Inputs and outputs are bounded (prompt size, num_predict, timeout).
// - A request has an id: the renderer can cancel it (cancelLocalModel) while
//   the student waits; a server error (HTTP 5xx / dropped connection) is
//   retried ONCE inside the same time budget — a timeout or cancel is not.
// - This never falls back to Gemini: a failure is returned as a failure.

const HOST = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'llama3.2:1b';
const MODEL_NAME = /^[\w.\-:/]{1,80}$/;
const MAX_PROMPT_CHARS = 6000;
const MAX_PREDICT = 320;
const STATUS_TIMEOUT_MS = 2500;
const GENERATE_TIMEOUT_MS = 120000;
const MIN_TIMEOUT_MS = 5000;
const REQUEST_ID = /^[\w-]{1,64}$/;
/** In-flight generate requests: id → AbortController (for cancel). */
const inflight = new Map();

function preferredModel() {
  const m = (process.env.OLLAMA_MODEL || '').trim();
  return MODEL_NAME.test(m) ? m : DEFAULT_MODEL;
}

/** fetch + JSON with a timeout; `outer` (optional AbortSignal) cancels it. Throws Error named 'TimeoutError' / 'CancelError' / network error. */
async function fetchJson(url, init, timeoutMs, outer) {
  const ctrl = new AbortController();
  let cause = null;
  const timer = setTimeout(() => {
    cause = 'TimeoutError';
    ctrl.abort();
  }, timeoutMs);
  const onOuter = () => {
    cause = 'CancelError';
    ctrl.abort();
  };
  if (outer) {
    if (outer.aborted) onOuter();
    else outer.addEventListener('abort', onOuter, { once: true });
  }
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, text };
  } catch (e) {
    if (cause) {
      const err = new Error(cause);
      err.name = cause;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
    if (outer) outer.removeEventListener('abort', onOuter);
  }
}

/** { ok, running, model, models, reason } — never throws. */
async function localModelStatus() {
  const model = preferredModel();
  try {
    const r = await fetchJson(`${HOST}/api/tags`, { method: 'GET' }, STATUS_TIMEOUT_MS);
    if (!r.ok || !r.json || !Array.isArray(r.json.models)) return { ok: false, running: true, model, models: [], reason: 'BAD_RESPONSE' };
    const models = r.json.models.map((m) => m && m.name).filter((n) => typeof n === 'string');
    if (!models.includes(model)) return { ok: false, running: true, model, models, reason: 'MODEL_MISSING' };
    return { ok: true, running: true, model, models, reason: null };
  } catch {
    return { ok: false, running: false, model, models: [], reason: 'NOT_RUNNING' };
  }
}

/**
 * request: { system: string, prompt: string, maxTokens?: number, json?: boolean, timeoutMs?: number, requestId?: string }
 * → { ok: true, text, model, evalCount, ms, attempts } | { ok: false, code, message }
 * codes: EMPTY · TOO_LONG · NOT_RUNNING · MODEL_MISSING · BAD_RESPONSE · TIMEOUT · CANCELLED · NETWORK
 */
async function askLocalModel(request) {
  if (!request || typeof request.prompt !== 'string' || !request.prompt.trim()) return { ok: false, code: 'EMPTY', message: '질문 내용이 비어 있습니다.' };
  const system = typeof request.system === 'string' ? request.system : '';
  if (system.length + request.prompt.length > MAX_PROMPT_CHARS) return { ok: false, code: 'TOO_LONG', message: '로컬 모델에 보내기에는 내용이 너무 깁니다.' };
  const id = typeof request.requestId === 'string' && REQUEST_ID.test(request.requestId) ? request.requestId : null;
  const outer = new AbortController();
  if (id) inflight.set(id, outer);
  try {
    const status = await localModelStatus();
    if (!status.ok) {
      const message =
        status.reason === 'NOT_RUNNING'
          ? '이 컴퓨터에서 Ollama가 실행 중이 아닙니다.'
          : status.reason === 'MODEL_MISSING'
            ? `로컬 모델 ${status.model}이(가) 설치되어 있지 않습니다 (ollama pull ${status.model}).`
            : '로컬 모델 서버의 응답을 확인할 수 없습니다.';
      return { ok: false, code: status.reason || 'UNAVAILABLE', message };
    }
    const maxTokens = Math.max(16, Math.min(MAX_PREDICT, Number(request.maxTokens) || 200));
    const budget = Math.max(MIN_TIMEOUT_MS, Math.min(GENERATE_TIMEOUT_MS, Number(request.timeoutMs) || GENERATE_TIMEOUT_MS));
    const started = Date.now();
    const body = JSON.stringify({
      model: status.model,
      system,
      prompt: request.prompt,
      stream: false,
      ...(request.json ? { format: 'json' } : {}),
      options: { temperature: 0.2, num_predict: maxTokens, repeat_penalty: 1.3 },
    });
    let last = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const left = budget - (Date.now() - started);
      if (left < 1000) break;
      try {
        const r = await fetchJson(`${HOST}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, left, outer.signal);
        if (r.ok && r.json && typeof r.json.response === 'string') {
          return { ok: true, text: r.json.response, model: status.model, evalCount: Number(r.json.eval_count) || 0, ms: Date.now() - started, attempts: attempt };
        }
        last = { ok: false, code: 'BAD_RESPONSE', message: `로컬 모델 응답 오류 (HTTP ${r.status}).` };
      } catch (e) {
        if ((e && e.name === 'CancelError') || outer.signal.aborted) return { ok: false, code: 'CANCELLED', message: '로컬 모델 요청을 취소했습니다.' };
        if (e && e.name === 'TimeoutError') return { ok: false, code: 'TIMEOUT', message: `로컬 모델 응답이 ${Math.round(budget / 1000)}초 안에 오지 않아 중단했습니다.` };
        last = { ok: false, code: 'NETWORK', message: '로컬 모델 서버에 연결하지 못했습니다.' };
      }
      // one retry for a server error / dropped connection, inside the same budget
    }
    return last || { ok: false, code: 'TIMEOUT', message: `로컬 모델 응답이 ${Math.round(budget / 1000)}초 안에 오지 않아 중단했습니다.` };
  } finally {
    if (id) inflight.delete(id);
  }
}

/** Cancels an in-flight request (the student chose not to wait). → true if one was running. */
function cancelLocalModel(requestId) {
  const c = typeof requestId === 'string' ? inflight.get(requestId) : null;
  if (!c) return false;
  c.abort();
  return true;
}

module.exports = { localModelStatus, askLocalModel, cancelLocalModel, HOST };
