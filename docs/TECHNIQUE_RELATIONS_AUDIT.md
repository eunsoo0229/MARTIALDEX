# MARTIALDEX 기술 관계 전수 감사 (공통 기술 누락 + 잘못된 병합)

생성: `node scripts/report-technique-relations.mjs` — 근거 데이터 `scripts/technique-relations.mjs`, `scripts/build-technique-canonical.mjs`, 결과 `data/curated/technique-canonical.json` (v2).
원본 데이터(`data/raw`, `data/processed`)는 수정하지 않는다. 앱은 불러올 때(`src/lib/loadData.ts`) 이 결과를 적용한다.

## A. 전체 결과

| 항목 | 수 |
|---|---|
| 감사 대상 공식 기술 기록 | 1284 |
| 감사 대상 공유 라이브러리(Supabase add_teq) 기록 | 97 (새 문제 없음 — 기존 중복 7건 처리 유지) |
| 수정 후 기술 수 (canonical, 목록에 표시) | 1138 |
| A. 같은 기술 + 여러 무술 (canonical 1개에 무술 관계 여러 개) | 556 |
| B. 무술 관계 누락 → 관계 추가 | 648건 (530개 기술) |
| C. 서로 다른 기술이 하나로 묶여 있음 → 분리 | 102개 기록 (+ 기존 병합 해제 2건) → 새 기술 131개 |
| D. 이름은 비슷하지만 다른 기술 → 분리 유지 | 16건 |
| 다른 이름·같은 무술 중복 → 병합 (그룹) | 134개 그룹 (무술 간 120, 같은 무술 안 14) |
| 기술이 아닌 제목 항목 (목록에서 제외, id 유지) | 3 |
| REVIEW (자동·추정으로 확정하지 않음) | 16 |

## A-1. 최종 검수: 근거 등급이 필요한 관계 (MMA·BJJ 기본 기술)

A = 해당 무술의 기록이 이 기술을 직접 언급 / B = 여러 기록이 이름 없이 같은 것을 설명하거나 사용자가 공유 라이브러리에 그 무술로 등록 / C = 근거 없음 → 관계 제거, REVIEW / D = 잘못된 관계 → 제거

