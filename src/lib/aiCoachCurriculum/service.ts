import { isSubmissionGoal, MMA_ART_IDS } from '../aiCoachDay/practicePlan';
import type { Technique } from '../../types';
import type { Curriculum, CurriculumDay, ExerciseConfig } from '../curriculum/types';
import { getMartialArt, getTechniquesByMartialArt, gymExercises, homeTrainingExercises, isSyntheticTrainingDomain } from '../loadData';
import { getAuthorName, saveCustomCurriculum } from '../curriculum/curriculumService';
import { askGeminiForJsonWithGrounding } from '../userTechniques/geminiJson';
import { resolveTechnique } from '../userTechniques/service';
import { withObject } from '../aiCoachDay/politeSpeech';
import { buildLearnerProfile, masteryLine, type LearnedRef, type LearnerProfile } from './profile';
import { equipmentLabel, isSoloLocation, LOCATION_ICON, LOCATION_LABEL, LOCATION_SHORT, locationRules } from './location';
import type { AiCoachCurriculumMeta, CoachLocation, CoachPlanItem, CoachPlanRole } from './types';

// AI 코치 수업 curriculum generation:
//   learner profile (learned techniques + mastery + goal + earlier classes)
//   + location rules (집/체육관, confirmed vs unconfirmed equipment)
//   → Gemini returns a structured day plan using ONLY ids from the pools
//     given to it
//   → validatePlan() re-checks every id against the MARTIALDEX DB and every
//     location rule in code (an AI answer is never trusted as-is)
//   → anything missing/invalid is filled by the deterministic planner, so
//     generation never fails just because the AI is unavailable.

export interface CoachClassInput {
  martialArt: string;
  location: CoachLocation;
  equipment: string[];
  goal: string;
  sessionMinutes: number;
  days: number;
}

export interface CoachClassResult {
  curriculum: Curriculum;
  source: 'ai' | 'fallback';
  /** Human-readable notes about what validation changed or why the fallback was used. */
  notices: string[];
}

export const ROLE_ORDER: CoachPlanRole[] = ['warmup', 'review', 'connection', 'application', 'new', 'conditioning'];
export const ROLE_LABEL: Record<CoachPlanRole, string> = {
  warmup: '워밍업',
  review: '복습',
  connection: '기술 연결',
  application: '응용',
  new: '새 기술',
  conditioning: '체력·마무리',
};

const MAX_LEARNED_IN_PROMPT = 30;
const MAX_NEW_POOL = 15;
const MAX_DRILL_POOL = 30;
/**
 * Days requested per AI call. The shared AI transport caps a reply at 2048
 * output tokens (electron/gemini.cjs, gemini-ask Edge Function); a 5–7 day
 * Korean JSON plan doesn't fit in one reply (it came back truncated →
 * PARSE_ERROR), so the plan is requested in small sequential chunks, each
 * told what the earlier Days already covered.
 */
const DAYS_PER_AI_CALL = 2;

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---------------- pools (all real DB entries) ----------------

function isPlanCombat(t: Technique): boolean {
  return !isSyntheticTrainingDomain(t.martialArt);
}

/** Not-yet-learned techniques of this art the coach may introduce: ones linked from what the user knows first, then the easiest. */
export function newTechniquePool(profile: LearnerProfile): Technique[] {
  const learnedIds = new Set(profile.learned.map((l) => l.technique.id));
  const all = getTechniquesByMartialArt(profile.martialArt).filter((t) => !learnedIds.has(t.id));
  const linked = new Set(profile.learned.flatMap((l) => l.technique.relatedTechniques));
  const rank = (t: Technique) => (linked.has(t.id) ? 0 : 1) * 10 + (t.difficulty === 'beginner' ? 0 : t.difficulty === null ? 1 : t.difficulty === 'intermediate' ? 2 : 5);
  const allowAdvanced = profile.learned.length >= 15;
  return all
    .filter((t) => allowAdvanced || t.difficulty !== 'advanced')
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .slice(0, MAX_NEW_POOL);
}

