// Writes docs/TECHNIQUE_MARTIAL_ART_MATRIX_AUDIT.md — the full technique ×
// martial-art audit report — from:
//   data/audit/matrix-before.json              relations before the audit decisions
//   data/audit/technique-martial-art-matrix.json  every pair now (run audit-technique-art-matrix.mjs first)
//   data/audit/technique-art-decisions.json    judged pairs (add / none / review) with evidence
//   data/audit/technique-identity-checks.json  automatic identity checks (patterns B–E)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const before = new Set(read('data/audit/matrix-before.json').linked);
const matrix = read('data/audit/technique-martial-art-matrix.json');
const decisions = read('data/audit/technique-art-decisions.json').decisions;
const identity = read('data/audit/technique-identity-checks.json');
const canon = read('data/curated/technique-canonical.json');
const sources = read('data/audit/external-sources.json');
const ARTS = matrix.arts;
const ko = (a) => ARTS.find((x) => x.id === a)?.nameKo ?? a;
const after = new Set(matrix.rows.filter((r) => r.current).map((r) => `${r.techniqueId}|${r.art}`));
const nameOf = new Map(matrix.rows.map((r) => [r.techniqueId, r.name]));
const added = [...after].filter((k) => !before.has(k));
const removed = [...before].filter((k) => !after.has(k));
const kept = [...after].filter((k) => before.has(k));
const reviews = decisions.filter((d) => d.decision === 'review');
const decisionOf = new Map(decisions.map((d) => [`${d.techniqueId}|${d.art}`, d]));
const stillCandidates = matrix.rows.filter((r) => r.autoStatus === 'CANDIDATE' && !decisionOf.has(`${r.techniqueId}|${r.art}`));

