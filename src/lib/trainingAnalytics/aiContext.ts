// Shared real-data context builder for every Gemini-backed feature that
// needs "what has this user actually done" (27단계 AI 훈련 분석, 29단계 AI
// Personal Combat Coach). One place assembles the context lines so both
// features stay in sync on what counts as real data and never diverge on
// what they claim exists — and neither ever sends anything beyond
// aggregated training numbers (no email, name, or user id; see each
// feature's own systemInstruction for the "don't invent" instruction).
import { computeTrainingReport } from './report';
import { computeAllSkillProgress, rankWeakness } from '../skillProgress/weaknessEngine';
import { getAllRecords } from '../poseAnalysis/recordsService';
import { listMyCombos } from '../combo/service';
import { listMyTactics } from '../tactic/service';
import { listMyActiveProgress } from '../curriculum/curriculumService';

export interface TrainingAiContext {
  contextLines: string[];
  hasAnyData: boolean;
}

export function buildTrainingAiContext(): TrainingAiContext {
  const report7d = computeTrainingReport('7d');
  const report30d = computeTrainingReport('30d');
  const skillEntries = computeAllSkillProgress();
  const weakness = rankWeakness(skillEntries, { limit: 5 });
  const poseRecords = getAllRecords();
  const combos = listMyCombos();
  const tactics = listMyTactics();
  const activeCurricula = listMyActiveProgress();

  const hasAnyData = report30d.totalMinutes > 0 || report30d.trainingDays > 0;

  const lines: string[] = [
    `최근 7일: 훈련 ${report7d.trainingDays}일, 총 ${report7d.totalMinutes}분, 완료 세트 ${report7d.completedSets}개`,
    `최근 30일: 훈련 ${report30d.trainingDays}일, 총 ${report30d.totalMinutes}분, 완료 세트 ${report30d.completedSets}개`,
  ];

  if (report30d.topTechniques.length > 0) {
    lines.push(`최근 30일 가장 많이 훈련한 기술: ${report30d.topTechniques.map((t) => `${t.name}(${t.count}회)`).join(', ')}`);
  }
  if (report30d.martialArtBreakdown.length > 0) {
    lines.push(`최근 30일 무술별 훈련 횟수: ${report30d.martialArtBreakdown.map((m) => `${m.nameKo} ${m.trainingCount}회`).join(', ')}`);
  }
  if (weakness.length > 0) {
    lines.push(`숙련도 분석 기준 상대적으로 부족한 기술: ${weakness.map((w) => w.techniqueName).join(', ')}`);
  }
  if (activeCurricula.length > 0) {
    lines.push(`진행 중인 커리큘럼: ${activeCurricula.map((c) => `${c.curriculum.title} (${c.progress.progress}% 완료)`).join(', ')}`);
  } else {
    lines.push('진행 중인 커리큘럼: 없음');
  }
  if (poseRecords.length > 0) {
    const avgScore = Math.round(poseRecords.reduce((sum, r) => sum + r.score, 0) / poseRecords.length);
    lines.push(`자세 분석 기록: 총 ${poseRecords.length}회, 평균 점수 ${avgScore}점`);
  }
  if (combos.length > 0) {
    lines.push(`콤보 기록: 총 ${combos.length}개 (${combos.map((c) => c.name).slice(0, 5).join(', ')})`);
  }
  if (tactics.length > 0) {
    lines.push(`전술 기록: 총 ${tactics.length}개 (${tactics.map((t) => t.name).slice(0, 5).join(', ')})`);
  }

  return { contextLines: lines, hasAnyData };
}
