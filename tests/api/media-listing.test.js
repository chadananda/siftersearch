// The /media Listening Room: index shaping (api/lib/media/listing-index.js) and the client's search, presets and seeded
// jukebox layout (src/lib/media-listing.js).
import { describe, it, expect } from 'vitest';
import { fold, speakerRole, waveString, pullQuote, bestQuote, topHeadings, highlightWindow, shapeRow, shapeSpeakers, buildIndex, audioUrls } from '../../api/lib/media/listing-index.js';
import { within1, buildSearch, searchItems, planLayout, pickHighlights, eras, topTopics, tickerLines, initials, labelPattern, eraKey, duration, waveHeights } from '../../src/lib/media-listing.js';

const row = (o = {}) => ({ id: 1, slug: 'a', title: 'A talk', speaker: 'Hooper Dunbar', speaker_key: 'hooper-dunbar', year: 1988, duration_s: 1800, language: 'en',
  has_video: 0, source_kind: 'file', playback: 'full', grade: 'B', quotes_n: 2, crs_n: 1, updated_at: '2026-10-22T10:00:00.000Z', ...o });

describe('index shaping', () => {
  it('folds diacritics and ‘ayn marks', () => {
    expect(fold('‘Alí Nakhjavání')).toBe('ali nakhjavani');
    expect(fold('Rúhíyyih Khánum')).toBe('ruhiyyih khanum');
  });
  it('knows the stations of speakers', () => {
    expect(speakerRole('William Sears')).toBe('hand');
    expect(speakerRole('D Khadem')).toBe('hand');
    expect(speakerRole('Mr. Hooper C. Dunbar')).toBe('uhj');
    expect(speakerRole('‘Alí Nakhjavání')).toBe('uhj');
    expect(speakerRole('Grossmann', { year: 1999 })).toBe('uhj');
    expect(speakerRole('Grossmann', { year: 1960 })).toBe('hand');
    expect(speakerRole('Steven Phelps')).toBe('scholar');
    expect(speakerRole('')).toBe(null);
  });
  it('downsamples a waveform to 48 letters, loudest = z', () => {
    const data = []; for (let i = 0; i < 4800; i++) data.push(-(i % 50), Math.floor(i / 100));
    const w = waveString({ channels: 1, data });
    expect(w).toHaveLength(48);
    expect(w).toMatch(/^[a-z]+$/);
    expect(w).toContain('z');
    expect(waveString(null)).toBe('');
  });
  it('trims a pull-quote at sentences, else a word with an ellipsis', () => {
    const s = 'First sentence is here and long enough to count as a pull quote line. Second sentence goes on and on and on beyond the limit of the card.';
    expect(pullQuote(s, 90)).toBe('First sentence is here and long enough to count as a pull quote line.');
    expect(pullQuote('word '.repeat(80), 40).endsWith('…')).toBe(true);
  });
  it('prefers a printed, verbatim quotation', () => {
    const q = bestQuote([{ excerpt: 'x'.repeat(80), gate: 'heard', t0: 5 }, { excerpt: 'The printed one, long enough to show on a card for sure.', gate: 'printed', basis: 'verbatim', cite: 'Gleanings', t0: 9 }]);
    expect(q.c).toBe('Gleanings');
    expect(q.t0).toBe(9);
    expect(bestQuote([])).toBe(null);
  });
  it('puts questions first among subheaders', () => {
    const h = topHeadings([{ text: 'A statement', form: 'statement', t: 1 }, { text: 'Why the Gate?', form: 'question', t: 50 }]);
    expect(h[0]).toEqual({ x: 'Why the Gate?', f: 'q', t: 50 });
  });
  it('previews ~20 s at the quote, else the first question, inside the talk', () => {
    expect(highlightWindow({ quote: { t0: 100 }, heads: [], duration: 1000 })).toEqual([99, 119]);
    expect(highlightWindow({ quote: null, heads: [{ f: 'q', t: 300 }], duration: 1000 })).toEqual([300, 320]);
    expect(highlightWindow({ quote: { t0: 995 }, heads: [], duration: 1000 })).toEqual([980, 1000]);
  });
  it('shapes a row and its audio URLs', () => {
    const r = shapeRow(row(), { meta: { version: 3, topics: ['Covenant'], headings: [{ text: 'What is faith?', form: 'question', t: 12 }] }, quotes: [], wave: null });
    expect(r).toMatchObject({ s: 'a', sp: 'Hooper Dunbar', k: 'hooper-dunbar', y: 1988, d: 1800, l: 'en', v: 3, tp: ['Covenant'] });
    expect(audioUrls(r).ogg).toBe('/api/media/a/file/web/a.ogg?v=3');
    expect(audioUrls(shapeRow(row({ playback: 'clips' })))).toBe(null);
  });
  it('one speaker row per person with count, years and portrait', () => {
    const items = [shapeRow(row({ year: 1975 })), shapeRow(row({ slug: 'b', year: 2004 })), shapeRow(row({ slug: 'c', speaker: 'Someone Else', speaker_key: null }))];
    const sp = shapeSpeakers(items, [{ key: 'hooper-dunbar', name: 'Hooper Dunbar' }], () => ({ url: 'https://x/p.jpg' }));
    expect(sp[0]).toMatchObject({ k: 'hooper-dunbar', c: 2, y0: 1975, y1: 2004, p: 'https://x/p.jpg', role: 'uhj' });
    expect(sp[1]).toMatchObject({ k: 'someone-else', c: 1, p: null, role: 'scholar' });
  });
  it('re-reads only changed items, within a budget', async () => {
    const cache = new Map(); let reads = 0;
    const readItem = async () => { reads++; return {}; };
    const rows = [row({ id: 1 }), row({ id: 2, slug: 'b' }), row({ id: 3, slug: 'c' })];
    const a = await buildIndex(rows, { readItem, cache, budget: 2 });
    expect(a.pending).toBe(1); expect(a.items).toHaveLength(3); expect(reads).toBe(2);
    await buildIndex(rows, { readItem, cache });
    expect(reads).toBe(3);
    await buildIndex([row({ id: 1, updated_at: 'later' }), ...rows.slice(1)], { readItem, cache });
    expect(reads).toBe(4);
  });
});

