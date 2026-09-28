import { supabase } from '../supabase/client';
import type { AskAiRequest, AskAiResult } from './types';

// Two transports, chosen automatically per platform — neither ever puts the
// Gemini API key in this bundle:
//
// 1. Electron (window.martialdex.askAi present): unchanged IPC path to
//    electron/main.cjs -> electron/gemini.cjs, which reads GEMINI_API_KEY
//    from the main process's own environment. Not touched by this file.
// 2. Everywhere else (Android/Capacitor, plain web): calls the
//    `gemini-ask` Supabase Edge Function over HTTPS. The key lives only in
//    that function's server-side environment (`supabase secrets set
//    GEMINI_API_KEY=...`) — see supabase/functions/gemini-ask/index.ts.
//    Requires the user to be logged in (reuses Supabase Auth) so the
//    endpoint can't be called anonymously once its URL is known from the
//    APK.
//
// To switch providers later, only this file (and the Electron/Edge Function
// implementations it calls) change — every UI component that imports
// `aiProvider` stays the same.
export interface AiProvider {
  ask(request: AskAiRequest): Promise<AskAiResult>;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

async function askViaElectron(request: AskAiRequest): Promise<AskAiResult> {
  try {
    return await window.martialdex!.askAi(request);
  } catch {
    return {
      ok: false,
      code: 'NETWORK',
      message: '요청을 보내는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    };
  }
}

async function askViaSupabaseEdgeFunction(request: AskAiRequest): Promise<AskAiResult> {
  if (!supabase || !SUPABASE_URL) {
    return {
      ok: false,
      code: 'UNKNOWN',
      message: 'AI 기능이 아직 설정되지 않았습니다. 관리자에게 문의해주세요.',
    };
  }

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'AI 기능을 사용하려면 먼저 로그인해주세요.',
    };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gemini-ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Supabase's gateway (Kong) requires `apikey` on every request to
        // identify the project/key tier — separate from `Authorization`,
        // which carries the logged-in user's own session token that
        // gemini-ask/index.ts verifies. Omitting apikey gets rejected by
        // the gateway before the request ever reaches the function.
        apikey: SUPABASE_ANON_KEY ?? '',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(request),
    });
    const json = (await res.json()) as AskAiResult;
    return json;
  } catch {
    return {
      ok: false,
      code: 'NETWORK',
      message: '네트워크 오류로 AI 서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.',
    };
  }
}

export const aiProvider: AiProvider = {
  async ask(request) {
    if (window.martialdex?.askAi) {
      return askViaElectron(request);
    }
    return askViaSupabaseEdgeFunction(request);
  },
};
