// Defense → counter and guard-control → attack combos for 사용자 콤보 (operator account
// MARTIALDEX), v1 (2026-10-18), plus the guard-control techniques the technique DB lacked.
// Researched from the web: every combo and technique cites the pages it came from (SOURCES).
// Steps are technique NAMES that must resolve to real MARTIALDEX techniques — the publisher
// refuses anything unresolved. Defense/guard-control steps carry the opponent's action in
// "react" (shown in Visualizing Mitt). Generated from the research notes; edit here, not there.
//
// Entry: { kind, art, steps: [{ t, note?, react? }], purpose, desc, src: [source keys] }
// TECHNIQUES: new shared-library records (add_teq) published before the combos that use them.

export const SOURCES = {
 "expertboxing_7_easy_boxing_counters_punches": {
  "label": "ExpertBoxing - 7 Easy Boxing Counter Punches",
  "url": "https://expertboxing.com/7-easy-boxing-counters-punches"
 },
 "ringsport_blogs_ringsport_blog_14_simple_boxing_co": {
  "label": "Ringsport - 14 Simple Boxing Counter Punching Techniques",
  "url": "https://www.ringsport.com.au/blogs/ringsport-blog/14-simple-boxing-counter-punching-techniques"
 },
 "warriorpunch_how_to_counter_the_jab": {
  "label": "Warrior Punch - How to Counter the Jab",
  "url": "https://warriorpunch.com/how-to-counter-the-jab/"
 },
 "dynamicstriking_blogs_news_countering_the_jab_with_a_lea": {
  "label": "Dynamic Striking - Countering the Jab with a Lead Uppercut by Teddy Atlas",
  "url": "https://dynamicstriking.com/blogs/news/countering-the-jab-with-a-lead-uppercut-by-teddy-atlas"
 },
 "expertboxing_10_counters_for_the_right_hand": {
  "label": "ExpertBoxing - 10 Counters for the Right Hand",
  "url": "https://expertboxing.com/10-counters-for-the-right-hand"
 },
 "blog_training_boxing_defense_101_dont_get_hit": {
  "label": "FightCamp - Boxing Defense 101: Don't Get Hit!",
  "url": "https://blog.joinfightcamp.com/training/boxing-defense-101-dont-get-hit/"
 },
 "dynamicstriking_blogs_news_slip_and_rip_with_teddy_atlas": {
  "label": "Dynamic Striking - Slip and Rip with Teddy Atlas",
  "url": "https://dynamicstriking.com/blogs/news/slip-and-rip-with-teddy-atlas"
 },
 "evolve-mma_blog_what_is_the_pull_counter_in_boxing_": {
  "label": "Evolve MMA - What Is The Pull Counter In Boxing And How To Use It",
  "url": "https://evolve-mma.com/blog/what-is-the-pull-counter-in-boxing-and-how-to-use-it/"
 },
 "evolve-mma_blog_the_check_hook_how_to_outsmart_pres": {
  "label": "Evolve MMA - The Check Hook: How To Outsmart Pressure Fighters In Boxing And MMA",
  "url": "https://evolve-mma.com/blog/the-check-hook-how-to-outsmart-pressure-fighters-in-boxing-and-mma/"
 },
 "evolve-mma_blog_5_boxing_counter_combinations_you_c": {
  "label": "Evolve MMA - 5 Boxing Counter Combinations You Can Add To Your Game",
  "url": "https://evolve-mma.com/blog/5-boxing-counter-combinations-you-can-add-to-your-game/"
 },
 "onxsports_blogs_inside_the_onx_lab_honing_champion": {
  "label": "ONX Sports - How to Counter a Hook in Boxing",
  "url": "https://onxsports.com/blogs/inside-the-onx-lab-honing-champions/how-to-counter-a-hook-in-boxing-video"
 },
 "expertboxing_how_to_shoulder_roll": {
  "label": "ExpertBoxing - How to Shoulder Roll",
  "url": "https://expertboxing.com/how-to-shoulder-roll"
 },
 "evolve-mma_blog_7_ways_to_set_up_the_uppercut_in_bo": {
  "label": "Evolve MMA - 7 Ways To Set Up The Uppercut In Boxing",
  "url": "https://evolve-mma.com/blog/7-ways-to-set-up-the-uppercut-in-boxing/"
 },
 "evolve-university_blog_5_basic_parry_and_counter_combinati": {
  "label": "Evolve University - 5 Basic Parry and Counter Combinations for Muay Thai",
  "url": "https://evolve-university.com/blog/5-basic-parry-and-counter-combinations-for-muay-thai/"
 },
 "evolve-university_blog_5_muay_thai_block_and_counter_combi": {
  "label": "Evolve University - 5 Muay Thai Block And Counter Combinations You Must Know",
  "url": "https://evolve-university.com/blog/5-muay-thai-block-and-counter-combinations-you-must-know/"
 },
 "evolve-mma_blog_muay_thai_defensive_combinations_th": {
  "label": "Evolve MMA - Muay Thai Defensive Combinations That Help You Block And Create Strong Counters",
  "url": "https://evolve-mma.com/blog/muay-thai-defensive-combinations-that-help-you-block-and-create-strong-counters/"
 },
 "evolve-mma_blog_3_muay_thai_counters_you_need_to_kn": {
  "label": "Evolve MMA - 3 Muay Thai Counters You Need To Know",
  "url": "https://evolve-mma.com/blog/3-muay-thai-counters-you-need-to-know/"
 },
 "evolve-mma_blog_heres_how_to_defend_the_jab_in_muay": {
  "label": "Evolve MMA - Here's How To Defend The Jab In Muay Thai",
  "url": "https://evolve-mma.com/blog/heres-how-to-defend-the-jab-in-muay-thai/"
 },
 "dynamicstriking_blogs_news_punish_their_punches_with_kar": {
  "label": "Dynamic Striking - Punish Their Punches with Karim Ghajji",
  "url": "https://dynamicstriking.com/blogs/news/punish-their-punches-with-karim-ghajji"
 },
 "dynamicstriking_blogs_news_boxing_combo_and_countering_w": {
  "label": "Dynamic Striking - Boxing Combo and Countering with a Low Kick by Karim Ghajji",
  "url": "https://dynamicstriking.com/blogs/news/boxing-combo-and-countering-with-a-low-kick-by-karim-ghajji"
 },
 "dynamicstriking_blogs_news_counter_the_jab_with_a_cross_": {
  "label": "Dynamic Striking - Counter the Jab with a Cross by Cedric Doumbe",
  "url": "https://dynamicstriking.com/blogs/news/counter-the-jab-with-a-cross-by-cedric-doumbe"
 },
 "dynamicstriking_blogs_news_countering_the_jab_by_melvin_": {
  "label": "Dynamic Striking - Countering the Jab by Melvin Manhoef",
  "url": "https://dynamicstriking.com/blogs/news/countering-the-jab-by-melvin-manhoef"
 },
 "dynamicstriking_blogs_news_parry_the_jab_and_land_the_ri": {
  "label": "Dynamic Striking - Parry the Jab and Land the Right Hand with Duane Ludwig",
  "url": "https://dynamicstriking.com/blogs/news/parry-the-jab-and-land-the-right-hand-with-duane-ludwig"
 },
 "dynamicstriking_blogs_news_slip_and_counter_to_the_body_": {
  "label": "Dynamic Striking - Slip and Counter to the Body with Duane Ludwig",
  "url": "https://dynamicstriking.com/blogs/news/slip-and-counter-to-the-body-with-duane-ludwig"
 },
 "dynamicstriking_blogs_news_a_fundamental_breakdown_of_th": {
  "label": "Dynamic Striking - A Fundamental Breakdown Of The Tomahawk Series With Carlos Condit",
  "url": "https://dynamicstriking.com/blogs/news/a-fundamental-breakdown-of-the-tomahawk-series-with-carlos-condit"
 },
 "dynamicstriking_blogs_news_combo_to_finish_with_overhand": {
  "label": "Dynamic Striking - Combo to Finish with Overhand Right by Cyrille Diabate",
  "url": "https://dynamicstriking.com/blogs/news/combo-to-finish-with-overhand-right-by-cyrille-diabate"
 },
 "dynamicstriking_blogs_news_catch_and_counter_tips_by_mor": {
  "label": "Dynamic Striking - Catch and Counter Tips by Morgan Charriere",
  "url": "https://dynamicstriking.com/blogs/news/catch-and-counter-tips-by-morgan-charriere"
 },
 "evolve-mma_blog_20_advanced_mma_striking_set_ups_an": {
  "label": "Evolve MMA - 20 Advanced MMA Striking Set-Ups And Combinations",
  "url": "https://evolve-mma.com/blog/20-advanced-mma-striking-set-ups-and-combinations-you-should-add-to-your-arsenal/"
 },
 "progressivecombatsystems_jeet_kune_do_surprise_rear_cross_like_pa": {
  "label": "Surprise Rear Cross Like PACMAN (Progressive Combat Systems)",
  "url": "https://www.progressivecombatsystems.com/jeet-kune-do/surprise-rear-cross-like-pacman/"
 },
 "en_wiki_overhand_punch": {
  "label": "Overhand punch (Wikipedia)",
  "url": "https://en.wikipedia.org/wiki/Overhand_punch"
 },
 "evolve-mma_blog_how_to_use_the_hand_trap_in_boxing": {
  "label": "How To Use The Hand Trap In Boxing (Evolve MMA)",
  "url": "https://evolve-mma.com/blog/how-to-use-the-hand-trap-in-boxing/"
 },
 "evolve-mma_blog_5_boxing_traps_beginners_must_know_": {
  "label": "5 Boxing Traps Beginners Must Know And How To Set Them Up (Evolve MMA)",
  "url": "https://evolve-mma.com/blog/5-boxing-traps-beginners-must-know-and-how-to-set-them-up/"
 },
 "evolve-mma_blog_what_is_the_pawing_jab": {
  "label": "What Is The Pawing Jab? (Evolve MMA)",
  "url": "https://evolve-mma.com/blog/what-is-the-pawing-jab/"
 },
 "martialtalk_threads_pull_your_opponents_guard_down_1": {
  "label": "Pull your opponent's guard down (MartialTalk forum)",
  "url": "https://www.martialtalk.com/threads/pull-your-opponents-guard-down.128011"
 },
 "evolve-mma_blog_6_tips_for_setting_up_knockout_elbo": {
  "label": "6 Tips For Setting Up Knockout Elbows In Muay Thai (Evolve MMA)",
  "url": "https://evolve-mma.com/blog/6-tips-for-setting-up-knockout-elbows-in-muay-thai/"
 },
 "evolve-university_blog_heres_how_to_utilize_checks_in_muay": {
  "label": "Here's How To Utilize Checks In Muay Thai (Evolve University)",
  "url": "https://evolve-university.com/blog/heres-how-to-utilize-checks-in-muay-thai/"
 },
 "evolve-mma_blog_3_counter_kicking_drills_to_practic": {
  "label": "3 Counter-Kicking Drills To Practice For Muay Thai (Evolve MMA)",
  "url": "https://evolve-mma.com/blog/3-counter-kicking-drills-to-practice-for-muay-thai/"
 },
 "dynamicstriking_blogs_news_how_to_counter_kicks_with_pun": {
  "label": "How To Counter Kicks With Punches With Bas Rutten (Dynamic Striking)",
  "url": "https://dynamicstriking.com/blogs/news/how-to-counter-kicks-with-punches-with-bas-rutten"
 },
 "muaythaibrisbane_catch_kick_return_kick_muay_thai_breakdo": {
  "label": "Catch Kick, Return Kick - Muay Thai Breakdown (Muay Thai Brisbane)",
  "url": "https://www.muaythaibrisbane.com/catch-kick-return-kick-muay-thai-breakdown"
 },
 "fightersonly_article_ext_43079_issue_049_1": {
  "label": "Fighters Only - Body kick catch and counter (Issue 049)",
  "url": "https://fightersonly.com/article/ext/43079/Issue+049/1"
 },
 "evolve-university_blog_4_muay_thai_catch_and_counter_techn": {
  "label": "4 Muay Thai Catch And Counter Techniques You Should Be Drilling (Evolve University)",
  "url": "https://evolve-university.com/blog/4-muay-thai-catch-and-counter-techniques-you-should-be-drilling/"
 },
 "dynamicstriking_blogs_news_catching_kicks_to_set_up_a_ta": {
  "label": "Catching Kicks To Set Up A Takedown With Henry Cejudo (Dynamic Striking)",
  "url": "https://dynamicstriking.com/blogs/news/catching-kicks-to-set-up-a-takedown-with-henry-cejudo"
 },
 "evolve-university_blog_3_muay_thai_push_kick_counters_for_": {
  "label": "3 Muay Thai Push Kick Counters For Muay Mat Fighters (Evolve University)",
  "url": "https://evolve-university.com/blog/3-muay-thai-push-kick-counters-for-muay-mat-fighters/"
 },
 "dynamicstriking_blogs_news_scoop_the_kick_with_carlos_co": {
  "label": "Scoop The Kick With Carlos Condit (Dynamic Striking)",
  "url": "https://dynamicstriking.com/blogs/news/scoop-the-kick-with-carlos-condit"
 },
 "evolve-mma_blog_how_to_use_the_long_guard_in_boxing": {
  "label": "How To Use The Long Guard In Boxing (Evolve MMA)",
  "url": "https://evolve-mma.com/blog/how-to-use-the-long-guard-in-boxing/"
 }
};