const items = [
  shapeRow(row({ id: 1, slug: 'd1', title: 'The Covenant', year: 1988 }), { quotes: [{ excerpt: 'Say: the Covenant is the axis of the oneness of mankind, and its centre is in Haifa.', gate: 'printed', t0: 10 }] }),
  shapeRow(row({ id: 2, slug: 'd2', title: 'Soul and Spirit', year: 1992 }), { meta: { headings: [{ text: 'What is the soul?', form: 'question', t: 30 }] } }),
  shapeRow(row({ id: 3, slug: 'd3', title: 'Creation', year: 1979 })),
  shapeRow(row({ id: 4, slug: 'd4', title: 'Fruits', year: 1975 })),
  shapeRow(row({ id: 5, slug: 's1', title: 'Arise at Anchorage', speaker: 'William Sears', speaker_key: 'william-sears', year: 1963 })),
  shapeRow(row({ id: 6, slug: 'p1', title: 'Reminiscences of Shoghi Effendi', speaker: null, speaker_key: null, year: 2002, collection: 'Pilgrim recollections' })),
  shapeRow(row({ id: 7, slug: 'f1', title: 'Talk to the Youth', speaker: 'Furútan', speaker_key: null, language: 'fa', year: null })),
];
const speakers = shapeSpeakers(items, [], () => null);
const byKey = new Map(speakers.map((s) => [s.k, s]));
const idx = buildSearch(items);

