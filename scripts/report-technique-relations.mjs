// Writes docs/TECHNIQUE_RELATIONS_AUDIT.md from the reviewed relation data
// (data/curated/technique-canonical.json, built by build-technique-canonical.mjs).
//   node scripts/report-technique-relations.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const all = fs.readdirSync(path.join(ROOT, 'data/processed')).filter((f) => f.endsWith('.json') && !f.startsWith('_')).flatMap((f) => read(`data/processed/${f}`).techniques);
const byId = new Map(all.map((t) => [t.id, t]));
const c = read('data/curated/technique-canonical.json');
const ART_KO = { bjj: 'BJJ', boxing: '복싱', judo: '유도', karate: '가라테', kickboxing: '킥복싱', 'mixed-martial-arts': 'MMA', 'muay-thai': '무에타이', sambo: '삼보', taekwondo: '태권도', wrestling: '레슬링' };
const ko = (a) => ART_KO[a] ?? a;
const name = (id) => byId.get(id)?.name ?? c.newTechniques.find((n) => n.id === id)?.name ?? id;

// arts per canonical technique, before (groups v1 only) and after (groups + links)
const memberOf = new Map(c.groups.flatMap((g) => g.members.map((m) => [m, g.canonicalId])));
const splitIds = new Set(c.splits.map((s) => s.id));
const hidden = new Set(c.notTechniques.map((n) => n.id));
const artsAfter = new Map();
const add = (id, art) => artsAfter.set(id, new Set([...(artsAfter.get(id) ?? []), art]));
for (const t of all) if (!splitIds.has(t.id) && !hidden.has(t.id)) add(memberOf.get(t.id) ?? t.id, t.martialArt);
for (const n of c.newTechniques) add(n.id, n.martialArt);
for (const l of c.artLinks) add(l.canonicalId, l.martialArt);
const canonicalCount = artsAfter.size;
const multiArt = [...artsAfter.entries()].filter(([, s]) => s.size > 1);
const linkedTechniques = new Set(c.artLinks.map((l) => l.canonicalId));
const crossGroups = c.groups.filter((g) => new Set(g.members.map((m) => byId.get(m).martialArt)).size > 1);

