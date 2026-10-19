import type { TrainingHistoryEntry } from '../trainingHistory/types';
import { listTrainingHistory } from '../trainingHistory/service';
import { listLessonLog, weakConceptsFromLessons, type LessonLogEntry } from '../coachLesson/lessonLog';
import { listLearningRecords } from '../coachLesson/records';
import { getAllOverrides } from '../skillProgress/overrideStore';
import { computeAllSkillProgress } from '../skillProgress/weaknessEngine';
import { allCheckResults, lastReviewedAtIndex, listReviewLog } from './reviewLog';
import { listFocusTechniques } from './focusList';
import { canonicalTechniqueId } from '../techniqueCanonical';

// 복습 5종의 데이터 출처 — each mode reads its OWN source with its OWN rule.
//   1 전 훈련      training_history (every recorded training; legacy 'review' entries excluded — reviewing isn't training)
//   2 전 수업      coach-lesson-log (summaries) + older aiCoach history entries (no summary then)
//   3 전 체육관    training_history entries written by the gym features (gymClassMeta / gymLive)
//   4 부족 기술    recorded evidence only: review check results, lesson understanding, user marks, pose scores
//   5 AI 추천      reviewSystem/reviewEngine.ts (existing), fed the review log + mode 4
// Nothing here creates training records or fills gaps with guesses.

const DAY = 86400000;

// ---------------- mode 1 & 3

export type TrainingKind = 'personal' | 'ai_coach' | 'gym';

export function trainingKind(e: TrainingHistoryEntry): TrainingKind {
  if (e.gymClassMeta || e.gymLive || e.source === 'gym_class') return 'gym';
  if (e.aiCoach) return 'ai_coach';
  return 'personal';
}

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  curriculum: '커리큘럼 학습',
  coach_today: '오늘의 훈련',
  sparring: '스파링 분석',
  combo: '콤보 훈련',
  free_training: '자유훈련',
  gym_class: '체육관 수업',
  sparring_session: '스파링',
  visual_mitt: 'Visualizing Mitt',
  shadow: '섀도복싱(이전 기능)',
  ground_battle: '그라운드 배틀(이전 기능)',
};

export function trainingTypeLabel(e: TrainingHistoryEntry): string {
  if (e.gymLive) return e.gymLive.kind === 'sparring' ? '체육관 실시간 스파링' : '체육관 실시간 훈련';
  if (e.gymClassMeta) return '체육관 수업';
  if (e.aiCoach) return e.curriculumId ? 'AI 코치 수업 (커리큘럼)' : 'AI 코치 수업';
  if (e.gymRoutine) return `웨이트 루틴 · ${e.gymRoutine.routineName}`;
  return SOURCE_TYPE_LABEL[e.source] ?? e.source;
}

/** Totals actually stored for an entry — sets / reps / seconds only when recorded. */
export function storedVolume(e: TrainingHistoryEntry): { sets: number | null; reps: number | null; seconds: number | null } {
  if (e.gymLive) return { sets: e.gymLive.completedSets, reps: null, seconds: e.gymLive.workSeconds * e.gymLive.completedSets };
  const d = e.exerciseDetails;
  if (!d?.length) return { sets: null, reps: null, seconds: null };
  let sets = 0;
  let reps = 0;
  let secs = 0;
  let hasReps = false;
  let hasSecs = false;
  for (const x of d) {
    const n = Math.max(x.actualReps?.length ?? 0, x.actualSeconds?.length ?? 0);
    for (let i = 0; i < n; i++) {
      const r = x.actualReps?.[i];
      const sec = x.actualSeconds?.[i];
      if (typeof r !== 'number' && typeof sec !== 'number') continue;
      sets++;
      if (typeof r === 'number') {
        reps += r;
        hasReps = true;
      }
      if (typeof sec === 'number') {
        secs += sec;
        hasSecs = true;
      }
    }
  }
  return { sets: sets || null, reps: hasReps ? reps : null, seconds: hasSecs ? secs : null };
}

export interface TrainingFilter {
  sinceDays: number | null;
  kind?: TrainingKind | 'all';
}

