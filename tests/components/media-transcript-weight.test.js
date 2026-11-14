// Talk-page weight (11-14): the page ships each paragraph compact (text + centisecond timings) and renders it as plain text
// with the same words and spacing as the word spans; a paragraph is split into spans on the client when it nears the
// viewport, plays, or a deep link / range needs it. Clicks and selections on plain text map the caret to the word.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { render } from 'svelte/server';
import { applyTimings, compactParagraph, expandParagraph, segmentText, segmentWordAt, transcriptClickWord, flattenWords } from '../../src/lib/media.js';
import MediaTranscript from '../../src/components/media/MediaTranscript.svelte';
import MediaPlayer from '../../src/components/media/MediaPlayer.svelte';

const base = JSON.parse(readFileSync(new URL('../fixtures/media-item.json', import.meta.url), 'utf8'));
const para = { n: 4, pi: 9, t0: 1.2, t1: 5.07, spk: 'A', sentences: [[0, 5]], s0: [1.2],
  words: [['Well,', 1.2, 1.5], ['uh', 1.5, 1.62, 1], ['the', 1.7, 1.81], ['earth', 1.79, 2.3], ['is', 2.31, 2.4], ['one', 4, 5.07]] };

describe('compactParagraph / expandParagraph', () => {
  it('round-trips the words (text, times to the centisecond, dropped words) and keeps the other fields', () => {
    const c = compactParagraph(para);
    expect(c).not.toHaveProperty('words');
    expect(c).not.toHaveProperty('sentences');
    expect(c).not.toHaveProperty('s0');
    expect(c).toMatchObject({ n: 4, pi: 9, t0: 1.2, t1: 5.07, spk: 'A', tx: 'Well, uh the earth is one', hid: [1] });
    const e = expandParagraph(c);
    expect(e.words).toEqual(para.words);           // overlapping times (1.81 > 1.79) survive: deltas may be negative
    expect(e).toMatchObject({ n: 4, pi: 9, t0: 1.2, t1: 5.07, spk: 'A' });
    expect(e).not.toHaveProperty('tx');
  });
  it('is much smaller than the tuples on a real talk fixture, and exact to the centisecond', () => {
    const full = JSON.stringify(base.paragraphs), small = JSON.stringify(base.paragraphs.map(compactParagraph));
    expect(small.length).toBeLessThan(full.length * 0.7);
    expect(base.paragraphs.map(compactParagraph).map(expandParagraph).map((p) => p.words))
      .toEqual(base.paragraphs.map((p) => p.words.map((w) => [w[0], Math.round(w[1] * 100) / 100, Math.round(w[2] * 100) / 100, ...w.slice(3)])));
  });
  it('a word that cannot round-trip (empty, or with whitespace) keeps the paragraph whole; a full paragraph expands to itself', () => {
    for (const bad of [[['a b', 0, 1]], [['', 0, 1]]]) expect(compactParagraph({ n: 1, words: bad })).toEqual({ n: 1, words: bad });
    expect(expandParagraph(para)).toBe(para);
    expect(expandParagraph({ n: 1, tx: '', tm: '' }).words).toEqual([]);
  });
});

describe('deferred word timings (only a ?t range ships them; the rest come after first paint)', () => {
  it('timed: false leaves tm out; expanding gives every word the paragraph span, marked untimed', () => {
    const c = compactParagraph(para, { timed: false });
    expect(c).not.toHaveProperty('tm');
    expect(c).toMatchObject({ tx: 'Well, uh the earth is one', hid: [1] });
    const e = expandParagraph(c);
    expect(e.untimed).toBe(true);
    expect(e.words).toEqual([['Well,', 1.2, 5.07], ['uh', 1.2, 5.07, 1], ['the', 1.2, 5.07], ['earth', 1.2, 5.07], ['is', 1.2, 5.07], ['one', 1.2, 5.07]]);
  });
  it('an untimed paragraph still finds its paragraph by time, and a click plays from its start', () => {
    const ps = base.paragraphs.slice(0, 3).map((p) => expandParagraph(compactParagraph(p, { timed: false })));
    const flat = flattenWords(ps);
    const k = flat.starts.findIndex((_, i) => flat.para[i] === 1);
    expect(flat.starts[k]).toBe(base.paragraphs[1].t0);
    expect(flat.ends[k]).toBe(base.paragraphs[1].t1);
  });
  it('applyTimings fills words and the flat arrays from the API paragraphs; a count mismatch stays untimed', () => {
    const ps = base.paragraphs.slice(0, 3).map((p, i) => expandParagraph(compactParagraph(p, { timed: i !== 0 ? false : true })));
    const flat = flattenWords(ps);
    const paraStart = ps.reduce((acc, p, i) => { acc.push(i ? acc[i - 1] + ps[i - 1].words.length : 0); return acc; }, []);
    const full = base.paragraphs.slice(0, 3).map((p, i) => (i === 2 ? { ...p, words: p.words.slice(1) } : p));
    expect(applyTimings(ps, flat, paraStart, full)).toBe(1);
    expect(ps[1].untimed).toBeUndefined();
    expect(ps[2].untimed).toBe(true);
    expect(ps[1].words.map((w) => [w[1], w[2]])).toEqual(base.paragraphs[1].words.map((w) => [w[1], w[2]]));
    const k = paraStart[1] + 2;
    expect([flat.starts[k], flat.ends[k]]).toEqual([base.paragraphs[1].words[2][1], base.paragraphs[1].words[2][2]]);
  });
  it('cuts most of the compact weight on a real talk', () => {
    const timed = JSON.stringify(base.paragraphs.map((p) => compactParagraph(p)));
    const deferred = JSON.stringify(base.paragraphs.map((p) => compactParagraph(p, { timed: false })));
    expect(deferred.length).toBeLessThan(timed.length * 0.7);
  });
});

