// KNOWN-ITEM test (Chad 10-16, priority 1: "basic vector and keyword indexing on paragraphs and phrases and words so we can
// actually find something we already know exists"). Random real paragraphs per tradition × doctrinal core; each is searched
// on every retrieval layer with what a reader actually brings (Chad: "people will recall two or three [words], often
// misspelled, often one semantically correct and two literally correct"):
//   exact10 — ten consecutive words (a lookup)        words3 — the three most distinctive words of a short stretch
//   typo3   — the same three, misspelled / unaccented  recall — a half-remembered phrase (2 literal + 1 synonym), by Haiku
// found = the paragraph (or an identical copy) in the top N. → recall@1/@10/@30 per variant × layer (and per bucket), misses.
// Pure parts exported for tests; layers and the recall writer are injected.
import { getAuthority } from '../authority.js';

const CORE = 8;
export const VARIANTS = ['exact10', 'words3', 'typo3', 'recall'];
const STOP = new Set(('the of and a an to in on at for by with from is are be as that this which who whom what his her their its it he she they we you ye thou thee thy o ' +
  'not no nor but or so if then than there these those all any every each such shall will hath have has had was were been unto upon into').split(' '));
const clean = (t) => String(t || '').replace(/⁅\/?[a-z]?\d*⁆/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const bare = (w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** Ten consecutive words from the middle (the whole text when short). */
export function fragmentOf(text, words = 10, rand = Math.random) {
  const w = clean(text).split(' ').filter(Boolean);
  if (w.length <= words + 4) return w.join(' ');
  const start = 2 + Math.floor(rand() * (w.length - words - 4));
  return w.slice(start, start + words).join(' ');
}

/** The three most distinctive words (longest, not function words) of an 8-word stretch, in their order. */
export function distinctive3(text, rand = Math.random) {
  const w = clean(text).split(' ').map(bare).filter(Boolean);
  const start = w.length > 8 ? Math.floor(rand() * (w.length - 8)) : 0;
  const win = w.slice(start, start + 8).map((x, i) => ({ x, i })).filter(({ x }) => !STOP.has(x.toLowerCase()) && x.length > 2);
  return win.sort((a, b) => b.x.length - a.x.length).slice(0, 3).sort((a, b) => a.i - b.i).map(({ x }) => x).join(' ');
}

/** A reader's spelling: accents dropped, and one slip (dropped / swapped / doubled letter) in each word of 5+ letters. */
export function misspell(phrase, rand = Math.random) {
  return phrase.split(' ').map((w) => {
    let x = w.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘'ʼʿʾ]/g, '');
    if (x.length < 5) return x;
    const i = 1 + Math.floor(rand() * (x.length - 2)), op = Math.floor(rand() * 3);
    if (op === 0) x = x.slice(0, i) + x.slice(i + 1);
    else if (op === 1) x = x.slice(0, i) + x[i + 1] + x[i] + x.slice(i + 2);
    else x = x.slice(0, i) + x[i] + x.slice(i);
    return x;
  }).join(' ');
}

/** Rank (1-based) of the target in a hit list, by id or identical text hash; 0 when absent. */
export function rankOf(hitIds, target, hashOf = new Map()) {
  for (let i = 0; i < hitIds.length; i++) {
    const id = Number(hitIds[i]);
    if (id === target.id || (target.normalized_hash && hashOf.get(id) === target.normalized_hash)) return i + 1;
  }
  return 0;
}

/** Paragraph-weighted random pick of a document. */
export function pickDoc(docs, rand = Math.random) {
  const total = docs.reduce((n, d) => n + (d.paragraph_count || 0), 0);
  let x = rand() * total;
  for (const d of docs) { x -= d.paragraph_count || 0; if (x <= 0) return d; }
  return docs[docs.length - 1];
}

/** Recall per variant × layer, overall and per bucket. results: [{ religion, core, variants: { v: { layers: { l: { rank, ms, error } } } } }] */
export function summarize(results, layers) {
  const acc = () => Object.fromEntries(layers.map((l) => [l, { n: 0, at1: 0, at10: 0, at30: 0, ms: 0, errors: 0 }]));
  const add = (s, x) => { if (!x || x.error) { s.errors++; return; } s.n++; s.ms += x.ms; if (x.rank === 1) s.at1++; if (x.rank && x.rank <= 10) s.at10++; if (x.rank) s.at30++; };
  const out = (a) => Object.fromEntries(Object.entries(a).map(([l, s]) => [l, { n: s.n, recall_at_1: +(s.at1 / Math.max(1, s.n)).toFixed(3),
    recall_at_10: +(s.at10 / Math.max(1, s.n)).toFixed(3), recall_at_30: +(s.at30 / Math.max(1, s.n)).toFixed(3), avg_ms: Math.round(s.ms / Math.max(1, s.n)), errors: s.errors }]));
  const overall = {}, buckets = new Map();
  for (const r of results) {
    const bk = `${r.religion}|${r.core ? 'core' : 'other'}`;
    const b = buckets.get(bk) || { religion: r.religion, core: r.core, n: 0, v: {} };
    b.n++;
    for (const [v, x] of Object.entries(r.variants)) {
      overall[v] ||= acc(); b.v[v] ||= acc();
      for (const l of layers) { add(overall[v][l], x.layers[l]); add(b.v[v][l], x.layers[l]); }
    }
    buckets.set(bk, b);
  }
  return {
    overall: Object.fromEntries(Object.entries(overall).map(([v, a]) => [v, out(a)])),
    buckets: [...buckets.values()].map((b) => ({ religion: b.religion, core: b.core, n: b.n, variants: Object.fromEntries(Object.entries(b.v).map(([v, a]) => [v, out(a)])) }))
      .sort((a, b) => a.religion.localeCompare(b.religion) || b.core - a.core),
  };
}

/** Run the test. deps: { religions, docsOfReligion, paragraphAt, hashesByIds, layers: { name: async (q) => [ids] }, recall?: async (text) => phrase } */
// Readers "are almost always thinking of a passage in Gleanings or the Gospel of John" (Chad 10-16): the doctrinal core is
// sampled coreWeight× as heavily, and its recall is the one that matters most.
export async function knownItemTest({ perBucket = 10, coreWeight = 3, depth = 30, variants = VARIANTS, rand = Math.random } = {}, deps) {
  const layerNames = Object.keys(deps.layers);
  const want = variants.filter((v) => v !== 'recall' || deps.recall);
  const results = [];
  for (const religion of deps.religions) {
    const docs = await deps.docsOfReligion(religion);
    const core = docs.filter((d) => { try { return getAuthority(d) >= CORE; } catch { return false; } });
    const coreIds = new Set(core.map((d) => d.id));
    for (const [tier, pool] of [['core', core], ['other', docs.filter((d) => !coreIds.has(d.id))]]) {
      if (!pool.length) continue;
      const n = tier === 'core' ? perBucket * coreWeight : perBucket;
      for (let i = 0, tries = 0; i < n && tries < n * 4; tries++) {
        const d = pickDoc(pool, rand);
        const p = await deps.paragraphAt(d.id, Math.floor(rand() * (d.paragraph_count || 1)));
        if (!p || clean(p.text).length < 80 || (p.blocktype && p.blocktype !== 'paragraph')) continue;
        i++;
        const w3 = distinctive3(p.text, rand);
        const queries = { exact10: fragmentOf(p.text, 10, rand), words3: w3, typo3: misspell(w3, rand) };
        if (want.includes('recall')) queries.recall = await deps.recall(clean(p.text).slice(0, 1200)).catch(() => null);
        const row = { religion, core: tier === 'core', doc_id: d.id, title: d.title, paragraph_id: p.id, variants: {} };
        for (const v of want) {
          const q = queries[v];
          if (!q) continue;
          const lists = await Promise.all(layerNames.map(async (l) => {
            const t0 = Date.now();
            try { return { l, ids: (await deps.layers[l](q, depth)).slice(0, depth), ms: Date.now() - t0 }; } catch (err) { return { l, error: String(err.message).slice(0, 120), ms: Date.now() - t0 }; }
          }));
          const hashes = await deps.hashesByIds(lists.flatMap((x) => x.ids || []));
          row.variants[v] = { query: q, layers: Object.fromEntries(lists.map((x) => [x.l, x.error ? { error: x.error, ms: x.ms } : { rank: rankOf(x.ids, p, hashes), ms: x.ms }])) };
          // one line per probe for the Observatory terminal (queries come from library text, never from readers)
          const pr = row.variants[v].layers.production;
          // the query is isolated (U+2068 … U+2069) so an Arabic or Hebrew query cannot reorder the line around it
          deps.log?.(`${v} "\u2068${String(q).slice(0, 48)}\u2069" → ${pr?.rank ? `#${pr.rank}` : pr?.error ? 'error' : `not in top ${depth}`} · ${String(d.title || '').slice(0, 40)} · ${pr?.ms ?? '—'} ms`);
        }
        results.push(row);
      }
    }
  }
  // the production misses a reader would hit, with the query, per variant (what to fix next)
  const misses = {};
  for (const v of want) {
    misses[v] = results.filter((r) => r.variants[v] && !(r.variants[v].layers.production?.rank > 0)).slice(0, 15)
      .map((r) => ({ religion: r.religion, core: r.core, title: r.title, paragraph_id: r.paragraph_id, query: r.variants[v].query,
        found_by: layerNames.filter((l) => r.variants[v].layers[l]?.rank > 0) }));
  }
  return { per_bucket: perBucket, depth, paragraphs: results.length, variants: want, ...summarize(results, layerNames), production_misses: misses };
}
