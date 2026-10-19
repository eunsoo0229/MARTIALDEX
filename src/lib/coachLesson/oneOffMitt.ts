import type { Technique } from '../../types';
import { canonicalTechniqueId } from '../techniqueCanonical';
import { resolveTechnique } from '../userTechniques/service';
import { motionForTechnique } from '../visualMitt/archetypes';
import { listVisualizableTechniques } from '../visualMitt/combos';
import { MMA_SOURCE_MARTIAL_ARTS } from '../mmaCurriculum/types';
import { chain, isMmaContext, mittFor, planPractice, postureBriefing, type PracticeSetup } from '../aiCoachDay/practicePlan';
import type { OneOffLesson } from './oneOff';

// 「수업하고 싶은 거 입력하기」 → the lesson's practice on the Visualizing Mitt.
// The techniques are the ones that actually came out of THIS lesson — the
// student's request, the lesson title, its practice sentence and its concepts
// (built from the live web search) — matched to real MARTIALDEX techniques
// that can be drawn, then combined in the order they were mentioned (takedown
// entries last) as long as the connection is natural. Nothing is invented: a
// lesson that names no drawable technique has no mitt practice.

const DOUBLE_LEG = 'wrestling__basic-double-leg';
/**
 * Korean call words a request uses ("잽과 크로스 뒤 로우킥") → the technique slug.
 * Resolved to a REAL id in the lesson's art first (kickboxing / boxing /
 * muay-thai / wrestling after it); a word with no drawable technique is ignored.
 */
const CALL_WORDS: Record<string, string> = {
  잽: 'jab', 크로스: 'cross', 스트레이트: 'cross', 훅: 'lead-hook', '뒷손 훅': 'rear-hook', 어퍼컷: 'lead-uppercut', 어퍼: 'lead-uppercut', '뒷손 어퍼': 'rear-uppercut',
  오버핸드: 'overhand', 로우킥: 'low-kick', 카프킥: 'low-kick', 미들킥: 'body-kick', 바디킥: 'body-kick', 라운드킥: 'round-kick', 하이킥: 'high-kick', 티프: 'teep', 니킥: 'straight-knee',
  더블렉: 'basic-double-leg', '더블 렉': 'basic-double-leg', '더블 레그': 'basic-double-leg', 싱글렉: 'high-single', '싱글 레그': 'high-single',
};
const CALL_ARTS = ['kickboxing', 'boxing', 'muay-thai', 'wrestling'];

function callWordTechnique(slug: string, art: string | null): Technique | null {
  if (!slug) return null;
  for (const a of [...(art ? [art] : []), ...CALL_ARTS]) {
    const t = resolveTechnique(`${a}__${slug}`);
    if (t && motionForTechnique(t)) return t;
  }
  return null;
}

function lessonText(lesson: OneOffLesson): string {
  return [lesson.request, lesson.title, lesson.practice, ...lesson.context.concepts.flatMap((c) => [c.label, c.reference])].join('\n');
}

function namesOf(t: Technique): string[] {
  return [t.name, t.koreanName ?? '', ...t.aliases].map((n) => n.trim()).filter((n) => n.length >= 2);
}

