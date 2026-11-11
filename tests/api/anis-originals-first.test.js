// fused_search, originals first (Chad 11-11): a Bahá'í search open to the Writings puts the Persian/Arabic originals first, each followed
// by its best linked English; English hits that are a shown translation are not repeated; other scopes keep the English search alone.
import { describe, it, expect, vi } from 'vitest';
import * as tools from '../../api/lib/assistant/tools.js';

const EN = [{ id: 10, text: 'O ye that are foremost in justice…', title: 'Gleanings', author: "Bahá'u'lláh", religion: "Baha'i", language: 'en', document_id: 5, paragraph_index: 1, authority: 'scripture' },
  { id: 11, text: 'The best beloved of all things…', title: 'Hidden Words', author: "Bahá'u'lláh", religion: "Baha'i", language: 'en', document_id: 6, paragraph_index: 2, authority: 'scripture' }];
const AR = [{ id: 20, text: 'فاعلموا بأنّ أصل العدل', title: "Rizván al-'Adl", author: "Bahá'u'lláh", religion: "Baha'i", language: 'ar', document_id: 7, paragraph_index: 0, authority: 'scripture' },
  { id: 21, text: 'mislabelled English row in the ar-fa group', title: 'X', author: "Bahá'u'lláh", religion: "Baha'i", language: 'en', document_id: 616657, paragraph_index: 0, authority: 'scripture' },
  { id: 22, text: 'ای دوستان سراپرده يگانگی', title: 'Tablet of Maqṣúd', author: "Bahá'u'lláh", religion: "Baha'i", language: 'fa', document_id: 8, paragraph_index: 8, authority: 'scripture' }];
const fastSearch = vi.fn(async (q, religion, n, f) => (f?.language === 'fa' ? AR : EN));
const resolveLinks = vi.fn(async (ids) => new Map(ids.map((id) => [id, { translations: id === 20 ? [{ ...EN[1], language: 'en', translated_by: 'Shoghi Effendi' }] : [] }])));
const ctx = { fastSearch, deps: { resolveLinks } };

describe('fused_search: originals first', () => {
  it('a scripture shelf: originals lead, each followed by its translation, which is not repeated', async () => {
    const { passages } = await tools.run('fused_search', { query: 'justice', filters: { tradition: "Baha'i", authority: ['scripture'] } }, ctx);
    expect(passages.map((p) => p.id)).toEqual([20, 11, 22, 10]);
    expect(passages[1]).toMatchObject({ translation_of: 20, language: 'en' });
    expect(passages.some((p) => p.document_id === 616657)).toBe(false);   // only rows labelled ar/fa count as originals
  });
  it('another tradition, a work, another authority kind or an English language filter: English alone', async () => {
    for (const filters of [{ tradition: 'Islam' }, { tradition: "Baha'i", authority: ['history'] }, { tradition: "Baha'i", language: 'en' }, {}]) {
      fastSearch.mockClear();
      await tools.run('fused_search', { query: 'justice', filters }, ctx);
      expect(fastSearch.mock.calls.some((c) => c[3]?.language === 'fa'), JSON.stringify(filters)).toBe(false);
    }
  });
  it('quota: scripture 4, open 2, never more than half the limit; a non-doctrinal author none', () => {
    const T = { tradition: "Baha'i" };
    expect(tools.originalsQuota(T, {}, new Set(['scripture']), 8)).toBe(4);
    expect(tools.originalsQuota(T, {}, null, 8)).toBe(2);
    expect(tools.originalsQuota(T, {}, new Set(['scripture']), 3)).toBe(2);
    expect(tools.originalsQuota(T, { author: "'Abdu'l-Bahá" }, null, 8)).toBe(2);
    expect(tools.originalsQuota(T, { author: 'Nabil Zarandi' }, null, 8)).toBe(0);
  });
});
