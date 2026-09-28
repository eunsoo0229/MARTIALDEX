// Mirrors AiAskModal.tsx's own branching (technique+poseResult / technique /
// dayContext / fighterStyleContext / coach / none) — one value per distinct
// AI-question context the app already supports, never invented independently.
export type AiHistoryFeature = 'technique' | 'pose_analysis' | 'curriculum_day' | 'fighter_style' | 'coach' | 'global';

export const AI_HISTORY_FEATURE_LABEL: Record<AiHistoryFeature, string> = {
  technique: '기술 질문',
  pose_analysis: '자세 분석 질문',
  curriculum_day: '커리큘럼 Day 질문',
  fighter_style: '선수 스타일 질문',
  coach: 'AI 코치 질문',
  global: '일반 질문',
};

export interface AiQuestionHistoryEntry {
  id: string;
  feature: AiHistoryFeature;
  question: string;
  answer: string;
  relatedTechniqueId: string | null;
  relatedCurriculumId: string | null;
  createdAt: string;
}
