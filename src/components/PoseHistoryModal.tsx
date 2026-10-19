import { useState } from 'react';
import type { Technique } from '../types';
import { useTechniqueRecords, useTechniqueSkillSummary } from '../lib/poseAnalysis/usePoseRecords';
import { deleteAllRecordsForTechnique, deleteRecord } from '../lib/poseAnalysis/recordsService';
import { STATUS_ICON, STATUS_LABEL } from '../lib/poseAnalysis/scoring';
import ScoreHistoryChart from './ScoreHistoryChart';
import { listCompareRecords } from '../lib/formCompare/referenceStore';

export default function PoseHistoryModal({ technique, onClose }: { technique: Technique; onClose: () => void }) {
  const records = useTechniqueRecords(technique.id);
  const summary = useTechniqueSkillSummary(technique.id);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleDeleteAll() {
    if (!window.confirm(`"${technique.name}"의 분석 기록 ${records.length}개를 모두 삭제할까요? 되돌릴 수 없습니다.`)) return;
    deleteAllRecordsForTechnique(technique.id);
  }

  function handleDeleteOne(recordId: string) {
    if (!window.confirm('이 분석 기록을 삭제할까요? 되돌릴 수 없습니다.')) return;
    deleteRecord(recordId);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel pose-modal" onClick={(e) => e.stopPropagation()}>
        <h3>📊 {technique.name} 분석 기록</h3>

        {records.length === 0 ? (
          <p className="video-status-message">아직 이 기술을 분석한 기록이 없습니다.</p>
        ) : (
          <>
            <div className="curriculum-stat-row">
              <div>
                <strong>{summary.latestScore}</strong>
                <span>최근 점수</span>
              </div>
              <div>
                <strong>{summary.bestScore}</strong>
                <span>최고 점수</span>
              </div>
              <div>
                <strong>{summary.averageScore}</strong>
                <span>평균 점수</span>
              </div>
              <div>
                <strong>{summary.analysisCount}회</strong>
                <span>분석 횟수</span>
              </div>
            </div>
            {summary.scoreDelta !== null && summary.analysisCount > 1 && (
              <p className="video-status-message" style={{ marginTop: -6 }}>
                첫 분석 {summary.firstScore}점 → 최근 분석 {summary.latestScore}점 (
                {summary.scoreDelta >= 0 ? '+' : ''}
                {summary.scoreDelta}점 — AI 분석 점수 변화이며, 실력 향상을 확정하는 것은 아닙니다)
              </p>
            )}

            <ScoreHistoryChart records={records} />

            <div className="stack gap-1" style={{ marginTop: 10 }}>
              {[...records].reverse().map((r) => (
                <div key={r.recordId} className="pose-history-row">
                  <button className="pose-history-row__main" onClick={() => setExpandedId(expandedId === r.recordId ? null : r.recordId)}>
                    <span>{r.analyzedAt.slice(0, 10)}</span>
                    <span>
                      {STATUS_ICON[r.status]} {r.score}점{r.method === 'video_compare' ? ' · 🎬 기준 영상 비교' : ''}
                    </span>
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteOne(r.recordId)}>
                    삭제
                  </button>
                  {expandedId === r.recordId && (
                    <div className="pose-history-row__detail">
                      <div>종합 점수: {r.score}점 ({STATUS_LABEL[r.status]})</div>
                      {r.method === 'video_compare'
                        ? (() => {
                            // the full comparison (criteria, feedback) is kept in formCompare's own records
                            const cmp = listCompareRecords(r.techniqueId).find((c) => c.poseRecordId === r.recordId);
                            return cmp ? (
                              <>
                                <div>분석 신뢰도: {cmp.breakdown.reliability === 'high' ? '높음' : cmp.breakdown.reliability === 'medium' ? '보통' : '낮음'}</div>
                                {cmp.judgement.criteria.map((c) => (
                                  <div key={c.criterionId}>
                                    {cmp.criteria.find((x) => x.id === c.criterionId)?.description ?? c.criterionId}: {c.verdict === 'match' ? '일치' : c.verdict === 'partial' ? '부분 일치' : c.verdict === 'mismatch' ? '다름' : '판단 불가'}
                                  </div>
                                ))}
                                {cmp.judgement.focus.length > 0 && <div>집중할 점: {cmp.judgement.focus.join(' / ')}</div>}
                              </>
                            ) : null;
                          })()
                        : Object.entries(r.metricScores).map(([id, score]) => (
                            <div key={id}>
                              {id}: {score}점
                            </div>
                          ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="modal-actions">
          {records.length > 0 && (
            <button className="btn btn-ghost" onClick={handleDeleteAll}>
              이 기술 기록 전체 삭제
            </button>
          )}
          <button className="btn btn-primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
