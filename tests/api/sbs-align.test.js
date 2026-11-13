// SBS sentence rows: marker grouping, LLM verify, cache, encumbered, payload shape. No network, no DB.
import { describe, it, expect, vi } from 'vitest';
import { alignByMarkers, verifyLines, parseAlignReply, alignParagraphs, buildSbs, alignKey } from '../../api/lib/sbs/align.js';

const marked = '⁅s1⁆⁅p1⁆A one⁅/p1⁆ ⁅p2⁆and two.⁅/p2⁆⁅/s1⁆ ⁅s2⁆Second sentence.⁅/s2⁆';
const segs = [{ original: 'A one', translation: 'Uno' }, { original: 'and two.', translation: 'y dos.' }, { original: 'Second sentence.', translation: 'Segunda.' }];
const mem = () => { const m = new Map(); return { m, cacheGet: async (ks) => new Map(ks.filter((k) => m.has(k)).map((k) => [k, m.get(k)])), cachePut: async (k, r) => { m.set(k, r); } }; };
const LONG_O = 'First sentence of the original text here. Second sentence of the original text here.';
const LONG_E = 'First sentence of the English here. Second sentence of the English here.';
const para = (over = {}) => ({ text: LONG_O, translation_text: LONG_E, blocktype: 'paragraph', ...over });

describe('markers', () => {
  it('groups phrase segments into the original sentences', () => {
    expect(alignByMarkers(marked, segs)).toEqual([{ o: 'A one and two.', t: 'Uno y dos.' }, { o: 'Second sentence.', t: 'Segunda.' }]);
  });
  it('falls through on mismatch or leftovers', () => {
    expect(alignByMarkers(marked, [...segs, { original: 'extra', translation: 'x' }])).toBeNull();
    expect(alignByMarkers(marked, [{ original: 'other', translation: 'x' }])).toBeNull();
    expect(alignByMarkers('plain text', segs)).toBeNull();
  });
  it('aligned=markers in a paragraph, no LLM', async () => {
    const llm = vi.fn(); const c = mem();
    const [r] = await alignParagraphs([{ text: marked, translation: JSON.stringify({ reading: 'x', segments: segs.map((s, id) => ({ id, ...s })) }) }], { docLang: 'fa', ...c, llm });
    expect(r.aligned).toBe('markers'); expect(r.rows).toHaveLength(2); expect(llm).not.toHaveBeenCalled();
  });
});

