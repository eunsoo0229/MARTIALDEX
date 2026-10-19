import type { LocalAskRequest, LocalAskResult, LocalModelStatus } from './types';

// Renderer side of the local model: Electron IPC only (window.martialdex.localAi).
// Android / web have no path to a local Ollama server (cleartext HTTP is
// blocked and there is no on-device server), so they report UNSUPPORTED_PLATFORM.

export function localModelSupported(): boolean {
  return typeof window !== 'undefined' && !!window.martialdex?.localAi;
}

export async function getLocalModelStatus(): Promise<LocalModelStatus> {
  const api = typeof window !== 'undefined' ? window.martialdex?.localAi : undefined;
  if (!api) return { ok: false, running: false, model: null, models: [], reason: 'UNSUPPORTED_PLATFORM' };
  try {
    return await api.status();
  } catch {
    return { ok: false, running: false, model: null, models: [], reason: 'UNKNOWN' };
  }
}

/** What the UI shows while the student waits for the local model (one request at a time per lesson). */
export interface LocalModelWait {
  requestId: string;
  startedAt: number;
  timeoutMs: number;
}

let waiting: LocalModelWait | null = null;
const listeners = new Set<(w: LocalModelWait | null) => void>();
function setWaiting(w: LocalModelWait | null) {
  waiting = w;
  for (const l of listeners) l(w);
}

export function currentLocalModelWait(): LocalModelWait | null {
  return waiting;
}

export function subscribeLocalModelWait(listener: (w: LocalModelWait | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** "기다리지 않고 자료 원문으로 보기" — cancels the request being waited on; the caller gets code CANCELLED. */
export async function cancelLocalModelWait(): Promise<boolean> {
  const w = waiting;
  const api = typeof window !== 'undefined' ? window.martialdex?.localAi : undefined;
  if (!w || !api?.cancel) return false;
  try {
    return await api.cancel(w.requestId);
  } catch {
    return false;
  }
}

let seq = 0;

export async function askLocalModel(request: LocalAskRequest): Promise<LocalAskResult> {
  const api = typeof window !== 'undefined' ? window.martialdex?.localAi : undefined;
  if (!api) return { ok: false, code: 'UNSUPPORTED_PLATFORM', message: '이 기기에서는 로컬 AI 모델에 연결할 수 없습니다.' };
  const requestId = request.requestId ?? `coach-${Date.now().toString(36)}-${(seq++).toString(36)}`;
  const timeoutMs = request.timeoutMs ?? 120000;
  setWaiting({ requestId, startedAt: Date.now(), timeoutMs });
  try {
    return await api.ask({ ...request, requestId, timeoutMs });
  } catch {
    return { ok: false, code: 'UNKNOWN', message: '로컬 모델 요청 중 오류가 발생했습니다.' };
  } finally {
    if (waiting?.requestId === requestId) setWaiting(null);
  }
}

export function localStatusText(s: LocalModelStatus): string {
  if (s.ok) return `로컬 모델 ${s.model} 사용 가능`;
  switch (s.reason) {
    case 'UNSUPPORTED_PLATFORM':
      return '이 기기(모바일·웹)에서는 로컬 모델에 연결할 수 없습니다';
    case 'NOT_RUNNING':
      return '이 컴퓨터에서 Ollama가 실행 중이 아닙니다';
    case 'MODEL_MISSING':
      return `로컬 모델 ${s.model ?? ''}이(가) 설치되어 있지 않습니다`;
    default:
      return '로컬 모델 상태를 확인할 수 없습니다';
  }
}
