-- AI 질문 사용 기록 — AiAskModal(기술/자세분석/커리큘럼 Day/선수 스타일/AI
-- 코치/전역 질문)을 통해 오간 질문-답변 쌍을 기록해 마이페이지에서 조회·
-- 삭제하고, 로그인 사용자는 다른 기기에서도 볼 수 있게 한다. technique_reports
-- (0017)와 동일한 "본인 것만 select/insert" 패턴에 delete_own만 추가한다 —
-- 기록은 수정 불가(update 정책 없음)이지만 사용자가 삭제는 할 수 있어야 한다.
--
-- Gemini API 키 등 비밀정보는 애초에 클라이언트 코드가 본 적이 없으므로(항상
-- Electron IPC나 gemini-ask Edge Function을 통해서만 호출) 여기 저장되는 값은
-- 순수 질문/답변 텍스트뿐이다.
create table if not exists public.ai_question_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null check (feature in ('technique', 'pose_analysis', 'curriculum_day', 'fighter_style', 'coach', 'global')),
  question text not null,
  answer text not null,
  related_technique_id text,
  related_curriculum_id text,
  created_at timestamptz not null default now()
);

create index if not exists ai_question_history_user_id_created_at_idx
  on public.ai_question_history (user_id, created_at desc);

alter table public.ai_question_history enable row level security;

create policy "ai_question_history_select_own" on public.ai_question_history
  for select using (auth.uid() = user_id);
create policy "ai_question_history_insert_own" on public.ai_question_history
  for insert with check (auth.uid() = user_id);
create policy "ai_question_history_delete_own" on public.ai_question_history
  for delete using (auth.uid() = user_id);
-- No update policy — a recorded question/answer is never edited in place.

grant select, insert, delete on public.ai_question_history to authenticated;
