-- 커리큘럼 마켓플레이스 — 사용자가 만든 커리큘럼을 다른 사용자에게 판매(테스트
-- 결제)할 수 있는 기능. 모든 금액은 원(KRW) 정수로만 다룬다(부동소수점 오류 방지).
--
-- 핵심 보안 설계: "구매 완료" 상태는 클라이언트가 절대 직접 만들 수 없다.
-- marketplace_orders에는 authenticated 롤에 INSERT 권한을 아예 주지 않고, 유일한
-- 생성 경로는 purchase_marketplace_curriculum() RPC(SECURITY DEFINER)뿐이다 —
-- 이 함수가 서버(DB) 기준의 실제 가격/수수료율로 직접 계산하고 주문을 만든다.
-- 판매량/평점 통계도 트리거로만 갱신되어(before-insert/update 트리거가 매번
-- 재계산값으로 덮어씀) 판매자가 자신의 통계를 직접 조작할 수 없다.

-- ---------------- 1. 테이블 ----------------

create table if not exists public.marketplace_config (
  id int primary key default 1,
  fee_rate_bp int not null default 1000, -- basis points; 1000 = 10.00%
  updated_at timestamptz not null default now(),
  constraint marketplace_config_singleton check (id = 1)
);
insert into public.marketplace_config (id, fee_rate_bp) values (1, 1000) on conflict (id) do nothing;

create table if not exists public.marketplace_curricula (
  id text primary key,
  seller_user_id uuid not null references auth.users (id) on delete cascade,
  seller_nickname text not null,
  source_curriculum_id text,
  title text not null,
  description text not null default '',
  martial_art text not null,
  difficulty text not null default 'beginner',
  total_days int not null default 0,
  technique_count int not null default 0,
  cover_icon text,
  price_krw int not null default 0,
  is_free boolean not null default true,
  tags jsonb not null default '[]'::jsonb,
  target_audience text not null default '',
  learning_goals jsonb not null default '[]'::jsonb,
  rating_avg numeric not null default 0,
  rating_count int not null default 0,
  purchase_count int not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_curricula_price_nonneg check (price_krw >= 0),
  constraint marketplace_curricula_status check (status in ('active', 'unpublished')),
  constraint marketplace_curricula_difficulty check (difficulty in ('beginner', 'intermediate', 'advanced', 'mixed'))
);

