// Talk transcript clicks (Chad 10-23): a click inside a linked quotation (or a person/work link) OPENS the link and never
// seeks; an ordinary word seeks; a plain Alt-click on a link plays it. Plus the SSR markup: the quote is a real <a href>.
import { describe, it, expect, vi } from 'vitest';
import { render } from 'svelte/server';
import { transcriptClickWord } from '../../src/lib/media.js';
import MediaTranscript from '../../src/components/media/MediaTranscript.svelte';

// a minimal DOM: word span (data-k) optionally inside an <a>
const word = (k, link = null) => ({ dataset: { k: String(k) }, link, closest(sel) { return sel === '[data-k]' ? this : sel === 'a' ? this.link : null; } });
const ev = (target, mods = {}) => ({ target, button: 0, altKey: false, metaKey: false, ctrlKey: false, shiftKey: false, ...mods });

describe('transcriptClickWord', () => {
  const a = { href: 'https://example.org/source#p3' };
  it('an ordinary word seeks', () => { const w = word(7); expect(transcriptClickWord(ev(w))).toBe(w); });
  it('a word inside a quote link does not seek (the link opens)', () => expect(transcriptClickWord(ev(word(9, a)))).toBeNull());
  it('cmd/ctrl/shift/middle click on a link does not seek', () => {
    for (const m of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) expect(transcriptClickWord(ev(word(9, a), m))).toBeNull();
  });
  it('a plain Alt-click on a link plays it', () => { const w = word(9, a); expect(transcriptClickWord(ev(w, { altKey: true }))).toBe(w); });
  it('a click outside any word does nothing', () => expect(transcriptClickWord(ev({ closest: () => null }))).toBeNull());
  it('seek is called only for the plain word (handler contract)', () => {
    const seek = vi.fn();
    for (const e of [ev(word(1)), ev(word(2, a))]) { const el = transcriptClickWord(e); if (el) seek(Number(el.dataset.k)); }
    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith(1);
  });
});

describe('MediaTranscript SSR', () => {
  const paragraphs = [{ n: 0, t0: 0, t1: 4, words: [['He', 0, .5], ['said', .5, 1], ['the', 1, 1.5], ['earth', 1.5, 2], ['is', 2, 2.5], ['one', 2.5, 3], ['country', 3, 3.5]] }];
  const quotes = [{ para: 0, i0: 2, i1: 7, url: 'https://siftersearch.com/library/x#p1', cite: 'Gleanings CXVII' }];
  const { body } = render(MediaTranscript, { props: { paragraphs, quotes, canPlay: true } });
  it('the quote is a real <a href> titled "Open source"', () => {
    expect(body).toMatch(/<a href="https:\/\/siftersearch\.com\/library\/x#p1"[^>]*title="Open source — Gleanings CXVII/);
  });
  it('words inside the link are not styled as click-to-play; words outside are', () => {
    const inside = body.slice(body.indexOf('<a href="https://siftersearch'), body.indexOf('</a>', body.indexOf('<a href="https://siftersearch')));
    expect(inside).not.toMatch(/cursor-pointer/);
    expect(body.slice(0, body.indexOf('<a href="https://siftersearch'))).toMatch(/data-k="0"[^>]*cursor-pointer|cursor-pointer[^>]*data-k="0"/);
  });
});
