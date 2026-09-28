-- Bugfix found while testing the new payment RPCs end to end: any function
-- whose `returns table (...)` includes a `status` output column implicitly
-- declares `status` as a PL/pgSQL variable in that function's scope — a
-- later bare `where status = ...` / `set status = ...` against
-- marketplace_orders then becomes genuinely ambiguous to Postgres ("could
-- refer to either a PL/pgSQL variable or a table column", error 42702) and
-- the call fails outright. Fixes every affected function by qualifying the
-- table column explicitly (alias `mo`) everywhere `status` is read or
-- written against the table, never relying on the bare name.

create or replace function public.create_pending_marketplace_order(p_curriculum_id text)
returns table (order_id text, price_krw int, platform_fee_krw int, seller_earning_krw int, status text, already_purchased boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing record;
  v_existing_success record;
  v_existing_pending record;
  v_fee_rate_bp int;
  v_fee int;
  v_earning int;
  v_order_id text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_listing from public.marketplace_curricula mc where mc.id = p_curriculum_id and mc.status = 'active';
  if v_listing is null then
    raise exception 'LISTING_NOT_FOUND';
  end if;

  select * into v_existing_success from public.marketplace_orders mo
    where mo.curriculum_id = p_curriculum_id and mo.buyer_user_id = auth.uid() and mo.status in ('completed', 'paid');
  if v_existing_success.id is not null then
    return query select v_existing_success.id, v_existing_success.price_krw, v_existing_success.platform_fee_krw, v_existing_success.seller_earning_krw, v_existing_success.status, true;
    return;
  end if;

  select * into v_existing_pending from public.marketplace_orders mo
    where mo.curriculum_id = p_curriculum_id and mo.buyer_user_id = auth.uid() and mo.status = 'pending'
    order by mo.created_at desc limit 1;
  if v_existing_pending.id is not null then
    return query select v_existing_pending.id, v_existing_pending.price_krw, v_existing_pending.platform_fee_krw, v_existing_pending.seller_earning_krw, v_existing_pending.status, false;
    return;
  end if;

  select fee_rate_bp into v_fee_rate_bp from public.marketplace_config where id = 1;
  v_fee_rate_bp := coalesce(v_fee_rate_bp, 1000);
  v_fee := (v_listing.price_krw * v_fee_rate_bp) / 10000;
  v_earning := v_listing.price_krw - v_fee;
  v_order_id := 'order_' || replace(gen_random_uuid()::text, '-', '');

  insert into public.marketplace_orders (id, curriculum_id, buyer_user_id, seller_user_id, price_krw, platform_fee_krw, seller_earning_krw, status, is_test_payment)
  values (v_order_id, p_curriculum_id, auth.uid(), v_listing.seller_user_id, v_listing.price_krw, v_fee, v_earning, 'pending', true);

  return query select v_order_id, v_listing.price_krw, v_fee, v_earning, 'pending'::text, false;
end;
$$;

create or replace function public.finalize_marketplace_order(p_order_id text, p_new_status text, p_reason text default null)
returns table (order_id text, status text, paid_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_is_service_role boolean := auth.role() = 'service_role';
begin
  if p_new_status not in ('paid', 'failed', 'cancelled') then
    raise exception 'INVALID_STATUS';
  end if;
  if p_new_status = 'paid' and not v_is_service_role then
    raise exception 'FORBIDDEN_DIRECT_PAID_TRANSITION';
  end if;

  select * into v_order from public.marketplace_orders mo where mo.id = p_order_id;
  if v_order is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if not v_is_service_role and v_order.buyer_user_id <> auth.uid() then
    raise exception 'NOT_YOUR_ORDER';
  end if;

  if v_order.status in ('paid', 'completed') then
    return query select v_order.id, v_order.status, v_order.paid_at;
    return;
  end if;
  if v_order.status <> 'pending' then
    raise exception 'ORDER_NOT_PENDING';
  end if;

  if p_new_status = 'paid' then
    update public.marketplace_orders mo set status = 'paid', paid_at = now() where mo.id = p_order_id;
  else
    update public.marketplace_orders mo set status = p_new_status, failure_reason = p_reason where mo.id = p_order_id;
  end if;

  select * into v_order from public.marketplace_orders mo where mo.id = p_order_id;
  return query select v_order.id, v_order.status, v_order.paid_at;
end;
$$;

create or replace function public.request_marketplace_refund(p_order_id text)
returns table (order_id text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  select * into v_order from public.marketplace_orders mo where mo.id = p_order_id;
  if v_order is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.buyer_user_id <> auth.uid() then
    raise exception 'NOT_YOUR_ORDER';
  end if;
  if v_order.status not in ('paid', 'completed') then
    raise exception 'ORDER_NOT_REFUNDABLE';
  end if;

  update public.marketplace_orders mo set status = 'refunded' where mo.id = p_order_id;
  return query select p_order_id, 'refunded'::text;
end;
$$;
