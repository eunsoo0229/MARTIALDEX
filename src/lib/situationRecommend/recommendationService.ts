import type { Technique } from '../../types';
import { getMartialArt } from '../loadData';
import { askGeminiForJson } from '../fighterStyle/geminiJson';
import { computeAllSkillProgress, rankWeakness } from '../skillProgress/weaknessEngine';
import type { MasteryStatus } from '../skillProgress/types';
import { listMyActiveProgress } from '../curriculum/curriculumService';
import { listSparringSessions } from '../sparringAnalysis/sparringSessionService';
import { buildSituationCandidatePool } from './candidatePool';
import { SITUATION_CATEGORY_LABEL } from './types';
import type { SituationCategory, SituationRecommendationResult, SituationTechniqueRecommendation } from './types';

const MAX_RECOMMENDATIONS = 6;

// "이미 숙련도가 높은 기술보다 현재 학습 중이거나 적절한 기술을 우선
// 추천한다" (spec 4) — a technique already at 'proficient' is never treated
// as unlearnable, just deprioritized relative to ones the user is still
// working on.
function isLearningFit(status: MasteryStatus): boolean {
  return status !== 'proficient';
}

interface AiItem {
  techniqueId: string;
  reason: string;
}

function isAiResponse(data: unknown): data is { items: AiItem[] } {
  if (!data || typeof data !== 'object') return false;
  const items = (data as Record<string, unknown>).items;
  return Array.isArray(items) && items.every((i) => i && typeof i === 'object' && typeof (i as Record<string, unknown>).techniqueId === 'string' && typeof (i as Record<string, unknown>).reason === 'string');
}

function fallbackReason(status: MasteryStatus, inCurriculum: boolean): string {
  if (inCurriculum) return '현재 진행 중인 커리큘럼에서 다루는 기술로, 이 상황에서 연습해보면 좋습니다(교육/훈련용 참고).';
  if (status === 'not_started') return '아직 학습하지 않은 기술입니다 — 이 상황에 대응하는 기본기로 배워볼 수 있습니다(교육/훈련용 참고).';
  if (status === 'learning' || status === 'needs_improvement') return '현재 학습·개선 중인 기술로, 이 상황에서 연습해보면 도움이 될 수 있습니다(교육/훈련용 참고).';
  return '이 상황과 관련된 기술입니다(교육/훈련용 참고).';
}

function fallbackRecommendations(
  candidates: Technique[],
  progressById: Map<string, { status: MasteryStatus }>,
  curriculumTechIds: Set<string>
): SituationTechniqueRecommendation[] {
  const scored = candidates.map((t) => {
    const status = progressById.get(t.id)?.status ?? 'not_started';
    const inCurriculum = curriculumTechIds.has(t.id);
    let score = 0;
    if (inCurriculum) score += 30;
    if (status === 'learning' || status === 'needs_improvement') score += 25;
    else if (status === 'not_started') score += 20;
    else if (status === 'average') score += 10;
    return { t, status, inCurriculum, score };
  });
  scored.sort((a, b) => (b.score - a.score) || a.t.name.localeCompare(b.t.name));
  return scored.slice(0, MAX_RECOMMENDATIONS).map(({ t, status, inCurriculum }) => ({
    techniqueId: t.id,
    techniqueName: t.name,
    martialArt: t.martialArt,
    reason: fallbackReason(status, inCurriculum),
    priority: isLearningFit(status) ? 'learning_fit' : 'general',
  }));
}

