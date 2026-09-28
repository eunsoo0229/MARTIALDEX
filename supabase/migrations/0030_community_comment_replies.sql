-- MARTIALDEX 통합 기능 개선 — 댓글 답글(threaded reply) 기능. 기존
-- community_post_comments 테이블에 컬럼만 추가하는 additive 마이그레이션 —
-- 기존 댓글 행은 parent_comment_id가 그냥 null로 남아 "최상위 댓글"로 계속
-- 정상 동작한다(하위 호환 깨지지 않음).
--
-- reply_count는 0026_community_posts.sql의 like_count/comment_count와 정확히
-- 같은 "BEFORE 트리거로 자기 자신의 카운트를 실제 자식 행에서 재계산 +
-- AFTER 트리거로 자식 테이블 변경 시 부모 재계산" 2단 구조를 그대로
-- 재사용한다 — 답글도 결국 같은 테이블의 자기참조 자식 행이므로 동일한
-- 패턴이 그대로 적용된다.

alter table public.community_post_comments
  add column if not exists parent_comment_id text references public.community_post_comments (id) on delete cascade;

alter table public.community_post_comments
  add column if not exists reply_count integer not null default 0;

create index if not exists community_post_comments_parent_id_idx
  on public.community_post_comments (parent_comment_id, created_at);

-- 답글 자신이 insert/update될 때, 자기 자신의 reply_count는 항상 "실제로
-- 나를 부모로 가진 댓글 수"로 강제 재계산 (클라이언트가 임의 값을 써넣을 수
-- 없도록 — 0026의 trg_protect_community_post_stats와 동일한 원칙).
create or replace function public.trg_protect_comment_reply_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.reply_count := (select count(*) from public.community_post_comments where parent_comment_id = new.id);
  return new;
end;
$$;

drop trigger if exists community_post_comments_protect_reply_count on public.community_post_comments;
create trigger community_post_comments_protect_reply_count
  before insert or update on public.community_post_comments
  for each row execute function public.trg_protect_comment_reply_count();

-- 답글이 insert/delete될 때, 그 답글의 "부모 댓글"의 reply_count를
-- 재계산한다.
create or replace function public.recompute_comment_reply_count(p_comment_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.community_post_comments
  set reply_count = (select count(*) from public.community_post_comments where parent_comment_id = p_comment_id)
  where id = p_comment_id;
end;
$$;

create or replace function public.trg_recompute_comment_reply_count_by_child()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (coalesce(new.parent_comment_id, old.parent_comment_id)) is not null then
    perform public.recompute_comment_reply_count(coalesce(new.parent_comment_id, old.parent_comment_id));
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists community_post_comments_reply_count_by_child on public.community_post_comments;
create trigger community_post_comments_reply_count_by_child
  after insert or delete on public.community_post_comments
  for each row execute function public.trg_recompute_comment_reply_count_by_child();
