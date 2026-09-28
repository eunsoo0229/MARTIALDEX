-- "기술 추가 요청" — user-submitted techniques (see src/lib/userTechniques/).
-- Same shape/convention as 0002_curricula.sql: `data` holds the full local
-- UserTechniqueRecord JSON object as-is (src/lib/userTechniques/types.ts),
-- with a few real columns pulled out for querying. Deliberately private to
-- the submitting user (no public-read policy) — spec section 16/18 is
-- explicit that a user-added technique must never be exposed to other users
-- without review, and there is no moderation/approval UI yet (section 17/19
-- keep `status` on the record for that future work, but this table's RLS
-- alone is what actually prevents exposure today).

create table if not exists public.user_techniques (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  technique_id text not null,
  martial_art text not null,
  status text not null default 'pending',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

alter table public.user_techniques enable row level security;

create policy "user_techniques_select_own" on public.user_techniques
  for select using (auth.uid() = user_id);
create policy "user_techniques_insert_own" on public.user_techniques
  for insert with check (auth.uid() = user_id);
create policy "user_techniques_update_own" on public.user_techniques
  for update using (auth.uid() = user_id);
create policy "user_techniques_delete_own" on public.user_techniques
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_techniques to authenticated;
