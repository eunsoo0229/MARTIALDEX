-- 사용자 콤보·셋업 공유 + 하트.
--
-- 지금까지 콤보(combos)와 전술 셋업(tactics)은 본인 행만 읽을 수 있는 개인
-- 데이터였다(0006, 0007). 이 마이그레이션은 사용자가 "공유"를 눌렀을 때의
-- 스냅샷을 모두가 볼 수 있는 별도 테이블에 올린다 — 원본 개인 데이터와 그
-- RLS는 전혀 건드리지 않는다.
--
-- 패턴은 0026/0027 community_posts와 같다: 공개 읽기(anon 포함), 본인 행만
-- 쓰기, 작성자 닉네임은 작성 시점에 평문 복사(profiles RLS가 타인 조회를
-- 막으므로), 하트 수는 security definer 트리거가 실제 행 개수로 재계산
-- (클라이언트가 like_count를 직접 바꿀 수 없음).
--
-- 기간별 인기(이번 주/이번 달/올해)는 하트 행의 created_at으로 계산한다.
-- 누가 하트를 눌렀는지는 공개하지 않는다: 하트 행은 본인 것만 읽을 수 있고,
-- 기간별 집계는 개수만 돌려주는 함수(shared_combo_like_counts)로 제공한다.

-- ---------------- 1. 테이블 ----------------

create table if not exists public.shared_combos (
  id text not null primary key,
  author_id uuid not null references auth.users (id) on delete cascade,
  author_nickname text not null,
  kind text not null check (kind in ('combo', 'setup')),
  name text not null check (char_length(name) between 1 and 80),
  -- 목적: "잽을 맞추기 위한 셋업", "테이크다운을 위한 셋업" 등 — 추천의 핵심 신호.
  purpose text not null check (char_length(purpose) between 1 and 300),
  purpose_tags text[] not null default '{}',
  description text not null default '' check (char_length(description) <= 2000),
  martial_art text,
  -- [{techniqueId, name, martialArt, note, opponentReaction}] — 기술 이름은 스냅샷으로
  -- 보관한다(작성자의 개인 기술은 다른 사용자가 열람할 수 없으므로).
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 12),
  technique_ids text[] not null default '{}',
  -- 작성자 기기에서 원본(콤보 북/전술 셋업)의 id — 같은 원본을 다시 공유하면 갱신.
  source_ref text,
  like_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_combos_created_at_idx on public.shared_combos (created_at desc);
create index if not exists shared_combos_like_count_idx on public.shared_combos (like_count desc);
create index if not exists shared_combos_author_idx on public.shared_combos (author_id);
create unique index if not exists shared_combos_author_source_idx on public.shared_combos (author_id, source_ref) where source_ref is not null;

create table if not exists public.shared_combo_likes (
  combo_id text not null references public.shared_combos (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (combo_id, user_id)
);

create index if not exists shared_combo_likes_created_at_idx on public.shared_combo_likes (created_at desc);

-- ---------------- 2. RLS ----------------

alter table public.shared_combos enable row level security;
alter table public.shared_combo_likes enable row level security;

drop policy if exists "shared_combos_select_all" on public.shared_combos;
create policy "shared_combos_select_all" on public.shared_combos
  for select using (true);
drop policy if exists "shared_combos_insert_own" on public.shared_combos;
create policy "shared_combos_insert_own" on public.shared_combos
  for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "shared_combos_update_own" on public.shared_combos;
create policy "shared_combos_update_own" on public.shared_combos
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists "shared_combos_delete_own" on public.shared_combos;
create policy "shared_combos_delete_own" on public.shared_combos
  for delete to authenticated using (author_id = auth.uid());

-- 하트 행은 본인 것만 읽는다(내가 누른 하트 표시용). 개수는 like_count / 집계 함수로.
drop policy if exists "shared_combo_likes_select_own" on public.shared_combo_likes;
create policy "shared_combo_likes_select_own" on public.shared_combo_likes
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "shared_combo_likes_insert_own" on public.shared_combo_likes;
create policy "shared_combo_likes_insert_own" on public.shared_combo_likes
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "shared_combo_likes_delete_own" on public.shared_combo_likes;
create policy "shared_combo_likes_delete_own" on public.shared_combo_likes
  for delete to authenticated using (user_id = auth.uid());

grant select on public.shared_combos to anon, authenticated;
grant insert, update, delete on public.shared_combos to authenticated;
grant select, insert, delete on public.shared_combo_likes to authenticated;

-- ---------------- 3. 하트 수 보호 ----------------

create or replace function public.trg_protect_shared_combo_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.like_count := (select count(*) from public.shared_combo_likes where combo_id = new.id);
  if tg_op = 'UPDATE' then
    new.author_id := old.author_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists shared_combos_protect_stats on public.shared_combos;
create trigger shared_combos_protect_stats
  before insert or update on public.shared_combos
  for each row execute function public.trg_protect_shared_combo_stats();

create or replace function public.trg_recompute_shared_combo_likes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := coalesce(new.combo_id, old.combo_id);
begin
  update public.shared_combos
  set like_count = (select count(*) from public.shared_combo_likes where combo_id = v_id)
  where id = v_id;
  return null;
end;
$$;

drop trigger if exists shared_combo_likes_stats on public.shared_combo_likes;
create trigger shared_combo_likes_stats
  after insert or delete on public.shared_combo_likes
  for each row execute function public.trg_recompute_shared_combo_likes();

-- ---------------- 4. 기간별 하트 집계 ----------------
-- p_since 이후에 눌린(현재 유지 중인) 하트 수 — 개수만 반환, 사용자 정보 없음.

create or replace function public.shared_combo_like_counts(p_since timestamptz)
returns table (combo_id text, likes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select l.combo_id, count(*)::bigint as likes
  from public.shared_combo_likes l
  where l.created_at >= p_since
  group by l.combo_id;
$$;

revoke all on function public.shared_combo_like_counts(timestamptz) from public;
grant execute on function public.shared_combo_like_counts(timestamptz) to anon, authenticated;
