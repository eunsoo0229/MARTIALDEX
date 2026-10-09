# MARTIALDEX — AI용 프로젝트 구조 가이드

> 이 문서는 **AI가 MARTIALDEX 개발 프롬프트를 작성하기 전에 읽는 요약본**입니다.
> 기능별 상세 설명은 루트 `README.md`(약 1,500줄)에 있습니다. 이 문서는 "어디에 무엇이 있고, 새 기능은 어떤 패턴으로 붙이는가"에 집중합니다.
> 마지막 갱신: 2026-10-01 (Ground Battle, 관련 영상 5개/URL 검증, AI 코치 Day, AI 코치 수업(집/체육관), 배운 기술 반영)

---

## 1. 한 줄 요약

무술 기술 백과사전(10개 무술, 약 1,250개 기술) + 학습 커리큘럼 + 훈련 기록 + AI(Gemini) 코칭 앱.
**하나의 React 코드베이스**를 세 플랫폼으로 배포합니다: macOS/Windows(Electron), Android(Capacitor), 웹.

## 2. 기술 스택

| 영역 | 사용 기술 |
|---|---|
| UI | React 18 + TypeScript + Vite 5, react-router-dom v6 (**HashRouter**, `#/경로`) |
| 스타일 | 단일 파일 `src/styles/global.css` (CSS 변수로 라이트/다크 테마). CSS 프레임워크 없음 |
| 데스크톱 | Electron 32 (`electron/main.cjs`, `preload.cjs`) — 렌더러는 `window.martialdex.*`로만 IPC 호출 |
| 모바일 | Capacitor 8 Android (`android/`, `capacitor.config.ts`, webDir `dist/renderer`) |
| 백엔드 | Supabase: Auth, Postgres(RLS), Edge Functions (`supabase/`) |
| AI | Google Gemini (키는 Electron 메인 프로세스 또는 Edge Function 서버에만 있음) |
| 검색 | Fuse.js (Web Worker) |
| 자세 인식 | MediaPipe Tasks Vision (로컬 번들 `public/mediapipe/`) |
| 결제 | Toss Payments (마켓플레이스) |
| QA | Playwright-core + Electron 실제 실행 스크립트 (`.devtools/qa-*.mjs`) |

## 3. 폴더 구조 (핵심만)

```
data/
  raw/*.md                  원본 기술 백과사전 마크다운 (데이터의 원천)
  processed/*.json          npm run parse 결과 (무술별 기술 JSON, _all.json, _meta.json)
  curated/videos.json       기술별 사람이 검증한 YouTube 영상
  curated/poseAnalysis.json 기술별 카메라 자세 분석 설정
  curriculum/official/*.json 무술별 공식 추천 커리큘럼
electron/                   main.cjs(IPC 핸들러), preload.cjs(노출 API), gemini.cjs, youtubeSearch.cjs
supabase/
  migrations/0001~0036_*.sql  테이블 + RLS (다음 번호: 0037; 0036 Ground Battle drop은 미적용 — 적용 여부는 사용자 결정)
  functions/                gemini-ask, web-search, youtube-search, payment-verify
src/
  App.tsx                   모든 라우트 (lazy import)
  types.ts                  Technique 등 공통 타입
  components/               공용 컴포넌트 (+ auth/, community/, nutrition/, sparring/)
  pages/                    화면 1개 = 파일 1개 (약 75개)
  lib/<도메인>/             기능별 로직 (아래 5절)
  styles/global.css
scripts/                    파서, 커리큘럼 생성기, 검증 스크립트
.devtools/                  QA 스크립트 (배포 미포함)
docs/stage-reports/         과거 단계별 작업 보고서 (HTML/PDF)
```

## 4. 핵심 데이터: `Technique` (`src/types.ts`)

```ts
id: "<martialArt>__<slug>"     // 예: "bjj__armbar" — 모든 기능이 이 id로 기술을 참조
martialArt, name(원문), koreanName, aliases, category, positions[],
description, purpose, principles[], variations[], counters[], defenses[],
transitions[], relatedTechniques[](id), difficulty, tags[], videos[],
posture?  // 자세 개요/시작 자세/단계/핵심 포인트/흔한 실수 (있을 때만)
```

