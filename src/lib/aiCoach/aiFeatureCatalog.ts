// AI 코치 탭 — every MARTIALDEX feature that uses AI, in one catalog.
//
// The AI 코치 page renders this list, so the tab is the single place to find
// and start any AI feature. Each entry points at where the feature really
// runs (its own screen, or — for features that live inside another screen —
// a deep link that opens it there). `modules` lists the src/lib modules that
// make the AI calls; .devtools/test-ai-feature-catalog.mjs fails when a
// module that calls the AI is not listed here, so a new AI feature can't be
// left out of the tab.

export type AiFeatureGroup = 'coaching' | 'technique' | 'curriculum' | 'analysis' | 'fitness' | 'records';

export const AI_GROUP_LABEL: Record<AiFeatureGroup, string> = {
  coaching: '수업·코칭',
  technique: '기술·콤보·전술',
  curriculum: '커리큘럼·복습',
  analysis: '분석',
  fitness: '홈트·헬스·영양',
  records: '기록',
};

export const AI_GROUP_ORDER: AiFeatureGroup[] = ['coaching', 'technique', 'curriculum', 'analysis', 'fitness', 'records'];

export interface AiFeature {
  id: string;
  group: AiFeatureGroup;
  icon: string;
  title: string;
  description: string;
  /** Route that starts the feature. */
  to: string;
  /** Button label. */
  cta: string;
  /** Set when the feature runs inside another screen — tells the user where. */
  where?: string;
  /** Opens the AI 코치 chat modal instead of navigating. */
  action?: 'ask';
  /** src/lib modules (paths without extension) whose AI calls belong to this feature. */
  modules: string[];
  /** Stable test id for the card (kept for existing QA). */
  testId?: string;
}

