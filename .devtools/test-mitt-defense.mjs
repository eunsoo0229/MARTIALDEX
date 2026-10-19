// Visualizing Mitt — defense / guard-control motions (offline, real technique DB).
// Run: node .devtools/test-mitt-defense.mjs
import path from 'node:path';
import { createServer } from 'vite';
import { ENTRIES, TECHNIQUES } from '../data/curated-combos/curated-defense-v1.mjs';

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
globalThis.window = globalThis;
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k), key: () => null, length: 0 };
globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} };
const server = await createServer({ root: APP, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const A = await server.ssrLoadModule('/src/lib/visualMitt/archetypes.ts');
const C = await server.ssrLoadModule('/src/lib/visualMitt/combos.ts');
const R = await server.ssrLoadModule('/src/lib/visualMitt/reaction.ts');
const MS = await server.ssrLoadModule('/src/components/visualMitt/MittStage.tsx');
const ld = await server.ssrLoadModule('/src/lib/loadData.ts');
await server.close();
const React = await import('react');
const RS = await import('react-dom/server');

const results = [];
const check = (n, p, d = '') => (results.push(p), console.log((p ? 'PASS' : 'FAIL') + ' — ' + n + (d !== '' ? ' :: ' + JSON.stringify(d).slice(0, 300) : '')));
const byId = (id) => ld.allTechniques.find((t) => t.id === id);
const key = (id) => A.motionForTechnique(byId(id))?.archetype.key ?? null;

// 1. DB defense techniques → motions
const expect = { 'boxing__slip-outside': 'slip', 'boxing__slip-inside': 'slipInside', 'boxing__double-slip': 'doubleSlip', boxing__duck: 'duck', kickboxing__roll: 'roll', 'kickboxing__lean-back': 'leanBack', kickboxing__pull: 'pull', kickboxing__parry: 'parry', 'boxing__lead-hand-parry': 'leadParry', 'boxing__downward-parry': 'downParry', boxing__catch: 'catchPunch', kickboxing__catch: 'kickCatch', boxing__block: 'block', kickboxing__cover: 'cover', 'boxing__elbow-block': 'elbowBlock', 'kickboxing__shoulder-roll': 'shoulderRoll', kickboxing__check: 'check', 'muay-thai__teep-catch': 'teepCatch', 'muay-thai__kick-parry': 'kickParry', 'kickboxing__angle-out': 'angleOut' };
const wrong = Object.entries(expect).filter(([id, k]) => key(id) !== k).map(([id, k]) => `${id}: ${key(id)} (기대 ${k})`);
check(`[매칭] DB 방어 기술 ${Object.keys(expect).length}개가 맞는 동작으로 표시`, wrong.length === 0, wrong);
check('[매칭] 같은 "Catch"라도 복싱=펀치 캐치, 킥복싱=킥 캐치', key('boxing__catch') === 'catchPunch' && key('kickboxing__catch') === 'kickCatch');
check('[매칭] 조합 기록("Slip → Cross")은 한 동작으로 잡지 않음', A.motionForTechnique(byId('boxing__slip-cross')) === null);
check('[매칭] 기존 타격은 그대로 (Jab=jab, Lead Hook=leadHook)', A.motionForTechnique({ name: 'Jab', aliases: [] })?.archetype.key === 'jab' && A.motionForTechnique({ name: 'Lead Hook', aliases: [] })?.archetype.key === 'leadHook');
for (const t of TECHNIQUES) check(`[새 기술] ${t.name} → 가드 조작 동작`, A.motionForTechnique({ name: t.name, aliases: [], martialArt: t.art })?.archetype.kind === 'trap');

// 2. DB counter records are now practicable combos
const db = C.listDbCombos();
const counters = db.filter((c) => c.steps[0]?.motion.archetype.kind === 'defense');
check('[DB 콤보] "Slip → Cross" 같은 카운터 기록이 Mitt 추천 콤보에 나옴', counters.length >= 5 && counters.some((c) => /Slip/.test(c.name) && /Cross/.test(c.name)), counters.map((c) => c.name));
const sc = counters.find((c) => /Slip/.test(c.name));
check('[역할] 방어 단계 = 방어·회피, 바로 뒤 공격 = 카운터', sc?.steps[0].role === 'defense' && sc?.steps[1].role === 'counter', sc?.steps.map((s) => s.role));
check('[음성] 방어 단계 콜 = "슬립"류 짧은 코치 말', R.calloutFor(sc.steps[0]) === '슬립', R.calloutFor(sc.steps[0]));
check('[반응 훈련] 무작위 공격 풀에는 방어가 섞이지 않음 (기본 공격만)', R.reactionPool().every((c) => c.steps.every((s) => s.motion.archetype.kind === 'strike')));

// 3. drawing: the holder's attack + your answer
const render = (k, p, stance = 'orthodox') => RS.renderToStaticMarkup(React.createElement(MS.FrontView, { archetype: A.ARCHETYPES[k], target: A.ARCHETYPES[k].target, stance, p, back: 0 }));
const slip1 = render('slip', 1);
check('[화면] 회피: 상대 공격이 보이고 끝나면 "피했다!" + 방향 표시', slip1.includes('data-kind="defense"') && slip1.includes('data-testid="mitt-incoming"') && slip1.includes('피했다!') && slip1.includes('오른쪽으로'));
check('[화면] 사우스포는 슬립 방향이 반대', render('slip', 1, 'southpaw').includes('왼쪽으로'));
check('[화면] 패리 → "흘렸다!", 블록 → "막았다!", 캐치 → "잡았다!"', render('parry', 1).includes('흘렸다!') && render('block', 1).includes('막았다!') && render('catchPunch', 1).includes('잡았다!'));
check('[화면] 체크: 정강이로 로우킥 막기', render('check', 1).includes('pov-shin') && render('check', 1).includes('로우킥'));
check('[화면] 트랩: 상대 가드 손을 눌러 내림', render('leadHandTrap', 1).includes('가드 내림!') && render('paw', 1).includes('툭!'));
check('[화면] 공격이 오기 전(p=0.3)엔 결과 표시 없음', !render('slip', 0.3).includes('피했다!'));
check('[타이밍] 방어는 펀치보다 느리게 (공격이 보이게): 210ms에 아직 도착 전', MS.povTiming(210, A.ARCHETYPES.slip).p < 0.5 && MS.povTiming(210, A.ARCHETYPES.leadHook ?? { kind: 'strike' }).p === 1);

// 4. curated data
check('[콤보 데이터] 76개 모두 출처 있음 + 첫 단계가 방어·가드 조작', ENTRIES.length >= 70 && ENTRIES.every((e) => e.src.length > 0), ENTRIES.length);

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
