// Supabase Edge Function — the ONLY place a non-Electron client (Android/
// Capacitor, or a plain web build) reaches Gemini. Runs server-side on
// Supabase's Deno runtime; GEMINI_API_KEY lives only in this function's
// environment (set via `supabase secrets set GEMINI_API_KEY=...`), never in
// any client bundle, .apk, or repo file.
//
// This mirrors electron/gemini.cjs's request/response shape exactly so
// src/lib/ai/provider.ts can treat both transports (Electron IPC vs this
// HTTP endpoint) as the same AiProvider. Keep the two in sync if Gemini's
// request/response shape ever changes.
//
// Requires a valid Supabase-issued JWT (the logged-in user's access token)
// in the Authorization header — this is the "existing auth system" gate:
// anonymous callers are rejected before the Gemini request is ever made, so
// this endpoint can't become a free, unauthenticated relay for anyone who
// finds the URL.

import { createClient } from 'npm:@supabase/supabase-js@2';

const DEFAULT_MODEL = 'gemini-3.6-flash';
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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type AiErrorCode = 'NO_API_KEY' | 'INVALID_API_KEY' | 'RATE_LIMIT' | 'NETWORK' | 'EMPTY_RESPONSE' | 'UNKNOWN' | 'UNAUTHORIZED';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function errorResult(code: AiErrorCode, message: string) {
  return { ok: false, code, message };
}

interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

interface AiImagePart {
  mimeType: string;
  data: string;
}

interface AskRequest {
  systemInstruction: string;
  contextText: string;
  history: ChatTurn[];
  question: string;
  /** Enables Gemini's Google Search grounding tool — see 기술 추가 요청's verification step. Requires a plan/quota that includes grounding. */
  useSearchGrounding?: boolean;
  /** Attached to the final (question) turn's parts — see 음식 사진 분석 (nutrition/aiPhotoAnalysis.ts). Mirrors electron/gemini.cjs. */
  imageParts?: AiImagePart[];
}

function isAskRequest(value: unknown): value is AskRequest {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.systemInstruction === 'string' &&
    typeof v.contextText === 'string' &&
    typeof v.question === 'string' &&
    Array.isArray(v.history)
  );
}

function buildRequestBody({ systemInstruction, contextText, history, question, useSearchGrounding, imageParts }: AskRequest) {
  const fullSystemInstruction = `${systemInstruction}\n\n---\n앱 데이터 (참고용 — 이 안의 내용을 우선 근거로 사용할 것):\n${contextText}`;

  const questionParts: Record<string, unknown>[] = [{ text: question }];
  if (Array.isArray(imageParts)) {
    for (const part of imageParts) {
      questionParts.push({ inlineData: { mimeType: part.mimeType, data: part.data } });
    }
  }

  const contents = [
    ...history.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
    { role: 'user', parts: questionParts },
  ];

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: fullSystemInstruction }] },
    contents,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingLevel: 'minimal' },
    },
  };
  if (useSearchGrounding) body.tools = [{ googleSearch: {} }];
  return body;
}

function extractGroundingSources(candidate: any): { title: string; uri: string }[] | undefined {
  const chunks = candidate?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return undefined;
  const sources = chunks.map((c: any) => ({ title: c.web?.title || '', uri: c.web?.uri || '' })).filter((s: any) => s.uri);
  return sources.length > 0 ? sources : undefined;
}

// Mirrors electron/gemini.cjs's identical helper — the REAL query strings
// Gemini's own googleSearch tool issued (distinct from groundingChunks,
// which are the found sources, not the queries that found them).
function extractWebSearchQueries(candidate: any): string[] | undefined {
  const queries = candidate?.groundingMetadata?.webSearchQueries;
  if (!Array.isArray(queries)) return undefined;
  const cleaned = queries.filter((q: unknown) => typeof q === 'string' && q.trim());
  return cleaned.length > 0 ? cleaned : undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiOnce(
  url: string,
  request: AskRequest,
): Promise<{ kind: 'ok'; json: any } | { kind: 'error'; result: ReturnType<typeof errorResult> } | { kind: 'overloaded' }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
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
      result: errorResult(
        'NETWORK',
        err instanceof Error && err.name === 'AbortError'
          ? '응답 시간이 너무 오래 걸려 요청을 중단했습니다. 잠시 후 다시 시도해주세요.'
          : '네트워크 오류로 AI 서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.',
      ),
    };
  } finally {
    clearTimeout(timeout);
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const apiMessage = json?.error?.message || '';
    if (res.status === 429) {
      return { kind: 'error', result: errorResult('RATE_LIMIT', 'Gemini 무료 사용량 한도에 도달했습니다. 잠시 후(1분 정도) 다시 시도해주세요.') };
    }
    if (res.status === 500 || res.status === 503) {
      // Transient model-overload ("high demand") — worth one quick retry
      // before surfacing it to the user (see MAX_RETRIES_ON_OVERLOAD below).
      return { kind: 'overloaded' };
    }
    if (res.status === 400 || res.status === 403) {
      return { kind: 'error', result: errorResult('INVALID_API_KEY', 'Gemini API 키가 올바르지 않거나 권한이 없습니다. 관리자에게 문의해주세요.') };
    }
    return {
      kind: 'error',
      result: errorResult('UNKNOWN', apiMessage ? `AI 요청이 실패했습니다: ${apiMessage}` : 'AI 요청이 실패했습니다. 잠시 후 다시 시도해주세요.'),
    };
  }

  return { kind: 'ok', json };
}