export const AI_FEATURES: AiFeature[] = [
  // ---- 수업·코칭
  {
    id: 'oneoff-lesson',
    group: 'coaching',
    icon: '✍️',
    title: '수업하고 싶은 거 입력하기',
    description: '배우고 싶은 것을 말하면 실시간 검색 자료로 오늘 수업을 만들어 말·글로 대화하며 진행합니다. 수업 영상, 세트·휴식 타이머와 음성 응원 포함.',
    to: '/coach/lesson',
    cta: '오늘 수업 입력하기',
    modules: ['coachLesson/oneOff', 'coachLesson/analyzer', 'coachLesson/lessonVideos', 'voice/stt'],
    testId: 'oneoff-entry',
  },
  {
    id: 'personal-analysis',
    group: 'coaching',
    icon: '📊',
    title: '내 기록 분석·추천 (Personal Coach)',
    description: '저장된 훈련 기록을 근거로 부족한 부분과 다음 훈련, 추천 기술을 알려 주고 바로 수업이나 커리큘럼으로 이어 줍니다.',
    to: '/coach/lesson?mode=analysis',
    cta: '기록 분석 받기',
    modules: ['personalCoach/service'],
  },
  {
    id: 'coach-class',
    group: 'coaching',
    icon: '🧑‍🏫',
    title: 'AI 코치 수업 (집·체육관)',
    description: '운동 장소와 배운 기술·숙련도를 바탕으로 AI 코치가 수업 커리큘럼을 짜고, 1:1 수업으로 함께 진행합니다.',
    to: '/coach/class',
    cta: 'AI 코치 수업 시작',
    modules: ['aiCoachCurriculum/service', 'aiCoachDay/service'],
    testId: 'coach-class-entry',
  },
  {
    id: 'visual-mitt',
    group: 'coaching',
    icon: '🥊',
    title: 'AI Visualizing Mitt',
    description: '미트나 파트너 없이 화면의 미트·목표 지점·발 위치를 보며 타격 콤보와 테이크다운 진입을 반복합니다. 말로 콤보·셋업을 요청할 수 있습니다.',
    to: '/coach/mitt',
    cta: 'Visualizing Mitt 시작',
    modules: ['visualMitt/aiPlan'],
    testId: 'visual-mitt-entry',
  },
  {
    id: 'ask',
    group: 'coaching',
    icon: '✦',
    title: 'AI 코치에게 질문',
    description: '내 학습 기록을 아는 AI 코치에게 자유롭게 질문합니다. 기술 상세·커리큘럼 Day·스파링 결과 화면에서는 그 내용을 바탕으로 물어볼 수 있습니다.',
    to: '/coach',
    cta: '✦ AI에게 직접 물어보기',
    action: 'ask',
    modules: ['ai/useAiChat', 'aiCoach/coachService'],
  },

  // ---- 기술·콤보·전술
  {
    id: 'ai-combo',
    group: 'technique',
    icon: '🥋',
    title: 'AI 콤비네이션 생성',
    description: '목적을 말하면 실제 기술 DB에서 콤보 순서를 만들고, 내 숙련도를 반영해 콤보 북에 저장·훈련합니다.',
    to: '/ai-combo',
    cta: '콤보 만들기',
    modules: ['aiCombo/goalAnalysis'],
  },
  {
    id: 'situation',
    group: 'technique',
    icon: '🎯',
    title: '상황별 기술 추천',
    description: '"상대가 계속 압박해" 같은 실제 상황을 설명하면 대응 기술을 찾아 줍니다.',
    to: '/situation',
    cta: '상황 추천 받기',
    modules: ['situationRecommend/recommendationService'],
  },
  {
    id: 'tactic-feedback',
    group: 'technique',
    icon: '🧩',
    title: '전술 셋업 AI 피드백',
    description: '내가 만든 전술 셋업의 흐름과 약점을 AI가 검토해 줍니다.',
    to: '/tactics',
    cta: '전술 피드백 받기',
    where: '전술 셋업 목록의 각 전술에서 "✦ AI 피드백 받기"',
    modules: ['tactic/feedback'],
  },
  {
    id: 'technique-request',
    group: 'technique',
    icon: '🔎',
    title: '없는 기술 요청 (AI 조사·검증)',
    description: '찾는 기술이 없으면 AI가 웹 자료로 조사·검증한 뒤 중복을 확인하고 기술로 등록합니다.',
    to: '/techniques/request',
    cta: '기술 요청하기',
    modules: ['userTechniques/recordGenerator', 'userTechniques/verification', 'userTechniques/duplicateCheck', 'martialArtDiscovery/aiVerification'],
  },
  {
    id: 'art-request',
    group: 'technique',
    icon: '🌏',
    title: '새 무술 추가 (AI 조사·검증)',
    description: 'MARTIALDEX에 없는 무술을 AI가 조사하고 검증해 추가합니다.',
    to: '/arts/add',
    cta: '무술 추가하기',
    modules: ['martialArtDiscovery/aiVerification'],
  },
  {
    id: 'video-verify',
    group: 'technique',
    icon: '▶',
    title: '기술 영상 확인·추가',
    description: 'YouTube 영상을 기술에 추가할 때 AI가 실제 영상 정보를 읽고 그 기술을 가르치는 영상인지 확인합니다.',
    to: '/techniques',
    cta: '기술 목록으로',
    where: '기술 상세의 영상 선택 → "URL 직접 추가"',
    modules: ['techniqueVideo/urlVerification'],
  },
  {
    id: 'pose',
    group: 'technique',
    icon: '📷',
    title: 'AI 자세 분석 (카메라)',
    description: '카메라로 자세를 분석해 점수와 교정 포인트를 알려 주고, 결과를 바탕으로 AI 코치에게 물어볼 수 있습니다.',
    to: '/techniques',
    cta: '기술 고르기',
    where: '기술 상세 또는 오늘의 훈련에서 "자세 분석하기"',
    modules: [],
  },

  // ---- 커리큘럼·복습
  {
    id: 'ai-curriculum',
    group: 'curriculum',
    icon: '📘',
    title: 'AI 맞춤 커리큘럼',
    description: '목표를 말하면 기술을 조사해 나만의 커리큘럼을 만듭니다. MMA 목표도 지원합니다.',
    to: '/ai-curriculum',
    cta: '커리큘럼 만들기',
    modules: ['aiCurriculum/goalAnalysis', 'aiCurriculum/techniqueResearch', 'mmaCurriculum/mmaAnalysis'],
  },
  {
    id: 'fighter-style',
    group: 'curriculum',
    icon: '🏆',
    title: '선수 스타일 학습',
    description: '닮고 싶은 선수를 말하면 AI가 선수와 스타일을 확인하고 그 스타일을 배우는 커리큘럼을 만듭니다.',
    to: '/fighter-style',
    cta: '선수 스타일 배우기',
    modules: ['fighterStyle/fighterIdentification', 'fighterStyle/styleAnalysis', 'fighterStyle/durationAdvisor'],
  },
  {
    id: 'review',
    group: 'curriculum',
    icon: '🔁',
    title: 'AI 추천 복습',
    description: '복습 예정일·점수 변화·스파링 사용·부족 기술 기록을 바탕으로 오늘 복습할 기술과 방법을 정리합니다. (복습 메인에서 다른 4가지 복습도 고를 수 있습니다)',
    to: '/review/ai',
    cta: '복습 보기',
    modules: ['reviewSystem/reviewAiService'],
  },

  // ---- 분석
  {
    id: 'sparring',
    group: 'analysis',
    icon: '🎥',
    title: '스파링 영상 AI 분석',
    description: '스파링 영상의 주요 장면을 분석해 사용한 기술과 코칭 포인트, 개선 커리큘럼을 제안합니다.',
    to: '/sparring',
    cta: '스파링 분석',
    modules: ['sparringAnalysis/visualEventAnalysis', 'sparringAnalysis/techniqueHypothesis', 'sparringAnalysis/coachingSynthesis'],
  },
  {
    id: 'training-analysis',
    group: 'analysis',
    icon: '📈',
    title: '훈련 기록 AI 분석',
    description: '최근 훈련 기록을 AI가 분석해 패턴과 다음 훈련 방향을 알려 줍니다.',
    to: '/training-analytics',
    cta: '훈련 분석 보기',
    where: '훈련 분석 화면의 "🤖 AI 훈련 분석"',
    modules: ['trainingAnalytics/aiAnalysis'],
  },
  {
    id: 'stats-summary',
    group: 'analysis',
    icon: '📊',
    title: '나의 통계 AI 요약',
    description: '통계 화면의 숫자를 AI가 한눈에 읽히는 요약으로 정리합니다.',
    to: '/stats',
    cta: '통계 요약 보기',
    where: '나의 통계 화면의 "🤖 AI 학습 요약"',
    modules: ['statsHub/aiSummaryService'],
  },
  {
    id: 'my-style',
    group: 'analysis',
    icon: '🧭',
    title: '나의 스타일 분석',
    description: '실제 학습·스파링 데이터로 내 스타일을 분석하고 목표 선수·스타일과 비교해 우선 학습할 부분을 추천합니다.',
    to: '/my-style',
    cta: '나의 스타일 보기',
    modules: ['myStyle/styleAnalysisEngine'],
  },

  // ---- 홈트·헬스·영양
  {
    id: 'home-curriculum',
    group: 'fitness',
    icon: '🏠',
    title: '홈트 AI 맞춤 커리큘럼',
    description: '목적을 입력하면 격투기 움직임까지 포함한 홈트레이닝 커리큘럼을 AI가 만듭니다.',
    to: '/home-training',
    cta: '홈트 커리큘럼 만들기',
    modules: ['homeTraining/goalAnalysis'],
  },
  {
    id: 'home-request',
    group: 'fitness',
    icon: '🧘',
    title: '홈트 운동 요청 (AI 조사·검증)',
    description: '없는 홈트 운동을 AI가 조사·검증해 추가합니다.',
    to: '/home-training/request',
    cta: '홈트 운동 요청',
    modules: ['homeTrainingDiscovery/recordGenerator', 'homeTrainingDiscovery/verification'],
  },
  {
    id: 'gym-request',
    group: 'fitness',
    icon: '🏋️',
    title: '헬스 운동 요청 (AI 조사·검증)',
    description: '없는 헬스 운동을 AI가 조사·검증해 추가합니다.',
    to: '/training/exercises/request',
    cta: '헬스 운동 요청',
    modules: ['gymTrainingDiscovery/recordGenerator', 'gymTrainingDiscovery/verification'],
  },
  {
    id: 'meal-gen',
    group: 'fitness',
    icon: '🍱',
    title: 'AI 식단 만들기',
    description: '목표를 말하면 내 영양 목표에 맞는 하루 식단을 AI가 짭니다.',
    to: '/nutrition?ai=gen',
    cta: '식단 만들기',
    where: '오늘의 영양 화면에서 열립니다',
    modules: ['nutrition/aiMealGen'],
  },
  {
    id: 'meal-text',
    group: 'fitness',
    icon: '📝',
    title: '말로 식사 기록',
    description: '"점심에 김치찌개랑 밥 한 공기"처럼 적으면 AI가 음식과 영양소로 바꿔 기록합니다.',
    to: '/nutrition?ai=text',
    cta: '글로 기록하기',
    where: '오늘의 영양 화면에서 열립니다',
    modules: ['nutrition/aiMealParse'],
  },
  {
    id: 'meal-photo',
    group: 'fitness',
    icon: '📸',
    title: '사진으로 식사 기록',
    description: '음식 사진을 찍으면 AI가 음식과 양을 추정해 기록합니다.',
    to: '/nutrition?ai=photo',
    cta: '사진으로 기록하기',
    where: '오늘의 영양 화면에서 열립니다',
    modules: ['nutrition/aiPhotoAnalysis'],
  },

  // ---- 기록
  {
    id: 'ai-history',
    group: 'records',
    icon: '🗂',
    title: 'AI 질문 기록',
    description: '기술 상세·자세 분석·커리큘럼·AI 코치에서 AI에게 물었던 대화를 다시 봅니다. 로그인하면 계정에 저장됩니다.',
    to: '/ai-history',
    cta: '질문 기록 보기',
    modules: ['aiHistory/service'],
  },
];

export function aiFeaturesByGroup(group: AiFeatureGroup | 'all'): AiFeature[] {
  return group === 'all' ? AI_FEATURES : AI_FEATURES.filter((f) => f.group === group);
}

/**
 * Screens that are wholly an AI feature and now live under the AI 코치 tab
 * (no longer in other menus) — the header highlights "AI 코치" on them.
 */
export const AI_COACH_PATHS = ['/coach', '/ai-combo', '/situation', '/ai-curriculum', '/fighter-style', '/sparring', '/my-style', '/ai-history', '/personal-coach'];

export function isAiCoachPath(pathname: string): boolean {
  // /sparring/record (스파링 촬영) belongs to the 훈련 menu, not the AI tab.
  if (pathname.startsWith('/sparring/record')) return false;
  return AI_COACH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
