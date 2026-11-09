// prayer_lookup (Bahá’í tradition; others in prayer-traditions.test.js): headings list, occasion → first prayer + 2, incipit via scoped layers. Fake deps, no network.
import { describe, it, expect } from 'vitest';
import { REGISTRY } from '../../api/lib/assistant/tools.js';
const rows = [
  { id: 1, paragraph_index: 10, text: 'O God, refresh and gladden my spirit.' }, { id: 2, paragraph_index: 11, text: '_—Bahá’u’lláh_' },
  { id: 3, paragraph_index: 12, text: 'Healing prayer second.' }, { id: 4, paragraph_index: 13, text: '_—The Báb_' },
  { id: 5, paragraph_index: 14, text: 'Third prayer.' }, { id: 6, paragraph_index: 15, text: '_—‘Abdu’l-Bahá_' },
];
const doc = { id: 77, title: 'Bahá’í Prayers', author: 'Bahá’í Reference Library', language: 'en' };
const deps = { findTitled: async () => ({ doc, others: [] }), findDocuments: async () => ({ docs: [{ ...doc, religion: "Baha'i", collection: 'Bahá’u’lláh', paragraph_count: 900 }] }), readerUrl: () => 'https://x/y',
  sectionsOfDoc: async () => [{ title: 'For Healing', level: 1, start_index: 10, end_index: 15, paragraphs: 6 }, { title: '', paragraphs: 3 }],
  paragraphsInRange: async () => rows, withLinks: async (h) => h.map((x) => ({ ...x, url: 'https://x/p' })) };
const ctx = { deps: { ...deps, resolveQdrantFilters: async (f) => f, searchKeywordQdrant: async () => ({ hits: [] }), searchPhrases: async () => ({ hits: [{ paragraph_id: 3, score: 0.9 }] }),
  paragraphsByIds: async () => [{ id: 3, document_id: 77, paragraph_index: 12, text: 'Healing prayer second.' }] } };
describe('prayer_lookup', () => {
  it('lists the headings', async () => { const r = await REGISTRY.prayer_lookup.run({ tradition: "Baha'i", list: true }, ctx); expect(r.occasions).toEqual(['For Healing']); expect(r.book).toBe(77); });
  it('occasion → first prayer in full, then two more', async () => {
    const r = await REGISTRY.prayer_lookup.run({ tradition: "Baha'i", occasion: 'for healing' }, ctx);
    expect(r.passages.map((p) => p.role)).toEqual(['prayer', 'prayer', 'alternative', 'alternative']);
    expect(r.passages[0].text).toMatch(/refresh/);
  });
  it('incipit → the prayer holding the hit', async () => {
    const r = await REGISTRY.prayer_lookup.run({ tradition: "Baha'i", incipit: 'Healing prayer' }, ctx);
    expect(r.passages[0].text).toMatch(/Healing prayer second/);
  });
  it('unknown occasion → empty, headings kept', async () => { const r = await REGISTRY.prayer_lookup.run({ tradition: "Baha'i", occasion: 'nope' }, { deps: { ...ctx.deps, searchPhrases: async () => ({ hits: [] }) } }); expect(r.passages).toEqual([]); expect(r.occasions.length).toBe(1); });
});
