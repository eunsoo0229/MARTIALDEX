#!/usr/bin/env node
// Post-build gate (spec section 11 — "APK 안에 결제 비밀키가 포함되지 않는지
// 빌드 결과를 검사한다"). Scans the ACTUAL bundle that gets synced into the
// Android project's www assets (and Electron's renderer) for the literal
// names of the payment-secret env vars — since nothing named
// PAYMENT_SECRET_KEY/PAYMENT_CLIENT_KEY is ever read by client code (only
// supabase/functions/payment-verify/index.ts, which runs on Supabase's
// servers, does), the string itself should never appear in the built output
// at all. This is a real search over dist/, not a source-code assumption.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist', 'renderer');

const FORBIDDEN_PATTERNS = [/PAYMENT_SECRET_KEY/, /PAYMENT_CLIENT_KEY/];

function collectFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full));
    else out.push(full);
  }
  return out;
}

if (!fs.existsSync(DIST_DIR)) {
  console.error(`BLOCKED: ${DIST_DIR} does not exist — run "npm run build" first.`);
  process.exit(1);
}

const files = collectFiles(DIST_DIR).filter((f) => /\.(js|html|css|map)$/.test(f));
let found = false;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      console.error(`BLOCKED: found "${pattern.source}" inside ${path.relative(ROOT, file)}`);
      found = true;
    }
  }
}

if (found) {
  console.error('');
  console.error('A payment secret variable name leaked into the client bundle. Never give it a VITE_ prefix.');
  process.exit(1);
}

console.log(`Payment secret bundle scan: CLEAR (${files.length} files checked in dist/renderer, no PAYMENT_SECRET_KEY/PAYMENT_CLIENT_KEY found)`);
process.exit(0);
