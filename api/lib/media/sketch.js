// SPEAKER SKETCHES (Chad 10-23: "pen and ink drawings in a courtroom art style of each person … style consistency"): one
// AI-rendered pen-and-ink portrait per speaker, drawn image-to-image from a verified gallery photo (scripts/media/
// speaker_sketch.py → speaker_sketch_publish.mjs → data/media-speaker-sketches.json; masters in the cdn-assets R2 bucket).
// The drawing is the PRIMARY portrait wherever a speaker is shown; the real photos stay one tap away with their credits.
import { readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CDN } from './gallery.js';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', 'media-speaker-sketches.json');
const FILE_RE = /^media-speakers\/[a-z0-9-]+\/sketch(?:-sq)?-[a-f0-9]{16,64}\.jpe?g$/;

/** One manifest entry → the sketch as pages use it, or null when the entry is unusable. Pure. */
export function shapeSketch(e) {
  if (!e || !FILE_RE.test(e.file || '') || !FILE_RE.test(e.sq_file || '') || !/^[0-9a-f]{16,64}$/.test(e.sha || '') || !/^[0-9a-f]{16,64}$/.test(e.sq_sha || '')) return null;
  if (!e.source_sha) return null;   // never a drawing without the verified photo it was drawn from
  return { url: `${CDN}${e.file}?v=${e.sha.slice(0, 16)}`, square: `${CDN}${e.sq_file}?v=${e.sq_sha.slice(0, 16)}`, width: e.width || 768, height: e.height || 1376,
    ai_rendered: true, model: e.model || null, source_sha: e.source_sha, source_credit: e.source_credit || null };
}

/** A database speaker row produced by the automatic sketch pipeline, or null before a likeness-approved drawing exists. */
export function speakerSketch(row) {
  if (!row?.sketch_file) return null;
  return shapeSketch({
    file: row.sketch_file, sha: row.sketch_sha, sq_file: row.sketch_sq_file, sq_sha: row.sketch_sq_sha,
    width: row.sketch_width, height: row.sketch_height, source_sha: row.sketch_source_sha,
    source_credit: row.sketch_source_credit, model: row.sketch_model,
  });
}

/** Prefer the live pipeline row; retain the checked-in manifest as a compatibility fallback for existing drawings. */
export const speakerSketchOrStatic = (row, map = loadSketches()) => speakerSketch(row) || sketchOf(row?.key, map);

let cache = { mtime: 0, map: new Map() };
/** The manifest (re-read when the file changes) → Map key → sketch. A missing or broken file means no sketches. */
export function loadSketches(file = FILE) {
  try {
    const m = statSync(file).mtimeMs;
    if (m !== cache.mtime) {
      const j = JSON.parse(readFileSync(file, 'utf8'));
      cache = { mtime: m, map: new Map(Object.entries(j.speakers || {}).map(([k, e]) => [k, shapeSketch(e)]).filter(([, s]) => s)) };
    }
  } catch { cache = { mtime: 0, map: new Map() }; }
  return cache.map;
}

export const sketchOf = (key, map = loadSketches()) => (key ? map.get(key) || null : null);
