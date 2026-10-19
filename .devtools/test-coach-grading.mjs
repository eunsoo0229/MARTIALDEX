// 자체 AI 코치 결정론적 채점 — 실제 학생 답변 예시(정답·오답·부분·부정·동의어·짧은 답)
// on real MARTIALDEX data (data/processed + data/curated/posture.json). No AI, no browser.
// Each case states what a coach would accept; the grader must not mark a wrong
// answer correct, and should not mark a correctly reworded answer wrong.
// Run: node .devtools/test-coach-grading.mjs
// (GRADER=<path to an evidenceGrader.ts> runs the same cases on another grader version — used to report before/after.)
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-grading-'));
const out = path.join(dir, 'g.mjs');
const entry = path.join(dir, 'entry.ts');
const grader = process.env.GRADER ? path.resolve(process.env.GRADER) : path.join(APP, 'src/lib/coachLesson/evidenceGrader.ts');
fs.writeFileSync(
  entry,
  [
    `export * from ${JSON.stringify(grader)};`,
    `export { buildConcepts, keyPointsReference } from ${JSON.stringify(path.join(APP, 'src/lib/coachLesson/concepts.ts'))};`,
    `export { buildScenarios } from ${JSON.stringify(path.join(APP, 'src/lib/coachLesson/scenario.ts'))};`,
  ].join('\n')
);
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const G = await import(pathToFileURL(out).href);

const posture = JSON.parse(fs.readFileSync(path.join(APP, 'data/curated/posture.json'), 'utf8'));
function technique(art, id) {
  const arr = JSON.parse(fs.readFileSync(path.join(APP, `data/processed/${art}.json`), 'utf8'));
  const list = Array.isArray(arr) ? arr : arr.techniques ?? Object.values(arr);
  const t = list.find((x) => x && x.id === id);
  if (!t) throw new Error(`missing ${id}`);
  return { ...t, videos: [], posture: posture[id] };
}
const T = {
  armbar: technique('bjj', 'bjj__armbar'),
  jab: technique('boxing', 'boxing__jab'),
  doubleLeg: technique('wrestling', 'wrestling__basic-double-leg'),
  rnc: technique('bjj', 'bjj__rear-naked-choke'),
  kimura: technique('bjj', 'bjj__kimura'),
  triangle: technique('bjj', 'bjj__triangle-choke'),
  cross: technique('boxing', 'boxing__cross'),
  lowKick: technique('kickboxing', 'kickboxing__low-kick'),
  osoto: technique('judo', 'judo__osoto-gari'),
  highSingle: technique('wrestling', 'wrestling__high-single'),
  leadHook: technique('boxing', 'boxing__lead-hook'),
};
// Korean names the data itself uses for these techniques (posture overview subject) — not answer content.
const NAMES = { armbar: ['암바'], jab: ['잽'], doubleLeg: ['더블 레그 테이크다운'], rnc: ['리어 네이키드 초크'], kimura: ['키무라'], triangle: ['트라이앵글 초크'], cross: ['크로스'], lowKick: ['로우킥'], osoto: ['오소토가리'], highSingle: ['하이 싱글'], leadHook: ['리드 훅'] };

function grade(key, conceptId, questionType, answer) {
  const t = T[key];
  const concepts = G.buildConcepts(t, { maxKeyPoints: 4 });
  const names = [t.name, ...NAMES[key]];
  const base = { mistakes: t.posture?.commonMistakes ?? [], points: t.posture?.keyPoints ?? [], names, questionType, answer };
  if (conceptId === 'review') return G.gradeByEvidence({ ...base, concept: null, reference: G.keyPointsReference(t) });
  if (conceptId.startsWith('scenario:')) {
    const s = G.buildScenarios(t).find((x) => x.id === conceptId.slice(9));
    return G.gradeByEvidence({ ...base, concept: null, scenario: s, reference: `${s.answer} (${s.why})` });
  }
  const c = concepts.find((x) => x.id === conceptId);
  if (!c) throw new Error(`no concept ${conceptId}`);
  return G.gradeByEvidence({ ...base, concept: c, reference: c.reference });
}

