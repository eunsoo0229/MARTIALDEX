import type { Technique } from '../../types';
import type { GoalAnalysis, GoalIntent, GoalTechniqueMatch } from './types';
import type { MasteryStatus } from '../skillProgress/types';
// searchAllTechniques/resolveTechniquesByIds (not the official-only
// searchTechniques/getTechniquesByIds) so a phrase can match — and a match
// can resolve to — a technique already in the shared add_teq library or
// this user's own user_techniques, not just the 1,253 official ones.
import { searchAllTechniques, resolveTechniquesByIds, resolveTechnique } from '../userTechniques/service';
import { discoverTechnique } from '../techniqueDiscovery/service';
import { classifyPhase } from '../fighterStyle/phaseClassifier';
import { classifyTechniqueIntents, intentMultiplier, isOppositeCamp, techniqueCamps } from './intentClassifier';
import { classifyTechniqueStructure, structureScoreMultiplier, type TechniqueStructureRole } from './structureClassifier';
import { MMA_MARTIAL_ART_ID, MMA_SOURCE_MARTIAL_ARTS } from '../mmaCurriculum/types';

// MMA_MARTIAL_ART_ID ('mma') is a synthetic pseudo-id — no real technique's
// martialArt field is ever set to it, so discoverTechnique's own duplicate
// search (which filters candidates by exact martialArt match) would always
// see zero candidates and mint a fresh "mma__..." id instead of matching an
// already-real wrestling/mixed-martial-arts technique. Same fix already
// applied in aiCombo/stepResolver.ts.
const REAL_MMA_MARTIAL_ART_ID = 'mixed-martial-arts';

// Reweights a matched technique by the user's actual mastery of it: a
// technique they've never done or are struggling with is exactly what a
// curriculum should teach, so it's boosted; one they're already
// 'proficient' at is de-prioritized (not excluded — it can still show up
// for connection/refresher) so it doesn't crowd out genuinely new content.
// Missing from the map (technique never analyzed) is treated as neutral.
const MASTERY_RELEVANCE_MULTIPLIER: Record<MasteryStatus, number> = {
  not_started: 1.15,
  learning: 1.1,
  needs_improvement: 1.25,
  average: 1.0,
  proficient: 0.55,
};

// MMA (martialArt === MMA_MARTIAL_ART_ID) has no single real martial-art id
// to filter searchTechniques by — it's a curriculum drawing on several real
// arts at once (spec's own mapping: boxing→striking, wrestling→takedown,
// bjj→ground/submission, etc.). Searching unscoped and post-filtering to
// just the real MMA-relevant arts reuses the exact same search index/ranking
// every other martial art already goes through here — no parallel matching
// logic, no fabricated "mma" techniques.
function searchForMartialArt(phrase: string, limit: number, martialArt: string) {
  if (martialArt !== MMA_MARTIAL_ART_ID) return searchAllTechniques(phrase, limit, { martialArt });
  return searchAllTechniques(phrase, limit * 3).filter((t) => MMA_SOURCE_MARTIAL_ARTS.includes(t.martialArt)).slice(0, limit);
}

// Same weighted-search-rank approach as fighterStyle/techniqueMatcher.ts,
// re-parameterized for GoalAnalysis's fields instead of a style analysis's.
// desiredTechniques/weaknesses are weighted highest per spec section 10
// ("부족한 부분 집중 비율을 높인다") — a weakness phrase pulling in more
// real techniques naturally grows that phase's day budget later in
// curriculumPlanner.ts's capacity-based redistribution.
const FIELD_WEIGHTS: { field: keyof GoalAnalysis; weight: number; label: string }[] = [
  { field: 'desiredTechniques', weight: 45, label: '원하는 기술' },
  { field: 'weaknesses', weight: 38, label: '부족한 부분' },
  { field: 'goals', weight: 30, label: '훈련 목표' },
  { field: 'desiredStyle', weight: 22, label: '원하는 스타일' },
];

