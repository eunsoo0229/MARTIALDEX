// "AI 코치 수업" — a location-aware (집 / 체육관) coach curriculum built from
// what the user has already learned. Stored as an ordinary custom
// Curriculum (curriculum/types.ts) with the additive `aiCoachMeta` field and
// per-Day `coachPlan`, so it rides the existing curricula repository +
// Supabase `curricula` (data jsonb) sync, the Day list, "혼자 하기" and the
// AI 코치 Day session unchanged — no new table.

/** home = 집, gym = 체육관, limited = 기타 장소 (사무실·야외·숙소처럼 공간·장비가 제한된 곳). */
export type CoachLocation = 'home' | 'gym' | 'limited';

/** What each step of a coach Day is for — ordered review → connection → application → new, wrapped by warm-up/conditioning drills. */
export type CoachPlanRole = 'warmup' | 'review' | 'connection' | 'application' | 'new' | 'conditioning';

export interface CoachPlanItem {
  /** A real MARTIALDEX id: combat technique, or a home-training / gym exercise for drills. */
  techniqueId: string;
  role: CoachPlanRole;
  /** For 'connection': the learned technique this one is chained with. */
  linkedTechniqueId: string | null;
  /** How to do it HERE (location-specific), one or two sentences. */
  instruction: string;
  minutes: number;
  needsPartner: boolean;
  /** Equipment this step uses (labels from location.ts). Unconfirmed equipment always comes with soloAlternative. */
  equipment: string[];
  /** What to do instead when the partner/equipment isn't available. */
  soloAlternative: string | null;
}

export interface AiCoachCurriculumMeta {
  location: CoachLocation;
  /** Equipment ids the user confirmed at setup (location.ts). Anything else is treated as unknown, never assumed. */
  equipment: string[];
  goal: string;
  sessionMinutes: number;
  generatedAt: string;
  source: 'ai' | 'fallback';
  summary: string;
  /** Things the coach still needs the user to confirm (e.g. "샌드백을 쓸 수 있나요?"). */
  equipmentQuestions: string[];
  /** Mastery of each learned technique the plan was built from — lets the UI show what the plan was based on. */
  learnedSnapshot: { techniqueId: string; status: string }[];
}
