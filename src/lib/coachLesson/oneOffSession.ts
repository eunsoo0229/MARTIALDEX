import type { CoachMessage } from '../aiCoachDay/types';
import type { OneOffLesson } from './oneOff';
import type { CoachLessonState, LessonDirective } from './types';
import type { WorkoutPlan } from './workoutPlan';
import type { WorkoutResult, WorkoutRun } from './workoutTimer';
import type { LessonVideoResult } from './lessonVideos';

// The "수업하고 싶은 거 입력하기" lesson in progress — lesson, dialogue,
// workout plan, running timer and found videos — kept in localStorage so a
// refresh or leaving the screen and coming back resumes the SAME lesson
// (the timer keeps its real deadlines, so it is still correct on return).
// One lesson at a time; "다른 수업 하기" clears it.

export interface PlanDraft {
  exerciseDurationSeconds: number | null;
  sets: number | null;
  restDurationSeconds: number | null;
  source: WorkoutPlan['source'];
  /** Which values came from the student's last-used setting (not from the coach). */
  fromLastUsed: ('exercise' | 'sets' | 'rest')[];
  /** The phrases the numbers were read from. */
  evidence: string[];
}

export interface OneOffSession {
  v: 1;
  lesson: OneOffLesson;
  state: CoachLessonState;
  directive: LessonDirective;
  messages: CoachMessage[];
  startedAt: number;
  recorded: boolean;
  plan: PlanDraft | null;
  run: WorkoutRun | null;
  workoutResult: WorkoutResult | null;
  videos: LessonVideoResult | null;
  /**
   * The Visualizing Mitt practice (oneOffMitt.ts): posture briefing first,
   * then the mitt; `result` is what the student did (nothing measured).
   */
  mitt?: { phase: 'posture' | 'running' | 'done'; startedAt: number | null; result: { completedReps: number; targetReps: number; finished: boolean; seconds: number } | null };
  /** The student spoke at least once (microphone) — the record's conversation mode. */
  usedMic?: boolean;
  /** The coach chosen before this lesson (absent on sessions saved before the choice existed → 'unknown'). */
  coachKind?: import('../coachProvider/types').CoachKind;
  coachSwitches?: { from: import('../coachProvider/types').StoredCoachKind; to: import('../coachProvider/types').CoachKind; at: string }[];
}

const KEY = 'martialdex:coach-oneoff-session';

/** A finished lesson is not restored: coming back to the screen starts a new request. */
export function loadActiveOneOffSession(): OneOffSession | null {
  const s = loadOneOffSession();
  if (s && s.state.currentStage === 'COMPLETE' && s.recorded) {
    saveOneOffSession(null);
    return null;
  }
  return s;
}

export function loadOneOffSession(): OneOffSession | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as OneOffSession;
    if (s?.v !== 1 || !s.lesson?.context?.concepts || !s.state?.understanding || !Array.isArray(s.messages)) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function saveOneOffSession(s: OneOffSession | null): void {
  try {
    if (s) window.localStorage.setItem(KEY, JSON.stringify(s));
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage full/unavailable — the lesson still runs, it just won't survive a reload
  }
}
