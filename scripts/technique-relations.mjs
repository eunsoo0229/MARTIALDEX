// Reviewed technique-relation decisions, applied by build-technique-canonical.mjs.
//
// Two problems are fixed here, one record at a time (nothing is decided by
// string similarity alone):
//
//   OVER-MERGING  — the source documents list several techniques on one line
//                   ("Lead Teep / Rear Teep", "Rear Naked Choke, Guillotine,
//                   Arm Triangle, ..."), and the parser turned each such line
//                   into ONE technique record. SPLITS breaks those records
//                   into the real techniques. A part that already exists as a
//                   technique (in any art) is linked to it instead of being
//                   duplicated; a part that doesn't exist becomes a new record
//                   in the same art and category.
//
//   UNDER-LINKING — a technique really used in an art is filed only under
//                   another art. Where the art has its own record (another
//                   name, e.g. Judo "Hadaka Jime" = Rear Naked Choke), the
//                   records are merged in build-technique-canonical.mjs
//                   (EXTRA_GROUPS / EXTRA_MEMBERS). Where the art has no record
//                   at all, ART_LINKS adds the art to the existing technique.
//
// The split record itself is never deleted: its id keeps resolving (old
// training history, mastery, saved curricula), it just stops being listed as
// a technique and points at the techniques it was split into.

/**
 * parts: [name, target, extra?]
 *   target = an existing official technique id → link (that technique gains this art)
 *   target = null → new technique in this record's art + category
 * extra: { ko, desc, id (explicit new id), videos: true (copy this record's curated videos to the new part), moveVideos: true (add them to the linked technique) }
 */
