import type { CuratedVideo, MartialArtFile, MartialArtSummary, Technique } from '../types';
import curatedVideosData from '../../data/curated/videos.json';
import canonicalData from '../../data/curated/technique-canonical.json';
import { mergeTechniqueGroup } from './techniqueCanonical/merge';
import { getPostureInfo } from './posture/postureConfig';
import { getDifficultyOverride } from './difficulty/difficultyConfig';
import { HOME_TRAINING_FILE, HOME_TRAINING_MARTIAL_ART_ID } from './homeTraining/library';
import { GYM_TRAINING_FILE, GYM_MARTIAL_ART_ID } from './gymTraining/library';

// Eagerly bundles every per-martial-art JSON produced by
// scripts/parse-techniques.mjs. Dropping a new file into data/processed
// (after adding a new .md to data/raw and re-running the parser) makes it
// show up here automatically — no code change needed.
// _all.json (every art again, 1.7 MB) and _meta.json are parser outputs the app never reads —
// excluded HERE (negative glob) so they're not bundled; filtering at runtime still shipped them.
const modules = import.meta.glob(['../../data/processed/*.json', '!../../data/processed/_*.json'], {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

const curatedVideos = curatedVideosData as Record<string, CuratedVideo[]>;

const martialArtFiles: MartialArtFile[] = Object.entries(modules)
  .filter(([path]) => !path.endsWith('_all.json') && !path.endsWith('_meta.json'))
  .map(([, mod]) => mod as MartialArtFile)
  .sort((a, b) => a.martialArt.nameKo.localeCompare(b.martialArt.nameKo, 'ko'));

// Hand-curated videos (data/curated/videos.json, see CURATION.md there)
// live outside the step-2 parser's output so `npm run parse` never
// overwrites the curation work. Merged in here, once, at load time.
for (const file of martialArtFiles) {
  for (const t of file.techniques) {
    t.videos = curatedVideos[t.id] ?? [];
    // Same merge pattern, one line down: a technique with no curated posture
    // entry gets `undefined` (not a fabricated empty object) so the UI can
    // tell "no data yet" apart from "data says nothing" (see postureConfig.ts).
    t.posture = getPostureInfo(t.id);
    // Same merge rule as posture — only ever fills a gap the parser itself
    // left null, never overrides a value scripts/parse-techniques.mjs
    // already set from the raw source.
    if (t.difficulty == null) {
      const override = getDifficultyOverride(t.id);
      if (override) t.difficulty = override;
    }
  }
}

// ---- Canonical techniques (data/curated/technique-canonical.json) ----
// The same real technique filed as separate records (BJJ + Wrestling
// "Granby Roll", BJJ "Knee Cut" + "Knee Cut Pass") becomes ONE technique
// linked to every art it belongs to. Every member id keeps resolving to it
// through techniqueById, so nothing that stored an old id (curricula,
// training history, mastery overrides, video picks, pose records) breaks.
// Built by scripts/build-technique-canonical.mjs from reviewed groups; the
// raw/processed files are untouched.
interface CanonicalGroup {
  canonicalId: string;
  members: string[];
}
const officialById = new Map<string, Technique>();
for (const file of martialArtFiles) for (const t of file.techniques) officialById.set(t.id, t);
const canonicalByMember = new Map<string, Technique>();
const noBorrowedKoreanName = new Set((canonicalData as { noBorrowedKoreanName?: string[] }).noBorrowedKoreanName ?? []);
for (const g of (canonicalData as { groups: CanonicalGroup[] }).groups) {
  const members = g.members.map((id) => officialById.get(id)).filter((t): t is Technique => !!t);
  const primary = officialById.get(g.canonicalId);
  if (!primary || members.length < 2) continue;
  const merged = mergeTechniqueGroup(primary, members);
  if (noBorrowedKoreanName.has(merged.id) && !primary.koreanName) merged.koreanName = null;
  for (const m of members) canonicalByMember.set(m.id, merged);
}
for (const [id, aliases] of Object.entries((canonicalData as { extraAliases?: Record<string, string[]> }).extraAliases ?? {})) {
  const t = canonicalByMember.get(id) ?? officialById.get(id);
  if (t) t.aliases = [...new Set([...t.aliases, ...aliases])];
}
// ---- Technique-relation audit (technique-canonical.json v2) ----
// splits: a record that listed several techniques on one line is replaced in
// every list by the techniques it names (existing ones linked, missing ones
// created below). artLinks: a technique gains an art it is really used in.
// The split record's own id keeps resolving (legacy), it is just not listed.
interface RelationData {
  splits?: { id: string; parts: { id: string; link: boolean; moveVideos?: string[] }[] }[];
  newTechniques?: { id: string; martialArt: string; name: string; koreanName: string | null; category: string; positions: string[]; description: string; sourceIds: string[]; siblings: string[]; videoIds: string[] }[];
  artLinks?: { canonicalId: string; martialArt: string; category: string }[];
  notTechniques?: { id: string; reason: string }[];
  videoMoves?: { videoId: string; from: string; to: string }[];
}
const relations = canonicalData as RelationData;
const resolveOfficial = (id: string): Technique | undefined => newTechniqueById.get(id) ?? canonicalByMember.get(id) ?? officialById.get(id);
const newTechniqueById = new Map<string, Technique>();
const artNameEn = new Map(martialArtFiles.map((f) => [f.martialArt.id, f.martialArt.nameEn ?? f.martialArt.id]));
for (const n of relations.newTechniques ?? []) {
  const src = officialById.get(n.sourceIds[0]);
  const fromSource = (src?.videos ?? []).filter((v) => n.videoIds.includes(v.videoId));
  const own = curatedVideos[n.id] ?? [];
  newTechniqueById.set(n.id, {
    id: n.id,
    martialArt: n.martialArt,
    name: n.name,
    koreanName: n.koreanName,
    aliases: [],
    category: n.category,
    positions: n.positions,
    description: n.description,
    purpose: null,
    principles: [],
    variations: [],
    counters: [],
    defenses: [],
    transitions: [],
    relatedTechniques: n.siblings,
    relatedMartialArts: [],
    difficulty: getDifficultyOverride(n.id) ?? null,
    tags: [`martialArt:${n.martialArt}`, ...(src?.tags.filter((tag) => tag.startsWith('category:')) ?? []), `#${n.name}`],
    youtubeSearchQuery: `${artNameEn.get(n.martialArt) ?? n.martialArt} ${n.name} technique`,
    videos: [...own, ...fromSource.filter((v) => !own.some((o) => o.videoId === v.videoId))],
    posture: getPostureInfo(n.id),
    splitFrom: n.sourceIds,
  });
}
const splitPartsById = new Map<string, string[]>();
for (const sp of relations.splits ?? []) {
  const src = officialById.get(sp.id);
  if (!src) continue;
  const partIds = [...new Set(sp.parts.map((p) => resolveOfficial(p.id)?.id).filter((id): id is string => !!id))];
  splitPartsById.set(sp.id, partIds);
  src.splitInto = partIds;
  for (const p of sp.parts) {
    const target = p.link ? resolveOfficial(p.id) : undefined;
    if (!target || !p.moveVideos?.length) continue;
    for (const v of src.videos.filter((x) => p.moveVideos!.includes(x.videoId))) if (!target.videos.some((x) => x.videoId === v.videoId)) target.videos.push(v);
  }
}
const notTechniqueIds = new Set((relations.notTechniques ?? []).map((n) => n.id));
for (const n of relations.notTechniques ?? []) {
  const t = officialById.get(n.id);
  if (t) t.notTechnique = n.reason;
}
const linksByArt = new Map<string, Technique[]>();
for (const l of relations.artLinks ?? []) {
  const t = resolveOfficial(l.canonicalId);
  if (!t) continue;
  const arts = t.martialArts ?? [t.martialArt];
  if (!arts.includes(l.martialArt)) {
    t.martialArts = [...arts, l.martialArt];
    t.categoryByArt = { ...(t.categoryByArt ?? { [t.martialArt]: t.category }), [l.martialArt]: t.categoryByArt?.[l.martialArt] ?? l.category };
    if (!t.relatedMartialArts.includes(l.martialArt) && l.martialArt !== t.martialArt) t.relatedMartialArts = [...t.relatedMartialArts, l.martialArt];
    if (!t.tags.includes(`martialArt:${l.martialArt}`)) t.tags = [...t.tags, `martialArt:${l.martialArt}`];
  }
  linksByArt.set(l.martialArt, [...(linksByArt.get(l.martialArt) ?? []), t]);
}
for (const m of relations.videoMoves ?? []) {
  const from = resolveOfficial(m.from);
  const to = resolveOfficial(m.to);
  const v = from?.videos.find((x) => x.videoId === m.videoId);
  if (!from || !to || !v) continue;
  from.videos = from.videos.filter((x) => x.videoId !== m.videoId);
  if (!to.videos.some((x) => x.videoId === m.videoId)) to.videos.push(v);
}

/** Official records split by the relation audit ("Lead Teep / Rear Teep") — not listed as techniques, but a user's old history/mastery on one is still theirs. */
export function splitLegacyTechniques(): Technique[] {
  return [...splitPartsById.keys()].map((id) => officialById.get(id)).filter((t): t is Technique => !!t);
}

/** Ids as stored → the techniques they name: a split record's id becomes the ids of the techniques it was split into. */
export function expandSplitTechniqueIds(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) for (const x of splitPartsById.get(id) ?? [id]) if (!out.includes(x)) out.push(x);
  return out;
}

// relatedTechniques may point at a merged-away id — re-point at the canonical one.
const canonicalIdOf = (id: string) => canonicalByMember.get(id)?.id ?? id;
for (const file of martialArtFiles) for (const t of file.techniques) t.relatedTechniques = [...new Set(t.relatedTechniques.map(canonicalIdOf))].filter((id) => id !== t.id);
for (const t of new Set(canonicalByMember.values())) t.relatedTechniques = [...new Set(t.relatedTechniques.map(canonicalIdOf))].filter((id) => id !== t.id);

/**
 * One entry per canonical technique (merged-away records removed). A split
 * record is replaced in place by the techniques it names; a heading record is
 * dropped; `extra` (techniques linked to this art without a record of their
 * own there) is appended.
 */
function canonicalList(list: Technique[], extra: Technique[] = []): Technique[] {
  const seen = new Set<string>();
  const out: Technique[] = [];
  const push = (c: Technique) => {
    if (seen.has(c.id)) return;
    seen.add(c.id);
    out.push(c);
  };
  for (const t of list) {
    if (notTechniqueIds.has(t.id)) continue;
    const parts = splitPartsById.get(t.id);
    if (parts) {
      for (const id of parts) {
        const c = resolveOfficial(id);
        if (c) push(c);
      }
      continue;
    }
    push(canonicalByMember.get(t.id) ?? t);
  }
  for (const c of extra) push(c);
  return out;
}

export const allTechniques: Technique[] = canonicalList(martialArtFiles.flatMap((f) => f.techniques));

const techniqueById = new Map<string, Technique>();
const techniquesByMartialArt = new Map<string, Technique[]>();
for (const file of martialArtFiles) {
  // An art lists every canonical technique linked to it, once.
  techniquesByMartialArt.set(file.martialArt.id, canonicalList(file.techniques, linksByArt.get(file.martialArt.id)));
  for (const t of file.techniques) techniqueById.set(t.id, canonicalByMember.get(t.id) ?? t);
}
for (const t of newTechniqueById.values()) techniqueById.set(t.id, t);
for (const t of allTechniques) techniqueById.set(t.id, t);

/** The category a technique has within one art (a merged technique can be filed differently per art). */
export function categoryInArt(t: Technique, martialArtId: string): string {
  return t.categoryByArt?.[martialArtId] ?? t.category;
}

/** The canonical id for any official technique id (a merged-away id → its canonical technique's id). */
export function canonicalOfficialId(id: string): string {
  return canonicalByMember.get(id)?.id ?? id;
}

export const martialArtSummaries: MartialArtSummary[] = martialArtFiles.map((file) => {
  const techniques = techniquesByMartialArt.get(file.martialArt.id) ?? [];
  const categories = Array.from(new Set(techniques.map((t) => categoryInArt(t, file.martialArt.id))));
  const difficultyCounts: Record<string, number> = {};
  for (const t of techniques) {
    const key = t.difficulty ?? 'unknown';
    difficultyCounts[key] = (difficultyCounts[key] ?? 0) + 1;
  }
  return {
    ...file.martialArt,
    techniqueCount: techniques.length,
    categories,
    difficultyCounts,
  };
});

const martialArtById = new Map(martialArtSummaries.map((m) => [m.id, m]));

// Home-training exercises (src/lib/homeTraining/library.ts) are DELIBERATELY
// kept out of `allTechniques`/`martialArtSummaries` — they're not one of the
// 9 real combat martial arts, and several existing features iterate those
// two exports assuming every entry is a combat technique (e.g. the "무술
// 기술 백과사전" total-count copy on Home.tsx, and — critically — every
// `martialArt === 'mma' ? {} : { martialArt }`-style unscoped MMA candidate
// pool in situationRecommend/sparringAnalysis, which would otherwise start
// surfacing e.g. a home "Squat" drill as a live sparring-situation
// recommendation). They ARE added to `techniqueById`/`techniquesByMartialArt`
// so the one universal resolver (`resolveTechnique`, userTechniques/service.ts)
// finds them everywhere it's already used (curriculum days, today's training,
// technique detail pages, training history) with zero changes to any of
// that code. `getMartialArt('home-training')` is wired to resolve too (via
// this Map, populated below) so labels/breadcrumbs render "홈트" instead of
// the raw id — see also getUnifiedMartialArt in userTechniques/service.ts,
// which MartialArtDetail.tsx actually calls and needed the same special-case.
export const homeTrainingExercises: Technique[] = HOME_TRAINING_FILE.techniques;
techniquesByMartialArt.set(HOME_TRAINING_MARTIAL_ART_ID, homeTrainingExercises);
for (const t of homeTrainingExercises) techniqueById.set(t.id, t);
martialArtById.set(HOME_TRAINING_MARTIAL_ART_ID, {
  ...HOME_TRAINING_FILE.martialArt,
  techniqueCount: homeTrainingExercises.length,
  categories: Array.from(new Set(homeTrainingExercises.map((t) => t.category))),
  difficultyCounts: homeTrainingExercises.reduce<Record<string, number>>((acc, t) => {
    const key = t.difficulty ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {}),
});

// Gym/weight-training exercises (src/lib/gymTraining/library.ts) follow the
// exact same "synthetic martial art, kept out of allTechniques" pattern as
// home-training above — same reasoning, same registration shape. One
// deliberate difference: gym exercises are NOT added to search.ts's
// searchCorpus (see that file's comment) since their only "description"
// content is derived from structured fields, not curated per-exercise
// instruction like home-training's hand-authored posture data.
export const gymExercises: Technique[] = GYM_TRAINING_FILE.techniques;
techniquesByMartialArt.set(GYM_MARTIAL_ART_ID, gymExercises);
for (const t of gymExercises) techniqueById.set(t.id, t);
martialArtById.set(GYM_MARTIAL_ART_ID, {
  ...GYM_TRAINING_FILE.martialArt,
  techniqueCount: gymExercises.length,
  categories: Array.from(new Set(gymExercises.map((t) => t.category))),
  difficultyCounts: gymExercises.reduce<Record<string, number>>((acc, t) => {
    const key = t.difficulty ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {}),
});

/**
 * Every synthetic (non-combat) martial-art id registered above — currently
 * home-training and gym. Generalizes what used to be individual
 * `martialArt === HOME_TRAINING_MARTIAL_ART_ID` guards at every unfiltered
 * "search the whole corpus" call site (situationRecommend/candidatePool.ts,
 * sparringAnalysis/{techniqueHypothesis,sparringToCurriculum}.ts,
 * SparringResultView.tsx, skillProgress/weaknessEngine.ts) so a 3rd synthetic
 * domain, if one is ever added, only needs one line added to the Set below —
 * zero changes at any guard site.
 */
export const SYNTHETIC_TRAINING_MARTIAL_ART_IDS: ReadonlySet<string> = new Set([
  HOME_TRAINING_MARTIAL_ART_ID,
  GYM_MARTIAL_ART_ID,
]);

export function isSyntheticTrainingDomain(martialArtId: string | null | undefined): boolean {
  return !!martialArtId && SYNTHETIC_TRAINING_MARTIAL_ART_IDS.has(martialArtId);
}

export function getMartialArt(id: string): MartialArtSummary | undefined {
  return martialArtById.get(id);
}

export function getTechnique(id: string): Technique | undefined {
  return techniqueById.get(id);
}

export function getTechniquesByMartialArt(martialArtId: string): Technique[] {
  return techniquesByMartialArt.get(martialArtId) ?? [];
}

export function getTechniquesByIds(ids: string[]): Technique[] {
  return ids.map((id) => techniqueById.get(id)).filter((t): t is Technique => Boolean(t));
}

export const totalTechniqueCount = allTechniques.length;
