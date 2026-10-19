// The only place in this app that knows about Google Gemini. Runs in the
// Electron main process (Node), never in the renderer bundle, so the API
// key read from process.env never ships to the frontend.
//
// Kept isolated from main.cjs on purpose: swapping to a different AI vendor
// later should mean replacing this one file (and its call site in main.cjs's
// ipcMain.handle('ai:ask', ...)), not touching the renderer at all.
//
// process.env.MARTIALDEX_ENV_PATH is set by main.cjs's resolveEnvPath() to
// whichever .env location it actually checked/used — read back here so the
// "no API key" message can tell the user the EXACT path to create, instead
// of a generic hint that (as this exact bug already showed once) can be
// wrong for how the user actually launched the app (e.g. running straight
// from a still-mounted, read-only DMG instead of a moved/installed app).

const DEFAULT_MODEL = 'gemini-3.6-flash'; // Current Flash-tier model available on the Gemini API free tier.
// Used ONLY when the primary model (above, or GEMINI_MODEL) returns a
// RATE_LIMIT (HTTP 429 "quota exceeded") — the free tier's per-model daily
// quota is small (observed: 20 requests/day for gemini-3.6-flash) and gets
// exhausted by normal usage/testing well before the day is over, at which
// point EVERY AI feature in the app fails until the quota resets. Retrying
// against a separate model with its own independent quota keeps the
// feature usable in the meantime. Never used for other error kinds
// (invalid key, genuine network failure, content-blocked) where a
// different model wouldn't help. Verified compatible with this file's
// exact request shape (systemInstruction + thinkingConfig).
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite';
// gemini-3.6-flash is a "thinking" model — left at its default thinking
// level, it can spend most (or all) of maxOutputTokens on invisible
// reasoning before writing any visible text, which both slows every request
// down and can leave candidate.content.parts empty (finishReason
// MAX_TOKENS, zero real output). thinkingLevel: 'minimal' turns that off.
// Even with thinking disabled, a JSON-heavy prompt (e.g. fighter-style
// analysis, which asks for ~9 array fields) has been observed taking
// 25-47s end to end, so the old 25s abort fired on legitimate, successful
// responses — REQUEST_TIMEOUT_MS is raised well above that observed range.
const REQUEST_TIMEOUT_MS = 55000;
const MAX_RETRIES_ON_OVERLOAD = 1;

// mediaParts (기준 영상 비교 자세 평가 — src/lib/formCompare/): ordered
// text / image / YouTube-clip parts for the final turn. Only public YouTube
// watch/shorts/youtu.be URLs are passed as Gemini fileData (the API's own
// video-URL input — nothing is downloaded here); anything else is dropped.
const YOUTUBE_URL = /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[A-Za-z0-9_-]{11}(?:[?&#][^\s]*)?$/;
const MAX_MEDIA_PARTS = 48;
function toGeminiMediaParts(mediaParts) {
  const out = [];
  if (!Array.isArray(mediaParts)) return out;
  for (const part of mediaParts.slice(0, MAX_MEDIA_PARTS)) {
    if (!part || typeof part !== 'object') continue;
    if (part.kind === 'text' && typeof part.text === 'string') out.push({ text: part.text.slice(0, 4000) });
    else if (part.kind === 'image' && typeof part.data === 'string' && /^image\/(jpeg|png|webp)$/.test(part.mimeType)) out.push({ inlineData: { mimeType: part.mimeType, data: part.data } });
    else if (part.kind === 'youtube' && typeof part.url === 'string' && YOUTUBE_URL.test(part.url)) {
      const meta = {};
      if (Number.isFinite(part.startSeconds) && part.startSeconds >= 0) meta.startOffset = `${Math.floor(part.startSeconds)}s`;
      if (Number.isFinite(part.endSeconds) && part.endSeconds > 0) meta.endOffset = `${Math.ceil(part.endSeconds)}s`;
      if (Number.isFinite(part.fps) && part.fps > 0) meta.fps = Math.min(10, part.fps);
      out.push({ fileData: { fileUri: part.url, mimeType: 'video/*' }, ...(Object.keys(meta).length ? { videoMetadata: meta } : {}) });
    }
  }
  return out;
}

function buildRequestBody({ systemInstruction, contextText, history, question, useSearchGrounding, imageParts, mediaParts, temperature, maxOutputTokens, thinkingLevel }) {
  const fullSystemInstruction = `${systemInstruction}\n\n---\n앱 데이터 (참고용 — 이 안의 내용을 우선 근거로 사용할 것):\n${contextText}`;

  // imageParts (음식 사진 분석 등) are attached to the final question turn
  // only — Gemini's inlineData part shape. Empty/undefined for every
  // existing text-only caller, so this is purely additive.
  const questionParts = [{ text: question }];
  if (Array.isArray(imageParts)) {
    for (const part of imageParts) {
      questionParts.push({ inlineData: { mimeType: part.mimeType, data: part.data } });
    }
  }
  questionParts.push(...toGeminiMediaParts(mediaParts));

  const contents = [
    ...history.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
    { role: 'user', parts: questionParts },
  ];

  const body = {
    systemInstruction: { parts: [{ text: fullSystemInstruction }] },
    contents,
    generationConfig: {
      temperature: Number.isFinite(temperature) ? Math.min(1, Math.max(0, temperature)) : 0.4,
      maxOutputTokens: Number.isFinite(maxOutputTokens) ? Math.min(8192, Math.max(256, Math.round(maxOutputTokens))) : 2048,
      // 'minimal' unless a caller asks for a little reasoning (기준 영상 비교 판정 uses 'low').
      thinkingConfig: { thinkingLevel: thinkingLevel === 'low' || thinkingLevel === 'medium' ? thinkingLevel : 'minimal' },
    },
  };
  // Real web lookups instead of model-only knowledge — used by 기술 추가
  // 요청's verification step so a claimed technique is checked against
  // actual external sources, not just the model's training data. Requires
  // a Gemini plan/quota that includes grounding.
  if (useSearchGrounding) body.tools = [{ googleSearch: {} }];
  return body;
}

function extractGroundingSources(candidate) {
  const chunks = candidate?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return undefined;
  const sources = chunks.map((c) => ({ title: c.web?.title || '', uri: c.web?.uri || '' })).filter((s) => s.uri);
  return sources.length > 0 ? sources : undefined;
}

// The REAL query strings Gemini's own googleSearch tool issued — separate
// from groundingChunks (which are the found SOURCES, not the queries that
// found them). Used by aiCurriculum's "조사 결과" screen to show the user
// what was actually searched, instead of only the app's own planned/
// requested angles. Never backfilled/guessed when the API omits it.
function extractWebSearchQueries(candidate) {
  const queries = candidate?.groundingMetadata?.webSearchQueries;
  if (!Array.isArray(queries)) return undefined;
  const cleaned = queries.filter((q) => typeof q === 'string' && q.trim());
  return cleaned.length > 0 ? cleaned : undefined;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiOnce(url, request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestBody(request)),
      signal: controller.signal,
    });
  } catch (err) {
    return {
      kind: 'error',
      result: {
        ok: false,
        code: 'NETWORK',
        message:
          err && err.name === 'AbortError'
            ? '응답 시간이 너무 오래 걸려 요청을 중단했습니다. 잠시 후 다시 시도해주세요.'
            : '네트워크 오류로 AI 서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.',
      },
    };
  } finally {
    clearTimeout(timeout);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const apiMessage = json?.error?.message || '';

    if (res.status === 429) {
      return {
        kind: 'error',
        result: { ok: false, code: 'RATE_LIMIT', message: 'Gemini 무료 사용량 한도에 도달했습니다. 잠시 후(1분 정도) 다시 시도해주세요.' },
      };
    }
    if (res.status === 500 || res.status === 503) {
      // Transient model-overload ("high demand") — worth one quick retry
      // before surfacing it to the user (see MAX_RETRIES_ON_OVERLOAD below).
      return { kind: 'overloaded' };
    }
    if (res.status === 400 || res.status === 403) {
      return {
        kind: 'error',
        result: { ok: false, code: 'INVALID_API_KEY', message: 'Gemini API 키가 올바르지 않거나 권한이 없습니다. .env의 GEMINI_API_KEY 값을 확인해주세요.' },
      };
    }
    return {
      kind: 'error',
      result: {
        ok: false,
        code: 'UNKNOWN',
        message: apiMessage ? `AI 요청이 실패했습니다: ${apiMessage}` : 'AI 요청이 실패했습니다. 잠시 후 다시 시도해주세요.',
      },
    };
  }

  return { kind: 'ok', json };
}

