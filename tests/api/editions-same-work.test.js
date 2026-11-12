// editions.js same-work pairing (11-12): an author's same-titled edition is found past his other works and aligned by place when nothing else can.
import { describe, it, expect } from 'vitest';
import { sameWorkFirst, alignByPlace, editionsOf, sourceKey } from '../../api/lib/assistant/editions.js';

const self = { id: 1, title: 'Tafsír-i-Súriy-i-Kawthar', language: 'ar', religion: "Baha'i", paragraph_count: 800 };
const other = (id, title) => ({ id, title, language: 'en', religion: "Baha'i", basis: 'author', paragraph_count: 100 });

describe('sameWorkFirst', () => {
  it('keeps the same work (any spelling) and drops the author’s other works', () => {
    const ms = [other(2, 'Persian Bayan'), other(3, 'Commentary on the Surah of Joseph'), { ...other(4, "Tafsir-i-Suratu'l-Kawthar (Commentary on the Surah of Kawthar) (provisional translation)"), paragraph_count: 860 }];
    const out = sameWorkFirst(self, ms);
    expect(out.map((m) => m.id)).toEqual([4]);
    expect(out[0].sameWork).toBe(true);
  });
  it('no same-titled member (a title in another script) → the candidates stay, unmarked', () => {
    const out = sameWorkFirst({ ...self, title: 'تفسير سورة الكوثر' }, [other(2, 'Persian Bayan')]);
    expect(out.map((m) => m.id)).toEqual([2]);
    expect(out[0].sameWork).toBeUndefined();
  });
  it('a recorded original/translation is the same work', () => {
    expect(sameWorkFirst(self, [{ id: 9, title: 'x', basis: 'original_doc_id' }])[0].sameWork).toBe(true);
  });
});

describe('alignByPlace', () => {
  const rows = (doc, from, to) => Array.from({ length: to - from + 1 }, (_, k) => ({ id: doc * 1000 + from + k, doc_id: doc, paragraph_index: from + k, text: `p${from + k}`, blocktype: 'paragraph' }));
  const d = { paragraphsInRange: async (doc, from, to) => rows(doc, from, to) };
  it('the same share of the work, approximate', async () => {
    const r = await alignByPlace({ paragraph_index: 400 }, { id: 4, paragraph_count: 860, sameWork: true }, 800, d);
    expect(r.by).toBe('place'); expect(r.exact).toBe(false);
    expect(r.rows.map((x) => x.paragraph_index)).toEqual([429, 430]);
  });
  it('never for a member that is not the same work', async () => {
    expect(await alignByPlace({ paragraph_index: 4 }, { id: 4, paragraph_count: 860 }, 800, d)).toBeNull();
  });
});

describe('editionsOf: the Arabic opening → the English same work', () => {
  it('finds the translation by title and place when phrase vectors have nothing', async () => {
    const deps = {
      resolveLinks: async () => new Map(), headingStarts: async () => [],
      paragraphsByIds: async (ids) => ids.map((id) => ({ id, doc_id: 1, paragraph_index: 1, text: 'بسم الله', heading: null })),
      paragraphsInRange: async (doc, from, to) => Array.from({ length: to - from + 1 }, (_, k) => ({ id: doc * 1000 + from + k, doc_id: doc, paragraph_index: from + k, text: `en ${from + k}`, blocktype: 'paragraph' })),
      phrases: async () => ({ hits: [] }),
      workFamily: async () => ({ self, members: [other(2, 'Persian Bayan'), { ...other(4, "Tafsir-i-Suratu'l-Kawthar (provisional translation)"), paragraph_count: 860 }] }),
    };
    const r = await editionsOf(5, { want: 'translations' }, deps);
    expect(r.passages.length).toBeGreaterThan(0);
    expect(r.passages.every((p) => p.document_id === 4 && p.aligned_by === 'place' && p.role === 'translation')).toBe(true);
  });
  it('want original from the Arabic: the English same work is never called its original', async () => {
    const deps = {
      resolveLinks: async () => new Map(), headingStarts: async () => [],
      paragraphsByIds: async (ids) => ids.map((id) => ({ id, doc_id: 1, paragraph_index: 1, text: 'بسم الله', heading: null })),
      paragraphsInRange: async (doc, from, to) => Array.from({ length: to - from + 1 }, (_, k) => ({ id: doc * 1000 + from + k, doc_id: doc, paragraph_index: from + k, text: `en ${from + k}`, blocktype: 'paragraph' })),
      phrases: async () => ({ hits: [] }),
      workFamily: async () => ({ self: { ...self, religion: "Baha'i" }, members: [{ ...other(4, "Tafsir-i-Suratu'l-Kawthar (provisional translation)"), paragraph_count: 860 }] }),
    };
    const r = await editionsOf(5, { want: 'original' }, deps);
    expect(r.passages.map((p) => [p.id, p.role, p.aligned_by])).toEqual([[5, 'original', 'self']]);   // the Arabic passage is itself the original
  });
  it('a prolific author: the same work is found behind hundreds of the author’s other works (asks for every title)', async () => {
    let asked = 0;
    const many = Array.from({ length: 900 }, (_, k) => other(100 + k, `Another tablet ${k}`));
    const deps = {
      resolveLinks: async () => new Map(), headingStarts: async () => [],
      paragraphsByIds: async (ids) => ids.map((id) => ({ id, doc_id: 1, paragraph_index: 1, text: 'بسم الله', heading: null })),
      paragraphsInRange: async (doc, from, to) => Array.from({ length: to - from + 1 }, (_, k) => ({ id: doc * 1000 + from + k, doc_id: doc, paragraph_index: from + k, text: `en ${from + k}`, blocktype: 'paragraph' })),
      phrases: async () => ({ hits: [] }),
      workFamily: async (_id, o) => { asked = o.authors; return { self, members: [...many, { ...other(4, "Tafsir-i-Suratu'l-Kawthar (provisional translation)"), paragraph_count: 860 }].slice(0, o.authors) }; },
    };
    const r = await editionsOf(5, { want: 'translations' }, deps);
    expect(asked).toBeGreaterThan(900);
    expect(r.passages.every((p) => p.document_id === 4)).toBe(true);
    expect(r.passages.length).toBeGreaterThan(0);
  });
});

