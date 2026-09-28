// QA-only stub: sportAnalysisProfiles.ts only needs this one constant from
// the real styleCurriculumService.ts. The real module transitively pulls in
// curriculumRepository.ts, which uses Vite's import.meta.glob() to load the
// official curriculum JSON files — a Vite-only feature esbuild can't run in
// plain Node. Aliased in ONLY for this test bundle (see qa-sport-profiles.mjs);
// the actual app always uses the real module.
export const STYLE_CURRICULUM_MARTIAL_ART = 'mma';
