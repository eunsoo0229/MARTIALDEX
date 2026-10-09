-- 체육관 실시간 훈련 (관장 → 서버 → 학생 기기 동기화). See src/lib/gymLive/.
--
-- The session row is the single authoritative state. Clients never send
-- timer values: every state change goes through a SECURITY DEFINER RPC
-- below that checks the caller is this gym's instructor (is_gym_instructor
-- from 0023) and stamps the SERVER clock (now()). Each device then derives
-- the current set / WORK / REST / remaining time itself from
--   elapsed = anchor_elapsed_ms + (server_now - anchor_at)   while running
--   elapsed = anchor_elapsed_ms                             while paused
-- where elapsed is "timeline time" (pauses excluded) and the phase layout is
-- fixed: set k's WORK starts at k*(work+rest); no REST after the last set.
--
-- `segments` records the elapsed intervals actually lived ([[from,to],...],
-- closed on pause / next-set skip / end), so completed sets are computed
-- from real time spent in each WORK window — a set the coach skipped or
-- ended early is never recorded as completed.
--
-- A student's own training record stays in their own training_history row
-- (self-only RLS, unchanged), written by the student's device when it sees a
-- terminal status — exactly like gym_class_attendance (0022). Instructors
-- only ever see session/participant rows, never a student's history.

create table if not exists public.gym_live_sessions (
  id text not null primary key,
  gym_id text not null references public.gyms (id) on delete cascade,
  coach_user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('drill', 'sparring')),
  title text not null,
  technique_id text,
  technique_name text,
  martial_art text,
  work_seconds integer not null check (work_seconds between 5 and 3600),
  rest_seconds integer not null check (rest_seconds between 0 and 3600),
  total_sets integer not null check (total_sets between 1 and 50),
  status text not null default 'ready' check (status in ('ready', 'running', 'paused', 'completed', 'cancelled', 'interrupted')),
  anchor_at timestamptz,
  anchor_elapsed_ms bigint not null default 0,
  segments jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  ended_elapsed_ms bigint,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gym_live_sessions_gym_idx on public.gym_live_sessions (gym_id, status);

-- One row per student in a session. `pairings` holds ONLY this student's
-- own rounds ([{round, opponentUserId, opponentNickname}], opponent null =
-- 대기), so a student never receives other matches.
create table if not exists public.gym_live_participants (
  session_id text not null references public.gym_live_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  gym_id text not null references public.gyms (id) on delete cascade,
  nickname text not null,
  pairings jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  recorded_at timestamptz,
  primary key (session_id, user_id)
);

-- 중복 세션 방지: a student can be in at most ONE active live session.
create unique index if not exists gym_live_participants_one_active on public.gym_live_participants (user_id) where active;
create index if not exists gym_live_participants_user_idx on public.gym_live_participants (user_id);

alter table public.gym_live_sessions enable row level security;
alter table public.gym_live_participants enable row level security;

-- SECURITY DEFINER helper so the sessions policy can check participation
-- without re-entering participants' RLS (same recursion-avoidance pattern as 0023).
create or replace function public.is_gym_live_participant(p_session_id text, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.gym_live_participants where session_id = p_session_id and user_id = p_user_id);
$$;
revoke all on function public.is_gym_live_participant(text, uuid) from public;
grant execute on function public.is_gym_live_participant(text, uuid) to authenticated;

create policy "gym_live_sessions_select" on public.gym_live_sessions
  for select using (
    public.is_gym_instructor(gym_id, auth.uid()) or public.is_gym_live_participant(id, auth.uid())
  );
create policy "gym_live_participants_select" on public.gym_live_participants
  for select using (
    user_id = auth.uid() or public.is_gym_instructor(gym_id, auth.uid())
  );

-- Read-only for clients; every write goes through the RPCs below.
grant select on public.gym_live_sessions to authenticated;
grant select on public.gym_live_participants to authenticated;

-- ---------- helpers ----------

create or replace function public.gym_live_elapsed_ms(s public.gym_live_sessions)
returns bigint
language sql
stable
as $$
  select case
    when s.status = 'running' and s.anchor_at is not null
      then s.anchor_elapsed_ms + floor(extract(epoch from (now() - s.anchor_at)) * 1000)::bigint
    else s.anchor_elapsed_ms
  end;
$$;

create or replace function public.gym_live_total_ms(s public.gym_live_sessions)
returns bigint
language sql
immutable
as $$
  select (s.total_sets * s.work_seconds + (s.total_sets - 1) * s.rest_seconds)::bigint * 1000;
$$;

/** Server clock for client offset estimation (remaining = anchor math in server time). */
create or replace function public.gym_live_server_now()
returns timestamptz
language sql
stable
as $$ select now(); $$;
grant execute on function public.gym_live_server_now() to authenticated;

