// 자체 AI 코치 기술명 검색 — 한국어·영어 이름, 데이터에서 확인한 한국어 이름, 동명 기술 선택,
// 비슷한 이름 비확정, 기술 ID·기록 불변. Real MARTIALDEX data, no AI, no browser.
// Run: node .devtools/test-coach-names.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { viteGlobPlugin } from './lib/viteGlobPlugin.mjs';

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-names-'));
const out = path.join(dir, 'n.mjs');
const entry = path.join(dir, 'entry.ts');
const mod = (p) => JSON.stringify(path.join(APP, p));
fs.writeFileSync(
  entry,
  [
    `export * from ${mod('src/lib/coachKnowledge/lookup.ts')};`,
    `export * from ${mod('src/lib/coachKnowledge/koreanNames.ts')};`,
    `export { buildLocalOneOffLesson } from ${mod('src/lib/coachLesson/oneOff.ts')};`,
    `export { getUnifiedAllTechniques, resolveTechnique } from ${mod('src/lib/userTechniques/service.ts')};`,
  ].join('\n')
);
// browser globals the data modules touch at import time
const mem = new Map();
globalThis.window = {
  localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) },
  dispatchEvent: () => true,
  addEventListener() {},
  removeEventListener() {},
  setTimeout: () => 0,
  clearTimeout() {},
  location: { href: 'http://localhost/', search: '', hash: '' },
  matchMedia: () => ({ matches: false, addEventListener() {} }),
};
globalThis.localStorage = window.localStorage;
globalThis.CustomEvent ??= class { constructor(t) { this.type = t; } };
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error', define: { 'import.meta.env': '{}' }, plugins: [viteGlobPlugin] });
const K = await import(pathToFileURL(out).href);

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''));
}
const idOf = (q, art = null) => {
  const r = K.lookupTechnique({ query: q, martialArt: art });
  return r.status === 'found' ? r.technique.id : r.status;
};

// snapshot of the records BEFORE the name index is built (ids / names must not change)
const before = new Map(K.getUnifiedAllTechniques().map((t) => [t.id, JSON.stringify([t.name, t.koreanName, t.aliases])]));

// ---- 1. Korean and English names of the same technique resolve to the same id
const pairs = [
  ['Armbar', '암바', 'bjj__armbar'],
  ['Rear Naked Choke', '리어 네이키드 초크', 'bjj__rear-naked-choke'],
  ['Kimura', '키무라', 'bjj__kimura'],
  ['Jab', '잽', 'kickboxing__jab'],
  ['Triangle Choke', '트라이앵글 초크', 'bjj__triangle-choke'],
  ['Osoto Gari', '오소토가리', 'judo__osoto-gari'],
  ['Guillotine', '길로틴', 'bjj__guillotine'],
];
for (const [en, ko, id] of pairs) {
  const a = idOf(en);
  const b = idOf(ko);
  check(`[1] "${en}"와 "${ko}"가 같은 기술(${id})로 검색됨`, a === id && b === id, { en: a, ko: b });
}
check('[1b] 병합된 같은 기술의 다른 이름(주지가타메·십자 굳히기·Juji Gatame)도 Armbar로', ['주지가타메', '십자 굳히기', 'Juji Gatame'].every((q) => idOf(q) === 'bjj__armbar'), ['주지가타메', '십자 굳히기', 'Juji Gatame'].map((q) => idOf(q)));
check('[1c] 공식 별칭(extraAliases "더블 레그")은 그대로 동작', idOf('더블 레그') === 'wrestling__basic-double-leg' && idOf('Double Leg') === 'wrestling__basic-double-leg');
check('[1d] 조사가 붙은 요청 문장에서도 정확한 이름만 찾음 ("오늘 암바를 배우고 싶어")', JSON.stringify(K.exactTechniquesInText('오늘 암바를 배우고 싶어').matches.map((t) => t.id)) === '["bjj__armbar"]');

