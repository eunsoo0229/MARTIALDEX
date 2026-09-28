-- 21단계 — 커스텀 콤보 북 (see src/lib/combo/). Same shape/convention as
-- 0002_curricula.sql: `data` holds the full local Combo JSON object as-is
-- (src/lib/combo/types.ts), with a couple of real columns pulled out for
-- querying. Private to the owning user (no public-read policy) — a combo is
-- personal training content, same privacy stance as curricula/user_techniques.

create table if not exists public.combos (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

alter table public.combos enable row level security;

create policy "combos_select_own" on public.combos
  for select using (auth.uid() = user_id);
create policy "combos_insert_own" on public.combos
  for insert with check (auth.uid() = user_id);
create policy "combos_update_own" on public.combos
  for update using (auth.uid() = user_id);
create policy "combos_delete_own" on public.combos
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.combos to authenticated;
