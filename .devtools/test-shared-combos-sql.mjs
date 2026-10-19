// Migration 0037 (사용자 콤보·셋업 공유 + 하트) — runs the REAL SQL file in
// PGlite (Postgres compiled to WASM) with a minimal stand-in for Supabase's
// auth schema (auth.users, auth.uid() from a session setting, anon /
// authenticated roles), then checks RLS, the like-count trigger and the
// period count function as two different users and as a signed-out visitor.
//
// PGlite is not a project dependency: install it anywhere and point PGLITE_DIR
// at that folder's node_modules, e.g.
//   (cd /tmp/pg && npm i @electric-sql/pglite@0.2)
//   PGLITE_DIR=/tmp/pg/node_modules node .devtools/test-shared-combos-sql.mjs
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

// ---- Supabase stand-ins
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  grant usage on schema public to anon, authenticated;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
`);
const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';

const sql = fs.readFileSync(path.join(APP, 'supabase/migrations/0037_shared_combos.sql'), 'utf8');
let migrated = true;
try {
  await db.exec(sql);
} catch (e) {
  migrated = false;
  check('[0] 마이그레이션 SQL 실행', false, e.message);
}
if (migrated) check('[0] 마이그레이션 SQL 실행 (테이블·RLS·트리거·함수 생성)', true);
try {
  await db.exec(sql);
  check('[0b] 같은 마이그레이션을 다시 실행해도 안전 (if not exists / drop if exists)', true);
} catch (e) {
  check('[0b] 같은 마이그레이션을 다시 실행해도 안전', false, e.message);
}

/** Runs statements as a role (and user). Returns rows of the last query, or the error message. */
async function as(role, uid, query, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); select set_config('request.jwt.claim.role', '${role}', false); set role ${role};`);
  try {
    const r = await db.query(query, params);
    return { ok: true, rows: r.rows };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await db.exec('reset role;');
  }
}
const steps = JSON.stringify([{ techniqueId: 'boxing__jab', name: 'Jab', martialArt: 'boxing' }]);
const ins = (id, author, extra = '') => `insert into public.shared_combos (id, author_id, author_nickname, kind, name, purpose, steps${extra ? ', ' + extra.split('=')[0] : ''}) values ('${id}', '${author}', 'nick', 'setup', '잽 셋업', '잽을 맞추기 위한 셋업', '${steps}'::jsonb${extra ? ', ' + extra.split('=')[1] : ''})`;

let r = await as('authenticated', U1, ins('c1', U1));
check('[1] 로그인한 사용자는 자기 이름으로 공유 가능', r.ok, r.error);
r = await as('authenticated', U1, ins('c2', U2));
check('[2] 다른 사람 이름(author_id)으로는 공유 불가 (RLS)', !r.ok, r.error);
r = await as('anon', null, ins('c3', U1));
check('[3] 로그아웃 상태에서는 공유 불가', !r.ok, r.error);
r = await as('authenticated', U1, ins('c4', U1, `like_count=999`));
const c4 = await as('anon', null, `select like_count from public.shared_combos where id = 'c4'`);
check('[4] 공유할 때 하트 수를 직접 넣어도 무시됨 (트리거가 실제 개수로)', r.ok && c4.rows[0]?.like_count === 0, { r, c4: c4.rows });
r = await as('anon', null, `select id, purpose from public.shared_combos order by id`);
check('[5] 로그아웃 상태에서도 공유된 콤보 목록 보기 가능', r.ok && r.rows.length === 2, r.rows ?? r.error);

r = await as('authenticated', U2, `update public.shared_combos set name = '탈취' where id = 'c1' returning id`);
check('[6] 남의 공유 콤보는 수정 불가', r.ok && r.rows.length === 0, r);
r = await as('authenticated', U2, `delete from public.shared_combos where id = 'c1' returning id`);
check('[7] 남의 공유 콤보는 삭제 불가', r.ok && r.rows.length === 0, r);
r = await as('authenticated', U1, `update public.shared_combos set like_count = 500, author_id = '${U2}' where id = 'c1' returning like_count, author_id`);
check('[8] 작성자도 하트 수·작성자는 바꿀 수 없음', r.ok && r.rows[0]?.like_count === 0 && r.rows[0]?.author_id === U1, r.rows ?? r.error);

