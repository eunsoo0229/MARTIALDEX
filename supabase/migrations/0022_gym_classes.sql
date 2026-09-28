-- 체육관 관리자/학생 수업 시스템 (see src/lib/gymClass/). This is the FIRST
-- feature in this codebase where one user (관장님/instructor) needs to see
-- part of another user's (학생/student) data — every existing table's RLS
-- is `auth.uid() = user_id` (self-only). Five new tables, no existing table
-- touched. A student's actual training record is NEVER duplicated here —
-- gym_class_attendance is only an instructor-facing roster/completion view;
-- the single source of truth for the student's own workout remains their
-- own trainingHistory entry (source='gym_class'), synced via the existing
-- training_history table/sync unchanged (trainingHistorySync.ts never reads
-- `source`, so it required zero changes).
--
-- All 5 tables are created first, THEN all RLS policies — several policies
-- below cross-reference another one of these tables (e.g. gyms' policy
-- checks gym_members), so policy creation must happen after every table in
-- this migration exists.

-- 체육관 자체. join_code is a short, unique, human-typeable code (see
-- src/lib/gymClass/joinCode.ts) — NOT the same mechanism as curriculum's
-- shareCode.ts (which encodes a curriculum's full content into a code);
-- here the code is only a lookup key into this table.
create table if not exists public.gyms (
  id text not null primary key,
  name text not null,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  join_code text not null unique,
  created_at timestamptz not null default now()
);

-- 체육관 멤버십 + 역할. 역할은 테이블(체육관) 단위라, 한 사용자가 A체육관의
-- 관장이면서 B체육관의 학생일 수 있다 — 추가 비용 없는 자연스러운 부산물.
-- nickname은 가입/생성 시점에 본인 프로필에서 가져와 이 테이블에 그대로
-- 저장해둔다(denormalized) — 관장님의 로스터 조회가 `profiles`의 기존
-- self-only RLS(auth.uid() = user_id)를 우회해 다른 사용자의 프로필을 읽을
-- 필요가 없도록 하기 위함(그 RLS는 이 마이그레이션에서 건드리지 않음). 각
-- 사용자는 항상 자기 자신의 행만 insert/update한다.
create table if not exists public.gym_members (
  gym_id text not null references public.gyms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('instructor', 'student')),
  nickname text not null,
  joined_at timestamptz not null default now(),
  primary key (gym_id, user_id)
);

-- 클래스(수업) 정의. plan은 기존 TodayTrainingPlan.gymExerciseConfig와 동일한
-- 모양 { techniqueIds: string[], exerciseConfig: Record<string, ExerciseConfig> }
-- 을 재사용 — 새 타입을 만들지 않는다.
create table if not exists public.gym_classes (
  id text not null primary key,
  gym_id text not null references public.gyms (id) on delete cascade,
  title text not null,
  plan jsonb not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 특정 날짜에 실제로 "열린" 수업 인스턴스. 관장님이 "오늘 수업 열기"를 누르면
-- 생성된다.
create table if not exists public.gym_class_sessions (
  id text not null primary key,
  gym_class_id text not null references public.gym_classes (id) on delete cascade,
  gym_id text not null references public.gyms (id) on delete cascade,
  date text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists gym_class_sessions_gym_id_idx on public.gym_class_sessions (gym_id);

-- 세션별 학생 출석/완료 기록 — 관장님용 로스터 열람 전용 뷰. 세트/반복/완료
-- 여부만 담고 영양·프로필 등 개인정보는 전혀 없음 — instructor의 select 권한을
-- 이 테이블 밖으로 절대 확장하지 않는 것 자체가 개인정보 비노출을 구조적으로
-- 보장한다(요청 13번). 실제 훈련 기록의 단일 진실 공급원은 각 학생의
-- training_history 행(source='gym_class')이며 이 테이블이 그것을 대체하지 않음.
create table if not exists public.gym_class_attendance (
  session_id text not null references public.gym_class_sessions (id) on delete cascade,
  student_user_id uuid not null references auth.users (id) on delete cascade,
  completed boolean not null default false,
  exercise_details jsonb,
  completed_at timestamptz,
  primary key (session_id, student_user_id)
);

-- ===== RLS =====

alter table public.gyms enable row level security;
alter table public.gym_members enable row level security;
alter table public.gym_classes enable row level security;
alter table public.gym_class_sessions enable row level security;
alter table public.gym_class_attendance enable row level security;

-- gyms: 멤버인 체육관만 select, 생성은 누구나(자기소개 self-serve — 기존
-- 마켓플레이스 발행/기술 요청과 동일한 자기 신고 신뢰 모델, 관리자 승인
-- 게이트 없음), update/delete는 owner만.
create policy "gyms_select_member" on public.gyms
  for select using (
    owner_user_id = auth.uid()
    or exists (select 1 from public.gym_members m where m.gym_id = gyms.id and m.user_id = auth.uid())
  );
create policy "gyms_insert_self" on public.gyms
  for insert with check (owner_user_id = auth.uid());
create policy "gyms_update_owner" on public.gyms
  for update using (owner_user_id = auth.uid());
create policy "gyms_delete_owner" on public.gyms
  for delete using (owner_user_id = auth.uid());

grant select, insert, update, delete on public.gyms to authenticated;

-- gym_members: 이 SELECT 정책이 이 코드베이스 최초의 "타인 행 조회" 정책이다:
-- instructor 멤버는 자기 체육관의 다른 멤버(로스터) 행도 볼 수 있다.
create policy "gym_members_select_self_or_roster" on public.gym_members
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.gym_members me
      where me.gym_id = gym_members.gym_id and me.user_id = auth.uid() and me.role = 'instructor'
    )
  );
