import { askGeminiForJson, type GeminiJsonOutcome } from '../fighterStyle/geminiJson';
import { martialArtSummaries } from '../loadData';
import type { GoalAnalysis, GoalUserLevel } from './types';
import { GOAL_MAX_DURATION_DAYS, GOAL_MIN_DURATION_DAYS } from './types';
import { MMA_MARTIAL_ART_ID, MMA_SOURCE_MARTIAL_ARTS } from '../mmaCurriculum/types';

const VALID_LEVELS: GoalUserLevel[] = ['beginner', 'intermediate', 'advanced'];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isGoalAnalysis(data: unknown): data is GoalAnalysis {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.martialArt === 'string' &&
    typeof d.estimatedLevel === 'string' &&
    VALID_LEVELS.includes(d.estimatedLevel as GoalUserLevel) &&
    isStringArray(d.weaknesses) &&
    isStringArray(d.desiredStyle) &&
    isStringArray(d.desiredTechniques) &&
    isStringArray(d.goals) &&
    isStringArray(d.priority) &&
    isStringArray(d.intents) &&
    typeof d.diversityRequested === 'boolean' &&
    isStringArray(d.searchTopics) &&
    (d.referencedFighterName === null || typeof d.referencedFighterName === 'string') &&
    (d.clarifyingQuestion === null || typeof d.clarifyingQuestion === 'string') &&
    typeof d.summary === 'string' &&
    typeof d.suggestedDurationDays === 'number' &&
    typeof d.durationReason === 'string'
  );
}

export interface AnalyzeGoalInput {
  freeText: string;
  /** The martial art the user picked in the dropdown — always present, always the default. */
  martialArtHint: string;
  dailyMinutes: number;
  /** Set when the user answered the AI's clarifying question instead of skipping it. */
  clarifyingAnswer?: string;
  /** Prior user "다시 만들어줘" refinement requests, oldest first (spec section 13). */
  refinementHistory?: string[];
}

const MARTIAL_ART_ID_LIST = [
  ...martialArtSummaries.map((a) => `${a.id} (${a.nameKo})`),
  `${MMA_MARTIAL_ART_ID} (MMA - Mixed Martial Arts, 여러 무술을 종합한 종합격투기)`,
].join(', ');

// Only appended when the user picked MMA — keeps the base instruction
// identical (and the existing 9 real arts' behavior completely unchanged)
// for every other call.
const MMA_INSTRUCTION_ADDENDUM = [
  '',
  `사용자가 "${MMA_MARTIAL_ART_ID}"(MMA)를 선택했다. MMA는 Martialdex에 별도의 기술 백과사전이 없고, 대신 다음 실제 무술들의`,
  `기술을 조합해서 구성한다: ${MMA_SOURCE_MARTIAL_ARTS.join(', ')} (타격은 복싱/킥복싱/무에타이, 테이크다운/테이크다운 방어/클린치는`,
  '레슬링/유도/삼보, 그라운드/서브미션은 주짓수에서 가져온다).',
  'weaknesses/desiredTechniques/goals를 작성할 때 위 무술들의 실제 기술 데이터베이스에서 검색 가능한 표준 용어를 사용한다',
  '(예: "Sprawl", "Double Leg", "Underhook", "Guard Pass", "Ground and Pound", "Jab", "Clinch Knee").',
  'MMA는 단순 기술 나열이 아니라 기술 간 연결(예: 타격 → 클린치 → 테이크다운 → 상위 포지션)이 핵심이므로, 가능하면 연결을',
  '암시하는 phrase도 goals/desiredTechniques에 포함한다.',
  '특정 실존 선수의 이름이 언급되지 않는 한, 특정 선수의 공식 훈련 프로그램인 것처럼 표현하지 않는다.',
].join('\n');

/**
 * The single Gemini call behind "AI 맞춤 커리큘럼"'s natural-language step
 * (spec sections 2-5, 7, 11). Never invents technique ids — this only
 * extracts free-text phrases (weaknesses/goals/style/techniques as the user
 * described them); turning those into real Martialdex techniqueIds happens
 * later, in code, via techniqueMatcher.ts (same separation of concerns as
 * fighterStyle/styleAnalysis.ts + techniqueMatcher.ts).
 */
