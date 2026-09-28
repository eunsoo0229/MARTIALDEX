-- Community 게시물(SNS) 시스템. 기존 Community.tsx는 100% 로컬 전용(커리큘럼
-- "공유"는 기기 로컬 localStorage + 수동 공유 코드일 뿐, 서버 피드가 아니었다) —
-- 이 마이그레이션이 이 프로젝트에서 처음으로 서버에 저장되는 커뮤니티 콘텐츠를
-- 도입한다. 기존 curricula 공유 메커니즘(shareCode.ts, 로컬 브라우징)은 이
-- 마이그레이션에서 전혀 건드리지 않는다 — 완전히 별개의 병행 기능이다.
--
-- 통계 보호 패턴은 0009_marketplace.sql의 트리거 기반 재계산을 그대로 재사용한다
-- (좋아요/댓글/저장/리포스트 수를 클라이언트가 직접 조작할 수 없고, 항상 실제
-- 행 개수에서 재계산됨). 작성자 닉네임은 0022_gym_classes.sql의 gym_members와
-- 동일한 이유로 작성 시점에 profiles에서 평문 복사해둔다(denormalized) —
-- profiles RLS가 타인 조회를 막으므로, 피드에서 다른 사용자의 닉네임을 표시하려면
-- 라이브 조인이 아니라 이 방법이 유일하다.

-- ---------------- 1. 테이블 ----------------

