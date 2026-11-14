// pdf/sbs-document.js: a whole tablet, original beside its aligned translation, as a PDF (Chad 11-13); and the runner tool that hands its link over.
import { describe, it, expect } from 'vitest';
import { sbsDocument, sentenceRows, meaningRows, SBS_MAX_ROWS } from '../../api/lib/assistant/pdf/sbs-document.js';
import { toolRunner } from '../../api/lib/assistant/tool-runner.js';

const AR = ['بسم الله الأمنع الأقدس', 'هذه ورقة الفردوس تغنّ على أفنان سدرة البقاء', 'قل يا قوم اتّقوا الله'];
const EN = ['In the name of God, the Most Mighty', 'Behold, the Nightingale of Paradise singeth upon the twigs of the Tree of Eternity', 'Say: O people, fear God'];
const docs = { 10: { title: 'Lawḥ-i-Aḥmad', author: "Bahá'u'lláh", language: 'Ar' }, 20: { title: 'Tablet of Ahmad', author: "Bahá'u'lláh", language: 'en' } };
const deps = (over = {}) => {
  const made = [];
  return { made, langCode: (l) => String(l || '').toLowerCase().slice(0, 2) || null,
    getLinkMeta: async (ids) => new Map(ids.map((id) => [Number(id), docs[id]])),
    paragraphsInRange: async (doc) => (doc === 10 ? AR.map((text, i) => ({ id: 100 + i, paragraph_index: i, text })) : []),
    withLinks: async (rows) => rows.map((r) => ({ ...r, url: `https://oceanoflights.org/bahaullah-tablet-ahmad-ar/#p${r.paragraph_index}` })),
    editionsOf: async (id, { want }) => (want === 'original' ? { passages: [{ id: 100, document_id: 10, role: 'original' }] }
      : { passages: [{ id: 200 + (id - 100), document_id: 20, paragraph_index: id - 100, text: EN[id - 100], title: 'Tablet of Ahmad', language: 'en', role: 'translation', exact: true }] }),
    documents: { create: async (d) => { made.push(d); return { url: 'https://r2/x.pdf', title: d.title }; } }, ...over };
};

describe('sbsDocument', () => {
  it('a held English passage → the Arabic original, every paragraph beside its translation, drawn as a widget', async () => {
    const d = deps();
    const r = await sbsDocument({ document_id: 20, paragraph_id: 201 }, d);
    expect(r).toMatchObject({ url: 'https://r2/x.pdf', rows: 3, document_id: 10 });
    const [doc] = d.made;
    expect(doc.title).toMatch(/Lawḥ-i-Aḥmad: Arabic and English/);
    expect(doc.widgets[0].rows.map((x) => x.original.text)).toEqual(AR);
    expect(doc.widgets[0].rows.map((x) => x.translations[0].text)).toEqual(EN);
    expect(doc.markdown).toContain(`<!-- widget:${doc.widgets[0].id} -->`);
  });
  it('the same source file in English wins over a study paper aligned to more verses; a slug title is never the label (11-13)', async () => {
    const meta = { 10: { title: 'Tablet of Aḥmad', author: "Bahá'u'lláh", language: 'ar', source_url: 'https://oceanoflights.org/bahaullah-pm03-030-ar/' },
      30: { title: 'Tablet of Ahmad, Arabic (Lawh-i-Ahmad): Analysis of Figurative Language', author: 'skrenes', language: 'en', source_url: 'https://bahai-library.com/skrenes_ahmad' },
      40: { title: 'bahaullah-pm03-030_en', author: 'Bahá’u’lláh', language: 'en', source_url: 'https://oceanoflights.org/bahaullah-pm03-030-en/' } };
    const tr = (doc, i, text, title, author) => ({ id: doc * 10 + i, document_id: doc, paragraph_index: i, text, title, author, language: 'en', role: 'translation' });
    const d = deps({ getLinkMeta: async (ids) => new Map(ids.map((id) => [Number(id), meta[id]])),
      editionsOf: async (id) => { const i = id - 100; return { passages: [tr(30, i, `study ${i}`, meta[30].title, 'skrenes'), ...(i ? [tr(40, i, EN[i], meta[40].title, meta[40].author)] : [])] }; } });
    await sbsDocument({ document_id: 10, paragraph_id: 100 }, d);
    const [doc] = d.made;
    expect(doc.widgets[0].rows.flatMap((x) => x.translations.map((t) => t.text)).filter(Boolean)).toEqual(EN.slice(1));
    expect(doc.running[1]).toBe('Arabic original · English translation');
    expect(doc.markdown).not.toMatch(/pm03|Figurative/);
  });
  it('refuses plainly: no original, a long work, a romanized "original"', async () => {
    expect((await sbsDocument({ document_id: 20, paragraph_id: 1 }, deps({ editionsOf: async () => ({ passages: [] }) }))).error).toMatch(/no original/);
    const long = deps({ paragraphsInRange: async () => Array.from({ length: SBS_MAX_ROWS + 1 }, (_, i) => ({ id: i, paragraph_index: i, text: AR[0] })) });
    expect((await sbsDocument({ document_id: 10, paragraph_id: 100 }, long)).error).toMatch(/too long/);
    const latin = deps({ paragraphsInRange: async () => [{ id: 100, paragraph_index: 0, text: 'bsm llh lrḥmn lrḥym' }] });
    expect((await sbsDocument({ document_id: 10, paragraph_id: 100 }, latin)).error).toMatch(/own script/);
  });
});

