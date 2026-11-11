// Battery round 3 (11-10, "main book of the Hindus"): links whose label is a bare URL, or names a source the link does not open,
// never reach the reader (lint.js checkLinks, run by formPass at every reply's exit). Pure.
import { describe, it, expect } from 'vitest';
import { checkLinks, slugAgrees, formPass, citeLinks } from '../../api/lib/assistant/lint.js';

const GITA = 'https://oceanlibrary.com/bhagavad-gita/?paraId=para_116';
const SOURCES = [
  { title: 'The Bhagavad-Gita', url: GITA },
  { title: 'The Mahabharata of Krishna-Dwaipayana Vyasa Vol. 3', url: 'https://oceanlibrary.com/hymns-of-atharva-veda' },
];
const LIVE = `Yes, including [*The Bhagavad-Gita*](https://oceanlibrary.com/bhagavad-gita) [${GITA}](${GITA}) and portions of [*The Mahabharata of Krishna-Dwaipayana Vyasa Vol. 3*](https://www.gutenberg.org/ebooks/15476) [https://oceanlibrary.com/hymns-of-atharva-veda](https://oceanlibrary.com/hymns-of-atharva-veda).`;

describe('checkLinks (battery round 3: hindus)', () => {
  it('the live reply: no bare-URL label, no Mahabharata link to gutenberg or the Atharva-Veda', () => {
    const { text, fixed } = checkLinks(LIVE, SOURCES);
    expect(text).toBe('Yes, including [*The Bhagavad-Gita*](https://oceanlibrary.com/bhagavad-gita) and portions of *The Mahabharata of Krishna-Dwaipayana Vyasa Vol. 3*.');
    expect(fixed).toBe(3);
  });
  it('a bare-URL label standing alone gets its source\'s title, else the host', () => {
    expect(checkLinks(`See [${GITA}](${GITA}).`, SOURCES).text).toBe(`See [*The Bhagavad-Gita*](${GITA}).`);
    expect(checkLinks('See [https://example.org/x](https://example.org/x).', []).text).toBe('See [example.org](https://example.org/x).');
  });
  it('a title linked to another book is relinked to its source; quotation labels and unknown titles are untouched', () => {
    expect(checkLinks('[*The Bhagavad-Gita*](https://oceanlibrary.com/rig-veda)', SOURCES).text).toBe(`[*The Bhagavad-Gita*](${GITA})`);
    const q = '[*"I am OM!"*](https://oceanlibrary.com/rig-veda) and [*Some Other Book*](https://x.org/y)';
    expect(checkLinks(q, SOURCES)).toEqual({ text: q, fixed: 0 });
  });
  it('slugAgrees: an OceanLibrary slug must share a word with the title; other hosts pass', () => {
    expect(slugAgrees('https://oceanlibrary.com/hymns-of-atharva-veda', 'The Mahabharata Vol. 3')).toBe(false);
    expect(slugAgrees('https://oceanlibrary.com/kitab-i-iqan/?paraId=p1', 'The Kitáb-i-Íqán')).toBe(true);
    expect(slugAgrees('https://www.gutenberg.org/ebooks/1', 'Anything')).toBe(true);
  });
  it('formPass runs it with the turn\'s sources', () => {
    expect(formPass(LIVE, { sources: SOURCES }).repairs.links).toBe(3);
  });
  it('a quotation linked to a place that lacks its words → the place that holds them, else unlinked (11-10 Kawthar)', () => {
    const OOL = 'https://oceanoflights.org/bab-pub01-37-ar/#(%D8%AA%D9%81%D8%B3%D9%8A%D8%B1)(%DA%A9%D9%88%D8%AB%D8%B1)';
    const QUR = 'https://oceanlibrary.com/meaning-of-the-glorious-quran_muhammad/?paraId=para_6110';
    const quote = '[*"then pray unto your Lord and sacrifice."*](' + OOL + ')';
    const cat = { title: "A Catalogue of the Báb's Writings", url: OOL, text: 'تفسير سوره کوثر — commentary on the sura of Kawthar, written in Shiraz' };
    const pick = { title: 'The Meaning of the Glorious Qur’án', url: QUR, text: 'So pray unto thy Lord, then pray unto your Lord and sacrifice.' };
    expect(citeLinks(quote + ' — the Báb', [cat, pick]).text).toBe(`[*"then pray unto your Lord and sacrifice."*](${QUR}) — the Báb`);
    expect(citeLinks(quote, [cat]).text).toBe('*"then pray unto your Lord and sacrifice."*');
    expect(citeLinks(quote, [{ ...cat, text: '' }]).fixed).toBe(0);   // no text held → not judged
  });
});

describe('checkLinks — a title proves its OceanLibrary URL is another book (no sources needed)', () => {
  const K = 'https://oceanlibrary.com/kjv-apocalypse-saint-john-of-patmos';
  it('unlinks the title and every quotation sharing that wrong URL; sound links stay', () => {
    const t = `as [*Revelation of Baha'u'llah*, Vol. 4](${K}) records, he was [*peerless in learning*](${K}). See [*The Dawn-Breakers*](https://oceanlibrary.com/dawn-breakers_nabil).`;
    expect(checkLinks(t, []).text).toBe("as *Revelation of Baha'u'llah*, Vol. 4 records, he was *peerless in learning*. See [*The Dawn-Breakers*](https://oceanlibrary.com/dawn-breakers_nabil).");
  });
  it('a quotation alone (no title to prove it wrong) is left', () => {
    const t = `he was [*peerless in learning and knowledge, indomitable in his faith*](${K}).`;
    expect(checkLinks(t, []).fixed).toBe(0);
  });
});
