import { useNavigate } from 'react-router-dom';
import type { GymBodyPart } from '../types';
import type { BodyPartRecovery } from '../lib/gymTraining/recovery';
import { GYM_BODY_PART_LABEL } from '../lib/gymTraining/recovery';
import bodyImg from '../../body.png';

interface Hotspot {
  bodyPart: GymBodyPart;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

// body.png is a 3-panel composite (front/back/side view of one faceless
// anatomical mannequin) — used exactly as provided, never replaced. Several
// body parts are only clearly visible on one panel, so each gets 1-2
// hotspots (both mapped to the same GymBodyPart) rather than forcing every
// part onto every panel. Coordinates are percentages of the full image
// (viewBox 0 0 100 100) — measured directly from the actual pixel data
// (thresholded silhouette, row-by-row segment analysis per panel) rather
// than eyeballed, so they track the real muscle-group boundaries instead of
// an approximate guess. Panel bounding boxes: front x 4.4-36.1%, back x
// 40.5-71.7%, both y roughly 2.6-93.4% of the full canvas.
//
// Calves are placed on the BACK panel, not front — the gastrocnemius (종아리)
// is a posterior lower-leg muscle, far more visible from behind than from
// the front (front of the lower leg is the shin/tibialis anterior, a
// different muscle not tracked here). The original placement had this on
// the front view, which was an anatomical placement error, not just an
// off-by-a-few-percent coordinate issue.
const HOTSPOTS: Hotspot[] = [
  // ---- FRONT panel (upper body) ----
  { bodyPart: 'shoulders', cx: 11.5, cy: 17.5, rx: 2.8, ry: 2.8 },
  { bodyPart: 'shoulders', cx: 29, cy: 17.5, rx: 2.8, ry: 2.8 },
  { bodyPart: 'chest', cx: 20.3, cy: 21.5, rx: 6.5, ry: 4 },
  { bodyPart: 'biceps', cx: 9.3, cy: 25, rx: 2.6, ry: 4 },
  { bodyPart: 'biceps', cx: 30.8, cy: 25, rx: 2.6, ry: 4 },
  { bodyPart: 'abs', cx: 20.3, cy: 32, rx: 6, ry: 6.5 },
  { bodyPart: 'forearms', cx: 7, cy: 40, rx: 2.2, ry: 5.5 },
  { bodyPart: 'forearms', cx: 33.5, cy: 40, rx: 2.2, ry: 5.5 },
  // ---- FRONT panel (lower body) ----
  { bodyPart: 'quads', cx: 15.4, cy: 59, rx: 3.6, ry: 5 },
  { bodyPart: 'quads', cx: 25.4, cy: 59, rx: 3.6, ry: 5 },
  // ---- BACK panel ----
  { bodyPart: 'back', cx: 56.3, cy: 30, rx: 8, ry: 8 },
  { bodyPart: 'triceps', cx: 44, cy: 36, rx: 2.4, ry: 5.5 },
  { bodyPart: 'triceps', cx: 68.2, cy: 36, rx: 2.4, ry: 5.5 },
  { bodyPart: 'lower_back', cx: 56.2, cy: 46, rx: 5, ry: 3.5 },
  { bodyPart: 'glutes', cx: 56, cy: 53, rx: 7, ry: 4 },
  { bodyPart: 'hamstrings', cx: 51, cy: 63, rx: 3, ry: 5.5 },
  { bodyPart: 'hamstrings', cx: 61, cy: 63, rx: 3, ry: 5.5 },
  { bodyPart: 'calves', cx: 49.8, cy: 76, rx: 2.6, ry: 5 },
  { bodyPart: 'calves', cx: 62.7, cy: 76, rx: 2.6, ry: 5 },
];

function statusClass(status: BodyPartRecovery['status']): string {
  if (status === 'recovering') return 'body-part-map__hotspot--recovering';
  if (status === 'recovered') return 'body-part-map__hotspot--recovered';
  return '';
}

export default function BodyPartMap({ recovery }: { recovery: BodyPartRecovery[] }) {
  const navigate = useNavigate();
  const byPart = new Map(recovery.map((r) => [r.bodyPart, r]));

  return (
    <div className="body-part-map">
      <img src={bodyImg} alt="인체 회복도 지도" className="body-part-map__img" />
      <svg className="body-part-map__overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
        {HOTSPOTS.map((h, i) => {
          const r = byPart.get(h.bodyPart);
          return (
            <ellipse
              key={`${h.bodyPart}-${i}`}
              className={`body-part-map__hotspot ${statusClass(r?.status ?? 'no_data')}`}
              cx={h.cx}
              cy={h.cy}
              rx={h.rx}
              ry={h.ry}
              role="button"
              tabIndex={0}
              aria-label={`${GYM_BODY_PART_LABEL[h.bodyPart]} 회복도 ${r ? r.recoveryPercent : ''}%`}
              onClick={() => navigate(`/training/body/${h.bodyPart}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') navigate(`/training/body/${h.bodyPart}`);
              }}
            >
              <title>
                {GYM_BODY_PART_LABEL[h.bodyPart]} — {r ? `회복도 ${r.recoveryPercent}%` : '기록 없음'}
              </title>
            </ellipse>
          );
        })}
      </svg>
      <p className="body-part-map__caption">의학적 판단이 아닌 참고용 추정치입니다.</p>
    </div>
  );
}