describe('side_by_side_document tool', () => {
  it('gives the PDF as a book ref the reply links; an error is said in a line', async () => {
    const mk = (sbsDocument) => toolRunner({ sbsDocument }, {});
    const t = mk(async () => ({ url: 'https://r2/x.pdf', title: 'Lawḥ-i-Aḥmad: Arabic and English', rows: 3, document_id: 10 }));
    const ref = t.add({ id: 201, document_id: 20, text: EN[1], title: 'Tablet of Ahmad' });
    const out = await t.run.side_by_side_document({ ref });
    expect(out).toMatch(/\[\[B1\]\]/);
    expect(t.works.get('B1')).toMatchObject({ url: 'https://r2/x.pdf', pdf: true });
    const bad = mk(async () => ({ error: 'too long' }));
    bad.add({ id: 1, document_id: 2, text: 'x' });
    expect(await bad.run.side_by_side_document({ ref: 'P1' })).toMatch(/no side-by-side document: too long/);
  });
});

describe('documents cache', () => {
  it('a cacheKey reuses the stored document without rendering; no key always renders anew', async () => {
    const { makeDocuments } = await import('../../api/lib/assistant/pdf/documents.js');
    const stored = new Set(); let renders = 0;
    const docs = makeDocuments({ render: async () => { renders++; return Buffer.from('%PDF'); }, upload: async (k) => { stored.add(k); return `https://r2/${k}`; },
      exists: async (k) => (stored.has(k) ? `https://r2/${k}` : null), outbox: {}, store: {} });
    const a = await docs.create({ title: 'Tablet', markdown: 'x', cacheKey: 'sbs|1|2' });
    const b = await docs.create({ title: 'Tablet', markdown: 'x', cacheKey: 'sbs|1|2' });
    expect(b).toMatchObject({ url: a.url, cached: true });
    expect(renders).toBe(1);
    const c = await docs.create({ title: 'Tablet', markdown: 'x' });
    expect(c.url).not.toBe(a.url);
    expect(renders).toBe(2);
  });
  it('with a stored short-link map every hit returns the same /d/ link, rendered once', async () => {
    const { makeDocuments } = await import('../../api/lib/assistant/pdf/documents.js');
    const stored = new Set(); let renders = 0;
    const docs = makeDocuments({ render: async () => { renders++; return Buffer.from('%PDF'); }, upload: async (k) => { stored.add(k); return `https://r2/${k}`; },
      exists: async (k) => (stored.has(k) ? `https://r2/${k}` : null), publicUrl: (k) => `https://r2/${k}`, keep: null, outbox: {}, store: {}, shortBase: 'https://s/d' });
    const a = await docs.create({ title: 'Tablet', markdown: 'x', cacheKey: 'sbs|1|2' });
    const b = await docs.create({ title: 'Tablet', markdown: 'x', cacheKey: 'sbs|1|2' });
    expect(a.url).toMatch(/^https:\/\/s\/d\/\w{8}$/);
    expect(b).toMatchObject({ url: a.url, cached: true });
    expect(renders).toBe(1);
  });
});

