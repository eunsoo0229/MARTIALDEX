import type { Curriculum } from '../curriculum/types';
import { getTechnique, getTechniquesByIds } from '../loadData';
import { addDay, addTechniqueToDay, createCustomCurriculum, saveCustomCurriculum, updateDay } from '../curriculum/curriculumService';

// 14-9 "약점 → 학습 연결": a short, fully deterministic 5-day curriculum
// built from ONE technique's own real fields — relatedTechniques (real ids,
// same field TechniqueDetail already links out to) for the "연결 기술" day,
// and its own description/variations/defenses/counters text for the day
// write-ups. No AI call, so there's no chance of inventing a technique that
// doesn't exist. Reuses the exact CRUD helpers the manual curriculum editor
// uses (curriculumService.ts) — no separate/duplicate curriculum storage.
export function createWeaknessCurriculum(weaknessTechniqueId: string): Curriculum {
  const technique = getTechnique(weaknessTechniqueId);
  if (!technique) throw new Error(`createWeaknessCurriculum: unknown technique id ${weaknessTechniqueId}`);

  const relatedIds = getTechniquesByIds(technique.relatedTechniques).map((t) => t.id);
  const connectionIds = relatedIds.length ? relatedIds.slice(0, 2) : [technique.id];
  const reviewIds = relatedIds.length ? [technique.id, relatedIds[0]] : [technique.id];
  const defenseNotes = [...technique.defenses, ...technique.counters];

  const dayPlans: { title: string; description: string; techniqueIds: string[] }[] = [
    {
      title: `${technique.name} 기본`,
      description: technique.description || technique.purpose || `${technique.name}의 기본 동작을 복습합니다.`,
      techniqueIds: [technique.id],
    },
    {
      title: `${technique.name} 유지 · 응용`,
      description: technique.variations.length
        ? `변형: ${technique.variations.join(', ')}`
        : `${technique.name}을(를) 다양한 상황에서 적용해봅니다.`,
      techniqueIds: [technique.id],
    },
    {
      title: '방어 · 대응 상황 연습',
      description: defenseNotes.length ? defenseNotes.join(', ') : '상대의 방어/대응 상황을 가정해 연습합니다.',
      techniqueIds: [technique.id],
    },
    {
      title: '연결 기술',
      description: '이 기술과 자연스럽게 이어지는 관련 기술을 함께 연습합니다.',
      techniqueIds: connectionIds,
    },
    {
      title: '종합 복습',
      description: `${technique.name}을(를) 중심으로 지난 4일간 배운 내용을 복습합니다.`,
      techniqueIds: reviewIds,
    },
  ];

  let curriculum = createCustomCurriculum({
    title: `${technique.name} 약점 개선`,
    description:
      `AI 개인 코치가 "${technique.name}"의 분석 기록을 바탕으로 생성한 5일 집중 개선 커리큘럼입니다. ` +
      'AI 분석 기록을 기반으로 한 학습 추천이며, 실제 전문 지도자의 지도를 대체하지 않습니다.',
    martialArt: technique.martialArt,
    visibility: 'private',
    coverIcon: '🎯',
  });

  for (let i = 0; i < dayPlans.length; i++) curriculum = addDay(curriculum);
  dayPlans.forEach((plan, i) => {
    const dayNumber = i + 1;
    curriculum = updateDay(curriculum, dayNumber, {
      title: `Day ${dayNumber} · ${plan.title}`,
      description: plan.description,
      learningGoals: [plan.title],
      estimatedMinutes: 25,
    });
    for (const id of plan.techniqueIds) curriculum = addTechniqueToDay(curriculum, dayNumber, id);
  });

  return saveCustomCurriculum(curriculum);
}
