import { supabase } from '../supabase/client';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';
import { planRounds, type Rng } from './matching';
import type { LiveControlAction, LivePairing, LiveParticipant, LiveSession, LiveSessionKind } from './types';

const NOT_CONFIGURED = 'Supabase 설정이 필요합니다.';

function newId(): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `gymlive_${rand}`;
}

export function mapLiveSession(row: Record<string, unknown>): LiveSession {
  return {
    id: row.id as string,
    gymId: row.gym_id as string,
    coachUserId: row.coach_user_id as string,
    kind: row.kind as LiveSessionKind,
    title: row.title as string,
    techniqueId: (row.technique_id as string | null) ?? null,
    techniqueName: (row.technique_name as string | null) ?? null,
    martialArt: (row.martial_art as string | null) ?? null,
    workSeconds: row.work_seconds as number,
    restSeconds: row.rest_seconds as number,
    totalSets: row.total_sets as number,
    status: row.status as LiveSession['status'],
    anchorAt: row.anchor_at ? new Date(row.anchor_at as string).getTime() : null,
    anchorElapsedMs: Number(row.anchor_elapsed_ms ?? 0),
    segments: ((row.segments as [number, number][] | null) ?? []).map(([a, b]) => [Number(a), Number(b)] as [number, number]),
    startedAt: (row.started_at as string | null) ?? null,
    endedAt: (row.ended_at as string | null) ?? null,
    endedElapsedMs: row.ended_elapsed_ms == null ? null : Number(row.ended_elapsed_ms),
    version: Number(row.version ?? 0),
    createdAt: row.created_at as string,
  };
}

export function mapLiveParticipant(row: Record<string, unknown>): LiveParticipant {
  return {
    sessionId: row.session_id as string,
    userId: row.user_id as string,
    gymId: row.gym_id as string,
    nickname: row.nickname as string,
    pairings: (row.pairings as LivePairing[] | null) ?? [],
    active: !!row.active,
    recordedAt: (row.recorded_at as string | null) ?? null,
  };
}

export interface GymStudent {
  userId: string;
  nickname: string;
}

/** The gym's students (instructor-only via gym_members RLS). */
export async function listGymStudents(gymId: string): Promise<AuthResult<GymStudent[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase.from('gym_members').select('user_id, nickname').eq('gym_id', gymId).eq('role', 'student').order('joined_at');
  if (error) return { ok: false, message: toKoreanAuthMessage(error) };
  return { ok: true, data: (data ?? []).map((r) => ({ userId: r.user_id as string, nickname: r.nickname as string })) };
}

/** Builds each student's OWN pairing list (opponent nickname only) from the round plan. */
export function buildParticipantPairings(students: GymStudent[], kind: LiveSessionKind, rounds: number, rng?: Rng): Map<string, LivePairing[]> {
  const out = new Map<string, LivePairing[]>(students.map((s) => [s.userId, []]));
  if (kind !== 'sparring') return out;
  const nick = new Map(students.map((s) => [s.userId, s.nickname]));
  for (const plan of planRounds(students.map((s) => s.userId), rounds, rng)) {
    for (const [a, b] of plan.pairs) {
      out.get(a)!.push({ round: plan.round, opponentUserId: b, opponentNickname: nick.get(b) ?? null });
      out.get(b)!.push({ round: plan.round, opponentUserId: a, opponentNickname: nick.get(a) ?? null });
    }
    if (plan.bye) out.get(plan.bye)!.push({ round: plan.round, opponentUserId: null, opponentNickname: null });
  }
  return out;
}

export interface CreateLiveSessionInput {
  gymId: string;
  kind: LiveSessionKind;
  title: string;
  techniqueId: string | null;
  techniqueName: string | null;
  martialArt: string | null;
  workSeconds: number;
  restSeconds: number;
  totalSets: number;
  students: GymStudent[];
  /** End the students' other active session(s) first (after the coach confirmed). */
  replaceActive?: boolean;
}

export type CreateLiveResult = { ok: true; data: LiveSession } | { ok: false; message: string; busyNicknames?: string[] };

