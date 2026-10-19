// 사용자 콤보·셋업 — offline tests of the pure logic: purpose tags, interest
// profile + 맞춤 추천, period/latest/least orderings, similar combos, and the
// on-device favorites/interest stores. Run: node .devtools/test-shared-combos.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-combos-'));
fs.writeFileSync(path.join(dir, 'entry.ts'), ['purpose', 'ranking', 'localStores'].map((m) => `export * from ${JSON.stringify(path.join(APP, 'src/lib/sharedCombo', m + '.ts'))};`).join('\n'));
await build({ entryPoints: [path.join(dir, 'entry.ts')], bundle: true, format: 'esm', platform: 'node', outfile: path.join(dir, 'out.mjs'), logLevel: 'error' });

// minimal browser globals for localStores
const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };
globalThis.dispatchEvent = () => true;
const S = await import(pathToFileURL(path.join(dir, 'out.mjs')).href);

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail !== '' ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : ''));
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const DAY = 86400000;
const NOW = Date.parse('2026-10-15T12:00:00+09:00');

// ---------------- purpose tags
const t1 = S.derivePurposeTags({ purpose: '잽을 맞추기 위한 셋업' });
check('[P1] "잽을 맞추기 위한 셋업" → 타격 적중 + 잽', t1.includes('strike_setup') && t1.includes('tech:jab'), t1);
const t2 = S.derivePurposeTags({ purpose: '테이크다운을 위한 셋업' });
check('[P2] "테이크다운을 위한 셋업" → 테이크다운', t2.includes('takedown') && !t2.includes('strike_setup'), t2);
const t3 = S.derivePurposeTags({ purpose: 'Jab to land the cross' });
check('[P3] 영어 목적도 같은 태그 (Jab to land the cross → 타격 적중 + 잽 + 크로스)', t3.includes('strike_setup') && t3.includes('tech:jab') && t3.includes('tech:cross'), t3);
const t4 = S.derivePurposeTags({ purpose: '상대 압박을 받아치는 카운터', stepNames: ['Slip', 'Hook'] });
check('[P4] 카운터·압박 + 마지막 기술(훅)', t4.includes('counter') && t4.includes('pressure') && t4.includes('tech:hook'), t4);
check('[P5] 목적 칩은 의도 태그만 순서대로', eq(S.intentTags(['tech:jab', 'takedown', 'strike_setup']), ['strike_setup', 'takedown']) && S.tagLabel('takedown') === '테이크다운');

// ---------------- fixtures
let seq = 0;
function combo(o) {
  seq++;
  const tags = S.derivePurposeTags({ purpose: o.purpose, stepNames: o.steps });
  return {
    id: o.id ?? `c${seq}`,
    authorId: 'u1',
    authorNickname: 'A',
    kind: o.kind ?? 'combo',
    name: o.name ?? `콤보${seq}`,
    purpose: o.purpose,
    purposeTags: tags,
    description: '',
    martialArt: o.art ?? 'boxing',
    steps: (o.steps ?? ['Jab']).map((n, i) => ({ techniqueId: (o.ids ?? [])[i] ?? `t:${n.toLowerCase()}`, name: n, martialArt: o.art ?? 'boxing' })),
    techniqueIds: (o.steps ?? ['Jab']).map((n, i) => (o.ids ?? [])[i] ?? `t:${n.toLowerCase()}`),
    sourceRef: null,
    likeCount: o.likes ?? 0,
    createdAt: new Date(NOW - (o.ageDays ?? 1) * DAY).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
  };
}
const A = combo({ id: 'jabSetup', kind: 'setup', purpose: '잽을 맞추기 위한 셋업', steps: ['Feint', 'Jab'], likes: 2, ageDays: 20 });
const B = combo({ id: 'tdSetup', kind: 'setup', purpose: '테이크다운을 위한 셋업', steps: ['Jab', 'Level Change', 'Double Leg'], art: 'wrestling', likes: 30, ageDays: 40 });
const C = combo({ id: 'jabSetup2', kind: 'setup', purpose: '잽을 확실히 꽂아 넣는 셋업', steps: ['Step In', 'Jab'], likes: 0, ageDays: 3 });
const D = combo({ id: 'tdSetup2', kind: 'setup', purpose: '싱글 레그 테이크다운 셋업', steps: ['Jab', 'Single Leg'], art: 'wrestling', likes: 5, ageDays: 2 });
const E = combo({ id: 'popular', purpose: '압박해서 코너로 모는 콤보', steps: ['Jab', 'Cross', 'Hook'], likes: 50, ageDays: 300 });
const all = [A, B, C, D, E];

