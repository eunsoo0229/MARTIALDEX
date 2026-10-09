import type {
  AnalysisLimitation,
  EvidenceFact,
  MotionEvent,
  MotionEventCategory,
  OverallScores,
  PostureSegment,
  SequenceAnalysisResult,
  TechniqueGuess,
  VisualEventInsight,
  WeakArea,
} from './types';

// The grounding layer for coachingSynthesis.ts: every sentence the AI may
// base a strength/weakness/drill on comes from this list, built in CODE from
// what the pipeline actually measured or deterministically derived. The AI
// cites fact ids; it never supplies its own evidence. Anything the pipeline
// does not measure is spelled out in buildDataLimits() instead, so it can
// be shown as "판단할 수 없음" rather than guessed.

export interface CoachingFactsInput {
  techniqueGuesses: TechniqueGuess[];
  motionEvents: MotionEvent[];
  opponentMotionEvents: MotionEvent[];
  sequenceAnalysis?: SequenceAnalysisResult;
  visualInsights: VisualEventInsight[];
  postureSegments: PostureSegment[];
  weakAreas: WeakArea[];
  videoDurationSec?: number;
  overallScores?: OverallScores;
  limitations?: AnalysisLimitation[];
}

const CATEGORY_TEXT: Record<MotionEventCategory, string> = {
  strike_like: '타격성 동작',
  kick_like: '킥성 동작',
  level_change_like: '레벨 체인지(테이크다운 시도성) 동작',
  clinch_like: '클린치성 근접 동작',
  footwork_movement: '이동/풋워크',
  distance_exit_like: '거리 이탈(후퇴) 동작',
  guard_hold_like: '가드 유지 동작',
};

const SCORE_TEXT: Record<keyof OverallScores, string> = {
  technique: '기술',
  movement: '움직임',
  distance: '거리 조절',
  defense: '방어',
  offense: '공격',
  posture: '자세',
};

function countByCategory(events: MotionEvent[]): Map<MotionEventCategory, number> {
  const m = new Map<MotionEventCategory, number>();
  for (const e of events) m.set(e.category, (m.get(e.category) ?? 0) + 1);
  return m;
}

function perMinute(count: number, durationSec?: number): string {
  if (!durationSec || durationSec < 30) return '';
  return ` (분당 ${(count / (durationSec / 60)).toFixed(1)}회)`;
}

