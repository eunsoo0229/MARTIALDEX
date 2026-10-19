// 운동 계획 — the coach's free-form words ("잽과 크로스를 3분씩 3세트,
// 세트 사이 1분 휴식") turned into data a timer can run, kept SEPARATE from
// the text. Only what is actually stated is parsed; a missing number is
// left null and the student is asked (or offered their last-used setting,
// clearly labelled) — never filled in silently. Pure (no DOM, no AI) except
// the small settings store at the bottom.

export interface WorkoutPlan {
  /** What is being drilled ("잽-크로스 연결"). */
  title: string;
  /** Lesson points to remind between sets (prepared once — no AI call per cue). */
  focus: string[];
  exerciseDurationSeconds: number;
  sets: number;
  restDurationSeconds: number;
  /** Where the numbers came from. */
  source: 'lesson' | 'coach' | 'student' | 'user_edit' | 'last_used';
}

export interface WorkoutSpec {
  exerciseDurationSeconds: number | null;
  sets: number | null;
  restDurationSeconds: number | null;
  /** Repetitions per set ("10회") — informational; the timer needs a duration. */
  reps: number | null;
  /** The exact phrases the numbers were read from (shown so the student can check them). */
  evidence: string[];
}

export const PLAN_LIMITS = {
  exercise: { min: 10, max: 1800 },
  sets: { min: 1, max: 20 },
  rest: { min: 0, max: 600 },
};

const KOR_NUM: Record<string, number> = { 한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };

/** "3분", "90초", "2분 30초", "1분 반", "3 minutes", "45 sec" → seconds (null when the phrase has no duration). */
export function parseDuration(phrase: string): number | null {
  const s = phrase.toLowerCase();
  let total = 0;
  let hit = false;
  const min = s.match(/(\d+(?:\.\d+)?)\s*(분|minutes?|mins?\b)/);
  if (min) {
    total += parseFloat(min[1]) * 60;
    hit = true;
    if (/분\s*반/.test(s)) total += 30;
  }
  const sec = s.match(/(\d+)\s*(초|seconds?|secs?\b)/);
  if (sec) {
    total += parseInt(sec[1], 10);
    hit = true;
  }
  return hit ? Math.round(total) : null;
}

const DURATION = String.raw`\d+(?:\.\d+)?\s*(?:분(?:\s*반)?(?:\s*\d+\s*초)?|초|minutes?|mins?\b|seconds?|secs?\b)`;
const REST_WORD = String.raw`(?:휴식|쉬(?:고|는|어|기|세요|면서)?|쉼|rest|break)`;

/** Reads a workout spec from Korean/English text. Returns nulls for anything not stated. */
export function parseWorkoutSpec(text: string): WorkoutSpec {
  const evidence: string[] = [];
  let rest: number | null = null;
  let work: string = text;

  // Rest: a duration right next to a rest word ("세트 사이 1분 휴식", "휴식 30초", "1분씩 쉬고", "rest 60 seconds").
  const restRe = new RegExp(String.raw`(?:${REST_WORD}[^\d.,]{0,6}(${DURATION}))|(?:(${DURATION})[^\d.,]{0,6}?${REST_WORD})`, 'i');
  const noRest = text.match(/(휴식|쉬는 시간|쉬지|rest)\s*(없이|없음|않고|0초|0\b)|no rest/i);
  const rm = noRest ? null : text.match(restRe);
  if (noRest) {
    rest = 0;
    evidence.push(noRest[0]);
    work = text.replace(noRest[0], ' ');
  } else if (rm) {
    const phrase = rm[1] ?? rm[2];
    rest = parseDuration(phrase);
    evidence.push(rm[0].trim());
    work = text.replace(rm[0], ' ');
  }

  // Sets: "3세트", "세 세트", "3라운드", "3 sets", "3 rounds", "3 x 3분" (sets × duration).
  let sets: number | null = null;
  const sm = work.match(/(\d+|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(세트|라운드|sets?\b|rounds?\b)/i);
  if (sm) {
    sets = /\d/.test(sm[1]) ? parseInt(sm[1], 10) : KOR_NUM[sm[1]] ?? null;
    evidence.push(sm[0].trim());
  }

  // Work duration: the first duration left ("3분씩", "3분 × 3세트", "90초 동안").
  let exercise: number | null = null;
  const dm = work.match(new RegExp(DURATION, 'i'));
  if (dm) {
    exercise = parseDuration(dm[0]);
    evidence.push(dm[0].trim());
  }
  // "3 x 3분" without the word 세트: the bare number before × is the set count.
  if (sets === null && dm) {
    const xm = work.match(new RegExp(String.raw`(\d+)\s*[x×*]\s*${DURATION}|${DURATION}\s*[x×*]\s*(\d+)(?!\s*(?:분|초|min|sec))`, 'i'));
    if (xm) {
      sets = parseInt(xm[1] ?? xm[2], 10);
      evidence.push(xm[0].trim());
    }
  }

  const rm2 = work.match(/(\d+)\s*(회|번|reps?\b)/i);
  const reps = rm2 ? parseInt(rm2[1], 10) : null;

  return { exerciseDurationSeconds: exercise, sets, restDurationSeconds: rest, reps, evidence: [...new Set(evidence)] };
}

/** True when the text states a time-based workout (a duration or a set count). */
export function hasWorkoutSpec(spec: WorkoutSpec): boolean {
  return spec.exerciseDurationSeconds !== null || spec.sets !== null;
}

export function planErrors(p: Pick<WorkoutPlan, 'exerciseDurationSeconds' | 'sets' | 'restDurationSeconds'>): string[] {
  const e: string[] = [];
  const L = PLAN_LIMITS;
  if (!Number.isFinite(p.exerciseDurationSeconds) || p.exerciseDurationSeconds < L.exercise.min || p.exerciseDurationSeconds > L.exercise.max) e.push(`운동 시간은 ${L.exercise.min}초~${L.exercise.max / 60}분 사이로 정해 주세요.`);
  if (!Number.isInteger(p.sets) || p.sets < L.sets.min || p.sets > L.sets.max) e.push(`세트 수는 ${L.sets.min}~${L.sets.max} 사이로 정해 주세요.`);
  if (!Number.isFinite(p.restDurationSeconds) || p.restDurationSeconds < L.rest.min || p.restDurationSeconds > L.rest.max) e.push(`휴식 시간은 0초~${L.rest.max / 60}분 사이로 정해 주세요.`);
  return e;
}

/** "180" → "3분", "90" → "1분 30초", "45" → "45초". */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m && s) return `${m}분 ${s}초`;
  if (m) return `${m}분`;
  return `${s}초`;
}

