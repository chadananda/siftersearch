// Cross-collection dedup CASCADE for donor items (Chad 11-01). Rows (dedup registry ∪ the drive's not-yet-fingerprinted items) are clustered in this order, each pair
// of rows linked by the FIRST step that catches it: library-hash (a file Dewey already holds) · hash (same bytes, on any drive) · normalised-body (same text after frontmatter/
// title page/TOC/index/appendix are cut and case/diacritics/punctuation folded — another format; a fast path, the fuzzy fingerprint is the real test) · title+length (fuzzy main title via dewey/title-index + length within tolerance)
// · fingerprint (MinHash Jaccard >= JACCARD over 3-word shingles — another typist or edition). Pure; the fingerprints come from scripts/media/worker/fingerprint.py on a worker.
// Each cluster keeps its best copy (complete over partial, text layer over scan, then larger); the rest map to it with the step and score that caught them.
import { mainKey, titleScore } from '../dewey/title-index.js';

/** ONE copy per WORK (Chad 11-01): editions, typists, OCR noise, extra prefaces/appendixes/indexes are all the same work. MinHash Jaccard of 3-word shingles >= 0.4 is generous toward
 *  "duplicate": two typings with ~5% differing words score ~0.7, with a preface/index added to one ~0.6, and a text that is only ~40% of the other (a part of a compilation) is the
 *  edge; different works by one author score < 0.15. With 64 values the estimate's standard error is ~0.06, so 0.4 is > 4 sigma above unrelated text. */
export const JACCARD = 0.4;
export const TITLE_MIN = 0.85;
export const STEPS = ['library-hash', 'hash', 'normalised-body', 'title+length', 'fingerprint'];
const BANDS = 32, ROWS = 2;   // 32 bands of 2: a pair at Jaccard 0.4 is a candidate with probability ~99.6%

/** Row from an intake item (a drive's not-yet-fingerprinted file) and from a registry row. */
export const itemRow = (drive, it) => ({ key: `${drive}:${it.primary_rel ?? it.rel}`, id: it.id, drive, rel: it.primary_rel ?? it.rel, title: it.metadata?.catalog?.title || it.sample?.rec?.title || it.title || null,
  bytes: it.bytes || null, cls: it.metadata?.probe?.class || it.cls || null, pages: it.metadata?.probe?.pages || it.pages || null, sha: it.metadata?.probe?.fp?.sha256 || it.metadata?.probe?.sha256 || it.sha || null,
  words: it.metadata?.probe?.fp?.words || null, norm_sha: it.metadata?.probe?.fp?.norm_sha || null, minhash: it.metadata?.probe?.fp?.minhash || null });
export const registryRow = (r) => ({ key: `${r.drive_id}:${r.path}`, id: r.item_id, drive: r.drive_id, rel: r.path, title: r.title, bytes: r.bytes, cls: r.cls, pages: r.pages, sha: r.sha256,
  words: r.words, norm_sha: r.norm_sha, minhash: r.minhash });

const quality = (r) => (r.cls === 'scan' ? 1 : r.cls === 'image_pdf' ? 2 : 3);
const measure = (r) => r.words || r.pages || (r.bytes ? r.bytes / 1e4 : 0);
const sizeAlike = (a, b) => (a.words && b.words ? Math.min(a.words, b.words) / Math.max(a.words, b.words) >= 0.85
  : a.pages && b.pages ? Math.abs(a.pages - b.pages) / Math.max(a.pages, b.pages) <= 0.1 : a.bytes && b.bytes ? Math.min(a.bytes, b.bytes) / Math.max(a.bytes, b.bytes) >= 0.8 : false);
const tier = (r) => (r.words ? ['w', r.words] : r.pages ? ['p', r.pages] : r.bytes ? ['b', r.bytes] : null);
const skel2 = (k) => k.replace(/\b(?:the|a|an|of|and)\b/g, '').replace(/[^a-z]/g, '').replace(/[aeiouy]/g, '').slice(0, 2);
const est = (a, b) => { let n = 0; for (let i = 0; i < 64; i++) if (a.slice(i * 16, i * 16 + 16) === b.slice(i * 16, i * 16 + 16)) n++; return n / 64; };

/**
 * rows → { dups: Map(key → { of, of_id, of_drive, of_rel, step, score }), clusters: [{ keep, members: [{ key, id, drive, rel, step, score }] }], by_step }.
 * libShas = Set of sha256 the library (Dewey) already holds.
 */
