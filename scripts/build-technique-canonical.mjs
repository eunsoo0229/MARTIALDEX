// One-off (re-runnable) analysis + build step for canonical techniques.
//
//   node scripts/build-technique-canonical.mjs [--add-teq <dump.json>]
//
// Finds the SAME real technique filed as separate records — across martial
// arts (BJJ "Granby Roll" + Wrestling "Granby Roll") and within one art (BJJ
// "Knee Cut" + "Knee Cut Pass") — and writes data/curated/technique-canonical.json,
// which src/lib/loadData.ts applies at load time: every member id keeps
// resolving (curricula, training history, mastery, videos, posture all keep
// working), but the technique is ONE record linked to every art it belongs to.
//
// Nothing here merges on name alone. Same-name groups are candidates; each
// was reviewed against category/position/description, and the ones that are
// genuinely different techniques sharing a name are listed in EXCLUDE with
// the reason. Raw data files (data/raw, data/processed) are never modified.
import fs from 'node:fs';
import path from 'node:path';
import { SPLITS, NOT_TECHNIQUES, ART_LINKS, ART_LINKS_REMOVED, VIDEO_MOVES, REVIEW } from './technique-relations.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const processedDir = path.join(ROOT, 'data/processed');
const all = fs
  .readdirSync(processedDir)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .flatMap((f) => read(`data/processed/${f}`).techniques);
const byId = new Map(all.map((t) => [t.id, t]));
const videos = read('data/curated/videos.json');
const posture = read('data/curated/posture.json');
const difficulty = read('data/curated/difficulty.json');