- 조회: `src/lib/loadData.ts` → `allTechniques`, `getTechnique(id)`, `getTechniquesByMartialArt()`, `martialArtSummaries`
- **사용자 추가 기술까지 포함한 조회는 `src/lib/userTechniques/service.ts`의 `resolveTechnique(id)` / `resolveTechniquesByIds()` / `searchAllTechniques()`를 사용** (공식 DB + 사용자 요청 기술 + 커스텀 무술)
- 무술 id: `bjj, judo, karate, kickboxing, mixed-martial-arts, muay-thai, sambo, taekwondo, wrestling, boxing`
- 홈트/헬스 운동도 같은 `Technique` 형태 (`homeTrainingExercises`, `gymExercises`, `isSyntheticTrainingDomain()`)

### 4.1 정규 기술(canonical technique)과 카테고리 — 반드시 지킬 것
- 같은 실제 기술이 여러 레코드로 있던 것(BJJ·레슬링 Granby Roll 등)은 **정규 기술 하나**로 통합되어 있다: `data/curated/technique-canonical.json` (생성: `node scripts/build-technique-canonical.mjs`, 검토된 제외 목록 포함) → `loadData.ts`가 로드 시 병합.
  - 정규 기술 필드: `martialArts`(연결된 모든 무술), `categoryByArt`(무술별 카테고리), `mergedIds`(통합된 옛 id), `usageByArt`.
  - **옛 id도 계속 해석된다** (`getTechnique('bjj__granby-roll')` → 정규 기술). 사용자 데이터는 지우거나 바꾸지 않고 읽을 때 정규 id로 맞춘다.
- 기술을 id로 집계·비교할 때는 `techniqueCanonical/`의 `canonicalTechniqueId()`, 무술 소속은 `isTechniqueInArt()`, 무술별 분류는 `techniqueCategoryInArt()`를 쓴다. `t.martialArt === art` 직접 비교 금지.
- 카테고리 정규 집합 = 각 무술의 공식 카테고리(원문 목차). 새 기술/AI 결과는 `techniqueCanonical/category.ts`의 `canonicalCategoryFor()`로 기존 카테고리에 넣는다. 새 카테고리는 맞는 것이 없고 이유가 있을 때만.
- 새 기술 요청: "기술이 있는가"와 "그 무술에 연결돼 있는가"를 따로 판단 — 있으면 `techniqueCanonical/artLink.ts`로 무술 연결(공유 add_teq의 `linkOf` 레코드), 새 복사본 금지.
- **기술 관계 감사(v2)** — 검토된 결정은 `scripts/technique-relations.mjs`에만 적는다 (이름 유사도로 자동 병합·분리 금지):
  - `SPLITS`: 원문이 한 줄에 여러 기술을 적어 기술 1개가 된 묶음 기록("Lead Teep / Rear Teep") → 실제 기술들로 분리. 이미 있는 기술은 연결, 없는 기술만 새로 만듦. 묶음 기록 id는 지우지 않고 `splitInto`로 분리된 기술을 가리킴(목록·검색에는 안 나옴).
  - `ART_LINKS`: 그 무술에 기록이 아예 없는 표준 기술에 무술 관계 추가(예: Jab → MMA). 기록이 있는데 이름만 다르면 빌드 스크립트의 `EXTRA_GROUPS`/`EXTRA_MEMBERS`로 병합(예: 하다카지메 = RNC). 다른 기술이면 `EXCLUDE`, 확정 불가면 `REVIEW`.
  - lead/rear, 좌/우, 안/밖, 타깃, 시작 위치, 마무리가 다른 기술은 같은 계열이라도 별개 기술로 둔다.
  - 수정 후: `node scripts/build-technique-canonical.mjs` → `node scripts/report-technique-relations.mjs` (`docs/TECHNIQUE_RELATIONS_AUDIT.md`) → `qa-technique-relations`.
  - 커리큘럼의 묶음 id는 읽을 때 `expandSplitTechniqueIds()`로 펼친다.
  - `ART_LINKS`의 각 관계에는 근거 등급(`grade` A/B)과 `evidence`(MARTIALDEX 데이터의 어느 기록이 근거인지)를 적는다. 근거 없는 관계는 추가하지 않는다(`ART_LINKS_REMOVED`·`REVIEW`). REVIEW 항목에는 `decision`(merge/separate/review)을 적는다.
  - **표시 이름:** 병합된 기술은 `namesByArt`(각 무술 원래 기록의 이름)를 가진다. 무술 화면에서는 `techniqueNameInArt(t, art)`로 그 무술의 이름을 먼저 보여 준다 (가라테: Mae Geri · 앞차기 / 태권도: 앞차기 / 킥복싱: Front Kick). 이름을 새로 만들지 않는다. 다른 기술명을 직역한 한국어명은 대표 이름에 쓰지 않는다 (`NO_BORROWED_KOREAN_NAME`).
  - **전체 기술 × 무술 전수 감사:** `npm run audit:technique-relations`
    1. 자동 단계 `scripts/audit-technique-art-matrix.mjs` — 앱과 같은 기술 목록(Vite로 `loadData.ts` 로드) × 공식 무술 전부의 관계 행렬(`data/audit/technique-martial-art-matrix.json`)과, 무술 원문·기록·공유 라이브러리 스냅샷(`data/audit/add-teq-snapshot.json`)이 기술을 언급하는 위치(근거 후보 `technique-art-candidates.json`), identity 자동 검사(`technique-identity-checks.json`). 판단은 하지 않음.
    2. 판단 단계 — `data/audit/judgements/*.json`(서면 기준 `data/audit/judgement-criteria/`에 따른 AI 판단, 판단마다 근거·신뢰도) + 검수자 재정의 `data/audit/reviewer-overrides.json` → `scripts/consolidate-technique-art-decisions.mjs` → `technique-art-decisions.json`. "add"만 빌드에서 무술 관계가 된다.
    3. 보고서 `docs/TECHNIQUE_MARTIAL_ART_MATRIX_AUDIT.md` (`scripts/report-technique-art-matrix.mjs`, 감사 전 상태 `data/audit/matrix-before.json`과 비교).
    - MMA 기준: MMA 기록이 그 종류의 기술을 다룸(S1) + 통합 규정상 반칙 아님·도복 불필요(S2, `data/audit/external-sources.json`) + 실제 MMA에서 쓰임 → 추가. 다른 무술 고유 표현(가라테·태권도 콤비네이션·지르기 등)은 MMA 데이터 근거가 없으면 REVIEW.
    - 대상 무술에 같은 기술 기록이 이미 있으면 연결하지 않는다 → 병합 판단(REVIEW).
  - **묶음 기록 위 사용자 기록:** 어느 기술 것인지 알 수 없으면 옮기거나 복사하지 않는다. `legacySplitSkillEntries()`로 "배운 기술"·"나의 기술"에만 "여러 기술을 묶은 기존 기록"으로 표시하고, 추천·약점·AI 코치(`computeAllSkillProgress`)에는 넣지 않는다.