const MIN_RELEVANCE = 15;
// Under an active diversity request, a candidate that isn't itself the
// requested category (i.e. anything other than 'primary_technique' —
// grips/setups/positional control/generic movement) needs a real,
// multi-phrase-backed score to earn a spot, not just enough to clear the
// same floor a genuine takedown would. This is the fix for the exact
// reported bug: 67/68 candidates reported to the user as "낮음(<40)" were
// still being scheduled into the curriculum because MIN_RELEVANCE(15) was
// far below that reporting threshold — nothing actually enforced it.
const MIN_RELEVANCE_NON_PRIMARY_WHEN_DIVERSITY = 40;
function minRelevanceFor(structureRole: TechniqueStructureRole, diversityRequested: boolean): number {
  if (diversityRequested && structureRole !== 'primary_technique') return MIN_RELEVANCE_NON_PRIMARY_WHEN_DIVERSITY;
  return MIN_RELEVANCE;
}
// Raised from 60: this cap was silently trimming the candidate pool well
// below what longer curricula (60/90/180일) need, which was a direct cause
// of the "AI가 생성하는 기술 수가 너무 적다" complaint — planGoalCurriculum
// already caps real day-count by each phase's actual pool size, so a larger
// candidate pool here only ever helps long curricula have enough real
// content; it never forces extra days into short ones.
const MAX_MATCHES = 140;
const SEARCH_LIMIT_PER_PHRASE = 6;

function priorityBoost(phrase: string, priority: string[]): number {
  const idx = priority.findIndex((p) => p.toLowerCase() === phrase.toLowerCase());
  if (idx === -1) return 1;
  return [1.5, 1.35, 1.2, 1.1][idx] ?? 1.05;
}

/**
 * Turns GoalAnalysis's free-text phrases into real Martialdex technique
 * matches, scoped to ONE martial art (unlike fighterStyle's cross-art
 * matcher — a goal curriculum is always for the single art the user
 * picked). A phrase that matches nothing contributes no techniques —
 * nothing here is invented; relevanceScore is a deterministic sum, never
 * random.
 */
export function matchGoalToTechniques(
  analysis: GoalAnalysis,
  martialArt: string,
  masteryByTechniqueId?: Map<string, MasteryStatus>
): GoalTechniqueMatch[] {
  const scoreById = new Map<string, number>();
  const reasonPartsById = new Map<string, Set<string>>();

  for (const { field, weight, label } of FIELD_WEIGHTS) {
    const phrases = analysis[field];
    if (!Array.isArray(phrases)) continue;
    for (const phrase of phrases) {
      if (typeof phrase !== 'string' || !phrase.trim()) continue;
      const boost = priorityBoost(phrase, analysis.priority);
      const results = searchForMartialArt(phrase, SEARCH_LIMIT_PER_PHRASE, martialArt);
      results.forEach((t, rank) => {
        const masteryMult = masteryByTechniqueId ? MASTERY_RELEVANCE_MULTIPLIER[masteryByTechniqueId.get(t.id) ?? 'average'] : 1;
        const contribution = weight * boost * masteryMult * (1 - rank * 0.15);
        if (contribution <= 0) return;
        scoreById.set(t.id, (scoreById.get(t.id) ?? 0) + contribution);
        if (!reasonPartsById.has(t.id)) reasonPartsById.set(t.id, new Set());
        reasonPartsById.get(t.id)!.add(`${label}("${phrase}")`);
      });
    }
  }

  const techniques = resolveTechniquesByIds([...scoreById.keys()]);
  const byId = new Map(techniques.map((t) => [t.id, t]));

  // Applied AFTER the phrase-relevance score and BEFORE the MIN_RELEVANCE
  // cut — this is the fix for the "테이크다운 방어"-matches-"Double Leg"
  // problem: a plain keyword search can't tell an offensive entry apart
  // from a defensive one (both mention "테이크다운"), but the technique's
  // own category/positions data already can (see intentClassifier.ts).
  const goalIntents = analysis.intents ?? [];

  // Only demotes when the goal explicitly asked for topic-breadth (spec
  // section 6/7) — see structureClassifier.ts's doc comment for exactly why
  // this is a SEPARATE axis from intentMultiplier above: that one only
  // catches offense-vs-defense conflicts, not "this is a supporting skill,
  // not the technique itself" (e.g. Hand Fighting/Bridge/Hip Escape, which
  // classify as 'attack'/'fundamentals' intent — same camp as a real
  // takedown — and so sailed straight through the existing filter).
  const diversityRequested = analysis.diversityRequested === true;
  // Spec section 4: when the goal spans both camps at once ("상대 압박 대응"
  // + "내가 밀고 들어가는 공격"), a 'counter'/'escape'-role technique (Sprawl,
  // Whizzer, Crossface...) IS the primary content for the counter/opponent-
  // pressure branch — demoting it the same way a plain single-camp
  // diversity goal demotes generic supporting skills would silently erase
  // that whole requested branch. See fallbackTechniquePool's identical
  // reasoning/comment for why this is scoped to dualCampGoal specifically.
  const goalCampSetForWeighting = techniqueCamps(goalIntents);
  const dualCampGoal = diversityRequested && goalCampSetForWeighting.has('offense') && goalCampSetForWeighting.has('defensive');

  const matches: GoalTechniqueMatch[] = [];
  for (const [techniqueId, baseScore] of scoreById.entries()) {
    const technique = byId.get(techniqueId);
    if (!technique) continue; // must resolve to a real technique — never fabricated
    const techIntents = classifyTechniqueIntents(technique);
    const structureRole = classifyTechniqueStructure(technique);
    const weightingRole = dualCampGoal && (structureRole === 'counter' || structureRole === 'escape') ? 'primary_technique' : structureRole;
    const rawScore = baseScore * intentMultiplier(goalIntents, techIntents) * structureScoreMultiplier(weightingRole, diversityRequested);
    if (rawScore < minRelevanceFor(weightingRole, diversityRequested)) continue;
    const reasons = [...(reasonPartsById.get(techniqueId) ?? [])].slice(0, 2).join(', ');
    matches.push({
      techniqueId,
      techniqueName: technique.name,
      martialArt: technique.martialArt,
      relevanceScore: Math.round(Math.min(100, rawScore)),
      reason: reasons ? `${reasons}와 관련성이 있음` : '입력하신 목표와 관련성이 있음',
      phase: classifyPhase(technique),
      structureRole,
    });
  }

  matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return matches.slice(0, MAX_MATCHES);
}

