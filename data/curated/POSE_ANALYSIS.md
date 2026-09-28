# 카메라 자세 분석 설정 (data/curated/poseAnalysis.json)

`videos.json`과 같은 원칙: 이 파일은 `scripts/parse-techniques.mjs`의 출력물이 아니고,
`npm run parse`로 덮어써지지 않습니다. `src/lib/poseAnalysis/poseAnalysisConfig.ts`가
런타임에 별도로 읽어서 기술 id로 조회합니다.

## 구조

```json
{
  "boxing__jab": {
    "supported": true,
    "requiredLandmarks": ["leftShoulder", "rightShoulder", "leftElbow", "..."],
    "metrics": [
      { "id": "armPosition", "name": "팔 위치", "params": { "targetAngle": 170, "tolerance": 45 } }
    ]
  }
}
```

- 키는 `data/processed/<martialArt>.json`의 실제 기술 `id`와 정확히 일치해야 합니다
  (검증: `node scripts/validate-pose-config.mjs`).
- `requiredLandmarks`: `src/lib/poseAnalysis/types.ts`의 `PoseLandmarkName` 값만 사용.
- `metrics[].id`: `src/lib/poseAnalysis/metrics.ts`의 `METRIC_CALCULATORS`에 실제로
  구현된 계산기 이름과 일치해야 합니다 (`basicStance`, `armPosition`, `rotation`,
  `hipRotation`, `balance`, `headPosition`, `supportLegStability`, `kneePosition`,
  `legMovement`, `levelChange`). 새 계산기를 추가하면 여기에도 추가하세요.
- `metrics[].params`: 계산기별 기준값(각도/이동량 등)과 허용 오차. 기술마다 다르게
  줄 수 있습니다(예: Jab은 팔이 거의 펴져야 하지만 Hook은 굽어 있어야 함).
- 이 파일에 없는 기술은 자동으로 "카메라 분석 미지원"으로 처리됩니다 — 기술 데이터
  자체(`data/processed/*.json`)는 전혀 건드리지 않습니다.

## 1차 지원 기술 (16개)

무리하게 1,253개 전체를 지원하지 않고, 카메라 한 대로 비교적 분석하기 쉬운 기술만
우선 선정했습니다: 복싱 Jab/Cross/Hook/Uppercut/High Guard, 킥복싱 Jab/Cross/Round
Kick/Front Kick, 무에타이 Teep to Leg/Round Kick, 태권도 앞차기/돌려차기, 레슬링
Wrestling Stance/Level Change/Penetration Step.

## 확장 방법

1. `data/processed/<art>.json`에서 실제 기술 `id`를 확인합니다(절대 새로 만들지 않음).
2. 그 기술에 어떤 지표가 의미 있을지 결정하고, 이미 있는 계산기 중에서 고릅니다
   (새 움직임 종류라면 `src/lib/poseAnalysis/metrics.ts`에 계산기를 추가).
3. 이 파일에 항목을 추가하고 `node scripts/validate-pose-config.mjs`로 검증합니다.
