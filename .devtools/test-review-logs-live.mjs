// 0038 live RLS check against the real Supabase project with two QA accounts.
// Writes one row per account, checks isolation, then deletes its own rows.
//   QA_COMBO_ACCOUNTS=/path/accounts.json node .devtools/test-review-logs-live.mjs
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const file = process.env.QA_COMBO_ACCOUNTS;
if (!file) {
  console.log('NOT TESTED — set QA_COMBO_ACCOUNTS');
  process.exit(2);
}
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const [A, B] = JSON.parse(fs.readFileSync(file, 'utf8'));
const mk = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (n, p, d = '') => (results.push(p), console.log((p ? 'PASS' : 'FAIL') + ' — ' + n + (d ? ' :: ' + JSON.stringify(d).slice(0, 200) : '')));

const ca = mk(), cb = mk();
const sa = await ca.auth.signInWithPassword({ email: A.email, password: A.password });
const sb = await cb.auth.signInWithPassword({ email: B.email, password: B.password });
check('두 QA 계정 로그인', !sa.error && !sb.error, sa.error?.message ?? sb.error?.message ?? '');
const ua = sa.data.user.id, ub = sb.data.user.id;
const id = 'qa_rls_' + Date.now();
for (const [table, extra] of [['review_logs', { mode: 'ai' }], ['coach_lesson_logs', { date: '2026-10-16' }]]) {
  let r = await ca.from(table).insert({ id, user_id: ua, ...extra, data: { id, qa: true } });
  check(`[${table}] A 본인 행 추가`, !r.error, r.error?.message ?? '');
  r = await ca.from(table).insert({ id: id + '_x', user_id: ub, ...extra, data: {} });
  check(`[${table}] A가 B 명의로 추가 불가`, !!r.error);
  r = await cb.from(table).select('id').eq('id', id);
  check(`[${table}] B는 A 행을 볼 수 없음`, !r.error && r.data.length === 0, r.data);
  r = await cb.from(table).update({ data: { hacked: true } }).eq('id', id).select('id');
  check(`[${table}] B는 A 행을 수정할 수 없음`, !r.error ? r.data.length === 0 : true);
  r = await cb.from(table).delete().eq('id', id).select('id');
  check(`[${table}] B는 A 행을 삭제할 수 없음`, !r.error ? r.data.length === 0 : true);
  r = await ca.from(table).select('id, data').eq('id', id);
  check(`[${table}] A 행은 그대로`, !r.error && r.data.length === 1 && r.data[0].data.qa === true, r.data);
  r = await ca.from(table).delete().eq('id', id).select('id');
  check(`[${table}] A가 테스트 행 정리`, !r.error && r.data.length === 1);
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