const L = [];
const p = (s = '') => L.push(s);
p('# MARTIALDEX 전체 기술 × 무술 관계 전수 감사');
p();
p('재현: `npm run audit:technique-relations`. 자동 단계(`scripts/audit-technique-art-matrix.mjs`)는 판단하지 않고 근거만 모은다 — 현재 관계, 각 무술 원문(`data/raw`)·기록·공유 라이브러리가 기술을 언급하는 위치. 판단 단계(`data/audit/judgements/*.json` → `scripts/consolidate-technique-art-decisions.mjs`)는 서면 기준(`data/audit/judgement-criteria/`)에 따른 AI 판단이며 판단마다 근거·신뢰도가 남는다. 외부 근거: ' + Object.values(sources).map((s) => s.source).join(' / '));
p();
p('## 1. 전체 결과');
p();
p('| 항목 | 수 |');
p('|---|---|');
p(`| canonical 기술 | ${matrix.techniques} |`);
p(`| 공식 무술 | ${ARTS.length} (${ARTS.map((a) => a.nameKo).join(', ')}) — 사용자 추가 무술(택견·우슈 등)은 공식 데이터가 없어 제외 |`);
p(`| 검사한 기술 × 무술 관계 | ${matrix.pairs} |`);
p(`| 감사 전 연결 | ${before.size} |`);
p(`| 추가 | ${added.length} |`);
p(`| 제거 | ${removed.length} |`);
p(`| 유지 | ${kept.length} |`);
p(`| 감사 후 연결 | ${after.size} |`);
p(`| 판단한 관계 (AI, 근거·신뢰도 기록) | ${decisions.length} (추가 ${decisions.filter((d) => d.decision === 'add').length} · 해당 없음 ${decisions.filter((d) => d.decision === 'none').length} · REVIEW ${reviews.length}) |`);
p(`| 연결 안 됨 + 근거 없음 (어떤 무술 데이터도 언급하지 않음) | ${matrix.rows.filter((r) => r.autoStatus === 'NONE').length} |`);
p(`| 판단되지 않은 근거 후보 | ${stillCandidates.length} |`);
p();
const bySource = {};
for (const r of matrix.rows.filter((x) => x.current)) {
  const k = r.currentSource?.type === 'reviewed-link' ? `reviewed-link (${r.currentSource.grade ?? '등급 없음'})` : r.currentSource?.type ?? '?';
  bySource[k] = (bySource[k] ?? 0) + 1;
}
p('### 현재 관계의 근거 (제거 대상 점검)');
p();
p('기존 관계를 하나씩 근거 종류로 분류했다. native = 그 무술 원문 문서의 자체 기록, split-part = 그 무술 원문의 묶음 기록을 나눈 기술, reviewed-link = 근거 등급(A/B)을 붙여 검토한 연결, library-link = 사용자가 공유 라이브러리에서 그 무술로 연결한 기록. 근거 없는 관계가 없어 이번 감사에서 제거한 관계는 0개다.');
p();
p('| 근거 종류 | 관계 수 |');
p('|---|---|');
for (const [k, n] of Object.entries(bySource).sort((x, y) => y[1] - x[1])) p(`| ${k} | ${n} |`);
p();
p('앞선 최종 검수에서 근거 부족(C)으로 MMA 관계를 뺐던 Body Kick·High Kick·Round Kick·Teep은 이번 전수 기준(MMA 기록의 "MMA 킥복싱" 범주 S1 + 통합 규정 S2)으로 B가 되어 다시 연결됐다.');
p();
p('## 2. 무술별 결과');
p();
p('| 무술 | 감사 전 | 추가 | 제거 | 감사 후 | REVIEW |');
p('|---|---|---|---|---|---|');
for (const a of ARTS) {
  const b = [...before].filter((k) => k.endsWith(`|${a.id}`)).length;
  const ad = added.filter((k) => k.endsWith(`|${a.id}`)).length;
  const rm = removed.filter((k) => k.endsWith(`|${a.id}`)).length;
  const af = [...after].filter((k) => k.endsWith(`|${a.id}`)).length;
  const rv = reviews.filter((d) => d.art === a.id).length;
  p(`| ${a.nameKo} | ${b} | ${ad} | ${rm} | ${af} | ${rv} |`);
}
p();
const mmaB = [...before].filter((k) => k.endsWith('|mixed-martial-arts')).length;
const mmaAdded = added.filter((k) => k.endsWith('|mixed-martial-arts'));
p('## 3. MMA 전수 결과');
p();
p(`원인: MMA만 원문 문서(\`data/raw\`)가 없고, MMA 기록 30개는 "MMA Boxing Combination", "Dirty Boxing"처럼 결합 동작만 담아서 다른 무술의 기본 기술이 MMA로 연결될 경로가 없었다 (감사 전 ${mmaB}개 — 대부분 이름이 같은 기록 병합이나 앞선 검수의 근거 링크). 이번에는 MMA에 연결되지 않은 기술 ${decisions.filter((d) => d.art === 'mixed-martial-arts').length}개를 하나씩 판단했다: MMA 기록이 그 종류의 기술을 MMA 기술로 다룸(S1) + 통합 규정상 반칙이 아니고 도복 없이 성립(S2) + 실제 MMA에서 쓰임 → 추가(B, MMA 기록이 이름으로 언급하면 A). 도복 의존·반칙·품새/가타/격파·규정 개념 → 해당 없음. 실제 사용이 불확실 → REVIEW.`);
p();
p(`| 감사 전 | 추가 | 제거 | REVIEW | 감사 후 |`);
p('|---|---|---|---|---|');
p(`| ${mmaB} | ${mmaAdded.length} | ${removed.filter((k) => k.endsWith('|mixed-martial-arts')).length} | ${reviews.filter((d) => d.art === 'mixed-martial-arts').length} | ${[...after].filter((k) => k.endsWith('|mixed-martial-arts')).length} |`);
p();
p('### MMA에 새로 연결된 기술 (전체)');
p();
p('| 기술 | 원래 무술 | 신뢰도 | MMA 카테고리 | 근거 |');
p('|---|---|---|---|---|');
for (const k of mmaAdded.sort()) {
  const [id] = k.split('|');
  const d = decisionOf.get(k);
  const row = matrix.rows.find((r) => r.techniqueId === id && r.art === 'mixed-martial-arts');
  p(`| ${nameOf.get(id)} \`${id}\` | ${ko(row?.primaryArt)} | ${d?.confidence ?? row?.currentSource?.grade ?? '-'} | ${d?.category ?? canon.artLinks.find((l) => l.canonicalId === id && l.martialArt === 'mixed-martial-arts')?.category ?? ''} | ${(d?.evidence ?? row?.currentSource?.note ?? '').replace(/\|/g, '/').slice(0, 160)} |`);
}
p();
p('## 4. UNDER-LINKING — 추가된 관계 전체');
p();
p('| 기술 | 무술 | 신뢰도 | 근거 / 이유 |');
p('|---|---|---|---|');
for (const k of added.filter((x) => !x.endsWith('|mixed-martial-arts')).sort()) {
  const [id, art] = k.split('|');
  const d = decisionOf.get(k);
  p(`| ${nameOf.get(id)} \`${id}\` | ${ko(art)} | ${d?.confidence ?? '-'} | ${(d ? `${d.reason} — ${d.evidence}` : 'reviewed link').replace(/\|/g, '/').slice(0, 220)} |`);
}
if (removed.length) {
  p();
  p('### 제거된 관계');
  p();
  for (const k of removed) p(`- ${nameOf.get(k.split('|')[0])} \`${k}\``);
}
p();
p('## 5. OVER-MERGING / identity 자동 검사');
p();
p(`- 패턴 A (같은 이름이 여러 canonical에 존재): ${identity.sameNameDifferentCanonical.length}건 — 모두 "다른 기술"로 검토된 쌍 (excluded/REVIEW)`);
p(`- 패턴 B (canonical 하나에 서로 다른 이름 3개 이상): ${identity.manyNames.length}건 — 모두 근거가 기록된 병합 (무술별 표기 차이: Mae Geri·앞차기·Front Kick 등)`);
for (const x of identity.manyNames) p(`  - \`${x.id}\`: ${x.names.join(' · ')} — ${x.reviewed ?? ''}`);
p(`- 패턴 C (병합된 기록의 설명이 무술마다 다름 → usageByArt로 보존): ${identity.differingDescriptions.length}건`);
p(`- 패턴 D (공유 라이브러리 기록이 기존 기술로 연결): ${identity.libraryRedirects.length}건`);
for (const x of identity.libraryRedirects) p(`  - \`${x.libraryId}\` → \`${x.canonical}\` (${x.reason})`);
p(`- 패턴 E (기술 수가 중앙값의 절반 미만인 무술): ${identity.smallArts.map((x) => `${ko(x.art)} ${x.linked}개 (중앙값 ${x.median}, 원문 문서 ${x.hasSourceDocument ? '있음' : '없음'}, 기록 ${x.records}개)`).join('; ') || '없음'}`);
p(`- 분리된 묶음 기록: ${canon.splits.length}개 (기술 분리 내역은 docs/TECHNIQUE_RELATIONS_AUDIT.md C절)`);
p();
p('## 6. REVIEW (확정하지 않음)');
p();
p('| 기술 | 무술 | 이유 |');
p('|---|---|---|');
for (const d of reviews.sort((x, y) => x.art.localeCompare(y.art) || x.name.localeCompare(y.name))) p(`| ${d.name} \`${d.techniqueId}\` | ${ko(d.art)} | ${(d.reason ?? '').replace(/\|/g, '/')} |`);
for (const r of canon.review.filter((x) => x.decision === 'review')) p(`| ${r.ids.map((i) => `\`${i}\``).join(', ')} | (기술 identity) | ${r.reason} |`);
p();
fs.writeFileSync(path.join(ROOT, 'docs/TECHNIQUE_MARTIAL_ART_MATRIX_AUDIT.md'), L.join('\n'));
console.log(JSON.stringify({ before: before.size, after: after.size, added: added.length, removed: removed.length, kept: kept.length, review: reviews.length, mmaBefore: mmaB, mmaAfter: [...after].filter((k) => k.endsWith('|mixed-martial-arts')).length }));
