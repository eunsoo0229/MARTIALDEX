-- 21단계 — user curricula + progress (the "core sync" subset of item 11;
-- everything else in that list rides on the generic backup table in
-- 0003_user_backups.sql instead of being individually normalized this
-- stage). Each row's `data` column holds the full local Curriculum /
-- CurriculumProgress JSON object as-is (see src/lib/curriculum/types.ts),
-- so existing local-first read/write code needs no shape changes to
-- round-trip through here — a small set of real columns are pulled out
-- alongside it purely so rows are queryable/inspectable, not just an opaque
-- blob.

create table if not exists public.curricula (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  martial_art text not null,
  total_days integer not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

alter table public.curricula enable row level security;

create policy "curricula_select_own" on public.curricula
  for select using (auth.uid() = user_id);
create policy "curricula_insert_own" on public.curricula
  for insert with check (auth.uid() = user_id);
create policy "curricula_update_own" on public.curricula
  for update using (auth.uid() = user_id);
create policy "curricula_delete_own" on public.curricula
  for delete using (auth.uid() = user_id);

create table if not exists public.curriculum_progress (
  curriculum_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (curriculum_id, user_id)
);

alter table public.curriculum_progress enable row level security;

create policy "curriculum_progress_select_own" on public.curriculum_progress
  for select using (auth.uid() = user_id);
create policy "curriculum_progress_insert_own" on public.curriculum_progress
  for insert with check (auth.uid() = user_id);
create policy "curriculum_progress_update_own" on public.curriculum_progress
  for update using (auth.uid() = user_id);
create policy "curriculum_progress_delete_own" on public.curriculum_progress
  for delete using (auth.uid() = user_id);