/** Real home-training (and, with 운동기구 confirmed at a gym, real gym) exercises whose equipment is actually available. */
export function drillPool(location: CoachLocation, equipment: string[]): Technique[] {
  const have = new Set(['none', ...equipment.filter((e) => ['mat', 'jump_rope', 'dumbbell', 'band', 'pull_up_bar'].includes(e))]);
  const home = homeTrainingExercises.filter((t) => (t.equipment ?? ['none']).every((e) => have.has(e)));
  if (isSoloLocation(location) || !equipment.includes('machines')) return home.slice(0, MAX_DRILL_POOL);
  const gym = gymExercises
    .filter((t) => t.gymExerciseKind === '복합' || t.gymExerciseKind === '유산소')
    .sort((a, b) => (a.gymDifficulty === '초급' ? 0 : 1) - (b.gymDifficulty === '초급' ? 0 : 1))
    .slice(0, 15);
  return [...home, ...gym].slice(0, MAX_DRILL_POOL);
}

// ---------------- deterministic planner (fallback + gap filler) ----------------

function soloTextFor(t: Technique, location: CoachLocation): string {
  return isSoloLocation(location)
    ? `${withObject(t.name)} 파트너 없이 섀도 동작으로 천천히 반복합니다. 자세와 움직임 순서에 집중해 주세요.`
    : `파트너나 장비가 없다면 ${withObject(t.name)} 섀도 동작으로 반복합니다.`;
}

function defaultInstruction(role: CoachPlanRole, t: Technique, location: CoachLocation, equipment: string[], linked?: Technique): string {
  const bag = location === 'gym' && equipment.includes('heavy_bag');
  const partner = location === 'gym' && equipment.includes('partner');
  switch (role) {
    case 'warmup':
      return `${t.name}(으)로 몸을 데웁니다. 가볍게 시작해 점점 속도를 올리세요.`;
    case 'review':
      return isSoloLocation(location)
        ? `${t.name}을(를) 제자리에서 천천히 10회, 이어서 보통 속도로 반복합니다.`
        : partner
          ? `파트너와 ${t.name}을(를) 천천히 주고받으며 정확한 형태를 확인합니다.`
          : bag
            ? `${t.name}을(를) 샌드백(또는 해당 동작이 가능한 도구)에 정확하게 반복합니다.`
            : `${t.name}을(를) 넓은 공간에서 이동하며 반복합니다.`;
    case 'connection':
      return `${linked ? `${linked.name} → ` : ''}${t.name} 순서로 끊기지 않게 연결해서 반복합니다.`;
    case 'application':
      return `${t.name}을(를) 상황을 바꿔 가며(거리·방향) 응용해 봅니다.`;
    case 'new':
      return `새 기술 ${t.name}입니다. 설명과 영상을 확인한 뒤 아주 천천히 형태부터 익힙니다.`;
    case 'conditioning':
      return `${t.name}(으)로 마무리 체력 운동을 합니다. 무리하지 말고 자세를 유지하세요.`;
  }
}

function makeItem(role: CoachPlanRole, t: Technique, input: CoachClassInput, minutes: number, linked?: Technique): CoachPlanItem {
  const combatPartnerStep = input.location === 'gym' && role !== 'warmup' && role !== 'conditioning' && input.equipment.includes('partner');
  return {
    techniqueId: t.id,
    role,
    linkedTechniqueId: linked?.id ?? null,
    instruction: defaultInstruction(role, t, input.location, input.equipment, linked),
    minutes,
    needsPartner: combatPartnerStep,
    equipment: [],
    soloAlternative: isPlanCombat(t) && role !== 'warmup' && role !== 'conditioning' ? soloTextFor(t, input.location) : null,
  };
}

export function fallbackDay(dayIndex: number, input: CoachClassInput, profile: LearnerProfile, newPool: Technique[], drills: Technique[]): CoachPlanItem[] {
  const items: CoachPlanItem[] = [];
  const learned = profile.learned.map((l) => l.technique);
  const pick = <T,>(arr: T[], i: number): T | undefined => (arr.length ? arr[i % arr.length] : undefined);
  const warm = pick(drills, dayIndex * 2);
  if (warm) items.push(makeItem('warmup', warm, input, 4));
  // Review the weakest learned techniques, rotating through the list day by day.
  for (let k = 0; k < Math.min(2, learned.length); k++) items.push(makeItem('review', learned[(dayIndex * 2 + k) % learned.length], input, 5));
  if (learned.length >= 2) {
    const a = learned[(dayIndex * 2) % learned.length];
    const b = learned[(dayIndex * 2 + 1) % learned.length];
    if (a.id !== b.id) items.push(makeItem('connection', b, input, 5, a));
  }
  // Introduce one new technique on alternate days — or every day when there is little to review yet.
  const newTech = learned.length < 3 || dayIndex % 2 === 1 ? pick(newPool, dayIndex) : undefined;
  if (newTech) items.push(makeItem('new', newTech, input, 6));
  const cond = pick(drills, dayIndex * 2 + 1);
  if (cond && cond.id !== warm?.id) items.push(makeItem('conditioning', cond, input, 4));
  return fitMinutes(items, input.sessionMinutes);
}