// ---------------- 맞춤 추천
const cold = S.rankCombos(all, 'recommended', { now: NOW, events: [] });
check('[R1] 기록이 없으면 인기·최신 기반 (하트 많은 콤보가 위)', cold[0].combo.id === 'popular' && cold.every((r) => r.reason === null), cold.map((r) => r.combo.id));
const takedownViews = [B, D, B].map((c, i) => ({ type: 'view', comboId: c.id, kind: c.kind, purposeTags: c.purposeTags, techniqueIds: c.techniqueIds, martialArt: c.martialArt, at: NOW - i * 3600000 }));
const warm = S.rankCombos(all, 'recommended', { now: NOW, events: takedownViews });
check('[R2] 테이크다운 셋업을 계속 보면 → 테이크다운 셋업이 맨 위', ['tdSetup', 'tdSetup2'].includes(warm[0].combo.id) && ['tdSetup', 'tdSetup2'].includes(warm[1].combo.id), warm.map((r) => r.combo.id));
check('[R3] 추천 이유 표시 ("테이크다운" 셋업과)', /'테이크다운' 셋업과 비슷합니다/.test(warm[0].reason ?? ''), warm[0].reason);
const jabLikes = [A, C].map((c) => ({ type: 'like', comboId: c.id, kind: c.kind, purposeTags: c.purposeTags, techniqueIds: c.techniqueIds, martialArt: c.martialArt, at: NOW }));
const shifted = S.rankCombos(all, 'recommended', { now: NOW, events: [...takedownViews.map((e) => ({ ...e, at: NOW - 40 * DAY })), ...jabLikes] });
const shiftedScores = S.recommend(all, [...takedownViews.map((e) => ({ ...e, at: NOW - 40 * DAY })), ...jabLikes], NOW).map((r) => [r.combo.id, +r.score.toFixed(3)]);
check('[R4] 관심이 바뀌면(최근 잽 셋업에 하트) 잽 셋업이 위로 — 오래된 관심은 감쇠', ['jabSetup', 'jabSetup2'].includes(shifted[0].combo.id), shiftedScores);
const p = S.buildInterestProfile([{ type: 'view', comboId: 'x', kind: 'combo', purposeTags: ['takedown'], techniqueIds: [], martialArt: null, at: NOW - 14 * DAY }], NOW);
check(`[R5] 관심 감쇠: ${S.INTEREST_HALF_LIFE_DAYS}일 지나면 절반`, Math.abs(p.tags.get('takedown') - 0.5) < 1e-9, p.tags.get('takedown'));
const manyViews = Array.from({ length: 4 }, (_, i) => ({ type: 'view', comboId: 'tdSetup', kind: 'setup', purposeTags: B.purposeTags, techniqueIds: B.techniqueIds, martialArt: 'wrestling', at: NOW - i * 60000 }));
const seen = S.rankCombos(all, 'recommended', { now: NOW, events: manyViews });
check('[R6] 같은 콤보를 여러 번 봤으면 비슷한 새 콤보가 그보다 위 (같은 것만 반복 안 함)', seen.findIndex((r) => r.combo.id === 'tdSetup2') < seen.findIndex((r) => r.combo.id === 'tdSetup'), seen.map((r) => r.combo.id));

