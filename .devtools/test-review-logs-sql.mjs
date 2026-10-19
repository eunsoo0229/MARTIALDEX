// Migration 0038 (review_logs / coach_lesson_logs) — runs the REAL SQL file
// in PGlite with a minimal Supabase auth stand-in and checks own-row RLS as
// two users and as a signed-out visitor. Same harness as
// test-shared-combos-sql.mjs:
//   PGLITE_DIR=/path/to/node_modules node .devtools/test-review-logs-sql.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = process.env.PGLITE_DIR;
if (!dir) {
  console.log('NOT TESTED — set PGLITE_DIR to a node_modules folder containing @electric-sql/pglite');
  process.exit(2);
}
const { PGlite } = await import(pathToFileURL(path.join(dir, '@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail !== '' ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''));
}

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public to anon, authenticated;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
`);
const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
const sql = fs.readFileSync(path.join(APP, 'supabase/migrations/0038_review_and_lesson_logs.sql'), 'utf8');
try {
  await db.exec(sql);
  check('[0] 0038 SQL 실행', true);
} catch (e) {
  check('[0] 0038 SQL 실행', false, e.message);
}
try {
  await db.exec(sql);
  check('[0b] 다시 실행해도 안전', true);
} catch (e) {
  check('[0b] 다시 실행해도 안전', false, e.message);
}

async function as(role, uid, query) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${role};`);
  try {
    const r = await db.query(query);
    return { ok: true, rows: r.rows };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await db.exec('reset role;');
  }
}

for (const [table, extraCol, extraVal] of [['review_logs', 'mode', "'ai'"], ['coach_lesson_logs', 'date', "'2026-10-15'"]]) {
  const ins = (id, uid) => `insert into public.${table} (id, user_id, ${extraCol}, data) values ('${id}', '${uid}', ${extraVal}, '{"id":"${id}"}'::jsonb)`;
  let r = await as('authenticated', U1, ins('a', U1));
  check(`[${table}] 본인 행 추가`, r.ok, r.error ?? '');
  r = await as('authenticated', U1, ins('b', U2));
  check(`[${table}] 다른 사용자 명의로 추가 불가`, !r.ok);
  r = await as('anon', null, ins('c', U1));
  check(`[${table}] 비로그인 추가 불가`, !r.ok);
  r = await as('authenticated', U2, ins('a', U2));
  check(`[${table}] 같은 id라도 사용자별로 따로 저장 (PK id,user_id)`, r.ok, r.error ?? '');
  r = await as('authenticated', U2, `select id, user_id from public.${table}`);
  check(`[${table}] 다른 사용자 행은 조회되지 않음`, r.ok && r.rows.length === 1 && r.rows[0].user_id === U2, r.rows ?? r.error);
  r = await as('anon', null, `select id from public.${table}`);
  check(`[${table}] 비로그인 조회 결과 없음`, !r.ok || r.rows.length === 0, r.rows ?? r.error);
  r = await as('authenticated', U2, `update public.${table} set data = '{"x":1}'::jsonb where user_id = '${U1}' returning id`);
  check(`[${table}] 다른 사용자 행 수정 불가`, !r.ok || r.rows.length === 0);
  r = await as('authenticated', U1, `update public.${table} set user_id = '${U2}' where id = 'a' and user_id = '${U1}' returning id`);
  check(`[${table}] 본인 행의 소유자를 바꿀 수 없음`, !r.ok || r.rows.length === 0, r.rows ?? r.error);
  r = await as('authenticated', U2, `delete from public.${table} where user_id = '${U1}' returning id`);
  check(`[${table}] 다른 사용자 행 삭제 불가`, !r.ok || r.rows.length === 0);
  r = await as('authenticated', U1, `select count(*)::int as n from public.${table}`);
  check(`[${table}] U1 행은 그대로 1건`, r.ok && r.rows[0].n === 1, r.rows ?? r.error);
}
const bad = await as('authenticated', U1, `insert into public.review_logs (id, user_id, mode, data) values ('z', '${U1}', 'bogus', '{}'::jsonb)`);
check('[review_logs] 알 수 없는 mode 값 거부', !bad.ok);
const th = await db.query(`select count(*)::int as n from information_schema.tables where table_name = 'training_history'`);
check('[0] 0038은 training_history를 만들거나 건드리지 않음', th.rows[0].n === 0);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
