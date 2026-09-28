-- MARTIALDEX 신규 무술 추가 시스템 — 사용자가 "+ 무술 추가"로 실제 웹 검색
-- 근거를 확보해 검증한 새로운 무술을 등록하는 공유(shared/public) 테이블.
-- 0014_add_teq.sql과 정확히 같은 설계 원칙을 따른다: 한 사용자가 등록한
-- 무술("우슈")은 모든 사용자가 볼 수 있어야 하므로 user_id로 스코프하지
-- 않는다. 기존 9개 공식 무술(data/processed/*.json)은 절대 건드리지 않고,
-- 이 테이블은 순수하게 추가적(additive)인 별도 레지스트리다 —
-- getUnifiedMartialArtSummaries()가 읽을 때 병합한다.

create table if not exists public.custom_martial_arts (
  id text primary key,
  name_ko text not null,
  name_en text,
  description text not null,
  source text not null default 'ai_web_research',
  verified boolean not null default true,
  verified_at timestamptz not null default now(),
  added_by uuid references auth.users (id) on delete set null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data jsonb not null
);

alter table public.custom_martial_arts enable row level security;

-- SELECT: 0014와 동일하게 인증된 사용자 전원이 전체 공유 레지스트리를 읽을
-- 수 있다 — 새 무술 등록 전 "이미 존재하는지" 중복 확인도 이 경로로 이뤄진다.
create policy "custom_martial_arts_select_authenticated" on public.custom_martial_arts
  for select
  to authenticated
  using (true);

-- INSERT: 인증된 사용자는 누구나 (이미 실제 웹 검증을 통과한) 새 무술을
-- 등록할 수 있다 — add_teq와 동일하게 행 소유자 컬럼이 없는 공유 테이블이다.
create policy "custom_martial_arts_insert_authenticated" on public.custom_martial_arts
  for insert
  to authenticated
  with check (auth.uid() is not null);

-- UPDATE/DELETE 정책 없음 — RLS 기본값으로 둘 다 거부된다 (add_teq와 동일한
-- "일반 사용자가 다른 사람이 등록한 무술을 임의로 수정/삭제할 수 없다" 원칙).

grant select, insert on public.custom_martial_arts to authenticated;