// ---------------- 기간·최신·하트 적은 순
const pl = new Map([['jabSetup2', 4], ['tdSetup2', 1]]);
const week = S.rankCombos(all, 'week', { now: NOW, periodLikes: pl });
check('[S1] 이번 주 인기: 이번 주에 받은 하트 순 (역대 하트가 많아도 이번 주 0이면 뒤)', eq(week.slice(0, 2).map((r) => [r.combo.id, r.hearts]), [['jabSetup2', 4], ['tdSetup2', 1]]) && week[2].combo.id === 'popular', week.map((r) => [r.combo.id, r.hearts]));
const allTime = S.rankCombos(all, 'all', { now: NOW });
check('[S2] 역대 인기: 총 하트 순', eq(allTime.map((r) => r.combo.id), ['popular', 'tdSetup', 'tdSetup2', 'jabSetup', 'jabSetup2']));
const latest = S.rankCombos(all, 'latest', { now: NOW });
check('[S3] 최신순', eq(latest.map((r) => r.combo.id), ['tdSetup2', 'jabSetup2', 'jabSetup', 'tdSetup', 'popular']));
const least = S.rankCombos(all, 'least', { now: NOW });
check('[S4] 하트 적은 순 (같으면 최신)', eq(least.map((r) => r.combo.id), ['jabSetup2', 'jabSetup', 'tdSetup2', 'tdSetup', 'popular']));
const now = new Date('2026-10-15T15:00:00'); // Thursday
check('[S5] 기간 시작: 이번 주 = 월요일 0시, 이번 달 = 1일, 올해 = 1월 1일', S.periodStart('week', now).getDate() === 12 && S.periodStart('week', now).getDay() === 1 && S.periodStart('month', now).getDate() === 1 && S.periodStart('year', now).getMonth() === 0, [S.periodStart('week', now).toString(), S.periodStart('month', now).toString()]);
const sunday = new Date('2026-10-18T10:00:00');
check('[S6] 일요일도 같은 주(월요일 시작)', S.periodStart('week', sunday).getDate() === 12);

// ---------------- 관련 추천
const sim = S.similarCombos(A, all);
check('[M1] 관련 추천: 잽 셋업 → 다른 잽 셋업이 1순위, 자기 자신 제외', sim[0].combo.id === 'jabSetup2' && !sim.some((x) => x.combo.id === 'jabSetup'), sim.map((x) => [x.combo.id, +x.score.toFixed(2)]));
const simB = S.similarCombos(B, all);
check('[M2] 테이크다운 셋업 → 다른 테이크다운 셋업 1순위', simB[0].combo.id === 'tdSetup2', simB.map((x) => x.combo.id));
const lone = combo({ id: 'lone', purpose: '스윕', steps: ['Hip Bump Sweep'], art: 'bjj', kind: 'combo' });
check('[M3] 비슷한 게 없으면 억지로 추천하지 않음', S.similarCombos(lone, all).length === 0, S.similarCombos(lone, all).map((x) => x.combo.id));

// ---------------- favorites & interest store
check('[F1] 즐겨찾기 추가 → 목록에 스냅샷 저장', S.toggleFavoriteCombo(A) === true && S.isFavoriteCombo('jabSetup') && S.listFavoriteCombos()[0].stepNames.join(',') === 'Feint,Jab');
check('[F2] 즐겨찾기는 관심 기록에도 반영(가중치 4)', S.listInterestEvents().some((e) => e.type === 'favorite' && e.comboId === 'jabSetup') && S.EVENT_WEIGHT.favorite === 4);
check('[F3] 다시 누르면 해제', S.toggleFavoriteCombo(A) === false && !S.isFavoriteCombo('jabSetup'));
S.recordInterest('view', B, NOW);
S.recordInterest('view', B, NOW + 60000);
check('[F4] 같은 콤보를 10분 안에 다시 열면 1번만 기록', S.listInterestEvents().filter((e) => e.type === 'view' && e.comboId === 'tdSetup').length === 1);
for (let i = 0; i < 320; i++) S.recordInterest('like', { ...B, id: `x${i}` }, NOW + i);
check('[F5] 관심 기록은 최근 300개까지만 보관', S.listInterestEvents().length === 300);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
