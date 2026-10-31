// Library-wide content index for duplicate talks (Chad 10-31: "two talks that are the same have largely the same content").
// A talk's sketch = the 32-bit hashes of its word 5-grams, keeping 1 in KEEP chosen by hash (two copies keep the same ones).
// Sketch grams shared by few talks (≤ RARE) → candidate pairs; the gate (dedupe.js confirmPair) decides. Never length/title/date.
// Persisted at data/run/media-content-sketch.json (ids + base64 Uint32Array) so a restart re-reads only changed transcripts.
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { words } from './preview.js';

const GRAM = 5;
export const KEEP = 16;
export const RARE = 12;          // a gram in more talks than this is a common phrase or a much-quoted passage, not evidence
export const MIN_SHARED = 3, SHARE = 0.2;   // candidate: ≥ 3 rare sketch grams and ≥ 20 % of the smaller sketch (the gate wants 50 %)
export const SKETCH_FILE = join(dirname(fileURLToPath(import.meta.url)), '../../../data/run/media-content-sketch.json');

/** FNV-1a, 32-bit. */
export function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** transcript text → sorted unique sampled gram hashes */
export function sketch(text) {
  const ws = words(text), s = new Set();
  for (let i = 0; i + GRAM <= ws.length; i++) { const h = hash32(ws.slice(i, i + GRAM).join(' ')); if (h % KEEP === 0) s.add(h); }
  return Uint32Array.from([...s].sort((a, b) => a - b));
}

/** Map id → hashes → postings (gram → ids), rare grams only. */
export function postingsOf(sketches) {
  const post = new Map();
  for (const [id, hs] of sketches) for (const h of hs) { const l = post.get(h); if (l) l.push(id); else post.set(h, [id]); }
  for (const [h, l] of post) if (l.length > RARE) post.set(h, null);
  return post;
}
const enough = (n, a, b) => n >= Math.max(MIN_SHARED, SHARE * Math.min(a, b));

/** Every candidate pair in the library → [{ a, b, shared }] (a < b). */
export function candidatePairs(sketches, post = postingsOf(sketches)) {
  const counts = new Map();
  for (const l of post.values()) {
    if (!l || l.length < 2) continue;
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
      const [a, b] = l[i] < l[j] ? [l[i], l[j]] : [l[j], l[i]], k = `${a}|${b}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  const out = [];
  for (const [k, n] of counts) { const [a, b] = k.split('|').map(Number); if (enough(n, sketches.get(a).length, sketches.get(b).length)) out.push({ a, b, shared: n }); }
  return out;
}
/** One talk's sketch against the index → [{ id, shared }], most shared first. */
export function candidatesFor(hs, sketches, post, { excludeId = null } = {}) {
  const counts = new Map();
  for (const h of hs) { const l = post.get(h); if (!l) continue; for (const id of l) if (id !== excludeId) counts.set(id, (counts.get(id) || 0) + 1); }
  // a gram already in RARE talks plus this one would cross the limit: still counted (the new talk is not in the index yet)
  return [...counts].filter(([id, n]) => enough(n, hs.length, sketches.get(id).length)).map(([id, shared]) => ({ id, shared })).sort((x, y) => y.shared - x.shared);
}

// ── persistence
const enc = (u) => Buffer.from(u.buffer, u.byteOffset, u.byteLength).toString('base64');
const dec = (s) => { const b = Buffer.from(s, 'base64'); return new Uint32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
/** → { items: Map id → { stamp, hs } } */
export async function loadSketches(file = SKETCH_FILE) {
  const { readFile } = await import('fs/promises');
  const j = JSON.parse(await readFile(file, 'utf8').catch(() => 'null'));
  const items = new Map();
  if (j?.keep === KEEP) for (const [id, v] of Object.entries(j.items || {})) items.set(Number(id), { stamp: v.s, hs: dec(v.h) });
  return { items };
}
export async function saveSketches(items, file = SKETCH_FILE) {
  const { writeFile, rename, mkdir } = await import('fs/promises');
  await mkdir(dirname(file), { recursive: true });
  const t = `${file}.${process.pid}.tmp`;
  await writeFile(t, JSON.stringify({ keep: KEEP, at: new Date().toISOString(), items: Object.fromEntries([...items].map(([id, v]) => [id, { s: v.stamp, h: enc(v.hs) }])) }));
  await rename(t, file);
}

let CACHE = null;   // { mtime, sketches, post } — the preview stage's view, rebuilt when the 15-minute run rewrites the file
/** Intake: text → candidate talk ids (content only), from the last saved index. */
export async function contentCandidates(text, { excludeId = null, file = SKETCH_FILE } = {}) {
  const { stat } = await import('fs/promises');
  const st = await stat(file).catch(() => null);
  if (!st) return [];
  if (!CACHE || CACHE.mtime !== st.mtimeMs || CACHE.file !== file) {
    const { items } = await loadSketches(file);
    const sketches = new Map([...items].map(([id, v]) => [id, v.hs]));
    CACHE = { file, mtime: st.mtimeMs, sketches, post: postingsOf(sketches) };
  }
  const hs = sketch(text);
  return hs.length ? candidatesFor(hs, CACHE.sketches, CACHE.post, { excludeId: excludeId == null ? null : Number(excludeId) }) : [];
}
