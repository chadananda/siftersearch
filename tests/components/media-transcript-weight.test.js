// Talk-page weight (11-14): the page ships each paragraph compact (text + centisecond timings) and renders it as plain text
// with the same words and spacing as the word spans; a paragraph is split into spans on the client when it nears the
// viewport, plays, or a deep link / range needs it. Clicks and selections on plain text map the caret to the word.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { render } from 'svelte/server';
import { compactParagraph, expandParagraph, segmentText, segmentWordAt, transcriptClickWord, flattenWords } from '../../src/lib/media.js';
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
  it('a deep link (#t / ?t / ?p / ?m) splits the target paragraph before it marks and scrolls', () => {
    const at = src.indexOf('parasIn(r.start, r.end ?? null).forEach((pi) => live.add(pi))');
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
  it('the page compacts after the JSON-LD transcript is built from the full words', () => {
    const page = readFileSync(new URL('../../src/pages/media/[slug].astro', import.meta.url), 'utf8');
    expect(page.indexOf('item.paragraphs.map(compactParagraph)')).toBeGreaterThan(page.indexOf('const transcriptText'));
  });
});