const norm = (s) => (s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// Same name, different technique — reviewed one by one.
const EXCLUDE = [
  { ids: ['karate__대표-기술', 'taekwondo__대표-기술'], reason: '"대표 기술"은 기술이 아니라 각 무술 문서의 목록 제목' },
  { ids: ['bjj__backstep', 'wrestling__back-step'], reason: 'BJJ 백스텝(가드 패스/레그 엔트리) ≠ 레슬링 백 스텝(기본 이동)' },
  { ids: ['boxing__frame', 'judo__frame'], reason: '복싱 근거리 프레임(밀어내기) ≠ 유도 탈출 프레임' },
  { ids: ['bjj__wrist-control', 'boxing__wrist-control', 'wrestling__wrist-control'], reason: '가드 안 손목 제어 / 클린치 손목 제어 / 스탠딩 핸드파이팅 — 상황과 목적이 다름' },
  { ids: ['bjj__hand-fighting', 'boxing__hand-fighting', 'wrestling__hand-fighting'], reason: '백 컨트롤 방어 / 인파이팅 / 스탠딩 그립 싸움 — 서로 다른 기술' },
  { ids: ['boxing__feint', 'wrestling__feint'], reason: '펀치 페인트 ≠ 태클 진입 페인트' },
  { ids: ['boxing__drop-step', 'wrestling__drop-step'], reason: '복싱 풋워크 드롭 스텝 ≠ 레슬링 태클 진입 드롭 스텝' },
  { ids: ['kickboxing__square-stance', 'wrestling__square-stance'], reason: '타격 스탠스 ≠ 레슬링 스탠스' },
  { ids: ['boxing__elbow-guard', 'muay-thai__elbow-guard'], reason: '바디 펀치 방어 ≠ 로우킥/훅 방어 자세' },
  { ids: ['bjj__over-under', 'wrestling__over-under'], reason: 'BJJ 오버-언더 패스 ≠ 레슬링 오버-언더 클린치' },
  { ids: ['judo__overhook-underhook', 'muay-thai__overhook-underhook'], reason: '도복 그립 ≠ 무에타이 클린치 (두 기술을 묶은 항목)' },
  { ids: ['wrestling__pivot'], reason: '레슬링 피벗(그라운드/스탠딩 방향 전환)은 복싱·킥복싱 풋워크 피벗과 다른 동작 — 타격 피벗끼리만 통합' },
  { ids: ['wrestling__bridge'], reason: '레슬링 브리지(목 브리지 기본 움직임) ≠ BJJ·유도 브리지 탈출 — 탈출 브리지끼리만 통합' },
  { ids: ['wrestling__inside-control'], reason: '레슬링 인사이드 컨트롤(핸드파이팅 타이) ≠ 클린치 인사이드 컨트롤 — 타격 클린치끼리만 통합' },
  // 2026-10 relation audit — previously merged, actually different techniques
  { ids: ['boxing__catch', 'kickboxing__catch'], reason: '복싱 캐치(손바닥으로 펀치를 받는 패링 계열) ≠ 킥복싱 캐치(로우킥/미들킥을 팔로 감아 잡는 킥 방어, 원문 14장)' },
  { ids: ['bjj__grip-fighting', 'judo__grip-fighting'], reason: 'BJJ 그립 파이팅(데 라 히바 가드 안에서의 그립 싸움) ≠ 유도 쿠미카타(서서 하는 그립 싸움) — 핸드 파이팅·손목 제어와 같은 기준' },
];

// Same technique under a different name (reviewed).
const EXTRA_GROUPS = [
  { members: ['bjj__knee-cut-pass', 'bjj__knee-cut'], reason: '같은 무릎 자르기 패스 (패스 가드 / 가드 패스 기술 모음에 중복 수록)' },
  { members: ['bjj__torreando-pass', 'bjj__torreando'], reason: '같은 토레안도 패스' },
  { members: ['bjj__double-under-pass', 'bjj__double-under'], reason: '같은 더블 언더 패스' },
  { members: ['bjj__leg-weave-pass', 'bjj__leg-weave'], reason: '같은 레그 위브 패스' },
  { members: ['bjj__over-under-pass', 'bjj__over-under'], reason: '같은 오버-언더 패스 (BJJ 안에서 중복)' },
  { members: ['bjj__butterfly-sweep', 'bjj__basic-butterfly-sweep'], reason: '같은 기본 버터플라이 스윕' },
  { members: ['wrestling__peterson-roll', 'wrestling__peterson'], reason: '같은 피터슨 롤 (원문 탈출 목록에 약칭 "Peterson"으로도 수록)' },
  // ---- 2026-10 relation audit: same technique, another name or a duplicate in the same art ----
  { members: ['kickboxing__catch', 'kickboxing__킥-캐치'], reason: '같은 킥 캐치 (방어 목록과 그래플링 규정 절에 중복 수록)' },
  { members: ['kickboxing__straight-knee', 'muay-thai__khao-trong'], reason: 'Khao Trong(เข่าตรง) = 스트레이트 니 (데이터 설명 "정면으로 곧게 찌르는 니")' },
  { members: ['kickboxing__flying-knee', 'muay-thai__khao-loi'], reason: 'Khao Loi(เข่าลอย) = 플라잉 니' },
  { members: ['kickboxing__jumping-knee', 'muay-thai__khao-kradod'], reason: 'Khao Kradod(เข่ากระโดด) = 점핑 니' },
  { members: ['kickboxing__horizontal-elbow', 'muay-thai__sok-tad'], reason: 'Sok Tad = 수평 엘보 (데이터 설명 "Horizontal Elbow와 동일 계열")' },
  { members: ['kickboxing__downward-elbow', 'muay-thai__sok-sap'], reason: 'Sok Sap = 다운워드 엘보' },
  { members: ['kickboxing__upward-elbow', 'muay-thai__sok-ngoei'], reason: 'Sok Ngoei = 업워드 엘보' },
  { members: ['bjj__armbar', 'judo__juji-gatame', 'judo__ude-hishigi-juji-gatame'], reason: '주지가타메(우데히시기 주지가타메는 정식 명칭) = 암바 — 같은 십자 꺾기' },
  { members: ['judo__ude-garami', 'judo__ude-hishigi-ude-garami'], reason: '우데히시기 우데가라미는 우데가라미의 정식 명칭' },
  { members: ['wrestling__basic-double-leg', 'judo__morote-gari'], reason: '모로테가리(양손 베기) = 더블 레그 테이크다운' },
  { members: ['bjj__rear-naked-choke', 'judo__hadaka-jime'], reason: '하다카지메(맨손 조르기) = 리어 네이키드 초크' },
  { members: ['bjj__triangle-choke', 'bjj__triangle', 'judo__sankaku-jime'], reason: '같은 트라이앵글 초크 (BJJ 클로즈드 가드·트라이앵글 계열에 중복 수록, 유도 산카쿠지메)' },
  { members: ['bjj__d-arce-choke', 'bjj__d-arce'], reason: '같은 다스 초크 (BJJ 안에서 중복)' },
  { members: ['bjj__anaconda-choke', 'bjj__anaconda'], reason: '같은 아나콘다 초크 (BJJ 안에서 중복)' },
  { members: ['bjj__ezekiel-choke', 'bjj__ezekiel'], reason: '같은 에제키엘 초크 (BJJ 안에서 중복)' },
  { members: ['bjj__pant-grip', 'bjj__팬츠-그립'], reason: '같은 팬츠 그립 (BJJ 안에서 영문/한글로 중복)' },
  { members: ['judo__sleeve-grip', 'bjj__슬리브-그립', 'sambo__sleeve-grip-захват-за-рукав'], reason: '같은 도복 소매 그립 (삼보는 러시아어 병기)' },
  { members: ['judo__lapel-grip', 'bjj__칼라-그립', 'sambo__collar-lapel-grip-ворот'], reason: '같은 도복 깃(칼라/라펠) 그립' },
  { members: ['bjj__kneebar', 'sambo__рычаг-колена'], reason: '삼보 무릎 레버(рычаг колена) = 니바 (데이터 설명)' },
  { members: ['bjj__straight-ankle-lock', 'sambo__ущемление-ахиллова-сухожилия'], reason: '삼보 아킬레스건 압박 = 스트레이트 앵클 락(아킬레스 락) — 데이터 설명' },
  { members: ['kickboxing__front-kick', 'karate__mae-geri', 'taekwondo__앞차기'], reason: '마에게리 = 앞차기 = 프론트 킥 (가라테 데이터의 한국어명 "앞차기")' },
  { members: ['kickboxing__side-kick', 'karate__yoko-geri', 'taekwondo__옆차기'], reason: '요코게리 = 옆차기 = 사이드 킥' },
  { members: ['kickboxing__back-kick', 'karate__ushiro-geri', 'taekwondo__뒤차기'], reason: '우시로게리 = 뒤차기 = 백 킥 (회전 없이 뒤로 뻗는 차기)' },
  { members: ['kickboxing__round-kick', 'karate__mawashi-geri', 'taekwondo__돌려차기'], reason: '마와시게리 = 돌려차기 = 라운드 킥' },
  { members: ['kickboxing__axe-kick', 'karate__kakato-geri', 'taekwondo__내려차기'], reason: '가카토게리(뒤꿈치차기/도끼차기) = 내려차기 = 액스 킥' },
  { members: ['kickboxing__crescent-kick', 'karate__mikazuki-geri', 'taekwondo__반달차기'], reason: '미카즈키게리(데이터 한국어명 "반달차기") = 반달차기 = 크레센트 킥 — 막기를 걷어내는 곡선 차기' },
  { members: ['karate__tettsui-uchi', 'taekwondo__망치주먹'], reason: '데쓰이우치 = 망치주먹(메주먹)' },
  { members: ['karate__shuto-uchi', 'taekwondo__손날치기'], reason: '슈토우치 = 손날치기' },
  { members: ['karate__haito-uchi', 'taekwondo__손날등치기'], reason: '하이토우치(반대손날) = 손날등치기' },
  { members: ['karate__gedan-barai', 'taekwondo__아래막기'], reason: '게단바라이(하단막기) = 아래막기' },
  { members: ['karate__age-uke', 'taekwondo__얼굴막기'], reason: '아게우케(상단막기) = 얼굴막기(올려막기)' },
  { members: ['karate__zenkutsu-dachi', 'taekwondo__앞굽이'], reason: '젠쿠쓰다치(전굴립) = 앞굽이' },
  { members: ['karate__kokutsu-dachi', 'taekwondo__뒷굽이'], reason: '고쿠쓰다치(후굴립) = 뒷굽이' },
  { members: ['karate__kiba-dachi', 'taekwondo__주춤서기'], reason: '기바다치(기마립) = 주춤서기' },
  { members: ['karate__neko-ashi-dachi', 'taekwondo__범서기'], reason: '네코아시다치(묘족립) = 범서기 — 체중을 뒤에 두고 앞발을 띄우는 자세' },
  { members: ['bjj__bridge-and-roll', 'bjj__bridge-and-roll-umpa'], reason: '같은 브리지 앤 롤(움파) 탈출 (BJJ 안에서 중복)' },
];

// Records to add to a same-name group (key = any member of that group).
const EXTRA_MEMBERS = {
  // 원문 레슬링 탈출/바텀 목록이 같은 동작을 "Granby"와 "Granby Roll" 두 이름으로 수록.
  'wrestling__granby-roll': ['wrestling__granby'],
  // ---- 2026-10 relation audit ----
  'kickboxing__cross': ['boxing__cross-straight-right'], // "Cross / Straight Right" = 같은 크로스의 두 이름
  'kickboxing__roll': ['boxing__roll-bob-and-weave'], // "Roll / Bob and Weave" = 같은 롤
  'kickboxing__pull': ['boxing__pull-back'], // 복싱 원문이 같은 풀(백) 방어를 "Pull"과 "Pull Back"으로 수록
  'bjj__hip-escape': ['judo__shrimp'], // 슈림프 = 힙 이스케이프
  'sambo__fireman-s-carry': ['judo__kata-guruma'], // 가타구루마(어깨 바퀴) = 파이어맨 캐리
  'sambo__벨트-그립': ['judo__belt-grip', 'sambo__belt-grip-пояс-그립'], // 같은 도복 벨트 그립
  'bjj__overhook': ['wrestling__overhook-whizzer', 'bjj__오버훅'], // "Overhook / Whizzer" = 같은 오버훅, BJJ 한글 중복
  'bjj__underhook': ['bjj__언더훅'],
  'judo__two-on-one': ['bjj__2-on-1'],
  'wrestling__russian-tie': ['bjj__러시안-타이'],
  'muay-thai__spinning-elbow': ['muay-thai__sok-klab'], // Sok Klab(ศอกกลับ) = 스피닝 엘보
  'boxing__backfist': ['karate__uraken-uchi', 'taekwondo__등주먹'], // 우라켄 = 등주먹 = 백피스트
  // 2026-10 final review (REVIEW → merge): 가라테 데이터의 한국어명이 "잽", 설명이 잽의 정의
  'kickboxing__jab': ['karate__kizami-zuki'],
};

// Shared-library (Supabase add_teq) records that re-registered an existing
// official technique under another art or name. Their ids keep resolving to
// the canonical technique, and their art becomes a link.
const ADD_TEQ_DUPLICATES = [
  { id: 'mixed-martial-arts__guillotine-choke', canonical: 'bjj__guillotine', reason: 'MMA에 따로 등록된 길로틴 초크' },
  { id: 'mixed-martial-arts__arm-triangle-choke', canonical: 'bjj__arm-triangle', reason: 'MMA에 따로 등록된 암 트라이앵글 초크' },
  { id: 'mma__double-leg-takedown', canonical: 'wrestling__basic-double-leg', reason: 'MMA에 따로 등록된 기본 더블 레그 테이크다운' },
  { id: 'mixed-martial-arts__overhand-right', canonical: 'boxing__overhand', reason: '오른손 오버핸드 = 오버핸드' },
  { id: 'bjj__closed-guard-armbar', canonical: 'bjj__armbar', reason: '공식 Armbar가 클로즈드 가드 암바' },
  { id: 'bjj__니-슬라이스-패스', canonical: 'bjj__knee-cut-pass', reason: '니 슬라이스 = 니 컷 패스' },
  { id: 'bjj__bullfighter-pass', canonical: 'bjj__torreando-pass', reason: 'Bullfighter Pass = Torreando(투우사) 패스' },
];

// Search aliases for names users actually type (Korean transliteration etc.).
const EXTRA_ALIASES = {
  'wrestling__granby-roll': ['Granby', '그랜비 롤', '그랜비롤'],
  // 같은 "Catch"라는 이름의 서로 다른 두 기술을 검색·목록에서 구분
  'kickboxing__catch': ['Kick Catch', '킥 캐치'],
  'boxing__catch': ['Punch Catch', '펀치 캐치'],
  // 기본 더블 레그 = 일반적으로 부르는 "더블 레그" (유도 모로테가리와 같은 그룹)
  'wrestling__basic-double-leg': ['Double Leg', 'Double Leg Takedown', '더블 레그', '더블레그'],
};

// A merged technique borrows a member's Korean name when its own record has
// none. Where that name only translates ANOTHER member's name (Judo "Morote
// Gari" → "양손 베기" in the Double Leg group), don't borrow it (it stays an alias).
const NO_BORROWED_KOREAN_NAME = {
  'bjj__armbar': '"십자 굳히기"는 주지가타메의 직역',
  'bjj__rear-naked-choke': '"맨손 조르기"는 하다카지메의 직역',
  'wrestling__basic-double-leg': '"양손 베기"는 모로테가리의 직역',
  'sambo__fireman-s-carry': '"어깨 바퀴"는 가타구루마의 직역',
  'bjj__triangle-choke': '"삼각 조르기"는 산카쿠지메의 직역 (BJJ 기술명은 영문 표기)',
};

// Canonical record: the one with the most real data; ties → the art the
// technique is most native to (listed first).
const ART_PRIORITY = ['wrestling', 'judo', 'boxing', 'muay-thai', 'kickboxing', 'bjj', 'sambo', 'karate', 'taekwondo', 'mixed-martial-arts'];
function dataScore(id) {
  const t = byId.get(id);
  return (posture[id] ? 4 : 0) + (videos[id]?.length ?? 0) + ((t.description ?? '').length > 0 ? 2 : 0) + (t.koreanName ? 1 : 0) + (t.difficulty || difficulty[id] ? 1 : 0) + (t.purpose ? 1 : 0);
}
// Keep the canonical id a group already had (saved data and links use it).
let previousCanonical = new Set();
try {
  previousCanonical = new Set(read('data/curated/technique-canonical.json').groups.map((g) => g.canonicalId));
} catch {
  // first build
}
function pickCanonical(ids) {
  const kept = ids.find((id) => previousCanonical.has(id));
  if (kept) return kept;
  return [...ids].sort((a, b) => dataScore(b) - dataScore(a) || ART_PRIORITY.indexOf(byId.get(a).martialArt) - ART_PRIORITY.indexOf(byId.get(b).martialArt))[0];
}

const excludedIds = new Set(EXCLUDE.filter((e) => e.ids.length === 1).flatMap((e) => e.ids));
const excludedGroups = EXCLUDE.filter((e) => e.ids.length > 1).map((e) => new Set(e.ids));

// ---- candidates: same normalized name across arts ----
const byName = new Map();
for (const t of all) {
  const k = norm(t.name);
  if (!k) continue;
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(t.id);
}
const candidates = [...byName.values()].filter((ids) => new Set(ids.map((id) => byId.get(id).martialArt)).size > 1);

const groups = [];
const report = { sameNameCandidates: candidates.length, excludedWholeGroups: [], partiallyExcluded: [] };
for (const ids of candidates) {
  if (excludedGroups.some((g) => ids.every((id) => g.has(id)))) {
    report.excludedWholeGroups.push(byId.get(ids[0]).name);
    continue;
  }
  const kept = ids.filter((id) => !excludedIds.has(id));
  for (const [key, extra] of Object.entries(EXTRA_MEMBERS)) if (kept.includes(key)) kept.push(...extra.filter((id) => byId.has(id) && !kept.includes(id)));
  if (kept.length < ids.length) report.partiallyExcluded.push(`${byId.get(ids[0]).name}: ${ids.filter((id) => excludedIds.has(id)).join(', ')} 제외`);
  if (new Set(kept.map((id) => byId.get(id).martialArt)).size < 2 && kept.length < 2) continue;
  groups.push({ canonicalId: pickCanonical(kept), members: kept, reason: '여러 무술에 같은 이름·같은 동작으로 수록' });
}
for (const g of EXTRA_GROUPS) {
  for (const id of g.members) if (!byId.has(id)) throw new Error(`unknown id ${id}`);
  // A reviewed group lists its preferred canonical record first (the name most
  // people search for: "Double Leg", not "Morote Gari") — unless the group
  // already had a canonical id that saved data uses.
  const kept = g.members.find((id) => previousCanonical.has(id));
  groups.push({ canonicalId: kept ?? g.members[0], members: g.members, reason: g.reason });
}
// A technique may only belong to one group.
const seen = new Map();
for (const g of groups) for (const id of g.members) {
  if (seen.has(id)) throw new Error(`${id} in two groups`);
  seen.set(id, g.canonicalId);
}
for (const d of ADD_TEQ_DUPLICATES) if (!byId.has(d.canonical)) throw new Error(`unknown canonical ${d.canonical}`);
// add_teq duplicates point at the GROUP's canonical when their target was itself merged.
const addTeqDuplicates = ADD_TEQ_DUPLICATES.map((d) => ({ ...d, canonical: seen.get(d.canonical) ?? d.canonical }));

groups.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
for (const id of Object.keys(EXTRA_ALIASES)) if (!byId.has(id)) throw new Error(`unknown alias id ${id}`);
const extraAliases = Object.fromEntries(Object.entries(EXTRA_ALIASES).map(([id, a]) => [seen.get(id) ?? id, a]));
// ---- splits / art links (scripts/technique-relations.mjs) ----
const canonicalOf = (id) => seen.get(id) ?? id;
const slug = (s) => s.normalize('NFKC').toLowerCase().replace(/[()]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
const splitIds = new Set();
const newTechniques = new Map(); // id → record
const splits = [];
const artLinks = [];
const newArtLinks = []; // links whose target is a technique created by a split (not an official record)
const addArtLink = (link) => {
  const canonicalId = canonicalOf(link.id);
  const t = byId.get(canonicalId);
  const arts = new Set(groups.find((g) => g.canonicalId === canonicalId)?.members.map((m) => byId.get(m).martialArt) ?? [t.martialArt]);
  if (arts.has(link.martialArt)) return null; // already in that art
  if (artLinks.some((l) => l.canonicalId === canonicalId && l.martialArt === link.martialArt)) return canonicalId;
  artLinks.push({ canonicalId, martialArt: link.martialArt, category: link.category, sourceId: link.sourceId ?? null, reason: link.reason, ...(link.grade ? { grade: link.grade, evidence: link.evidence } : {}), ...(link.audit ? { audit: true } : {}) });
  return canonicalId;
};
for (const sp of SPLITS) {
  const src = byId.get(sp.id);
  if (!src) throw new Error(`split: unknown id ${sp.id}`);
  if (seen.has(sp.id)) throw new Error(`split: ${sp.id} is also in a merge group`);
  splitIds.add(sp.id);
  const parts = [];
  for (const [name, target, extra = {}] of sp.parts) {
    if (target) {
      if (!byId.has(target)) throw new Error(`split ${sp.id}: unknown target ${target}`);
      if (splitIds.has(target) || SPLITS.some((x) => x.id === target)) throw new Error(`split ${sp.id}: target ${target} is itself split`);
      const canonicalId = canonicalOf(target);
      addArtLink({ id: target, martialArt: src.martialArt, category: src.category, sourceId: sp.id, reason: `${sp.id} 분리: "${name}"` });
      parts.push({ name, id: canonicalId, link: true, ...(extra.moveVideos ? { moveVideos: (videos[sp.id] ?? []).map((v) => v.videoId) } : {}) });
      continue;
    }
    const id = extra.id ?? `${src.martialArt}__${slug(name)}`;
    if (byId.has(id)) throw new Error(`split ${sp.id}: new id ${id} collides with an official record`);
    const existing = newTechniques.get(id);
    if (existing) {
      if (existing.martialArt !== src.martialArt) throw new Error(`split: ${id} reused across arts`);
      existing.sourceIds.push(sp.id);
    } else {
      newTechniques.set(id, {
        id,
        martialArt: src.martialArt,
        name,
        koreanName: extra.ko ?? null,
        category: src.category,
        positions: src.positions ?? [],
        description: extra.desc ?? '',
        sourceIds: [sp.id],
        videoIds: extra.videos ? (videos[sp.id] ?? []).map((v) => v.videoId) : [],
      });
    }
    parts.push({ name, id, link: false });
  }
  splits.push({ id: sp.id, reason: sp.reason, parts });
}
for (const t of newTechniques.values()) t.siblings = [...new Set(splits.filter((s) => t.sourceIds.includes(s.id)).flatMap((s) => s.parts.map((p) => p.id)))].filter((id) => id !== t.id);
for (const l of ART_LINKS) {
  if (!byId.has(l.id)) throw new Error(`art link: unknown id ${l.id}`);
  addArtLink(l);
}
// Full technique × art audit (data/audit/technique-art-decisions.json): every
// judged "add" becomes a link, carrying its confidence and evidence. The
// judged technique ids are canonical ids from the app; resolve to the group.
let auditDecisions = [];
try {
  auditDecisions = read('data/audit/technique-art-decisions.json').decisions;
} catch {
  // audit not run yet
}
const newIds = new Set(newTechniques.keys());
for (const d of auditDecisions.filter((x) => x.decision === 'add')) {
  if (newIds.has(d.techniqueId)) {
    const n = newTechniques.get(d.techniqueId);
    if (n.martialArt === d.art) continue;
    newArtLinks.push({ canonicalId: d.techniqueId, martialArt: d.art, category: d.category, sourceId: null, reason: `전수 감사 ${d.confidence}: ${d.reason}`, grade: d.confidence, evidence: d.evidence, audit: true });
    continue;
  }
  if (!byId.has(d.techniqueId)) throw new Error(`audit decision: unknown id ${d.techniqueId}`);
  addArtLink({ id: d.techniqueId, martialArt: d.art, category: d.category, reason: `전수 감사 ${d.confidence}: ${d.reason}`, grade: d.confidence, evidence: d.evidence, audit: true });
}
for (const h of NOT_TECHNIQUES) if (!byId.has(h.id)) throw new Error(`not-technique: unknown id ${h.id}`);
for (const m of VIDEO_MOVES) if (!(videos[m.from] ?? []).some((v) => v.videoId === m.videoId)) throw new Error(`video move: ${m.videoId} not on ${m.from}`);

const out = {
  version: 2,
  generatedBy: 'scripts/build-technique-canonical.mjs',
  groups,
  addTeqDuplicates,
  extraAliases,
  excluded: EXCLUDE,
  splits,
  newTechniques: [...newTechniques.values()],
  artLinks: [...artLinks, ...newArtLinks],
  notTechniques: NOT_TECHNIQUES,
  videoMoves: VIDEO_MOVES.map((m) => ({ ...m, to: canonicalOf(m.to) })),
  review: REVIEW,
  artLinksRemoved: ART_LINKS_REMOVED,
  noBorrowedKoreanName: Object.keys(NO_BORROWED_KOREAN_NAME).map((id) => canonicalOf(id)),
};
fs.writeFileSync(path.join(ROOT, 'data/curated/technique-canonical.json'), JSON.stringify(out, null, 2) + '\n');

const merged = groups.reduce((s, g) => s + g.members.length - 1, 0);
console.log(JSON.stringify({
  officialTechniqueRecords: all.length,
  canonicalTechniques: all.length - merged,
  mergedRecords: merged,
  groups: groups.length,
  crossArtGroups: groups.filter((g) => new Set(g.members.map((id) => byId.get(id).martialArt)).size > 1).length,
  withinArtGroups: groups.filter((g) => new Set(g.members.map((id) => byId.get(id).martialArt)).size === 1).length,
  addTeqDuplicates: addTeqDuplicates.length,
  splitRecords: splits.length,
  newTechniquesFromSplits: newTechniques.size,
  artLinks: artLinks.length,
  notTechniques: NOT_TECHNIQUES.length,
  review: REVIEW.length,
  ...report,
}, null, 2));
