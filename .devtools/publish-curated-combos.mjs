// Publishes the curated combos / setups (data/curated-combos/curated-v1.mjs) to 사용자 콤보
// under the operator account. Every step must resolve to a real MARTIALDEX technique;
// an entry with an unresolved or ambiguous step is NOT published (reported instead).
// Entries whose technique sequence is already shared (by anyone) are skipped.
// source_ref = "martialdex-curated:v1:<art>:<technique ids>" → re-running updates in place.
//
//   ADMIN_ID=MARTIALDEX ADMIN_PASSWORD=... node .devtools/publish-curated-combos.mjs          # dry run (default)
//   ADMIN_ID=MARTIALDEX ADMIN_PASSWORD=... node .devtools/publish-curated-combos.mjs --publish
//   ... --data data/curated-combos/curated-defense-v1.mjs [--publish]   # another curated set
// A data file may also export TECHNIQUES (new shared-library records its combos need): a dry run
// resolves against them locally; --publish inserts them into add_teq first (skipped if a technique
// with the same name already exists in that art).
// The password is read from the environment only — never written anywhere.
// Requires the Vite dev server on :5173.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_DIR = '/Users/swcho/Documents/MARTIALDEX';
const publish = process.argv.includes('--publish');
const dataArg = process.argv.includes('--data') ? process.argv[process.argv.indexOf('--data') + 1] : 'data/curated-combos/curated-v1.mjs';
const dataMod = await import(pathToFileURL(path.resolve(APP_DIR, dataArg)).href);
const { ENTRIES, SOURCES } = dataMod;
const TECHNIQUES = dataMod.TECHNIQUES ?? [];
// curated-v1.mjs → 'v1', curated-defense-v1.mjs → 'defense-v1' (part of source_ref, so sets never collide)
const TAG = path.basename(dataArg).replace(/^curated-|\.mjs$/g, '');
const id = process.env.ADMIN_ID;
const password = process.env.ADMIN_PASSWORD;
if (!id || !password) {
  console.error('ADMIN_ID and ADMIN_PASSWORD are required');
  process.exit(2);
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ADMIN_PASSWORD;
const app = await electron.launch({ executablePath: path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [APP_DIR, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'mdex-curated-'))}`], env, timeout: 120000 });
const page = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) ?? (await app.firstWindow());
await page.waitForLoadState('load');
await new Promise((r) => setTimeout(r, 1500));

const result = await page.evaluate(
  async ({ id, password, ENTRIES, SOURCES, TECHNIQUES, TAG, publish }) => {
    const { supabase } = await import('/src/lib/supabase/client.ts');
    const auth = await import('/src/lib/auth/authService.ts');
    const signIn = await supabase.auth.signInWithPassword({ email: auth.loginEmailFor(id), password });
    if (signIn.error) return { error: `signIn: ${signIn.error.message}` };
    const user = signIn.data.user;
    const nickname = id;
    await (await import('/src/lib/cloudSync/addTeqSync.ts')).syncAddTeqFromCloud();
    const { allTechniques } = await import('/src/lib/loadData.ts');
    const { libraryTechniques, techniqueArts, techniqueNameInArt } = await import('/src/lib/techniqueCanonical/index.ts');
    const svc = await import('/src/lib/sharedCombo/service.ts');
    const { derivePurposeTags } = await import('/src/lib/sharedCombo/purpose.ts');
    const norm = (s) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    // ---- new techniques the combos need (shared library)
    const addTeq = await import('/src/lib/addTeq/service.ts');
    const techReport = [];
    const newTechs = [];
    for (const nt of TECHNIQUES) {
      const exists = [...allTechniques, ...libraryTechniques().addTeq].find((t) => norm(t.name) === norm(nt.name) && techniqueArts(t).includes(nt.art));
      if (exists) {
        techReport.push({ name: nt.name, status: 'exists', id: exists.id });
        continue;
      }
      const id = `${nt.art}__${nt.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
      const now = new Date().toISOString();
      const sources = nt.src.map((k) => SOURCES[k]).filter((x) => x?.url);
      const technique = {
        id, martialArt: nt.art, name: nt.name, koreanName: nt.koreanName ?? null, aliases: [], category: nt.category, positions: [],
        description: nt.description, purpose: nt.purpose ?? null, principles: [], variations: [], counters: [], defenses: [], transitions: [],
        relatedTechniques: [], relatedMartialArts: [], difficulty: '중급', tags: ['가드 조작'], youtubeSearchQuery: `${nt.name} boxing`, videos: [],
        posture: { overview: nt.description, keyPoints: nt.keyPoints, commonMistakes: nt.commonMistakes },
        source: 'ai_web_research',
      };
      const record = {
        id, technique, status: 'approved',
        duplicateCheck: { isDuplicate: false, matchedTechniqueId: null, matchedTechniqueName: null, reason: `MARTIALDEX 운영자 큐레이션 ${TAG} — 웹 자료 조사로 추가` },
        verification: { verdict: 'confirmed', confidence: 'high', martialArtConfirmed: nt.art, category: nt.category, canonicalName: nt.name, evidenceNotes: [nt.description], groundingSources: sources.map((x) => ({ title: x.label, uri: x.url })), usedSearchGrounding: true, reason: `참고: ${sources.map((x) => x.url).join(' / ')}` },
        createdAt: now, updatedAt: now,
      };
      if (publish) {
        const r = await addTeq.insertAddTeqTechnique(record);
        techReport.push({ name: nt.name, status: r.ok ? 'inserted' : `failed: ${r.message}`, id });
        if (r.ok) newTechs.push(technique);
      } else {
        techReport.push({ name: nt.name, status: 'would insert', id });
        newTechs.push(technique);
      }
    }
    const pool = [...allTechniques, ...libraryTechniques().addTeq, ...newTechs.filter((t) => !libraryTechniques().addTeq.some((x) => x.id === t.id))];
    const idx = new Map();
    for (const t of pool) {
      for (const n of [t.name, t.koreanName ?? '', ...(t.aliases ?? [])]) {
        const k = norm(n);
        if (k) idx.set(k, [...(idx.get(k) ?? []), t]);
      }
    }
    // name → technique: exact record of the pinned art, else the entry's art (own record first, then shared-into), else a unique match.
    function resolve(raw, art) {
      const [name, pinned] = raw.split('@');
      const hits = [...new Map((idx.get(norm(name)) ?? []).map((t) => [t.id, t])).values()];
      const exactName = hits.filter((t) => norm(t.name) === norm(name));
      const cands = exactName.length ? exactName : hits;
      if (!cands.length) return { error: `기술 없음: ${raw}` };
      const want = pinned ?? art;
      const own = cands.filter((t) => t.martialArt === want);
      if (own.length === 1) return { t: own[0] };
      const shared = cands.filter((t) => techniqueArts(t).includes(want));
      if (shared.length === 1) return { t: shared[0] };
      if (cands.length === 1) return { t: cands[0] };
      return { error: `모호함: ${raw} → ${cands.map((t) => t.id).join(', ')}` };
    }
    const listed = await svc.listSharedCombos(user.id);
    if (!listed.ok) return { error: `list: ${listed.message}` };
    const existingSeq = new Map(listed.data.map((c) => [c.techniqueIds.join('>'), c]));
    const plan = [];
    const rejected = [];
    const seenSeq = new Set();
    for (const e of ENTRIES) {
      const raws = e.steps.map((s) => (typeof s === 'string' ? s : s.t));
      const res = raws.map((r) => resolve(r, e.art));
      const errs = res.filter((r) => r.error).map((r) => r.error);
      if (errs.length) {
        rejected.push({ art: e.art, steps: raws, reason: errs.join(' / ') });
        continue;
      }
      const techs = res.map((r) => r.t);
      const ids = techs.map((t) => t.id);
      const seq = ids.join('>');
      const sourceRef = `martialdex-curated:${TAG}:${e.art}:${seq}`;
      const prior = existingSeq.get(seq);
      if (prior && !(prior.authorId === user.id && prior.sourceRef === sourceRef)) {
        rejected.push({ art: e.art, steps: raws, reason: `이미 공유된 같은 순서: "${prior.name}" (${prior.authorNickname})` });
        continue;
      }
      if (seenSeq.has(seq)) {
        rejected.push({ art: e.art, steps: raws, reason: '데이터 안에서 같은 순서 중복' });
        continue;
      }
      seenSeq.add(seq);
      const steps = techs.map((t, i) => {
        const inArt = techniqueArts(t).includes(e.art);
        const s = typeof e.steps[i] === 'string' ? {} : e.steps[i];
        return { techniqueId: t.id, name: techniqueNameInArt(t, inArt ? e.art : null).name, martialArt: inArt ? e.art : t.martialArt, ...(s.note ? { note: s.note } : {}), ...(s.react ? { opponentReaction: s.react } : {}) };
      });
      const stepNames = steps.map((s) => s.name).join(' → ');
      let name = e.label ? `${stepNames} (${e.label})` : stepNames;
      if (name.length > 80) name = e.label && e.label.length <= 80 ? e.label : stepNames.slice(0, 80);
      const srcLines = e.src.map((k) => (SOURCES[k].url ? `${SOURCES[k].label} — ${SOURCES[k].url}` : SOURCES[k].label));
      const description = `${e.desc}\n\n참고: ${srcLines.join(' / ')}\n등록: MARTIALDEX 운영자 큐레이션 ${TAG} (2026-10-18)`.slice(0, 2000);
      const errors = svc.validateShare({ name, purpose: e.purpose, steps });
      if (errors.length) {
        rejected.push({ art: e.art, steps: raws, reason: errors.join(' ') });
        continue;
      }
      plan.push({ kind: e.kind, art: e.art, name, purpose: e.purpose, description, steps, sourceRef, update: !!prior, tags: derivePurposeTags({ purpose: e.purpose, description, stepNames: steps.map((s) => s.name) }) });
    }
    const published = [];
    const failed = [];
    if (publish) {
      for (const p of plan) {
        const r = await svc.shareCombo({ userId: user.id, nickname, kind: p.kind, name: p.name, purpose: p.purpose, description: p.description, martialArt: p.art, steps: p.steps, sourceRef: p.sourceRef });
        if (r.ok) published.push({ id: r.data.id, name: p.name, art: p.art, kind: p.kind });
        else failed.push({ name: p.name, message: r.message });
      }
    }
    const after = publish ? await svc.listSharedCombos(user.id) : null;
    await supabase.auth.signOut();
    return {
      mode: publish ? 'publish' : 'dry-run', tag: TAG, techniques: techReport, entries: ENTRIES.length, planned: plan.length, rejected, published: published.length, failed,
      byArtKind: plan.reduce((m, p) => ({ ...m, [`${p.art}/${p.kind}`]: (m[`${p.art}/${p.kind}`] ?? 0) + 1 }), {}),
      adminTotalAfter: after?.ok ? after.data.filter((c) => c.authorId === user.id).length : null,
      curatedTotalAfter: after?.ok ? after.data.filter((c) => c.authorId === user.id && (c.sourceRef ?? '').startsWith('martialdex-curated:')).length : null,
      plan, publishedRows: published,
    };
  },
  { id, password, ENTRIES, SOURCES, TECHNIQUES, TAG, publish },
);
const out = path.join(APP_DIR, `data/audit/curated-combos-${TAG === 'v1' ? '' : `${TAG}-`}${publish ? 'publish' : 'dryrun'}.json`);
fs.writeFileSync(out, JSON.stringify({ ...result, ranAt: new Date().toISOString() }, null, 1) + '\n');
console.log(JSON.stringify({ ...result, plan: undefined, publishedRows: undefined }, null, 1));
console.log(`report: ${path.relative(APP_DIR, out)}`);
await app.close();