## 5. `src/lib/` 도메인 지도

| 분류 | 폴더 | 내용 |
|---|---|---|
| 데이터 | `loadData.ts`, `search*.ts`, `userTechniques/`, `addTeq/`, `customMartialArt/`, `techniqueReports/` | 기술 로드·검색·사용자 기술 요청/검증·커스텀 무술 |
| 학습 | `curriculum/`, `aiCurriculum/`, `mmaCurriculum/`, `fighterStyle/`, `marketplace/` | 커리큘럼(공식/사용자/AI 생성/구매), Day 진행도 |
| AI 코치 Day (AI 튜터 수업) | `aiCoachDay/` | 커리큘럼 Day를 AI 튜터와 진행. 단계(`CoachStep`): 설명(+자세 안내) → 영상(검색·검증) → 이해 확인 질문(답할 때까지 대기, 정답/부분 정답/오답 의미 채점) → 준비 → 타이머 실습 → 피드백 → (`mitt`: 수업 중 Visualizing Mitt, `LessonMittPlan.resume`로 원래 단계 복귀) → 요약. 말투는 `politeSpeech.ts`(`TUTOR_SPEECH_RULE`, `politeFix`, `politeData`, `withObject`) — 모든 튜터 문장은 합쇼체 |
| AI 코치 수업 | `aiCoachCurriculum/` | 집/체육관/기타 장소(`limited`) + 배운 기술·숙련도 기반 AI 코치 전용 커리큘럼 (일반 Curriculum + `aiCoachMeta`, Day별 `coachPlan`) |
| AI Visualizing Mitt | `visualMitt/` | 기술 → 동작 모형(archetypes.ts, 검토된 이름 규칙), DB 수록 조합 → 추천 콤보, 콤보 북 저장, 학습 기록(source `visual_mitt`, 사용자 표시). `aiPlan.ts`: 목적(자연어) → 실제 DB 기술 id만으로 콤보/셋업(상대 반응 포함) 생성(`generateMittPlan`), 반복 횟수·속도 결정(`decideDrill`), 수업 중 요청 감지(`isMittRequest`). 연속 실행 엔진은 `components/visualMitt/MittRunner.tsx`(콤보 속도 `RUN_SPEED`는 TTS 속도와 별개, 기술마다 음성 안내 없음) |
| 배운 기술 | `learnedTechniques/` | 한 번이라도 학습한 기술 판정 (훈련 기록·자세 분석·사용자 지정 숙련도) |
| AI 공통 | `ai/`(provider, context, systemInstruction), `aiCoach/`, `personalCoach/`, `aiCombo/`, `aiHistory/`, `webSearch/` | Gemini 호출 경로와 각 AI 기능 |
| 훈련 | `todayTraining/`, `freeTraining/`, `sparringSession/`, `combo/`, `tactic/`, `homeTraining/`, `gymRoutine/`, `gymTraining/`, `gymClass/`, `gymLive/` | 각종 훈련 모드와 세션 스토어 |
| 기록·분석 | `trainingHistory/`, `trainingAnalytics/`, `statsHub/`, `skillProgress/`, `streak/`, `achievements/`, `level/`, `rank/`, `reviewSystem/`, `myStyle/`, `profileStats/` | 훈련 기록(공통 허브), 숙련도, 통계, 복습 |
| 영상·자세 | `techniqueVideo/`(`tutorVideoFinder.ts`: 저장 영상 → 캐시 → 여러 검색어로 검색 → 내용 검증 통과 영상만 사용),  `videoSearch/`, `youtube.ts`, `poseAnalysis/`, `posture/`, `sparringAnalysis/`, `sparringVideo/` | 관련 영상(최대 5개, URL AI 검증), 카메라 자세 분석, 스파링 영상 |
| 영양 | `nutrition/` | 식단, 훈련 칼로리 추정(training_history 자동 반영) |
| 커뮤니티 | `communityPost/` | 게시글/댓글/답글 |
| 인증·동기화 | `auth/`, `supabase/client.ts`, `cloudSync/*Sync.ts` | 로그인, 로컬↔클라우드 동기화 |
| 플랫폼 | `browser/`, `externalLink.ts`, `clipboard.ts`, `voice/`(tts, stt — stt는 단계 `SttPhase`와 오류 코드 `MIC_SILENT/NO_SPEECH/NOT_UNDERSTOOD/PERMISSION_DENIED/…`를 구분, 입력 레벨 `recorder.level()`, macOS 마이크 권한은 IPC `media:mic-access`; 마이크 테스트 UI `components/MicTestPanel.tsx`는 수업과 같은 경로 사용), `theme.ts` | 인앱 브라우저, 음성 입출력, 테마 |

