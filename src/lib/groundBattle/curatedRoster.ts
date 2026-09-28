import { getUnifiedAllTechniques } from '../userTechniques/service';
import type { CuratedGroundTechnique, PositionState } from './types';

// Hand-curated GAME-DESIGN metadata (success chances, stamina costs,
// category assignments, resulting positions this feature invents for
// balance) laid over REAL technique ids already in data/processed/bjj.json.
// Deliberately kept OUT of data/curated/ (unlike posture.json/difficulty.json,
// which are curated overlays of real-world facts about a technique) — this
// is game balance data, not a fact about the technique, so it's scoped
// entirely to this feature and never merged into the shared Technique
// object. Every `techniqueId` below must be a real, existing id — verified
// against the live data/processed/bjj.json before writing this file, and
// re-asserted at dev-time load below so a future data change that renames/
// removes one of these ids fails loudly instead of silently breaking the
// game.
//
// v1 scope: BJJ only (the only martial art in this DB with a real ground-
// position vocabulary). Standing/takedown techniques (스탠딩 / 테이크다운
// category, e.g. bjj__stand-up) are explicitly excluded — this feature is
// ground-only.
export const CURATED_GROUND_TECHNIQUES: CuratedGroundTechnique[] = [
  // ---- MOUNT (top) ----
  { techniqueId: 'bjj__high-mount', usableFrom: ['mount_top'], category: 'position', staminaCost: 5, baseSuccessChance: 0.8, onSuccess: { family: 'mount', actorRole: 'top' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__s-mount', usableFrom: ['mount_top'], category: 'position', staminaCost: 10, baseSuccessChance: 0.55, onSuccess: { family: 'mount', actorRole: 'top' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__gift-wrap', usableFrom: ['mount_top'], category: 'attack', staminaCost: 12, baseSuccessChance: 0.5, onSuccess: { family: 'mount', actorRole: 'top' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__s-mount-armbar', usableFrom: ['mount_top'], category: 'submission', staminaCost: 20, baseSuccessChance: 0.35, isSubmissionFinish: true, submissionProgressNeeded: 2 },
  { techniqueId: 'bjj__mounted-triangle', usableFrom: ['mount_top'], category: 'submission', staminaCost: 20, baseSuccessChance: 0.3, isSubmissionFinish: true, submissionProgressNeeded: 2 },
  { techniqueId: 'bjj__head-and-arm-choke', usableFrom: ['mount_top'], category: 'submission', staminaCost: 22, baseSuccessChance: 0.3, isSubmissionFinish: true, submissionProgressNeeded: 2 },
  { techniqueId: 'bjj__double-armbar', usableFrom: ['mount_top'], category: 'submission', staminaCost: 22, baseSuccessChance: 0.28, isSubmissionFinish: true, submissionProgressNeeded: 2 },
  { techniqueId: 'bjj__americana', usableFrom: ['mount_top', 'side_control_top'], category: 'submission', staminaCost: 18, baseSuccessChance: 0.35, isSubmissionFinish: true, submissionProgressNeeded: 2 },

  // ---- MOUNT (bottom) ----
  { techniqueId: 'bjj__bridge-and-roll-umpa', usableFrom: ['mount_bottom'], category: 'escape', staminaCost: 18, baseSuccessChance: 0.35, onSuccess: { family: 'guard', actorRole: 'bottom' }, onReversal: { family: 'mount', actorRole: 'top' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__elbow-knee-escape', usableFrom: ['mount_bottom'], category: 'escape', staminaCost: 15, baseSuccessChance: 0.4, onSuccess: { family: 'half_guard', actorRole: 'bottom' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__half-guard-recovery', usableFrom: ['mount_bottom', 'half_guard_bottom'], category: 'escape', staminaCost: 14, baseSuccessChance: 0.45, onSuccess: { family: 'half_guard', actorRole: 'bottom' }, isSubmissionFinish: false },

  // ---- SIDE CONTROL (top) ----
  { techniqueId: 'bjj__kesa-gatame', usableFrom: ['side_control_top'], category: 'position', staminaCost: 8, baseSuccessChance: 0.65, onSuccess: { family: 'side_control', actorRole: 'top' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__north-south-choke', usableFrom: ['side_control_top'], category: 'submission', staminaCost: 20, baseSuccessChance: 0.3, isSubmissionFinish: true, submissionProgressNeeded: 2 },
  { techniqueId: 'bjj__straight-armbar', usableFrom: ['side_control_top'], category: 'submission', staminaCost: 20, baseSuccessChance: 0.32, isSubmissionFinish: true, submissionProgressNeeded: 2 },
  { techniqueId: 'bjj__arm-triangle', usableFrom: ['side_control_top'], category: 'submission', staminaCost: 22, baseSuccessChance: 0.28, isSubmissionFinish: true, submissionProgressNeeded: 2 },

  // ---- SIDE CONTROL (bottom) ----
  { techniqueId: 'bjj__underhook-escape', usableFrom: ['side_control_bottom', 'knee_on_belly_bottom'], category: 'escape', staminaCost: 16, baseSuccessChance: 0.4, onSuccess: { family: 'half_guard', actorRole: 'bottom' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__hip-escape', usableFrom: ['side_control_bottom', 'half_guard_bottom', 'knee_on_belly_bottom'], category: 'escape', staminaCost: 14, baseSuccessChance: 0.42, onSuccess: { family: 'guard', actorRole: 'bottom' }, isSubmissionFinish: false },

  // ---- GUARD (bottom) ----
  { techniqueId: 'bjj__armbar', usableFrom: ['guard_bottom'], category: 'submission', staminaCost: 20, baseSuccessChance: 0.32, isSubmissionFinish: true, submissionProgressNeeded: 2 },
  { techniqueId: 'bjj__triangle', usableFrom: ['guard_bottom'], category: 'submission', staminaCost: 20, baseSuccessChance: 0.3, isSubmissionFinish: true, submissionProgressNeeded: 2 },
  { techniqueId: 'bjj__kimura', usableFrom: ['guard_bottom'], category: 'submission', staminaCost: 18, baseSuccessChance: 0.34, isSubmissionFinish: true, submissionProgressNeeded: 2 },
  { techniqueId: 'bjj__omoplata', usableFrom: ['guard_bottom'], category: 'submission', staminaCost: 20, baseSuccessChance: 0.28, isSubmissionFinish: true, submissionProgressNeeded: 2 },
  { techniqueId: 'bjj__scissor-sweep', usableFrom: ['guard_bottom'], category: 'attack', staminaCost: 15, baseSuccessChance: 0.4, onSuccess: { family: 'guard', actorRole: 'top' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__hip-bump-sweep', usableFrom: ['guard_bottom'], category: 'attack', staminaCost: 14, baseSuccessChance: 0.42, onSuccess: { family: 'guard', actorRole: 'top' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__wrist-control', usableFrom: ['guard_bottom'], category: 'defend', staminaCost: 6, baseSuccessChance: 0.7, onSuccess: { family: 'guard', actorRole: 'bottom' }, isSubmissionFinish: false },

  // ---- GUARD (top / passing) ----
  { techniqueId: 'bjj__knee-cut-pass', usableFrom: ['guard_top'], category: 'attack', staminaCost: 16, baseSuccessChance: 0.4, onSuccess: { family: 'side_control', actorRole: 'top' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__torreando-pass', usableFrom: ['guard_top'], category: 'attack', staminaCost: 16, baseSuccessChance: 0.38, onSuccess: { family: 'side_control', actorRole: 'top' }, isSubmissionFinish: false },

  // ---- HALF GUARD (bottom) ----
  { techniqueId: 'bjj__old-school-sweep', usableFrom: ['half_guard_bottom'], category: 'attack', staminaCost: 16, baseSuccessChance: 0.38, onSuccess: { family: 'half_guard', actorRole: 'top' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__electric-chair-sweep', usableFrom: ['half_guard_bottom'], category: 'attack', staminaCost: 16, baseSuccessChance: 0.35, onSuccess: { family: 'half_guard', actorRole: 'top' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__recover-full-guard', usableFrom: ['half_guard_bottom'], category: 'escape', staminaCost: 12, baseSuccessChance: 0.45, onSuccess: { family: 'guard', actorRole: 'bottom' }, isSubmissionFinish: false },

  // ---- HALF GUARD (top) ----
  { techniqueId: 'bjj__leg-drag', usableFrom: ['half_guard_top'], category: 'attack', staminaCost: 15, baseSuccessChance: 0.42, onSuccess: { family: 'side_control', actorRole: 'top' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__crossface', usableFrom: ['half_guard_top', 'side_control_top'], category: 'position', staminaCost: 8, baseSuccessChance: 0.6, onSuccess: { family: 'half_guard', actorRole: 'top' }, isSubmissionFinish: false },

  // ---- KNEE ON BELLY (top) ----
  { techniqueId: 'bjj__knee-on-belly-control', usableFrom: ['knee_on_belly_top'], category: 'position', staminaCost: 10, baseSuccessChance: 0.55, onSuccess: { family: 'knee_on_belly', actorRole: 'top' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__knee-on-belly-to-side-control', usableFrom: ['knee_on_belly_top'], category: 'position', staminaCost: 8, baseSuccessChance: 0.65, onSuccess: { family: 'side_control', actorRole: 'top' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__mount-transition', usableFrom: ['knee_on_belly_top'], category: 'attack', staminaCost: 14, baseSuccessChance: 0.45, onSuccess: { family: 'mount', actorRole: 'top' }, isSubmissionFinish: false },

  // ---- BACK CONTROL (top) ----
  { techniqueId: 'bjj__seatbelt', usableFrom: ['back_control_top'], category: 'position', staminaCost: 8, baseSuccessChance: 0.6, onSuccess: { family: 'back_control', actorRole: 'top' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__hooks', usableFrom: ['back_control_top'], category: 'position', staminaCost: 10, baseSuccessChance: 0.55, onSuccess: { family: 'back_control', actorRole: 'top' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__rear-naked-choke', usableFrom: ['back_control_top'], category: 'submission', staminaCost: 22, baseSuccessChance: 0.35, isSubmissionFinish: true, submissionProgressNeeded: 2 },
  { techniqueId: 'bjj__bow-and-arrow-choke', usableFrom: ['back_control_top'], category: 'submission', staminaCost: 20, baseSuccessChance: 0.3, isSubmissionFinish: true, submissionProgressNeeded: 2 },

  // ---- BACK CONTROL (bottom) ----
  { techniqueId: 'bjj__turn-in-escape', usableFrom: ['back_control_bottom'], category: 'escape', staminaCost: 18, baseSuccessChance: 0.32, onSuccess: { family: 'turtle', actorRole: 'bottom' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__shoulder-to-mat-escape', usableFrom: ['back_control_bottom'], category: 'escape', staminaCost: 16, baseSuccessChance: 0.3, onSuccess: { family: 'side_control', actorRole: 'bottom' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__bridge', usableFrom: ['back_control_bottom'], category: 'escape', staminaCost: 14, baseSuccessChance: 0.34, onSuccess: { family: 'turtle', actorRole: 'bottom' }, isSubmissionFinish: false },

  // ---- TURTLE (top) ----
  { techniqueId: 'bjj__breakdown', usableFrom: ['turtle_top'], category: 'attack', staminaCost: 14, baseSuccessChance: 0.45, onSuccess: { family: 'side_control', actorRole: 'top' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__clock-choke', usableFrom: ['turtle_top'], category: 'submission', staminaCost: 20, baseSuccessChance: 0.3, isSubmissionFinish: true, submissionProgressNeeded: 2 },
  { techniqueId: 'bjj__turtle-back-take', usableFrom: ['turtle_top'], category: 'attack', staminaCost: 16, baseSuccessChance: 0.4, onSuccess: { family: 'back_control', actorRole: 'top' }, isSubmissionFinish: false },

  // ---- TURTLE (bottom) ----
  { techniqueId: 'bjj__sit-out', usableFrom: ['turtle_bottom'], category: 'escape', staminaCost: 15, baseSuccessChance: 0.38, onSuccess: { family: 'guard', actorRole: 'bottom' }, isSubmissionFinish: false },
  { techniqueId: 'bjj__granby-roll', usableFrom: ['turtle_bottom'], category: 'escape', staminaCost: 18, baseSuccessChance: 0.3, onSuccess: { family: 'guard', actorRole: 'bottom' }, onReversal: { family: 'turtle', actorRole: 'top' }, isSubmissionFinish: false },
];

if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
  const allIds = new Set(getUnifiedAllTechniques().map((t) => t.id));
  for (const entry of CURATED_GROUND_TECHNIQUES) {
    if (!allIds.has(entry.techniqueId)) {
      throw new Error(`[groundBattle] curatedRoster references unknown technique id: ${entry.techniqueId}`);
    }
  }
}

const byId = new Map(CURATED_GROUND_TECHNIQUES.map((t) => [t.techniqueId, t]));

export function getCuratedTechnique(techniqueId: string): CuratedGroundTechnique | undefined {
  return byId.get(techniqueId);
}

export function getTechniquesForPosition(state: PositionState): CuratedGroundTechnique[] {
  return CURATED_GROUND_TECHNIQUES.filter((t) => t.usableFrom.includes(state));
}
