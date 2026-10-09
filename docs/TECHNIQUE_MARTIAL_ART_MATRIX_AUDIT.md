# MARTIALDEX 전체 기술 × 무술 관계 전수 감사

재현: `npm run audit:technique-relations`. 자동 단계(`scripts/audit-technique-art-matrix.mjs`)는 판단하지 않고 근거만 모은다 — 현재 관계, 각 무술 원문(`data/raw`)·기록·공유 라이브러리가 기술을 언급하는 위치. 판단 단계(`data/audit/judgements/*.json` → `scripts/consolidate-technique-art-decisions.mjs`)는 서면 기준(`data/audit/judgement-criteria/`)에 따른 AI 판단이며 판단마다 근거·신뢰도가 남는다. 외부 근거: https://kr.ufc.com/unified-rules-mixed-martial-arts (UFC, Unified Rules of Mixed Martial Arts — fouls, copied verbatim 2026-10-03) / https://en.wikipedia.org/wiki/Mixed_martial_arts_rules (Unified Rules: Attire, quoted 2026-10-03)

## 1. 전체 결과

| 항목 | 수 |
|---|---|
| canonical 기술 | 1138 |
| 공식 무술 | 10 (가라테, 레슬링, 무에타이, 복싱, 삼보, 유도, 주짓수, 킥복싱, 태권도, MMA) — 사용자 추가 무술(택견·우슈 등)은 공식 데이터가 없어 제외 |
| 검사한 기술 × 무술 관계 | 11380 |
| 감사 전 연결 | 1417 |
| 추가 | 514 |
| 제거 | 0 |
| 유지 | 1417 |
| 감사 후 연결 | 1931 |
| 판단한 관계 (AI, 근거·신뢰도 기록) | 1333 (추가 514 · 해당 없음 348 · REVIEW 471) |
| 연결 안 됨 + 근거 없음 (어떤 무술 데이터도 언급하지 않음) | 9217 |
| 판단되지 않은 근거 후보 | 0 |

### 현재 관계의 근거 (제거 대상 점검)

기존 관계를 하나씩 근거 종류로 분류했다. native = 그 무술 원문 문서의 자체 기록, split-part = 그 무술 원문의 묶음 기록을 나눈 기술, reviewed-link = 근거 등급(A/B)을 붙여 검토한 연결, library-link = 사용자가 공유 라이브러리에서 그 무술로 연결한 기록. 근거 없는 관계가 없어 이번 감사에서 제거한 관계는 0개다.

| 근거 종류 | 관계 수 |
|---|---|
| native | 1283 |
| reviewed-link (B) | 480 |
| split-part | 108 |
| reviewed-link (A) | 60 |

앞선 최종 검수에서 근거 부족(C)으로 MMA 관계를 뺐던 Body Kick·High Kick·Round Kick·Teep은 이번 전수 기준(MMA 기록의 "MMA 킥복싱" 범주 S1 + 통합 규정 S2)으로 B가 되어 다시 연결됐다.

## 2. 무술별 결과

| 무술 | 감사 전 | 추가 | 제거 | 감사 후 | REVIEW |
|---|---|---|---|---|---|
| 가라테 | 115 | 2 | 0 | 117 | 6 |
| 레슬링 | 187 | 3 | 0 | 190 | 8 |
| 무에타이 | 134 | 5 | 0 | 139 | 14 |
| 복싱 | 130 | 0 | 0 | 130 | 15 |
| 삼보 | 136 | 5 | 0 | 141 | 14 |
| 유도 | 135 | 0 | 0 | 135 | 6 |
| 주짓수 | 306 | 3 | 0 | 309 | 9 |
| 킥복싱 | 120 | 6 | 0 | 126 | 12 |
| 태권도 | 99 | 0 | 0 | 99 | 7 |
| MMA | 55 | 490 | 0 | 545 | 380 |

## 3. MMA 전수 결과

원인: MMA만 원문 문서(`data/raw`)가 없고, MMA 기록 30개는 "MMA Boxing Combination", "Dirty Boxing"처럼 결합 동작만 담아서 다른 무술의 기본 기술이 MMA로 연결될 경로가 없었다 (감사 전 55개 — 대부분 이름이 같은 기록 병합이나 앞선 검수의 근거 링크). 이번에는 MMA에 연결되지 않은 기술 1083개를 하나씩 판단했다: MMA 기록이 그 종류의 기술을 MMA 기술로 다룸(S1) + 통합 규정상 반칙이 아니고 도복 없이 성립(S2) + 실제 MMA에서 쓰임 → 추가(B, MMA 기록이 이름으로 언급하면 A). 도복 의존·반칙·품새/가타/격파·규정 개념 → 해당 없음. 실제 사용이 불확실 → REVIEW.

| 감사 전 | 추가 | 제거 | REVIEW | 감사 후 |
|---|---|---|---|---|
| 55 | 490 | 0 | 380 | 545 |

### MMA에 새로 연결된 기술 (전체)

