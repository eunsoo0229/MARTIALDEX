import type { Curriculum } from '../curriculum/types';
import type { FighterStyleAnalysis, Intensity, StyleCurriculumMeta, TechniqueMatch, UserLevel } from './types';
import { curriculumRepository } from '../curriculum/repository';
import { getAuthorName, listMyCurricula } from '../curriculum/curriculumService';
import { planStyleCurriculum } from './curriculumPlanner';


// A "선수 스타일" curriculum is a completely normal Curriculum — it is
// stored, listed, edited, shared, and tracked for progress via the exact
// same repository/service the rest of the learning system already uses
// (src/lib/curriculum/). The only addition is the optional `styleMeta`
// field, which carries the fighter/analysis/matched-technique "ingredients"
// so the duration can be reworked later without another Gemini call.
//
// martialArt is set to the synthetic id "mma" (not one of the 9 real arts)
// since a fighter's style typically spans several — see README "선수 스타일
// 학습" for how UI code treats that pseudo-id.
export const STYLE_CURRICULUM_MARTIAL_ART = 'mma';

function newId(): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `custom__${rand}`;
}

export interface CreateStyleCurriculumParams {
  fighterId: string;
  fighterName: string;
  targetStyle?: string;
  styleAnalysis: FighterStyleAnalysis;
  matchedTechniques: TechniqueMatch[];
  targetDays: number;
  intensity: Intensity;
  userLevel: UserLevel;
  durationMode: 'ai_recommended' | 'user_selected';
}

function buildCurriculum(params: CreateStyleCurriculumParams, existingId?: string): Curriculum {
  const { days, phases } = planStyleCurriculum({
    fighterName: params.fighterName,
    matches: params.matchedTechniques,
    targetDays: params.targetDays,
    intensity: params.intensity,
    userLevel: params.userLevel,
  });

  const styleMeta: StyleCurriculumMeta = {
    fighterId: params.fighterId,
    fighterName: params.fighterName,
    targetStyle: params.targetStyle,
    durationMode: params.durationMode,
    intensity: params.intensity,
    userLevel: params.userLevel,
    styleAnalysis: params.styleAnalysis,
    matchedTechniques: params.matchedTechniques,
  };

  const now = new Date().toISOString();
  const techniqueCount = new Set(days.flatMap((d) => d.techniqueIds)).size;

  return {
    id: existingId ?? newId(),
    martialArt: STYLE_CURRICULUM_MARTIAL_ART,
    title: `${params.fighterName} Style`,
    subtitle: 'AI 선수 스타일 학습 커리큘럼',
    description:
      `${params.fighterName}의 공개적으로 알려진 경기 스타일을 참고해 생성된 학습 커리큘럼입니다. ` +
      '공개 경기 기록과 분석 정보를 바탕으로 한 Martialdex의 학습용 스타일 분석이며, 실제 선수의 실력을 완전히 대변하지 않습니다.',
    source: 'custom',
    visibility: 'private',
    authorName: getAuthorName(),
    coverIcon: '🥋',
    totalDays: days.length,
    estimatedWeeks: Math.max(1, Math.ceil(days.length / 4)),
    phases,
    days,
    techniqueCount,
    createdAt: now,
    updatedAt: now,
    styleMeta,
  };
}

export function saveNewStyleCurriculum(params: CreateStyleCurriculumParams): Curriculum {
  const curriculum = buildCurriculum(params);
  curriculumRepository.saveCustom(curriculum);
  return curriculum;
}

/**
 * Re-plans an existing style curriculum for a new duration/intensity using
 * the SAME persisted matched-technique pool (no new Gemini call). Per spec,
 * this is a real re-design (phase weights recomputed against the new day
 * budget), not a truncation — see curriculumPlanner.ts. Progress is reset
 * because day numbers/contents no longer correspond to what was completed
 * before; the caller should warn the user before calling this.
 */
export function regenerateStyleCurriculum(
  curriculum: Curriculum,
  newDurationDays: number,
  newIntensity?: Intensity,
  newDurationMode: 'ai_recommended' | 'user_selected' = 'user_selected'
): Curriculum {
  if (!curriculum.styleMeta) throw new Error('regenerateStyleCurriculum called on a non-style curriculum');
  const meta = curriculum.styleMeta;
  const rebuilt = buildCurriculum(
    {
      fighterId: meta.fighterId,
      fighterName: meta.fighterName,
      targetStyle: meta.targetStyle,
      styleAnalysis: meta.styleAnalysis,
      matchedTechniques: meta.matchedTechniques,
      targetDays: newDurationDays,
      intensity: newIntensity ?? meta.intensity,
      userLevel: meta.userLevel,
      durationMode: newDurationMode,
    },
    curriculum.id
  );
  rebuilt.title = curriculum.title;
  rebuilt.visibility = curriculum.visibility;
  rebuilt.createdAt = curriculum.createdAt;
  curriculumRepository.saveCustom(rebuilt);
  curriculumRepository.saveProgress({
    curriculumId: curriculum.id,
    currentDay: 1,
    completedDays: [],
    startedAt: new Date().toISOString(),
    lastStudiedAt: new Date().toISOString(),
    progress: 0,
  });
  return rebuilt;
}

export function listMyStyleCurricula(): Curriculum[] {
  return listMyCurricula().filter((c) => !!c.styleMeta);
}
