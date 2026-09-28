import type { PoseAnalysisRecord, PoseAnalysisResult, TechniqueSkillSummary } from './types';
import { poseRecordsRepository } from './recordsRepository';
import { getTechnique } from '../loadData';


function newRecordId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function saveAnalysisResult(martialArtId: string, result: PoseAnalysisResult): PoseAnalysisRecord {
  const record: PoseAnalysisRecord = {
    recordId: newRecordId(),
    techniqueId: result.techniqueId,
    martialArtId,
    score: result.overallScore,
    status: result.status,
    metricScores: Object.fromEntries(result.metricScores.map((m) => [m.id, m.score])),
    analyzedAt: new Date().toISOString(),
  };
  poseRecordsRepository.add(record);
  return record;
}

export function getRecordsForTechnique(techniqueId: string): PoseAnalysisRecord[] {
  return poseRecordsRepository.listForTechnique(techniqueId).sort((a, b) => a.analyzedAt.localeCompare(b.analyzedAt));
}

export function getAllRecords(): PoseAnalysisRecord[] {
  return poseRecordsRepository.list();
}

function computeSummaryFromRecords(techniqueId: string, records: PoseAnalysisRecord[]): TechniqueSkillSummary {
  if (records.length === 0) {
    return {
      techniqueId,
      status: 'not_analyzed',
      latestScore: null,
      bestScore: null,
      averageScore: null,
      firstScore: null,
      analysisCount: 0,
      lastAnalyzedAt: null,
      scoreDelta: null,
    };
  }
  const sorted = [...records].sort((a, b) => a.analyzedAt.localeCompare(b.analyzedAt));
  const scores = sorted.map((r) => r.score);
  const latest = sorted[sorted.length - 1];
  return {
    techniqueId,
    status: latest.status,
    latestScore: latest.score,
    bestScore: Math.max(...scores),
    averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    firstScore: sorted[0].score,
    analysisCount: sorted.length,
    lastAnalyzedAt: latest.analyzedAt,
    scoreDelta: latest.score - sorted[0].score,
  };
}

export function getTechniqueSkillSummary(techniqueId: string): TechniqueSkillSummary {
  return computeSummaryFromRecords(techniqueId, poseRecordsRepository.listForTechnique(techniqueId));
}

/**
 * Batch variant for computeAllSkillProgress() — groups an already-fetched
 * full records list (getAllRecords(), read ONCE) by techniqueId in a single
 * pass, instead of every technique independently calling
 * listForTechnique()/readAll() (which re-parses the entire pose-records
 * blob from scratch per technique — an N+1 that was a top CPU bottleneck
 * profiled in the packaged app).
 */
export function buildSkillSummaryIndex(allRecords: PoseAnalysisRecord[]): Map<string, PoseAnalysisRecord[]> {
  const byTechnique = new Map<string, PoseAnalysisRecord[]>();
  for (const record of allRecords) {
    const list = byTechnique.get(record.techniqueId);
    if (list) list.push(record);
    else byTechnique.set(record.techniqueId, [record]);
  }
  return byTechnique;
}

export function getTechniqueSkillSummaryFromIndex(techniqueId: string, index: Map<string, PoseAnalysisRecord[]>): TechniqueSkillSummary {
  return computeSummaryFromRecords(techniqueId, index.get(techniqueId) ?? []);
}

export function deleteRecord(recordId: string): void {
  poseRecordsRepository.deleteRecord(recordId);
}

export function deleteAllRecordsForTechnique(techniqueId: string): void {
  poseRecordsRepository.deleteForTechnique(techniqueId);
}

export function deleteAllRecords(): void {
  poseRecordsRepository.deleteAll();
}

export interface ExportedRecord {
  techniqueId: string;
  techniqueName: string;
  martialArtId: string;
  score: number;
  status: string;
  metricScores: Record<string, number>;
  analyzedAt: string;
}

/** JSON export payload — structured results only, never camera footage. */
export function buildExportPayload(): { exportedAt: string; version: 1; records: ExportedRecord[] } {
  const records = getAllRecords().map((r) => ({
    techniqueId: r.techniqueId,
    techniqueName: getTechnique(r.techniqueId)?.name ?? r.techniqueId,
    martialArtId: r.martialArtId,
    score: r.score,
    status: r.status,
    metricScores: r.metricScores,
    analyzedAt: r.analyzedAt,
  }));
  return { exportedAt: new Date().toISOString(), version: 1, records };
}
