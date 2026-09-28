-- MARTIALDEX 통합 기능 개선 — "관련 영상 찾기 / YouTube 영상 불러오기" 기능의
-- 영구 저장소. Same shape/convention as 0006_combos.sql: `data` holds the
-- full local TechniqueVideoPick JSON object as-is
-- (src/lib/techniqueVideo/types.ts). Deliberately separate from the
-- technique's own curated/add_teq `videos` field — this is a PER-USER
-- overlay, never a mutation of shared technique data (two different users
-- must be able to pick different videos for the same shared technique
-- without overwriting each other). Private to the owning user, same
-- privacy stance as curricula/combos/user_techniques.

create table if not exists public.technique_video_picks (
  technique_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (technique_id, user_id)
);

alter table public.technique_video_picks enable row level security;

create policy "technique_video_picks_select_own" on public.technique_video_picks
  for select using (auth.uid() = user_id);
create policy "technique_video_picks_insert_own" on public.technique_video_picks
  for insert with check (auth.uid() = user_id);
create policy "technique_video_picks_update_own" on public.technique_video_picks
  for update using (auth.uid() = user_id);
create policy "technique_video_picks_delete_own" on public.technique_video_picks
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.technique_video_picks to authenticated;
