-- 복습 기록 / AI 코치 수업 기록 — see src/lib/review/reviewLog.ts and
-- src/lib/coachLesson/lessonLog.ts. Same shape/convention as
-- 0028_sparring_sessions.sql: `data` holds the full local JSON entry as-is.
-- Private to the owning user (no public-read policy).
--
-- review_logs is deliberately SEPARATE from training_history: reviewing a
-- past training/lesson is not doing it again, so it must never be counted
-- as a training session. Additive only — no existing table is touched.

create table if not exists public.review_logs (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in ('training', 'lesson', 'gym', 'weak', 'ai')),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

alter table public.review_logs enable row level security;

drop policy if exists "review_logs_select_own" on public.review_logs;
create policy "review_logs_select_own" on public.review_logs
  for select using (auth.uid() = user_id);
drop policy if exists "review_logs_insert_own" on public.review_logs;
create policy "review_logs_insert_own" on public.review_logs
  for insert with check (auth.uid() = user_id);
drop policy if exists "review_logs_update_own" on public.review_logs;
create policy "review_logs_update_own" on public.review_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "review_logs_delete_own" on public.review_logs;
create policy "review_logs_delete_own" on public.review_logs
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.review_logs to authenticated;

create table if not exists public.coach_lesson_logs (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  date text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

alter table public.coach_lesson_logs enable row level security;

drop policy if exists "coach_lesson_logs_select_own" on public.coach_lesson_logs;
create policy "coach_lesson_logs_select_own" on public.coach_lesson_logs
  for select using (auth.uid() = user_id);
drop policy if exists "coach_lesson_logs_insert_own" on public.coach_lesson_logs;
create policy "coach_lesson_logs_insert_own" on public.coach_lesson_logs
  for insert with check (auth.uid() = user_id);
drop policy if exists "coach_lesson_logs_update_own" on public.coach_lesson_logs;
create policy "coach_lesson_logs_update_own" on public.coach_lesson_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "coach_lesson_logs_delete_own" on public.coach_lesson_logs;
create policy "coach_lesson_logs_delete_own" on public.coach_lesson_logs
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.coach_lesson_logs to authenticated;
