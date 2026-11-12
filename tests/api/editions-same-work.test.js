// editions.js same-work pairing (11-12): an author's same-titled edition is found past his other works and aligned by place when nothing else can.
import { describe, it, expect } from 'vitest';
import { sameWorkFirst, alignByPlace, editionsOf } from '../../api/lib/assistant/editions.js';

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
});