export const TECHNIQUES = [
 {
  "name": "Lead Hand Trap",
  "koreanName": "앞손 트랩",
  "art": "boxing",
  "category": "가드 조작",
  "description": "앞손으로 상대의 앞손(잽 손)을 짧게 눌러 잡거나 아래로 당겨 순간적으로 묶는 기술이다. 상대 앞손 바깥쪽 45도로 스텝인하면서 앞손으로 상대 앞손을 체크·트랩하고, 동시에 뒷손 크로스를 가드 정중앙으로 꽂는다.",
  "purpose": "상대의 잽과 짧은 리드 훅을 봉쇄하면서 뒷손 파워 펀치가 들어갈 길을 연다.",
  "keyPoints": [
   "상대 앞손 바깥쪽 45도로 스텝인",
   "트랩과 크로스를 스텝과 동시에 출발",
   "1초 이상 붙잡지 않고 짧게 눌렀다 놓기",
   "트랩 후 제자리에 서지 말고 클린치나 각도 이동으로 연결"
  ],
  "commonMistakes": [
   "트랩 없이 정면으로 걸어 들어가 잽·리드 훅에 맞음",
   "크로스를 크게 뒤로 빼서 예고함",
   "손을 오래 붙잡아 반칙 경고를 받음"
  ],
  "hand": "lead",
  "controlsOpponentHand": "lead",
  "src": [
   "progressivecombatsystems_jeet_kune_do_surprise_rear_cross_like_pa",
   "en_wiki_overhand_punch",
   "evolve-mma_blog_how_to_use_the_hand_trap_in_boxing"
  ]
 },
 {
  "name": "Rear Hand Trap",
  "koreanName": "뒷손 트랩",
  "art": "boxing",
  "category": "가드 조작",
  "description": "뒷손으로 상대의 뒷손 가드(턱을 지키는 손)를 밀어내거나 아래로 당겨 턱 옆을 비우는 기술이다. 같은 스탠스(오소독스 대 오소독스)에서 상대 뒷손과 내 뒷손이 마주 보는 위치를 이용해, 가드를 한 번에 치워낸 직후 리드 훅을 턱에 꽂는다.",
  "purpose": "단단한 하이 가드를 쓰는 상대의 턱 옆을 열어 리드 훅을 깨끗하게 맞힌다.",
  "keyPoints": [
   "가드를 치우는 동작은 한 번에 빠르게",
   "치우는 순간 바로 리드 훅 발사",
   "앞선 펀치(바디 어퍼·훅·크로스)로 가드를 먼저 굳히게 만들기",
   "심판이 보지 못하는 쪽 팔을 트랩"
  ],
  "commonMistakes": [
   "트랩 의도를 미리 보여줌",
   "당기다 중심을 잃고 앞으로 쏠림",
   "트랩하는 동안 반대쪽 수비를 비움"
  ],
  "hand": "rear",
  "controlsOpponentHand": "rear",
  "src": [
   "evolve-mma_blog_5_boxing_traps_beginners_must_know_",
   "evolve-mma_blog_how_to_use_the_hand_trap_in_boxing"
  ]
 },
 {
  "name": "Paw",
  "koreanName": "포잉 잽",
  "art": "boxing",
  "category": "가드 조작",
  "description": "앞손을 힘 없이 천천히 뻗어 상대의 앞손 가드를 톡 건드리거나 얼굴 앞 공간을 가리는 탐색용 잽이다. 골반 회전이나 앞발 피벗 없이 팔만 뻗어 거리를 재고 시야를 가린 뒤, 상대 반응에 맞춰 크로스·훅·어퍼컷으로 이어간다.",
  "purpose": "거리를 재고 상대 시야와 앞손을 묶어 다음 파워 펀치를 숨긴다.",
  "keyPoints": [
   "가드를 높게 유지한 채 앞손만 가볍게 뻗기",
   "힘을 싣지 말고 상대 가드나 얼굴 앞을 터치",
   "상대의 반응(뒤로 빠짐, 가드 올림, 카운터)을 관찰",
   "빠른 진짜 잽과 섞어 리듬을 바꾸기"
  ],
  "commonMistakes": [
   "게으르게 뻗다 가드가 내려가 훅·오버핸드 카운터를 맞음",
   "같은 타이밍으로 남발해 읽힘"
  ],
  "hand": "lead",
  "controlsOpponentHand": "lead",
  "src": [
   "evolve-mma_blog_what_is_the_pawing_jab",
   "evolve-mma_blog_how_to_use_the_long_guard_in_boxing"
  ]
 },
 {
  "name": "Guard Pull-Down",
  "koreanName": "가드 끌어내리기",
  "art": "muay-thai",
  "category": "가드 조작",
  "description": "한 손으로 상대 전완(가드 팔)을 걸어 잡고 자기 쪽 아래로 끌어당겨 가드를 벗겨내는 기술이다. 콤비네이션의 마지막 펀치를 일부러 빗나가게 던진 뒤 손을 펴서 상대 전완을 잡아당기면, 상대 머리가 끌려 들어오며 팔꿈치나 스트레이트가 들어갈 길이 열린다.",
  "purpose": "닫힌 가드를 강제로 열고 상대를 끌어당겨 근거리 타격(팔꿈치·스트레이트)을 맞힌다.",
  "keyPoints": [
   "펀치 콤비네이션 끝에 손을 펴서 전완을 잡기",
   "아래·자기 쪽으로 당겨 상대를 끌어들이기",
   "상대가 버티면 그 손을 놓으며 스트레이트, 붙인 채면 호리즌털 엘보",
   "당긴 손의 반대 손은 턱 가드 유지"
  ],
  "commonMistakes": [
   "세게 내려치기만 해서 상대가 반동을 이용하게 함",
   "당기는 동안 반대 손 가드를 내림",
   "당긴 뒤 바로 공격하지 않고 머뭇거림"
  ],
  "hand": "lead|rear",
  "controlsOpponentHand": "lead (주로 상대 앞손 전완, 상황에 따라 뒷손)",
  "src": [
   "evolve-mma_blog_6_tips_for_setting_up_knockout_elbo",
   "martialtalk_threads_pull_your_opponents_guard_down_1",
   "en_wiki_overhand_punch"
  ]
 }
];