export const SPLITS = [
  // ---- BJJ ----
  { id: 'bjj__backstep-inversion-entry', reason: '백스텝 진입과 인버전 진입은 서로 다른 데 라 히바 진입 동작', parts: [['Backstep Entry', null], ['Inversion Entry', null]] },

  // ---- Boxing ----
  { id: 'boxing__전형적-자세-풋워크-switch-step', reason: '"전형적 자세/풋워크:" 목록 제목에 붙은 Switch Step — 이미 있는 스위치 스텝', parts: [['Switch Step', 'kickboxing__switch-step']] },

  // ---- Judo ----
  { id: 'judo__overhook-underhook', reason: '오버훅과 언더훅은 서로 다른 그립', parts: [['Overhook', 'bjj__overhook'], ['Underhook', 'bjj__underhook']] },
  { id: 'judo__앞-mae-뒤', reason: '앞/뒤는 서로 다른 쿠즈시 방향', parts: [['앞 (Mae)', null, { id: 'judo__kuzushi-mae' }], ['뒤 (Ushiro)', null, { id: 'judo__kuzushi-ushiro' }]] },
  { id: 'judo__오른쪽-migi-왼쪽', reason: '오른쪽/왼쪽은 서로 다른 쿠즈시 방향', parts: [['오른쪽 (Migi)', null, { id: 'judo__kuzushi-migi' }], ['왼쪽 (Hidari)', null, { id: 'judo__kuzushi-hidari' }]] },
  { id: 'judo__오른앞-migi-mae-왼앞', reason: '오른앞/왼앞은 서로 다른 쿠즈시 방향', parts: [['오른앞 (Migi-Mae)', null, { id: 'judo__kuzushi-migi-mae' }], ['왼앞 (Hidari-Mae)', null, { id: 'judo__kuzushi-hidari-mae' }]] },
  { id: 'judo__오른뒤-migi-ushiro-왼뒤', reason: '오른뒤/왼뒤는 서로 다른 쿠즈시 방향', parts: [['오른뒤 (Migi-Ushiro)', null, { id: 'judo__kuzushi-migi-ushiro' }], ['왼뒤 (Hidari-Ushiro)', null, { id: 'judo__kuzushi-hidari-ushiro' }]] },

  // ---- Karate ----
  { id: 'karate__bunkai-분석-해석-kuzushi-무너뜨림-hiki-te-당기는-손-tai-sabaki-osae', reason: '응용 개념 5개를 한 줄로 수록', parts: [['Bunkai', null, { ko: '분석/해석' }], ['Kuzushi', null, { ko: '무너뜨림', id: 'karate__kuzushi' }], ['Hiki-te', null, { ko: '당기는 손' }], ['Tai Sabaki', 'judo__tai-sabaki'], ['Osae', null]] },
  { id: 'karate__counter-punch-counter-kick', reason: '손 카운터와 발 카운터는 다른 기술', parts: [['Counter Punch', null], ['Counter Kick', null]] },
  { id: 'karate__empi-hiji-yoko-empi-age-empi-ushiro-empi-mawashi-empi-otoshi-empi', reason: '방향이 다른 팔꿈치 치기 6개를 한 줄로 수록', parts: [['Empi (Hiji)', 'taekwondo__팔굽치기'], ['Yoko Empi', null], ['Age Empi', null], ['Ushiro Empi', null], ['Mawashi Empi', null], ['Otoshi Empi', null]] },
  { id: 'karate__feint-페인트-angle-step', reason: '페인트와 앵글 스텝은 다른 기술', parts: [['Feint', null, { ko: '페인트', id: 'karate__feint' }], ['Angle Step', 'kickboxing__angle-step']] },
  { id: 'karate__fudo-dachi-부동립-kumite-자유-자세', reason: '부동립과 쿠미테 자유 자세는 다른 자세 (설명이 어느 쪽인지 불분명해 옮기지 않음)', parts: [['Fudo-dachi', null, { ko: '부동립' }], ['Kumite-dachi', null, { ko: '쿠미테 자유 자세' }]] },
  { id: 'karate__kizami-zuki-counter-gyaku-zuki-counter', reason: '서로 다른 손기술 카운터 2개', parts: [['Kizami-zuki Counter', null, { desc: '상대 손기술에 대한 반격.' }], ['Gyaku-zuki Counter', null, { desc: '상대 손기술에 대한 반격.' }]] },
  { id: 'karate__kizami-zuki-gyaku-zuki-oi-zuki', reason: '이미 있는 지르기 3개의 목록', parts: [['Kizami-zuki', 'karate__kizami-zuki'], ['Gyaku-zuki', 'karate__gyaku-zuki'], ['Oi-zuki', 'karate__oi-zuki']] },
  { id: 'karate__knee-규칙-허용-시-clinch-근접-컨트롤-규칙-허용-시', reason: '무릎 타격(=니킥)과 근접 컨트롤은 다른 기술', parts: [['Knee', 'kickboxing__straight-knee'], ['Clinch (근접 컨트롤)', null, { id: 'karate__clinch', desc: '접촉이 허용되는 룰(예: Kyokushin의 니킥, 일부 실전 룰)에서만 사용.' }]] },
  { id: 'karate__long-guard-distance-control', reason: '롱 가드(자세)와 거리 조절(전술)은 다른 항목', parts: [['Long Guard', 'boxing__long-guard'], ['Distance Control', null]] },
  { id: 'karate__mae-geri-counter-mawashi-geri-counter', reason: '서로 다른 발차기 카운터 2개', parts: [['Mae Geri Counter', null, { desc: '상대 발차기에 대한 반격, 주로 상대가 발을 뻗는 순간의 축다리를 노리거나 들어오는 다리를 짧게 끊는다.' }], ['Mawashi Geri Counter', null, { desc: '상대 발차기에 대한 반격, 주로 상대가 발을 뻗는 순간의 축다리를 노리거나 들어오는 다리를 짧게 끊는다.' }]] },
  { id: 'karate__mae-geri-yoko-geri-ushiro-geri-mawashi-geri', reason: '이미 있는 발차기 4개의 목록', parts: [['Mae Geri', 'karate__mae-geri'], ['Yoko Geri', 'karate__yoko-geri'], ['Ushiro Geri', 'karate__ushiro-geri'], ['Mawashi Geri', 'karate__mawashi-geri']] },
  { id: 'karate__mawashi-geri-mae-geri-yoko-geri', reason: '이미 있는 발차기 3개의 목록', parts: [['Mawashi Geri', 'karate__mawashi-geri'], ['Mae Geri', 'karate__mae-geri'], ['Yoko Geri', 'karate__yoko-geri']] },
  { id: 'karate__musubi-dachi-heiko-dachi', reason: '무스비다치(발뒤꿈치 모음)와 헤이코다치(평행)는 다른 자세 — 두 영상 모두 무스비다치', parts: [['Musubi-dachi', null, { videos: true }], ['Heiko-dachi', 'taekwondo__나란히서기']] },
  { id: 'karate__nidan-geri-tobi-geri', reason: '이단차기와 뛰어차기는 다른 발차기', parts: [['Nidan Geri', null, { ko: '이단차기' }], ['Tobi Geri', null, { ko: '뛰어차기' }]] },
  { id: 'karate__nukite-ippon-ken-nihon-nukite', reason: '손끝 찌르기·외주먹·두 손가락 찌르기는 다른 기술', parts: [['Nukite', null], ['Ippon-ken', null], ['Nihon-nukite', null]] },
  { id: 'karate__o-soto-gari-de-ashi-barai-등', reason: '가라테 호신술에서 유도 용어 그대로 쓰는 유도 기술들', parts: [['O Soto Gari', 'judo__osoto-gari'], ['De Ashi Barai', 'judo__de-ashi-barai']] },
  { id: 'karate__short-punch-kagi-zuki-uraken-empi-규칙-허용-시-teisho', reason: '근거리 타격 5개의 목록', parts: [['Short Punch', null], ['Kagi-zuki', 'karate__kagi-zuki'], ['Uraken', 'karate__uraken-uchi'], ['Empi', 'taekwondo__팔굽치기'], ['Teisho', 'karate__teisho']] },
  { id: 'karate__soto-uke-uchi-uke', reason: '바깥막기와 안막기는 방향이 반대인 다른 막기', parts: [['Soto Uke', null, { ko: '바깥막기' }], ['Uchi Uke', null, { ko: '안막기' }]] },
  { id: 'karate__step-back-side-step-angle-exit-body-shift', reason: '회피 이동 4개의 목록', parts: [['Step Back', 'boxing__step-back'], ['Side Step', 'boxing__side-step'], ['Angle Exit', null], ['Body Shift', null]] },
  { id: 'karate__step-in-step-out-side-step-retreat-forward-step', reason: '기본 이동 5개의 목록', parts: [['Step In', null], ['Step Out', 'boxing__step-out'], ['Side Step', 'boxing__side-step'], ['Retreat', null], ['Forward Step', null]] },
  { id: 'karate__tai-sabaki-tenkan-pivot', reason: '타이사바키·텐칸·피벗은 다른 이동 — 두 영상은 타이사바키', parts: [['Tai Sabaki', 'judo__tai-sabaki', { moveVideos: true }], ['Tenkan', null], ['Pivot', 'kickboxing__pivot']] },
  { id: 'karate__tate-zuki-age-zuki', reason: '세로 주먹과 올려 찌르기는 다른 지르기', parts: [['Tate-zuki', null, { ko: '세로 주먹' }], ['Age-zuki', null, { ko: '올려 찌르기' }]] },
  { id: 'karate__ushiro-mawashi-geri-ura-mawashi-geri', reason: '뒤돌려차기(회전)와 훅킥(회전 없음)은 다른 발차기', parts: [['Ushiro Mawashi Geri', 'taekwondo__뒤후려차기'], ['Ura Mawashi Geri', 'taekwondo__후려차기']] },

  // ---- Muay Thai ----
  { id: 'muay-thai__axe-kick-side-kick', reason: '액스킥과 사이드킥은 다른 킥', parts: [['Axe Kick', 'kickboxing__axe-kick'], ['Side Kick', 'kickboxing__side-kick']] },
  { id: 'muay-thai__biceps-control-wrist-control', reason: '이두 제어와 손목 제어는 다른 클린치 그립', parts: [['Biceps Control', 'wrestling__biceps-control'], ['Wrist Control', 'boxing__wrist-control']] },
  { id: 'muay-thai__body-teep-hip-teep', reason: '타깃(몸통/골반)이 다른 티프 — 영상은 일반 티프 강좌라 어느 쪽인지 정하지 않음', parts: [['Body Teep', null], ['Hip Teep', null]] },
  { id: 'muay-thai__calf-kick-thigh-kick', reason: '타깃(종아리/허벅지)이 다른 로우킥', parts: [['Calf Kick', 'mixed-martial-arts__calf-kick'], ['Thigh Kick', null]] },
  { id: 'muay-thai__catch-teep-stop', reason: '킥 캐치와 티프 스톱은 다른 방어', parts: [['Catch', 'kickboxing__catch'], ['Teep Stop', null]] },
  { id: 'muay-thai__check-and-return-catch-and-return', reason: '체크 후 반격과 캐치 후 반격은 다른 카운터', parts: [['Check and Return', 'kickboxing__check-and-return'], ['Catch and Return', 'muay-thai__catch-and-return']] },
  { id: 'muay-thai__check-low-kick-check-body-kick-check', reason: '로우킥 체크(=체크)와 바디킥 체크는 다른 방어', parts: [['Check', 'kickboxing__check'], ['Low Kick Check', 'kickboxing__check'], ['Body Kick Check', null]] },
  { id: 'muay-thai__check-shin-block', reason: '체크와 정강이 블록 — 둘 다 이미 있는 기술', parts: [['Check', 'kickboxing__check'], ['Shin Block', 'kickboxing__shin-block']] },
  { id: 'muay-thai__counter-elbow-counter-knee', reason: '엘보 카운터와 니 카운터는 다른 카운터', parts: [['Counter Elbow', null], ['Counter Knee', null]] },
  { id: 'muay-thai__diagonal-elbow-downward-elbow-upward-elbow-spinning-elbow', reason: '궤적이 다른 엘보 4개', parts: [['Diagonal Elbow', 'kickboxing__diagonal-elbow'], ['Downward Elbow', 'kickboxing__downward-elbow'], ['Upward Elbow', 'kickboxing__upward-elbow'], ['Spinning Elbow', 'muay-thai__spinning-elbow']] },
  { id: 'muay-thai__evade-lean-back', reason: '회피와 린백은 다른 방어', parts: [['Evade', null], ['Lean Back', 'kickboxing__lean-back']] },
  { id: 'muay-thai__guard-long-guard-high-guard', reason: '기본 가드·롱 가드·하이 가드는 다른 자세', parts: [['Guard', null, { id: 'muay-thai__guard' }], ['Long Guard', 'boxing__long-guard'], ['High Guard', 'kickboxing__high-guard']] },
  { id: 'muay-thai__high-guard-long-guard', reason: '하이 가드와 롱 가드는 다른 자세', parts: [['High Guard', 'kickboxing__high-guard'], ['Long Guard', 'boxing__long-guard']] },
  { id: 'muay-thai__inside-control-outside-control', reason: '안쪽 제어와 바깥쪽 제어는 다른 클린치 포지션', parts: [['Inside Control', 'kickboxing__inside-control'], ['Outside Control', null]] },
  { id: 'muay-thai__inside-low-kick-outside-low-kick', reason: '안쪽/바깥쪽 다리를 차는 다른 로우킥', parts: [['Inside Low Kick', null], ['Outside Low Kick', null]] },
  { id: 'muay-thai__jab-counter-cross-counter-hook-counter', reason: '서로 다른 펀치 카운터 3개', parts: [['Jab Counter', 'kickboxing__jab-counter'], ['Cross Counter', 'kickboxing__cross-counter'], ['Hook Counter', 'kickboxing__hook-counter']] },
  { id: 'muay-thai__jab-cross', reason: '잽과 크로스는 다른 펀치 (영상은 잽-크로스 연결이라 그대로 둠)', parts: [['Jab', 'kickboxing__jab'], ['Cross', 'kickboxing__cross']] },
  { id: 'muay-thai__jab-cross-jab-hook-cross-hook', reason: '서로 다른 2연타 3개', parts: [['Jab → Cross', null, { id: 'muay-thai__jab-to-cross' }], ['Jab → Hook', null, { id: 'muay-thai__jab-to-hook' }], ['Cross → Hook', null, { id: 'muay-thai__cross-to-hook' }]] },
  { id: 'muay-thai__jab-low-kick-cross-low-kick', reason: '서로 다른 펀치-로우킥 연결 2개', parts: [['Jab → Low Kick', null, { id: 'muay-thai__jab-to-low-kick' }], ['Cross → Low Kick', null, { id: 'muay-thai__cross-to-low-kick' }]] },
  { id: 'muay-thai__kick-catch-teep-catch', reason: '킥 캐치와 티프 캐치는 다른 방어', parts: [['Kick Catch', 'kickboxing__catch'], ['Teep Catch', null]] },
  { id: 'muay-thai__kick-catch-to-sweep-kick-catch-to-counter', reason: '캐치 후 스윕과 캐치 후 타격은 다른 카운터', parts: [['Kick Catch to Sweep', 'muay-thai__catch-and-sweep'], ['Kick Catch to Counter', null]] },
  { id: 'muay-thai__lead-hook-rear-hook', reason: '리드 훅과 리어 훅은 다른 펀치', parts: [['Lead Hook', 'kickboxing__lead-hook'], ['Rear Hook', 'kickboxing__rear-hook']] },
  { id: 'muay-thai__lead-knee-rear-knee-side-knee', reason: '리드·리어·사이드 니는 다른 니', parts: [['Lead Knee', 'kickboxing__lead-knee'], ['Rear Knee', 'kickboxing__rear-knee'], ['Side Knee', null]] },
  { id: 'muay-thai__lead-low-kick-rear-low-kick', reason: '리드 로우킥과 리어 로우킥은 다른 킥', parts: [['Lead Low Kick', null], ['Rear Low Kick', null]] },
  { id: 'muay-thai__lead-round-kick-rear-round-kick', reason: '리드 라운드킥과 리어 라운드킥은 다른 킥 — 영상은 어느 쪽인지 특정하지 않는 일반 강좌라 그대로 둠', parts: [['Lead Round Kick', null], ['Rear Round Kick', null]] },
  { id: 'muay-thai__lead-teep-rear-teep', reason: '리드 티프와 리어 티프는 다른 킥 — 영상 2개 모두 리드·리어 티프를 함께 다룸', parts: [['Lead Teep', null, { videos: true }], ['Rear Teep', null, { videos: true }]] },
  { id: 'muay-thai__lead-uppercut-rear-uppercut', reason: '리드 어퍼컷과 리어 어퍼컷은 다른 펀치', parts: [['Lead Uppercut', 'kickboxing__lead-uppercut'], ['Rear Uppercut', 'kickboxing__rear-uppercut']] },
  { id: 'muay-thai__long-elbow-short-elbow', reason: '거리에 따라 궤적이 다른 엘보 2개', parts: [['Long Elbow', null, { desc: '거리에 따른 궤적 차이' }], ['Short Elbow', null, { desc: '거리에 따른 궤적 차이' }]] },
  { id: 'muay-thai__low-kick-after-punch-low-kick-after-teep', reason: '서로 다른 연결 2개', parts: [['Low Kick after Punch', null], ['Low Kick after Teep', null]] },
  { id: 'muay-thai__low-kick-body-kick-high-kick', reason: '타깃이 다른 킥 3개 — 영상 2개는 로우킥', parts: [['Low Kick', 'kickboxing__low-kick', { moveVideos: true }], ['Body Kick', 'kickboxing__body-kick'], ['High Kick', 'kickboxing__high-kick']] },
  { id: 'muay-thai__low-kick-counter-teep-counter', reason: '로우킥 카운터와 티프 카운터는 다른 카운터', parts: [['Low Kick Counter', null], ['Teep Counter', 'muay-thai__teep-counter']] },
  { id: 'muay-thai__orthodox-southpaw', reason: '오소독스와 사우스포는 다른 스탠스', parts: [['Orthodox', 'kickboxing__orthodox'], ['Southpaw', 'kickboxing__southpaw']] },
  { id: 'muay-thai__outside-trip-inside-trip', reason: '바깥/안쪽 다리를 거는 다른 트립', parts: [['Outside Trip', 'wrestling__outside-trip'], ['Inside Trip', 'wrestling__inside-trip']] },
  { id: 'muay-thai__overhook-underhook', reason: '오버훅과 언더훅은 다른 그립', parts: [['Overhook', 'bjj__overhook'], ['Underhook', 'bjj__underhook']] },
  { id: 'muay-thai__parry-catch-slip-pull-back-step-back-roll-cover', reason: '펀치 방어 7개의 목록', parts: [['Parry', 'kickboxing__parry'], ['Catch', 'boxing__catch'], ['Slip', 'kickboxing__slip'], ['Pull Back', 'kickboxing__pull'], ['Step Back', 'boxing__step-back'], ['Roll', 'kickboxing__roll'], ['Cover', 'kickboxing__cover']] },
  { id: 'muay-thai__shin-block-long-guard-parry-elbow-shield', reason: '킥 방어 4개의 목록 (여기서 패리는 킥을 쳐내는 방어)', parts: [['Shin Block', 'kickboxing__shin-block'], ['Long Guard', 'boxing__long-guard'], ['Kick Parry', null, { ko: '킥 패리' }], ['Elbow Shield', null]] },
  { id: 'muay-thai__single-collar-tie-double-collar-tie', reason: '싱글/더블 칼라 타이는 다른 클린치 그립', parts: [['Single Collar Tie', 'wrestling__collar-tie'], ['Double Collar Tie', 'kickboxing__double-collar-tie']] },
  { id: 'muay-thai__step-back-angle-out', reason: '스텝 백과 앵글 아웃은 다른 회피', parts: [['Step Back', 'boxing__step-back'], ['Angle Out', 'kickboxing__angle-out']] },
  { id: 'muay-thai__straight-knee-khao-trong-curving-knee-khao-chiang-diagonal-knee', reason: '궤적이 다른 니 3개', parts: [['Straight Knee (Khao Trong)', 'kickboxing__straight-knee'], ['Curving Knee (Khao Chiang)', null, { id: 'muay-thai__curving-knee' }], ['Diagonal Knee', null]] },
  { id: 'muay-thai__turn-off-balance', reason: '회전시키기와 균형 무너뜨리기는 다른 클린치 기술', parts: [['Turn', null, { desc: '목이나 팔 컨트롤을 이용해 상대의 몸통을 회전시켜 정면을 빼앗고 니를 열어준다.' }], ['Off-Balance', 'kickboxing__off-balance']] },

  // ---- Sambo ----
  { id: 'sambo__bridge-мост-hip-escape-sit-out-stand-up-granby-turn-in-frame-escape-back-escape', reason: '탈출 기술 8개의 목록', parts: [['Bridge', 'judo__bridge'], ['Hip Escape', 'bjj__hip-escape'], ['Sit-Out', 'wrestling__sit-out'], ['Stand-Up', 'wrestling__stand-up'], ['Granby', 'wrestling__granby-roll'], ['Turn-In', 'judo__turn-in'], ['Frame Escape', null], ['Back Escape', null]] },
  { id: 'sambo__drop-seoi류-arm-drag-to-throw-shoulder-entry-flying-entry', reason: '서로 다른 던지기 진입 4개', parts: [['Drop Seoi', null], ['Arm Drag to Throw', null], ['Shoulder Entry', null], ['Flying Entry', null]] },
  { id: 'sambo__elbow-control-leg-grip', reason: '팔꿈치 제어와 다리 그립은 다른 그립', parts: [['Elbow Control', 'wrestling__elbow-control'], ['Leg Grip', null]] },
  { id: 'sambo__guard-recovery-technical-stand-up', reason: '가드 회복과 테크니컬 스탠드업은 다른 기술', parts: [['Guard Recovery', 'judo__guard-recovery'], ['Technical Stand-Up', 'bjj__technical-stand-up']] },
  { id: 'sambo__guard-sweep-reversal-sit-up-sweep', reason: '스윕·리버설·싯업 스윕은 다른 기술', parts: [['Guard Sweep', null], ['Reversal', null], ['Sit-Up Sweep', 'bjj__sit-up-sweep']] },
  { id: 'sambo__guard-클로즈드-오픈-half-guard-turtle-defensive-shell', reason: '하위 포지션 4개의 목록', parts: [['Guard (클로즈드/오픈)', null, { id: 'sambo__guard' }], ['Half Guard', 'bjj__half-guard'], ['Turtle', 'bjj__turtle'], ['Defensive Shell', null]] },
  { id: 'sambo__high-crotch-ankle-pick', reason: '하이 크로치와 앵클 픽은 다른 테이크다운 (붙어 있던 설명은 어느 쪽인지 불분명해 옮기지 않음)', parts: [['High Crotch', 'bjj__high-crotch'], ['Ankle Pick', 'wrestling__ankle-pick']] },
  { id: 'sambo__hip-bump-sweep-butterfly-sweep-technical-stand-up-sweep', reason: '스윕 3개의 목록', parts: [['Hip Bump Sweep', 'bjj__hip-bump-sweep'], ['Butterfly Sweep', 'bjj__butterfly-sweep'], ['Technical Stand-Up Sweep', 'bjj__technical-stand-up-sweep']] },
  { id: 'sambo__jab-cross-hook-uppercut', reason: '컴뱃 삼보 펀치 4개의 목록', parts: [['Jab', 'kickboxing__jab'], ['Cross', 'kickboxing__cross'], ['Hook', 'boxing__hook'], ['Uppercut', 'boxing__uppercut']] },
  { id: 'sambo__knee-elbow', reason: '무릎 타격과 팔꿈치 타격은 다른 기술', parts: [['Knee', 'kickboxing__straight-knee'], ['Elbow', 'taekwondo__팔굽치기']] },
  { id: 'sambo__knee-tap-body-lock-arm-drag-duck-under-snap-down', reason: '레슬링 계열 진입 5개의 목록', parts: [['Knee Tap', 'bjj__knee-tap'], ['Body Lock', 'wrestling__body-lock'], ['Arm Drag', 'bjj__arm-drag'], ['Duck Under', 'bjj__duck-under'], ['Snap Down', 'wrestling__snap-down']] },
  { id: 'sambo__level-change-footwork-pivot-break-step', reason: '기본 움직임 4개의 목록', parts: [['Level Change', 'wrestling__level-change'], ['Footwork', null], ['Pivot', 'wrestling__pivot'], ['Break Step', null]] },
  { id: 'sambo__low-kick-body-kick-헤드킥', reason: '타깃이 다른 킥 3개', parts: [['Low Kick', 'kickboxing__low-kick'], ['Body Kick', 'kickboxing__body-kick'], ['헤드킥', 'kickboxing__high-kick']] },
  { id: 'sambo__rear-naked-choke-guillotine-front-headlock-choke-arm-triangle-collar-choke-계열', reason: '서로 다른 조르기 5개를 하나로 수록', parts: [['Rear Naked Choke', 'bjj__rear-naked-choke'], ['Guillotine', 'bjj__guillotine'], ['Front Headlock Choke', null], ['Arm Triangle', 'bjj__arm-triangle'], ['Collar Choke', null, { id: 'sambo__collar-choke' }]] },
  { id: 'sambo__single-leg-double-leg', reason: '싱글 레그와 더블 레그는 다른 테이크다운 — 영상 2개는 더블 레그', parts: [['Single Leg', null, { id: 'sambo__single-leg' }], ['Double Leg', 'wrestling__basic-double-leg', { moveVideos: true }]] },
  { id: 'sambo__single-leg-from-guard-wrestle-up', reason: '가드에서 싱글 레그와 레슬 업은 다른 기술', parts: [['Single Leg from Guard', null], ['Wrestle-Up', 'bjj__wrestle-up']] },
  { id: 'sambo__two-on-one-underhook-overhook-russian-tie', reason: '그립 4개의 목록', parts: [['Two-on-One', 'judo__two-on-one'], ['Underhook', 'bjj__underhook'], ['Overhook', 'bjj__overhook'], ['Russian Tie', 'wrestling__russian-tie']] },
  { id: 'sambo__yoko-otoshi-sumi-gaeshi-yoko-guruma류-옆으로-눕는-희생기술-ura-nage류', reason: '삼보에서도 쓰는 유도 희생 던지기 4개', parts: [['Yoko Otoshi', 'judo__yoko-otoshi'], ['Sumi Gaeshi', 'judo__sumi-gaeshi'], ['Yoko Guruma', 'judo__yoko-guruma'], ['Ura Nage', 'judo__ura-nage']] },
  { id: 'sambo__허리기술-counter-다리걸기-counter', reason: '허리기술 카운터와 다리걸기 카운터는 다른 카운터', parts: [['허리기술 Counter', null], ['다리걸기 Counter', null]] },

  // ---- Taekwondo ----
  { id: 'taekwondo__공중회전-발차기-다단-멀티-점프-발차기', reason: '공중회전 발차기와 다단 점프 발차기는 다른 기술', parts: [['공중회전 발차기', null, { desc: '시범단·격파 시범에서 사용하는 고난도 기술로, 실제 스포츠 겨루기보다는 격파·퍼포먼스 목적이 크다.' }], ['다단(멀티) 점프 발차기', null, { id: 'taekwondo__다단-점프-발차기', desc: '시범단·격파 시범에서 사용하는 고난도 기술로, 실제 스포츠 겨루기보다는 격파·퍼포먼스 목적이 크다.' }]] },
  { id: 'taekwondo__끌기-드래그-스텝-밀기', reason: '끌기와 밀기는 다른 이동', parts: [['끌기 (드래그 스텝)', null, { id: 'taekwondo__끌기', desc: '짧게 미끄러지듯 이동해 거리를 들키지 않고 좁히거나 벌리는 정밀 이동.' }], ['밀기', null, { desc: '짧게 미끄러지듯 이동해 거리를 들키지 않고 좁히거나 벌리는 정밀 이동.' }]] },
  { id: 'taekwondo__돌려차기-내려차기-나래차기-반대지르기', reason: '득점 기술 4개의 목록', parts: [['돌려차기', 'taekwondo__돌려차기'], ['내려차기', 'taekwondo__내려차기'], ['나래차기', 'taekwondo__나래차기'], ['반대지르기', null]] },
  { id: 'taekwondo__두손목막기-엇걸어막기-가위막기-산틀막기', reason: '서로 다른 막기 4개', parts: [['두손목막기', null], ['엇걸어막기', null], ['가위막기', null], ['산틀막기', null]] },
  { id: 'taekwondo__뛰어앞차기-뛰어돌려차기-뛰어옆차기-뛰어뒤차기-뛰어내려차기', reason: '서로 다른 뛰어차기 5개', parts: ['뛰어앞차기', '뛰어돌려차기', '뛰어옆차기', '뛰어뒤차기', '뛰어내려차기'].map((n) => [n, null, { desc: '각 기본 발차기의 점프 버전으로, 도약을 이용해 사거리를 늘리거나 높은 표적(얼굴)에 닿기 위해 사용.' }]) },
  { id: 'taekwondo__밀어차기-앞발-돌려차기-앞차기-옆차기', reason: '견제 발차기 4개의 목록', parts: [['밀어차기', 'taekwondo__밀어차기'], ['앞발 돌려차기', 'taekwondo__앞발-돌려차기'], ['앞차기', 'taekwondo__앞차기'], ['옆차기', 'taekwondo__옆차기']] },
  { id: 'taekwondo__바로지르기-반대지르기', reason: '바로지르기와 반대지르기는 다른 지르기', parts: [['바로지르기', null], ['반대지르기', null]] },
  { id: 'taekwondo__손날막기-한손날막기', reason: '손날막기(양손)와 한손날막기는 다른 막기', parts: [['손날막기', 'karate__shuto-uke'], ['한손날막기', null]] },
  { id: 'taekwondo__앞낙법-뒤낙법-옆낙법', reason: '방향이 다른 낙법 3개', parts: [['앞낙법', null], ['뒤낙법', null], ['옆낙법', null]] },
  { id: 'taekwondo__앞발-밀어차기-뒷발-밀어차기', reason: '앞발/뒷발 밀어차기는 다른 발차기', parts: [['앞발 밀어차기', null, { desc: '직접 득점보다 거리 유지와 카운터 유도가 주목적.' }], ['뒷발 밀어차기', null, { desc: '직접 득점보다 거리 유지와 카운터 유도가 주목적.' }]] },
  { id: 'taekwondo__전진-후진', reason: '전진과 후진은 다른 이동', parts: [['전진', null, { desc: '전진은 압박·선제공격에 쓴다.' }], ['후진', null, { desc: '후진은 상대의 공격을 무효화하고 카운터 거리를 만든다.' }]] },
  { id: 'taekwondo__지르기-바로지르기-반대지르기-돌려지르기-옆지르기-내려지르기', reason: '서로 다른 지르기 6개', parts: [['지르기', null], ['바로지르기', null], ['반대지르기', null], ['돌려지르기', null], ['옆지르기', null], ['내려지르기', null]] },
  { id: 'taekwondo__회전-내려차기-회전-옆차기', reason: '회전 내려차기와 회전 옆차기는 다른 발차기', parts: [['회전 내려차기', null], ['회전 옆차기', null]] },
];

