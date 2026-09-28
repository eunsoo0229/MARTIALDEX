-- 26단계 — Training Analytics (see src/lib/trainingHistory/). Same
-- shape/convention as 0006_combos.sql / 0007_tactics.sql: `data` holds the
-- full local TrainingHistoryEntry JSON object as-is
-- (src/lib/trainingHistory/types.ts), with a couple of real columns pulled
-- out for querying. Entries are append-only (never edited after creation —
-- see trainingHistory/service.ts), so the sync merge only ever needs to
-- know "does this id already exist," never "which side is newer."
-- Private to the owning user (no public-read policy).

create table if not exists public.training_history (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  date text not null,
  completed_at timestamptz not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

alter table public.training_history enable row level security;

create policy "training_history_select_own" on public.training_history
  for select using (auth.uid() = user_id);
create policy "training_history_insert_own" on public.training_history
  for insert with check (auth.uid() = user_id);
create policy "training_history_update_own" on public.training_history
  for update using (auth.uid() = user_id);
create policy "training_history_delete_own" on public.training_history
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.training_history to authenticated;
