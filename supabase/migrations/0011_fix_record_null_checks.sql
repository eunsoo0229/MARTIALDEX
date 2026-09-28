-- Bugfix found while testing 31단계's new schema against 30단계's original
-- purchase_marketplace_curriculum(): PL/pgSQL's composite-type `record IS
-- NOT NULL` is only true when EVERY field of the found row is non-null. Once
-- 0010_payments.sql added nullable paid_at/failure_reason columns to
-- marketplace_orders, any EXISTING order (which has both of those as NULL)
-- makes `v_existing IS NOT NULL` evaluate to false even though a real row
-- was found — so the "already purchased, don't insert a duplicate" early
-- return never fired, and the real INSERT below it hit the unique index
-- instead. `v_x IS NULL` checks used to detect true ABSENCE are unaffected
-- (a genuinely-missing row has every field null, so that direction always
-- worked) — only the "IS NOT NULL to confirm presence" checks needed
-- fixing. Fix: check one guaranteed-NOT-NULL column (id, the primary key)
-- instead of the whole record's nullness. Also drops this session's
-- temporary debug function used to diagnose the issue.

drop function if exists public.debug_check_existing(text, uuid);

create or replace function public.purchase_marketplace_curriculum(p_curriculum_id text)
returns table (order_id text, price_krw int, platform_fee_krw int, seller_earning_krw int, already_purchased boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing record;
  v_existing record;
  v_fee_rate_bp int;
  v_fee int;
  v_earning int;
  v_order_id text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_listing from public.marketplace_curricula where id = p_curriculum_id and status = 'active';
  if v_listing is null then
    raise exception 'LISTING_NOT_FOUND';
  end if;

  select * into v_existing from public.marketplace_orders
    where curriculum_id = p_curriculum_id and buyer_user_id = auth.uid() and status in ('completed', 'paid');
  if v_existing.id is not null then
    return query select v_existing.id, v_existing.price_krw, v_existing.platform_fee_krw, v_existing.seller_earning_krw, true;
    return;
  end if;

  select fee_rate_bp into v_fee_rate_bp from public.marketplace_config where id = 1;
  v_fee_rate_bp := coalesce(v_fee_rate_bp, 1000);

  v_fee := (v_listing.price_krw * v_fee_rate_bp) / 10000;
  v_earning := v_listing.price_krw - v_fee;
  v_order_id := 'order_' || replace(gen_random_uuid()::text, '-', '');

  insert into public.marketplace_orders (id, curriculum_id, buyer_user_id, seller_user_id, price_krw, platform_fee_krw, seller_earning_krw, status, is_test_payment)
  values (v_order_id, p_curriculum_id, auth.uid(), v_listing.seller_user_id, v_listing.price_krw, v_fee, v_earning, 'completed', true);

  return query select v_order_id, v_listing.price_krw, v_fee, v_earning, false;
end;
$$;

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

  select * into v_listing from public.marketplace_curricula where id = p_curriculum_id and status = 'active';
  if v_listing is null then
    raise exception 'LISTING_NOT_FOUND';
  end if;

  select * into v_existing_success from public.marketplace_orders
    where curriculum_id = p_curriculum_id and buyer_user_id = auth.uid() and status in ('completed', 'paid');
  if v_existing_success.id is not null then
    return query select v_existing_success.id, v_existing_success.price_krw, v_existing_success.platform_fee_krw, v_existing_success.seller_earning_krw, v_existing_success.status, true;
    return;
  end if;

  select * into v_existing_pending from public.marketplace_orders
    where curriculum_id = p_curriculum_id and buyer_user_id = auth.uid() and status = 'pending'
    order by created_at desc limit 1;
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