/**
 * Fallback pool for when the user's text yields too few matches to build a
 * real curriculum (spec section 6/17 — never invent techniques, but also
 * never fail outright just because the free text was sparse). Pulls a
 * spread of real techniques for the chosen martial art across difficulty
 * levels, weighted toward beginner content, which is always a safe default.
 */
export function fallbackTechniquePool(
  martialArt: string,
  level: string,
  options?: { masteryByTechniqueId?: Map<string, MasteryStatus>; limit?: number; intents?: GoalIntent[]; diversityRequested?: boolean; excludeLearned?: boolean }
): GoalTechniqueMatch[] {
  const diffRank: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 };
  const targetRank = diffRank[level] ?? 0;
  const masteryByTechniqueId = options?.masteryByTechniqueId;
  const limit = options?.limit ?? 40;
  const intents = options?.intents ?? [];
  const diversityRequested = options?.diversityRequested === true;
  // "이미 학습한 기술 커리큘럼에 넣지 않기" (spec section 10/11) — must hold for
  // this DB-wide padding pool too, not just the phrase-matched pool in
  // matchGoalToTechniques; otherwise service.ts's exclusion filter would be
  // silently undone the moment the pool needed a top-up.
  const excludeLearned = options?.excludeLearned === true;
  // Empty-query search has no relevance ranking to lean on (it just returns
  // corpus order), so an unscoped call for MMA would silently favor whatever
  // real art happens to sit first in the corpus. Pulling an even slice from
  // EACH real MMA-source art keeps the fallback pool balanced across
  // striking/clinch/takedown/ground content instead.
  const unfilteredPool =
    martialArt === MMA_MARTIAL_ART_ID
      ? MMA_SOURCE_MARTIAL_ARTS.flatMap((art) => searchAllTechniques('', Math.ceil(limit / MMA_SOURCE_MARTIAL_ARTS.length) + 5, { martialArt: art }))
      : searchAllTechniques('', limit + 20, { martialArt });

  // This is the fix for the reported bug's actual root cause: this pool is
  // PADDING for when real phrase-matches ran short — under a diversity
  // request, padding a "테이크다운 다양성" curriculum with Collar Tie/Wrist
  // Control/Overhook just to reach `limit` is exactly the "67 low-relevance
  // candidates → curriculum anyway" failure. Roles other than the requested
  // category's own primary techniques (plus their direct entries/counters/
  // escapes, still clearly ON the technique itself) are HARD-EXCLUDED from
  // this padding pool — never merely reordered/deprioritized like
  // byMasteryThenDifficulty below does for the intent-camp case. If that
  // leaves fewer than `limit` real candidates, the pool simply comes back
  // smaller (service.ts's poolShortfall/insufficientContent already reports
  // this honestly) rather than backfilling with generic supporting content.
  const DIVERSITY_ALLOWED_ROLES = new Set<TechniqueStructureRole>(['primary_technique', 'entry', 'counter', 'escape']);
  const diversityFilteredPool = diversityRequested ? unfilteredPool.filter((t) => DIVERSITY_ALLOWED_ROLES.has(classifyTechniqueStructure(t))) : unfilteredPool;
  const rawPool = excludeLearned
    ? diversityFilteredPool.filter((t) => (masteryByTechniqueId?.get(t.id) ?? 'not_started') === 'not_started')
    : diversityFilteredPool;

  // Spec section 4: when the goal genuinely spans both camps (e.g. "상대가
  // 밀고 들어올 때 카운터" + "내가 밀고 들어가는 공격"), a 'counter'/'escape'-
  // structural-role technique (Sprawl, Whizzer, Crossface, Re-Single...) IS
  // the primary content for the counter/opponent-pressure branch — treating
  // it as generic "supporting skill" (the STRUCTURE_ROLE_WEIGHT demotion
  // structureClassifier.ts applies for a single-camp diversity goal) would
  // wrongly suppress exactly the content this specific branch needs. Scoped
  // to dualCampGoal ONLY — a plain "테이크다운 다양성" goal (single camp) must
  // keep demoting these as supporting content, unchanged from before.
  const goalCampSet = techniqueCamps(intents);
  const dualCampGoal = diversityRequested && goalCampSet.has('offense') && goalCampSet.has('defensive');

  function byMasteryThenDifficulty(a: Technique, b: Technique): number {
    // Already-'proficient' techniques sort last — the fallback pool exists
    // to fill a curriculum with genuinely NEW content, so a technique the
    // user has already mastered should only be used once nothing else is
    // left, never crowd out unmastered ones.
    const pa = masteryByTechniqueId?.get(a.id) === 'proficient' ? 1 : 0;
    const pb = masteryByTechniqueId?.get(b.id) === 'proficient' ? 1 : 0;
    if (pa !== pb) return pa - pb;
    // Under an active diversity request, this top-up pool should still
    // favor primary/named techniques over generic supporting-skill filler
    // (same STRUCTURE_ROLE_WEIGHT table matchGoalToTechniques uses) — a
    // narrow "테이크다운의 다양성" goal that needed a fallback top-up must not
    // have that top-up itself be full of Bridge/Hand Fighting-style content.
    if (diversityRequested) {
      const sa = structureScoreMultiplier(classifyTechniqueStructure(a), true);
      const sb = structureScoreMultiplier(classifyTechniqueStructure(b), true);
      if (sa !== sb) return sb - sa;
    }
    const da = Math.abs((diffRank[a.difficulty ?? 'beginner'] ?? 0) - targetRank);
    const db = Math.abs((diffRank[b.difficulty ?? 'beginner'] ?? 0) - targetRank);
    return da - db;
  }

  // A goal with a clear intent (e.g. "테이크다운 방어") must not have this
  // top-up silently flood the pool back up with the opposite camp just to
  // hit `limit` — same-camp/neutral techniques always fill first. The cap
  // on opposite-camp filler is applied PER SCHEDULING PHASE (fundamentals/
  // entries/position/connection — the same bucket curriculumPlanner.ts uses
  // to allocate each Day), not as one global count: a goal like "마운트
  // 탈출" has essentially zero on-topic content in the 'entries' phase
  // bucket (all real escape techniques classify as 'position'), so a flat
  // global cap let opposite-camp grip/entry techniques completely fill —
  // and front-load — that phase's Days even though barely any of it was
  // relevant. Capping per phase instead means a phase with no real on-topic
  // content gets only a trickle of filler (so its capacity correctly stays
  // low and curriculumPlanner.ts's existing overflow redistribution shifts
  // those Days to phases that actually have relevant content), while a
  // phase that already has decent on-topic content can still take a
  // proportional amount of supporting filler.
  //
  // When genuinely on-topic content is scarce overall (e.g. wrestling's
  // ~30 defense/counter/escape/fundamentals techniques out of 189), the
  // final pool can still land below `limit` — that's fine (it surfaces as
  // more review days later, a reasonable outcome for a narrow, repetition-
  // heavy training goal); it is never acceptable to paper over the
  // shortfall with attack-camp filler when the user asked for defense.
  let pool: Technique[];
  if (intents.length > 0) {
    const preferred: Technique[] = [];
    const deprioritized: Technique[] = [];
    for (const t of rawPool) (isOppositeCamp(intents, classifyTechniqueIntents(t)) ? deprioritized : preferred).push(t);
    preferred.sort(byMasteryThenDifficulty);
    deprioritized.sort(byMasteryThenDifficulty);

    // Spec section 4: a goal spanning BOTH camps at once (e.g. intents=
    // ['counter','attack'] for "상대 압박 대응" + "내가 밀고 들어가는 공격")
    // must not have one camp silently crowd out the other. This pool's own
    // final score formula is purely POSITIONAL (`65 - index`, see below) —
    // without camp-balancing here, whichever camp happens to sort first
    // (e.g. because its real techniques are lower difficulty) claims every
    // high-scoring slot, and the other camp's real candidates land past
    // index 25-30 where the score formula drops them under the strict >=40
    // gate service.ts applies — i.e. one whole requested branch silently
    // disappears even though real matching techniques for it exist in the
    // Martialdex data. Interleaving round-robin guarantees both camps reach
    // the high-scoring front of the pool.
    if (dualCampGoal) {
      const offenseList: Technique[] = [];
      const defensiveList: Technique[] = [];
      const neutralList: Technique[] = [];
      for (const t of preferred) {
        const camps = techniqueCamps(classifyTechniqueIntents(t));
        if (camps.has('offense') && !camps.has('defensive')) offenseList.push(t);
        else if (camps.has('defensive') && !camps.has('offense')) defensiveList.push(t);
        else neutralList.push(t);
      }
      const interleaved: Technique[] = [];
      const maxLen = Math.max(offenseList.length, defensiveList.length);
      for (let i = 0; i < maxLen; i++) {
        if (offenseList[i]) interleaved.push(offenseList[i]);
        if (defensiveList[i]) interleaved.push(defensiveList[i]);
      }
      interleaved.push(...neutralList);
      preferred.length = 0;
      preferred.push(...interleaved);
    }

    // Counts only EXACT intent matches per phase (not "any non-opposite"
    // technique) — a phase bucket can contain plenty of merely-neutral
    // content (fundamentals/connection techniques with no specific intent
    // match) without that content actually being ON TOPIC for this goal.
    // BJJ's "기본 움직임과 연결 기술" category, for instance, shares its
    // 'connection' phase bucket with actual submission finishes (per
    // phaseClassifier.ts's own keyword design) — if merely-neutral content
    // in that bucket were allowed to justify a large filler cap, attack-
    // camp submissions would ride in alongside it even for an escape goal.
    const exactMatchCountByPhase = new Map<string, number>();
    for (const t of preferred) {
      if (!classifyTechniqueIntents(t).some((ti) => intents.includes(ti))) continue;
      const phase = classifyPhase(t);
      exactMatchCountByPhase.set(phase, (exactMatchCountByPhase.get(phase) ?? 0) + 1);
    }
    const takenByPhase = new Map<string, number>();
    const cappedDeprioritized = deprioritized.filter((t) => {
      const phase = classifyPhase(t);
      const onTopicInPhase = exactMatchCountByPhase.get(phase) ?? 0;
      // A phase with ZERO genuinely on-topic content gets ZERO filler, not
      // a floor — curriculumPlanner.ts already handles an empty phase pool
      // gracefully (capacity naturally rounds to 0, Days just never get
      // scheduled from it), so there's no need to force in off-camp
      // content just to avoid an empty bucket.
      const cap = Math.ceil(onTopicInPhase * 0.5);
      const takenSoFar = takenByPhase.get(phase) ?? 0;
      if (takenSoFar >= cap) return false;
      takenByPhase.set(phase, takenSoFar + 1);
      return true;
    });
    pool = [...preferred, ...cappedDeprioritized];
  } else {
    pool = [...rawPool].sort(byMasteryThenDifficulty);
  }
  // The old flat `Math.max(15, 40 - i)` capped EVERY fallback item under 40
  // regardless of role, which meant a genuinely relevant primary technique
  // pulled from this pool could never register as "high/medium relevance"
  // in the UI even when it deserved to — and, combined with the old
  // lack of role filtering above, was indistinguishable from actual filler.
  // Now that non-primary roles are hard-excluded when diversityRequested
  // (see DIVERSITY_ALLOWED_ROLES above), a primary technique from this pool
  // can score up to the 60s; anything still non-primary here (only possible
  // when diversityRequested is false) stays capped low, same as before.
  return pool.slice(0, limit).map((t, i) => {
    const structureRole = classifyTechniqueStructure(t);
    // See the dualCampGoal comment above the interleave block: under a
    // dual-camp goal, 'counter'/'escape' IS the primary content for the
    // counter/opponent-pressure branch, not generic supporting material —
    // scoring it with the same low-ceiling formula as Collar Tie/Wrist
    // Control would make it structurally impossible to ever clear the
    // strict >=40 gate service.ts applies, silently erasing that entire
    // requested branch (the exact bug this fix addresses).
    const isPrimaryForThisGoal = structureRole === 'primary_technique' || (dualCampGoal && (structureRole === 'counter' || structureRole === 'escape'));
    const relevanceScore = isPrimaryForThisGoal ? Math.max(35, 65 - i) : Math.max(15, 35 - i);
    return {
      techniqueId: t.id,
      techniqueName: t.name,
      martialArt: t.martialArt,
      relevanceScore,
      reason: '기본 커리큘럼 구성을 위한 기본 기술',
      phase: classifyPhase(t),
      structureRole,
    };
  });
}