/** Records that are not techniques (headings the parser picked up). Kept resolvable, not listed. */
export const NOT_TECHNIQUES = [
  { id: 'boxing__전형적-자세-풋워크', reason: '"전형적 자세/풋워크" — 스타일 설명의 소제목' },
  { id: 'karate__대표-기술', reason: '"대표 기술" — 목록 제목' },
  { id: 'taekwondo__대표-기술', reason: '"대표 기술" — 목록 제목' },
];

/**
 * A technique used in an art that has no record of it at all. Each is a
 * standard technique of that art's competition rules (not "a similar move
 * exists there").
 */
// 2026-10 final review: every link below cites MARTIALDEX's own data.
//   grade A = the art's own record names this technique (description / relatedTechniques / source heading)
//   grade B = several of the art's records describe it without the exact name (e.g. "목을 컨트롤" = collar tie),
//             or users filed it under that art in the shared library (add_teq)
// Links with no such evidence were removed and moved to REVIEW (ART_LINKS_REMOVED).
const MMA = (id, category, grade, evidence) => ({ id, martialArt: 'mixed-martial-arts', category, grade, evidence, reason: `MMA ${grade}: ${evidence}` });
export const ART_LINKS = [
  MMA('kickboxing__jab', 'MMA 복싱', 'A', 'MMA "MMA Boxing Combination" 설명 "잽-크로스-훅 등 복싱 콤비네이션"'),
  MMA('kickboxing__cross', 'MMA 복싱', 'A', 'MMA "MMA Boxing Combination" 설명 "잽-크로스-훅 등 복싱 콤비네이션"'),
  MMA('kickboxing__lead-hook', 'MMA 복싱', 'B', 'MMA "MMA Boxing Combination"("잽-크로스-훅")·"Dirty Boxing"("짧은 훅") — 훅(리드/리어 미구분)'),
  MMA('kickboxing__rear-hook', 'MMA 복싱', 'B', 'MMA "MMA Boxing Combination"("잽-크로스-훅")·"Dirty Boxing"("짧은 훅") — 훅(리드/리어 미구분)'),
  MMA('kickboxing__lead-uppercut', 'MMA 복싱', 'B', 'MMA "Dirty Boxing" 설명 "짧은 훅과 어퍼컷" — 어퍼컷(리드/리어 미구분)'),
  MMA('kickboxing__rear-uppercut', 'MMA 복싱', 'B', 'MMA "Dirty Boxing" 설명 "짧은 훅과 어퍼컷" — 어퍼컷(리드/리어 미구분)'),
  MMA('kickboxing__low-kick', 'MMA 킥복싱', 'A', 'MMA "Calf Kick" 설명 "…종아리 아래쪽을 노리는 로우킥", "Range Management" 원칙 "로우킥에 대비"'),
  MMA('wrestling__collar-tie', '클린치 (Clinch)', 'B', 'MMA "Dirty Boxing" 설명 "클린치 상태에서 상대의 팔/목을 컨트롤" — 목 컨트롤 그립'),
  MMA('kickboxing__double-collar-tie', '클린치 (Clinch)', 'B', 'MMA "Dirty Boxing" 설명 "무에타이 클린치 니와 함께" — 무에타이 클린치(Chap Kho, 목 감싸기)'),
  MMA('bjj__underhook', '클린치 (Clinch)', 'A', 'MMA "Clinch Takedown Entry" 설명 "언더훅/오버훅 등 클린치 그립", "Takedown Defense (MMA)" 관련 기술 wrestling__underhook'),
  MMA('bjj__overhook', '클린치 (Clinch)', 'A', 'MMA "Clinch Takedown Entry" 설명 "언더훅/오버훅 등 클린치 그립"'),
  MMA('wrestling__body-lock', '클린치 (Clinch)', 'B', '공유 라이브러리 MMA 기록 "Body Lock Inside Trip", "Body Lock to Arm Triangle Choke"'),
  MMA('wrestling__basic-double-leg', '테이크다운 (Takedown)', 'A', 'MMA "Level Change Double Leg" 관련 기술 wrestling__basic-double-leg, 공유 라이브러리 MMA "Double Leg Takedown"'),
  MMA('wrestling__sprawl', '방어 (Defense)', 'A', 'MMA "Sprawl to Strikes"·"Takedown Defense (MMA)" 관련 기술 wrestling__sprawl'),
  MMA('bjj__rear-naked-choke', '서브미션 (Submission)', 'A', 'MMA "Back Mount Hooks Control"·"Scramble to Back Take" 관련 기술 bjj__rear-naked-choke, 공유 라이브러리 MMA "Double Leg to Rear Naked Choke"'),
  MMA('bjj__guillotine', '서브미션 (Submission)', 'A', 'MMA "Submission Setup off Strikes" 설명 "암바나 길로틴"·관련 기술 bjj__guillotine, 공유 라이브러리 MMA "Guillotine Choke"'),
  MMA('bjj__arm-triangle', '서브미션 (Submission)', 'A', '공유 라이브러리 MMA 기록 "Arm Triangle Choke", "Body Lock to Arm Triangle Choke"'),
  MMA('bjj__armbar', '서브미션 (Submission)', 'A', 'MMA "Submission Setup off Strikes"·"Ground and Pound to Submission Transition" 관련 기술 bjj__armbar'),
  MMA('bjj__triangle-choke', '서브미션 (Submission)', 'A', 'MMA "Ground and Pound to Submission Transition" 설명 "암바나 트라이앵글"·관련 기술 bjj__triangle'),
  MMA('bjj__kimura', '서브미션 (Submission)', 'A', 'MMA "Submission Setup off Strikes" 관련 기술 bjj__kimura'),
  MMA('judo__mount', '그라운드 컨트롤 (Ground Control)', 'A', 'MMA "Posture Control in Mount" 관련 기술 bjj__mount, "Ground and Pound from Mount"'),
  MMA('bjj__side-control', '그라운드 컨트롤 (Ground Control)', 'B', '공유 라이브러리 MMA 기록 "Arm Triangle Choke"·"Passing the Guard" 설명의 사이드 컨트롤'),
  MMA('judo__back-control', '그라운드 컨트롤 (Ground Control)', 'A', 'MMA "Back Mount Hooks Control" 설명 "백을 잡은 상태에서 훅을 걸어 포지션을 유지"'),
  MMA('bjj__half-guard', '그라운드 컨트롤 (Ground Control)', 'A', 'MMA "Short Elbows in Half Guard", "Guard Recovery Under Strikes" 설명 "가드(클로즈드/하프)"'),
  MMA('bjj__closed-guard', '그라운드 컨트롤 (Ground Control)', 'A', 'MMA "Guard Recovery Under Strikes" 설명 "가드(클로즈드/하프)를 다시 잡아"'),
  { id: 'wrestling__basic-double-leg', martialArt: 'bjj', category: '스탠딩 / 테이크다운', grade: 'A', evidence: 'BJJ 원문 3.2 테이크다운 "### 더블 레그 (Double Leg) — 두 다리를 잡아 상대의 균형을 무너뜨리는 테이크다운" (소제목이라 파서가 기술로 만들지 않음)', reason: 'BJJ A: 원문 3.2절 더블 레그' },
];

