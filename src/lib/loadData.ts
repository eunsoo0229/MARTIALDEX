import type { CuratedVideo, MartialArtFile, MartialArtSummary, Technique } from '../types';
import curatedVideosData from '../../data/curated/videos.json';
import { getPostureInfo } from './posture/postureConfig';
import { getDifficultyOverride } from './difficulty/difficultyConfig';
import { HOME_TRAINING_FILE, HOME_TRAINING_MARTIAL_ART_ID } from './homeTraining/library';
import { GYM_TRAINING_FILE, GYM_MARTIAL_ART_ID } from './gymTraining/library';

// Eagerly bundles every per-martial-art JSON produced by
// scripts/parse-techniques.mjs. Dropping a new file into data/processed
// (after adding a new .md to data/raw and re-running the parser) makes it
// show up here automatically — no code change needed.
const modules = import.meta.glob('../../data/processed/*.json', {
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

export const allTechniques: Technique[] = martialArtFiles.flatMap((f) => f.techniques);

const techniqueById = new Map<string, Technique>();
const techniquesByMartialArt = new Map<string, Technique[]>();
for (const file of martialArtFiles) {
  techniquesByMartialArt.set(file.martialArt.id, file.techniques);
  for (const t of file.techniques) techniqueById.set(t.id, t);
}

export const martialArtSummaries: MartialArtSummary[] = martialArtFiles.map((file) => {
  const categories = Array.from(new Set(file.techniques.map((t) => t.category)));
  const difficultyCounts: Record<string, number> = {};
  for (const t of file.techniques) {
    const key = t.difficulty ?? 'unknown';
    difficultyCounts[key] = (difficultyCounts[key] ?? 0) + 1;
  }
  return {
    ...file.martialArt,
    techniqueCount: file.techniques.length,
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
