// Verifies the DEPLOYED `youtube-search` Supabase Edge Function directly over
// HTTP, using the exact same request shape src/lib/videoSearch/provider.ts's
// searchViaSupabaseEdgeFunction() sends (same headers, same body, same
// endpoint). This is what a real web/Android client actually calls —
// Electron always prefers its own IPC bridge (window.martialdex.searchYoutube
// is exposed via contextBridge as non-configurable/non-writable, so it can't
// be monkey-patched away from inside an Electron-hosted page to force the
// Edge Function path; confirmed empirically). Testing over plain HTTP is the
// correct way to verify the deployed function's actual behavior.

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
dotenv.config({ path: path.join(APP_DIR, '.env'), quiet: true });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const { testEmail, password } = JSON.parse(fs.readFileSync('/tmp/qa-multidevice-account2.json', 'utf8'));

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + detail : ''));
}

async function login() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: testEmail, password }),
  });
  return res.json();
}

async function callYoutubeSearch(accessToken, query) {
  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/youtube-search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  const login1 = await login();
  check('Test account logs in (precondition)', !!login1.access_token, JSON.stringify(login1).slice(0, 200));
  if (!login1.access_token) {
    console.log('\n=== SUMMARY: 0/0 — could not obtain a session, aborting ===');
    process.exit(1);
  }

  const start = Date.now();
  const authed = await callYoutubeSearch(login1.access_token, 'Brazilian Jiu-Jitsu Armbar tutorial');
  const elapsed = Date.now() - start;
  check(
    '[deployed] Authenticated call returns 200 with real, structured video results',
    authed.status === 200 && authed.body.ok === true && Array.isArray(authed.body.results) && authed.body.results.length > 0,
    JSON.stringify(authed).slice(0, 500) + ` (elapsed ${elapsed}ms)`
  );
  if (authed.body.ok) {
    const first = authed.body.results[0];
    check(
      'Each result has videoId/title/channel/thumbnailUrl (matches VideoSearchItem shape)',
      typeof first.videoId === 'string' && typeof first.title === 'string' && typeof first.channel === 'string' && first.thumbnailUrl?.includes(first.videoId),
      JSON.stringify(first)
    );
  }

  const noAuth = await callYoutubeSearch(null, 'boxing jab tutorial');
  check(
    '[deployed] No Authorization header -> 401 UNAUTHORIZED (never an open relay)',
    noAuth.status === 401 && noAuth.body.code === 'UNAUTHORIZED',
    JSON.stringify(noAuth)
  );

  const logoutRes = await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${login1.access_token}` },
  });
  check('Sign-out succeeds (precondition for the next check)', logoutRes.status === 204, String(logoutRes.status));

  const afterLogout = await callYoutubeSearch(login1.access_token, 'boxing jab tutorial');
  check(
    '[deployed] A signed-out token is rejected with 401, not silently accepted',
    afterLogout.status === 401 && afterLogout.body.code === 'UNAUTHORIZED',
    JSON.stringify(afterLogout)
  );

  const emptyQuery = await (async () => {
    const login2 = await login();
    return callYoutubeSearch(login2.access_token, '');
  })();
  check(
    '[deployed] Empty query is rejected cleanly (400), not a crash',
    emptyQuery.status === 400 && emptyQuery.body.ok === false,
    JSON.stringify(emptyQuery)
  );

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' PASSED ===');
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