## 6. 반드시 따라야 하는 아키텍처 패턴

### 6.1 Local-first 저장소
모든 사용자 데이터는 먼저 localStorage에 저장 → 로그인 시 Supabase와 동기화.
```
lib/<도메인>/repository.ts   KEY='martialdex:<이름>', 쓰기 후 CustomEvent('martialdex:<이름>-updated') 발행
lib/<도메인>/use<이름>.ts    이벤트를 구독하는 React 훅
lib/cloudSync/<이름>Sync.ts  "최신 updated_at 승리" 양방향 병합 + syncGuard(계정 전환 경쟁 방지)
components/auth/LocalDataMigrationPrompt.tsx  로그인 시 각 sync 함수 호출 목록 (새 도메인은 여기에 한 줄 추가)
```
참고 구현: `combo/repository.ts` + `cloudSync/comboSync.ts`.

### 6.2 Supabase 테이블
- 형태: `id text, user_id uuid references auth.users on delete cascade, data jsonb, created_at, updated_at`, PK `(id, user_id)`
- RLS 4개 정책 모두 `auth.uid() = user_id` + grant. 참고: `0006_combos.sql`
- 배열·세부 필드는 별도 조인 테이블 대신 `data jsonb` 안에 넣는 것이 관례
- 기존 jsonb에 담을 수 있으면 **마이그레이션을 만들지 않음**

### 6.3 플랫폼별 전송 경로 (AI·외부 요청)
`lib/ai/provider.ts`, `lib/videoSearch/provider.ts` 패턴:
1. Electron(`window.martialdex` 존재) → IPC → `electron/*.cjs` (키는 메인 프로세스 `.env`)
2. Android/웹 → Supabase Edge Function (로그인 필요, 키는 `supabase secrets`)
3. YouTube 메타데이터처럼 서버 IP가 차단되는 경우 → Android는 `CapacitorHttp`로 기기에서 직접 요청