| 기술 | 무술 | 등급 | 결정 | 근거 |
|---|---|---|---|---|
| Jab | MMA | A | 유지 | MMA "MMA Boxing Combination" 설명 "잽-크로스-훅 등 복싱 콤비네이션" |
| Cross | MMA | A | 유지 | MMA "MMA Boxing Combination" 설명 "잽-크로스-훅 등 복싱 콤비네이션" |
| Lead Hook | MMA | B | 유지 | MMA "MMA Boxing Combination"("잽-크로스-훅")·"Dirty Boxing"("짧은 훅") — 훅(리드/리어 미구분) |
| Rear Hook | MMA | B | 유지 | MMA "MMA Boxing Combination"("잽-크로스-훅")·"Dirty Boxing"("짧은 훅") — 훅(리드/리어 미구분) |
| Lead Uppercut | MMA | B | 유지 | MMA "Dirty Boxing" 설명 "짧은 훅과 어퍼컷" — 어퍼컷(리드/리어 미구분) |
| Rear Uppercut | MMA | B | 유지 | MMA "Dirty Boxing" 설명 "짧은 훅과 어퍼컷" — 어퍼컷(리드/리어 미구분) |
| Low Kick | MMA | A | 유지 | MMA "Calf Kick" 설명 "…종아리 아래쪽을 노리는 로우킥", "Range Management" 원칙 "로우킥에 대비" |
| Collar Tie | MMA | B | 유지 | MMA "Dirty Boxing" 설명 "클린치 상태에서 상대의 팔/목을 컨트롤" — 목 컨트롤 그립 |
| Double Collar Tie | MMA | B | 유지 | MMA "Dirty Boxing" 설명 "무에타이 클린치 니와 함께" — 무에타이 클린치(Chap Kho, 목 감싸기) |
| Underhook | MMA | A | 유지 | MMA "Clinch Takedown Entry" 설명 "언더훅/오버훅 등 클린치 그립", "Takedown Defense (MMA)" 관련 기술 wrestling__underhook |
| Overhook | MMA | A | 유지 | MMA "Clinch Takedown Entry" 설명 "언더훅/오버훅 등 클린치 그립" |
| Body Lock | MMA | B | 유지 | 공유 라이브러리 MMA 기록 "Body Lock Inside Trip", "Body Lock to Arm Triangle Choke" |
| Basic Double Leg | MMA | A | 유지 | MMA "Level Change Double Leg" 관련 기술 wrestling__basic-double-leg, 공유 라이브러리 MMA "Double Leg Takedown" |
| Sprawl | MMA | A | 유지 | MMA "Sprawl to Strikes"·"Takedown Defense (MMA)" 관련 기술 wrestling__sprawl |
| Rear Naked Choke | MMA | A | 유지 | MMA "Back Mount Hooks Control"·"Scramble to Back Take" 관련 기술 bjj__rear-naked-choke, 공유 라이브러리 MMA "Double Leg to Rear Naked Choke" |
| Guillotine | MMA | A | 유지 | MMA "Submission Setup off Strikes" 설명 "암바나 길로틴"·관련 기술 bjj__guillotine, 공유 라이브러리 MMA "Guillotine Choke" |
| Arm Triangle | MMA | A | 유지 | 공유 라이브러리 MMA 기록 "Arm Triangle Choke", "Body Lock to Arm Triangle Choke" |
| Armbar | MMA | A | 유지 | MMA "Submission Setup off Strikes"·"Ground and Pound to Submission Transition" 관련 기술 bjj__armbar |
| Triangle Choke | MMA | A | 유지 | MMA "Ground and Pound to Submission Transition" 설명 "암바나 트라이앵글"·관련 기술 bjj__triangle |
| Kimura | MMA | A | 유지 | MMA "Submission Setup off Strikes" 관련 기술 bjj__kimura |
| Mount | MMA | A | 유지 | MMA "Posture Control in Mount" 관련 기술 bjj__mount, "Ground and Pound from Mount" |
| Side Control | MMA | B | 유지 | 공유 라이브러리 MMA 기록 "Arm Triangle Choke"·"Passing the Guard" 설명의 사이드 컨트롤 |
| Back Control | MMA | A | 유지 | MMA "Back Mount Hooks Control" 설명 "백을 잡은 상태에서 훅을 걸어 포지션을 유지" |
| Half Guard | MMA | A | 유지 | MMA "Short Elbows in Half Guard", "Guard Recovery Under Strikes" 설명 "가드(클로즈드/하프)" |
| Closed Guard | MMA | A | 유지 | MMA "Guard Recovery Under Strikes" 설명 "가드(클로즈드/하프)를 다시 잡아" |
| Basic Double Leg | BJJ | A | 유지 | BJJ 원문 3.2 테이크다운 "### 더블 레그 (Double Leg) — 두 다리를 잡아 상대의 균형을 무너뜨리는 테이크다운" (소제목이라 파서가 기술로 만들지 않음) |
| Hip Heist | BJJ | B | 유지 | library add_teq bjj__hip-heist-sweep: Hip Heist Sweep / 상대의 상체가 들려 자세(Posture)가 무너졌을 때, 몸을 일으켜 엉덩이를 강하게 밀어 넣으며 상대를 넘어뜨리는 스윕 기술입니다. 싯업 가드나 클로즈드 가드 상태에서 상대가 상체를 세우거나 방어 태세를 취할 때 유용하게 연계됩니다. 상체의 반동과 엉덩이의 |
| Head Position | BJJ | A | 유지 | doc data/raw bjj line 935: - Underhook - Head Position  |
| Low Kick | 가라테 | B | 유지 | doc data/raw karate line 630: #Kick #MaeGeri #MawashiGeri #YokoGeri #UshiroGeri #UraMawashiGeri #LowKick #BodyKick #KanshetsuGeri #Block #Uke #GedanBarai #AgeUke #SotoUke #ShutoUke #NagashiUke |
| Body Kick | 가라테 | B | 유지 | doc data/raw karate line 630: #Kick #MaeGeri #MawashiGeri #YokoGeri #UshiroGeri #UraMawashiGeri #LowKick #BodyKick #KanshetsuGeri #Block #Uke #GedanBarai #AgeUke #SotoUke #ShutoUke #NagashiUke |
| Clinch Knee | 킥복싱 | B | 유지 | doc data/raw kickboxing line 762: #Knee #ClinchKnee #JumpingKnee |
| Feint → Entry | 킥복싱 | A | 유지 | doc data/raw kickboxing line 465:  → Teep / Front Kick / Round Kick / Jab → Feint → Entry → Punch Entry / Kick Entry |
| Pivot | 무에타이 | A | 유지 | doc data/raw muay-thai line 47: - Teep Guard (앞다리를 살짝 띄워 티프로 바로 전환 가능한 준비 자세) - Basic Footwork: Step Forward, Step Back, Lateral Step, Pivot, Switch Step, Skip Step |
| Step Forward | 무에타이 | A | 유지 | doc data/raw muay-thai line 47: - Teep Guard (앞다리를 살짝 띄워 티프로 바로 전환 가능한 준비 자세) - Basic Footwork: Step Forward, Step Back, Lateral Step, Pivot, Switch Step, Skip Step |
| Lateral Step | 무에타이 | A | 유지 | doc data/raw muay-thai line 47: - Teep Guard (앞다리를 살짝 띄워 티프로 바로 전환 가능한 준비 자세) - Basic Footwork: Step Forward, Step Back, Lateral Step, Pivot, Switch Step, Skip Step |
| Switch Step | 무에타이 | A | 유지 | doc data/raw muay-thai line 48: - Basic Footwork: Step Forward, Step Back, Lateral Step, Pivot, Switch Step, Skip Step  |
| Back Control | 삼보 | B | 유지 | doc data/raw sambo line 559: #Uzel #Ushchemlenie #Achilles #Kneebar #StraightAnkleLock #LegLock #Wrestling #Guard #SideControl #Mount #BackControl #Armbar #Kimura #Sweep #Escape #Choke #CombatSamboStr |
| Armbar | 삼보 | A | 유지 | doc data/raw sambo line 560: #LegLock #Wrestling #Guard #SideControl #Mount #BackControl #Armbar #Kimura #Sweep #Escape #Choke #CombatSamboStriking  |
| Kimura | 삼보 | A | 유지 | doc data/raw sambo line 386:  **노트형(узел) --- 회전으로 조이는 락(Kimura·Americana 계열)**  |
| Americana | 삼보 | A | 유지 | doc data/raw sambo line 386:  **노트형(узел) --- 회전으로 조이는 락(Kimura·Americana 계열)**  |
| Knee on Belly | 삼보 | A | 유지 | doc data/raw sambo line 331:  - 추가 탑 컨트롤: Knee on Belly, North-South, Turtle Top, Back Control, Ride, Wrist Control, Leg Control, Belt Control(벨트를 |
| Turn-In | 레슬링 | A | 유지 | doc data/raw wrestling line 412: - Base Recovery - Turn-In - Granby |
| Breakdown | 레슬링 | A | 유지 | doc data/raw wrestling line 538:  → Top Control → Breakdown → Tilt / Turn |
| Arm Drag | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Duck Under | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| High Crotch | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Low Single | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Outside Single | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Inside Single | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Running the Pipe | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Knee Tap | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Turtle | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Technical Stand-Up | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Hip Escape | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Hip Bump Sweep | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Butterfly Sweep | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Sit-Up Sweep | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Wrestle-Up | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Kneebar | MMA | B | 유지 | S1 Leg Entanglement Scramble(레그락 진입); S2 small joint manipulation만 반칙 |
| Straight Ankle Lock | MMA | B | 유지 | S1 Leg Entanglement Scramble(레그락 진입); S2 small joint manipulation만 반칙 |
| 마운트 탈출 | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| 스크램블 시작 | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| 포지션 회복 | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| 사이드 컨트롤 탈출 | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| 하프 가드 회복 | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| 가드 회복 | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| 스탠딩 복귀 | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| 거리 확보 | MMA | B | 유지 | S1 Framing / Guard Recovery Under Strikes; S2 위반 없음 |
| MMA 상황에서의 일어나기 | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| 목 프레임 | MMA | B | 유지 | S1 Framing / Guard Recovery Under Strikes; S2 위반 없음 |
| 어깨 프레임 | MMA | B | 유지 | S1 Framing / Guard Recovery Under Strikes; S2 위반 없음 |
| 엉덩이 프레임 | MMA | B | 유지 | S1 Framing / Guard Recovery Under Strikes; S2 위반 없음 |
| 무릎 프레임 | MMA | B | 유지 | S1 Framing / Guard Recovery Under Strikes; S2 위반 없음 |
| 손목 그립 | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Russian Tie Takedown | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Wrist Control | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Head Control | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Posture Break | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Standing Guard Break | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Americana | MMA | B | 유지 | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Omoplata | MMA | B | 유지 | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Feet on Hips | MMA | B | 유지 | S1 Framing / Guard Recovery Under Strikes; S2 위반 없음 |
| Butterfly Guard | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Single Leg X | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Single Leg Entry | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Back Take | MMA | A | 유지 | S1 mmaDataMentions: Scramble to Back Take; S2 위반 없음 |
| Elevation | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Sit-Up Guard | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Arm Drag Sweep | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Underhook Sweep | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Hook Sweep | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Ashi Garami Transition | MMA | B | 유지 | S1 Leg Entanglement Scramble(레그락 진입); S2 small joint manipulation만 반칙 |
| Knee Shield Half Guard | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Z Guard | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Dogfight | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Underhook Half Guard | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Butterfly Half Guard | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Dogfight Sweep | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Single Leg Finish | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Knee Shield | MMA | B | 유지 | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Recover Full Guard | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Recover Butterfly Guard | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Knee Cut Pass | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Torreando Pass | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Leg Drag | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Over-Under Pass | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Double Under Pass | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Body Lock Pass | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Stack Pass | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Smash Pass | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Far-side Underhook | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Near-side Underhook | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Shoulder Pressure | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| North-South Choke | MMA | B | 유지 | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| D'Arce Choke | MMA | B | 유지 | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Anaconda Choke | MMA | B | 유지 | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Straight Armbar | MMA | B | 유지 | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Knee on Belly Control | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Technical Mount Transition | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Mount Transition | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Knee-on-Belly to Side Control | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| North-South Control | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Side Control Transition | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Low Mount | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| High Mount | MMA | A | 유지 | S1 mmaDataMentions: Posture Control in Mount; S2 위반 없음 |
| Technical Mount | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| S-Mount | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Knee Mount | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Bridge and Roll | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Elbow-Knee Escape | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Knee Elbow Escape | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Half Guard Recovery | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Gift Wrap | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| S-Mount Armbar | MMA | B | 유지 | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Mounted Triangle | MMA | B | 유지 | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Head-and-Arm Choke | MMA | B | 유지 | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Seatbelt | MMA | B | 유지 | S1 Back Mount Hooks Control, Scramble to Back Take; S2 위반 없음 |
| Body Triangle | MMA | B | 유지 | S1 Back Mount Hooks Control, Scramble to Back Take; S2 위반 없음 |
| Hooks | MMA | A | 유지 | S1 mmaDataMentions: Back Mount Hooks Control; S2 위반 없음 |
| Technical Mount → Back | MMA | B | 유지 | S1 Back Mount Hooks Control, Scramble to Back Take; S2 위반 없음 |
| Turtle → Back | MMA | B | 유지 | S1 Back Mount Hooks Control, Scramble to Back Take; S2 위반 없음 |
| Arm Drag → Back | MMA | B | 유지 | S1 Back Mount Hooks Control, Scramble to Back Take; S2 위반 없음 |
| Gift Wrap → Back | MMA | B | 유지 | S1 Back Mount Hooks Control, Scramble to Back Take; S2 위반 없음 |
| Crucifix Attacks | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Breakdown | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Crucifix | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Arm-In Guillotine | MMA | B | 유지 | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Turtle → Crucifix | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Standard Ashi | MMA | B | 유지 | S1 Leg Entanglement Scramble(레그락 진입); S2 small joint manipulation만 반칙 |
| Saddle | MMA | B | 유지 | S1 Leg Entanglement Scramble(레그락 진입); S2 small joint manipulation만 반칙 |
| Inside Sankaku | MMA | B | 유지 | S1 Leg Entanglement Scramble(레그락 진입); S2 small joint manipulation만 반칙 |
| Heel Hook | MMA | B | 유지 | S1 Leg Entanglement Scramble(레그락 진입); S2 small joint manipulation만 반칙 |
| Knee on Belly | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Triangle → Armbar | MMA | B | 유지 | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Mount → S-Mount → Armbar | MMA | B | 유지 | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Side Control → Armbar | MMA | B | 유지 | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| North-South | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Kimura Trap | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Kimura Sweep | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Kimura Control | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Arm Drag → Back Take | MMA | B | 유지 | S1 Back Mount Hooks Control, Scramble to Back Take; S2 위반 없음 |
| Arm Drag → Single Leg | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Turtle Back Take | MMA | B | 유지 | S1 Back Mount Hooks Control, Scramble to Back Take; S2 위반 없음 |
| Seatbelt Back Take | MMA | B | 유지 | S1 Back Mount Hooks Control, Scramble to Back Take; S2 위반 없음 |
| Underhook Escape | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Knee-Elbow Recovery | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Shoulder-to-Mat Escape | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Turn-In Escape | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Butterfly Recovery | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Full Guard Recovery | MMA | B | 유지 | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Outside Pass | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Inside Pass | MMA | B | 유지 | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Leg Entanglement | MMA | A | 유지 | S1 mmaDataMentions: Leg Entanglement Scramble; S2 위반 없음 |
| Leg Locks | MMA | B | 유지 | S1 Leg Entanglement Scramble(레그락 진입); S2 small joint manipulation만 반칙 |
| Step Out | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Side Step | MMA | B | 유지 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Backfist | MMA | B | 유지 | mmaDataMentions: mixed-martial-arts__spinning-backfist(스피닝 변형); S2 반칙 해당 없음 |
| Long Guard | MMA | B | 유지 | S1 Range Management·MMA Boxing Combination(MMA 스탠스/가드); S2 해당 없음 |
| Step Back | MMA | B | 유지 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Wrist Control | MMA | B | 유지 | S1 Dirty Boxing·Clinch Takedown Entry(목/팔 컨트롤 클린치); S2 도복 없이 가능, 반칙 해당 없음 |
| Catch | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Lateral Step | MMA | B | 유지 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| L-Step | MMA | B | 유지 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Drop Step | MMA | B | 유지 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Step Around | MMA | B | 유지 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| In-and-Out | MMA | B | 유지 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Feint | MMA | B | 유지 | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Hook | MMA | A | 유지 | mmaDataMentions: mixed-martial-arts__check-hook, mma-boxing-combination(잽-크로스-훅); S2 해당 없음 |
| Uppercut | MMA | B | 유지 | S1 MMA Boxing Combination·Dirty Boxing(어퍼컷); S2 해당 없음 |
| Combination | MMA | A | 유지 | mmaDataMentions: mixed-martial-arts__mma-boxing-combination; S2 해당 없음 |
| Short Hook | MMA | A | 유지 | S1 Dirty Boxing(짧은 훅과 어퍼컷); S2 해당 없음 |
| Short Uppercut | MMA | A | 유지 | S1 Dirty Boxing(짧은 훅과 어퍼컷); S2 해당 없음 |
| Body Hook | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Clinch | MMA | A | 유지 | mmaDataMentions: mixed-martial-arts__clinch-takedown-entry, clinch-to-cage-transition; S2 해당 없음 |
| Body Jab | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Body Cross | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Body Uppercut | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Shovel Hook | MMA | B | 유지 | S1 Dirty Boxing(짧은 훅/어퍼컷 계열); S2 해당 없음 |
| Rear Overhand | MMA | A | 유지 | S1 Overhand [MMA 복싱]; S2 해당 없음 |
| Pump Feint | MMA | B | 유지 | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Jab Feint | MMA | B | 유지 | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Feint → Double | MMA | B | 유지 | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Feint → Entry | MMA | B | 유지 | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| 1--2 | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| 1--1--2 | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| 1--1--1 | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| 1--2--3 | MMA | A | 유지 | S1 MMA Boxing Combination(잽-크로스-훅); S2 해당 없음 |
| 1--2--3--2 | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| 1--1--2--3 | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| 2--3--2 | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| 1--2--5 | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| 1--2--3--6 | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Body--Head Combination | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Head--Body Combination | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Double Jab Entry | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Jab Feint → Cross | MMA | B | 유지 | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Feint → Double Jab | MMA | B | 유지 | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Double Forearm Guard | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Elbow Block | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Body Cover | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Double Slip | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Duck | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Lead Hand Parry | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Rear Hand Parry | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Double Parry | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Downward Parry | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Slip Outside | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Slip Inside | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Block | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Step Away | MMA | B | 유지 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Elbow Guard | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Frame/Guard | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Slip → Cross | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Slip → Hook | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Parry → Jab | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Parry → Cross | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Pull → Cross | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Roll → Hook | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Roll → Uppercut | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Block → Counter | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Step Back → Cross | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Pivot → Hook | MMA | B | 유지 | S1 Check Hook(축 회전 훅 카운터); S2 해당 없음 |
| Frame | MMA | B | 유지 | S1 Framing·Dirty Boxing(프레임/컨트롤); S2 해당 없음 |
| Inside Position | MMA | B | 유지 | S1 Dirty Boxing·Clinch Takedown Entry(목/팔 컨트롤 클린치); S2 도복 없이 가능, 반칙 해당 없음 |
| Hand Fighting | MMA | B | 유지 | S1 Dirty Boxing·Clinch Takedown Entry(목/팔 컨트롤 클린치); S2 도복 없이 가능, 반칙 해당 없음 |
| Shoulder Control | MMA | B | 유지 | S1 Dirty Boxing·Clinch Takedown Entry(목/팔 컨트롤 클린치); S2 도복 없이 가능, 반칙 해당 없음 |
| Clinch Escape | MMA | B | 유지 | S1 Dirty Boxing·Clinch Takedown Entry(목/팔 컨트롤 클린치); S2 도복 없이 가능, 반칙 해당 없음 |
| Body Attack | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Jab to Body | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Hook to Body | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Straight Punches | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Combination Pressure | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| 리드 핸드 컨트롤 | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management; S2 장갑을 잡는 것은 반칙이므로 누르기/걷어내기만 해당 |
| 크로스 스텝 | MMA | B | 유지 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Osoto Gari | MMA | B | 유지 | S1 Clinch Takedown Entry / Cage Wrestling; S2 legal, no gi needed |
| De Ashi Barai | MMA | B | 유지 | S1 Reactive Takedown; S2 legal |
| Two-on-One | MMA | B | 유지 | S1 Clinch(arm control)/Cage Wrestling; no gi |
| Ura Nage | MMA | B | 유지 | S1 Clinch Takedown Entry; S2 legal if not spiking |
| Guard Recovery | MMA | A | 유지 | mmaDataMentions: Guard Recovery Under Strikes |
| Bridge | MMA | B | 유지 | S1 Defense/Framing·Guard Recovery; no gi |
| Ouchi Gari | MMA | B | 유지 | S1 Clinch Takedown Entry/Cage Wrestling; no gi |
| Kouchi Gari | MMA | B | 유지 | S1 Clinch Takedown Entry/Cage Wrestling; no gi |
| Kosoto Gake | MMA | B | 유지 | S1 Clinch Takedown Entry; no gi |
| Kibisu Gaeshi | MMA | B | 유지 | S1 takedowns (ankle pick); no gi |
| O Goshi | MMA | B | 유지 | S1 Clinch Takedown Entry (underhook/body); no gi |
| Koshi Guruma | MMA | B | 유지 | S1 Clinch Takedown Entry (neck control); no gi |
| Uchi Mata | MMA | A | 유지 | mmaDataMentions: Uchi Mata to Armbar |
| Kesa Gatame | MMA | B | 유지 | S1 Ground Control; no gi |
| Kuzure Kesa Gatame | MMA | B | 유지 | S1 Ground Control; no gi |
| Kata Gatame | MMA | B | 유지 | S1 Ground Control/Submission; no gi |
| Kami Shiho Gatame | MMA | B | 유지 | S1 Ground Control; no gi |
| Yoko Shiho Gatame | MMA | B | 유지 | S1 Ground Control; no gi |
| Tate Shiho Gatame | MMA | B | 유지 | S1 Posture Control in Mount; no gi |
| Frame | MMA | B | 유지 | S1 Framing (Defense); no gi |
| Yoko Shiho Escape | MMA | B | 유지 | S1 Defense/Guard Recovery; no gi |
| Tate Shiho Escape | MMA | B | 유지 | S1 Defense/Guard Recovery; no gi |
| Ude Garami | MMA | B | 유지 | S1 Submission (kimura); S2 legal |
| Tettsui-uchi | MMA | B | 유지 | S1 Ground and Pound from Mount; 뒤통수 금지 외 합법(S2) |
| Kansetsu Geri | MMA | B | 유지 | S1 Oblique Kick(무릎 찍어차기); S2 위반 없음 |
| Pivot | MMA | B | 유지 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Front Kick | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Side Kick | MMA | B | 유지 | S1 Oblique Kick(직선으로 찍어 차는 킥) 계열; S2 합법 |
| Round Kick | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Back Kick | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Angle Step | MMA | B | 유지 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Straight Knee | MMA | B | 유지 | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Orthodox | MMA | B | 유지 | S1 Range Management·MMA Boxing Combination(MMA 스탠스/가드); S2 해당 없음 |
| Southpaw | MMA | B | 유지 | S1 Range Management·MMA Boxing Combination(MMA 스탠스/가드); S2 해당 없음 |
| High Guard | MMA | B | 유지 | S1 Range Management·MMA Boxing Combination(MMA 스탠스/가드); S2 해당 없음 |
| Body Kick | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| High Kick | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Jab → Cross → Body Kick | MMA | B | 유지 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Horizontal Elbow | MMA | B | 유지 | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Upward Elbow | MMA | B | 유지 | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Diagonal Elbow | MMA | B | 유지 | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Flying Knee | MMA | B | 유지 | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Jumping Knee | MMA | B | 유지 | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Lead Knee | MMA | B | 유지 | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Rear Knee | MMA | B | 유지 | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Inside Control | MMA | B | 유지 | S1 Dirty Boxing·Clinch Takedown Entry(목/팔 컨트롤 클린치); S2 도복 없이 가능, 반칙 해당 없음 |
| Off-Balance | MMA | B | 유지 | S1 Clinch Takedown Entry; S2 해당 없음 |
| Catch | MMA | B | 유지 | S1 Reactive Takedown·Clinch Takedown Entry; S2 합법 |
| Check | MMA | B | 유지 | S1 MMA 킥복싱(로우킥/카프킥 존재 → 방어 필요); S2 해당 없음 |
| Shin Block | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Parry | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Slip | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Pull | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Roll | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Cover | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Angle Out | MMA | B | 유지 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Lean Back | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Jab Counter | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Cross Counter | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Hook Counter | MMA | B | 유지 | S1 Check Hook; S2 해당 없음 |
| Check and Return | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Step Forward | MMA | B | 유지 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Shuffle | MMA | B | 유지 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Switch Step | MMA | B | 유지 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Circle Out | MMA | B | 유지 | S1 Range Management·Cage Wrestling(케이지 회피); S2 해당 없음 |
| Cut-Off | MMA | B | 유지 | S1 Clinch to Cage Transition·Range Management; S2 해당 없음 |
| Shoulder Feint | MMA | B | 유지 | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Bladed Stance | MMA | B | 유지 | S1 Range Management·MMA Boxing Combination(MMA 스탠스/가드); S2 해당 없음 |
| Square Stance | MMA | B | 유지 | S1 Range Management·MMA Boxing Combination(MMA 스탠스/가드); S2 해당 없음 |
| Switch Stance | MMA | B | 유지 | S1 Range Management·MMA Boxing Combination(MMA 스탠스/가드); S2 해당 없음 |
| Step-and-Slide | MMA | B | 유지 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Teep | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Hand Feint | MMA | B | 유지 | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Foot Feint | MMA | B | 유지 | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Level Change Feint | MMA | B | 유지 | S1 Strike to Takedown Transition·Level Change Double Leg; S2 해당 없음 |
| Kick Feint | MMA | B | 유지 | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Feint Chain | MMA | B | 유지 | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Short Knee | MMA | B | 유지 | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Break and Strike | MMA | B | 유지 | S1 Dirty Boxing; S2 휴식/브레이크 중 공격만 반칙, 스스로 풀며 치는 것은 합법 |
| Slip Counter | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Parry Counter | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Kick After Punch | MMA | B | 유지 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Punch After Kick | MMA | B | 유지 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Angle Counter | MMA | B | 유지 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Jab → Cross → Low Kick | MMA | B | 유지 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Jab → Hook → Low Kick | MMA | B | 유지 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Cross → Hook → High Kick | MMA | B | 유지 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Jab → Body Kick | MMA | B | 유지 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Low Kick → Cross | MMA | B | 유지 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Teep → Jab | MMA | B | 유지 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Check → Return Kick | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Parry → Jab / Cross | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Hand Feint → Body Kick | MMA | B | 유지 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Level Change Feint → High Kick | MMA | B | 유지 | S1 Strike to Takedown Transition·MMA 킥복싱; S2 해당 없음 |
| Kick Feint → Low Kick | MMA | B | 유지 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Switch Kick → Cross | MMA | B | 유지 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Collar Tie → Short Knee | MMA | B | 유지 | S1 Dirty Boxing(목 컨트롤·클린치 니); S2 도복 불필요, 합법 |
| Shell | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Elbow Guard | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Basic Footwork | MMA | B | 유지 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Side Teep | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Push Teep | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Face-Level Teep | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Teep to Leg | MMA | B | 유지 | S1 Oblique Kick(무릎/대퇴 직선 킥); S2 합법 |
| Teep Counter | MMA | B | 유지 | S1 Oblique Kick(전진 억제 견제); S2 합법 |
| 잡힌 다리를 빠르게 접어 빼기 | MMA | B | 유지 | S1 Reactive Takedown·Takedown Defense(MMA); S2 해당 없음 |
| Switch Kick | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Step-Up Kick | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Spinning Back Kick | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Superman Punch | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Long Guard Punch | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Jab--Cross--Hook | MMA | A | 유지 | S1 MMA Boxing Combination(잽-크로스-훅); S2 해당 없음 |
| Hook--Low Kick | MMA | B | 유지 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Cross--Body Kick | MMA | B | 유지 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Spinning Elbow | MMA | B | 유지 | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Sok Phung | MMA | B | 유지 | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Elbow from Clinch | MMA | B | 유지 | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Step-Up Knee | MMA | B | 유지 | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Clinch Knee | MMA | A | 유지 | S1 Dirty Boxing(무에타이 클린치 니); S2 스탠딩 상대 니 합법 |
| Switch Low Kick | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Elbow Entry | MMA | B | 유지 | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Tud | MMA | B | 유지 | S1 Clinch Takedown Entry; S2 머리/목 스파이크만 반칙 |
| Sweep / Foot Sweep | MMA | B | 유지 | S1 Clinch Takedown Entry; S2 합법 |
| Catch and Return | MMA | B | 유지 | S1 Reactive Takedown·MMA Boxing Combination; S2 합법 |
| Catch and Sweep | MMA | B | 유지 | S1 Reactive Takedown; S2 합법 |
| Catch and Dump | MMA | B | 유지 | S1 Reactive Takedown; S2 합법 |
| Shoulder Block | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Tae Chiang | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Fireman's Carry | MMA | B | 유지 | S1 Takedown/Clinch Takedown; no gi |
| Wrist Grip / Кисть 제어 | MMA | B | 유지 | S1 Dirty Boxing/Clinch (arm control); no gi |
| боковая подсечка | MMA | B | 유지 | S1 Reactive Takedown; no gi |
| Зацеп | MMA | B | 유지 | S1 Clinch Takedown Entry/Cage Wrestling; no gi |
| Отхват | MMA | B | 유지 | S1 Clinch Takedown Entry; no gi |
| Бросок через бедро | MMA | B | 유지 | S1 Clinch Takedown Entry; no gi |
| с захватом шеи | MMA | B | 유지 | S1 Clinch (neck control) Takedown; no gi |
| Мельница | MMA | B | 유지 | S1 Takedown; no gi |
| Перевод в партер(파르테르로 전환시키기) | MMA | B | 유지 | S1 Takedown to Ground and Pound Transition |
| Throw → Side Control / Mount / Turtle Control | MMA | A | 유지 | mmaDataMentions: Posture Control in Mount, Back Mount Hooks Control, Mount Pass |
| Single Leg → Top Control, Body Lock → Throw → Control | MMA | B | 유지 | S1 Takedown / Strike-Takedown Transitions; no gi |
| Grip Fight → Takedown → Leg Lock Entry | MMA | A | 유지 | mmaDataMentions: Leg Entanglement Scramble |
| Забегание за спину | MMA | B | 유지 | S1 Scramble to Back Take; no gi |
| Удержание сбоку | MMA | B | 유지 | S1 Ground Control; no gi |
| Удержание верхом | MMA | B | 유지 | S1 Posture Control in Mount; no gi |
| Удержание поперек | MMA | B | 유지 | S1 Ground Control; no gi |
| Удержание со стороны головы | MMA | B | 유지 | S1 Ground Control; no gi |
| рычаг локтя | MMA | B | 유지 | S1 Submission (armbar); S2 legal |
| узел плеча | MMA | B | 유지 | S1 Submission (kimura); S2 legal |
| узел плеча поперек | MMA | B | 유지 | S1 Submission; S2 legal |
| рычаг бедра | MMA | B | 유지 | S1 leg entanglements/leg-lock entries; S2 legal |
| рычаг стопы | MMA | B | 유지 | S1 leg-lock entries (Single Leg to Ankle Lock); S2 legal |
| узел стопы | MMA | B | 유지 | S1 leg-lock entries; S2 legal (not small joint) |
| Ground Striking | MMA | B | 유지 | S1 Ground & Pound; S2 legal within fouls |
| 팔굽치기 | MMA | B | 유지 | S1 Elbow Strikes from Top Position; S2 Downward pointing elbow 주의 |
| 밀어차기 | MMA | B | 유지 | S1 MMA 킥복싱; S2 위반 없음 |
| 앞발 돌려차기 | MMA | B | 유지 | S1 MMA 킥복싱 |
| 뒷발 돌려차기 | MMA | B | 유지 | S1 MMA 킥복싱 |
| Wrestling Stance | MMA | B | 유지 | S1 Range Management(테이크다운 대비 낮은 자세), Level Change Double Leg; S2 반칙 아님 |
| Level Change | MMA | A | 유지 | mmaDataMentions: level-change-double-leg, overhand, check-hook, clinch-takedown-entry; S2 반칙 아님 |
| Penetration Step | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Back Step | MMA | A | 유지 | mmaDataMentions: lead-kick-back-step-double-leg; S2 반칙 아님 |
| Hip Heist | MMA | B | 유지 | S1 스크램블(Scramble to Back Take)·그라운드 컨트롤; S2 반칙 아님 |
| Stand-Up | MMA | B | 유지 | S1 Cage Wrestling, Scramble; S2 반칙 아님 |
| Sit-Out | MMA | B | 유지 | S1 스크램블(Scramble to Back Take)·그라운드 컨트롤; S2 반칙 아님 |
| Granby Roll | MMA | A | 유지 | mmaDataMentions: link__mixed-martial-arts__wrestling__granby-roll; S1 Scramble |
| Base Building | MMA | B | 유지 | S1 스크램블(Scramble to Back Take)·그라운드 컨트롤; S2 반칙 아님 |
| Hand Fighting | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Inside Tie | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Wrist Control | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Russian Tie | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Biceps Control | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Head-and-Arm Control | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Inside Control | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Snap Control | MMA | B | 유지 | S1 Sprawl to Strikes / Takedown Defense (MMA) / Submission Setup(길로틴) — 프론트 헤드락 컨트롤; S2 반칙 아님 |
| Front Headlock | MMA | B | 유지 | S1 Sprawl to Strikes / Takedown Defense (MMA) / Submission Setup(길로틴) — 프론트 헤드락 컨트롤; S2 반칙 아님 |
| Single-Leg Position | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Double-Leg Position | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Drop Step | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Snap Down | MMA | B | 유지 | S1 Sprawl to Strikes / Takedown Defense (MMA) / Submission Setup(길로틴) — 프론트 헤드락 컨트롤; S2 반칙 아님 |
| Slide By | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Go-Behind | MMA | B | 유지 | S1 스크램블(Scramble to Back Take)·그라운드 컨트롤; S2 반칙 아님 |
| Russian Tie Entry | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Underhook Entry | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Body Lock Entry | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Feint | MMA | B | 유지 | S1 Strike to Takedown Transition; S2 반칙 아님 |
| Fake Shot | MMA | B | 유지 | S1 Strike to Takedown Transition, Overhand(레벨체인지); S2 반칙 아님 |
| Shot Feint to Set-Up | MMA | B | 유지 | S1 Strike to Takedown Transition; S2 반칙 아님 |
| High Single | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Sweep Single | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Snatch Single | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Knee Tap from Single | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Back Trip | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Lift and Return | MMA | B | 유지 | S1 Cage Wrestling; S2 머리 스파이킹만 아니면 합법 |
| Single to Double | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Single to Back Take | MMA | B | 유지 | S1 스크램블(Scramble to Back Take)·그라운드 컨트롤; S2 반칙 아님 |
| Blast Double | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| High Double | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Double Leg from Tie | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Double Leg from Underhook | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Double Leg Finish | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Corner Finish | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Lift Finish | MMA | B | 유지 | S1 Level Change Double Leg; S2 스파이킹 금지 범위 외 |
| Rear Body Lock | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Front Body Lock | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Double Underhooks | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Over-Under | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Body Lock Takedown | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Outside Trip | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Inside Trip | MMA | A | 유지 | mmaDataMentions: mixed-martial-arts__body-lock-inside-trip; S2 반칙 아님 |
| Mat Return | MMA | B | 유지 | S1 Cage Wrestling; S2 스파이킹 범위 외 |
| Rear Lift / Return | MMA | B | 유지 | S1 Cage Wrestling, Scramble to Back Take |
| Ankle Pick | MMA | A | 유지 | mmaDataMentions: mixed-martial-arts__reactive-takedown; S1 테이크다운(ankle pick) |
| Single Ankle Pick | MMA | B | 유지 | S1 테이크다운(ankle pick) |
| High-Crotch Lift | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| High-Crotch Dump | MMA | B | 유지 | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Bear Hug | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Body Lock Lift | MMA | B | 유지 | S1 Cage Wrestling; S2 스파이킹만 금지 |
| Sprawl to Front Headlock | MMA | B | 유지 | S1 Sprawl to Strikes / Takedown Defense (MMA) / Submission Setup(길로틴) — 프론트 헤드락 컨트롤; S2 반칙 아님 |
| Spin Behind | MMA | B | 유지 | S1 스크램블(Scramble to Back Take)·그라운드 컨트롤; S2 반칙 아님 |
| Front Headlock to Single | MMA | B | 유지 | S1 Sprawl to Strikes / Takedown Defense (MMA) / Submission Setup(길로틴) — 프론트 헤드락 컨트롤; S2 반칙 아님 |
| Front Headlock to Back | MMA | B | 유지 | S1 스크램블(Scramble to Back Take)·그라운드 컨트롤; S2 반칙 아님 |
| Stand-Up to Escape | MMA | B | 유지 | S1 Cage Wrestling, Scramble; S2 반칙 아님 |
| Hand Control | MMA | B | 유지 | S1 스크램블(Scramble to Back Take)·그라운드 컨트롤; S2 반칙 아님 |
| Wrist Peel | MMA | B | 유지 | S1 스크램블(Scramble to Back Take)·그라운드 컨트롤; S2 반칙 아님 |
| Down Block | MMA | B | 유지 | S1 방어(Takedown Defense (MMA), Fence Takedown Defense, Sprawl to Strikes); S2 반칙 아님 |
| Crossface | MMA | B | 유지 | S1 방어(Takedown Defense (MMA), Fence Takedown Defense, Sprawl to Strikes); S2 반칙 아님 |
| Whizzer | MMA | A | 유지 | mmaDataMentions: mixed-martial-arts__takedown-defense-mma; S1 오버훅 |
| Head Position | MMA | B | 유지 | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Sprawl to Back | MMA | B | 유지 | S1 Sprawl to Strikes, Scramble to Back Take |
| Hip Pressure | MMA | B | 유지 | S1 방어(Takedown Defense (MMA), Fence Takedown Defense, Sprawl to Strikes); S2 반칙 아님 |
| Square Hips | MMA | B | 유지 | S1 방어(Takedown Defense (MMA), Fence Takedown Defense, Sprawl to Strikes); S2 반칙 아님 |
| Chest-to-Chest Defense | MMA | A | 유지 | mmaDataMentions: mixed-martial-arts__fence-takedown-defense |
| Single-Leg Down Defense | MMA | B | 유지 | S1 방어(Takedown Defense (MMA), Fence Takedown Defense, Sprawl to Strikes); S2 반칙 아님 |
| Double-Leg Down Defense | MMA | B | 유지 | S1 방어(Takedown Defense (MMA), Fence Takedown Defense, Sprawl to Strikes); S2 반칙 아님 |
| Front Headlock Defense | MMA | B | 유지 | S1 방어(Takedown Defense (MMA), Fence Takedown Defense, Sprawl to Strikes); S2 반칙 아님 |
| Single Leg | BJJ | A | 유지 | doc data/raw bjj line 104:  ### 싱글 레그 (Single Leg)  |
| Jab → Cross | 킥복싱 | A | 유지 | doc data/raw kickboxing line 506:  - Jab → Cross → Low Kick - Jab → Hook → Low Kick |
| Jab → Hook | 킥복싱 | B | 유지 | doc data/raw kickboxing line 507: - Jab → Cross → Low Kick - Jab → Hook → Low Kick - Cross → Hook → High Kick |
| Cross → Hook | 킥복싱 | B | 유지 | doc data/raw kickboxing line 508: - Jab → Hook → Low Kick - Cross → Hook → High Kick - Jab → Body Kick |
| Cross → Low Kick | 킥복싱 | B | 유지 | doc data/raw kickboxing line 506:  - Jab → Cross → Low Kick - Jab → Hook → Low Kick |
| Short Punch | 무에타이 | A | 유지 | doc data/raw muay-thai line 591: Close Range → Elbow / Knee / Short Punch ↓ (붙잡히면) |
| Single Leg | 레슬링 | A | 유지 | doc data/raw wrestling line 83: - Front Headlock - Single-Leg Position - Double-Leg Position |
| Mawashi Empi | MMA | B | 유지 | S1 Elbow Strikes from Top Position / 클린치; S2 위반 없음 |
| Feint | MMA | B | 유지 | mmaDataMentions: mixed-martial-arts__takedown-setup(타격 페인트) |
| Clinch (근접 컨트롤) | MMA | B | 유지 | mmaDataMentions: clinch-takedown-entry, clinch-to-cage-transition |
| Guard | MMA | B | 유지 | S1 Range Management·MMA Boxing Combination(MMA 스탠스/가드); S2 해당 없음 |
| Lead Teep | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Rear Teep | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Body Teep | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Lead Round Kick | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Rear Round Kick | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Jab → Cross | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Jab → Hook | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Cross → Hook | MMA | B | 유지 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Jab → Low Kick | MMA | B | 유지 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Cross → Low Kick | MMA | B | 유지 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Long Elbow | MMA | B | 유지 | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Short Elbow | MMA | B | 유지 | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Side Knee | MMA | B | 유지 | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Inside Low Kick | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Outside Low Kick | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Thigh Kick | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Lead Low Kick | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Rear Low Kick | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Low Kick after Punch | MMA | B | 유지 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Low Kick after Teep | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Outside Control | MMA | B | 유지 | S1 Dirty Boxing·Clinch Takedown Entry(목/팔 컨트롤 클린치); S2 도복 없이 가능, 반칙 해당 없음 |
| Diagonal Knee | MMA | B | 유지 | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Turn | MMA | B | 유지 | S1 Dirty Boxing·Clinch Takedown Entry(목/팔 컨트롤 클린치); S2 도복 없이 가능, 반칙 해당 없음 |
| Teep Catch | MMA | B | 유지 | S1 Reactive Takedown; S2 합법 |
| Body Kick Check | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Kick Parry | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Elbow Shield | MMA | B | 유지 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Teep Stop | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Evade | MMA | B | 유지 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Low Kick Counter | MMA | B | 유지 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Kick Catch to Counter | MMA | B | 유지 | S1 Reactive Takedown; S2 합법 |
| Counter Elbow | MMA | B | 유지 | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Counter Knee | MMA | B | 유지 | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Single Leg | MMA | A | 유지 | mmaDataMentions: Single Leg to Ankle Lock |
| Guard (클로즈드/오픈) | MMA | A | 유지 | mmaDataMentions: Guard Recovery Under Strikes, Short Elbows in Half Guard |
| Frame Escape | MMA | B | 유지 | S1 Framing (Defense); no gi |
| Back Escape | MMA | B | 유지 | S1 Back Mount Hooks Control (opponent side); no gi |
| Guard Sweep | MMA | B | 유지 | S1 Ground Control (closed/half guard); no gi |
| Front Headlock Choke | MMA | B | 유지 | S1 Submission (guillotine); no gi |
| 앞발 밀어차기 | MMA | B | 유지 | S1 MMA 킥복싱 |
| 뒷발 밀어차기 | MMA | B | 유지 | S1 MMA 킥복싱 |
| Body Kick | MMA | C | 관계 제거 → REVIEW | MMA 기록·공유 라이브러리 어디에도 바디킥 언급 없음 — 관계를 확정하지 않음 |
| High Kick | MMA | C | 관계 제거 → REVIEW | MMA 기록·공유 라이브러리 어디에도 하이킥/헤드킥 언급 없음 |
| Round Kick | MMA | C | 관계 제거 → REVIEW | MMA 기록·공유 라이브러리 어디에도 라운드킥 언급 없음 (로우킥·카프킥·오블리크 킥만 있음) |
| Teep | MMA | C | 관계 제거 → REVIEW | MMA 기록·공유 라이브러리 어디에도 티프/푸시킥 언급 없음 (오블리크 킥은 다른 기술) |

## B. 공통 기술 관계 수정 (무술 관계 추가)

| 기술 | 추가된 무술 (카테고리) | 근거 |
|---|---|---|
| 1--1--1 (`boxing__1-1-1`) | MMA (MMA 복싱) | 전수 감사 B: 트리플 잽은 MMA에서도 쓰이는 잽 연타다. |
| 1--1--2 (`boxing__1-1-2`) | MMA (MMA 복싱) | 전수 감사 B: 더블잽-크로스는 MMA 복싱 콤비네이션으로 쓰인다. |
| 1--1--2--3 (`boxing__1-1-2-3`) | MMA (MMA 복싱) | 전수 감사 B: 더블잽-크로스-훅은 MMA 복싱 콤비네이션으로 쓰인다. |
| 1--2 (`boxing__1-2`) | MMA (MMA 복싱) | 전수 감사 B: 원투(잽-크로스)는 MMA 복싱의 기본 콤비네이션이다. |
| 1--2--3 (`boxing__1-2-3`) | MMA (MMA 복싱) | 전수 감사 A: 잽-크로스-훅은 MMA Boxing Combination 기록이 직접 명시한다. |
| 1--2--3--2 (`boxing__1-2-3-2`) | MMA (MMA 복싱) | 전수 감사 B: 잽-크로스-훅-크로스는 MMA 복싱 콤비네이션으로 쓰인다. |
| 1--2--3--6 (`boxing__1-2-3-6`) | MMA (MMA 복싱) | 전수 감사 B: 잽-크로스-훅-어퍼컷 콤비네이션은 MMA에서 쓰인다. |
| 1--2--5 (`boxing__1-2-5`) | MMA (MMA 복싱) | 전수 감사 B: 잽-크로스-어퍼컷 계열 콤비네이션은 MMA에서 쓰인다. |
| 2--3--2 (`boxing__2-3-2`) | MMA (MMA 복싱) | 전수 감사 B: 크로스-훅-크로스는 MMA 복싱 콤비네이션으로 쓰인다. |
| Americana (`bjj__americana`) | 삼보 (클로즈드 가드 (Closed Guard)), MMA (서브미션 (Submission)) | 전수 감사 A: 삼보 노트형(узел) 락에 Americana 계열이 명시됨.; 전수 감사 B: MMA에서 실제 피니시로 자주 나오는 노기 서브미션이다. |
| Anaconda Choke (`bjj__anaconda-choke`) | MMA (서브미션 (Submission)) | 전수 감사 B: MMA에서 실제 피니시로 자주 나오는 노기 서브미션이다. |
| Angle Counter (`kickboxing__angle-counter`) | MMA (MMA 복싱) | 전수 감사 B: 각도 전환 카운터는 MMA에서 쓰인다. |
| Angle Out (`kickboxing__angle-out`) | 무에타이 (킥 방어), MMA (방어 (Defense)) | 묶음 기록 분리 (`muay-thai__step-back-angle-out`); 전수 감사 B: 각도를 틀어 빠지는 방어는 MMA에서 쓰인다. |
| Angle Step (`kickboxing__angle-step`) | 가라테 (장거리 (To-ma)), MMA (스트라이킹 (Striking)) | 묶음 기록 분리 (`karate__feint-페인트-angle-step`); 전수 감사 B: 앵글 스텝은 MMA 각도 만들기 풋워크다. |
| Ankle Pick (`wrestling__ankle-pick`) | 삼보 (테이크다운 진입 (레슬링 계열)), MMA (테이크다운 (Takedown)) | 묶음 기록 분리 (`sambo__high-crotch-ankle-pick`); 전수 감사 A: 앵클 픽은 MMA 리액티브 테이크다운 기록에서 언급된다. |
| Arm Drag (`bjj__arm-drag`) | 삼보 (테이크다운 진입 (레슬링 계열)), MMA (테이크다운 (Takedown)) | 묶음 기록 분리 (`sambo__knee-tap-body-lock-arm-drag-duck-under-snap-down`); 전수 감사 B: MMA에서 흔히 쓰이는 노기 레슬링 테이크다운 진입/마무리 기술이다. |
| Arm Drag → Back (`bjj__arm-drag-back`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: MMA에서 흔한 백 테이크/백 컨트롤 기술로 RNC·파운드로 이어진다. |
| Arm Drag → Back Take (`bjj__arm-drag-back-take`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: MMA에서 흔한 백 테이크/백 컨트롤 기술로 RNC·파운드로 이어진다. |
| Arm Drag → Single Leg (`bjj__arm-drag-single-leg`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: MMA에서 흔히 쓰이는 노기 레슬링 테이크다운 진입/마무리 기술이다. |
| Arm Drag Sweep (`bjj__arm-drag-sweep`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Arm Triangle (`bjj__arm-triangle`) | 삼보 (목/조르기 계열 --- 컴뱃 삼보 한정), MMA (서브미션 (Submission)) | 묶음 기록 분리 (`sambo__rear-naked-choke-guillotine-front-headlock-choke-arm-triangle-collar-choke-계열`); MMA A: 공유 라이브러리 MMA 기록 "Arm Triangle Choke", "Body Lock to Arm Triangle Choke" |
| Arm-In Guillotine (`bjj__arm-in-guillotine`) | MMA (서브미션 (Submission)) | 전수 감사 B: MMA에서 실제 피니시로 자주 나오는 노기 서브미션이다. |
| Armbar (`bjj__armbar`) | MMA (서브미션 (Submission)), 삼보 (클로즈드 가드 (Closed Guard)) | MMA A: MMA "Submission Setup off Strikes"·"Ground and Pound to Submission Transition" 관련 기술 bjj__armbar; 전수 감사 A: 삼보 рычаг локтя(암바 계열)와 #Armbar가 등장함. |
| Ashi Garami Transition (`bjj__ashi-garami-transition`) | MMA (서브미션 (Submission)) | 전수 감사 B: 통합룰상 합법(소관절 아님)이며 MMA 레그락 공방에서 실제로 쓰인다. |
| Axe Kick (`kickboxing__axe-kick`) | 무에타이 (장거리 킥 (Round Kick / Low Kick 계열)) | 묶음 기록 분리 (`muay-thai__axe-kick-side-kick`) |
| Back Control (`judo__back-control`) | MMA (그라운드 컨트롤 (Ground Control)), 삼보 (네와자 / 바닥 포지션) | MMA A: MMA "Back Mount Hooks Control" 설명 "백을 잡은 상태에서 훅을 걸어 포지션을 유지"; 전수 감사 B: 삼보 추가 탑 컨트롤 목록에 Back Control이 포함됨. |
| Back Escape (`sambo__back-escape`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 백 컨트롤 탈출은 MMA 하위 방어에 쓰인다. |
| Back Kick (`kickboxing__back-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: (스피닝) 백킥은 MMA에서 바디 공격으로 쓰인다. |
| Back Step (`wrestling__back-step`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 A: MMA 콤비네이션 기록(킥-백스텝-더블레그)이 직접 이름을 든다. |
| Back Take (`bjj__back-take`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 A: MARTIALDEX MMA 레코드가 직접 언급하는 포지션/기술로 MMA에서 핵심적으로 쓰인다. |
| Back Trip (`wrestling__back-trip`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 백 트립은 MMA 클린치·싱글 마무리로 흔하다. |
| Backfist (`boxing__backfist`) | MMA (MMA 복싱) | 전수 감사 B: 백피스트는 MMA에서 합법이며 스피닝 백피스트 기록이 있으나 기록은 스피닝 변형만 명시하므로 B로 둔다. |
| Base Building (`wrestling__base-building`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 하위에서 베이스를 세워 일어나는 동작으로 MMA 터틀/스탠드업에 쓰인다. |
| Basic Double Leg (`wrestling__basic-double-leg`) | 삼보 (테이크다운 진입 (레슬링 계열)), MMA (테이크다운 (Takedown)), BJJ (스탠딩 / 테이크다운) | 묶음 기록 분리 (`sambo__single-leg-double-leg`); MMA A: MMA "Level Change Double Leg" 관련 기술 wrestling__basic-double-leg, 공유 라이브러리 MMA "Double Leg Takedown"; BJJ A: 원문 3.2절 더블 레그 |
| Basic Footwork (`muay-thai__basic-footwork`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 기본 풋워크는 MMA 거리 관리에 쓰인다. |
| Bear Hug (`wrestling__bear-hug`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 베어허그(바디락) 테이크다운은 MMA 클린치에서 흔하다. |
| Biceps Control (`wrestling__biceps-control`) | 무에타이 (클린치 (Clinch)), MMA (클린치 (Clinch)) | 묶음 기록 분리 (`muay-thai__biceps-control-wrist-control`); 전수 감사 B: 이두 컨트롤은 MMA 클린치의 기본 그립으로 쓰인다. |
| Bladed Stance (`kickboxing__bladed-stance`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 블레이드 스탠스는 가라테 계열 MMA 파이터들이 실제로 쓴다. |
| Blast Double (`wrestling__blast-double`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 블래스트 더블은 MMA에서 대표적인 테이크다운이다. |
| Block (`boxing__block`) | MMA (방어 (Defense)) | 전수 감사 B: 블록은 MMA 기본 타격 방어다. |
| Block → Counter (`boxing__block-counter`) | MMA (방어 (Defense)) | 전수 감사 B: 블록 후 카운터는 MMA 기본 반격이다. |
| Body Attack (`boxing__body-attack`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 상대를 몰아 바디를 공격하는 것은 MMA(케이지 압박 포함)에서 쓰인다. |
| Body Cover (`boxing__body-cover`) | MMA (방어 (Defense)) | 전수 감사 B: 바디 커버는 MMA 스탠딩 방어로 쓰인다. |
| Body Cross (`boxing__body-cross`) | MMA (MMA 복싱) | 전수 감사 B: 바디 크로스는 MMA에서 쓰이는 펀치 변형이다. |
| Body Hook (`boxing__body-hook`) | MMA (MMA 복싱) | 전수 감사 B: 바디훅은 MMA에서 흔히 쓰이는 펀치다. |
| Body Jab (`boxing__body-jab`) | MMA (MMA 복싱) | 전수 감사 B: 바디 잽은 MMA에서 쓰이는 펀치 변형이다. |
| Body Kick (`kickboxing__body-kick`) | 무에타이 (장거리 킥 (Round Kick / Low Kick 계열)), 삼보 (컴뱃 삼보 타격 범주), 가라테 (킥), MMA (MMA 킥복싱) | 묶음 기록 분리 (`muay-thai__low-kick-body-kick-high-kick`); 묶음 기록 분리 (`sambo__low-kick-body-kick-헤드킥`); 전수 감사 B: 가라테 해시태그 기술 목록에 #BodyKick이 포함됨.; 전수 감사 B: 바디킥은 MMA에서 흔히 쓰이는 킥이다. |
| Body Kick Check (`muay-thai__body-kick-check`) | MMA (방어 (Defense)) | 전수 감사 B: 바디킥 체크는 MMA 킥 방어로 쓰인다. |
| Body Lock (`wrestling__body-lock`) | 삼보 (테이크다운 진입 (레슬링 계열)), MMA (클린치 (Clinch)) | 묶음 기록 분리 (`sambo__knee-tap-body-lock-arm-drag-duck-under-snap-down`); MMA B: 공유 라이브러리 MMA 기록 "Body Lock Inside Trip", "Body Lock to Arm Triangle Choke" |
| Body Lock Entry (`wrestling__body-lock-entry`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 바디락 진입은 MMA 클린치·케이지 테이크다운에 흔히 쓰인다. |
| Body Lock Lift (`wrestling__body-lock-lift`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 바디락 리프트는 MMA 케이지 레슬링에서 흔하다. |
| Body Lock Pass (`bjj__body-lock-pass`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Body Lock Takedown (`wrestling__body-lock-takedown`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 바디락 테이크다운은 MMA 클린치 테이크다운의 대표 기술이다. |
| Body Teep (`muay-thai__body-teep`) | MMA (MMA 킥복싱) | 전수 감사 B: 바디 티프는 MMA에서 쓰인다. |
| Body Triangle (`bjj__body-triangle`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA에서 흔한 백 테이크/백 컨트롤 기술로 RNC·파운드로 이어진다. |
| Body Uppercut (`boxing__body-uppercut`) | MMA (MMA 복싱) | 전수 감사 B: 바디 어퍼컷은 MMA 클린치·근거리에서 쓰인다. |
| Body--Head Combination (`boxing__body-head-combination`) | MMA (MMA 복싱) | 전수 감사 B: 바디-헤드 연결은 MMA 복싱에서 쓰이는 콤비네이션이다. |
| Break and Strike (`kickboxing__break-and-strike`) | MMA (클린치 (Clinch)) | 전수 감사 B: 클린치를 풀며 치는 타격(브레이크 엘보·훅)은 MMA에서 쓰인다. |
| Breakdown (`bjj__breakdown`) | 레슬링 (터틀 (Turtle)), MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 A: 레슬링 탑 흐름에 Breakdown이 핵심 단계로 명시됨.; 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Bridge (`judo__bridge`) | 삼보 (바텀 포지션과 탈출), MMA (그라운드 컨트롤 (Ground Control)) | 묶음 기록 분리 (`sambo__bridge-мост-hip-escape-sit-out-stand-up-granby-turn-in-frame-escape-back-escape`); 전수 감사 B: 브릿지(업아)는 MMA에서 마운트 탈출과 가드 회복에 쓰인다. |
| Bridge and Roll (`bjj__bridge-and-roll`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| Butterfly Guard (`bjj__butterfly-guard`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Butterfly Half Guard (`bjj__butterfly-half-guard`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Butterfly Recovery (`bjj__butterfly-recovery`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| Butterfly Sweep (`bjj__butterfly-sweep`) | 삼보 (스윕 / 전환), MMA (그라운드 컨트롤 (Ground Control)) | 묶음 기록 분리 (`sambo__hip-bump-sweep-butterfly-sweep-technical-stand-up-sweep`); 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Calf Kick (`mixed-martial-arts__calf-kick`) | 무에타이 (로우킥 (Low Kick)) | 묶음 기록 분리 (`muay-thai__calf-kick-thigh-kick`) |
| Catch (`kickboxing__catch`) | 무에타이 (킥 방어), MMA (방어 (Defense)) | 묶음 기록 분리 (`muay-thai__catch-teep-stop`); 전수 감사 B: 킥 캐치는 MMA에서 테이크다운 기회로 자주 쓰인다. |
| Catch (`boxing__catch`) | 무에타이 (펀치 방어), MMA (방어 (Defense)) | 묶음 기록 분리 (`muay-thai__parry-catch-slip-pull-back-step-back-roll-cover`); 전수 감사 B: 펀치를 글러브로 받아내는 캐치는 MMA 스탠딩 방어로 쓰인다. |
| Catch and Dump (`muay-thai__catch-and-dump`) | MMA (방어 (Defense)) | 전수 감사 B: 킥 캐치 후 덤프는 MMA 테이크다운으로 쓰인다. |
| Catch and Return (`muay-thai__catch-and-return`) | MMA (MMA 킥복싱) | 전수 감사 B: 킥을 잡고 반격하는 것은 MMA에서 쓰인다. |
| Catch and Sweep (`muay-thai__catch-and-sweep`) | MMA (방어 (Defense)) | 전수 감사 B: 킥 캐치 후 스윕은 MMA 테이크다운으로 쓰인다. |
| Check (`kickboxing__check`) | 무에타이 (킥 캐치 / 방어), MMA (방어 (Defense)) | 묶음 기록 분리 (`muay-thai__check-low-kick-check-body-kick-check`); 전수 감사 B: 레그 체크는 MMA 로우킥·카프킥 방어로 쓰인다(기록의 check hook과는 다른 기술). |
| Check → Return Kick (`kickboxing__check-return-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 체크 후 리턴킥은 MMA 킥 공방에서 쓰인다. |
| Check and Return (`kickboxing__check-and-return`) | 무에타이 (카운터 종합), MMA (방어 (Defense)) | 묶음 기록 분리 (`muay-thai__check-and-return-catch-and-return`); 전수 감사 B: 체크 후 반격은 MMA 킥 공방에서 쓰인다. |
| Chest-to-Chest Defense (`wrestling__chest-to-chest-defense`) | MMA (방어 (Defense)) | 전수 감사 A: 케이지 테이크다운 방어 기록이 직접 언급한다. |
| Circle Out (`kickboxing__circle-out`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 서클 아웃은 MMA(케이지 벗어나기)에서 쓰인다. |
| Clinch (`boxing__clinch`) | MMA (클린치 (Clinch)) | 전수 감사 A: 클린치는 MMA 클린치 관련 기록이 직접 명시한다. |
| Clinch (근접 컨트롤) (`karate__clinch`) | MMA (클린치 (Clinch)) | 전수 감사 B: MMA 데이터의 언급은 일반어("타격 페인트", "클린치 그립")라 A가 아닌 B (검수자 재정의) |
| Clinch Escape (`boxing__clinch-escape`) | MMA (클린치 (Clinch)) | 전수 감사 B: 클린치 탈출은 MMA 클린치 게임에서 쓰인다. |
| Clinch Knee (`muay-thai__clinch-knee`) | 킥복싱 (니 (무릎)), MMA (클린치 (Clinch)) | 전수 감사 B: 킥복싱 해시태그에 #ClinchKnee가 포함됨(룰 허용 시).; 전수 감사 A: 클린치 니는 MMA Dirty Boxing 기록이 직접 명시한다(무에타이 클린치 니). |
| Closed Guard (`bjj__closed-guard`) | MMA (그라운드 컨트롤 (Ground Control)) | MMA A: MMA "Guard Recovery Under Strikes" 설명 "가드(클로즈드/하프)를 다시 잡아" |
| Collar Tie (`wrestling__collar-tie`) | 무에타이 (클린치 (Clinch)), MMA (클린치 (Clinch)) | 묶음 기록 분리 (`muay-thai__single-collar-tie-double-collar-tie`); MMA B: MMA "Dirty Boxing" 설명 "클린치 상태에서 상대의 팔/목을 컨트롤" — 목 컨트롤 그립 |
| Collar Tie → Short Knee (`kickboxing__collar-tie-short-knee`) | MMA (클린치 (Clinch)) | 전수 감사 B: 칼라타이(목 컨트롤) 후 숏니는 MMA 클린치에서 쓰인다(도복 칼라 아님). |
| Combination (`boxing__combination`) | MMA (MMA 복싱) | 전수 감사 A: 복싱 콤비네이션은 MMA Boxing Combination 기록이 직접 명시한다. |
| Combination Pressure (`boxing__combination-pressure`) | MMA (MMA 복싱) | 전수 감사 B: 콤비네이션 압박은 MMA에서 쓰이는 공격 운영이다. |
| Corner Finish (`wrestling__corner-finish`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 코너 돌기 마무리는 MMA 더블레그에서 흔히 쓰인다. |
| Counter Elbow (`muay-thai__counter-elbow`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 카운터 엘보는 MMA에서 쓰인다(수직 하향 제외). |
| Counter Knee (`muay-thai__counter-knee`) | MMA (MMA 킥복싱) | 전수 감사 B: 카운터 니(레벨체인지 대응 포함)는 MMA에서 쓰인다. |
| Cover (`kickboxing__cover`) | 무에타이 (펀치 방어), MMA (방어 (Defense)) | 묶음 기록 분리 (`muay-thai__parry-catch-slip-pull-back-step-back-roll-cover`); 전수 감사 B: 커버는 MMA 스탠딩 방어로 쓰인다. |
| Cross (`kickboxing__cross`) | 무에타이 (중거리 펀치), 삼보 (컴뱃 삼보 타격 범주), MMA (MMA 복싱) | 묶음 기록 분리 (`muay-thai__jab-cross`); 묶음 기록 분리 (`sambo__jab-cross-hook-uppercut`); MMA A: MMA "MMA Boxing Combination" 설명 "잽-크로스-훅 등 복싱 콤비네이션" |
| Cross → Hook (`muay-thai__cross-to-hook`) | 킥복싱 (펀치), MMA (MMA 복싱) | 전수 감사 B: Cross → Hook → High Kick 콤비네이션의 일부로만 등장함.; 전수 감사 B: 크로스-훅은 MMA 복싱 콤비네이션으로 쓰인다. |
| Cross → Hook → High Kick (`kickboxing__cross-hook-high-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 크로스-훅-하이킥은 MMA 펀치-킥 연결로 쓰인다. |
| Cross → Low Kick (`muay-thai__cross-to-low-kick`) | 킥복싱 (킥), MMA (MMA 킥복싱) | 전수 감사 B: Jab → Cross → Low Kick 콤비네이션의 일부로만 등장함.; 전수 감사 B: 크로스-로우킥은 MMA 펀치-킥 연결로 쓰인다. |
| Cross Counter (`kickboxing__cross-counter`) | 무에타이 (카운터 종합), MMA (MMA 복싱) | 묶음 기록 분리 (`muay-thai__jab-counter-cross-counter-hook-counter`); 전수 감사 B: 크로스 카운터는 MMA에서 쓰인다. |
| Cross--Body Kick (`muay-thai__cross-body-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 크로스-바디킥은 MMA 펀치-킥 연결로 쓰인다. |
| Crossface (`wrestling__crossface`) | MMA (방어 (Defense)) | 전수 감사 B: 크로스페이스는 MMA 스프롤 및 탑 컨트롤에서 흔하다. |
| Crucifix (`bjj__crucifix`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Crucifix Attacks (`bjj__crucifix-attacks`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Cut-Off (`kickboxing__cut-off`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 컷오프(케이지 몰기)는 MMA에서 쓰인다. |
| D'Arce Choke (`bjj__d-arce-choke`) | MMA (서브미션 (Submission)) | 전수 감사 B: MMA에서 실제 피니시로 자주 나오는 노기 서브미션이다. |
| De Ashi Barai (`judo__de-ashi-barai`) | 가라테 (전통 가라테의 응용 (자기방어 / Bunkai)), MMA (테이크다운 (Takedown)) | 묶음 기록 분리 (`karate__o-soto-gari-de-ashi-barai-등`); 전수 감사 B: 타이밍 발쓸기로 노기 상태에서 MMA 스탠딩 공방에 실제 사용된다. |
| Diagonal Elbow (`kickboxing__diagonal-elbow`) | 무에타이 (엘보 (Sok, ศอก)), MMA (스트라이킹 (Striking)) | 묶음 기록 분리 (`muay-thai__diagonal-elbow-downward-elbow-upward-elbow-spinning-elbow`); 전수 감사 B: 대각선 엘보는 수직 하향이 아니어서 MMA에서 합법적으로 쓰인다. |
| Diagonal Knee (`muay-thai__diagonal-knee`) | MMA (클린치 (Clinch)) | 전수 감사 B: 다이애거널 니는 MMA 클린치에서 쓰인다. |
| Dogfight (`bjj__dogfight`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Dogfight Sweep (`bjj__dogfight-sweep`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Double Collar Tie (`kickboxing__double-collar-tie`) | 무에타이 (클린치 (Clinch)), MMA (클린치 (Clinch)) | 묶음 기록 분리 (`muay-thai__single-collar-tie-double-collar-tie`); MMA B: MMA "Dirty Boxing" 설명 "무에타이 클린치 니와 함께" — 무에타이 클린치(Chap Kho, 목 감싸기) |
| Double Forearm Guard (`boxing__double-forearm-guard`) | MMA (방어 (Defense)) | 전수 감사 B: 양팔 전완 가드는 MMA 스탠딩 방어에 쓰인다. |
| Double Jab Entry (`boxing__double-jab-entry`) | MMA (MMA 복싱) | 전수 감사 B: 더블잽 진입은 MMA 거리 좁히기에 쓰인다. |
| Double Leg Finish (`wrestling__double-leg-finish`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 더블레그 마무리는 MMA 테이크다운의 필수 부분이다. |
| Double Leg from Tie (`wrestling__double-leg-from-tie`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 타이에서 더블레그 진입은 MMA 클린치 테이크다운이다. |
| Double Leg from Underhook (`wrestling__double-leg-from-underhook`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 언더훅에서 더블레그는 S1 클린치 테이크다운 진입에 해당한다. |
| Double Parry (`boxing__double-parry`) | MMA (방어 (Defense)) | 전수 감사 B: 양손 패리는 MMA 펀치 방어로 쓰인다. |
| Double Slip (`boxing__double-slip`) | MMA (방어 (Defense)) | 전수 감사 B: 연속 슬립은 MMA 펀치 방어로 쓰인다. |
| Double Under Pass (`bjj__double-under-pass`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Double Underhooks (`wrestling__double-underhooks`) | MMA (클린치 (Clinch)) | 전수 감사 B: 더블 언더훅은 MMA 클린치에서 흔한 지배 포지션이다. |
| Double-Leg Down Defense (`wrestling__double-leg-down-defense`) | MMA (방어 (Defense)) | 전수 감사 B: 더블레그 방어는 MMA 테이크다운 방어 기본이다. |
| Double-Leg Position (`wrestling__double-leg-position`) | MMA (클린치 (Clinch)) | 전수 감사 B: 더블레그 포지션은 MMA 테이크다운의 기본이다. |
| Down Block (`wrestling__down-block`) | MMA (방어 (Defense)) | 전수 감사 B: 손으로 태클을 막는 다운 블록은 MMA 테이크다운 방어 층위에 쓰인다. |
| Downward Parry (`boxing__downward-parry`) | MMA (방어 (Defense)) | 전수 감사 B: 아래로 쳐내는 패리는 MMA에서 잽·바디샷 방어로 쓰인다. |
| Drop Step (`boxing__drop-step`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 드롭 스텝은 MMA 스탠딩 풋워크로 쓰인다. |
| Drop Step (`wrestling__drop-step`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 더블레그 진입·마무리 시 드롭 스텝은 MMA에서도 쓰인다. |
| Duck (`boxing__duck`) | MMA (방어 (Defense)) | 전수 감사 B: 덕킹은 MMA에서도 쓰이는 펀치 회피다(니 위험 주의). |
| Duck Under (`bjj__duck-under`) | 삼보 (테이크다운 진입 (레슬링 계열)), MMA (테이크다운 (Takedown)) | 묶음 기록 분리 (`sambo__knee-tap-body-lock-arm-drag-duck-under-snap-down`); 전수 감사 B: MMA에서 흔히 쓰이는 노기 레슬링 테이크다운 진입/마무리 기술이다. |
| Elbow Block (`boxing__elbow-block`) | MMA (방어 (Defense)) | 전수 감사 B: 팔꿈치로 바디샷을 막는 방어는 MMA에서도 쓰인다. |
| Elbow Control (`wrestling__elbow-control`) | 삼보 (그립 파이팅(Захват) --- 재킷·벨트 중심) | 묶음 기록 분리 (`sambo__elbow-control-leg-grip`) |
| Elbow Entry (`muay-thai__elbow-entry`) | MMA (클린치 (Clinch)) | 전수 감사 B: 클린치에서 짧게 치고 빠지는 엘보는 MMA에서 쓰인다. |
| Elbow from Clinch (`muay-thai__elbow-from-clinch`) | MMA (클린치 (Clinch)) | 전수 감사 B: 클린치 컨트롤 중 엘보는 MMA 클린치에서 쓰인다. |
| Elbow Guard (`boxing__elbow-guard`) | MMA (방어 (Defense)) | 전수 감사 B: 팔꿈치 가드는 MMA에서 훅·바디 방어로 쓰인다. |
| Elbow Guard (`muay-thai__elbow-guard`) | MMA (MMA 킥복싱) | 전수 감사 B: 팔꿈치를 세워 훅·킥을 막는 가드는 MMA에서 쓰인다. |
| Elbow Shield (`muay-thai__elbow-shield`) | MMA (방어 (Defense)) | 전수 감사 B: 엘보 쉴드는 MMA 킥·펀치 방어로 쓰인다. |
| Elbow-Knee Escape (`bjj__elbow-knee-escape`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| Elevation (`bjj__elevation`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Evade (`muay-thai__evade`) | MMA (방어 (Defense)) | 전수 감사 B: 킥 회피는 MMA 거리 관리 방어다. |
| Face-Level Teep (`muay-thai__face-level-teep`) | MMA (MMA 킥복싱) | 전수 감사 B: 안면 프런트킥/티프는 MMA에서 실제로 쓰인다. |
| Fake Shot (`wrestling__fake-shot`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 태클 페이크는 MMA에서 타격과 테이크다운을 섞는 기본 셋업이다. |
| Far-side Underhook (`bjj__far-side-underhook`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Feet on Hips (`bjj__feet-on-hips`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 파운드와 압박을 막고 공간을 만드는 프레임으로 MMA에서 핵심적이다. |
| Feint (`boxing__feint`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 페인트는 MMA에서 타격·테이크다운 셋업으로 널리 쓰인다. |
| Feint (`wrestling__feint`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 페인트는 MMA에서 테이크다운 위협과 함께 핵심적으로 쓰인다. |
| Feint (`karate__feint`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: MMA 데이터의 언급은 일반어("타격 페인트", "클린치 그립")라 A가 아닌 B (검수자 재정의) |
| Feint → Double (`boxing__feint-double`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 페인트 후 더블(잽) 연결은 MMA 타격 셋업으로 쓰인다. |
| Feint → Double Jab (`boxing__feint-double-jab`) | MMA (MMA 복싱) | 전수 감사 B: 페인트-더블잽은 MMA 타격 셋업으로 쓰인다. |
| Feint → Entry (`boxing__feint-entry`) | 킥복싱 (페인트 (Feint)), MMA (스트라이킹 (Striking)) | 전수 감사 A: 킥복싱 진입 흐름에 Feint → Entry가 명시됨.; 전수 감사 B: 페인트로 거리를 좁히는 진입은 MMA 타격·테이크다운 진입에 쓰인다. |
| Feint Chain (`kickboxing__feint-chain`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 복합 페인트는 MMA 타격 셋업에 쓰인다. |
| Fireman's Carry (`sambo__fireman-s-carry`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 파이어맨즈 캐리는 MMA 테이크다운으로 쓰인다. |
| Flying Knee (`kickboxing__flying-knee`) | MMA (MMA 킥복싱) | 전수 감사 B: 플라잉 니는 MMA에서 쓰이는 니 공격이다. |
| Foot Feint (`kickboxing__foot-feint`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 스텝 페인트는 MMA 타격 셋업에 쓰인다. |
| Frame (`boxing__frame`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 근거리 프레임은 MMA 클린치·거리 확보에 쓰인다. |
| Frame (`judo__frame`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 하위 포지션 프레이밍은 MMA 레코드 Framing과 동일한 기술이다. |
| Frame Escape (`sambo__frame-escape`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 프레임 탈출은 MMA 레코드 Framing 방어와 같은 기술이다. |
| Frame/Guard (`boxing__frame-guard`) | MMA (방어 (Defense)) | 전수 감사 B: 프레임 가드는 MMA 스탠딩 방어로 쓰인다. |
| Front Body Lock (`wrestling__front-body-lock`) | MMA (클린치 (Clinch)) | 전수 감사 B: 프론트 바디락은 MMA 클린치 테이크다운에 쓰인다. |
| Front Headlock (`wrestling__front-headlock`) | MMA (클린치 (Clinch)) | 전수 감사 B: 프론트 헤드락은 MMA에서 스프롤 후 컨트롤·길로틴·니 공격에 쓰인다. |
| Front Headlock Choke (`sambo__front-headlock-choke`) | MMA (서브미션 (Submission)) | 전수 감사 B: 프론트 헤드락 초크(길로틴 계열)는 MMA 서브미션이다. |
| Front Headlock Defense (`wrestling__front-headlock-defense`) | MMA (방어 (Defense)) | 전수 감사 B: 프론트 헤드락(길로틴 포함) 방어는 MMA에서 필수다. |
| Front Headlock to Back (`wrestling__front-headlock-to-back`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 프론트 헤드락에서 백 테이크는 MMA에서 흔하다. |
| Front Headlock to Single (`wrestling__front-headlock-to-single`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 프론트 헤드락에서 싱글 전환은 MMA 스크램블에서 쓰인다. |
| Front Kick (`kickboxing__front-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 프런트킥은 MMA에서 거리 견제·안면 공격으로 쓰인다. |
| Full Guard Recovery (`bjj__full-guard-recovery`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| Gift Wrap (`bjj__gift-wrap`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Gift Wrap → Back (`bjj__gift-wrap-back`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA에서 흔한 백 테이크/백 컨트롤 기술로 RNC·파운드로 이어진다. |
| Go-Behind (`wrestling__go-behind`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 고 비하인드(등 잡기)는 MMA 클린치·스크램블에서 쓰인다. |
| Granby Roll (`wrestling__granby-roll`) | 삼보 (바텀 포지션과 탈출), MMA (그라운드 컨트롤 (Ground Control)) | 묶음 기록 분리 (`sambo__bridge-мост-hip-escape-sit-out-stand-up-granby-turn-in-frame-escape-back-escape`); 전수 감사 A: MMA 링크 기록이 그랜비 롤을 직접 연결하며 스크램블·가드 회복에 쓰인다. |
| Grip Fight → Takedown → Leg Lock Entry (`sambo__grip-fight-takedown-leg-lock-entry`) | MMA (테이크다운 (Takedown)) | 전수 감사 A: MMA 레코드(Leg Entanglement Scramble)가 테이크다운 후 레그락 진입을 명시한다. |
| Ground Striking (`sambo__ground-striking`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 그라운드 타격은 MMA 그라운드 앤 파운드에 해당한다. |
| Guard (`muay-thai__guard`) | MMA (방어 (Defense)) | 전수 감사 B: 타격 가드는 MMA 스탠딩 기본 자세다(기록의 하프가드는 그라운드 가드로 다른 개념). |
| Guard (클로즈드/오픈) (`sambo__guard`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 A: MMA 레코드가 클로즈드/하프 가드를 직접 명시한다. |
| Guard Recovery (`judo__guard-recovery`) | 삼보 (바텀 포지션과 탈출), MMA (그라운드 컨트롤 (Ground Control)) | 묶음 기록 분리 (`sambo__guard-recovery-technical-stand-up`); 전수 감사 A: MMA 레코드가 하위에서의 가드 회복을 직접 명시한다. |
| Guard Sweep (`sambo__guard-sweep`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 가드 스윕은 MMA 하위 가드에서 포지션 역전에 쓰인다. |
| Guillotine (`bjj__guillotine`) | 삼보 (목/조르기 계열 --- 컴뱃 삼보 한정), MMA (서브미션 (Submission)) | 묶음 기록 분리 (`sambo__rear-naked-choke-guillotine-front-headlock-choke-arm-triangle-collar-choke-계열`); MMA A: MMA "Submission Setup off Strikes" 설명 "암바나 길로틴"·관련 기술 bjj__guillotine, 공유 라이브러리 MMA "Guillotine Choke" |
| Half Guard (`bjj__half-guard`) | 삼보 (바텀 포지션과 탈출), MMA (그라운드 컨트롤 (Ground Control)) | 묶음 기록 분리 (`sambo__guard-클로즈드-오픈-half-guard-turtle-defensive-shell`); MMA A: MMA "Short Elbows in Half Guard", "Guard Recovery Under Strikes" 설명 "가드(클로즈드/하프)" |
| Half Guard Recovery (`bjj__half-guard-recovery`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| Hand Control (`wrestling__hand-control`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 바텀에서 손 컨트롤·손싸움은 MMA 백/바디락 방어에서 핵심이다. |
| Hand Feint (`kickboxing__hand-feint`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 손 페인트는 MMA 타격 셋업에 쓰인다. |
| Hand Feint → Body Kick (`kickboxing__hand-feint-body-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 손 페인트-바디킥은 MMA 셋업으로 쓰인다. |
| Hand Fighting (`boxing__hand-fighting`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 핸드파이팅은 MMA 스탠딩·클린치에서 핵심적으로 쓰인다. |
| Hand Fighting (`wrestling__hand-fighting`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 클린치·테이크다운 공방의 손싸움은 MMA 그래플링의 기본이다. |
| Head Control (`bjj__head-control`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Head Position (`wrestling__head-position`) | BJJ (리샷 / 카운터), MMA (방어 (Defense)) | 전수 감사 A: BJJ 문서 기술 목록에 Head Position이 나열됨.; 전수 감사 B: 머리 위치 싸움은 MMA 클린치·테이크다운 공방의 기본이다. |
| Head--Body Combination (`boxing__head-body-combination`) | MMA (MMA 복싱) | 전수 감사 B: 헤드-바디 연결은 MMA 복싱에서 쓰이는 콤비네이션이다. |
| Head-and-Arm Choke (`bjj__head-and-arm-choke`) | MMA (서브미션 (Submission)) | 전수 감사 B: MMA에서 실제 피니시로 자주 나오는 노기 서브미션이다. |
| Head-and-Arm Control (`wrestling__head-and-arm-control`) | MMA (클린치 (Clinch)) | 전수 감사 B: 머리와 팔 컨트롤은 MMA 클린치 및 길로틴/테이크다운 셋업에 쓰인다. |
| Heel Hook (`bjj__heel-hook`) | MMA (서브미션 (Submission)) | 전수 감사 B: 통합룰상 합법(소관절 아님)이며 MMA 레그락 공방에서 실제로 쓰인다. |
| High Crotch (`bjj__high-crotch`) | 삼보 (테이크다운 진입 (레슬링 계열)), MMA (테이크다운 (Takedown)) | 묶음 기록 분리 (`sambo__high-crotch-ankle-pick`); 전수 감사 B: MMA에서 흔히 쓰이는 노기 레슬링 테이크다운 진입/마무리 기술이다. |
| High Double (`wrestling__high-double`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 하이 더블은 MMA 케이지 레슬링에서 흔하다. |
| High Guard (`kickboxing__high-guard`) | 무에타이 (기본 개념 --- 거리(Range)와 자세), MMA (방어 (Defense)) | 묶음 기록 분리 (`muay-thai__guard-long-guard-high-guard`); 전수 감사 B: 하이가드는 MMA 스탠딩 방어 자세로 쓰인다. |
| High Kick (`kickboxing__high-kick`) | 무에타이 (장거리 킥 (Round Kick / Low Kick 계열)), 삼보 (컴뱃 삼보 타격 범주), MMA (MMA 킥복싱) | 묶음 기록 분리 (`muay-thai__low-kick-body-kick-high-kick`); 묶음 기록 분리 (`sambo__low-kick-body-kick-헤드킥`); 전수 감사 B: 하이킥은 MMA에서 쓰이는 킥이다(스탠딩 상대). |
| High Mount (`bjj__high-mount`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 A: MARTIALDEX MMA 레코드가 직접 언급하는 포지션/기술로 MMA에서 핵심적으로 쓰인다. |
| High Single (`wrestling__high-single`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 하이 싱글은 MMA 케이지·클린치 테이크다운에서 자주 쓰인다. |
| High-Crotch Dump (`wrestling__high-crotch-dump`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 하이 크로치 덤프 마무리는 MMA에서 쓰인다. |
| High-Crotch Lift (`wrestling__high-crotch-lift`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 하이 크로치 리프트는 MMA 테이크다운으로 쓰인다. |
| Hip Bump Sweep (`bjj__hip-bump-sweep`) | 삼보 (스윕 / 전환), MMA (그라운드 컨트롤 (Ground Control)) | 묶음 기록 분리 (`sambo__hip-bump-sweep-butterfly-sweep-technical-stand-up-sweep`); 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Hip Escape (`bjj__hip-escape`) | 삼보 (바텀 포지션과 탈출), MMA (그라운드 컨트롤 (Ground Control)) | 묶음 기록 분리 (`sambo__bridge-мост-hip-escape-sit-out-stand-up-granby-turn-in-frame-escape-back-escape`); 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| Hip Heist (`wrestling__hip-heist`) | BJJ (기본 움직임과 연결 기술), MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: BJJ 라이브러리에 Hip Heist Sweep으로 힙 헤이스트 동작이 쓰임.; 전수 감사 B: 하위에서 일어나거나 스크램블할 때 MMA에서 널리 쓰는 동작이다. |
| Hip Pressure (`wrestling__hip-pressure`) | MMA (방어 (Defense)) | 전수 감사 B: 스프롤 시 엉덩이 압박은 MMA 테이크다운 방어의 핵심이다. |
| Hook (`boxing__hook`) | 삼보 (컴뱃 삼보 타격 범주), MMA (MMA 복싱) | 묶음 기록 분리 (`sambo__jab-cross-hook-uppercut`); 전수 감사 A: 훅은 MMA 복싱 콤비네이션 기록과 체크훅 기록이 직접 명시하는 펀치다. |
| Hook Counter (`kickboxing__hook-counter`) | 무에타이 (카운터 종합), MMA (MMA 복싱) | 묶음 기록 분리 (`muay-thai__jab-counter-cross-counter-hook-counter`); 전수 감사 B: 훅 카운터는 MMA에서 쓰인다(체크훅 등). |
| Hook Sweep (`bjj__hook-sweep`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Hook to Body (`boxing__hook-to-body`) | MMA (MMA 복싱) | 전수 감사 B: 바디 훅은 MMA에서 쓰이는 펀치다. |
| Hook--Low Kick (`muay-thai__hook-low-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 훅-로우킥은 MMA 펀치-킥 연결로 쓰인다. |
| Hooks (`bjj__hooks`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 A: MARTIALDEX MMA 레코드가 직접 언급하는 포지션/기술로 MMA에서 핵심적으로 쓰인다. |
| Horizontal Elbow (`kickboxing__horizontal-elbow`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 수평 엘보는 MMA 스탠딩·클린치에서 합법적으로 쓰인다. |
| In-and-Out (`boxing__in-and-out`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 들어가 치고 빠지는 인앤아웃 풋워크는 MMA에서 흔히 쓰인다. |
| Inside Control (`kickboxing__inside-control`) | 무에타이 (클린치 (Clinch)), MMA (클린치 (Clinch)) | 묶음 기록 분리 (`muay-thai__inside-control-outside-control`); 전수 감사 B: 인사이드 컨트롤은 MMA 클린치 핵심 기술이다. |
| Inside Control (`wrestling__inside-control`) | MMA (클린치 (Clinch)) | 전수 감사 B: 안쪽 손/언더훅 위치 선점은 MMA 클린치의 핵심이다. |
| Inside Low Kick (`muay-thai__inside-low-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 인사이드 로우킥은 MMA에서 쓰인다. |
| Inside Pass (`bjj__inside-pass`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Inside Position (`boxing__inside-position`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 인사이드 포지션 확보는 MMA 클린치·더티복싱에서 쓰인다. |
| Inside Sankaku (`bjj__inside-sankaku`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 통합룰상 합법(소관절 아님)이며 MMA 레그락 공방에서 실제로 쓰인다. |
| Inside Single (`bjj__inside-single`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: MMA에서 흔히 쓰이는 노기 레슬링 테이크다운 진입/마무리 기술이다. |
| Inside Tie (`wrestling__inside-tie`) | MMA (클린치 (Clinch)) | 전수 감사 B: 안쪽 팔(이두) 타이는 MMA 클린치에서 흔히 쓰는 그립이다. |
| Inside Trip (`wrestling__inside-trip`) | 무에타이 (클린치 (Clinch)), MMA (테이크다운 (Takedown)) | 묶음 기록 분리 (`muay-thai__outside-trip-inside-trip`); 전수 감사 A: MMA 기록(Body Lock Inside Trip)이 직접 이름을 든다. |
| Jab (`kickboxing__jab`) | 무에타이 (중거리 펀치), 삼보 (컴뱃 삼보 타격 범주), MMA (MMA 복싱) | 묶음 기록 분리 (`muay-thai__jab-cross`); 묶음 기록 분리 (`sambo__jab-cross-hook-uppercut`); MMA A: MMA "MMA Boxing Combination" 설명 "잽-크로스-훅 등 복싱 콤비네이션" |
| Jab → Body Kick (`kickboxing__jab-body-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 잽-바디킥은 MMA 펀치-킥 연결로 쓰인다. |
| Jab → Cross (`muay-thai__jab-to-cross`) | 킥복싱 (펀치), MMA (MMA 복싱) | 전수 감사 A: 킥복싱 문서에 Jab → Cross 압박/콤비네이션이 나열됨.; 전수 감사 B: 잽-크로스는 MMA 복싱 기본 콤비네이션이다. |
| Jab → Cross → Body Kick (`kickboxing__jab-cross-body-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 잽-크로스-바디킥은 MMA 펀치-킥 연결로 쓰인다. |
| Jab → Cross → Low Kick (`kickboxing__jab-cross-low-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 잽-크로스-로우킥은 MMA 펀치-킥 연결로 쓰인다. |
| Jab → Hook (`muay-thai__jab-to-hook`) | 킥복싱 (펀치), MMA (MMA 복싱) | 전수 감사 B: Jab → Hook → Low Kick 콤비네이션의 일부로만 등장함.; 전수 감사 B: 잽-훅은 MMA 복싱 콤비네이션으로 쓰인다. |
| Jab → Hook → Low Kick (`kickboxing__jab-hook-low-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 잽-훅-로우킥은 MMA 펀치-킥 연결로 쓰인다. |
| Jab → Low Kick (`muay-thai__jab-to-low-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 잽-로우킥은 MMA 펀치-킥 연결로 쓰인다. |
| Jab Counter (`kickboxing__jab-counter`) | 무에타이 (카운터 종합), MMA (MMA 복싱) | 묶음 기록 분리 (`muay-thai__jab-counter-cross-counter-hook-counter`); 전수 감사 B: 잽 카운터는 MMA에서 쓰인다. |
| Jab Feint (`boxing__jab-feint`) | MMA (MMA 복싱) | 전수 감사 B: 잽 페인트는 MMA에서 흔히 쓰이는 셋업이다. |
| Jab Feint → Cross (`boxing__jab-feint-cross`) | MMA (MMA 복싱) | 전수 감사 B: 잽 페인트-크로스는 MMA 타격 셋업으로 쓰인다. |
| Jab to Body (`boxing__jab-to-body`) | MMA (MMA 복싱) | 전수 감사 B: 바디 잽은 MMA에서 쓰이는 펀치다. |
| Jab--Cross--Hook (`muay-thai__jab-cross-hook`) | MMA (MMA 복싱) | 전수 감사 A: 잽-크로스-훅은 MMA Boxing Combination 기록이 직접 명시한다. |
| Jumping Knee (`kickboxing__jumping-knee`) | MMA (MMA 킥복싱) | 전수 감사 B: 점핑 니는 MMA(테이크다운 진입 카운터 등)에서 쓰인다. |
| Kami Shiho Gatame (`judo__kami-shiho-gatame`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 위누르기(노스-사우스)는 노기 MMA 탑 컨트롤로 쓰인다. |
| Kansetsu Geri (`karate__kansetsu-geri`) | MMA (방어 (Defense)) | 전수 감사 B: 무릎 관절을 노리는 킥은 MMA 오블리크 킥과 같은 기술 |
| Kata Gatame (`judo__kata-gatame`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 어깨 굳히기(암 트라이앵글 홀드)는 MMA 컨트롤·서브미션으로 흔히 쓰인다. |
| Kesa Gatame (`judo__kesa-gatame`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 케사가타메(스카프 홀드)는 MMA 탑 컨트롤과 파운드에 쓰인다. |
| Kibisu Gaeshi (`judo__kibisu-gaeshi`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 발뒤꿈치를 잡아 넘기는 앵클 픽 계열로 MMA 테이크다운에 쓰인다. |
| Kick After Punch (`kickboxing__kick-after-punch`) | MMA (MMA 킥복싱) | 전수 감사 B: 펀치 후 킥 연결은 MMA에서 쓰인다. |
| Kick Catch to Counter (`muay-thai__kick-catch-to-counter`) | MMA (MMA 킥복싱) | 전수 감사 B: 킥 캐치 후 카운터는 MMA에서 쓰인다. |
| Kick Feint (`kickboxing__kick-feint`) | MMA (MMA 킥복싱) | 전수 감사 B: 킥 페인트는 MMA 타격 셋업에 쓰인다. |
| Kick Feint → Low Kick (`kickboxing__kick-feint-low-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 킥 페인트-로우킥은 MMA 셋업으로 쓰인다. |
| Kick Parry (`muay-thai__kick-parry`) | MMA (방어 (Defense)) | 전수 감사 B: 킥 패리는 MMA 킥 방어로 쓰인다. |
| Kimura (`bjj__kimura`) | MMA (서브미션 (Submission)), 삼보 (클로즈드 가드 (Closed Guard)) | MMA A: MMA "Submission Setup off Strikes" 관련 기술 bjj__kimura; 전수 감사 A: 삼보 노트형(узел) 락에 Kimura 계열이 명시됨. |
| Kimura Control (`bjj__kimura-control`) | MMA (서브미션 (Submission)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Kimura Sweep (`bjj__kimura-sweep`) | MMA (서브미션 (Submission)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Kimura Trap (`bjj__kimura-trap`) | MMA (서브미션 (Submission)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Knee Cut Pass (`bjj__knee-cut-pass`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Knee Elbow Escape (`bjj__knee-elbow-escape`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| Knee Mount (`bjj__knee-mount`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Knee on Belly (`bjj__knee-on-belly`) | 삼보 (암바 계열), MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 A: 삼보 추가 탑 컨트롤에 Knee on Belly가 포함됨.; 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Knee on Belly Control (`bjj__knee-on-belly-control`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Knee Shield (`bjj__knee-shield`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Knee Shield Half Guard (`bjj__knee-shield-half-guard`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Knee Tap (`bjj__knee-tap`) | 삼보 (테이크다운 진입 (레슬링 계열)), MMA (테이크다운 (Takedown)) | 묶음 기록 분리 (`sambo__knee-tap-body-lock-arm-drag-duck-under-snap-down`); 전수 감사 B: MMA에서 흔히 쓰이는 노기 레슬링 테이크다운 진입/마무리 기술이다. |
| Knee Tap from Single (`wrestling__knee-tap-from-single`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 싱글에서 니탭 전환은 MMA에서 흔히 쓰는 마무리다. |
| Knee-Elbow Recovery (`bjj__knee-elbow-recovery`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| Knee-on-Belly to Side Control (`bjj__knee-on-belly-to-side-control`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Kneebar (`bjj__kneebar`) | MMA (서브미션 (Submission)) | 전수 감사 B: 통합룰상 합법(소관절 아님)이며 MMA 레그락 공방에서 실제로 쓰인다. |
| Koshi Guruma (`judo__koshi-guruma`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 헤드락 힙 스로우로 MMA 클린치에서 실제 사용된다. |
| Kosoto Gake (`judo__kosoto-gake`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 아웃사이드 트립으로 MMA 바디락·클린치에서 흔히 쓰인다. |
| Kouchi Gari (`judo__kouchi-gari`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 작은 안다리 걸기는 MMA 클린치와 케이지에서 자주 쓰이는 트립이다. |
| Kuzure Kesa Gatame (`judo__kuzure-kesa-gatame`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 변형 케사가타메는 노기 스카프 홀드로 MMA 탑 컨트롤에 쓰인다. |
| L-Step (`boxing__l-step`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: L-스텝(뒤로 빠지며 각도 전환)은 MMA 스트라이커도 쓰는 풋워크다. |
| Lateral Step (`boxing__lateral-step`) | 무에타이 (풋워크), MMA (스트라이킹 (Striking)) | 전수 감사 A: 무에타이 기본 풋워크에 Lateral Step이 포함됨.; 전수 감사 B: 측면 스텝은 MMA 거리·각도 관리 풋워크로 쓰인다. |
| Lead Hand Parry (`boxing__lead-hand-parry`) | MMA (방어 (Defense)) | 전수 감사 B: 리드손 패리는 MMA 펀치 방어로 쓰인다. |
| Lead Hook (`kickboxing__lead-hook`) | 무에타이 (중거리 펀치), MMA (MMA 복싱) | 묶음 기록 분리 (`muay-thai__lead-hook-rear-hook`); MMA B: MMA "MMA Boxing Combination"("잽-크로스-훅")·"Dirty Boxing"("짧은 훅") — 훅(리드/리어 미구분) |
| Lead Knee (`kickboxing__lead-knee`) | 무에타이 (니 (Khao, เข่า)), MMA (MMA 킥복싱) | 묶음 기록 분리 (`muay-thai__lead-knee-rear-knee-side-knee`); 전수 감사 B: 리드 니는 MMA 스탠딩·클린치에서 쓰인다. |
| Lead Low Kick (`muay-thai__lead-low-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 리드 로우킥은 MMA에서 쓰인다. |
| Lead Round Kick (`muay-thai__lead-round-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 리드 라운드킥은 MMA에서 쓰인다. |
| Lead Teep (`muay-thai__lead-teep`) | MMA (MMA 킥복싱) | 전수 감사 B: 리드 티프는 MMA 거리 견제로 쓰인다. |
| Lead Uppercut (`kickboxing__lead-uppercut`) | 무에타이 (중거리 펀치), MMA (MMA 복싱) | 묶음 기록 분리 (`muay-thai__lead-uppercut-rear-uppercut`); MMA B: MMA "Dirty Boxing" 설명 "짧은 훅과 어퍼컷" — 어퍼컷(리드/리어 미구분) |
| Lean Back (`kickboxing__lean-back`) | 무에타이 (킥 방어), MMA (방어 (Defense)) | 묶음 기록 분리 (`muay-thai__evade-lean-back`); 전수 감사 B: 린백은 MMA에서 하이킥·펀치 회피로 쓰인다. |
| Leg Drag (`bjj__leg-drag`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Leg Entanglement (`bjj__leg-entanglement`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 A: MARTIALDEX MMA 레코드가 직접 언급하는 포지션/기술로 MMA에서 핵심적으로 쓰인다. |
| Leg Locks (`bjj__leg-locks`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 통합룰상 합법(소관절 아님)이며 MMA 레그락 공방에서 실제로 쓰인다. |
| Level Change (`wrestling__level-change`) | 삼보 (기본 자세와 거리(Дистанция)), MMA (그라운드 컨트롤 (Ground Control)) | 묶음 기록 분리 (`sambo__level-change-footwork-pivot-break-step`); 전수 감사 A: MMA 테이크다운 진입의 핵심 동작으로 MMA 기록이 직접 언급한다. |
| Level Change Feint (`kickboxing__level-change-feint`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 레벨체인지 페인트는 테이크다운 위협이 있는 MMA에서 특히 쓰인다. |
| Level Change Feint → High Kick (`kickboxing__level-change-feint-high-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 레벨체인지 페인트-하이킥은 테이크다운 위협이 있는 MMA에서 쓰인다. |
| Lift and Return (`wrestling__lift-and-return`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 들어 올려 매트로 되돌리기는 MMA 케이지 레슬링에서 흔하다. |
| Lift Finish (`wrestling__lift-finish`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 들어올려 마무리하는 더블은 MMA에서 쓰이며 머리 착지만 피하면 합법이다. |
| Long Elbow (`muay-thai__long-elbow`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 긴 궤적 엘보는 MMA 스탠딩에서 쓰인다. |
| Long Guard (`boxing__long-guard`) | 가라테 (장거리 (To-ma)), 무에타이 (기본 개념 --- 거리(Range)와 자세), MMA (방어 (Defense)) | 묶음 기록 분리 (`karate__long-guard-distance-control`); 묶음 기록 분리 (`muay-thai__guard-long-guard-high-guard`); 전수 감사 B: 롱가드(앞손으로 거리·시야를 막는 가드)는 MMA 스트라이커들이 실제로 쓰는 가드다. |
| Long Guard Punch (`muay-thai__long-guard-punch`) | MMA (방어 (Defense)) | 전수 감사 B: 롱가드에서 뻗는 잽/크로스는 MMA에서 쓰인다. |
| Low Kick (`kickboxing__low-kick`) | 무에타이 (장거리 킥 (Round Kick / Low Kick 계열)), 삼보 (컴뱃 삼보 타격 범주), MMA (MMA 킥복싱), 가라테 (킥) | 묶음 기록 분리 (`muay-thai__low-kick-body-kick-high-kick`); 묶음 기록 분리 (`sambo__low-kick-body-kick-헤드킥`); MMA A: MMA "Calf Kick" 설명 "…종아리 아래쪽을 노리는 로우킥", "Range Management" 원칙 "로우킥에 대비"; 전수 감사 B: 가라테 해시태그 기술 목록에 #LowKick이 포함됨. |
| Low Kick → Cross (`kickboxing__low-kick-cross`) | MMA (MMA 킥복싱) | 전수 감사 B: 로우킥-크로스는 MMA 킥-펀치 연결로 쓰인다. |
| Low Kick after Punch (`muay-thai__low-kick-after-punch`) | MMA (MMA 킥복싱) | 전수 감사 B: 펀치 후 로우킥은 MMA 연결로 쓰인다. |
| Low Kick after Teep (`muay-thai__low-kick-after-teep`) | MMA (MMA 킥복싱) | 전수 감사 B: 티프 후 로우킥은 MMA 연결로 쓰인다. |
| Low Kick Counter (`muay-thai__low-kick-counter`) | MMA (MMA 킥복싱) | 전수 감사 B: 로우킥 카운터는 MMA에서 쓰인다. |
| Low Mount (`bjj__low-mount`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Low Single (`bjj__low-single`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: MMA에서 흔히 쓰이는 노기 레슬링 테이크다운 진입/마무리 기술이다. |
| Mat Return (`wrestling__mat-return`) | MMA (클린치 (Clinch)) | 전수 감사 B: 매트 리턴은 MMA 케이지 레슬링에서 상대를 다시 눕히는 데 흔히 쓰인다. |
| Mawashi Empi (`karate__mawashi-empi`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 돌려 팔꿈치(수평 엘보)는 MMA 클린치·그라운드에서 쓰임 |
| MMA 상황에서의 일어나기 (`bjj__mma-상황에서의-일어나기`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| Mount (`judo__mount`) | MMA (그라운드 컨트롤 (Ground Control)) | MMA A: MMA "Posture Control in Mount" 관련 기술 bjj__mount, "Ground and Pound from Mount" |
| Mount → S-Mount → Armbar (`bjj__mount-s-mount-armbar`) | MMA (서브미션 (Submission)) | 전수 감사 B: MMA에서 실제 피니시로 자주 나오는 노기 서브미션이다. |
| Mount Transition (`bjj__mount-transition`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Mounted Triangle (`bjj__mounted-triangle`) | MMA (서브미션 (Submission)) | 전수 감사 B: MMA에서 실제 피니시로 자주 나오는 노기 서브미션이다. |
| Near-side Underhook (`bjj__near-side-underhook`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| North-South (`bjj__north-south`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| North-South Choke (`bjj__north-south-choke`) | MMA (서브미션 (Submission)) | 전수 감사 B: MMA에서 실제 피니시로 자주 나오는 노기 서브미션이다. |
| North-South Control (`bjj__north-south-control`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| O Goshi (`judo__o-goshi`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 허리를 감는 힙 스로우로 노기 MMA 클린치에서 사용된다. |
| Off-Balance (`kickboxing__off-balance`) | 무에타이 (클린치 (Clinch)), MMA (클린치 (Clinch)) | 묶음 기록 분리 (`muay-thai__turn-off-balance`); 전수 감사 B: 클린치에서 균형 무너뜨리기는 MMA 클린치 테이크다운 연결에 쓰인다. |
| Omoplata (`bjj__omoplata`) | MMA (서브미션 (Submission)) | 전수 감사 B: MMA에서 실제 피니시로 자주 나오는 노기 서브미션이다. |
| Orthodox (`kickboxing__orthodox`) | 무에타이 (기본 개념 --- 거리(Range)와 자세), MMA (스트라이킹 (Striking)) | 묶음 기록 분리 (`muay-thai__orthodox-southpaw`); 전수 감사 B: 오소독스 스탠스는 MMA에서 쓰이는 기본 스탠스다. |
| Osoto Gari (`judo__osoto-gari`) | 가라테 (전통 가라테의 응용 (자기방어 / Bunkai)), MMA (테이크다운 (Takedown)) | 묶음 기록 분리 (`karate__o-soto-gari-de-ashi-barai-등`); 전수 감사 B: 오버훅/언더훅 클린치에서 노기로 쓰이는 대표적 MMA 클린치 테이크다운이다. |
| Ouchi Gari (`judo__ouchi-gari`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 인사이드 트립으로 MMA 클린치·케이지에서 흔히 쓰인다. |
| Outside Control (`muay-thai__outside-control`) | MMA (클린치 (Clinch)) | 전수 감사 B: 클린치 바깥 컨트롤은 MMA 클린치에서 쓰인다. |
| Outside Low Kick (`muay-thai__outside-low-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 아웃사이드 로우킥은 MMA에서 쓰인다. |
| Outside Pass (`bjj__outside-pass`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Outside Single (`bjj__outside-single`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: MMA에서 흔히 쓰이는 노기 레슬링 테이크다운 진입/마무리 기술이다. |
| Outside Trip (`wrestling__outside-trip`) | 무에타이 (클린치 (Clinch)), MMA (테이크다운 (Takedown)) | 묶음 기록 분리 (`muay-thai__outside-trip-inside-trip`); 전수 감사 B: 아웃사이드 트립은 MMA 클린치에서 흔하다. |
| Over-Under (`wrestling__over-under`) | MMA (클린치 (Clinch)) | 전수 감사 B: 오버-언더는 S1 클린치 그립(언더훅/오버훅) 그 자체다. |
| Over-Under Pass (`bjj__over-under-pass`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Overhook (`bjj__overhook`) | 유도 (잡기 / 그립 --- Kumi Kata), 무에타이 (클린치 (Clinch)), 삼보 (그립 파이팅(Захват) --- 재킷·벨트 중심), MMA (클린치 (Clinch)) | 묶음 기록 분리 (`judo__overhook-underhook`); 묶음 기록 분리 (`muay-thai__overhook-underhook`); 묶음 기록 분리 (`sambo__two-on-one-underhook-overhook-russian-tie`); MMA A: MMA "Clinch Takedown Entry" 설명 "언더훅/오버훅 등 클린치 그립" |
| Parry (`kickboxing__parry`) | 무에타이 (펀치 방어), MMA (방어 (Defense)) | 묶음 기록 분리 (`muay-thai__parry-catch-slip-pull-back-step-back-roll-cover`); 전수 감사 B: 패리는 MMA 타격 방어로 쓰인다. |
| Parry → Cross (`boxing__parry-cross`) | MMA (방어 (Defense)) | 전수 감사 B: 패리 후 크로스 카운터는 MMA에서 쓰인다. |
| Parry → Jab (`boxing__parry-jab`) | MMA (방어 (Defense)) | 전수 감사 B: 패리 후 잽 카운터는 MMA에서 쓰인다. |
| Parry → Jab / Cross (`kickboxing__parry-jab-cross`) | MMA (방어 (Defense)) | 전수 감사 B: 패리 후 잽/크로스 반격은 MMA에서 쓰인다. |
| Parry Counter (`kickboxing__parry-counter`) | MMA (방어 (Defense)) | 전수 감사 B: 패리 카운터는 MMA에서 쓰인다. |
| Penetration Step (`wrestling__penetration-step`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 더블/싱글레그 진입 스텝으로 MMA 테이크다운에서 그대로 쓰인다. |
| Pivot (`kickboxing__pivot`) | 가라테 (이동 (Shintai / 풋워크)), 무에타이 (풋워크), MMA (스트라이킹 (Striking)) | 묶음 기록 분리 (`karate__tai-sabaki-tenkan-pivot`); 전수 감사 A: 무에타이 기본 풋워크 목록에 Pivot이 포함됨.; 전수 감사 B: 피벗은 MMA 각도 만들기·카운터에 쓰이는 풋워크다. |
| Pivot (`wrestling__pivot`) | 삼보 (기본 자세와 거리(Дистанция)) | 묶음 기록 분리 (`sambo__level-change-footwork-pivot-break-step`) |
| Pivot → Hook (`boxing__pivot-hook`) | MMA (MMA 복싱) | 전수 감사 B: 피벗 훅은 MMA 체크훅류 카운터로 쓰인다. |
| Posture Break (`bjj__posture-break`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Pull (`kickboxing__pull`) | 무에타이 (펀치 방어), MMA (방어 (Defense)) | 묶음 기록 분리 (`muay-thai__parry-catch-slip-pull-back-step-back-roll-cover`); 전수 감사 B: 풀백은 MMA 펀치 회피로 쓰인다. |
| Pull → Cross (`boxing__pull-cross`) | MMA (방어 (Defense)) | 전수 감사 B: 풀백 후 크로스 카운터는 MMA에서 자주 쓰인다. |
| Pump Feint (`boxing__pump-feint`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 펌프 페인트는 MMA 타격 셋업에 쓰인다. |
| Punch After Kick (`kickboxing__punch-after-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 킥 후 펀치 연결은 MMA에서 쓰인다. |
| Push Teep (`muay-thai__push-teep`) | MMA (MMA 킥복싱) | 전수 감사 B: 밀어내는 티프는 MMA 거리 확보·전진 저지에 쓰인다. |
| Rear Body Lock (`wrestling__rear-body-lock`) | MMA (클린치 (Clinch)) | 전수 감사 B: 리어 바디락은 MMA에서 백 컨트롤·테이크다운에 흔하다. |
| Rear Hand Parry (`boxing__rear-hand-parry`) | MMA (방어 (Defense)) | 전수 감사 B: 리어손 패리는 MMA 펀치 방어로 쓰인다. |
| Rear Hook (`kickboxing__rear-hook`) | 무에타이 (중거리 펀치), MMA (MMA 복싱) | 묶음 기록 분리 (`muay-thai__lead-hook-rear-hook`); MMA B: MMA "MMA Boxing Combination"("잽-크로스-훅")·"Dirty Boxing"("짧은 훅") — 훅(리드/리어 미구분) |
| Rear Knee (`kickboxing__rear-knee`) | 무에타이 (니 (Khao, เข่า)), MMA (MMA 킥복싱) | 묶음 기록 분리 (`muay-thai__lead-knee-rear-knee-side-knee`); 전수 감사 B: 리어 니는 MMA 스탠딩·클린치에서 쓰인다. |
| Rear Lift / Return (`wrestling__rear-lift-return`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 뒤에서 들어 리턴하는 동작은 MMA 백 컨트롤 테이크다운이다. |
| Rear Low Kick (`muay-thai__rear-low-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 리어 로우킥은 MMA 기본 로우킥이다. |
| Rear Naked Choke (`bjj__rear-naked-choke`) | 삼보 (목/조르기 계열 --- 컴뱃 삼보 한정), MMA (서브미션 (Submission)) | 묶음 기록 분리 (`sambo__rear-naked-choke-guillotine-front-headlock-choke-arm-triangle-collar-choke-계열`); MMA A: MMA "Back Mount Hooks Control"·"Scramble to Back Take" 관련 기술 bjj__rear-naked-choke, 공유 라이브러리 MMA "Double Leg to Rear Naked Choke" |
| Rear Overhand (`boxing__rear-overhand`) | MMA (MMA 복싱) | 전수 감사 A: 리어 오버핸드는 MMA Overhand 기록이 직접 설명하는 기술이다. |
| Rear Round Kick (`muay-thai__rear-round-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 리어 라운드킥은 MMA의 기본 킥이다. |
| Rear Teep (`muay-thai__rear-teep`) | MMA (MMA 킥복싱) | 전수 감사 B: 리어 티프는 MMA 거리 견제로 쓰인다. |
| Rear Uppercut (`kickboxing__rear-uppercut`) | 무에타이 (중거리 펀치), MMA (MMA 복싱) | 묶음 기록 분리 (`muay-thai__lead-uppercut-rear-uppercut`); MMA B: MMA "Dirty Boxing" 설명 "짧은 훅과 어퍼컷" — 어퍼컷(리드/리어 미구분) |
| Recover Butterfly Guard (`bjj__recover-butterfly-guard`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| Recover Full Guard (`bjj__recover-full-guard`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| Roll (`kickboxing__roll`) | 무에타이 (펀치 방어), MMA (방어 (Defense)) | 묶음 기록 분리 (`muay-thai__parry-catch-slip-pull-back-step-back-roll-cover`); 전수 감사 B: 롤(위빙)은 MMA 펀치 회피로 쓰인다(기록의 그랜비롤과는 다름). |
| Roll → Hook (`boxing__roll-hook`) | MMA (방어 (Defense)) | 전수 감사 B: 롤(위빙) 후 훅 카운터는 MMA에서 쓰인다. |
| Roll → Uppercut (`boxing__roll-uppercut`) | MMA (방어 (Defense)) | 전수 감사 B: 롤 후 어퍼컷 카운터는 MMA에서 쓰인다. |
| Round Kick (`kickboxing__round-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 라운드킥은 MMA의 기본 킥이다. |
| Running the Pipe (`bjj__running-the-pipe`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: MMA에서 흔히 쓰이는 노기 레슬링 테이크다운 진입/마무리 기술이다. |
| Russian Tie (`wrestling__russian-tie`) | 삼보 (그립 파이팅(Захват) --- 재킷·벨트 중심), MMA (클린치 (Clinch)) | 묶음 기록 분리 (`sambo__two-on-one-underhook-overhook-russian-tie`); 전수 감사 B: 러시안 타이는 MMA 케이지 레슬링에서 대표적으로 쓰이는 그립이다. |
| Russian Tie Entry (`wrestling__russian-tie-entry`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 러시안 타이 진입은 MMA 클린치 테이크다운 셋업에 쓰인다. |
| Russian Tie Takedown (`bjj__russian-tie-takedown`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: MMA에서 흔히 쓰이는 노기 레슬링 테이크다운 진입/마무리 기술이다. |
| S-Mount (`bjj__s-mount`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| S-Mount Armbar (`bjj__s-mount-armbar`) | MMA (서브미션 (Submission)) | 전수 감사 B: MMA에서 실제 피니시로 자주 나오는 노기 서브미션이다. |
| Saddle (`bjj__saddle`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 통합룰상 합법(소관절 아님)이며 MMA 레그락 공방에서 실제로 쓰인다. |
| Seatbelt (`bjj__seatbelt`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA에서 흔한 백 테이크/백 컨트롤 기술로 RNC·파운드로 이어진다. |
| Seatbelt Back Take (`bjj__seatbelt-back-take`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA에서 흔한 백 테이크/백 컨트롤 기술로 RNC·파운드로 이어진다. |
| Shell (`muay-thai__shell`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 몸통과 턱을 감싸는 셸 가드는 MMA 스탠딩 방어로 쓰인다. |
| Shin Block (`kickboxing__shin-block`) | 무에타이 (킥 방어), MMA (방어 (Defense)) | 묶음 기록 분리 (`muay-thai__check-shin-block`); 전수 감사 B: 정강이 블록은 MMA 킥 방어로 쓰인다. |
| Short Elbow (`muay-thai__short-elbow`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 짧은 엘보는 MMA 클린치에서 쓰인다. |
| Short Hook (`boxing__short-hook`) | MMA (MMA 복싱) | 전수 감사 A: 숏 훅은 MMA Dirty Boxing 기록이 직접 명시한다(짧은 훅). |
| Short Knee (`kickboxing__short-knee`) | MMA (클린치 (Clinch)) | 전수 감사 B: 클린치 숏 니는 MMA 클린치에서 쓰인다. |
| Short Punch (`karate__short-punch`) | 무에타이 (중거리 펀치) | 전수 감사 A: 무에타이 근거리 흐름에 Short Punch가 명시됨. |
| Short Uppercut (`boxing__short-uppercut`) | MMA (MMA 복싱) | 전수 감사 A: 숏 어퍼컷은 MMA Dirty Boxing 기록이 직접 명시한다(짧은 어퍼컷). |
| Shot Feint to Set-Up (`wrestling__shot-feint-to-set-up`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 태클 페이크로 다른 공격을 여는 셋업은 MMA에서 흔하다. |
| Shoulder Block (`muay-thai__shoulder-block`) | MMA (방어 (Defense)) | 전수 감사 B: 어깨 블록은 MMA 펀치 방어로 쓰인다. |
| Shoulder Control (`boxing__shoulder-control`) | MMA (클린치 (Clinch)) | 전수 감사 B: 어깨 컨트롤은 MMA 클린치·더티복싱의 상체 컨트롤로 쓰인다. |
| Shoulder Feint (`kickboxing__shoulder-feint`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 어깨 페인트는 MMA 타격 셋업에 쓰인다. |
| Shoulder Pressure (`bjj__shoulder-pressure`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Shoulder-to-Mat Escape (`bjj__shoulder-to-mat-escape`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| Shovel Hook (`boxing__shovel-hook`) | MMA (MMA 복싱) | 전수 감사 B: 쇼벨 훅은 MMA 근거리·더티복싱에서 쓰이는 펀치다. |
| Shuffle (`kickboxing__shuffle`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 셔플 스텝은 MMA 거리 조절 풋워크다. |
| Shuto Uke (`karate__shuto-uke`) | 태권도 (막기) | 묶음 기록 분리 (`taekwondo__손날막기-한손날막기`) |
| Side Control (`bjj__side-control`) | MMA (그라운드 컨트롤 (Ground Control)) | MMA B: 공유 라이브러리 MMA 기록 "Arm Triangle Choke"·"Passing the Guard" 설명의 사이드 컨트롤 |
| Side Control → Armbar (`bjj__side-control-armbar`) | MMA (서브미션 (Submission)) | 전수 감사 B: MMA에서 실제 피니시로 자주 나오는 노기 서브미션이다. |
| Side Control Transition (`bjj__side-control-transition`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Side Kick (`kickboxing__side-kick`) | 무에타이 (장거리 킥 (Round Kick / Low Kick 계열)), MMA (MMA 킥복싱) | 묶음 기록 분리 (`muay-thai__axe-kick-side-kick`); 전수 감사 B: 사이드킥은 MMA에서 바디·무릎 견제로 쓰인다. |
| Side Knee (`muay-thai__side-knee`) | MMA (MMA 킥복싱) | 전수 감사 B: 사이드 니는 MMA 클린치에서 쓰인다. |
| Side Step (`boxing__side-step`) | 가라테 (타이사바키 / 회피 (Tai Sabaki)), MMA (방어 (Defense)) | 묶음 기록 분리 (`karate__step-back-side-step-angle-exit-body-shift`); 전수 감사 B: 사이드 스텝은 MMA 거리 조절·각도 만들기에 쓰이는 기본 풋워크다. |
| Side Teep (`muay-thai__side-teep`) | MMA (MMA 킥복싱) | 전수 감사 B: 옆으로 차는 티프는 MMA에서 사이드킥형 견제로 쓰인다. |
| Single Ankle Pick (`wrestling__single-ankle-pick`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 싱글 앵클 픽은 MMA에서 쓰이는 앵클 픽 형태다. |
| Single Leg (`sambo__single-leg`) | BJJ (스탠딩 / 테이크다운), 레슬링 (싱글 레그), MMA (테이크다운 (Takedown)) | 전수 감사 A: BJJ 문서에 싱글 레그 테이크다운 섹션이 존재함.; 전수 감사 A: 레슬링 문서와 해시태그에 Single Leg가 핵심 기술로 등장함.; 전수 감사 A: MMA 라이브러리 레코드가 싱글레그를 직접 명시한다. |
| Single Leg → Top Control, Body Lock → Throw → Control (`sambo__single-leg-top-control-body-lock-throw-control`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 싱글레그·바디락에서 탑 컨트롤로 잇는 체인은 MMA 테이크다운 전환이다. |
| Single Leg Entry (`bjj__single-leg-entry`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: MMA에서 흔히 쓰이는 노기 레슬링 테이크다운 진입/마무리 기술이다. |
| Single Leg Finish (`bjj__single-leg-finish`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: MMA에서 흔히 쓰이는 노기 레슬링 테이크다운 진입/마무리 기술이다. |
| Single Leg X (`bjj__single-leg-x`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Single to Back Take (`wrestling__single-to-back-take`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 싱글에서 백 테이크는 MMA 스크램블에서 흔하다. |
| Single to Double (`wrestling__single-to-double`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 싱글에서 더블 전환은 MMA 체인 레슬링에서 흔하다. |
| Single-Leg Down Defense (`wrestling__single-leg-down-defense`) | MMA (방어 (Defense)) | 전수 감사 B: 싱글레그 방어는 MMA 테이크다운 방어 기본이다. |
| Single-Leg Position (`wrestling__single-leg-position`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 싱글레그 포지션은 MMA 케이지 레슬링에서 흔하다. |
| Sit-Out (`wrestling__sit-out`) | 삼보 (바텀 포지션과 탈출), MMA (그라운드 컨트롤 (Ground Control)) | 묶음 기록 분리 (`sambo__bridge-мост-hip-escape-sit-out-stand-up-granby-turn-in-frame-escape-back-escape`); 전수 감사 B: 등 뒤 컨트롤·터틀 상황에서 빠져나오는 탈출로 MMA 스크램블에서 사용된다. |
| Sit-Up Guard (`bjj__sit-up-guard`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Sit-Up Sweep (`bjj__sit-up-sweep`) | 삼보 (스윕 / 전환), MMA (그라운드 컨트롤 (Ground Control)) | 묶음 기록 분리 (`sambo__guard-sweep-reversal-sit-up-sweep`); 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Slide By (`wrestling__slide-by`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 슬라이드 바이로 등 뒤를 잡는 동작은 MMA 케이지 레슬링에서 쓰인다. |
| Slip (`kickboxing__slip`) | 무에타이 (펀치 방어), MMA (방어 (Defense)) | 묶음 기록 분리 (`muay-thai__parry-catch-slip-pull-back-step-back-roll-cover`); 전수 감사 B: 슬립은 MMA 펀치 방어로 쓰인다. |
| Slip → Cross (`boxing__slip-cross`) | MMA (방어 (Defense)) | 전수 감사 B: 슬립 후 크로스 카운터는 MMA에서 쓰인다. |
| Slip → Hook (`boxing__slip-hook`) | MMA (방어 (Defense)) | 전수 감사 B: 슬립 후 훅 카운터는 MMA에서 쓰인다. |
| Slip Counter (`kickboxing__slip-counter`) | MMA (방어 (Defense)) | 전수 감사 B: 슬립 카운터는 MMA에서 쓰인다. |
| Slip Inside (`boxing__slip-inside`) | MMA (방어 (Defense)) | 전수 감사 B: 안쪽 슬립은 MMA 펀치 방어로 쓰인다. |
| Slip Outside (`boxing__slip-outside`) | MMA (방어 (Defense)) | 전수 감사 B: 바깥 슬립은 MMA 펀치 방어로 쓰인다. |
| Smash Pass (`bjj__smash-pass`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Snap Control (`wrestling__snap-control`) | MMA (클린치 (Clinch)) | 전수 감사 B: 스냅다운 컨트롤은 MMA에서 프론트 헤드락·스프롤 반격에 쓰인다. |
| Snap Down (`wrestling__snap-down`) | 삼보 (테이크다운 진입 (레슬링 계열)), MMA (테이크다운 (Takedown)) | 묶음 기록 분리 (`sambo__knee-tap-body-lock-arm-drag-duck-under-snap-down`); 전수 감사 B: 스냅다운은 MMA에서 프론트 헤드락·길로틴 진입에 자주 쓰인다. |
| Snatch Single (`wrestling__snatch-single`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 스내치 싱글은 MMA에서 반응형 테이크다운으로 쓰인다. |
| Sok Phung (`muay-thai__sok-phung`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 찌르는 직선 엘보는 MMA에서 합법적으로 쓰인다. |
| Southpaw (`kickboxing__southpaw`) | 무에타이 (기본 개념 --- 거리(Range)와 자세), MMA (스트라이킹 (Striking)) | 묶음 기록 분리 (`muay-thai__orthodox-southpaw`); 전수 감사 B: 사우스포 스탠스는 MMA에서 쓰이는 기본 스탠스다. |
| Spin Behind (`wrestling__spin-behind`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 스핀 비하인드(등 돌아가기)는 MMA 스프롤 후 스크램블에서 쓰인다. |
| Spinning Back Kick (`muay-thai__spinning-back-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 스피닝 백킥은 MMA에서 바디 공격으로 쓰인다. |
| Spinning Elbow (`muay-thai__spinning-elbow`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 스피닝 엘보는 MMA에서 실제로 쓰인다(수직 하향 엘보 아님). |
| Sprawl (`wrestling__sprawl`) | MMA (방어 (Defense)) | MMA A: MMA "Sprawl to Strikes"·"Takedown Defense (MMA)" 관련 기술 wrestling__sprawl |
| Sprawl to Back (`wrestling__sprawl-to-back`) | MMA (방어 (Defense)) | 전수 감사 B: 스프롤 후 등 잡기는 MMA 스프롤 반격·스크램블이다. |
| Sprawl to Front Headlock (`wrestling__sprawl-to-front-headlock`) | MMA (방어 (Defense)) | 전수 감사 B: 스프롤 후 프론트 헤드락은 MMA 테이크다운 방어 후 반격의 표준이다. |
| Square Hips (`wrestling__square-hips`) | MMA (방어 (Defense)) | 전수 감사 B: 엉덩이를 정면으로 유지하는 방어는 MMA 테이크다운 방어에 쓰인다. |
| Square Stance (`kickboxing__square-stance`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 스퀘어 스탠스는 테이크다운·로우킥 방어를 위해 MMA에서 쓰인다. |
| Stack Pass (`bjj__stack-pass`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Stand-Up (`wrestling__stand-up`) | 삼보 (바텀 포지션과 탈출), MMA (그라운드 컨트롤 (Ground Control)) | 묶음 기록 분리 (`sambo__bridge-мост-hip-escape-sit-out-stand-up-granby-turn-in-frame-escape-back-escape`); 전수 감사 B: 하위 포지션에서 일어서기는 MMA(특히 케이지 월워크)의 핵심 탈출이다. |
| Stand-Up to Escape (`wrestling__stand-up-to-escape`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 하위에서 일어서 탈출하기는 MMA에서 필수적인 탈출이다. |
| Standard Ashi (`bjj__standard-ashi`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 통합룰상 합법(소관절 아님)이며 MMA 레그락 공방에서 실제로 쓰인다. |
| Standing Guard Break (`bjj__standing-guard-break`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Step Around (`boxing__step-around`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 상대 주변을 도는 스텝은 MMA 각도 만들기에 쓰인다. |
| Step Away (`boxing__step-away`) | MMA (방어 (Defense)) | 전수 감사 B: 물러나 피하는 스텝은 MMA 거리 관리 방어다. |
| Step Back (`boxing__step-back`) | 가라테 (타이사바키 / 회피 (Tai Sabaki)), 무에타이 (펀치 방어), MMA (스트라이킹 (Striking)) | 묶음 기록 분리 (`karate__step-back-side-step-angle-exit-body-shift`); 묶음 기록 분리 (`muay-thai__parry-catch-slip-pull-back-step-back-roll-cover`); 전수 감사 B: 스텝백은 MMA 거리 관리의 기본 풋워크다. |
| Step Back → Cross (`boxing__step-back-cross`) | MMA (MMA 복싱) | 전수 감사 B: 스텝백 크로스 카운터는 MMA에서 쓰인다. |
| Step Forward (`kickboxing__step-forward`) | 무에타이 (풋워크), MMA (스트라이킹 (Striking)) | 전수 감사 A: 무에타이 기본 풋워크에 Step Forward가 포함됨.; 전수 감사 B: 전진 스텝은 MMA 기본 풋워크다. |
| Step Out (`boxing__step-out`) | 가라테 (이동 (Shintai / 풋워크)), MMA (방어 (Defense)) | 묶음 기록 분리 (`karate__step-in-step-out-side-step-retreat-forward-step`); 전수 감사 B: 펀치를 피해 뒤/옆으로 빠지는 기본 회피 풋워크로 MMA 스탠딩에서도 쓰인다. |
| Step-and-Slide (`kickboxing__step-and-slide`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 스텝 앤 슬라이드는 MMA 기본 이동 풋워크다. |
| Step-Up Kick (`muay-thai__step-up-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 스텝업 킥은 MMA에서 쓰인다. |
| Step-Up Knee (`muay-thai__step-up-knee`) | MMA (MMA 킥복싱) | 전수 감사 B: 스텝업 니는 MMA에서 쓰인다. |
| Straight Ankle Lock (`bjj__straight-ankle-lock`) | MMA (서브미션 (Submission)) | 전수 감사 B: 통합룰상 합법(소관절 아님)이며 MMA 레그락 공방에서 실제로 쓰인다. |
| Straight Armbar (`bjj__straight-armbar`) | MMA (서브미션 (Submission)) | 전수 감사 B: MMA에서 실제 피니시로 자주 나오는 노기 서브미션이다. |
| Straight Knee (`kickboxing__straight-knee`) | 가라테 (근거리 (Chika-ma)), 삼보 (컴뱃 삼보 타격 범주), MMA (MMA 킥복싱) | 묶음 기록 분리 (`karate__knee-규칙-허용-시-clinch-근접-컨트롤-규칙-허용-시`); 묶음 기록 분리 (`sambo__knee-elbow`); 전수 감사 B: 스트레이트 니는 MMA 스탠딩·클린치에서 쓰인다. |
| Straight Punches (`boxing__straight-punches`) | MMA (MMA 복싱) | 전수 감사 B: 스트레이트 펀치는 MMA 기본 펀치다. |
| Sumi Gaeshi (`judo__sumi-gaeshi`) | 삼보 (희생 기술 --- 브로속 체레즈 골로부(Бросок через голову)· 체레즈 그루지(Бросок через грудь)) | 묶음 기록 분리 (`sambo__yoko-otoshi-sumi-gaeshi-yoko-guruma류-옆으로-눕는-희생기술-ura-nage류`) |
| Superman Punch (`muay-thai__superman-punch`) | MMA (MMA 복싱) | 전수 감사 B: 슈퍼맨 펀치는 MMA에서 쓰이는 펀치다. |
| Sweep / Foot Sweep (`muay-thai__sweep-foot-sweep`) | MMA (클린치 (Clinch)) | 전수 감사 B: 발 걸어 넘기기는 MMA 클린치 테이크다운으로 쓰인다. |
| Sweep Single (`wrestling__sweep-single`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 스윕 싱글은 MMA 테이크다운으로 사용된다. |
| Switch Kick (`muay-thai__switch-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 스위치킥은 MMA에서 쓰인다. |
| Switch Kick → Cross (`kickboxing__switch-kick-cross`) | MMA (MMA 킥복싱) | 전수 감사 B: 스위치킥-크로스는 MMA 킥-펀치 연결로 쓰인다. |
| Switch Low Kick (`muay-thai__switch-low-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 스위치 로우킥은 MMA에서 쓰인다. |
| Switch Stance (`kickboxing__switch-stance`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 스위치 스탠스는 MMA에서 쓰인다. |
| Switch Step (`kickboxing__switch-step`) | 무에타이 (풋워크), MMA (스트라이킹 (Striking)) | 전수 감사 A: 무에타이 기본 풋워크에 Switch Step이 포함됨.; 전수 감사 B: 스위치 스텝은 MMA 스탠스 전환·킥 셋업에 쓰인다. |
| Tae Chiang (`muay-thai__tae-chiang`) | MMA (MMA 킥복싱) | 전수 감사 B: 다이애거널 라운드킥은 MMA 기본 킥 궤적이다. |
| Tai Sabaki (`judo__tai-sabaki`) | 가라테 (전통 가라테의 응용 (자기방어 / Bunkai)) | 묶음 기록 분리 (`karate__bunkai-분석-해석-kuzushi-무너뜨림-hiki-te-당기는-손-tai-sabaki-osae`) |
| Tate Shiho Escape (`judo__tate-shiho-escape`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 마운트 탈출은 MMA 하위 방어의 핵심이다. |
| Tate Shiho Gatame (`judo__tate-shiho-gatame`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 세로누르기(마운트)는 MMA 핵심 포지션이다. |
| Technical Mount (`bjj__technical-mount`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Technical Mount → Back (`bjj__technical-mount-back`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA에서 흔한 백 테이크/백 컨트롤 기술로 RNC·파운드로 이어진다. |
| Technical Mount Transition (`bjj__technical-mount-transition`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Technical Stand-Up (`bjj__technical-stand-up`) | 삼보 (바텀 포지션과 탈출), MMA (그라운드 컨트롤 (Ground Control)) | 묶음 기록 분리 (`sambo__guard-recovery-technical-stand-up`); 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| Technical Stand-Up Sweep (`bjj__technical-stand-up-sweep`) | 삼보 (스윕 / 전환) | 묶음 기록 분리 (`sambo__hip-bump-sweep-butterfly-sweep-technical-stand-up-sweep`) |
| Teep (`kickboxing__teep`) | MMA (MMA 킥복싱) | 전수 감사 B: 티프는 MMA에서 거리 견제로 쓰인다. |
| Teep → Jab (`kickboxing__teep-jab`) | MMA (MMA 킥복싱) | 전수 감사 B: 티프-잽은 MMA 거리 견제 연결로 쓰인다. |
| Teep Catch (`muay-thai__teep-catch`) | MMA (방어 (Defense)) | 전수 감사 B: 티프 캐치는 MMA에서 테이크다운 기회로 쓰인다. |
| Teep Counter (`muay-thai__teep-counter`) | MMA (MMA 킥복싱) | 전수 감사 B: 전진하는 상대에게 맞추는 카운터 티프는 MMA에서 쓰인다. |
| Teep Stop (`muay-thai__teep-stop`) | MMA (방어 (Defense)) | 전수 감사 B: 티프로 전진·킥을 끊는 방어는 MMA에서 쓰인다. |
| Teep to Leg (`muay-thai__teep-to-leg`) | MMA (MMA 킥복싱) | 전수 감사 B: 앞다리를 노리는 티프는 MMA 오블리크킥과 같은 계열로 쓰인다. |
| Tettsui-uchi (`karate__tettsui-uchi`) | MMA (MMA 복싱) | 전수 감사 B: 망치주먹(해머피스트)은 MMA 그라운드 앤 파운드에서 흔히 쓰임 |
| Thigh Kick (`muay-thai__thigh-kick`) | MMA (MMA 킥복싱) | 전수 감사 B: 허벅지 킥은 MMA 로우킥으로 쓰인다. |
| Throw → Side Control / Mount / Turtle Control (`sambo__throw-side-control-mount-turtle-control`) | MMA (테이크다운 (Takedown)) | 전수 감사 A: MMA 레코드가 마운트·백 컨트롤로의 전환을 직접 명시한다. |
| Torreando Pass (`bjj__torreando-pass`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Triangle → Armbar (`bjj__triangle-armbar`) | MMA (서브미션 (Submission)) | 전수 감사 B: MMA에서 실제 피니시로 자주 나오는 노기 서브미션이다. |
| Triangle Choke (`bjj__triangle-choke`) | MMA (서브미션 (Submission)) | MMA A: MMA "Ground and Pound to Submission Transition" 설명 "암바나 트라이앵글"·관련 기술 bjj__triangle |
| Tud (`muay-thai__tud`) | MMA (클린치 (Clinch)) | 전수 감사 B: 클린치 덤프/던지기는 MMA 클린치 테이크다운으로 쓰인다. |
| Turn (`muay-thai__turn`) | MMA (클린치 (Clinch)) | 전수 감사 B: 목/팔 컨트롤로 상대를 돌리는 턴은 MMA 클린치에서 쓰인다. |
| Turn-In (`judo__turn-in`) | 삼보 (바텀 포지션과 탈출), 레슬링 (탈출 (Escape)) | 묶음 기록 분리 (`sambo__bridge-мост-hip-escape-sit-out-stand-up-granby-turn-in-frame-escape-back-escape`); 전수 감사 A: 레슬링 탈출 목록에 Turn-In이 포함됨. |
| Turn-In Escape (`bjj__turn-in-escape`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| Turtle (`bjj__turtle`) | 삼보 (바텀 포지션과 탈출), MMA (그라운드 컨트롤 (Ground Control)) | 묶음 기록 분리 (`sambo__guard-클로즈드-오픈-half-guard-turtle-defensive-shell`); 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| Turtle → Back (`bjj__turtle-back`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA에서 흔한 백 테이크/백 컨트롤 기술로 RNC·파운드로 이어진다. |
| Turtle → Crucifix (`bjj__turtle-crucifix`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 상위 포지션 컨트롤·패스로 파운드와 서브미션 연결에 흔히 쓰인다. |
| Turtle Back Take (`bjj__turtle-back-take`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA에서 흔한 백 테이크/백 컨트롤 기술로 RNC·파운드로 이어진다. |
| Two-on-One (`judo__two-on-one`) | 삼보 (그립 파이팅(Захват) --- 재킷·벨트 중심), MMA (클린치 (Clinch)) | 묶음 기록 분리 (`sambo__two-on-one-underhook-overhook-russian-tie`); 전수 감사 B: 투온원 팔 제어는 MMA 클린치·케이지 레슬링의 핵심 그립이다. |
| Uchi Mata (`judo__uchi-mata`) | MMA (테이크다운 (Takedown)) | 전수 감사 A: MMA 라이브러리 레코드(Uchi Mata to Armbar)가 직접 명시하는 노기 클린치 던지기다. |
| Ude Garami (`judo__ude-garami`) | MMA (서브미션 (Submission)) | 전수 감사 B: 팔 감아 꺾기(키무라/아메리카나)는 MMA 서브미션이다. |
| Underhook (`bjj__underhook`) | 유도 (잡기 / 그립 --- Kumi Kata), 무에타이 (클린치 (Clinch)), 삼보 (그립 파이팅(Захват) --- 재킷·벨트 중심), MMA (클린치 (Clinch)) | 묶음 기록 분리 (`judo__overhook-underhook`); 묶음 기록 분리 (`muay-thai__overhook-underhook`); 묶음 기록 분리 (`sambo__two-on-one-underhook-overhook-russian-tie`); MMA A: MMA "Clinch Takedown Entry" 설명 "언더훅/오버훅 등 클린치 그립", "Takedown Defense (MMA)" 관련 기술 wrestling__underhook |
| Underhook Entry (`wrestling__underhook-entry`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 언더훅 진입은 S1 클린치 테이크다운 진입 그 자체다. |
| Underhook Escape (`bjj__underhook-escape`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| Underhook Half Guard (`bjj__underhook-half-guard`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Underhook Sweep (`bjj__underhook-sweep`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Uppercut (`boxing__uppercut`) | 삼보 (컴뱃 삼보 타격 범주), MMA (MMA 복싱) | 묶음 기록 분리 (`sambo__jab-cross-hook-uppercut`); 전수 감사 B: 어퍼컷은 MMA 복싱·더티복싱에서 쓰이는 기본 펀치다. |
| Upward Elbow (`kickboxing__upward-elbow`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 올려치는 엘보는 MMA 클린치에서 합법적으로 쓰인다. |
| Ura Nage (`judo__ura-nage`) | 삼보 (희생 기술 --- 브로속 체레즈 골로부(Бросок через голову)· 체레즈 그루지(Бросок через грудь)), MMA (테이크다운 (Takedown)) | 묶음 기록 분리 (`sambo__yoko-otoshi-sumi-gaeshi-yoko-guruma류-옆으로-눕는-희생기술-ura-nage류`); 전수 감사 B: 바디락 기반의 뒤로 던지기로 노기 MMA 클린치에서 사용된다. |
| Whizzer (`wrestling__whizzer`) | MMA (방어 (Defense)) | 전수 감사 A: 휘저(오버훅) 방어는 MMA 테이크다운 방어 기록에서 언급된다. |
| Wrestle-Up (`bjj__wrestle-up`) | 삼보 (스윕 / 전환), MMA (그라운드 컨트롤 (Ground Control)) | 묶음 기록 분리 (`sambo__single-leg-from-guard-wrestle-up`); 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| Wrestling Stance (`wrestling__wrestling-stance`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 그래플러가 클린치·테이크다운 공방에서 쓰는 기본 레슬링 자세다. |
| Wrist Control (`boxing__wrist-control`) | 무에타이 (클린치 (Clinch)), MMA (클린치 (Clinch)) | 묶음 기록 분리 (`muay-thai__biceps-control-wrist-control`); 전수 감사 B: 손목 컨트롤은 MMA 클린치·핸드파이팅에서 핵심적으로 쓰인다. |
| Wrist Control (`bjj__wrist-control`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| Wrist Control (`wrestling__wrist-control`) | MMA (클린치 (Clinch)) | 전수 감사 B: 손목 컨트롤(투온원 등)은 MMA 케이지 레슬링에서 자주 쓰인다. |
| Wrist Grip / Кисть 제어 (`sambo__wrist-grip-кисть-제어`) | MMA (클린치 (Clinch)) | 전수 감사 B: 손목 제어는 MMA 클린치·핸드파이팅에서 노기로 쓰인다. |
| Wrist Peel (`wrestling__wrist-peel`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 손목을 떼어 그립을 푸는 동작은 MMA 바디락·백 방어에서 쓰인다. |
| Yoko Guruma (`judo__yoko-guruma`) | 삼보 (희생 기술 --- 브로속 체레즈 골로부(Бросок через голову)· 체레즈 그루지(Бросок через грудь)) | 묶음 기록 분리 (`sambo__yoko-otoshi-sumi-gaeshi-yoko-guruma류-옆으로-눕는-희생기술-ura-nage류`) |
| Yoko Otoshi (`judo__yoko-otoshi`) | 삼보 (희생 기술 --- 브로속 체레즈 골로부(Бросок через голову)· 체레즈 그루지(Бросок через грудь)) | 묶음 기록 분리 (`sambo__yoko-otoshi-sumi-gaeshi-yoko-guruma류-옆으로-눕는-희생기술-ura-nage류`) |
| Yoko Shiho Escape (`judo__yoko-shiho-escape`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 사이드 컨트롤 탈출은 MMA 하위 방어의 핵심이다. |
| Yoko Shiho Gatame (`judo__yoko-shiho-gatame`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 가로누르기(사이드 컨트롤)는 MMA 핵심 탑 포지션이다. |
| Z Guard (`bjj__z-guard`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 도복 그립 없이 MMA 하위 포지션에서 실제로 쓰이는 가드/스윕/컨트롤이다. |
| боковая подсечка (`sambo__боковая-подсечка`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 옆 발쓸기(데아시바라이 계열)는 노기 MMA 스탠딩에서 사용된다. |
| Бросок через бедро (`sambo__бросок-через-бедро`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 기본 허리 던지기(오고시 계열)는 노기 MMA 클린치에서 쓰인다. |
| Забегание за спину (`sambo__забегание-за-спину`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 등 뒤로 돌아가는 백테이크는 MMA 스크램블 기술이다. |
| Зацеп (`sambo__зацеп`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 다리를 걸어 넘기는 트립은 MMA 클린치 테이크다운의 핵심이다. |
| Мельница (`sambo__мельница`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 멜니차(파이어맨즈 캐리)는 MMA 테이크다운으로 쓰인다. |
| Отхват (`sambo__отхват`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 오소토가리 계열 다리 걷기는 노기 MMA 클린치에서 쓰인다. |
| Перевод в партер(파르테르로 전환시키기) (`sambo__перевод-в-партер-파르테르로-전환시키기`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 던진 뒤 즉시 통제로 넘어가는 동작은 MMA 레코드의 테이크다운-후속 전환과 같은 유형이다. |
| рычаг бедра (`sambo__рычаг-бедра`) | MMA (서브미션 (Submission)) | 전수 감사 B: 허벅지 레버(니바)는 MMA 레그락으로 쓰인다. |
| рычаг локтя (`sambo__рычаг-локтя`) | MMA (서브미션 (Submission)) | 전수 감사 B: 팔꿈치 레버(암바)는 MMA 서브미션이다. |
| рычаг стопы (`sambo__рычаг-стопы`) | MMA (서브미션 (Submission)) | 전수 감사 B: 스트레이트 앵클락은 MMA 레그락 서브미션이다. |
| с захватом шеи (`sambo__с-захватом-шеи`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: 목을 감아 던지는 허리 던지기(코시구루마 계열)는 MMA 클린치에서 쓰인다. |
| Удержание верхом (`sambo__удержание-верхом`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 마운트형 홀드다운은 MMA 핵심 포지션이다. |
| Удержание поперек (`sambo__удержание-поперек`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 가로 홀드다운(사이드 컨트롤)은 MMA 탑 포지션이다. |
| Удержание сбоку (`sambo__удержание-сбоку`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 옆 홀드다운(케사가타메 계열)은 MMA 탑 컨트롤로 쓰인다. |
| Удержание со стороны головы (`sambo__удержание-со-стороны-головы`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 머리 쪽 홀드다운(노스-사우스)은 MMA 탑 컨트롤로 쓰인다. |
| узел плеча (`sambo__узел-плеча`) | MMA (서브미션 (Submission)) | 전수 감사 B: 어깨 노트(키무라)는 MMA 서브미션이다. |
| узел плеча поперек (`sambo__узел-плеча-поперек`) | MMA (서브미션 (Submission)) | 전수 감사 B: 가로 어깨 노트(아메리카나)는 MMA 탑 포지션 서브미션으로 쓰인다. |
| узел стопы (`sambo__узел-стопы`) | MMA (서브미션 (Submission)) | 전수 감사 B: 힐훅·토홀드 등 비틀림형 발 락은 삼보에선 금지지만 MMA에서는 합법이며 사용된다. |
| 가드 회복 (`bjj__가드-회복`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| 거리 확보 (`bjj__거리-확보`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 파운드와 압박을 막고 공간을 만드는 프레임으로 MMA에서 핵심적이다. |
| 나란히서기 (`taekwondo__나란히서기`) | 가라테 (기본 자세 (Kihon Dachi)) | 묶음 기록 분리 (`karate__musubi-dachi-heiko-dachi`) |
| 뒤후려차기 (`taekwondo__뒤후려차기`) | 가라테 (발차기 (Geri)) | 묶음 기록 분리 (`karate__ushiro-mawashi-geri-ura-mawashi-geri`) |
| 뒷발 돌려차기 (`taekwondo__뒷발-돌려차기`) | MMA (MMA 킥복싱) | 전수 감사 B: 뒷발 돌려차기는 MMA 킥으로 흔히 쓰임 |
| 뒷발 밀어차기 (`taekwondo__뒷발-밀어차기`) | MMA (MMA 킥복싱) | 전수 감사 B: 뒷발 밀어차기(리어 티프)는 MMA 견제 킥 |
| 리드 핸드 컨트롤 (`boxing__리드-핸드-컨트롤`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 상대 리드손을 누르거나 걷어내는 리드핸드 컨트롤은 MMA 핸드파이팅으로 쓰인다. |
| 마운트 탈출 (`bjj__마운트-탈출`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| 목 프레임 (`bjj__목-프레임`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 파운드와 압박을 막고 공간을 만드는 프레임으로 MMA에서 핵심적이다. |
| 무릎 프레임 (`bjj__무릎-프레임`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 파운드와 압박을 막고 공간을 만드는 프레임으로 MMA에서 핵심적이다. |
| 밀어차기 (`taekwondo__밀어차기`) | MMA (MMA 킥복싱) | 전수 감사 B: 밀어차기(티프)는 MMA에서 거리 유지에 쓰임 |
| 사이드 컨트롤 탈출 (`bjj__사이드-컨트롤-탈출`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| 손목 그립 (`bjj__손목-그립`) | MMA (테이크다운 (Takedown)) | 전수 감사 B: MMA에서 흔히 쓰이는 노기 레슬링 테이크다운 진입/마무리 기술이다. |
| 스크램블 시작 (`bjj__스크램블-시작`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| 스탠딩 복귀 (`bjj__스탠딩-복귀`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| 앞발 돌려차기 (`taekwondo__앞발-돌려차기`) | MMA (MMA 킥복싱) | 전수 감사 B: 앞발 돌려차기는 MMA 킥으로 쓰임 |
| 앞발 밀어차기 (`taekwondo__앞발-밀어차기`) | MMA (MMA 킥복싱) | 전수 감사 B: 앞발 밀어차기(리드 티프)는 MMA 견제 킥 |
| 어깨 프레임 (`bjj__어깨-프레임`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 파운드와 압박을 막고 공간을 만드는 프레임으로 MMA에서 핵심적이다. |
| 엉덩이 프레임 (`bjj__엉덩이-프레임`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: 파운드와 압박을 막고 공간을 만드는 프레임으로 MMA에서 핵심적이다. |
| 잡힌 다리를 빠르게 접어 빼기 (`muay-thai__잡힌-다리를-빠르게-접어-빼기`) | MMA (MMA 킥복싱) | 전수 감사 B: 잡힌 다리 회수는 킥 캐치·테이크다운이 잦은 MMA에서 쓰인다. |
| 크로스 스텝 (`boxing__크로스-스텝`) | MMA (스트라이킹 (Striking)) | 전수 감사 B: 상대 리드발 바깥을 점하는 스텝은 오소독스-사우스포 대결에서 MMA에서도 쓰인다. |
| 팔굽치기 (`taekwondo__팔굽치기`) | 가라테 (팔꿈치 (Empi / Hiji)), 삼보 (컴뱃 삼보 타격 범주), MMA (스트라이킹 (Striking)) | 묶음 기록 분리 (`karate__empi-hiji-yoko-empi-age-empi-ushiro-empi-mawashi-empi-otoshi-empi`); 묶음 기록 분리 (`sambo__knee-elbow`); 전수 감사 B: 팔꿈치 치기는 MMA 클린치·그라운드에서 쓰임(내려팔굽치기는 반칙 가능) |
| 포지션 회복 (`bjj__포지션-회복`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| 하프 가드 회복 (`bjj__하프-가드-회복`) | MMA (그라운드 컨트롤 (Ground Control)) | 전수 감사 B: MMA 하위 포지션에서 탈출·일어나기에 실제로 쓰이는 노기 기술이다. |
| 후려차기 (`taekwondo__후려차기`) | 가라테 (발차기 (Geri)) | 묶음 기록 분리 (`karate__ushiro-mawashi-geri-ura-mawashi-geri`) |

### 다른 이름의 같은 기술 — 병합 (이번 감사에서 추가된 그룹·멤버)

| canonical | 합쳐진 기록 | 근거 |
|---|---|---|
| Anaconda Choke (`bjj__anaconda-choke`) | BJJ Anaconda Choke · BJJ Anaconda | 같은 아나콘다 초크 (BJJ 안에서 중복) |
| Armbar (`bjj__armbar`) | BJJ Armbar · 유도 Juji Gatame · 유도 Ude Hishigi Juji Gatame | 주지가타메(우데히시기 주지가타메는 정식 명칭) = 암바 — 같은 십자 꺾기 |
| Bridge and Roll (`bjj__bridge-and-roll`) | BJJ Bridge and Roll · BJJ Bridge and Roll / Umpa | 같은 브리지 앤 롤(움파) 탈출 (BJJ 안에서 중복) |
| D'Arce Choke (`bjj__d-arce-choke`) | BJJ D'Arce Choke · BJJ D'Arce | 같은 다스 초크 (BJJ 안에서 중복) |
| Ezekiel Choke (`bjj__ezekiel-choke`) | BJJ Ezekiel Choke · BJJ Ezekiel | 같은 에제키엘 초크 (BJJ 안에서 중복) |
| Hip Escape (`bjj__hip-escape`) | BJJ Hip Escape · 유도 Hip Escape · 유도 Shrimp | 여러 무술에 같은 이름·같은 동작으로 수록 |
| Kneebar (`bjj__kneebar`) | BJJ Kneebar · 삼보 рычаг колена | 삼보 무릎 레버(рычаг колена) = 니바 (데이터 설명) |
| Overhook (`bjj__overhook`) | BJJ Overhook · 킥복싱 Overhook · 레슬링 Overhook / Whizzer · BJJ 오버훅 | 여러 무술에 같은 이름·같은 동작으로 수록 |
| Pant Grip (`bjj__pant-grip`) | BJJ Pant Grip · BJJ 팬츠 그립 | 같은 팬츠 그립 (BJJ 안에서 영문/한글로 중복) |
| Rear Naked Choke (`bjj__rear-naked-choke`) | BJJ Rear Naked Choke · 유도 Hadaka Jime | 하다카지메(맨손 조르기) = 리어 네이키드 초크 |
| Straight Ankle Lock (`bjj__straight-ankle-lock`) | BJJ Straight Ankle Lock · 삼보 ущемление ахиллова сухожилия | 삼보 아킬레스건 압박 = 스트레이트 앵클 락(아킬레스 락) — 데이터 설명 |
| Triangle Choke (`bjj__triangle-choke`) | BJJ Triangle Choke · BJJ Triangle · 유도 Sankaku Jime | 같은 트라이앵글 초크 (BJJ 클로즈드 가드·트라이앵글 계열에 중복 수록, 유도 산카쿠지메) |
| Underhook (`bjj__underhook`) | BJJ Underhook · 킥복싱 Underhook · 레슬링 Underhook · BJJ 언더훅 | 여러 무술에 같은 이름·같은 동작으로 수록 |
| Backfist (`boxing__backfist`) | 복싱 Backfist · 킥복싱 Backfist · 무에타이 Backfist · 가라테 Uraken-uchi · 태권도 등주먹 | 여러 무술에 같은 이름·같은 동작으로 수록 |
| Lapel Grip (`judo__lapel-grip`) | 유도 Lapel Grip · BJJ 칼라 그립 · 삼보 Collar/Lapel Grip / Ворот | 같은 도복 깃(칼라/라펠) 그립 |
| Sleeve Grip (`judo__sleeve-grip`) | 유도 Sleeve Grip · BJJ 슬리브 그립 · 삼보 Sleeve Grip / Захват за рукав | 같은 도복 소매 그립 (삼보는 러시아어 병기) |
| Two-on-One (`judo__two-on-one`) | BJJ Two-on-One · 유도 Two-on-One · 레슬링 Two-on-One · BJJ 2-on-1 | 여러 무술에 같은 이름·같은 동작으로 수록 |
| Ude Garami (`judo__ude-garami`) | 유도 Ude Garami · 유도 Ude Hishigi Ude Garami | 우데히시기 우데가라미는 우데가라미의 정식 명칭 |
| Age Uke (`karate__age-uke`) | 가라테 Age Uke · 태권도 얼굴막기 | 아게우케(상단막기) = 얼굴막기(올려막기) |
| Gedan Barai (`karate__gedan-barai`) | 가라테 Gedan Barai · 태권도 아래막기 | 게단바라이(하단막기) = 아래막기 |
| Haito-uchi (`karate__haito-uchi`) | 가라테 Haito-uchi · 태권도 손날등치기 | 하이토우치(반대손날) = 손날등치기 |
| Kiba-dachi (`karate__kiba-dachi`) | 가라테 Kiba-dachi · 태권도 주춤서기 | 기바다치(기마립) = 주춤서기 |
| Kokutsu-dachi (`karate__kokutsu-dachi`) | 가라테 Kokutsu-dachi · 태권도 뒷굽이 | 고쿠쓰다치(후굴립) = 뒷굽이 |
| Neko-ashi-dachi (`karate__neko-ashi-dachi`) | 가라테 Neko-ashi-dachi · 태권도 범서기 | 네코아시다치(묘족립) = 범서기 — 체중을 뒤에 두고 앞발을 띄우는 자세 |
| Shuto-uchi (`karate__shuto-uchi`) | 가라테 Shuto-uchi · 태권도 손날치기 | 슈토우치 = 손날치기 |
| Tettsui-uchi (`karate__tettsui-uchi`) | 가라테 Tettsui-uchi · 태권도 망치주먹 | 데쓰이우치 = 망치주먹(메주먹) |
| Zenkutsu-dachi (`karate__zenkutsu-dachi`) | 가라테 Zenkutsu-dachi · 태권도 앞굽이 | 젠쿠쓰다치(전굴립) = 앞굽이 |
| Axe Kick (`kickboxing__axe-kick`) | 킥복싱 Axe Kick · 가라테 Kakato Geri · 태권도 내려차기 | 가카토게리(뒤꿈치차기/도끼차기) = 내려차기 = 액스 킥 |
| Back Kick (`kickboxing__back-kick`) | 킥복싱 Back Kick · 가라테 Ushiro Geri · 태권도 뒤차기 | 우시로게리 = 뒤차기 = 백 킥 (회전 없이 뒤로 뻗는 차기) |
| Catch (`kickboxing__catch`) | 킥복싱 Catch · 킥복싱 킥 캐치 | 같은 킥 캐치 (방어 목록과 그래플링 규정 절에 중복 수록) |
| Crescent Kick (`kickboxing__crescent-kick`) | 킥복싱 Crescent Kick · 가라테 Mikazuki Geri · 태권도 반달차기 | 미카즈키게리(데이터 한국어명 "반달차기") = 반달차기 = 크레센트 킥 — 막기를 걷어내는 곡선 차기 |
| Cross (`kickboxing__cross`) | 복싱 Cross · 킥복싱 Cross · 복싱 Cross / Straight Right | 여러 무술에 같은 이름·같은 동작으로 수록 |
| Downward Elbow (`kickboxing__downward-elbow`) | 킥복싱 Downward Elbow · 무에타이 Sok Sap | Sok Sap = 다운워드 엘보 |
| Flying Knee (`kickboxing__flying-knee`) | 킥복싱 Flying Knee · 무에타이 Khao Loi | Khao Loi(เข่าลอย) = 플라잉 니 |
| Front Kick (`kickboxing__front-kick`) | 킥복싱 Front Kick · 가라테 Mae Geri · 태권도 앞차기 | 마에게리 = 앞차기 = 프론트 킥 (가라테 데이터의 한국어명 "앞차기") |
| Horizontal Elbow (`kickboxing__horizontal-elbow`) | 킥복싱 Horizontal Elbow · 무에타이 Sok Tad | Sok Tad = 수평 엘보 (데이터 설명 "Horizontal Elbow와 동일 계열") |
| Jab (`kickboxing__jab`) | 복싱 Jab · 킥복싱 Jab · 가라테 Kizami-zuki | 여러 무술에 같은 이름·같은 동작으로 수록 |
| Jumping Knee (`kickboxing__jumping-knee`) | 킥복싱 Jumping Knee · 무에타이 Khao Kradod | Khao Kradod(เข่ากระโดด) = 점핑 니 |
| Pull (`kickboxing__pull`) | 복싱 Pull · 킥복싱 Pull · 복싱 Pull Back | 여러 무술에 같은 이름·같은 동작으로 수록 |
| Roll (`kickboxing__roll`) | 복싱 Roll · 킥복싱 Roll · 복싱 Roll / Bob and Weave | 여러 무술에 같은 이름·같은 동작으로 수록 |
| Round Kick (`kickboxing__round-kick`) | 킥복싱 Round Kick · 가라테 Mawashi Geri · 태권도 돌려차기 | 마와시게리 = 돌려차기 = 라운드 킥 |
| Side Kick (`kickboxing__side-kick`) | 킥복싱 Side Kick · 가라테 Yoko Geri · 태권도 옆차기 | 요코게리 = 옆차기 = 사이드 킥 |
| Straight Knee (`kickboxing__straight-knee`) | 킥복싱 Straight Knee · 무에타이 Khao Trong | Khao Trong(เข่าตรง) = 스트레이트 니 (데이터 설명 "정면으로 곧게 찌르는 니") |
| Upward Elbow (`kickboxing__upward-elbow`) | 킥복싱 Upward Elbow · 무에타이 Sok Ngoei | Sok Ngoei = 업워드 엘보 |
| Spinning Elbow (`muay-thai__spinning-elbow`) | 킥복싱 Spinning Elbow · 무에타이 Spinning Elbow · 무에타이 Sok Klab | 여러 무술에 같은 이름·같은 동작으로 수록 |
| Fireman's Carry (`sambo__fireman-s-carry`) | BJJ Fireman's Carry · 삼보 Fireman's Carry · 레슬링 Fireman's Carry · 유도 Kata Guruma | 여러 무술에 같은 이름·같은 동작으로 수록 |
| 벨트 그립 (`sambo__벨트-그립`) | BJJ 벨트 그립 · 삼보 벨트 그립 · 유도 Belt Grip · 삼보 Belt Grip / Пояс 그립 | 여러 무술에 같은 이름·같은 동작으로 수록 |
| Basic Double Leg (`wrestling__basic-double-leg`) | 레슬링 Basic Double Leg · 유도 Morote Gari | 모로테가리(양손 베기) = 더블 레그 테이크다운 |
| Russian Tie (`wrestling__russian-tie`) | BJJ Russian Tie · 레슬링 Russian Tie · BJJ 러시안 타이 | 여러 무술에 같은 이름·같은 동작으로 수록 |

## C. 잘못 묶인 기술 분리

원문이 한 줄에 여러 기술을 적은 것을 파서가 기술 1개로 만든 기록. 이미 있는 기술은 **연결**(그 기술에 이 무술 관계 추가), 없는 기술은 같은 무술·카테고리에 **새 기술**로 만들었다. 원래 기록 id는 삭제하지 않고 남겨(이전 학습 기록 보존) 목록에서만 빼고, 상세 화면에서 분리된 기술로 안내한다.

| 원래 기록 (old id) | 분리 결과 (new id / 연결) | 근거 |
|---|---|---|
| Backstep / Inversion Entry (`bjj__backstep-inversion-entry`) | Backstep Entry → `bjj__backstep-entry` (새 기술)<br>Inversion Entry → `bjj__inversion-entry` (새 기술) | 백스텝 진입과 인버전 진입은 서로 다른 데 라 히바 진입 동작 |
| 전형적 자세/풋워크: Switch Step (`boxing__전형적-자세-풋워크-switch-step`) | Switch Step → `kickboxing__switch-step` (연결) | "전형적 자세/풋워크:" 목록 제목에 붙은 Switch Step — 이미 있는 스위치 스텝 |
| Overhook / Underhook (`judo__overhook-underhook`) | Overhook → `bjj__overhook` (연결)<br>Underhook → `bjj__underhook` (연결) | 오버훅과 언더훅은 서로 다른 그립 |
| 앞 (Mae) / 뒤 (`judo__앞-mae-뒤`) | 앞 (Mae) → `judo__kuzushi-mae` (새 기술)<br>뒤 (Ushiro) → `judo__kuzushi-ushiro` (새 기술) | 앞/뒤는 서로 다른 쿠즈시 방향 |
| 오른쪽 (Migi) / 왼쪽 (`judo__오른쪽-migi-왼쪽`) | 오른쪽 (Migi) → `judo__kuzushi-migi` (새 기술)<br>왼쪽 (Hidari) → `judo__kuzushi-hidari` (새 기술) | 오른쪽/왼쪽은 서로 다른 쿠즈시 방향 |
| 오른앞 (Migi-Mae) / 왼앞 (`judo__오른앞-migi-mae-왼앞`) | 오른앞 (Migi-Mae) → `judo__kuzushi-migi-mae` (새 기술)<br>왼앞 (Hidari-Mae) → `judo__kuzushi-hidari-mae` (새 기술) | 오른앞/왼앞은 서로 다른 쿠즈시 방향 |
| 오른뒤 (Migi-Ushiro) / 왼뒤 (`judo__오른뒤-migi-ushiro-왼뒤`) | 오른뒤 (Migi-Ushiro) → `judo__kuzushi-migi-ushiro` (새 기술)<br>왼뒤 (Hidari-Ushiro) → `judo__kuzushi-hidari-ushiro` (새 기술) | 오른뒤/왼뒤는 서로 다른 쿠즈시 방향 |
| Bunkai (분석/해석), Kuzushi (무너뜨림), Hiki-te (당기는 손), Tai Sabaki, Osae (`karate__bunkai-분석-해석-kuzushi-무너뜨림-hiki-te-당기는-손-tai-sabaki-osae`) | Bunkai → `karate__bunkai` (새 기술)<br>Kuzushi → `karate__kuzushi` (새 기술)<br>Hiki-te → `karate__hiki-te` (새 기술)<br>Tai Sabaki → `judo__tai-sabaki` (연결)<br>Osae → `karate__osae` (새 기술) | 응용 개념 5개를 한 줄로 수록 |
| Counter Punch / Counter Kick (`karate__counter-punch-counter-kick`) | Counter Punch → `karate__counter-punch` (새 기술)<br>Counter Kick → `karate__counter-kick` (새 기술) | 손 카운터와 발 카운터는 다른 기술 |
| Empi/Hiji, Yoko Empi, Age Empi, Ushiro Empi, Mawashi Empi, Otoshi Empi (`karate__empi-hiji-yoko-empi-age-empi-ushiro-empi-mawashi-empi-otoshi-empi`) | Empi (Hiji) → `taekwondo__팔굽치기` (연결)<br>Yoko Empi → `karate__yoko-empi` (새 기술)<br>Age Empi → `karate__age-empi` (새 기술)<br>Ushiro Empi → `karate__ushiro-empi` (새 기술)<br>Mawashi Empi → `karate__mawashi-empi` (새 기술)<br>Otoshi Empi → `karate__otoshi-empi` (새 기술) | 방향이 다른 팔꿈치 치기 6개를 한 줄로 수록 |
| Feint(페인트), Angle Step (`karate__feint-페인트-angle-step`) | Feint → `karate__feint` (새 기술)<br>Angle Step → `kickboxing__angle-step` (연결) | 페인트와 앵글 스텝은 다른 기술 |
| Fudo-dachi (부동립) / Kumite 자유 자세 (`karate__fudo-dachi-부동립-kumite-자유-자세`) | Fudo-dachi → `karate__fudo-dachi` (새 기술)<br>Kumite-dachi → `karate__kumite-dachi` (새 기술) | 부동립과 쿠미테 자유 자세는 다른 자세 (설명이 어느 쪽인지 불분명해 옮기지 않음) |
| Kizami-zuki Counter, Gyaku-zuki Counter (`karate__kizami-zuki-counter-gyaku-zuki-counter`) | Kizami-zuki Counter → `karate__kizami-zuki-counter` (새 기술)<br>Gyaku-zuki Counter → `karate__gyaku-zuki-counter` (새 기술) | 서로 다른 손기술 카운터 2개 |
| Kizami-zuki, Gyaku-zuki, Oi-zuki (`karate__kizami-zuki-gyaku-zuki-oi-zuki`) | Kizami-zuki → `kickboxing__jab` (연결)<br>Gyaku-zuki → `karate__gyaku-zuki` (연결)<br>Oi-zuki → `karate__oi-zuki` (연결) | 이미 있는 지르기 3개의 목록 |
| Knee(규칙 허용 시), Clinch/근접 컨트롤(규칙 허용 시) (`karate__knee-규칙-허용-시-clinch-근접-컨트롤-규칙-허용-시`) | Knee → `kickboxing__straight-knee` (연결)<br>Clinch (근접 컨트롤) → `karate__clinch` (새 기술) | 무릎 타격(=니킥)과 근접 컨트롤은 다른 기술 |
| Long Guard / Distance Control (`karate__long-guard-distance-control`) | Long Guard → `boxing__long-guard` (연결)<br>Distance Control → `karate__distance-control` (새 기술) | 롱 가드(자세)와 거리 조절(전술)은 다른 항목 |
| Mae Geri Counter, Mawashi Geri Counter (`karate__mae-geri-counter-mawashi-geri-counter`) | Mae Geri Counter → `karate__mae-geri-counter` (새 기술)<br>Mawashi Geri Counter → `karate__mawashi-geri-counter` (새 기술) | 서로 다른 발차기 카운터 2개 |
| Mae Geri, Yoko Geri, Ushiro Geri, Mawashi Geri (`karate__mae-geri-yoko-geri-ushiro-geri-mawashi-geri`) | Mae Geri → `kickboxing__front-kick` (연결)<br>Yoko Geri → `kickboxing__side-kick` (연결)<br>Ushiro Geri → `kickboxing__back-kick` (연결)<br>Mawashi Geri → `kickboxing__round-kick` (연결) | 이미 있는 발차기 4개의 목록 |
| Mawashi Geri, Mae Geri, Yoko Geri (`karate__mawashi-geri-mae-geri-yoko-geri`) | Mawashi Geri → `kickboxing__round-kick` (연결)<br>Mae Geri → `kickboxing__front-kick` (연결)<br>Yoko Geri → `kickboxing__side-kick` (연결) | 이미 있는 발차기 3개의 목록 |
| Musubi-dachi / Heiko-dachi (`karate__musubi-dachi-heiko-dachi`) | Musubi-dachi → `karate__musubi-dachi` (새 기술)<br>Heiko-dachi → `taekwondo__나란히서기` (연결) | 무스비다치(발뒤꿈치 모음)와 헤이코다치(평행)는 다른 자세 — 두 영상 모두 무스비다치 |
| Nidan Geri / Tobi Geri (`karate__nidan-geri-tobi-geri`) | Nidan Geri → `karate__nidan-geri` (새 기술)<br>Tobi Geri → `karate__tobi-geri` (새 기술) | 이단차기와 뛰어차기는 다른 발차기 |
| Nukite / Ippon-ken / Nihon-nukite (`karate__nukite-ippon-ken-nihon-nukite`) | Nukite → `karate__nukite` (새 기술)<br>Ippon-ken → `karate__ippon-ken` (새 기술)<br>Nihon-nukite → `karate__nihon-nukite` (새 기술) | 손끝 찌르기·외주먹·두 손가락 찌르기는 다른 기술 |
| O Soto Gari, De Ashi Barai 등 (`karate__o-soto-gari-de-ashi-barai-등`) | O Soto Gari → `judo__osoto-gari` (연결)<br>De Ashi Barai → `judo__de-ashi-barai` (연결) | 가라테 호신술에서 유도 용어 그대로 쓰는 유도 기술들 |
| Short Punch, Kagi-zuki, Uraken, Empi(규칙 허용 시), Teisho (`karate__short-punch-kagi-zuki-uraken-empi-규칙-허용-시-teisho`) | Short Punch → `karate__short-punch` (새 기술)<br>Kagi-zuki → `karate__kagi-zuki` (연결)<br>Uraken → `boxing__backfist` (연결)<br>Empi → `taekwondo__팔굽치기` (연결)<br>Teisho → `karate__teisho` (연결) | 근거리 타격 5개의 목록 |
| Soto Uke / Uchi Uke (`karate__soto-uke-uchi-uke`) | Soto Uke → `karate__soto-uke` (새 기술)<br>Uchi Uke → `karate__uchi-uke` (새 기술) | 바깥막기와 안막기는 방향이 반대인 다른 막기 |
| Step Back / Side Step / Angle Exit / Body Shift (`karate__step-back-side-step-angle-exit-body-shift`) | Step Back → `boxing__step-back` (연결)<br>Side Step → `boxing__side-step` (연결)<br>Angle Exit → `karate__angle-exit` (새 기술)<br>Body Shift → `karate__body-shift` (새 기술) | 회피 이동 4개의 목록 |
| Step In / Step Out / Side Step / Retreat / Forward Step (`karate__step-in-step-out-side-step-retreat-forward-step`) | Step In → `karate__step-in` (새 기술)<br>Step Out → `boxing__step-out` (연결)<br>Side Step → `boxing__side-step` (연결)<br>Retreat → `karate__retreat` (새 기술)<br>Forward Step → `karate__forward-step` (새 기술) | 기본 이동 5개의 목록 |
| Tai Sabaki / Tenkan / Pivot (`karate__tai-sabaki-tenkan-pivot`) | Tai Sabaki → `judo__tai-sabaki` (연결)<br>Tenkan → `karate__tenkan` (새 기술)<br>Pivot → `kickboxing__pivot` (연결) | 타이사바키·텐칸·피벗은 다른 이동 — 두 영상은 타이사바키 |
| Tate-zuki / Age-zuki (`karate__tate-zuki-age-zuki`) | Tate-zuki → `karate__tate-zuki` (새 기술)<br>Age-zuki → `karate__age-zuki` (새 기술) | 세로 주먹과 올려 찌르기는 다른 지르기 |
| Ushiro Mawashi Geri / Ura Mawashi Geri (`karate__ushiro-mawashi-geri-ura-mawashi-geri`) | Ushiro Mawashi Geri → `taekwondo__뒤후려차기` (연결)<br>Ura Mawashi Geri → `taekwondo__후려차기` (연결) | 뒤돌려차기(회전)와 훅킥(회전 없음)은 다른 발차기 |
| Axe Kick / Side Kick (`muay-thai__axe-kick-side-kick`) | Axe Kick → `kickboxing__axe-kick` (연결)<br>Side Kick → `kickboxing__side-kick` (연결) | 액스킥과 사이드킥은 다른 킥 |
| Biceps Control / Wrist Control (`muay-thai__biceps-control-wrist-control`) | Biceps Control → `wrestling__biceps-control` (연결)<br>Wrist Control → `boxing__wrist-control` (연결) | 이두 제어와 손목 제어는 다른 클린치 그립 |
| Body Teep / Hip Teep (`muay-thai__body-teep-hip-teep`) | Body Teep → `muay-thai__body-teep` (새 기술)<br>Hip Teep → `muay-thai__hip-teep` (새 기술) | 타깃(몸통/골반)이 다른 티프 — 영상은 일반 티프 강좌라 어느 쪽인지 정하지 않음 |
| Calf Kick / Thigh Kick (`muay-thai__calf-kick-thigh-kick`) | Calf Kick → `mixed-martial-arts__calf-kick` (연결)<br>Thigh Kick → `muay-thai__thigh-kick` (새 기술) | 타깃(종아리/허벅지)이 다른 로우킥 |
| Catch / Teep Stop (`muay-thai__catch-teep-stop`) | Catch → `kickboxing__catch` (연결)<br>Teep Stop → `muay-thai__teep-stop` (새 기술) | 킥 캐치와 티프 스톱은 다른 방어 |
| Check and Return / Catch and Return (`muay-thai__check-and-return-catch-and-return`) | Check and Return → `kickboxing__check-and-return` (연결)<br>Catch and Return → `muay-thai__catch-and-return` (연결) | 체크 후 반격과 캐치 후 반격은 다른 카운터 |
| Check / Low Kick Check / Body Kick Check (`muay-thai__check-low-kick-check-body-kick-check`) | Check → `kickboxing__check` (연결)<br>Low Kick Check → `kickboxing__check` (연결)<br>Body Kick Check → `muay-thai__body-kick-check` (새 기술) | 로우킥 체크(=체크)와 바디킥 체크는 다른 방어 |
| Check / Shin Block (`muay-thai__check-shin-block`) | Check → `kickboxing__check` (연결)<br>Shin Block → `kickboxing__shin-block` (연결) | 체크와 정강이 블록 — 둘 다 이미 있는 기술 |
| Counter Elbow / Counter Knee (`muay-thai__counter-elbow-counter-knee`) | Counter Elbow → `muay-thai__counter-elbow` (새 기술)<br>Counter Knee → `muay-thai__counter-knee` (새 기술) | 엘보 카운터와 니 카운터는 다른 카운터 |
| Diagonal Elbow / Downward Elbow / Upward Elbow / Spinning Elbow (`muay-thai__diagonal-elbow-downward-elbow-upward-elbow-spinning-elbow`) | Diagonal Elbow → `kickboxing__diagonal-elbow` (연결)<br>Downward Elbow → `kickboxing__downward-elbow` (연결)<br>Upward Elbow → `kickboxing__upward-elbow` (연결)<br>Spinning Elbow → `muay-thai__spinning-elbow` (연결) | 궤적이 다른 엘보 4개 |
| Evade / Lean Back (`muay-thai__evade-lean-back`) | Evade → `muay-thai__evade` (새 기술)<br>Lean Back → `kickboxing__lean-back` (연결) | 회피와 린백은 다른 방어 |
| Guard / Long Guard / High Guard (`muay-thai__guard-long-guard-high-guard`) | Guard → `muay-thai__guard` (새 기술)<br>Long Guard → `boxing__long-guard` (연결)<br>High Guard → `kickboxing__high-guard` (연결) | 기본 가드·롱 가드·하이 가드는 다른 자세 |
| High Guard / Long Guard (`muay-thai__high-guard-long-guard`) | High Guard → `kickboxing__high-guard` (연결)<br>Long Guard → `boxing__long-guard` (연결) | 하이 가드와 롱 가드는 다른 자세 |
| Inside Control / Outside Control (`muay-thai__inside-control-outside-control`) | Inside Control → `kickboxing__inside-control` (연결)<br>Outside Control → `muay-thai__outside-control` (새 기술) | 안쪽 제어와 바깥쪽 제어는 다른 클린치 포지션 |
| Inside Low Kick / Outside Low Kick (`muay-thai__inside-low-kick-outside-low-kick`) | Inside Low Kick → `muay-thai__inside-low-kick` (새 기술)<br>Outside Low Kick → `muay-thai__outside-low-kick` (새 기술) | 안쪽/바깥쪽 다리를 차는 다른 로우킥 |
| Jab Counter / Cross Counter / Hook Counter (`muay-thai__jab-counter-cross-counter-hook-counter`) | Jab Counter → `kickboxing__jab-counter` (연결)<br>Cross Counter → `kickboxing__cross-counter` (연결)<br>Hook Counter → `kickboxing__hook-counter` (연결) | 서로 다른 펀치 카운터 3개 |
| Jab / Cross (`muay-thai__jab-cross`) | Jab → `kickboxing__jab` (연결)<br>Cross → `kickboxing__cross` (연결) | 잽과 크로스는 다른 펀치 (영상은 잽-크로스 연결이라 그대로 둠) |
| Jab--Cross / Jab--Hook / Cross--Hook (`muay-thai__jab-cross-jab-hook-cross-hook`) | Jab → Cross → `muay-thai__jab-to-cross` (새 기술)<br>Jab → Hook → `muay-thai__jab-to-hook` (새 기술)<br>Cross → Hook → `muay-thai__cross-to-hook` (새 기술) | 서로 다른 2연타 3개 |
| Jab--Low Kick / Cross--Low Kick (`muay-thai__jab-low-kick-cross-low-kick`) | Jab → Low Kick → `muay-thai__jab-to-low-kick` (새 기술)<br>Cross → Low Kick → `muay-thai__cross-to-low-kick` (새 기술) | 서로 다른 펀치-로우킥 연결 2개 |
| Kick Catch / Teep Catch (`muay-thai__kick-catch-teep-catch`) | Kick Catch → `kickboxing__catch` (연결)<br>Teep Catch → `muay-thai__teep-catch` (새 기술) | 킥 캐치와 티프 캐치는 다른 방어 |
| Kick Catch to Sweep / Kick Catch to Counter (`muay-thai__kick-catch-to-sweep-kick-catch-to-counter`) | Kick Catch to Sweep → `muay-thai__catch-and-sweep` (연결)<br>Kick Catch to Counter → `muay-thai__kick-catch-to-counter` (새 기술) | 캐치 후 스윕과 캐치 후 타격은 다른 카운터 |
| Lead Hook / Rear Hook (`muay-thai__lead-hook-rear-hook`) | Lead Hook → `kickboxing__lead-hook` (연결)<br>Rear Hook → `kickboxing__rear-hook` (연결) | 리드 훅과 리어 훅은 다른 펀치 |
| Lead Knee / Rear Knee / Side Knee (`muay-thai__lead-knee-rear-knee-side-knee`) | Lead Knee → `kickboxing__lead-knee` (연결)<br>Rear Knee → `kickboxing__rear-knee` (연결)<br>Side Knee → `muay-thai__side-knee` (새 기술) | 리드·리어·사이드 니는 다른 니 |
| Lead Low Kick / Rear Low Kick (`muay-thai__lead-low-kick-rear-low-kick`) | Lead Low Kick → `muay-thai__lead-low-kick` (새 기술)<br>Rear Low Kick → `muay-thai__rear-low-kick` (새 기술) | 리드 로우킥과 리어 로우킥은 다른 킥 |
| Lead Round Kick / Rear Round Kick (`muay-thai__lead-round-kick-rear-round-kick`) | Lead Round Kick → `muay-thai__lead-round-kick` (새 기술)<br>Rear Round Kick → `muay-thai__rear-round-kick` (새 기술) | 리드 라운드킥과 리어 라운드킥은 다른 킥 — 영상은 어느 쪽인지 특정하지 않는 일반 강좌라 그대로 둠 |
| Lead Teep / Rear Teep (`muay-thai__lead-teep-rear-teep`) | Lead Teep → `muay-thai__lead-teep` (새 기술)<br>Rear Teep → `muay-thai__rear-teep` (새 기술) | 리드 티프와 리어 티프는 다른 킥 — 영상 2개 모두 리드·리어 티프를 함께 다룸 |
| Lead Uppercut / Rear Uppercut (`muay-thai__lead-uppercut-rear-uppercut`) | Lead Uppercut → `kickboxing__lead-uppercut` (연결)<br>Rear Uppercut → `kickboxing__rear-uppercut` (연결) | 리드 어퍼컷과 리어 어퍼컷은 다른 펀치 |
| Long Elbow / Short Elbow (`muay-thai__long-elbow-short-elbow`) | Long Elbow → `muay-thai__long-elbow` (새 기술)<br>Short Elbow → `muay-thai__short-elbow` (새 기술) | 거리에 따라 궤적이 다른 엘보 2개 |
| Low Kick after Punch / Low Kick after Teep (`muay-thai__low-kick-after-punch-low-kick-after-teep`) | Low Kick after Punch → `muay-thai__low-kick-after-punch` (새 기술)<br>Low Kick after Teep → `muay-thai__low-kick-after-teep` (새 기술) | 서로 다른 연결 2개 |
| Low Kick / Body Kick / High Kick (`muay-thai__low-kick-body-kick-high-kick`) | Low Kick → `kickboxing__low-kick` (연결)<br>Body Kick → `kickboxing__body-kick` (연결)<br>High Kick → `kickboxing__high-kick` (연결) | 타깃이 다른 킥 3개 — 영상 2개는 로우킥 |
| Low Kick Counter / Teep Counter (`muay-thai__low-kick-counter-teep-counter`) | Low Kick Counter → `muay-thai__low-kick-counter` (새 기술)<br>Teep Counter → `muay-thai__teep-counter` (연결) | 로우킥 카운터와 티프 카운터는 다른 카운터 |
| Orthodox / Southpaw (`muay-thai__orthodox-southpaw`) | Orthodox → `kickboxing__orthodox` (연결)<br>Southpaw → `kickboxing__southpaw` (연결) | 오소독스와 사우스포는 다른 스탠스 |
| Outside Trip / Inside Trip (`muay-thai__outside-trip-inside-trip`) | Outside Trip → `wrestling__outside-trip` (연결)<br>Inside Trip → `wrestling__inside-trip` (연결) | 바깥/안쪽 다리를 거는 다른 트립 |
| Overhook / Underhook (`muay-thai__overhook-underhook`) | Overhook → `bjj__overhook` (연결)<br>Underhook → `bjj__underhook` (연결) | 오버훅과 언더훅은 다른 그립 |
| Parry / Catch / Slip / Pull Back / Step Back / Roll / Cover (`muay-thai__parry-catch-slip-pull-back-step-back-roll-cover`) | Parry → `kickboxing__parry` (연결)<br>Catch → `boxing__catch` (연결)<br>Slip → `kickboxing__slip` (연결)<br>Pull Back → `kickboxing__pull` (연결)<br>Step Back → `boxing__step-back` (연결)<br>Roll → `kickboxing__roll` (연결)<br>Cover → `kickboxing__cover` (연결) | 펀치 방어 7개의 목록 |
| Shin Block / Long Guard / Parry / Elbow Shield (`muay-thai__shin-block-long-guard-parry-elbow-shield`) | Shin Block → `kickboxing__shin-block` (연결)<br>Long Guard → `boxing__long-guard` (연결)<br>Kick Parry → `muay-thai__kick-parry` (새 기술)<br>Elbow Shield → `muay-thai__elbow-shield` (새 기술) | 킥 방어 4개의 목록 (여기서 패리는 킥을 쳐내는 방어) |
| Single Collar Tie / Double Collar Tie (`muay-thai__single-collar-tie-double-collar-tie`) | Single Collar Tie → `wrestling__collar-tie` (연결)<br>Double Collar Tie → `kickboxing__double-collar-tie` (연결) | 싱글/더블 칼라 타이는 다른 클린치 그립 |
| Step Back / Angle Out (`muay-thai__step-back-angle-out`) | Step Back → `boxing__step-back` (연결)<br>Angle Out → `kickboxing__angle-out` (연결) | 스텝 백과 앵글 아웃은 다른 회피 |
| Straight Knee (Khao Trong) / Curving Knee (Khao Chiang) / Diagonal Knee (`muay-thai__straight-knee-khao-trong-curving-knee-khao-chiang-diagonal-knee`) | Straight Knee (Khao Trong) → `kickboxing__straight-knee` (연결)<br>Curving Knee (Khao Chiang) → `muay-thai__curving-knee` (새 기술)<br>Diagonal Knee → `muay-thai__diagonal-knee` (새 기술) | 궤적이 다른 니 3개 |
| Turn / Off-Balance (`muay-thai__turn-off-balance`) | Turn → `muay-thai__turn` (새 기술)<br>Off-Balance → `kickboxing__off-balance` (연결) | 회전시키기와 균형 무너뜨리기는 다른 클린치 기술 |
| Bridge(Мост), Hip Escape, Sit-Out, Stand-Up, Granby, Turn-In, Frame Escape, Back Escape (`sambo__bridge-мост-hip-escape-sit-out-stand-up-granby-turn-in-frame-escape-back-escape`) | Bridge → `judo__bridge` (연결)<br>Hip Escape → `bjj__hip-escape` (연결)<br>Sit-Out → `wrestling__sit-out` (연결)<br>Stand-Up → `wrestling__stand-up` (연결)<br>Granby → `wrestling__granby-roll` (연결)<br>Turn-In → `judo__turn-in` (연결)<br>Frame Escape → `sambo__frame-escape` (새 기술)<br>Back Escape → `sambo__back-escape` (새 기술) | 탈출 기술 8개의 목록 |
| Drop Seoi류, Arm Drag to Throw, Shoulder Entry, Flying Entry (`sambo__drop-seoi류-arm-drag-to-throw-shoulder-entry-flying-entry`) | Drop Seoi → `sambo__drop-seoi` (새 기술)<br>Arm Drag to Throw → `sambo__arm-drag-to-throw` (새 기술)<br>Shoulder Entry → `sambo__shoulder-entry` (새 기술)<br>Flying Entry → `sambo__flying-entry` (새 기술) | 서로 다른 던지기 진입 4개 |
| Elbow Control, Leg Grip (`sambo__elbow-control-leg-grip`) | Elbow Control → `wrestling__elbow-control` (연결)<br>Leg Grip → `sambo__leg-grip` (새 기술) | 팔꿈치 제어와 다리 그립은 다른 그립 |
| Guard Recovery, Technical Stand-Up (`sambo__guard-recovery-technical-stand-up`) | Guard Recovery → `judo__guard-recovery` (연결)<br>Technical Stand-Up → `bjj__technical-stand-up` (연결) | 가드 회복과 테크니컬 스탠드업은 다른 기술 |
| Guard Sweep, Reversal, Sit-Up Sweep (`sambo__guard-sweep-reversal-sit-up-sweep`) | Guard Sweep → `sambo__guard-sweep` (새 기술)<br>Reversal → `sambo__reversal` (새 기술)<br>Sit-Up Sweep → `bjj__sit-up-sweep` (연결) | 스윕·리버설·싯업 스윕은 다른 기술 |
| Guard(클로즈드/오픈), Half Guard, Turtle, Defensive Shell (`sambo__guard-클로즈드-오픈-half-guard-turtle-defensive-shell`) | Guard (클로즈드/오픈) → `sambo__guard` (새 기술)<br>Half Guard → `bjj__half-guard` (연결)<br>Turtle → `bjj__turtle` (연결)<br>Defensive Shell → `sambo__defensive-shell` (새 기술) | 하위 포지션 4개의 목록 |
| High Crotch, Ankle Pick (`sambo__high-crotch-ankle-pick`) | High Crotch → `bjj__high-crotch` (연결)<br>Ankle Pick → `wrestling__ankle-pick` (연결) | 하이 크로치와 앵클 픽은 다른 테이크다운 (붙어 있던 설명은 어느 쪽인지 불분명해 옮기지 않음) |
| Hip Bump Sweep, Butterfly Sweep, Technical Stand-Up Sweep (`sambo__hip-bump-sweep-butterfly-sweep-technical-stand-up-sweep`) | Hip Bump Sweep → `bjj__hip-bump-sweep` (연결)<br>Butterfly Sweep → `bjj__butterfly-sweep` (연결)<br>Technical Stand-Up Sweep → `bjj__technical-stand-up-sweep` (연결) | 스윕 3개의 목록 |
| Jab, Cross, Hook, Uppercut (`sambo__jab-cross-hook-uppercut`) | Jab → `kickboxing__jab` (연결)<br>Cross → `kickboxing__cross` (연결)<br>Hook → `boxing__hook` (연결)<br>Uppercut → `boxing__uppercut` (연결) | 컴뱃 삼보 펀치 4개의 목록 |
| Knee, Elbow (`sambo__knee-elbow`) | Knee → `kickboxing__straight-knee` (연결)<br>Elbow → `taekwondo__팔굽치기` (연결) | 무릎 타격과 팔꿈치 타격은 다른 기술 |
| Knee Tap, Body Lock, Arm Drag, Duck Under, Snap Down (`sambo__knee-tap-body-lock-arm-drag-duck-under-snap-down`) | Knee Tap → `bjj__knee-tap` (연결)<br>Body Lock → `wrestling__body-lock` (연결)<br>Arm Drag → `bjj__arm-drag` (연결)<br>Duck Under → `bjj__duck-under` (연결)<br>Snap Down → `wrestling__snap-down` (연결) | 레슬링 계열 진입 5개의 목록 |
| Level Change / Footwork / Pivot / Break Step (`sambo__level-change-footwork-pivot-break-step`) | Level Change → `wrestling__level-change` (연결)<br>Footwork → `sambo__footwork` (새 기술)<br>Pivot → `wrestling__pivot` (연결)<br>Break Step → `sambo__break-step` (새 기술) | 기본 움직임 4개의 목록 |
| Low Kick, Body Kick, 헤드킥 (`sambo__low-kick-body-kick-헤드킥`) | Low Kick → `kickboxing__low-kick` (연결)<br>Body Kick → `kickboxing__body-kick` (연결)<br>헤드킥 → `kickboxing__high-kick` (연결) | 타깃이 다른 킥 3개 |
| Rear Naked Choke, Guillotine, Front Headlock Choke, Arm Triangle, Collar Choke 계열 (`sambo__rear-naked-choke-guillotine-front-headlock-choke-arm-triangle-collar-choke-계열`) | Rear Naked Choke → `bjj__rear-naked-choke` (연결)<br>Guillotine → `bjj__guillotine` (연결)<br>Front Headlock Choke → `sambo__front-headlock-choke` (새 기술)<br>Arm Triangle → `bjj__arm-triangle` (연결)<br>Collar Choke → `sambo__collar-choke` (새 기술) | 서로 다른 조르기 5개를 하나로 수록 |
| Single Leg / Double Leg (`sambo__single-leg-double-leg`) | Single Leg → `sambo__single-leg` (새 기술)<br>Double Leg → `wrestling__basic-double-leg` (연결) | 싱글 레그와 더블 레그는 다른 테이크다운 — 영상 2개는 더블 레그 |
| Single Leg from Guard, Wrestle-Up (`sambo__single-leg-from-guard-wrestle-up`) | Single Leg from Guard → `sambo__single-leg-from-guard` (새 기술)<br>Wrestle-Up → `bjj__wrestle-up` (연결) | 가드에서 싱글 레그와 레슬 업은 다른 기술 |
| Two-on-One, Underhook, Overhook, Russian Tie (`sambo__two-on-one-underhook-overhook-russian-tie`) | Two-on-One → `judo__two-on-one` (연결)<br>Underhook → `bjj__underhook` (연결)<br>Overhook → `bjj__overhook` (연결)<br>Russian Tie → `wrestling__russian-tie` (연결) | 그립 4개의 목록 |
| Yoko Otoshi/Sumi Gaeshi/Yoko Guruma류(옆으로 눕는 희생기술), Ura Nage류 (`sambo__yoko-otoshi-sumi-gaeshi-yoko-guruma류-옆으로-눕는-희생기술-ura-nage류`) | Yoko Otoshi → `judo__yoko-otoshi` (연결)<br>Sumi Gaeshi → `judo__sumi-gaeshi` (연결)<br>Yoko Guruma → `judo__yoko-guruma` (연결)<br>Ura Nage → `judo__ura-nage` (연결) | 삼보에서도 쓰는 유도 희생 던지기 4개 |
| 허리기술 Counter, 다리걸기 Counter (`sambo__허리기술-counter-다리걸기-counter`) | 허리기술 Counter → `sambo__허리기술-counter` (새 기술)<br>다리걸기 Counter → `sambo__다리걸기-counter` (새 기술) | 허리기술 카운터와 다리걸기 카운터는 다른 카운터 |
| 공중회전 발차기 / 다단(멀티) 점프 발차기 (`taekwondo__공중회전-발차기-다단-멀티-점프-발차기`) | 공중회전 발차기 → `taekwondo__공중회전-발차기` (새 기술)<br>다단(멀티) 점프 발차기 → `taekwondo__다단-점프-발차기` (새 기술) | 공중회전 발차기와 다단 점프 발차기는 다른 기술 |
| 끌기(드래그 스텝) / 밀기 (`taekwondo__끌기-드래그-스텝-밀기`) | 끌기 (드래그 스텝) → `taekwondo__끌기` (새 기술)<br>밀기 → `taekwondo__밀기` (새 기술) | 끌기와 밀기는 다른 이동 |
| 돌려차기, 내려차기, 나래차기, 반대지르기 (`taekwondo__돌려차기-내려차기-나래차기-반대지르기`) | 돌려차기 → `kickboxing__round-kick` (연결)<br>내려차기 → `kickboxing__axe-kick` (연결)<br>나래차기 → `taekwondo__나래차기` (연결)<br>반대지르기 → `taekwondo__반대지르기` (새 기술) | 득점 기술 4개의 목록 |
| 두손목막기 / 엇걸어막기 / 가위막기 / 산틀막기 (`taekwondo__두손목막기-엇걸어막기-가위막기-산틀막기`) | 두손목막기 → `taekwondo__두손목막기` (새 기술)<br>엇걸어막기 → `taekwondo__엇걸어막기` (새 기술)<br>가위막기 → `taekwondo__가위막기` (새 기술)<br>산틀막기 → `taekwondo__산틀막기` (새 기술) | 서로 다른 막기 4개 |
| 뛰어앞차기 / 뛰어돌려차기 / 뛰어옆차기 / 뛰어뒤차기 / 뛰어내려차기 (`taekwondo__뛰어앞차기-뛰어돌려차기-뛰어옆차기-뛰어뒤차기-뛰어내려차기`) | 뛰어앞차기 → `taekwondo__뛰어앞차기` (새 기술)<br>뛰어돌려차기 → `taekwondo__뛰어돌려차기` (새 기술)<br>뛰어옆차기 → `taekwondo__뛰어옆차기` (새 기술)<br>뛰어뒤차기 → `taekwondo__뛰어뒤차기` (새 기술)<br>뛰어내려차기 → `taekwondo__뛰어내려차기` (새 기술) | 서로 다른 뛰어차기 5개 |
| 밀어차기, 앞발 돌려차기, 앞차기, 옆차기 (`taekwondo__밀어차기-앞발-돌려차기-앞차기-옆차기`) | 밀어차기 → `taekwondo__밀어차기` (연결)<br>앞발 돌려차기 → `taekwondo__앞발-돌려차기` (연결)<br>앞차기 → `kickboxing__front-kick` (연결)<br>옆차기 → `kickboxing__side-kick` (연결) | 견제 발차기 4개의 목록 |
| 바로지르기 / 반대지르기 (`taekwondo__바로지르기-반대지르기`) | 바로지르기 → `taekwondo__바로지르기` (새 기술)<br>반대지르기 → `taekwondo__반대지르기` (새 기술) | 바로지르기와 반대지르기는 다른 지르기 |
| 손날막기 / 한손날막기 (`taekwondo__손날막기-한손날막기`) | 손날막기 → `karate__shuto-uke` (연결)<br>한손날막기 → `taekwondo__한손날막기` (새 기술) | 손날막기(양손)와 한손날막기는 다른 막기 |
| 앞낙법 / 뒤낙법 / 옆낙법 (`taekwondo__앞낙법-뒤낙법-옆낙법`) | 앞낙법 → `taekwondo__앞낙법` (새 기술)<br>뒤낙법 → `taekwondo__뒤낙법` (새 기술)<br>옆낙법 → `taekwondo__옆낙법` (새 기술) | 방향이 다른 낙법 3개 |
| 앞발 밀어차기 / 뒷발 밀어차기 (`taekwondo__앞발-밀어차기-뒷발-밀어차기`) | 앞발 밀어차기 → `taekwondo__앞발-밀어차기` (새 기술)<br>뒷발 밀어차기 → `taekwondo__뒷발-밀어차기` (새 기술) | 앞발/뒷발 밀어차기는 다른 발차기 |
| 전진 / 후진 (`taekwondo__전진-후진`) | 전진 → `taekwondo__전진` (새 기술)<br>후진 → `taekwondo__후진` (새 기술) | 전진과 후진은 다른 이동 |
| 지르기 / 바로지르기 / 반대지르기 / 돌려지르기 / 옆지르기 / 내려지르기 (`taekwondo__지르기-바로지르기-반대지르기-돌려지르기-옆지르기-내려지르기`) | 지르기 → `taekwondo__지르기` (새 기술)<br>바로지르기 → `taekwondo__바로지르기` (새 기술)<br>반대지르기 → `taekwondo__반대지르기` (새 기술)<br>돌려지르기 → `taekwondo__돌려지르기` (새 기술)<br>옆지르기 → `taekwondo__옆지르기` (새 기술)<br>내려지르기 → `taekwondo__내려지르기` (새 기술) | 서로 다른 지르기 6개 |
| 회전 내려차기 / 회전 옆차기 (`taekwondo__회전-내려차기-회전-옆차기`) | 회전 내려차기 → `taekwondo__회전-내려차기` (새 기술)<br>회전 옆차기 → `taekwondo__회전-옆차기` (새 기술) | 회전 내려차기와 회전 옆차기는 다른 발차기 |

### 기존 병합 해제

| 기록 | 이전 | 수정 | 근거 |
|---|---|---|---|
| `boxing__catch`, `kickboxing__catch` | 하나의 Catch | 복싱 Catch(펀치) ≠ 킥복싱 Catch(킥 캐치, `kickboxing__킥-캐치`와 병합) | 킥복싱 원문 14장 "Catch는 로우킥/미들킥을 팔로 감아 잡는 방어" |
| `bjj__grip-fighting`, `judo__grip-fighting` | 하나의 Grip Fighting | 각각 독립 | BJJ는 데 라 히바 가드 안 그립 싸움, 유도는 서서 하는 쿠미카타 |

## D. 데이터 이전

- **사용자 기록 (학습 기록·숙련도·자세 분석·콤보·커리큘럼):** 기록에는 기술 id만 있고 묶음 중 어느 기술인지 알려 주는 정보(Mitt 동작, AI 코치 기술별 결과 등)가 없어 **옮기지 않았다**. 숙련도를 분리된 기술 여러 개에 복사하지도 않는다. 묶음 기록 id는 계속 열리고(legacy), 상세 화면에서 분리된 기술을 안내한다. 이 기록에 학습 내역·숙련도·자세 분석이 있으면 "배운 기술"·"나의 기술" 목록에 "여러 기술을 묶은 기존 기록"으로 표시된다(`legacySplitSkillEntries`) — 추천·약점 분석·AI 코치 기술 선택에는 쓰지 않는다. 병합된 기록은 기존과 같이 모든 id가 canonical로 이어진다. 삭제된 사용자 데이터 0.
- **커리큘럼 참조:** 공식·저장된 커리큘럼이 묶음 기록 id를 가리키면 읽을 때 분리된 기술 id 목록으로 펼친다(`expandSplitTechniqueIds`, 저장된 원본은 수정하지 않음).
- **영상:** 내용이 확인된 경우만 옮겼다.
  - `karate__tai-sabaki-tenkan-pivot` → `judo__tai-sabaki`: gTQAU0Dy3kE, heGMEQ1A5ZQ
  - `muay-thai__low-kick-body-kick-high-kick` → `kickboxing__low-kick`: reUa4aHfkY0, mXb5Nolg30Y
  - `sambo__single-leg-double-leg` → `wrestling__basic-double-leg`: HB3-g2ClYiM, dHmWPOrf0wY
  - `karate__musubi-dachi-heiko-dachi` → 새 기술 `karate__musubi-dachi`: JG4RrxicHAw, R6fFqCxiOwE
  - `muay-thai__lead-teep-rear-teep` → 새 기술 `muay-thai__lead-teep`: oJf8b8zneYo, 7rlAj7pyvnE
  - `muay-thai__lead-teep-rear-teep` → 새 기술 `muay-thai__rear-teep`: oJf8b8zneYo, 7rlAj7pyvnE
  - `sambo__sleeve-grip-захват-за-рукав` → `judo__two-on-one`: IDpPa6oC_3E ("Russian Sambo wrestling 2 on 1 grip" — 소매 그립이 아니라 2-on-1 그립 영상)
  - 어느 기술 영상인지 특정할 수 없는 영상(예: 잽-크로스 연결 영상, 일반 라운드킥·티프 강좌)은 원래 기록에 그대로 둠.
- **자세(posture)·난이도:** 묶음 기록의 자세 설명은 여러 기술이 섞인 것이라 분리된 기술로 복사하지 않았다(새 기술은 "자세 설명 준비 중"). 자세 분석 설정 1건(`muay-thai__lead-round-kick-rear-round-kick`, 좌우 무관 지표)만 Lead/Rear Round Kick에 복사.

## H. REVIEW — 최종 결정

| 기록 | 결정 | 이유 |
|---|---|---|
| `muay-thai__khao-chiang-khao-khong`, `muay-thai__curving-knee` | REVIEW 유지 (근거 부족·원문 충돌) | 원문이 Khao Chiang을 한 곳에서는 다이애거널 니("Khao Chiang / Khao Khong — 다이애거널·커빙 니"), 다른 곳에서는 커빙 니("Curving Knee (Khao Chiang)")로 적음 — 원문끼리 충돌해 확정할 수 없음 |
| `kickboxing__wheel-kick`, `taekwondo__뒤후려차기` | REVIEW 유지 (근거 부족·원문 충돌) | 킥복싱 Wheel Kick 기록에 설명이 없고, 이름만으로는 회전 훅킥(뒤후려차기)인지 회전 힐킥인지 알 수 없음 |
| `judo__ude-garami`, `bjj__americana`, `bjj__kimura` | 다른 기술로 확정 — 분리 유지 (데이터 변경 없음) | 유도 우데가라미("팔 감아 꼬기")는 양방향 꺾기를 모두 가리키는 이름이라 아메리카나·키무라 중 어느 하나와 같은 기술이 아님 — 각각 유지 |
| `sambo__рычаг-локтя`, `bjj__armbar` | 다른 기술로 확정 — 분리 유지 (데이터 변경 없음) | 데이터 설명 "(팔꿈치 레버 = 암바 계열)" — 계열 이름이라 특정 기술 하나(암바)와 같지 않음 — 각각 유지 |
| `sambo__узел-плеча`, `sambo__узел-плеча-обратный`, `bjj__kimura`, `bjj__americana` | 다른 기술로 확정 — 분리 유지 (데이터 변경 없음) | 데이터 설명 "(어깨 노트 = 키무라/해머락 계열)", "(역방향 어깨 노트)" — 계열 이름 — 각각 유지 |
| `sambo__узел-стопы`, `bjj__toe-hold`, `bjj__heel-hook` | 다른 기술로 확정 — 분리 유지 (데이터 변경 없음) | 데이터 설명 "(발의 비틀림형 노트) 계열, 즉 힐훅·토홀드 등" — 여러 기술을 묶은 계열 이름 — 각각 유지 |
| `judo__kibisu-gaeshi`, `wrestling__ankle-pick` | REVIEW 유지 (근거 부족·원문 충돌) | "발뒤꿈치 되잡기"와 앵클 픽 — 잡는 위치·마무리가 같은지 두 기록 모두 설명이 없어 확인할 수 없음 |
| `judo__kata-gatame`, `bjj__arm-triangle` | 다른 기술로 확정 — 분리 유지 (데이터 변경 없음) | 유도 가타가타메는 "네와자 / 바닥 포지션"(누르기)에, BJJ 암 트라이앵글은 서브미션으로 수록 — 마무리(누르기 vs 조르기)가 달라 다른 기술 |
| `wrestling__inside-trip`, `judo__ouchi-gari` | REVIEW 유지 (근거 부족·원문 충돌) | 레슬링 Inside Trip은 설명이 없고 유도 오우치가리는 "큰 안 베기"뿐 — 동작이 같은지 확인할 수 없음 |
| `wrestling__hip-toss`, `judo__o-goshi`, `judo__koshi-guruma` | 다른 기술로 확정 — 분리 유지 (데이터 변경 없음) | 레슬링 힙 토스 하나가 그립에 따라 오고시·고시구루마 두 유도 기술에 걸쳐 있어 어느 하나와 같은 기술로 볼 수 없음 — 각각 유지 |
| `karate__kizami-zuki`, `kickboxing__jab` | 같은 기술로 확정 — 병합 | 가라테 데이터 자체가 Kizami-zuki의 한국어명을 "잽"으로, 설명을 "앞손으로 짧고 빠르게 찌르는 견제·거리 측정용 기술"로 적음 + 기존 Visualizing Mitt 규칙도 Kizami-zuki를 잽 동작으로 그림 — 같은 기술 (가라테 화면에서는 Kizami-zuki로 표시) |
| `kickboxing__teep`, `muay-thai__push-teep`, `muay-thai__lead-teep`, `muay-thai__rear-teep` | REVIEW 유지 (근거 부족·원문 충돌) | 킥복싱 "Teep"은 설명 없이 리드/리어 구분도 없는 일반 항목 — 무에타이 리드·리어·푸시 티프 중 어느 것인지 확정할 수 없음 |
| `sambo__отхват-подсечка-counter`, `sambo__удушающий-прием-удушающий-захват` | 다른 기술로 확정 — 분리 유지 (데이터 변경 없음) | 원문이 각각 하나의 항목("발쓸기에 대한 반대 방향 던지기 카운터", "조르기 일반 용어")으로 설명 — 묶음 기록이 아니므로 분리하지 않고 유지 |
| `karate__feint`, `wrestling__feint` | 다른 기술로 확정 — 분리 유지 (데이터 변경 없음) | 레슬링 Feint는 "태클 진입 페인트"(기존 제외 사유), 가라테 Feint는 장거리 타격 견제 — 다른 기술 (전수 감사: MMA 목록에 둘 다 있음) |
| `karate__feint`, `boxing__feint` | REVIEW 유지 (근거 부족·원문 충돌) | 가라테 Feint(장거리 견제, 상대가 Sen인지 Go no Sen인지 확인 — 발·손 모두)와 복싱 Feint(펀치 페인트)가 같은 기술인지 데이터로 확인할 수 없음 (전수 감사 패턴 A) |
| `bjj__collar-choke`, `sambo__collar-choke` | REVIEW 유지 (근거 부족·원문 충돌) | BJJ 칼라 초크는 백 컨트롤에서, 삼보 "Collar Choke 계열"은 위치 설명 없음 — 같은 기술인지 확인할 수 없어 별도 유지 |
| `kickboxing__body-kick` → MMA | REVIEW (관계 제거) | MMA 기록·공유 라이브러리 어디에도 바디킥 언급 없음 — 관계를 확정하지 않음 |
| `kickboxing__high-kick` → MMA | REVIEW (관계 제거) | MMA 기록·공유 라이브러리 어디에도 하이킥/헤드킥 언급 없음 |
| `kickboxing__round-kick` → MMA | REVIEW (관계 제거) | MMA 기록·공유 라이브러리 어디에도 라운드킥 언급 없음 (로우킥·카프킥·오블리크 킥만 있음) |
| `kickboxing__teep` → MMA | REVIEW (관계 제거) | MMA 기록·공유 라이브러리 어디에도 티프/푸시킥 언급 없음 (오블리크 킥은 다른 기술) |

## 표시 이름 (무술별)

기술 identity는 canonical 하나로 유지하고, 무술 화면에서는 그 무술 원래 기록의 이름을 먼저 보여 준다 (`techniqueNameInArt`). 이름은 병합된 기록에 있던 것만 쓰며 새로 만들지 않는다. 모든 이름은 별칭으로도 검색된다.

| canonical | 무술별 이름 |
|---|---|
| Armbar | BJJ: Armbar · 유도: Juji Gatame (십자 굳히기) |
| Kneebar | BJJ: Kneebar · 삼보: рычаг колена |
| Overhook | BJJ: Overhook · 킥복싱: Overhook · 레슬링: Overhook / Whizzer |
| Rear Naked Choke | BJJ: Rear Naked Choke · 유도: Hadaka Jime (맨손 조르기) |
| Straight Ankle Lock | BJJ: Straight Ankle Lock · 삼보: ущемление ахиллова сухожилия |
| Triangle Choke | BJJ: Triangle Choke · 유도: Sankaku Jime (삼각 조르기) |
| Backfist | 복싱: Backfist · 킥복싱: Backfist · 무에타이: Backfist · 가라테: Uraken-uchi (백핏) · 태권도: 등주먹 (등주먹치기) |
| Ayumi Ashi | 유도: Ayumi Ashi (보통 걸음) · 가라테: Ayumi-ashi |
| Lapel Grip | 유도: Lapel Grip (깃 그립) · BJJ: 칼라 그립 · 삼보: Collar/Lapel Grip / Ворот (옷깃 그립) |
| Sleeve Grip | 유도: Sleeve Grip (소매 그립) · BJJ: 슬리브 그립 · 삼보: Sleeve Grip / Захват за рукав (소매 그립) |
| Tsugi Ashi | 유도: Tsugi Ashi (미끄러지는 걸음) · 가라테: Tsugi-ashi (쓰기아시) |
| Age Uke | 가라테: Age Uke (상단막기) · 태권도: 얼굴막기 (올려막기) |
| Gedan Barai | 가라테: Gedan Barai (하단막기) · 태권도: 아래막기 |
| Haito-uchi | 가라테: Haito-uchi (반대손날) · 태권도: 손날등치기 |
| Kiba-dachi | 가라테: Kiba-dachi (기마립) · 태권도: 주춤서기 |
| Kokutsu-dachi | 가라테: Kokutsu-dachi (후굴립) · 태권도: 뒷굽이 |
| Neko-ashi-dachi | 가라테: Neko-ashi-dachi (묘족립) · 태권도: 범서기 |
| Shuto-uchi | 가라테: Shuto-uchi (손날치기) · 태권도: 손날치기 |
| Tettsui-uchi | 가라테: Tettsui-uchi (망치주먹) · 태권도: 망치주먹 (메주먹) |
| Zenkutsu-dachi | 가라테: Zenkutsu-dachi (전굴립) · 태권도: 앞굽이 |
| Axe Kick | 킥복싱: Axe Kick · 가라테: Kakato Geri (뒤꿈치차기/도끼차기) · 태권도: 내려차기 |
| Back Kick | 킥복싱: Back Kick · 가라테: Ushiro Geri (뒤차기) · 태권도: 뒤차기 |
| Crescent Kick | 킥복싱: Crescent Kick · 가라테: Mikazuki Geri (반달차기) · 태권도: 반달차기 (안반달차기 / 밖반달차기) |
| Cut-Off | 복싱: Cut Off · 킥복싱: Cut-Off |
| Downward Elbow | 킥복싱: Downward Elbow · 무에타이: Sok Sap (다운워드 엘보) |
| Flying Knee | 킥복싱: Flying Knee · 무에타이: Khao Loi (플라잉 니) |
| Front Kick | 킥복싱: Front Kick · 가라테: Mae Geri (앞차기) · 태권도: 앞차기 |
| Horizontal Elbow | 킥복싱: Horizontal Elbow · 무에타이: Sok Tad (커팅 엘보) |
| Jab | 복싱: Jab · 킥복싱: Jab · 가라테: Kizami-zuki (잽) |
| Jab → Cross → Body Kick | 킥복싱: Jab → Cross → Body Kick · 무에타이: Jab--Cross--Body Kick |
| Jumping Knee | 킥복싱: Jumping Knee · 무에타이: Khao Kradod (점핑 니) |
| Round Kick | 킥복싱: Round Kick · 가라테: Mawashi Geri (돌려차기) · 태권도: 돌려차기 |
| Side Kick | 킥복싱: Side Kick · 가라테: Yoko Geri (옆차기) · 태권도: 옆차기 |
| Straight Knee | 킥복싱: Straight Knee · 무에타이: Khao Trong (스트레이트 니) |
| Upward Elbow | 킥복싱: Upward Elbow · 무에타이: Sok Ngoei (업워드 엘보) |
| Fireman's Carry | BJJ: Fireman's Carry · 삼보: Fireman's Carry · 레슬링: Fireman's Carry · 유도: Kata Guruma (어깨 바퀴) |
| 벨트 그립 | BJJ: 벨트 그립 · 삼보: 벨트 그립 · 유도: Belt Grip (허리띠 그립) |
| Basic Double Leg | 레슬링: Basic Double Leg · 유도: Morote Gari (양손 베기) |

대표(canonical) 이름에 다른 기록의 직역 한국어명을 쓰지 않는 기술: `bjj__armbar`, `bjj__rear-naked-choke`, `wrestling__basic-double-leg`, `sambo__fireman-s-carry`, `bjj__triangle-choke` — 해당 무술 화면에서는 그 무술 기록의 이름(예: 유도 "Morote Gari (양손 베기)")으로 표시.

### D. 이름은 비슷하지만 다른 기술 (분리 유지)

| 기록 | 이유 |
|---|---|
| `karate__대표-기술`, `taekwondo__대표-기술` | "대표 기술"은 기술이 아니라 각 무술 문서의 목록 제목 |
| `bjj__backstep`, `wrestling__back-step` | BJJ 백스텝(가드 패스/레그 엔트리) ≠ 레슬링 백 스텝(기본 이동) |
| `boxing__frame`, `judo__frame` | 복싱 근거리 프레임(밀어내기) ≠ 유도 탈출 프레임 |
| `bjj__wrist-control`, `boxing__wrist-control`, `wrestling__wrist-control` | 가드 안 손목 제어 / 클린치 손목 제어 / 스탠딩 핸드파이팅 — 상황과 목적이 다름 |
| `bjj__hand-fighting`, `boxing__hand-fighting`, `wrestling__hand-fighting` | 백 컨트롤 방어 / 인파이팅 / 스탠딩 그립 싸움 — 서로 다른 기술 |
| `boxing__feint`, `wrestling__feint` | 펀치 페인트 ≠ 태클 진입 페인트 |
| `boxing__drop-step`, `wrestling__drop-step` | 복싱 풋워크 드롭 스텝 ≠ 레슬링 태클 진입 드롭 스텝 |
| `kickboxing__square-stance`, `wrestling__square-stance` | 타격 스탠스 ≠ 레슬링 스탠스 |
| `boxing__elbow-guard`, `muay-thai__elbow-guard` | 바디 펀치 방어 ≠ 로우킥/훅 방어 자세 |
| `bjj__over-under`, `wrestling__over-under` | BJJ 오버-언더 패스 ≠ 레슬링 오버-언더 클린치 |
| `judo__overhook-underhook`, `muay-thai__overhook-underhook` | 도복 그립 ≠ 무에타이 클린치 (두 기술을 묶은 항목) |
| `wrestling__pivot` | 레슬링 피벗(그라운드/스탠딩 방향 전환)은 복싱·킥복싱 풋워크 피벗과 다른 동작 — 타격 피벗끼리만 통합 |
| `wrestling__bridge` | 레슬링 브리지(목 브리지 기본 움직임) ≠ BJJ·유도 브리지 탈출 — 탈출 브리지끼리만 통합 |
| `wrestling__inside-control` | 레슬링 인사이드 컨트롤(핸드파이팅 타이) ≠ 클린치 인사이드 컨트롤 — 타격 클린치끼리만 통합 |
| `boxing__catch`, `kickboxing__catch` | 복싱 캐치(손바닥으로 펀치를 받는 패링 계열) ≠ 킥복싱 캐치(로우킥/미들킥을 팔로 감아 잡는 킥 방어, 원문 14장) |
| `bjj__grip-fighting`, `judo__grip-fighting` | BJJ 그립 파이팅(데 라 히바 가드 안에서의 그립 싸움) ≠ 유도 쿠미카타(서서 하는 그립 싸움) — 핸드 파이팅·손목 제어와 같은 기준 |

### 기술이 아닌 항목

- `boxing__전형적-자세-풋워크` — "전형적 자세/풋워크" — 스타일 설명의 소제목
- `karate__대표-기술` — "대표 기술" — 목록 제목
- `taekwondo__대표-기술` — "대표 기술" — 목록 제목