export async function createLiveSession(input: CreateLiveSessionInput, rng?: Rng): Promise<CreateLiveResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const pairings = buildParticipantPairings(input.students, input.kind, input.totalSets, rng);
  const { data, error } = await supabase.rpc('gym_live_create', {
    p_id: newId(),
    p_gym_id: input.gymId,
    p_kind: input.kind,
    p_title: input.title,
    p_technique_id: input.techniqueId,
    p_technique_name: input.techniqueName,
    p_martial_art: input.martialArt,
    p_work_seconds: input.workSeconds,
    p_rest_seconds: input.restSeconds,
    p_total_sets: input.totalSets,
    p_participants: input.students.map((s) => ({ userId: s.userId, nickname: s.nickname, pairings: pairings.get(s.userId) ?? [] })),
    p_replace_active: !!input.replaceActive,
  });
  if (error) {
    const msg = error.message ?? '';
    const busy = msg.match(/ACTIVE_SESSION:(.*)$/);
    if (busy) return { ok: false, message: '이미 진행 중인 훈련이 있는 학생이 있습니다.', busyNicknames: busy[1].split(',').filter(Boolean) };
    if (msg.includes('NOT_INSTRUCTOR')) return { ok: false, message: '관장/코치만 훈련을 시작할 수 있습니다.' };
    if (msg.includes('NOT_GYM_STUDENT')) return { ok: false, message: '이 체육관의 학생만 선택할 수 있습니다.' };
    if (msg.includes('SPARRING_NEEDS_TWO')) return { ok: false, message: '스파링은 학생 2명 이상이 필요합니다.' };
    return { ok: false, message: toKoreanAuthMessage(error) };
  }
  return { ok: true, data: mapLiveSession(data as Record<string, unknown>) };
}

export async function controlLiveSession(id: string, action: LiveControlAction): Promise<AuthResult<LiveSession>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase.rpc('gym_live_control', { p_id: id, p_action: action });
  if (error) return { ok: false, message: error.message?.includes('NOT_INSTRUCTOR') ? '관장/코치만 제어할 수 있습니다.' : toKoreanAuthMessage(error) };
  return { ok: true, data: mapLiveSession(data as Record<string, unknown>) };
}

/** Asks the SERVER to mark natural completion — it only does so if the timeline really reached its end. */
export async function completeLiveSessionIfDue(id: string): Promise<AuthResult<LiveSession>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase.rpc('gym_live_complete_if_due', { p_id: id });
  if (error) return { ok: false, message: toKoreanAuthMessage(error) };
  return { ok: true, data: mapLiveSession(data as Record<string, unknown>) };
}

export async function markLiveRecorded(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.rpc('gym_live_mark_recorded', { p_id: id });
}

export async function getLiveSession(id: string): Promise<AuthResult<LiveSession | null>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase.from('gym_live_sessions').select('*').eq('id', id).maybeSingle();
  if (error) return { ok: false, message: toKoreanAuthMessage(error) };
  return { ok: true, data: data ? mapLiveSession(data) : null };
}

/** Coach: every participant. Student: RLS returns only their own row. */
export async function listLiveParticipants(sessionId: string): Promise<AuthResult<LiveParticipant[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase.from('gym_live_participants').select('*').eq('session_id', sessionId);
  if (error) return { ok: false, message: toKoreanAuthMessage(error) };
  return { ok: true, data: (data ?? []).map(mapLiveParticipant) };
}

/** Coach overview: this gym's sessions that are not finished yet. */
export async function listActiveLiveSessions(gymId: string): Promise<AuthResult<LiveSession[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from('gym_live_sessions')
    .select('*')
    .eq('gym_id', gymId)
    .in('status', ['ready', 'running', 'paused'])
    .order('created_at', { ascending: false });
  if (error) return { ok: false, message: toKoreanAuthMessage(error) };
  return { ok: true, data: (data ?? []).map(mapLiveSession) };
}

/** Student: my participation rows that are still active, or ended but not yet saved to my record. */
export async function listMyPendingParticipations(userId: string): Promise<AuthResult<LiveParticipant[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from('gym_live_participants')
    .select('*')
    .eq('user_id', userId)
    .or('active.eq.true,recorded_at.is.null');
  if (error) return { ok: false, message: toKoreanAuthMessage(error) };
  return { ok: true, data: (data ?? []).map(mapLiveParticipant) };
}

export async function getGymName(gymId: string): Promise<string> {
  if (!supabase) return '체육관';
  const { data } = await supabase.from('gyms').select('name').eq('id', gymId).maybeSingle();
  return (data?.name as string | undefined) ?? '체육관';
}

/**
 * Realtime: calls `onChange` on any INSERT/UPDATE the user is allowed to
 * see (RLS-filtered by Supabase Realtime). The callback should RE-FETCH the
 * authoritative row rather than trust the payload — that keeps one code
 * path for realtime, reconnect and polling. Returns an unsubscribe.
 */
export function subscribeLive(
  channelName: string,
  filters: { table: 'gym_live_sessions' | 'gym_live_participants'; filter?: string }[],
  onChange: () => void,
  onStatus?: (status: string) => void
): () => void {
  if (!supabase) return () => undefined;
  let channel = supabase.channel(`${channelName}-${Math.random().toString(36).slice(2, 8)}`);
  for (const f of filters) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: f.table, ...(f.filter ? { filter: f.filter } : {}) }, () => onChange());
  }
  channel.subscribe((status) => onStatus?.(status));
  return () => {
    void supabase?.removeChannel(channel);
  };
}
