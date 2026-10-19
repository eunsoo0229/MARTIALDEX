// Gi / No-Gi research for newly added techniques — offline unit tests of
// src/lib/grappling/analyzeNewTechnique.ts with fake search / AI.
// Run: node .devtools/test-new-technique-gi-nogi.mjs
import path from 'node:path';
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ginogi-new-')), 'a.mjs');
await build({ entryPoints: [path.join(APP, 'src/lib/grappling/analyzeNewTechnique.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error', external: ['../webSearch/provider', '../userTechniques/geminiJson'] });
const A = await import(pathToFileURL(out).href);

const results = [];
const check = (n, p, d = '') => (results.push(p), console.log((p ? 'PASS' : 'FAIL') + ' — ' + n + (d !== '' ? ' :: ' + JSON.stringify(d).slice(0, 300) : '')));
const T = (o) => ({ id: 'bjj__x', name: 'Coyote Guard Rollover Sweep', koreanName: '코요테 가드 롤오버 스윕', martialArt: 'bjj', category: '스윕', positions: [], description: '코요테 가드에서 굴러 스윕', posture: { overview: '하프 가드 변형인 코요테 가드에서 굴러 넘깁니다.' }, relatedMartialArts: [], ...o });
const WEB = { ok: true, results: [{ title: 'Coyote guard gi vs no-gi', url: 'https://example.org/a', snippet: 'In the gi grab the sleeve and pants; in no-gi use an underhook and wrist control.' }, { title: 'Other', url: 'https://example.org/b', snippet: 'unrelated' }] };
const posture = (g) => ({ grips: g, steps: ['단계 하나입니다.', '단계 둘입니다.', '단계 셋입니다.'], keyPoints: ['포인트입니다.'], safety: '주의합니다.' });
const ai = (data, extra = {}) => async (p) => ((ai.last = p), { ok: true, data, groundingSources: [], usedSearchGrounding: !!p.useSearchGrounding, webSearchQueries: [], ...extra });
const good = { classification: 'both_differs', confidence: 'high', reason: 'r', difference: 'Gi는 소매와 바지를 잡고, No-Gi는 언더훅과 손목 컨트롤로 굴립니다.', sourceIds: ['S1'], gi: posture('소매와 바지를 잡습니다.'), noGi: posture('언더훅을 겁니다.') };

check('[대상] 주짓수 기술은 대상', A.isGiNoGiTarget(T()));
check('[대상] 복싱 기술은 대상 아님', !A.isGiNoGiTarget(T({ martialArt: 'boxing', category: '펀치' })));
check('[대상] MMA 타격은 대상 아님 / MMA 테이크다운은 대상', !A.isGiNoGiTarget(T({ martialArt: 'mixed-martial-arts', category: '펀치' })) && A.isGiNoGiTarget(T({ martialArt: 'mixed-martial-arts', category: '테이크다운' })));
check('[대상] 삼보 타격 분류는 대상 아님', !A.isGiNoGiTarget(T({ martialArt: 'sambo', category: '컴뱃 삼보 타격 범주' })));

let r = await A.analyzeGiNoGi(T(), { search: async () => WEB, askJson: ai(good) });
check('[공통] 근거 인용 + 구체적 차이 → 공통(차이 있음), ai_web_sources', r.classification === 'both_differs' && r.method === 'ai_web_sources', r);
check('[공통] 인용한 자료만 출처로 (S1만)', r.sources.length === 1 && r.sources[0].url === 'https://example.org/a', r.sources);
check('[공통] Gi·No-Gi 자세 각각 저장, 상태 ai_researched', r.postures.gi?.grips.includes('소매') && r.postures.noGi?.grips.includes('언더훅') && r.postures.gi.status === 'ai_researched');
check('[공통] 두 스타일 모두 적용 가능', r.gi.applicable === true && r.noGi.applicable === true);
check('[공통] AI에 웹 자료를 넘기고 검색 그라운딩은 쓰지 않음', ai.last.contextText.includes('[S1]') && !ai.last.useSearchGrounding);

r = await A.analyzeGiNoGi(T(), { search: async () => WEB, askJson: ai({ ...good, difference: '도복 그립 체계가 추가됩니다.' }) });
check('[검증] 막연한 차이 → 판단 보류(ai_rejected), 자세 없음', r.classification === 'undecided' && r.method === 'ai_rejected' && !r.postures.gi && !r.postures.noGi, r.reason);
r = await A.analyzeGiNoGi(T(), { search: async () => WEB, askJson: ai({ ...good, sourceIds: [] }) });
check('[검증] 근거 인용 없음 → 판단 보류', r.classification === 'undecided' && r.method === 'ai_rejected');
r = await A.analyzeGiNoGi(T(), { search: async () => WEB, askJson: ai({ ...good, confidence: 'low' }) });
check('[검증] 확신도 low → 판단 보류', r.classification === 'undecided' && /확신도/.test(r.reason));
r = await A.analyzeGiNoGi(T(), { search: async () => WEB, askJson: ai({ ...good, gi: { grips: '소매', steps: ['하나'] } }) });
check('[검증] 단계 2개 미만인 스타일 자세는 저장 안 함 (지어내지 않음)', !r.postures.gi && !!r.postures.noGi);
r = await A.analyzeGiNoGi(T(), { search: async () => WEB, askJson: ai({ classification: 'gi_centric', confidence: 'high', sourceIds: ['S1'], reason: '깃 그립 필수' }) });
check('[Gi 중심] No-Gi 적용 불가로 표시', r.classification === 'gi_centric' && r.noGi.applicable === false && r.gi.applicable === true);
r = await A.analyzeGiNoGi(T(), { search: async () => ({ ok: false, code: 'RATE_LIMIT', message: 'x' }), askJson: ai({ classification: 'same', confidence: 'medium', reason: '같음' }, { groundingSources: [{ title: 'G', uri: 'https://g.example/1' }] }) });
check('[검색 실패] Google 검색 그라운딩으로 대체, 출처는 그라운딩 자료', ai.last.useSearchGrounding === true && r.method === 'ai_grounded' && r.sources[0].url === 'https://g.example/1' && r.classification === 'same');
r = await A.analyzeGiNoGi(T(), { search: async () => ({ ok: false, code: 'RATE_LIMIT', message: 'x' }), askJson: async () => ({ ok: false, code: 'RATE_LIMIT', message: 'x' }) });
check('[AI 실패] 조사 전(pending) + 다시 조사 안내', r.method === 'pending' && r.classification === 'undecided' && /다시 조사/.test(r.reason));
r = await A.analyzeGiNoGi(T(), { search: async () => ({ ok: true, results: [{ title: 'Coyote Sweep', url: 'https://example.org/c', snippet: 'Establish an underhook, trap the leg and roll them over.' }] }), askJson: ai({ classification: 'same', confidence: 'high', sourceIds: ['S1'], reason: '같음' }) });
check('[검증] Gi/No-Gi를 언급하지 않는 자료로 "동일" 판정 불가 → 판단 보류', r.classification === 'undecided' && r.method === 'ai_rejected' && /직접 다루지/.test(r.reason), r.reason);
const kept = await A.withGiNoGi(T({ giNoGi: { method: 'user' } }), { search: async () => WEB, askJson: ai(good) });
check('[보존] 이미 있는 Gi/No-Gi 기록은 덮어쓰지 않음', kept.giNoGi.method === 'user');
const boxing = await A.withGiNoGi(T({ martialArt: 'boxing', category: '펀치' }), { search: async () => WEB, askJson: ai(good) });
check('[보존] 그래플링이 아니면 기술 그대로', !('giNoGi' in boxing));
const added = await A.withGiNoGi(T(), { search: async () => WEB, askJson: ai(good) });
check('[추가] 그래플링 기술에는 giNoGi가 붙음 (id 그대로)', added.giNoGi?.classification === 'both_differs' && added.id === 'bjj__x');

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
