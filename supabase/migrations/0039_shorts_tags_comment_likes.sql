-- 숏폼(Shorts) — technique / combo-setup tags on posts, and TikTok/Instagram-style comment
-- likes. Additive only: existing posts get an empty tag list, existing comments 0 likes.

-- 1) tags: [{ "type": "technique" | "combo", "id": "...", "name": "...", "martialArt": "..." }]
alter table public.community_posts
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table public.community_posts drop constraint if exists community_posts_tags_shape;
alter table public.community_posts
  add constraint community_posts_tags_shape check (jsonb_typeof(tags) = 'array' and jsonb_array_length(tags) <= 10);

-- 2) comment likes (one per user per comment; everyone can read, each user writes their own)
create table if not exists public.community_comment_likes (
  comment_id text not null references public.community_post_comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.community_comment_likes enable row level security;

drop policy if exists "community_comment_likes_select_all" on public.community_comment_likes;
create policy "community_comment_likes_select_all" on public.community_comment_likes
  for select using (true);
drop policy if exists "community_comment_likes_insert_own" on public.community_comment_likes;
create policy "community_comment_likes_insert_own" on public.community_comment_likes
  for insert with check (auth.uid() = user_id);
drop policy if exists "community_comment_likes_delete_own" on public.community_comment_likes;
create policy "community_comment_likes_delete_own" on public.community_comment_likes
  for delete using (auth.uid() = user_id);

grant select on public.community_comment_likes to anon, authenticated;
grant insert, delete on public.community_comment_likes to authenticated;

-- 3) like_count on comments — maintained by triggers, never trusted from the client
alter table public.community_post_comments
  add column if not exists like_count integer not null default 0;

create index if not exists community_post_comments_like_idx
  on public.community_post_comments (post_id, like_count desc, created_at);

create or replace function public.trg_protect_comment_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.like_count := (select count(*) from public.community_comment_likes where comment_id = new.id);
  return new;
end;
$$;

drop trigger if exists community_post_comments_protect_like_count on public.community_post_comments;
create trigger community_post_comments_protect_like_count
  before insert or update on public.community_post_comments
  for each row execute function public.trg_protect_comment_like_count();

create or replace function public.trg_recompute_comment_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cid text := coalesce(new.comment_id, old.comment_id);
begin
  update public.community_post_comments set like_count = like_count where id = cid; -- the protect trigger recomputes it
  return null;
end;
$$;

drop trigger if exists community_comment_likes_count on public.community_comment_likes;
create trigger community_comment_likes_count
  after insert or delete on public.community_comment_likes
  for each row execute function public.trg_recompute_comment_like_count();
