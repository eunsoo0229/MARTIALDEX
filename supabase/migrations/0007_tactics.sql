-- 22단계 — 상황별 전술 셋업 (see src/lib/tactic/). Same shape/convention as
-- 0002_curricula.sql / 0006_combos.sql: `data` holds the full local Tactic
-- JSON object as-is (src/lib/tactic/types.ts), with a couple of real
-- columns pulled out for querying. Private to the owning user (no
-- public-read policy) — same privacy stance as combos/user_techniques.

create table if not exists public.tactics (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

alter table public.tactics enable row level security;

create policy "tactics_select_own" on public.tactics
  for select using (auth.uid() = user_id);
create policy "tactics_insert_own" on public.tactics
  for insert with check (auth.uid() = user_id);
create policy "tactics_update_own" on public.tactics
  for update using (auth.uid() = user_id);
create policy "tactics_delete_own" on public.tactics
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.tactics to authenticated;
