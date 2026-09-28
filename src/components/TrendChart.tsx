import { useState } from 'react';
import type { TrendPoint } from '../lib/statsHub/types';

// Same hand-rolled inline-SVG approach as ScoreHistoryChart.tsx (no charting
// library) — generalized to arbitrary {date,value} points instead of
// PoseAnalysisRecord[], and to a dynamic y-axis instead of a fixed 0-100
// scale, since training time/count aren't score percentages.
export default function TrendChart({ points, variant, unit = '' }: { points: TrendPoint[]; variant: 'line' | 'bar'; unit?: string }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (points.length < 2) return null;

  const width = 560;
  const height = 160;
  const padding = { top: 12, right: 12, bottom: 24, left: 34 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const rawMax = Math.max(...points.map((p) => p.value), 0);
  const maxValue = rawMax === 0 ? 1 : rawMax;

  const xFor = (i: number) => padding.left + (points.length === 1 ? 0 : (i / (points.length - 1)) * plotW);
  const yFor = (value: number) => padding.top + plotH * (1 - value / maxValue);
  // A small maxValue (e.g. 1 or 2) makes several of the 5 fractional grid
  // lines round to the same integer — de-duped so no two lines land on the
  // same y (and so React never sees two elements sharing a key).
  const gridLines = [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxValue * f)))];

  const barWidth = Math.max(4, (plotW / points.length) * 0.6);

  return (
    <div className="score-chart">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="추이 그래프">
        {gridLines.map((g) => (
          <g key={g}>
            <line x1={padding.left} x2={width - padding.right} y1={yFor(g)} y2={yFor(g)} className="score-chart__grid" />
            <text x={2} y={yFor(g) + 4} className="score-chart__axis-label">
              {g}
            </text>
          </g>
        ))}

        {variant === 'bar'
          ? points.map((p, i) => (
              <rect
                key={i}
                x={xFor(i) - barWidth / 2}
                y={yFor(p.value)}
                width={barWidth}
                height={Math.max(0, yFor(0) - yFor(p.value))}
                style={{ fill: 'var(--accent)' }}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
              />
            ))
          : (
              <path d={points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.value)}`).join(' ')} className="score-chart__line" fill="none" />
            )}

        {variant === 'line' &&
          points.map((p, i) => (
            <g key={i} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
              <circle cx={xFor(i)} cy={yFor(p.value)} r={hoverIdx === i ? 7 : 5} className="score-chart__dot" />
              <circle cx={xFor(i)} cy={yFor(p.value)} r={12} fill="transparent" />
            </g>
          ))}

        {hoverIdx !== null && (
          <g>
            <rect
              x={Math.min(width - 116, Math.max(0, xFor(hoverIdx) - 50))}
              y={Math.max(0, yFor(points[hoverIdx].value) - 34)}
              width={104}
              height={26}
              rx={5}
              className="score-chart__tooltip-bg"
            />
            <text
              x={Math.min(width - 64, Math.max(52, xFor(hoverIdx)))}
              y={Math.max(16, yFor(points[hoverIdx].value) - 16)}
              textAnchor="middle"
              className="score-chart__tooltip-text"
            >
              {points[hoverIdx].date}: {points[hoverIdx].value}
              {unit}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
