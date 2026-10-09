import type { Technique } from '../../types';
import type { Curriculum, CurriculumDay } from '../curriculum/types';
import { setDayComplete } from '../curriculum/curriculumService';
import { aiProvider } from '../ai/provider';
import { buildTechniqueContext } from '../ai/context';
import { askGeminiForJsonWithGrounding } from '../userTechniques/geminiJson';
import { resolveTechniquesByIds } from '../userTechniques/service';
import { recordTrainingSession } from '../trainingHistory/service';
import type { CoachDayRun, CoachMessage } from './types';
import type { CoachLocation, CoachPlanItem } from '../aiCoachCurriculum/types';
import { LOCATION_SHORT, locationRules } from '../aiCoachCurriculum/location';
import { ROLE_LABEL } from '../aiCoachCurriculum/service';
import { isSyntheticTrainingDomain } from '../loadData';
import { politeFix, TUTOR_SPEECH_RULE } from './politeSpeech';

// Coach persona shared by every AI call here. Two hard rules beyond "be a
// good coach": answer only from MARTIALDEX's real technique data (never
// invent technique details), and never claim to SEE the user — there is no
// camera/pose analysis in this mode.
export const COACH_SYSTEM_INSTRUCTION = [
  '당신은 MARTIALDEX의 무술 코치다. 사용자는 지금 커리큘럼의 오늘 DAY 기술을 연습하고 있다.',
  '규칙:',
  '- 아래 [기술 데이터]에 있는 내용만 근거로 답한다. 데이터에 없는 세부 동작을 지어내지 않는다. 모르면 모른다고 하고 영상이나 코치 확인을 권한다.',
  '- 당신은 카메라로 사용자를 보고 있지 않다. "자세가 좋네요"처럼 사용자의 동작을 본 것처럼 말하지 않는다.',
  '- 한국어로, 음성으로 읽기 좋게 짧게(2~4문장) 말한다. 마크다운, 목록 기호, 이모지를 쓰지 않는다.',
  '- 안전: 관절기·조르기는 파트너와 천천히, 탭하면 즉시 푼다는 점을 필요할 때 짧게 상기시킨다.',
  `- ${TUTOR_SPEECH_RULE}`,
].join('\n');

/**
 * The Day's techniques to coach. An AI 코치 수업 Day walks its coachPlan in
 * order (warm-up → review → connection → new → conditioning); any other
 * Day: new techniques first, or its review techniques on a pure review day.
 */
export function coachTechniquesForDay(day: CurriculumDay): Technique[] {
  if (day.coachPlan?.length) return resolveTechniquesByIds([...new Set(day.coachPlan.map((i) => i.techniqueId))]);
  const ids = day.techniqueIds.length > 0 ? day.techniqueIds : day.reviewTechniqueIds;
  return resolveTechniquesByIds(ids);
}

export function planItemFor(day: CurriculumDay, techniqueId: string): CoachPlanItem | null {
  return day.coachPlan?.find((i) => i.techniqueId === techniqueId) ?? null;
}

/**
 * Extra context for every live coach AI call: where the class happens (the
 * same rules the planner used) and, for an AI 코치 수업 step, how this step is
 * meant to be done here. Empty when neither is known (older runs).
 */
