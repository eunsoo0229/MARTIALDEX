#!/usr/bin/env node
// Verifies data/curated/poseAnalysis.json only ever references technique ids
// that actually exist in data/processed/*.json, and only ever references
// metric ids that actually have a calculator implemented in
// src/lib/poseAnalysis/metrics.ts. Run after editing either file.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const KNOWN_METRIC_IDS = [
  'basicStance',
  'armPosition',
  'rotation',
  'hipRotation',
  'balance',
  'headPosition',
  'supportLegStability',
  'kneePosition',
  'legMovement',
  'levelChange',
];

const KNOWN_LANDMARKS = [
  'nose',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
];

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/curated/poseAnalysis.json'), 'utf8'));

const allTechniqueIds = new Set();
for (const file of fs.readdirSync(path.join(ROOT, 'data/processed'))) {
  if (!file.endsWith('.json') || file.startsWith('_')) continue;
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/processed', file), 'utf8'));
  for (const t of data.techniques) allTechniqueIds.add(t.id);
}

let errors = 0;
for (const [techniqueId, cfg] of Object.entries(config)) {
  if (!allTechniqueIds.has(techniqueId)) {
    console.error(`FAIL: "${techniqueId}" is not a real technique id in data/processed/*.json`);
    errors++;
    continue;
  }
  for (const lm of cfg.requiredLandmarks ?? []) {
    if (!KNOWN_LANDMARKS.includes(lm)) {
      console.error(`FAIL: ${techniqueId} — unknown landmark "${lm}"`);
      errors++;
    }
  }
  for (const metric of cfg.metrics ?? []) {
    if (!KNOWN_METRIC_IDS.includes(metric.id)) {
      console.error(`FAIL: ${techniqueId} — unknown metric id "${metric.id}" (no calculator implemented)`);
      errors++;
    }
  }
}

if (errors === 0) {
  console.log(`OK — ${Object.keys(config).length} techniques in poseAnalysis.json all reference real ids/metrics.`);
  process.exit(0);
} else {
  console.error(`\n${errors} problem(s) found.`);
  process.exit(1);
}
