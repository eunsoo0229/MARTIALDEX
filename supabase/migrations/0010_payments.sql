-- 31단계 — 실제 결제 연동 준비. 30단계의 즉시-완료형 테스트 결제
-- (purchase_marketplace_curriculum, 그대로 유지·삭제하지 않음)는 남겨두고,
-- 실제 PG가 요구하는 2단계 흐름(주문 생성(pending) → PG 승인 → 서버 측 검증
-- → 상태 확정(paid/failed))을 지원하는 새 컬럼/제약/RPC를 추가한다.
--
-- 클라이언트는 절대 marketplace_orders에 직접 쓸 수 없다(INSERT 권한 없음,
-- 30단계와 동일) — 이번 단계의 새 RPC들도 전부 SECURITY DEFINER로 서버가
-- 실제 리스팅 가격/수수료율을 다시 조회해 계산하며, 클라이언트가 보낸 금액을
-- 절대 신뢰하지 않는다.

-- ---------------- 1. 스키마 확장 ----------------

alter table public.marketplace_orders add column if not exists paid_at timestamptz;
alter table public.marketplace_orders add column if not exists failure_reason text;

-- 상태 집합을 pending/paid/failed/cancelled/refunded로 확장한다. 'completed'는
-- 30단계에서 이미 만들어진 행/즉시-완료 RPC가 계속 쓰는 값이라 제거하지 않고
-- 그대로 유효한 값으로 남긴다 — 기존 기능·데이터를 깨지 않기 위함.
alter table public.marketplace_orders drop constraint if exists marketplace_orders_status_check;
alter table public.marketplace_orders add constraint marketplace_orders_status_check
  check (status in ('pending', 'completed', 'paid', 'failed', 'cancelled', 'refunded'));

-- 30단계의 "구매당 최대 1행" 제약은 실패/취소 후 재시도를 막아버리므로 완화한다:
-- 이제는 "성공한 구매(완료 또는 결제완료)는 커리큘럼당 최대 1건"만 보장하고,
-- pending/failed/cancelled 시도는 여러 번 남을 수 있다(재시도 이력으로 유지).
alter table public.marketplace_orders drop constraint if exists marketplace_orders_curriculum_id_buyer_user_id_key;
drop index if exists marketplace_orders_one_success_per_buyer;
create unique index marketplace_orders_one_success_per_buyer
  on public.marketplace_orders (curriculum_id, buyer_user_id)
  where status in ('completed', 'paid');

-- ---------------- 2. 구매 권한(콘텐츠 열람) 기준 갱신 ----------------
-- 30단계 정책은 status = 'completed'만 인정했다 — 이제 'paid'도 동일하게
-- "정상 구매됨"으로 인정한다(환불된 'refunded'는 절대 포함하지 않음 — 환불 시
-- 자동으로 접근 권한이 사라지는 것이 원하는 동작이다, spec section 12).
drop policy if exists "marketplace_content_select_owner_or_buyer" on public.marketplace_curriculum_content;
create policy "marketplace_content_select_owner_or_buyer" on public.marketplace_curriculum_content
  for select using (
    exists (select 1 from public.marketplace_curricula mc where mc.id = curriculum_id and mc.seller_user_id = auth.uid())
    or exists (
      select 1 from public.marketplace_orders mo
      where mo.curriculum_id = marketplace_curriculum_content.curriculum_id
        and mo.buyer_user_id = auth.uid()
        and mo.status in ('completed', 'paid')
    )
  );

drop policy if exists "marketplace_reviews_insert_verified_buyer" on public.marketplace_reviews;
create policy "marketplace_reviews_insert_verified_buyer" on public.marketplace_reviews
  for insert with check (
    reviewer_user_id = auth.uid()
    and exists (
      select 1 from public.marketplace_orders mo
      where mo.curriculum_id = marketplace_reviews.curriculum_id
        and mo.buyer_user_id = auth.uid()
        and mo.status in ('completed', 'paid')
    )
  );

-- ---------------- 3. 2단계 결제 RPC ----------------