-- ---------- create ----------

-- p_participants: [{ "userId": uuid, "nickname": text, "pairings": [...] }]
-- Raises 'ACTIVE_SESSION:<nick>,<nick>' when a participant is already in an
-- active session and p_replace_active is false; with p_replace_active the
-- other session(s) are ended first (recorded as interrupted/cancelled by the
-- same rules as an explicit end).
create or replace function public.gym_live_create(
  p_id text,
  p_gym_id text,
  p_kind text,
  p_title text,
  p_technique_id text,
  p_technique_name text,
  p_martial_art text,
  p_work_seconds integer,
  p_rest_seconds integer,
  p_total_sets integer,
  p_participants jsonb,
  p_replace_active boolean default false
)
returns public.gym_live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_busy text;
  v_other text;
  v_row public.gym_live_sessions;
  v_p jsonb;
begin
  if v_uid is null or not public.is_gym_instructor(p_gym_id, v_uid) then
    raise exception 'NOT_INSTRUCTOR' using errcode = '42501';
  end if;
  if jsonb_typeof(p_participants) <> 'array' or jsonb_array_length(p_participants) = 0 then
    raise exception 'NO_PARTICIPANTS';
  end if;
  if p_kind = 'sparring' and jsonb_array_length(p_participants) < 2 then
    raise exception 'SPARRING_NEEDS_TWO';
  end if;
  -- every participant must be a student of THIS gym
  if exists (
    select 1 from jsonb_array_elements(p_participants) p
    where not exists (
      select 1 from public.gym_members m
      where m.gym_id = p_gym_id and m.user_id = (p ->> 'userId')::uuid and m.role = 'student'
    )
  ) then
    raise exception 'NOT_GYM_STUDENT';
  end if;

  select string_agg(gp.nickname, ',') into v_busy
  from public.gym_live_participants gp
  where gp.active and gp.user_id in (select (p ->> 'userId')::uuid from jsonb_array_elements(p_participants) p);

  if v_busy is not null then
    if not p_replace_active then
      raise exception 'ACTIVE_SESSION:%', v_busy;
    end if;
    for v_other in
      select distinct gp.session_id from public.gym_live_participants gp
      where gp.active and gp.user_id in (select (p ->> 'userId')::uuid from jsonb_array_elements(p_participants) p)
    loop
      perform public.gym_live_finish_internal(v_other, 'end');
    end loop;
  end if;

  insert into public.gym_live_sessions (id, gym_id, coach_user_id, kind, title, technique_id, technique_name, martial_art, work_seconds, rest_seconds, total_sets)
  values (p_id, p_gym_id, v_uid, p_kind, p_title, p_technique_id, p_technique_name, p_martial_art, p_work_seconds, p_rest_seconds, p_total_sets)
  returning * into v_row;

  for v_p in select * from jsonb_array_elements(p_participants) loop
    insert into public.gym_live_participants (session_id, user_id, gym_id, nickname, pairings)
    values (p_id, (v_p ->> 'userId')::uuid, p_gym_id, coalesce(v_p ->> 'nickname', '학생'), coalesce(v_p -> 'pairings', '[]'::jsonb));
  end loop;

  return v_row;
end;
$$;

-- ---------- terminal transitions (shared) ----------

-- p_mode: 'end' (coach 종료: completed if the whole timeline was lived,
-- otherwise interrupted; never-started → cancelled), 'cancel', or 'due'
-- (natural completion, only if the timeline really reached its end).
create or replace function public.gym_live_finish_internal(p_id text, p_mode text)
returns public.gym_live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.gym_live_sessions;
  v_e bigint;
  v_total bigint;
  v_status text;
begin
  select * into s from public.gym_live_sessions where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if s.status in ('completed', 'cancelled', 'interrupted') then return s; end if;

  v_total := public.gym_live_total_ms(s);
  v_e := least(public.gym_live_elapsed_ms(s), v_total);

  if p_mode = 'due' then
    if s.status <> 'running' or public.gym_live_elapsed_ms(s) < v_total then return s; end if;
    v_status := 'completed';
  elsif p_mode = 'cancel' or s.status = 'ready' then
    v_status := 'cancelled';
  elsif v_e >= v_total then
    v_status := 'completed';
  else
    v_status := 'interrupted';
  end if;

  update public.gym_live_sessions set
    status = v_status,
    segments = case when s.status = 'running' then segments || jsonb_build_array(jsonb_build_array(s.anchor_elapsed_ms, v_e)) else segments end,
    anchor_elapsed_ms = v_e,
    anchor_at = now(),
    ended_at = now(),
    ended_elapsed_ms = v_e,
    version = version + 1,
    updated_at = now()
  where id = p_id
  returning * into s;

  update public.gym_live_participants set active = false where session_id = p_id;
  return s;
