-- joinGymByCode() upserts (insert ... on conflict do update) so re-joining
-- an already-joined gym succeeds silently instead of erroring — but an
-- upsert needs UPDATE privilege on the table even when the conflict never
-- fires, and 0022 only granted select/insert/delete. Add UPDATE, scoped by
-- RLS to the member's own row only (e.g. if their nickname changes).
create policy "gym_members_update_self" on public.gym_members
  for update using (user_id = auth.uid());

grant update on public.gym_members to authenticated;