export function describePlan(p: Pick<WorkoutPlan, 'exerciseDurationSeconds' | 'sets' | 'restDurationSeconds'>): string {
  return `${formatDuration(p.exerciseDurationSeconds)} × ${p.sets}세트${p.sets > 1 ? `, 세트 사이 ${p.restDurationSeconds ? `${formatDuration(p.restDurationSeconds)} 휴식` : '휴식 없음'}` : ''}`;
}

/**
 * Merges what was stated into a draft. Fields not stated stay null unless
 * the student's last-used setting exists — then it is used and REPORTED in
 * `fromLastUsed`, so the UI can say "지난번 설정" instead of passing it off
 * as the coach's instruction.
 */
export function draftFromSpec(spec: WorkoutSpec, lastUsed: WorkoutSettings['lastPlan']): { exerciseDurationSeconds: number | null; sets: number | null; restDurationSeconds: number | null; fromLastUsed: ('exercise' | 'sets' | 'rest')[] } {
  const fromLastUsed: ('exercise' | 'sets' | 'rest')[] = [];
  let ex = spec.exerciseDurationSeconds;
  let sets = spec.sets;
  let rest = spec.restDurationSeconds;
  if (ex === null && lastUsed) {
    ex = lastUsed.exerciseDurationSeconds;
    fromLastUsed.push('exercise');
  }
  if (sets === null && lastUsed) {
    sets = lastUsed.sets;
    fromLastUsed.push('sets');
  }
  // A single set needs no rest; otherwise rest is a real choice too.
  if (rest === null && sets === 1) rest = 0;
  if (rest === null && lastUsed) {
    rest = lastUsed.restDurationSeconds;
    fromLastUsed.push('rest');
  }
  return { exerciseDurationSeconds: ex, sets, restDurationSeconds: rest, fromLastUsed };
}

// ---------------------------------------------------------------- settings

export type CheerLevel = 'off' | 'minimal' | 'normal' | 'frequent';
export const CHEER_LABEL: Record<CheerLevel, string> = { off: '끄기', minimal: '최소 (세트 전환만)', normal: '보통', frequent: '자주' };

export interface WorkoutSettings {
  cheer: CheerLevel;
  /** Speak timer cues aloud (text cues are always shown). */
  voice: boolean;
  lastPlan: { exerciseDurationSeconds: number; sets: number; restDurationSeconds: number } | null;
}

const KEY = 'martialdex:coach-workout-settings';
const DEFAULT_SETTINGS: WorkoutSettings = { cheer: 'normal', voice: true, lastPlan: null };

export function getWorkoutSettings(): WorkoutSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const v = JSON.parse(raw) as Partial<WorkoutSettings>;
    const cheer = v.cheer && v.cheer in CHEER_LABEL ? v.cheer : 'normal';
    const lp = v.lastPlan;
    const lastPlan = lp && planErrors(lp).length === 0 ? lp : null;
    return { cheer, voice: v.voice !== false, lastPlan };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveWorkoutSettings(patch: Partial<WorkoutSettings>): WorkoutSettings {
  const next = { ...getWorkoutSettings(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // not persisted — still applies for this session
  }
  return next;
}
