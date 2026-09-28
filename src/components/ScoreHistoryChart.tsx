import { useState } from 'react';
import type { PoseAnalysisRecord } from '../lib/poseAnalysis/types';

// A single-series "score over time" line — no legend needed (one series),
// one axis (score 0-100), accent color matches the rest of the app so it
// reads as "this app's data", not a generic chart-library default.
export default function ScoreHistoryChart({ records }: { records: PoseAnalysisRecord[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (records.length < 2) return null;

  const width = 560;
  const height = 160;
  const padding = { top: 12, right: 12, bottom: 24, left: 30 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const xFor = (i: number) => padding.left + (records.length === 1 ? 0 : (i / (records.length - 1)) * plotW);
  const yFor = (score: number) => padding.top + plotH * (1 - score / 100);

  const linePath = records.map((r, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(r.score)}`).join(' ');
  const gridLines = [0, 25, 50, 75, 100];

  return (
    <div className="score-chart">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="분석 점수 변화 그래프">
        {gridLines.map((g) => (
          <g key={g}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yFor(g)}
              y2={yFor(g)}
              className="score-chart__grid"
            />
            <text x={4} y={yFor(g) + 4} className="score-chart__axis-label">
              {g}
            </text>
          </g>
        ))}
        <path d={linePath} className="score-chart__line" fill="none" />
        {records.map((r, i) => (
          <g key={r.recordId} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
            <circle
              cx={xFor(i)}
              cy={yFor(r.score)}
              r={hoverIdx === i ? 7 : 5}
              className="score-chart__dot"
            />
            <circle cx={xFor(i)} cy={yFor(r.score)} r={12} fill="transparent" />
          </g>
        ))}
        {hoverIdx !== null && (
          <g>
            <rect
              x={Math.min(width - 108, Math.max(0, xFor(hoverIdx) - 45))}
              y={Math.max(0, yFor(records[hoverIdx].score) - 34)}
              width={96}
              height={26}
              rx={5}
              className="score-chart__tooltip-bg"
            />
            <text
              x={Math.min(width - 60, Math.max(48, xFor(hoverIdx)))}
              y={Math.max(16, yFor(records[hoverIdx].score) - 16)}
              textAnchor="middle"
              className="score-chart__tooltip-text"
            >
              {records[hoverIdx].analyzedAt.slice(0, 10)} · {records[hoverIdx].score}점
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
