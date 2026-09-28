import type { Technique } from '../../types';
import type { GoalAnalysis, GoalIntent } from './types';

// Data-driven, martial-art-agnostic: real technique records already encode
// this distinction in category/positions (e.g. wrestling's "방어"/"리샷 /
// 카운터"/"탈출 (Escape)" categories, boxing's "방어"/"카운터", BJJ's "탈출
// 기술 모음" secondary tag on Mount escapes) — this module reuses that
// existing data instead of inventing a parallel classification scheme.
const VALID_INTENTS: GoalIntent[] = ['attack', 'defense', 'escape', 'counter', 'connection', 'fundamentals'];

const DEFENSE_RE = /방어|디펜스|디펜시브|프레임/;
// "회복" (recovery, e.g. 가드 회복/포지션 회복) — a Korean-named escape
// technique's OWN signal often lives only in its name, not its category:
// BJJ files many recovery/escape techniques under a generic umbrella
// category ("기본 움직임과 연결 기술") that says nothing about escape at all.
// Exported so structureClassifier.ts can reuse the exact same escape/counter
// signal instead of a second, potentially-drifting regex pair — see that
// file's classifyTechniqueStructure().
export const ESCAPE_RE = /탈출|이스케이프|회복/;
export const COUNTER_RE = /카운터|리버설/;
const CONNECTION_RE = /연결|연계|전환|콤보|콤비네이션|조합|체인/;
// Deliberately NOT matching bare "거리" — it collides with 장거리/중거리/
// 근거리 ("long/mid/close range") category names, which label specific
// attacking techniques organized by range, not fundamentals.
const FUNDAMENTALS_RE = /기본|풋워크|스탠스|이동|균형|그립|자세/;
const ATTACK_RE = /공격/;

const NAME_DEFENSE_RE = /\b(defense|defence)\b/i;
const NAME_ESCAPE_RE = /\bescape\b/i;
const NAME_COUNTER_RE = /\b(counter|reversal)\b/i;

/**
 * Classifies a REAL technique's own training-intent(s) from its existing
 * category/positions/name — no AI call, deterministic, never invents a new
 * taxonomy field. A technique with none of the recognized defense/escape/
 * counter/connection/fundamentals signals defaults to 'attack' (matches the
 * spec's "공격용 진입 기술" bucket — Double Leg/Single Leg/Snap Down-style
 * specific offensive techniques never carry an explicit label of their own,
 * so "no defensive signal at all" is itself the offense signal).
 *
 * The Korean keyword checks scan `name` too, not just category/positions —
 * a technique's category is often a generic positional umbrella (BJJ's
 * "기본 움직임과 연결 기술" covers both genuine escapes like "마운트 탈출"
 * and neutral movement drills alike), while the technique's own NAME is
 * frequently the only place the real defense/escape/counter signal shows up.
 */
export function classifyTechniqueIntents(t: Pick<Technique, 'name' | 'category' | 'positions'>): GoalIntent[] {
  const labelText = [t.category, ...t.positions, t.name].join(' ');
  const found = new Set<GoalIntent>();
  if (DEFENSE_RE.test(labelText) || NAME_DEFENSE_RE.test(t.name)) found.add('defense');
  if (ESCAPE_RE.test(labelText) || NAME_ESCAPE_RE.test(t.name)) found.add('escape');
  if (COUNTER_RE.test(labelText) || NAME_COUNTER_RE.test(t.name)) found.add('counter');
  if (CONNECTION_RE.test(labelText)) found.add('connection');
  if (FUNDAMENTALS_RE.test(labelText)) found.add('fundamentals');
  if (ATTACK_RE.test(labelText)) found.add('attack');
  if (found.size === 0) found.add('attack');
  return [...found];
}

// The two intent "camps" that can genuinely conflict. connection/fundamentals
// are treated as neutral bridge content — useful regardless of whether the
// goal is offense- or defense-leaning, so they're never penalized either way.
const INTENT_CAMP: Record<GoalIntent, 'offense' | 'defensive' | 'neutral'> = {
  attack: 'offense',
  defense: 'defensive',
  escape: 'defensive',
  counter: 'defensive',
  connection: 'neutral',
  fundamentals: 'neutral',
};

/** Exported so curriculumPlanner.ts can group days by camp for a dual-camp goal (spec section 4's "OPPONENT_PRESSURE/counter vs MY_PRESSURE/offensive — do not merge") without duplicating this table. */
export function techniqueCamps(techIntents: GoalIntent[]): Set<'offense' | 'defensive' | 'neutral'> {
  return new Set(techIntents.map((i) => INTENT_CAMP[i]));
}

