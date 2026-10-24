#!/usr/bin/env node
// Speaker sketch PUBLISH: the chosen take per person (tmp/speaker-sketch/ledger.json `final`, from speaker_sketch.py and a
// skin-tone look) → the 9:16 master and its square crop stored ONCE in the cdn-assets R2 bucket
// (media-speakers/<key>/sketch-<sha16>.jpg, sketch-sq-<sha16>.jpg) → data/media-speaker-sketches.json (ai_rendered, the
// source photo's id + credit, model, $, likeness). R2 + files only; never the database.
//   node scripts/media/speaker_sketch_publish.mjs [--dry] [--keys a,b]
import dotenv from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { putCdnPortrait } from '../../api/lib/media/speakers.js';

dotenv.config({ path: '.env-secrets', quiet: true });
const ROOT = join(process.cwd(), 'tmp', 'speaker-sketch');
const OUT = join(process.cwd(), 'data', 'media-speaker-sketches.json');
const dry = process.argv.includes('--dry');
const keysArg = process.argv.includes('--keys') ? process.argv[process.argv.indexOf('--keys') + 1].split(',') : null;
const readJson = (p, d = null) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d);

const L = readJson(join(ROOT, 'ledger.json'));
const gallery = readJson(join(process.cwd(), 'data', 'media-speaker-gallery.json')).speakers;
const prev = readJson(OUT, { speakers: {} });
const sha = (b) => createHash('sha256').update(b).digest('hex');
const out = { ...prev.speakers };
let n = 0;
for (const [key, name] of Object.entries(L.final || {})) {
  if (keysArg && !keysArg.includes(key)) continue;
  const d = L.drawings[name];
  const src = (gallery[key] || []).find((e) => e.sha === d.source_sha);
  if (!src) { console.log('SKIP', key, '— its source photo is no longer in the verified gallery'); continue; }
  const tall = readFileSync(join(ROOT, `${name}.jpg`)), sq = readFileSync(join(ROOT, `${name}-sq.jpg`));
  const [ts, ss] = [sha(tall), sha(sq)];
  const file = `media-speakers/${key}/sketch-${ts.slice(0, 16)}.jpg`, sqFile = `media-speakers/${key}/sketch-sq-${ss.slice(0, 16)}.jpg`;
  if (out[key]?.sha !== ts && !dry) { await putCdnPortrait(file, tall, 'image/jpeg'); await putCdnPortrait(sqFile, sq, 'image/jpeg'); }
  out[key] = { file, sha: ts, sq_file: sqFile, sq_sha: ss, width: d.w, height: d.h, ai_rendered: true, model: d.model, usd: d.usd,
    source_sha: src.sha, source_file: src.file, source_credit: src.credit || null, source_licence: src.licence || null, source_url: src.source_url || src.page_url || null,
    likeness: d.likeness || null, ...(d.accepted_by ? { accepted_by: d.accepted_by } : {}), style: L.style_chosen || 'A', take: name, drawn_at: d.at };
  n++; console.log(dry ? 'would publish' : 'published', key, file);
}
const spend = Math.round((L.spend_usd || 0) * 10000) / 10000;
if (!dry) writeFileSync(OUT, `${JSON.stringify({
  note: 'Speaker SKETCHES (Chad 10-23): one pen-and-ink courtroom-style portrait per speaker, drawn image-to-image (gemini-3.1-flash-image) from the verified gallery photo named by source_sha — never an invented face. ai_rendered: true. Masters in cdn-assets R2 (media-speakers/<key>/sketch-*.jpg). Built by scripts/media/speaker_sketch.py (+ SFace likeness gate) and speaker_sketch_publish.mjs; read by api/lib/media/sketch.js.',
  generated: new Date().toISOString(), spend_usd_total: spend, speakers: out }, null, 1)}\n`);
console.log(`${n} sketches; total Gemini spend so far $${spend}`);