create table if not exists public.community_posts (
  id text not null primary key,
  author_id uuid not null references auth.users (id) on delete cascade,
  author_nickname text not null,
  content text not null default '',
  post_type text not null check (post_type in ('text', 'media', 'curriculum', 'mixed')),
  gym_id text references public.gyms (id) on delete set null,
  gym_name text,
  -- 원본 커리큘럼 콘텐츠(Day/기술 등)를 통째로 복제하지 않는다 — 제목/무술/
  -- Day수/기술수 + 원본 curricula 행을 가리키는 참조 id만 담는 요약 스냅샷.
  -- curricula 테이블의 RLS가 본인 행만 select 가능(0002_curricula.sql)이라
  -- 애초에 타인이 원본을 직접 조회할 수 없으므로, 이 스냅샷이 피드에 보여줄
  -- 수 있는 유일한 정보다.
  curriculum_snapshot jsonb,
  like_count int not null default 0,
  comment_count int not null default 0,
  save_count int not null default 0,
  repost_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_post_media (
  id text not null primary key,
  post_id text not null references public.community_posts (id) on delete cascade,
  type text not null check (type in ('image', 'video')),
  url text not null,
  thumbnail_url text,
  order_index int not null default 0
);

create table if not exists public.community_post_likes (
  post_id text not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.community_post_saves (
  post_id text not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.community_post_comments (
  id text not null primary key,
  post_id text not null references public.community_posts (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  author_nickname text not null,
  content text not null,
  created_at timestamptz not null default now()
);

-- 리포스트는 새 community_posts 행을 만들지 않는다 — 리포스트의 리포스트도
-- 항상 진짜 원본 하나만 가리키도록(체이닝 불가) 클라이언트가 항상 원본으로
-- 해석한 뒤 이 테이블에 기록한다. original_author_nickname/
-- original_content_snippet은 리포스트 시점에 복사해두므로 원본이 나중에
-- 삭제돼도(ON DELETE SET NULL) 리포스트 카드 자체는 계속 정상 표시된다.
create table if not exists public.community_post_reposts (
  id text not null primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 리포스트한 사람 본인의 닉네임(작성 시점 복사) — "🔁 OO님이 리포스트" 표시에
  -- 필요하다. original_author_nickname(원본 작성자)과는 다른 값이다.
  reposter_nickname text not null,
  original_post_id text references public.community_posts (id) on delete set null,
  original_author_nickname text not null,
  original_content_snippet text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, original_post_id)
);

create index if not exists community_posts_created_at_idx on public.community_posts (created_at desc);
create index if not exists community_post_media_post_id_idx on public.community_post_media (post_id, order_index);
create index if not exists community_post_comments_post_id_idx on public.community_post_comments (post_id, created_at);
create index if not exists community_post_reposts_user_id_idx on public.community_post_reposts (user_id, created_at desc);

-- ---------------- 2. RLS ----------------
-- 게시물/미디어/댓글/좋아요/저장/리포스트 select는 로그인 사용자 전체 공개
-- (피드이므로). insert/update/delete는 전부 본인 행만 — 타인 게시물 수정·삭제,
-- 타인 대신 좋아요/저장/리포스트가 구조적으로 불가능하다. 카운트 컬럼은
-- 클라이언트가 update로 직접 못 건드리게 하는 대신(marketplace처럼 컬럼별
-- grant를 쓰지 않고), 아래 트리거가 어떤 update든 항상 실제 값으로 덮어쓴다.

alter table public.community_posts enable row level security;
alter table public.community_post_media enable row level security;
alter table public.community_post_likes enable row level security;
alter table public.community_post_saves enable row level security;
alter table public.community_post_comments enable row level security;
alter table public.community_post_reposts enable row level security;

create policy "community_posts_select_all" on public.community_posts
  for select using (auth.role() = 'authenticated');
create policy "community_posts_insert_own" on public.community_posts
  for insert with check (author_id = auth.uid());
create policy "community_posts_update_own" on public.community_posts
  for update using (author_id = auth.uid());
create policy "community_posts_delete_own" on public.community_posts
  for delete using (author_id = auth.uid());

create policy "community_post_media_select_all" on public.community_post_media
  for select using (auth.role() = 'authenticated');
create policy "community_post_media_insert_own_post" on public.community_post_media
  for insert with check (exists (select 1 from public.community_posts p where p.id = post_id and p.author_id = auth.uid()));
create policy "community_post_media_delete_own_post" on public.community_post_media
  for delete using (exists (select 1 from public.community_posts p where p.id = post_id and p.author_id = auth.uid()));

create policy "community_post_likes_select_all" on public.community_post_likes
  for select using (auth.role() = 'authenticated');
create policy "community_post_likes_insert_own" on public.community_post_likes
  for insert with check (user_id = auth.uid());
create policy "community_post_likes_delete_own" on public.community_post_likes
  for delete using (user_id = auth.uid());

create policy "community_post_saves_select_all" on public.community_post_saves
  for select using (auth.role() = 'authenticated');
create policy "community_post_saves_insert_own" on public.community_post_saves
  for insert with check (user_id = auth.uid());
create policy "community_post_saves_delete_own" on public.community_post_saves
  for delete using (user_id = auth.uid());

create policy "community_post_comments_select_all" on public.community_post_comments
  for select using (auth.role() = 'authenticated');
create policy "community_post_comments_insert_own" on public.community_post_comments
  for insert with check (author_id = auth.uid());
create policy "community_post_comments_delete_own" on public.community_post_comments
  for delete using (author_id = auth.uid());

create policy "community_post_reposts_select_all" on public.community_post_reposts
  for select using (auth.role() = 'authenticated');
create policy "community_post_reposts_insert_own" on public.community_post_reposts
  for insert with check (user_id = auth.uid());
create policy "community_post_reposts_delete_own" on public.community_post_reposts
  for delete using (user_id = auth.uid());

grant select, insert, update, delete on public.community_posts to authenticated;
grant select, insert, delete on public.community_post_media to authenticated;
grant select, insert, delete on public.community_post_likes to authenticated;
grant select, insert, delete on public.community_post_saves to authenticated;
grant select, insert, delete on public.community_post_comments to authenticated;
grant select, insert, delete on public.community_post_reposts to authenticated;

-- ---------------- 3. 통계 보호 트리거 ----------------
-- marketplace_curricula와 동일한 2단 구조: (a) 게시물 자신의 insert/update
-- 시 항상 실제 집계로 덮어쓰는 before-트리거, (b) 좋아요/댓글/저장/리포스트가
-- "다른" 테이블에서 생기거나 없어질 때 해당 게시물 행을 재계산해 넣어주는
-- after-트리거. 두 경로 모두 있어야 "내가 게시물을 수정하지 않았는데 남이
-- 좋아요를 눌렀을 때" 카운트가 실제로 갱신된다.

create or replace function public.trg_protect_community_post_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.like_count := (select count(*) from public.community_post_likes where post_id = new.id);
  new.comment_count := (select count(*) from public.community_post_comments where post_id = new.id);
  new.save_count := (select count(*) from public.community_post_saves where post_id = new.id);
  new.repost_count := (select count(*) from public.community_post_reposts where original_post_id = new.id);
  return new;
end;
$$;

drop trigger if exists community_posts_protect_stats on public.community_posts;
create trigger community_posts_protect_stats
  before insert or update on public.community_posts
  for each row execute function public.trg_protect_community_post_stats();

create or replace function public.recompute_community_post_stats(p_post_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.community_posts
  set
    like_count = (select count(*) from public.community_post_likes where post_id = p_post_id),
    comment_count = (select count(*) from public.community_post_comments where post_id = p_post_id),
    save_count = (select count(*) from public.community_post_saves where post_id = p_post_id),
    repost_count = (select count(*) from public.community_post_reposts where original_post_id = p_post_id)
  where id = p_post_id;
end;
$$;

create or replace function public.trg_recompute_community_post_stats_by_post_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_community_post_stats(coalesce(new.post_id, old.post_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists community_post_likes_stats on public.community_post_likes;
create trigger community_post_likes_stats
  after insert or delete on public.community_post_likes
  for each row execute function public.trg_recompute_community_post_stats_by_post_id();

drop trigger if exists community_post_saves_stats on public.community_post_saves;
create trigger community_post_saves_stats
  after insert or delete on public.community_post_saves
  for each row execute function public.trg_recompute_community_post_stats_by_post_id();

drop trigger if exists community_post_comments_stats on public.community_post_comments;
create trigger community_post_comments_stats
  after insert or delete on public.community_post_comments
  for each row execute function public.trg_recompute_community_post_stats_by_post_id();

create or replace function public.trg_recompute_community_post_stats_by_repost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_community_post_stats(coalesce(new.original_post_id, old.original_post_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists community_post_reposts_stats on public.community_post_reposts;
create trigger community_post_reposts_stats
  after insert or delete or update on public.community_post_reposts
  for each row execute function public.trg_recompute_community_post_stats_by_repost();

-- ---------------- 4. Storage 버킷 ----------------
-- 이 프로젝트에서 Supabase Storage를 사용하는 첫 기능. 업로드 경로를 항상
-- `{auth.uid()}/...`로 강제해 본인 폴더에만 쓸 수 있게 하고, 읽기는 피드가
-- 공개이므로 버킷 자체를 public으로 연다(RLS로 읽기를 세밀 제어할 필요 없음).

insert into storage.buckets (id, name, public)
values ('community-media', 'community-media', true)
on conflict (id) do nothing;

create policy "community_media_public_read" on storage.objects
  for select using (bucket_id = 'community-media');

create policy "community_media_insert_own_folder" on storage.objects
  for insert with check (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "community_media_delete_own_folder" on storage.objects
  for delete using (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
