import type { Technique } from '../../types';
import { ESCAPE_RE, COUNTER_RE } from './intentClassifier';

/**
 * The axis GoalIntent (intentClassifier.ts) does NOT cover: how directly a
 * technique itself IS the thing the user asked about, vs. a supporting
 * skill someone would drill on the way to it. This is the missing piece
 * behind the "테이크다운의 다양성" bug — a goal like that resolves to
 * intents=['attack'] (or even []), and classifyTechniqueIntents() DEFAULTS
 * an unmatched technique to 'attack' too (see that file's doc comment), so
 * a generic technique like "Hand Fighting" gets the exact same intent tag —
 * and therefore the same 1.8x exact-match boost — as an actual named
 * takedown like "Ankle Pick". intentMultiplier alone can never fix this: it
 * only zeroes out OPPOSITE camps (offense vs defense), and "supporting
 * skill for an attack goal" is not opposite-camp, it's just not what was
 * asked for. This module adds that missing distinction as its own axis,
 * combined multiplicatively with (not replacing) the existing intent system
 * in techniqueMatcher.ts.
 */
export type TechniqueStructureRole =
  | 'primary_technique'
  | 'entry'
  | 'setup'
  | 'counter'
  | 'escape'
  | 'positional_skill'
  | 'movement'
  | 'conditioning'
  | 'general_fundamental';

export const STRUCTURE_ROLE_LABEL_KO: Record<TechniqueStructureRole, string> = {
  primary_technique: '핵심 기술',
  entry: '진입',
  setup: '셋업/그립',
  counter: '카운터',
  escape: '탈출',
  positional_skill: '포지션 스킬',
  movement: '기초 움직임',
  conditioning: '컨디셔닝',
  general_fundamental: '일반 기본기',
};

// Only used to demote a candidate's score when the goal explicitly asked
// for DIVERSITY within a technique topic (see diversity.ts's
// resolveDiversityRequested) — for every other goal (e.g. "초보자가
// 테이크다운을 배우기 위한 4주 커리큘럼", spec scenario B) these roles are
// exactly what SHOULD be included, so this weight table is never applied
// unconditionally. 1 = no penalty; lower = more heavily deprioritized, never
// zero — spec section 7 is explicit that these techniques are still useful,
// just lower priority, so they're never hard-excluded.
export const STRUCTURE_ROLE_WEIGHT: Record<TechniqueStructureRole, number> = {
  primary_technique: 1,
  entry: 0.55,
  setup: 0.45,
  counter: 0.5,
  escape: 0.5,
  positional_skill: 0.4,
  movement: 0.2,
  conditioning: 0.15,
  general_fundamental: 0.2,
};

// Named, well-known "supporting movement" techniques that different arts
// file under wildly inconsistent categories — BJJ in particular dumps
// Bridge/Hip Escape/Technical Stand-up into the same catch-all "기본 움직임과
// 연결 기술" category as genuine submission chains (per the real category
// list pulled from data/processed/bjj.json), so category text alone can't
// reliably catch them. Checking the technique's own NAME first is the only
// reliable signal — same design as intentClassifier.ts's NAME_DEFENSE_RE
// etc. These are exactly the names spec section 7 calls out by name.
const GENERAL_FUNDAMENTAL_NAME_RE = /핸드\s*파이팅|hand[\s-]?fighting|기본\s*자세|^wrestling\s*stance$|^stance$/i;
const MOVEMENT_NAME_RE = /브릿지|^bridge$|히프\s*이스케이프|hip[\s-]?escape|쉬림핑|shrimp(ing)?|움파|\bumpa\b|technical\s*stand[\s-]?up|테크니컬\s*스탠드업|풋워크|footwork/i;

// Category-only (never `positions`, which is noisy — many primary
// techniques carry a generic starting-position tag that would otherwise
// false-positive here) — grounded in the REAL category taxonomy read
// directly from data/processed/{wrestling,judo,bjj,sambo}.json, not guessed.
const GENERAL_FUNDAMENTAL_CATEGORY_RE = /기본\s*자세|핵심\s*원리|기초/;
const CONDITIONING_CATEGORY_RE = /컨디셔닝|체력/;
// "그립"/"그립 파이팅"/"균형 무너뜨리기" (kuzushi-equivalent off-balancing) —
// the setup work done BEFORE a named entry, not the entry itself.
const SETUP_CATEGORY_RE = /그립|셋업|페이크|피더링|균형\s*무너뜨리기|kumi\s*kata/i;
const ENTRY_CATEGORY_RE = /진입|전환|transition/i;
const POSITIONAL_SKILL_CATEGORY_RE = /포지션|position|홀드다운|누르기/;
// A category containing this always wins over a generic "진입"(entry) hit in
// the SAME category name — e.g. sambo's "테이크다운 진입 (레슬링 계열)" IS the
// takedown itself (진입 here describes HOW, not a separate prerequisite
// drill), and wrestling/bjj/judo file their actual named throws under
// "던지기"/"투사"/"테이크다운" category labels.
const PRIMARY_CATEGORY_OVERRIDE_RE = /테이크다운|takedown|던지기|투사|throw/i;

/**
 * Classifies a REAL technique's structural role relative to "is this the
 * thing itself, or a supporting skill for it" — no AI call, deterministic,
 * same design language as intentClassifier.ts's classifyTechniqueIntents().
 * Defaults to 'primary_technique' when nothing else matches (same "no
 * signal = assume it's the real named technique" philosophy that file
 * already uses for intent) — the fix here is that the generic-skill
 * categories are now checked explicitly FIRST, so they no longer fall
 * through to that same default the way they silently did as 'attack' intent
 * before this module existed.
 */
export function classifyTechniqueStructure(t: Pick<Technique, 'name' | 'category' | 'positions'>): TechniqueStructureRole {
  const name = t.name ?? '';
  const category = t.category ?? '';
  const labelText = [category, ...(t.positions ?? []), name].join(' ');

  if (GENERAL_FUNDAMENTAL_NAME_RE.test(name)) return 'general_fundamental';
  if (MOVEMENT_NAME_RE.test(name)) return 'movement';

  if (PRIMARY_CATEGORY_OVERRIDE_RE.test(category)) return 'primary_technique';

  // Reuses intentClassifier's exact escape/counter signal — one source of
  // truth for "이 기술은 탈출/카운터다" instead of a second regex pair that
  // could silently drift out of sync with it over time.
  if (ESCAPE_RE.test(labelText)) return 'escape';
  if (COUNTER_RE.test(labelText)) return 'counter';

  if (GENERAL_FUNDAMENTAL_CATEGORY_RE.test(category)) return 'general_fundamental';
  if (CONDITIONING_CATEGORY_RE.test(category)) return 'conditioning';
  if (SETUP_CATEGORY_RE.test(category)) return 'setup';
  if (ENTRY_CATEGORY_RE.test(category)) return 'entry';
  if (POSITIONAL_SKILL_CATEGORY_RE.test(category)) return 'positional_skill';

  return 'primary_technique';
}

/** Convenience — only demotes when `active` (the goal actually requested diversity); otherwise every candidate weighs the same as before this module existed (spec scenario B: fundamentals must NOT be demoted for a plain beginner curriculum). */
export function structureScoreMultiplier(role: TechniqueStructureRole, active: boolean): number {
  return active ? STRUCTURE_ROLE_WEIGHT[role] : 1;
}
