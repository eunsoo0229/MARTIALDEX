// Bundled by qa-sport-profiles.mjs via esbuild — a thin re-export surface
// so the QA script can exercise the real pipeline functions in plain Node
// (no Electron/browser globals needed by anything reachable from these).
export { SPORT_ANALYSIS_PROFILES, applySportProfile, getSportAnalysisProfile } from '../src/lib/sparringAnalysis/sportAnalysisProfiles';
export { computeOverallScores, computeWeakAreas } from '../src/lib/sparringAnalysis/scoringEngine';
export { MOTION_EVENT_LABEL } from '../src/lib/sparringAnalysis/types';