// expect: U = understood · notU = anything but understood · P = partial · C = asserted a documented mistake · notC = not judged a mistake
const CASES = [
  // ---- Armbar · kp-0 "다리를 상대 머리 위로 완전히 넘기기" (mistake: …넘기지 못해 탈출 공간을 허용함)
  ['armbar', 'kp-0', 'explain', '다리를 상대 머리 위로 완전히 넘겨야 해요', 'U', '원문과 거의 같은 정답'],
  ['armbar', 'kp-0', 'explain', '상대 머리 위로 다리를 끝까지 넘겨요', 'U', '어순·어미가 다른 정답'],
  ['armbar', 'kp-0', 'explain', '다리를 머리 위로 넘겨서 상대가 빠져나갈 공간을 없애요', 'U', '이유까지 붙인 정답 (실수와 단어가 겹쳐도 실수 아님)'],
  ['armbar', 'kp-0', 'explain', '다리요', 'notU', '한 단어 답'],
  ['armbar', 'kp-0', 'explain', '다리를 잘 써요', 'notU', '핵심 하나만 겹치는 막연한 답'],
  ['armbar', 'kp-0', 'explain', '주먹으로 상대 턱을 세게 쳐요', 'notU', '무관한 오답'],
  ['armbar', 'kp-0', 'explain', '다리는 머리 위로 안 넘겨도 돼요', 'C', '핵심 동작을 하지 않겠다는 답 = 흔한 실수'],
  ['armbar', 'kp-0', 'why', '안 넘기면 상대가 탈출할 공간이 생겨서요', 'U', '"왜?"에 놓쳤을 때의 결과로 답함'],
  ['armbar', 'kp-0', 'why', '다리를 완전히 넘겨야 상대가 못 빠져나가니까요', 'U', '"왜?"에 핵심 동작으로 답함'],
  ['armbar', 'kp-0', 'why', '그냥 중요해서요', 'notU', '"왜?"에 내용 없는 답'],
  ['armbar', 'kp-0', 'scenario', '다리를 머리 위로 넘겨야 상대가 빠져나갈 공간이 없어져요', 'notC', '실수 상황에서 고칠 점을 말함 (1차 구현에서 실수로 오판)'],
  // ---- Armbar · kp-1 "무릎을 좁게 조여 팔이 빠지지 않게 하기" (mistake: 무릎을 조이지 않아 …빠져나감)
  ['armbar', 'kp-1', 'explain', '무릎을 꽉 조여서 팔이 안 빠지게 해요', 'U', '활용형 다른 정답'],
  ['armbar', 'kp-1', 'explain', '무릎을 좁혀서 상대 팔이 못 빠져나가게 해요', 'U', '동의 표현(좁혀) 정답'],
  ['armbar', 'kp-1', 'explain', '무릎 조이기요', 'U', '짧지만 핵심 두 요소를 모두 말한 답'],
  ['armbar', 'kp-1', 'explain', '다리 넘기기랑 무릎 조이기요', 'U', '두 핵심을 함께 말함 (1차 구현에서 실수로 오판)'],
  ['armbar', 'kp-1', 'explain', '무릎이요', 'notU', '한 단어 답'],
  ['armbar', 'kp-1', 'explain', '무릎은 안 조여도 괜찮아요', 'C', '핵심 동작을 하지 않겠다는 답'],
  ['armbar', 'kp-1', 'explain', '엄지손가락을 위로 돌려요', 'notU', '다른 핵심 포인트를 말함'],
  ['armbar', 'scenario:bjj__armbar:mistake-1', 'scenario', '무릎을 더 좁게 조여야 해요', 'U', '실수 상황에서 고칠 점'],
  // ---- Armbar · kp-2 "고관절을 들어 올려 압박 만들기" (mistake: 고관절을 들지 않고 팔로만 당겨 압박이 약해짐)
  ['armbar', 'kp-2', 'explain', '엉덩이를 들어 올려서 압박해요', 'U', '동의어(엉덩이=고관절)'],
  ['armbar', 'kp-2', 'explain', '골반을 위로 들어서 압박을 줘요', 'U', '동의어(골반=고관절)'],
  ['armbar', 'kp-2', 'explain', '팔로만 당겨서 압박하면 돼요', 'C', '흔한 실수 그대로'],
  ['armbar', 'kp-2', 'explain', '고관절은 신경 쓰지 말고 팔로만 당겨서 압박해요', 'C', '다른 대상을 부정하고 실수를 주장 (1차 구현의 알려진 한계)'],
  ['armbar', 'kp-2', 'explain', '팔로만 당기지 말고 고관절을 들어 올려요', 'U', '실수를 부정하고 정답을 말함'],
  ['armbar', 'kp-2', 'explain', '고관절을 들지 않으면 압박이 약해져요', 'notC', '결과를 설명하는 조건문'],
  // ---- Armbar · 기술 설명
  ['armbar', 'purpose', 'explain', '상대 팔을 다리 사이에 끼우고 엉덩이를 들어서 팔꿈치를 꺾는 관절기요', 'U', '자기 말로 한 기술 설명'],
  ['armbar', 'purpose', 'explain', '클로즈드 가드에서 다리로 목을 조르는 기술이에요', 'notU', '다른 기술(트라이앵글류) 설명'],
  ['armbar', 'purpose', 'explain', '암바는 좋은 기술이에요', 'notU', '기술 이름만 말함'],
  // ---- Jab · kp-0 "반대 손 가드를 끝까지 유지하기" / kp-1 "타격 후 손을 즉시 회수하기"
  ['jab', 'kp-0', 'explain', '안 치는 반대손은 가드를 계속 올리고 있어요', 'U', '동의 표현(계속=끝까지·유지)'],
  ['jab', 'kp-0', 'explain', '반대 손 가드 내리지 않기', 'U', '부정형으로 말한 정답'],
  ['jab', 'kp-0', 'explain', '반대 손은 내려도 괜찮아요', 'notU', '실수에 가까운 답'],
  ['jab', 'kp-0', 'explain', '발을 넓게 벌려요', 'notU', '무관한 답'],
  ['jab', 'kp-1', 'explain', '치고 나서 바로 손을 거둬들여요', 'U', '동의 표현(바로=즉시, 거둬=회수)'],
  ['jab', 'kp-1', 'explain', '펀치 후에 손을 빨리 되돌려요', 'U', '동의 표현(빨리=즉시, 되돌=회수)'],
  ['jab', 'kp-1', 'explain', '손이요', 'notU', '한 단어 답'],
  ['jab', 'kp-1', 'explain', '치고 나서 손은 천천히 회수해도 돼요', 'notU', '실수(늦게 회수)에 가까운 답'],
  // ---- Double Leg · kp-0 "등을 곧게 펴 허리 부상 방지하기" / kp-1 "머리를 상대 몸통 중앙에 붙이기"
  ['doubleLeg', 'kp-0', 'explain', '등을 곧게 펴서 허리 안 다치게 해요', 'U', '한 글자 신체 부위(등)와 동의어(다치=부상)'],
  ['doubleLeg', 'kp-0', 'explain', '허리요', 'notU', '한 단어 답'],
  ['doubleLeg', 'kp-1', 'explain', '머리를 상대 몸 가운데에 딱 붙여요', 'U', '동의어(가운데=중앙), 활용형(붙여)'],
  ['doubleLeg', 'kp-1', 'explain', '머리를 바깥쪽으로 빼요', 'notU', '실수 방향의 답'],
  // ---- 영상·실습 확인 (any of the key points)
  ['armbar', 'review', 'explain', '무릎 조이는 거요', 'U', '핵심 포인트 중 하나를 말함'],
  ['armbar', 'review', 'explain', '열심히 했어요', 'notU', '내용 없는 답'],
  // ---- Kimura · kp-1 "팔을 등 뒤로 정확한 각도로 회전시키기"
  // (처음엔 notU로 적었으나 "회전=돌리"를 같은 뜻으로 등록한 뒤 U로 판단을 바꿈 — 방향+회전은 맞고 "정확한 각도"만 없음)
  ['kimura', 'kp-1', 'explain', '상대 팔을 등 뒤쪽으로 돌려요', 'U', '방향·회전은 맞고 각도 표현만 없음'],
  ['kimura', 'kp-1', 'explain', '상대 팔을 꽉 잡아요', 'notU', '회전·방향 없음'],
  ['kimura', 'kp-1', 'explain', '팔을 등 뒤로 정확한 각도로 회전시켜요', 'U', '정답'],

  // ---- 검증용(held-out): 채점 규칙을 맞출 때 쓰지 않은 기술 — 규칙 조정 전에 먼저 작성한 답변
  ['triangle', 'kp-0', 'explain', '다리를 목 깊게 넘겨서 졸라요', 'U', '활용형 정답'],
  ['triangle', 'kp-0', 'explain', '다리는 얕게 걸어도 돼요', 'notU', '실수에 가까운 답'],
  ['triangle', 'kp-0', 'explain', '목을 졸라요', 'notU', '막연한 답'],
  ['cross', 'kp-0', 'explain', '하체를 돌려서 그 힘을 팔로 보내요', 'U', '동의 표현(돌려=회전)'],
  ['cross', 'kp-0', 'explain', '팔 힘만으로 세게 뻗어요', 'notU', '흔한 실수 그대로'],
  ['lowKick', 'kp-0', 'explain', '정강이로 정확하게 차요', 'U', '핵심만 짧게 (자료 문장에 "감각 기르기" 같은 군더더기가 있음)'],
  ['lowKick', 'kp-0', 'explain', '발등으로 차요', 'notU', '흔한 실수'],
  ['osoto', 'kp-0', 'explain', '다리를 쭉 펴서 크게 휘둘러요', 'U', '한 음절 어간 활용형(펴서/펴고, 휘둘러/휘두르)'],
  ['osoto', 'kp-0', 'explain', '상대 다리를 걸어요', 'notU', '막연한 답'],
  ['highSingle', 'kp-0', 'explain', '허벅지를 내 몸에 꽉 붙여서 안 놓쳐요', 'U', '동의 표현(붙여=밀착)'],
  ['highSingle', 'kp-0', 'explain', '다리를 잡아요', 'notU', '막연한 답'],
  ['leadHook', 'kp-0', 'explain', '앞발을 돌리면서 힘을 시작해요', 'U', '동의 표현(돌리=회전)'],
  ['leadHook', 'kp-0', 'explain', '발은 그냥 두고 팔만 휘둘러요', 'C', '흔한 실수(발 회전 없이 팔만 휘두름)'],
  ['leadHook', 'kp-0', 'explain', '주먹을 세게 쥐어요', 'notU', '무관한 답'],
];

