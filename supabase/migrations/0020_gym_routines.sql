-- 요일별 반복 웨이트 트레이닝 루틴 (see src/lib/gymRoutine/). Curriculum/
-- CurriculumDay.day는 완전 순차적(Day 1..N)이라 확장 대상이 없어 새 테이블로
-- 만든다 — reuse-first 원칙상 "정말 필요한" 유일한 신규 테이블. 세트 기록은
-- training_history.data(jsonb)의 TrainingExerciseDetail을 가산적으로 확장해
-- 재사용하고, 운동 정의(147개)는 정적 번들(src/lib/gymTraining/library.ts)이라
-- 둘 다 별도 테이블이 필요 없다.
-- 0006_combos.sql과 동일한 data jsonb + 실 컬럼 몇 개 구조.

create table if not exists public.gym_routines (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  active boolean not null default false,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

alter table public.gym_routines enable row level security;

create policy "gym_routines_select_own" on public.gym_routines
  for select using (auth.uid() = user_id);
create policy "gym_routines_insert_own" on public.gym_routines
  for insert with check (auth.uid() = user_id);
create policy "gym_routines_update_own" on public.gym_routines
  for update using (auth.uid() = user_id);
create policy "gym_routines_delete_own" on public.gym_routines
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.gym_routines to authenticated;