describe('sourceKey + source-slug siblings (prayer original, 11-12)', () => {
  it('strips extension and language tag', () => {
    expect(sourceKey('https://oceanoflights.org/file/autogenerated/bab-pub02-77_en.docx')).toBe('bab-pub02-77');
    expect(sourceKey('https://oceanoflights.org/bab-pub02-77-ar/')).toBe('bab-pub02-77');
    expect(sourceKey('https://oceanoflights.org/file/Bab-PUB02-77_ar.docx')).toBe('bab-pub02-77');
    expect(sourceKey(null)).toBe('');
  });
  const en = { id: 581413, title: 'bab-pub02-77_en', language: 'en', religion: "Baha'i", author: 'The Báb', source_url: 'https://oceanoflights.org/file/autogenerated/bab-pub02-77_en.docx' };
  const au = (id, title, source_url, language = 'ar') => ({ id, title, language, religion: "Baha'i", basis: 'author', source_url });
  it('the slug sibling is the same work even when titles score 0', () => {
    const ms = [...Array.from({ length: 15 }, (_, i) => au(i + 1, `other ${i}`, `https://x.org/o${i}.docx`)), au(431792, 'حضرة الباب, هل من مفرّج غير الله', 'https://oceanoflights.org/bab-pub02-77-ar/')];
    const out = sameWorkFirst(en, ms);
    expect(out.map((m) => m.id)).toEqual([431792]); expect(out[0].sameWork).toBe(true);
  });
});

describe('editionsOf want original: exact-text twins', () => {
  it('a compilation anchor reaches the Arabic via its English twin', async () => {
    const anchor = { id: 20780126, doc_id: 20762, paragraph_index: 65, text: 'Is there any Remover of difficulties save God?' };
    const twin = { id: 39345394, doc_id: 581413, paragraph_index: 0, text: anchor.text };
    const en = { id: 581413, title: 'bab-pub02-77_en', language: 'en', religion: "Baha'i", author: 'The Báb', paragraph_count: 1, source_url: 'https://o.org/bab-pub02-77_en.docx' };
    const deps = {
      resolveLinks: async () => new Map(), headingStarts: async () => [], phrases: async () => ({ hits: [] }),
      paragraphsByIds: async (ids) => ids.map((id) => ({ id, doc_id: 20762, paragraph_index: 65, text: anchor.text })),
      paragraphsInRange: async (doc, from) => [{ id: doc * 10 + from, doc_id: doc, paragraph_index: from, text: 'هل من مفرج غير الله', blocktype: 'paragraph' }],
      workFamily: async (doc) => doc === 20762 ? { self: { id: 20762, title: "Bahá'í Prayers", language: 'en', religion: "Baha'i", paragraph_count: 400 }, members: [] }
        : { self: en, members: [{ id: 431792, title: 'حضرة الباب', language: 'ar', religion: "Baha'i", basis: 'author', paragraph_count: 1, source_url: 'https://o.org/bab-pub02-77-ar/' }] },
      twins: async () => [twin],
    };
    const r = await editionsOf(20780126, { want: 'original' }, deps);
    expect(r.passages.some((p) => p.document_id === 431792 && p.language === 'ar')).toBe(true);
  });
});