export function clusterDuplicates(rows, { libShas = new Set() } = {}) {
  const byKey = new Map(rows.map((r) => [r.key, r])), parent = new Map(rows.map((r) => [r.key, r.key])), edges = [];
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const link = (a, b, step, score) => { if (a === b) return; edges.push({ a, b, step, score: +score.toFixed(3) }); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  const same = (field, step) => { const m = new Map(); for (const r of rows) if (r[field]) { if (m.has(r[field])) link(m.get(r[field]), r.key, step, 1); else m.set(r[field], r.key); } };
  same('sha', 'hash'); same('norm_sha', 'normalised-body');
  // title + length: bucket by the title's consonant start + a length class; compare within a class and its neighbours
  const buckets = new Map(), keyOf = new Map();
  for (const r of rows) {
    const t = tier(r), k = mainKey(r.title || String(r.rel || '').split('/').pop().replace(/\.[^.]+$/, ''));
    if (k.length < 6 || !t) continue;
    keyOf.set(r.key, k);
    const b = `${skel2(k)}|${t[0]}|${Math.floor(Math.log(Math.max(1, t[1])) / Math.log(1.2))}`;
    (buckets.get(b) || buckets.set(b, []).get(b)).push(r);
  }
  for (const [b, list] of buckets) {
    const [s, t, c] = b.split('|'), near = [list, buckets.get(`${s}|${t}|${+c + 1}`) || []];
    list.forEach((r, i) => near.forEach((grp, gi) => grp.forEach((o, j) => {
      if ((gi === 0 && j <= i) || !sizeAlike(r, o)) return;
      const sc = titleScore(keyOf.get(r.key), keyOf.get(o.key));
      if (sc >= TITLE_MIN) link(r.key, o.key, 'title+length', sc);
    })));
  }
  // fingerprint: LSH bands over the MinHash, candidates confirmed by the estimated Jaccard
  const lsh = new Map(), seen = new Set();
  for (const r of rows) if (r.minhash && r.minhash.length >= 64 * 16) for (let b = 0; b < BANDS; b++) {
    const k = `${b}:${r.minhash.slice(b * ROWS * 16, (b + 1) * ROWS * 16)}`; (lsh.get(k) || lsh.set(k, []).get(k)).push(r);
  }
  for (const g of lsh.values()) if (g.length > 1 && g.length <= 60) for (let i = 1; i < g.length; i++) for (let j = 0; j < i; j++) {
    const id = g[j].key < g[i].key ? `${g[j].key}\u0000${g[i].key}` : `${g[i].key}\u0000${g[j].key}`;
    if (seen.has(id)) continue; seen.add(id);
    const jac = est(g[i].minhash, g[j].minhash); if (jac >= JACCARD) link(g[j].key, g[i].key, 'fingerprint', jac);
  }
  const clusters = new Map();
  for (const r of rows) (clusters.get(find(r.key)) || clusters.set(find(r.key), []).get(find(r.key))).push(r);
  const dups = new Map(), out = [], by_step = Object.fromEntries(STEPS.map((s) => [s, 0]));
  const rank = (s) => STEPS.indexOf(s);
  // a file the library already holds is a duplicate of the library's copy, whatever its cluster
  for (const r of rows) if (r.sha && libShas.has(r.sha)) { dups.set(r.key, { of: null, of_id: null, of_drive: null, of_rel: 'library (same file already ingested)', step: 'library-hash', score: 1 }); by_step['library-hash']++; }
  for (const members of clusters.values()) {
    if (members.length < 2) continue;
    const top = Math.max(...members.map(measure)), complete = (r) => measure(r) >= 0.95 * top;
    const keep = [...members].sort((a, b) => complete(b) - complete(a) || quality(b) - quality(a) || measure(b) - measure(a) || (a.key < b.key ? -1 : 1))[0];
    const list = [];
    for (const m of members) {
      if (m === keep) continue;
      const mine = edges.filter((e) => e.a === m.key || e.b === m.key), direct = mine.filter((e) => e.a === keep.key || e.b === keep.key);
      const e = (direct.length ? direct : mine).sort((x, y) => rank(x.step) - rank(y.step) || y.score - x.score)[0];
      list.push({ key: m.key, id: m.id, drive: m.drive, rel: m.rel, title: m.title || null, cls: m.cls || null, step: e.step, score: e.score });
      if (!dups.has(m.key)) { dups.set(m.key, { of: keep.key, of_id: keep.id, of_drive: keep.drive, of_rel: keep.rel, step: e.step, score: e.score }); by_step[e.step]++; }
    }
    // the cluster's own step + score = its weakest link (the member joined by the lowest-ranked step, at the lowest score): what a person should doubt first
    const weak = [...list].sort((x, y) => rank(y.step) - rank(x.step) || x.score - y.score)[0];
    out.push({ keep: { key: keep.key, id: keep.id, drive: keep.drive, rel: keep.rel, title: keep.title || null, cls: keep.cls, size: measure(keep) }, step: weak.step, score: weak.score, members: list });
  }
  return { dups, clusters: out, by_step };
}
