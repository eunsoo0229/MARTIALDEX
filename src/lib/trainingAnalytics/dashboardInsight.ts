import { computeTrainingReport, type TrainingReport } from './report';

// Deliberately NOT a Gemini call — this is a one-line, purely-derived
// insight for the Dashboard (28단계 section 6's own example — "이번 주
// 가장 많이 훈련한 기술은 Jab입니다" — is trivially true from real counts
// already computed by computeTrainingReport, no AI needed). Triggering a
// network call on every Dashboard load would fight the stage's own
// performance requirement; the deeper Gemini-backed analysis (27단계) stays
// an explicit, on-demand "AI 분석 받기" action on the Training Analytics
// page, linked from here instead of duplicated.
export function computeDashboardInsight(report: TrainingReport = computeTrainingReport('7d')): string | null {
  if (report.topTechniques.length > 0) {
    return `이번 주 가장 많이 훈련한 기술은 ${report.topTechniques[0].name}입니다.`;
  }
  if (report.trainingDays > 0) {
    return `이번 주 ${report.trainingDays}일 동안 훈련했습니다.`;
  }
  return null;
}