/** Drawable techniques named in the lesson, in order of first mention (longest names first, no overlaps). */
export function lessonMittTechniques(lesson: OneOffLesson): Technique[] {
  const text = lessonText(lesson);
  const lower = text.toLowerCase();
  const arts = !lesson.martialArt ? null : isMmaContext(lesson.martialArt) ? MMA_SOURCE_MARTIAL_ARTS : [lesson.martialArt, 'boxing', 'kickboxing', 'wrestling'];
  const pool = arts ? [...new Map(arts.flatMap((a) => listVisualizableTechniques(a)).map((t) => [t.id, t])).values()] : listVisualizableTechniques();
  const candidates = pool.flatMap((t) => namesOf(t).map((n) => ({ t, n: n.toLowerCase() })));
  for (const [word, slug] of Object.entries(CALL_WORDS)) {
    const t = callWordTechnique(slug, isMmaContext(lesson.martialArt) ? null : lesson.martialArt);
    if (t) candidates.push({ t, n: word });
  }
  candidates.sort((a, b) => b.n.length - a.n.length);
  const taken: boolean[] = new Array(lower.length).fill(false);
  const hits: { t: Technique; at: number }[] = [];
  for (const c of candidates) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(c.n, from);
      if (at < 0) break;
      from = at + c.n.length;
      // a Latin name must stand alone ("jab" not inside "jabs-and"... is fine, but not inside another word)
      if (/^[a-z]/.test(c.n) && (/[a-z]/.test(lower[at - 1] ?? '') || /[a-z]/.test(lower[at + c.n.length] ?? ''))) continue;
      if (taken.slice(at, at + c.n.length).some(Boolean)) continue;
      for (let i = at; i < at + c.n.length; i++) taken[i] = true;
      hits.push({ t: c.t, at });
    }
  }
  const lead = lesson.techniqueId ? resolveTechnique(lesson.techniqueId) : undefined;
  const ordered = [...(lead && motionForTechnique(lead) ? [{ t: lead, at: -1 }] : []), ...hits.sort((a, b) => a.at - b.at)];
  const seen = new Set<string>();
  return ordered
    .map((h) => h.t)
    .filter((t) => {
      const k = canonicalTechniqueId(t.id);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/**
 * The lesson's practice setup (posture briefing → mitt), or null when the
 * lesson names nothing that can be drawn and its technique isn't one either.
 */
export function oneOffPractice(lesson: OneOffLesson): PracticeSetup | null {
  const found = lessonMittTechniques(lesson);
  const mma = isMmaContext(lesson.martialArt);
  const lead = lesson.techniqueId ? resolveTechnique(lesson.techniqueId) : undefined;
  const seconds = lesson.workout?.spec?.exerciseDurationSeconds ?? 120;
  // Only the lesson's own technique → the same plan the AI coach uses (MMA mix, takedown → submission …).
  if (lead && found.length <= 1 && (found.length === 0 || canonicalTechniqueId(found[0].id) === canonicalTechniqueId(lead.id))) {
    const setup = planPractice(lead, { location: null, mma, submissionGoal: /서브미션|submission/i.test(lesson.request), seconds });
    return setup.mitt ? setup : null;
  }
  if (!found.length) return null;
  // Combine: strikes in mention order, takedown entries last; drop from the end until the chain is natural.
  const strikes = found.filter((t) => motionForTechnique(t)!.archetype.kind !== 'entry');
  const entries = found.filter((t) => motionForTechnique(t)!.archetype.kind === 'entry');
  let ids = [...strikes, ...entries.slice(0, 1)].slice(0, 4).map((t) => t.id);
  let combo: string[] | null = null;
  while (ids.length && !(combo = chain(ids))) ids = ids.length > 2 ? [...ids.slice(0, -2), ids[ids.length - 1]] : ids.slice(0, -1);
  if (!combo) return null;
  // MMA: striking and grappling together — a strike-only combo ends with a takedown entry.
  let mixed = false;
  if (mma && !entries.length) {
    const withShot = chain([...combo, DOUBLE_LEG]);
    if (withShot) {
      combo = withShot;
      mixed = true;
    }
  }
  const names = combo.map((id) => resolveTechnique(id)?.koreanName || resolveTechnique(id)?.name || id);
  const name = names.join(' → ');
  const mitt = mittFor(combo, name, `오늘 수업에서 나온 기술 연결: ${lesson.title}`);
  if (!mitt) return null;
  const focus = resolveTechnique(combo[0])!;
  const mode = mixed ? 'mma_mix' : 'mitt';
  return {
    techniqueId: focus.id,
    mode,
    mitt,
    after: null,
    drill: null,
    timerSeconds: seconds,
    timerText: null,
    intro: combo.length > 1
      ? `오늘 수업에서 나온 기술을 묶어 ${name}를 Visualizing Mitt로 연습하겠습니다.${mixed ? ' MMA이므로 타격 뒤 테이크다운까지 이어서 칩니다.' : ''}`
      : `오늘 수업에서 나온 ${name}를 Visualizing Mitt로 연습하겠습니다.`,
    briefing: postureBriefing(focus, combo, mode),
  };
}
