-- 그라운드 배틀 완료 기록 — see src/lib/groundBattle/. Same shape/convention
-- as 0028_sparring_sessions.sql: `data` holds the full local
-- GroundBattleMatchRecord JSON (src/lib/groundBattle/types.ts), with a few
-- real columns pulled out for querying. Private to the owning user (no
-- public-read policy) — same privacy stance as sparring_sessions/combos/
-- curricula/user_techniques.

create table if not exists public.ground_battle_matches (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  difficulty text not null,
  mode text not null,
  outcome text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

alter table public.ground_battle_matches enable row level security;

create policy "ground_battle_matches_select_own" on public.ground_battle_matches
  for select using (auth.uid() = user_id);
create policy "ground_battle_matches_insert_own" on public.ground_battle_matches
  for insert with check (auth.uid() = user_id);
create policy "ground_battle_matches_update_own" on public.ground_battle_matches
  for update using (auth.uid() = user_id);
create policy "ground_battle_matches_delete_own" on public.ground_battle_matches
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.ground_battle_matches to authenticated;
