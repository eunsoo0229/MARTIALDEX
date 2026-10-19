// 미트 훈련 전 콤보 영상 — offline checks of the combo-video rules.
// Run: node .devtools/test-combo-videos.mjs
import path from 'node:path';
import { createServer } from 'vite';

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
globalThis.window = globalThis;
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k), key: () => null, length: 0 };
globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} };
const server = await createServer({ root: APP, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const LV = await server.ssrLoadModule('/src/lib/coachLesson/lessonVideos.ts');
const CV = await server.ssrLoadModule('/src/lib/visualMitt/comboVideos.ts');
const U = await server.ssrLoadModule('/src/lib/userTechniques/service.ts');
await server.close();

const results = [];
const check = (n, p, d = '') => (results.push(p), console.log((p ? 'PASS' : 'FAIL') + ' — ' + n + (d !== '' ? ' :: ' + JSON.stringify(d).slice(0, 300) : '')));
const names = [['Jab', '잽'], ['Cross', '크로스'], ['Lead Hook', 'Left Hook']];
check('[이름] 설명에 Jab·Cross·Left Hook → 3개', LV.mentionHits({ title: 'Boxing combo', description: 'Throw the jab, then the cross, finish with a left hook.', keywords: [] }, names) === 3);
check('[이름] 잽 영상(Jab만) → 1개 (콤보 영상 아님)', LV.mentionHits({ title: 'How to throw a perfect jab', description: 'jab tips for beginners', keywords: [] }, names) === 1);
check('[이름] 단어 일부만 겹치면 인정 안 함 (crossfit ≠ cross)', LV.mentionHits({ title: 'Crossfit jabber', description: 'crossfit workout', keywords: [] }, names) === 0);
check('[이름] 한국어 이름·키워드도 인정', LV.mentionHits({ title: '복싱 콤보', description: '', keywords: ['잽', '크로스'] }, names) === 2);

// search failure → honest error, cached errors are retried
const jab = U.resolveTechnique('boxing__jab'), cross = U.resolveTechnique('boxing__cross');
const failing = async () => ({ ok: false, code: 'NETWORK', message: '네트워크 오류' });
let r = await CV.findComboVideos([jab, cross], { comboName: '원투', search: failing });
check('[검색 실패] 영상 검색 실패는 error로 알림 (영상 지어내지 않음)', r.status === 'error' && r.videos.length === 0, r);
check('[검색 실패] 실패 결과는 캐시하지 않음 (다음에 다시 검색)', CV.cachedComboVideos([jab, cross]) === null);
let calls = [];
const empty = async (q) => (calls.push(q), { ok: true, results: [] });
r = await CV.findComboVideos([jab, cross], { comboName: '원투', search: empty });
check('[검색어] 콤보는 기술 이름 순서대로 검색', calls[0].startsWith('Jab Cross') && calls.some((q) => q.includes('Jab to Cross')), calls);
check('[결과 없음] 검색 결과 0개 → none + 안내', r.status === 'none' && /검색 결과가 없었습니다/.test(r.message));
calls = [];
await CV.findComboVideos([jab, cross], { comboName: '원투', search: empty });
check('[캐시] 같은 콤보는 다시 검색하지 않음', calls.length === 0);

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
