#!/usr/bin/env node
// Merges a batch JSON of { techniqueId: [{title, videoId, channel}] } into
// data/curated/videos.json, validating shape/videoId format and skipping
// (with a warning) anything that looks malformed rather than corrupting the
// curated file. Usage: node .devtools/merge-videos.mjs path/to/batch.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEOS_PATH = path.join(__dirname, '..', 'data', 'curated', 'videos.json');

const batchPath = process.argv[2];
if (!batchPath) {
  console.error('usage: node merge-videos.mjs <batch.json>');
  process.exit(1);
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{10,12}$/;

const existing = JSON.parse(fs.readFileSync(VIDEOS_PATH, 'utf-8'));
const batch = JSON.parse(fs.readFileSync(batchPath, 'utf-8'));

let addedTechniques = 0;
let addedVideos = 0;
let skipped = [];

for (const [techId, videos] of Object.entries(batch)) {
  if (!Array.isArray(videos) || videos.length === 0) continue;
  const clean = [];
  for (const v of videos.slice(0, 2)) {
    if (!v || typeof v.videoId !== 'string' || !VIDEO_ID_RE.test(v.videoId)) {
      skipped.push(`${techId}: bad videoId ${JSON.stringify(v && v.videoId)}`);
      continue;
    }
    if (!v.title || !v.channel) {
      skipped.push(`${techId}: missing title/channel for ${v.videoId}`);
      continue;
    }
    clean.push({ title: v.title, videoId: v.videoId, channel: v.channel });
  }
  // de-dupe by videoId within this technique
  const seen = new Set();
  const deduped = clean.filter((v) => (seen.has(v.videoId) ? false : (seen.add(v.videoId), true)));
  if (deduped.length === 0) continue;

  if (!existing[techId]) addedTechniques++;
  existing[techId] = deduped;
  addedVideos += deduped.length;
}

fs.writeFileSync(VIDEOS_PATH, JSON.stringify(existing, null, 2) + '\n', 'utf-8');

console.log(`merged: ${addedTechniques} technique(s) added/updated, ${addedVideos} video entries written`);
if (skipped.length) {
  console.log('skipped (malformed):');
  for (const s of skipped) console.log(' -', s);
}
console.log('total techniques with videos now:', Object.keys(existing).length);
