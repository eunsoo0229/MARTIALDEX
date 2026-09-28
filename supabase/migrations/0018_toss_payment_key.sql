-- TossPayments 실연동 준비 — 실제 PG 승인 시 돌아오는 paymentKey를 감사/중복
-- 확인용으로 저장한다. 구매 권한 판단에는 전혀 쓰이지 않는다(그건 여전히
-- status in ('completed','paid')만으로 결정됨, 0010 그대로) — 순수 기록용.
alter table public.marketplace_orders add column if not exists payment_key text;

-- 동일한 Toss paymentKey가 두 개의 다른 주문을 'paid'로 확정시키는 것을 DB
-- 레벨에서도 막는다(재생공격/중복승인 방지의 2차 방어선 — 1차 방어선은
-- finalize_marketplace_order의 idempotent 체크와 verifyWithPg의 금액 검증).
create unique index if not exists marketplace_orders_payment_key_unique
  on public.marketplace_orders (payment_key)
  where payment_key is not null;

-- finalize_marketplace_order에 p_payment_key 파라미터를 추가한다. 기존
-- 3-파라미터 오버로드는 명시적으로 제거하고 4-파라미터로 교체한다(둘 다 남기면
-- PostgREST가 named-parameter 호출을 어느 오버로드로 보낼지 모호해짐).
-- 나머지 보안 로직(서비스 롤만 'paid' 전환 가능, idempotent 처리 등)은
-- 0010과 완전히 동일 — payment_key 기록만 추가되었다.
drop function if exists public.finalize_marketplace_order(text, text, text);

create or replace function public.finalize_marketplace_order(p_order_id text, p_new_status text, p_reason text default null, p_payment_key text default null)
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
    update public.marketplace_orders set status = 'paid', paid_at = now(), payment_key = p_payment_key where id = p_order_id;
  else
    update public.marketplace_orders set status = p_new_status, failure_reason = p_reason where id = p_order_id;
  end if;

  select * into v_order from public.marketplace_orders where id = p_order_id;
  return query select v_order.id, v_order.status, v_order.paid_at;
end;
$$;

grant execute on function public.finalize_marketplace_order(text, text, text, text) to authenticated;
