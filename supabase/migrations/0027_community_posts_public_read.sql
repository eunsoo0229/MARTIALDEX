-- 0026's select policies used auth.role() = 'authenticated', which blocks
-- the anon key entirely — a logged-out visitor got a 401 on every read
-- (community_posts/media/likes/saves/comments/reposts), so the "게시물" tab
-- showed a generic error instead of a browsable feed with no compose button
-- (bug report: "게시물 생성 UI가 없어" turned out to be this masking the whole
-- feed, not the composer itself — the composer only ever needed login, same
-- as every write action here, but reading should not have). Community's
-- curriculum-browse tab and the technique encyclopedia are both readable
-- without an account; the post feed should follow the same convention.
-- Writes (insert/update/delete) are untouched — still author_id/user_id =
-- auth.uid() only, so this is a pure read-access widening.

drop policy if exists "community_posts_select_all" on public.community_posts;
create policy "community_posts_select_all" on public.community_posts for select using (true);

drop policy if exists "community_post_media_select_all" on public.community_post_media;
create policy "community_post_media_select_all" on public.community_post_media for select using (true);

drop policy if exists "community_post_likes_select_all" on public.community_post_likes;
create policy "community_post_likes_select_all" on public.community_post_likes for select using (true);

drop policy if exists "community_post_saves_select_all" on public.community_post_saves;
create policy "community_post_saves_select_all" on public.community_post_saves for select using (true);

drop policy if exists "community_post_comments_select_all" on public.community_post_comments;
create policy "community_post_comments_select_all" on public.community_post_comments for select using (true);

drop policy if exists "community_post_reposts_select_all" on public.community_post_reposts;
create policy "community_post_reposts_select_all" on public.community_post_reposts for select using (true);

grant select on public.community_posts to anon;
grant select on public.community_post_media to anon;
grant select on public.community_post_likes to anon;
grant select on public.community_post_saves to anon;
grant select on public.community_post_comments to anon;
grant select on public.community_post_reposts to anon;
