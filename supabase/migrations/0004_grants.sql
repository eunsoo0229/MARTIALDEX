-- 21단계 — missing table-level GRANTs, found via live testing.
--
-- RLS policies control WHICH ROWS a role can see/change, but Postgres also
-- requires a baseline table-level GRANT before a role may query the table
-- at all — `create table` via raw SQL (SQL Editor) does not add this
-- automatically the way creating a table through the Table Editor UI does.
-- Without it, every request came back "42501 permission denied for table
-- ..." regardless of the RLS policies being completely correct.
--
-- `authenticated` gets real CRUD access (still fully scoped per-row by the
-- policies in 0001-0003). `anon` intentionally gets NOTHING here — these
-- are purely personal-data tables, so a logged-out request should be
-- refused outright (permission denied) rather than merely filtered down to
-- zero rows by RLS. That is a strictly stronger guarantee than relying on
-- RLS alone: there is no code path where an anonymous request can even
-- begin executing a query against these tables.

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.curricula to authenticated;
grant select, insert, update, delete on public.curriculum_progress to authenticated;
grant select, insert, update, delete on public.user_backups to authenticated;
