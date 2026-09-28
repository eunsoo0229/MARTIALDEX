import { supabase } from '../supabase/client';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';
import { recordTrainingSession } from '../trainingHistory/service';
import type { TrainingExerciseDetail } from '../trainingHistory/types';
import { generateJoinCode, normalizeJoinCode } from './joinCode';
import type {
  Gym,
  GymClass,
  GymClassAttendance,
  GymClassPlan,
  GymClassSession,
  MyGymMembership,
  OpenSessionForStudent,
  RosterEntry,
} from './types';

// Live-Supabase-read pattern (no local-first cache) — reused from
// marketplace/service.ts, since this is (like marketplace listings) other
// users' shared data that cannot be cached locally ahead of time.
const NOT_CONFIGURED = 'Supabase 설정이 필요합니다.';

function newId(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${rand}`;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function mapGym(row: Record<string, unknown>): Gym {
  return {
    id: row.id as string,
    name: row.name as string,
    ownerUserId: row.owner_user_id as string,
    joinCode: row.join_code as string,
    createdAt: row.created_at as string,
  };
}

function mapClass(row: Record<string, unknown>): GymClass {
  return {
    id: row.id as string,
    gymId: row.gym_id as string,
    title: row.title as string,
    plan: row.plan as GymClassPlan,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
  };
}

function mapSession(row: Record<string, unknown>): GymClassSession {
  return {
    id: row.id as string,
    gymClassId: row.gym_class_id as string,
    gymId: row.gym_id as string,
    date: row.date as string,
    status: row.status as GymClassSession['status'],
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
  };
}

function mapAttendance(row: Record<string, unknown>): GymClassAttendance {
  return {
    sessionId: row.session_id as string,
    studentUserId: row.student_user_id as string,
    completed: row.completed as boolean,
    exerciseDetails: (row.exercise_details as TrainingExerciseDetail[] | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

/** Creates a gym and registers the creator as its instructor — self-serve, same trust model as marketplace publishing. */
export async function createGym(name: string, ownerUserId: string, ownerNickname: string): Promise<AuthResult<Gym>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const id = newId('gym');
    const row = { id, name: name.trim(), owner_user_id: ownerUserId, join_code: generateJoinCode(), created_at: new Date().toISOString() };
    const { error: gymError } = await supabase.from('gyms').insert(row);
    if (gymError) return { ok: false, message: toKoreanAuthMessage(gymError) };

    const { error: memberError } = await supabase
      .from('gym_members')
      .insert({ gym_id: id, user_id: ownerUserId, role: 'instructor', nickname: ownerNickname, joined_at: new Date().toISOString() });
    if (memberError) {
      await supabase.from('gyms').delete().eq('id', id);
      return { ok: false, message: toKoreanAuthMessage(memberError) };
    }
    return { ok: true, data: mapGym(row) };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

/** Student joins a gym by its 6-character code. Idempotent — re-joining an already-joined gym just succeeds. */
export async function joinGymByCode(code: string, userId: string, nickname: string): Promise<AuthResult<Gym>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    // A prospective student isn't a member yet, so gyms' normal RLS
    // (member-only select) would hide the row — find_gym_by_join_code()
    // (migration 0024) is a SECURITY DEFINER lookup that still requires
    // knowing the exact code, preserving the invite-code security model.
    const { data: gymRows, error: gymError } = await supabase.rpc('find_gym_by_join_code', { p_join_code: normalizeJoinCode(code) });
    if (gymError) return { ok: false, message: toKoreanAuthMessage(gymError) };
    const gymRow = gymRows?.[0];
    if (!gymRow) return { ok: false, message: '체육관 코드를 찾을 수 없습니다.' };

    const { error: memberError } = await supabase
      .from('gym_members')
      .upsert({ gym_id: gymRow.id, user_id: userId, role: 'student', nickname, joined_at: new Date().toISOString() }, { onConflict: 'gym_id,user_id' });
    if (memberError) return { ok: false, message: toKoreanAuthMessage(memberError) };

    return { ok: true, data: mapGym(gymRow) };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

/** Every gym I belong to, with my role in each — for both the student hub and the instructor hub. */
export async function listMyGyms(userId: string): Promise<AuthResult<MyGymMembership[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.from('gym_members').select('gym_id, role, gyms(*)').eq('user_id', userId);
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    const list = (data ?? [])
      .filter((row: any) => row.gyms)
      .map((row: any) => ({ gym: mapGym(row.gyms), role: row.role as MyGymMembership['role'] }));
    return { ok: true, data: list };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function getGym(gymId: string): Promise<AuthResult<Gym | null>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.from('gyms').select('*').eq('id', gymId).maybeSingle();
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: data ? mapGym(data) : null };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function createGymClass(gymId: string, title: string, plan: GymClassPlan, createdBy: string): Promise<AuthResult<GymClass>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const row = { id: newId('gymclass'), gym_id: gymId, title: title.trim(), plan, created_by: createdBy, created_at: new Date().toISOString() };
    const { error } = await supabase.from('gym_classes').insert(row);
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: mapClass(row) };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function listGymClasses(gymId: string): Promise<AuthResult<GymClass[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.from('gym_classes').select('*').eq('gym_id', gymId).order('created_at', { ascending: false });
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: (data ?? []).map(mapClass) };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

/** Opens (or returns the already-open) session for this class today — idempotent so double-tapping "오늘 수업 열기" never creates duplicate sessions. */
export async function openTodaySession(gymClass: GymClass, createdBy: string): Promise<AuthResult<GymClassSession>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const date = todayKey();
    const { data: existing, error: findError } = await supabase
      .from('gym_class_sessions')
      .select('*')
      .eq('gym_class_id', gymClass.id)
      .eq('date', date)
      .maybeSingle();
    if (findError) return { ok: false, message: toKoreanAuthMessage(findError) };
    if (existing) return { ok: true, data: mapSession(existing) };

    const row = {
      id: newId('gymsession'),
      gym_class_id: gymClass.id,
      gym_id: gymClass.gymId,
      date,
      status: 'open' as const,
      created_by: createdBy,
      created_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('gym_class_sessions').insert(row);
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: mapSession(row) };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

/** One session plus its class (for `plan`) and gym name — what the session-runner screen needs given only a sessionId from the URL. */
export async function getSessionWithClass(
  sessionId: string
): Promise<AuthResult<{ session: GymClassSession; gymClass: GymClass; gymName: string } | null>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.from('gym_class_sessions').select('*, gym_classes(*), gyms(name)').eq('id', sessionId).maybeSingle();
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    if (!data || !data.gym_classes) return { ok: true, data: null };
    return { ok: true, data: { session: mapSession(data), gymClass: mapClass(data.gym_classes), gymName: data.gyms?.name ?? '체육관' } };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

/** Every currently-open session across every gym the student belongs to, with whether they've already completed it. */
export async function listOpenSessionsForStudent(userId: string): Promise<AuthResult<OpenSessionForStudent[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data: memberships, error: memberError } = await supabase.from('gym_members').select('gym_id').eq('user_id', userId);
    if (memberError) return { ok: false, message: toKoreanAuthMessage(memberError) };
    const gymIds = (memberships ?? []).map((m: any) => m.gym_id);
    if (gymIds.length === 0) return { ok: true, data: [] };

    const { data: sessions, error: sessionError } = await supabase
      .from('gym_class_sessions')
      .select('*, gym_classes(title), gyms(name)')
      .in('gym_id', gymIds)
      .eq('status', 'open')
      .eq('date', todayKey());
    if (sessionError) return { ok: false, message: toKoreanAuthMessage(sessionError) };

    const sessionIds = (sessions ?? []).map((s: any) => s.id);
    const { data: attendance, error: attendanceError } =
      sessionIds.length > 0
        ? await supabase.from('gym_class_attendance').select('session_id, completed').eq('student_user_id', userId).in('session_id', sessionIds)
        : { data: [], error: null };
    if (attendanceError) return { ok: false, message: toKoreanAuthMessage(attendanceError) };
    const completedSet = new Set((attendance ?? []).filter((a: any) => a.completed).map((a: any) => a.session_id));

    const list: OpenSessionForStudent[] = (sessions ?? []).map((row: any) => ({
      session: mapSession(row),
      classTitle: row.gym_classes?.title ?? '수업',
      gymName: row.gyms?.name ?? '체육관',
      alreadyCompleted: completedSet.has(row.id),
    }));
    return { ok: true, data: list };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

/** Instructor-only roster for one session — completion/set-count only, never nutrition/profile data (see migration 0022). */
export async function listRosterForSession(gymId: string, sessionId: string): Promise<AuthResult<RosterEntry[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data: members, error: memberError } = await supabase.from('gym_members').select('user_id, nickname').eq('gym_id', gymId).eq('role', 'student');
    if (memberError) return { ok: false, message: toKoreanAuthMessage(memberError) };

    const { data: attendance, error: attendanceError } = await supabase.from('gym_class_attendance').select('*').eq('session_id', sessionId);
    if (attendanceError) return { ok: false, message: toKoreanAuthMessage(attendanceError) };
    const byStudent = new Map((attendance ?? []).map((a: any) => [a.student_user_id, mapAttendance(a)]));

    const roster: RosterEntry[] = (members ?? []).map((m: any) => {
      const att = byStudent.get(m.user_id);
      const totalSets = att?.exerciseDetails?.reduce((sum, ex) => sum + ex.actualReps.filter((r) => r !== null).length, 0) ?? 0;
      return {
        studentUserId: m.user_id,
        studentNickname: m.nickname ?? null,
        completed: att?.completed ?? false,
        totalSets,
        completedAt: att?.completedAt ?? null,
      };
    });
    return { ok: true, data: roster };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export async function getMyAttendance(sessionId: string, userId: string): Promise<AuthResult<GymClassAttendance | null>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.from('gym_class_attendance').select('*').eq('session_id', sessionId).eq('student_user_id', userId).maybeSingle();
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };
    return { ok: true, data: data ? mapAttendance(data) : null };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

/**
 * The one function that turns a completed gym-class workout into BOTH (1)
 * the instructor-facing roster row and (2) the student's own
 * TrainingHistoryEntry — the Single Source of Truth for every derived
 * system (nutrition/calendar/recovery/skillProgress/sync — see plan Part
 * B4, none of which needed any code change). Idempotent: if this session is
 * already marked completed for this student, it returns immediately without
 * writing a second trainingHistory entry (the UI also disables the
 * "완료" button once already-completed, but this guard is the real defense).
 */
export async function submitAttendance(
  session: GymClassSession,
  meta: { gymName: string; classTitle: string },
  techniqueIds: string[],
  exerciseDetails: TrainingExerciseDetail[],
  estimatedMinutes: number,
  actualMinutes: number,
  userId: string
): Promise<AuthResult<void>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const existing = await getMyAttendance(session.id, userId);
    if (existing.ok && existing.data?.completed) return { ok: true, data: undefined };

    const completedAt = new Date().toISOString();
    const { error } = await supabase
      .from('gym_class_attendance')
      .upsert(
        { session_id: session.id, student_user_id: userId, completed: true, exercise_details: exerciseDetails, completed_at: completedAt },
        { onConflict: 'session_id,student_user_id' }
      );
    if (error) return { ok: false, message: toKoreanAuthMessage(error) };

    recordTrainingSession({
      curriculumId: null,
      dayNumber: null,
      techniqueIds,
      completed: true,
      estimatedMinutes,
      actualMinutes,
      notes: `${meta.gymName} · ${meta.classTitle}`,
      source: 'gym_class',
      exerciseDetails,
      gymClassMeta: { gymId: session.gymId, gymName: meta.gymName, classTitle: meta.classTitle, sessionId: session.id },
    });

    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}
