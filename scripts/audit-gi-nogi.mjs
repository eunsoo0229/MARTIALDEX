// Gi / No-Gi 그래플링 데이터 감사 — counts computed from the REAL data
// (data/curated/gi-nogi.json + the library via src/lib/loadData.ts + the
// runtime rules in src/lib/grappling/giNoGi.ts), nothing estimated.
//
//   node scripts/audit-gi-nogi.mjs                 # data audit
//   node scripts/audit-gi-nogi.mjs --check-videos  # + YouTube oEmbed check of every grappling video (no API key)
//
// Writes data/audit/gi-nogi-audit.json and docs/GI_NOGI_AUDIT.md.
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CHECK_VIDEOS = process.argv.includes('--check-videos');

const server = await createServer({ root: ROOT, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
let ld, gn;
try {
  ld = await server.ssrLoadModule('/src/lib/loadData.ts');
  gn = await server.ssrLoadModule('/src/lib/grappling/giNoGi.ts');
} finally {
  await server.close();
}

const records = gn.allGiNoGi();
const ids = Object.keys(records).sort();
const byId = new Map(ld.allTechniques.map((t) => [t.id, t]));

const classCount = { both_differs: 0, gi_centric: 0, nogi_centric: 0, same: 0, undecided: 0 };
const methodCount = {};
const postureStat = { gi: { style: 0, shared: 0, baseOnly: 0, missing: 0, notApplicable: 0 }, nogi: { style: 0, shared: 0, baseOnly: 0, missing: 0, notApplicable: 0 } };
const videoStat = { gi: { has: 0, missing: 0 }, nogi: { has: 0, missing: 0 } };
const rows = [];
const conflicts = [];
const videoOwners = new Map();

for (const id of ids) {
  const r = records[id];
  const t = byId.get(id);
  classCount[r.classification]++;
  methodCount[r.method] = (methodCount[r.method] ?? 0) + 1;
  const row = { id, name: r.name, arts: r.arts, classification: r.classification, method: r.method, gi: {}, nogi: {} };
  const videos = t ? t.videos ?? [] : [];
  for (const v of videos) videoOwners.set(v.videoId, [...(videoOwners.get(v.videoId) ?? []), id]);
  for (const s of ['gi', 'nogi']) {
    const view = gn.styleView(r, s, !!t?.posture);
    let p;
    if (view.kind === 'not_applicable') p = 'notApplicable';
    else if (view.kind === 'style') p = 'style';
    else if (view.kind === 'missing') p = 'missing';
    else p = /검토 필요/.test(view.note) ? 'baseOnly' : 'shared';
    postureStat[s][p]++;
    row[s].posture = p;
    if (view.kind !== 'not_applicable') {
      const { shown } = gn.videosForStyle(videos, s, r);
      row[s].videos = shown.length;
      if (shown.length) videoStat[s].has++;
      else videoStat[s].missing++;
    }
  }
  // Style conflicts: a video whose own title says the other style, filed under a one-style technique.
  for (const v of videos) {
    const vs = gn.videoStyleOf(v);
    if (r.classification === 'gi_centric' && vs === 'nogi') conflicts.push({ id, type: 'gi_centric_with_nogi_video', detail: v.title });
    if (r.classification === 'nogi_centric' && vs === 'gi') conflicts.push({ id, type: 'nogi_centric_with_gi_video', detail: v.title });
  }
  if (r.gi.applicable === false && r.noGi.applicable === false) conflicts.push({ id, type: 'no_style_applicable', detail: r.reason ?? '' });
  if (r.classification === 'both_differs' && !r.difference) conflicts.push({ id, type: 'both_differs_without_difference', detail: '' });
  rows.push(row);
}

// Same name filed as different grappling techniques (possible duplicates — listed, not merged).
const byName = new Map();
for (const id of ids) {
  const k = records[id].name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  byName.set(k, [...(byName.get(k) ?? []), id]);
}
const dupNames = [...byName.entries()].filter(([, v]) => v.length > 1).map(([k, v]) => ({ name: k, ids: v }));
const dupVideos = [...videoOwners.entries()].filter(([, v]) => v.length > 1).map(([videoId, owners]) => ({ videoId, owners }));

// Optional: is every grappling video still a real, embeddable YouTube video?
const videoCheck = { checked: 0, failed: [] };
if (CHECK_VIDEOS) {
  const all = [...videoOwners.keys()];
  for (const vid of all) {
    videoCheck.checked++;
    try {
      const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vid}`)}`);
      if (!res.ok) videoCheck.failed.push({ videoId: vid, status: res.status, owners: videoOwners.get(vid) });
    } catch (e) {
      videoCheck.failed.push({ videoId: vid, status: 'network', owners: videoOwners.get(vid) });
    }
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  dataGeneratedAt: gn.giNoGiGeneratedAt(),
  totalTargets: ids.length,
  classification: classCount,
  method: methodCount,
  posture: postureStat,
  videos: videoStat,
  videoCheck: CHECK_VIDEOS ? { checked: videoCheck.checked, failed: videoCheck.failed.length } : 'not run (use --check-videos)',
  styleConflicts: conflicts.length,
  duplicateNameGroups: dupNames.length,
  videosSharedByTechniques: dupVideos.length,
};
fs.writeFileSync(path.join(ROOT, 'data/audit/gi-nogi-audit.json'), JSON.stringify({ summary, conflicts, dupNames, dupVideos, videoCheckFailed: videoCheck.failed, rows }, null, 1));

const L = [];
L.push('# 그래플링 Gi / No-Gi 데이터 감사', '');
L.push(`> 감사 시각 ${summary.generatedAt} · 데이터 생성 ${summary.dataGeneratedAt} · \`node scripts/audit-gi-nogi.mjs${CHECK_VIDEOS ? ' --check-videos' : ''}\``, '');
L.push('## 요약', '', '| 항목 | 수 |', '|---|---|');
L.push(`| 그래플링 조사 대상 | ${ids.length} |`);
L.push(`| Gi·No-Gi 공통 (수행 차이 있음) | ${classCount.both_differs} |`);
L.push(`| Gi 중심 | ${classCount.gi_centric} |`);
L.push(`| No-Gi 중심 | ${classCount.nogi_centric} |`);
L.push(`| 실질적으로 동일 | ${classCount.same} |`);
L.push(`| 판단 보류 | ${classCount.undecided} |`);
L.push(`| Gi 자세 설명: 스타일 전용 / 공통(유효) / 기본 설명만(검토 필요) / 누락 / 적용 불가 | ${postureStat.gi.style} / ${postureStat.gi.shared} / ${postureStat.gi.baseOnly} / ${postureStat.gi.missing} / ${postureStat.gi.notApplicable} |`);
L.push(`| No-Gi 자세 설명: 스타일 전용 / 공통(유효) / 기본 설명만(검토 필요) / 누락 / 적용 불가 | ${postureStat.nogi.style} / ${postureStat.nogi.shared} / ${postureStat.nogi.baseOnly} / ${postureStat.nogi.missing} / ${postureStat.nogi.notApplicable} |`);
L.push(`| Gi 영상 있음 / 누락 | ${videoStat.gi.has} / ${videoStat.gi.missing} |`);
L.push(`| No-Gi 영상 있음 / 누락 | ${videoStat.nogi.has} / ${videoStat.nogi.missing} |`);
L.push(`| 영상 URL 확인 (oEmbed) | ${CHECK_VIDEOS ? `${videoCheck.checked}개 중 실패 ${videoCheck.failed.length}` : '실행 안 함'} |`);
L.push(`| 스타일 분류 충돌 | ${conflicts.length} |`);
L.push(`| 같은 이름의 별도 기술 (중복 후보) | ${dupNames.length}그룹 |`);
L.push('');
L.push('분류 방법:', '', ...Object.entries(methodCount).map(([k, v]) => `- ${k}: ${v}`), '');
L.push('- `rule`: 앱 데이터(원문 분류·기술 이름)만으로 확정 · `ai_web_sources`: 웹 검색 자료를 인용한 AI 판단 · `ai_rejected`: 근거 부족·확신도 낮음·차이 불명확으로 보류 · `pending`: 아직 조사 전 · `user`: 사용자가 직접 판단 (data/curated/gi-nogi-user.json)', '');
L.push('## 판단 보류 기술', '');
for (const id of ids.filter((x) => records[x].classification === 'undecided')) L.push(`- ${id} — ${records[id].reason ?? '조사 전'}`);
L.push('', '## 스타일 분류 충돌', '');
if (!conflicts.length) L.push('없음');
for (const c of conflicts) L.push(`- ${c.id} · ${c.type} ${c.detail ? `· ${c.detail}` : ''}`);
L.push('', '## 같은 이름의 별도 기술 (검토 대상, 자동 병합하지 않음)', '');
if (!dupNames.length) L.push('없음');
for (const d of dupNames) L.push(`- ${d.ids.join(', ')}`);
if (CHECK_VIDEOS) {
  L.push('', '## 영상 URL 확인 실패', '');
  if (!videoCheck.failed.length) L.push('없음');
  for (const f of videoCheck.failed) L.push(`- ${f.videoId} (${f.status}) · ${f.owners.join(', ')}`);
}
fs.writeFileSync(path.join(ROOT, 'docs/GI_NOGI_AUDIT.md'), L.join('\n') + '\n');
console.log(JSON.stringify(summary, null, 1));
