#!/usr/bin/env node
// MARTIALDEX 데이터 품질 audit — 순수 Node, 실제 앱/네트워크 호출 없음 (빠름).
// 실제 근거 기반 보정(웹 검색/Gemini)은 이 스크립트의 역할이 아니다 — 그건
// .devtools/backfill-posture-difficulty.mjs / backfill-difficulty.mjs가
// 담당한다 (real Tavily/Gemini, Electron 필요). 이 스크립트는 "지금 데이터
// 상태가 어떤지"만 보고한다.
//
// 사용법:
//   node scripts/audit-techniques.mjs --audit
//   node scripts/audit-techniques.mjs --missing-posture
//   node scripts/audit-techniques.mjs --missing-difficulty
//   node scripts/audit-techniques.mjs --missing-martial-arts
//   node scripts/audit-techniques.mjs --validate

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const PROCESSED_DIR = path.join(ROOT, 'data/processed');
const POSTURE_PATH = path.join(ROOT, 'data/curated/posture.json');
const DIFFICULTY_PATH = path.join(ROOT, 'data/curated/difficulty.json');

function loadOfficialTechniques() {
  const files = fs.readdirSync(PROCESSED_DIR).filter((f) => f.endsWith('.json') && f !== '_all.json' && f !== '_meta.json');
  let all = [];
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(PROCESSED_DIR, f), 'utf8'));
    const arr = Array.isArray(d) ? d : d.techniques || [];
    all = all.concat(arr);
  }
  return all;
}

function loadJsonOrEmpty(p) {
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const VALID_DIFFICULTIES = new Set(['beginner', 'intermediate', 'advanced']);
const VALID_MARTIAL_ARTS = new Set(['bjj', 'wrestling', 'muay-thai', 'kickboxing', 'taekwondo', 'karate', 'boxing', 'sambo', 'judo', 'mixed-martial-arts']);

function auditPosture(techniques, postureOverlay) {
  let valid = 0;
  const missing = [];
  for (const t of techniques) {
    if (postureOverlay[t.id]) valid++;
    else missing.push(t.id);
  }
  return { total: techniques.length, valid, missing };
}

function auditDifficulty(techniques, difficultyOverlay) {
  const counts = { beginner: 0, intermediate: 0, advanced: 0, missing: 0, invalid: 0 };
  const invalidSamples = [];
  const missingIds = [];
  for (const t of techniques) {
    const effective = t.difficulty ?? difficultyOverlay[t.id] ?? null;
    if (effective === null || effective === undefined) {
      counts.missing++;
      missingIds.push(t.id);
    } else if (VALID_DIFFICULTIES.has(effective)) {
      counts[effective]++;
    } else {
      counts.invalid++;
      invalidSamples.push([t.id, effective]);
    }
  }
  return { total: techniques.length, counts, invalidSamples, missingIds };
}

function auditMartialArts(techniques) {
  const byArt = {};
  for (const t of techniques) byArt[t.martialArt] = (byArt[t.martialArt] ?? 0) + 1;
  return byArt;
}

function validateIntegrity(techniques) {
  const seenIds = new Set();
  const dupeIds = [];
  const emptyNames = [];
  const invalidMartialArt = [];
  const brokenPlaceholders = [];
  const PLACEHOLDER_RE = /\[TODO\]|\bTBD\b|\bUnknown\b|\bundefined\b|\bnull\b/i;
  for (const t of techniques) {
    if (seenIds.has(t.id)) dupeIds.push(t.id);
    seenIds.add(t.id);
    if (!t.name || !t.name.trim()) emptyNames.push(t.id);
    if (!VALID_MARTIAL_ARTS.has(t.martialArt)) invalidMartialArt.push([t.id, t.martialArt]);
    for (const field of ['description', 'purpose']) {
      const v = t[field];
      if (typeof v === 'string' && PLACEHOLDER_RE.test(v)) brokenPlaceholders.push([t.id, field, v.slice(0, 60)]);
    }
  }
  return { dupeIds, emptyNames, invalidMartialArt, brokenPlaceholders };
}

function main() {
  const args = process.argv.slice(2);
  const flag = args[0] || '--audit';

  const techniques = loadOfficialTechniques();
  const posture = loadJsonOrEmpty(POSTURE_PATH);
  const difficulty = loadJsonOrEmpty(DIFFICULTY_PATH);

  if (flag === '--missing-posture' || flag === '--audit') {
    const r = auditPosture(techniques, posture);
    console.log('\nPOSTURE AUDIT');
    console.log(`Total: ${r.total}`);
    console.log(`Valid posture: ${r.valid}`);
    console.log(`Missing: ${r.missing.length}`);
    if (flag === '--missing-posture') console.log(r.missing.join('\n'));
  }

  if (flag === '--missing-difficulty' || flag === '--audit') {
    const r = auditDifficulty(techniques, difficulty);
    console.log('\nDIFFICULTY AUDIT');
    console.log(`Total: ${r.total}`);
    console.log(`Valid: ${r.total - r.counts.missing - r.counts.invalid}`);
    console.log(`Missing: ${r.counts.missing}`);
    console.log(`Invalid: ${r.counts.invalid}`);
    console.log(`Beginner: ${r.counts.beginner}`);
    console.log(`Intermediate: ${r.counts.intermediate}`);
    console.log(`Advanced: ${r.counts.advanced}`);
    if (r.invalidSamples.length) console.log('Invalid samples:', r.invalidSamples.slice(0, 20));
    if (flag === '--missing-difficulty') console.log(r.missingIds.join('\n'));
  }

  if (flag === '--missing-martial-arts' || flag === '--audit') {
    const byArt = auditMartialArts(techniques);
    console.log('\nMARTIAL ART AUDIT');
    for (const [art, count] of Object.entries(byArt).sort()) console.log(`${art}: ${count}`);
  }

  if (flag === '--validate' || flag === '--audit') {
    const r = validateIntegrity(techniques);
    console.log('\nDATA INTEGRITY');
    console.log(`Duplicate IDs: ${r.dupeIds.length}`);
    console.log(`Empty names: ${r.emptyNames.length}`);
    console.log(`Invalid martialArt: ${r.invalidMartialArt.length}`);
    console.log(`Placeholder/broken text: ${r.brokenPlaceholders.length}`);
    if (r.dupeIds.length) console.log('Dupe ids:', r.dupeIds);
    if (r.invalidMartialArt.length) console.log('Invalid martialArt entries:', r.invalidMartialArt);
    if (r.brokenPlaceholders.length) console.log('Placeholder samples:', r.brokenPlaceholders.slice(0, 20));
  }
}

main();
