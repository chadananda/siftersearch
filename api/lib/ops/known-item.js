// KNOWN-ITEM test (Chad 10-16, priority 1: "basic vector and keyword indexing on paragraphs and phrases and words so we can
// actually find something we already know exists"). Random real paragraphs per tradition × doctrinal core; a short fragment
// of each is searched on every retrieval layer; found = the paragraph (or an identical copy) in the top 10. → recall per
// layer per bucket + the misses to read. Pure parts exported for tests; the layers are injected.
import { getAuthority } from '../authority.js';

const CORE = 8;
const clean = (t) => String(t || '').replace(/⁅\/?[a-z]?\d*⁆/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** A searchable fragment: `words` consecutive words from the middle (the whole text when short). */
export function fragmentOf(text, words = 10, rand = Math.random) {
  const w = clean(text).split(' ').filter(Boolean);
  if (w.length <= words + 4) return w.join(' ');
  const start = 2 + Math.floor(rand() * (w.length - words - 4));
  return w.slice(start, start + words).join(' ');
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

/** Recall summary per bucket × layer from per-query results. */
export function summarize(results, layers) {
  const buckets = new Map();
  for (const r of results) {
    const k = `${r.religion}|${r.core ? 'core' : 'other'}`;
    const b = buckets.get(k) || { religion: r.religion, core: r.core, n: 0, layers: Object.fromEntries(layers.map((l) => [l, { at1: 0, at10: 0, ms: 0, errors: 0 }])) };
    b.n++;
    for (const l of layers) {
      const x = r.layers[l]; const s = b.layers[l];
      if (!x || x.error) { s.errors++; continue; }
      if (x.rank === 1) s.at1++;
      if (x.rank > 0) s.at10++;
      s.ms += x.ms;
    }
    buckets.set(k, b);
  }
  return [...buckets.values()].map((b) => ({ religion: b.religion, core: b.core, n: b.n,
    layers: Object.fromEntries(Object.entries(b.layers).map(([l, s]) => [l, { recall_at_1: +(s.at1 / b.n).toFixed(3), recall_at_10: +(s.at10 / b.n).toFixed(3), avg_ms: Math.round(s.ms / Math.max(1, b.n - s.errors)), errors: s.errors }])) }))
    .sort((a, b) => a.religion.localeCompare(b.religion) || b.core - a.core);
}

/** Run the test. deps: { religions, docsOfReligion, paragraphAt, hashesByIds, layers: { name: async (q) => [ids] } } */
export async function knownItemTest({ perBucket = 15, words = 10, rand = Math.random } = {}, deps) {
  const layerNames = Object.keys(deps.layers);
  const results = [];
  for (const religion of deps.religions) {
    const docs = await deps.docsOfReligion(religion);
    const byTier = { core: docs.filter((d) => { try { return getAuthority(d) >= CORE; } catch { return false; } }) };
    byTier.other = docs.filter((d) => !byTier.core.includes(d));
    for (const [tier, pool] of Object.entries(byTier)) {
      if (!pool.length) continue;
      for (let i = 0, tries = 0; i < perBucket && tries < perBucket * 4; tries++) {
        const d = pickDoc(pool, rand);
        const p = await deps.paragraphAt(d.id, Math.floor(rand() * (d.paragraph_count || 1)));
        if (!p || clean(p.text).length < 60 || (p.blocktype && p.blocktype !== 'paragraph')) continue;
        i++;
        const q = fragmentOf(p.text, words, rand);
        const row = { religion, core: tier === 'core', doc_id: d.id, title: d.title, paragraph_id: p.id, query: q, layers: {} };
        const lists = await Promise.all(layerNames.map(async (l) => {
          const t0 = Date.now();
          try { return { l, ids: (await deps.layers[l](q)).slice(0, 10), ms: Date.now() - t0 }; } catch (err) { return { l, error: String(err.message).slice(0, 120), ms: Date.now() - t0 }; }
        }));
        const hashes = await deps.hashesByIds(lists.flatMap((x) => x.ids || []));
        for (const x of lists) row.layers[x.l] = x.error ? { error: x.error, ms: x.ms } : { rank: rankOf(x.ids, p, hashes), ms: x.ms };
        results.push(row);
      }
    }
  }
  const misses = results.filter((r) => layerNames.every((l) => !(r.layers[l]?.rank > 0))).slice(0, 40)
    .map((r) => ({ religion: r.religion, core: r.core, title: r.title, paragraph_id: r.paragraph_id, query: r.query }));
  const weak = results.filter((r) => r.layers.production && !(r.layers.production.rank > 0) && layerNames.some((l) => r.layers[l]?.rank > 0)).slice(0, 40)
    .map((r) => ({ religion: r.religion, title: r.title, paragraph_id: r.paragraph_id, query: r.query, found_by: layerNames.filter((l) => r.layers[l]?.rank > 0) }));
  return { per_bucket: perBucket, words, queries: results.length, summary: summarize(results, layerNames), missed_everywhere: misses, production_missed_but_a_layer_found: weak };
}
