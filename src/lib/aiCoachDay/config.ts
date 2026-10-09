import type { CurriculumDay } from '../curriculum/types';
import type { Technique } from '../../types';
import { resolveExerciseConfig } from '../todayTraining/exerciseDefaults';

// Every tunable for the AI-coach day session lives here — nothing about
// practice length or announcement timing is hardcoded in the session logic.

export const COACH_DAY_CONFIG = {
  /** Used only when neither the Day's exerciseConfig nor its estimatedMinutes give a usable length. */
  defaultPracticeSeconds: 180,
  minPracticeSeconds: 60,
  maxPracticeSeconds: 600,
  /** Fraction of a Day's estimatedMinutes treated as hands-on practice (the rest is explanation/videos/rest). */
  practiceShareOfDay: 0.6,
  /** Max seconds of audio recorded for one spoken question. */
  maxRecordSeconds: 15,
};

export type CueTrigger = { kind: 'elapsed'; seconds: number } | { kind: 'remaining'; seconds: number } | { kind: 'end' } | { kind: 'reminder'; atFraction: number };

export interface CueDefinition {
  id: string;
  trigger: CueTrigger;
  /** {name} is replaced with the technique name, {point} with a real key point. */
  text: string;
}

/**
 * Event-based announcements: each fires at most ONCE per practice run, on a
 * clear condition (elapsed >= N, remaining <= N, finished), never per tick.
 * Cues whose condition can't happen for a given length (e.g. "2분 경과" in a
 * 90-second practice) simply never fire.
 */
export const PRACTICE_CUES: CueDefinition[] = [
  { id: 'elapsed_60', trigger: { kind: 'elapsed', seconds: 60 }, text: '1분이 지났습니다. 계속 집중해 주세요.' },
  { id: 'reminder_mid', trigger: { kind: 'reminder', atFraction: 0.5 }, text: '핵심 포인트를 떠올려 주세요: {point}' },
  { id: 'elapsed_120', trigger: { kind: 'elapsed', seconds: 120 }, text: '좋습니다. 조금만 더 해 보겠습니다.' },
  { id: 'remaining_10', trigger: { kind: 'remaining', seconds: 10 }, text: '10초 남았습니다. 마지막까지 집중해 주세요!' },
  { id: 'end', trigger: { kind: 'end' }, text: '수고하셨습니다. {name} 연습을 마쳤습니다.' },
];

/**
 * Practice length for one technique, from real configured data in priority
 * order: the Day's own time-mode exerciseConfig (sets × targetSeconds), then
 * an even share of the Day's estimatedMinutes, then the default — clamped.
 */
export function practiceSecondsFor(day: CurriculumDay, technique: Technique, techniqueCountInDay: number): number {
  const cfg = day.exerciseConfig?.[technique.id] ?? null;
  let seconds: number | null = null;
  if (cfg && cfg.mode === 'time' && cfg.targetSeconds) seconds = cfg.targetSeconds * Math.max(1, cfg.sets);
  if (seconds === null && day.estimatedMinutes > 0 && techniqueCountInDay > 0) {
    seconds = Math.round((day.estimatedMinutes * 60 * COACH_DAY_CONFIG.practiceShareOfDay) / techniqueCountInDay);
  }
  if (seconds === null) {
    const inferred = resolveExerciseConfig(day, technique);
    if (inferred.mode === 'time' && inferred.targetSeconds) seconds = inferred.targetSeconds * Math.max(1, inferred.sets);
  }
  const value = seconds ?? COACH_DAY_CONFIG.defaultPracticeSeconds;
  return Math.max(COACH_DAY_CONFIG.minPracticeSeconds, Math.min(COACH_DAY_CONFIG.maxPracticeSeconds, Math.round(value / 10) * 10));
}