**API 키를 프론트엔드 번들(`VITE_*`)에 넣지 않습니다.** `VITE_`로 시작하는 값은 공개값(Supabase URL/publishable key, Toss client key)뿐입니다.

현재 Electron IPC: `ai:ask, youtube:search, youtube:video-info, websearch:search, video:save/delete/open, power-save-blocker:start/stop`
preload API: `openExternal, openInApp, askAi, searchYoutube, getYoutubeVideoInfo, webSearch, saveVideo, deleteVideo, revealVideo, openVideo, start/stopPowerSaveBlocker` (타입: `src/global.d.ts`)

### 6.4 AI 호출
- 자유 응답: `aiProvider.ask({ systemInstruction, contextText, history, question, imageParts? })`
- JSON 응답: `lib/userTechniques/geminiJson.ts`의 `askGeminiForJsonWithGrounding({ ..., useSearchGrounding, validate })`
- 기술 데이터 컨텍스트: `lib/ai/context.ts`의 `buildTechniqueContext(technique)`
- 원칙: **앱 데이터에 없는 기술 내용을 지어내지 않음**, AI 결과는 코드로 다시 검증(예: `techniqueVideo/urlVerification.ts`의 인용문 실존 확인), AI 실패 시 데이터 기반 대체 문구로 흐름이 막히지 않게 함

### 6.5 훈련 기록 허브
모든 훈련 모드는 종료 시 `lib/trainingHistory/service.ts`의 `recordTrainingSession({...source})`를 호출합니다.
- `TrainingSource`: `curriculum, coach_today, sparring(영상분석), review, combo, shadow(과거 기록 표시용), free_training, gym_class, sparring_session, ground_battle(과거 기록 표시용), visual_mitt` — 새 모드는 값을 추가하고 `TrainingHistoryDetail.tsx`의 `SOURCE_LABEL`, `TrainingEntryRow.tsx`의 `SOURCE_ICON`에 한 줄씩 추가
- 중복 기록 방지(idempotent) 필수 — 세션 id를 entry에 저장하고 존재 여부 확인
- 영양(`nutrition/trainingEnergy.ts`), 통계, 숙련도는 training_history를 자동으로 읽으므로 따로 연결하지 않아도 됨

### 6.6 타이머·세션 스토어
`sparringSession/sessionStore.ts`, `aiCoachDay/sessionStore.ts` 패턴: `Date.now()` 기준 절대 마감시각(`phaseEndTimestamp`), `pausedRemainingMs`, UI가 주기적으로 `tick*()` 호출, 이벤트(시간 안내)는 `firedCueIds`로 한 번만 발생, localStorage 저장으로 새로고침/재시작에도 복구.

### 6.7 UI 관례
- 화면 = `src/pages/*.tsx` 1개 + `App.tsx`에 lazy import와 `<Route>` 추가 + 필요하면 `components/Header.tsx`의 메뉴 그룹에 링크 추가
- 공용 컴포넌트 재사용: `RelatedVideos`, `VideoPickerModal`, `AiAskModal`, `BottomSheet`, `EmptyState/ErrorState/LoadingState`, `TechniqueRow`, `BackButton`
- 모바일·데스크톱 모두 지원 (모바일 메뉴 QA 있음), 한국어 UI
- 클래스 네이밍: 기능 접두어 BEM 형태 (`gb-figure--top`, `coach-timer`, `ai-msg__bubble`)
- QA용 `data-testid` 속성을 주요 요소에 부여
- 긴 텍스트 입력은 `components/AutoGrowTextarea.tsx` + `.field-block`(라벨 위, 입력 아래) 사용. `.select` 클래스는 한 줄 말줄임이므로 textarea에는 `textarea.select` 규칙이 줄바꿈으로 덮어씀 — 텍스트 잘림은 `qa-text-overflow`로 검사(1280px/375px)

## 7. 주요 기능과 진입 화면

