import type { ProfileStatsInput } from '../profileStats/collectProfileStats';

export interface AchievementDef {
  id: string;
  icon: string;
  title: string;
  description: string;
  target: number;
  current: (stats: ProfileStatsInput) => number;
}

// Every condition reads directly off collectProfileStats()'s real counts —
// no achievement here can unlock without a genuine corresponding record
// (spec: "가짜 진행도를 만들지 않는다"). First 9 are the original spec
// examples; the 6 below (24단계) were added once combo/tactic/pose-analysis
// counts became available in ProfileStatsInput — same rule applies.
export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: 'first-technique-learned', icon: '🏆', title: '첫 번째 기술 학습', description: '기술을 1개 학습하면 달성됩니다.', target: 1, current: (s) => s.learnedCount },
  { id: 'first-curriculum-complete', icon: '🏆', title: '첫 커리큘럼 완료', description: '커리큘럼 하나를 끝까지 완료하면 달성됩니다.', target: 1, current: (s) => s.completedCurriculaCount },
  { id: 'first-sparring-analysis', icon: '🏆', title: '첫 스파링 분석', description: '스파링 영상 분석을 1회 완료하면 달성됩니다.', target: 1, current: (s) => s.sparringSessionCount },
  { id: 'ten-techniques-proficient', icon: '🏆', title: '10개 기술 숙련', description: '숙련 등급 기술을 10개 달성하면 얻습니다.', target: 10, current: (s) => s.proficientCount },
  { id: 'fifty-techniques-learned', icon: '🏆', title: '50개 기술 학습', description: '학습한 기술이 50개가 되면 달성됩니다.', target: 50, current: (s) => s.learnedCount },
  { id: 'ten-training-sessions', icon: '🏆', title: '10회 훈련', description: '훈련 세션을 10회 완료하면 달성됩니다.', target: 10, current: (s) => s.completedTrainingSessions },
  { id: 'ten-sparring-analyses', icon: '🏆', title: '10회 스파링 분석', description: '스파링 영상 분석을 10회 완료하면 달성됩니다.', target: 10, current: (s) => s.sparringSessionCount },
  { id: 'seven-day-streak', icon: '🏆', title: '7일 연속 학습', description: '7일 연속으로 훈련 기록을 남기면 달성됩니다.', target: 7, current: (s) => s.longestStreak },
  { id: 'first-style-curriculum-complete', icon: '🏆', title: '첫 목표 스타일 커리큘럼 완료', description: '목표 스타일 커리큘럼을 끝까지 완료하면 달성됩니다.', target: 1, current: (s) => s.completedStyleCurriculaCount },
  { id: 'iron-man', icon: '💪', title: '철인', description: '30일 연속으로 훈련 기록을 남기면 달성됩니다.', target: 30, current: (s) => s.longestStreak },
  { id: 'technique-explorer', icon: '🧭', title: '기술 탐험가', description: '5개 이상의 서로 다른 무술에서 기술을 학습하면 달성됩니다.', target: 5, current: (s) => s.distinctMartialArtsLearned },
  { id: 'analysis-master', icon: '🔬', title: '분석 마스터', description: 'AI 자세 분석을 30회 완료하면 달성됩니다.', target: 30, current: (s) => s.poseAnalysisCount },
  { id: 'ai-disciple', icon: '🤖', title: 'AI 수제자', description: '전술에 대한 AI 피드백을 5회 받으면 달성됩니다.', target: 5, current: (s) => s.tacticFeedbackCount },
  { id: 'combo-master', icon: '🥊', title: '콤보 마스터', description: '콤보 훈련을 10회 완료하면 달성됩니다.', target: 10, current: (s) => s.comboTrainingSessionCount },
  { id: 'tactician', icon: '🧩', title: '전략가', description: '나만의 전술을 5개 만들면 달성됩니다.', target: 5, current: (s) => s.tacticCount },
];
