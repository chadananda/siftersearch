#!/usr/bin/env node
// Speaker gallery PUBLISH: the reviewed harvest (tmp/speaker-gallery/<key>/{candidates,review}.json, from
// speaker_gallery_harvest.py + an identity review) → originals stored ONCE in the cdn-assets R2 bucket
// (media-speakers/<key>/<sha16>.<ext>; the image worker crops them) → data/media-speaker-gallery.json, which the
// media-gallery ops job syncs into media_speaker_photos. R2 + files only; never the database.
//   node scripts/media/speaker_gallery_publish.mjs [--dry] [--keys a,b]
import dotenv from 'dotenv';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { putCdnPortrait } from '../../api/lib/media/speakers.js';

dotenv.config({ path: '.env-secrets', quiet: true });
const ROOT = join(process.cwd(), 'tmp', 'speaker-gallery');
const OUT = join(process.cwd(), 'data', 'media-speaker-gallery.json');
const LEDGER = join(ROOT, 'uploaded.json');
const UA = 'SifterSearch media library (https://siftersearch.com; chadananda@gmail.com)';
const dry = process.argv.includes('--dry');
const keysArg = process.argv.includes('--keys') ? process.argv[process.argv.indexOf('--keys') + 1].split(',') : null;
const readJson = (p, d = null) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d);

const ledger = readJson(LEDGER, {});
const prev = readJson(OUT, { speakers: {} });
const yt = readJson(join(process.cwd(), 'planning', 'media-targets', 'youtube-talks.json'), {});
const vids = new Map();
for (const sec of ['curated_sacred_traditions', 'hooper_dunbar', 'hands_uhj']) for (const t of yt[sec] || []) vids.set(t.video_id, t);

const ham = (a, b) => { let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`), n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n; };
const extOf = (b) => (b[0] === 0x89 ? 'png' : b.slice(8, 12).toString() === 'WEBP' ? 'webp' : 'jpg');
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const yearOf = (c, r) => r?.year || (/\b(18[5-9]\d|19\d\d|20[0-2]\d)\b/.exec(`${c.date || ''} ${c.title || ''} ${c.desc || ''}`)?.[1] ? Number(/\b(18[5-9]\d|19\d\d|20[0-2]\d)\b/.exec(`${c.date || ''} ${c.title || ''} ${c.desc || ''}`)[1]) : null);

async function bytesFor(key, c) {
  // a video still IS our crop (saved by the harvest); anything else: the downloaded rendition, re-fetched and checked
  if (c.origin === 'youtube-still') return readFileSync(join(ROOT, key, c.file));
  const r = await fetch(c.thumb || c.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`download ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

const out = { ...prev.speakers };
const report = { people: 0, photos: 0, uploaded: 0, dupes: 0, failed: [] };
for (const key of readdirSync(ROOT).filter((d) => existsSync(join(ROOT, d, 'review.json')))) {
  if (keysArg && !keysArg.includes(key)) continue;
  const { candidates } = readJson(join(ROOT, key, 'candidates.json'));
  const review = readJson(join(ROOT, key, 'review.json'));
  const byN = new Map(candidates.map((c) => [c.n, c]));
  const list = [];
  for (const a of review.approved || []) {
    const c = byN.get(a.n);
    if (!c) { report.failed.push(`${key} #${a.n}: no candidate`); continue; }
    if (list.some((e) => e.phash && c.dhash && ham(e.phash, c.dhash) <= 6)) { report.dupes++; continue; }
    const base = { phash: c.dhash || null, width: c.w || null, height: c.h || null, face: c.face || null, year: yearOf(c, a), note: a.note || null, primary: !!a.primary, needs_ext: !!c.needs_ext };
    if (c.origin === 'current-primary') {
      // the portrait already in use: referenced where it is (no second copy); its extended master is reused
      const m = /\/img\/cdn\/siftersearch\.com\/([^?]+)\?v=([0-9a-f]+)/.exec(c.url || '');
      if (!m) { report.failed.push(`${key} #${a.n}: primary url`); continue; }
      list.push({ file: decodeURIComponent(m[1]), sha: m[2], origin: 'current-primary', source_url: c.src || c.page || null, page_url: c.page || null, credit: c.credit || null, licence: c.licence || null, ...base, needs_ext: false });
      continue;
    }
    try {
      const bytes = await bytesFor(key, c);
      const sha = createHash('sha256').update(bytes).digest('hex');
      const ext = extOf(bytes);
      const file = `media-speakers/${key}/${sha.slice(0, 16)}.${ext}`;
      if (!ledger[file] && !dry) { await putCdnPortrait(file, bytes, MIME[ext]); ledger[file] = new Date().toISOString(); report.uploaded++; writeFileSync(LEDGER, JSON.stringify(ledger, null, 1)); }
      const v = c.alt_of ? vids.get(c.alt_of) : null;
      list.push({ file, sha, origin: c.origin, source_url: c.url || null, page_url: c.page || c.article || null,
        credit: c.credit || (c.origin === 'youtube-still' ? `Video still${v?.channel ? `: ${v.channel}` : ''} (YouTube)` : null),
        licence: c.licence || null, ...base, ...(v?.title ? { note: `${a.note ? `${a.note} · ` : ''}from “${v.title}”` } : {}) });
    } catch (err) { report.failed.push(`${key} #${a.n}: ${err.message}`); }
  }
  if (!list.length) continue;
  out[key] = list;
  report.people++; report.photos += list.length;
}
const doc = { note: 'Speaker GALLERIES (Chad 10-23): verified photos per person (key = media_speakers key), primary first; originals in cdn-assets R2 (media-speakers/<key>/<sha16>.<ext>). Built by scripts/media/speaker_gallery_publish.mjs from a reviewed harvest; synced by the media-gallery ops job. Credits as the source states them; youtube-still = a crop of the talk video\'s own frame; needs_ext = the tall crop needs canvas (one Gemini-extended master, marked AI-extended).',
  generated: new Date().toISOString(), speakers: Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b))) };
if (!dry) writeFileSync(OUT, `${JSON.stringify(doc, null, 1)}\n`);
console.log(JSON.stringify(report, null, 1));
