# MARTIALDEX

9개 무술(주짓수, 가라테, 레슬링, 무에타이, 복싱, 삼보, 유도, 킥복싱, 태권도), 1,250개 이상의
기술을 포지션·카테고리·난이도별로 찾아보는 무술 기술 백과사전 데스크톱 앱입니다.

- Electron + React + TypeScript + Vite
- 데이터는 전부 `data/raw/*.md` 문서에서 파싱해 만든 정적 JSON (별도 백엔드/DB 없음)
- 검색, 필터, 즐겨찾기, 최근 본 기술, 기술별 YouTube 튜토리얼, AI 질문 기능 포함
- YouTube 관련 영상은 YouTube Data API 없이 사람이 직접 확인한 영상만 수동 등록
- AI 질문 기능은 Google Gemini API 사용, API 키는 Electron 메인 프로세스에만 존재 (렌더러에 노출 안 됨)
- "학습" 메뉴: 9개 무술 각각의 추천 커리큘럼(Martialdex가 실제 기술 데이터로 설계) + 사용자가 직접
  만드는 커스텀 커리큘럼 + 공유 코드를 통한 커리큘럼 주고받기
- 기술 상세 페이지의 "📷 자세 분석": 카메라 + MediaPipe Pose(무료, 완전 로컬 처리)로 자세를 분석해
  참고용 점수를 계산 — 유료 API 없음, 영상은 저장하지 않고 결과만 로컬에 저장
- "선수 스타일 학습" 메뉴: 좋아하는 선수 이름을 자연어로 입력하면 Gemini가 공개 정보 기반 스타일을
  분석하고, 실제 Martialdex 기술과 매칭한 뒤, 기간/강도/수준에 맞춘 맞춤 커리큘럼을 생성 — 기존
  커리큘럼/YouTube/AI/자세 분석 기능을 전부 재사용
- "AI 개인 코치"(`/coach`) · "오늘의 훈련"(`/today-training`) · "나의 기술" 대시보드: 커리큘럼
  진행 기록과 카메라 자세 분석 점수를 종합해 기술별 숙련도(5단계)를 계산하고, 개선이 필요한 기술
  TOP 5와 오늘 할 학습을 추천 — 기술 추천은 전부 결정론적 코드가 고르고, Gemini는 그 이유를
  자연어로 설명하는 역할만 담당
- "스파링 분석"(`/sparring`): 실제 스파링/대련 영상을 업로드하고 영상에서 본인을 직접 지정하면,
  로컬 MediaPipe Pose로 자세·움직임을 분석 — 영상 파일은 저장/외부 전송하지 않으며, 기술 실행의
  성공/확정 여부처럼 신뢰할 근거가 없는 항목은 점수를 만들지 않고 표시하지 않음
- "기술 그래프"(`/graph`): 기술 상세 페이지의 실제 데이터(연결 기술/카운터/방어/포지션)를
  가지고 선행·다음·카운터·탈출·같은 포지션 관계를 실제 다른 기술로만 연결해 시각화 — 노드 색은
  나의 숙련도(14단계)를 반영

## 실행 방법

### 요구 사항

- Node.js 18 이상
- npm

### 설치

```bash
npm install
```

### 개발 모드 (Electron 창으로 실행)

```bash
npm run dev
```

Vite 개발 서버(`localhost:5173`)와 Electron을 동시에 띄웁니다. 코드/데이터를 수정하면
바로 반영됩니다(HMR).

### 브라우저에서만 미리보기 (Electron 없이)

```bash
npm run dev:vite
```

이 모드에서는 Electron의 `contextBridge`가 없으므로 YouTube 외부 링크 열기, AI 질문 기능은
동작하지 않습니다(AI 모달은 "데스크톱 앱에서만 사용할 수 있습니다" 안내를 표시).

### Production 빌드

```bash
npm run build
```

`dist/renderer/`에 정적 파일이 생성됩니다. 빌드 오류/타입 오류 확인만 하려면:

```bash
npx tsc --noEmit
npm run build
```

### 빌드된 앱을 Electron으로 실행

```bash
npm run electron
```

## 폴더 구조

```
MARTIALDEX/
├─ data/
│  ├─ raw/            # 원본 마크다운 (무술별 1개 파일) — 데이터의 원천
│  ├─ processed/       # scripts/parse-techniques.mjs가 raw/*.md를 파싱해 생성한 JSON
│  │  ├─ bjj.json, judo.json, ...   # 무술별 기술 목록
│  │  ├─ _all.json                 # 전체 기술을 한 배열로 합친 것
│  │  └─ _meta.json                # 파싱 통계(생성 시각, 무술별 추출 개수 등)
│  ├─ curated/
│  │  ├─ videos.json         # 기술별 수동 큐레이션 YouTube 영상 (최대 2개/기술)
│  │  ├─ CURATION.md         # videos.json 작성 규칙
│  │  ├─ poseAnalysis.json   # 기술별 카메라 자세 분석 설정 (아래 "카메라 자세 분석" 참고)
│  │  └─ POSE_ANALYSIS.md    # poseAnalysis.json 작성 규칙
│  └─ curriculum/official/
│     ├─ bjj.json, judo.json, ...  # 무술별 "Martialdex 추천 커리큘럼" (아래 참고)
│     └─ _summary.json             # 생성 스크립트가 남기는 무술별 Day 수 요약
├─ electron/
│  ├─ main.cjs         # Electron 메인 프로세스, 창 생성 + IPC 핸들러 + 카메라 권한 허용
│  ├─ preload.cjs      # contextBridge로 렌더러에 안전한 API만 노출
│  └─ gemini.cjs        # Gemini REST API 호출 (메인 프로세스 전용, API 키를 여기서만 사용)
├─ public/mediapipe/     # MediaPipe Pose용 WASM 런타임 + 모델 파일 (로컬 번들, 네트워크 요청 없음)
├─ scripts/
│  ├─ parse-techniques.mjs      # data/raw/*.md -> data/processed/*.json 파서
│  ├─ generate-curriculum.mjs   # data/processed/*.json -> data/curriculum/official/*.json 생성기
│  └─ validate-pose-config.mjs  # poseAnalysis.json의 기술 id/지표 id가 실제로 존재하는지 검증
├─ src/
│  ├─ components/       # AiAskModal, Header, SearchBar, TechniqueRow, RelatedVideos,
│  │                    # PoseAnalysisModal, PoseHistoryModal, ScoreHistoryChart,
│  │                    # SparringResultView, TrendChart, ...
│  ├─ pages/            # Home, MartialArtsList, ..., LearningHub, CurriculumList,
│  │                    # CurriculumDayList, CurriculumDayDetail, CurriculumEditor, Community,
│  │                    # MySkills, FighterStyleLearning, AiCoach, TodayTraining,
│  │                    # SparringAnalysis, SparringSessionDetail, TechniqueGraph,
│  │                    # SituationRecommend, MyStats
│  ├─ lib/
│  │  ├─ loadData.ts    # processed JSON + curated videos를 로드/병합, 조회 함수 제공
│  │  ├─ search.ts      # 검색(정확 일치 + Fuse.js 퍼지 매칭) & 필터 로직
│  │  ├─ userData.ts    # 즐겨찾기 / 최근 본 기술 (localStorage)
│  │  ├─ theme.ts        # 다크/라이트/시스템 테마
│  │  ├─ youtube.ts, externalLink.ts  # YouTube 검색 URL 빌더, 외부 링크 열기
│  │  ├─ ai/            # AI 기능 (provider/컨텍스트/시스템 지침/훅 분리 — 아래 참고)
│  │  ├─ curriculum/    # 학습 커리큘럼 기능 (아래 "학습 커리큘럼 시스템" 참고)
│  │  ├─ poseAnalysis/  # 카메라 자세 분석 기능 (아래 "카메라 자세 분석" 참고)
│  │  ├─ fighterStyle/  # AI 선수 스타일 학습 (아래 "선수 스타일 학습" 참고)
│  │  ├─ trainingHistory/  # "오늘의 훈련"/커리큘럼 Day 완료 기록 로그 (아래 "AI 개인 코치" 참고)
│  │  ├─ skillProgress/    # 기술별 숙련도 계산 + 약점 랭킹 (아래 "AI 개인 코치" 참고)
│  │  ├─ todayTraining/    # "오늘의 훈련" 플래너 + 세션 상태 (아래 "AI 개인 코치" 참고)
│  │  ├─ aiCoach/          # AI 개인 코치 추천 엔진 + Gemini 연동 (아래 "AI 개인 코치" 참고)
│  │  ├─ sparringAnalysis/ # 실제 스파링 영상 분석 (아래 "실제 스파링 영상 기반 AI 분석" 참고)
│  │  ├─ techniqueGraph/   # 기술 연결 그래프 데이터 (아래 "기술 연결 그래프" 참고)
│  │  ├─ situationRecommend/ # 상황별 AI 기술 추천 (아래 "상황별 AI 기술 추천" 참고)
│  │  └─ statsHub/         # 종합 훈련 기록/통계 집계 (아래 "종합 훈련 기록 및 통계 시스템" 참고)
│  ├─ types.ts           # Technique, MartialArtSummary 등 공통 타입
│  └─ styles/global.css  # 전체 스타일 (라이트/다크 테마 변수 포함)
├─ .devtools/            # Playwright 기반 QA 스크립트 (배포에 포함되지 않음)
├─ .env.example           # 필요한 환경변수 템플릿
└─ .env                   # 실제 키 (gitignore됨, 직접 생성)
```

## 데이터 구조

### 원본 → 처리 파이프라인

```
data/raw/<무술>_포지션별_기술_백과사전.md
        │  npm run parse (scripts/parse-techniques.mjs)
        ▼
data/processed/<martialArtId>.json  +  _all.json  +  _meta.json
        │  런타임에 로드 (src/lib/loadData.ts)
        ▼
data/curated/videos.json 를 기술별로 병합
        ▼
앱에서 사용하는 Technique[] (src/types.ts)
```

### `Technique` (핵심 필드)

```ts
interface Technique {
  id: string;              // "<martialArt>__<slug>", 예: "bjj__armbar"
  martialArt: string;       // "bjj", "judo", ...
  name: string;              // 기술명(원문 표기, 보통 영문/로마자)
  koreanName: string | null; // 한국어 이름
  aliases: string[];
  category: string;          // 문서의 상위 섹션 제목
  positions: string[];       // 관련 포지션들
  description: string;
  purpose: string | null;    // "언제/왜 쓰는가"
  principles: string[];
  variations: string[];
  counters: string[];
  defenses: string[];
  transitions: string[];     // "A → B" 형태로 문서에 명시된 연결 기술
  relatedTechniques: string[]; // 다른 기술의 id
  relatedMartialArts: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  tags: string[];             // "martialArt:...", "category:...", "#Sweep" 등
  youtubeSearchQuery: string | null;
  videos: CuratedVideo[];      // data/curated/videos.json에서 런타임에 병합됨
}
```

**중요한 원칙**: 파서(`scripts/parse-techniques.mjs`)는 원문 마크다운에 실제로 쓰여 있지
않은 내용을 만들어내지 않습니다. 설명/목적/원리 등이 비어 있으면 그냥 빈 문자열/빈 배열이며,
UI(`TechniqueDetail.tsx`)도 빈 필드는 렌더링하지 않습니다. AI 기능도 이 원칙을 따라 앱
데이터에 없는 내용을 앱의 공식 데이터인 것처럼 답하지 않도록 지침이 걸려 있습니다.

## Markdown 추가 방법 (새 무술 / 기술 추가)

1. `data/raw/`에 `<무술이름>_포지션별_기술_백과사전.md` 형식으로 파일을 추가합니다.
   (한글 무술명을 새로 추가하는 경우 `scripts/parse-techniques.mjs`의
   `MARTIAL_ART_ID_MAP`에 `id`/`nameEn`을 등록해두면 더 깔끔한 id/영문명이 나옵니다.
   등록하지 않아도 파일명 기반 슬러그로 자동 처리됩니다.)
2. 문서 구조는 기존 `data/raw/*.md` 파일들을 참고하세요. 대략적인 관례:
   - `#`/`##` 제목 → 카테고리로 매핑
   - 각 기술은 `### 이름 (English Name)` 형태의 하위 제목 또는 목록 항목
   - "주요 용도 / 언제·왜 쓰는가", "카운터", "방어", "연결" 같은 라벨이 붙은 목록은
     각각 `purpose`, `counters`, `defenses`, `transitions` 필드로 매핑됩니다.
   - `A → B` 화살표 표기는 `transitions`(연결 기술)로 인식됩니다.
   - 이미 존재하는 기술명과 정확히 일치하는 텍스트는 `relatedTechniques`로 자동 연결됩니다.
3. 파서를 다시 실행합니다.
   ```bash
   npm run parse
   ```
   `data/processed/<id>.json`, `_all.json`, `_meta.json`이 갱신됩니다. 앱은 이 폴더를
   `import.meta.glob`으로 자동으로 읽으므로(`src/lib/loadData.ts`) 코드 수정 없이 새 무술이
   바로 나타납니다.
4. 새로 추가된 기술에 대해 YouTube 영상을 등록하려면 아래 "YouTube 설정" 절차를 따릅니다.

## YouTube 영상 설정 (API 사용 안 함)

이 앱은 **YouTube Data API를 사용하지 않습니다.** 기술 상세 페이지의 "관련 영상"은
`data/curated/videos.json`에 사람이 직접 검색해서 실존을 확인한 영상만 수동으로 등록한
것입니다.

- 파일: `data/curated/videos.json`, 규칙 문서: `data/curated/CURATION.md`
- 구조:
  ```json
  {
    "bjj__armbar": [
      { "title": "실제 영상 제목", "videoId": "실제 11자리 유튜브 ID", "channel": "채널명" }
    ]
  }
  ```
- 키는 `data/processed/<martialArt>.json`의 기술 `id`와 정확히 일치해야 합니다.
- 기술당 최대 2개, 검증 안 된 영상 ID는 넣지 않습니다. 적절한 영상이 없으면 키를
  생략하거나 빈 배열로 둡니다 — 둘 다 UI에서 "아직 등록된 영상이 없습니다 + YouTube에서
  검색" 버튼으로 동일하게 처리됩니다 (`src/components/RelatedVideos.tsx`).
- 이 파일은 `npm run parse`로 덮어써지지 않습니다. 런타임에 `src/lib/loadData.ts`가
  `data/processed/*.json`과 별도로 읽어서 각 기술의 `videos` 필드에 병합합니다.
- 등록된 영상은 `<iframe src="https://www.youtube.com/embed/{videoId}">`로 직접
  임베드되고(별도 API 호출 없음), 등록되지 않은 기술은 `https://www.youtube.com/results?...`
  검색 페이지를 여는 버튼만 보여줍니다(`src/lib/youtube.ts`, `src/lib/externalLink.ts`).

## AI 질문 기능 (Google Gemini API)

- 사용 API: **Google Gemini API** (Claude/OpenAI 아님)
- 기본 모델: `gemini-3.6-flash` (무료 등급에서 사용 가능한 Flash 계열 모델. 계정/시점에 따라
  사용 가능한 모델이 바뀔 수 있으므로 `GEMINI_MODEL` 환경변수로 다른 모델명으로 교체 가능)
