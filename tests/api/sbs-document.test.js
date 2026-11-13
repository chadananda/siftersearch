// pdf/sbs-document.js: a whole tablet, original beside its aligned translation, as a PDF (Chad 11-13); and the runner tool that hands its link over.
import { describe, it, expect } from 'vitest';
import { sbsDocument, SBS_MAX_ROWS } from '../../api/lib/assistant/pdf/sbs-document.js';
import { toolRunner } from '../../api/lib/assistant/tool-runner.js';

const AR = ['بسم الله الأمنع الأقدس', 'هذه ورقة الفردوس تغنّ على أفنان سدرة البقاء', 'قل يا قوم اتّقوا الله'];
const EN = ['In the name of God, the Most Mighty', 'Behold, the Nightingale of Paradise singeth upon the twigs of the Tree of Eternity', 'Say: O people, fear God'];
const docs = { 10: { title: 'Lawḥ-i-Aḥmad', author: "Bahá'u'lláh", language: 'Ar' }, 20: { title: 'Tablet of Ahmad', author: "Bahá'u'lláh", language: 'en' } };
const deps = (over = {}) => {
  const made = [];
  return { made, langCode: (l) => String(l || '').toLowerCase().slice(0, 2) || null,
    getLinkMeta: async ([id]) => new Map([[Number(id), docs[id]]]),
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
