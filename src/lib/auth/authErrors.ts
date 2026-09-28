// Supabase (GoTrue) error messages are English and vary in exact wording by
// SDK version — matched by substring rather than exact string so minor
// wording drift doesn't silently fall through to the generic fallback.
const MESSAGE_RULES: { match: string; message: string }[] = [
  { match: 'invalid login credentials', message: '이메일 또는 비밀번호가 올바르지 않습니다.' },
  { match: 'user already registered', message: '이미 가입된 이메일입니다.' },
  { match: 'already registered', message: '이미 가입된 이메일입니다.' },
  { match: 'email not confirmed', message: '이메일 인증이 필요합니다. 받은 편지함에서 인증 메일을 확인해주세요.' },
  { match: 'password should be at least', message: '비밀번호는 최소 6자 이상이어야 합니다.' },
  { match: 'password is too weak', message: '비밀번호가 너무 단순합니다. 다른 비밀번호를 입력해주세요.' },
  { match: 'unable to validate email address', message: '이메일 형식이 올바르지 않습니다.' },
  { match: 'rate limit', message: '너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.' },
  { match: 'email rate limit exceeded', message: '이메일 발송 횟수 제한을 초과했습니다. 잠시 후 다시 시도해주세요.' },
  { match: 'over_email_send_rate_limit', message: '이메일 발송 횟수 제한을 초과했습니다. 잠시 후 다시 시도해주세요.' },
  { match: 'jwt expired', message: '로그인 세션이 만료되었습니다. 다시 로그인해주세요.' },
  { match: 'refresh_token_not_found', message: '로그인 세션이 만료되었습니다. 다시 로그인해주세요.' },
  { match: 'row-level security', message: '이 작업에 대한 권한이 없습니다.' },
  { match: 'permission denied', message: '이 작업에 대한 권한이 없습니다.' },
];

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return false;
}

// Every Supabase call in this app goes through this — never shows a raw
// English SDK error or a stack trace to the user, and never leaves the
// caller without SOME message when something goes wrong.
export function toKoreanAuthMessage(error: unknown): string {
  if (isNetworkError(error)) return '인터넷 연결을 확인해주세요.';

  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const lower = raw.toLowerCase();
  const rule = MESSAGE_RULES.find((r) => lower.includes(r.match));
  if (rule) return rule.message;

  return raw ? '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.' : '알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
}