- **API 키는 렌더러(프론트엔드)/APK 어디에도 절대 등장하지 않습니다.** 플랫폼별로 다른
  전송 경로를 쓰지만 둘 다 키를 클라이언트 코드에서 완전히 분리합니다:
  - **Electron(데스크톱)**: 메인 프로세스(`electron/gemini.cjs`)에서만
    `process.env.GEMINI_API_KEY`를 읽어 Gemini REST API를 직접 호출합니다. 렌더러는
    `contextBridge`로 노출된 `window.martialdex.askAi(...)`
    (`electron/preload.cjs` → IPC `ai:ask` → `electron/main.cjs` → `electron/gemini.cjs`)를
    통해 질문/컨텍스트를 보내고 답변 텍스트만 돌려받습니다.
  - **Android(Capacitor)/향후 순수 웹 배포**: Electron 같은 "메인 프로세스"가 없으므로
    대신 Supabase Edge Function(`supabase/functions/gemini-ask/index.ts`)을 HTTP로
    호출합니다 — 키는 이 함수의 서버 측 환경에만 존재합니다. 자세한 내용/배포 방법은
    아래 "Android 테스트 빌드 (Capacitor)" 참고.
  - 두 경로 모두 `src/lib/ai/provider.ts`의 `aiProvider.ask(...)` 뒤에 숨겨져 있어 UI
    컴포넌트는 지금 어느 플랫폼에서 실행 중인지 전혀 알 필요가 없습니다.
- 프론트엔드 코드 구조 (`src/lib/ai/`):
  - `types.ts` — provider 중립적인 요청/응답 타입
  - `context.ts` — 현재 기술(또는 홈의 무술 목록)의 실제 앱 데이터로 컨텍스트 텍스트 생성
  - `systemInstruction.ts` — AI의 역할/답변 형식/안전 안내 지침
  - `provider.ts` — `window.martialdex.askAi`(Electron) 또는 Supabase Edge Function
    HTTP 호출(Android/웹)을 감싸는 `AiProvider` 인터페이스 — 플랫폼 분기는 이 파일
    안에서만 일어나고, 이 파일을 가져다 쓰는 쪽은 신경 쓸 필요 없음
  - `chatStore.ts` / `useAiChat.ts` — 세션 동안만 유지되는 대화 기록(메모리, 앱 재시작 시
    초기화), 동일 질문 재전송 시 캐시된 답변 재사용, 최근 6턴만 API에 재전송
- UI: `src/components/AiAskModal.tsx` — 기술 상세 페이지에서는 현재 기술 데이터를 컨텍스트로
  전달, 헤더/홈에서는 전체 무술 목록을 컨텍스트로 전달.

## 학습 커리큘럼 시스템

"학습" 메뉴(`/learning`)는 세 가지로 구성됩니다: (1) Martialdex가 설계한 무술별 추천
커리큘럼, (2) 사용자가 직접 만드는 커스텀 커리큘럼, (3) 커스텀 커리큘럼을 다른 사람과
주고받는 공유 기능(`/community`).

### 1) 공식 추천 커리큘럼 — 무술별 Day 수

`scripts/generate-curriculum.mjs`가 `data/processed/<art>.json`의 **실제 기술
데이터**(category/difficulty/원문 순서)만 참조해서 생성합니다. 존재하지 않는 기술 id를
만들어내지 않으며, 생성 시 모든 techniqueId/reviewTechniqueId가 실제 데이터에 존재하는지
검증하고 하나라도 어긋나면 즉시 실패합니다. UI에는 "Martialdex 추천 학습 순서"라고만
표시하고, 실제 체육관들의 공식 커리큘럼이라고 주장하지 않습니다.

| 무술 | Day 수 | 사용 기술 수 | 구성 단계(phase) 수 |
| --- | --- | --- | --- |
| 주짓수 (bjj) | 53 | 129 / 319 | 10 |
| 가라테 (karate) | 35 | 88 / 88 | 8 |
| 레슬링 (wrestling) | 39 | 97 / 189 | 10 |
| 무에타이 (muay-thai) | 35 | 77 / 94 | 7 |
| 복싱 (boxing) | 34 | 83 / 135 | 7 |
| 삼보 (sambo) | 50 | 86 / 91 | 8 |
| 유도 (judo) | 45 | 103 / 133 | 11 |
| 킥복싱 (kickboxing) | 39 | 92 / 121 | 9 |
| 태권도 (taekwondo) | 44 | 80 / 83 | 8 |

각 무술은 서로 다른 단계(phase) 구조를 가집니다 — 예를 들어 BJJ는 `기본 움직임 → 스탠딩/
테이크다운 → 기본 포지션 → 가드 기초 → 가드 응용 → 이스케이프 → 가드 패스 → 기본
서브미션 → 레그락/백 서브미션 → 포지션 전환` 순서이고, 복싱은 `기본 자세/풋워크 → 기본
펀치 → 기본 방어 → 거리 조절 → 콤비네이션 → 방어-공격 연결 → 상황별 응용` 순서입니다.
전체 단계 구성은 `scripts/generate-curriculum.mjs`의 `BLUEPRINTS` 객체에서 확인할 수
있습니다. 매일 같은 수의 기술을 넣지 않고(하루 2~4개), 관절기·던지기·조르기처럼 부상
위험이 큰 구간은 더 적은 기술/하루로 천천히 배정했습니다. 백과사전에는 모든 기술이
있지만, 추천 커리큘럼은 "초보자부터 단계적으로 배우기 좋은 핵심 기술" 위주로 일부만
선택합니다(위 표의 "사용 기술 수" 참고).

데이터를 다시 만들려면(예: `npm run parse`로 원본 데이터가 바뀐 뒤):

```bash
node scripts/generate-curriculum.mjs
```

### 2) 아키텍처 — UI / Service / Repository 분리

이 프로젝트는 사용자 계정이나 서버 DB가 없으므로, 지금 억지로 Firebase/Supabase 같은
백엔드를 새로 붙이지 않고 **로컬(localStorage) 구현 + 나중에 원격 구현으로 교체 가능한
인터페이스**로 만들었습니다.

```
UI (pages/Curriculum*.tsx, Community.tsx)
   ↓  (직접 storage를 호출하지 않음)
curriculumService.ts   — 진행도 계산, Day/기술 편집 헬퍼, 복사/가져오기 로직
   ↓
CurriculumRepository (interface, repository.ts)
   ↓
LocalCurriculumRepository (지금 유일한 구현체 — localStorage)
   → 나중에: RemoteCurriculumRepository (Firebase/Supabase 등)로 교체 가능,
     UI/서비스 코드는 수정할 필요 없음
```

- `src/lib/curriculum/types.ts` — `Curriculum`, `CurriculumDay`, `CurriculumProgress` 등 공통 타입
- `src/lib/curriculum/officialData.ts` — `data/curriculum/official/*.json`을 `import.meta.glob`으로 로드
- `src/lib/curriculum/repository.ts` — `CurriculumRepository` 인터페이스 + localStorage 구현
- `src/lib/curriculum/curriculumService.ts` — UI가 실제로 호출하는 함수들(아래 참고)
- `src/lib/curriculum/shareCode.ts` — 공유 코드 인코딩/디코딩
- `src/lib/curriculum/useCurriculum.ts` — 다른 탭/페이지의 변경사항을 반영하는 React 훅

### 3) 학습 진행도 저장

`CurriculumProgress { curriculumId, currentDay, completedDays, startedAt, lastStudiedAt,
progress }`를 커리큘럼별로 localStorage(`martialdex:curricula:progress`)에 저장합니다.
여러 무술을 동시에 학습해도 각 커리큘럼마다 별도로 진행도가 유지됩니다(예: BJJ → Day 12,
복싱 → Day 5). 앱을 껐다 켜도 유지되며(Electron이 localStorage를 사용자 프로필에 보존),
"오늘 학습하기"는 완료하지 않은 가장 앞선 Day를 자동으로 엽니다
(`curriculumService.resolveTodayDay`).

### 4) 커스텀 커리큘럼