const results = [];
for (const [key, concept, qt, answer, expect, note] of CASES) {
  const g = grade(key, concept, qt, answer);
  const pass =
    expect === 'U' ? g.verdict === 'understood' :
    expect === 'notU' ? g.verdict !== 'understood' :
    expect === 'P' ? g.verdict === 'partial' :
    expect === 'C' ? g.coverage === 'contradicted' :
    expect === 'notC' ? g.coverage !== 'contradicted' : false;
  results.push({ pass, key, concept, expect, answer });
  console.log(`${pass ? 'PASS' : 'FAIL'} — [${key} ${concept} ${qt}] ${expect} "${answer}" → ${g.verdict}/${g.coverage}${g.contradiction ? ` (실수: ${g.contradiction})` : ''} · ${note}`);
}

// ---- not evaluable: too little data to build an answer element → never full marks
{
  const thin = { id: 'kp-x', label: '짧음', importance: 'core', explain: '', variants: [], reference: '빠름', keywords: ['빠름'], questions: {}, choice: null };
  const g = G.gradeByEvidence({ concept: thin, reference: thin.reference, mistakes: [], answer: '빠름이 중요해요 빠름 빠름' });
  const pass = g.coverage === 'not_evaluable' && g.verdict !== 'understood';
  results.push({ pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — 자료로 정답 요소를 만들 수 없으면 평가 불가, 만점 아님 → ${g.verdict}/${g.coverage}`);
}

const wrongAccepted = results.filter((r) => !r.pass && (r.expect === 'notU' || r.expect === 'C'));
const rightRejected = results.filter((r) => !r.pass && (r.expect === 'U' || r.expect === 'notC'));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed · 오답을 정답/비실수로 처리: ${wrongAccepted.length} · 맞는 답을 오답/실수로 처리: ${rightRejected.length}`);
process.exit(failed.length ? 1 : 0);