end;
$$;
revoke all on function public.gym_live_finish_internal(text, text) from public;

-- ---------- coach controls ----------

create or replace function public.gym_live_control(p_id text, p_action text)
returns public.gym_live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.gym_live_sessions;
  v_e bigint;
  v_total bigint;
  v_cycle bigint;
  v_target bigint;
begin
  select * into s from public.gym_live_sessions where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if auth.uid() is null or not public.is_gym_instructor(s.gym_id, auth.uid()) then
    raise exception 'NOT_INSTRUCTOR' using errcode = '42501';
  end if;
  if s.status in ('completed', 'cancelled', 'interrupted') then return s; end if;

  v_total := public.gym_live_total_ms(s);
  v_e := least(public.gym_live_elapsed_ms(s), v_total);
  v_cycle := (s.work_seconds + s.rest_seconds)::bigint * 1000;

  if p_action = 'start' then
    if s.status <> 'ready' then return s; end if;
    update public.gym_live_sessions set status = 'running', anchor_at = now(), anchor_elapsed_ms = 0, started_at = now(),
      version = version + 1, updated_at = now() where id = p_id returning * into s;
  elsif p_action = 'pause' then
    if s.status <> 'running' then return s; end if;
    update public.gym_live_sessions set status = 'paused',
      segments = segments || jsonb_build_array(jsonb_build_array(s.anchor_elapsed_ms, v_e)),
      anchor_elapsed_ms = v_e, anchor_at = now(), version = version + 1, updated_at = now()
      where id = p_id returning * into s;
  elsif p_action = 'resume' then
    if s.status <> 'paused' then return s; end if;
    update public.gym_live_sessions set status = 'running', anchor_at = now(), version = version + 1, updated_at = now()
      where id = p_id returning * into s;
  elsif p_action = 'next' then
    if s.status not in ('running', 'paused') then return s; end if;
    v_target := (floor(v_e::numeric / v_cycle)::bigint + 1) * v_cycle;
    if v_target >= v_total then
      return public.gym_live_finish_internal(p_id, 'end');
    end if;
    update public.gym_live_sessions set
      segments = case when s.status = 'running' then segments || jsonb_build_array(jsonb_build_array(s.anchor_elapsed_ms, v_e)) else segments end,
      anchor_elapsed_ms = v_target, anchor_at = now(), version = version + 1, updated_at = now()
      where id = p_id returning * into s;
  elsif p_action = 'end' then
    return public.gym_live_finish_internal(p_id, 'end');
  elsif p_action = 'cancel' then
    return public.gym_live_finish_internal(p_id, 'cancel');
  else
    raise exception 'BAD_ACTION';
  end if;
  return s;
end;
$$;

-- Natural completion — callable by the coach OR a participant (so the
-- session completes even if the coach's phone is in the background), but
-- the SERVER decides whether the timeline really reached its end.
create or replace function public.gym_live_complete_if_due(p_id text)
returns public.gym_live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.gym_live_sessions;
begin
  select * into s from public.gym_live_sessions where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if auth.uid() is null or not (public.is_gym_instructor(s.gym_id, auth.uid()) or public.is_gym_live_participant(p_id, auth.uid())) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  return public.gym_live_finish_internal(p_id, 'due');
end;
$$;

-- A student marks THEIR OWN participation as saved to their own record
-- (so the coach can see "기록 저장됨"); only after the session ended.
create or replace function public.gym_live_mark_recorded(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.gym_live_participants gp set recorded_at = coalesce(gp.recorded_at, now())
  where gp.session_id = p_id and gp.user_id = auth.uid()
    and exists (select 1 from public.gym_live_sessions s where s.id = p_id and s.status in ('completed', 'interrupted', 'cancelled'));
$$;

revoke all on function public.gym_live_create(text, text, text, text, text, text, text, integer, integer, integer, jsonb, boolean) from public;
revoke all on function public.gym_live_control(text, text) from public;
revoke all on function public.gym_live_complete_if_due(text) from public;
revoke all on function public.gym_live_mark_recorded(text) from public;
grant execute on function public.gym_live_create(text, text, text, text, text, text, text, integer, integer, integer, jsonb, boolean) to authenticated;
grant execute on function public.gym_live_control(text, text) to authenticated;
grant execute on function public.gym_live_complete_if_due(text) to authenticated;
grant execute on function public.gym_live_mark_recorded(text) to authenticated;

-- Realtime: postgres_changes on both tables (RLS above still filters what each user receives).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'gym_live_sessions') then
    alter publication supabase_realtime add table public.gym_live_sessions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'gym_live_participants') then
    alter publication supabase_realtime add table public.gym_live_participants;
  end if;
end $$;
