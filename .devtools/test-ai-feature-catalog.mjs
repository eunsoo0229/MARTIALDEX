// AI 코치 탭 = MARTIALDEX의 모든 AI 기능 — coverage guard (offline).
//  1. Every src/lib module that calls the AI (aiProvider / Gemini JSON helpers /
//     the chat hook / transcription) must belong to a catalog feature, except
//     the shared transport/helpers themselves.
//  2. Every catalog link must be a real route in App.tsx.
//  3. The header has no separate "AI" menu, and AI-only screens are not
//     listed in other menus.
// Run: node .devtools/test-ai-feature-catalog.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-catalog-')), 'catalog.mjs');
await build({ entryPoints: [path.join(APP, 'src/lib/aiCoach/aiFeatureCatalog.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const C = await import(pathToFileURL(out).href);

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name + (detail !== '' ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''));
}

// Shared plumbing, not a feature of its own.
const INFRA = new Set(['ai/provider', 'ai/types', 'ai/context', 'ai/chatStore', 'ai/systemInstruction', 'fighterStyle/geminiJson', 'userTechniques/geminiJson', 'aiHistory/types', 'webSearch/provider', 'webSearch/expandedSearch', 'aiCoach/aiFeatureCatalog' /* the catalog itself names these modules */]);
const AI_CALL = /\b(aiProvider\.ask|askGeminiForJson|askGeminiForJsonWithGrounding|useAiChat|transcribeWav)\b/;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));
}
const libRoot = path.join(APP, 'src/lib');
const callers = walk(libRoot)
  .filter((f) => AI_CALL.test(fs.readFileSync(f, 'utf8')))
  .map((f) => path.relative(libRoot, f).replace(/\.tsx?$/, ''))
  .filter((m) => !INFRA.has(m));
const covered = new Set(C.AI_FEATURES.flatMap((f) => f.modules));
const missing = callers.filter((m) => !covered.has(m));
check(`[1] AI를 호출하는 모든 모듈(${callers.length}개)이 AI 코치 탭 기능에 포함`, missing.length === 0, missing.length ? { missing } : callers.join(', '));
const stale = [...covered].filter((m) => !fs.existsSync(path.join(libRoot, `${m}.ts`)) && !fs.existsSync(path.join(libRoot, `${m}.tsx`)));
check('[1b] 카탈로그가 가리키는 모듈은 모두 실제로 존재', stale.length === 0, stale);

const app = fs.readFileSync(path.join(APP, 'src/App.tsx'), 'utf8');
const routes = [...app.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
const bad = C.AI_FEATURES.filter((f) => !routes.includes(f.to.split('?')[0]));
check(`[2] 카탈로그의 모든 링크(${C.AI_FEATURES.length}개)가 실제 라우트`, bad.length === 0, bad.map((f) => f.to));
const ids = C.AI_FEATURES.map((f) => f.id);
check('[2b] 기능 id 중복 없음, 모든 기능이 분류에 속함', new Set(ids).size === ids.length && C.AI_FEATURES.every((f) => C.AI_GROUP_ORDER.includes(f.group)));
check('[2c] 기존 QA가 쓰는 진입 카드 test id 유지', ['oneoff-entry', 'coach-class-entry', 'visual-mitt-entry'].every((t) => C.AI_FEATURES.some((f) => f.testId === t)));

const header = fs.readFileSync(path.join(APP, 'src/components/Header.tsx'), 'utf8');
check('[3] 헤더에 별도 "AI" 메뉴 그룹 없음', !/label: 'AI',/.test(header));
const aiOnly = C.AI_COACH_PATHS.filter((p) => p !== '/coach');
const stillInMenus = aiOnly.filter((p) => header.includes(`to: '${p}'`));
check('[3b] AI 전용 화면은 다른 메뉴에 중복 노출되지 않음 (AI 코치 탭으로 일원화)', stillInMenus.length === 0, stillInMenus);
check('[3c] AI 화면에서 상단 "AI 코치"가 활성 표시', C.isAiCoachPath('/ai-combo') && C.isAiCoachPath('/sparring/abc') && !C.isAiCoachPath('/sparring/record') && !C.isAiCoachPath('/nutrition'));

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