const lines = [];
const p = (s = '') => lines.push(s);
p('# MARTIALDEX 기술 관계 전수 감사 (공통 기술 누락 + 잘못된 병합)');
p();
p('생성: `node scripts/report-technique-relations.mjs` — 근거 데이터 `scripts/technique-relations.mjs`, `scripts/build-technique-canonical.mjs`, 결과 `data/curated/technique-canonical.json` (v2).');
p('원본 데이터(`data/raw`, `data/processed`)는 수정하지 않는다. 앱은 불러올 때(`src/lib/loadData.ts`) 이 결과를 적용한다.');
p();
p('## A. 전체 결과');
p();
p('| 항목 | 수 |');
p('|---|---|');
p(`| 감사 대상 공식 기술 기록 | ${all.length} |`);
p(`| 감사 대상 공유 라이브러리(Supabase add_teq) 기록 | 97 (새 문제 없음 — 기존 중복 ${c.addTeqDuplicates.length}건 처리 유지) |`);
p(`| 수정 후 기술 수 (canonical, 목록에 표시) | ${canonicalCount} |`);
p(`| A. 같은 기술 + 여러 무술 (canonical 1개에 무술 관계 여러 개) | ${multiArt.length} |`);
p(`| B. 무술 관계 누락 → 관계 추가 | ${c.artLinks.length}건 (${linkedTechniques.size}개 기술) |`);
p(`| C. 서로 다른 기술이 하나로 묶여 있음 → 분리 | ${c.splits.length}개 기록 (+ 기존 병합 해제 2건) → 새 기술 ${c.newTechniques.length}개 |`);
p(`| D. 이름은 비슷하지만 다른 기술 → 분리 유지 | ${c.excluded.length}건 |`);
p(`| 다른 이름·같은 무술 중복 → 병합 (그룹) | ${c.groups.length}개 그룹 (무술 간 ${crossGroups.length}, 같은 무술 안 ${c.groups.length - crossGroups.length}) |`);
p(`| 기술이 아닌 제목 항목 (목록에서 제외, id 유지) | ${c.notTechniques.length} |`);
p(`| REVIEW (자동·추정으로 확정하지 않음) | ${c.review.length} |`);
p();
p('## A-1. 최종 검수: 근거 등급이 필요한 관계 (MMA·BJJ 기본 기술)');
p();
p('A = 해당 무술의 기록이 이 기술을 직접 언급 / B = 여러 기록이 이름 없이 같은 것을 설명하거나 사용자가 공유 라이브러리에 그 무술로 등록 / C = 근거 없음 → 관계 제거, REVIEW / D = 잘못된 관계 → 제거');
p();
p('| 기술 | 무술 | 등급 | 결정 | 근거 |');
p('|---|---|---|---|---|');
for (const l of c.artLinks.filter((x) => x.grade)) p(`| ${name(l.canonicalId)} | ${ko(l.martialArt)} | ${l.grade} | 유지 | ${l.evidence} |`);
for (const l of c.artLinksRemoved ?? []) p(`| ${name(l.id)} | ${ko(l.martialArt)} | ${l.grade} | 관계 제거 → REVIEW | ${l.reason} |`);
p();
p('## B. 공통 기술 관계 수정 (무술 관계 추가)');
p();
p('| 기술 | 추가된 무술 (카테고리) | 근거 |');
p('|---|---|---|');
const byTech = new Map();
for (const l of c.artLinks) byTech.set(l.canonicalId, [...(byTech.get(l.canonicalId) ?? []), l]);
for (const [id, ls] of [...byTech.entries()].sort((a, b) => name(a[0]).localeCompare(name(b[0])))) {
  p(`| ${name(id)} (\`${id}\`) | ${ls.map((l) => `${ko(l.martialArt)} (${l.category})`).join(', ')} | ${[...new Set(ls.map((l) => (l.sourceId ? `묶음 기록 분리 (\`${l.sourceId}\`)` : l.reason)))].join('; ')} |`);
}
p();
p('### 다른 이름의 같은 기술 — 병합 (이번 감사에서 추가된 그룹·멤버)');
p();
const before = (() => { try { return read('docs/.technique-canonical.v1.json'); } catch { return null; } })();
const beforeMembers = new Set(before ? before.groups.flatMap((g) => g.members) : []);
p('| canonical | 합쳐진 기록 | 근거 |');
p('|---|---|---|');
for (const g of c.groups) {
  const added = g.members.filter((m) => !beforeMembers.has(m));
  if (before && added.length === 0) continue;
  p(`| ${name(g.canonicalId)} (\`${g.canonicalId}\`) | ${g.members.map((m) => `${ko(byId.get(m).martialArt)} ${byId.get(m).name}`).join(' · ')} | ${g.reason} |`);
}
p();
p('## C. 잘못 묶인 기술 분리');
p();
p('원문이 한 줄에 여러 기술을 적은 것을 파서가 기술 1개로 만든 기록. 이미 있는 기술은 **연결**(그 기술에 이 무술 관계 추가), 없는 기술은 같은 무술·카테고리에 **새 기술**로 만들었다. 원래 기록 id는 삭제하지 않고 남겨(이전 학습 기록 보존) 목록에서만 빼고, 상세 화면에서 분리된 기술로 안내한다.');
p();
p('| 원래 기록 (old id) | 분리 결과 (new id / 연결) | 근거 |');
p('|---|---|---|');
for (const s of c.splits) p(`| ${byId.get(s.id).name} (\`${s.id}\`) | ${s.parts.map((x) => `${x.name} → \`${x.id}\`${x.link ? ' (연결)' : ' (새 기술)'}`).join('<br>')} | ${s.reason} |`);
p();
p('### 기존 병합 해제');
p();
p('| 기록 | 이전 | 수정 | 근거 |');
p('|---|---|---|---|');
p('| `boxing__catch`, `kickboxing__catch` | 하나의 Catch | 복싱 Catch(펀치) ≠ 킥복싱 Catch(킥 캐치, `kickboxing__킥-캐치`와 병합) | 킥복싱 원문 14장 "Catch는 로우킥/미들킥을 팔로 감아 잡는 방어" |');
p('| `bjj__grip-fighting`, `judo__grip-fighting` | 하나의 Grip Fighting | 각각 독립 | BJJ는 데 라 히바 가드 안 그립 싸움, 유도는 서서 하는 쿠미카타 |');
p();
p('## D. 데이터 이전');
p();
p('- **사용자 기록 (학습 기록·숙련도·자세 분석·콤보·커리큘럼):** 기록에는 기술 id만 있고 묶음 중 어느 기술인지 알려 주는 정보(Mitt 동작, AI 코치 기술별 결과 등)가 없어 **옮기지 않았다**. 숙련도를 분리된 기술 여러 개에 복사하지도 않는다. 묶음 기록 id는 계속 열리고(legacy), 상세 화면에서 분리된 기술을 안내한다. 이 기록에 학습 내역·숙련도·자세 분석이 있으면 "배운 기술"·"나의 기술" 목록에 "여러 기술을 묶은 기존 기록"으로 표시된다(`legacySplitSkillEntries`) — 추천·약점 분석·AI 코치 기술 선택에는 쓰지 않는다. 병합된 기록은 기존과 같이 모든 id가 canonical로 이어진다. 삭제된 사용자 데이터 0.');
p('- **커리큘럼 참조:** 공식·저장된 커리큘럼이 묶음 기록 id를 가리키면 읽을 때 분리된 기술 id 목록으로 펼친다(`expandSplitTechniqueIds`, 저장된 원본은 수정하지 않음).');
p('- **영상:** 내용이 확인된 경우만 옮겼다.');
for (const s of c.splits) for (const x of s.parts) if (x.moveVideos?.length) p(`  - \`${s.id}\` → \`${x.id}\`: ${x.moveVideos.join(', ')}`);
for (const n of c.newTechniques) if (n.videoIds.length) p(`  - \`${n.sourceIds[0]}\` → 새 기술 \`${n.id}\`: ${n.videoIds.join(', ')}`);
for (const m of c.videoMoves) p(`  - \`${m.from}\` → \`${m.to}\`: ${m.videoId} (${m.reason})`);
p('  - 어느 기술 영상인지 특정할 수 없는 영상(예: 잽-크로스 연결 영상, 일반 라운드킥·티프 강좌)은 원래 기록에 그대로 둠.');
p('- **자세(posture)·난이도:** 묶음 기록의 자세 설명은 여러 기술이 섞인 것이라 분리된 기술로 복사하지 않았다(새 기술은 "자세 설명 준비 중"). 자세 분석 설정 1건(`muay-thai__lead-round-kick-rear-round-kick`, 좌우 무관 지표)만 Lead/Rear Round Kick에 복사.');
p();
p('## H. REVIEW — 최종 결정');
p();
const DECISION = { review: 'REVIEW 유지 (근거 부족·원문 충돌)', separate: '다른 기술로 확정 — 분리 유지 (데이터 변경 없음)', merge: '같은 기술로 확정 — 병합' };
p('| 기록 | 결정 | 이유 |');
p('|---|---|---|');
for (const r of c.review) p(`| ${r.ids.map((id) => `\`${id}\``).join(', ')} | ${DECISION[r.decision] ?? r.decision} | ${r.reason} |`);
for (const l of c.artLinksRemoved ?? []) p(`| \`${l.id}\` → ${ko(l.martialArt)} | REVIEW (관계 제거) | ${l.reason} |`);
p();
p('## 표시 이름 (무술별)');
p();
p('기술 identity는 canonical 하나로 유지하고, 무술 화면에서는 그 무술 원래 기록의 이름을 먼저 보여 준다 (`techniqueNameInArt`). 이름은 병합된 기록에 있던 것만 쓰며 새로 만들지 않는다. 모든 이름은 별칭으로도 검색된다.');
p();
p('| canonical | 무술별 이름 |');
p('|---|---|');
for (const g of c.groups) {
  const perArt = new Map();
  for (const m of g.members) { const t = byId.get(m); if (!perArt.has(t.martialArt)) perArt.set(t.martialArt, t); }
  const names = new Set([...perArt.values()].map((t) => t.name.toLowerCase()));
  if (names.size < 2) continue;
  p(`| ${name(g.canonicalId)} | ${[...perArt.entries()].map(([a, t]) => `${ko(a)}: ${t.name}${t.koreanName && t.koreanName !== t.name ? ` (${t.koreanName})` : ''}`).join(' · ')} |`);
}
p();
p('대표(canonical) 이름에 다른 기록의 직역 한국어명을 쓰지 않는 기술: ' + (c.noBorrowedKoreanName ?? []).map((id) => `\`${id}\``).join(', ') + ' — 해당 무술 화면에서는 그 무술 기록의 이름(예: 유도 "Morote Gari (양손 베기)")으로 표시.');
p();
p('### D. 이름은 비슷하지만 다른 기술 (분리 유지)');
p();
p('| 기록 | 이유 |');
p('|---|---|');
for (const e of c.excluded) p(`| ${e.ids.map((id) => `\`${id}\``).join(', ')} | ${e.reason} |`);
p();
p('### 기술이 아닌 항목');
p();
for (const n of c.notTechniques) p(`- \`${n.id}\` — ${n.reason}`);
p();
fs.writeFileSync(path.join(ROOT, 'docs/TECHNIQUE_RELATIONS_AUDIT.md'), lines.join('\n'));
console.log(JSON.stringify({ canonicalCount, multiArt: multiArt.length, artLinks: c.artLinks.length, linkedTechniques: linkedTechniques.size, splits: c.splits.length, newTechniques: c.newTechniques.length, excluded: c.excluded.length, groups: c.groups.length, crossGroups: crossGroups.length, review: c.review.length }));
