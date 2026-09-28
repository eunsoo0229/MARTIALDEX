-- 21단계 — generic local-data backup (item 10/11's "가능한 경우" data types
-- that aren't individually normalized this stage: skill mastery/overrides,
-- training history, sparring sessions, pose-analysis records, achievements,
-- streak-derived state, target style, my-style analysis). One row per user
-- holding a JSON snapshot of the relevant martialdex:* localStorage keys —
-- this gives every one of those features a genuine "log in on a new device
-- and restore my data" path without a dedicated table + RLS policy set per
-- feature. Curricula/progress get their own real tables (0002_curricula.sql)
-- since they're the most natural fully-relational case.

create table if not exists public.user_backups (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_backups enable row level security;

create policy "user_backups_select_own" on public.user_backups
  for select using (auth.uid() = user_id);
create policy "user_backups_insert_own" on public.user_backups
  for insert with check (auth.uid() = user_id);
create policy "user_backups_update_own" on public.user_backups
  for update using (auth.uid() = user_id);
create policy "user_backups_delete_own" on public.user_backups
  for delete using (auth.uid() = user_id);
