// The /media page against the LIVE index payload (fixture saved 10-22 during the outage, when speakers' `px` became an
// object { url, width, height, … } and the page's SSR threw mid-stream): every computation the page and its cards do must
// complete, and a malformed payload must be coerced or skipped, never throw.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { safeQuote, slugLike, tocLike, safeIndex, planLayout, pickHighlights, eras, topTopics, tickerLines, relatedTalks, tallSrc, portraitTall, portraitCard, portraitSquare, highlightLine, waveHeights, buildSearch, searchItems } from '../../src/lib/media-listing.js';

const live = JSON.parse(readFileSync(new URL('../fixtures/media-index-live.json', import.meta.url), 'utf8'));

function renderAll(data) {
  const { items, speakers } = safeIndex(data);
  const byKey = new Map(speakers.map((s) => [s.k, s]));
  const cards = planLayout(items, byKey, { seed: '2026-10-22' });
  // what Jukebox / OnAir / Voices compute per card and speaker
  for (const c of cards) {
    if (c.kind === 'box') { if (c.speaker.p) portraitTall(tallSrc(c.speaker), 220); }
    else if (c.kind === 'portrait') { const s = byKey.get(c.it.k); portraitCard(tallSrc(s), 320); }
    if (c.it) { highlightLine(c.it); waveHeights(c.it.w); }
  }
  for (const s of speakers) portraitSquare(s.p, 64);
  for (const h of pickHighlights(items, byKey, { n: 8, seed: 'x' })) { highlightLine(h); portraitSquare(byKey.get(h.k)?.p, 112); }
  eras(items); topTopics(items); tickerLines(items, speakers);
  if (items[0]) relatedTalks(items, items[0].s);
  searchItems(buildSearch(items), { q: 'guardian', preset: 'hands' }, byKey);
  return { items, speakers, cards };
}

describe('the /media page renders the live index', () => {
  it('computes every card and picture without throwing', () => {
    const r = renderAll(live);
    expect(r.items.length).toBe(live.items.length);
    expect(r.cards.length).toBeGreaterThan(5);
  });
  it('uses the extended master when px is an object, the portrait otherwise', () => {
    expect(tallSrc({ p: 'https://x/p.jpg', px: { url: 'https://x/p-ext.jpg', width: 1152 } })).toBe('https://x/p-ext.jpg');
    expect(tallSrc({ p: 'https://x/p.jpg', px: 'https://x/e.jpg' })).toBe('https://x/e.jpg');
    expect(tallSrc({ p: 'https://x/p.jpg', px: { nope: 1 } })).toBe('https://x/p.jpg');
    expect(tallSrc({})).toBe(null);
    expect(portraitTall({ url: 'x' }, 100)).toBe(null);   // an object never reaches the URL builder
  });
  it('coerces or skips malformed rows instead of throwing', () => {
    const bad = { items: [null, { s: '' }, { s: 'ok', t: 42, h: [null, { x: 'Why?' }], tp: ['a', 3], q: { x: 5 }, hl: 'x', w: { a: 1 } }, ...live.items.slice(0, 5)],
      speakers: [null, { k: 'z', p: { url: 1 }, px: 7 }, ...live.speakers.slice(0, 3)] };
    const r = renderAll(bad);
    expect(r.items.map((i) => i.s)).toContain('ok');
    const ok = r.items.find((i) => i.s === 'ok');
    expect(ok).toMatchObject({ t: '42', h: [{ x: 'Why?', f: 's', t: null }], tp: ['a'], q: null, hl: [0, 20], w: '' });
    expect(r.speakers.find((s) => s.k === 'z')).toMatchObject({ p: null, px: null });
  });
});

describe('pull-quotes are made safe to show (10-22: a TOC with markdown and a slug as citation was rotating)', () => {
  it('drops tables of contents and slug citations, strips markdown', () => {
    expect(safeQuote({ x: '* * Bahá’í Sacred Writings Preface I. The Báb II. Bahá’u’lláh III. ‘Abdu’l-Bahá', c: 'pdf-b-bahaullah, bahaullah_abdul-baha_sacred_writings_book' })).toBe(null);
    expect(safeQuote({ x: '**Say:** the soul is a [sign](https://x) of God, and its station is exalted above all.', c: 'bahaullah_gleanings' })).toEqual({ x: 'Say: the soul is a sign of God, and its station is exalted above all.', c: null, t0: 0, t1: null });
    expect(safeQuote({ x: 'The world is in travail, and its agitation waxeth day by day.', c: 'Gleanings from the Writings of Bahá’u’lláh' }).c).toBe('Gleanings from the Writings of Bahá’u’lláh');
    expect(slugLike('pdf-b-bahaullah')).toBe(true); expect(slugLike('Shoghi Effendi, Call to the Nations')).toBe(false);
    expect(tocLike('I. The Báb II. Bahá’u’lláh III. Others')).toBe(true);
  });
});
