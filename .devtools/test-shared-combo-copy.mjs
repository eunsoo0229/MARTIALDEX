// ☆ 저장 on someone else's shared combo/setup → copy in MY 콤보 북 → usable in Visualizing Mitt.
// Offline, real modules + real library. Run: node .devtools/test-shared-combo-copy.mjs
import path from 'node:path';
import { createServer } from 'vite';

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear(), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; } };
globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} };
if (typeof globalThis.dispatchEvent !== 'function') { const et = new EventTarget(); globalThis.dispatchEvent = (e) => et.dispatchEvent(e); globalThis.addEventListener = (...a) => et.addEventListener(...a); globalThis.removeEventListener = (...a) => et.removeEventListener(...a); }
const server = await createServer({ root: APP, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const C = await server.ssrLoadModule('/src/lib/sharedCombo/myComboCopy.ts');
const L = await server.ssrLoadModule('/src/lib/sharedCombo/localStores.ts');
const CB = await server.ssrLoadModule('/src/lib/combo/service.ts');
const M = await server.ssrLoadModule('/src/lib/visualMitt/combos.ts');
const U = await server.ssrLoadModule('/src/lib/userTechniques/service.ts');
await server.close();

const results = [];
const check = (n, p, d = '') => (results.push(p), console.log((p ? 'PASS' : 'FAIL') + ' — ' + n + (d !== '' ? ' :: ' + JSON.stringify(d).slice(0, 300) : '')));
const jab = U.resolveTechnique('boxing__jab'), cross = U.resolveTechnique('boxing__cross'), hook = U.resolveTechnique('boxing__lead-hook') ?? U.resolveTechnique('boxing__hook');
const shared = (o = {}) => ({ id: 'sc_1', authorId: 'u_other', authorNickname: '복서김', kind: 'combo', name: '원투훅', purpose: '거리 좁히기', purposeTags: [], description: '', martialArt: 'boxing', steps: [jab, cross, hook].map((t) => ({ techniqueId: t.id, name: t.name, martialArt: 'boxing' })), techniqueIds: [jab.id, cross.id, hook.id], sourceRef: 'combo:someone-elses', likeCount: 3, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...o });

// 1. star → copy
let r = C.toggleFavoriteWithCopy(shared(), 'u_me');
const copy = C.findSharedCopy('sc_1');
check('[저장] ☆ → 즐겨찾기 + 내 콤보 북에 사본', r.on && r.copy.status === 'saved' && L.isFavoriteCombo('sc_1') && CB.listMyCombos().some((c) => c.id === copy.id), r.copy.status);
check('[저장] 사본은 실제 기술 id 그대로, 원본과 연결 (sharedMeta)', copy.techniqueIds.join() === [jab.id, cross.id, hook.id].join() && copy.sharedMeta.sharedComboId === 'sc_1' && copy.sharedMeta.authorNickname === '복서김');
const mitt = M.listBookCombos().find((c) => c.id === copy.id);
check('[Mitt] Visualizing Mitt 콤보 목록에 표시, 출처 "공유받은 콤보 · by 복서김"', !!mitt && mitt.sourceLabel === '공유받은 콤보 · by 복서김' && mitt.steps.length === 3, mitt && { label: mitt.sourceLabel, steps: mitt.steps.length });
check('[Mitt] id로 불러오기(연습 링크) 가능', M.resolveMittCombo(copy.id)?.steps.length === 3);

// 2. no duplicates
r = C.saveSharedToMyCombos(shared(), 'u_me');
check('[중복] 같은 공유 콤보를 다시 저장해도 사본은 1개', r.status === 'exists' && CB.listMyCombos().filter((c) => c.sharedMeta?.sharedComboId === 'sc_1').length === 1);

// 3. un-star removes the untouched copy; an edited copy stays
r = C.toggleFavoriteWithCopy(shared(), 'u_me');
check('[해제] ☆ 해제 → 편집 안 한 사본은 콤보 북에서도 삭제', !r.on && r.removed && !C.findSharedCopy('sc_1'));
C.toggleFavoriteWithCopy(shared(), 'u_me');
await new Promise((res) => setTimeout(res, 5));
CB.updateCombo(C.findSharedCopy('sc_1'), { name: '내가 고친 원투훅' });
r = C.toggleFavoriteWithCopy(shared(), 'u_me');
check('[해제] 사용자가 편집한 사본은 해제해도 남김', !r.on && !r.removed && C.findSharedCopy('sc_1')?.name === '내가 고친 원투훅');

// 4. own combos are not copied
r = C.saveSharedToMyCombos(shared({ id: 'sc_mine', authorId: 'u_me' }), 'u_me');
check('[내 것] 내가 공유한 콤보는 사본을 만들지 않음 (작성자 = 나)', r.status === 'own' && !C.findSharedCopy('sc_mine'));
const mine = CB.createCombo({ name: '내 콤보', description: '', techniqueIds: [jab.id, cross.id] });
r = C.saveSharedToMyCombos(shared({ id: 'sc_mine2', sourceRef: `combo:${mine.id}` }), null);
check('[내 것] 로그아웃 상태라도 내 콤보 북에서 공유한 것이면 사본 안 만듦', r.status === 'own');

// 5. unresolvable steps
r = C.saveSharedToMyCombos(shared({ id: 'sc_part', steps: [{ techniqueId: jab.id, name: jab.name, martialArt: 'boxing' }, { techniqueId: 'user__secret-move', name: '작성자 비밀 기술', martialArt: 'boxing' }, { techniqueId: cross.id, name: cross.name, martialArt: 'boxing' }] }), 'u_me');
check('[누락] 내 라이브러리에 없는 단계는 빼고 이름을 기록 (지어내지 않음)', r.status === 'saved' && r.combo.techniqueIds.length === 2 && r.combo.sharedMeta.missingSteps.join() === '작성자 비밀 기술');
r = C.toggleFavoriteWithCopy(shared({ id: 'sc_none', steps: [{ techniqueId: 'user__x', name: 'X', martialArt: null }] }), 'u_me');
check('[누락] 풀 수 있는 단계가 하나도 없으면 즐겨찾기만 하고 사본은 안 만듦', r.on && r.copy.status === 'no_steps' && !C.findSharedCopy('sc_none'));

// 6. setup → reactions reach Mitt
r = C.saveSharedToMyCombos(shared({ id: 'sc_setup', kind: 'setup', name: '잽 페인트 셋업', steps: [{ techniqueId: jab.id, name: jab.name, martialArt: 'boxing', note: '짧게', opponentReaction: '가드를 올린다' }, { techniqueId: cross.id, name: cross.name, martialArt: 'boxing' }] }), 'u_me');
const ms = M.resolveMittCombo(r.combo.id);
check('[셋업] 셋업 사본의 예상 반응·메모가 Mitt 단계에 전달', ms.sourceLabel.startsWith('공유받은 셋업') && ms.steps[0].opponentReaction === '가드를 올린다' && ms.steps[0].note === '짧게' && !ms.steps[1].opponentReaction, ms.steps.map((s) => [s.technique.name, s.opponentReaction ?? null]));

// 7. favorites page removal path
L.removeFavoriteCombo('sc_setup');
check('[즐겨찾기 화면] 해제 시 사본도 정리 (removeSharedCopy)', C.removeSharedCopy('sc_setup') && !C.findSharedCopy('sc_setup'));

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