export const ENTRIES = [
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Block",
    "note": "뒷손 글러브로 잽을 막음",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Jab"
   }
  ],
  "purpose": "잽을 막은 직후 같은 타이밍에 잽으로 되받아 주도권을 뺏는다.",
  "desc": "상대 공격·상황: 상대 잽. 뒷손 글러브로 상대 잽을 막고 곧바로 잽을 얼굴로 되돌려준다. 원투가 이어질 수 있으니 앞어깨를 높이고 턱을 당긴다.",
  "src": [
   "expertboxing_7_easy_boxing_counters_punches"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Duck",
    "note": "무릎을 굽혀 잽 아래로 내려감",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Body Jab"
   },
   {
    "t": "Cross"
   }
  ],
  "purpose": "잽 아래로 들어가 열린 몸통을 공략한다.",
  "desc": "상대 공격·상황: 상대 잽. 무릎을 굽혀 몸을 낮춰 잽을 흘리고 명치나 옆구리로 잽을 꽂은 뒤, 여유가 있으면 크로스를 얼굴로 이어간다.",
  "src": [
   "expertboxing_7_easy_boxing_counters_punches"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Downward Parry",
    "note": "뒷손으로 상대 잽을 아래로 눌러냄",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Cross"
   }
  ],
  "purpose": "잽을 눌러 길을 연 뒤 그 위로 스트레이트를 꽂는다.",
  "desc": "상대 공격·상황: 상대 잽. 오른 글러브로 상대 왼손을 아래로 밀어낸 다음, 눌린 팔 위로 스트레이트 라이트를 얼굴에 던진다.",
  "src": [
   "expertboxing_7_easy_boxing_counters_punches"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Slip Inside",
    "note": "머리를 잽 안쪽으로 살짝 기울임",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Overhand"
   }
  ],
  "purpose": "잽 바깥 위로 넘어가는 오버핸드로 강한 카운터를 노린다.",
  "desc": "상대 공격·상황: 상대 잽. 머리를 잽 안쪽으로 살짝 기울이고, 상대 잽의 바깥 위로 약간 아치를 그리는 오버핸드 라이트를 던진다.",
  "src": [
   "expertboxing_7_easy_boxing_counters_punches"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Block",
    "note": "앞손 글러브로 크로스를 막음",
    "react": "상대가 크로스를 던짐"
   },
   {
    "t": "Cross"
   }
  ],
  "purpose": "상대가 팔을 회수하기 전에 같은 손 반격으로 되갚는다.",
  "desc": "상대 공격·상황: 상대 크로스. 앞손 글러브로 크로스를 막고, 상대가 팔을 거둬들이기 전에 곧바로 내 라이트를 던진다.",
  "src": [
   "expertboxing_7_easy_boxing_counters_punches"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Slip Outside",
    "note": "잽 바깥(오른쪽)으로 머리 이동",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Cross"
   }
  ],
  "purpose": "가장 기본적인 슬립 카운터로 잽에 크로스를 맞춘다.",
  "desc": "상대 공격·상황: 상대 잽. 잽을 오른쪽(바깥)으로 슬립해 흘린 뒤 장전된 뒷손으로 크로스를 던진다.",
  "src": [
   "ringsport_blogs_ringsport_blog_14_simple_boxing_co",
   "warriorpunch_how_to_counter_the_jab"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Slip Inside",
    "note": "잽 안쪽(왼쪽)으로 슬립하고 낮게 유지",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Lead Uppercut"
   }
  ],
  "purpose": "상대가 리드 훅을 예상할 때 아래에서 올라오는 어퍼로 허를 찌른다.",
  "desc": "상대 공격·상황: 상대 잽. 잽 사거리 끝에서 잽을 유도해 안쪽으로 슬립하고, 일어서지 말고 낮게 머문 채 리드 어퍼컷을 올려친다.",
  "src": [
   "dynamicstriking_blogs_news_countering_the_jab_with_a_lea",
   "warriorpunch_how_to_counter_the_jab"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Slip Outside",
    "note": "크로스 바깥(왼쪽)으로 최소한만 머리 이동",
    "react": "상대가 크로스를 던짐"
   },
   {
    "t": "Lead Hook"
   }
  ],
  "purpose": "크로스를 흘린 뒤 열린 옆머리나 몸통에 리드 훅을 꽂는다.",
  "desc": "상대 공격·상황: 상대 크로스. 작은 동작으로 크로스 바깥으로 슬립하고, 한 걸음 붙으며 리드 훅을 머리나 몸통에 던진다.",
  "src": [
   "ringsport_blogs_ringsport_blog_14_simple_boxing_co",
   "expertboxing_10_counters_for_the_right_hand"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Duck",
    "note": "무릎을 굽혀 크로스 아래로 내려감",
    "react": "상대가 크로스를 던짐"
   },
   {
    "t": "Body Cross"
   }
  ],
  "purpose": "크로스 아래로 숙이며 명치에 라이트를 맞바꾼다.",
  "desc": "상대 공격·상황: 상대 크로스. 마지막 순간까지 서 있다가 무릎을 굽혀 상대 라이트 아래로 숙이고, 눈은 상대 머리를 보며 명치로 라이트를 꽂는다.",
  "src": [
   "expertboxing_10_counters_for_the_right_hand",
   "ringsport_blogs_ringsport_blog_14_simple_boxing_co"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Roll",
    "note": "무릎을 굽혀 훅 아래로 위빙",
    "react": "상대가 리드 훅을 던짐"
   },
   {
    "t": "Rear Uppercut"
   }
  ],
  "purpose": "위빙에서 빠져나오며 장전된 뒷손 어퍼로 반격한다.",
  "desc": "상대 공격·상황: 상대 리드 훅. 무릎을 굽혀 훅 아래로 위빙하고, 빠져나오는 순간 뒷손 어퍼컷(또는 크로스)을 더한다.",
  "src": [
   "blog_training_boxing_defense_101_dont_get_hit"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Lean Back",
    "note": "상체를 뒤로 젖혀 훅을 피함",
    "react": "상대가 리드 훅을 던짐"
   },
   {
    "t": "Cross"
   }
  ],
  "purpose": "훅이 빗나가 상대가 열린 순간 곧게 뻗는 크로스로 받아친다.",
  "desc": "상대 공격·상황: 상대 리드 훅. 상체를 뒤로 젖혀 훅을 흘려보낸 뒤 곧바로 라이트 크로스를 던진다.",
  "src": [
   "ringsport_blogs_ringsport_blog_14_simple_boxing_co"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Roll",
    "note": "훅 반대쪽(왼쪽)으로 숙여 피함",
    "react": "상대가 리어 훅을 던짐"
   },
   {
    "t": "Lead Hook"
   }
  ],
  "purpose": "리어 훅 아래로 빠지며 같은 쪽에서 리드 훅으로 되받는다.",
  "desc": "상대 공격·상황: 상대 리어 훅. 상대 라이트 훅을 왼쪽으로 숙여 피하고, 올라오며 레프트 훅을 던진다.",
  "src": [
   "ringsport_blogs_ringsport_blog_14_simple_boxing_co"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Double Slip",
    "note": "잽은 오른쪽, 크로스는 왼쪽으로 연속 슬립",
    "react": "상대가 잽-크로스를 던짐"
   },
   {
    "t": "Lead Hook"
   },
   {
    "t": "Cross"
   }
  ],
  "purpose": "원투를 모두 흘린 뒤 훅-크로스로 되갚는다.",
  "desc": "상대 공격·상황: 상대 원투. 잽을 오른쪽으로, 이어지는 크로스를 왼쪽으로 멈춤 없이 슬립한 다음 레프트 훅과 라이트 크로스로 반격한다.",
  "src": [
   "ringsport_blogs_ringsport_blog_14_simple_boxing_co",
   "blog_training_boxing_defense_101_dont_get_hit"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Slip Outside",
    "note": "잽 바깥으로 슬립하며 엉덩이를 장전",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Cross"
   },
   {
    "t": "Lead Hook"
   }
  ],
  "purpose": "빗나간 잽의 대가를 치르게 하는 '슬립 앤 립' 카운터.",
  "desc": "상대 공격·상황: 상대 잽. 상대 잽을 기다렸다가 바깥으로 슬립하고, 장전된 엉덩이로 뒷손 스트레이트와 레프트 훅을 이어 던진다. 끝난 뒤에는 뒤로 물러나지 말고 각도를 바꿔 빠진다.",
  "src": [
   "dynamicstriking_blogs_news_slip_and_rip_with_teddy_atlas"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Pull",
    "note": "머리와 상체를 살짝 뒤로 당김",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Cross"
   }
  ],
  "purpose": "단발 잽을 빼서 헛치게 한 뒤 크로스로 응징하는 풀 카운터.",
  "desc": "상대 공격·상황: 상대 잽. 잽이나 잽 페인트로 상대 잽을 유도하고, 머리를 뒤로 살짝 빼 피한 뒤 곧바로 크로스를 던진다. 너무 많이 젖히면 균형이 무너지니 주의한다.",
  "src": [
   "evolve-mma_blog_what_is_the_pull_counter_in_boxing_",
   "blog_training_boxing_defense_101_dont_get_hit"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Angle Out",
    "note": "앞발을 축으로 뒷발을 45~90도 돌려 중심선에서 빠짐",
    "react": "상대가 큰 펀치와 함께 돌진함"
   },
   {
    "t": "Check Hook"
   },
   {
    "t": "Cross"
   }
  ],
  "purpose": "밀고 들어오는 압박형 상대의 전진 힘을 역이용한다.",
  "desc": "상대 공격·상황: 상대 돌진. 상대가 큰 펀치에 몸을 싣고 들어오면 피벗으로 중심선을 벗어나며 리드 훅(체크 훅)을 꽂고, 흔들린 상대에게 스트레이트를 이어간다.",
  "src": [
   "evolve-mma_blog_the_check_hook_how_to_outsmart_pres",
   "evolve-mma_blog_5_boxing_counter_combinations_you_c"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Roll",
    "note": "리드 훅 아래로 굴러 들어감",
    "react": "상대가 리드 훅을 던짐"
   },
   {
    "t": "Body Hook"
   },
   {
    "t": "Rear Hook"
   },
   {
    "t": "Lead Hook"
   }
  ],
  "purpose": "훅 아래로 들어가며 몸통-머리로 이어지는 훅 연타를 퍼붓는다.",
  "desc": "상대 공격·상황: 상대 리드 훅. 리드 훅 아래로 롤하면서 한 동작으로 리드 바디 훅을 넣고, 이어서 리어 훅과 리드 훅을 머리로 던진다.",
  "src": [
   "evolve-mma_blog_5_boxing_counter_combinations_you_c"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Slip Inside",
    "note": "훅 안쪽, 상대 겨드랑이 쪽으로 머리 이동",
    "react": "상대가 리드 훅을 던짐"
   },
   {
    "t": "Cross"
   }
  ],
  "purpose": "곡선으로 오는 훅 안쪽으로 들어가 직선 크로스로 먼저 맞힌다.",
  "desc": "상대 공격·상황: 상대 리드 훅. 훅 안쪽으로 슬립해 머리를 상대 겨드랑이 근처에 두고, 체중을 실어 뒷손을 중심선으로 곧게 뻗는다.",
  "src": [
   "onxsports_blogs_inside_the_onx_lab_honing_champion"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Shoulder Roll",
    "note": "왼어깨를 굴려 라이트를 흘림",
    "react": "상대가 크로스를 던짐"
   },
   {
    "t": "Cross"
   }
  ],
  "purpose": "숄더 롤로 흘린 직후 장전된 뒷손으로 받아친다.",
  "desc": "상대 공격·상황: 상대 크로스. 앞어깨를 굴려 상대 라이트에서 멀어지며 막고, 두 발을 지면에 둔 채 눈을 떼지 않고 스트레이트 라이트로 반격한다.",
  "src": [
   "expertboxing_10_counters_for_the_right_hand",
   "expertboxing_how_to_shoulder_roll"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Shoulder Roll",
    "note": "왼어깨로 라이트를 굴려 흘림",
    "react": "상대가 크로스를 던짐"
   },
   {
    "t": "Overhand"
   }
  ],
  "purpose": "숄더 롤 뒤 머리 위로 넘어가는 오버핸드로 각도를 바꿔 반격한다.",
  "desc": "상대 공격·상황: 상대 크로스. 앞어깨를 굴려 상대 라이트를 피한 뒤, 선택지 중 하나인 오버핸드 라이트를 던진다.",
  "src": [
   "expertboxing_10_counters_for_the_right_hand"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Cover",
    "note": "하이 가드로 덮고 맞는 순간 숨을 내쉼",
    "react": "상대가 크로스를 던짐"
   },
   {
    "t": "Lead Hook"
   }
  ],
  "purpose": "가드에 닿는 감각을 신호로 즉시 레프트 훅을 터뜨린다.",
  "desc": "상대 공격·상황: 상대 크로스. 하이 가드로 덮어 상대 라이트를 받으며 숨을 내쉬고, 라이트가 닿는 순간 레프트 훅을 폭발적으로 던진다.",
  "src": [
   "expertboxing_10_counters_for_the_right_hand"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Lead Hand Parry",
    "note": "앞손으로 라이트를 아래·바깥으로 살짝 쳐냄",
    "react": "상대가 크로스를 던짐"
   },
   {
    "t": "Jab"
   }
  ],
  "purpose": "작은 패리로 라이트를 흘리고 그 위로 잽을 넣는다.",
  "desc": "상대 공격·상황: 상대 크로스. 왼손으로 상대 라이트 글러브를 작게 쳐서 얼굴에서 아래·바깥으로 밀어내고, 곧바로 그 위로 잽을 던진다.",
  "src": [
   "expertboxing_10_counters_for_the_right_hand"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Catch",
    "note": "뒷손을 3~4인치만 움직여 잽을 받음",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Jab"
   }
  ],
  "purpose": "안전한 캐치로 잽을 받고 같은 박자에 잽으로 되돌린다.",
  "desc": "상대 공격·상황: 상대 잽. 뒷손을 얼굴에서 3~4인치만 내밀어 손바닥으로 잽을 가볍게 받아낸 뒤, 머리나 몸통으로 잽을 되돌려준다.",
  "src": [
   "warriorpunch_how_to_counter_the_jab"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Slip Outside",
    "note": "잽 바깥으로 머리를 빼 중심선에서 벗어남",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Lead Uppercut"
   }
  ],
  "purpose": "슬립으로 생긴 각도에서 리드 어퍼를 바로 올려친다.",
  "desc": "상대 공격·상황: 상대 잽. 상대 잽 바깥으로 슬립해 머리를 중심선에서 빼고, 억지로 하지 말고 정확한 타이밍에 리드 어퍼컷을 즉시 던진다.",
  "src": [
   "evolve-mma_blog_7_ways_to_set_up_the_uppercut_in_bo"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Duck",
    "note": "넘어지듯 수직으로 떨어지며 무릎으로 받침",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Lead Uppercut"
   }
  ],
  "purpose": "잽 아래로 떨어진 낮은 자세에서 어퍼컷으로 솟아오른다.",
  "desc": "상대 공격·상황: 상대 잽. 넘어지듯 똑바로 떨어져 무릎을 굽혀 잽을 머리 위로 흘리고, 그 자세에서 어퍼컷으로 반격한다.",
  "src": [
   "warriorpunch_how_to_counter_the_jab"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Rear Hand Parry",
    "note": "잽을 아래·대각선 중심선 쪽으로 밀어냄",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Cross"
   }
  ],
  "purpose": "패리로 상대 몸을 돌려 열린 얼굴 왼쪽에 크로스를 꽂는다.",
  "desc": "상대 공격·상황: 상대 잽. 잽을 아래 대각선으로 중심선 쪽으로 밀어내 상대 몸이 돌아가게 하고, 패리한 그 손으로 즉시 강한 크로스를 던진다.",
  "src": [
   "evolve-university_blog_5_basic_parry_and_counter_combinati"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Rear Hand Parry",
    "note": "뒷손을 안쪽으로 휘둘러 잽을 쳐냄",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Low Kick"
   }
  ],
  "purpose": "패리로 균형을 흐트러뜨린 순간 로우킥으로 다리를 친다.",
  "desc": "상대 공격·상황: 상대 잽. 뒷손을 안쪽으로 휘둘러 잽을 패리해 상대 균형을 무너뜨리고, 열린 다리에 로우킥을 찬다. 필요하면 잽-크로스를 더한다.",
  "src": [
   "evolve-university_blog_5_basic_parry_and_counter_combinati"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Lead Hand Parry",
    "note": "앞손을 안쪽으로 휘둘러 크로스를 쳐냄",
    "react": "상대가 크로스를 던짐"
   },
   {
    "t": "Low Kick"
   },
   {
    "t": "Lead Hook"
   }
  ],
  "purpose": "상대가 균형을 되찾기 전 로우킥, 오른손이 돌아오기 전 훅을 넣는다.",
  "desc": "상대 공격·상황: 상대 크로스. 앞손으로 크로스를 안쪽으로 패리하고, 상대가 균형을 회복하는 동안 로우킥을 찬 뒤 오른손이 가드로 돌아오기 전에 레프트 훅을 던진다.",
  "src": [
   "evolve-university_blog_5_basic_parry_and_counter_combinati"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Parry",
    "note": "하이 가드에서 뒷손으로 잽 안쪽을 패리",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Jab"
   },
   {
    "t": "Cross"
   }
  ],
  "purpose": "잽을 패리한 뒤 원투로 즉시 되받아친다.",
  "desc": "상대 공격·상황: 상대 잽. 하이 가드에서 뒷손을 잽 안쪽으로 움직여 패리하고, 머리로 잽을 던진 뒤 강한 크로스로 마무리한다.",
  "src": [
   "evolve-university_blog_5_muay_thai_block_and_counter_combi"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Slip Outside",
    "note": "잽 바깥으로 슬립",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Cross"
   },
   {
    "t": "Lead Hook"
   },
   {
    "t": "Low Kick"
   }
  ],
  "purpose": "슬립 후 펀치 연타로 시선을 위로 끌고 로우킥으로 끝낸다.",
  "desc": "상대 공격·상황: 상대 잽. 잽 바깥으로 슬립해 피한 뒤 크로스와 훅을 이어 던지고 로우킥으로 마무리한다.",
  "src": [
   "evolve-mma_blog_muay_thai_defensive_combinations_th"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Parry",
    "note": "펀치를 중심선 밖으로 패리",
    "react": "상대가 잽이나 크로스로 전진함"
   },
   {
    "t": "Teep"
   }
  ],
  "purpose": "밀고 들어오는 상대를 패리 후 팁으로 밀어내 거리를 리셋한다.",
  "desc": "상대 공격·상황: 상대 잽/크로스. 들어오는 잽이나 크로스를 중심선 밖으로 패리하고, 몸통에 팁을 차서 거리를 다시 벌린다.",
  "src": [
   "evolve-mma_blog_muay_thai_defensive_combinations_th"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Lean Back",
    "note": "상체를 뒤로 젖혀 공격을 피함",
    "react": "상대가 크게 펀치를 던짐"
   },
   {
    "t": "Cross"
   }
  ],
  "purpose": "젖혀 피한 뒤 상대가 자세를 되돌리는 틈에 크로스를 꽂는다.",
  "desc": "상대 공격·상황: 상대 강한 펀치. 공격에서 상체를 뒤로 젖혀 피하고, 상대가 자세를 리셋할 때 앞으로 들어가며 스트레이트 크로스(또는 니킥)를 던진다.",
  "src": [
   "evolve-mma_blog_muay_thai_defensive_combinations_th"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Parry",
    "note": "펀치 쪽으로 반 걸음 이동하며 패리, 머리도 살짝 슬립",
    "react": "상대가 잽이나 크로스를 던짐"
   },
   {
    "t": "Straight Knee"
   }
  ],
  "purpose": "패리로 중심을 연 뒤 정중앙으로 뒷무릎을 찔러 넣는다.",
  "desc": "상대 공격·상황: 상대 잽/크로스. 펀치가 온 쪽으로 반 걸음 내딛으며 패리하고, 곧바로 뒷무릎을 중앙으로 올려친다. 안쪽 손을 상대 어깨에 걸면 통제가 더해진다.",
  "src": [
   "evolve-mma_blog_3_muay_thai_counters_you_need_to_kn"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Slip Inside",
    "note": "몸을 왼쪽으로 떨어뜨려 잽 안쪽으로 슬립",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Body Uppercut"
   }
  ],
  "purpose": "안쪽 슬립으로 생긴 각도에서 몸통 어퍼를 넣는다.",
  "desc": "상대 공격·상황: 상대 잽. 타이밍에 맞춰 몸을 왼쪽으로 떨어뜨려 잽을 피하고, 생긴 각도에서 레프트 어퍼컷을 몸통에 꽂는다.",
  "src": [
   "evolve-mma_blog_heres_how_to_defend_the_jab_in_muay"
  ]
 },
 {
  "kind": "setup",
  "art": "kickboxing",
  "steps": [
   {
    "t": "Block",
    "note": "앞손으로 잽을 막음",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Slip Outside",
    "note": "이어지는 스트레이트 라이트 바깥으로 슬립",
    "react": "상대가 스트레이트 라이트를 던짐"
   },
   {
    "t": "Low Kick"
   }
  ],
  "purpose": "펀치 후 체중이 실린 상대 뒷다리를 로우킥으로 응징한다.",
  "desc": "상대 공격·상황: 상대 원투. 잽은 앞손으로 막고 스트레이트 라이트는 바깥으로 슬립한 뒤, 장전된 자세에서 상대 뒷다리에 뒷발 로우킥을 찬다.",
  "src": [
   "dynamicstriking_blogs_news_punish_their_punches_with_kar"
  ]
 },
 {
  "kind": "setup",
  "art": "kickboxing",
  "steps": [
   {
    "t": "Catch",
    "note": "뒷손으로 잽을 받음",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Slip Outside",
    "note": "라이트 크로스 바깥으로 슬립",
    "react": "상대가 크로스를 던짐"
   },
   {
    "t": "Low Kick"
   }
  ],
  "purpose": "크로스를 회수하는 순간 체크가 어려운 뒷다리를 찬다.",
  "desc": "상대 공격·상황: 상대 원투. 잽을 뒷손으로 캐치하고 라이트 크로스를 바깥으로 슬립한 뒤, 손이 가드로 돌아가는 순간 상대 뒷다리에 뒷발 로우킥을 찬다. 맞는 도중에는 차지 않는다.",
  "src": [
   "dynamicstriking_blogs_news_boxing_combo_and_countering_w"
  ]
 },
 {
  "kind": "setup",
  "art": "kickboxing",
  "steps": [
   {
    "t": "Slip Outside",
    "note": "리어 크로스 바깥으로 슬립",
    "react": "상대가 크로스를 던짐"
   },
   {
    "t": "Lead Low Kick"
   }
  ],
  "purpose": "클로즈드 스탠스에서 슬립 직후 앞발로 뒷다리를 끊어 찬다.",
  "desc": "상대 공격·상황: 상대 크로스. 상대 리어 크로스를 슬립하고 풋워크로 앞발 로우킥을 상대 뒷다리에 찬 뒤, 거리가 매우 가까우니 즉시 빠져나간다.",
  "src": [
   "dynamicstriking_blogs_news_punish_their_punches_with_kar"
  ]
 },
 {
  "kind": "setup",
  "art": "kickboxing",
  "steps": [
   {
    "t": "Slip Inside",
    "note": "머리를 잽 안쪽으로 넣음",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Cross"
   }
  ],
  "purpose": "상대 팔이 뻗은 순간 그 위·아래로 교차하는 크로스 카운터.",
  "desc": "상대 공격·상황: 상대 잽. 상대 팔이 내 위로 뻗어 오는 순간 머리를 잽 안쪽으로 넣으며 체중을 실어 크로스를 던진다. 너무 늦으면 맞고 너무 빠르면 팔에 부딪힌다.",
  "src": [
   "dynamicstriking_blogs_news_counter_the_jab_with_a_cross_"
  ]
 },
 {
  "kind": "setup",
  "art": "kickboxing",
  "steps": [
   {
    "t": "Slip Outside",
    "note": "앞으로 스텝하며 잽 바깥으로 슬립",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Cross"
   },
   {
    "t": "Lead Hook"
   },
   {
    "t": "Cross"
   }
  ],
  "purpose": "슬립과 함께 거리를 좁혀 상대 크로스 사거리를 벗어나며 연타한다.",
  "desc": "상대 공격·상황: 상대 잽. 앞으로 한 걸음 내딛으며 잽 바깥으로 슬립하고 크로스-훅-크로스로 반격한다. 스텝 없이 슬립하면 상대 크로스 사거리에 남는다.",
  "src": [
   "dynamicstriking_blogs_news_countering_the_jab_by_melvin_"
  ]
 },
 {
  "kind": "setup",
  "art": "mixed-martial-arts",
  "steps": [
   {
    "t": "Downward Parry",
    "note": "손바닥으로 잽을 아래로 누르며 안쪽으로 스텝",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Overhand"
   }
  ],
  "purpose": "패리한 손을 내밀어 길을 열고 오른손을 바로 꽂는다.",
  "desc": "상대 공격·상황: 상대 잽. 잽을 손바닥으로 아래로 누르며 왼쪽으로 스텝해 머리를 빼고, 패리한 손은 얼굴로 거두지 말고 내민 채 오버핸드 크로스(또는 훅)를 즉시 던진다.",
  "src": [
   "dynamicstriking_blogs_news_parry_the_jab_and_land_the_ri"
  ]
 },
 {
  "kind": "setup",
  "art": "mixed-martial-arts",
  "steps": [
   {
    "t": "Slip Outside",
    "note": "어깨를 돌리고 엉덩이를 접어 잽 바깥으로 슬립",
    "react": "상대가 잽을 뻗음"
   },
   {
    "t": "Body Hook"
   }
  ],
  "purpose": "잽에 체중을 실어 들어오는 상대의 비장에 바디 훅을 꽂는다.",
  "desc": "상대 공격·상황: 상대 잽. 잽을 예측해 어깨 회전과 고관절 접기로 바깥 슬립하고, 낮게 장전된 자세에서 라이트 훅을 상대 비장(옆구리)에 던진다.",
  "src": [
   "dynamicstriking_blogs_news_slip_and_counter_to_the_body_"
  ]
 },
 {
  "kind": "setup",
  "art": "mixed-martial-arts",
  "steps": [
   {
    "t": "Slip",
    "note": "스트레이트 라이트를 슬립",
    "react": "상대가 스트레이트 라이트를 던짐"
   },
   {
    "t": "Roll",
    "note": "허리가 아닌 무릎을 굽혀 훅 아래로 롤",
    "react": "상대가 이어서 레프트 훅을 던짐"
   },
   {
    "t": "Body Hook"
   },
   {
    "t": "Lead Hook"
   },
   {
    "t": "Cross"
   }
  ],
  "purpose": "연속 공격을 슬립-롤로 흘리고 몸통-머리 연타로 마무리한다.",
  "desc": "상대 공격·상황: 상대 크로스→리드 훅. 스트레이트를 슬립하고 무릎을 굽혀 훅 아래로 롤하며 레프트 바디 훅을 넣고, 왼손을 다시 장전해 머리로 훅, 마지막으로 스트레이트 라이트를 던진다.",
  "src": [
   "dynamicstriking_blogs_news_a_fundamental_breakdown_of_th"
  ]
 },
 {
  "kind": "setup",
  "art": "mixed-martial-arts",
  "steps": [
   {
    "t": "Slip Outside",
    "note": "턱을 당기고 전진하며 왼쪽으로 기울여 라이트 바깥으로 슬립",
    "react": "상대가 라이트 스트레이트나 오버핸드를 던짐"
   },
   {
    "t": "Overhand"
   }
  ],
  "purpose": "상대가 라이트에 몸을 실은 순간 열린 옆머리에 오버핸드를 꽂는다.",
  "desc": "상대 공격·상황: 상대 크로스/오버핸드. 턱을 당기고 앞으로 스텝하며 살짝 왼쪽으로 기울여 상대 라이트 바깥으로 슬립하고, 그 반동으로 내 오버핸드 라이트를 던진다.",
  "src": [
   "dynamicstriking_blogs_news_combo_to_finish_with_overhand"
  ]
 },
 {
  "kind": "setup",
  "art": "mixed-martial-arts",
  "steps": [
   {
    "t": "Slip Outside",
    "note": "스트레이트 바깥으로 슬립해 중심선 이탈",
    "react": "상대가 스트레이트로 거리를 좁힘"
   },
   {
    "t": "Lead Low Kick"
   },
   {
    "t": "Body Hook"
   },
   {
    "t": "Lead Hook"
   },
   {
    "t": "High Kick"
   }
  ],
  "purpose": "슬립과 동시에 로우킥으로 전진을 끊고 같은 쪽 연타로 읽기 어렵게 만든다.",
  "desc": "상대 공격·상황: 상대 스트레이트. 스트레이트 바깥으로 슬립하며 동시에 안쪽 앞발 로우킥으로 상대 전진을 멈추고, 간 쪽 바디 훅-머리 훅에 이어 뒷발 하이킥을 찬다.",
  "src": [
   "dynamicstriking_blogs_news_catch_and_counter_tips_by_mor"
  ]
 },
 {
  "kind": "setup",
  "art": "mixed-martial-arts",
  "steps": [
   {
    "t": "Shoulder Roll",
    "note": "어깨를 으쓱해 크로스를 흘림",
    "react": "상대가 크로스를 던짐"
   },
   {
    "t": "Backfist"
   }
  ],
  "purpose": "예상치 못한 각도에서 돌아오는 백피스트로 허를 찌른다.",
  "desc": "상대 공격·상황: 상대 크로스. 어깨를 으쓱해 크로스를 피한 직후 몸을 돌려 스피닝 백피스트를 던진다.",
  "src": [
   "evolve-mma_blog_20_advanced_mma_striking_set_ups_an"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Lead Hand Trap",
    "note": "상대 앞손 바깥 45도로 스텝인하며 앞손으로 체크",
    "react": "앞손이 묶여 잽·리드 훅을 못 냄"
   },
   {
    "t": "Cross",
    "note": "스텝과 동시에 가드 정중앙으로"
   }
  ],
  "purpose": "상대 앞손을 묶어 카운터 위험 없이 크로스를 꽂는다.",
  "desc": "상대 공격·상황: 상대 앞손 가드(오소독스 대 사우스포). 앞손 바깥으로 각도를 잡으며 상대 앞손을 트랩하고 동시에 크로스를 가드 가운데로 찌른다. 상대 뒷손에서 멀어지는 방향이라 안전하다.",
  "src": [
   "progressivecombatsystems_jeet_kune_do_surprise_rear_cross_like_pa"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Lead Hand Trap",
    "note": "상대 앞손을 잡아 아래로 당김",
    "react": "앞손 가드가 내려감"
   },
   {
    "t": "Overhand",
    "note": "당기는 동시에 뒷손 오버핸드"
   }
  ],
  "purpose": "앞손 가드를 끌어내려 오버핸드가 넘어갈 공간을 만든다.",
  "desc": "상대 공격·상황: 상대 앞손 가드(클로즈드 스탠스). 같은 쪽에서 마주 선 상대의 앞손을 잡아 내리며 뒷손 오버핸드를 머리 위로 넘겨 친다.",
  "src": [
   "en_wiki_overhand_punch"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Rear Hand Trap",
    "note": "뒷손으로 상대 뒷손 가드를 턱에서 한 번에 치움",
    "react": "턱 옆이 비어 있음"
   },
   {
    "t": "Lead Hook",
    "note": "턱으로"
   }
  ],
  "purpose": "단단한 하이 가드를 치우고 리드 훅을 턱에 맞힌다.",
  "desc": "상대 공격·상황: 상대 하이 가드. 뒷손으로 상대 가드를 턱에서 걷어낸 직후 리드 훅을 꽂는 기본 트랩 콤비네이션이다.",
  "src": [
   "evolve-mma_blog_how_to_use_the_hand_trap_in_boxing"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Lead Uppercut",
    "note": "바디로",
    "react": "상대가 커버를 굳힘"
   },
   {
    "t": "Lead Hook",
    "note": "관자놀이로, 세팅 펀치"
   },
   {
    "t": "Cross",
    "note": "상대 뒷손 위로"
   },
   {
    "t": "Rear Hand Trap",
    "note": "뒷손으로 상대 뒷손 글러브를 끌어내림",
    "react": "턱이 노출됨"
   },
   {
    "t": "Lead Hook",
    "note": "턱에 클린 히트"
   }
  ],
  "purpose": "커버하는 상대를 펀치로 묶은 뒤 뒷손 가드를 끌어내려 리드 훅을 꽂는다.",
  "desc": "상대 공격·상황: 상대 커버(쉘) 가드. 바디 어퍼와 훅, 크로스로 가드를 고정시킨 뒤 상대 뒷손 글러브를 당겨 내려 리드 훅으로 마무리한다.",
  "src": [
   "evolve-mma_blog_5_boxing_traps_beginners_must_know_"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Paw",
    "note": "상대 가드·시야를 가볍게 터치",
    "react": "가드를 올리거나 뒤로 빠지며 반응"
   },
   {
    "t": "Cross",
    "note": "반응한 순간 강하게"
   }
  ],
  "purpose": "포잉 잽으로 시야를 가리고 반응을 끌어내 크로스를 맞힌다.",
  "desc": "상대 공격·상황: 상대 앞손 가드. 메이웨더처럼 포잉 잽으로 시야와 앞손을 묶은 뒤 상대가 반응하는 순간 크로스를 꽂는다.",
  "src": [
   "evolve-mma_blog_what_is_the_pawing_jab"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Paw",
    "note": "거리 측정·시야 차단",
    "react": "높게 블록"
   },
   {
    "t": "Cross"
   },
   {
    "t": "Lead Hook"
   }
  ],
  "purpose": "포잉 잽으로 가드를 높이게 만든 뒤 스트레이트-훅으로 공략한다.",
  "desc": "상대 공격·상황: 상대 앞손 가드. 포잉 잽에 상대가 가드를 높이면 크로스로 정면을, 리드 훅으로 측면을 연달아 공략한다.",
  "src": [
   "evolve-mma_blog_what_is_the_pawing_jab"
  ]
 },
 {
  "kind": "setup",
  "art": "boxing",
  "steps": [
   {
    "t": "Paw",
    "note": "상대 앞손을 가볍게 탭",
    "react": "팔을 뻗어 카운터하거나 가드를 올림"
   },
   {
    "t": "Rear Uppercut",
    "note": "열린 가드 사이로"
   }
  ],
  "purpose": "포잉 잽으로 반응을 유도해 어퍼컷 공간을 만든다.",
  "desc": "상대 공격·상황: 상대 앞손 가드. 포잉 잽에 상대가 손을 뻗거나 가드를 올리면 그 아래로 뒷손 어퍼컷을 올려친다.",
  "src": [
   "evolve-mma_blog_what_is_the_pawing_jab"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Guard Pull-Down",
    "note": "상대 전완을 걸어 아래로 당김",
    "react": "버티려고 팔을 굳힘"
   },
   {
    "t": "Cross",
    "note": "당기던 손을 놓으며 스트레이트로"
   }
  ],
  "purpose": "상대가 버티는 순간 팔이 굳는 것을 이용해 스트레이트를 꽂는다.",
  "desc": "상대 공격·상황: 상대 앞손 가드. 가드를 당겨 상대가 저항하며 팔이 굳으면, 당기던 손을 그대로 놓아 스트레이트로 바꿔 친다.",
  "src": [
   "martialtalk_threads_pull_your_opponents_guard_down_1"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Guard Pull-Down",
    "note": "전완을 잡은 손을 붙인 채 유지",
    "react": "가드가 열리고 앞으로 끌려옴"
   },
   {
    "t": "Horizontal Elbow",
    "note": "가드를 돌아 머리로"
   }
  ],
  "purpose": "가드를 끌어내리고 팔꿈치로 가드를 돌아 머리를 친다.",
  "desc": "상대 공격·상황: 상대 앞손 가드. 당긴 손을 떼지 않고 팔꿈치를 가드 바깥으로 돌려 호리즌털 엘보를 머리에 꽂는다.",
  "src": [
   "martialtalk_threads_pull_your_opponents_guard_down_1",
   "evolve-mma_blog_6_tips_for_setting_up_knockout_elbo"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Jab"
   },
   {
    "t": "Cross",
    "note": "일부러 빗나가게 던지고 손을 폄",
    "react": "가드가 계속 닫혀 있음"
   },
   {
    "t": "Guard Pull-Down",
    "note": "상대 전완을 잡아 자기 쪽으로 당김",
    "react": "가드가 열리며 앞으로 끌려옴"
   },
   {
    "t": "Horizontal Elbow"
   }
  ],
  "purpose": "펀치 콤비네이션으로 가드를 닫게 한 뒤 가드를 벗겨 팔꿈치를 꽂는다.",
  "desc": "상대 공격·상황: 상대 닫힌 하이 가드. 펀치 끝손을 일부러 빗맞히고 그 손으로 상대 전완을 당겨 가드를 벗긴 다음, 끌려오는 상대에게 팔꿈치를 맞힌다.",
  "src": [
   "evolve-mma_blog_6_tips_for_setting_up_knockout_elbo"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Parry",
    "note": "잽을 아래·중앙 대각선으로 쳐냄",
    "react": "몸이 돌아가 왼쪽 얼굴이 노출됨"
   },
   {
    "t": "Cross",
    "note": "패리한 손으로 바로"
   }
  ],
  "purpose": "잽을 쳐내 상대 몸을 돌려 놓고 같은 손으로 크로스를 꽂는다.",
  "desc": "상대 공격·상황: 상대 잽. 잽을 아래쪽 중앙으로 패리해 상대 얼굴 옆을 노출시키고, 패리한 손으로 즉시 크로스를 던진다.",
  "src": [
   "evolve-university_blog_5_basic_parry_and_counter_combinati",
   "evolve-mma_blog_heres_how_to_defend_the_jab_in_muay"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Parry",
    "note": "뒷손을 안쪽으로 휘둘러 패리",
    "react": "균형이 무너짐"
   },
   {
    "t": "Low Kick"
   },
   {
    "t": "Jab"
   },
   {
    "t": "Cross"
   }
  ],
  "purpose": "잽을 패리해 균형을 무너뜨리고 로우킥으로 반격한다.",
  "desc": "상대 공격·상황: 상대 잽. 뒷손 패리로 잽을 흘려 상대 균형을 깬 뒤 로우킥을 차고 잽-크로스로 이어간다.",
  "src": [
   "evolve-university_blog_5_basic_parry_and_counter_combinati"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Parry",
    "note": "앞손을 안쪽으로 휘둘러 크로스를 빗나가게",
    "react": "균형을 잃음"
   },
   {
    "t": "Low Kick"
   },
   {
    "t": "Lead Hook",
    "note": "상대 뒷손이 아직 가드로 돌아오지 않음"
   }
  ],
  "purpose": "크로스를 패리하고 로우킥과 리드 훅으로 빈틈을 공략한다.",
  "desc": "상대 공격·상황: 상대 크로스. 앞손으로 크로스를 흘린 뒤 로우킥을 차고, 상대 뒷손이 돌아오기 전에 리드 훅을 꽂는다.",
  "src": [
   "evolve-university_blog_5_basic_parry_and_counter_combinati"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Parry",
    "note": "펀치가 온 쪽으로 반 스텝, 살짝 슬립 가능"
   },
   {
    "t": "Straight Knee",
    "note": "뒷무릎을 정중앙으로, 안쪽 손은 상대 어깨에 프레임"
   }
  ],
  "purpose": "스트레이트 펀치를 패리하고 근거리 스트레이트 니로 반격한다.",
  "desc": "상대 공격·상황: 상대 잽 또는 크로스. 펀치를 패리하며 반 스텝 들어가 뒷무릎을 중앙으로 찔러 넣고, 이후 클린치나 밀어내기로 연결한다.",
  "src": [
   "evolve-mma_blog_3_muay_thai_counters_you_need_to_kn"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Check",
    "note": "정강이로 막음",
    "react": "차는 다리가 아직 땅에 닿지 않음"
   },
   {
    "t": "Teep",
    "note": "체크한 다리로 바로 중앙에"
   }
  ],
  "purpose": "체크한 다리로 즉시 티프를 차 상대 균형을 무너뜨린다.",
  "desc": "상대 공격·상황: 상대 로우킥. 로우킥을 체크한 다리를 내려놓지 않고 바로 티프로 뻗어, 한 발로 선 상대를 밀어낸다.",
  "src": [
   "evolve-mma_blog_3_muay_thai_counters_you_need_to_kn",
   "evolve-university_blog_heres_how_to_utilize_checks_in_muay"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Check",
    "note": "체크 후 발을 내려 디딤"
   },
   {
    "t": "Low Kick",
    "note": "반대 다리로 즉시"
   }
  ],
  "purpose": "체크 직후 반대 다리 로우킥으로 교환에서 이긴다.",
  "desc": "상대 공격·상황: 상대 로우킥. 킥을 체크한 발을 디디자마자 반대쪽 다리로 로우킥을 되돌려 찬다.",
  "src": [
   "evolve-university_blog_heres_how_to_utilize_checks_in_muay"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Check",
    "note": "다리로 막음"
   },
   {
    "t": "Round Kick",
    "note": "바디로 되돌려 차기"
   }
  ],
  "purpose": "미들킥을 막고 마지막 킥을 내가 차서 교환을 가져간다.",
  "desc": "상대 공격·상황: 상대 미들킥. 킥 테니스 드릴처럼 상대 바디킥을 다리로 막고 즉시 바디 라운드킥을 되돌려 찬다.",
  "src": [
   "evolve-mma_blog_3_counter_kicking_drills_to_practic"
  ]
 },
 {
  "kind": "setup",
  "art": "kickboxing",
  "steps": [
   {
    "t": "Block",
    "note": "막는 순간 바로 반격",
    "react": "한 발로 서 있음"
   },
   {
    "t": "Cross"
   },
   {
    "t": "Lead Hook"
   },
   {
    "t": "Cross"
   }
  ],
  "purpose": "킥을 막은 순간 한 발로 선 상대에게 펀치 연타를 넣는다.",
  "desc": "상대 공격·상황: 상대 왼발 킥(바디/헤드). 왼발 킥을 블록하자마자 크로스-리드 훅-크로스를 던진다. 바디·헤드 킥 모두 같은 반격을 쓴다.",
  "src": [
   "dynamicstriking_blogs_news_how_to_counter_kicks_with_pun"
  ]
 },
 {
  "kind": "setup",
  "art": "kickboxing",
  "steps": [
   {
    "t": "Block",
    "note": "막는 순간 바로 반격",
    "react": "한 발로 서 있음"
   },
   {
    "t": "Lead Hook"
   },
   {
    "t": "Cross"
   },
   {
    "t": "Lead Hook"
   }
  ],
  "purpose": "킥을 막은 순간 한 발로 선 상대에게 펀치 연타를 넣는다.",
  "desc": "상대 공격·상황: 상대 오른발 킥(바디/헤드). 오른발 킥을 블록하자마자 리드 훅-크로스-리드 훅을 던진다.",
  "src": [
   "dynamicstriking_blogs_news_how_to_counter_kicks_with_pun"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Catch@kickboxing",
    "note": "킥 방향으로 비켜서며 팔로 감아 옆구리에 고정",
    "react": "한 발로 버팀"
   },
   {
    "t": "Body Cross",
    "note": "명치 바로 아래로"
   },
   {
    "t": "Round Kick",
    "note": "다리를 진행 방향으로 밀어 놓은 뒤 높게 되돌려 차기"
   }
  ],
  "purpose": "잡은 킥을 이용해 바디 크로스를 넣고 놓아주며 킥으로 반격한다.",
  "desc": "상대 공격·상황: 상대 미들킥. 미들킥을 캐치해 바디 크로스를 넣고, 다리를 밀어 놓아준 직후 몸통·팔·머리로 라운드킥을 찬다.",
  "src": [
   "muaythaibrisbane_catch_kick_return_kick_muay_thai_breakdo"
  ]
 },
 {
  "kind": "setup",
  "art": "kickboxing",
  "steps": [
   {
    "t": "Catch",
    "note": "옆으로 비켜서 힘이 빠진 킥을 잡음",
    "react": "한 발로 섬"
   },
   {
    "t": "Cross"
   }
  ],
  "purpose": "힘이 빠진 킥을 잡고 한 발로 선 상대에게 크로스를 꽂는다.",
  "desc": "상대 공격·상황: 상대 바디킥. 옆으로 스텝해 킥의 위력을 죽인 뒤 다리를 잡고 오른손 크로스로 반격한다.",
  "src": [
   "fightersonly_article_ext_43079_issue_049_1"
  ]
 },
 {
  "kind": "setup",
  "art": "kickboxing",
  "steps": [
   {
    "t": "Catch",
    "note": "옆으로 비켜서 잡음",
    "react": "한 발로 섬"
   },
   {
    "t": "Low Kick",
    "note": "받치는 다리를 차서 쓸어냄(스윕)"
   }
  ],
  "purpose": "잡은 상태에서 받치는 다리를 차 상대를 넘어뜨린다.",
  "desc": "상대 공격·상황: 상대 바디킥. 바디킥을 캐치한 뒤 상대의 받치는 뒷다리를 로우킥으로 차 쓸어 넘긴다.",
  "src": [
   "fightersonly_article_ext_43079_issue_049_1"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Catch@kickboxing",
    "note": "겨드랑이에 단단히 끼우고 뒤로 당김",
    "react": "균형을 잃고 깡충거리다 앞으로 쏟아짐"
   },
   {
    "t": "Straight Knee",
    "note": "놓아주며 뒷무릎을 복부로"
   }
  ],
  "purpose": "잡은 다리를 당겼다 놓아 쏟아지는 상대에게 니킥을 꽂는다.",
  "desc": "상대 공격·상황: 상대 미들킥. 킥을 캐치해 뒤로 끌어당기다 놓아주면 상대가 앞으로 쏠리고, 그때 뒷무릎을 복부에 꽂는다.",
  "src": [
   "evolve-university_blog_4_muay_thai_catch_and_counter_techn"
  ]
 },
 {
  "kind": "setup",
  "art": "mixed-martial-arts",
  "steps": [
   {
    "t": "Block",
    "note": "앞손을 높이 들어 머리를 감쌈"
   },
   {
    "t": "Catch@kickboxing",
    "note": "뒷손으로 손바닥을 위로 해 킥을 떠받침",
    "react": "한 발로 섬"
   },
   {
    "t": "Basic Double Leg",
    "note": "끌어당기며 아래로 파고듦"
   }
  ],
  "purpose": "킥을 막고 잡아 한 발로 선 상대를 테이크다운한다.",
  "desc": "상대 공격·상황: 상대 하이킥(뒷발). 하이킥을 앞손으로 막고 뒷손으로 떠받쳐 잡은 뒤, 끌어당기며 더블 레그로 들어간다.",
  "src": [
   "dynamicstriking_blogs_news_catching_kicks_to_set_up_a_ta"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Teep Catch",
    "note": "왼손을 아래로 넣어 받치고 오른손으로 발등을 덮어 고정, 왼쪽으로 당김",
    "react": "균형을 잃음"
   },
   {
    "t": "Lead Hook"
   },
   {
    "t": "Cross"
   },
   {
    "t": "Low Kick",
    "note": "허벅지로"
   }
  ],
  "purpose": "티프를 잡아 균형을 무너뜨리고 펀치-로우킥으로 반격한다.",
  "desc": "상대 공격·상황: 상대 앞발 티프. 티프를 두 손으로 잡아 옆으로 끌어당긴 뒤 리드 훅-크로스-로우킥으로 마무리한다.",
  "src": [
   "evolve-university_blog_3_muay_thai_push_kick_counters_for_"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Teep Catch",
    "note": "반 스텝 물러나 두 손으로 발 위아래를 잡고 옆으로 던짐",
    "react": "균형을 회복하려 함"
   },
   {
    "t": "Round Kick",
    "note": "바디로"
   }
  ],
  "purpose": "잡은 티프를 옆으로 던져 균형을 깨고 바디킥을 찬다.",
  "desc": "상대 공격·상황: 상대 티프. 티프를 피하며 발을 잡아 옆으로 던진 뒤, 균형을 잡으려는 상대 몸통에 라운드킥을 찬다.",
  "src": [
   "evolve-mma_blog_3_muay_thai_counters_you_need_to_kn"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Kick Parry",
    "note": "앞팔을 원을 그리며 바깥으로 휘둘러 쳐냄",
    "react": "균형을 회복 중"
   },
   {
    "t": "Jab"
   },
   {
    "t": "Cross",
    "note": "풀파워"
   }
  ],
  "purpose": "티프를 흘려 균형이 무너진 사이 잽-크로스를 꽂는다.",
  "desc": "상대 공격·상황: 상대 티프. 티프를 바깥으로 패리하고 상대가 균형을 잡는 동안 빠른 잽과 강한 크로스를 넣는다.",
  "src": [
   "evolve-university_blog_5_basic_parry_and_counter_combinati"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Kick Parry",
    "note": "같은 쪽 팔(왼팔)로 티프를 밀어 통과시킴",
    "react": "균형을 회복 중"
   },
   {
    "t": "Round Kick",
    "note": "오른발 바디킥"
   }
  ],
  "purpose": "티프를 흘려보내고 회복 중인 상대에게 바디킥을 찬다.",
  "desc": "상대 공격·상황: 상대 오른발 티프. 티프 다리와 같은 쪽 전완으로 킥을 밀어 흘린 뒤 오른발 라운드킥을 몸통에 꽂는다.",
  "src": [
   "evolve-mma_blog_3_muay_thai_counters_you_need_to_kn"
  ]
 },
 {
  "kind": "setup",
  "art": "kickboxing",
  "steps": [
   {
    "t": "Kick Parry",
    "note": "앞손으로 킥을 오른쪽 아래로 쳐냄"
   },
   {
    "t": "Cross",
    "note": "턱으로"
   },
   {
    "t": "Lead Hook"
   },
   {
    "t": "Low Kick",
    "note": "앞다리 허벅지로"
   }
  ],
  "purpose": "티프를 쳐내고 펀치 두 개와 로우킥으로 반격한다.",
  "desc": "상대 공격·상황: 상대 티프(푸시킥). 앞손으로 푸시킥을 쳐내린 뒤 크로스-리드 훅-로우킥으로 이어간다.",
  "src": [
   "evolve-university_blog_3_muay_thai_push_kick_counters_for_"
  ]
 },
 {
  "kind": "setup",
  "art": "muay-thai",
  "steps": [
   {
    "t": "Kick Parry",
    "note": "앞손으로 바깥으로 밀어내며 반대 방향으로 사이드스텝"
   },
   {
    "t": "Low Kick",
    "note": "강하게"
   }
  ],
  "purpose": "티프를 흘려 각도를 잡고 로우킥으로 반격한다.",
  "desc": "상대 공격·상황: 상대 앞발 티프. 앞발 티프를 앞손으로 바깥으로 패리하며 옆으로 비켜선 뒤 강한 로우킥을 찬다.",
  "src": [
   "evolve-university_blog_5_basic_parry_and_counter_combinati"
  ]
 },
 {
  "kind": "setup",
  "art": "mixed-martial-arts",
  "steps": [
   {
    "t": "Block",
    "note": "크로스 블록 후 손바닥 쪽 팔로 다리를 떠서 몸 앞으로 끌어당김",
    "react": "한 발로 선 채 등을 보이며 돌아감"
   },
   {
    "t": "High Kick",
    "note": "돌아간 방향으로"
   }
  ],
  "purpose": "킥을 막고 다리를 끌어 돌려세운 뒤 헤드킥을 찬다.",
  "desc": "상대 공격·상황: 상대 바디/헤드 킥. 크로스 블록으로 킥을 막고 다리를 떠서 몸 앞으로 끌어당겨 상대를 돌린 뒤 헤드킥으로 반격한다(대안: 로우킥, 잽-크로스).",
  "src": [
   "dynamicstriking_blogs_news_scoop_the_kick_with_carlos_co"
  ]
 }
];