export async function analyzeGoal(input: AnalyzeGoalInput): Promise<GeminiJsonOutcome<GoalAnalysis>> {
  const systemInstruction = [
    '사용자가 자신의 무술 훈련 목표, 부족한 부분, 원하는 스타일을 자유롭게 설명한 글을 분석한다.',
    '이 분석 결과를 바탕으로 나중에 개인 맞춤 커리큘럼이 만들어진다.',
    '',
    `유효한 무술 id 목록(이 중 하나만 사용): ${MARTIAL_ART_ID_LIST}`,
    '사용자가 이미 무술을 선택했다면(martialArtHint) 텍스트가 명확히 다른 무술을 말하지 않는 한 그 값을 그대로 사용한다.',
    '',
    '추정 수준(estimatedLevel)은 "beginner" | "intermediate" | "advanced" 중 하나다.',
    '수준을 확신할 수 없으면 무리하게 고급으로 판단하지 말고 beginner 또는 intermediate 중 더 안전한 쪽을 고른다.',
    '',
    'weaknesses/desiredStyle/desiredTechniques/goals는 사용자의 표현을 존중한 짧은 구(phrase) 배열이다 — 실제 기술 데이터베이스의',
    '기술 id를 만들어내지 않는다(그건 이후 단계에서 검색으로 매칭한다). 표준적인 무술 용어(영문 또는 로마자 표기 가능)를 선호한다.',
    'priority는 위 네 배열에 등장한 phrase들을 사용자가 가장 중요하게 여기는 순서로 다시 나열한 것이다(중복 없이, 최대 6개).',
    '',
    '매우 중요 — 목적 정확도:',
    '1) 각 phrase는 사용자가 명시한 의미(공격/방어/카운터 등)를 그대로 보존해야 한다. 예를 들어 사용자가 "테이크다운 방어"라고',
    '   했다면 phrase에도 반드시 "defense"/"방어"라는 표현을 포함시켜야 하고, 이를 일반적인 "테이크다운"(공격) 기술로 바꿔쓰면',
    '   안 된다. "잽이 부족해"라면 잽 자체와 잽을 활용하는 훈련이 중심이어야지, 관련 없는 다른 기술로 대체하면 안 된다.',
    '2) 이 phrase들은 반드시 martialArt(사용자가 선택했거나 위 규칙으로 확정한 무술)에서 실제로 쓰이는 기술 범위 안에 있어야',
    '   한다. 사용자가 명시적으로 언급하지 않은 다른 무술의 기술을 새로 끌어와 채우지 않는다(MMA를 선택한 경우는 예외 — 아래',
    '   MMA 전용 안내를 따른다).',
    '',
    '매우 중요 — intents(훈련 의도) 분류:',
    '사용자의 목표를 아래 6가지 의도 중 실제로 해당하는 것만 골라 intents 배열에 담는다(우선순위 순, 중복 없이, 보통 1~2개):',
    '- "attack"(공격): 공격/타격/서브미션/피니시 등 상대를 제압하는 것이 목표인 경우',
    '- "defense"(방어): 상대의 공격을 막아내는 것이 목표인 경우(예: "테이크다운 방어", "잽 방어")',
    '- "escape"(탈출): 불리한 포지션에서 빠져나오는 것이 목표인 경우(예: "마운트 탈출", "서브미션 탈출")',
    '- "counter"(카운터): 상대의 특정 공격에 대한 반격/대응이 목표인 경우(예: "싱글렉 카운터")',
    '- "connection"(연결/전환): 기술 간 연계·전환·콤보 자체가 목표인 경우',
    '- "fundamentals"(기본기): 자세/풋워크/움직임 등 기초 훈련 자체가 목표인 경우',
    '이 분류는 이후 실제 기술을 검색해 매칭하는 단계에서 그대로 사용되어, 예를 들어 "테이크다운 방어"에 "defense"가 담기면',
    '더블레그/싱글렉 같은 공격용 진입 기술은 자동으로 감점되고 스프롤/언더훅 디펜스 같은 방어 기술이 우선된다. 따라서 "공격"과',
    '"방어"를 혼동하면 실제 커리큘럼 내용이 완전히 뒤바뀌므로 절대 서로 반대로 넣지 않는다. 의도가 정말 불분명하면 억지로',
    '추측하지 말고 intents를 빈 배열로 둔다.',
    '',
    '매우 중요 — diversityRequested(다양성 요청 여부):',
    '사용자가 "다양하게", "여러 종류", "종류별로", "폭넓게", "여러 스타일/방법", "different types", "variety", "variations" 같은',
    '표현으로 한 기술 주제 "안에서의 폭/다양성"을 보고 싶어하면 true로 둔다(예: "테이크다운의 다양성을 알고 싶어", "싱글렉의',
    '여러 종류를 알려줘"). 반대로 사용자가 그 주제를 처음부터 배우고 싶다고 한 경우(예: "초보자가 테이크다운을 배우기 위한',
    '4주 커리큘럼을 만들어줘")는 스탠스/핸드파이팅/기초 동작 같은 사전 준비 기술도 정당하게 필요하므로 false로 둔다. 확신이',
    '없으면 false를 기본값으로 한다(다양성 처리는 명시적으로 요청됐을 때만 켜져야 한다).',
    '',
    '매우 중요 — phrase는 검색 가능한 "기술/카테고리 이름"만 담는다(수식어 제거):',
    'weaknesses/desiredStyle/desiredTechniques/goals/priority의 각 phrase에는 "다양한", "여러", "폭넓게", "습득", "배우고 싶어",',
    '"~을 알고 싶어" 같은 요청 자체의 수식어/서술어를 절대 포함시키지 않는다 — 이런 의도는 이미 diversityRequested/intents/',
    'summary가 별도로 담당한다. 예를 들어 사용자가 "테이크다운 다양성을 알고 싶어"라고 했다면 phrase는 "다양한 테이크다운',
    '기술 습득"이 아니라 그냥 "테이크다운"(또는 구체적으로 아는 하위 유형이 있다면 "Double Leg" 등)이어야 한다. 이 규칙을',
    '어기면 이후 단계에서 phrase로 실제 기술 데이터베이스를 검색했을 때 수식어 때문에 검색이 실패하거나 관련 없는 결과만',
    '나온다 — phrase는 항상 순수한 기술/카테고리 명사(구)여야 한다.',
    '',
    '매우 중요 — searchTopics(외부 검색용 주제):',
    '인터넷 검색에 사용할 깨끗한 영문/로마자 주제 phrase 1~3개를 searchTopics에 담는다(예: 사용자가 "테이크다운 다양성을',
    '알고 싶어"라고 했다면 searchTopics: ["wrestling takedown", "takedown techniques"] 같은 형태). 이 필드는 위',
    'desiredTechniques/goals 등과 별개다 — 그 필드들은 사용자의 원래 표현(한글 포함)을 보존하는 용도이고, searchTopics는',
    '순수하게 검색 엔진에 넣기 좋은, 한글이 섞이지 않은 영문/로마자 구(句)여야 한다. 한국어 고유명사를 로마자로 옮기는 것은',
    '괜찮지만, "다양한"/"습득" 같은 한국어 수식어를 영어 문장에 그대로 끼워넣지 않는다. 확신이 없으면 무술 이름 + 핵심 기술',
    '카테고리(영문)만으로 구성한다.',
    '',
    '사용자 텍스트에 특정 실존 선수의 이름이 "그 선수처럼", "~ 스타일로" 같은 형태로 명시적으로 등장하면 referencedFighterName에',
    '그 이름을 넣는다. 없으면 null.',
    '',
    '사용자가 입력한 내용(그리고 이미 선택한 무술/하루 훈련 시간)만으로 의미 있는 커리큘럼을 만들기 충분히 어렵다면(예: 텍스트가',
    '거의 비어 있거나 "몰라" 같은 경우) clarifyingQuestion에 가장 중요한 질문 하나만 한국어로 담는다. 이미 알고 있는 정보',
    '(무술, 하루 훈련 시간 등)는 다시 묻지 않는다. 충분한 정보가 있다면 clarifyingQuestion은 null이어야 한다.',
    '',
    `suggestedDurationDays는 목표와 추정 수준을 고려한 적절한 학습 기간(정수, ${GOAL_MIN_DURATION_DAYS}~${GOAL_MAX_DURATION_DAYS}일)이고,`,
    'durationReason은 그 기간을 고른 이유를 한국어 1문장으로 설명한다.',
    '',
    'summary는 "당신의 목표: ..." 형태로 쓸 수 있는 한국어 한 줄 요약이다.',
    input.martialArtHint === MMA_MARTIAL_ART_ID ? MMA_INSTRUCTION_ADDENDUM : '',
    '',
    '출력 형식(JSON 객체 하나):',
    '{',
    '  "martialArt": string,',
    '  "estimatedLevel": "beginner" | "intermediate" | "advanced",',
    '  "weaknesses": string[],',
    '  "desiredStyle": string[],',
    '  "desiredTechniques": string[],',
    '  "goals": string[],',
    '  "priority": string[],',
    '  "intents": ("attack" | "defense" | "escape" | "counter" | "connection" | "fundamentals")[],',
    '  "diversityRequested": boolean,',
    '  "searchTopics": string[],',
    '  "referencedFighterName": string | null,',
    '  "clarifyingQuestion": string | null,',
    '  "summary": string,',
    '  "suggestedDurationDays": number,',
    '  "durationReason": string',
    '}',
  ].join('\n');

  const contextParts = [`무술(선택됨): ${input.martialArtHint}`, `하루 훈련 가능 시간: ${input.dailyMinutes}분`];
  if (input.clarifyingAnswer) contextParts.push(`추가 질문에 대한 사용자 답변: ${input.clarifyingAnswer}`);
  if (input.refinementHistory && input.refinementHistory.length > 0) {
    contextParts.push(`이전 커리큘럼에 대한 사용자의 추가 요청들(반영할 것): ${input.refinementHistory.join(' / ')}`);
  }

  return askGeminiForJson<GoalAnalysis>({
    systemInstruction,
    contextText: contextParts.join('\n'),
    question: `사용자 입력: "${input.freeText.trim()}"`,
    validate: isGoalAnalysis,
  });
}
