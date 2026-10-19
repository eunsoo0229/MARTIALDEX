import type { PostTag } from '../communityPost/types';
import { resolveTechnique } from '../userTechniques/service';
import { josa } from '../coachLesson/text';

// 숏폼 "영상에 나온 내용 배우기" — what each choice opens for a tagged technique / combo-setup.
// Nothing is started automatically: each destination opens prefilled and the viewer confirms there.

const kindWord = (t: PostTag) => (t.type === 'technique' ? '기술' : t.kind === 'setup' ? '셋업' : '콤보');

/** AI 코치 수업 (one-off lesson) with the request prefilled. */
export function aiCoachTarget(t: PostTag): string {
  const q = `${t.name} ${josa(kindWord(t), '을/를')} 배우고 싶어`;
  return `/coach/lesson?q=${encodeURIComponent(q)}${t.martialArt ? `&art=${encodeURIComponent(t.martialArt)}` : ''}`;
}

/** AI 목적 커리큘럼 with the goal prefilled (AiGoalCurriculum reads location.state). */
export function curriculumTarget(tags: PostTag[]): { to: string; state: { freeText: string; martialArt?: string } } {
  const names = tags.map((t) => `${t.name}(${kindWord(t)})`).join(', ');
  const art = tags.find((t) => t.martialArt)?.martialArt ?? undefined;
  return { to: '/ai-curriculum', state: { freeText: `영상에서 본 ${names} — 이 내용을 익히는 커리큘럼을 만들어 줘`, ...(art ? { martialArt: art } : {}) } };
}

/** The tagged item's own page. */
export function detailTarget(t: PostTag): string {
  if (t.type === 'combo') return `/user-combos/${encodeURIComponent(t.id)}`;
  const tech = resolveTechnique(t.id);
  const art = tech?.martialArt ?? t.martialArt ?? 'boxing';
  return `/arts/${encodeURIComponent(art)}/techniques/${encodeURIComponent(tech?.id ?? t.id)}`;
}

export const TAG_KIND_LABEL = (t: PostTag) => kindWord(t);
