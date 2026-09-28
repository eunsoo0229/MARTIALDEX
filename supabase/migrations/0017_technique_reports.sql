-- "기술 신고" — replaces any notion of manual/admin review with a simple
-- user-facing report: anyone can flag a problem with ANY technique
-- (official, add_teq, or their own user_techniques — technique_id is
-- stored as a plain text reference, never a foreign key into a specific
-- source table, since official techniques have no DB row to reference at
-- all). A report is purely informational — it never deletes, hides, or
-- otherwise mutates the technique it points at; nothing here changes that.
--
-- Private per-reporting-user (same "auth.uid() = user_id" pattern as
-- training_history/user_techniques): a user can see their own reports,
-- never anyone else's.
create table if not exists public.technique_reports (
  id uuid primary key default gen_random_uuid(),
  technique_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('duplicate', 'not_real', 'incorrect_info', 'wrong_martial_art', 'other')),
  description text,
  -- Purely informational bookkeeping for possible future review — nothing
  -- in this app transitions this value yet, and nothing gates on it (spec:
  -- "자동 삭제/자동 차단 시스템은 만들지 않는다").
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists technique_reports_technique_id_idx on public.technique_reports (technique_id);

-- DB-level backstop for the "동일 사용자가 동일 기술을 이미 신고했다면 새
-- 신고를 만들지 않는다" rule (the app also checks this before inserting,
-- but a partial unique index closes any race between check-then-insert).
-- Scoped to 'open' only, so a different report becomes possible again if
-- an old one is ever reviewed/dismissed — never a hard one-report-forever
-- limit. Different users reporting the same technique is unaffected (the
-- index includes user_id).
create unique index if not exists technique_reports_open_unique
  on public.technique_reports (technique_id, user_id)
  where status = 'open';

alter table public.technique_reports enable row level security;

create policy "technique_reports_select_own" on public.technique_reports
  for select using (auth.uid() = user_id);
create policy "technique_reports_insert_own" on public.technique_reports
  for insert with check (auth.uid() = user_id);
-- No update/delete policy — a submitted report is not something a regular
-- user can edit or retract; a future moderation flow would need its own
-- service-role/RPC path.

grant select, insert on public.technique_reports to authenticated;