/** 모드 1: every training record (personal + AI coach + gym — each once, as stored). */
export function trainingReviewEntries(f: TrainingFilter = { sinceDays: null }): TrainingHistoryEntry[] {
  const since = f.sinceDays ? Date.now() - f.sinceDays * DAY : null;
  return listTrainingHistory()
    .filter((e) => e.source !== 'review')
    .filter((e) => !since || Date.parse(e.completedAt) >= since)
    .filter((e) => !f.kind || f.kind === 'all' || trainingKind(e) === f.kind)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

/** 모드 3: the gym features' own records only. */
export function gymReviewEntries(sinceDays: number | null = null): TrainingHistoryEntry[] {
  return trainingReviewEntries({ sinceDays, kind: 'gym' });
}

// ---------------- mode 2

export interface LessonReviewItem {
  id: string;
  date: string;
  title: string;
  techniqueNames: string[];
  /** Full summary saved at the end of the lesson; null = lesson from before summaries were kept. */
  log: LessonLogEntry | null;
  historyEntry: TrainingHistoryEntry | null;
}

/** 모드 2: lessons with a saved summary, plus older AI-coach records that only have the history entry. */
export function lessonReviewItems(): LessonReviewItem[] {
  const logs = listLessonLog();
  const history = listTrainingHistory();
  const linked = new Set(logs.map((l) => l.historyEntryId).filter(Boolean));
  const items: LessonReviewItem[] = logs.map((l) => ({
    id: l.id,
    date: l.date,
    title: l.title,
    techniqueNames: l.techniques.map((t) => t.name),
    log: l,
    historyEntry: history.find((h) => h.id === l.historyEntryId) ?? null,
  }));
  for (const h of history) {
    if (!h.aiCoach || linked.has(h.id)) continue;
    items.push({ id: `history_${h.id}`, date: h.date, title: h.notes?.split(' · ')[0] ?? 'AI 코치 수업', techniqueNames: [], log: null, historyEntry: h });
  }
  return items.sort((a, b) => (b.log?.finishedAt ?? b.historyEntry?.completedAt ?? b.date).localeCompare(a.log?.finishedAt ?? a.historyEntry?.completedAt ?? a.date));
}

// ---------------- mode 4

export type WeakSignal = 'review_repeated' | 'review_recent' | 'lesson' | 'user_marked' | 'pose_stale';

export const WEAK_SIGNAL_LABEL: Record<WeakSignal, string> = {
  review_repeated: '복습 확인 질문에서 반복적으로 이해 부족',
  review_recent: '최근 복습에서 이해가 부족했던 개념',
  lesson: 'AI 코치 수업에서 어려움이 확인된 개념',
  user_marked: '직접 보완 대상으로 지정',
  pose_stale: '자세 분석 점수가 낮고 오래 복습하지 않음',
};

export interface WeakTechnique {
  techniqueId: string;
  /** Highest-priority signal (spec order). */
  signal: WeakSignal;
  /** Every recorded reason, in priority order — shown to the student as-is. */
  reasons: string[];
  /** Concept labels to focus on, when the evidence names them. */
  focusConcepts: string[];
  priority: number;
  lastEvidenceAt: string | null;
}

const SIGNAL_RANK: Record<WeakSignal, number> = { review_repeated: 5, review_recent: 4, lesson: 3, user_marked: 2, pose_stale: 1 };
const REPEAT_WINDOW_DAYS = 60;
const STALE_DAYS = 14;
const LOW_POSE = 60;

/**
 * 모드 4: weak techniques from RECORDED evidence only. A technique leaves the
 * list when its most recent check result was "understood" after the evidence
 * — so a fixed weakness stops being recommended, a persisting one stays.
 */
export function weakTechniques(now = Date.now()): WeakTechnique[] {
  const map = new Map<string, WeakTechnique>();
  const add = (rawId: string, signal: WeakSignal, reason: string, at: string | null, concepts: string[] = []) => {
    // Evidence is stored under whatever id the feature had; merged duplicates count once.
    const id = canonicalTechniqueId(rawId);
    const cur = map.get(id) ?? { techniqueId: id, signal, reasons: [], focusConcepts: [], priority: 0, lastEvidenceAt: null };
    if (SIGNAL_RANK[signal] > SIGNAL_RANK[cur.signal]) cur.signal = signal;
    cur.reasons.push(reason);
    cur.focusConcepts = [...new Set([...cur.focusConcepts, ...concepts])];
    if (at && (!cur.lastEvidenceAt || at > cur.lastEvidenceAt)) cur.lastEvidenceAt = at;
    map.set(id, cur);
  };

  // 1–2. understanding checks in reviews
  const results = allCheckResults();
  const byTech = new Map<string, typeof results>();
  // 'topic:' = a one-off lesson topic with no library technique — reviewable, but not a technique to list here.
  for (const r of results) {
    if (r.techniqueId.startsWith('topic:')) continue;
    const id = canonicalTechniqueId(r.techniqueId);
    byTech.set(id, [...(byTech.get(id) ?? []), r]);
  }
  for (const [id, rs] of byTech) {
    const recentMisses = rs.filter((r) => (r.verdict === 'weak' || r.verdict === 'unknown') && now - Date.parse(r.at) <= REPEAT_WINDOW_DAYS * DAY);
    if (recentMisses.length >= 2) add(id, 'review_repeated', `최근 ${REPEAT_WINDOW_DAYS}일 복습 확인 질문에서 이해 부족 답변 ${recentMisses.length}회`, recentMisses[0].at, recentMisses.map((r) => r.conceptLabel).filter((x): x is string => !!x));
    const latest = rs[0];
    if (latest && (latest.verdict === 'partial' || latest.verdict === 'weak')) add(id, 'review_recent', `최근 복습(${latest.at.slice(0, 10)})에서 ${latest.conceptLabel ? `"${latest.conceptLabel}"` : '확인 질문'}에 ${latest.verdict === 'partial' ? '부분적으로' : '충분히'} 답하지 못함`, latest.at, latest.conceptLabel ? [latest.conceptLabel] : []);
  }

  // 2b. "아직 어려워요" pressed during the most recent review of a technique
  const lastDifficult = new Map<string, string>();
  for (const e of listReviewLog()) for (const id of e.difficultTechniqueIds) if (!id.startsWith('topic:') && !lastDifficult.has(canonicalTechniqueId(id))) lastDifficult.set(canonicalTechniqueId(id), e.updatedAt);
  for (const [id, at] of lastDifficult) add(id, 'review_recent', `복습(${at.slice(0, 10)}) 중 "아직 어려워요"를 선택함`, at);

  // 3. AI coach lessons: summaries + per-technique learning records
  for (const w of weakConceptsFromLessons()) add(w.techniqueId, 'lesson', `AI 코치 수업(${w.at.slice(0, 10)})에서 "${w.label}" ${w.status === 'weak' ? '이해 부족' : '부분 이해'}`, w.at, [w.label]);
  for (const r of listLearningRecords()) {
    const weak = r.concepts.filter((c) => c.status === 'weak' || c.status === 'partial');
    if (weak.length && !map.get(r.techniqueId)?.reasons.some((x) => x.startsWith('AI 코치 수업'))) add(r.techniqueId, 'lesson', `AI 코치 수업 기록: ${weak.map((c) => `"${c.label}"`).join(', ')} 복습 필요`, r.updatedAt, weak.map((c) => c.label));
  }

  // 4. the student's own marks
  for (const [id, status] of Object.entries(getAllOverrides())) if (status === 'needs_improvement') add(id, 'user_marked', '숙련도를 "개선 필요"로 직접 지정함', null);
  for (const f of listFocusTechniques()) add(f.techniqueId, 'user_marked', '부족 기술 보완 목록에 직접 추가함', f.addedAt);

  // 5. low / falling pose score AND not reviewed for a while (both must be recorded)
  const reviewed = canonicalReviewedIndex();
  for (const { technique, progress } of computeAllSkillProgress()) {
    if (progress.analysisCount === 0 || progress.latestScore === null) continue;
    const low = progress.latestScore < LOW_POSE || (progress.scoreDelta !== null && progress.scoreDelta < 0);
    if (!low) continue;
    const last = [progress.lastPracticedAt, reviewed.get(technique.id) ?? null].filter((x): x is string => !!x).sort().at(-1) ?? null;
    if (last && now - Date.parse(last) < STALE_DAYS * DAY) continue;
    add(technique.id, 'pose_stale', `자세 분석 최근 점수 ${progress.latestScore}점${progress.scoreDelta !== null && progress.scoreDelta < 0 ? `(${progress.scoreDelta}점 하락)` : ''} · ${last ? `${Math.floor((now - Date.parse(last)) / DAY)}일째 연습·복습 없음` : '연습·복습 기록 없음'}`, progress.lastAnalyzedAt);
  }

  // A later "understood" check clears the weakness it answers (fixed → lower priority, dropped).
  const out: WeakTechnique[] = [];
  for (const w of map.values()) {
    const latest = byTech.get(w.techniqueId)?.[0];
    const fixed = latest && latest.verdict === 'understood' && (!w.lastEvidenceAt || latest.at > w.lastEvidenceAt) && w.signal !== 'user_marked';
    if (fixed) continue;
    w.priority = SIGNAL_RANK[w.signal] * 10 + Math.min(9, w.reasons.length);
    out.push(w);
  }
  return out.sort((a, b) => b.priority - a.priority || (b.lastEvidenceAt ?? '').localeCompare(a.lastEvidenceAt ?? ''));
}

/** Techniques whose last review check was understood — shown as "보완됨" (lower priority), not as weak. */
export function recentlyImproved(limit = 10): { techniqueId: string; at: string }[] {
  const seen = new Set<string>();
  const out: { techniqueId: string; at: string }[] = [];
  for (const r of allCheckResults()) {
    if (r.techniqueId.startsWith('topic:')) continue;
    const id = canonicalTechniqueId(r.techniqueId);
    if (seen.has(id)) continue;
    seen.add(id);
    if (r.verdict === 'understood') out.push({ techniqueId: id, at: r.at });
  }
  return out.slice(0, limit);
}

/** Last review per CANONICAL technique id (review log stores whatever id the screen had). */
export function canonicalReviewedIndex(): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, at] of lastReviewedAtIndex(listReviewLog())) {
    if (id.startsWith('topic:')) continue;
    const c = canonicalTechniqueId(id);
    if (!out.has(c) || out.get(c)! < at) out.set(c, at);
  }
  return out;
}