export function buildEvidenceFacts(input: CoachingFactsInput): EvidenceFact[] {
  const texts: string[] = [];
  const dur = input.videoDurationSec;

  // 동작 감지 (자세 좌표 기반 휴리스틱)
  for (const [cat, n] of countByCategory(input.motionEvents)) {
    texts.push(`내 ${CATEGORY_TEXT[cat]} ${n}회 감지${perMinute(n, dur)} — 자세 좌표 기반 추정`);
  }
  for (const [cat, n] of countByCategory(input.opponentMotionEvents)) {
    texts.push(`상대 ${CATEGORY_TEXT[cat]} ${n}회 감지 — 자세 좌표 기반 추정`);
  }

  // 구간별 동작 빈도 (페이스 — 초반/중반/후반 동일 길이로 나눔)
  if (dur && dur >= 30 && input.motionEvents.length >= 6) {
    const third = dur / 3;
    const bins = [0, 0, 0];
    for (const e of input.motionEvents) bins[Math.min(2, Math.floor(e.timestampSec / third))]++;
    texts.push(`구간별 내 동작 감지 수: 초반 ${bins[0]} · 중반 ${bins[1]} · 후반 ${bins[2]}`);
  }

  // 자세 지표 (초반 → 후반 변화)
  const metricIds = new Set(input.postureSegments.flatMap((s) => s.metrics.map((m) => m.id)));
  for (const id of metricIds) {
    const parts = input.postureSegments.flatMap((s) => {
      const m = s.metrics.find((x) => x.id === id);
      return m ? [`${s.label} ${m.score}`] : [];
    });
    const label = input.postureSegments.flatMap((s) => s.metrics).find((m) => m.id === id)?.label ?? id;
    if (parts.length > 0) texts.push(`${label} 점수(0-100): ${parts.join(' → ')}`);
  }

  // 종합 점수 (코드 계산)
  if (input.overallScores) {
    for (const key of Object.keys(SCORE_TEXT) as (keyof OverallScores)[]) {
      const v = input.overallScores[key];
      if (v != null) texts.push(`${SCORE_TEXT[key]} 종합 점수 ${v}점 (영상 지표 기반 계산)`);
    }
  }

  // 기술 추정 + 연결 패턴
  for (const g of input.techniqueGuesses) texts.push(`${g.techniqueName} ${g.occurrences.length}회 (AI가 동작에서 추정한 기술명)`);
  const seq = input.sequenceAnalysis;
  if (seq) {
    if (seq.timeline.length > 0) texts.push(`단독 공격 ${seq.soloCount}회, 연결(콤비네이션) ${seq.combinationCount}회`);
    for (const p of seq.patterns.slice(0, 10)) {
      texts.push(`연결 패턴 ${p.fromTechniqueName} → ${p.toTechniqueName ?? '후속 공격 없음'} ${p.count}회`);
    }
    for (const t of seq.perTechnique) {
      if (t.occurrenceCount < 2) continue;
      const moved = t.movedAfterCount + t.stayedStillCount;
      if (moved > 0) texts.push(`${t.techniqueName} 후 2.5초 내 이동 ${t.movedAfterCount}/${moved}회 (나머지는 제자리)`);
      const buckets = Object.entries(t.distanceBuckets) as [string, number][];
      if (buckets.length > 0) {
        const label: Record<string, string> = { close: '근거리', mid: '중거리', far: '원거리' };
        texts.push(`${t.techniqueName} 사용 거리(화면상 상대 거리): ${buckets.map(([k, n]) => `${label[k] ?? k} ${n}회`).join(', ')}`);
      }
    }
    if (seq.reactiveRatio !== null) texts.push(`상대 동작 직후 2초 내 대응한 비율 ${Math.round(seq.reactiveRatio * 100)}%`);
  }

  // 적중 판정 (AI 프레임 판정 — 일부 장면만)
  if (input.visualInsights.length > 0) {
    const c = { landed: 0, missed: 0, unclear: 0 };
    for (const v of input.visualInsights) c[v.hitAssessment]++;
    texts.push(`공격 장면 ${input.visualInsights.length}개 프레임 판정: 적중 ${c.landed} · 빗나감 ${c.missed} · 불분명 ${c.unclear} (AI 이미지 판정)`);
  }

  for (const w of input.weakAreas) texts.push(`약점 지표: ${w.label}${w.score !== null ? ` ${w.score}점` : ''}`);

  return texts.map((text, i) => ({ id: `F${i + 1}`, text }));
}

/** What this analysis cannot know — always shown, code-determined, never AI. */
export function buildDataLimits(input: CoachingFactsInput): string[] {
  const limits = [
    '내가 맞은 횟수(피격)는 측정되지 않습니다.',
    '가드는 손목과 얼굴의 상대적 높이로만 추정하며, 공격 직후 가드 복귀 여부는 직접 측정하지 않습니다.',
    '체력·스태미나는 측정하지 않으며, 페이스는 구간별 동작 감지 수로만 볼 수 있습니다.',
  ];
  if (input.opponentMotionEvents.length === 0) limits.push('상대 동작 추적 데이터가 없어 상대 공격에 대한 대응·반응은 판단할 수 없습니다.');
  else limits.push('거리는 화면상 두 사람의 상대 거리이며 실제 거리(m)가 아닙니다.');
  if (input.visualInsights.length === 0) limits.push('공격 적중 여부는 판정하지 않았습니다.');
  else limits.push(`공격 적중 여부는 일부 장면(${input.visualInsights.length}개)의 AI 이미지 판정에 한정됩니다.`);
  if (input.techniqueGuesses.length > 0) limits.push('기술명은 동작에서 AI가 추정한 것으로 실제와 다를 수 있습니다.');
  for (const l of input.limitations ?? []) limits.push(l.message);
  return limits;
}
