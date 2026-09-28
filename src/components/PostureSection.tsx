import type { PostureBodyPosition, PostureInfo } from '../types';

const BODY_PART_LABEL: Record<keyof PostureBodyPosition, string> = {
  head: '머리/시선',
  upperBody: '상체',
  arms: '팔/손',
  hips: '골반',
  legs: '무릎/스탠스',
  feet: '발/발의 방향',
  weightDistribution: '체중 분배',
  distance: '거리',
};

const BODY_PART_ORDER: (keyof PostureBodyPosition)[] = ['head', 'upperBody', 'arms', 'hips', 'legs', 'feet', 'weightDistribution', 'distance'];

// Renders the "자세 잡기" section from hand-curated text data only (see
// data/curated/posture.json) — every sub-part below is rendered only when
// the curated entry actually has something to say about it; nothing here is
// generated or filled in with placeholder text. TechniqueDetail.tsx shows a
// "준비 중" notice instead of mounting this when a technique has no posture
// entry at all.
export default function PostureSection({ posture }: { posture: PostureInfo }) {
  const bodyParts = BODY_PART_ORDER.filter((key) => posture.bodyPosition?.[key]);

  return (
    <div className="card info-card">
      <h3>🧍 자세 잡기</h3>
      <p>{posture.overview}</p>

      {posture.startingPosition && (
        <>
          <h4 style={{ marginTop: 14, marginBottom: 6 }}>시작 자세</h4>
          <p>{posture.startingPosition}</p>
        </>
      )}

      {bodyParts.length > 0 && (
        <>
          <h4 style={{ marginTop: 14, marginBottom: 6 }}>신체 부위별 설명</h4>
          <div className="stack gap-1">
            {bodyParts.map((key) => (
              <div key={key} className="posture-body-row">
                <div className="field-label">{BODY_PART_LABEL[key]}</div>
                <p>{posture.bodyPosition![key]}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {posture.steps && posture.steps.length > 0 && (
        <>
          <h4 style={{ marginTop: 14, marginBottom: 6 }}>단계별 자세</h4>
          <ol className="posture-steps">
            {posture.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </>
      )}

      {posture.keyPoints && posture.keyPoints.length > 0 && (
        <>
          <h4 style={{ marginTop: 14, marginBottom: 6 }}>핵심 포인트</h4>
          <ul>
            {posture.keyPoints.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        </>
      )}

      {posture.commonMistakes && posture.commonMistakes.length > 0 && (
        <>
          <h4 style={{ marginTop: 14, marginBottom: 6 }}>흔한 실수</h4>
          <ul>
            {posture.commonMistakes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