/** Scales step minutes so a Day fits the requested session length (each step 1–20 min). */
function fitMinutes(items: CoachPlanItem[], sessionMinutes: number): CoachPlanItem[] {
  const total = items.reduce((s, i) => s + i.minutes, 0);
  if (!total) return items;
  const f = sessionMinutes / total;
  return items.map((i) => ({ ...i, minutes: Math.min(20, Math.max(1, Math.round(i.minutes * f))) }));
}

// ---------------- AI generation + validation ----------------

interface RawItem {
  techniqueId: string;
  role: string;
  linkedTechniqueId?: string | null;
  instruction: string;
  minutes: number;
  needsPartner?: boolean;
  equipment?: string[];
  soloAlternative?: string | null;
}
interface RawPlan {
  title: string;
  summary: string;
  equipmentQuestions?: string[];
  days: { title: string; coachNotes?: string; items: RawItem[] }[];
}

function isRawPlan(v: unknown): v is RawPlan {
  const o = v as RawPlan;
  return !!o && typeof o === 'object' && typeof o.title === 'string' && Array.isArray(o.days) && o.days.every((d) => d && Array.isArray(d.items));
}

const SYSTEM = [
  '당신은 MARTIALDEX의 AI 코치다. 사용자를 위한 "AI 코치 수업" 커리큘럼을 JSON으로 설계한다.',
  '규칙:',
  '- techniqueId에는 반드시 [배운 기술], [새 기술 후보], [드릴 후보] 목록에 있는 id만 그대로 쓴다. 목록에 없는 기술이나 운동을 만들지 않는다.',
  '- 순서: warmup(드릴) → review(배운 기술 복습) → connection(배운 기술끼리 연결) → application(응용) → new(새 기술, 하루 최대 1개) → conditioning(드릴).',
  '- review/connection/application은 [배운 기술]의 id만, new는 [새 기술 후보]의 id만, warmup/conditioning은 [드릴 후보] 또는 [배운 기술]의 id만 쓴다.',
  '- 숙련도가 낮은 기술(개선 필요, 학습 중)은 복습 비중을 높이고, 숙련 기술은 연결·응용에 활용한다.',
  '- [운동 장소] 규칙을 반드시 지킨다. instruction은 그 장소에서 실제로 하는 방법을 1~2문장으로 쓴다.',
  '- 확인되지 않은 장비/파트너를 쓰는 단계는 soloAlternative(없을 때의 대안)를 반드시 쓴다. 집에서는 needsPartner가 true인 단계를 만들지 않는다.',
  '- 하루 단계 minutes 합계는 [운동 시간]에 맞춘다. 하루 4~6단계.',
  '- instruction과 soloAlternative는 각각 60자 이내로 짧게 쓴다.',
  '- [이미 계획된 Day]가 있으면 그 내용을 반복하지 말고 이어지는 다음 Day를 만든다(복습 기술을 돌려 가며, 점점 연결·응용으로).',
  '- 확인이 필요한 장비 질문이 있으면 equipmentQuestions에 짧게 쓴다.',
  '출력 형식: {"title": string, "summary": string, "equipmentQuestions": string[], "days": [{"title": string, "coachNotes": string, "items": [{"techniqueId": string, "role": "warmup"|"review"|"connection"|"application"|"new"|"conditioning", "linkedTechniqueId": string|null, "instruction": string, "minutes": number, "needsPartner": boolean, "equipment": string[], "soloAlternative": string|null}]}]}',
].join('\n');

function poolLine(t: Technique): string {
  const extra = t.exerciseType ? ` | 유형: ${t.exerciseType}` : t.gymExerciseKind ? ` | 헬스 ${t.gymExerciseKind}` : t.category ? ` | ${t.category}` : '';
  return `${t.id} | ${t.name}${t.koreanName ? ` (${t.koreanName})` : ''}${extra}`;
}

