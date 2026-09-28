-- Fixes a real bug in 0022_gym_classes.sql: gym_members' own SELECT policy
-- checked "am I an instructor of this gym" via a subquery that selects from
-- gym_members ITSELF — Postgres re-evaluates that table's RLS policy for
-- the subquery too, which re-runs the same subquery, infinitely
-- ("infinite recursion detected in policy for relation gym_members",
-- 42P17). Confirmed via live testing against the linked Supabase project
-- immediately after 0022 was applied.
--
-- Standard fix: move the "is this user an instructor of this gym" check
-- into a SECURITY DEFINER function, which runs with the function owner's
-- privileges and therefore bypasses gym_members' RLS entirely instead of
-- re-triggering it — breaking the recursion. search_path is pinned so the
-- function can't be tricked by a caller-controlled search_path into
-- resolving `public.gym_members` to something else.
create or replace function public.is_gym_instructor(p_gym_id text, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.gym_members
    where gym_id = p_gym_id and user_id = p_user_id and role = 'instructor'
  );
$$;

revoke all on function public.is_gym_instructor(text, uuid) from public;
grant execute on function public.is_gym_instructor(text, uuid) to authenticated;

drop policy if exists "gym_members_select_self_or_roster" on public.gym_members;
create policy "gym_members_select_self_or_roster" on public.gym_members
  for select using (
    user_id = auth.uid()
    or public.is_gym_instructor(gym_members.gym_id, auth.uid())
  );