/**
 * Deterministic multiplier applied on top of the existing phrase-relevance
 * score in techniqueMatcher.ts. Exact intent match scores highest, same-camp
 * (e.g. goal=counter, technique=defense — both "defensive camp") gets a
 * smaller boost, and anything else (including a goal with no clear intent)
 * is left unchanged.
 *
 * Opposite-camp (goal=escape, technique=attack) is a HARD ZERO, not just a
 * discount: a phrase like "마운트" naturally matches every mount-related
 * technique regardless of camp, including submissions whose category is
 * literally "마운트 (Mount)" — a single such phrase can accumulate enough
 * raw phrase-relevance score (summed across weaknesses/goals/priority all
 * repeating the same word) that even a steep discount (previously 0.2x)
 * still cleared MIN_RELEVANCE, letting Armbar/Triangle/Kimura leak into a
 * "마운트 탈출" curriculum. Zeroing it out here is safe because the
 * separate, deliberately bounded residual-content allowance already lives
 * in fallbackTechniquePool's per-phase capped top-up — this function's job
 * is just to stop keyword coincidence from overriding stated intent.
 */
export function intentMultiplier(goalIntents: GoalIntent[], techIntents: GoalIntent[]): number {
  if (goalIntents.length === 0 || techIntents.length === 0) return 1;
  if (techIntents.some((ti) => goalIntents.includes(ti))) return 1.8;
  const goalCamps = new Set(goalIntents.map((i) => INTENT_CAMP[i]));
  const techCamps = new Set(techIntents.map((i) => INTENT_CAMP[i]));
  // A goal that genuinely spans BOTH camps at once (e.g. intents=
  // ['attack','counter'] for "상대가 밀고 들어올 때 카운터 + 내가 밀고
  // 들어가는 공격") legitimately wants content from both — without this
  // guard, goalCamps ends up {offense, defensive} and the hard-zero below
  // would fire for ANY single-camp technique that isn't an exact intent
  // match (e.g. a pure 'defense'-camp Sprawl gets zeroed even though it's
  // exactly the "opponent pressure" branch being asked for), self-defeating
  // the entire premise of a dual-camp request. The hard zero is only for
  // protecting a SINGLE-camp goal from the opposite camp leaking in.
  const goalSpansBothCamps = goalCamps.has('offense') && goalCamps.has('defensive');
  if (!goalSpansBothCamps && ((goalCamps.has('offense') && techCamps.has('defensive')) || (goalCamps.has('defensive') && techCamps.has('offense')))) {
    return 0;
  }
  if ([...techCamps].some((c) => c !== 'neutral' && goalCamps.has(c))) return 1.4;
  return 1;
}

/** True when a technique's own intent camp directly conflicts with the goal's — used to hard-exclude from the fallback top-up pool and as the trigger for the post-generation re-match safety net in service.ts. */
export function isOppositeCamp(goalIntents: GoalIntent[], techIntents: GoalIntent[]): boolean {
  return intentMultiplier(goalIntents, techIntents) < 1;
}

const TEXT_INTENT_PATTERNS: Record<GoalIntent, RegExp> = {
  defense: /방어|디펜스|디펜시브|막아|막는|막을|못하게|defen[cs]e/i,
  escape: /탈출|이스케이프|escape/i,
  counter: /카운터|역공|맞대응|리버설|counter|reversal/i,
  attack: /공격|피니시|서브미션|타격|finish|submission|offense|attack/i,
  connection: /연계|연결|전환|콤보|콤비네이션|조합|체인\s*레슬링|chain\s*wrestling|combo|combination|transition/i,
  fundamentals: /기본기|기초|자세|풋워크|움직임|포지셔닝|stance|footwork|fundamentals?|\bbasic\b/i,
};
const INTENT_SCAN_ORDER: GoalIntent[] = ['defense', 'escape', 'counter', 'attack', 'connection', 'fundamentals'];

/** Pure keyword fallback — only used when Gemini's own `intents` output is missing/empty (see resolveGoalIntents). Deliberately simple and testable without an AI call. */
export function classifyIntentsFromText(text: string): GoalIntent[] {
  return INTENT_SCAN_ORDER.filter((intent) => TEXT_INTENT_PATTERNS[intent].test(text));
}

/**
 * Sanitizes Gemini's `intents` output (drops anything outside the known
 * enum) and, if that leaves nothing usable, derives intent from the raw
 * free text + the rest of the analysis via the deterministic keyword
 * classifier above. Always call this once right after analyzeGoal() and use
 * the result everywhere downstream — never re-derive intent in more than
 * one place.
 */
export function resolveGoalIntents(
  analysis: Pick<GoalAnalysis, 'intents' | 'summary' | 'goals' | 'weaknesses' | 'desiredTechniques'>,
  freeText: string
): GoalIntent[] {
  const raw = Array.isArray(analysis.intents) ? analysis.intents.filter((i): i is GoalIntent => VALID_INTENTS.includes(i)) : [];
  if (raw.length > 0) return [...new Set(raw)];
  const combined = [freeText, analysis.summary, ...analysis.goals, ...analysis.weaknesses, ...analysis.desiredTechniques].join(' ');
  return classifyIntentsFromText(combined);
}