/**
 * MMA classes mix striking and grappling in every Day, and a submission goal
 * is taught as takedown → (position) → submission. The coach's practice
 * follows the same order (aiCoachDay/practicePlan.ts).
 */
export function mmaRules(input: Pick<CoachClassInput, 'martialArt' | 'goal'>): string[] {
  if (!MMA_ART_IDS.has(input.martialArt)) return [];
  const rules = ['[MMA 규칙]', '- 매일 타격(펀치·킥)과 그래플링(테이크다운·그라운드)을 함께 넣는다. 타격만 하거나 그래플링만 하는 Day를 만들지 않는다.', '- connection 단계로 타격 → 테이크다운 연결(예: 잽·크로스 뒤 더블렉)을 넣는다.'];
  if (isSubmissionGoal(input.goal)) rules.push('- 목표가 서브미션이므로 같은 Day 안에서 테이크다운 → (포지션 컨트롤) → 서브미션 순서로 배치하고, 서브미션 단계의 linkedTechniqueId에 앞의 테이크다운 기술을 넣는다.');
  return [rules.join('\n')];
}

export function buildPlanContext(input: CoachClassInput, profile: LearnerProfile, newPool: Technique[], drills: Technique[]): string {
  const art = getMartialArt(input.martialArt);
  return [
    `[운동 장소]\n${locationRules(input.location, input.equipment)}`,
    `[무술]\n${art?.nameKo ?? input.martialArt}`,
    `[사용자의 목표]\n${input.goal.trim() || '특별한 목표 없음 — 배운 기술을 고르게 다지기'}`,
    `[운동 시간]\n하루 ${input.sessionMinutes}분, 총 ${input.days}일`,
    `[배운 기술] (id | 이름 | 숙련도 | 연습 횟수)\n${profile.learned.slice(0, MAX_LEARNED_IN_PROMPT).map(masteryLine).join('\n') || '없음 — 새 기술 위주로 구성'}`,
    `[이전 AI 코치 수업]\n${profile.previousClasses.join('\n') || '없음'}`,
    `[새 기술 후보] (아직 배우지 않은 기술)\n${newPool.map(poolLine).join('\n') || '없음'}`,
    `[드릴 후보] (실제 MARTIALDEX 운동, 장비 조건 충족)\n${drills.map(poolLine).join('\n') || '없음'}`,
    ...mmaRules(input),
  ].join('\n\n');
}

/**
 * Code-level re-check of an AI plan: real ids only, role ↔ pool rules, at
 * most one new technique a day, location rules (no partner steps at home,
 * an alternative for every partner/unconfirmed-equipment step), minutes
 * fitted to the session. Returns the cleaned items and what was changed.
 */
export function validatePlanDay(raw: RawItem[], input: CoachClassInput, learnedIds: Set<string>, newIds: Set<string>, drillIds: Set<string>): { items: CoachPlanItem[]; dropped: number } {
  const items: CoachPlanItem[] = [];
  let dropped = 0;
  let newCount = 0;
  const seen = new Set<string>();
  for (const r of raw) {
    const role = r.role as CoachPlanRole;
    const t = typeof r.techniqueId === 'string' ? resolveTechnique(r.techniqueId) : undefined;
    const roleOk =
      ROLE_ORDER.includes(role) &&
      !!t &&
      ((role === 'review' || role === 'connection' || role === 'application') ? learnedIds.has(t.id) : role === 'new' ? newIds.has(t.id) : drillIds.has(t.id) || learnedIds.has(t.id));
    if (!t || !roleOk || seen.has(`${role}:${t.id}`) || (role === 'new' && newCount >= 1)) {
      dropped++;
      continue;
    }
    let needsPartner = r.needsPartner === true;
    let instruction = typeof r.instruction === 'string' && r.instruction.trim() ? r.instruction.trim() : defaultInstruction(role, t, input.location, input.equipment);
    let soloAlternative = typeof r.soloAlternative === 'string' && r.soloAlternative.trim() ? r.soloAlternative.trim() : null;
    if (isSoloLocation(input.location) && needsPartner) {
      // Home / limited = alone: a partner step survives only as its solo alternative.
      if (!soloAlternative) {
        dropped++;
        continue;
      }
      instruction = soloAlternative;
      soloAlternative = null;
      needsPartner = false;
    }
    const usesUnconfirmed = (needsPartner && !input.equipment.includes('partner')) || (r.equipment ?? []).some((e) => !input.equipment.some((id) => id === e || equipmentLabel(input.location, id) === e));
    if (usesUnconfirmed && !soloAlternative) soloAlternative = soloTextFor(t, input.location);
    const linked = r.linkedTechniqueId && learnedIds.has(r.linkedTechniqueId) && r.linkedTechniqueId !== t.id ? r.linkedTechniqueId : null;
    seen.add(`${role}:${t.id}`);
    if (role === 'new') newCount++;
    items.push({
      techniqueId: t.id,
      role,
      linkedTechniqueId: role === 'connection' ? linked : null,
      instruction,
      minutes: Number.isFinite(r.minutes) ? Math.min(20, Math.max(1, Math.round(r.minutes))) : 5,
      needsPartner,
      equipment: (r.equipment ?? []).filter((e) => typeof e === 'string').slice(0, 4),
      soloAlternative,
    });
  }
  items.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  return { items: fitMinutes(items, input.sessionMinutes), dropped };
}