`/learning/new`에서 이름/설명/대표 무술/공개 여부/커버 아이콘을 설정하고, Day를
추가·삭제·순서 변경하며, 각 Day에 실제 기술 검색 UI(`src/lib/search.ts` 재사용)로 기술을
추가/제거할 수 있습니다. **직접 가짜 기술을 만들 수는 없고**, 항상 기존 백과사전의 실제
기술만 선택합니다. 여러 무술의 기술을 한 커리큘럼에 섞을 수 있습니다(예: "나의 MMA 기초
30일"에 복싱 잽 + 레슬링 스탠스 + BJJ 클로즈드 가드를 함께 넣기).

### 5) 공유 — 지금은 "공유 코드", 나중엔 온라인 커뮤니티

이 프로젝트는 사용자 계정/서버가 없으므로, 진짜 여러 사용자 간 공유는 지금 당장은
서버 없이는 만들 수 없습니다. 그래서 억지로 가짜 "다른 사용자의 커리큘럼"을 만들어
보여주지 않고, 대신 **공유 코드**(base64로 인코딩한 커리큘럼 JSON, `MDCUR1.`로 시작)로
실제로 작동하는 로컬-우선 공유를 구현했습니다.

- `/community`(커뮤니티)에서 "공유 코드 복사" 버튼으로 자신의 공개/링크 공개 커리큘럼을
  코드로 만들어 채팅·이메일 등으로 전달할 수 있습니다.
- 상대방은 같은 페이지의 "공유 코드로 가져오기"에 코드를 붙여넣으면, 미리보기(제목·
  작성자·Day 수·기술 수) 확인 후 "내 커리큘럼에 추가"로 **자신의 커리큘럼 목록에 새 복사본**을
  만듭니다. 원본은 전혀 변경되지 않습니다(`curriculumService.copyToMyCurricula`).
- 가져오기 시 이 앱 버전에 없는 기술 id는 자동으로 걸러내고 몇 개가 제외됐는지 알려줍니다
  (`shareCode.ts`의 `decodeShareCode`).
- 커뮤니티 페이지는 무술/난이도/검색어로 필터링할 수 있고, 정렬은 최신순/인기순(좋아요+
  사용 횟수)을 지원합니다. **단, `likes`/`usageCount`는 지금은 이 기기에서만 의미 있는
  로컬 카운터**입니다 — 진짜 여러 사용자의 좋아요를 집계하려면 위 아키텍처의 Repository를
  원격 구현으로 교체해야 합니다. 이 한계는 커뮤니티 페이지 상단에도 그대로 안내합니다.

### 6) 안전 안내

커리큘럼은 "학습·이론 정리용 추천 순서"이며, 학습 허브·Day 상세 페이지 곳곳에 관절기·
조르기·던지기·타격처럼 부상 위험이 있는 기술은 전문 지도자의 지도와 안전한 훈련 환경이
필요하다는 안내를 배치했습니다. 커리큘럼 생성기도 관절기/던지기 구간의 phase blurb에
같은 안내를 포함하고, 하루에 배정하는 기술 수를 더 적게 유지합니다.

### 7) AI / YouTube 연동

- Day 상세 페이지의 "AI에게 질문"은 `src/lib/ai/context.ts`의 `buildDayContext()`가 그
  Day의 실제 `techniqueIds`/`reviewTechniqueIds`만 컨텍스트로 구성합니다(다른 Day나
  커리큘럼 전체 데이터는 섞지 않음). Gemini 연동 자체는 기존 AI 기능(`electron/gemini.cjs`)을
  그대로 재사용합니다 — 새 API 키/엔드포인트를 추가하지 않았습니다.
- Day의 각 기술 아래에는 기존 `RelatedVideos` 컴포넌트를 그대로 재사용해 YouTube 영상을
  보여줍니다. YouTube Data API는 여기서도 사용하지 않습니다.

### 알려진 제한 / 다음에 할 수 있는 일

- Day/기술 순서 변경은 드래그 앤 드롭이 아니라 ▲▼ 버튼입니다(기능은 동일).
- 커뮤니티의 "인기순"은 실제 다면 사용자 데이터가 없어 지금은 항상 0에 가깝습니다 — 원격
  Repository 연동 전까지는 구조만 준비된 상태입니다.
- 커리큘럼 편집기에 실시간 미리보기(기술 상세/영상)는 없고, 저장 후 Day 상세에서 확인합니다.

## 카메라 자세 분석 (AI Pose Analysis)

기술 상세 페이지의 "📷 자세 분석"은 사용자의 카메라 영상에서 관절 위치를 추출해 그 기술의
자세 기준 적합도를 "잘함 / 보통 / 개선 필요"로 보여주는 참고용 기능입니다.

**중요한 원칙**: 이 기능은 사용자의 실제 무술 실력을 판정하는 시스템이 아닙니다. 카메라로
확인 가능한 관절 각도/위치만 근사적으로 측정하며, UI(자세 분석 모달, Day 상세, 나의 기술
페이지)에 항상 이 점을 안내하고 전문 지도자의 감독이 필요하다는 문구를 표시합니다.

### 사용한 pose 라이브러리 — 완전 무료, 완전 로컬

- **MediaPipe Tasks Vision** (`@mediapipe/tasks-vision`, Google의 무료 오픈소스) —
  `pose_landmarker_lite` 모델로 33개 신체 랜드마크 중 nose/양쪽 shoulder·elbow·wrist·hip·
  knee·ankle을 사용합니다.
- WASM 런타임과 모델 파일(`public/mediapipe/`)을 **로컬에 직접 번들링**했습니다 — 실행 중
  어떤 외부 서버에도 요청하지 않습니다(`index.html`의 CSP도 `connect-src 'self'`만 허용).
  카메라 영상은 브라우저(Electron 렌더러) 안에서만 처리되고 저장되지 않습니다.
- 유료 Pose API, 외부 영상 분석 API는 전혀 사용하지 않았습니다.
- Electron 메인 프로세스(`electron/main.cjs`)가 `app.whenReady()` 이후
  `setPermissionRequestHandler`로 카메라(`media`) 권한 요청만 허용합니다 — 사용자는 여전히
  OS/브라우저의 카메라 권한 프롬프트를 직접 확인·허용해야 합니다.

### 1차 지원 기술 (16개)

기술별 지원 여부/필요 랜드마크/지표는 `data/curated/poseAnalysis.json`에 별도로 관리하며
(`data/processed/*.json` 원본은 전혀 건드리지 않음), 실제 기술 id만 참조합니다
(`node scripts/validate-pose-config.mjs`로 검증):

| 무술 | 기술 |
| --- | --- |
| 복싱 | Jab, Cross, Hook, Uppercut, High Guard |
| 킥복싱 | Jab, Cross, Round Kick, Front Kick |
| 무에타이 | Teep to Leg, Lead Round Kick / Rear Round Kick |
| 태권도 | 앞차기, 돌려차기 |
| 레슬링 | Wrestling Stance, Level Change, Penetration Step |

그 외 1,237개 기술은 기술 상세 페이지에 "현재 이 기술은 카메라 자세 분석을 지원하지
않습니다."라고 표시됩니다(버튼 대신).

### 분석 지표 & 점수 계산 방식

- `src/lib/poseAnalysis/geometry.ts`: 두 벡터 사이 각도, 두 점 사이 거리, 표준편차 등
  순수 수학 함수.
- `src/lib/poseAnalysis/metrics.ts`: 실제 계산기 10종 — `basicStance`(무릎 굽힘 각도),
  `armPosition`(팔꿈치 각도 또는 가드 손 높이), `rotation`/`hipRotation`(어깨·골반 회전량),
  `balance`(골반 중심 흔들림), `headPosition`(머리·골반 정렬), `supportLegStability`(지지
  발목 흔들림), `kneePosition`(무릎 상승량), `legMovement`(발 이동 거리), `levelChange`(골반
  하강량). **랜덤 점수는 전혀 없습니다** — 전부 캡처된 프레임의 실제 좌표에서 계산하며,
  `.devtools/`의 합성 좌표 테스트로 "동일 입력 → 동일 출력", "좋은 자세 > 나쁜 자세" 방향성을
  확인했습니다.
- 동작 구간 분석(시작 → 동작 → 최대 동작 → 복귀): 녹화 프레임 중 "가장 많이 뻗은/올라간"
  프레임을 자동으로 찾아 시작 프레임과 비교합니다(`findPunchPeak`/`findKickPeak`).
- 점수 산출: 측정값과 기준값의 차이를 0~100으로 환산(`scoreFromDeviation`) — 기준값/허용
  오차는 `data/curated/poseAnalysis.json`의 `params`에서 기술별로 다르게 설정.
- 잘함/보통/개선 필요 경계값은 `src/lib/poseAnalysis/scoring.ts`의 `SCORE_THRESHOLDS`
  상수 하나로 관리(현재 80/60) — 여기만 바꾸면 전체 앱에 반영됩니다.
- 카메라에서 핵심 랜드마크(어깨·엉덩이)가 충분히 잡히지 않으면 점수를 억지로 만들지 않고
  "포즈를 인식하지 못했습니다" 결과를 반환합니다(`analyzeTechnique.ts`) — 이 경우 기록도
  저장하지 않습니다.

### Gemini AI 연동 (설명만, 채점은 하지 않음)

`buildPoseAnalysisContext()`가 로컬에서 이미 계산된 점수/세부 지표를 그대로 Gemini에게
전달하고, 시스템 프롬프트에 "이 점수는 코드가 계산했다, 너는 설명만 한다"는 것과 "카메라로
확인 가능한 요소만 근사 측정한 것"이라는 점을 명시합니다. Gemini가 점수를 다시 계산하거나
확인하지 못한 사실을 단정하지 않도록 컨텍스트 자체에 그 경계를 포함시켰습니다.

### 저장 방식 — 기존 저장 구조 재사용, 영상은 저장 안 함

- `martialdex:pose-records` (localStorage, 기존 `martialdex:*` 키 컨벤션과 동일) —
  `{ recordId, techniqueId, martialArtId, score, status, metricScores, analyzedAt }` 배열.
- 구조: `src/lib/poseAnalysis/recordsRepository.ts`(저장소) →
  `recordsService.ts`(최근/최고/평균/횟수/변화량 계산, 삭제, JSON 내보내기) →
  `usePoseRecords.ts`(React 훅, 다른 탭에서 바뀐 기록도 동기화) — 커리큘럼 기능과 동일한
  계층 구조.
- 카메라 영상 프레임은 분석이 끝나면 즉시 버려지고 절대 디스크에 쓰이지 않습니다. 저장되는
  것은 점수/세부 지표/날짜뿐입니다.
- "나의 기술" 페이지(`/my-skills`)에서 기술별 기록 삭제, 기술 전체 삭제, 전체 삭제, JSON
  내보내기(카메라 영상 미포함)를 제공합니다. 삭제 전 항상 확인 메시지를 표시합니다.
- 커리큘럼의 "학습 완료"(`martialdex:curricula:progress`)와 자세 분석 점수
  (`martialdex:pose-records`)는 완전히 분리된 데이터입니다 — Day를 완료해도 점수는 바뀌지
  않고, 점수가 낮아도 완료 상태가 취소되지 않습니다.

### 1,253개 전체 기술로 확장하는 방법

1. `data/processed/<art>.json`에서 확장하려는 기술의 실제 `id`를 확인합니다(새로 만들지 않음).
2. 그 기술의 움직임에 이미 있는 계산기(`METRIC_CALCULATORS`)가 맞는지 확인하고, 안 맞으면
   `src/lib/poseAnalysis/metrics.ts`에 계산기를 하나 추가합니다.
3. `data/curated/poseAnalysis.json`에 항목을 추가합니다(`requiredLandmarks`, `metrics`,
   필요하면 `params`로 기준값 조정).
4. `node scripts/validate-pose-config.mjs`로 검증합니다.
5. 카메라 한 대로 분석하기 어려운 기술(예: 양손이 겹치는 클린치, 바닥 기술, 여러 명이
   필요한 기술)은 무리하게 추가하지 않는 것을 권장합니다 — 이런 경우 "포즈를 인식하지
   못했습니다"만 반복될 수 있습니다.

### 알려진 제한

- 카메라 1대 기준이라 몸이 겹치거나 카메라를 등지는 기술(클린치, 백 컨트롤 등)은 다루지
  않습니다.
- 좌/우 구분 없이 "더 많이 움직인 쪽"을 자동으로 찾으므로, 아주 미세한 동작은 반대쪽 팔/
  다리가 잘못 선택될 수 있습니다.
- GPU 가속(`delegate: 'GPU'`)을 사용하며, GPU가 없는 환경에서는 느려질 수 있습니다(모델
  자체는 CPU로도 동작 가능하도록 코드 수정 가능).

## 선수 스타일 학습 (AI Fighter Style Learning)

"선수 스타일 학습" 메뉴는 "이슬람 마카체프 스타일을 배우고 싶어" 같은 자연어 입력을 선수 식별 →
스타일 분석 → 실제 기술 매칭 → 맞춤 커리큘럼 생성까지 이어줍니다. 새 저장 시스템을 만들지 않고,
기존 커리큘럼/YouTube/AI/자세 분석 기능을 전부 재사용합니다.

### 전체 흐름과 각 단계가 실제로 하는 일

```
자연어 입력
  → (Gemini, JSON) 선수 이름/스타일 질의 추출
  → (Gemini, JSON) 선수 후보 식별 — 동명이인이면 선택 UI
  → (Gemini, JSON, localStorage 캐시) 스타일 분석 — styleSummary/keyTechniques/... 구조화 JSON
  → (코드, 결정론적) 스타일 요소 문구를 src/lib/search.ts로 검색해 실제 techniqueId와 매칭
  → 사용자 수준 선택 (기존 진행률/자세 분석 점수를 참고만 하고, 항상 사용자에게 직접 확인)
  → 학습 기간: AI 추천(Gemini) 또는 직접 입력
  → 학습 강도 선택
  → (코드, 결정론적) Day 단위 커리큘럼 플래너 — 선택한 기간과 정확히 같은 Day 수 생성
  → 미리보기 → 저장 (기존 curriculumRepository로 "내 커리큘럼"에 그대로 저장)
```

**AI(Gemini)가 하는 일**은 자연어 이해, 선수 식별, "공개적으로 알려진 스타일"의 서술적 분석,
기간 추천 — 네 가지뿐입니다. **기술 매칭과 Day 배치는 전부 코드가 결정론적으로 계산**합니다.
이 경계는 의도적입니다: AI가 실제 기술 ID를 만들어내거나 점수를 매기지 않도록 하기 위함입니다.

### 자연어 입력 처리

`src/lib/fighterStyle/fighterIdentification.ts`의 `extractFighterQuery()`가 Gemini에게
"마크다운 없이 JSON만 반환"하도록 지시된 프롬프트로 자유 문장에서
`{fighterNameGuess, styleQuery, goal}`을 추출합니다("마카체프", "마카체프처럼 싸우고 싶어" 등
형태에 관계없이 동작). 모든 구조화 호출은 `src/lib/fighterStyle/geminiJson.ts`의
`askGeminiForJson()`을 통하며, 이는 기존 `src/lib/ai/provider.ts`(→ IPC → `electron/gemini.cjs`)를
**그대로 재사용**합니다 — 새 IPC 채널이나 API 키 처리 코드를 추가하지 않았습니다.

### 선수 식별 (동명이인 포함, 하드코딩 없음)

`identifyFighterCandidates()`가 이름 추정값으로 실제 존재가 확인되는 선수를 최대 3명까지
Gemini에게 묻고, 확실하지 않으면 빈 배열을 반환하도록 지시합니다(가짜 인물을 지어내지 않음).
결과가 여러 명이면 선택 화면을, 0명이면 "찾지 못했습니다" 안내를 표시합니다. 선수 데이터베이스를
미리 구축하지 않았으므로 이론상 어떤 실존 격투기 선수 이름을 넣어도 동작합니다.

### 스타일 분석 데이터 구조

`FighterStyleAnalysis`(`src/lib/fighterStyle/types.ts`)는 스펙에 정의된 필드
(`styleSummary`, `primaryStyles`, `keyStrengths`, `preferredPositions`, `keyTechniques`,
`transitions`, `distanceManagement`, `defensiveConcepts`, `offensiveConcepts`,
`trainingFocus`)를 그대로 구현합니다. `keyTechniques`/`preferredPositions` 등에는 표준
기술 용어(예: "Double Leg", "Back Control")를 쓰도록 프롬프트에 명시해 다음 매칭 단계와
잘 맞물리게 했습니다. 한 번 생성한 분석은 `martialdex:fighter-styles`(localStorage)에
캐시되어, 같은 선수를 다시 찾을 때 API를 재호출하지 않습니다.

### 스타일 → Martialdex 기술 매핑 방식 (가장 중요한 부분)

`src/lib/fighterStyle/techniqueMatcher.ts`의 `matchStyleToTechniques()`가 유일하게 "스타일
요소 문구"를 실제 `techniqueId`로 바꾸는 곳입니다. 방법은:

1. 스타일 분석의 각 배열 필드(`keyTechniques` 가중치 40, `preferredPositions` 25,
   `transitions` 20, `offensiveConcepts`/`defensiveConcepts` 15, `distanceManagement`/
   `primaryStyles` 10)에서 문구를 하나씩 꺼낸다.
2. 그 문구를 **검색창과 완전히 같은 함수**인 `src/lib/search.ts`의 `searchTechniques()`로
   검색한다(정확 일치 + Fuse.js 퍼지 매칭, 신규 로직 없음).
3. 검색 결과 순위(0이 1등)에 따라 `weight * (1 - rank * 0.15)`만큼 relevanceScore에 더한다.
   같은 기술이 여러 문구에서 매칭되면 점수가 누적된다 — **랜덤 숫자가 아니라 검색 순위 기반
   가산**이다.
4. `MIN_RELEVANCE`(15점) 미만은 버리고, 실제 `Technique` 객체로 끝까지 resolve되지 않는
   id는 애초에 존재할 수 없다(검색 결과 자체가 실제 데이터에서만 나오므로).
5. 각 매칭은 `classifyPhase()`(`phaseClassifier.ts`)로 기본기/진입/포지션/연결 중 하나에
   자동 분류된다 — 카테고리·포지션·태그의 키워드 매칭이며 AI 호출 없음.

기술 매칭 결과가 0개면("현재 Martialdex 기술 데이터에서 직접적으로 대응되는 기술을 찾지
못했습니다") 커리큘럼 생성 버튼이 비활성화됩니다.

### 사용자 수준 반영 방식

현재 진행률/자세 분석 점수를 강제로 추론해 넘겨짚지 않고, **항상** "현재 격투기 경험이
어느 정도인가요?"를 직접 묻습니다(처음 시작/초급/중급/고급). 선택된 수준은 플래너에서 난이도
정렬의 기준(쉬운 기술 우선 배치)으로 쓰입니다.

### AI 기간 추천 vs 사용자 직접 설정

- **AI 추천**: `src/lib/fighterStyle/durationAdvisor.ts`의 `recommendDuration()`이 선수/
  스타일/수준/매칭된 기술 수를 근거로 Gemini에게 일수를 묻고, 응답을 **항상**
  `[MIN_DURATION_DAYS(7), MAX_DURATION_DAYS(180)]`로 clamp합니다. API 호출 자체가 실패하면
  가짜 "AI 추천값"을 만들어 보여주지 않고 곧바로 사용자 직접 입력 화면으로 안내합니다.
- **사용자 직접 설정**: 빠른 선택(7/14/30/45/60/90일) 또는 숫자 직접 입력. 7일 미만/180일
  초과는 각각 "너무 짧은/긴 기간"으로 막습니다.
- 커리큘럼 객체의 `styleMeta.durationMode`에 `'ai_recommended'` 또는 `'user_selected'`가
  **명확히 구분되어** 저장됩니다 — 어느 쪽으로 정했는지 항상 알 수 있습니다.

### 학습 강도와 기간에 따른 커리큘럼 재구성

`src/lib/fighterStyle/curriculumPlanner.ts`의 `planStyleCurriculum()`이 매칭된 기술 풀 +
목표 기간 + 강도(가볍게/보통/집중 → 하루 1-2/2-3/3-4개 기술, 복습 주기도 다르게)로 **정확히
목표 Day 수만큼**(largest-remainder 방식으로 단계별 Day 배분을 정수로 딱 맞춤) Day를
생성합니다. 기간이 길어지면 단순히 Day 수만 늘리는 게 아니라:

- 40일 이상이면 "상황별 응용" 단계가 추가되고(포지션/연결 단계의 하위 20~25%를 그쪽으로 이동),
- 기술 풀이 목표 Day 수보다 적으면 부족한 만큼 **복습/연습 Day로 채우고**(존재하지 않는 기술을
  지어내 채우지 않음),
- 기술 풀이 충분히 많으면 난이도·관련도 상위 기술만 선택합니다.

Day 1~53(53일 기준)이 아니라 실제로는 각 단계(기본기/거리 좁히기·진입/포지션 컨트롤/기술 연결·
마무리/[상황별 응용]/종합 복습)가 서로 다른 비중의 Day 구간을 갖도록 설계했습니다 — 공식
추천 커리큘럼과 같은 원칙입니다.

### 커리큘럼 저장 방식과 기존 시스템과의 연결

생성된 커리큘럼은 **새 저장소를 만들지 않고** 기존 `curriculumRepository`/`curriculumService`를
그대로 통해 저장됩니다(`src/lib/fighterStyle/styleCurriculumService.ts`). 기존 `Curriculum`
타입에 선택 필드 `styleMeta`만 추가했습니다:

```ts
styleMeta?: {
  fighterId, fighterName, targetStyle,
  durationMode: 'ai_recommended' | 'user_selected',
  intensity, userLevel,
  styleAnalysis,          // 재구성 시 재사용 — API 재호출 없음
  matchedTechniques,      // 재구성 시 재사용 — API 재호출 없음
}
```

`martialArt`는 9개 실제 무술 중 하나가 아니라 `"mma"`(고정 상수
`STYLE_CURRICULUM_MARTIAL_ART`)로 저장됩니다 — 한 선수의 스타일이 보통 여러 무술에 걸쳐
있기 때문입니다. 그래서 "저장 후에는" 기존 Day 목록/Day 상세/진행률/편집/공유 코드 기능을
**전부 그대로** 사용할 수 있습니다(별도 구현 없음). Day 목록 화면에는 style 커리큘럼일 때만
"핵심 기술 & AI 자세 분석 점수" 카드와 "기간 변경" 버튼이 추가로 보입니다.

기간을 저장 후에 바꾸면(`regenerateStyleCurriculum()`) 저장해둔 `matchedTechniques`로
**API 호출 없이** 플래너를 다시 돌려 전체를 재설계합니다(Day를 자르는 게 아님). 기존
진행 상황은 Day 의미가 바뀌므로 초기화되며, 실행 전 사용자에게 확인을 구합니다.

### YouTube / Gemini / 카메라 자세 분석 연결

- **YouTube**: Day 상세 페이지가 기존 `RelatedVideos` 컴포넌트를 그대로 렌더링합니다 —
  선수 스타일 전용 코드 없음.
- **Gemini(대화)**: `src/lib/ai/context.ts`의 `buildFighterStyleContext()`가 스타일 분석 +
  매칭된 기술의 현재 자세 분석 점수 + 사용자 수준 + 저장된 커리큘럼을 컨텍스트로 구성해
  기존 `AiAskModal`(신규 prop `fighterStyleContext`)로 전달합니다. "왜 이 기술이 포함됐어?",
  "점수 낮은 기술부터 뭘 연습해야 해?" 같은 질문에 답할 수 있습니다.
- **카메라 자세 분석**: Day 상세의 기술 카드는 10단계에서 만든 `TechniqueAnalyzeButton`을
  그대로 재사용하므로 별도 연결 코드가 필요 없었습니다. Day 목록의 "핵심 기술 & 점수" 카드는
  `getTechniqueSkillSummary()`(기존 함수)를 재사용해 매칭된 기술의 최신 점수를 보여줍니다.

### 안전 안내와 출처 표시

스타일 분석/커리큘럼 설명에 "공개 경기 기록과 분석 정보를 바탕으로 한 Martialdex의 학습용
스타일 분석이며, 실제 선수의 실력을 완전히 대변하지 않습니다"라는 문구를 포함시켰고, Day 상세
페이지의 기존 안전 안내(전문 지도자 감독 필요)를 그대로 상속받습니다.

### 알려진 제한

- 선수 식별/스타일 분석/기간 추천은 Gemini 무료 등급 호출 3~4회가 필요합니다 — 무료 등급
  한도에 도달하면 친절한 오류와 함께 해당 단계에서 멈추고, 이미 진행한 단계(예: 스타일 분석
  캐시)는 유지됩니다.
- 관련 기술 매칭은 검색 인덱스 기반이라, 스타일 분석이 표준적이지 않은 용어를 쓰면 매칭이
  적게 나올 수 있습니다(그 경우 기술을 지어내지 않고 매칭 없음으로 처리).
- 선수 비교 기능(여러 선수 스타일을 나란히 비교)은 이번 단계에 포함되지 않았지만,
  `FighterStyleAnalysis`/`TechniqueMatch` 구조 자체는 여러 선수를 동시에 다룰 수 있게
  설계되어 있어 추후 추가가 쉽습니다.

## AI 개인 코치 + 오늘의 훈련 + 기술 숙련도

"AI 개인 코치"(`/coach`), "오늘의 훈련"(`/today-training`), "나의 기술" 대시보드(`/my-skills`
개편)는 커리큘럼 진행 기록과 카메라 자세 분석 점수를 하나로 엮어 "지금 뭘 연습해야 하는지"를
알려줍니다. 새 저장소를 최소화하고 기존 커리큘럼/자세 분석/YouTube/Gemini 기능을 그대로
재사용합니다.

### 데이터 흐름

```
커리큘럼 Day 완료 / 오늘의 훈련 완료
  → (신규) trainingHistory 로그에 기록
카메라 자세 분석 실행 (기존, 10단계)
  → (기존) poseAnalysis 기록
        ↓                    ↓
   (신규) skillProgress — 기술별 숙련도(5단계) + 약점 점수를 실시간 계산
        ↓
   AI 개인 코치 / 오늘의 훈련 / 나의 기술 대시보드
```

`skillProgress`는 점수·연습 횟수 같은 원본 데이터를 다시 저장하지 않고, **기존 `poseAnalysis`
기록과 `trainingHistory` 로그를 그때그때 조합해서 계산**하는 파생 레이어입니다(저장하는 것은
사용자가 직접 지정한 숙련도 override 하나뿐 — `martialdex:skill-status-overrides`).

### 기술 숙련도 5단계와 계산 방식

`src/lib/skillProgress/computeSkillProgress.ts`가 기술 하나당 다음 중 하나로 분류합니다:
`⚪ 미학습 · 🔵 학습 중 · 🟡 보통 · 🟢 숙련 · 🔴 개선 필요`. 자세 분석 점수 하나만 보지 않고:

- 분석 기록도 연습 기록도 없으면 → 미학습
- 분석은 없지만 커리큘럼 Day/오늘의 훈련으로 연습한 적은 있으면 → 학습 중
- 분석 기록이 있으면: 최신 점수 + 분석 횟수 + 최근 추세(상승/하락)를 함께 봐서 판단 — 예를 들어
  80점을 한 번 넘겼어도 분석이 1회뿐이거나 직전보다 점수가 떨어졌으면 아직 "숙련"으로 올리지
  않고 "보통"으로 유지합니다(우연한 고득점 1회를 실력 확정으로 취급하지 않기 위함).
- 사용자가 기술 상세 페이지에서 "숙련도 변경"으로 직접 지정하면 그 값이 항상 최우선(계산값은
  "자동 계산으로 되돌리기"로 언제든 복귀 가능).

"다음 복습 권장일"은 현재 숙련도별로 다른 간격(숙련 7일 · 보통 4일 · 학습 중 3일 · 개선 필요
2일)을 최근 연습일에 더한 값이며, 단순 참고용 휴리스틱입니다.

### 포지션별 약점

`positionClassifier.ts`가 (11단계의 `phaseClassifier.ts`와 같은 방식으로) 기술의 실제
category/positions/tags를 키워드 매칭해 Standing/Clinch/Guard/Mount/Back Control 5개
표준 포지션 중 하나로 분류합니다 — 원본 `positions` 필드는 무술마다 표현이 제각각이라
("데 라 히바 (De La Riva Guard)" 등) 그 자체로는 대시보드에 쓸 수 없기 때문입니다. 각
포지션의 점수는 **그 포지션에 속하면서 실제로 분석 기록이 있는 기술들의 평균 점수**로만
계산하며, 분석 기록이 하나도 없는 포지션은 점수 대신 "분석 기록 없음"으로 표시합니다(점수를
지어내지 않음).

### 약점 TOP 5와 "이 약점 개선하기"

`weaknessEngine.ts`의 `rankWeakness()`가 (실제로 분석된 적 있는 기술 중에서) 낮은 점수 · 점수
하락 추세 · 오래 연습하지 않음 · 현재 진행 중인 커리큘럼에서의 중요도를 가중합산해 우선순위를
매깁니다 — 단순 점수 정렬이 아니며, 랜덤 요소도 없습니다. "이 약점 개선하기" 버튼은
`aiCoach/weaknessCurriculum.ts`가 그 기술의 **실제 데이터**(`relatedTechniques`의 진짜
기술 id, `variations`/`defenses`/`counters` 텍스트)만으로 5일짜리 커리큘럼을 만들어
기존 `curriculumService`(`createCustomCurriculum`/`addDay`/`updateDay`/`addTechniqueToDay`)로
저장합니다 — AI 호출이 전혀 없어 기술을 지어낼 여지 자체가 없습니다.

### AI 개인 코치: 기술 선택은 코드가, 설명은 Gemini가

`aiCoach/coachEngine.ts`의 `buildBaseRecommendation()`이 위 약점 랭킹 + 오늘의 훈련 계획을
바탕으로 **우선 학습 / 복습 / 새로운 기술 / 추천 커리큘럼 Day**를 전부 결정합니다(전부 실제
`techniqueId` 참조). `aiCoach/coachService.ts`는 이 결과를 Gemini에게 그대로 보여주고 "왜
이런 추천이 나왔는지" 2~3문장 설명만 받아옵니다 — **AI는 어떤 기술을 추천할지 절대 스스로
고르지 않으며, 기술 id를 출력하지도 않습니다.** 이 경계 덕분에 AI 응답이 무엇이든 실제
존재하지 않는 기술이 화면에 나타날 수 없습니다. AI 호출이 실패(할당량/네트워크 오류)하면
`templateReason()`이 만드는 결정론적 문장으로 자동 대체되고, 화면에 "AI 코칭 문구를 사용할 수
없어 기본 문구를 표시하고 있습니다" 안내가 뜹니다 — 추천 자체는 절대 막히지 않습니다.

추천 결과는 날짜가 아니라 **추천 내용(어떤 기술 3개 + 어떤 Day)의 해시**로 캐싱됩니다
(`martialdex:coach-recommendation`) — 같은 날 "오늘의 코칭 받기"를 여러 번 눌러도 추천 내용이
그대로면 Gemini를 다시 호출하지 않습니다.

### 오늘의 훈련

`todayTraining/planner.ts`의 `generateTodayTrainingPlan()`은:

1. 진행 중인 커리큘럼이 있으면 기존 `resolveTodayDay()`(9단계, 커리큘럼 Day 목록/상세 페이지와
   완전히 동일한 함수)로 오늘의 Day를 그대로 가져옵니다 — "오늘의 훈련"이 Day 목록 페이지와
   다른 Day를 보여주는 일이 없습니다.
2. 진행 중인 커리큘럼이 없으면, 사용자가 이미 손댄 적 있는 무술 안에서 약점 기술 1개 + 아직
   학습하지 않은 기술 몇 개로 짧은 추천을 구성합니다. 그마저 없으면(정말 아무 기록도 없으면)
   "아직 학습 기록이 없습니다" + "커리큘럼 만들기" 버튼을 보여줍니다.

[훈련 시작]을 누르면 그날 하루치 세션이 `martialdex:today-training-session`에 저장되어
(기술별 완료 체크와 함께) 앱을 재시작해도 이어집니다. 모든 기술을 완료하면 자동으로:
기존 `trainingHistory`에 기록 + (커리큘럼 기반이었다면) 기존 `curriculumService.setDayComplete`를
그대로 호출해 Day를 완료 처리합니다 — Day 완료 로직 자체는 하나만 존재하며 중복되지 않습니다.

### 저장 데이터

- `martialdex:training-history` — 훈련 완료 로그(날짜, 커리큘럼/Day 여부, 기술 목록, 예상/실제
  시간). 커리큘럼 Day 완료 버튼(기존, 9단계)과 오늘의 훈련 완료 양쪽에서 기록되는 단일 로그입니다.
- `martialdex:skill-status-overrides` — 사용자가 직접 지정한 숙련도만 저장(그 외 모든 값은
  기존 poseAnalysis 기록 + 위 로그에서 매번 다시 계산).
- `martialdex:today-training-session` — 오늘 날짜의 훈련 세션 진행 상태(자정이 지나면 자동으로
  새로 계산).
- `martialdex:coach-recommendation` — 마지막 코칭 결과 + 그 결과를 만든 추천 조합의 해시(캐싱용).

### 기존 기능과의 연결

- **커리큘럼**: Day 완료 시 자동으로 훈련 기록이 남고, 오늘의 훈련도 같은 진행률 시스템
  (`CurriculumProgress`)을 그대로 갱신합니다. 선수 스타일 커리큘럼도 동일하게 연결됩니다.
- **카메라 자세 분석**: 숙련도 계산의 핵심 입력이며, 기술 상세 페이지의 점수 변화 그래프는
  10단계에서 만든 `ScoreHistoryChart` 컴포넌트를 그대로 재사용합니다.
- **YouTube**: 오늘의 훈련 진행 화면에서 기존 `RelatedVideos` 컴포넌트를 그대로 사용합니다.
- **Gemini**: 기존 `aiProvider`/`askGeminiForJson`/`AiAskModal`을 그대로 재사용하며, IPC 채널과
  API 키 처리 코드는 전혀 추가되지 않았습니다.

### 알려진 제한

- 포지션 분류(Standing/Clinch/Guard/Mount/Back Control)는 키워드 기반 근사치이며, 두 포지션에
  걸치는 기술은 하나로만 분류됩니다.
- 카메라 자세 분석을 지원하는 기술이 16개뿐이라(`data/curated/poseAnalysis.json`), 숙련도가
  "학습 중" 이상으로 올라가려면 분석 지원 기술 위주로 데이터가 쌓여야 정확도가 높아집니다 —
  지원하지 않는 기술은 커리큘럼 연습만으로 "미학습 → 학습 중"까지만 자동 판정됩니다(그 이상은
  사용자가 직접 지정 가능).
- 약점→커리큘럼 생성(14-9)은 5일 고정 길이이며, 11단계처럼 기간을 사용자가 조정하는 기능은
  아직 없습니다.

## 실제 스파링 영상 기반 AI 분석

"스파링 분석"(`/sparring`) 메뉴는 사용자가 업로드한 실제 스파링/대련 영상에서 본인을 직접
지정하면, 그 사람의 움직임만을 추적해 자세·동작 패턴·스타일을 분석합니다. 영상 파일 자체는
저장하지도, 외부로 전송하지도 않습니다 — 로컬에서 MediaPipe Pose(10단계 카메라 자세 분석과
같은 모델)로 프레임을 샘플링해 분석하고, 그 결과로 나온 작은 구조화 데이터만 저장합니다.

### 무엇을 실제로 계산하는가 (매우 중요)

이 기능에서 가장 신경 쓴 부분은 "실제로 계산 가능한 것"과 "확정할 수 없는 것"을 명확히
구분하는 것입니다.

| 항목 | 실제로 계산되는가 | 방식 |
|---|---|---|
| 사람 감지/선택 | ✅ 실제 계산 | 선택한 프레임에서 MediaPipe Pose를 다중 인물 모드로 실행, 감지된 사람을 클릭으로 지정 |
| 지정한 사람 추적 | ✅ 실제 계산(단순) | 프레임 간 골반/어깨 중심점 최근접 매칭 — **신원 재인식이 아닌 위치 기반 추적** |
| 자세 지표(Guard/Stance/Balance/Foot Position) | ✅ 실제 계산 | 추적된 관절 좌표로 10단계와 동일한 각도/거리/안정성 계산 함수 재사용 |
| 동작 이벤트(타격성/레벨체인지성/클린치성 등) | ✅ 실제 계산(휴리스틱) | 손목/골반 속도, 상대와의 거리 변화 등 기하학적 임계값 기반 — **구체적 기술명이 아닌 일반 동작 범주** |
| 기술명 추정("Jab", "Double Leg" 등) | ⚠️ AI 추정(검증됨) | 위 동작 이벤트 + 실제 기술 후보 목록을 Gemini에 전달해 추정 — **후보 목록에 없는 기술명은 절대 반환되지 않음** |
| 기술 실행 성공/실패 | ❌ 계산하지 않음 | 신뢰할 수 있는 로컬 판정 근거가 없어 점수화하지 않음 — 결과 화면에도 그렇게 명시 |
| 전체 평가 점수(움직임/거리/방어/공격/자세) | ✅ 실제 계산 | 위 자세 지표 + 동작 이벤트 발생 빈도의 결정론적 조합(휴리스틱 공식) — 학습된 채점 모델 아님 |

기술명 추정은 11단계(선수 스타일 분석)·12단계(AI 코치)와 완전히 같은 원칙을 씁니다:
`techniqueHypothesis.ts`가 감지된 동작과 함께 **그 종목의 실제 기술 목록**(검색 인덱스로 구성)만
Gemini에 후보로 주고, 응답에서 후보 목록에 없는 id는 전부 버립니다. 이 단계가 실패하거나
생략되어도 동작 타임라인 자체는 그대로 표시됩니다(기술명만 없을 뿐).

### 1. 종목 선택 (데이터 기반, 하드코딩 분기 없음)

`sparringAnalysis/martialArtCriteria.ts`의 `SPARRING_SPORTS`/`MARTIAL_ART_CRITERIA` 테이블에
복싱·킥복싱·무에타이·태권도·가라테·레슬링·유도·삼보·BJJ·MMA 10종목과 종목별 분석 기준
키워드(11단계 예시와 동일한 목록)를 등록해뒀습니다. 새 종목을 추가하려면 이 표에 한 줄만
추가하면 되고, 기존 9개 무술 id를 그대로 재사용합니다(MMA는 11단계와 같은 `mma` 가상 id).

### 2~4. 영상 업로드 · 미리보기 · "내가 누구인지" 지정

`<input type="file">`/드래그앤드롭으로 로컬 파일을 받아 `URL.createObjectURL`로만 재생합니다
(서버 업로드 없음). MP4/MOV/WebM만 허용하고 300MB를 넘으면 거부합니다. 미리보기 후 "분석할
사람 지정"을 누르면 영상 중간 프레임에서 다중 인물 감지를 1회 실행해 감지된 사람 수만큼
클릭 가능한 박스를 영상 위에 겹쳐 보여주고, 사용자가 직접 한 명을 클릭해 확정합니다 — AI가
자동으로 "이 사람이 사용자"라고 결정하는 부분은 전혀 없습니다.

### 5. 사람 추적의 정직한 한계

`personTracker.ts`는 각 샘플 프레임에서 감지된 사람들 중 방금 확정한 사람의 중심점과 가장
가까운 사람을 선택하는 **단순 최근접 매칭**입니다. 이것은 신원 재인식(re-identification)이
아니라 위치 기반 추적이며, 다음 상황에서 실패할 수 있습니다: 지정한 사람이 화면 밖으로
나가거나, 다른 사람과 가까이서 교차하거나, 가려짐이 심한 경우. 매칭 실패한 프레임은
`matched: false`로 남기고 이후 계산에서 제외하며(추측하지 않음), 손실 비율이 높으면 결과
화면에 "선택한 사람을 일부 구간에서 놓쳤을 수 있습니다" 안내가 표시됩니다(25단계).

프레임은 등간격으로 최대 60개까지만 샘플링합니다(영상 길이/60초, 최소 1초 간격) — 매
프레임을 처리하는 것이 아니라 로컬 WASM 추론을 합리적인 횟수로 제한하기 위함이며, 이 때문에
아주 짧게 끝나는 개별 타격(잽 등)은 두 샘플 사이에서 놓칠 수 있습니다.

### 6~7. 분석 범위 선택과 종목별 기준

7가지 분석 범위(전체/자세/기술 사용/움직임/공격 방어/거리 조절/스타일) 체크박스를 제공하며
기본값은 전체 선택입니다. 선택한 범위에 따라 어떤 계산 단계를 실행할지만 결정되고, 종목별
분석 기준(MARTIAL_ART_CRITERIA)은 기술명 추정 단계의 후보 기술 풀을 좁히는 데 쓰입니다.

### 8~14. 분석 결과 (자세 / 기술 / 타임라인 / 스타일 / 공격 방어)

결과 화면(`SparringResultView.tsx`)은 실제로 계산된 값만 표시합니다: 전체 평가 점수는 계산된
항목만 렌더링되고(기술 실행 점수는 항상 제외, 이유를 화면에 명시), 발견된 기술은 전부
"(추정)" 표기가 붙고, 타임라인 이벤트는 신뢰도(낮음/보통)와 함께 표시되며, 자세 분석은
초반/중반/후반 3구간으로 나눠 실제 추세가 있을 때만("가드가 낮아지는 경향이 관찰됨") 관찰
문장을 붙입니다(체력 상태 등은 확정하지 않음). 스타일 분석은 감지된 동작 범주 비율로부터
템플릿 문장을 생성하며, "당신은 OO 스타일이다" 같은 단정적 표현은 쓰지 않습니다.

### 15. 선수 스타일과 비교

`fighterStyleComparison.ts`가 11단계에서 저장해둔 가장 최근 선수 스타일 커리큘럼의
`keyTechniques`/`preferredPositions`/`offensiveConcepts`를 이번 스파링에서 감지된 동작
범주와 키워드로 대조해 "관찰된 공통 특징"과 "개선 방향"을 나눕니다 — AI 호출 없는 결정론적
키워드 대조이며, 실력이나 신체 능력은 비교하지 않고 기술적/전술적 특징 차이만 설명합니다.

### 16~17. AI 개인 코치 · 기술 숙련도 연결

`ai/context.ts`의 `buildCoachContext()`에 가장 최근 스파링 분석의 스타일 관찰/약점을
추가해, "내 스파링에서 가장 고쳐야 할 게 뭐야?" 같은 질문에 실제 분석 결과를 근거로 답할 수
있습니다. 결과 화면의 "오늘의 훈련에 추가" 버튼은 약점 라벨을 실제 검색 인덱스로 매칭한
기술만 추가합니다. AI가 추정한 기술은 "학습 기록에 추가" 버튼을 눌러야만(확인 대화상자 후)
14단계 학습 기록(`trainingHistory`, `source: 'sparring'`)에 반영되며, 자동으로 숙련도를
확정하지 않습니다.

### 18~19. 저장 방식과 스파링 기록 메뉴

`sparringAnalysis/repository.ts`가 `martialdex:sparring-sessions`에 세션 배열을 저장합니다
(스펙의 `sparringSession` 필드 구조를 그대로 따름). **영상 파일 자체는 절대 포함되지
않습니다.** `/sparring` 허브가 곧 "스파링 기록" 화면을 겸해 저장된 세션 목록을 위에 보여주고,
`/sparring/:id`에서 개별 결과를 다시 볼 수 있습니다.

### 20~21. 이전 스파링과 비교 · 장면 저장

세션이 2개 이상 쌓이면 허브 화면에 거리 조절/자세/움직임 점수의 변화를 "62 → 68 → 74" 형태로
보여줍니다(기록이 1개뿐이면 표시하지 않음 — 그래프를 억지로 만들지 않음). 타임라인/기술
항목의 "⭐ 저장" 버튼으로 중요 장면의 타임스탬프를 세션에 저장할 수 있습니다. 다만 영상
파일은 저장하지 않으므로, 나중에 `/sparring/:id`에서 장면으로 바로 이동하려면 같은 영상
파일을 다시 선택해 로컬로 재연결해야 합니다(서버 업로드 없이 그때그때 새 object URL만 생성).

### 22. 분석 결과 → 커리큘럼

`sparringToCurriculum.ts`가 11/14단계와 동일한 패턴으로, 약점 라벨을 실제 검색 인덱스로
기술에 매칭한 뒤 기존 `curriculumService` CRUD로 짧은 개선 커리큘럼을 생성합니다 — 새로운
커리큘럼 저장 시스템을 만들지 않았습니다.

### 23~24. 무료 구현 범위와 유료 API가 필요한 부분

이번 단계는 전부 무료/로컬로 구현했습니다: 영상 재생(브라우저 API), 다중 인물 자세 추정
(MediaPipe Pose, 기존 자산 재사용), 자세 지표·동작 이벤트 계산(순수 기하 연산), 기술명 추정
1회 호출(기존 Gemini 텍스트 API, JSON 모드) — 영상 자체를 어떤 외부 API로도 전송하지 않습니다.

**실제로 정확한 기술 판정(타격 성공 여부, 정밀한 기술 분류, 강건한 다중 인물 재식별)에는
전문 영상 액션 인식 모델이나 Gemini의 영상 멀티모달 입력 같은 유료/고급 기능이 필요합니다.**
이번 구현은 그 자리에 거짓 결과를 채워 넣는 대신, 계산 가능한 부분(자세/동작 패턴)은 실제로
계산하고 나머지는 "추정" 표시 또는 미표시로 정직하게 남겨뒀습니다 — 향후 그런 모델을 붙일
자리는 `techniqueHypothesis.ts` 하나로 이미 분리되어 있어(모션 이벤트 → 기술 후보 매핑 단계),
더 정확한 백엔드로 교체해도 나머지 코드는 바뀌지 않습니다.

## 기술 연결 그래프

"기술 그래프"(`/graph`)는 1,253개 기술을 단순 목록이 아니라 서로 어떻게 이어지는지 보여주는
노드-링크 그래프입니다. 새 연결 데이터를 지어내지 않고, 각 기술이 이미 갖고 있는 실제 필드
(`relatedTechniques`, `transitions`, `counters`, `defenses`, `positions`)만으로 그래프를
구성합니다.

### 관계 카테고리 ↔ 실제 데이터 매핑

| 스펙의 관계 | 실제 데이터 출처 | 계산 방식 |
|---|---|---|
| 다음 기술 (전환) | 그 기술 자신의 `transitions` | 문구가 같은 무술의 실제 기술 이름을 포함하면 연결 |
| 선행 기술 | (신규 계산) | 위 "다음 기술" 엣지를 전부 뒤집은 역방향 인덱스 — A→B면 B의 선행 기술은 A |
| 연결 기술 | 그 기술 자신의 `relatedTechniques` | 이미 2단계에서 큐레이션된 실제 id, 그대로 재사용 |
| 카운터 기술 | 그 기술 자신의 `counters` | 다음 기술과 동일한 방식으로 실제 기술 이름 매칭 |
| 탈출 기술 (상대 대응) | 그 기술 자신의 `defenses` | 다음 기술과 동일한 방식으로 실제 기술 이름 매칭 |
| 같은 포지션 기술 | `positions` 필드 | 같은 무술 안에서 포지션 태그를 하나라도 공유하는 기술 |

기술 상세 페이지의 기존 "관련 기술" 카드는 `relatedTechniques`를 그대로 보여주므로, 새
"🔗 기술 연결" 카드에서는 "연결 기술"을 중복 표시하지 않고 나머지 5개 카테고리만 보여줍니다.

### 왜 검색창의 퍼지 매칭을 재사용하지 않았는가

처음에는 11단계처럼 검색창과 같은 Fuse.js 퍼지 검색(`searchTechniques`)으로 `transitions`/
`counters`/`defenses` 문구를 실제 기술에 매칭하려 했습니다. 그런데 이 필드들은 "Hip Bump →
Kimura"처럼 짧은 기술명 문구와, "상대가 뒤로 물러난다 → 거리 재확보, 잽으로 재압박..."처럼
80~100자가 넘는 서술형 문장이 섞여 있습니다. 실제로 붙여보니 긴 한국어 문장을 퍼지 검색에
반복적으로 넣을 때 **앱 시작 자체가 걸릴 정도로 느려지는 성능 문제**를 테스트 중 발견했습니다
(자세한 경위는 아래 "발견한 문제" 참고). 게다가 문장 전체는 애초에 기술 하나를 가리키지
않으므로, 퍼지 유사도로 억지 연결을 만드는 것은 성능 문제를 떠나 **부정확한 연결(사실상의
오탐)을 만들 위험**이기도 했습니다. 그래서 그 무술의 실제 기술 목록 안에서 "문구가 그 기술의
실제 이름을 문자 그대로 포함하는가"만 확인하는 단순 부분 문자열 매칭으로 바꿨습니다 —
검색창(`search.ts`)은 전혀 건드리지 않았고, 이 판단 방식은 `techniqueGraph/buildGraph.ts`
안에서만 씁니다.

### 그래프 페이지 사용 흐름

1. 무술 선택(필수) → 포지션/이름 검색으로 좁히기 → 목록에서 기술 하나를 클릭해 중심 기술로
   지정합니다. 1,253개를 한 화면에 다 그리는 대신 이렇게 범위를 좁혀야 그래프를 그리는 방식으로,
   실제 렌더링되는 노드 수는 보통 수십 개 이하입니다.
2. 중심 기술을 기준으로 방사형(radial) SVG 그래프가 그려집니다 — 관계 카테고리별로 다른
   방향/색의 노드 묶음이 배치되고, 마우스 휠/드래그 또는 확대·축소·초기화 버튼으로 이동할 수
   있습니다.
3. 노드를 클릭하면 그 기술로 그래프의 중심이 다시 그려지고("탐색"), "이전 기술" 버튼으로
   되돌아갈 수 있습니다. "기술 상세 보기"로 전체 상세 페이지로, 기술 상세 페이지의 "🕸 그래프로
   보기"로 다시 그래프로 오갈 수 있습니다(URL의 `?technique=` 쿼리로 상태 유지).

### 나의 기술 그래프

노드 색상은 14단계 숙련도 계산(`skillProgress/computeSkillProgress.ts`)을 그대로 재사용합니다
(🟢 숙련 · 🟡 보통 · 🔵 학습 중 · 🔴 개선 필요 · ⚪ 미학습) — 새 숙련도 계산을 만들지 않았습니다.

### AI 연결 추천 (12단계 AI 개인 코치와의 연결)

"이 기술을 배우고 나면 다음에 뭘 배우면 좋아?" 같은 질문에 답할 수 있도록, 기술 상세/그래프
페이지에서 여는 AI 질문 모달의 컨텍스트(`buildTechniqueContext`)에 그 기술의 실제 연결
데이터(선행/다음/카운터/탈출/같은 포지션)를 추가했습니다. AI는 이미 계산된 실제 연결만 보고
답하며, 스스로 새 기술 이름을 만들어내지 않습니다.

## 상황별 AI 기술 추천

AI 개인 코치 페이지(`/coach`)의 "🎯 상황별 기술 추천" 카드에서 들어가는 `/situation` 페이지는
"상대가 계속 압박해", "클린치에서 뭘 해야 해?" 같은 실제 상황을 설명하면 관련 기술을
추천합니다. 별도 최상단 메뉴는 만들지 않고("오늘의 훈련"과 같은 방식), AI 코치 페이지에서만
들어갈 수 있게 했습니다.

### 기술을 지어내지 않는 방식 (whitelist 검증)

`situationRecommend/candidatePool.ts`가 먼저 **실제 후보 기술 목록**을 만듭니다:

1. 선택한 상황 카테고리(거리/공격/방어/클린치/테이크다운/그라운드/가드/탈출/전환/카운터)의
   키워드로 `searchTechniques()`(검색창과 같은 인덱스) 검색
2. 60자 이하로 짧은 경우에만 상황 설명 문장 자체로도 검색(16단계와 같은 이유로, 긴 문장은
   검색 쿼리로 신뢰하지 않음)
3. 상황 설명에 실제 기술 이름이 그대로 언급되어 있으면, 16단계 기술 그래프에서 그 기술의
   실제 카운터/탈출/다음 기술 연결까지 후보에 포함(예: "더블렉을 막으려면?" → Double Leg의
   실제 카운터 기술)

이렇게 만든 후보 목록의 id만 Gemini에게 보여주고 "이 안에서만 골라라"라고 지시하며,
응답에서 후보 목록에 없는 id는 전부 버립니다 — 11/15/16단계와 동일한 whitelist 검증
패턴입니다. AI 호출이 실패하면, 후보 목록을 사용자의 숙련도(14단계)·현재 커리큘럼 Day 기준으로
직접 정렬하는 결정론적 폴백으로 대체합니다(숙련 기술보다 학습 중/개선 필요 기술, 현재
커리큘럼에서 다루는 기술을 우선).

### 나의 데이터 반영

추천 이유를 생성할 때 사용자의 무술, 각 후보 기술의 숙련도(14단계), 개선이 필요한 기술
TOP(14단계 약점 분석), 같은 무술의 최근 스파링 분석에서 관찰된 약점(15단계), 현재 커리큘럼의
진행 중인 Day(9단계)를 컨텍스트로 함께 전달합니다. AI와 폴백 로직 모두 이미 숙련된 기술보다
학습 중이거나 현재 커리큘럼에서 다루는 기술을 우선하도록 지시/정렬됩니다.

### 기술 상세 연결과 안전한 표현

추천된 기술마다: 기술 상세 페이지 링크, (카메라 자세 분석을 지원하는 기술만) 자세 분석 버튼,
"오늘의 훈련에 추가"(15/16단계와 같은 `addTechniqueToSession` 재사용), "커리큘럼에 추가"(기존
`curriculumService.addTechniqueToDay`/`saveCustomCurriculum` 재사용, 새 저장 시스템 없음)를
제공합니다. 안내 문구와 추천 이유 모두 "교육/훈련용 참고"라는 표현을 포함하며, 실제 대련·시합
성공을 보장하는 단정적 표현은 쓰지 않습니다.

### 알려진 제한

AI 호출이 실패했을 때만 쓰이는 결정론적 폴백은, 상황 설명 문장 전체를 검색 인덱스에 넣어
얻는 결과라 가끔 기술명이 아닌 카테고리성 항목(예: 무술 스타일 구분 항목)이 섞여 나올 수
있습니다 — 항상 실제 존재하는 기술이지만(지어낸 기술 아님), 관련도가 완벽하지 않을 수 있다는
뜻입니다. AI 호출이 정상 동작하는 일반적인 경우에는 해당하지 않습니다.

## 종합 훈련 기록 및 통계 시스템

"나의 통계"(`/stats`) 페이지는 새 저장소를 만들지 않고, 지금까지 쌓인 4개의 기존 기록
저장소 — 훈련 기록(`trainingHistory`, 12~14단계), 카메라 자세 분석 기록(`poseAnalysis`,
10단계), 스파링 분석 기록(`sparringAnalysis`, 15단계), 기술 숙련도(`skillProgress`,
14단계) — 를 기간별로 집계해서 보여주는 대시보드입니다.

### 기간별 통계 (7일/30일/3개월/전체)

`statsHub/periodUtils.ts`가 선택한 기간의 시작 시각을 계산하고, `overviewStats.ts`/
`martialArtStats.ts`/`sparringStats.ts`/`trendData.ts`가 각 저장소의 실제 타임스탬프
(`completedAt`, `analyzedAt`, `date`)로 필터링합니다. "전체"를 선택하면 하한 없이 모든
기록을 봅니다. "현재 숙련 기술 수"만 예외적으로 기간과 무관한 스냅샷입니다 — 숙련도는
"현재 상태"이지 특정 기간에 발생한 사건이 아니기 때문입니다.

### 그래프 — 실제 기록이 없으면 표시하지 않음

`TrendChart.tsx`(신규, `ScoreHistoryChart.tsx`와 같은 방식의 순수 인라인 SVG, 차트
라이브러리 없음)로 훈련 시간·훈련 횟수·평균 자세 분석 점수 추이를 보여줍니다. 기간 길이에
따라 일 단위(7/30일)·주 단위(3개월)·월 단위(전체, 실제 가장 오래된 기록부터) 버킷으로
나눕니다. 훈련 시간/횟수는 기록이 없는 날도 "0"으로 표시하지만(실제로 안 했다는 사실이므로),
평균 점수는 그 구간에 분석 기록이 하나도 없으면 그 지점을 아예 그리지 않습니다(0점을
받았다는 뜻이 아니므로 지어내지 않음). "숙련도 변화"는 등급 변화 이력을 별도로 기록하지
않기 때문에, 실제 분석 점수 평균 추이로 대신 보여주고 그렇게 명시합니다. 스파링 통계의
"스타일 변화"는 15단계의 실제 스파링 세션 점수를 이 페이지의 선택 기간에 맞춰 다시
필터링해 보여줍니다.

### AI 요약 — 실제 기간 비교 데이터만 근거로 사용

"이번 기간에는 클린치와 테이크다운 학습량이 증가했습니다" 같은 요약을 만들기 위해,
`aiSummaryService.ts`가 먼저 **이번 기간 vs 직전 동일 길이 기간**의 실제 훈련 횟수/시간/
스파링 횟수, 그리고 14단계 `positionClassifier.ts`로 분류한 포지션별 학습 횟수 비교를
전부 계산합니다. Gemini에는 이렇게 이미 계산된 숫자만 건네고 "이 숫자만 근거로 요약하라,
없는 사실을 만들지 마라"고 지시합니다 — 12단계 AI 코치와 같은 "AI는 서술만, 판단은 코드가"
경계입니다. AI 호출이 실패하면 같은 숫자로 만든 결정론적 문장 요약으로 대체됩니다.

## AI 기반 복습 및 반복 학습 시스템

"오늘의 복습"(`/review`)은 새 학습 데이터를 만들지 않고, 이미 있는 기록 — 14단계
`skillProgress`의 숙련도·다음 복습 예정일, 15단계 스파링 세션의 기술 사용 이력 — 만
가지고 "지금 무엇을 다시 봐야 하는가"를 계산하는 기능입니다.

### 복습 우선순위 계산 방식 — 결정론적 가중합

`reviewSystem/reviewEngine.ts`의 `computeReviewCandidates()`가 14단계에서 이미 계산된
전체 기술 숙련도(`computeAllSkillProgress()`)를 한 번 순회합니다. `status`가
`'not_started'`인 기술(한 번도 학습/분석하지 않은 기술)은 애초에 후보에서 제외합니다 —
실제로 배운 적 없는 기술을 "복습하라"고 추천하지 않기 위해서입니다. 나머지 각 기술에
대해 다음 실제 신호들을 더한 `urgencyScore`를 계산합니다(12단계 약점 랭킹과 같은
"가중합 + 임계값" 방식이며, 학습된 모델이 아닙니다):

- **복습 예정일 초과일수** — 숙련도가 이미 계산해 둔 `nextReviewAt`(마지막 학습일 +
  숙련도별 권장 간격) 대비 오늘이 며칠 지났는지. 하루당 8점, 최대 60점/최소 -30점.
- **현재 숙련도** — 개선 필요 +30 / 학습 중 +15 / 보통 +10 / 숙련 +0.
- **최근 점수 변화** — 자세 분석 점수가 하락 추세면 하락폭에 비례해 최대 +30.
- **최근 스파링 사용 여부** — 최근 14일 내 스파링 분석에서 이 기술이 사용된 것으로
  추정되면(15단계 `techniqueGuesses`) +15.

합산 점수가 40 이상이면 🔴 오늘 복습 추천, 10 이상이면 🟡 곧 복습, 그 미만이면 🟢
유지 중으로 분류합니다. 각 후보의 "이유" 문구는 실제로 어떤 조건이 발동했는지를
그대로 이어 붙여 만들며(예: "복습 예정일이 3일 지났습니다 · 최근 점수가 하락하는
추세입니다"), 근거 없이 지어내지 않습니다.

### 오늘의 복습 화면

`buildTodayReviewPlan()`이 유지 중이 아닌 후보를 점수순 최대 8개까지 골라 "오늘의
복습" 목록으로 만들고, 기술당 7분으로 예상 시간을 계산합니다(`/review` 미리보기
화면의 "복습 시작" 전 상태). 시작하면 그 순간의 기술 목록을 세션에 고정해 두어, 복습
도중 점수가 바뀌어도 목록이 흔들리지 않습니다. 기술별 화면은 실제 기술 데이터(설명,
핵심 원리), 10단계 `RelatedVideos`, 14단계 자세 분석 점수 이력(`ScoreHistoryChart`),
16단계 기술 연결 그래프(`getTechniqueConnections`)를 그대로 재사용해서 보여주며, 지원
기술이면 그 자리에서 다시 카메라 자세 분석을 실행할 수 있습니다.

### 저장 방식 — 기존 trainingHistory 재사용, 복습 전용 기록 없음

복습 세션 자체는 `martialdex:review-session`이라는 하루 단위 임시 상태(오늘 날짜가
바뀌면 자동으로 새로 계산)로만 저장됩니다. "복습 완료"를 누르면 새 저장소를 만드는
대신 12~13단계부터 있던 `trainingHistory` 로그에 `source: 'review'` 태그로 한 건을
기록합니다 — 그래서 18단계 통계 페이지의 "훈련 횟수/시간" 집계에도 복습이 자동으로
포함됩니다.

### AI 복습 계획 — "이번 주에 무엇을 복습해야 할까?"

`reviewAiService.ts`는 위에서 이미 계산한 실제 후보 목록과 티어를 Gemini에게 그대로
건네고, 그 목록 안에 있는 기술과 이유만 근거로 3~5문장 요약을 만들라고 지시합니다 —
12단계 AI 코치, 18단계 통계 요약과 같은 "AI는 서술만, 기술 선택은 코드가" 경계입니다.
AI 호출이 실패하면 같은 후보 목록으로 만든 결정론적 문장(티어별 기술 이름 나열)으로
대체됩니다.

### 커리큘럼 연동

각 복습 후보 옆의 "커리큘럼에 추가" 버튼은 17단계 상황별 추천에서 쓰던
`resolveTodayDay()`/`addTechniqueToDay()`/`saveCustomCurriculum()`을 그대로 호출해
내 커리큘럼의 오늘 Day에 추가합니다 — 복습 목록과 커리큘럼은 서로 다른 화면이지만
저장은 같은 커리큘럼 데이터를 공유합니다.

### 알려진 제한

복습 우선순위는 카메라 자세 분석 점수·학습 기록·스파링 사용 이력이라는 근사적 신호의
가중합일 뿐, 실전에서 그 기술이 실제로 얼마나 준비됐는지를 보장하지 않습니다. AI
주간 계획 역시 이미 계산된 후보 목록을 자연어로 정리해 줄 뿐 새로운 판단을 하지
않으며, 전문 지도자의 피드백을 대체하지 않습니다.

## 나만의 무술 스타일 분석 + 목표 스타일 비교 + 업적 시스템

"나의 스타일"(`/my-style`)과 "프로필"(`/profile`)은 지금까지 쌓인 실제 기록 —
14단계 기술 숙련도, 15단계 스파링 분석, 12~13단계 훈련 기록, 11단계 선수 스타일
분석 시스템 — 을 종합해서 "나는 지금 어떤 스타일인가", "목표 스타일과 무엇이
다른가", "얼마나 꾸준히 학습했는가"를 보여줍니다. 새 데이터 저장소는 최소한으로만
추가했고, 가능한 모든 곳에서 기존 계산 엔진을 그대로 재사용합니다.

### 데이터 구조 — 새로 추가한 것 vs 재사용한 것

새로 추가한 저장소는 세 가지뿐입니다: 나의 스타일 분석 캐시(`martialdex:my-style-analysis`,
단일 객체), 업적 최초 달성 시각(`martialdex:achievements-unlocked`, id→ISO 시각
맵), 그리고 이번 단계에서 만든 목표 스타일 커리큘럼(11단계 `styleCurriculumService`가
쓰던 기존 커리큘럼 저장소를 그대로 사용 — 새 키 없음). 나머지는 전부 기존
저장소를 읽기만 합니다: `poseAnalysis`(자세 분석 점수), `trainingHistory`(훈련
기록·Streak 계산의 유일한 근거), `sparringAnalysis`(스파링 세션), `curriculum`
(진행률), `fighterStyle`(선수 스타일 분석·기술 매칭). `src/lib/myStyle/dataAggregator.ts`
가 이 저장소들을 한 번 훑어 실제 숫자만 담은 `MyStyleDataSummary`를 만들고, AI
프롬프트와 폴백 요약 둘 다 이 객체 하나만 근거로 사용합니다.

### 스타일 분석 방식 — 데이터 부족 게이트 + "AI는 서술만"

`buildMyStyleDataSummary()`는 스파링 분석이 1건이라도 있거나, 훈련 기록이 5회
이상이면서 서로 다른 기술을 5개 이상 연습한 경우에만 `hasEnoughData: true`를
반환합니다. 이 값이 거짓이면 페이지는 "분석 데이터가 부족합니다"만 보여주고 그
아래 어떤 스타일 이름도, 별점도 계산하지 않습니다. 데이터가 충분하면
`styleAnalysisEngine.ts`가 그 숫자들(포지션별 평균 점수, 자주 쓴 기술 빈도, 스파링
평균 공격/방어/거리 점수, 최근 관찰 내용)만 Gemini에 건네고 "이 숫자에 없는 사실은
지어내지 말고, 근거가 없는 항목은 정확히 '데이터 부족'이라고 답하라"고 지시합니다
— 12단계 AI 코치, 19단계 복습 계획과 같은 "AI는 서술만, 판단은 코드가" 경계입니다.
AI 호출이 실패하면 같은 숫자로 만든 결정론적 요약(예: 클린치 포지션 분석 횟수/평균
점수)으로 대체되고, 데이터가 없는 항목은 폴백에서도 "데이터 부족"으로 남습니다.
분석 결과는 입력 데이터의 해시와 함께 캐시되어, 새 스파링/훈련 기록이 없으면 다시
분석 버튼을 눌러도 Gemini를 다시 호출하지 않습니다(18단계 최적화 원칙과 동일).

### 목표 스타일 — 기존 선수 스타일 시스템을 그대로 재사용

목표 스타일 검색은 11단계에 이미 있던 `extractFighterQuery`→`identifyFighterCandidates`
→`getOrGenerateStyleAnalysis`→`matchStyleToTechniques` 파이프라인을 한 글자도
바꾸지 않고 그대로 호출합니다. "마카체프 스타일"처럼 실존 선수를 검색하면 원래
동작 그대로 동작하고, "복싱 중심"/"레슬링 중심"/"BJJ 중심"처럼 특정 선수가 아닌
경우에는 `identifyFighterCandidates`가 "실제로 존재하며 공개적으로 잘 알려진
인물"만 후보로 반환하도록 설계되어 있어 후보를 찾지 못합니다. 이를 위해
`myStyle/targetStyleService.ts`는 실존 인물 식별 단계만 건너뛰고, 무술 중심
설명을 담은 합성 `FighterCandidate`(예: `{ name: "복싱 중심 스타일", sport: "복싱",
shortDescription: "..." }`)를 만들어 `getOrGenerateStyleAnalysis` 이후 단계부터
동일한 파이프라인에 그대로 진입시킵니다 — 스타일 분석·기술 매칭·기간 추천·커리큘럼
생성 로직은 실존 선수든 무술 중심 설명이든 완전히 같은 코드를 탑니다.

### 현재 스타일 vs 목표 스타일 비교 — 두 쪽 다 같은 분류기로 계산

비교는 14단계/18단계에서 이미 쓰던 `skillProgress/positionClassifier.ts`의 5개
포지션(Standing/Clinch/Guard/Mount/Back Control) 기준으로만 이뤄집니다. 현재
쪽 별점은 그 포지션에 실제 자세 분석 기록이 있는 기술들의 평균 점수(100점 만점을
5점 만점으로 환산)이고, 목표 쪽 별점은 목표 스타일에 매칭된 실제 기술들
(`matchStyleToTechniques`가 이미 계산한 `relevanceScore`)을 같은 분류기로 나눠
평균 낸 값입니다. 어느 한쪽이라도 실제 데이터가 없는 포지션은 별점 대신 "데이터
부족"이라고만 표시하고, 절대 0점이나 임의의 별점을 채워 넣지 않습니다. "우선적으로
학습할 부분"은 (목표 별점 − 현재 별점)이 큰 순서로 최대 3개를 고르고, 그 포지션에서
목표 스타일과 가장 관련도가 높은 실제 기술 하나를 추천합니다 — 어떤 기술을
추천할지는 전부 코드가 결정하며 AI는 이 목록 생성에 관여하지 않습니다.

### 목표 스타일 커리큘럼 — 기간 추천/생성 로직도 재사용

기간 선택(7/14/30/60/90일 + 직접 입력)과 "AI가 기간 추천"은 11단계
`durationAdvisor.recommendDuration()`을, 실제 생성은 `styleCurriculumService.saveNewStyleCurriculum()`
을 그대로 호출합니다. 생성된 커리큘럼은 `styleMeta` 필드를 가진 완전히 평범한
`Curriculum`이므로, `listMyStyleCurricula()`·진행률 추적·Day 학습 화면 등 기존
커리큘럼 기능이 아무 수정 없이 그대로 작동합니다.

### 스파링 연동 및 스타일 변화 — 모션 이벤트 기반, AI 호출 없음

"스파링마다 스타일 분석 갱신"은 매 세션마다 Gemini를 다시 부르는 대신,
15단계에서 이미 세션마다 기록해 둔 실제 `motionEvents`(타격/테이크다운 시도/
클린치/풋워크/거리 이탈/가드 유지 6개 카테고리)만으로 결정론적으로 계산합니다.
`myStyle/styleEvolution.ts`의 `buildSparringStyleTimeline()`은 세션을 시간순으로
훑으며 이전 세션 대비 우세 카테고리 비중이 15%p 이상 늘면 "○○ 비중 증가", 우세
카테고리 자체가 바뀌면 "○○ 중심으로 전환"이라고 표시합니다.
`computeMonthlyStyleTrend()`는 같은 데이터를 월 단위로 묶어 타격 계열/그래플링
계열 비중이 60% 이상이면 "Striking 중심"/"Grappling 중심", 그 사이면 "Mixed"로
분류합니다 — 두 함수 모두 실제 세션이 있는 달/세션에서만 항목을 만들고, 스타일
변화 섹션은 최소 2개 이상의 데이터가 있을 때만 화면에 나타납니다.

### 업적 조건 — 전부 실제 기록 카운트, 가짜 진행도 없음

`achievements/definitions.ts`의 9개 업적은 전부 `profileStats/collectProfileStats.ts`
가 계산한 실제 카운트(학습/숙련 기술 수, 완료한 훈련 세션 수, 스파링 세션 수, 완료한
커리큘럼/목표 스타일 커리큘럼 수, 연속 학습일)와 비교해서만 해금됩니다. 예를 들어
"50개 기술 학습"은 `summarizeOverallCounts().total - not_started`(즉 학습 신호가
하나라도 있는 실제 기술 수)가 50 이상일 때만, "첫 목표 스타일 커리큘럼 완료"는
`getProgress(curriculumId)?.progress === 100`인 목표 스타일 커리큘럼이 하나라도
있을 때만 해금됩니다. 최초 해금 시각은 `achievements-unlocked` 저장소에 "처음
조건이 충족된 걸 감지한 시각"으로만 기록하며, 과거로 소급해서 날짜를 지어내지
않습니다.

### 레벨 · Streak 계산 방식

레벨은 `level/levelEngine.ts`가 같은 실제 카운트(학습/숙련 기술 수, 훈련·스파링
횟수, 완료한 커리큘럼 수)에 고정 가중치를 곱해 더한 XP를 7단계 임계값과 비교해
정합니다 — 학습된 모델이 아닌 단순 가중합이며, 앱 내부 학습 진행도 지표일 뿐
실제 무술 실력이나 대회 성적을 인증하지 않는다는 문구를 프로필/나의 스타일 화면
모두에 표시합니다. Streak는 `streak/streakEngine.ts`가 `trainingHistory`의 실제
`date`(완료된 항목만) 집합에서 계산합니다 — 앱을 켠 기록이나 미완료 세션은 전혀
포함하지 않으며, 오늘 아직 훈련하지 않았어도 어제까지 연속 기록이 있으면 그
연속 일수를 유지해서 보여줍니다.

### 성능 최적화

1,253개 기술 전체를 순회하는 `computeAllSkillProgress()`는 프로필/업적/레벨을
함께 보여주는 `useProfileStats()` 안에서 딱 한 번만 호출되어 통계와 업적 계산이
그 결과를 공유합니다. 나의 스타일 AI 분석은 입력 데이터 해시가 바뀌지 않으면
캐시된 결과를 그대로 쓰고 Gemini를 다시 호출하지 않으며, 업적 최초 달성 시각도
매번 다시 스캔하지 않고 한 번 기록한 뒤 그대로 재사용합니다.

### AI 개인 코치 통합

`buildCoachContext()`(12단계)에 나의 현재 스타일 요약(캐시된 실제 분석 결과),
월별 스타일 변화 추이, 목표 스타일과 비교한 실제 격차 영역, 학습
레벨/연속 학습일을 추가했습니다 — 전부 이미 계산된 실제 값이며 이 함수 자체는
새로운 판단을 하지 않습니다. AI 코치 페이지의 "AI에게 직접 물어보기" 채팅이 이
컨텍스트를 그대로 사용하므로 "다음에 뭘 해야 해?" 같은 질문에 스타일/업적/Streak
맥락까지 반영해 답할 수 있습니다.

### 알려진 제한

나의 스타일 분석은 카메라 자세 분석·스파링 모션 감지·훈련 기록이라는 근사적
신호에 기반한 참고 자료이며, 실제 실력이나 대회 성적을 평가하지 않습니다. 목표
스타일 비교의 별점 역시 검색 매칭 기반 관련도 점수를 5단계로 환산한 것일 뿐 정밀한
기술 수준 측정이 아닙니다. 업적·레벨·Streak는 앱 내 학습 동기부여용 지표이며
공인된 급수나 자격을 의미하지 않습니다.

## Supabase 회원가입/로그인 및 사용자 데이터 시스템

`/login`·`/signup`·`/reset-password`·`/profile`은 무료 Supabase Auth로 이메일 회원가입/
로그인을 제공하고, 로그인한 사용자의 데이터를 Supabase Database에 백업/복원할 수 있게
합니다. 20단계까지 만든 모든 기능은 로그인 여부와 무관하게 지금까지와 완전히 동일하게
로컬(localStorage)에서 작동합니다 — 이 단계는 그 위에 "선택적으로 계정에 연결"하는 층을
얹은 것이지, 기존 저장 방식을 교체한 것이 아닙니다.

### 아키텍처 — 로컬 우선은 그대로, 클라우드는 additive

`src/lib/supabase/client.ts`가 `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`가
모두 설정된 경우에만 `supabase` 클라이언트를 만들고, 그렇지 않으면 `null`을 내보냅니다.
로그인/회원가입/프로필/백업 관련 코드는 전부 이 값이 `null`일 수 있다는 전제로 작성되어
있어서, Supabase를 설정하지 않아도 기술 백과사전·검색·커리큘럼·자세 분석 등 기존 기능은
지금까지와 똑같이 동작합니다(이번 단계 QA의 핵심 확인 대상). `anon`/publishable 키는
Gemini API 키(12단계, 메인 프로세스 전용)와 달리 **의도적으로 렌더러 번들에 포함**됩니다
— Supabase의 보안 경계는 키를 숨기는 것이 아니라 데이터베이스의 Row Level Security이기
때문입니다. `service_role` 키는 이 프로젝트 어디에도 존재하지 않습니다.

### 인증 흐름

`AuthProvider`(`src/lib/auth/AuthProvider.tsx`)가 앱 최상단에서 `supabase.auth.getSession()`
+ `onAuthStateChange` 구독을 한 번만 만들어 모든 페이지가 `useAuth()`로 공유합니다.
회원가입(`signUpWithEmail`)은 이메일/비밀번호/닉네임을 받아 `supabase.auth.signUp`을
호출하고, 실제 `profiles` 행 생성은 **클라이언트가 직접 하지 않습니다** — "이메일 확인"이
켜져 있으면 가입 직후에는 아직 세션이 없어 RLS가 클라이언트의 insert를 막기 때문에,
`auth.users`에 새 행이 생기는 순간 자동으로 `profiles` 행을 만드는 `SECURITY DEFINER`
트리거(`supabase/migrations/0001_profiles.sql`)를 사용합니다. 로그인은
`signInWithPassword`, 로그아웃은 헤더 아이콘/프로필 페이지의 "로그아웃" 버튼에서
`signOut` 호출 후 `/login`으로 이동합니다. 세션은 Supabase JS SDK가 기본으로 로컬
스토리지에 저장/자동 갱신하므로(`persistSession`/`autoRefreshToken` 옵션), Electron 앱을
완전히 종료했다가 다시 실행해도 별도 코드 없이 로그인 상태가 유지됩니다.

### profiles 테이블과 RLS

```
profiles: id, user_id(auth.users 참조, unique), nickname, avatar, created_at, updated_at
```
모든 개인 데이터 테이블(`profiles`, `curricula`, `curriculum_progress`, `user_backups`)에
Row Level Security를 켜고, 정확히 "`auth.uid() = user_id`"만 허용하는 select/insert/
update/delete 정책 4개씩을 둡니다 — 다른 사용자의 행은 어떤 쿼리로도 보이지 않으며,
이 규칙을 우회하기 위해 `service_role`을 쓰는 코드는 어디에도 없습니다. SQL은
`supabase/migrations/*.sql`에 있고, Supabase 대시보드의 SQL Editor(또는
`supabase db push`)로 실행합니다.

### 사용자별 데이터 — 커리큘럼은 실제 동기화, 나머지는 통합 백업

item 11이 요구하는 9종 데이터를 전부 개별 테이블로 정규화하는 대신(사용자와 상의해
범위를 정함), 두 갈래로 나눴습니다:

- **커리큘럼 + 진행률** (`curricula`, `curriculum_progress`): id/제목/무술/기간 같은 실제
  컬럼과 함께 로컬 `Curriculum`/`CurriculumProgress` 객체 전체를 `data jsonb`로 저장 —
  기존 `curriculumService.ts`/`repository.ts`의 읽기/쓰기 코드를 한 줄도 바꾸지 않고,
  `src/lib/cloudSync/curriculumSync.ts`가 push(로컬→클라우드)/pull(클라우드→로컬)만
  추가로 제공합니다.
- **그 외 전부** (기술 숙련도, 훈련 기록, 스파링 기록, 자세 분석 기록, 업적, Streak,
  목표 스타일, 나의 스타일 분석): `user_backups` 테이블 한 행에 이 기기의 `martialdex:*`
  localStorage 키를 통째로 스냅샷(JSON)해서 저장합니다(`src/lib/cloudSync/dataBackup.ts`).
  개별 기능마다 테이블/RLS/동기화 코드를 새로 만들지 않고도 "로그인해서 이 기기의 모든
  학습 데이터를 계정에 저장하고, 다른 기기에서 복원한다"는 실제 동작을 제공합니다.

### 로컬 데이터 이전 방식

로그인 직후 이 기기에 로컬 데이터가 있고 아직 물어본 적이 없으면
`LocalDataMigrationPrompt`가 정확히 스펙 예시대로 "기존 데이터를 계정에 저장할까요?
[저장하기] [나중에]"를 보여줍니다. [나중에]를 눌러도 데이터는 그대로 남고, 언제든 프로필
페이지의 "☁️ 계정에 백업하기"로 다시 저장할 수 있습니다. "계정에서 복원하기"는 반대
방향(클라우드→이 기기)이며, 로컬 데이터를 덮어쓰므로 실행 전 확인 대화상자를 거칩니다.

### 비로그인 사용자 / 개인 데이터 안내

기술 백과사전, 검색, 필터, 기술 상세, YouTube, 기술 그래프 등은 로그인 여부와 무관하게
항상 그대로 사용할 수 있습니다. item 7이 지정한 개인 데이터 기능(내 커리큘럼/훈련
기록/숙련도/스파링 기록/나의 스타일)은 로그인 없이도 계속 로컬로 완전히 동작하되 —
기존 기능을 훼손하지 않기 위해 로그인을 강제로 요구하지 않습니다 — 각 페이지 상단에
`LoginToBackupBanner`로 "로그인하면 계정에 백업할 수 있습니다"라고 안내만 합니다.
업적/Streak/나의 스타일 분석은 이미 로컬 데이터로 계산되므로 로그인 없이도 프로필
페이지에서 그대로 보이고, 로그인 시에만 닉네임·가입일·백업 버튼이 추가로 나타납니다.

### 오류 처리

`src/lib/auth/authErrors.ts`가 Supabase(GoTrue) 오류 문자열을 부분 일치로 매칭해 한국어
메시지로 바꿉니다(이메일/비밀번호 불일치, 이메일 중복, 세션 만료, RLS 권한 오류 등).
인터넷 연결이 없으면(`navigator.onLine === false` 또는 fetch 실패) "인터넷 연결을
확인해주세요"로 안내합니다. 모든 auth/동기화 함수는 예외를 던지지 않고
`{ ok: false, message }`를 반환하도록 통일해서, 어떤 Supabase 오류도 화면을 깨뜨리지
않습니다. `.env`에 값이 없거나 잘못된 경우(`createClient` 실패 포함)에도 앱 전체가 아니라
로그인 관련 화면만 "Supabase 설정이 되어 있지 않습니다"로 대체됩니다.

### 실제 프로젝트에 연결하며 발견/수정한 문제 (배포 시 참고)

실제 Supabase 프로젝트로 라이브 테스트하는 과정에서 로컬 목업만으로는 드러나지 않는
문제 두 가지를 발견해 함께 고쳤습니다 — 같은 방식으로 새 Supabase 프로젝트를 붙이는
누구에게나 재현될 문제라 여기 기록합니다.

1. **CSP가 Supabase로의 네트워크 연결 자체를 막고 있었습니다.** `index.html`의
   Content-Security-Policy가 5단계(포즈 분석) 때 "외부 서버 요청 0건"을 강제하려고
   `connect-src 'self'`로 좁혀져 있었는데, 이 정책이 Supabase 요청도 그대로 차단했습니다.
   `connect-src`에 `https://*.supabase.co wss://*.supabase.co`를 추가해 해결했습니다.
2. **RLS는 맞았지만 테이블 자체에 GRANT가 없었습니다.** SQL Editor에서 `create table`로
   만든 테이블은 Table Editor UI로 만든 것과 달리 `authenticated`/`anon` 역할에 대한
   기본 GRANT가 자동으로 붙지 않습니다 — RLS 정책이 완전히 맞아도 역할 자체에 테이블
   접근 권한이 없으면 모든 요청이 "42501 permission denied"로 거부됩니다.
   `supabase/migrations/0004_grants.sql`로 `authenticated`에는 CRUD 권한을 주고,
   `anon`에는 의도적으로 아무 권한도 주지 않았습니다(개인 데이터 테이블이므로 RLS로
   행 단위 필터링하는 것보다, 애초에 쿼리 자체를 거부하는 쪽이 더 강한 보장입니다).

### 알려진 제한

- 비밀번호 재설정은 이메일 발송까지만 지원합니다. 이메일의 링크를 눌러 새 비밀번호를
  실제로 설정하는 콜백 처리는 Electron에 커스텀 프로토콜(딥링크) 설정이 추가로 필요해
  이번 단계 범위 밖입니다.
- item 11의 9개 데이터 유형 중 커리큘럼/진행률만 개별 테이블로 정규화했고, 나머지는
  `user_backups`의 통합 JSON 백업으로 처리합니다(위 "사용자별 데이터" 참고) — 세밀한
  행 단위 RLS나 서버 측 쿼리가 필요한 시나리오에는 맞지 않습니다.

## 환경변수 설정

1. `.env.example`을 복사해서 `.env`를 만듭니다.
   ```bash
   cp .env.example .env
   ```
2. `.env`에 실제 값을 채웁니다.
   ```
   GEMINI_API_KEY=발급받은_실제_키
   GEMINI_MODEL=gemini-3.6-flash
   VITE_SUPABASE_URL=발급받은_프로젝트_URL
   VITE_SUPABASE_PUBLISHABLE_KEY=발급받은_anon_key
   ```
   - `GEMINI_API_KEY`: https://aistudio.google.com/apikey 에서 무료로 발급 (결제 등록 불필요)
   - `GEMINI_MODEL`: 생략하면 기본값(`gemini-3.6-flash`) 사용
   - `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`: Supabase 프로젝트의
     Settings → API 페이지에서 확인 (둘 다 비워두면 로그인/회원가입 기능만 비활성화되고
     나머지 앱은 정상 동작)

**주의**: 키는 `.env`에만 넣습니다. `.env.example`은 형식만 보여주는 템플릿이라 항상
git에 커밋되므로 실제 키를 넣으면 안 됩니다. `.env`는 `.gitignore`에 포함되어 있고,
`GEMINI_API_KEY`/`GEMINI_MODEL`은 `electron/main.cjs`가 앱 시작 시에만 읽는 메인
프로세스 전용 값입니다(`dotenv`). `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`는
반대로 Vite가 빌드 시점에 렌더러 번들에 포함시키는 값이며, 이는 의도된 동작입니다(위
"Supabase 회원가입/로그인 및 사용자 데이터 시스템" 참고). `service_role` 키는 절대
`.env`를 포함해 이 프로젝트 어디에도 넣지 않습니다 — RLS를 완전히 우회하는 키입니다.
키를 설정하지 않아도 앱은 정상 실행되며, 각 기능은 "설정되지 않았습니다" 안내만
표시합니다.

## 배포 방법 (Electron 데스크톱)

`electron-builder`가 devDependency로 설치되어 있고 `electron-builder.config.cjs`에
테스트 빌드용 설정(appId `com.martialdex.testbuild`, mac dmg/zip, win nsis)이 있습니다.

```bash
npm run dist:mac   # macOS: dist/renderer 빌드 후 release/ 에 .dmg/.zip 생성
npm run dist:win   # Windows: dist/renderer 빌드 후 release/ 에 .exe(nsis) 생성
```

`asar`는 비활성화되어 있습니다 — `electron/main.cjs`가 `.env`를 `path.join(__dirname, '..',
'.env')`(앱 실행 파일 옆의 실제 파일)로 읽기 때문에, asar로 묶으면 이 경로가 읽기 전용
아카이브 내부를 가리키게 되어 테스트용 `.env` 배치 방식이 깨집니다. `.env`/`.env.*`는
`files` 설정에서 명시적으로 제외되어 패키지에 포함되지 않습니다 — 각 테스트 기기에서
앱 실행 파일 옆에 직접 `.env`를 만들어야 합니다.

로컬에서 "빌드가 실제로 깨지지 않는지"만 확인하려면 `npx tsc --noEmit && npm run build`로
충분합니다. 참고로 `electron/main.cjs`는 `app.isPackaged`가 `true`일 때만
`dist/renderer/index.html`을 로드하고, 그 외(예: 그냥 `electron .`으로 실행)에는 항상
개발 서버(`localhost:5173`)를 시도합니다 — 즉 `npm run electron`만 단독으로 실행해서는
`dist/renderer` 결과물이 실제로 로드되는지 검증되지 않습니다.

## Android 테스트 빌드 (Capacitor)

Electron은 데스크톱(Chromium+Node) 전용 프레임워크라 Android APK로 직접 패키징할 수
없습니다 — Electron 프로젝트를 그대로 "Android로 컴파일"하는 도구는 존재하지 않습니다.
대신 [Capacitor](https://capacitorjs.com/)로 같은 `dist/renderer` 웹 빌드 결과물을
네이티브 Android WebView 셸에 담아 APK를 만듭니다. **`src/` 아래 React/TypeScript
코드는 한 줄도 바뀌지 않았습니다** — Vite가 만드는 정적 웹 빌드가 그대로 재사용되고,
Electron 쪽 파일(`electron/*.cjs`, `electron-builder.config.cjs`)도 전혀 건드리지
않았습니다. 데스크톱(`npm run dev`/`dist:mac`/`dist:win`)과 Android
(`android/`, `capacitor.config.ts`)는 완전히 별도 산출물이며 서로 영향을 주지 않습니다.

### 사전 준비물 (한 번만 설정)

- **Android SDK**: `platforms;android-36`, `build-tools;35.0.0`, `platform-tools` —
  `sdkmanager`(cmdline-tools)로 설치. `android/local.properties`의 `sdk.dir`이 SDK
  경로를 가리킵니다(이 파일은 머신마다 달라 gitignore 대상입니다).
- **JDK 21**: Capacitor 8의 Android 모듈(`@capacitor/android`)이 Java 21
  `sourceCompatibility`/`targetCompatibility`를 요구합니다(`node_modules/@capacitor/android/capacitor/build.gradle`).
  시스템 기본 JDK가 더 낮다면(이 프로젝트 개발 환경은 JDK 19였음) 별도로 JDK 21을
  받아 `~/.gradle/gradle.properties`에 `org.gradle.java.home=<JDK 21 경로>`로
  지정하세요(이 파일도 사용자 홈 디렉터리에만 있고 저장소에는 없습니다).

### 빌드

```bash
npm run dist:android
```

내부적으로 순서대로 실행됩니다:

1. `node scripts/validate-android-config.mjs` — 빌드 전 configuration 검증(아래 참고).
   실패하면 이후 단계를 아예 실행하지 않습니다.
2. `npm run build` — `dist/renderer/`에 웹 빌드 생성 (데스크톱과 동일한 `vite build`).
3. `npx cap sync android` — 웹 빌드를 `android/app/src/main/assets/public`에 복사하고
   Capacitor 플러그인을 동기화.
4. `cd android && ./gradlew assembleDebug` — 실제 APK 빌드.

결과물: **`android/app/build/outputs/apk/debug/app-debug.apk`** (디버그 서명, 테스트
전용 — Play 스토어 배포용 release APK/AAB가 아닙니다).

### 앱 아이콘

`LOGO.png`(1254×1254)를 `@capacitor/assets`로 Android 런처 아이콘 전 밀도
(mdpi~xxxhdpi) + 적응형 아이콘(adaptive icon, API 26+) + 스플래시 화면으로 자동
생성했습니다:

```bash
npx capacitor-assets generate --android --iconBackgroundColor '#000000' --iconBackgroundColorDark '#000000'
```

`assets/logo.png`(LOGO.png 사본)가 소스이고, 결과물은
`android/app/src/main/res/mipmap-*/ic_launcher*.png` 및
`mipmap-anydpi-v26/ic_launcher.xml`에 생성됩니다. 로고 자체가 이미 둥근 사각형 +
검정 배경으로 디자인되어 있어 배경색을 `#000000`으로 맞춰 적응형 아이콘의 배경
레이어가 로고와 이음매 없이 붙습니다. 데스크톱 쪽 로고 사용(`src/assets/logo.png`,
헤더/스플래시 등)은 전혀 건드리지 않았습니다 — 같은 원본 파일에서 나온 두 개의 독립된
산출물입니다.

### Gemini AI 기능 — Android에서는 다른 경로를 사용합니다

Electron의 "메인 프로세스만 키를 안다" 트릭(`electron/gemini.cjs`)은 Android에는
적용할 수 없습니다 — Android APK에는 그런 특권 프로세스가 없고, APK에 넣는 모든 것은
압축 해제만으로 추출 가능합니다. 그래서 Android(및 향후 순수 웹 배포)는
**Supabase Edge Function**(`supabase/functions/gemini-ask/index.ts`)을 통해서만
Gemini를 호출합니다 — 실제 `GEMINI_API_KEY`는 이 함수의 서버 측 환경(Supabase
secrets)에만 존재하고, 클라이언트 번들/APK에는 절대 포함되지 않습니다.

- `src/lib/ai/provider.ts`가 두 전송 방식을 자동으로 선택합니다:
  `window.martialdex?.askAi`가 있으면(Electron) 기존 IPC 경로를 그대로 사용하고,
  없으면(Android/웹) `${VITE_SUPABASE_URL}/functions/v1/gemini-ask`로 HTTP 요청을
  보냅니다. UI 컴포넌트는 이 분기를 전혀 알 필요가 없습니다.
- Edge Function은 요청자의 Supabase 로그인 세션(access token)을 검증합니다 — 로그인하지
  않은 사용자는 호출할 수 없습니다. APK 안의 URL은 비밀이 아니므로(디컴파일하면 누구나
  볼 수 있음), 이 인증 게이트가 없으면 누구나 무료로 앱의 Gemini 할당량을 소진할 수
  있습니다.
- **배포는 별도로 필요합니다** — 이 세션에서는 함수 코드만 작성했고, 실제 배포(Supabase
  프로젝트 로그인/연결 권한 필요)는 하지 않았습니다:
  ```bash
  supabase login
  supabase link --project-ref <프로젝트 ref>
  supabase secrets set GEMINI_API_KEY=<발급받은 실제 키>
  supabase functions deploy gemini-ask
  ```
  배포 전까지 Android 앱에서 AI 질문 기능은 크래시 없이 "로그인이 필요합니다" 또는
  네트워크 오류 메시지를 정상적으로 보여줍니다(조용히 실패하지 않고, 실제 키 없이도
  앱 자체는 100% 정상 동작).

### TossPayments V2 실 결제 연동 (테스트 모드) — `supabase/functions/payment-verify/index.ts`

Gemini와 정확히 같은 이유로, 결제 승인도 클라이언트가 아니라 Edge Function이 서버 측에서
수행합니다: 토스페이먼츠의 "시크릿 키"(`test_sk_...`)는 이 함수의 Supabase secrets
에만 존재하고, 렌더러/APK에는 절대 들어가지 않습니다(`scripts/check-apk-no-payment-secrets.mjs`
가 빌드 결과물에 `PAYMENT_SECRET_KEY`라는 이름 자체가 나타나기만 해도 빌드를 실패시킵니다).

- `VITE_TOSS_CLIENT_KEY`가 설정되어 있지 않으면(기본값) 마켓플레이스는 기존
  TestPaymentProvider/PaymentModal 흐름을 그대로 사용합니다 — 아무 키도 없이도 앱은
  100% 정상 동작합니다.
- `VITE_TOSS_CLIENT_KEY`(토스 "클라이언트 키", 공개되어도 안전한 값)를 채우면
  구매 버튼이 토스페이먼츠 결제창(`@tosspayments/tosspayments-sdk`)을 엽니다. 결제는
  전체 페이지 리다이렉트로 완료되며, `/marketplace/payment/result` 페이지가 돌아온
  `paymentKey`/`orderId`를 서버(`payment-verify`)로 보내 승인을 확인한 뒤에만 구매
  권한을 부여합니다 — 클라이언트가 "성공했다"고 말하는 것만으로는 절대 구매가
  확정되지 않습니다.
- **배포/키 발급은 별도로 필요합니다**:
  ```bash
  supabase secrets set PAYMENT_SECRET_KEY=<https://developers.tosspayments.com/my/api-keys 에서 발급받은 테스트 시크릿 키>
  supabase functions deploy payment-verify
  ```
  그리고 `.env`에 같은 개발자센터에서 발급받은 **테스트** 클라이언트 키를
  `VITE_TOSS_CLIENT_KEY`로 넣습니다. 절대 라이브(실 결제) 키는 넣지 않습니다 — 이
  세션에서는 라이브 결제를 활성화하는 코드 경로 자체가 존재하지 않습니다.
- `PAYMENT_SECRET_KEY`가 설정되지 않은 동안 `payment-verify`는 여전히 이전과 같은
  테스트/샌드박스 무동작(no-op) 모드로 동작합니다 — 이 시크릿을 설정해야만 실제 토스
  서버 승인 API(`POST /v1/payments/confirm`) 호출이 활성화됩니다.

### 빌드 전 configuration 검증 (`scripts/validate-android-config.mjs`)

`npm run dist:android`가 자동으로 실행하며, 실제 키 값은 절대 출력하지 않고
FOUND/MISSING 상태만 보여줍니다:

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` — **필수**. 없으면 로그인/
  커리큘럼 동기화/숙련도 저장이 전부 죽어있는 채로 빌드되므로, 빌드 자체를 중단시킵니다
  (`Gemini API configuration is missing. Configure the required environment before
  building.`).
- `VITE_`로 시작하는 Gemini 관련 변수(예: 실수로 만든 `VITE_GEMINI_API_KEY`)가
  발견되면 **즉시 빌드를 중단**합니다 — `VITE_` 접두사가 붙은 값은 Vite가 그대로
  번들에 넣기 때문에, 이 실수 하나로 실제 키가 APK 안에 그대로 박히게 됩니다.
- `gemini-ask` Edge Function이 실제로 배포되어 응답하는지 best-effort로 확인하고,
  아직 배포 전이면 경고만 출력하고 빌드는 계속 진행합니다(위 "Android에서는 다른
  경로를 사용합니다" 참고 — 배포 전에도 앱은 정상 빌드/실행됩니다).

### 알려진 제약

- `compileSdk`/`targetSdk`가 36으로 고정되어 있습니다(`android/variables.gradle`,
  Capacitor 8 기본값). 로컬 SDK에 `platforms;android-36`이 없으면 먼저 설치해야
  합니다: `sdkmanager "platforms;android-36" "build-tools;35.0.0"`.
- 실제 물리 Android 기기 서명(release 키스토어), Play 스토어 배포용 AAB, 코드
  난독화(R8/ProGuard 활성화)는 구성되어 있지 않습니다 — 이번 작업은 로컬 기기 테스트용
  debug APK만을 목표로 합니다.
