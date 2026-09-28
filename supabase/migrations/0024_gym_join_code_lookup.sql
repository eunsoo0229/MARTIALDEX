-- Fixes another real bug found via live testing: gyms_select_member (0022)
-- only lets an EXISTING member see a gym row, but joinGymByCode() must look
-- up a gym by its code BEFORE the student is a member — a chicken-and-egg
-- RLS gap that made every join attempt fail with "체육관 코드를 찾을 수
-- 없습니다" even with a correct code.
--
-- Broadening gyms' SELECT policy to "any authenticated user" would defeat
-- the join code's whole purpose (anyone could list every gym's join_code
-- directly, no invite needed). Instead: a SECURITY DEFINER function that
-- takes the code as an explicit parameter and only returns a match — you
-- still have to already know the code to get anything back, exactly like
-- the intended security model, it just runs with elevated privileges so
-- normal table RLS doesn't block the lookup itself.
create or replace function public.find_gym_by_join_code(p_join_code text)
returns table (id text, name text, owner_user_id uuid, join_code text, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select id, name, owner_user_id, join_code, created_at
  from public.gyms
  where join_code = p_join_code;
$$;

revoke all on function public.find_gym_by_join_code(text) from public;
grant execute on function public.find_gym_by_join_code(text) to authenticated;