describe('sentenceRows', () => {
  const ar = 'قل إنه لسلطان الرسل وكتابه لأم الكتاب إن أنتم من العارفين. كذلك يذكركم الورقاء في هذا السجن.';
  const en = 'Say: He is the King of the Messengers and His Book is the Mother Book. Thus doth the Nightingale utter His call in this prison.';
  const rows = [
    { original: { text: ar, url: 'o1' }, translations: [{ text: `1. ${en}`, url: 't1' }] },
    { original: { text: 'قصير' }, translations: [{ text: '2. Short.' }] },
  ];
  const split = (t) => t.replace(/\. /g, '.\n');
  it('splits a verse at matching sentences, numbers only its first row, caches the pair; a short verse stays whole', async () => {
    const put = []; let calls = 0;
    const { rows: out, failed } = await sentenceRows(rows, { lang: 'ar', cacheGet: async () => new Map(), cachePut: async (k, v) => put.push(k),
      llm: async (o, e) => { calls++; return { source: split(o), translation: split(e) }; } });
    expect(failed).toBe(0);
    expect(calls).toBe(1);
    expect(put).toHaveLength(1);
    expect(out.map((r) => [r.verse, r.first])).toEqual([['1', true], ['1', false], ['2', true]]);
    expect(out[0].translations[0].text).toBe('Say: He is the King of the Messengers and His Book is the Mother Book.');
    expect(out[1].original.url).toBeNull();
    expect(out[2].translations[0].text).toBe('Short.');
  });
  it('an aligner that changes words → the verse stays one row; an error → failed, nothing cached', async () => {
    const bad = await sentenceRows(rows, { lang: 'ar', cacheGet: async () => new Map(), cachePut: async () => {}, llm: async () => ({ source: 'x\ny', translation: 'a\nb' }) });
    expect(bad.rows).toHaveLength(2);
    const put = [];
    const err = await sentenceRows(rows, { lang: 'ar', cacheGet: async () => new Map(), cachePut: async (k) => put.push(k), llm: async () => { throw new Error('busy'); } });
    expect(err.failed).toBe(1);
    expect(put).toHaveLength(0);
  });
});

describe('spansByAnchors (11-13: every paragraph of the work lands in a verse; an out-of-order match is dropped)', () => {
  it('anchor to anchor; the first from 0, the last to the end; the stray last match (a postscript) gets nothing', async () => {
    const { spansByAnchors } = await import('../../api/lib/assistant/pdf/sbs-document.js');
    expect(spansByAnchors([1, 3, 6, 8, 11, 14, 4], 16)).toEqual([[0, 2], [3, 5], [6, 7], [8, 10], [11, 13], [14, 16], null]);
    expect(spansByAnchors([null, 2, null], 5)).toEqual([null, [0, 5], null]);
    expect(spansByAnchors([null, null], 5)).toEqual([null, null]);
  });
});

describe('meaningRows', () => {
  // topic vectors: a word picks its axis, so a sentence matches the translation sentence of the same topic
  const AX = ['sun', 'moon', 'star', 'sea'];
  const embed = async (texts) => texts.map((t) => AX.map((w) => (t.match(new RegExp(w, 'g')) || []).length + 0.01));
  const row = (text) => ({ original: { text, url: 'u' }, translations: [{ text: 'old', url: 't', span: 2 }] });
  it('splits each verse into sentence rows matched by meaning, numbering only the first', async () => {
    const puts = [];
    const out = await meaningRows([row('1. ar sun. ar moon.'), row('2. ar star * ar sea')], 'The sun. The moon. The star. The sea.',
      { embed, cacheGet: async () => new Map(), cachePut: async (k, v) => puts.push(k) });
    expect(out.map((r) => [r.verse, r.first, r.translations[0]?.text])).toEqual([['1', true, 'The sun.'], ['1', false, 'The moon.'], ['2', true, 'The star.'], ['2', false, 'The sea.']]);
    expect(out.every((r) => !(r.translations[0]?.span > 1))).toBe(true);
    expect(out[1].original.url).toBeNull();
    expect(puts).toHaveLength(1);
  });
  it('an embedding failure → null (the caller keeps its rows)', async () => {
    expect(await meaningRows([row('ar sun.')], 'The sun.', { embed: async () => { throw new Error('cap'); } })).toBeNull();
  });
});