export async function getSituationRecommendation(input: {
  situationText: string;
  category: SituationCategory | null;
  martialArt: string;
}): Promise<SituationRecommendationResult> {
  const generatedAt = new Date().toISOString();
  const candidates = buildSituationCandidatePool(input.martialArt, input.category, input.situationText);

  if (candidates.length === 0) {
    return { ...input, recommendations: [], source: 'fallback', generatedAt };
  }

  const skillEntries = computeAllSkillProgress();
  const progressById = new Map(skillEntries.map((e) => [e.technique.id, e.progress]));
  const activeProgress = listMyActiveProgress().find((p) => p.curriculum.martialArt === input.martialArt);
  const currentDay = activeProgress?.curriculum.days.find((d) => d.day === activeProgress.progress.currentDay);
  const curriculumTechIds = new Set(currentDay?.techniqueIds ?? []);
  const weakness = rankWeakness(skillEntries, { curriculum: activeProgress?.curriculum, limit: 5 }).filter((w) => w.martialArt === input.martialArt);
  const latestSparring = listSparringSessions().find((s) => s.martialArt === input.martialArt);

  const art = getMartialArt(input.martialArt);
  const contextLines = [
    `무술: ${art?.nameKo ?? input.martialArt}`,
    input.category ? `상황 카테고리: ${SITUATION_CATEGORY_LABEL[input.category]}` : '',
    '',
    '후보 기술 목록 (이 목록의 techniqueId만 사용, 목록에 없는 기술은 추천하지 않음):',
    ...candidates.map((t) => {
      const status = progressById.get(t.id)?.status ?? 'not_started';
      const inCurriculum = curriculumTechIds.has(t.id) ? ' [현재 커리큘럼에서 학습 중]' : '';
      return `- ${t.id}: ${t.name} (숙련도: ${status})${inCurriculum}`;
    }),
    '',
    weakness.length ? `사용자의 개선이 필요한 기술: ${weakness.map((w) => w.techniqueName).join(', ')}` : '',
    latestSparring?.weakAreas.length ? `최근 스파링 분석에서 개선이 필요하다고 관찰된 부분: ${latestSparring.weakAreas.map((w) => w.label).join(', ')}` : '',
  ].filter(Boolean);

  const aiResult = await askGeminiForJson<{ items: AiItem[] }>({
    systemInstruction: [
      '사용자가 실제 스파링/훈련 상황을 설명하면, 그 상황에 도움이 될 수 있는 기술을 추천하는 역할이다.',
      '반드시 아래 "후보 기술 목록"에 있는 techniqueId만 사용한다 — 목록에 없는 기술을 새로 만들어 추천하지 않는다.',
      '이미 "숙련" 상태인 기술보다, 아직 학습 중이거나 개선이 필요하거나 현재 커리큘럼에서 다루는 기술을 우선한다.',
      '각 추천에 왜 이 상황에 맞는지 1문장의 한국어 이유를 쓴다.',
      '이 추천은 교육/훈련 목적의 참고용 제안이며, 실제 대련이나 시합에서 반드시 성공한다고 보장하는 표현은 쓰지 않는다.',
      `최대 ${MAX_RECOMMENDATIONS}개까지, 가장 적절한 순서로 추천한다.`,
      '출력 형식: {"items": [{"techniqueId": string, "reason": string}, ...]}',
    ].join('\n'),
    contextText: contextLines.join('\n'),
    question: `상황: "${input.situationText || (input.category ? SITUATION_CATEGORY_LABEL[input.category] : '')}" — 이 상황에 도움이 될 기술을 추천해줘.`,
    validate: isAiResponse,
  });

  if (aiResult.ok) {
    const candidateById = new Map(candidates.map((t) => [t.id, t]));
    const recommendations: SituationTechniqueRecommendation[] = [];
    for (const item of aiResult.data.items) {
      const t = candidateById.get(item.techniqueId);
      if (!t) continue; // not in the whitelist — dropped, never fabricated
      const status = progressById.get(t.id)?.status ?? 'not_started';
      recommendations.push({
        techniqueId: t.id,
        techniqueName: t.name,
        martialArt: t.martialArt,
        reason: item.reason,
        priority: isLearningFit(status) ? 'learning_fit' : 'general',
      });
      if (recommendations.length >= MAX_RECOMMENDATIONS) break;
    }
    if (recommendations.length > 0) {
      return { ...input, recommendations, source: 'ai', generatedAt };
    }
  }

  return { ...input, recommendations: fallbackRecommendations(candidates, progressById, curriculumTechIds), source: 'fallback', generatedAt };
}