// Runs the retry-on-overload loop against ONE specific model. Factored out
// of askGemini() so the same loop can be run twice — once for the primary
// model, once for FALLBACK_MODEL if the primary is rate-limited.
async function askGeminiAgainstModel(model, apiKey, request) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  for (let attempt = 0; attempt <= MAX_RETRIES_ON_OVERLOAD; attempt++) {
    const outcome = await callGeminiOnce(url, request);
    if (outcome.kind === 'ok') return outcome;
    if (outcome.kind === 'error') return outcome;
    if (attempt === MAX_RETRIES_ON_OVERLOAD) {
      return { kind: 'error', result: { ok: false, code: 'NETWORK', message: 'Gemini 서버가 일시적으로 혼잡합니다. 잠시 후 다시 시도해주세요.' } };
    }
    await sleep(1500);
  }
}

async function askGemini(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const envPath = process.env.MARTIALDEX_ENV_PATH || '.env';
    return {
      ok: false,
      code: 'NO_API_KEY',
      message: `Gemini API 키가 설정되지 않았습니다. 다음 경로에 .env 파일을 만들고 GEMINI_API_KEY를 설정한 뒤 앱을 다시 시작해주세요:\n${envPath}`,
    };
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  let outcome = await askGeminiAgainstModel(model, apiKey, request);

  // Quota exhaustion doesn't always come back as a clean, fast 429 —
  // observed in practice: sometimes the request just hangs with no response
  // at all until our own REQUEST_TIMEOUT_MS abort fires, which callGeminiOnce
  // classifies as 'NETWORK' (the same code a genuine connectivity failure
  // gets). Retrying a different model on NETWORK too costs one more
  // timeout's worth of wait in the rare true-offline case, but is what
  // actually fixes the common case here (this model's quota exhausted).
  if (outcome.kind === 'error' && (outcome.result.code === 'RATE_LIMIT' || outcome.result.code === 'NETWORK') && model !== FALLBACK_MODEL) {
    outcome = await askGeminiAgainstModel(FALLBACK_MODEL, apiKey, request);
  }

  if (outcome.kind === 'error') return outcome.result;
  const json = outcome.json;

  const blockReason = json?.promptFeedback?.blockReason;
  const candidate = json?.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text || '').join('') ?? '';

  if (blockReason || !text.trim()) {
    return {
      ok: false,
      code: 'EMPTY_RESPONSE',
      message: '이 질문에는 답변을 생성할 수 없었습니다. 다른 방식으로 다시 질문해보세요.',
    };
  }

  const groundingSources = extractGroundingSources(candidate);
  const webSearchQueries = extractWebSearchQueries(candidate);
  return {
    ok: true,
    text: text.trim(),
    ...(groundingSources ? { groundingSources } : {}),
    ...(webSearchQueries ? { webSearchQueries } : {}),
  };
}

module.exports = { askGemini };
