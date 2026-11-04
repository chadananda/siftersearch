// Concept layer on the search hot path (11-03 profile: ~300 ms of blocked event loop per engine call, 2-4 calls per
// planned search, one API process → concurrent searches queued). Indexed lookup must equal the full scan, and be fast.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../api/lib/search.js', () => ({ getMeili: () => null, INDEXES: {} }));

// The pre-11-03 scan, verbatim: the reference the indexed version must reproduce exactly.
const flat = (s) => String(s || '').replace(/⁅[^⁆]*⁆/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’‘`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const STOP = new Set(['the', 'of', 'a', 'an', 'and', 'his', 'her', 'its', 'my', 'thy', 'in', 'to', 'god', "god's"]);
function namedRef(symbol, query) {
  const words = flat(symbol).split(/[^a-z0-9'á-ž]+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return false;
  const q = new Set(flat(query).split(/[^a-z0-9'á-ž]+/).flatMap((w) => [w, w.replace(/'s$/, ''), w.replace(/s$/, '')]));
  return words.every((w) => q.has(w) || q.has(w.replace(/s$/, '')));
}
function scanRef(entries, query, limit = 8) {
  const seen = new Set();
  return entries.filter((h) => h.paragraph_id && namedRef(h.symbol, query))
    .sort((a, b) => (a.authority_tier ?? 99) - (b.authority_tier ?? 99))
    .filter((h) => !seen.has(h.paragraph_id) && seen.add(h.paragraph_id)).slice(0, limit)
    .map((h) => ({ paragraph_id: h.paragraph_id, doc_id: h.proof_doc_id, concept: { symbol: h.symbol, interpretation: h.interpretation, authority: h.authority } }));
}

const VOCAB = ['sun', 'suns', 'moon', 'stars', 'star', 'cloud', 'clouds', 'covenant', 'Covenant', 'light', 'lights', 'tree', 'trees',
  'water', 'Ṭúbá', 'ṭúbá', 'river', 'rivers', 'sea', "god's", 'the', 'of', 'and', 'mirror', 'mirrors', 'veil', 'veils', 'city',
  'cities', 'heaven', 'heavens', 'fire', 'lamp', 'Sinai', 'bird', "bird's", 'birds', 'nightingale', 'a', 'in', 'to', 'ox', 'gas', 'ss', '’s'];
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function makeEntries(n, seed = 7) {
  const r = rng(seed);
  const pick = () => VOCAB[Math.floor(r() * VOCAB.length)];
  return Array.from({ length: n }, (_, i) => ({
    id: i, symbol: Array.from({ length: 1 + Math.floor(r() * 3) }, pick).join(r() < 0.2 ? '-' : ' '),
    interpretation: `i${i}`, authority: 'a', authority_tier: r() < 0.1 ? null : 1 + Math.floor(r() * 4),
    proof_doc_id: 1 + Math.floor(r() * 50), paragraph_id: r() < 0.1 ? null : 1 + Math.floor(r() * (n / 3)),
  }));
}
const QUERIES = ['What does the sun symbolize?', 'the clouds and the stars', "The Covenant of God's Ṭúbá tree", 'suns moons rivers',
  'what is love', 'birds in the city of heavens', "the nightingale's lamp on Sinai", 'mirrors veils fire water sea', '', 'the the the',
  'TUBA tree light', "god's covenant", 'ox gas ss'];

describe('concept layer: indexed lookup = full scan', () => {
  it('returns exactly what the scan returns, for many queries over random entries', async () => {
    const { searchConceptProofs } = await import('../../api/lib/search/concepts.js');
    for (const seed of [1, 2, 3]) {
      const entries = makeEntries(4000, seed);
      for (const q of QUERIES) {
        for (const limit of [3, 8, 50]) {
          const got = (await searchConceptProofs({}, q, { entries, limit })).hits;
          expect(got, `${seed} ${q} ${limit}`).toEqual(q ? scanRef(entries, q, limit) : []);
        }
      }
    }
  });
  it('symbolNamed keeps its meaning', async () => {
    const { symbolNamed } = await import('../../api/lib/search/concepts.js');
    for (const s of VOCAB.concat(['the sun', 'Sun of Truth', 'the Tree of Life', 'birds of heaven'])) {
      for (const q of QUERIES) expect(symbolNamed(s, q), `${s} | ${q}`).toBe(namedRef(s, q));
    }
  });
});

describe('concept layer is cheap on the event loop', () => {
  it('30,000 entries: a query costs a few ms, not hundreds', async () => {
    const { searchConceptProofs } = await import('../../api/lib/search/concepts.js');
    const entries = makeEntries(30000, 11).map((e, i) => ({ ...e, symbol: `${e.symbol} w${i % 9000}` }));
    await searchConceptProofs({}, 'warm the index', { entries });
    const t0 = performance.now();
    for (const q of QUERIES) await searchConceptProofs({}, q, { entries });
    const per = (performance.now() - t0) / QUERIES.length;
    expect(per).toBeLessThan(5);
  });
});