/**
 * 2026-10 final review: links added earlier with no technique-level evidence in MARTIALDEX's data — removed then.
 * SUPERSEDED by the full technique × art audit (data/audit/technique-art-decisions.json): with the MMA
 * records' "MMA 킥복싱" category (S1) + the Unified Rules (S2) as evidence they were re-judged B and are linked again.
 */
export const ART_LINKS_REMOVED = [
  { id: 'kickboxing__body-kick', martialArt: 'mixed-martial-arts', grade: 'C', reason: 'MMA 기록·공유 라이브러리 어디에도 바디킥 언급 없음 — 관계를 확정하지 않음' },
  { id: 'kickboxing__high-kick', martialArt: 'mixed-martial-arts', grade: 'C', reason: 'MMA 기록·공유 라이브러리 어디에도 하이킥/헤드킥 언급 없음' },
  { id: 'kickboxing__round-kick', martialArt: 'mixed-martial-arts', grade: 'C', reason: 'MMA 기록·공유 라이브러리 어디에도 라운드킥 언급 없음 (로우킥·카프킥·오블리크 킥만 있음)' },
  { id: 'kickboxing__teep', martialArt: 'mixed-martial-arts', grade: 'C', reason: 'MMA 기록·공유 라이브러리 어디에도 티프/푸시킥 언급 없음 (오블리크 킥은 다른 기술)' },
];