// Runs the retry-on-overload loop against ONE specific model. Factored out
// of askGemini() so the same loop can be run twice — once for the primary
// model, once for FALLBACK_MODEL if the primary is rate-limited. Mirrors
// electron/gemini.cjs's askGeminiAgainstModel exactly — keep both in sync.
async function askGeminiAgainstModel(
  model: string,
  apiKey: string,
  request: AskRequest,
): Promise<{ kind: 'ok'; json: any } | { kind: 'error'; result: ReturnType<typeof errorResult> }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  for (let attempt = 0; attempt <= MAX_RETRIES_ON_OVERLOAD; attempt++) {
    const outcome = await callGeminiOnce(url, request);
    if (outcome.kind === 'ok') return outcome;
    if (outcome.kind === 'error') return outcome;
    if (attempt === MAX_RETRIES_ON_OVERLOAD) {
      return { kind: 'error', result: errorResult('NETWORK', 'Gemini 서버가 일시적으로 혼잡합니다. 잠시 후 다시 시도해주세요.') };
    }
    await sleep(1500);
  }
  // Unreachable (the loop above always returns), but keeps TS's control-flow
  // analysis happy about every path returning a value.
  return { kind: 'error', result: errorResult('NETWORK', 'Gemini 서버가 일시적으로 혼잡합니다. 잠시 후 다시 시도해주세요.') };
}

async function askGemini(request: AskRequest) {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    // Server misconfiguration (secret not set with `supabase secrets set`) —
    // never happens because the client didn't send a key; the client never
    // has one to send.
    return errorResult('NO_API_KEY', 'Gemini API 키가 서버에 설정되지 않았습니다. 관리자에게 문의해주세요.');
  }

  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;
  // See electron/gemini.cjs's identical fallback — mirrors that file's
  // behavior for the Android/web transport. Free-tier per-model quota
  // (observed: 20 requests/day for gemini-3.6-flash) exhausts well before
  // the day is over under normal usage/testing, at which point every AI
  // feature fails until it resets. Retry once against a separate model with
  // its own independent quota — only for RATE_LIMIT (429 "quota exceeded"),
  // never for other error kinds where a different model wouldn't help.
  const fallbackModel = Deno.env.get('GEMINI_FALLBACK_MODEL') || 'gemini-3.1-flash-lite';
  let outcome = await askGeminiAgainstModel(model, apiKey, request);

  // Quota exhaustion doesn't always come back as a clean, fast 429 —
  // sometimes the request just hangs with no response until our own
  // REQUEST_TIMEOUT_MS abort fires, classified 'NETWORK' (same code a
  // genuine connectivity failure gets). Retrying a different model on
  // NETWORK too costs one more timeout's worth of wait in the rare
  // true-offline case, but fixes the common case here (quota exhausted).
  if (outcome.kind === 'error' && (outcome.result.code === 'RATE_LIMIT' || outcome.result.code === 'NETWORK') && model !== fallbackModel) {
    outcome = await askGeminiAgainstModel(fallbackModel, apiKey, request);
  }

  if (outcome.kind === 'error') return outcome.result;
  const json = outcome.json;

  const blockReason = json?.promptFeedback?.blockReason;
  const candidate = json?.candidates?.[0];
  const text = candidate?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') ?? '';

  if (blockReason || !text.trim()) {
    return errorResult('EMPTY_RESPONSE', '이 질문에는 답변을 생성할 수 없었습니다. 다른 방식으로 다시 질문해보세요.');
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse(errorResult('UNKNOWN', 'POST 요청만 허용됩니다.'), 405);
  }

  // Auth gate: reuses the app's existing Supabase Auth — only a logged-in
  // user's access token is accepted. This is what keeps the endpoint from
  // being a free-for-all relay once its URL is known (URLs in a public APK
  // are not secret).
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return jsonResponse(errorResult('UNAUTHORIZED', 'AI 기능을 사용하려면 로그인이 필요합니다.'), 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse(errorResult('UNKNOWN', '서버 설정 오류입니다. 관리자에게 문의해주세요.'), 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return jsonResponse(errorResult('UNAUTHORIZED', '로그인 세션이 유효하지 않습니다. 다시 로그인해주세요.'), 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(errorResult('UNKNOWN', '요청 형식이 올바르지 않습니다.'), 400);
  }

  if (!isAskRequest(body) || !body.question.trim()) {
    return jsonResponse(errorResult('UNKNOWN', '질문 내용이 비어 있습니다.'), 400);
  }

  const result = await askGemini(body);
  return jsonResponse(result);
});