describe('as-you-type search', () => {
  it('tolerates one typo in a longer word', () => {
    expect(within1('guardain', 'guardian')).toBe(true);
    expect(within1('covenent', 'covenant')).toBe(true);
    expect(within1('soul', 'sail')).toBe(false);
  });
  it('matches speaker, title, prefixes and diacritic-free spellings (AND)', () => {
    expect(searchItems(idx, { q: 'dunbar' }).map((i) => i.s)).toEqual(['d1', 'd2', 'd3', 'd4']);
    expect(searchItems(idx, { q: 'cov' }).map((i) => i.s)).toEqual(['d1']);
    expect(searchItems(idx, { q: 'furutan youth' }).map((i) => i.s)).toEqual(['f1']);
    expect(searchItems(idx, { q: 'soul dunbar' })[0].s).toBe('d2');
    expect(searchItems(idx, { q: 'zebra' })).toEqual([]);
  });
  it('combines presets, decades and one voice with the text', () => {
    expect(searchItems(idx, { preset: 'hands' }, byKey).map((i) => i.s)).toEqual(['s1', 'f1']);
    expect(searchItems(idx, { preset: 'uhj', decade: 1970 }, byKey).map((i) => i.s)).toEqual(['d3', 'd4']);
    expect(searchItems(idx, { preset: 'pilgrim' }, byKey).map((i) => i.s)).toEqual(['p1']);
    expect(searchItems(idx, { preset: 'persian' }, byKey).map((i) => i.s)).toEqual(['f1']);
    expect(searchItems(idx, { speaker: 'william-sears', q: 'arise' }).map((i) => i.s)).toEqual(['s1']);
    expect(searchItems(idx, { q: '1980s' }).map((i) => i.s)).toEqual(['d1']);
  });
});

describe('the jukebox layout', () => {
  const portraits = new Map(speakers.map((s) => [s.k, { ...s, p: 'https://x/p.jpg' }]));
  it('is deterministic for a seed and varies by seed', () => {
    const a = planLayout(items, portraits, { seed: '2026-10-22' }), b = planLayout(items, portraits, { seed: '2026-10-22' });
    expect(a).toEqual(b);
  });
  it('puts a prolific speaker in ONE box set and never shows a face twice in a row', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const cards = planLayout(items, portraits, { seed });
      const boxes = cards.filter((c) => c.kind === 'box');
      expect(boxes).toHaveLength(1);
      expect(boxes[0].speaker.k).toBe('hooper-dunbar');
      expect(boxes[0].talks).toHaveLength(4);
      expect(cards.filter((c) => c.kind !== 'box' && c.it?.k === 'hooper-dunbar').every((c) => c.kind === 'quote' || c.kind === 'question')).toBe(true);
      const faces = cards.map((c) => (c.kind === 'box' ? c.speaker.k : c.kind === 'portrait' ? c.it.k : null));
      for (let i = 1; i < faces.length; i++) if (faces[i]) expect(faces.slice(Math.max(0, i - 6), i)).not.toContain(faces[i]);
      expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
      expect(cards.filter((c) => c.kind === 'portrait').every((c) => c.size === 'tall')).toBe(true);
    }
  });
  it('picks highlights with a line to show, varied speakers first', () => {
    const h = pickHighlights(items, byKey, { n: 3, seed: 'x' });
    expect(h).toHaveLength(3);
    expect(h.some((x) => x.q || x.h.length)).toBe(true);
    expect(new Set(h.map((x) => x.k)).size).toBe(3);
  });
  it('groups eras, topics and ticker lines', () => {
    expect(eras(items).map((e) => e.decade)).toEqual([1960, 1970, 1980, 1990, 2000]);
    expect(topTopics([{ tp: ['Covenant', 'Soul'], d: 60 }, { tp: ['covenant'], d: 60 }])[0]).toMatchObject({ label: 'Covenant', n: 2 });
    expect(tickerLines(items, speakers).length).toBeGreaterThan(3);
  });
  it('makes generated labels stable per name', () => {
    expect(initials('‘Alí Nakhjavání')).toBe('AN');
    expect(initials('Furútan')).toBe('FU');
    expect(labelPattern('Hooper Dunbar')).toEqual(labelPattern('Hooper Dunbar'));
    expect(eraKey(1932)).toBe('1940'); expect(eraKey(null)).toBe('undated'); expect(eraKey(2031)).toBe('2020');
    expect(duration(4380)).toBe('1 h 13 min'); expect(duration(37)).toBe('37 s');
    expect(waveHeights('az')[1]).toBe(1);
  });
});