describe('llm', () => {
  const good = { source: 'First sentence of the original text here.\nSecond sentence of the original text here.', translation: 'First sentence of the English here.\nSecond sentence of the English here.' };
  it('accepts a verified alignment and caches it', async () => {
    const c = mem(); const llm = vi.fn(async () => good);
    const [r] = await alignParagraphs([para()], { docLang: 'ar', ...c, llm });
    expect(r.aligned).toBe('llm'); expect(r.rows).toHaveLength(2); expect(c.m.size).toBe(1);
  });
  it('rejects changed text -> one paragraph row (cached, never paid twice)', async () => {
    const c = mem(); const llm = vi.fn(async () => ({ ...good, translation: 'Changed.\nWords.' }));
    const [r] = await alignParagraphs([para()], { docLang: 'ar', ...c, llm });
    expect(r.aligned).toBe('paragraph'); expect(r.rows).toEqual([{ o: LONG_O, t: LONG_E }]);
    await alignParagraphs([para()], { docLang: 'ar', ...c, llm }); expect(llm).toHaveBeenCalledTimes(1);
  });
  it('cache hit skips the LLM', async () => {
    const c = mem(); c.m.set(alignKey(LONG_O, LONG_E), [{ o: 'a', t: 'b' }, { o: 'c', t: 'd' }]); const llm = vi.fn();
    const [r] = await alignParagraphs([para()], { docLang: 'ar', ...c, llm });
    expect(r.aligned).toBe('llm'); expect(llm).not.toHaveBeenCalled();
  });
  it('an LLM error is not cached', async () => {
    const c = mem(); const [r] = await alignParagraphs([para()], { docLang: 'ar', ...c, llm: async () => { throw new Error('x'); } });
    expect(r.aligned).toBe('paragraph'); expect(c.m.size).toBe(0);
  });
  it('aligns at most maxUncached per request', async () => {
    const c = mem(); const llm = vi.fn(async () => good);
    const ps = Array.from({ length: 6 }, (_, i) => para({ text: `${LONG_O} ${i}`, translation_text: `${LONG_E} ${i}` }));
    await alignParagraphs(ps, { docLang: 'ar', ...c, llm, maxUncached: 3 }); expect(llm).toHaveBeenCalledTimes(3);
  });
  it('verifyLines cuts OUR text where the model broke it, though the model re-voweled it and dropped the * (11-13)', () => {
    const o = 'هَذِهِ وَرَقَةُ الفِرْدَوْسِ * تُغَنِّي عَلَى أَفْنَانِ سِدْرَةِ البَقَاءِ', e = 'Lo, the Nightingale of Paradise. Singeth upon the twigs.';
    const rows = verifyLines(o, e, { source: 'هذه ورقة الفردوس\nتغني على أفنان سدرة البقاء', translation: 'Lo, the Nightingale of Paradise.\nSingeth upon the twigs.' });
    expect(rows).toEqual([{ o: 'هَذِهِ وَرَقَةُ الفِرْدَوْسِ *', t: 'Lo, the Nightingale of Paradise.' }, { o: 'تُغَنِّي عَلَى أَفْنَانِ سِدْرَةِ البَقَاءِ', t: 'Singeth upon the twigs.' }]);
    expect(verifyLines(o, e, { source: 'هذه ورقة\nتغني على أفنان سدرة البقاء', translation: 'Lo, the Nightingale of Paradise.\nSingeth upon the twigs.' })).toBeNull();   // a word lost
  });
  it('parseAlignReply reads the tagged form, and JSON with raw newlines in its strings', () => {
    expect(parseAlignReply('<source>\na\nb\n</source>\n<translation>\nc\nd\n</translation>')).toEqual({ source: 'a\nb', translation: 'c\nd' });
    expect(parseAlignReply('{"source": "a\nb", "translation": "c\nd"}')).toEqual({ source: 'a\nb', translation: 'c\nd' });
    expect(parseAlignReply('no')).toBeNull();
  });
  it('verifyLines demands equal counts and unchanged text', () => {
    expect(verifyLines('a b', 'c d', { source: 'a\nb', translation: 'c' })).toBeNull();
    expect(verifyLines('a b', 'c d', { source: 'a\nb', translation: 'c\nd' })).toEqual([{ o: 'a', t: 'c' }, { o: 'b', t: 'd' }]);
  });
  it('no English -> none; heading -> one row', async () => {
    const [a, b] = await alignParagraphs([{ text: 'عربي', blocktype: 'paragraph' }, { text: 'Title', blocktype: 'heading' }], { docLang: 'ar', ...mem() });
    expect(a).toMatchObject({ aligned: 'none', rows: [{ o: 'عربي', t: '' }] }); expect(b).toMatchObject({ kind: 'heading', rows: [{ o: 'Title', t: '' }] });
  });
});

describe('buildSbs', () => {
  const deps = (doc) => ({ doc: async () => doc, total: async () => 5, paragraphs: async () => [para(), para({ text: 'x' })], sections: async () => [{ title: 'Ch 1', start: 1 }], ...mem(), llm: async () => null });
  it('encumbered -> copyright flag (route sends 403)', async () => {
    expect(await buildSbs(1, {}, deps({ id: 1, encumbered: 1, language: 'ar' }))).toEqual({ copyright: true });
  });
  it('missing doc -> null', async () => { expect(await buildSbs(1, {}, deps(null))).toBeNull(); });
  it('contract shape', async () => {
    const r = await buildSbs(7, { offset: 0, limit: 2 }, deps({ id: 7, title: 'T', author: 'A', language: 'fa', translators: '[{"name":"Phelps"}]', encumbered: 0 }));
    expect(r.doc).toEqual({ id: 7, title: 'T', original_title: null, author: 'A', translator: 'Phelps', language: 'fa', direction: 'rtl', cover_url: null, source_url: null, paragraphs: 5 });
    expect(r.sections).toEqual([{ title: 'Ch 1', start: 1 }]); expect(r.next_offset).toBe(2);
    expect(r.paragraphs.map((p) => p.n)).toEqual([1, 2]); expect(Object.keys(r.paragraphs[0]).sort()).toEqual(['aligned', 'kind', 'n', 'rows']);
  });
});