| 기술 | 원래 무술 | 신뢰도 | MMA 카테고리 | 근거 |
|---|---|---|---|---|
| Americana `bjj__americana` | 주짓수 | B | 서브미션 (Submission) | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Anaconda Choke `bjj__anaconda-choke` | 주짓수 | B | 서브미션 (Submission) | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Arm Drag → Back Take `bjj__arm-drag-back-take` | 주짓수 | B | 테이크다운 (Takedown) | S1 Back Mount Hooks Control, Scramble to Back Take; S2 위반 없음 |
| Arm Drag → Back `bjj__arm-drag-back` | 주짓수 | B | 테이크다운 (Takedown) | S1 Back Mount Hooks Control, Scramble to Back Take; S2 위반 없음 |
| Arm Drag → Single Leg `bjj__arm-drag-single-leg` | 주짓수 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Arm Drag Sweep `bjj__arm-drag-sweep` | 주짓수 | B | 테이크다운 (Takedown) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Arm Drag `bjj__arm-drag` | 주짓수 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Arm-In Guillotine `bjj__arm-in-guillotine` | 주짓수 | B | 서브미션 (Submission) | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Ashi Garami Transition `bjj__ashi-garami-transition` | 주짓수 | B | 서브미션 (Submission) | S1 Leg Entanglement Scramble(레그락 진입); S2 small joint manipulation만 반칙 |
| Back Take `bjj__back-take` | 주짓수 | A | 그라운드 컨트롤 (Ground Control) | S1 mmaDataMentions: Scramble to Back Take; S2 위반 없음 |
| Body Lock Pass `bjj__body-lock-pass` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Body Triangle `bjj__body-triangle` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 Back Mount Hooks Control, Scramble to Back Take; S2 위반 없음 |
| Breakdown `bjj__breakdown` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Bridge and Roll `bjj__bridge-and-roll` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Butterfly Guard `bjj__butterfly-guard` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Butterfly Half Guard `bjj__butterfly-half-guard` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Butterfly Recovery `bjj__butterfly-recovery` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Butterfly Sweep `bjj__butterfly-sweep` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Crucifix Attacks `bjj__crucifix-attacks` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Crucifix `bjj__crucifix` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| D'Arce Choke `bjj__d-arce-choke` | 주짓수 | B | 서브미션 (Submission) | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Dogfight Sweep `bjj__dogfight-sweep` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Dogfight `bjj__dogfight` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Double Under Pass `bjj__double-under-pass` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Duck Under `bjj__duck-under` | 주짓수 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Elbow-Knee Escape `bjj__elbow-knee-escape` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Elevation `bjj__elevation` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Far-side Underhook `bjj__far-side-underhook` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Feet on Hips `bjj__feet-on-hips` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 Framing / Guard Recovery Under Strikes; S2 위반 없음 |
| Full Guard Recovery `bjj__full-guard-recovery` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Gift Wrap → Back `bjj__gift-wrap-back` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 Back Mount Hooks Control, Scramble to Back Take; S2 위반 없음 |
| Gift Wrap `bjj__gift-wrap` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Half Guard Recovery `bjj__half-guard-recovery` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Head-and-Arm Choke `bjj__head-and-arm-choke` | 주짓수 | B | 서브미션 (Submission) | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Head Control `bjj__head-control` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Heel Hook `bjj__heel-hook` | 주짓수 | B | 서브미션 (Submission) | S1 Leg Entanglement Scramble(레그락 진입); S2 small joint manipulation만 반칙 |
| High Crotch `bjj__high-crotch` | 주짓수 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| High Mount `bjj__high-mount` | 주짓수 | A | 그라운드 컨트롤 (Ground Control) | S1 mmaDataMentions: Posture Control in Mount; S2 위반 없음 |
| Hip Bump Sweep `bjj__hip-bump-sweep` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Hip Escape `bjj__hip-escape` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Hook Sweep `bjj__hook-sweep` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Hooks `bjj__hooks` | 주짓수 | A | 그라운드 컨트롤 (Ground Control) | S1 mmaDataMentions: Back Mount Hooks Control; S2 위반 없음 |
| Inside Pass `bjj__inside-pass` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Inside Sankaku `bjj__inside-sankaku` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 Leg Entanglement Scramble(레그락 진입); S2 small joint manipulation만 반칙 |
| Inside Single `bjj__inside-single` | 주짓수 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Kimura Control `bjj__kimura-control` | 주짓수 | B | 서브미션 (Submission) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Kimura Sweep `bjj__kimura-sweep` | 주짓수 | B | 서브미션 (Submission) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Kimura Trap `bjj__kimura-trap` | 주짓수 | B | 서브미션 (Submission) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Knee Cut Pass `bjj__knee-cut-pass` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Knee Elbow Escape `bjj__knee-elbow-escape` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Knee-Elbow Recovery `bjj__knee-elbow-recovery` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Knee Mount `bjj__knee-mount` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Knee on Belly Control `bjj__knee-on-belly-control` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Knee-on-Belly to Side Control `bjj__knee-on-belly-to-side-control` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Knee on Belly `bjj__knee-on-belly` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Knee Shield Half Guard `bjj__knee-shield-half-guard` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Knee Shield `bjj__knee-shield` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Knee Tap `bjj__knee-tap` | 주짓수 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Kneebar `bjj__kneebar` | 주짓수 | B | 서브미션 (Submission) | S1 Leg Entanglement Scramble(레그락 진입); S2 small joint manipulation만 반칙 |
| Leg Drag `bjj__leg-drag` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Leg Entanglement `bjj__leg-entanglement` | 주짓수 | A | 그라운드 컨트롤 (Ground Control) | S1 mmaDataMentions: Leg Entanglement Scramble; S2 위반 없음 |
| Leg Locks `bjj__leg-locks` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 Leg Entanglement Scramble(레그락 진입); S2 small joint manipulation만 반칙 |
| Low Mount `bjj__low-mount` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Low Single `bjj__low-single` | 주짓수 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| MMA 상황에서의 일어나기 `bjj__mma-상황에서의-일어나기` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Mount → S-Mount → Armbar `bjj__mount-s-mount-armbar` | 주짓수 | B | 서브미션 (Submission) | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Mount Transition `bjj__mount-transition` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Mounted Triangle `bjj__mounted-triangle` | 주짓수 | B | 서브미션 (Submission) | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Near-side Underhook `bjj__near-side-underhook` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| North-South Choke `bjj__north-south-choke` | 주짓수 | B | 서브미션 (Submission) | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| North-South Control `bjj__north-south-control` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| North-South `bjj__north-south` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Omoplata `bjj__omoplata` | 주짓수 | B | 서브미션 (Submission) | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Outside Pass `bjj__outside-pass` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Outside Single `bjj__outside-single` | 주짓수 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Over-Under Pass `bjj__over-under-pass` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Posture Break `bjj__posture-break` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Recover Butterfly Guard `bjj__recover-butterfly-guard` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Recover Full Guard `bjj__recover-full-guard` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Running the Pipe `bjj__running-the-pipe` | 주짓수 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Russian Tie Takedown `bjj__russian-tie-takedown` | 주짓수 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| S-Mount Armbar `bjj__s-mount-armbar` | 주짓수 | B | 서브미션 (Submission) | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| S-Mount `bjj__s-mount` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Saddle `bjj__saddle` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 Leg Entanglement Scramble(레그락 진입); S2 small joint manipulation만 반칙 |
| Seatbelt Back Take `bjj__seatbelt-back-take` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 Back Mount Hooks Control, Scramble to Back Take; S2 위반 없음 |
| Seatbelt `bjj__seatbelt` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 Back Mount Hooks Control, Scramble to Back Take; S2 위반 없음 |
| Shoulder Pressure `bjj__shoulder-pressure` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Shoulder-to-Mat Escape `bjj__shoulder-to-mat-escape` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Side Control → Armbar `bjj__side-control-armbar` | 주짓수 | B | 서브미션 (Submission) | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Side Control Transition `bjj__side-control-transition` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Single Leg Entry `bjj__single-leg-entry` | 주짓수 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Single Leg Finish `bjj__single-leg-finish` | 주짓수 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| Single Leg X `bjj__single-leg-x` | 주짓수 | B | 테이크다운 (Takedown) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Sit-Up Guard `bjj__sit-up-guard` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Sit-Up Sweep `bjj__sit-up-sweep` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Smash Pass `bjj__smash-pass` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Stack Pass `bjj__stack-pass` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Standard Ashi `bjj__standard-ashi` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 Leg Entanglement Scramble(레그락 진입); S2 small joint manipulation만 반칙 |
| Standing Guard Break `bjj__standing-guard-break` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Straight Ankle Lock `bjj__straight-ankle-lock` | 주짓수 | B | 서브미션 (Submission) | S1 Leg Entanglement Scramble(레그락 진입); S2 small joint manipulation만 반칙 |
| Straight Armbar `bjj__straight-armbar` | 주짓수 | B | 서브미션 (Submission) | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Technical Mount → Back `bjj__technical-mount-back` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 Back Mount Hooks Control, Scramble to Back Take; S2 위반 없음 |
| Technical Mount Transition `bjj__technical-mount-transition` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Technical Mount `bjj__technical-mount` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Technical Stand-Up `bjj__technical-stand-up` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Torreando Pass `bjj__torreando-pass` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Triangle → Armbar `bjj__triangle-armbar` | 주짓수 | B | 서브미션 (Submission) | S1 서브미션(armbar, guillotine, triangle, kimura, RNC) 계열; S2 위반 없음 |
| Turn-In Escape `bjj__turn-in-escape` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Turtle Back Take `bjj__turtle-back-take` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 Back Mount Hooks Control, Scramble to Back Take; S2 위반 없음 |
| Turtle → Back `bjj__turtle-back` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 Back Mount Hooks Control, Scramble to Back Take; S2 위반 없음 |
| Turtle → Crucifix `bjj__turtle-crucifix` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤 / Ground and Pound 계열; S2 위반 없음 |
| Turtle `bjj__turtle` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Underhook Escape `bjj__underhook-escape` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Underhook Half Guard `bjj__underhook-half-guard` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Underhook Sweep `bjj__underhook-sweep` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Wrestle-Up `bjj__wrestle-up` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| Wrist Control `bjj__wrist-control` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| Z Guard `bjj__z-guard` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 그라운드 컨트롤(closed/half guard, guard recovery); S2 위반 없음 |
| 가드 회복 `bjj__가드-회복` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| 거리 확보 `bjj__거리-확보` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 Framing / Guard Recovery Under Strikes; S2 위반 없음 |
| 마운트 탈출 `bjj__마운트-탈출` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| 목 프레임 `bjj__목-프레임` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 Framing / Guard Recovery Under Strikes; S2 위반 없음 |
| 무릎 프레임 `bjj__무릎-프레임` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 Framing / Guard Recovery Under Strikes; S2 위반 없음 |
| 사이드 컨트롤 탈출 `bjj__사이드-컨트롤-탈출` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| 손목 그립 `bjj__손목-그립` | 주짓수 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg, Clinch Takedown Entry, Cage Wrestling); 도복 불필요, S2 위반 없음 |
| 스크램블 시작 `bjj__스크램블-시작` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| 스탠딩 복귀 `bjj__스탠딩-복귀` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| 어깨 프레임 `bjj__어깨-프레임` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 Framing / Guard Recovery Under Strikes; S2 위반 없음 |
| 엉덩이 프레임 `bjj__엉덩이-프레임` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 Framing / Guard Recovery Under Strikes; S2 위반 없음 |
| 포지션 회복 `bjj__포지션-회복` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| 하프 가드 회복 `bjj__하프-가드-회복` | 주짓수 | B | 그라운드 컨트롤 (Ground Control) | S1 방어(Framing, Guard Recovery Under Strikes), 스크램블; S2 위반 없음 |
| 1--1--1 `boxing__1-1-1` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| 1--1--2--3 `boxing__1-1-2-3` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| 1--1--2 `boxing__1-1-2` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| 1--2--3--2 `boxing__1-2-3-2` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| 1--2--3--6 `boxing__1-2-3-6` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| 1--2--3 `boxing__1-2-3` | 복싱 | A | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅); S2 해당 없음 |
| 1--2--5 `boxing__1-2-5` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| 1--2 `boxing__1-2` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| 2--3--2 `boxing__2-3-2` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Backfist `boxing__backfist` | 복싱 | B | MMA 복싱 | mmaDataMentions: mixed-martial-arts__spinning-backfist(스피닝 변형); S2 반칙 해당 없음 |
| Block → Counter `boxing__block-counter` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Block `boxing__block` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Body Attack `boxing__body-attack` | 복싱 | B | 스트라이킹 (Striking) | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Body Cover `boxing__body-cover` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Body Cross `boxing__body-cross` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Body--Head Combination `boxing__body-head-combination` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Body Hook `boxing__body-hook` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Body Jab `boxing__body-jab` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Body Uppercut `boxing__body-uppercut` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Catch `boxing__catch` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Clinch Escape `boxing__clinch-escape` | 복싱 | B | 클린치 (Clinch) | S1 Dirty Boxing·Clinch Takedown Entry(목/팔 컨트롤 클린치); S2 도복 없이 가능, 반칙 해당 없음 |
| Clinch `boxing__clinch` | 복싱 | A | 클린치 (Clinch) | mmaDataMentions: mixed-martial-arts__clinch-takedown-entry, clinch-to-cage-transition; S2 해당 없음 |
| Combination Pressure `boxing__combination-pressure` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Combination `boxing__combination` | 복싱 | A | MMA 복싱 | mmaDataMentions: mixed-martial-arts__mma-boxing-combination; S2 해당 없음 |
| Double Forearm Guard `boxing__double-forearm-guard` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Double Jab Entry `boxing__double-jab-entry` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Double Parry `boxing__double-parry` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Double Slip `boxing__double-slip` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Downward Parry `boxing__downward-parry` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Drop Step `boxing__drop-step` | 복싱 | B | 스트라이킹 (Striking) | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Duck `boxing__duck` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Elbow Block `boxing__elbow-block` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Elbow Guard `boxing__elbow-guard` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Feint → Double Jab `boxing__feint-double-jab` | 복싱 | B | MMA 복싱 | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Feint → Double `boxing__feint-double` | 복싱 | B | 스트라이킹 (Striking) | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Feint → Entry `boxing__feint-entry` | 복싱 | B | 스트라이킹 (Striking) | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Feint `boxing__feint` | 복싱 | B | 스트라이킹 (Striking) | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Frame/Guard `boxing__frame-guard` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Frame `boxing__frame` | 복싱 | B | 스트라이킹 (Striking) | S1 Framing·Dirty Boxing(프레임/컨트롤); S2 해당 없음 |
| Hand Fighting `boxing__hand-fighting` | 복싱 | B | 스트라이킹 (Striking) | S1 Dirty Boxing·Clinch Takedown Entry(목/팔 컨트롤 클린치); S2 도복 없이 가능, 반칙 해당 없음 |
| Head--Body Combination `boxing__head-body-combination` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Hook to Body `boxing__hook-to-body` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Hook `boxing__hook` | 복싱 | A | MMA 복싱 | mmaDataMentions: mixed-martial-arts__check-hook, mma-boxing-combination(잽-크로스-훅); S2 해당 없음 |
| In-and-Out `boxing__in-and-out` | 복싱 | B | 스트라이킹 (Striking) | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Inside Position `boxing__inside-position` | 복싱 | B | 스트라이킹 (Striking) | S1 Dirty Boxing·Clinch Takedown Entry(목/팔 컨트롤 클린치); S2 도복 없이 가능, 반칙 해당 없음 |
| Jab Feint → Cross `boxing__jab-feint-cross` | 복싱 | B | MMA 복싱 | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Jab Feint `boxing__jab-feint` | 복싱 | B | MMA 복싱 | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Jab to Body `boxing__jab-to-body` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| L-Step `boxing__l-step` | 복싱 | B | 스트라이킹 (Striking) | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Lateral Step `boxing__lateral-step` | 복싱 | B | 스트라이킹 (Striking) | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Lead Hand Parry `boxing__lead-hand-parry` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Long Guard `boxing__long-guard` | 복싱 | B | 방어 (Defense) | S1 Range Management·MMA Boxing Combination(MMA 스탠스/가드); S2 해당 없음 |
| Parry → Cross `boxing__parry-cross` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Parry → Jab `boxing__parry-jab` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Pivot → Hook `boxing__pivot-hook` | 복싱 | B | MMA 복싱 | S1 Check Hook(축 회전 훅 카운터); S2 해당 없음 |
| Pull → Cross `boxing__pull-cross` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Pump Feint `boxing__pump-feint` | 복싱 | B | 스트라이킹 (Striking) | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Rear Hand Parry `boxing__rear-hand-parry` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Rear Overhand `boxing__rear-overhand` | 복싱 | A | MMA 복싱 | S1 Overhand [MMA 복싱]; S2 해당 없음 |
| Roll → Hook `boxing__roll-hook` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Roll → Uppercut `boxing__roll-uppercut` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Short Hook `boxing__short-hook` | 복싱 | A | MMA 복싱 | S1 Dirty Boxing(짧은 훅과 어퍼컷); S2 해당 없음 |
| Short Uppercut `boxing__short-uppercut` | 복싱 | A | MMA 복싱 | S1 Dirty Boxing(짧은 훅과 어퍼컷); S2 해당 없음 |
| Shoulder Control `boxing__shoulder-control` | 복싱 | B | 클린치 (Clinch) | S1 Dirty Boxing·Clinch Takedown Entry(목/팔 컨트롤 클린치); S2 도복 없이 가능, 반칙 해당 없음 |
| Shovel Hook `boxing__shovel-hook` | 복싱 | B | MMA 복싱 | S1 Dirty Boxing(짧은 훅/어퍼컷 계열); S2 해당 없음 |
| Side Step `boxing__side-step` | 복싱 | B | 방어 (Defense) | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Slip → Cross `boxing__slip-cross` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Slip → Hook `boxing__slip-hook` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Slip Inside `boxing__slip-inside` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Slip Outside `boxing__slip-outside` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Step Around `boxing__step-around` | 복싱 | B | 스트라이킹 (Striking) | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Step Away `boxing__step-away` | 복싱 | B | 방어 (Defense) | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Step Back → Cross `boxing__step-back-cross` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Step Back `boxing__step-back` | 복싱 | B | 스트라이킹 (Striking) | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Step Out `boxing__step-out` | 복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Straight Punches `boxing__straight-punches` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Uppercut `boxing__uppercut` | 복싱 | B | MMA 복싱 | S1 MMA Boxing Combination·Dirty Boxing(어퍼컷); S2 해당 없음 |
| Wrist Control `boxing__wrist-control` | 복싱 | B | 클린치 (Clinch) | S1 Dirty Boxing·Clinch Takedown Entry(목/팔 컨트롤 클린치); S2 도복 없이 가능, 반칙 해당 없음 |
| 리드 핸드 컨트롤 `boxing__리드-핸드-컨트롤` | 복싱 | B | 스트라이킹 (Striking) | S1 MMA Boxing Combination·Range Management; S2 장갑을 잡는 것은 반칙이므로 누르기/걷어내기만 해당 |
| 크로스 스텝 `boxing__크로스-스텝` | 복싱 | B | 스트라이킹 (Striking) | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Bridge `judo__bridge` | 유도 | B | 그라운드 컨트롤 (Ground Control) | S1 Defense/Framing·Guard Recovery; no gi |
| De Ashi Barai `judo__de-ashi-barai` | 유도 | B | 테이크다운 (Takedown) | S1 Reactive Takedown; S2 legal |
| Frame `judo__frame` | 유도 | B | 그라운드 컨트롤 (Ground Control) | S1 Framing (Defense); no gi |
| Guard Recovery `judo__guard-recovery` | 유도 | A | 그라운드 컨트롤 (Ground Control) | mmaDataMentions: Guard Recovery Under Strikes |
| Kami Shiho Gatame `judo__kami-shiho-gatame` | 유도 | B | 그라운드 컨트롤 (Ground Control) | S1 Ground Control; no gi |
| Kata Gatame `judo__kata-gatame` | 유도 | B | 그라운드 컨트롤 (Ground Control) | S1 Ground Control/Submission; no gi |
| Kesa Gatame `judo__kesa-gatame` | 유도 | B | 그라운드 컨트롤 (Ground Control) | S1 Ground Control; no gi |
| Kibisu Gaeshi `judo__kibisu-gaeshi` | 유도 | B | 테이크다운 (Takedown) | S1 takedowns (ankle pick); no gi |
| Koshi Guruma `judo__koshi-guruma` | 유도 | B | 테이크다운 (Takedown) | S1 Clinch Takedown Entry (neck control); no gi |
| Kosoto Gake `judo__kosoto-gake` | 유도 | B | 테이크다운 (Takedown) | S1 Clinch Takedown Entry; no gi |
| Kouchi Gari `judo__kouchi-gari` | 유도 | B | 테이크다운 (Takedown) | S1 Clinch Takedown Entry/Cage Wrestling; no gi |
| Kuzure Kesa Gatame `judo__kuzure-kesa-gatame` | 유도 | B | 그라운드 컨트롤 (Ground Control) | S1 Ground Control; no gi |
| O Goshi `judo__o-goshi` | 유도 | B | 테이크다운 (Takedown) | S1 Clinch Takedown Entry (underhook/body); no gi |
| Osoto Gari `judo__osoto-gari` | 유도 | B | 테이크다운 (Takedown) | S1 Clinch Takedown Entry / Cage Wrestling; S2 legal, no gi needed |
| Ouchi Gari `judo__ouchi-gari` | 유도 | B | 테이크다운 (Takedown) | S1 Clinch Takedown Entry/Cage Wrestling; no gi |
| Tate Shiho Escape `judo__tate-shiho-escape` | 유도 | B | 그라운드 컨트롤 (Ground Control) | S1 Defense/Guard Recovery; no gi |
| Tate Shiho Gatame `judo__tate-shiho-gatame` | 유도 | B | 그라운드 컨트롤 (Ground Control) | S1 Posture Control in Mount; no gi |
| Two-on-One `judo__two-on-one` | 유도 | B | 클린치 (Clinch) | S1 Clinch(arm control)/Cage Wrestling; no gi |
| Uchi Mata `judo__uchi-mata` | 유도 | A | 테이크다운 (Takedown) | mmaDataMentions: Uchi Mata to Armbar |
| Ude Garami `judo__ude-garami` | 유도 | B | 서브미션 (Submission) | S1 Submission (kimura); S2 legal |
| Ura Nage `judo__ura-nage` | 유도 | B | 테이크다운 (Takedown) | S1 Clinch Takedown Entry; S2 legal if not spiking |
| Yoko Shiho Escape `judo__yoko-shiho-escape` | 유도 | B | 그라운드 컨트롤 (Ground Control) | S1 Defense/Guard Recovery; no gi |
| Yoko Shiho Gatame `judo__yoko-shiho-gatame` | 유도 | B | 그라운드 컨트롤 (Ground Control) | S1 Ground Control; no gi |
| Clinch (근접 컨트롤) `karate__clinch` | 가라테 | B | 클린치 (Clinch) | mmaDataMentions: clinch-takedown-entry, clinch-to-cage-transition |
| Feint `karate__feint` | 가라테 | B | 스트라이킹 (Striking) | mmaDataMentions: mixed-martial-arts__takedown-setup(타격 페인트) |
| Kansetsu Geri `karate__kansetsu-geri` | 가라테 | B | 방어 (Defense) | S1 Oblique Kick(무릎 찍어차기); S2 위반 없음 |
| Mawashi Empi `karate__mawashi-empi` | 가라테 | B | 스트라이킹 (Striking) | S1 Elbow Strikes from Top Position / 클린치; S2 위반 없음 |
| Tettsui-uchi `karate__tettsui-uchi` | 가라테 | B | MMA 복싱 | S1 Ground and Pound from Mount; 뒤통수 금지 외 합법(S2) |
| Angle Counter `kickboxing__angle-counter` | 킥복싱 | B | MMA 복싱 | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Angle Out `kickboxing__angle-out` | 킥복싱 | B | 방어 (Defense) | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Angle Step `kickboxing__angle-step` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Back Kick `kickboxing__back-kick` | 킥복싱 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Bladed Stance `kickboxing__bladed-stance` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Range Management·MMA Boxing Combination(MMA 스탠스/가드); S2 해당 없음 |
| Body Kick `kickboxing__body-kick` | 킥복싱 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Break and Strike `kickboxing__break-and-strike` | 킥복싱 | B | 클린치 (Clinch) | S1 Dirty Boxing; S2 휴식/브레이크 중 공격만 반칙, 스스로 풀며 치는 것은 합법 |
| Catch `kickboxing__catch` | 킥복싱 | B | 방어 (Defense) | S1 Reactive Takedown·Clinch Takedown Entry; S2 합법 |
| Check and Return `kickboxing__check-and-return` | 킥복싱 | B | 방어 (Defense) | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Check → Return Kick `kickboxing__check-return-kick` | 킥복싱 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Check `kickboxing__check` | 킥복싱 | B | 방어 (Defense) | S1 MMA 킥복싱(로우킥/카프킥 존재 → 방어 필요); S2 해당 없음 |
| Circle Out `kickboxing__circle-out` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Range Management·Cage Wrestling(케이지 회피); S2 해당 없음 |
| Collar Tie → Short Knee `kickboxing__collar-tie-short-knee` | 킥복싱 | B | 클린치 (Clinch) | S1 Dirty Boxing(목 컨트롤·클린치 니); S2 도복 불필요, 합법 |
| Cover `kickboxing__cover` | 킥복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Cross Counter `kickboxing__cross-counter` | 킥복싱 | B | MMA 복싱 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Cross → Hook → High Kick `kickboxing__cross-hook-high-kick` | 킥복싱 | B | MMA 킥복싱 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Cut-Off `kickboxing__cut-off` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Clinch to Cage Transition·Range Management; S2 해당 없음 |
| Diagonal Elbow `kickboxing__diagonal-elbow` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Feint Chain `kickboxing__feint-chain` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Flying Knee `kickboxing__flying-knee` | 킥복싱 | B | MMA 킥복싱 | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Foot Feint `kickboxing__foot-feint` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Front Kick `kickboxing__front-kick` | 킥복싱 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Hand Feint → Body Kick `kickboxing__hand-feint-body-kick` | 킥복싱 | B | MMA 킥복싱 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Hand Feint `kickboxing__hand-feint` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| High Guard `kickboxing__high-guard` | 킥복싱 | B | 방어 (Defense) | S1 Range Management·MMA Boxing Combination(MMA 스탠스/가드); S2 해당 없음 |
| High Kick `kickboxing__high-kick` | 킥복싱 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Hook Counter `kickboxing__hook-counter` | 킥복싱 | B | MMA 복싱 | S1 Check Hook; S2 해당 없음 |
| Horizontal Elbow `kickboxing__horizontal-elbow` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Inside Control `kickboxing__inside-control` | 킥복싱 | B | 클린치 (Clinch) | S1 Dirty Boxing·Clinch Takedown Entry(목/팔 컨트롤 클린치); S2 도복 없이 가능, 반칙 해당 없음 |
| Jab → Body Kick `kickboxing__jab-body-kick` | 킥복싱 | B | MMA 킥복싱 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Jab Counter `kickboxing__jab-counter` | 킥복싱 | B | MMA 복싱 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Jab → Cross → Body Kick `kickboxing__jab-cross-body-kick` | 킥복싱 | B | MMA 킥복싱 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Jab → Cross → Low Kick `kickboxing__jab-cross-low-kick` | 킥복싱 | B | MMA 킥복싱 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Jab → Hook → Low Kick `kickboxing__jab-hook-low-kick` | 킥복싱 | B | MMA 킥복싱 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Jumping Knee `kickboxing__jumping-knee` | 킥복싱 | B | MMA 킥복싱 | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Kick After Punch `kickboxing__kick-after-punch` | 킥복싱 | B | MMA 킥복싱 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Kick Feint → Low Kick `kickboxing__kick-feint-low-kick` | 킥복싱 | B | MMA 킥복싱 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Kick Feint `kickboxing__kick-feint` | 킥복싱 | B | MMA 킥복싱 | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Lead Knee `kickboxing__lead-knee` | 킥복싱 | B | MMA 킥복싱 | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Lean Back `kickboxing__lean-back` | 킥복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Level Change Feint → High Kick `kickboxing__level-change-feint-high-kick` | 킥복싱 | B | MMA 킥복싱 | S1 Strike to Takedown Transition·MMA 킥복싱; S2 해당 없음 |
| Level Change Feint `kickboxing__level-change-feint` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Strike to Takedown Transition·Level Change Double Leg; S2 해당 없음 |
| Low Kick → Cross `kickboxing__low-kick-cross` | 킥복싱 | B | MMA 킥복싱 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Off-Balance `kickboxing__off-balance` | 킥복싱 | B | 클린치 (Clinch) | S1 Clinch Takedown Entry; S2 해당 없음 |
| Orthodox `kickboxing__orthodox` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Range Management·MMA Boxing Combination(MMA 스탠스/가드); S2 해당 없음 |
| Parry Counter `kickboxing__parry-counter` | 킥복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Parry → Jab / Cross `kickboxing__parry-jab-cross` | 킥복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Parry `kickboxing__parry` | 킥복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Pivot `kickboxing__pivot` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Pull `kickboxing__pull` | 킥복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Punch After Kick `kickboxing__punch-after-kick` | 킥복싱 | B | MMA 킥복싱 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Rear Knee `kickboxing__rear-knee` | 킥복싱 | B | MMA 킥복싱 | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Roll `kickboxing__roll` | 킥복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Round Kick `kickboxing__round-kick` | 킥복싱 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Shin Block `kickboxing__shin-block` | 킥복싱 | B | 방어 (Defense) | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Short Knee `kickboxing__short-knee` | 킥복싱 | B | 클린치 (Clinch) | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Shoulder Feint `kickboxing__shoulder-feint` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Strike to Takedown Transition·MMA Boxing Combination(페인트/레벨체인지로 셋업); S2 해당 없음 |
| Shuffle `kickboxing__shuffle` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Side Kick `kickboxing__side-kick` | 킥복싱 | B | MMA 킥복싱 | S1 Oblique Kick(직선으로 찍어 차는 킥) 계열; S2 합법 |
| Slip Counter `kickboxing__slip-counter` | 킥복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Slip `kickboxing__slip` | 킥복싱 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Southpaw `kickboxing__southpaw` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Range Management·MMA Boxing Combination(MMA 스탠스/가드); S2 해당 없음 |
| Square Stance `kickboxing__square-stance` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Range Management·MMA Boxing Combination(MMA 스탠스/가드); S2 해당 없음 |
| Step-and-Slide `kickboxing__step-and-slide` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Step Forward `kickboxing__step-forward` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Straight Knee `kickboxing__straight-knee` | 킥복싱 | B | MMA 킥복싱 | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Switch Kick → Cross `kickboxing__switch-kick-cross` | 킥복싱 | B | MMA 킥복싱 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Switch Stance `kickboxing__switch-stance` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Range Management·MMA Boxing Combination(MMA 스탠스/가드); S2 해당 없음 |
| Switch Step `kickboxing__switch-step` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Teep → Jab `kickboxing__teep-jab` | 킥복싱 | B | MMA 킥복싱 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Teep `kickboxing__teep` | 킥복싱 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Upward Elbow `kickboxing__upward-elbow` | 킥복싱 | B | 스트라이킹 (Striking) | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Basic Footwork `muay-thai__basic-footwork` | 무에타이 | B | 스트라이킹 (Striking) | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Body Kick Check `muay-thai__body-kick-check` | 무에타이 | B | 방어 (Defense) | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Body Teep `muay-thai__body-teep` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Catch and Dump `muay-thai__catch-and-dump` | 무에타이 | B | 방어 (Defense) | S1 Reactive Takedown; S2 합법 |
| Catch and Return `muay-thai__catch-and-return` | 무에타이 | B | MMA 킥복싱 | S1 Reactive Takedown·MMA Boxing Combination; S2 합법 |
| Catch and Sweep `muay-thai__catch-and-sweep` | 무에타이 | B | 방어 (Defense) | S1 Reactive Takedown; S2 합법 |
| Clinch Knee `muay-thai__clinch-knee` | 무에타이 | A | 클린치 (Clinch) | S1 Dirty Boxing(무에타이 클린치 니); S2 스탠딩 상대 니 합법 |
| Counter Elbow `muay-thai__counter-elbow` | 무에타이 | B | 스트라이킹 (Striking) | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Counter Knee `muay-thai__counter-knee` | 무에타이 | B | MMA 킥복싱 | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Cross--Body Kick `muay-thai__cross-body-kick` | 무에타이 | B | MMA 킥복싱 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Cross → Hook `muay-thai__cross-to-hook` | 무에타이 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Cross → Low Kick `muay-thai__cross-to-low-kick` | 무에타이 | B | MMA 킥복싱 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Diagonal Knee `muay-thai__diagonal-knee` | 무에타이 | B | 클린치 (Clinch) | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Elbow Entry `muay-thai__elbow-entry` | 무에타이 | B | 클린치 (Clinch) | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Elbow from Clinch `muay-thai__elbow-from-clinch` | 무에타이 | B | 클린치 (Clinch) | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Elbow Guard `muay-thai__elbow-guard` | 무에타이 | B | MMA 킥복싱 | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Elbow Shield `muay-thai__elbow-shield` | 무에타이 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Evade `muay-thai__evade` | 무에타이 | B | 방어 (Defense) | S1 Range Management(MMA 거리 조절 풋워크); S2 해당 없음 |
| Face-Level Teep `muay-thai__face-level-teep` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Guard `muay-thai__guard` | 무에타이 | B | 방어 (Defense) | S1 Range Management·MMA Boxing Combination(MMA 스탠스/가드); S2 해당 없음 |
| Hook--Low Kick `muay-thai__hook-low-kick` | 무에타이 | B | MMA 킥복싱 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Inside Low Kick `muay-thai__inside-low-kick` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Jab--Cross--Hook `muay-thai__jab-cross-hook` | 무에타이 | A | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅); S2 해당 없음 |
| Jab → Cross `muay-thai__jab-to-cross` | 무에타이 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Jab → Hook `muay-thai__jab-to-hook` | 무에타이 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Jab → Low Kick `muay-thai__jab-to-low-kick` | 무에타이 | B | MMA 킥복싱 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Kick Catch to Counter `muay-thai__kick-catch-to-counter` | 무에타이 | B | MMA 킥복싱 | S1 Reactive Takedown; S2 합법 |
| Kick Parry `muay-thai__kick-parry` | 무에타이 | B | 방어 (Defense) | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Lead Low Kick `muay-thai__lead-low-kick` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Lead Round Kick `muay-thai__lead-round-kick` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Lead Teep `muay-thai__lead-teep` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Long Elbow `muay-thai__long-elbow` | 무에타이 | B | 스트라이킹 (Striking) | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Long Guard Punch `muay-thai__long-guard-punch` | 무에타이 | B | 방어 (Defense) | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Low Kick after Punch `muay-thai__low-kick-after-punch` | 무에타이 | B | MMA 킥복싱 | S1 MMA Boxing Combination + MMA 킥복싱(펀치-킥 연결); S2 해당 없음 |
| Low Kick after Teep `muay-thai__low-kick-after-teep` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Low Kick Counter `muay-thai__low-kick-counter` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Outside Control `muay-thai__outside-control` | 무에타이 | B | 클린치 (Clinch) | S1 Dirty Boxing·Clinch Takedown Entry(목/팔 컨트롤 클린치); S2 도복 없이 가능, 반칙 해당 없음 |
| Outside Low Kick `muay-thai__outside-low-kick` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Push Teep `muay-thai__push-teep` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Rear Low Kick `muay-thai__rear-low-kick` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Rear Round Kick `muay-thai__rear-round-kick` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Rear Teep `muay-thai__rear-teep` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Shell `muay-thai__shell` | 무에타이 | B | 스트라이킹 (Striking) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Short Elbow `muay-thai__short-elbow` | 무에타이 | B | 스트라이킹 (Striking) | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Shoulder Block `muay-thai__shoulder-block` | 무에타이 | B | 방어 (Defense) | S1 MMA Boxing Combination·Range Management(MMA 거리에서의 복싱 방어/회피); S2 반칙 해당 없음 |
| Side Knee `muay-thai__side-knee` | 무에타이 | B | MMA 킥복싱 | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Side Teep `muay-thai__side-teep` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Sok Phung `muay-thai__sok-phung` | 무에타이 | B | 스트라이킹 (Striking) | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Spinning Back Kick `muay-thai__spinning-back-kick` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Spinning Elbow `muay-thai__spinning-elbow` | 무에타이 | B | 스트라이킹 (Striking) | S1 Elbow Strikes from Top Position·Dirty Boxing(엘보 사용); S2 Downward pointing elbow 외 엘보는 합법 |
| Step-Up Kick `muay-thai__step-up-kick` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Step-Up Knee `muay-thai__step-up-knee` | 무에타이 | B | MMA 킥복싱 | S1 Dirty Boxing(무에타이 클린치 니)·Sprawl to Strikes(니); S2 스탠딩 상대 니는 합법(그라운드 상대 머리 니만 반칙) |
| Superman Punch `muay-thai__superman-punch` | 무에타이 | B | MMA 복싱 | S1 MMA Boxing Combination(잽-크로스-훅 등 복싱 펀치·콤비네이션) / Range Management; S2 반칙·복장 해당 없음 |
| Sweep / Foot Sweep `muay-thai__sweep-foot-sweep` | 무에타이 | B | 클린치 (Clinch) | S1 Clinch Takedown Entry; S2 합법 |
| Switch Kick `muay-thai__switch-kick` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Switch Low Kick `muay-thai__switch-low-kick` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Tae Chiang `muay-thai__tae-chiang` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Teep Catch `muay-thai__teep-catch` | 무에타이 | B | 방어 (Defense) | S1 Reactive Takedown; S2 합법 |
| Teep Counter `muay-thai__teep-counter` | 무에타이 | B | MMA 킥복싱 | S1 Oblique Kick(전진 억제 견제); S2 합법 |
| Teep Stop `muay-thai__teep-stop` | 무에타이 | B | 방어 (Defense) | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Teep to Leg `muay-thai__teep-to-leg` | 무에타이 | B | MMA 킥복싱 | S1 Oblique Kick(무릎/대퇴 직선 킥); S2 합법 |
| Thigh Kick `muay-thai__thigh-kick` | 무에타이 | B | MMA 킥복싱 | S1 MMA 킥복싱(Calf Kick·Oblique Kick·로우킥 등 킥 사용); S2 스탠딩 상대에 대한 킥은 합법 |
| Tud `muay-thai__tud` | 무에타이 | B | 클린치 (Clinch) | S1 Clinch Takedown Entry; S2 머리/목 스파이크만 반칙 |
| Turn `muay-thai__turn` | 무에타이 | B | 클린치 (Clinch) | S1 Dirty Boxing·Clinch Takedown Entry(목/팔 컨트롤 클린치); S2 도복 없이 가능, 반칙 해당 없음 |
| 잡힌 다리를 빠르게 접어 빼기 `muay-thai__잡힌-다리를-빠르게-접어-빼기` | 무에타이 | B | MMA 킥복싱 | S1 Reactive Takedown·Takedown Defense(MMA); S2 해당 없음 |
| Back Escape `sambo__back-escape` | 삼보 | B | 그라운드 컨트롤 (Ground Control) | S1 Back Mount Hooks Control (opponent side); no gi |
| Fireman's Carry `sambo__fireman-s-carry` | 삼보 | B | 테이크다운 (Takedown) | S1 Takedown/Clinch Takedown; no gi |
| Frame Escape `sambo__frame-escape` | 삼보 | B | 그라운드 컨트롤 (Ground Control) | S1 Framing (Defense); no gi |
| Front Headlock Choke `sambo__front-headlock-choke` | 삼보 | B | 서브미션 (Submission) | S1 Submission (guillotine); no gi |
| Grip Fight → Takedown → Leg Lock Entry `sambo__grip-fight-takedown-leg-lock-entry` | 삼보 | A | 테이크다운 (Takedown) | mmaDataMentions: Leg Entanglement Scramble |
| Ground Striking `sambo__ground-striking` | 삼보 | B | 그라운드 컨트롤 (Ground Control) | S1 Ground & Pound; S2 legal within fouls |
| Guard Sweep `sambo__guard-sweep` | 삼보 | B | 그라운드 컨트롤 (Ground Control) | S1 Ground Control (closed/half guard); no gi |
| Guard (클로즈드/오픈) `sambo__guard` | 삼보 | A | 그라운드 컨트롤 (Ground Control) | mmaDataMentions: Guard Recovery Under Strikes, Short Elbows in Half Guard |
| Single Leg → Top Control, Body Lock → Throw → Control `sambo__single-leg-top-control-body-lock-throw-control` | 삼보 | B | 테이크다운 (Takedown) | S1 Takedown / Strike-Takedown Transitions; no gi |
| Single Leg `sambo__single-leg` | 삼보 | A | 테이크다운 (Takedown) | mmaDataMentions: Single Leg to Ankle Lock |
| Throw → Side Control / Mount / Turtle Control `sambo__throw-side-control-mount-turtle-control` | 삼보 | A | 테이크다운 (Takedown) | mmaDataMentions: Posture Control in Mount, Back Mount Hooks Control, Mount Pass |
| Wrist Grip / Кисть 제어 `sambo__wrist-grip-кисть-제어` | 삼보 | B | 클린치 (Clinch) | S1 Dirty Boxing/Clinch (arm control); no gi |
| боковая подсечка `sambo__боковая-подсечка` | 삼보 | B | 테이크다운 (Takedown) | S1 Reactive Takedown; no gi |
| Бросок через бедро `sambo__бросок-через-бедро` | 삼보 | B | 테이크다운 (Takedown) | S1 Clinch Takedown Entry; no gi |
| Забегание за спину `sambo__забегание-за-спину` | 삼보 | B | 그라운드 컨트롤 (Ground Control) | S1 Scramble to Back Take; no gi |
| Зацеп `sambo__зацеп` | 삼보 | B | 테이크다운 (Takedown) | S1 Clinch Takedown Entry/Cage Wrestling; no gi |
| Мельница `sambo__мельница` | 삼보 | B | 테이크다운 (Takedown) | S1 Takedown; no gi |
| Отхват `sambo__отхват` | 삼보 | B | 테이크다운 (Takedown) | S1 Clinch Takedown Entry; no gi |
| Перевод в партер(파르테르로 전환시키기) `sambo__перевод-в-партер-파르테르로-전환시키기` | 삼보 | B | 그라운드 컨트롤 (Ground Control) | S1 Takedown to Ground and Pound Transition |
| рычаг бедра `sambo__рычаг-бедра` | 삼보 | B | 서브미션 (Submission) | S1 leg entanglements/leg-lock entries; S2 legal |
| рычаг локтя `sambo__рычаг-локтя` | 삼보 | B | 서브미션 (Submission) | S1 Submission (armbar); S2 legal |
| рычаг стопы `sambo__рычаг-стопы` | 삼보 | B | 서브미션 (Submission) | S1 leg-lock entries (Single Leg to Ankle Lock); S2 legal |
| с захватом шеи `sambo__с-захватом-шеи` | 삼보 | B | 테이크다운 (Takedown) | S1 Clinch (neck control) Takedown; no gi |
| Удержание верхом `sambo__удержание-верхом` | 삼보 | B | 그라운드 컨트롤 (Ground Control) | S1 Posture Control in Mount; no gi |
| Удержание поперек `sambo__удержание-поперек` | 삼보 | B | 그라운드 컨트롤 (Ground Control) | S1 Ground Control; no gi |
| Удержание сбоку `sambo__удержание-сбоку` | 삼보 | B | 그라운드 컨트롤 (Ground Control) | S1 Ground Control; no gi |
| Удержание со стороны головы `sambo__удержание-со-стороны-головы` | 삼보 | B | 그라운드 컨트롤 (Ground Control) | S1 Ground Control; no gi |
| узел плеча поперек `sambo__узел-плеча-поперек` | 삼보 | B | 서브미션 (Submission) | S1 Submission; S2 legal |
| узел плеча `sambo__узел-плеча` | 삼보 | B | 서브미션 (Submission) | S1 Submission (kimura); S2 legal |
| узел стопы `sambo__узел-стопы` | 삼보 | B | 서브미션 (Submission) | S1 leg-lock entries; S2 legal (not small joint) |
| 뒷발 돌려차기 `taekwondo__뒷발-돌려차기` | 태권도 | B | MMA 킥복싱 | S1 MMA 킥복싱 |
| 뒷발 밀어차기 `taekwondo__뒷발-밀어차기` | 태권도 | B | MMA 킥복싱 | S1 MMA 킥복싱 |
| 밀어차기 `taekwondo__밀어차기` | 태권도 | B | MMA 킥복싱 | S1 MMA 킥복싱; S2 위반 없음 |
| 앞발 돌려차기 `taekwondo__앞발-돌려차기` | 태권도 | B | MMA 킥복싱 | S1 MMA 킥복싱 |
| 앞발 밀어차기 `taekwondo__앞발-밀어차기` | 태권도 | B | MMA 킥복싱 | S1 MMA 킥복싱 |
| 팔굽치기 `taekwondo__팔굽치기` | 태권도 | B | 스트라이킹 (Striking) | S1 Elbow Strikes from Top Position; S2 Downward pointing elbow 주의 |
| Ankle Pick `wrestling__ankle-pick` | 레슬링 | A | 테이크다운 (Takedown) | mmaDataMentions: mixed-martial-arts__reactive-takedown; S1 테이크다운(ankle pick) |
| Back Step `wrestling__back-step` | 레슬링 | A | 그라운드 컨트롤 (Ground Control) | mmaDataMentions: lead-kick-back-step-double-leg; S2 반칙 아님 |
| Back Trip `wrestling__back-trip` | 레슬링 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Base Building `wrestling__base-building` | 레슬링 | B | 그라운드 컨트롤 (Ground Control) | S1 스크램블(Scramble to Back Take)·그라운드 컨트롤; S2 반칙 아님 |
| Bear Hug `wrestling__bear-hug` | 레슬링 | B | 테이크다운 (Takedown) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Biceps Control `wrestling__biceps-control` | 레슬링 | B | 클린치 (Clinch) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Blast Double `wrestling__blast-double` | 레슬링 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Body Lock Entry `wrestling__body-lock-entry` | 레슬링 | B | 테이크다운 (Takedown) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Body Lock Lift `wrestling__body-lock-lift` | 레슬링 | B | 테이크다운 (Takedown) | S1 Cage Wrestling; S2 스파이킹만 금지 |
| Body Lock Takedown `wrestling__body-lock-takedown` | 레슬링 | B | 테이크다운 (Takedown) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Chest-to-Chest Defense `wrestling__chest-to-chest-defense` | 레슬링 | A | 방어 (Defense) | mmaDataMentions: mixed-martial-arts__fence-takedown-defense |
| Corner Finish `wrestling__corner-finish` | 레슬링 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Crossface `wrestling__crossface` | 레슬링 | B | 방어 (Defense) | S1 방어(Takedown Defense (MMA), Fence Takedown Defense, Sprawl to Strikes); S2 반칙 아님 |
| Double-Leg Down Defense `wrestling__double-leg-down-defense` | 레슬링 | B | 방어 (Defense) | S1 방어(Takedown Defense (MMA), Fence Takedown Defense, Sprawl to Strikes); S2 반칙 아님 |
| Double Leg Finish `wrestling__double-leg-finish` | 레슬링 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Double Leg from Tie `wrestling__double-leg-from-tie` | 레슬링 | B | 테이크다운 (Takedown) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Double Leg from Underhook `wrestling__double-leg-from-underhook` | 레슬링 | B | 테이크다운 (Takedown) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Double-Leg Position `wrestling__double-leg-position` | 레슬링 | B | 클린치 (Clinch) | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Double Underhooks `wrestling__double-underhooks` | 레슬링 | B | 클린치 (Clinch) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Down Block `wrestling__down-block` | 레슬링 | B | 방어 (Defense) | S1 방어(Takedown Defense (MMA), Fence Takedown Defense, Sprawl to Strikes); S2 반칙 아님 |
| Drop Step `wrestling__drop-step` | 레슬링 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Fake Shot `wrestling__fake-shot` | 레슬링 | B | 테이크다운 (Takedown) | S1 Strike to Takedown Transition, Overhand(레벨체인지); S2 반칙 아님 |
| Feint `wrestling__feint` | 레슬링 | B | 테이크다운 (Takedown) | S1 Strike to Takedown Transition; S2 반칙 아님 |
| Front Body Lock `wrestling__front-body-lock` | 레슬링 | B | 클린치 (Clinch) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Front Headlock Defense `wrestling__front-headlock-defense` | 레슬링 | B | 방어 (Defense) | S1 방어(Takedown Defense (MMA), Fence Takedown Defense, Sprawl to Strikes); S2 반칙 아님 |
| Front Headlock to Back `wrestling__front-headlock-to-back` | 레슬링 | B | 그라운드 컨트롤 (Ground Control) | S1 스크램블(Scramble to Back Take)·그라운드 컨트롤; S2 반칙 아님 |
| Front Headlock to Single `wrestling__front-headlock-to-single` | 레슬링 | B | 테이크다운 (Takedown) | S1 Sprawl to Strikes / Takedown Defense (MMA) / Submission Setup(길로틴) — 프론트 헤드락 컨트롤; S2 반칙 아님 |
| Front Headlock `wrestling__front-headlock` | 레슬링 | B | 클린치 (Clinch) | S1 Sprawl to Strikes / Takedown Defense (MMA) / Submission Setup(길로틴) — 프론트 헤드락 컨트롤; S2 반칙 아님 |
| Go-Behind `wrestling__go-behind` | 레슬링 | B | 테이크다운 (Takedown) | S1 스크램블(Scramble to Back Take)·그라운드 컨트롤; S2 반칙 아님 |
| Granby Roll `wrestling__granby-roll` | 레슬링 | A | 그라운드 컨트롤 (Ground Control) | mmaDataMentions: link__mixed-martial-arts__wrestling__granby-roll; S1 Scramble |
| Hand Control `wrestling__hand-control` | 레슬링 | B | 그라운드 컨트롤 (Ground Control) | S1 스크램블(Scramble to Back Take)·그라운드 컨트롤; S2 반칙 아님 |
| Hand Fighting `wrestling__hand-fighting` | 레슬링 | B | 그라운드 컨트롤 (Ground Control) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Head-and-Arm Control `wrestling__head-and-arm-control` | 레슬링 | B | 클린치 (Clinch) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Head Position `wrestling__head-position` | 레슬링 | B | 방어 (Defense) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| High-Crotch Dump `wrestling__high-crotch-dump` | 레슬링 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| High-Crotch Lift `wrestling__high-crotch-lift` | 레슬링 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| High Double `wrestling__high-double` | 레슬링 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| High Single `wrestling__high-single` | 레슬링 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Hip Heist `wrestling__hip-heist` | 레슬링 | B | 그라운드 컨트롤 (Ground Control) | S1 스크램블(Scramble to Back Take)·그라운드 컨트롤; S2 반칙 아님 |
| Hip Pressure `wrestling__hip-pressure` | 레슬링 | B | 방어 (Defense) | S1 방어(Takedown Defense (MMA), Fence Takedown Defense, Sprawl to Strikes); S2 반칙 아님 |
| Inside Control `wrestling__inside-control` | 레슬링 | B | 클린치 (Clinch) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Inside Tie `wrestling__inside-tie` | 레슬링 | B | 클린치 (Clinch) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Inside Trip `wrestling__inside-trip` | 레슬링 | A | 테이크다운 (Takedown) | mmaDataMentions: mixed-martial-arts__body-lock-inside-trip; S2 반칙 아님 |
| Knee Tap from Single `wrestling__knee-tap-from-single` | 레슬링 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Level Change `wrestling__level-change` | 레슬링 | A | 그라운드 컨트롤 (Ground Control) | mmaDataMentions: level-change-double-leg, overhand, check-hook, clinch-takedown-entry; S2 반칙 아님 |
| Lift and Return `wrestling__lift-and-return` | 레슬링 | B | 테이크다운 (Takedown) | S1 Cage Wrestling; S2 머리 스파이킹만 아니면 합법 |
| Lift Finish `wrestling__lift-finish` | 레슬링 | B | 테이크다운 (Takedown) | S1 Level Change Double Leg; S2 스파이킹 금지 범위 외 |
| Mat Return `wrestling__mat-return` | 레슬링 | B | 클린치 (Clinch) | S1 Cage Wrestling; S2 스파이킹 범위 외 |
| Outside Trip `wrestling__outside-trip` | 레슬링 | B | 테이크다운 (Takedown) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Over-Under `wrestling__over-under` | 레슬링 | B | 클린치 (Clinch) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Penetration Step `wrestling__penetration-step` | 레슬링 | B | 그라운드 컨트롤 (Ground Control) | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Rear Body Lock `wrestling__rear-body-lock` | 레슬링 | B | 클린치 (Clinch) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Rear Lift / Return `wrestling__rear-lift-return` | 레슬링 | B | 테이크다운 (Takedown) | S1 Cage Wrestling, Scramble to Back Take |
| Russian Tie Entry `wrestling__russian-tie-entry` | 레슬링 | B | 테이크다운 (Takedown) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Russian Tie `wrestling__russian-tie` | 레슬링 | B | 클린치 (Clinch) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Shot Feint to Set-Up `wrestling__shot-feint-to-set-up` | 레슬링 | B | 테이크다운 (Takedown) | S1 Strike to Takedown Transition; S2 반칙 아님 |
| Single Ankle Pick `wrestling__single-ankle-pick` | 레슬링 | B | 테이크다운 (Takedown) | S1 테이크다운(ankle pick) |
| Single-Leg Down Defense `wrestling__single-leg-down-defense` | 레슬링 | B | 방어 (Defense) | S1 방어(Takedown Defense (MMA), Fence Takedown Defense, Sprawl to Strikes); S2 반칙 아님 |
| Single-Leg Position `wrestling__single-leg-position` | 레슬링 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Single to Back Take `wrestling__single-to-back-take` | 레슬링 | B | 테이크다운 (Takedown) | S1 스크램블(Scramble to Back Take)·그라운드 컨트롤; S2 반칙 아님 |
| Single to Double `wrestling__single-to-double` | 레슬링 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Sit-Out `wrestling__sit-out` | 레슬링 | B | 그라운드 컨트롤 (Ground Control) | S1 스크램블(Scramble to Back Take)·그라운드 컨트롤; S2 반칙 아님 |
| Slide By `wrestling__slide-by` | 레슬링 | B | 테이크다운 (Takedown) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Snap Control `wrestling__snap-control` | 레슬링 | B | 클린치 (Clinch) | S1 Sprawl to Strikes / Takedown Defense (MMA) / Submission Setup(길로틴) — 프론트 헤드락 컨트롤; S2 반칙 아님 |
| Snap Down `wrestling__snap-down` | 레슬링 | B | 테이크다운 (Takedown) | S1 Sprawl to Strikes / Takedown Defense (MMA) / Submission Setup(길로틴) — 프론트 헤드락 컨트롤; S2 반칙 아님 |
| Snatch Single `wrestling__snatch-single` | 레슬링 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Spin Behind `wrestling__spin-behind` | 레슬링 | B | 그라운드 컨트롤 (Ground Control) | S1 스크램블(Scramble to Back Take)·그라운드 컨트롤; S2 반칙 아님 |
| Sprawl to Back `wrestling__sprawl-to-back` | 레슬링 | B | 방어 (Defense) | S1 Sprawl to Strikes, Scramble to Back Take |
| Sprawl to Front Headlock `wrestling__sprawl-to-front-headlock` | 레슬링 | B | 방어 (Defense) | S1 Sprawl to Strikes / Takedown Defense (MMA) / Submission Setup(길로틴) — 프론트 헤드락 컨트롤; S2 반칙 아님 |
| Square Hips `wrestling__square-hips` | 레슬링 | B | 방어 (Defense) | S1 방어(Takedown Defense (MMA), Fence Takedown Defense, Sprawl to Strikes); S2 반칙 아님 |
| Stand-Up to Escape `wrestling__stand-up-to-escape` | 레슬링 | B | 그라운드 컨트롤 (Ground Control) | S1 Cage Wrestling, Scramble; S2 반칙 아님 |
| Stand-Up `wrestling__stand-up` | 레슬링 | B | 그라운드 컨트롤 (Ground Control) | S1 Cage Wrestling, Scramble; S2 반칙 아님 |
| Sweep Single `wrestling__sweep-single` | 레슬링 | B | 테이크다운 (Takedown) | S1 테이크다운(Level Change Double Leg/Reactive Takedown/Cage Wrestling); S2 노기·반칙 아님 |
| Underhook Entry `wrestling__underhook-entry` | 레슬링 | B | 테이크다운 (Takedown) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Whizzer `wrestling__whizzer` | 레슬링 | A | 방어 (Defense) | mmaDataMentions: mixed-martial-arts__takedown-defense-mma; S1 오버훅 |
| Wrestling Stance `wrestling__wrestling-stance` | 레슬링 | B | 그라운드 컨트롤 (Ground Control) | S1 Range Management(테이크다운 대비 낮은 자세), Level Change Double Leg; S2 반칙 아님 |
| Wrist Control `wrestling__wrist-control` | 레슬링 | B | 클린치 (Clinch) | S1 클린치(Clinch Takedown Entry: 언더훅/오버훅 그립, Dirty Boxing 목/팔 컨트롤); S2 노기·반칙 아님 |
| Wrist Peel `wrestling__wrist-peel` | 레슬링 | B | 그라운드 컨트롤 (Ground Control) | S1 스크램블(Scramble to Back Take)·그라운드 컨트롤; S2 반칙 아님 |

