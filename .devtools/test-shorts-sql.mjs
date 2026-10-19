// Migration 0039 (숏폼 tags + comment likes) on top of the real community migrations, in PGlite.
//   PGLITE_DIR=/path/to/node_modules node .devtools/test-shorts-sql.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = process.env.PGLITE_DIR;
if (!dir) {
  console.log('NOT TESTED — set PGLITE_DIR');
  process.exit(2);
}
const { PGlite } = await import(pathToFileURL(path.join(dir, '@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
const results = [];
const check = (n, p, d = '') => (results.push(p), console.log((p ? 'PASS' : 'FAIL') + ' — ' + n + (d !== '' ? ' :: ' + JSON.stringify(d).slice(0, 240) : '')));
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select case when current_setting('request.jwt.claim.sub', true) is null or current_setting('request.jwt.claim.sub', true) = '' then 'anon' else 'authenticated' end $$;
  grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated; grant execute on function auth.role() to anon, authenticated;
  insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
  create table public.gyms (id text primary key);  -- stand-in: 0026 only references it
  create schema storage;  -- stand-in for Supabase Storage (0026 adds a media bucket + policies)
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id text primary key, bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
`);
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222';
for (const f of ['0026_community_posts.sql', '0027_community_posts_public_read.sql', '0030_community_comment_replies.sql', '0039_shorts_tags_comment_likes.sql']) {
  try {
    await db.exec(fs.readFileSync(path.join(APP, 'supabase/migrations', f), 'utf8'));
  } catch (e) {
    check(`[0] ${f} 실행`, false, e.message);
  }
}
try {
  await db.exec(fs.readFileSync(path.join(APP, 'supabase/migrations/0039_shorts_tags_comment_likes.sql'), 'utf8'));
  check('[0] 0039 다시 실행해도 안전', true);
} catch (e) {
  check('[0] 0039 다시 실행해도 안전', false, e.message);
}
async function as(role, uid, q) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${role};`);
  try {
    const r = await db.query(q);
    return { ok: true, rows: r.rows };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await db.exec('reset role;');
  }
}
const tag = (i) => `{"type":"technique","id":"boxing__jab${i}","name":"Jab","martialArt":"boxing"}`;
let r = await as('authenticated', U1, `insert into public.community_posts (id, author_id, author_nickname, content, post_type, tags) values ('p1', '${U1}', 'a', 'x', 'media', '[${tag(1)}]'::jsonb) returning tags`);
check('[태그] 게시물에 기술 태그 저장', r.ok && r.rows[0].tags[0].id === 'boxing__jab1', r.error ?? r.rows);
r = await as('authenticated', U1, `insert into public.community_posts (id, author_id, author_nickname, content, post_type) values ('p2', '${U1}', 'a', 'x', 'text') returning tags`);
check('[태그] 태그 없이 올리면 빈 목록 (기존 게시물 호환)', r.ok && Array.isArray(r.rows[0].tags) && r.rows[0].tags.length === 0);
r = await as('authenticated', U1, `insert into public.community_posts (id, author_id, author_nickname, content, post_type, tags) values ('p3', '${U1}', 'a', 'x', 'text', '[${Array.from({ length: 11 }, (_, i) => tag(i)).join(',')}]'::jsonb)`);
check('[태그] 11개 이상은 거부', !r.ok);
r = await as('authenticated', U1, `insert into public.community_posts (id, author_id, author_nickname, content, post_type, tags) values ('p4', '${U1}', 'a', 'x', 'text', '{"a":1}'::jsonb)`);
check('[태그] 배열이 아니면 거부', !r.ok);

await as('authenticated', U1, `insert into public.community_post_comments (id, post_id, author_id, author_nickname, content) values ('c1', 'p1', '${U1}', 'a', '첫 댓글')`);
r = await as('authenticated', U2, `insert into public.community_comment_likes (comment_id, user_id) values ('c1', '${U2}')`);
check('[좋아요] 다른 사용자가 댓글 좋아요', r.ok, r.error ?? '');
await as('authenticated', U1, `insert into public.community_comment_likes (comment_id, user_id) values ('c1', '${U1}')`);
r = await as('anon', null, `select like_count from public.community_post_comments where id = 'c1'`);
check('[좋아요] like_count가 트리거로 2 (비로그인도 조회 가능)', r.ok && r.rows[0].like_count === 2, r.rows ?? r.error);
r = await as('authenticated', U1, `insert into public.community_comment_likes (comment_id, user_id) values ('c1', '${U2}')`);
check('[좋아요] 남의 명의로 좋아요 불가', !r.ok);
r = await as('authenticated', U2, `insert into public.community_comment_likes (comment_id, user_id) values ('c1', '${U2}')`);
check('[좋아요] 같은 사람 중복 좋아요 불가', !r.ok);
r = await as('authenticated', U2, `delete from public.community_comment_likes where comment_id = 'c1' and user_id = '${U1}' returning user_id`);
check('[좋아요] 남의 좋아요 취소 불가', !r.ok || r.rows.length === 0);
await as('authenticated', U2, `delete from public.community_comment_likes where comment_id = 'c1' and user_id = '${U2}'`);
r = await as('anon', null, `select like_count from public.community_post_comments where id = 'c1'`);
check('[좋아요] 취소하면 like_count 감소 (1)', r.ok && r.rows[0].like_count === 1, r.rows);
r = await as('authenticated', U1, `insert into public.community_post_comments (id, post_id, author_id, author_nickname, content, like_count) values ('c2', 'p1', '${U1}', 'a', '조작', 999) returning like_count`);
check('[좋아요] 클라이언트가 like_count를 조작할 수 없음 (0으로 보정)', r.ok && r.rows[0].like_count === 0, r.rows ?? r.error);
r = await as('authenticated', U1, `insert into public.community_post_comments (id, post_id, author_id, author_nickname, content, parent_comment_id) values ('c3', 'p1', '${U1}', 'a', '답글', 'c1')`);
r = await as('anon', null, `select reply_count, like_count from public.community_post_comments where id = 'c1'`);
check('[호환] 기존 답글 수(reply_count) 트리거도 그대로 동작', r.ok && r.rows[0].reply_count === 1 && r.rows[0].like_count === 1, r.rows);
await as('authenticated', U1, `delete from public.community_post_comments where id = 'c1'`);
r = await db.query(`select count(*)::int as n from public.community_comment_likes where comment_id = 'c1'`);
check('[정리] 댓글 삭제 시 좋아요도 함께 삭제', r.rows[0].n === 0);

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
