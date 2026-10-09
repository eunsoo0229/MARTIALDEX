import type { Technique } from '../../types';
import type { MasteryStatus } from '../skillProgress/types';
import { MASTERY_LABEL } from '../skillProgress/types';
import { martialArtSummaries } from '../loadData';
import { listLearnedTechniques } from '../learnedTechniques/service';
import { listMyCurricula, getProgress } from '../curriculum/curriculumService';
import { listTrainingHistory } from '../trainingHistory/service';
import { resolveTechnique } from '../userTechniques/service';
import { LOCATION_SHORT } from './location';
import { isTechniqueInArt, techniqueArts } from '../techniqueCanonical';

// Everything the AI 코치 수업 planner reads about the learner — all of it is
// data an existing feature already stores (skill progress, training
// history, curricula). Nothing is inferred or invented here.

export interface LearnedRef {
  technique: Technique;
  status: MasteryStatus;
  practiceCount: number;
  lastPracticedAt: string | null;
}

export interface LearnerProfile {
  martialArt: string;
  learned: LearnedRef[];
  previousClasses: string[];
}

/** Arts the user has learned something in, most-learned first — the planner's default art. */
/**
 * Learned techniques per art. `count` = every art the technique is linked to
 * (MMA is linked to most striking/grappling techniques); `nativeCount` = only
 * arts whose OWN records list it (namesByArt / its own art) — what the user
 * actually studied as that art. Sorted by nativeCount, so the default art is
 * the one the user really trained in, not the art that links everything.
 */
export function learnedCountsByArt(): { martialArt: string; nameKo: string; count: number; nativeCount: number }[] {
  const counts = new Map<string, number>();
  const native = new Map<string, number>();
  for (const e of listLearnedTechniques()) {
    for (const art of techniqueArts(e.technique)) counts.set(art, (counts.get(art) ?? 0) + 1);
    for (const art of new Set([e.technique.martialArt, ...Object.keys(e.technique.namesByArt ?? {})])) native.set(art, (native.get(art) ?? 0) + 1);
  }
  return martialArtSummaries
    .map((a) => ({ martialArt: a.id, nameKo: a.nameKo, count: counts.get(a.id) ?? 0, nativeCount: native.get(a.id) ?? 0 }))
    .sort((a, b) => b.nativeCount - a.nativeCount || b.count - a.count);
}

/** Weakest first: needs_improvement → learning → average → proficient (→ an override back to 미학습 last), so review time goes where it helps most. */
const REVIEW_PRIORITY: Record<MasteryStatus, number> = { needs_improvement: 0, learning: 1, average: 2, proficient: 3, not_started: 4 };

export function buildLearnerProfile(martialArt: string): LearnerProfile {
  const learned = listLearnedTechniques()
    .filter((e) => isTechniqueInArt(e.technique, martialArt))
    .map((e) => ({ technique: e.technique, status: e.progress.status, practiceCount: e.progress.practiceCount, lastPracticedAt: e.progress.lastPracticedAt }))
    .sort((a, b) => REVIEW_PRIORITY[a.status] - REVIEW_PRIORITY[b.status] || (a.lastPracticedAt ?? '').localeCompare(b.lastPracticedAt ?? ''));
  return { martialArt, learned, previousClasses: previousCoachClasses() };
}

/** Short lines describing earlier AI 코치 sessions and AI 코치 수업 progress (newest first). */
export function previousCoachClasses(limit = 6): string[] {
  const lines: string[] = [];
  for (const e of listTrainingHistory().filter((h) => h.aiCoach).slice(0, limit)) {
    const names = e.techniqueIds.map((id) => resolveTechnique(id)?.name).filter(Boolean).slice(0, 5).join(', ');
    const place = e.aiCoach?.location ? LOCATION_SHORT[e.aiCoach.location] : '장소 미선택';
    lines.push(`${e.date} AI 코치 수업(${place}): ${names || '기술 정보 없음'} — ${e.completed ? '끝까지 완료' : '중간에 종료'}`);
  }
  for (const c of listMyCurricula().filter((x) => x.aiCoachMeta)) {
    const p = getProgress(c.id);
    lines.push(`AI 코치 커리큘럼 "${c.title}" (${LOCATION_SHORT[c.aiCoachMeta!.location]}): ${p?.completedDays.length ?? 0}/${c.totalDays} Day 완료`);
  }
  return lines.slice(0, limit + 3);
}

/** The most recent goal the user already wrote for a coach class or an AI 맞춤 커리큘럼 — prefill only, always editable. */
export function latestKnownGoal(): string {
  const mine = listMyCurricula()
    .filter((c) => c.aiCoachMeta?.goal || c.aiGoalMeta?.goalText)
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  const c = mine[0];
  return c?.aiCoachMeta?.goal ?? c?.aiGoalMeta?.goalText ?? '';
}

export function masteryLine(r: LearnedRef): string {
  return `${r.technique.id} | ${r.technique.name}${r.technique.koreanName ? ` (${r.technique.koreanName})` : ''} | 숙련도: ${MASTERY_LABEL[r.status]} | 연습 ${r.practiceCount}회`;
}