## 4. UNDER-LINKING — 추가된 관계 전체

| 기술 | 무술 | 신뢰도 | 근거 / 이유 |
|---|---|---|---|
| Americana `bjj__americana` | 삼보 | A | 삼보 노트형(узел) 락에 Americana 계열이 명시됨. — doc data/raw sambo line 386:  **노트형(узел) --- 회전으로 조이는 락(Kimura·Americana 계열)**  |
| Armbar `bjj__armbar` | 삼보 | A | 삼보 рычаг локтя(암바 계열)와 #Armbar가 등장함. — doc data/raw sambo line 560: #LegLock #Wrestling #Guard #SideControl #Mount #BackControl #Armbar #Kimura #Sweep #Escape #Choke #CombatSamboStriking  |
| Breakdown `bjj__breakdown` | 레슬링 | A | 레슬링 탑 흐름에 Breakdown이 핵심 단계로 명시됨. — doc data/raw wrestling line 538:  → Top Control → Breakdown → Tilt / Turn |
| Kimura `bjj__kimura` | 삼보 | A | 삼보 노트형(узел) 락에 Kimura 계열이 명시됨. — doc data/raw sambo line 386:  **노트형(узел) --- 회전으로 조이는 락(Kimura·Americana 계열)**  |
| Knee on Belly `bjj__knee-on-belly` | 삼보 | A | 삼보 추가 탑 컨트롤에 Knee on Belly가 포함됨. — doc data/raw sambo line 331:  - 추가 탑 컨트롤: Knee on Belly, North-South, Turtle Top, Back Control, Ride, Wrist Control, Leg Control, Belt Control(벨트를 |
| Feint → Entry `boxing__feint-entry` | 킥복싱 | A | 킥복싱 진입 흐름에 Feint → Entry가 명시됨. — doc data/raw kickboxing line 465:  → Teep / Front Kick / Round Kick / Jab → Feint → Entry → Punch Entry / Kick Entry |
| Lateral Step `boxing__lateral-step` | 무에타이 | A | 무에타이 기본 풋워크에 Lateral Step이 포함됨. — doc data/raw muay-thai line 47: - Teep Guard (앞다리를 살짝 띄워 티프로 바로 전환 가능한 준비 자세) - Basic Footwork: Step Forward, Step Back, Lateral Step, Pivot, Switch Step, Skip Step |
| Back Control `judo__back-control` | 삼보 | B | 삼보 추가 탑 컨트롤 목록에 Back Control이 포함됨. — doc data/raw sambo line 559: #Uzel #Ushchemlenie #Achilles #Kneebar #StraightAnkleLock #LegLock #Wrestling #Guard #SideControl #Mount #BackControl #Armbar #Kimura #Sweep #Escape #Chok |
| Turn-In `judo__turn-in` | 레슬링 | A | 레슬링 탈출 목록에 Turn-In이 포함됨. — doc data/raw wrestling line 412: - Base Recovery - Turn-In - Granby |
| Short Punch `karate__short-punch` | 무에타이 | A | 무에타이 근거리 흐름에 Short Punch가 명시됨. — doc data/raw muay-thai line 591: Close Range → Elbow / Knee / Short Punch ↓ (붙잡히면) |
| Body Kick `kickboxing__body-kick` | 가라테 | B | 가라테 해시태그 기술 목록에 #BodyKick이 포함됨. — doc data/raw karate line 630: #Kick #MaeGeri #MawashiGeri #YokoGeri #UshiroGeri #UraMawashiGeri #LowKick #BodyKick #KanshetsuGeri #Block #Uke #GedanBarai #AgeUke #SotoUke #ShutoUke #Naga |
| Low Kick `kickboxing__low-kick` | 가라테 | B | 가라테 해시태그 기술 목록에 #LowKick이 포함됨. — doc data/raw karate line 630: #Kick #MaeGeri #MawashiGeri #YokoGeri #UshiroGeri #UraMawashiGeri #LowKick #BodyKick #KanshetsuGeri #Block #Uke #GedanBarai #AgeUke #SotoUke #ShutoUke #Nagas |
| Pivot `kickboxing__pivot` | 무에타이 | A | 무에타이 기본 풋워크 목록에 Pivot이 포함됨. — doc data/raw muay-thai line 47: - Teep Guard (앞다리를 살짝 띄워 티프로 바로 전환 가능한 준비 자세) - Basic Footwork: Step Forward, Step Back, Lateral Step, Pivot, Switch Step, Skip Step |
| Step Forward `kickboxing__step-forward` | 무에타이 | A | 무에타이 기본 풋워크에 Step Forward가 포함됨. — doc data/raw muay-thai line 47: - Teep Guard (앞다리를 살짝 띄워 티프로 바로 전환 가능한 준비 자세) - Basic Footwork: Step Forward, Step Back, Lateral Step, Pivot, Switch Step, Skip Step |
| Switch Step `kickboxing__switch-step` | 무에타이 | A | 무에타이 기본 풋워크에 Switch Step이 포함됨. — doc data/raw muay-thai line 48: - Basic Footwork: Step Forward, Step Back, Lateral Step, Pivot, Switch Step, Skip Step  |
| Clinch Knee `muay-thai__clinch-knee` | 킥복싱 | B | 킥복싱 해시태그에 #ClinchKnee가 포함됨(룰 허용 시). — doc data/raw kickboxing line 762: #Knee #ClinchKnee #JumpingKnee |
| Cross → Hook `muay-thai__cross-to-hook` | 킥복싱 | B | Cross → Hook → High Kick 콤비네이션의 일부로만 등장함. — doc data/raw kickboxing line 508: - Jab → Hook → Low Kick - Cross → Hook → High Kick - Jab → Body Kick |
| Cross → Low Kick `muay-thai__cross-to-low-kick` | 킥복싱 | B | Jab → Cross → Low Kick 콤비네이션의 일부로만 등장함. — doc data/raw kickboxing line 506:  - Jab → Cross → Low Kick - Jab → Hook → Low Kick |
| Jab → Cross `muay-thai__jab-to-cross` | 킥복싱 | A | 킥복싱 문서에 Jab → Cross 압박/콤비네이션이 나열됨. — doc data/raw kickboxing line 506:  - Jab → Cross → Low Kick - Jab → Hook → Low Kick |
| Jab → Hook `muay-thai__jab-to-hook` | 킥복싱 | B | Jab → Hook → Low Kick 콤비네이션의 일부로만 등장함. — doc data/raw kickboxing line 507: - Jab → Cross → Low Kick - Jab → Hook → Low Kick - Cross → Hook → High Kick |
| Single Leg `sambo__single-leg` | 주짓수 | A | BJJ 문서에 싱글 레그 테이크다운 섹션이 존재함. — doc data/raw bjj line 104:  ### 싱글 레그 (Single Leg)  |
| Single Leg `sambo__single-leg` | 레슬링 | A | 레슬링 문서와 해시태그에 Single Leg가 핵심 기술로 등장함. — doc data/raw wrestling line 83: - Front Headlock - Single-Leg Position - Double-Leg Position |
| Head Position `wrestling__head-position` | 주짓수 | A | BJJ 문서 기술 목록에 Head Position이 나열됨. — doc data/raw bjj line 935: - Underhook - Head Position  |
| Hip Heist `wrestling__hip-heist` | 주짓수 | B | BJJ 라이브러리에 Hip Heist Sweep으로 힙 헤이스트 동작이 쓰임. — library add_teq bjj__hip-heist-sweep: Hip Heist Sweep / 상대의 상체가 들려 자세(Posture)가 무너졌을 때, 몸을 일으켜 엉덩이를 강하게 밀어 넣으며 상대를 넘어뜨리는 스윕 기술입니다. 싯업 가드나 클로즈드 가드 상태에서 상대가 상체를 세우거나 방어 태세를 취할  |

## 5. OVER-MERGING / identity 자동 검사

- 패턴 A (같은 이름이 여러 canonical에 존재): 14건 — 모두 "다른 기술"로 검토된 쌍 (excluded/REVIEW)
- 패턴 B (canonical 하나에 서로 다른 이름 3개 이상): 13건 — 모두 근거가 기록된 병합 (무술별 표기 차이: Mae Geri·앞차기·Front Kick 등)
  - `boxing__backfist`: boxing:Backfist · kickboxing:Backfist · muay-thai:Backfist · karate:Uraken-uchi · taekwondo:등주먹 — 여러 무술에 같은 이름·같은 동작으로 수록
  - `kickboxing__front-kick`: kickboxing:Front Kick · karate:Mae Geri · taekwondo:앞차기 — 마에게리 = 앞차기 = 프론트 킥 (가라테 데이터의 한국어명 "앞차기")
  - `kickboxing__side-kick`: kickboxing:Side Kick · karate:Yoko Geri · taekwondo:옆차기 — 요코게리 = 옆차기 = 사이드 킥
  - `kickboxing__round-kick`: kickboxing:Round Kick · karate:Mawashi Geri · taekwondo:돌려차기 — 마와시게리 = 돌려차기 = 라운드 킥
  - `kickboxing__back-kick`: kickboxing:Back Kick · karate:Ushiro Geri · taekwondo:뒤차기 — 우시로게리 = 뒤차기 = 백 킥 (회전 없이 뒤로 뻗는 차기)
  - `kickboxing__crescent-kick`: kickboxing:Crescent Kick · karate:Mikazuki Geri · taekwondo:반달차기 — 미카즈키게리(데이터 한국어명 "반달차기") = 반달차기 = 크레센트 킥 — 막기를 걷어내는 곡선 차기
  - `kickboxing__axe-kick`: kickboxing:Axe Kick · karate:Kakato Geri · taekwondo:내려차기 — 가카토게리(뒤꿈치차기/도끼차기) = 내려차기 = 액스 킥
  - `bjj__overhook`: bjj:Overhook · kickboxing:Overhook · wrestling:Overhook / Whizzer · bjj:오버훅 — 여러 무술에 같은 이름·같은 동작으로 수록
  - `judo__sleeve-grip`: judo:Sleeve Grip · bjj:슬리브 그립 · sambo:Sleeve Grip / Захват за рукав — 같은 도복 소매 그립 (삼보는 러시아어 병기)
  - `judo__lapel-grip`: judo:Lapel Grip · bjj:칼라 그립 · sambo:Collar/Lapel Grip / Ворот — 같은 도복 깃(칼라/라펠) 그립
  - `sambo__벨트-그립`: sambo:벨트 그립 · bjj:벨트 그립 · judo:Belt Grip · sambo:Belt Grip / Пояс 그립 — 여러 무술에 같은 이름·같은 동작으로 수록
  - `bjj__armbar`: bjj:Armbar · judo:Juji Gatame · judo:Ude Hishigi Juji Gatame — 주지가타메(우데히시기 주지가타메는 정식 명칭) = 암바 — 같은 십자 꺾기
  - `bjj__triangle-choke`: bjj:Triangle Choke · bjj:Triangle · judo:Sankaku Jime — 같은 트라이앵글 초크 (BJJ 클로즈드 가드·트라이앵글 계열에 중복 수록, 유도 산카쿠지메)
- 패턴 C (병합된 기록의 설명이 무술마다 다름 → usageByArt로 보존): 39건
- 패턴 D (공유 라이브러리 기록이 기존 기술로 연결): 8건
  - `mixed-martial-arts__guillotine-choke` → `bjj__guillotine` (MMA에 따로 등록된 길로틴 초크)
  - `mixed-martial-arts__arm-triangle-choke` → `bjj__arm-triangle` (MMA에 따로 등록된 암 트라이앵글 초크)
  - `mma__double-leg-takedown` → `wrestling__basic-double-leg` (MMA에 따로 등록된 기본 더블 레그 테이크다운)
  - `mixed-martial-arts__overhand-right` → `mixed-martial-arts__overhand` (오른손 오버핸드 = 오버핸드)
  - `bjj__closed-guard-armbar` → `bjj__armbar` (공식 Armbar가 클로즈드 가드 암바)
  - `bjj__니-슬라이스-패스` → `bjj__knee-cut-pass` (니 슬라이스 = 니 컷 패스)
  - `bjj__bullfighter-pass` → `bjj__torreando-pass` (Bullfighter Pass = Torreando(투우사) 패스)
  - `link__mixed-martial-arts__wrestling__granby-roll` → `wrestling__granby-roll` (link record (기존 기술에 무술 연결))
- 패턴 E (기술 수가 중앙값의 절반 미만인 무술): 없음
- 분리된 묶음 기록: 102개 (기술 분리 내역은 docs/TECHNIQUE_RELATIONS_AUDIT.md C절)

## 6. REVIEW (확정하지 않음)

| 기술 | 무술 | 이유 |
|---|---|---|
| Back Step `wrestling__back-step` | 주짓수 | BJJ Backstep은 패스/전환 동작으로 레슬링 Back Step(투사 진입 스텝)과 같은 기술인지 불분명함. |
| Frame `boxing__frame` | 주짓수 | 대상 무술에 같거나 비슷한 기술 기록이 이미 있음(프레임·Turn-In Escape·Closed Guard·Overhook/Whizzer·Mat Return) — 연결이 아니라 병합 판단이 필요 (검수자 재정의) |
| Frame `judo__frame` | 주짓수 | 대상 무술에 같거나 비슷한 기술 기록이 이미 있음(프레임·Turn-In Escape·Closed Guard·Overhook/Whizzer·Mat Return) — 연결이 아니라 병합 판단이 필요 (검수자 재정의) |
| Guard (클로즈드/오픈) `sambo__guard` | 주짓수 | 대상 무술에 같거나 비슷한 기술 기록이 이미 있음(프레임·Turn-In Escape·Closed Guard·Overhook/Whizzer·Mat Return) — 연결이 아니라 병합 판단이 필요 (검수자 재정의) |
| Guard Sweep `sambo__guard-sweep` | 주짓수 | 범용 'Guard Sweep' 명칭으로 BJJ의 특정 스윕들과 동일 여부가 불분명함. |
| Hip Pressure `wrestling__hip-pressure` | 주짓수 | Hip Pressure Guard Break라는 기술명 일부로만 등장해 동일 기술인지 불분명함. |
| Rear Lift / Return `wrestling__rear-lift-return` | 주짓수 | 대상 무술에 같거나 비슷한 기술 기록이 이미 있음(프레임·Turn-In Escape·Closed Guard·Overhook/Whizzer·Mat Return) — 연결이 아니라 병합 판단이 필요 (검수자 재정의) |
| Turn-In `judo__turn-in` | 주짓수 | 대상 무술에 같거나 비슷한 기술 기록이 이미 있음(프레임·Turn-In Escape·Closed Guard·Overhook/Whizzer·Mat Return) — 연결이 아니라 병합 판단이 필요 (검수자 재정의) |
| Whizzer `wrestling__whizzer` | 주짓수 | 대상 무술에 같거나 비슷한 기술 기록이 이미 있음(프레임·Turn-In Escape·Closed Guard·Overhook/Whizzer·Mat Return) — 연결이 아니라 병합 판단이 필요 (검수자 재정의) |
| Clinch (근접 컨트롤) `karate__clinch` | 복싱 | 복싱 클린치는 붙잡기 위주이고 가라테 클린치는 니킥 룰용 근접 컨트롤이라 동일 여부 불분명함. |
| Cover `kickboxing__cover` | 복싱 | 복싱 Body Cover와 킥복싱 Cover의 동일 여부가 불분명함. |
| Feint `karate__feint` | 복싱 | Feint의 기술 identity가 REVIEW(가라테 vs 복싱) (검수자 재정의) |
| Feint `wrestling__feint` | 복싱 | Feint의 기술 identity가 REVIEW(가라테 vs 복싱) (검수자 재정의) |
| Guard `muay-thai__guard` | 복싱 | 무에타이 가드와 복싱 High/Long Guard의 동일 여부가 불분명함. |
| Hand Fighting `wrestling__hand-fighting` | 복싱 | 복싱 손싸움과 레슬링 핸드파이팅이 유사하나 맥락이 달라 불분명함. |
| Inside Control `wrestling__inside-control` | 복싱 | 복싱 인사이드 컨트롤과 레슬링 그립 인사이드 컨트롤의 동일 여부가 불분명함. |
| Parry → Jab / Cross `kickboxing__parry-jab-cross` | 복싱 | Jab/Cross 단어만 일치하고 Parry→Jab/Cross 연결은 근거에 직접 없음. |
| Pivot `wrestling__pivot` | 복싱 | 복싱 피벗 풋워크와 레슬링 피벗의 동일 여부가 불분명함. |
| Shoulder Roll `kickboxing__shoulder-roll` | 복싱 | 근거 문장은 복싱의 Shoulder Roll Stance(자세) — 킥복싱 Shoulder Roll(방어 동작)과 같은지 불분명 (검수자 재정의) |
| Wrist Control `wrestling__wrist-control` | 복싱 | 복싱 클린치 손목 제어와 레슬링 그립 손목 제어의 동일 여부가 불분명함. |
| 근거리 (Close Range / Clinch) `kickboxing__근거리-close-range-clinch` | 복싱 | 킥복싱 근거리는 니 중심 정의라 복싱 근거리와 동일 여부 불분명함. |
| 리드(Lead) `kickboxing__리드-lead` | 복싱 | 리드 손/발 개념은 복싱에도 쓰이나 킥복싱 정의(체크 등)와 차이가 있음. |
| 리어(Rear) `kickboxing__리어-rear` | 복싱 | 리어 개념은 복싱에도 쓰이나 킥복싱 정의(로우킥 등)와 차이가 있음. |
| 중거리 (Mid/Punching Range) `kickboxing__중거리-mid-punching-range` | 복싱 | 킥복싱 중거리는 니가 섞이는 정의라 복싱 중거리와 동일 여부 불분명함. |
| Ashi-barai `karate__ashi-barai` | 유도 | 유도에는 De Ashi Barai 등 특정 발기술만 있어 가라테 Ashi-barai와 동일 여부 불분명함. |
| Feint `wrestling__feint` | 유도 | 유도의 던지기용 페인트와 레슬링 슛 페인트의 동일 여부가 불분명함. |
| Guard (클로즈드/오픈) `sambo__guard` | 유도 | 유도 근거는 Guard Recovery뿐이라 클로즈드/오픈 가드를 유도 기술로 보기 불분명함. |
| Kuzushi `karate__kuzushi` | 유도 | 유도는 쿠즈시 방향별 기록과 원리 장을 따로 가짐 — 가라테 Kuzushi 개념 기록을 연결할지 판단 보류 (검수자 재정의) |
| Throw → Side Control / Mount / Turtle Control `sambo__throw-side-control-mount-turtle-control` | 유도 | 유도도 던지기 후 굳히기 전환을 다루나 삼보 고유 전환 기술과 동일한지 불분명함. |
| Turtle `bjj__turtle` | 유도 | 유도 Turtle Recovery는 있으나 BJJ Turtle 항목(분류 이상)과 동일 여부 불분명함. |
| Clinch `boxing__clinch` | 가라테 | 가라테 클린치는 룰 허용 시 근접 컨트롤로 복싱 클린치와 동일 여부 불분명함. |
| Combination `boxing__combination` | 가라테 | 범용 Combination 명칭으로 가라테 Combination Entry와 동일 여부 불분명함. |
| Feint `boxing__feint` | 가라테 | 가라테에는 자체 Feint 기록이 있고, 복싱 Feint와 같은 기술인지가 REVIEW 항목 — 연결이 아니라 병합 판단이 필요 (검수자 재정의) |
| Pivot `wrestling__pivot` | 가라테 | 가라테 Tai Sabaki/Pivot과 레슬링 피벗의 동일 여부가 불분명함. |
| 근거리 (Close Range / Clinch) `kickboxing__근거리-close-range-clinch` | 가라테 | 가라테 근거리와 킥복싱 클린치/니 근거리의 동일 여부가 불분명함. |
| 중거리 (Mid/Punching Range) `kickboxing__중거리-mid-punching-range` | 가라테 | 가라테 Ma와 킥복싱 중거리(니 포함)의 동일 여부가 불분명함. |
| Clinch `boxing__clinch` | 킥복싱 | 킥복싱은 자체 근거리/클린치 기록이 있어 같은 기술인지 판단 필요 (검수자 재정의) |
| Clinch (근접 컨트롤) `karate__clinch` | 킥복싱 | 킥복싱은 자체 근거리/클린치 기록이 있어 같은 기술인지 판단 필요 (검수자 재정의) |
| Combination `boxing__combination` | 킥복싱 | 범용 Combination 명칭으로 동일 기술 여부가 불분명함. |
| Feint `karate__feint` | 킥복싱 | Feint의 기술 identity가 REVIEW, 킥복싱은 자체 페인트 기록(Hand/Foot/Kick Feint)이 있음 (검수자 재정의) |
| Feint `wrestling__feint` | 킥복싱 | Feint의 기술 identity가 REVIEW, 킥복싱은 자체 페인트 기록(Hand/Foot/Kick Feint)이 있음 (검수자 재정의) |
| Feint `boxing__feint` | 킥복싱 | Feint의 기술 identity가 REVIEW, 킥복싱은 자체 페인트 기록(Hand/Foot/Kick Feint)이 있음 (검수자 재정의) |
| Guard `muay-thai__guard` | 킥복싱 | 무에타이 가드와 킥복싱 High/Long Guard의 동일 여부가 불분명함. |
| Inside Control `wrestling__inside-control` | 킥복싱 | 킥복싱 클린치 Inside Control과 레슬링 그립 Inside Control의 동일 여부 불분명함. |
| Jab Feint `boxing__jab-feint` | 킥복싱 | 킥복싱에 같은 기술 기록(Hand Feint (Jab Feint), Parry → Jab / Cross)이 이미 있음 — 병합 판단 필요 (검수자 재정의) |
| Parry → Jab `boxing__parry-jab` | 킥복싱 | 킥복싱에 같은 기술 기록(Hand Feint (Jab Feint), Parry → Jab / Cross)이 이미 있음 — 병합 판단 필요 (검수자 재정의) |
| Pivot `wrestling__pivot` | 킥복싱 | 킥복싱 피벗과 레슬링 피벗의 동일 여부가 불분명함. |
| Square Stance `wrestling__square-stance` | 킥복싱 | 킥복싱 Square Stance와 레슬링 Square Stance의 동일 여부가 불분명함. |
| 50/50 `bjj__50-50` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| 50/50 Sweep `bjj__50-50-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Age Empi `karate__age-empi` | MMA | 올려 팔꿈치는 클린치에서 가능하나 사용 빈도 불확실 |
| Age-zuki `karate__age-zuki` | MMA | 올려 찌르기가 MMA 어퍼컷과 동일 기술인지 불확실 |
| Angle Exit `karate__angle-exit` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Arm Drag → Butterfly Sweep `bjj__arm-drag-butterfly-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Arm Drag → Closed Guard `bjj__arm-drag-closed-guard` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Arm Drag → Turtle Attack `bjj__arm-drag-turtle-attack` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Arm Drag to Throw `sambo__arm-drag-to-throw` | MMA | 암드래그에서 던지기로 이어지는 동작의 MMA 정체성이 불확실하다. |
| Arm Spin `wrestling__arm-spin` | MMA | 암 스핀은 MMA에서 드물게 쓰여 확신하기 어렵다. |
| Arm Throw `wrestling__arm-throw` | MMA | 암 스로는 MMA에서 드물게 쓰인다. |
| Armbar Entry `bjj__armbar-entry` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Ashi Guruma `judo__ashi-guruma` | MMA | 도복 그립 기반 회전 발기술로 MMA 사용이 불확실하다. |
| Ashi-barai `karate__ashi-barai` | MMA | 발 쓸기는 MMA에서 드물게 쓰이나 여기서는 본카이 맥락 |
| Axe Kick `kickboxing__axe-kick` | MMA | 액스킥은 MMA에서 간혹 보이지만 드물어 확신하기 어렵다. |
| Back Control → Crucifix `bjj__back-control-crucifix` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Back Elbow `muay-thai__back-elbow` | MMA | 등 뒤로 찍는 엘보는 궤적에 따라 하향 엘보 반칙과 겹칠 수 있고 MMA 사용이 불확실하다. |
| Back Sweep `bjj__back-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Back Take Transition `bjj__back-take-transition` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Backdoor Escape `bjj__backdoor-escape` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Backside 50/50 `bjj__backside-50-50` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Backstep `bjj__backstep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Balloon Sweep `bjj__balloon-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Base `wrestling__base` | MMA | 레퍼리 포지션 바텀 베이스는 MMA 터틀과 유사하나 동일 기술로 보기 어렵다. |
| Bear-Hug Style Control `wrestling__bear-hug-style-control` | MMA | 베어허그식 컨트롤은 정체가 모호하여 판단이 어렵다. |
| Body Lock Throw `wrestling__body-lock-throw` | MMA | 바디락 스로(수플렉스류)는 MMA에서 간혹 쓰이나 스파이킹 위험이 있다. |
| Body Shift `karate__body-shift` | MMA | 타이사바키식 몸 이동이 MMA 회피 기술과 동일한지 불확실 |
| Bolo Punch `boxing__bolo-punch` | MMA | 볼로 펀치는 MMA에서 매우 드물게 쓰이는 변칙 펀치다. |
| Break and Reset `boxing__break-and-reset` | MMA | 복싱 클린치 브레이크·리셋은 심판 브레이크 맥락이라 MMA 기술로의 대응이 불확실하다. |
| Break Step `sambo__break-step` | MMA | 브레이크 스텝의 MMA 사용 정체성이 불확실하다. |
| Bridge `wrestling__bridge` | MMA | 레슬링 브릿지(폴 회피)는 MMA 마운트 탈출 브릿지와 용도가 달라 불확실하다. |
| Calf Slicer `bjj__calf-slicer` | MMA | 합법이지만 MMA에서 카프 슬라이서는 드물게만 나와 불확실하다. |
| Chair Sit `bjj__chair-sit` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Chicken Wing `wrestling__chicken-wing` | MMA | 레슬링 치킨 윙(턴)은 MMA 키락/기무라와 정체가 달라 판단이 어렵다. |
| Combination Entry `karate__combination-entry` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Corkscrew Punch `boxing__corkscrew-punch` | MMA | 코크스크류 펀치가 MMA에서 별도 기술로 쓰이는지 불확실하다. |
| Counter Kick `karate__counter-kick` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Counter Punch `karate__counter-punch` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Crackdown Counter `wrestling__crackdown-counter` | MMA | 크랙다운 카운터는 MMA 사용이 드물고 목 착지 위험이 있다. |
| Crackdown Position `wrestling__crackdown-position` | MMA | 크랙다운(싱글 방어 측 롤)은 MMA 사용이 드물고 목 착지 위험이 있다. |
| Crescent Kick `kickboxing__crescent-kick` | MMA | 크레센트킥은 MMA에서 드물게만 쓰여 확신하기 어렵다. |
| Cross Guard `boxing__cross-guard` | MMA | 크로스 가드(팔 교차)는 MMA에서 일부만 쓰며 그래플링 노출 위험이 있어 사용 정도가 불확실하다. |
| Cross-Arm Guard `muay-thai__cross-arm-guard` | MMA | 팔을 교차하는 가드는 MMA에서 일부만 쓰여 확신하기 어렵다. |
| Crucifix → Back `bjj__crucifix-back` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Crucifix Choke `bjj__crucifix-choke` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Curving Knee (Khao Chiang) `muay-thai__curving-knee` | MMA | Khao Chiang은 기술 identity 자체가 REVIEW(원문 정의 충돌) — 무술 관계도 확정하지 않음 (검수자 재정의) |
| Cutback `wrestling__cutback` | MMA | 컷백의 정확한 정체(싱글 마무리 변형)가 MMA에서 별도 쓰이는지 불확실하다. |
| Cutback Finish `wrestling__cutback-finish` | MMA | 컷백 피니시의 MMA 사용 여부가 불확실하다. |
| Daki Wakare `judo__daki-wakare` | MMA | 터틀 상대 들어 넘기기로 MMA 사용이 드물다. |
| De Ashi Barai → Sasae Tsurikomi Ashi `judo__de-ashi-barai-sasae-tsurikomi-ashi` | MMA | 유도 연결 기술 조합으로 MMA에서 이 조합 자체의 사용이 확인되지 않는다. |
| Deai `karate__deai` | MMA | 진입 순간을 받아치는 타이밍 개념으로 MMA 기술 식별 불확실 |
| Deep Half Guard `bjj__deep-half-guard` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Deep Half Sweep `bjj__deep-half-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Defensive Shell `sambo__defensive-shell` | MMA | 방어 쉘의 MMA 정체성(터틀/거북)이 불확실하다. |
| Distance Control `karate__distance-control` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Double Ankle Pick `wrestling__double-ankle-pick` | MMA | 더블 앵클 픽은 MMA에서 드물어 불확실하다. |
| Double Armbar `bjj__double-armbar` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Double Under Butterfly Sweep `bjj__double-under-butterfly-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Double Under Guard Break `bjj__double-under-guard-break` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Downward Elbow `kickboxing__downward-elbow` | MMA | 내려찍는 엘보는 Unified Rules의 downward pointing elbow 반칙과 겹칠 수 있어 추가하지 않는다. |
| Drop Seoi `sambo__drop-seoi` | MMA | 드롭 세오이는 대개 도복 그립 기반이며 MMA 사용이 드물다. |
| Duck-Under Reversal `wrestling__duck-under-reversal` | MMA | 덕언더 리버설의 MMA 사용이 불확실하다. |
| Duckunder to Throw `wrestling__duckunder-to-throw` | MMA | 덕언더 후 스로는 MMA에서 드물어 불확실하다. |
| Dutch Guard `muay-thai__dutch-guard` | MMA | 손을 낮춘 더치 가드가 MMA에서 별도 스타일로 쓰이는지 불확실하다. |
| Elbow Control `wrestling__elbow-control` | MMA | 팔꿈치 컨트롤 단독 그립이 MMA 기술로 구분되어 쓰이는지 불확실하다. |
| Electric Chair `bjj__electric-chair` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Electric Chair Sweep `bjj__electric-chair-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Ezekiel Choke `bjj__ezekiel-choke` | MMA | 도복 소매 버전이 기본이나 노기 에제키엘이 MMA에서 드물게 나온 바 있어 불확실하다. |
| Far Ankle `wrestling__far-ankle` | MMA | 파 앵클은 포크스타일 브레이크다운 성격이 강해 MMA 사용이 불확실하다. |
| Feint → Gyaku-zuki `karate__feint-gyaku-zuki` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Flower Sweep `bjj__flower-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Flying Entry `sambo__flying-entry` | MMA | 플라잉 진입의 MMA 사용이 불확실하다. |
| Folding Pass `bjj__folding-pass` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Footwork `sambo__footwork` | MMA | 일반 풋워크 항목으로 MMA 기술 정체성이 불명확하다. |
| Forward Step `karate__forward-step` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Front Headlock to Ankle `wrestling__front-headlock-to-ankle` | MMA | 프론트 헤드락에서 앵클 전환은 MMA 사용 빈도가 불확실하다. |
| Fumikomi Geri `karate__fumikomi-geri` | MMA | 밟아차기는 오블리크 킥과 유사하나 쓰러진 상대 밟기와 혼동되어 정체성 불확실 |
| Gazelle Punch `boxing__gazelle-punch` | MMA | 가젤 펀치는 MMA에서 드물게 쓰이는 변칙 펀치라 확신하기 어렵다. |
| Go no Sen `karate__go-no-sen` | MMA | 막고 반격하는 타이밍 개념으로 MMA 기술 식별 불확실 |
| Granby Counter `bjj__granby-counter` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Granby Roll to Reversal `wrestling__granby-roll-to-reversal` | MMA | 그랜비 롤 리버설은 MMA에서 드물다. |
| Grip Break `sambo__grip-break` | MMA | 재킷 그립 맥락의 그립 끊기로 MMA 정체성이 불확실하다. |
| Gyaku-zuki `karate__gyaku-zuki` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Gyaku-zuki → Mawashi Geri `karate__gyaku-zuki-mawashi-geri` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Gyaku-zuki Counter `karate__gyaku-zuki-counter` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Half Nelson `wrestling__half-nelson` | MMA | 하프 넬슨은 MMA 터틀 공방에서 간혹 쓰이나 확신이 없다. |
| Hand Fighting `bjj__hand-fighting` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Hane Goshi `judo__hane-goshi` | MMA | 노기 MMA 사용 빈도가 불확실하다. |
| Hane Goshi Gaeshi `judo__hane-goshi-gaeshi` | MMA | 유도 되치기 카운터로 노기 MMA 사용 빈도가 불확실하다. |
| Hane Makikomi `judo__hane-makikomi` | MMA | 감아 던지기로 MMA 사용이 불확실하다. |
| Harai Goshi `judo__harai-goshi` | MMA | 오버훅 노기 변형이 있으나 MMA 사용 빈도가 불확실하다. |
| Harai Goshi Gaeshi `judo__harai-goshi-gaeshi` | MMA | 유도 되치기 카운터로 노기 MMA 사용 빈도가 불확실하다. |
| Harai Makikomi `judo__harai-makikomi` | MMA | 감아 던지기로 MMA 사용이 불확실하다. |
| Harai Tsurikomi Ashi `judo__harai-tsurikomi-ashi` | MMA | 도복 리프트 기반 발기술로 MMA 사용이 불확실하다. |
| Head Hands `wrestling__head-hands` | MMA | 헤드 핸즈 방어가 MMA에서 별도 기술로 쓰이는지 불분명하다. |
| Head-and-Arm Spin `wrestling__head-and-arm-spin` | MMA | 헤드 앤 암 스핀은 MMA 사용이 불분명하다. |
| Head-and-Arm Throw `wrestling__head-and-arm-throw` | MMA | 헤드 앤 암 스로는 MMA에서 간혹 쓰이나 빈도가 불확실하다. |
| Headlock `wrestling__headlock` | MMA | 헤드락 자체는 MMA에서 쓰이나 레슬링 투척용 헤드락과 정체가 다를 수 있다. |
| Headlock Throw `wrestling__headlock-throw` | MMA | 헤드락 스로는 MMA에서 드물고 등 노출 위험으로 사용 여부가 불확실하다. |
| Headquarters Pass `bjj__headquarters-pass` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Hip Control `bjj__hip-control` | MMA | 클로즈드 가드에서의 힙 컨트롤 의미가 모호해 MMA 기술로 확정하기 어렵다. |
| Hip Heist Counter `wrestling__hip-heist-counter` | MMA | 힙 하이스트 카운터의 MMA 사용 근거가 부족하다. |
| Hip Pressure Guard Break `bjj__hip-pressure-guard-break` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Hip Teep `muay-thai__hip-teep` | MMA | 골반을 노리는 티프 변형이 MMA에서 별도로 쓰이는지 불확실하다. |
| Hip Toss `wrestling__hip-toss` | MMA | 힙 토스는 MMA에서 간혹 쓰이나 확신할 근거가 부족하다. |
| Hiza Guruma `judo__hiza-guruma` | MMA | 도복 그립으로 상대를 돌리는 발기술로 노기 MMA 사용이 불확실하다. |
| Homer Simpson `bjj__homer-simpson` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Inside Ankle Lock `bjj__inside-ankle-lock` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Inside Ashi `bjj__inside-ashi` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Inside Sweep `bjj__inside-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Inverted Triangle `bjj__inverted-triangle` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Ippon Seoi Nage `judo__ippon-seoi-nage` | MMA | 팔을 잡는 노기 변형이 가능하지만 MMA 사용 빈도가 불확실하다. |
| Irimi `karate__irimi` | MMA | 공격선 안으로 파고드는 회피 개념이 MMA 기술로 식별되는지 불확실 |
| Japanese Necktie `bjj__japanese-necktie` | MMA | 합법이지만 MMA에서 드물게만 쓰이는 초크다. |
| John Wayne Sweep `bjj__john-wayne-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Jumping Kick `kickboxing__jumping-kick` | MMA | 점핑 킥은 범위가 넓고 MMA에서 드물어 판단이 어렵다. |
| Jumping Teep `muay-thai__jumping-teep` | MMA | 점핑 티프는 MMA에서 드물게 쓰여 확신하기 어렵다. |
| Kagi-zuki `karate__kagi-zuki` | MMA | 가타식 훅 찌르기가 MMA 훅과 같은 기술인지 불확실 |
| Kami Shiho Escape `judo__kami-shiho-escape` | MMA | 노스-사우스 탈출의 MMA 사용은 가능하나 근거가 약하다. |
| Kesa Escape `judo__kesa-escape` | MMA | 케사 탈출의 MMA 사용 빈도가 불확실하다. |
| Khao Chiang / Khao Khong `muay-thai__khao-chiang-khao-khong` | MMA | Khao Chiang은 기술 identity 자체가 REVIEW(원문 정의 충돌) — 무술 관계도 확정하지 않음 (검수자 재정의) |
| Kimura → Armbar `bjj__kimura-armbar` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Kimura → Triangle `bjj__kimura-triangle` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Kimura Back Take `bjj__kimura-back-take` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Kimura Trap → Back `bjj__kimura-trap-back` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Kizami-zuki → Gyaku-zuki `karate__kizami-zuki-gyaku-zuki` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Kizami-zuki → Mawashi Geri `karate__kizami-zuki-mawashi-geri` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Kizami-zuki Counter `karate__kizami-zuki-counter` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Knee Slide `wrestling__knee-slide` | MMA | 레슬링 니 슬라이드의 MMA 사용 정체가 불분명하다. |
| Knee-in-the-middle `bjj__knee-in-the-middle` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Kosoto Gari `judo__kosoto-gari` | MMA | 작은 바깥 베기는 MMA 사용 빈도가 불확실하다. |
| Kouchi Gaeshi `judo__kouchi-gaeshi` | MMA | 유도 되치기 카운터로 노기 MMA 사용 빈도가 불확실하다. |
| Kouchi Gari → Seoi Nage `judo__kouchi-gari-seoi-nage` | MMA | 유도 연결 기술 조합으로 MMA에서 이 조합 자체의 사용이 확인되지 않는다. |
| Kouchi Gari → Tai Otoshi `judo__kouchi-gari-tai-otoshi` | MMA | 유도 연결 기술 조합으로 MMA에서 이 조합 자체의 사용이 확인되지 않는다. |
| Kouchi Gari → Uchi Mata `judo__kouchi-gari-uchi-mata` | MMA | 유도 연결 기술 조합으로 MMA에서 이 조합 자체의 사용이 확인되지 않는다. |
| Kuchiki Daoshi `judo__kuchiki-daoshi` | MMA | 한 손 다리 잡기 밀기 기술로 MMA에서는 싱글레그류로 흡수되어 별도 사용이 불확실하다. |
| Kumite-dachi `karate__kumite-dachi` | MMA | 가라테식 쿠미테 자세는 일부 가라테 베이스 파이터만 쓰며 MMA 스탠스와 동일하지 않음 |
| Kuzure Kami Shiho Gatame `judo__kuzure-kami-shiho-gatame` | MMA | 변형 위누르기로 MMA에서 별도 사용 여부가 불확실하다. |
| Kuzure Tate Shiho Gatame `judo__kuzure-tate-shiho-gatame` | MMA | 변형 세로누르기로 MMA에서 별도 사용 여부가 불확실하다. |
| Kuzushi `karate__kuzushi` | MMA | 균형 무너뜨리기 개념은 MMA 그래플링에도 있으나 여기서는 본카이 맥락 |
| Lateral Drop `wrestling__lateral-drop` | MMA | 래터럴 드롭은 MMA에서 드물고 머리/목 착지 위험이 있다. |
| Lead Overhand `boxing__lead-overhand` | MMA | 오버핸드 기록은 일반(리어) 오버핸드를 가리키며 리드 오버핸드의 MMA 사용 정도는 불확실하다. |
| Leg Control `bjj__leg-control` | MMA | 특정 기술이라기보다 일반 개념이라 MMA 기술로 연결할지 불확실하다. |
| Leg Grip `sambo__leg-grip` | MMA | 일반 다리 잡기 항목으로 독립 기술로서 정체성이 모호하다. |
| Leg Ride `wrestling__leg-ride` | MMA | 레그 라이드(다리 걸기)는 MMA 백 컨트롤로 이어지기도 해 판단이 어렵다. |
| Leg Weave Pass `bjj__leg-weave-pass` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Lift `wrestling__lift` | MMA | 일반 리프트는 범위가 넓어 MMA 기술로 특정하기 어렵다. |
| Lockdown `bjj__lockdown` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Locking Hands Position `wrestling__locking-hands-position` | MMA | 손 잠금 형태 자체는 그립 세부로 MMA 기술로 연결할지 불분명하다. |
| Long Step `bjj__long-step` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Low Double `wrestling__low-double` | MMA | 로우 더블은 MMA에서 니 카운터 위험으로 사용 빈도가 불확실하다. |
| Low Stance `wrestling__low-stance` | MMA | 낮은 레슬링 자세는 MMA에서 니·어퍼컷 위험이 있어 사용 정도가 불확실하다. |
| Lumberjack Sweep `bjj__lumberjack-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Maai 유지 전술 `karate__maai-유지-전술` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Mae Geri → Gyaku-zuki `karate__mae-geri-gyaku-zuki` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Mae Geri Counter `karate__mae-geri-counter` | MMA | 앞차기 카운터는 일부 가라테 베이스 파이터만 사용 |
| Mawashi Geri → Gyaku-zuki `karate__mawashi-geri-gyaku-zuki` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Mawashi Geri Counter `karate__mawashi-geri-counter` | MMA | 킥에 대한 돌려차기 카운터는 MMA 사용 여부 불확실 |
| Mawashi-zuki `karate__mawashi-zuki` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Motion / Circle `wrestling__motion-circle` | MMA | 레슬링 고유의 모션·서클링 개념으로 MMA 풋워크와 동일 기술인지 불분명하다. |
| Muay Thai Stance `muay-thai__muay-thai-stance` | MMA | 무에타이 정통 스탠스(곧은 자세)는 테이크다운 때문에 MMA에서 변형되어 쓰여 그대로 쓰이는지 불확실하다. |
| Nagashi `karate__nagashi` | MMA | 흘려보내는 몸놀림 개념으로 MMA 기술 정체성 불확실 |
| Nagashi Uke `karate__nagashi-uke` | MMA | 흘려막기는 패리와 유사하나 MMA 동일 기술인지 불확실 |
| Near Ankle `wrestling__near-ankle` | MMA | 니어 앵클이 픽인지 포크스타일 라이드인지 정체성이 불분명하다. |
| Near-Side Crank Position `wrestling__near-side-crank-position` | MMA | 니어사이드 크랭크 포지션의 MMA 사용이 불확실하다. |
| Nidan Geri `karate__nidan-geri` | MMA | 이단 뛰어 앞차기는 MMA에서 매우 드묾 |
| Off-balancing `bjj__off-balancing` | MMA | 특정 기술이라기보다 일반 개념이라 MMA 기술로 연결할지 불확실하다. |
| Oi-zuki `karate__oi-zuki` | MMA | 전진 찌르기는 동작이 커 MMA에서 드물게만 쓰임 |
| Oi-zuki → Gyaku-zuki `karate__oi-zuki-gyaku-zuki` | MMA | 오이즈키 기반 조합은 MMA에서 드묾 |
| Okuri Ashi Barai `judo__okuri-ashi-barai` | MMA | 양발 후리기는 도복 리프트 의존도가 높아 MMA 사용이 불확실하다. |
| Okuri-ashi `karate__okuri-ashi` | MMA | WKF식 슬라이딩 거리조절은 가라테 베이스 파이터 일부만 사용 |
| Old School `bjj__old-school` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Old School Sweep `bjj__old-school-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Omoplata → Armbar `bjj__omoplata-armbar` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Osoto Gaeshi `judo__osoto-gaeshi` | MMA | 유도 되치기 카운터로 노기 MMA 사용 빈도가 불확실하다. |
| Osoto Gari → Ouchi Gari `judo__osoto-gari-ouchi-gari` | MMA | 유도 연결 기술 조합으로 MMA에서 이 조합 자체의 사용이 확인되지 않는다. |
| Osoto Gari → Uchi Mata `judo__osoto-gari-uchi-mata` | MMA | 유도 연결 기술 조합으로 MMA에서 이 조합 자체의 사용이 확인되지 않는다. |
| Osoto Guruma `judo__osoto-guruma` | MMA | 오소토가리 변형으로 MMA 사용 여부가 불확실하다. |
| Osoto Makikomi `judo__osoto-makikomi` | MMA | 감아 던지기는 노기 가능하나 등을 내주는 위험으로 MMA 사용이 불확실하다. |
| Osoto Otoshi `judo__osoto-otoshi` | MMA | 오소토가리 변형으로 MMA 사용 여부가 불확실하다. |
| Otoshi Empi `karate__otoshi-empi` | MMA | 내려찍는 팔꿈치는 하향 엘보 반칙에 해당할 수 있음 |
| Ouchi Gaeshi `judo__ouchi-gaeshi` | MMA | 유도 되치기 카운터로 노기 MMA 사용 빈도가 불확실하다. |
| Ouchi Gari → Seoi Nage `judo__ouchi-gari-seoi-nage` | MMA | 유도 연결 기술 조합으로 MMA에서 이 조합 자체의 사용이 확인되지 않는다. |
| Ouchi Gari → Uchi Mata `judo__ouchi-gari-uchi-mata` | MMA | 유도 연결 기술 조합으로 MMA에서 이 조합 자체의 사용이 확인되지 않는다. |
| Outside Ankle Lock `bjj__outside-ankle-lock` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Outside Ashi `bjj__outside-ashi` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Outside Sankaku `bjj__outside-sankaku` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Outside Sweep `bjj__outside-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Peek-a-Boo `boxing__peek-a-boo` | MMA | 피카부는 하이가드 계열이지만 킥·테이크다운이 있는 MMA에서 그대로 쓰이는지 불확실하다. |
| Peek-Out `wrestling__peek-out` | MMA | 피크 아웃은 포크스타일 바텀 기술로 MMA 사용이 불확실하다. |
| Pendulum Sweep `bjj__pendulum-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Peruvian Necktie `bjj__peruvian-necktie` | MMA | MMA에서 소수 피니시 사례가 있으나 드물어 불확실하다. |
| Peterson Roll `wrestling__peterson-roll` | MMA | 피터슨 롤은 MMA에서 드물다. |
| Peterson Roll to Reversal `wrestling__peterson-roll-to-reversal` | MMA | 피터슨 롤 리버설은 MMA에서 드물다. |
| Philly Shell `boxing__philly-shell` | MMA | 필리셸은 리드 쪽을 킥·테이크다운에 노출해 MMA에서는 드물게만 쓰여 확신하기 어렵다. |
| Pivot `wrestling__pivot` | MMA | 범용 회전 동작으로 MMA 기술로서의 정체성이 불분명하다. |
| Plan B Sweep `bjj__plan-b-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Quadpod `wrestling__quadpod` | MMA | 쿼드포드는 MMA에서 일어서기 과정에 보이나 별도 기술로 쓰이는지 불확실하다. |
| Quadpod Escape `wrestling__quadpod-escape` | MMA | 쿼드포드 탈출은 MMA 사용 근거가 부족하다. |
| Question Mark Kick `muay-thai__question-mark-kick` | MMA | 퀘스천마크킥은 MMA에서 드물게 쓰여 확신하기 어렵다. |
| Re-Double `wrestling__re-double` | MMA | 재더블은 MMA에서 가능하나 별도 기술로 근거가 부족하다. |
| Re-Single `wrestling__re-single` | MMA | 재싱글은 MMA에서 가능하나 별도 기술로 근거가 부족하다. |
| Reshot Double `wrestling__reshot-double` | MMA | 재슛 더블은 MMA 스크램블에서 가능하나 별도 기술로 쓰이는지 불확실하다. |
| Retreat `karate__retreat` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Reversal `sambo__reversal` | MMA | 일반 반전 항목으로 정체성이 모호하다. |
| Reverse Kesa Gatame `bjj__reverse-kesa-gatame` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Reverse Triangle `bjj__reverse-triangle` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Roll-Through `wrestling__roll-through` | MMA | 롤 스루는 MMA 스크램블에서 가능하나 근거가 부족하다. |
| Russian-style Grip `judo__russian-style-grip` | MMA | 팔을 감는 러시안 그립은 노기 러시안 타이와 유사하나 유도식은 도복 등을 잡는 경우가 많아 불확실하다. |
| Sasae Counter `judo__sasae-counter` | MMA | 유도 되치기 카운터로 노기 MMA 사용 빈도가 불확실하다. |
| Sasae Tsurikomi Ashi `judo__sasae-tsurikomi-ashi` | MMA | 끌어올리는 도복 그립 의존도가 높아 노기 MMA 사용이 불확실하다. |
| Sasae Tsurikomi Ashi → Osoto Gari `judo__sasae-tsurikomi-ashi-osoto-gari` | MMA | 유도 연결 기술 조합으로 MMA에서 이 조합 자체의 사용이 확인되지 않는다. |
| Scissor Sweep `bjj__scissor-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Sen `karate__sen` | MMA | 선제 타이밍 개념으로 별도 MMA 기술인지 불확실 |
| Seoi Nage `judo__seoi-nage` | MMA | 일반 세오이나게는 도복 그립 의존이 크고 노기 MMA 사용이 드물다. |
| Seoi Otoshi `judo__seoi-otoshi` | MMA | 노기 변형이 있으나 MMA 사용이 드물다. |
| Short Choke `bjj__short-choke` | MMA | 숏 초크는 도복/노기 변형이 섞여 있어 MMA 사용 형태가 불확실하다. |
| Short Punch `karate__short-punch` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Shoulder Bump `boxing__shoulder-bump` | MMA | 숄더 범프가 MMA에서 별도 기술로 쓰이는지 불확실하다. |
| Shoulder Clamp Sweep `bjj__shoulder-clamp-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Shoulder Crunch Sweep `bjj__shoulder-crunch-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Shoulder Entry `sambo__shoulder-entry` | MMA | 어깨 진입 항목의 정체성이 모호하다. |
| Shoulder Roll `kickboxing__shoulder-roll` | MMA | 숄더롤 방어는 MMA에서 일부만 쓰여 확신하기 어렵다. |
| Shoulder Roll Stance `boxing__shoulder-roll-stance` | MMA | 숄더롤 스탠스는 MMA에서 킥·테이크다운 때문에 드물게 쓰여 판단이 어렵다. |
| Shuck By `wrestling__shuck-by` | MMA | 셔크 바이가 MMA에서 실제로 얼마나 쓰이는지 확신하기 어렵다. |
| Shuffle Step `wrestling__shuffle-step` | MMA | 일반 풋워크로 레슬링 셔플 스텝이 MMA 기술로 별도 쓰이는지 불분명하다. |
| Side Control → Crucifix `bjj__side-control-crucifix` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Side Triangle `bjj__side-triangle` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Single Leg from Guard `sambo__single-leg-from-guard` | MMA | 가드에서의 싱글레그 스윕은 MMA 사용 빈도가 불확실하다. |
| Single Leg Transition `bjj__single-leg-transition` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Sit-Out to Reversal `wrestling__sit-out-to-reversal` | MMA | 싯아웃 리버설은 MMA에서 드물다. |
| Sit-Out to Single `wrestling__sit-out-to-single` | MMA | 싯아웃에서 싱글 전환은 MMA 스크램블에서 가능하나 근거가 부족하다. |
| SLX Sweep `bjj__slx-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| SLX Transition `bjj__slx-transition` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Snatch Double `wrestling__snatch-double` | MMA | 스내치 더블이 MMA에서 별도 기술로 쓰이는지 불분명하다. |
| Sode Guruma Jime `judo__sode-guruma-jime` | MMA | 유도 원형은 소매 그립이지만 노기 에제키엘이 MMA에서 사용된 사례가 있어 불확실하다. |
| Spinning Knee `muay-thai__spinning-knee` | MMA | 스피닝 니는 MMA에서 거의 보이지 않아 확신하기 어렵다. |
| Square Stance `wrestling__square-stance` | MMA | 레슬링 스탠스 세부 분류로 MMA(타격 고려 스탠스)에 그대로 적용되는지 불분명하다. |
| Staggered Stance `wrestling__staggered-stance` | MMA | 스탠스 세부 분류로 MMA 기술로 별도 연결할지 불분명하다. |
| Step → Kizami-zuki `karate__step-kizami-zuki` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Step In `karate__step-in` | MMA | 가라테 고유의 표현(지르기·콤비네이션·이동 개념) — MMA 데이터에는 복싱·킥복싱·무에타이 계열만 근거가 있어, 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| Sukui Nage `judo__sukui-nage` | MMA | 다리를 퍼올리는 노기 던지기지만 MMA에서의 독립 기술 정체성이 불확실하다. |
| Sukui Uke `karate__sukui-uke` | MMA | 퍼올리는막기는 킥 캐치와 유사하나 동일 기술인지 불확실 |
| Sumi Gaeshi `judo__sumi-gaeshi` | MMA | 노기 언더훅 변형이 있으나 MMA 실전 사용 빈도가 불확실하다. |
| Suplex `wrestling__suplex` | MMA | 수플렉스는 MMA에서 드물게 쓰이며 머리/목 스파이킹 반칙 위험이 있다. |
| Switch `wrestling__switch` | MMA | 바텀 리버설 기술로 MMA에서는 드물게 쓰여 확신하기 어렵다. |
| Switch to Attack `wrestling__switch-to-attack` | MMA | 스위치 공격은 MMA에서 드물어 불확실하다. |
| Switch-Off `wrestling__switch-off` | MMA | 스위치 오프는 MMA에서 드물게 언급되어 확신하기 어렵다. |
| Tag and Back Off `kickboxing__tag-and-back-off` | MMA | 포인트 스파링 특유 전술로 정의되어 있어 MMA 기술로 보기 불확실하다(유사한 히트앤런은 존재). |
| Tai no Sen `karate__tai-no-sen` | MMA | 동시 타이밍 개념으로 MMA 기술 식별 불확실 |
| Tai Otoshi `judo__tai-otoshi` | MMA | 타이오토시는 도복 당김 의존도가 높아 노기 MMA 사용이 불확실하다. |
| Tai Sabaki `judo__tai-sabaki` | MMA | 몸 돌리기 원리는 보편적이나 MMA 기술로서의 정체성이 불분명하다. |
| Tai Sabaki → Counter `karate__tai-sabaki-counter` | MMA | 각도 이동 후 반격은 일부 사용되나 동일 기술 여부 불확실 |
| Tani Otoshi `judo__tani-otoshi` | MMA | 뒤로 떨어뜨리는 카운터로 노기 가능하나 MMA 사용 빈도가 불확실하다. |
| Tani Otoshi Counter `judo__tani-otoshi-counter` | MMA | 유도 되치기 카운터로 노기 MMA 사용 빈도가 불확실하다. |
| Tate-zuki `karate__tate-zuki` | MMA | 세로 주먹 찌르기는 MMA에서 일부만 쓰여 사용 여부 불확실 |
| Tawara Gaeshi `judo__tawara-gaeshi` | MMA | 더블레그 방어 롤링 카운터로 노기 가능하나 MMA 사용 빈도가 불확실하다. |
| Technical Stand-Up Back Take `bjj__technical-stand-up-back-take` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Technical Stand-Up Sweep `bjj__technical-stand-up-sweep` | MMA | 데라히바 계열로 분류되어 있어 노기 MMA 사용 여부가 불확실하다. |
| Technical Sweep `bjj__technical-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Teep Guard `muay-thai__teep-guard` | MMA | 앞다리를 띄우는 티프 가드는 테이크다운 위험 때문에 MMA 사용이 불확실하다. |
| Teisho `karate__teisho` | MMA | 손바닥 타격은 합법이나 MMA에서 드물게만 쓰임 |
| Tenkan `karate__tenkan` | MMA | 회전 이동(텐칸)이 MMA 피벗과 같은 기술인지 불확실 |
| Throw-By `wrestling__throw-by` | MMA | 스로 바이는 MMA에서 드물어 사용 여부가 불확실하다. |
| Tight Waist `wrestling__tight-waist` | MMA | 타이트 웨이스트는 MMA 터틀 라이딩에서 쓰이기도 하나 확신하기 어렵다. |
| Tobi Geri `karate__tobi-geri` | MMA | 뛰어차기는 화려하나 MMA 실제 사용이 드묾 |
| Tobi-komi `karate__tobi-komi` | MMA | 뛰어드는 블리츠 진입은 일부 가라테 베이스 파이터만 사용 |
| Toe Hold `bjj__toe-hold` | MMA | 통합룰상 합법이지만 MMA에서 토홀드 사용 빈도는 드물어 불확실하다. |
| Tomoe Nage `judo__tomoe-nage` | MMA | 토모에나게는 대개 도복 그립 기반이며 MMA 사용이 매우 드물다. |
| Transition to Back `bjj__transition-to-back` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Transition to SLX `bjj__transition-to-slx` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Transition to X Guard `bjj__transition-to-x-guard` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Trap and Roll Prevention `bjj__trap-and-roll-prevention` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Tripod `wrestling__tripod` | MMA | 트라이포드는 MMA 일어서기 과정과 관련되나 확신이 없다. |
| Tripod Sweep `bjj__tripod-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Tripod 계열 스윕 `bjj__tripod-계열-스윕` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Tripod-style Butterfly Sweep `bjj__tripod-style-butterfly-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Truck → Back `bjj__truck-back` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Tsubame Gaeshi `judo__tsubame-gaeshi` | MMA | 유도 되치기 카운터로 노기 MMA 사용 빈도가 불확실하다. |
| Tsugi Ashi `judo__tsugi-ashi` | MMA | 슬라이드 스텝은 보편적 풋워크지만 유도 고유 이동법을 MMA 기술로 연결할지 불확실하다. |
| Turn-In `judo__turn-in` | MMA | 유도 네와자 탈출 동작으로 MMA에서의 정체성이 불명확하다. |
| Turtle Recovery `judo__turtle-recovery` | MMA | 터틀 회복은 MMA에서 정체성이 다를 수 있어 불확실하다. |
| Uchi Makikomi `judo__uchi-makikomi` | MMA | 감아 던지기로 MMA 사용이 불확실하다. |
| Uchi Mata → Ouchi Gari `judo__uchi-mata-ouchi-gari` | MMA | 유도 연결 기술 조합으로 MMA에서 이 조합 자체의 사용이 확인되지 않는다. |
| Uchi Mata Gaeshi `judo__uchi-mata-gaeshi` | MMA | 유도 되치기 카운터로 노기 MMA 사용 빈도가 불확실하다. |
| Uchi Mata Makikomi `judo__uchi-mata-makikomi` | MMA | 감아 던지기로 MMA 사용이 불확실하다. |
| Uchi Mata Sukashi `judo__uchi-mata-sukashi` | MMA | 우치마타 흘리기 카운터의 MMA 사용 빈도가 불확실하다. |
| Uki Goshi `judo__uki-goshi` | MMA | 허리 감기 노기 던지기지만 MMA 사용이 드물다. |
| Uki Waza `judo__uki-waza` | MMA | 희생 던지기로 MMA 사용이 드물다. |
| Ushiro Empi `karate__ushiro-empi` | MMA | 뒤 팔꿈치는 MMA에서 드문 상황에서만 가능 |
| Ushiro Goshi `judo__ushiro-goshi` | MMA | 들어 올리는 카운터 던지기로 MMA 사용이 드물고 스파이킹 위험이 있다. |
| Ushiro Kesa Gatame `judo__ushiro-kesa-gatame` | MMA | 역 케사가타메로 MMA 사용 빈도가 불확실하다. |
| Utsuri Goshi `judo__utsuri-goshi` | MMA | 뒤 허리 옮기기 카운터의 MMA 사용이 드물다. |
| Waist Lock Reversal `wrestling__waist-lock-reversal` | MMA | 웨이스트락 리버설은 MMA에서 쓰일 수 있으나 근거가 부족하다. |
| Wheel Kick `kickboxing__wheel-kick` | MMA | 휠킥(스피닝 훅킥)은 MMA에서 드물게 쓰여 확신하기 어렵다. |
| Wrist Ride `wrestling__wrist-ride` | MMA | 손목 라이드는 MMA 탑 컨트롤에 쓰이기도 하나 포크스타일 라이드 성격이 강하다. |
| X Guard `bjj__x-guard` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| X Guard Sweep `bjj__x-guard-sweep` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| X Guard Transition `bjj__x-guard-transition` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| X-Pass `bjj__x-pass` | MMA | 합법이고 노기로도 가능하지만 MMA에서 실제로 쓰이는 빈도가 불확실하다. |
| Yoko Empi `karate__yoko-empi` | MMA | 옆 방향 팔꿈치 찌르기가 MMA에서 실제로 쓰이는지 불확실 |
| Yoko Gake `judo__yoko-gake` | MMA | 소매 그립 기반 희생 발기술로 MMA 사용이 불확실하다. |
| Yoko Guruma `judo__yoko-guruma` | MMA | 희생 던지기로 MMA 사용이 드물고 노기 적용이 불확실하다. |
| Yoko Otoshi `judo__yoko-otoshi` | MMA | 유도식 희생 던지기로 대개 도복 그립 기반이며 MMA 사용 사례가 드물다. |
| Yoko Wakare `judo__yoko-wakare` | MMA | 희생 던지기로 MMA 사용이 드물다. |
| Yori-ashi `karate__yori-ashi` | MMA | 측면 슬라이딩 스텝은 MMA 풋워크와 유사하나 동일 기술 여부 불확실 |
| боковой `sambo__боковой` | MMA | 측면/역방향 허리 던지기 변형의 MMA 사용이 불확실하다. |
| Бросок через голову `sambo__бросок-через-голову` | MMA | 머리 위로 넘기는 희생 던지기(토모에나게 계열)로 MMA 사용이 드물다. |
| Бросок через грудь `sambo__бросок-через-грудь` | MMA | 가슴 아치 던지기(수플렉스형)는 MMA 사용 사례가 있으나 스파이킹 반칙 위험이 있다. |
| Бросок через спину Counter `sambo__бросок-через-спину-counter` | MMA | 삼보 카운터 범주로 MMA에서의 사용이 불확실하다. |
| Вертушка `sambo__вертушка` | MMA | 회전 낙하 던지기로 MMA 사용이 드물다. |
| двойной зацеп `sambo__двойной-зацеп` | MMA | 더블 자쳅 레그 컨트롤 진입의 MMA 사용이 불확실하다. |
| Заваливание `sambo__заваливание` | MMA | 파르테르 턴오버 일반 용어로 MMA 기술 정체성이 모호하다. |
| задняя подсечка `sambo__задняя-подсечка` | MMA | 뒤 발쓸기는 MMA 사용 빈도가 불확실하다. |
| захватом руки на плечо `sambo__захватом-руки-на-плечо` | MMA | 팔을 어깨 위로 잡는 등 던지기는 노기 가능하나 MMA 사용이 드물다. |
| захватом руки под плечо `sambo__захватом-руки-под-плечо` | MMA | 팔을 어깨 아래로 잡는 등 던지기의 MMA 사용이 드물다. |
| обратный `sambo__обратный` | MMA | 역방향 등 던지기의 MMA 사용이 불확실하다. |
| Отхват/Подсечка Counter `sambo__отхват-подсечка-counter` | MMA | 삼보 카운터 범주로 MMA에서의 사용이 불확실하다. |
| передняя подсечка `sambo__передняя-подсечка` | MMA | 앞 발쓸기는 MMA 사용 빈도가 불확실하다. |
| Подсад `sambo__подсад` | MMA | 다리 받쳐 들어 올리기의 MMA 사용이 불확실하다. |
| подсечка изнутри `sambo__подсечка-изнутри` | MMA | 안쪽 발쓸기의 MMA 사용 빈도가 불확실하다. |
| подсечка с заведением `sambo__подсечка-с-заведением` | MMA | 끌어들이는 발쓸기의 MMA 사용 빈도가 불확실하다. |
| Подхват `sambo__подхват` | MMA | 하라이고시/우치마타 계열 군으로 노기 MMA 사용 빈도가 불확실하다. |
| рычаг кисти `sambo__рычаг-кисти` | MMA | 손목 레버는 MMA에서 합법이나 사용이 매우 드물다. |
| рычаг плеча `sambo__рычаг-плеча` | MMA | 오모플라타 계열 어깨 레버는 MMA 사용이 드물다. |
| скрестным захватом рук `sambo__скрестным-захватом-рук` | MMA | 팔 교차 그립 등 던지기의 MMA 사용이 불확실하다. |
| Удержание со стороны ног `sambo__удержание-со-стороны-ног` | MMA | 다리 쪽 홀드다운의 MMA 사용이 불확실하다. |
| Удержание спиной поперек `sambo__удержание-спиной-поперек` | MMA | 등을 대고 가로로 누르는 홀드의 MMA 사용이 불확실하다. |
| узел плеча ногой `sambo__узел-плеча-ногой` | MMA | 다리 보조 어깨 노트의 MMA 사용이 불확실하다. |
| узел плеча обратный `sambo__узел-плеча-обратный` | MMA | 역방향 어깨 노트의 MMA 사용이 불확실하다. |
| ущемление двуглавой мышцы плеча `sambo__ущемление-двуглавой-мышцы-плеча` | MMA | 이두근 압박(바이셉 슬라이서)은 MMA 사용이 드물다. |
| ущемление икроножной мышцы `sambo__ущемление-икроножной-мышцы` | MMA | 카프 슬라이서는 MMA 사용이 드물다. |
| ущемление трехглавой мышцы плеча `sambo__ущемление-трехглавой-мышцы-плеча` | MMA | 삼두근 압박은 MMA 사용이 드물다. |
| 겨루기준비자세 `taekwondo__겨루기준비자세` | MMA | WT식 비껴 선 겨루기 자세는 MMA 스탠스와 다름 |
| 끌기 (드래그 스텝) `taekwondo__끌기` | MMA | 태권도식 드래그 스텝이 MMA 풋워크로 쓰이는지 불확실 |
| 나래차기 `taekwondo__나래차기` | MMA | 나래차기는 WT 득점 패턴으로 MMA 사용 불확실 |
| 다리걸기 Counter `sambo__다리걸기-counter` | MMA | 삼보 카운터 범주로 MMA에서의 사용이 불확실하다. |
| 돌려지르기 `taekwondo__돌려지르기` | MMA | 태권도 고유의 표현(지르기·이동·콤비네이션) — MMA 데이터에 태권도식 근거가 없어 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| 돌려차기 → 뒤차기 `taekwondo__돌려차기-뒤차기` | MMA | 뒤차기 연결 조합은 MMA 사용 불확실 |
| 돌려차기 → 뒤후려차기 `taekwondo__돌려차기-뒤후려차기` | MMA | 회전 후려차기 포함 조합은 MMA에서 드묾 |
| 돌려차기 → 주먹(반대지르기) `taekwondo__돌려차기-주먹-반대지르기` | MMA | 태권도 고유의 표현(지르기·이동·콤비네이션) — MMA 데이터에 태권도식 근거가 없어 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| 뒤낙법 `taekwondo__뒤낙법` | MMA | 낙법은 MMA 훈련에서 쓰일 수 있으나 경기 기술인지 불확실 |
| 뒤돌아차기 계열 `taekwondo__뒤돌아차기-계열` | MMA | 등 돌리기 페인트 기반 회전 발차기 계열로 MMA 사용 불확실 |
| 뒤후려차기 `taekwondo__뒤후려차기` | MMA | 뒤후려차기는 MMA에서 드물고 화려한 기술 |
| 뒷발 돌려차기의 완전 회전형 `taekwondo__뒷발-돌려차기의-완전-회전형` | MMA | 완전 회전형 돌려차기는 MMA에서 드묾 |
| 뛰어내려차기 `taekwondo__뛰어내려차기` | MMA | 점프 내려차기는 MMA에서 드묾 |
| 뛰어돌려차기 `taekwondo__뛰어돌려차기` | MMA | 점프 돌려차기는 MMA에서 드묾 |
| 뛰어뒤차기 `taekwondo__뛰어뒤차기` | MMA | 점프 뒤차기는 MMA에서 드묾 |
| 뛰어앞차기 `taekwondo__뛰어앞차기` | MMA | 점프 앞차기는 MMA에서 드묾 |
| 뛰어옆차기 `taekwondo__뛰어옆차기` | MMA | 점프 옆차기는 MMA에서 드묾 |
| 리버스 카운터 `kickboxing__리버스-카운터` | MMA | 포인트 스파링 특유 카운터로 정의되어 MMA 사용 여부가 불확실하다. |
| 밀기 `taekwondo__밀기` | MMA | 태권도식 미는 스텝이 MMA 풋워크로 쓰이는지 불확실 |
| 바로지르기 `taekwondo__바로지르기` | MMA | 태권도 고유의 표현(지르기·이동·콤비네이션) — MMA 데이터에 태권도식 근거가 없어 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| 바탕손 `taekwondo__바탕손` | MMA | 바탕손 밀기/치기는 호신술 맥락이며 MMA 사용 불확실 |
| 반대지르기 `taekwondo__반대지르기` | MMA | 태권도 고유의 표현(지르기·이동·콤비네이션) — MMA 데이터에 태권도식 근거가 없어 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| 블리츠 `kickboxing__블리츠` | MMA | 포인트 스파링 득점 전술로 정의되어 있어 MMA 기술로 연결할지 불확실하다. |
| 사이드 스텝 `taekwondo__사이드-스텝` | MMA | 태권도 고유의 표현(지르기·이동·콤비네이션) — MMA 데이터에 태권도식 근거가 없어 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| 상대의 중심 이동 `bjj__상대의-중심-이동` | MMA | 특정 기술이라기보다 일반 개념이라 MMA 기술로 연결할지 불확실하다. |
| 손목/팔꿈치 제어 `sambo__손목-팔꿈치-제어` | MMA | 손목/팔꿈치 제어와 팔 등 뒤로 넘기기의 MMA 사용 정체성이 불확실하다. |
| 스위치 스텝 `taekwondo__스위치-스텝` | MMA | 태권도 고유의 표현(지르기·이동·콤비네이션) — MMA 데이터에 태권도식 근거가 없어 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| 스위치 스텝 → 돌려차기 `taekwondo__스위치-스텝-돌려차기` | MMA | 태권도 고유의 표현(지르기·이동·콤비네이션) — MMA 데이터에 태권도식 근거가 없어 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| 스텝 인 / 스텝 아웃 `taekwondo__스텝-인-스텝-아웃` | MMA | 태권도 고유의 표현(지르기·이동·콤비네이션) — MMA 데이터에 태권도식 근거가 없어 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| 앞낙법 `taekwondo__앞낙법` | MMA | 낙법은 MMA 훈련에서 쓰일 수 있으나 경기 기술인지 불확실 |
| 앞발 돌려차기 → 내려차기 `taekwondo__앞발-돌려차기-내려차기` | MMA | 내려차기 포함 조합은 MMA에서 드묾 |
| 앞발 돌려차기 → 뒷발 돌려차기 `taekwondo__앞발-돌려차기-뒷발-돌려차기` | MMA | 킥-킥 연결은 MMA 정형 조합인지 불확실 |
| 앞발 밀어차기 → 반대발(뒷발) 돌려차기 `taekwondo__앞발-밀어차기-반대발-뒷발-돌려차기` | MMA | 태권도 고유의 표현(지르기·이동·콤비네이션) — MMA 데이터에 태권도식 근거가 없어 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| 옆낙법 `taekwondo__옆낙법` | MMA | 낙법은 MMA 훈련에서 쓰일 수 있으나 경기 기술인지 불확실 |
| 이단옆차기 `taekwondo__이단옆차기` | MMA | 같은 다리 이단 옆차기는 MMA 사용 불확실 |
| 전진 `taekwondo__전진` | MMA | 태권도 고유의 표현(지르기·이동·콤비네이션) — MMA 데이터에 태권도식 근거가 없어 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| 점프 스텝 `taekwondo__점프-스텝` | MMA | 점프 스텝 페인트는 MMA 사용 여부 불확실 |
| 지르기 `taekwondo__지르기` | MMA | 태권도 고유의 표현(지르기·이동·콤비네이션) — MMA 데이터에 태권도식 근거가 없어 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| 찍어차기 `taekwondo__찍어차기` | MMA | 내려찍기(액스킥)는 MMA에서 드물게만 쓰임 |
| 페인트 스텝 → 몸통 돌려차기 `taekwondo__페인트-스텝-몸통-돌려차기` | MMA | 태권도 고유의 표현(지르기·이동·콤비네이션) — MMA 데이터에 태권도식 근거가 없어 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| 피벗 `taekwondo__피벗` | MMA | 태권도 고유의 표현(지르기·이동·콤비네이션) — MMA 데이터에 태권도식 근거가 없어 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| 허리기술 Counter `sambo__허리기술-counter` | MMA | 삼보 카운터 범주로 MMA에서의 사용이 불확실하다. |
| 회전 내려차기 `taekwondo__회전-내려차기` | MMA | 회전 내려차기는 MMA에서 드묾 |
| 회전 옆차기 `taekwondo__회전-옆차기` | MMA | 회전 옆차기는 MMA에서 간혹 쓰이나 빈도 불확실 |
| 후려차기 `taekwondo__후려차기` | MMA | 후려차기는 MMA에서 드물게만 쓰임 |
| 후진 `taekwondo__후진` | MMA | 태권도 고유의 표현(지르기·이동·콤비네이션) — MMA 데이터에 태권도식 근거가 없어 같은 기술로 MMA에서 쓰인다고 확정할 수 없음 (검수자 재정의) |
| 희생기술 Counter `sambo__희생기술-counter` | MMA | 삼보 카운터 범주로 MMA에서의 사용이 불확실하다. |
| Check → Return Kick `kickboxing__check-return-kick` | 무에타이 | 무에타이에 같은 기술 기록(Low Kick after Punch, Check and Return)이 이미 있음 — 병합 판단 필요 (검수자 재정의) |
| Clinch `boxing__clinch` | 무에타이 | 무에타이 클린치는 니·엘보 중심이라 복싱 클린치와 동일 여부 불분명함. |
| Clinch (근접 컨트롤) `karate__clinch` | 무에타이 | 무에타이는 자체 클린치 기록이 있어 같은 기술인지 판단 필요 (검수자 재정의) |
| Feint `karate__feint` | 무에타이 | Feint의 기술 identity가 REVIEW (검수자 재정의) |
| Frame `boxing__frame` | 무에타이 | 무에타이 프레임(니 차단)과 복싱 프레임의 동일 여부가 불분명함. |
| Inside Control `wrestling__inside-control` | 무에타이 | 무에타이 클린치 Inside Control과 레슬링 Inside Control의 동일 여부 불분명함. |
| Kick After Punch `kickboxing__kick-after-punch` | 무에타이 | 무에타이에 같은 기술 기록(Low Kick after Punch, Check and Return)이 이미 있음 — 병합 판단 필요 (검수자 재정의) |
| Pivot `wrestling__pivot` | 무에타이 | 무에타이 피벗 풋워크와 레슬링 피벗의 동일 여부가 불분명함. |
| Teep `kickboxing__teep` | 무에타이 | 킥복싱 Teep의 identity가 REVIEW(무에타이 리드/리어/푸시 티프와 관계 미확정) (검수자 재정의) |
| Wrist Control `wrestling__wrist-control` | 무에타이 | 무에타이 클린치 Wrist Control과 레슬링 그립 Wrist Control의 동일 여부 불분명함. |
| 거리 관리 `boxing__거리-관리` | 무에타이 | 무에타이 거리 관리 섹션은 있으나 복싱 링 제너럴십 항목과 동일 여부 불분명함. |
| 근거리 (Close Range / Clinch) `kickboxing__근거리-close-range-clinch` | 무에타이 | 무에타이 근거리/클린치 구분과 킥복싱 근거리 정의가 달라 불분명함. |
| 장거리 (Long/Kicking Range) `kickboxing__장거리-long-kicking-range` | 무에타이 | 무에타이 장거리(킥·티프)와 킥복싱 장거리(킥·잽) 정의가 유사하나 동일 여부 불분명함. |
| 중거리 (Mid/Punching Range) `kickboxing__중거리-mid-punching-range` | 무에타이 | 무에타이 중거리와 킥복싱 중거리 정의가 유사하나 동일 여부 불분명함. |
| Collar Choke `bjj__collar-choke` | 삼보 | BJJ Collar Choke와 삼보 Collar Choke의 identity가 REVIEW (검수자 재정의) |
| Front Headlock `wrestling__front-headlock` | 삼보 | 삼보 근거는 컴뱃 삼보 Front Headlock Choke뿐이라 포지션 자체 사용 여부 불분명함. |
| Grip Fighting `judo__grip-fighting` | 삼보 | 삼보에 같은 계열 기록(재킷 그립 파이팅, 등 던지기 변형, удержание верхом/сбоку/со стороны головы)이 이미 있음 — 연결이 아니라 병합 판단 필요 (검수자 재정의) |
| Grip Fighting `bjj__grip-fighting` | 삼보 | 삼보에 같은 계열 기록(재킷 그립 파이팅, 등 던지기 변형, удержание верхом/сбоку/со стороны головы)이 이미 있음 — 연결이 아니라 병합 판단 필요 (검수자 재정의) |
| Inside Ashi `bjj__inside-ashi` | 삼보 | BJJ식 레그 엔탱글 명칭은 삼보 고유 용어가 아니라고 언급되어 불분명함. |
| Kumi Kata `judo__kumi-kata` | 삼보 | 삼보 그립 파이팅(Захват)은 있으나 유도 Kumi Kata 항목과 동일 여부 불분명함. |
| Leg Control `bjj__leg-control` | 삼보 | 삼보 Leg Control은 탑 컨트롤 맥락으로 BJJ 패스용 Leg Control과 동일 여부 불분명함. |
| Mount `judo__mount` | 삼보 | 삼보에 같은 계열 기록(재킷 그립 파이팅, 등 던지기 변형, удержание верхом/сбоку/со стороны головы)이 이미 있음 — 연결이 아니라 병합 판단 필요 (검수자 재정의) |
| North-South `bjj__north-south` | 삼보 | 삼보에 같은 계열 기록(재킷 그립 파이팅, 등 던지기 변형, удержание верхом/сбоку/со стороны головы)이 이미 있음 — 연결이 아니라 병합 판단 필요 (검수자 재정의) |
| Pivot `kickboxing__pivot` | 삼보 | 삼보 풋워크 목록의 Pivot과 킥복싱 피벗의 동일 여부 불분명함. |
| Seoi Nage `judo__seoi-nage` | 삼보 | 삼보에 같은 계열 기록(재킷 그립 파이팅, 등 던지기 변형, удержание верхом/сбоку/со стороны головы)이 이미 있음 — 연결이 아니라 병합 판단 필요 (검수자 재정의) |
| Side Control `bjj__side-control` | 삼보 | 삼보에 같은 계열 기록(재킷 그립 파이팅, 등 던지기 변형, удержание верхом/сбоку/со стороны головы)이 이미 있음 — 연결이 아니라 병합 판단 필요 (검수자 재정의) |
| Sweep / Foot Sweep `muay-thai__sweep-foot-sweep` | 삼보 | 삼보 발쓸기(Подсечка)와 무에타이 클린치 발쓸기의 동일 여부 불분명함. |
| Wrist Control `wrestling__wrist-control` | 삼보 | 삼보 Wrist Control은 탑 컨트롤 맥락으로 레슬링 스탠딩 그립과 다를 수 있음. |
| Combination `boxing__combination` | 태권도 | 범용 #Combination 해시태그로 복싱 콤비네이션과 동일 여부 불분명함. |
| Feint `karate__feint` | 태권도 | Feint의 기술 identity가 REVIEW (검수자 재정의) |
| Feint `wrestling__feint` | 태권도 | Feint의 기술 identity가 REVIEW (검수자 재정의) |
| Feint `boxing__feint` | 태권도 | Feint의 기술 identity가 REVIEW (검수자 재정의) |
| Jumping Kick `kickboxing__jumping-kick` | 태권도 | 태권도의 뛰어차기 기록들과 킥복싱 Jumping Kick의 관계 판단 필요 (검수자 재정의) |
| Soto Uke `karate__soto-uke` | 태권도 | 가라테 Soto Uke와 태권도 바깥막기는 방향 명칭이 반대로 쓰여 동일 기술인지 불분명함. |
| Uchi Uke `karate__uchi-uke` | 태권도 | 가라테 Uchi Uke와 태권도 안막기는 방향 명칭이 반대로 쓰여 동일 기술인지 불분명함. |
| Back Take `bjj__back-take` | 레슬링 | 레슬링 Single to Back Take/Go-Behind와 BJJ 오픈가드 백테이크의 동일 여부 불분명함. |
| Hand Fighting `boxing__hand-fighting` | 레슬링 | 레슬링 핸드파이팅과 복싱 인파이팅 손싸움의 동일 여부 불분명함. |
| Inside Control `kickboxing__inside-control` | 레슬링 | 레슬링 Inside Control과 킥복싱 클린치 Inside Control의 동일 여부 불분명함. |
| Pivot `kickboxing__pivot` | 레슬링 | 레슬링 Pivot과 킥복싱 피벗 풋워크의 동일 여부 불분명함. |
| Reversal `sambo__reversal` | 레슬링 | 레슬링은 리버설을 구체 기술별로 가짐 — 삼보의 일반 Reversal 기록을 연결할지 판단 필요 (검수자 재정의) |
| Shuffle `kickboxing__shuffle` | 레슬링 | 레슬링 Shuffle Step과 킥복싱 Shuffle의 동일 여부 불분명함. |
| Square Stance `kickboxing__square-stance` | 레슬링 | 레슬링 Square Stance와 킥복싱 Square Stance의 동일 여부 불분명함. |
| Wrist Control `boxing__wrist-control` | 레슬링 | 레슬링 Wrist Control과 복싱 클린치 손목 제어의 동일 여부 불분명함. |
| `muay-thai__khao-chiang-khao-khong`, `muay-thai__curving-knee` | (기술 identity) | 원문이 Khao Chiang을 한 곳에서는 다이애거널 니("Khao Chiang / Khao Khong — 다이애거널·커빙 니"), 다른 곳에서는 커빙 니("Curving Knee (Khao Chiang)")로 적음 — 원문끼리 충돌해 확정할 수 없음 |
| `kickboxing__wheel-kick`, `taekwondo__뒤후려차기` | (기술 identity) | 킥복싱 Wheel Kick 기록에 설명이 없고, 이름만으로는 회전 훅킥(뒤후려차기)인지 회전 힐킥인지 알 수 없음 |
| `judo__kibisu-gaeshi`, `wrestling__ankle-pick` | (기술 identity) | "발뒤꿈치 되잡기"와 앵클 픽 — 잡는 위치·마무리가 같은지 두 기록 모두 설명이 없어 확인할 수 없음 |
| `wrestling__inside-trip`, `judo__ouchi-gari` | (기술 identity) | 레슬링 Inside Trip은 설명이 없고 유도 오우치가리는 "큰 안 베기"뿐 — 동작이 같은지 확인할 수 없음 |
| `kickboxing__teep`, `muay-thai__push-teep`, `muay-thai__lead-teep`, `muay-thai__rear-teep` | (기술 identity) | 킥복싱 "Teep"은 설명 없이 리드/리어 구분도 없는 일반 항목 — 무에타이 리드·리어·푸시 티프 중 어느 것인지 확정할 수 없음 |
| `karate__feint`, `boxing__feint` | (기술 identity) | 가라테 Feint(장거리 견제, 상대가 Sen인지 Go no Sen인지 확인 — 발·손 모두)와 복싱 Feint(펀치 페인트)가 같은 기술인지 데이터로 확인할 수 없음 (전수 감사 패턴 A) |
| `bjj__collar-choke`, `sambo__collar-choke` | (기술 identity) | BJJ 칼라 초크는 백 컨트롤에서, 삼보 "Collar Choke 계열"은 위치 설명 없음 — 같은 기술인지 확인할 수 없어 별도 유지 |
