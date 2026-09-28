import type { GymBodyPart } from '../../types';

// A CLOSED, verified vocabulary — every key here was extracted directly from
// the 147-exercise dataset's 주요 근육/보조 근육 fields (see
// gymTraining/exercisesRaw.ts), not guessed or open-ended user text. This is
// real anatomical classification (which muscle belongs under which of the 12
// tracked body-part groups), not a string-matching heuristic — the same
// "grounded, not fabricated" bar this project holds curated content to
// elsewhere (posture.json, videos.json). Used only for SECONDARY-muscle
// partial-credit recovery attribution (gymTraining/recovery.ts) — primary
// attribution still uses the exercise's own structured gymBodyPart field
// directly, no text matching involved there.
const MUSCLE_TO_BODY_PART: Record<string, GymBodyPart> = {
  가슴: 'chest',
  대흉근: 'chest',
  상부: 'chest',
  하부: 'chest',
  등: 'back',
  광배근: 'back',
  능형근: 'back',
  대원근: 'back',
  승모근: 'back',
  어깨: 'shoulders',
  전면: 'shoulders',
  측면: 'shoulders',
  후면: 'shoulders',
  '전면 삼각근': 'shoulders',
  '측면 삼각근': 'shoulders',
  '후면 삼각근': 'shoulders',
  삼각근: 'shoulders',
  회전근개: 'shoulders',
  이두근: 'biceps',
  상완이두근: 'biceps',
  상완근: 'biceps',
  삼두근: 'triceps',
  상완삼두근: 'triceps',
  '상완삼두근 장두': 'triceps',
  전완근: 'forearms',
  '주변 전완근': 'forearms',
  상완요골근: 'forearms',
  '손가락 굴곡근': 'forearms',
  '손목 굴곡근': 'forearms',
  '손목 신전근': 'forearms',
  복근: 'abs',
  복직근: 'abs',
  복사근: 'abs',
  복횡근: 'abs',
  코어: 'abs',
  장요근: 'abs',
  둔근: 'glutes',
  대둔근: 'glutes',
  소둔근: 'glutes',
  중둔근: 'glutes',
  대퇴사두근: 'quads',
  내전근: 'quads',
  햄스트링: 'hamstrings',
  종아리: 'calves',
  비복근: 'calves',
  가자미근: 'calves',
  척추기립근: 'lower_back',
  허리: 'lower_back',
  심폐계: 'cardio',
  전신: 'full_body',
  하체: 'quads',
};

/**
 * Splits a raw 근육 field value (may be a single muscle, or a compound
 * string like "대퇴사두근, 둔근" / "복횡근 및 코어" / "등, 하체") into its
 * constituent body parts. Unrecognized tokens (e.g. "-" for "no secondary
 * muscle") are silently dropped rather than guessed.
 */
export function resolveBodyPartsForMuscleText(text: string): GymBodyPart[] {
  if (!text || text.trim() === '-') return [];
  const tokens = text
    .split(/[,、]|\s*및\s*|\s*그리고\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
  const parts = new Set<GymBodyPart>();
  for (const token of tokens) {
    const direct = MUSCLE_TO_BODY_PART[token];
    if (direct) {
      parts.add(direct);
      continue;
    }
    // Compound single-token strings like "상부 대흉근"/"하부 대흉근" — try
    // matching the longest known substring rather than the whole token.
    const match = Object.keys(MUSCLE_TO_BODY_PART)
      .filter((k) => token.includes(k))
      .sort((a, b) => b.length - a.length)[0];
    if (match) parts.add(MUSCLE_TO_BODY_PART[match]);
  }
  return Array.from(parts);
}

/** Every body part a technique's secondary muscles map to (deduped, excludes its own primary gymBodyPart). */
export function secondaryBodyPartsFor(secondaryMuscles: string[] | undefined, primary: GymBodyPart | undefined): GymBodyPart[] {
  if (!secondaryMuscles || secondaryMuscles.length === 0) return [];
  const all = resolveBodyPartsForMuscleText(secondaryMuscles.join(', '));
  return all.filter((p) => p !== primary);
}