export function coachPlaceContext(location: CoachLocation | null | undefined, equipment: string[], item: CoachPlanItem | null): string {
  const parts: string[] = [];
  if (location) parts.push(`[운동 장소]\n${locationRules(location, equipment)}`);
  if (item) {
    const linked = item.linkedTechniqueId ? resolveTechniquesByIds([item.linkedTechniqueId])[0] : undefined;
    parts.push(
      [
        '[오늘 이 단계]',
        `역할: ${ROLE_LABEL[item.role]}${linked ? ` (${linked.name}와 연결)` : ''}`,
        `방법: ${item.instruction}`,
        `시간: ${item.minutes}분`,
        item.soloAlternative ? `장비·파트너가 없을 때: ${item.soloAlternative}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
  return parts.join('\n\n');
}

/** After a timed practice: short, data-based feedback — never claims to have seen the user. */
export function practiceFeedback(t: Technique, completed: boolean, location: CoachLocation | null | undefined): string {
  const mistake = t.posture?.commonMistakes?.[0];
  const point = t.posture?.keyPoints?.[0] ?? t.principles[0];
  const head = completed ? `${t.name} 연습 수고하셨습니다.` : `${t.name} 연습은 여기까지 하겠습니다.`;
  const check = mistake ? ` 방금 연습에서 "${mistake}" 같은 실수가 없었는지 떠올려 주세요.` : point ? ` 다음에도 "${point}"를 기억해 주세요.` : '';
  const place = location === 'home' || location === 'limited' ? ' 좁은 곳에서는 주변 공간을 꼭 확인해 주세요.' : '';
  return `${head}${check}${place} 어려웠던 점을 말씀해 주시면 조언해 드리겠습니다.`;
}

export function techniqueData(t: Technique): string {
  const lines = [buildTechniqueContext(t)];
  if (t.posture) {
    if (t.posture.overview) lines.push(`자세 개요: ${t.posture.overview}`);
    if (t.posture.startingPosition) lines.push(`시작 자세: ${t.posture.startingPosition}`);
    if (t.posture.steps?.length) lines.push(`단계: ${t.posture.steps.join(' / ')}`);
    if (t.posture.keyPoints?.length) lines.push(`핵심 포인트: ${t.posture.keyPoints.join(' / ')}`);
    if (t.posture.commonMistakes?.length) lines.push(`흔한 실수: ${t.posture.commonMistakes.join(' / ')}`);
  }
  return lines.join('\n');
}

export function displayName(t: Technique): string {
  return t.koreanName && t.koreanName !== t.name ? `${t.koreanName}(${t.name})` : t.name;
}

/** A real key point to remind during practice — from posture data or principles only; null when the data has none (the reminder cue then simply doesn't fire). */
export function reminderPointFor(t: Technique): string | null {
  return t.posture?.keyPoints?.[0] ?? t.principles[0] ?? null;
}

/** Deterministic explanation straight from the data — used when the AI is unavailable, so the step never blocks. */
export function fallbackExplanation(t: Technique, item: CoachPlanItem | null = null): string {
  // The caller already leads with the technique's real name.
  const parts: string[] = [];
  if (t.purpose) parts.push(`목적: ${t.purpose.split('\n')[0].slice(0, 160)}`);
  else if (t.description) parts.push(t.description.slice(0, 160));
  if (t.positions.length) parts.push(`사용하는 상황: ${t.positions.slice(0, 2).join(', ')}.`);
  const kp = t.posture?.keyPoints?.[0];
  if (kp) parts.push(`핵심 포인트: ${kp}`);
  const mistake = t.posture?.commonMistakes?.[0];
  if (mistake) parts.push(`주의할 점: ${mistake}`);
  if (item) parts.push(`오늘 할 방법: ${item.instruction}${item.soloAlternative ? ` 장비나 파트너가 없으면: ${item.soloAlternative}` : ''}`);
  return parts.join(' ');
}

/** STEP 1: short spoken-style explanation (name, purpose, when, key point, caution) grounded in the real data. */
export async function explainTechnique(t: Technique, dayContext: string, place = '', item: CoachPlanItem | null = null): Promise<{ text: string; fromAi: boolean }> {
  const placeAsk = place
    ? ' 마지막 한 문장으로 [운동 장소]와 [오늘 이 단계]에 맞게 지금 이 장소에서 어떻게 연습하는지 알려줘. 확인되지 않은 장비나 파트너는 있다고 가정하지 마.'
    : '';
  const result = await aiProvider.ask({
    systemInstruction: COACH_SYSTEM_INSTRUCTION,
    contextText: `[오늘 DAY]\n${dayContext}\n\n[기술 데이터]\n${techniqueData(t)}${place ? `\n\n${place}` : ''}`,
    history: [],
    question: `오늘 배울 "${displayName(t)}"를 코치처럼 소개해줘. 기술 이름, 목적, 언제 쓰는지, 핵심 포인트 한 가지, 주의할 점 한 가지를 순서대로 4~5문장 안에 말해줘. 데이터에 없는 항목은 건너뛰어.${placeAsk}`,
  });
  if (result.ok && result.text.trim()) return { text: politeFix(result.text.trim()), fromAi: true };
  return { text: fallbackExplanation(t, item), fromAi: false };
}

/** Free-form question at any step (voice or text share this). */
export async function askCoach(t: Technique, dayContext: string, history: CoachMessage[], question: string, place = ''): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const result = await aiProvider.ask({
    systemInstruction: COACH_SYSTEM_INSTRUCTION,
    contextText: `[오늘 DAY]\n${dayContext}\n\n[지금 연습 중인 기술 데이터]\n${techniqueData(t)}${place ? `\n\n${place}` : ''}`,
    history: history.slice(-8).map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text })),
    question,
  });
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, text: politeFix(result.text.trim()) };
}

/** True for warm-up / conditioning drills (home-training & gym exercises) — they are asked about their purpose, not a "position". */
function isDrill(t: Technique): boolean {
  return isSyntheticTrainingDomain(t.martialArt) || !!t.exerciseType;
}

/** A short review question built from the technique's own data (never an invented fact). */
export function quizQuestionFor(t: Technique): string {
  if (isDrill(t)) return `연습 전에 확인해 보겠습니다. ${displayName(t)}는 어떤 목적으로, 어떤 때 하는 동작일까요?`;
  if (t.positions.length || t.category) return `연습 전에 확인해 보겠습니다. ${displayName(t)}는 어떤 포지션이나 상황에서 사용하는 기술일까요?`;
  return `연습 전에 확인해 보겠습니다. ${displayName(t)}는 어떤 목적으로 쓰는 기술일까요?`;
}

/** The reference answer, from the technique's own data only. */
export function referenceAnswer(t: Technique): string {
  const parts = [t.purpose?.split('\n')[0], t.positions.length ? `사용 상황: ${t.positions.slice(0, 3).join(', ')}` : '', `분류: ${t.category}`];
  return parts.filter(Boolean).join(' / ');
}

export type QuizVerdict = 'correct' | 'partial' | 'incorrect';
export interface QuizGrade {
  verdict: QuizVerdict | null;
  /** Kept for older callers: true = correct, false = incorrect/partial, null = could not grade. */
  correct: boolean | null;
  feedback: string;
  /** 'ai' = graded by meaning; 'keyword' = AI unavailable, graded by overlap with the reference answer. */
  method: 'ai' | 'keyword' | 'none';
}

interface RawGrade {
  verdict?: string;
  correct?: boolean | string;
  feedback: string;
}
function isRawGrade(v: unknown): v is RawGrade {
  if (!v || typeof v !== 'object') return false;
  const o = v as RawGrade;
  return typeof o.feedback === 'string' && (typeof o.verdict === 'string' || typeof o.correct === 'boolean' || typeof o.correct === 'string');
}
function toVerdict(r: RawGrade): QuizVerdict | null {
  const v = String(r.verdict ?? r.correct ?? '').toLowerCase().trim();
  if (/^(correct|true|정답)$/.test(v)) return 'correct';
  if (/^(partial|partially|부분|부분 ?정답)/.test(v)) return 'partial';
  if (/^(incorrect|wrong|false|오답)$/.test(v)) return 'incorrect';
  return null;
}

/** Offline fallback: meaning-ish overlap of content words with the reference answer. Clearly labelled as such. */
function keywordGrade(t: Technique, answer: string): QuizGrade {
  const tokens = (s: string) => new Set((s.normalize('NFKC').toLowerCase().match(/[가-힣]{2,}|[a-z]{3,}/g) ?? []).map((w) => w.replace(/(을|를|이|가|은|는|에|의|로|으로|와|과|도|만|에서|하기|하는|합니다|입니다)$/, '')));
  const ref = tokens(`${referenceAnswer(t)} ${t.description ?? ''}`);
  const ans = [...tokens(answer)].filter((w) => w.length >= 2);
  const hits = ans.filter((w) => [...ref].some((r) => r.includes(w) || w.includes(r)));
  const verdict: QuizVerdict = hits.length >= 3 ? 'correct' : hits.length >= 1 ? 'partial' : 'incorrect';
  const ref1 = t.purpose?.split('\n')[0] ?? referenceAnswer(t);
  const fb = verdict === 'correct' ? `맞습니다. ${ref1}` : verdict === 'partial' ? `맞는 부분이 있습니다. 함께 기억해 주세요: ${ref1}` : `조금 다릅니다. MARTIALDEX 자료에 따르면 ${ref1}`;
  return { verdict, correct: verdict === 'correct' ? true : false, feedback: `${fb} (지금은 AI 채점을 사용할 수 없어 핵심 단어로 간이 판정했습니다.)`, method: 'keyword' };
}

/** Meaning-based grading (정답 / 부분 정답 / 오답) against the technique's data; retries once, then falls back to an honest keyword check. */
export async function gradeQuizAnswer(t: Technique, question: string, answer: string): Promise<QuizGrade> {
  const ask = () =>
    askGeminiForJsonWithGrounding<RawGrade>({
      systemInstruction: [
        COACH_SYSTEM_INSTRUCTION,
        '',
        '사용자의 답을 [기술 데이터]와 [모범 답안]의 "의미"로 채점한다. 표현이 달라도 핵심 의미가 맞으면 정답이다.',
        'verdict: "correct"(질문이 묻는 핵심 — 예: 목적과 쓰는 때 — 을 의미상 맞힘), "partial"(질문이 묻는 것 중 하나만 맞히거나 핵심이 흐릿함), "incorrect"(핵심과 관계없거나 틀림) 중 하나.',
        '학습자의 말로 된 짧은 답을 기준으로 한다: 데이터의 세부 항목(부위 이름, 단계 수 등)을 전부 말하지 않았다는 이유만으로 "partial"로 내리지 않는다. 빠진 세부는 feedback에서 보충한다.',
        'feedback: 1~2문장. 정답이면 "맞습니다."로, 부분 정답이면 "맞는 부분이 있습니다."로, 오답이면 "조금 다릅니다."로 시작하고, 데이터에 근거해 빠진 내용을 보충한다.',
        '출력: {"verdict": "correct"|"partial"|"incorrect", "feedback": string}',
      ].join('\n'),
      contextText: `[기술 데이터]\n${techniqueData(t)}\n\n[모범 답안]\n${referenceAnswer(t)}`,
      question: `질문: ${question}\n사용자 답: ${answer}`,
      useSearchGrounding: false,
      validate: isRawGrade,
    });
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await ask();
    if (r.ok) {
      const verdict = toVerdict(r.data);
      if (verdict) return { verdict, correct: verdict === 'correct', feedback: politeFix(r.data.feedback.trim()), method: 'ai' };
    }
  }
  return keywordGrade(t, answer);
}

/** Recognizes "I'm ready / start" — lives with the lesson intent classifier; re-exported for existing callers. */
export { isReadyIntent } from '../coachLesson/intent';

/** Summary + one training_history entry (idempotent) + Day completion when every technique was practiced to the end. */
export function finalizeCoachDay(run: CoachDayRun, curriculum: Curriculum, day: CurriculumDay): { allCompleted: boolean; practicedSeconds: number; reviewTechniqueIds: string[]; historyEntryId: string | null } {
  const outcomes = run.techniqueIds.map((id) => ({ id, ...run.outcomes[id] }));
  const practicedSeconds = outcomes.reduce((s, o) => s + (o.practicedSeconds ?? 0), 0);
  const allCompleted = outcomes.every((o) => o.completed);
  // A technique also needs review when the lesson judged a core concept not understood (coachLesson records which one).
  const reviewTechniqueIds = outcomes.filter((o) => !o.completed || o.quiz === 'incorrect' || o.understanding === 'weak').map((o) => o.id);
  const lessonNote = (() => {
    const states = Object.values(run.lessons ?? {});
    if (!states.length) return '';
    const all = states.flatMap((l) => Object.values(l.understanding.concepts).map((c) => c.status));
    const n = (s: string) => all.filter((x) => x === s).length;
    return ` · 이해도 확인: 이해 ${n('understood')} · 부분 이해 ${n('partial')} · 복습 필요 ${n('weak') + n('unknown')} (개념 기준), 질문 ${states.reduce((a, l) => a + l.studentQuestions.length, 0)}개`;
  })();
  let historyEntryId = run.historyEntryId;
  if (!historyEntryId && outcomes.some((o) => o.practicedSeconds > 0)) {
    const entry = recordTrainingSession({
      curriculumId: curriculum.id,
      dayNumber: day.day,
      techniqueIds: outcomes.filter((o) => o.practicedSeconds > 0).map((o) => o.id),
      completed: allCompleted,
      estimatedMinutes: day.estimatedMinutes,
      actualMinutes: Math.max(1, Math.round(practicedSeconds / 60)),
      notes: `AI 코치와 학습 (${run.mode === 'voice' ? '음성' : '입력'}${run.location ? ` · ${LOCATION_SHORT[run.location]}` : ''}) · ${outcomes.filter((o) => o.completed).length}/${outcomes.length}개 기술 연습 완료${
        run.mittSessions?.length ? ` · Visualizing Mitt ${run.mittSessions.map((m) => `${m.name} ${m.completedReps}/${m.targetReps}회`).join(', ')} (사용자 수행 기록, 동작 측정 아님)` : ''
      }${lessonNote}`,
      source: 'curriculum',
      aiCoach: { location: run.location ?? null, mode: run.mode },
    });
    historyEntryId = entry.id;
    if (allCompleted) setDayComplete(curriculum, day.day, true);
  }
  return { allCompleted, practicedSeconds, reviewTechniqueIds, historyEntryId };
}
