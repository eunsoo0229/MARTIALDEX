import { askGeminiForJson, type GeminiJsonOutcome } from '../fighterStyle/geminiJson';
import { martialArtSummaries } from '../loadData';
import type { HomeExerciseEquipment, HomeExerciseType } from '../../types';
import type { HomeGoalAnalysis } from './types';

const VALID_EXERCISE_TYPES: HomeExerciseType[] = [
  'strength',
  'conditioning',
  'mobility',
  'flexibility',
  'combat_movement',
  'striking_drill',
  'grappling_drill',
  'footwork',
  'recovery',
];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isHomeGoalAnalysis(data: unknown): data is HomeGoalAnalysis {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    (d.relatedMartialArt === null || typeof d.relatedMartialArt === 'string') &&
    isStringArray(d.goals) &&
    Array.isArray(d.emphasizedTypes) &&
    d.emphasizedTypes.every((x) => typeof x === 'string' && VALID_EXERCISE_TYPES.includes(x as HomeExerciseType)) &&
    isStringArray(d.relatedTechniqueIds) &&
    typeof d.summary === 'string' &&
    (d.clarifyingQuestion === null || typeof d.clarifyingQuestion === 'string') &&
    (d.trainingRecordAnalysis === null || typeof d.trainingRecordAnalysis === 'string')
  );
}

const MARTIAL_ART_ID_LIST = martialArtSummaries.map((a) => `${a.id} (${a.nameKo})`).join(', ');

export interface AnalyzeHomeGoalInput {
  /** The user's own free-text goal. Empty/null only when they explicitly asked for a training-record-based plan instead. */
  freeText: string | null;
  /** The martial art the user picked (if any) as "관련 무술" — always respected if given. */
  relatedMartialArtHint: string | null;
  sessionsPerWeek: number;
  minutesPerSession: number;
  equipment: HomeExerciseEquipment[];
  /** buildTrainingAiContext().contextLines — ALWAYS passed when freeText is empty (the no-goal-stated flow), optionally passed alongside a stated goal too so the AI can ground its plan in real activity either way. */
  trainingContextLines: string[];
}

/**
 * The single Gemini call behind "홈트 AI 커리큘럼" (both the goal-stated and
 * no-goal-stated flows — see homeTraining/service.ts for which local data
 * feeds trainingContextLines). Deliberately does NOT use aiCurriculum's
 * GoalIntent (attack/defense/escape/counter) taxonomy — that's meaningless
 * for a fitness/movement goal. Never invents an exercise id — this only
 * extracts free-text phrases/emphasis; turning those into real exercise ids
 * happens later, in code, via exerciseMatcher.ts.
 */
export async function analyzeHomeGoal(input: AnalyzeHomeGoalInput): Promise<GeminiJsonOutcome<HomeGoalAnalysis>> {
  const noStatedGoal = !input.freeText || !input.freeText.trim();

  const systemInstruction = [
    '사용자가 집에서 할 수 있는 홈트레이닝(일반 체력 운동 + 격투기 훈련에 필요한 움직임) 커리큘럼을 원한다.',
    '이 앱의 홈트 운동 라이브러리는 일반 체력/컨디셔닝/가동성/유연성/회복 운동과, 격투기 특화 움직임 드릴을 함께 포함한다.',
    '',
    `유효한 관련 무술 id 목록(관련이 있을 때만 하나 선택, 없으면 null): ${MARTIAL_ART_ID_LIST}`,
    '사용자가 이미 관련 무술을 선택했다면(relatedMartialArtHint) 텍스트가 명확히 다른 무술을 말하지 않는 한 그 값을 그대로 사용한다.',
    '',
    'goals는 사용자의 목표를 담은 짧은 한국어 phrase 배열이다(예: "테이크다운에 필요한 하체 폭발력", "복싱 풋워크 개선").',
    '실제 운동 이름을 지어내지 않는다 — 이후 단계에서 이 phrase들을 실제 홈트 운동 라이브러리에서 검색해 매칭한다.',
    '',
    `emphasizedTypes는 강조할 운동 유형을 다음 중에서 골라 우선순위 순으로 담는다(최대 4개): ${VALID_EXERCISE_TYPES.join(', ')}.`,
    '',
    'relatedTechniqueIds는 이 목표와 직접 관련된 실제 무술 기술 id가 있다면 담는다(확신 없으면 빈 배열 — id를 지어내지 않는다).',
    '',
    'summary는 "당신의 목표: ..." 형태로 쓸 수 있는 한국어 한 줄 요약이다.',
    '',
    '사용자가 입력한 내용만으로 의미 있는 커리큘럼을 만들기 충분히 어렵다면(예: 텍스트가 거의 비어 있거나 "몰라" 같은 경우)',
    'clarifyingQuestion에 가장 중요한 질문 하나만 한국어로 담는다. 충분한 정보가 있다면 clarifyingQuestion은 null이어야 한다.',
    '',
    noStatedGoal
      ? [
          '매우 중요: 사용자가 목표를 직접 입력하지 않았다 — 아래 컨텍스트로 제공된 실제 훈련 기록(무술별 훈련 횟수/최근 자주',
          '훈련한 기술/커리큘럼 진행률 등)을 분석해 사용자에게 부족한 부분을 판단한다. 단순히 "운동 횟수가 적다"는 이유만으로',
          '부족하다고 판단하지 않는다 — 사용자의 기존 훈련 목표와 무술 종류를 함께 고려한다. 체형/외형에 대한 언급은 절대 하지',
          '않는다 — 오직 앱에 기록된 훈련 데이터만 근거로 삼는다.',
          'trainingRecordAnalysis에 "강점: .../부족한 부분: .../이유: ..." 형태로 분석 결과를 한국어로 작성한다(clarifyingQuestion이',
          'null일 때만 — 데이터가 근거가 되므로 목표를 다시 물을 필요는 거의 없다). goals/emphasizedTypes는 이 분석에서 도출한다.',
        ].join('\n')
      : 'trainingRecordAnalysis는 사용자가 직접 목표를 입력했으므로 null로 둔다(컨텍스트가 함께 주어졌다면 참고만 하되, 분석 설명문을 억지로 만들지 않는다).',
    '',
    '출력 형식(JSON 객체 하나):',
    '{',
    '  "relatedMartialArt": string | null,',
    '  "goals": string[],',
    '  "emphasizedTypes": string[],',
    '  "relatedTechniqueIds": string[],',
    '  "summary": string,',
    '  "clarifyingQuestion": string | null,',
    '  "trainingRecordAnalysis": string | null',
    '}',
  ].join('\n');

  const contextParts = [
    `관련 무술(선택됨): ${input.relatedMartialArtHint ?? '없음'}`,
    `주당 훈련 횟수: ${input.sessionsPerWeek}회`,
    `1회 훈련 시간: ${input.minutesPerSession}분`,
    `사용 가능 장비: ${input.equipment.length > 0 ? input.equipment.join(', ') : '없음'}`,
  ];
  if (input.trainingContextLines.length > 0) {
    contextParts.push('실제 훈련 기록 데이터:');
    contextParts.push(...input.trainingContextLines);
  }

  return askGeminiForJson<HomeGoalAnalysis>({
    systemInstruction,
    contextText: contextParts.join('\n'),
    question: noStatedGoal ? '사용자 입력: (목표 미입력 — 훈련 기록을 분석해 추천해줘)' : `사용자 입력: "${(input.freeText ?? '').trim()}"`,
    validate: isHomeGoalAnalysis,
  });
}