-- Full Day/기술 content, kept in a SEPARATE table from the public listing so
-- RLS can gate it independently: only the seller or a completed buyer may
-- ever SELECT it. This is literally the same Curriculum/CurriculumDay JSON
-- shape already used everywhere else (src/lib/curriculum/types.ts) — a
-- snapshot taken from the seller's real local curriculum at publish time,
-- never a redesigned/duplicated schema (spec section 2).
create table if not exists public.marketplace_curriculum_content (
  curriculum_id text primary key references public.marketplace_curricula (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_orders (
  id text primary key,
  curriculum_id text not null references public.marketplace_curricula (id) on delete cascade,
  buyer_user_id uuid not null references auth.users (id) on delete cascade,
  seller_user_id uuid not null references auth.users (id) on delete cascade,
  price_krw int not null,
  platform_fee_krw int not null,
  seller_earning_krw int not null,
  status text not null default 'completed',
  is_test_payment boolean not null default true,
  created_at timestamptz not null default now(),
  constraint marketplace_orders_status check (status in ('completed', 'failed')),
  constraint marketplace_orders_amounts check (price_krw = platform_fee_krw + seller_earning_krw),
  unique (curriculum_id, buyer_user_id)
);

create table if not exists public.marketplace_reviews (
  id text primary key,
  curriculum_id text not null references public.marketplace_curricula (id) on delete cascade,
  reviewer_user_id uuid not null references auth.users (id) on delete cascade,
  reviewer_nickname text not null,
  rating int not null,
  review_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_reviews_rating check (rating between 1 and 5),
  unique (curriculum_id, reviewer_user_id)
);

-- ---------------- 2. RLS ----------------

alter table public.marketplace_config enable row level security;
alter table public.marketplace_curricula enable row level security;
alter table public.marketplace_curriculum_content enable row level security;
alter table public.marketplace_orders enable row level security;
alter table public.marketplace_reviews enable row level security;

create policy "marketplace_config_select_all" on public.marketplace_config
  for select using (auth.role() = 'authenticated');
-- No insert/update/delete grant below — the fee rate is only ever changed
-- from the Supabase SQL editor / service role, per spec section 8's "하나의
-- 설정값으로 관리" (one row, one source of truth for both server and client).

create policy "marketplace_curricula_select_active_or_own" on public.marketplace_curricula
  for select using (status = 'active' or seller_user_id = auth.uid());
create policy "marketplace_curricula_insert_own" on public.marketplace_curricula
  for insert with check (seller_user_id = auth.uid());
create policy "marketplace_curricula_update_own" on public.marketplace_curricula
  for update using (seller_user_id = auth.uid());
create policy "marketplace_curricula_delete_own" on public.marketplace_curricula
  for delete using (seller_user_id = auth.uid());

create policy "marketplace_content_select_owner_or_buyer" on public.marketplace_curriculum_content
  for select using (
    exists (select 1 from public.marketplace_curricula mc where mc.id = curriculum_id and mc.seller_user_id = auth.uid())
    or exists (
      select 1 from public.marketplace_orders mo
      where mo.curriculum_id = marketplace_curriculum_content.curriculum_id
        and mo.buyer_user_id = auth.uid()
        and mo.status = 'completed'
    )
  );
create policy "marketplace_content_insert_owner" on public.marketplace_curriculum_content
  for insert with check (exists (select 1 from public.marketplace_curricula mc where mc.id = curriculum_id and mc.seller_user_id = auth.uid()));
create policy "marketplace_content_update_owner" on public.marketplace_curriculum_content
  for update using (exists (select 1 from public.marketplace_curricula mc where mc.id = curriculum_id and mc.seller_user_id = auth.uid()));

-- Buyer and seller may each see their own side of an order; no third party
-- (spec section 19) and no direct insert path for anyone (spec section 10 —
-- see purchase_marketplace_curriculum() below, the only way a row appears).
create policy "marketplace_orders_select_buyer_or_seller" on public.marketplace_orders
  for select using (buyer_user_id = auth.uid() or seller_user_id = auth.uid());

create policy "marketplace_reviews_select_all" on public.marketplace_reviews
  for select using (auth.role() = 'authenticated');
create policy "marketplace_reviews_insert_verified_buyer" on public.marketplace_reviews
  for insert with check (
    reviewer_user_id = auth.uid()
    and exists (
      select 1 from public.marketplace_orders mo
      where mo.curriculum_id = marketplace_reviews.curriculum_id
        and mo.buyer_user_id = auth.uid()
        and mo.status = 'completed'
    )
  );
create policy "marketplace_reviews_update_own" on public.marketplace_reviews
  for update using (reviewer_user_id = auth.uid());

grant select on public.marketplace_config to authenticated;
grant select, insert, update, delete on public.marketplace_curricula to authenticated;
grant select, insert, update on public.marketplace_curriculum_content to authenticated;
grant select on public.marketplace_orders to authenticated; -- no insert/update/delete — see RPC below
grant select, insert, update on public.marketplace_reviews to authenticated;

-- ---------------- 3. 통계 보호 트리거 + 구매 RPC ----------------

-- Always overwrites purchase_count/rating_avg/rating_count with the REAL
-- aggregate from orders/reviews on every insert or update of a listing —
-- runs regardless of what a client's UPDATE payload contains, so a seller
-- can never smuggle in a fabricated purchase/rating number (spec section 10).
create or replace function public.trg_protect_marketplace_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.purchase_count := (select count(*) from public.marketplace_orders where curriculum_id = new.id and status = 'completed');
  new.rating_avg := coalesce((select round(avg(rating)::numeric, 2) from public.marketplace_reviews where curriculum_id = new.id), 0);
  new.rating_count := (select count(*) from public.marketplace_reviews where curriculum_id = new.id);
  return new;
end;
$$;

drop trigger if exists marketplace_curricula_protect_stats on public.marketplace_curricula;
create trigger marketplace_curricula_protect_stats
  before insert or update on public.marketplace_curricula
  for each row execute function public.trg_protect_marketplace_stats();

-- Pushes a fresh recompute into the listing whenever an order or review
-- changes WITHOUT the seller touching their own listing row (e.g. a new
-- purchase or review from someone else) — the trigger above only fires on
-- the listing's own insert/update, so this is what makes new orders/reviews
-- actually show up in purchase_count/rating_avg without the seller editing anything.
create or replace function public.recompute_marketplace_curriculum_stats(p_curriculum_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.marketplace_curricula
  set
    purchase_count = (select count(*) from public.marketplace_orders where curriculum_id = p_curriculum_id and status = 'completed'),
    rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.marketplace_reviews where curriculum_id = p_curriculum_id), 0),
    rating_count = (select count(*) from public.marketplace_reviews where curriculum_id = p_curriculum_id),
    updated_at = now()
  where id = p_curriculum_id;
end;
$$;

create or replace function public.trg_recompute_stats_from_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_marketplace_curriculum_stats(coalesce(new.curriculum_id, old.curriculum_id));
  return coalesce(new, old);
end;
$$;
drop trigger if exists marketplace_orders_stats on public.marketplace_orders;
create trigger marketplace_orders_stats
  after insert or update or delete on public.marketplace_orders
  for each row execute function public.trg_recompute_stats_from_orders();

create or replace function public.trg_recompute_stats_from_reviews()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_marketplace_curriculum_stats(coalesce(new.curriculum_id, old.curriculum_id));
  return coalesce(new, old);
end;
$$;
drop trigger if exists marketplace_reviews_stats on public.marketplace_reviews;
create trigger marketplace_reviews_stats
  after insert or update or delete on public.marketplace_reviews
  for each row execute function public.trg_recompute_stats_from_reviews();

-- The ONLY way a marketplace_orders row can ever be created. Runs as
-- SECURITY DEFINER (bypasses the buyer's own RLS) and computes price/fee/
-- earning purely from server-trusted rows (the listing's real price_krw and
-- the one marketplace_config.fee_rate_bp) — the client cannot pass its own
-- price or fee. Idempotent: re-calling for an already-purchased curriculum
-- returns the existing order instead of creating a duplicate (also enforced
-- by the unique (curriculum_id, buyer_user_id) constraint as a backstop).
-- price = 0 (free curricula) flows through the exact same path, so "무료로
-- 받기" and a real purchase share one code path end to end.
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
    where curriculum_id = p_curriculum_id and buyer_user_id = auth.uid() and status = 'completed';
  if v_existing is not null then
    return query select v_existing.id, v_existing.price_krw, v_existing.platform_fee_krw, v_existing.seller_earning_krw, true;
    return;
  end if;

  select fee_rate_bp into v_fee_rate_bp from public.marketplace_config where id = 1;
  v_fee_rate_bp := coalesce(v_fee_rate_bp, 1000);

  v_fee := (v_listing.price_krw * v_fee_rate_bp) / 10000; -- integer division = floor, never a fraction of a won
  v_earning := v_listing.price_krw - v_fee;
  v_order_id := 'order_' || replace(gen_random_uuid()::text, '-', '');

  insert into public.marketplace_orders (id, curriculum_id, buyer_user_id, seller_user_id, price_krw, platform_fee_krw, seller_earning_krw, status, is_test_payment)
  values (v_order_id, p_curriculum_id, auth.uid(), v_listing.seller_user_id, v_listing.price_krw, v_fee, v_earning, 'completed', true);

  return query select v_order_id, v_listing.price_krw, v_fee, v_earning, false;
end;
$$;

grant execute on function public.purchase_marketplace_curriculum(text) to authenticated;
