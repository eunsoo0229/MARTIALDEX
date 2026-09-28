import type { ExerciseConfig } from '../curriculum/types';
import type { TrainingExerciseDetail } from '../trainingHistory/types';

export type GymMemberRole = 'instructor' | 'student';

export interface Gym {
  id: string;
  name: string;
  ownerUserId: string;
  joinCode: string;
  createdAt: string;
}

export interface GymMember {
  gymId: string;
  userId: string;
  role: GymMemberRole;
  /** Denormalized from the member's own profile at join/create time — see migration 0022's comment on why this isn't read live from `profiles`. */
  nickname: string;
  joinedAt: string;
}

/** My own membership in a gym, with the gym's display info joined in. */
export interface MyGymMembership {
  gym: Gym;
  role: GymMemberRole;
}

/**
 * A class's planned techniques/exercises — same shape as
 * TodayTrainingPlan.gymExerciseConfig (todayTraining/types.ts) so the
 * class-session runner can reuse resolveExerciseConfig-style lookups
 * unchanged. No new "plan" type invented.
 */
export interface GymClassPlan {
  techniqueIds: string[];
  exerciseConfig: Record<string, ExerciseConfig>;
}

export interface GymClass {
  id: string;
  gymId: string;
  title: string;
  plan: GymClassPlan;
  createdBy: string;
  createdAt: string;
}

export type GymClassSessionStatus = 'open' | 'closed';

export interface GymClassSession {
  id: string;
  gymClassId: string;
  gymId: string;
  date: string;
  status: GymClassSessionStatus;
  createdBy: string;
  createdAt: string;
}

/**
 * One student's attendance/completion row for one session — a roster view
 * ONLY (see migration 0022's comment). Never the source of truth for the
 * student's own training record; that is their own TrainingHistoryEntry
 * (source: 'gym_class'), written via recordTrainingSession() alongside this.
 */
export interface GymClassAttendance {
  sessionId: string;
  studentUserId: string;
  completed: boolean;
  exerciseDetails: TrainingExerciseDetail[] | null;
  completedAt: string | null;
}

/** A session joined with its class/gym title, for a student's "오늘 열린 수업" list. */
export interface OpenSessionForStudent {
  session: GymClassSession;
  classTitle: string;
  gymName: string;
  alreadyCompleted: boolean;
}

/** A roster row for an instructor's session view — no nutrition/profile data, ever. */
export interface RosterEntry {
  studentUserId: string;
  studentNickname: string | null;
  completed: boolean;
  totalSets: number;
  completedAt: string | null;
}
