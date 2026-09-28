-- 21단계 — profiles table + RLS.
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- for your project, or via `supabase db push` if you use the Supabase CLI.

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  nickname text not null,
  avatar text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users may only ever see/change their OWN profile row. No policy grants
-- access to another user's row under any circumstance — the app must never
-- need (and never uses) the service_role key to bypass this.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);

create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = user_id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id);

create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = user_id);

-- Auto-create a profile row the moment a new auth user is created —
-- SECURITY DEFINER so it runs with elevated privileges regardless of
-- whether the new user already has an active session (e.g. when "Confirm
-- email" is enabled, there's no session yet at signUp time, so a plain
-- client-side insert would be rejected by the RLS policy above). This is
-- the standard Supabase pattern for auth.users -> profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
