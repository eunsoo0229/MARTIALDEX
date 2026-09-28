-- 영양/식단 관리 (see src/lib/nutrition/). Two new tables, following the
-- same additive "data jsonb + a few real columns" pattern already used by
-- 0006_combos.sql / 0008_training_history.sql / 0020_gym_routines.sql — no
-- existing table (including `profiles`, which stays untouched: nickname/
-- avatar only) is modified. This is a genuinely new domain with no
-- reasonable place to bolt onto an existing table.

-- Singleton per user (goals + BMR body metrics), same "one row per user_id"
-- shape as `profiles` itself — no separate id needed since there is nothing
-- list-shaped to key on.
create table if not exists public.nutrition_profiles (
  user_id uuid not null primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.nutrition_profiles enable row level security;

create policy "nutrition_profiles_select_own" on public.nutrition_profiles
  for select using (auth.uid() = user_id);
create policy "nutrition_profiles_insert_own" on public.nutrition_profiles
  for insert with check (auth.uid() = user_id);
create policy "nutrition_profiles_update_own" on public.nutrition_profiles
  for update using (auth.uid() = user_id);
create policy "nutrition_profiles_delete_own" on public.nutrition_profiles
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.nutrition_profiles to authenticated;

-- One row per recorded meal — list-shaped like gym_routines/training_history,
-- same composite (id, user_id) primary key convention (client-generated
-- text id via crypto.randomUUID(), matching trainingHistory/service.ts).
create table if not exists public.nutrition_meals (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  date text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create index if not exists nutrition_meals_date_idx on public.nutrition_meals (date);

alter table public.nutrition_meals enable row level security;

create policy "nutrition_meals_select_own" on public.nutrition_meals
  for select using (auth.uid() = user_id);
create policy "nutrition_meals_insert_own" on public.nutrition_meals
  for insert with check (auth.uid() = user_id);
create policy "nutrition_meals_update_own" on public.nutrition_meals
  for update using (auth.uid() = user_id);
create policy "nutrition_meals_delete_own" on public.nutrition_meals
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.nutrition_meals to authenticated;
