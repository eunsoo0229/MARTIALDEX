-- "add_teq" — the shared/public technique library that AI-driven discovery
-- (AI 콤비네이션, AI 맞춤 커리큘럼, 선수 스타일 커리큘럼, 기술 추가 요청) registers
-- newly-verified real techniques into, distinct from `user_techniques`
-- (0005_user_techniques.sql), which stays exactly as-is and remains
-- per-user/private (a technique a user added while logged out, or before
-- this feature existed, is never migrated here automatically).
--
-- Unlike every other table in this app, this one is NOT scoped by
-- `user_id` — a technique discovered by one user must be resolvable by
-- every other user (spec section 2), so there is no `(id, user_id)`
-- composite key, just a plain `id` primary key shared across accounts.
--
-- Every field the encyclopedia's Technique type has gets its own real
-- column (not just folded into `data`) so the table stays independently
-- queryable/filterable by martial_art/status/etc., while `data jsonb`
-- still holds the complete Technique object as-is (same "queryable columns
-- + a jsonb blob" convention as curricula/combos/tactics/training_history —
-- see those migrations' own comments), so the exact local Technique shape
-- round-trips through here with zero translation on read.
create table if not exists public.add_teq (
  id text primary key,
  martial_art text not null,
  name text not null,
  korean_name text,
  aliases text[] not null default '{}',
  category text not null,
  description text not null,
  purpose text,
  principles text[] not null default '{}',
  difficulty text,
  tags text[] not null default '{}',
  positions text[] not null default '{}',
  variations text[] not null default '{}',
  counters text[] not null default '{}',
  defenses text[] not null default '{}',
  transitions text[] not null default '{}',
  related_techniques text[] not null default '{}',
  related_martial_arts text[] not null default '{}',
  youtube_search_query text,
  videos jsonb not null default '[]'::jsonb,
  posture jsonb,
  source text not null default 'user_added',
  -- pending | approved | rejected — every new discovery starts 'pending'.
  -- No moderation UI exists yet (nothing ever transitions this value in
  -- this iteration) — see the RLS policies below for how 'pending' is
  -- still safely usable by the AI features that just discovered it.
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data jsonb not null
);

create index if not exists add_teq_martial_art_idx on public.add_teq (martial_art);
create index if not exists add_teq_status_idx on public.add_teq (status);

alter table public.add_teq enable row level security;

-- SELECT: any authenticated user can read the whole shared library
-- (including 'pending' rows) — the discovery pipeline's own dedup/reuse
-- (spec section 10) depends on every AI feature being able to see what any
-- other user already discovered, regardless of moderation status; a
-- separate "일반 브라우징" approved-only filter, if ever added, belongs in
-- application code, not RLS, since discovery correctness must not depend
-- on it. Matches this project's existing convention of granting nothing to
-- `anon` (every other table here does the same).
create policy "add_teq_select_authenticated" on public.add_teq
  for select
  to authenticated
  using (true);

-- INSERT: any authenticated user may register a newly-discovered technique
-- (spec section 17's "안전한 인증된 저장 경로") — there is no per-row owner
-- column to check against, since this table is intentionally not
-- per-user data.
create policy "add_teq_insert_authenticated" on public.add_teq
  for insert
  to authenticated
  with check (auth.uid() is not null);

-- No UPDATE/DELETE policy for regular users — RLS default-denies both
-- (spec section 17: "일반 사용자가 다른 기술을 임의로 수정/삭제할 수 있으면 안 된다").
-- A future moderation UI would need its own service-role/RPC path, not a
-- client-facing policy.

grant select, insert on public.add_teq to authenticated;
