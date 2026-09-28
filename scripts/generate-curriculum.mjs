#!/usr/bin/env node
/**
 * Generates Martialdex's official recommended curricula
 * (data/curriculum/official/<martialArt>.json) from the REAL parsed
 * technique data in data/processed/<martialArt>.json.
 *
 * This script never invents a technique id. Every techniqueId/
 * reviewTechniqueId in the output is copied verbatim from a real
 * Technique record — it is selected (by category + difficulty), never
 * created. If a BLUEPRINT category string doesn't match anything in the
 * real data, generation fails loudly instead of silently producing an
 * empty/wrong curriculum (see assertCategoriesExist()).
 *
 * Each martial art gets its own hand-designed sequence of "phases"
 * (see BLUEPRINTS below) reflecting how that specific art is actually
 * taught — BJJ's phases are nothing like Boxing's. Phases are NOT a
 * fixed Day 1-30 split: each phase gets its own day budget, and within a
 * phase, techniques are selected in (difficulty: beginner > unset >
 * intermediate > advanced) then original-document order, which is
 * already the source document's own basic-to-advanced ordering. Not every
 * technique in a category is necessarily included — the goal is a
 * teachable core sequence, not a duplicate of the full encyclopedia.
 *
 * Re-run any time data/processed/*.json changes:
 *   node scripts/generate-curriculum.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROCESSED_DIR = path.join(ROOT, 'data', 'processed');
const OUT_DIR = path.join(ROOT, 'data', 'curriculum', 'official');

const DIFF_RANK = { beginner: 0, null: 1, undefined: 1, intermediate: 2, advanced: 3 };
function diffRank(d) {
  return DIFF_RANK[d ?? 'null'] ?? 1;
}

function shortLabel(t) {
  const base = t.koreanName && t.koreanName !== t.name && t.koreanName.length <= 14 ? t.koreanName : t.name;
  const cut = base.split(' / ')[0].split(' (')[0];
  return cut.length > 26 ? cut.slice(0, 25) + '…' : cut;
}

function firstSentence(text, maxLen = 90) {
  if (!text) return null;
  const cleaned = text.split('\n')[0].trim();
  const sentence = cleaned.split(/(?<=[.。])\s/)[0] || cleaned;
  return sentence.length > maxLen ? sentence.slice(0, maxLen - 1) + '…' : sentence;
}

// Some source techniques in the same category share one descriptive
// paragraph verbatim (the raw markdown lists several related moves under one
// blurb) — using it as-is for every one of them would repeat the exact same
// "learning goal" sentence several times in a single day. `used` tracks
// goals already emitted *for this day* so a repeat falls back to a
// technique-specific generic phrasing instead of a duplicate line.
function learningGoalFor(t, used) {
  const candidate = firstSentence(t.purpose) || firstSentence(t.description);
  if (candidate && !used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  return `${shortLabel(t)}의 기본 동작과 활용 상황을 이해한다.`;
}

function majorityDifficulty(techs, fallback) {
  const counts = { beginner: 0, intermediate: 0, advanced: 0 };
  for (const t of techs) if (t.difficulty && counts[t.difficulty] !== undefined) counts[t.difficulty]++;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top[1] > 0 ? top[0] : fallback;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// ---------------------------------------------------------------------------
// Per-martial-art blueprints. `categories` strings must match
// data/processed/<art>.json technique.category EXACTLY (verified below).
// `cap` bounds how many techniques are pulled from that category pool
// (undefined = take all). `perDay` is the [min,max] core-technique count for
// a content day in this phase (kept small on purpose — the point is to
// actually learn each technique, not skim a list).
// ---------------------------------------------------------------------------
const BLUEPRINTS = {
  bjj: {
    title: '주짓수 추천 커리큘럼',
    description:
      '기본 움직임과 스탠딩부터 시작해 주요 포지션, 가드, 이스케이프, 가드 패스, 서브미션, 포지션 전환까지 단계적으로 익히는 주짓수 학습 순서입니다.',
    reviewCadence: 7,
    phases: [
      {
        name: '기본 움직임과 개념',
        blurb: '주짓수의 모든 동작이 시작되는 기본 움직임(브릿지, 힙 이스케이프, 프레임)을 익힙니다.',
        categories: ['기본 움직임과 연결 기술'],
        perDay: [2, 3],
        difficulty: 'beginner',
      },
      {
        name: '스탠딩과 테이크다운',
        blurb: '서 있는 상태에서의 그립, 자세, 기본 테이크다운을 배웁니다.',
        categories: ['스탠딩 / 테이크다운'],
        cap: 10,
        perDay: [3, 3],
        difficulty: 'beginner',
      },
      {
        name: '기본 포지션의 이해',
        blurb: '마운트·사이드 컨트롤·니 온 벨리·백 컨트롤·터틀 등 바닥에서의 주요 포지션과 그 컨트롤 방법을 이해합니다.',
        categories: [
          '마운트 (Mount)',
          '사이드 컨트롤 (Side Control)',
          '니 온 벨리 (Knee on Belly)',
          '노스 사우스 (North-South)',
          '터틀 (Turtle)',
          '백 컨트롤 (Back Control)',
        ],
        cap: 20,
        perDay: [3, 4],
        difficulty: 'beginner',
      },
      {
        name: '가드의 기초',
        blurb: '클로즈드 가드와 오픈 가드 계열의 기본 형태와 상대를 컨트롤하는 원리를 배웁니다.',
        categories: [
          '클로즈드 가드 (Closed Guard)',
          '오픈 가드 (Open Guard)',
          '하프 가드 (Half Guard)',
          '버터플라이 가드 (Butterfly Guard)',
        ],
        cap: 18,
        perDay: [3, 4],
        difficulty: 'beginner',
      },
      {
        name: '가드의 응용',
        blurb: '데 라 히바, 스파이더, X 가드 등 더 발전된 가드 형태를 다룹니다.',
        categories: [
          '데 라 히바 (De La Riva Guard)',
          '스파이더 가드 (Spider Guard)',
          '라쏘 가드 (Lasso Guard)',
          'X 가드 (X-Guard)',
          '싱글 레그 X (SLX / Single Leg X)',
          '딥 하프 가드 (Deep Half Guard)',
          '50/50 가드',
          '아시 가라미 (Ashi Garami)',
        ],
        cap: 12,
        perDay: [2, 3],
        difficulty: 'intermediate',
      },
      {
        name: '이스케이프',
        blurb: '불리한 포지션에서 벗어나는 이스케이프 기술을 배웁니다.',
        categories: ['탈출 기술 모음'],
        perDay: [2, 3],
        difficulty: 'beginner',
      },
      {
        name: '가드 패스',
        blurb: '상대의 가드를 통과해 유리한 탑 포지션으로 전환하는 방법을 배웁니다.',
        categories: ['패스 가드 (Guard Passing)', '가드 패스 기술 모음'],
        cap: 10,
        perDay: [3, 3],
        difficulty: 'intermediate',
      },
      {
        name: '기본 서브미션',
        blurb: '암바, 트라이앵글, 기무라 등 가장 기본적인 서브미션을 배웁니다. 관절기·조르기는 반드시 지도자의 감독 아래 천천히 연습해야 합니다.',
        categories: ['암바 계열', '트라이앵글 계열', '김우라 계열'],
        cap: 12,
        perDay: [2, 2],
        difficulty: 'intermediate',
      },
      {
        name: '레그락과 백 서브미션',
        blurb: '레그락 계열과 백 컨트롤에서의 서브미션을 배웁니다. 특히 레그락은 부상 위험이 높아 천천히, 파트너와 합의된 압력으로만 연습해야 합니다.',
        categories: ['레그락 계열', '크루시픽스 (Crucifix)', '백 테이크 기술 모음'],
        cap: 10,
        perDay: [2, 2],
        difficulty: 'advanced',
      },
      {
        name: '포지션 전환과 연결',
        blurb: '암 드래그, 스윕, 프론트 헤드락 등 포지션을 서로 연결하는 기술과, 기/노기 상황별로 특히 중요한 기술을 다룹니다.',
        categories: [
          '암 드래그 (Arm Drag)',
          '스윕 기술 모음',
          '프론트 헤드락 (Front Headlock)',
          '기(Gi)에서 특히 중요한 기술',
          '노기(No-Gi)에서 자주 등장하는 포지션',
        ],
        cap: 14,
        perDay: [3, 3],
        difficulty: 'intermediate',
      },
    ],
    finalReviewRatio: 0.06,
    finalReviewRange: [3, 5],
  },

  karate: {
    title: '가라테 추천 커리큘럼',
    description: '기본 자세와 이동부터 막기, 손기술, 발차기, 조합, 쿠미테 응용까지 이어지는 가라테 학습 순서입니다.',
    reviewCadence: 7,
    phases: [
      {
        name: '기본 자세와 호흡',
        blurb: '가라테의 기본 서기 자세와 호흡법을 익힙니다.',
        categories: ['기본 자세 (Kihon Dachi)', '호흡법 (Kokyu-ho): Ibuki와 Nogare'],
        perDay: [3, 3],
        difficulty: 'beginner',
      },
      {
        name: '이동과 회피',
        blurb: '자세를 유지하며 이동하는 방법과 상대의 공격을 피하는 타이사바키를 배웁니다.',
        categories: ['이동 (Shintai / 풋워크)', '타이사바키 / 회피 (Tai Sabaki)'],
        perDay: [3, 3],
        difficulty: 'beginner',
      },
      {
        name: '기본 막기',
        blurb: '상대의 공격을 막아내는 기본 막기 기술을 배웁니다.',
        categories: ['막기 (Uke)'],
        perDay: [3, 3],
        difficulty: 'beginner',
      },
      {
        name: '기본 손기술',
        blurb: '주먹과 손을 이용한 기본 타격 기술을 배웁니다.',
        categories: ['손기술 (Te-waza)', '팔꿈치 (Empi / Hiji)'],
        perDay: [3, 3],
        difficulty: 'beginner',
      },
      {
        name: '기본 발차기',
        blurb: '가라테의 기본 발차기 기술을 배웁니다.',
        categories: ['발차기 (Geri)'],
        perDay: [3, 3],
        difficulty: 'intermediate',
      },
      {
        name: '거리 개념',
        blurb: '근거리·중거리·장거리에서 각각 어떤 기술이 유효한지 이해합니다.',
        categories: ['근거리 (Chika-ma)', '중거리 (Ma)', '장거리 (To-ma)'],
        perDay: [3, 3],
        difficulty: 'intermediate',
      },
      {
        name: '조합과 카운터',
        blurb: '개별 기술을 연결한 조합과, 상대의 공격 이후 반격하는 카운터를 배웁니다.',
        categories: ['조합 (Renzoku-waza)', '카운터 (Go no Sen 응용)'],
        perDay: [3, 3],
        difficulty: 'intermediate',
      },
      {
        name: '쿠미테와 응용',
        blurb: '쿠미테(대인 대련)의 판정 규칙과, 실전 자기방어에 응용하는 부니카이, 유파별 대표 기술을 다룹니다. 실제 대련은 반드시 지도자의 지도 아래 안전 장비를 갖추고 진행해야 합니다.',
        categories: [
          '쿠미테 --- 판정 규칙과 타이밍',
          '전통 가라테의 응용 (자기방어 / Bunkai)',
          '유파별 대표 기술과 가타',
        ],
        perDay: [3, 3],
        difficulty: 'advanced',
      },
    ],
    finalReviewRatio: 0.08,
    finalReviewRange: [2, 3],
  },

  wrestling: {
    title: '레슬링 추천 커리큘럼',
    description: '기본 자세와 그립 싸움부터 싱글/더블 레그, 던지기, 탑 포지션 컨트롤, 탈출과 리버설까지 이어지는 레슬링 학습 순서입니다.',
    reviewCadence: 6,
    phases: [
      {
        name: '기본 자세와 움직임',
        blurb: '레슬링의 기본 스탠스와 이동 방법을 익힙니다.',
        categories: ['기본 자세와 움직임'],
        cap: 10,
        perDay: [3, 3],
        difficulty: 'beginner',
      },
      {
        name: '스탠딩 포지션과 그립',
        blurb: '서서 상대와 그립을 다투는 핸드파이팅과 스탠딩 포지션을 배웁니다.',
        categories: ['스탠딩 포지션 / 그립'],
        cap: 10,
        perDay: [3, 3],
        difficulty: 'beginner',
      },
      {
        name: '공격 진입',
        blurb: '셋업, 페이크, 피더링 등 테이크다운을 시도하기 전의 진입 동작을 배웁니다.',
        categories: ['공격 진입 (셋업 / 페이크 / 피더링)'],
        cap: 9,
        perDay: [3, 3],
        difficulty: 'intermediate',
      },
      {
        name: '싱글 레그',
        blurb: '한쪽 다리를 잡아 테이크다운하는 싱글 레그 계열을 배웁니다.',
        categories: ['싱글 레그'],
        cap: 9,
        perDay: [3, 3],
        difficulty: 'intermediate',
      },
      {
        name: '더블 레그',
        blurb: '양쪽 다리를 잡아 테이크다운하는 더블 레그 계열을 배웁니다.',
        categories: ['더블 레그'],
        cap: 8,
        perDay: [2, 3],
        difficulty: 'intermediate',
      },
      {
        name: '바디락과 클린치',
        blurb: '상체를 감싸 컨트롤하는 바디락과 클린치 상황을 배웁니다.',
        categories: ['바디락 / 클린치', '프론트 헤드락'],
        cap: 9,
        perDay: [3, 3],
        difficulty: 'intermediate',
      },
      {
        name: '던지기',
        blurb: '상대를 들어 던지는 던지기 기술을 배웁니다. 낙법 없이 연습하면 부상 위험이 매우 크므로 반드시 매트와 지도자 감독하에 연습해야 합니다.',
        categories: ['던지기 / 투사 (상체 던지기 포함)', '발목·무릎 공격'],
        cap: 10,
        perDay: [2, 2],
        difficulty: 'advanced',
      },
      {
        name: '탑 포지션 컨트롤',
        blurb: '테이크다운 이후 상대를 눌러 제압하는 탑 포지션 컨트롤을 배웁니다.',
        categories: ['탑 포지션'],
        cap: 14,
        perDay: [3, 4],
        difficulty: 'intermediate',
      },
      {
        name: '바텀 포지션과 탈출',
        blurb: '눌린 상태에서 벗어나는 탈출 동작을 배웁니다.',
        categories: ['바텀 포지션', '탈출 (Escape)'],
        cap: 8,
        perDay: [2, 3],
        difficulty: 'intermediate',
      },
      {
        name: '리버설과 카운터',
        blurb: '상대의 공격을 역이용해 포지션을 뒤집는 리버설과 카운터를 배웁니다.',
        categories: ['리버설 (Reversal)', '리샷 / 카운터', '방어'],
        cap: 10,
        perDay: [3, 3],
        difficulty: 'advanced',
      },
    ],
    finalReviewRatio: 0.06,
    finalReviewRange: [3, 5],
  },

  'muay-thai': {
    title: '무에타이 추천 커리큘럼',
    description: '거리와 자세 개념부터 중거리 펀치, 킥과 니·엘보, 클린치, 방어와 카운터까지 이어지는 무에타이 학습 순서입니다.',
    reviewCadence: 6,
    phases: [
      {
        name: '기본 개념: 거리와 자세',
        blurb: '무에타이의 기본 자세와 4대 거리(장/중/근) 개념을 이해합니다.',
        categories: ['기본 개념 --- 거리(Range)와 자세'],
        perDay: [3, 3],
        difficulty: 'beginner',
      },
      {
        name: '중거리 펀치',
        blurb: '잽, 크로스 등 중거리에서의 기본 펀치를 배웁니다.',
        categories: ['중거리 펀치'],
        perDay: [3, 3],
        difficulty: 'beginner',
      },
      {
        name: '장거리 티프와 킥',
        blurb: '거리를 만드는 티프(푸시킥)와 라운드킥·로우킥 계열을 배웁니다.',
        categories: ['장거리 --- 티프 (Teep, ถีบ)', '장거리 킥 (Round Kick / Low Kick 계열)', '로우킥 (Low Kick)'],
        cap: 12,
        perDay: [3, 3],
        difficulty: 'intermediate',
      },
      {
        name: '니와 엘보',
        blurb: '무릎(니)과 팔꿈치(엘보) 타격을 배웁니다. 엘보는 부상 위험이 커 스파링에서는 반드시 보호장비와 지도자 감독이 필요합니다.',
        categories: ['니 (Khao, เข่า)', '엘보 (Sok, ศอก)'],
        cap: 11,
        perDay: [2, 2],
        difficulty: 'advanced',
      },
      {
        name: '클린치',
        blurb: '근거리에서 상대를 컨트롤하며 니를 치는 클린치를 배웁니다. 클린치는 목·척추에 부담을 줄 수 있어 파트너와 강도를 합의하고 연습해야 합니다.',
        categories: ['클린치 (Clinch)'],
        cap: 10,
        perDay: [2, 2],
        difficulty: 'advanced',
      },
      {
        name: '방어와 캐치',
        blurb: '킥 캐치, 펀치 방어, 킥 방어 등 상대의 공격에 대응하는 방법을 배웁니다.',
        categories: ['킥 캐치 / 방어', '펀치 방어', '킥 방어'],
        perDay: [3, 3],
        difficulty: 'intermediate',
      },
      {
        name: '카운터와 응용',
        blurb: '카운터 타이밍과 스피닝 기술 등 응용 기술을 다룹니다.',
        categories: ['카운터 종합', '스피닝 기술 모음'],
        perDay: [2, 2],
        difficulty: 'advanced',
      },
    ],
    finalReviewRatio: 0.08,
    finalReviewRange: [2, 3],
  },

  boxing: {
    title: '복싱 추천 커리큘럼',
    description: '기본 자세와 풋워크부터 기본 펀치, 방어, 거리 조절, 콤비네이션, 방어-공격 연결까지 이어지는 복싱 학습 순서입니다.',
    reviewCadence: 6,
    phases: [
      {
        name: '기본 자세와 풋워크',
        blurb: '복싱의 기본 스탠스와 풋워크를 익힙니다.',
        categories: ['기본 자세', '풋워크'],
        cap: 12,
        perDay: [3, 3],
        difficulty: 'beginner',
      },
      {
        name: '기본 펀치 개념',
        blurb: '잽, 크로스, 훅, 어퍼컷 등 기본 펀치를 배웁니다.',
        categories: ['기본 펀치', '특수 펀치'],
        cap: 12,
        perDay: [3, 3],
        difficulty: 'beginner',
      },
      {
        name: '기본 방어',
        blurb: '가드, 슬립, 롤 등 기본 방어 기술과 상대 펀치별 대응을 배웁니다.',
        categories: ['방어', '상대 펀치별 방어'],
        cap: 13,
        perDay: [3, 3],
        difficulty: 'beginner',
      },
      {
        name: '거리 조절',
        blurb: '거리별 포지션과 코너·로프 상황에서의 움직임을 배웁니다.',
        categories: ['거리별 포지션', '코너 / 로프 포지션'],
        cap: 10,
        perDay: [3, 3],
        difficulty: 'intermediate',
      },
      {
        name: '콤비네이션',
        blurb: '개별 펀치를 연결한 콤비네이션과 페인트를 배웁니다.',
        categories: ['조합', '페인트 (Feint)'],
        cap: 12,
        perDay: [3, 3],
        difficulty: 'intermediate',
      },
      {
        name: '방어에서 공격으로 연결',
        blurb: '카운터, 인파이팅, 클린치 등 방어 이후 곧바로 공격으로 전환하는 방법을 배웁니다.',
        categories: ['카운터', '근거리 / 인파이팅', '클린치'],
        cap: 12,
        perDay: [3, 3],
        difficulty: 'advanced',
      },
      {
        name: '상황별 응용',
        blurb: '링 제너럴십, 사우스포 상대 전술, 아마추어/프로 스코어링 차이 등 실전 응용을 다룹니다.',
        categories: [
          '링 제너럴십 (Ring Generalship)',
          '사우스포 vs 오소독스 매치업 전술',
          '아마추어(포인트) vs 프로 스코어링과 전술',
          '스타일별 분류와 전형적 기술 조합',
        ],
        perDay: [2, 2],
        difficulty: 'advanced',
      },
    ],
    finalReviewRatio: 0.07,
    finalReviewRange: [3, 4],
  },

  sambo: {
    title: '삼보 추천 커리큘럼',
    description: '기본 자세와 그립 파이팅부터 테이크다운, 던지기, 탑 포지션 컨트롤, 관절기까지 이어지는 삼보 학습 순서입니다.',
    reviewCadence: 5,
    phases: [
      {
        name: '기본 자세와 거리',
        blurb: '삼보의 기본 자세, 거리 개념, 균형을 무너뜨리는 원리를 이해합니다.',
        categories: ['기본 자세와 거리(Дистанция)', '균형 무너뜨리기(Выведение из равновесия)'],
        perDay: [2, 2],
        difficulty: 'beginner',
      },
      {
        name: '그립 파이팅',
        blurb: '삼보 특유의 재킷·벨트 그립 싸움을 배웁니다.',
        categories: ['그립 파이팅(Захват) --- 재킷·벨트 중심'],
        perDay: [2, 3],
        difficulty: 'beginner',
      },
      {
        name: '테이크다운 진입',
        blurb: '레슬링 계열 테이크다운 진입과 스탠딩에서 파르테르(바닥)로의 전환을 배웁니다.',
        categories: ['테이크다운 진입 (레슬링 계열)', '스탠딩 → 파르테르(Партер) 전환'],
        perDay: [2, 2],
        difficulty: 'intermediate',
      },
      {
        name: '다리 기술과 던지기',
        blurb: '포드쎗카(발쓸기)를 포함한 다리 기술과 허리·어깨를 이용한 던지기를 배웁니다. 던지기는 낙법 없이 연습하면 부상 위험이 커 매트와 지도자 감독이 반드시 필요합니다.',
        categories: [
          '다리 기술 --- 포드쎗카(Подсечка) 계열: 발쓸기(Sweep)',
          '다리 기술 --- 자쳅(Зацеп)·오트하바트(Отхват)·포드핫(Подхват)· 포드사드(Подсад)',
          '등으로 던지기 --- 브로속 체레즈 스피누(Бросок через спину)',
          '허리/몸통 던지기 --- 브로속 체레즈 베드로(Бросок через бедро)',
          '어깨·팔로 던지기 --- 멜니차(Мельница)와 베르투쉬카(Вертушка)',
          '희생 기술 --- 브로속 체레즈 골로부(Бросок через голову)· 체레즈 그루지(Бросок через грудь)',
        ],
        cap: 22,
        perDay: [2, 2],
        difficulty: 'advanced',
      },
      {
        name: '탑 포지션과 홀드다운',
        blurb: '테이크다운 이후 상대를 눌러 제압하는 홀드다운(우제르자니예)을 배웁니다.',
        categories: ['탑 포지션과 홀드다운 --- 우제르자니예(Удержание)'],
        perDay: [2, 2],
        difficulty: 'intermediate',
      },
      {
        name: '바텀 포지션과 전환',
        blurb: '눌린 상태에서 벗어나거나 스윕으로 전환하는 방법을 배웁니다.',
        categories: ['바텀 포지션과 탈출', '스윕 / 전환'],
        perDay: [2, 2],
        difficulty: 'intermediate',
      },
      {
        name: '관절기',
        blurb: '삼보의 강점인 상체·하체 관절기를 배웁니다. 관절기는 특히 부상 위험이 크므로 반드시 전문 지도자의 감독 아래 천천히, 파트너와 합의된 압력으로만 연습해야 합니다.',
        categories: [
          '상체 관절기 --- 뤄착(Рычаг)과 우젤(Узел)',
          '하체 관절기 --- 삼보의 전통적 강점',
        ],
        cap: 14,
        perDay: [2, 2],
        difficulty: 'advanced',
      },
      {
        name: '카운터와 컴뱃 삼보',
        blurb: '카운터 기술과, 타격이 포함된 컴뱃 삼보 룰의 기술을 다룹니다.',
        categories: [
          '카운터(Контрприем)',
          '컴뱃 삼보 타격 범주',
          '목/조르기 계열 --- 컴뱃 삼보 한정',
        ],
        perDay: [2, 2],
        difficulty: 'advanced',
      },
    ],
    finalReviewRatio: 0.08,
    finalReviewRange: [2, 3],
  },

  judo: {
    title: '유도 추천 커리큘럼',
    description: '기본 자세와 핵심 원리부터 그립, 손·발·허리기술, 던지기, 굳히기, 조르기·관절기, 카운터까지 이어지는 유도 학습 순서입니다.',
    reviewCadence: 6,
    phases: [
      {
        name: '기본 자세와 이동',
        blurb: '유도의 기본 자세(시젠혼타이)와 이동 방법을 익힙니다.',
        categories: ['기본 자세와 이동'],
        perDay: [3, 3],
        difficulty: 'beginner',
      },
      {
        name: '유도의 핵심 원리',
        blurb: '쿠즈시(무너뜨리기)·츠쿠리(만들기)·카케(걸기)라는 유도 던지기의 핵심 원리를 이해합니다.',
        categories: ['유도의 핵심 원리 --- Kuzushi · Tsukuri · Kake'],
        perDay: [2, 2],
        difficulty: 'beginner',
      },
      {
        name: '잡기(그립)',
        blurb: '쿠미카타, 도복을 잡는 기본 그립을 배웁니다.',
        categories: ['잡기 / 그립 --- Kumi Kata'],
        perDay: [3, 3],
        difficulty: 'beginner',
      },
      {
        name: '손기술',
        blurb: '손으로 상대를 들어 던지는 테와자 계열을 배웁니다.',
        categories: ['손기술 --- Te Waza'],
        cap: 11,
        perDay: [3, 3],
        difficulty: 'intermediate',
      },
      {
        name: '발기술',
        blurb: '다리를 이용해 상대의 균형을 무너뜨리는 아시와자 계열을 배웁니다.',
        categories: ['발기술 --- Ashi Waza'],
        cap: 10,
        perDay: [3, 3],
        difficulty: 'intermediate',
      },
      {
        name: '허리기술',
        blurb: '허리를 이용해 상대를 들어 던지는 코시와자 계열을 배웁니다. 낙법 없이 연습하면 부상 위험이 크므로 매트와 지도자 감독이 필요합니다.',
        categories: ['허리기술 --- Koshi Waza'],
        cap: 9,
        perDay: [3, 3],
        difficulty: 'advanced',
      },
      {
        name: '누우며 던지기',
        blurb: '스스로 누우면서 던지는 스테미와자 계열을 배웁니다.',
        categories: ['옆으로 누우며 던지기 --- Yoko Sutemi Waza', '바로 누우며 던지기 --- Ma Sutemi Waza'],
        cap: 11,
        perDay: [2, 3],
        difficulty: 'advanced',
      },
      {
        name: '연결과 변화 기술',
        blurb: '기술을 서로 연결하는 렌라쿠와자와 헨카와자를 배웁니다.',
        categories: ['연속·연결·변화 기술 --- Renraku Waza / Henka Waza'],
        cap: 8,
        perDay: [3, 3],
        difficulty: 'intermediate',
      },
      {
        name: '굳히기 (바닥 포지션)',
        blurb: '바닥에서 상대를 제압하는 오사에코미(굳히기)와 네와자 포지션을 배웁니다.',
        categories: ['네와자 / 바닥 포지션', '굳히기 --- Osaekomi Waza'],
        cap: 10,
        perDay: [3, 3],
        difficulty: 'intermediate',
      },
      {
        name: '조르기와 관절기',
        blurb: '시메와자(조르기)와 칸세츠와자(관절기)를 배웁니다. 조르기·관절기는 부상 위험이 매우 커 반드시 지도자의 감독과 파트너의 탭 신호 확인이 필요합니다.',
        categories: ['조르기 --- Shime Waza', '관절기 --- Kansetsu Waza'],
        cap: 11,
        perDay: [2, 2],
        difficulty: 'advanced',
      },
      {
        name: '탈출과 카운터',
        blurb: '불리한 상황에서 벗어나는 탈출과, 상대의 기술을 역이용하는 카에시와자(카운터)를 배웁니다.',
        categories: ['탈출', '카운터 --- Kaeshi Waza'],
        cap: 11,
        perDay: [3, 3],
        difficulty: 'advanced',
      },
    ],
    finalReviewRatio: 0.06,
    finalReviewRange: [3, 4],
  },

  kickboxing: {
    title: '킥복싱 추천 커리큘럼',
    description: '기본 개념과 규칙부터 스탠스, 펀치, 킥, 니·엘보, 클린치, 방어, 콤비네이션까지 이어지는 킥복싱 학습 순서입니다.',
    reviewCadence: 6,
    phases: [
      {
        name: '기본 개념과 규칙',
        blurb: '킥복싱의 기본 개념과 대회별(K-1, Glory 등) 규칙 차이를 이해합니다.',
        categories: ['기본 개념', '규칙 체계 (가장 먼저 알아야 할 것)'],
        perDay: [3, 3],
        difficulty: 'beginner',
      },
      {
        name: '스탠스와 풋워크',
        blurb: '기본 스탠스와 이동을 위한 풋워크를 배웁니다.',
        categories: ['스탠스', '풋워크'],
        cap: 11,
        perDay: [3, 3],
        difficulty: 'beginner',
      },
      {
        name: '기본 펀치',
        blurb: '잽, 크로스, 훅, 어퍼컷 등 기본 펀치를 배웁니다.',
        categories: ['펀치'],
        perDay: [3, 3],
        difficulty: 'beginner',
      },
      {
        name: '기본 킥',
        blurb: '로우킥부터 하이킥까지 기본 킥 기술을 배웁니다.',
        categories: ['킥'],
        cap: 11,
        perDay: [3, 3],
        difficulty: 'intermediate',
      },
      {
        name: '니와 엘보',
        blurb: '무릎과 팔꿈치 타격을 배웁니다. 엘보는 부상 위험이 커 스파링 시 보호장비와 지도자 감독이 필요합니다.',
        categories: ['니 (무릎)', '엘보'],
        cap: 9,
        perDay: [2, 2],
        difficulty: 'advanced',
      },
      {
        name: '클린치와 근거리',
        blurb: '근거리에서 상대를 컨트롤하는 클린치를 배웁니다.',
        categories: ['클린치 / 근거리 제어'],
        perDay: [3, 3],
        difficulty: 'intermediate',
      },
      {
        name: '방어',
        blurb: '가드, 슬립, 체크 등 방어 기술을 배웁니다.',
        categories: ['방어'],
        perDay: [3, 3],
        difficulty: 'intermediate',
      },
      {
        name: '콤비네이션과 페인트',
        blurb: '펀치와 킥을 연결한 대표적인 콤비네이션과 페인트를 배웁니다.',
        categories: ['대표적인 콤비네이션 (연결)', '페인트 (Feint)'],
        cap: 11,
        perDay: [3, 3],
        difficulty: 'advanced',
      },
      {
        name: '카운터와 전술',
        blurb: '카운터 타이밍, 포인트 스파링 전술, 규정을 다룹니다.',
        categories: ['카운터', '포인트 스파링 특유 전술', '테이크다운 방지 및 그래플링 브레이크 규정'],
        cap: 10,
        perDay: [3, 3],
        difficulty: 'advanced',
      },
    ],
    finalReviewRatio: 0.07,
    finalReviewRange: [3, 4],
  },

  taekwondo: {
    title: '태권도 추천 커리큘럼',
    description: '기본 서기와 이동부터 막기, 손기술, 발차기, 연결 기술, 품새, 호신술까지 이어지는 태권도 학습 순서입니다.',
    reviewCadence: 5,
    phases: [
      {
        name: '기본 서기와 자세',
        blurb: '태권도의 기본 서기 자세를 익힙니다.',
        categories: ['기본 서기 / 자세'],
        perDay: [2, 3],
        difficulty: 'beginner',
      },
      {
        name: '기본 이동',
        blurb: '자세를 유지하며 이동하는 풋워크를 배웁니다.',
        categories: ['이동 / 풋워크'],
        perDay: [2, 3],
        difficulty: 'beginner',
      },
      {
        name: '기본 막기와 손기술',
        blurb: '상대의 공격을 막는 막기와 손을 이용한 타격 기술을 배웁니다.',
        categories: ['막기', '손기술'],
        cap: 14,
        perDay: [2, 3],
        difficulty: 'beginner',
      },
      {
        name: '기본 발차기',
        blurb: '태권도의 핵심인 기본 발차기를 배웁니다.',
        categories: ['기본 발차기 (세부 명칭)', '발차기 표적 부위 분류'],
        perDay: [2, 2],
        difficulty: 'intermediate',
      },
      {
        name: '연결 기술',
        blurb: '발차기와 손기술을 연결한 콤비네이션을 배웁니다.',
        categories: ['연결 기술 (콤비네이션)'],
        perDay: [2, 2],
        difficulty: 'intermediate',
      },
      {
        name: '응용 발차기',
        blurb: '회전 발차기, 점프·공중 발차기, 겨루기용 발차기 등 응용 기술을 배웁니다.',
        categories: ['회전 발차기', '점프 / 공중 발차기', '겨루기 발차기 [WT 중심]', '거리별 전술'],
        cap: 14,
        perDay: [2, 2],
        difficulty: 'advanced',
      },
      {
        name: '품새',
        blurb: '정해진 동작 순서를 통해 기본기를 종합적으로 다지는 품새를 배웁니다.',
        categories: ['품새 (Poomsae / Tul)'],
        perDay: [2, 2],
        difficulty: 'intermediate',
      },
      {
        name: '호신술과 격파',
        blurb: '낙법을 포함한 호신술과 격파(격파술)를 배웁니다. 격파는 반드시 지도자의 지도와 알맞은 격파용 도구로만 연습해야 합니다.',
        categories: ['낙법과 호신술 [ITF 중심]', '격파 (Kyokpa)'],
        perDay: [2, 2],
        difficulty: 'advanced',
      },
    ],
    finalReviewRatio: 0.08,
    finalReviewRange: [2, 3],
  },
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

function loadTechniques(martialArt) {
  const file = path.join(PROCESSED_DIR, `${martialArt}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return data.techniques;
}

function assertCategoriesExist(martialArt, techniques, blueprint) {
  const realCategories = new Set(techniques.map((t) => t.category));
  for (const phase of blueprint.phases) {
    for (const cat of phase.categories) {
      if (!realCategories.has(cat)) {
        throw new Error(
          `[${martialArt}] phase "${phase.name}" references category "${cat}" which does not exist in data/processed/${martialArt}.json. ` +
            `Real categories: ${[...realCategories].join(' | ')}`
        );
      }
    }
  }
}

function selectPhasePool(techniques, phase) {
  const byId = new Map();
  for (const cat of phase.categories) {
    const items = techniques
      .filter((t) => t.category === cat)
      .slice() // preserve source-document order as the tiebreak
      .sort((a, b) => diffRank(a.difficulty) - diffRank(b.difficulty));
    for (const t of items) byId.set(t.id, t); // categories never overlap, but guard against accidental dup
  }
  const pool = [...byId.values()];
  return phase.cap ? pool.slice(0, phase.cap) : pool;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Distributes `pool` into day-sized chunks whose size cycles within
// [min,max] from phase.perDay — e.g. perDay [2,3] alternates 3,2,3,2... so a
// phase with an odd pool size doesn't leave a single straggler technique on
// its own final day.
function buildContentDays(pool, perDay) {
  const [min, max] = perDay;
  if (min === max) return chunk(pool, min);
  const days = [];
  let i = 0;
  let big = true;
  while (i < pool.length) {
    const size = big ? max : min;
    days.push(pool.slice(i, i + size));
    i += size;
    big = !big;
  }
  return days;
}

function buildCurriculum(martialArt, blueprint) {
  const techniques = loadTechniques(martialArt);
  assertCategoriesExist(martialArt, techniques, blueprint);

  const days = [];
  const phaseRanges = [];
  const introduced = []; // rolling list of {day, id} in generation order, for reviewTechniqueIds

  function pushDay(entry) {
    days.push(entry);
  }

  function recentReviewIds(excludeIds, count, sinceDaysBack = 10) {
    const cutoffDay = days.length - sinceDaysBack;
    const candidates = introduced
      .filter((x) => x.day >= Math.max(1, cutoffDay) && !excludeIds.has(x.id))
      .map((x) => x.id);
    // de-dup while keeping the most recent occurrences last-in-first-picked
    const uniq = [...new Set(candidates)];
    return uniq.slice(-count);
  }

  for (const phase of blueprint.phases) {
    const startDay = days.length + 1;
    const pool = selectPhasePool(techniques, phase);
    const contentDayGroups = buildContentDays(pool, phase.perDay);

    let sinceReview = 0;
    contentDayGroups.forEach((group, idx) => {
      const dayNum = days.length + 1;
      const excludeIds = new Set(group.map((t) => t.id));
      const reviewIds = dayNum === startDay ? [] : recentReviewIds(excludeIds, group.length >= 3 ? 1 : 2);
      for (const t of group) introduced.push({ day: dayNum, id: t.id });

      pushDay({
        day: dayNum,
        title: idx === 0 ? `${phase.name}: ${group.map(shortLabel).join(' · ')}` : group.map(shortLabel).join(' · '),
        description: `${phase.blurb} 오늘은 ${group.map((t) => t.name).join(', ')}을(를) 배웁니다.`,
        learningGoals: (() => {
          const used = new Set();
          return group.map((t) => learningGoalFor(t, used));
        })(),
        techniqueIds: group.map((t) => t.id),
        reviewTechniqueIds: reviewIds,
        difficulty: majorityDifficulty(group, phase.difficulty),
        estimatedMinutes: clamp(20 + 15 * group.length, 25, 75),
      });

      sinceReview++;
      if (blueprint.reviewCadence && sinceReview >= blueprint.reviewCadence && idx < contentDayGroups.length - 1) {
        const reviewSample = recentReviewIds(new Set(), 6, 999);
        pushDay({
          day: days.length + 1,
          title: `${phase.name} 복습`,
          description: `지금까지 배운 '${phase.name}' 관련 기술을 다시 점검하고 몸에 익힙니다.`,
          learningGoals: [`${phase.name} 구간에서 배운 기술들의 공통 원리를 스스로 설명할 수 있다.`],
          techniqueIds: [],
          reviewTechniqueIds: reviewSample,
          difficulty: phase.difficulty,
          estimatedMinutes: clamp(15 + 8 * reviewSample.length, 20, 45),
        });
        sinceReview = 0;
      }
    });

    phaseRanges.push({ name: phase.name, blurb: phase.blurb, startDay, endDay: days.length });
  }

  // Final integration/review block, sampling across every phase.
  const [minFinal, maxFinal] = blueprint.finalReviewRange;
  const finalDayCount = clamp(Math.round(days.length * blueprint.finalReviewRatio), minFinal, maxFinal);
  for (let i = 0; i < finalDayCount; i++) {
    const sample = [];
    for (const range of phaseRanges) {
      const idsInPhase = introduced.filter((x) => x.day >= range.startDay && x.day <= range.endDay).map((x) => x.id);
      if (idsInPhase.length) sample.push(idsInPhase[Math.floor((i / finalDayCount) * idsInPhase.length)]);
    }
    pushDay({
      day: days.length + 1,
      title: `종합 복습 ${i + 1}/${finalDayCount}`,
      description: '지금까지 배운 전체 과정을 종합적으로 복습하며 기술 사이의 연결과 흐름을 다시 정리합니다.',
      learningGoals: ['전체 커리큘럼에서 배운 핵심 기술들이 어떤 상황에서 서로 연결되는지 설명할 수 있다.'],
      techniqueIds: [],
      reviewTechniqueIds: [...new Set(sample)],
      difficulty: 'intermediate',
      estimatedMinutes: 30,
    });
  }

  const allTechniqueIds = new Set(techniques.map((t) => t.id));
  for (const day of days) {
    for (const id of [...day.techniqueIds, ...day.reviewTechniqueIds]) {
      if (!allTechniqueIds.has(id)) {
        throw new Error(`[${martialArt}] generated a techniqueId that does not exist in the real data: ${id}`);
      }
    }
  }

  return {
    id: `official__${martialArt}`,
    martialArt,
    title: blueprint.title,
    subtitle: 'Martialdex 추천 학습 순서',
    description: blueprint.description,
    source: 'official',
    visibility: 'public',
    authorName: 'Martialdex',
    totalDays: days.length,
    estimatedWeeks: Math.ceil(days.length / 4),
    phases: phaseRanges,
    days,
    techniqueCount: new Set(days.flatMap((d) => d.techniqueIds)).size,
  };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const summary = [];
  for (const [martialArt, blueprint] of Object.entries(BLUEPRINTS)) {
    const curriculum = buildCurriculum(martialArt, blueprint);
    fs.writeFileSync(
      path.join(OUT_DIR, `${martialArt}.json`),
      JSON.stringify(curriculum, null, 2) + '\n'
    );
    summary.push({
      martialArt,
      totalDays: curriculum.totalDays,
      techniqueCount: curriculum.techniqueCount,
      phases: curriculum.phases.length,
    });
    console.log(
      `✓ ${martialArt}: ${curriculum.totalDays} days, ${curriculum.techniqueCount} techniques, ${curriculum.phases.length} phases`
    );
  }
  fs.writeFileSync(path.join(OUT_DIR, '_summary.json'), JSON.stringify(summary, null, 2) + '\n');
}

main();
