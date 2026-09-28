-- 자유훈련 스파링 기록 — see src/lib/sparringSession/. Same shape/convention
-- as 0006_combos.sql: `data` holds the full local SparringSessionRecord JSON
-- object as-is (src/lib/sparringSession/types.ts), with a couple of real
-- columns pulled out for querying. Private to the owning user (no
-- public-read policy) — same privacy stance as combos/curricula/
-- user_techniques. Deliberately a NEW, separate table from the existing
-- video-analysis-only sparring_analysis local store (src/lib/sparringAnalysis/,
-- which has no Supabase table at all) — that type's fields are all derived
-- from processing an uploaded video and would be meaningless/fabricated for
-- a manual rules+timer session log.

create table if not exists public.sparring_sessions (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  martial_art text not null,
  date text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

alter table public.sparring_sessions enable row level security;

create policy "sparring_sessions_select_own" on public.sparring_sessions
  for select using (auth.uid() = user_id);
create policy "sparring_sessions_insert_own" on public.sparring_sessions
  for insert with check (auth.uid() = user_id);
create policy "sparring_sessions_update_own" on public.sparring_sessions
  for update using (auth.uid() = user_id);
create policy "sparring_sessions_delete_own" on public.sparring_sessions
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.sparring_sessions to authenticated;