describe('plain text = the word spans’ text', () => {
  const words = para.words;
  it('segmentText matches the span spacing in and out of a link; dropped words show nothing', () => {
    expect(segmentText(words, 0, 6)).toBe('Well, the earth is one ');
    expect(segmentText(words, 2, 5, true)).toBe('the earth is');
    expect(segmentText(words, 0, 2, true)).toBe('Well, ');   // a dropped last word: the space stays, as with spans
  });
  it('segmentWordAt maps a caret offset to the word in the paragraph, skipping dropped words', () => {
    const t = segmentText(words, 0, 6);
    expect(segmentWordAt(words, 0, 6, t, 0)).toBe(0);
    expect(segmentWordAt(words, 0, 6, t, 3)).toBe(0);                      // inside "Well,"
    expect(segmentWordAt(words, 0, 6, t, t.indexOf('the'))).toBe(2);       // "uh" (1) is dropped
    expect(segmentWordAt(words, 0, 6, t, t.indexOf('earth') + 2)).toBe(3);
    expect(segmentWordAt(words, 0, 6, t, t.length)).toBe(5);               // past the end → the last word
    const lt = segmentText(words, 2, 5, true);
    expect(segmentWordAt(words, 2, 5, lt, lt.indexOf('is'))).toBe(4);
  });
  it('a click on plain text resolves to its segment (links still open unless Alt-clicked)', () => {
    const seg = (link) => { const el = { dataset: { s: '0', e: '6' }, closest: (sel) => (sel === '[data-s]' ? el : sel === 'a' ? link : null) }; return el; };
    const plain = seg(null);
    expect(transcriptClickWord({ target: plain, button: 0 })).toBe(plain);
    const inLink = seg({ href: 'x' });
    expect(transcriptClickWord({ target: inLink, button: 0 })).toBeNull();
    expect(transcriptClickWord({ target: inLink, button: 0, altKey: true })).toBe(inLink);
  });

  const visibleText = (html) => html.replace(/<!--.*?-->/g, '').replace(/<span[^>]*class="hidden[ "][^>]*>[^<]*<\/span>/g, '')
    .match(/<p class="ptext[^"]*">[\s\S]*?<\/p>/g).map((p) => p.replace(/<[^>]+>/g, '')).join('\n');
  const paragraphs = [para, ...base.paragraphs];
  const quotes = [{ para: 4, i0: 2, i1: 5, url: 'https://example.org/x#p1', cite: 'Gleanings' }];
  const spans = render(MediaTranscript, { props: { paragraphs, quotes, canPlay: true } }).body;
  const plain = render(MediaTranscript, { props: { paragraphs, quotes, canPlay: true, live: new Set() } }).body;
  it('SSR with nothing live renders no word spans, only plain segments', () => {
    expect(plain).not.toMatch(/data-k=/);
    expect(plain).toMatch(/data-s="0" data-e="2"/);
    expect(spans).toMatch(/data-k=/);
  });
  it('the plain text is character-for-character the span text (so splitting causes no layout shift)', () => {
    expect(visibleText(plain)).toBe(visibleText(spans));
  });
  it('the quote stays a real link in plain text', () => {
    expect(plain).toMatch(/<a href="https:\/\/example\.org\/x#p1"[^>]*data-s="2" data-e="5"[^>]*>the earth is<\/a>/);
  });
  it('a live paragraph renders spans while the others stay plain', () => {
    const one = render(MediaTranscript, { props: { paragraphs, quotes, canPlay: true, live: new Set([1]) } }).body;
    const off = paragraphs[0].words.length;
    expect(one).toMatch(new RegExp(`data-k="${off}"`));
    expect(one).not.toMatch(/data-k="0"/);
  });
});