// ---- 2. only verifiable names: no guessed spellings, no descriptions, no other technique's name
check('[2] 데이터에 없는 표기("기무라" — 자료는 "키무라")는 추측해서 매핑하지 않음', idOf('기무라') === 'not_found');
check('[2b] 개요가 다른 기술로 시작하는 기록("Mount": "마운트에서의 암바는…")은 그 이름을 얻지 않음', K.overviewSubject('마운트에서의 암바는 상대의 팔을 고립시키는 기술입니다.') === null && !K.namesOf(K.resolveTechnique('bjj__mount')).includes('암바'), K.namesOf(K.resolveTechnique('bjj__mount')));
check('[2c] 개요 주어가 영어 이름의 음역일 때만 이름으로 인정 (암바~Armbar ○, 암바~Kimura ×)', K.soundsLike('암바', 'Armbar') && K.soundsLike('리어 네이키드 초크', 'Rear Naked Choke') && !K.soundsLike('암바', 'Kimura') && !K.soundsLike('더블 레그 테이크다운', 'Basic Double Leg'));
const entry1 = K.lookupTechnique({ query: '암바 엔트리' });
check('[2d] 비슷한 이름("암바 엔트리")을 Armbar로 확정하지 않음', !(entry1.status === 'found' && entry1.technique.id === 'bjj__armbar'), { status: entry1.status, id: entry1.technique?.id });

// ---- 3. several techniques with one name → the student picks
const feint = K.lookupTechnique({ query: '페인트' });
check('[3] 무술마다 따로 있는 같은 이름("페인트")은 "ambiguous" + 후보 목록 (자동 선택 없음)', feint.status === 'ambiguous' && feint.candidates.length >= 2, feint.candidates?.map((c) => c.techniqueId));
check('[3b] 무술을 정하면 하나로 확정 (복싱 페인트)', idOf('페인트', 'boxing') === 'boxing__feint', idOf('페인트', 'boxing'));
const rnc = K.exactTechniquesInText('리어 네이키드 초크 배우고 싶어요');
check('[3c] 긴 이름을 먼저 찾아, 그 안의 단어("리어")를 다른 기술로 따로 잡지 않음', JSON.stringify(rnc.matches.map((t) => t.id)) === '["bjj__rear-naked-choke"]' && rnc.ambiguous.length === 0, { m: rnc.matches.map((t) => t.id), a: rnc.ambiguous });

// ---- 4. the one-off lesson (자체 AI 코치) uses it
const l1 = K.buildLocalOneOffLesson('오늘 암바 배우고 싶어', null);
check('[4] 1회성 수업: "암바" 요청 → Armbar 수업 (이전에는 DB에 없음으로 거절)', l1.ok && l1.lesson.techniqueId === 'bjj__armbar', l1.ok ? l1.lesson.techniqueId : l1.message);
const l2 = K.buildLocalOneOffLesson('페인트 배우고 싶어', null);
check('[4b] 1회성 수업: 동명 기술이 여러 개면 CHOOSE_TECHNIQUE + 후보', !l2.ok && l2.code === 'CHOOSE_TECHNIQUE' && (l2.candidates?.length ?? 0) >= 2, { code: l2.code, n: l2.candidates?.length });
const l3 = K.buildLocalOneOffLesson('페인트 배우고 싶어', null, { techniqueId: l2.candidates?.[0]?.techniqueId });
check('[4c] 1회성 수업: 학생이 고른 후보로 수업 생성', l3.ok && l3.lesson.techniqueId === l2.candidates?.[0]?.techniqueId, l3.ok ? l3.lesson.techniqueId : l3.message);
const l4 = K.buildLocalOneOffLesson('기무라 배우고 싶어', null);
check('[4d] 1회성 수업: 확인되지 않는 이름은 거절, 후보는 자동 확정하지 않음', !l4.ok && l4.code === 'NOT_IN_DB', { code: l4.code });

// ---- 5. ids / records unchanged
const after = new Map(K.getUnifiedAllTechniques().map((t) => [t.id, JSON.stringify([t.name, t.koreanName, t.aliases])]));
const changed = [...before].filter(([id, v]) => after.get(id) !== v).map(([id]) => id);
check('[5] 이름 색인을 만든 뒤에도 기술 ID·이름·별칭 기록은 그대로 (조회 전용)', before.size === after.size && changed.length === 0, changed.slice(0, 5));
check('[5b] 이전 ID로 저장된 기록은 계속 같은 기술로 (judo__juji-gatame → Armbar)', K.resolveTechnique('judo__juji-gatame')?.id === 'bjj__armbar');

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