| 기능 | 라우트 | 주요 파일 |
|---|---|---|
| 무술/기술 백과사전 | `/arts`, `/arts/:id/techniques/:techniqueId`, `/techniques` | `TechniqueDetail.tsx`, `loadData.ts` |
| 학습 커리큘럼 | `/learning/...` (`/train`, `/coach/:day?mode=voice\|text`, `/day/:day`) | `curriculum/`, `CurriculumTrainingStart.tsx` |
| AI 코치 Day | Day 시작 → "AI 코치와 하기" → 장소(집/체육관) → 말로/입력으로 | `aiCoachDay/`, `CurriculumCoachSession.tsx`, `CoachLocationPicker.tsx`, `voice/` |
| AI 코치 수업 | `/coach/class` (AI 코치 화면에서 진입) | `aiCoachCurriculum/`, `AiCoachClass.tsx` |
| AI Visualizing Mitt | `/coach/mitt?combo=db:…|single:…|<콤보id>&mode=text|voice` | `VisualMitt.tsx`, `components/visualMitt/MittStage.tsx`(SVG 도식) |
| 배운 기술 (검색·필터·다중 숙련도 변경) | `/learned-techniques` | `LearnedTechniques.tsx`, `skillProgress/overrideStore.ts`(`setOverrides`) |
| AI 맞춤 커리큘럼 | `/ai-curriculum` | `aiCurriculum/` |
| 자유훈련 / 스파링 기록 | `/free-training`, `/free-training/sparring` (기본: 이미 한 스파링 기록 — 날짜·실제 라운드·시간·사용 기술·잘된 점/보완할 점, 훈련 기록에 그 날짜로 저장 / `?mode=timer`: 실시간 라운드 타이머) | `freeTraining/`, `sparringSession/`(`recordPastSparringSession`, 저장 키 `martialdex:sparring-rule-sessions` — 영상 분석 `martialdex:sparring-sessions`와 분리) |
| 콤보·전술·기술 트리·그래프 | `/combos`, `/tactics`, `/skill-tree`, `/graph` | `combo/`, `tactic/`, `techniqueGraph/` |
| 훈련 분석/기록 | `/training-analytics...`, `/stats`, `/review` | `trainingHistory/`, `trainingAnalytics/` |
| AI 코치 / 개인 코치 | `/coach`, `/personal-coach`, `/today-training` | `aiCoach/`, `personalCoach/`, `todayTraining/` |
| 스파링 영상 분석 | `/sparring...` | `sparringAnalysis/`, `sparringVideo/` |
| 홈트 / 헬스 / 체육관 | `/home-training`, `/training/...`, `/gym...` | `homeTraining/`, `gymRoutine/`, `gymClass/` |
| 체육관 실시간 훈련/스파링 (관장 → 학생 기기 동기화) | `/gym/admin/live/:id`(관장), `/gym/live/:id`(학생, 자동으로 열림) | `gymLive/` — 세션 상태는 서버(0035 RPC)가 유일한 진실, 타이머는 각 기기가 서버 기준 anchor로 계산, 학생 기록은 학생 기기가 `gymlive__<id>`로 1회만 저장 |
| 영양 | `/nutrition`, `/nutrition/goals` | `nutrition/` |
| 커뮤니티 / 마켓 | `/community`, `/marketplace` | `communityPost/`, `marketplace/`, `payments/` |
| 계정 · 백업 | `/login`, `/signup`, `/profile`(백업/복원, 마지막 백업 기기·날짜·시간), `/dashboard` | `auth/`, `cloudSync/dataBackup.ts`, `device/deviceInfo.ts` |

**삭제된 기능:** AI 쉐도우 복싱 (`/shadow-boxing`), Ground Battle / 그라운드 배틀 (`/free-training/ground-battle`, 2026-10-05 삭제 — `ground_battle_matches` 테이블은 0036 마이그레이션으로 drop) — 다시 참조하지 말 것. 음성 출력은 `lib/voice/tts.ts`로 이전됨.

## 8. 실행·빌드·검증 명령

```bash
npm run dev            # Vite(:5173) + Electron 개발 실행
npm run dev:vite       # 브라우저만 (AI/IPC 기능 제한)
npx tsc --noEmit       # 타입 체크 (필수)
npm run build          # 프로덕션 빌드 (필수)
npm run dist:mac       # release/MARTIALDEX-x.y.z.dmg / -mac.zip (x64, 서명 없음)
npm run dist:android   # android/app/build/outputs/apk/debug/app-debug.apk (결제 키 유출 검사 포함)
npm run parse          # data/raw → data/processed 재생성
npx supabase functions deploy <이름>   # Edge Function 배포
```

