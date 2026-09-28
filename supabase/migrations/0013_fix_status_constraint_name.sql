-- Bugfix: 0009_marketplace.sql named the original status check constraint
-- "marketplace_orders_status" (explicitly, not Postgres's auto-generated
-- "_check" suffix). 0010_payments.sql's "drop constraint if exists
-- marketplace_orders_status_check" therefore matched nothing and silently
-- no-opped, then added a SECOND, wider constraint alongside the original
-- narrow one ('completed'|'failed' only) — so every insert of a new status
-- value (pending/paid/cancelled/refunded) satisfied the new constraint but
-- still violated the old one and failed outright. Drops the correctly-named
-- original constraint; the wider one from 0010 remains as the only active
-- status check.

alter table public.marketplace_orders drop constraint if exists marketplace_orders_status;
