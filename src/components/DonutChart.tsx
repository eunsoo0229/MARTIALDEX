import { useState } from 'react';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

// Same hand-rolled inline-SVG approach as TrendChart.tsx / ScoreHistoryChart.tsx
// (no charting library) — a ring built from stroke-dasharray segments.
export default function DonutChart({ slices, size = 180, thickness = 30 }: { slices: DonutSlice[]; size?: number; thickness?: number }) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offsetAccum = 0;
  const hovered = slices.find((s) => s.key === hoverKey);

  return (
    <div className="donut-chart">
      <div className="donut-chart__ring-wrap">
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="무술별 훈련 비율">
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {slices.map((s) => {
              const fraction = s.value / total;
              const dash = fraction * circumference;
              const gap = circumference - dash;
              const el = (
                <circle
                  key={s.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${gap}`}
                  strokeDashoffset={-offsetAccum}
                  style={{ opacity: hoverKey === null || hoverKey === s.key ? 1 : 0.35, transition: 'opacity .15s' }}
                  onMouseEnter={() => setHoverKey(s.key)}
                  onMouseLeave={() => setHoverKey(null)}
                />
              );
              offsetAccum += dash;
              return el;
            })}
          </g>
        </svg>
        <div className="donut-chart__center">
          {hovered ? (
            <>
              <strong>{Math.round((hovered.value / total) * 100)}%</strong>
              <span>{hovered.label}</span>
            </>
          ) : (
            <>
              <strong>{total}</strong>
              <span>총 훈련</span>
            </>
          )}
        </div>
      </div>
      <div className="donut-chart__legend">
        {slices.map((s) => (
          <div
            key={s.key}
            className="donut-chart__legend-item"
            onMouseEnter={() => setHoverKey(s.key)}
            onMouseLeave={() => setHoverKey(null)}
          >
            <span className="donut-chart__swatch" style={{ background: s.color }} />
            <span>{s.label}</span>
            <span className="donut-chart__legend-pct">{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
