export interface CoachTechniqueRef {
  techniqueId: string;
  techniqueName: string;
}

export interface CoachRecommendation {
  generatedAt: string;
  priority: CoachTechniqueRef | null; // 우선 학습
  review: CoachTechniqueRef | null; // 복습
  newTechnique: CoachTechniqueRef | null; // 새로운 기술
  recommendedCurriculumDay: { curriculumId: string; curriculumTitle: string; day: number } | null;
  estimatedMinutes: number;
  reason: string;
  source: 'ai' | 'fallback';
}