/**
 * `desiredTechniques` phrases are the highest-signal field GoalAnalysis
 * has — the user named these literally, so they are exactly where spec
 * section 8's "공식 기술에 없으면 반드시 Discovery Service를 호출한다" applies.
 * Only runs for a phrase that the main matchGoalToTechniques() pass did
 * NOT already cite in any match's reason — a phrase the fuzzy search
 * already matched decently must never trigger a second, wasteful AI
 * duplicate-check call just because it wasn't an EXACT-name hit (spec
 * section 10/23's anti-waste requirement); discoverTechnique() is only
 * worth its own cost for phrases genuinely unresolved so far.
 */
export async function discoverMissingDesiredTechniques(
  desiredTechniques: string[],
  martialArt: string,
  userId: string | null,
  existingMatches: GoalTechniqueMatch[],
  goalIntents: GoalIntent[] = []
): Promise<GoalTechniqueMatch[]> {
  const discovered: GoalTechniqueMatch[] = [];
  for (const phrase of desiredTechniques) {
    if (typeof phrase !== 'string' || !phrase.trim()) continue;
    const alreadyMatched = existingMatches.some((m) => m.reason.includes(`("${phrase}")`));
    if (alreadyMatched) continue;
    const targetMartialArt = martialArt === MMA_MARTIAL_ART_ID ? REAL_MMA_MARTIAL_ART_ID : martialArt;
    const outcome = await discoverTechnique({ name: phrase, martialArt: targetMartialArt, userId });
    if (!outcome.techniqueId) continue;
    const technique = resolveTechnique(outcome.techniqueId);
    if (!technique) continue; // must resolve to a real technique — never fabricated
    // A phrase this function processes was, by definition, NOT already
    // matched by matchGoalToTechniques — for an opposite-camp technique
    // (e.g. "Armbar" surfacing here for a "마운트 탈출" goal), that's
    // usually because matchGoalToTechniques correctly zeroed it out, not
    // because it was genuinely missing from the library. Re-adding it here
    // at a flat relevanceScore of 90 would silently undo that filtering —
    // this recovery path exists for techniques the user explicitly wants
    // that need registering, not as a backdoor around intent scoring.
    if (isOppositeCamp(goalIntents, classifyTechniqueIntents(technique))) continue;
    discovered.push({
      techniqueId: technique.id,
      techniqueName: technique.name,
      martialArt: technique.martialArt,
      relevanceScore: 90,
      reason:
        outcome.status === 'existing'
          ? `원하는 기술("${phrase}")과 관련성이 있음`
          : `원하는 기술("${phrase}")을 새로 발견해 등록함 — ${outcome.reason}`,
      phase: classifyPhase(technique),
      structureRole: classifyTechniqueStructure(technique),
      videoAttached: outcome.status !== 'existing' ? outcome.videoAttached : undefined,
    });
  }
  return discovered;
}
