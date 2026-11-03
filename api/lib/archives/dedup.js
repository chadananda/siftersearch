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
// volume / part numbers (1–3 digits, from title and file name; years are editions, not volumes): both numbered and none shared = another volume of a series
// (11-03: "Witnesses 1: Genesis" had been a title+length copy of "Witnesses 3 Muayyad")
const volNums = (r) => { const f = String(r.rel || '').split('/').pop().replace(/\.[^.]+$/, ''); return new Set(`${r.title || ''} ${/[a-z]/i.test(f) ? f : ''}`.match(/(?<![\d])\d{1,3}(?![\d])/g) || []); };   // a bare-number file name (1.pdf) says nothing
const otherVolume = (a, b) => { const A = volNums(a), B = volNums(b); return A.size > 0 && B.size > 0 && ![...A].some((n) => B.has(n)); };
const est = (a, b) => { let n = 0; for (let i = 0; i < 64; i++) if (a.slice(i * 16, i * 16 + 16) === b.slice(i * 16, i * 16 + 16)) n++; return n / 64; };

/**
 * rows → { dups: Map(key → { of, of_id, of_drive, of_rel, step, score }), clusters: [{ keep, members: [{ key, id, drive, rel, step, score }] }], by_step }.
 * libShas = Set of sha256 the library (Dewey) already holds.
 * Exact steps (hash, normalised body) join copies freely. The fuzzy steps (title+length, fingerprint) never chain: a copy joins a cluster only by its OWN match to the
 * cluster's centre (the largest copy), so A~B and B~C no longer make A a duplicate of C. (11-03: chaining had made one golden-age cluster of 3,461 unrelated newspapers
 * and books — the 1915 Íqán and the 1939 Prayers "duplicates" of a German text.) The fingerprint needs MIN_WORDS on both sides: short or OCR-garbage text is noise.
 */
export const MIN_WORDS = 300;
export function clusterDuplicates(rows, { libShas = new Set() } = {}) {
  const parent = new Map(rows.map((r) => [r.key, r.key])), weak = [], edges = [];
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const rank = (s) => STEPS.indexOf(s), better = (x, y) => rank(x.step) - rank(y.step) || y.score - x.score;
  const same = (field, step) => { const m = new Map(); for (const r of rows) if (r[field]) { if (m.has(r[field])) { const a = m.get(r[field]); edges.push({ a, b: r.key, step, score: 1 }); const ra = find(a), rb = find(r.key); if (ra !== rb) parent.set(rb, ra); } else m.set(r[field], r.key); } };
  const link = (a, b, step, score) => { if (a !== b) weak.push({ a, b, step, score: +score.toFixed(3) }); };
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
      if ((gi === 0 && j <= i) || !sizeAlike(r, o) || otherVolume(r, o)) return;
      const sc = titleScore(keyOf.get(r.key), keyOf.get(o.key));
      if (sc >= TITLE_MIN) link(r.key, o.key, 'title+length', sc);
    })));
  }
  // fingerprint: LSH bands over the MinHash, candidates confirmed by the estimated Jaccard
  const lsh = new Map(), seen = new Set();
  for (const r of rows) if (r.minhash && r.minhash.length >= 64 * 16 && (r.words || 0) >= MIN_WORDS) for (let b = 0; b < BANDS; b++) {
    const k = `${b}:${r.minhash.slice(b * ROWS * 16, (b + 1) * ROWS * 16)}`; (lsh.get(k) || lsh.set(k, []).get(k)).push(r);
  }
  for (const g of lsh.values()) if (g.length > 1 && g.length <= 60) for (let i = 1; i < g.length; i++) for (let j = 0; j < i; j++) {
    const id = g[j].key < g[i].key ? `${g[j].key}\u0000${g[i].key}` : `${g[i].key}\u0000${g[j].key}`;
    if (seen.has(id)) continue; seen.add(id);
    const jac = est(g[i].minhash, g[j].minhash); if (jac >= JACCARD) link(g[j].key, g[i].key, 'fingerprint', jac);
  }
  // exact copies → components; each component's best fuzzy edge to every other component
  const comps = new Map();
  for (const r of rows) (comps.get(find(r.key)) || comps.set(find(r.key), []).get(find(r.key))).push(r);
  const cw = new Map();   // compA → Map(compB → best edge)
  for (const e of weak) {
    const ca = find(e.a), cb = find(e.b); if (ca === cb) continue;
    for (const [x, y] of [[ca, cb], [cb, ca]]) { const m = cw.get(x) || cw.set(x, new Map()).get(x); if (!m.has(y) || better(e, m.get(y)) < 0) m.set(y, e); }
  }
  // star clusters: the largest unassigned component is a centre and takes every unassigned component with a DIRECT fuzzy edge to it
  const size = (c) => Math.max(...comps.get(c).map(measure)), order = [...comps.keys()].sort((x, y) => size(y) - size(x) || (x < y ? -1 : 1)), owner = new Map();
  const clusters = [];
  for (const c of order) {
    if (owner.has(c)) continue;
    owner.set(c, c); const sat = [];
    for (const [o, e] of cw.get(c) || []) if (!owner.has(o)) { owner.set(o, c); sat.push([o, e]); }
    clusters.push({ centre: c, sat });
  }
  const dups = new Map(), out = [], by_step = Object.fromEntries(STEPS.map((s) => [s, 0]));
  // a file the library already holds is a duplicate of the library's copy, whatever its cluster
  for (const r of rows) if (r.sha && libShas.has(r.sha)) { dups.set(r.key, { of: null, of_id: null, of_drive: null, of_rel: 'library (same file already ingested)', step: 'library-hash', score: 1 }); by_step['library-hash']++; }
  for (const { centre, sat } of clusters) {
    const members = [...comps.get(centre), ...sat.flatMap(([o]) => comps.get(o))];
    if (members.length < 2) continue;
    const top = Math.max(...members.map(measure)), complete = (r) => measure(r) >= 0.95 * top;
    const keep = [...members].sort((a, b) => complete(b) - complete(a) || quality(b) - quality(a) || measure(b) - measure(a) || (a.key < b.key ? -1 : 1))[0];
    const kc = find(keep.key), viaCentre = new Map(sat), exact = (m) => edges.filter((e) => e.a === m.key || e.b === m.key).sort(better)[0];
    const list = [];
    for (const m of members) {
      if (m === keep) continue;
      const mc = find(m.key);
      // same component as the keep: an exact copy · otherwise the fuzzy edge that joined its component to the keep's (directly, or each to the centre)
      const e = mc === kc ? exact(m) : kc === centre ? viaCentre.get(mc) : mc === centre ? viaCentre.get(kc) : [viaCentre.get(mc), viaCentre.get(kc)].sort(better).pop();
      list.push({ key: m.key, id: m.id, drive: m.drive, rel: m.rel, title: m.title || null, cls: m.cls || null, step: e.step, score: e.score });
      if (!dups.has(m.key)) { dups.set(m.key, { of: keep.key, of_id: keep.id, of_drive: keep.drive, of_rel: keep.rel, step: e.step, score: e.score }); by_step[e.step]++; }
    }
    // the cluster's own step + score = its weakest link (the member joined by the lowest-ranked step, at the lowest score): what a person should doubt first
    const weakest = [...list].sort((x, y) => rank(y.step) - rank(x.step) || x.score - y.score)[0];
    out.push({ keep: { key: keep.key, id: keep.id, drive: keep.drive, rel: keep.rel, title: keep.title || null, cls: keep.cls, size: measure(keep) }, step: weakest.step, score: weakest.score, members: list });
  }
  return { dups, clusters: out, by_step };
}