**QA:** `.devtools/qa-<기능>.mjs` — 실제 Electron 앱을 띄워 클릭/검증, `PASS/FAIL` 출력 후 `=== SUMMARY: n/m PASSED ===`.
- 실행 조건: Vite dev server가 :5173에서 실행 중, `env -u ELECTRON_RUN_AS_NODE node .devtools/qa-xxx.mjs`
- 격리된 `--user-data-dir` 사용, mock 금지(실제 데이터·실제 AI 호출)
- 주요 스크립트: `qa-technique-relations`(기술 DB 전수 검증: 분리·연결·중복·참조·영상 손실·검색·무술별 목록·AI 코치·Mitt·콤보), `qa-ai-tutor-lesson`(AI 튜터 수업 전 과정: 자세·영상 검증·질문 대기·음성 답변·채점·수업 중 Mitt·존댓말·TTS 속도·STT 오류 구분, 오디오 장치가 멈춘 환경이면 음성 부분은 SKIP으로 표시), `qa-text-overflow`(전 화면 텍스트 잘림), `qa-visual-mitt, qa-tutor-voice, qa-technique-normalization, qa-ai-coach-class, qa-full, qa-curriculum, qa-unified-training, qa-ai-coach-day, qa-related-videos, qa-sparring-session, qa-gym-live-supabase-live(다기기 실시간 훈련), test-gym-live-logic(tsx, 매칭/타임라인), qa-integration-features, qa-mobile-menu, qa-posture, qa-training-analytics, qa-free-training, qa-ai-goal-curriculum, qa-request-technique`
- 여러 개를 연속 실행하면 타이밍 실패가 생길 수 있음 → 실패한 것은 단독 재실행으로 확인
- 알려진 기존 실패: `qa-full`의 "YouTube fallback button text" (오래된 문구 검사)

### 6.8 숙련도
- 타입은 기존 5단계 `MasteryStatus`(`not_started/learning/average/proficient/needs_improvement`, 라벨 미학습/학습 중/보통/숙련/개선 필요)만 사용 — 새 단계를 만들지 않음
- 사용자가 지정한 값은 `skillProgress/overrideStore.ts`(localStorage `martialdex:skill-status-overrides`, 클라우드는 `user_backups` 백업 경유)에만 저장, 나머지는 기록에서 계산
- 공용 AI 응답은 최대 2048토큰 — 긴 JSON은 나눠서 요청 (예: `aiCoachCurriculum/service.ts`의 `DAYS_PER_AI_CALL`)

## 9. 절대 규칙 (프롬프트에 항상 포함 권장)

1. 기존 기능을 깨지 않는다 — 수정은 가능한 한 추가(additive) 방식, 회귀 QA 실행
2. 기존 코드·패턴·컴포넌트를 먼저 찾아 재사용한다 (새 시스템을 만들지 않는다)
3. 기술은 **실제 DB(`Technique` id)에 있는 것만** 사용한다. 데이터·테스트 결과를 지어내지 않는다
4. `.env`/API 키 값을 출력·커밋·번들에 넣지 않는다. RLS를 우회하지 않는다
5. 마이그레이션은 꼭 필요할 때만, 번호는 `0035`부터, RLS 4개 정책 포함
6. 완료 보고에는 typecheck·build·관련 QA 결과를 실제 출력대로 적고, 미완료/미검증은 그대로 밝힌다
7. git config를 수정하지 않는다

## 10. AI가 개발 프롬프트를 쓸 때 권장 형식

```
[목표] 무엇을, 왜 (사용자 관점 1~3문장)
[범위] 수정/추가할 화면·라우트·lib 도메인 (이 문서 5·7절의 이름으로)
[재사용] 따라야 할 기존 패턴 (6절의 어느 항목인지) / 참고할 기존 파일
[데이터] 저장 위치(localStorage 키, Supabase 테이블/jsonb), 마이그레이션 필요 여부
[플랫폼] Electron / Android / 웹 각각 동작 방식, AI·외부 요청 경로
[제약] 9절 규칙 + 이 작업만의 금지 사항
[완료 조건] 구체적인 동작 체크리스트 (예외·에러·빈 데이터 상태 포함)
[검증] tsc, build, 새 QA 스크립트(qa-<기능>.mjs) + 영향받는 기존 QA 목록
[보고] 변경 파일 / 주요 변경 / 새 데이터 구조 / 마이그레이션 여부 / 테스트 결과 / 알려진 이슈
```
