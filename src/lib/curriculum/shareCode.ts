import type { Curriculum, ExerciseConfig } from './types';
// resolveTechnique (not the official-only getTechnique) so a shared
// curriculum referencing an add_teq/user-discovered technique or
// home-training exercise doesn't have its ids silently stripped on import
// — same fix aiCurriculum/validator.ts already made for the same reason.
import { resolveTechnique } from '../userTechniques/service';

// A share "code" is just the curriculum JSON, base64-encoded, with a short
// version prefix. There is no server involved — the whole point is that two
// people can exchange a curriculum by pasting this string through whatever
// channel they already use (chat, email, ...) without Martialdex needing a
// backend. See repository.ts for why there's no backend yet.
const PREFIX = 'MDCUR1.';

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeShareCode(curriculum: Curriculum): string {
  // Strip fields that are meaningless (or actively confusing) once the
  // curriculum leaves this device: local engagement counters and the
  // owner's own visibility setting.
  const { likes, usageCount, visibility, ...portable } = curriculum;
  return PREFIX + utf8ToBase64(JSON.stringify(portable));
}

export interface DecodedShareCode {
  curriculum: Curriculum;
  removedInvalidIds: string[];
}

export class ShareCodeError extends Error {}

export function decodeShareCode(code: string): DecodedShareCode {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) {
    throw new ShareCodeError('Martialdex 커리큘럼 공유 코드 형식이 아닙니다.');
  }
  let parsed: any;
  try {
    parsed = JSON.parse(base64ToUtf8(trimmed.slice(PREFIX.length)));
  } catch {
    throw new ShareCodeError('공유 코드를 읽을 수 없습니다. 코드가 잘리지 않았는지 확인해주세요.');
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.days) || !parsed.title || !parsed.martialArt) {
    throw new ShareCodeError('공유 코드 안의 커리큘럼 데이터가 올바르지 않습니다.');
  }

  // Never trust a pasted-in code to only reference techniques that still
  // exist in this build of the app — silently keeping a dangling
  // techniqueId would break the technique-card/AI/YouTube UI downstream.
  const removedInvalidIds: string[] = [];
  const days = parsed.days.map((d: any) => {
    const filterIds = (ids: unknown): string[] =>
      Array.isArray(ids)
        ? ids.filter((id) => {
            if (typeof id !== 'string') return false;
            if (resolveTechnique(id)) return true;
            removedInvalidIds.push(id);
            return false;
          })
        : [];
    const techniqueIds = filterIds(d.techniqueIds);
    const reviewTechniqueIds = filterIds(d.reviewTechniqueIds);
    // exerciseConfig (sets/reps/time/rest) is the actual substance of a
    // home-training Day — a share code that dropped it would come back
    // with every set/rep/rest setting reset to nothing. Only keep entries
    // for ids that survived the validity filter above.
    const validIds = new Set([...techniqueIds, ...reviewTechniqueIds]);
    let exerciseConfig: Record<string, ExerciseConfig> | undefined;
    if (d.exerciseConfig && typeof d.exerciseConfig === 'object') {
      const entries = Object.entries(d.exerciseConfig).filter(([id]) => validIds.has(id));
      if (entries.length > 0) {
        exerciseConfig = Object.fromEntries(
          entries.map(([id, cfg]: [string, any]) => [
            id,
            {
              mode: cfg?.mode === 'time' ? 'time' : 'reps',
              sets: Number(cfg?.sets) || 1,
              targetReps: cfg?.targetReps === null || cfg?.targetReps === undefined ? null : Number(cfg.targetReps),
              targetSeconds: cfg?.targetSeconds === null || cfg?.targetSeconds === undefined ? null : Number(cfg.targetSeconds),
              restSeconds: Number(cfg?.restSeconds) || 0,
            } satisfies ExerciseConfig,
          ])
        );
      }
    }
    return {
      day: Number(d.day) || 0,
      title: String(d.title ?? ''),
      description: String(d.description ?? ''),
      learningGoals: Array.isArray(d.learningGoals) ? d.learningGoals.map(String) : [],
      techniqueIds,
      reviewTechniqueIds,
      difficulty: d.difficulty ?? null,
      estimatedMinutes: Number(d.estimatedMinutes) || 30,
      ...(exerciseConfig ? { exerciseConfig } : {}),
    };
  });

  const curriculum: Curriculum = {
    id: '', // caller assigns a fresh id before saving — see curriculumService.copyToMine
    martialArt: String(parsed.martialArt),
    title: String(parsed.title),
    subtitle: parsed.subtitle ? String(parsed.subtitle) : undefined,
    description: String(parsed.description ?? ''),
    source: 'custom',
    visibility: 'private',
    authorName: String(parsed.authorName ?? '알 수 없음'),
    coverIcon: parsed.coverIcon ? String(parsed.coverIcon) : undefined,
    totalDays: days.length,
    estimatedWeeks: Math.ceil(days.length / 4),
    phases: Array.isArray(parsed.phases) ? parsed.phases : [],
    days,
    techniqueCount: new Set(days.flatMap((d: any) => d.techniqueIds)).size,
    basedOnCurriculumId: parsed.id || undefined,
    // Preserve whichever curriculum-flavor metadata the source had — encodeShareCode
    // already keeps these (it only strips likes/usageCount/visibility), so a
    // decoded AI/선수 스타일/홈트 curriculum should still show its correct
    // labels/duration framing instead of falling back to generic display.
    ...(parsed.styleMeta ? { styleMeta: parsed.styleMeta } : {}),
    ...(parsed.aiGoalMeta ? { aiGoalMeta: parsed.aiGoalMeta } : {}),
    ...(parsed.homeTrainingMeta ? { homeTrainingMeta: parsed.homeTrainingMeta } : {}),
  };

  return { curriculum, removedInvalidIds: [...new Set(removedInvalidIds)] };
}