describe('the player: compact props, deep links, selection', () => {
  const src = readFileSync(new URL('../../src/components/media/MediaPlayer.svelte', import.meta.url), 'utf8');
  const item = { ...base, rights: { ...base.rights, playback: 'full' }, audio: { ogg: '/a.ogg', m4a: '/a.m4a', offset_s: 0 },
    paragraphs: base.paragraphs.map(compactParagraph) };
  it('renders the compact transcript as plain text with the same words', () => {
    const { body } = render(MediaPlayer, { props: { item } });
    expect(body).not.toMatch(/data-k=/);
    const w = base.paragraphs[1].words.filter((x) => !x[3]).map((x) => x[0]).join(' ');
    expect(body.replace(/<!--.*?-->/g, '')).toContain(w);
  });
  it('a ?t=a-b range splits its paragraphs on the server (shading in the first paint), and only those', () => {
    const p2 = base.paragraphs[1];
    const { body } = render(MediaPlayer, { props: { item, initialRange: { start: p2.t0 + 0.5, end: p2.t1 - 1 } } });
    const k0 = flattenWords(base.paragraphs.slice(0, 1)).length;
    expect(body).toMatch(new RegExp(`data-k="${k0}"`));
    expect(body).not.toMatch(/data-k="0"/);
    expect(body).toMatch(/bg-highlight-range/);
  });
  it('a deep link (#t / ?t / ?p / ?m) splits the target paragraph (after its timings) before it marks and scrolls', () => {
    const at = src.indexOf('Promise.all(pis.map(upgrade)).then(');
    expect(at).toBeGreaterThan(0);
    expect(src.indexOf('wordEl(k)?.scrollIntoView', at)).toBeGreaterThan(at);
  });
  it('the playing word on plain text splits its paragraph, then marks it (no retry loop)', () => {
    expect(src).toMatch(/if \(!el\) \{[\s\S]{0,200}upgrade\(flat\.para\[k\]\)\.then/);
    expect(src).toMatch(/fresh \|\| wordEl\(k\)/);
  });
  it('selection maps span or plain-text boundaries and takes its text from the words, not the DOM spans', () => {
    expect(src).toMatch(/querySelectorAll\('\[data-k\],\[data-s\]'\)/);
    expect(src).toMatch(/wordOf\(first, r\.startContainer, r\.startOffset, false\)/);
    expect(src).toMatch(/paragraphs\[flat\.para\[k\]\]\.words\[flat\.idx\[k\]\]/);
  });
  it('upgrade waits for the timings; the first same-revision refresh fills them, with a timeout fallback', () => {
    expect(src).toMatch(/if \(paragraphs\[pi\]\?\.untimed\) await timings;/);
    expect(src).toMatch(/sameMediaRevision\(item\.version, d\.version\)\) \{\s*applyTimings\(paragraphs, flat, paraStart, d\.paragraphs\)/);
    expect(src).toMatch(/setTimeout\(\(\) => timingsDone\(false\), \d+\)/);
  });
  it('the page compacts after the JSON-LD transcript is built, keeping timings only inside the ?t range', () => {
    const page = readFileSync(new URL('../../src/pages/media/[slug].astro', import.meta.url), 'utf8');
    const at = page.indexOf('compactParagraph(p, { timed: timedIn(p) })');
    expect(at).toBeGreaterThan(page.indexOf('const transcriptText'));
    expect(page).toMatch(/const timedIn = \(p\) => !!initialRange && /);
  });
  it('SSR with deferred timings and a ?t range: the range paragraphs are timed and split, the rest plain', () => {
    const p2 = base.paragraphs[1], r = { start: p2.t0 + 0.5, end: p2.t1 - 1 };
    const inR = (p) => (p.t1 ?? Infinity) >= r.start && (p.t0 ?? 0) <= r.end;
    const it2 = { ...item, paragraphs: base.paragraphs.map((p) => compactParagraph(p, { timed: inR(p) })) };
    const { body } = render(MediaPlayer, { props: { item: it2, initialRange: r } });
    const k0 = flattenWords(base.paragraphs.slice(0, 1)).length;
    expect(body).toMatch(new RegExp(`data-k="${k0}"`));
    expect(body).not.toMatch(/data-k="0"/);
    expect(body).toMatch(/bg-highlight-range/);
  });
});