-- Step 1 — "결제창을 열기 위한 주문 생성". 이미 성공한 구매가 있으면 새로
-- pending을 만들지 않고 기존 정보를 그대로 반환한다(중복 결제/재구매 방지).
-- 가격/수수료는 항상 이 시점의 실제 리스팅 값으로 재계산한다 — 클라이언트가
-- 이전에 화면에 캐시해둔 가격을 절대 신뢰하지 않는다(spec section 4).
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
  if v_existing_success is not null then
    return query select v_existing_success.id, v_existing_success.price_krw, v_existing_success.platform_fee_krw, v_existing_success.seller_earning_krw, v_existing_success.status, true;
    return;
  end if;

  -- Re-use an already-open pending order for this exact (curriculum, buyer)
  -- instead of creating a second one on a double-click / retry.
  select * into v_existing_pending from public.marketplace_orders
    where curriculum_id = p_curriculum_id and buyer_user_id = auth.uid() and status = 'pending'
    order by created_at desc limit 1;
  if v_existing_pending is not null then
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

-- Step 2 — server-side finalization after PG approval.
--
-- SECURITY-CRITICAL: the 'paid' transition may ONLY be requested by a caller
-- holding the service_role key (auth.role() = 'service_role') — i.e. ONLY
-- the payment-verify Edge Function, which never ships that key to any
-- client/APK and only calls this AFTER its own PG-approval check (in test
-- mode, its own server-side receipt check; with a real PG, that PG's
-- server-to-server confirm API). A normal authenticated client calling this
-- RPC directly with p_new_status='paid' is rejected outright — there is no
-- way for a client to fake its way to 'paid' by calling this function
-- itself (spec section 1/10). 'failed'/'cancelled' carry no such risk (they
-- can only ever prevent a purchase, never grant one), so any authenticated
-- caller may set those on their OWN order — e.g. a client-side "결제 취소"
-- button can call this directly without a round trip through the Edge
-- Function. Idempotent: a second call on an already-paid/completed order
-- just returns the existing state, never double-processes.
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

  select * into v_order from public.marketplace_orders where id = p_order_id;
  if v_order is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if not v_is_service_role and v_order.buyer_user_id <> auth.uid() then
    raise exception 'NOT_YOUR_ORDER';
  end if;

  if v_order.status in ('paid', 'completed') then
    -- Already finalized successfully — return as-is (idempotent, no double-processing).
    return query select v_order.id, v_order.status, v_order.paid_at;
    return;
  end if;
  if v_order.status <> 'pending' then
    raise exception 'ORDER_NOT_PENDING';
  end if;

  if p_new_status = 'paid' then
    update public.marketplace_orders set status = 'paid', paid_at = now() where id = p_order_id;
  else
    update public.marketplace_orders set status = p_new_status, failure_reason = p_reason where id = p_order_id;
  end if;

  select * into v_order from public.marketplace_orders where id = p_order_id;
  return query select v_order.id, v_order.status, v_order.paid_at;
end;
$$;

-- Buyer-initiated refund of their own already-paid order — a real refund
-- would additionally call the PG's refund API from the Edge Function before
-- this; here it only flips status (spec section 13 — settlement math and
-- actual payout are out of scope, this just needs to correctly revoke access).
create or replace function public.request_marketplace_refund(p_order_id text)
returns table (order_id text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  select * into v_order from public.marketplace_orders where id = p_order_id;
  if v_order is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.buyer_user_id <> auth.uid() then
    raise exception 'NOT_YOUR_ORDER';
  end if;
  if v_order.status not in ('paid', 'completed') then
    raise exception 'ORDER_NOT_REFUNDABLE';
  end if;

  update public.marketplace_orders set status = 'refunded' where id = p_order_id;
  return query select p_order_id, 'refunded'::text;
end;
$$;

grant execute on function public.create_pending_marketplace_order(text) to authenticated;
grant execute on function public.finalize_marketplace_order(text, text, text) to authenticated;
grant execute on function public.request_marketplace_refund(text) to authenticated;
