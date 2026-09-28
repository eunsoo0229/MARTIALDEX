#!/usr/bin/env node
// Pre-build gate for the Android test build (`npm run dist:android`).
//
// GEMINI_API_KEY must never reach an Android build — Electron's main-process
// IPC trick (electron/gemini.cjs) has no equivalent on Android; there is no
// privileged process to hide a secret in, and anything bundled into an APK
// can be extracted by unzipping it. So Android never carries the Gemini key
// at all — it calls the `gemini-ask` Supabase Edge Function instead (see
// supabase/functions/gemini-ask/index.ts + src/lib/ai/provider.ts), which
// holds the real key server-side.
//
// This script enforces two things before every Android build:
//   1. VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY must be present —
//      without them the app has no way to reach ANY secure Gemini endpoint,
//      and login/curriculum-sync/skill-tracking (all Supabase-backed) would
//      silently be dead on the built APK. Missing either -> hard fail.
//   2. No VITE_-prefixed Gemini variable may exist in .env — Vite embeds
//      every VITE_* var into the client bundle verbatim, so
//      VITE_GEMINI_API_KEY (or similar) would ship a real key inside the
//      APK the moment someone typos it in. Hard fail if found, regardless
//      of value.
//
// Never logs the actual value of any secret — only FOUND/MISSING/BLOCKED.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// quiet: true — dotenv 17.x prints a random self-promotional "tip" line by
// default (harmless, but noisy for a script whose whole point is clean,
// unambiguous FOUND/MISSING status lines).
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

function status(found) {
  return found ? 'FOUND' : 'MISSING';
}

console.log('--- Android build configuration check ---');

let hardFail = false;

// 1. Supabase config — required so the app can reach the Gemini proxy at
// all, and so login/curriculum/skill-tracking/training-log features work.
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
console.log(`VITE_SUPABASE_URL: ${status(!!supabaseUrl)}`);
console.log(`VITE_SUPABASE_PUBLISHABLE_KEY: ${status(!!supabaseKey)}`);
if (!supabaseUrl || !supabaseKey) {
  hardFail = true;
}

// 2. Gemini configuration for Android is "a secure proxy endpoint is
// reachable", never a raw key. Report what the client will actually use.
console.log(`Gemini transport (Android): Supabase Edge Function "gemini-ask"`);
console.log(`Gemini remote endpoint reachable: ${status(!!supabaseUrl)} (same as VITE_SUPABASE_URL above)`);

// 3. Defensive check: catch an accidental attempt to ship the real key via
// a VITE_-prefixed variable, which Vite would bundle into the APK verbatim.
const leakedVar = Object.keys(process.env).find((k) => /^VITE_.*GEMINI/i.test(k));
if (leakedVar) {
  console.error('');
  console.error(`BLOCKED: found "${leakedVar}" in the environment.`);
  console.error(
    'Any VITE_-prefixed variable is bundled into the client/APK verbatim. ' +
      'GEMINI_API_KEY (and anything derived from it) must never use a VITE_ prefix — ' +
      'remove this variable and rely on the gemini-ask Supabase Edge Function instead.',
  );
  hardFail = true;
}

// 3b. 31단계 — same defensive check for the payment secret. PAYMENT_SECRET_KEY
// / PAYMENT_CLIENT_KEY (whatever names the eventual PG requires) must only
// ever live in the payment-verify Edge Function's own Supabase secrets
// (`supabase secrets set PAYMENT_SECRET_KEY=...`) — never in .env with a
// VITE_ prefix, and never logged here even if found.
const leakedPaymentVar = Object.keys(process.env).find((k) => /^VITE_.*PAYMENT/i.test(k));
if (leakedPaymentVar) {
  console.error('');
  console.error(`BLOCKED: found "${leakedPaymentVar}" in the environment.`);
  console.error(
    'Any VITE_-prefixed variable is bundled into the client/APK verbatim. ' +
      'Payment secret/client keys must never use a VITE_ prefix — set them as Supabase Edge ' +
      'Function secrets (supabase secrets set PAYMENT_SECRET_KEY=...) instead, and let the ' +
      'client call payment-verify like every other server-mediated feature.',
  );
  hardFail = true;
}
console.log(`Payment secret leak check (VITE_*PAYMENT*): ${leakedPaymentVar ? 'BLOCKED' : 'CLEAR'}`);

// Informational only, never fatal: best-effort check of whether the Edge
// Function itself has actually been deployed. A missing/unreachable
// function does not block this test build — the app already degrades
// gracefully (src/lib/ai/provider.ts returns a clear "로그인이 필요합니다" /
// network-error message instead of crashing) — but it's worth surfacing so
// nobody mistakes a silent AI failure for a bug.
async function checkEdgeFunctionDeployed() {
  if (!supabaseUrl) return 'SKIPPED (no Supabase URL configured)';
  try {
    // A deployed function (even one that then rejects the request for
    // missing auth) responds with something other than 404 — Supabase's
    // functions gateway returns a literal 404 "Requested function was not
    // found" for a function name that was never deployed, which is the one
    // status this probe must NOT count as success.
    const res = await fetch(`${supabaseUrl}/functions/v1/gemini-ask`, {
      method: 'OPTIONS',
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) return 'NOT DEPLOYED (404 from Supabase functions gateway)';
    return res.status < 500 ? 'LIKELY DEPLOYED' : `RESPONDED WITH ${res.status}`;
  } catch {
    return 'UNREACHABLE (network error reaching Supabase from this machine)';
  }
}

const edgeFunctionStatus = await checkEdgeFunctionDeployed();
console.log(`gemini-ask Edge Function: ${edgeFunctionStatus}`);
if (edgeFunctionStatus.startsWith('UNREACHABLE') || edgeFunctionStatus.startsWith('NOT DEPLOYED')) {
  console.warn('');
  console.warn(
    'WARNING: the gemini-ask Edge Function does not appear to be deployed yet. ' +
      'The app will still build and run — the AI feature will show a clear ' +
      '"로그인이 필요합니다" / network-error message instead of crashing — but ' +
      'Gemini responses will not work on this build until you deploy it:',
  );
  console.warn('  supabase secrets set GEMINI_API_KEY=<your key>');
  console.warn('  supabase functions deploy gemini-ask');
}

console.log('------------------------------------------');

if (hardFail) {
  console.error('');
  console.error('Gemini API configuration is missing. Configure the required environment before building.');
  process.exit(1);
}

console.log('Android build configuration OK — proceeding.');
process.exit(0);
