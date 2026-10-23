// The /media Fireside Room: index shaping (api/lib/media/listing-index.js) and the client's search, presets and seeded
// jukebox layout (src/lib/media-listing.js).
import { describe, it, expect } from 'vitest';
import { fold, speakerRole, waveString, pullQuote, bestQuote, topHeadings, highlightWindow, shapeRow, shapeSpeakers, buildIndex, audioUrls } from '../../api/lib/media/listing-index.js';
import { momentPath, shareLinks, momentShareText } from '../../src/lib/share.js';
import { cleanSnippet, snippetAround, groupHits, waveWindow, within1, buildSearch, searchItems, planLayout, pickHighlights, eras, topTopics, tickerLines, relatedTalks, initials, labelPattern, eraKey, duration, waveHeights } from '../../src/lib/media-listing.js';

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
  it('gives each box-set spine what its in-place play button needs (Chad 10-23: open vs play here)', () => {
    const box = planLayout(items, portraits, { seed: 'a' }).find((c) => c.kind === 'box');
    const src = new Map(items.map((i) => [i.s, i]));
    for (const t of box.talks) {
      const it = src.get(t.s);
      expect(t).toMatchObject({ s: it.s, t: it.t, k: it.k });
      expect(t.hl).toEqual(it.hl);
      expect(t.v).toEqual(it.v);
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
  it('relates talks: same voice first (max 3), then shared topics, never itself', () => {
    const r = relatedTalks(items, 'd1');
    expect(r.map((x) => x.s)).not.toContain('d1');
    expect(r.slice(0, 3).every((x) => x.k === 'hooper-dunbar')).toBe(true);
    expect(r.filter((x) => x.k === 'hooper-dunbar')).toHaveLength(3);
    expect(relatedTalks(items, 'nope')).toEqual([]);
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

describe('moments: share links and the excerpt waveform', () => {
  it('builds the canonical moment path and share URLs', () => {
    expect(momentPath('dunbar-soul-1988', 'k3x9')).toBe('/media/dunbar-soul-1988/m/k3x9');
    const l = shareLinks('https://siftersearch.com/media/a/m/b', '“Hi” — X');
    expect(l.x).toContain('url=https%3A%2F%2Fsiftersearch.com%2Fmedia%2Fa%2Fm%2Fb');
    expect(l.facebook).toContain('sharer.php?u=');
    expect(l.whatsapp).toContain('wa.me');
    expect(l.email.startsWith('mailto:?subject=')).toBe(true);
    expect(momentShareText({ text: 'word '.repeat(100), speaker: 'S' }, 40)).toMatch(/…” — S$/);
  });
  it('slices the waveform to the moment', () => {
    const data = []; for (let i = 0; i < 2000; i++) data.push(-1, i < 1000 ? 10 : 100);   // 20 px/s: loud after 50 s
    const wf = { channels: 1, sample_rate: 8000, samples_per_pixel: 400, data };
    const quiet = waveWindow(wf, 10, 20, 8), loud = waveWindow(wf, 60, 70, 8);
    expect(quiet).toHaveLength(8); expect(Math.max(...quiet)).toBe(1); expect(loud.every((x) => x === 1)).toBe(true);
    expect(waveWindow(wf, 30, 20)).toEqual([]);
  });
});

describe('transcript hits ("Heard in the transcripts")', () => {
  it('cleans markdown links and editorial brackets', () => {
    expect(cleanSnippet('[You might keep me safe, to quake.] See [Gleanings](https://x.org/a) now')).toBe('You might keep me safe, to quake. See Gleanings now');
  });
  it('windows around the match with ellipses and marks typo/stem matches', () => {
    const text = `${'Opening words that go on. '.repeat(20)}And then the Guardian’s letters about the covenant were read aloud. ${'Closing words here. '.repeat(20)}`;
    const s = snippetAround(text, 'guardian covenent', 140);
    expect(s.lead).toBe('…'); expect(s.tail).toBe('…');
    const hit = s.parts.filter((p) => p.hit).map((p) => p.t);
    expect(hit).toEqual(['Guardian’s', 'covenant']);
    expect(snippetAround('Ask the Guardian, then.', 'guardian').parts.filter((p) => p.hit).map((p) => p.t)).toEqual(['Guardian']);
    expect(s.parts.map((p) => p.t).join('').length).toBeLessThanOrEqual(150);
  });
  it('starts at the beginning when the match is early, and groups by talk', () => {
    expect(snippetAround('Soul and spirit.', 'soul').lead).toBe('');
    const g = groupHits([{ slug: 'a' }, { slug: 'b' }, { slug: 'a' }, { slug: 'c' }], 2);
    expect(g.map((x) => [x.slug, x.hits.length])).toEqual([['a', 2], ['b', 1]]);
  });
});

describe('the tuner eval (30+ real queries over the 64 published talks, 10-22)', () => {
  it('finds the expected talk in the top 5 for names, misspellings, aliases, titles and topics', async () => {
    const { readFileSync } = await import('fs');
    const { safeIndex } = await import('../../src/lib/media-listing.js');
    const data = safeIndex(JSON.parse(readFileSync(new URL('../fixtures/media-index-64.json', import.meta.url), 'utf8')));
    const evalSet = JSON.parse(readFileSync(new URL('../fixtures/tuner-eval.json', import.meta.url), 'utf8'));
    const byKey = new Map(data.speakers.map((s) => [s.k, s]));
    const ix = buildSearch(data.items);
    const misses = evalSet.filter(([q, want]) => !searchItems(ix, { q }, byKey).slice(0, 5).some((i) => new RegExp(want).test(i.s))).map(([q]) => q);
    // concept-only queries ("life after death") are the transcript search's job, not the instant filter's
    expect(misses).toEqual(['life after death']);
  });
});