function toCurriculumDay(dayNumber: number, title: string, notes: string, items: CoachPlanItem[]): CurriculumDay {
  const exerciseConfig: Record<string, ExerciseConfig> = {};
  for (const i of items) exerciseConfig[i.techniqueId] = { mode: 'time', sets: 1, targetReps: null, targetSeconds: i.minutes * 60, restSeconds: 30 };
  const reviewRoles: CoachPlanRole[] = ['review', 'connection', 'application'];
  const uniq = (ids: string[]) => [...new Set(ids)];
  const reviewIds = uniq(items.filter((i) => reviewRoles.includes(i.role)).map((i) => i.techniqueId));
  return {
    day: dayNumber,
    title,
    description: notes,
    learningGoals: items.filter((i) => i.role !== 'warmup' && i.role !== 'conditioning').map((i) => `${ROLE_LABEL[i.role]}: ${resolveTechnique(i.techniqueId)?.name ?? i.techniqueId}`),
    techniqueIds: uniq(items.filter((i) => !reviewRoles.includes(i.role)).map((i) => i.techniqueId)).filter((id) => !reviewIds.includes(id)),
    reviewTechniqueIds: reviewIds,
    difficulty: null,
    estimatedMinutes: items.reduce((s, i) => s + i.minutes, 0),
    exerciseConfig,
    coachPlan: items,
    coachNotes: notes,
  };
}

function dayTitleFallback(items: CoachPlanItem[], location: CoachLocation): string {
  const focus = items.find((i) => i.role === 'new') ?? items.find((i) => i.role === 'review');
  const name = focus ? resolveTechnique(focus.techniqueId)?.name : null;
  return `${LOCATION_SHORT[location]} 수업${name ? ` · ${name}` : ''}`;
}