/** A curated video filed under the wrong technique. */
export const VIDEO_MOVES = [
  { videoId: 'IDpPa6oC_3E', from: 'sambo__sleeve-grip-захват-за-рукав', to: 'judo__two-on-one', reason: '"Russian Sambo wrestling 2 on 1 grip" — 소매 그립이 아니라 2-on-1 그립 영상' },
];

/**
 * REVIEW — final decision per item (2026-10 final review):
 *   'review'   = C: sources disagree / not enough to decide → kept as is, still REVIEW
 *   'separate' = B: shown to be different techniques → kept separate (no data change)
 *   'merge'    = A: shown to be the same technique → merged (build-technique-canonical.mjs)
 */
export const REVIEW = [
  { ids: ['muay-thai__khao-chiang-khao-khong', 'muay-thai__curving-knee'], decision: 'review', reason: '원문이 Khao Chiang을 한 곳에서는 다이애거널 니("Khao Chiang / Khao Khong — 다이애거널·커빙 니"), 다른 곳에서는 커빙 니("Curving Knee (Khao Chiang)")로 적음 — 원문끼리 충돌해 확정할 수 없음' },
  { ids: ['kickboxing__wheel-kick', 'taekwondo__뒤후려차기'], decision: 'review', reason: '킥복싱 Wheel Kick 기록에 설명이 없고, 이름만으로는 회전 훅킥(뒤후려차기)인지 회전 힐킥인지 알 수 없음' },
  { ids: ['judo__ude-garami', 'bjj__americana', 'bjj__kimura'], decision: 'separate', reason: '유도 우데가라미("팔 감아 꼬기")는 양방향 꺾기를 모두 가리키는 이름이라 아메리카나·키무라 중 어느 하나와 같은 기술이 아님 — 각각 유지' },
  { ids: ['sambo__рычаг-локтя', 'bjj__armbar'], decision: 'separate', reason: '데이터 설명 "(팔꿈치 레버 = 암바 계열)" — 계열 이름이라 특정 기술 하나(암바)와 같지 않음 — 각각 유지' },
  { ids: ['sambo__узел-плеча', 'sambo__узел-плеча-обратный', 'bjj__kimura', 'bjj__americana'], decision: 'separate', reason: '데이터 설명 "(어깨 노트 = 키무라/해머락 계열)", "(역방향 어깨 노트)" — 계열 이름 — 각각 유지' },
  { ids: ['sambo__узел-стопы', 'bjj__toe-hold', 'bjj__heel-hook'], decision: 'separate', reason: '데이터 설명 "(발의 비틀림형 노트) 계열, 즉 힐훅·토홀드 등" — 여러 기술을 묶은 계열 이름 — 각각 유지' },
  { ids: ['judo__kibisu-gaeshi', 'wrestling__ankle-pick'], decision: 'review', reason: '"발뒤꿈치 되잡기"와 앵클 픽 — 잡는 위치·마무리가 같은지 두 기록 모두 설명이 없어 확인할 수 없음' },
  { ids: ['judo__kata-gatame', 'bjj__arm-triangle'], decision: 'separate', reason: '유도 가타가타메는 "네와자 / 바닥 포지션"(누르기)에, BJJ 암 트라이앵글은 서브미션으로 수록 — 마무리(누르기 vs 조르기)가 달라 다른 기술' },
  { ids: ['wrestling__inside-trip', 'judo__ouchi-gari'], decision: 'review', reason: '레슬링 Inside Trip은 설명이 없고 유도 오우치가리는 "큰 안 베기"뿐 — 동작이 같은지 확인할 수 없음' },
  { ids: ['wrestling__hip-toss', 'judo__o-goshi', 'judo__koshi-guruma'], decision: 'separate', reason: '레슬링 힙 토스 하나가 그립에 따라 오고시·고시구루마 두 유도 기술에 걸쳐 있어 어느 하나와 같은 기술로 볼 수 없음 — 각각 유지' },
  { ids: ['karate__kizami-zuki', 'kickboxing__jab'], decision: 'merge', reason: '가라테 데이터 자체가 Kizami-zuki의 한국어명을 "잽"으로, 설명을 "앞손으로 짧고 빠르게 찌르는 견제·거리 측정용 기술"로 적음 + 기존 Visualizing Mitt 규칙도 Kizami-zuki를 잽 동작으로 그림 — 같은 기술 (가라테 화면에서는 Kizami-zuki로 표시)' },
  { ids: ['kickboxing__teep', 'muay-thai__push-teep', 'muay-thai__lead-teep', 'muay-thai__rear-teep'], decision: 'review', reason: '킥복싱 "Teep"은 설명 없이 리드/리어 구분도 없는 일반 항목 — 무에타이 리드·리어·푸시 티프 중 어느 것인지 확정할 수 없음' },
  { ids: ['sambo__отхват-подсечка-counter', 'sambo__удушающий-прием-удушающий-захват'], decision: 'separate', reason: '원문이 각각 하나의 항목("발쓸기에 대한 반대 방향 던지기 카운터", "조르기 일반 용어")으로 설명 — 묶음 기록이 아니므로 분리하지 않고 유지' },
  { ids: ['karate__feint', 'wrestling__feint'], decision: 'separate', reason: '레슬링 Feint는 "태클 진입 페인트"(기존 제외 사유), 가라테 Feint는 장거리 타격 견제 — 다른 기술 (전수 감사: MMA 목록에 둘 다 있음)' },
  { ids: ['karate__feint', 'boxing__feint'], decision: 'review', reason: '가라테 Feint(장거리 견제, 상대가 Sen인지 Go no Sen인지 확인 — 발·손 모두)와 복싱 Feint(펀치 페인트)가 같은 기술인지 데이터로 확인할 수 없음 (전수 감사 패턴 A)' },
  { ids: ['bjj__collar-choke', 'sambo__collar-choke'], decision: 'review', reason: 'BJJ 칼라 초크는 백 컨트롤에서, 삼보 "Collar Choke 계열"은 위치 설명 없음 — 같은 기술인지 확인할 수 없어 별도 유지' },
];