// ---- hearts
r = await as('authenticated', U2, `insert into public.shared_combo_likes (combo_id, user_id) values ('c1', '${U2}')`);
const r2 = await as('authenticated', U1, `insert into public.shared_combo_likes (combo_id, user_id) values ('c1', '${U1}')`);
let cnt = await as('anon', null, `select like_count from public.shared_combos where id = 'c1'`);
check('[9] 하트 2개 → like_count 2 (트리거 집계)', r.ok && r2.ok && cnt.rows[0].like_count === 2, { cnt: cnt.rows, r, r2 });
r = await as('authenticated', U2, `insert into public.shared_combo_likes (combo_id, user_id) values ('c1', '${U2}')`);
check('[10] 같은 사람이 두 번 하트 불가 (중복 키)', !r.ok && /duplicate|unique/i.test(r.error), r.error);
r = await as('authenticated', U2, `insert into public.shared_combo_likes (combo_id, user_id) values ('c4', '${U1}')`);
check('[11] 남의 이름으로 하트 불가', !r.ok, r.error);
r = await as('authenticated', U2, `select combo_id, user_id from public.shared_combo_likes`);
check('[12] 하트 목록은 내 것만 보임 (누가 눌렀는지 공개 안 함)', r.ok && r.rows.length === 1 && r.rows[0].user_id === U2, r.rows);
r = await as('anon', null, `select * from public.shared_combo_likes`);
check('[13] 로그아웃 상태에서는 하트 행 조회 불가', !r.ok || r.rows.length === 0, r.rows ?? r.error);

// ---- period counts
await db.exec(`update public.shared_combo_likes set created_at = now() - interval '40 days' where user_id = '${U1}'`);
r = await as('anon', null, `select * from public.shared_combo_like_counts(now() - interval '7 days')`);
check('[14] 기간별 하트 집계: 이번 주에 눌린 하트만 (40일 전 하트 제외)', r.ok && r.rows.length === 1 && Number(r.rows[0].likes) === 1, r.rows ?? r.error);
r = await as('anon', null, `select * from public.shared_combo_like_counts(now() - interval '365 days')`);
check('[15] 올해 기준이면 둘 다 집계', r.ok && Number(r.rows[0].likes) === 2, r.rows);
check('[16] 집계 결과에는 사용자 정보가 없음 (combo_id, likes만)', r.ok && Object.keys(r.rows[0]).sort().join(',') === 'combo_id,likes', Object.keys(r.rows[0] ?? {}));

r = await as('authenticated', U2, `delete from public.shared_combo_likes where combo_id = 'c1' and user_id = '${U2}'`);
cnt = await as('anon', null, `select like_count from public.shared_combos where id = 'c1'`);
check('[17] 하트 취소 → like_count 감소', r.ok && cnt.rows[0].like_count === 1, cnt.rows);
r = await as('authenticated', U1, `delete from public.shared_combo_likes where combo_id = 'c1' and user_id = '${U2}' returning *`);
check('[18] 남의 하트는 취소 불가', r.ok && r.rows.length === 0, r);

// ---- validation & cascade
r = await as('authenticated', U1, `insert into public.shared_combos (id, author_id, author_nickname, kind, name, purpose, steps) values ('bad', '${U1}', 'n', 'combo', '빈 단계', '목적', '[]'::jsonb)`);
check('[19] 기술 0개 공유는 DB에서도 거부', !r.ok, r.error);
r = await as('authenticated', U1, `insert into public.shared_combos (id, author_id, author_nickname, kind, name, purpose, steps) values ('bad2', '${U1}', 'n', 'combo', '목적 없음', '', '${steps}'::jsonb)`);
check('[20] 목적 없는 공유는 DB에서도 거부', !r.ok, r.error);
r = await as('authenticated', U1, ins('c5', U1, `source_ref='combo:abc'`));
const dup = await as('authenticated', U1, ins('c6', U1, `source_ref='combo:abc'`));
check('[21] 같은 원본(source_ref)은 한 번만 공유 (다시 공유는 갱신으로)', r.ok && !dup.ok, dup.error);
r = await as('authenticated', U1, `delete from public.shared_combos where id = 'c1' returning id`);
const orphan = await db.query(`select count(*)::int as n from public.shared_combo_likes where combo_id = 'c1'`);
check('[22] 공유 취소 시 그 콤보의 하트도 함께 삭제', r.ok && r.rows.length === 1 && orphan.rows[0].n === 0, orphan.rows);

const failed = results.filter((x) => !x.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