export async function generateCoachClassCurriculum(input: CoachClassInput): Promise<CoachClassResult> {
  const profile = buildLearnerProfile(input.martialArt);
  const newPool = newTechniquePool(profile);
  const drills = drillPool(input.location, input.equipment);
  const learnedIds = new Set(profile.learned.map((l) => l.technique.id));
  const newIds = new Set(newPool.map((t) => t.id));
  const drillIds = new Set(drills.map((t) => t.id));
  const notices: string[] = [];

  const baseContext = buildPlanContext(input, profile, newPool, drills);
  const days: CurriculumDay[] = [];
  let aiDays = 0;
  let title = '';
  let summary = '';
  let equipmentQuestions: string[] = [];
  let dropped = 0;
  let lastError = '';
  while (days.length < input.days) {
    const from = days.length + 1;
    const count = Math.min(DAYS_PER_AI_CALL, input.days - days.length);
    const planned = days.map((d) => `Day ${d.day} ${d.title}: ${(d.coachPlan ?? []).map((i) => `${ROLE_LABEL[i.role]} ${resolveTechnique(i.techniqueId)?.name ?? i.techniqueId}`).join(', ')}`);
    const ai = await askGeminiForJsonWithGrounding<RawPlan>({
      systemInstruction: SYSTEM,
      contextText: `${baseContext}\n\n[이미 계획된 Day]\n${planned.join('\n') || '없음'}`,
      question: `총 ${input.days}일짜리 ${LOCATION_LABEL[input.location]} AI 코치 수업 중 Day ${from}${count > 1 ? `~${from + count - 1}` : ''} (${count}일치)를 만들어줘. days 배열에는 정확히 ${count}개만 넣어.`,
      useSearchGrounding: false,
      validate: isRawPlan,
    });
    if (!ai.ok) {
      lastError = ai.message;
      for (let k = 0; k < count; k++) {
        const i = days.length;
        const items = fallbackDay(i, input, profile, newPool, drills);
        days.push(toCurriculumDay(i + 1, dayTitleFallback(items, input.location), '', items));
      }
      continue;
    }
    if (!title) title = ai.data.title.trim();
    if (!summary) summary = (ai.data.summary ?? '').trim();
    for (const q of ai.data.equipmentQuestions ?? []) if (typeof q === 'string' && q.trim() && !equipmentQuestions.includes(q.trim())) equipmentQuestions.push(q.trim());
    for (let k = 0; k < count; k++) {
      const i = days.length;
      const d = ai.data.days[k];
      const v = d ? validatePlanDay(d.items, input, learnedIds, newIds, drillIds) : { items: [], dropped: 0 };
      dropped += v.dropped;
      const usable = v.items.some((x) => isPlanCombat(resolveTechnique(x.techniqueId)!));
      const items = usable ? v.items : fallbackDay(i, input, profile, newPool, drills);
      if (usable) aiDays++;
      days.push(toCurriculumDay(i + 1, (usable && d?.title?.trim()) || dayTitleFallback(items, input.location), usable ? (d?.coachNotes ?? '').trim() : '', items));
    }
  }
  equipmentQuestions = equipmentQuestions.slice(0, 4);
  const source: 'ai' | 'fallback' = aiDays > 0 ? 'ai' : 'fallback';
  if (dropped > 0) notices.push(`AI가 제안한 단계 중 ${dropped}개는 MARTIALDEX 기술 DB나 장소 조건과 맞지 않아 제외했습니다.`);
  if (aiDays === 0) notices.push(`AI 응답을 받지 못해 배운 기술과 숙련도를 기준으로 기본 수업을 구성했습니다.${lastError ? ` (${lastError})` : ''}`);
  else if (aiDays < input.days) notices.push(`${input.days - aiDays}개 Day는 AI 응답을 쓸 수 없어 배운 기술 기준 기본 구성으로 채웠습니다.`);
  if (profile.learned.length === 0) notices.push('아직 이 무술에서 배운 기술이 없어 새 기술 위주로 구성했습니다.');

  const art = getMartialArt(input.martialArt);
  const meta: AiCoachCurriculumMeta = {
    location: input.location,
    equipment: input.equipment,
    goal: input.goal.trim(),
    sessionMinutes: input.sessionMinutes,
    generatedAt: new Date().toISOString(),
    source,
    summary: summary || `${LOCATION_LABEL[input.location]} 기준으로 배운 기술 ${profile.learned.length}개를 복습·연결하고 필요한 새 기술을 더한 수업입니다.`,
    equipmentQuestions,
    learnedSnapshot: profile.learned.map((l: LearnedRef) => ({ techniqueId: l.technique.id, status: l.status })),
  };
  const now = new Date().toISOString();
  const curriculum = saveCustomCurriculum({
    id: `aicoach-${newId()}`,
    martialArt: input.martialArt,
    title: title || `${LOCATION_ICON[input.location]} ${LOCATION_SHORT[input.location]} AI 코치 수업 · ${art?.nameKo ?? input.martialArt}`,
    subtitle: `AI 코치 수업 · ${LOCATION_LABEL[input.location]}`,
    description: `${meta.summary} 실제 훈련은 안전한 환경에서, 필요하면 지도자와 함께 진행하세요.`,
    source: 'custom',
    visibility: 'private',
    authorName: getAuthorName(),
    coverIcon: LOCATION_ICON[input.location],
    totalDays: days.length,
    estimatedWeeks: Math.max(1, Math.ceil(days.length / 4)),
    phases: [],
    days,
    techniqueCount: 0,
    createdAt: now,
    updatedAt: now,
    aiCoachMeta: meta,
  });
  return { curriculum, source, notices };
}