-- 가입(학생 self-serve, 코드로) 또는 체육관 생성 직후 owner 본인을 instructor로
-- 등록하는 것 둘 다 "자기 자신을 추가"이므로 본인 행 insert만 허용.
create policy "gym_members_insert_self" on public.gym_members
  for insert with check (user_id = auth.uid());
create policy "gym_members_delete_self" on public.gym_members
  for delete using (user_id = auth.uid());

grant select, insert, delete on public.gym_members to authenticated;

create policy "gym_classes_select_member" on public.gym_classes
  for select using (
    exists (select 1 from public.gym_members m where m.gym_id = gym_classes.gym_id and m.user_id = auth.uid())
  );
create policy "gym_classes_insert_instructor" on public.gym_classes
  for insert with check (
    exists (select 1 from public.gym_members m where m.gym_id = gym_classes.gym_id and m.user_id = auth.uid() and m.role = 'instructor')
  );
create policy "gym_classes_update_instructor" on public.gym_classes
  for update using (
    exists (select 1 from public.gym_members m where m.gym_id = gym_classes.gym_id and m.user_id = auth.uid() and m.role = 'instructor')
  );
create policy "gym_classes_delete_instructor" on public.gym_classes
  for delete using (
    exists (select 1 from public.gym_members m where m.gym_id = gym_classes.gym_id and m.user_id = auth.uid() and m.role = 'instructor')
  );

grant select, insert, update, delete on public.gym_classes to authenticated;

create policy "gym_class_sessions_select_member" on public.gym_class_sessions
  for select using (
    exists (select 1 from public.gym_members m where m.gym_id = gym_class_sessions.gym_id and m.user_id = auth.uid())
  );
create policy "gym_class_sessions_insert_instructor" on public.gym_class_sessions
  for insert with check (
    exists (select 1 from public.gym_members m where m.gym_id = gym_class_sessions.gym_id and m.user_id = auth.uid() and m.role = 'instructor')
  );
create policy "gym_class_sessions_update_instructor" on public.gym_class_sessions
  for update using (
    exists (select 1 from public.gym_members m where m.gym_id = gym_class_sessions.gym_id and m.user_id = auth.uid() and m.role = 'instructor')
  );

grant select, insert, update on public.gym_class_sessions to authenticated;

create policy "gym_class_attendance_select_self_or_instructor" on public.gym_class_attendance
  for select using (
    student_user_id = auth.uid()
    or exists (
      select 1 from public.gym_class_sessions s
      join public.gym_members m on m.gym_id = s.gym_id
      where s.id = gym_class_attendance.session_id and m.user_id = auth.uid() and m.role = 'instructor'
    )
  );
-- 학생 본인만 자기 출석 행을 insert/update — 관장님은 select만(위 정책), 절대
-- 학생 대신 완료 처리를 할 수 없다.
create policy "gym_class_attendance_insert_self" on public.gym_class_attendance
  for insert with check (student_user_id = auth.uid());
create policy "gym_class_attendance_update_self" on public.gym_class_attendance
  for update using (student_user_id = auth.uid());

grant select, insert, update on public.gym_class_attendance to authenticated;
