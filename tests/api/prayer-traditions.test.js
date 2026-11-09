// prayer_lookup is tradition-general: Christian → a Christian prayer work (never Bahá’í Prayers), Bahá’í reader → Bahá’í Prayers heading, none → several traditions, none held → names the tradition. Fake deps, no network.
import { describe, it, expect } from 'vitest';
import { REGISTRY } from '../../api/lib/assistant/tools.js';
import { prayerWorksOf, prayerScore, traditionOf } from '../../api/lib/assistant/prayer-works.js';
import { prayerShelf } from '../../api/lib/assistant/prayer-shelf.js';
const D = {
  bahai: { id: 20762, title: 'Bahá’í Prayers', author: 'Bahá’u’lláh', religion: "Baha'i", collection: 'Bahá’u’lláh', language: 'en', paragraph_count: 908 },
  tablet: { id: 945614, title: 'Prayer for Ahmad', religion: "Baha'i", collection: 'Core Tablets', paragraph_count: 6 },
  talk: { id: 983160, title: 'Prayer', religion: "Baha'i", collection: 'Media', paragraph_count: 4 },
  bcp: { id: 20996, title: 'Book of Common Prayer', religion: 'Christian', collection: '', language: 'en', paragraph_count: 3450 },
  budd: { id: 20946, title: 'Buddhist Prayers', religion: 'Buddhist', collection: '', language: 'en', paragraph_count: 33 },
  rig: { id: 21005, title: 'Rig Veda. Book 1', religion: 'Hindu', collection: 'Rig Veda', paragraph_count: 191 },
};
const catalog = [D.bahai, D.tablet, D.talk, D.bcp, D.budd];   // Hindu: none that is a prayer work by title/collection (Rig Veda matches "hymn" only through its text, not here)
const findDocuments = async (term, { religion }) => ({ docs: catalog.filter((d) => d.religion === religion && (new RegExp(term, 'i').test(d.title) || new RegExp(term, 'i').test(d.collection || ''))) });
const rowsBy = {
  20762: [{ id: 1, paragraph_index: 10, text: 'O God, comfort the dead.' }, { id: 2, paragraph_index: 11, text: '_—Bahá’u’lláh_' }, { id: 3, paragraph_index: 12, text: 'Second departed.' }, { id: 4, paragraph_index: 13, text: '_—The Báb_' }],
  20996: [{ id: 21, paragraph_index: 5, text: 'Heal us, O Lord, of every sickness.' }, { id: 22, paragraph_index: 6, text: 'Visit the sick with Thy mercy.' }],
  20946: [{ id: 31, paragraph_index: 2, text: 'May all beings be free from suffering.' }],
};
const sections = { 20762: [{ title: 'For The Departed', level: 1, start_index: 10, end_index: 13, paragraphs: 4 }], 20996: [{ title: 'Prayers for the Sick', level: 1, start_index: 5, end_index: 6, paragraphs: 2 }], 20946: [] };
const hitsOf = { 20996: [{ paragraph_id: 21 }], 20946: [{ paragraph_id: 31 }] };
const byId = { 21: { id: 21, document_id: 20996, paragraph_index: 5, text: rowsBy[20996][0].text }, 31: { id: 31, document_id: 20946, paragraph_index: 2, text: rowsBy[20946][0].text } };
const deps = { findDocuments, readerUrl: () => 'https://x/y', workUrl: (d) => `https://x/w/${d.id}`, sectionsOfDoc: async (id) => sections[id] || [], paragraphsInRange: async (id) => rowsBy[id] || [],
  withLinks: async (h) => h.map((x) => ({ ...x, url: 'https://x/p' })), resolveQdrantFilters: async (f) => f, searchKeywordQdrant: async () => ({ hits: [] }),
  searchPhrases: async (q, o) => ({ hits: hitsOf[o?.filters?.documentId] || [] }), paragraphsByIds: async (ids) => ids.map((i) => byId[i]).filter(Boolean) };
const ctx = { deps };
describe('prayer works come from the catalogue, by tradition', () => {
  it('a Bahá’í list ranks the Prayers book first and never offers a talk', async () => {
    const w = await prayerWorksOf("Baha'i", { findDocuments }); expect(w.map((x) => x.id)).toEqual([20762, 945614]); expect(w[0].tradition).toBe("Baha'i");
    expect(prayerScore(D.talk)).toBeGreaterThan(0);   // it scores as a prayer by title; the Media collection is what excludes it
  });
  it('tradition by units: named → named work\'s → site default → none', () => {
    expect(traditionOf({ tradition: 'Christianity' })).toBe('Christian'); expect(traditionOf({ workDoc: { religion: 'Islam' } })).toBe('Islam');
    expect(traditionOf({ scope: { religion: "Baha'i" } })).toBe("Baha'i"); expect(traditionOf({ scope: { religions_specified: ['Buddhist'] } })).toBe('Buddhist');
    expect(traditionOf({ defaultTradition: 'bahai' })).toBe("Baha'i"); expect(traditionOf({})).toBeNull();
  });
});
describe('prayer_lookup across traditions', () => {
  it('Christian "a prayer for healing" → a Christian prayer work, never Bahá’í Prayers', async () => {
    const r = await REGISTRY.prayer_lookup.run({ tradition: 'Christianity', occasion: 'healing' }, ctx);
    expect(r.tradition).toBe('Christian'); expect(r.passages.length).toBeGreaterThan(0); expect(new Set(r.passages.map((p) => p.title))).toEqual(new Set(['Book of Common Prayer']));
    expect(r.passages[0].text).toMatch(/Heal us/); expect(r.works.map((w) => w.title)).toEqual(['Book of Common Prayer']); expect(JSON.stringify(r)).not.toMatch(/Bahá’í Prayers/);
  });
  it('Bahá’í reader "prayer for the departed" → the Bahá’í Prayers heading', async () => {
    const r = await REGISTRY.prayer_lookup.run({ tradition: "Baha'i", occasion: 'departed' }, ctx);
    expect(r.passages.map((p) => p.role)).toEqual(['prayer', 'prayer', 'alternative']); expect(r.passages[0].title).toBe('Bahá’í Prayers'); expect(r.occasions).toEqual(['For The Departed']); expect(r.book).toBe(20762);
  });
  it('no tradition → prayers of several traditions, each in full, from different works', async () => {
    const r = await REGISTRY.prayer_lookup.run({ occasion: 'heal' }, ctx);
    expect(r.tradition).toBeNull(); expect(new Set(r.passages.map((p) => p.religion))).toEqual(new Set(['Christian', 'Buddhist']));   // every tradition whose work answers serves its own; Bahá’í holds no 'heal' heading or hit here
    const r2 = await REGISTRY.prayer_lookup.run({ occasion: 'departed' }, ctx);
    expect(r2.passages.map((p) => p.title)).toContain('Bahá’í Prayers');
    const l = await REGISTRY.prayer_lookup.run({ list: true }, ctx);
    expect(l.works.map((w) => w.tradition).sort()).toEqual(["Baha'i", 'Buddhist', 'Christian']);
  });
  it('several traditions each give their lead prayer when more than one holds the need', async () => {
    const rows2 = { ...rowsBy, 20946: [{ id: 31, paragraph_index: 2, text: 'May all beings heal.' }] };
    const r = await REGISTRY.prayer_lookup.run({ incipit: 'heal' }, { deps: { ...deps, paragraphsInRange: async (id) => rows2[id] || [], paragraphsByIds: async (ids) => ids.map((i) => ({ ...byId[i], ...(i === 31 ? { text: 'May all beings heal.' } : {}) })).filter((x) => x.id) } });
    expect(new Set(r.passages.map((p) => p.religion))).toEqual(new Set(['Christian', 'Buddhist']));
  });
  it('a tradition with no prayer works → empty passages, no works, the tradition named', async () => {
    const r = await REGISTRY.prayer_lookup.run({ tradition: 'Hindu', occasion: 'peace' }, ctx);
    expect(r).toMatchObject({ passages: [], works: [], tradition: 'Hindu', book: null });
  });
  it('a named work sets the tradition', async () => {
    const r = await REGISTRY.prayer_lookup.run({ work: 'Buddhist Prayers', list: true }, { deps: { ...deps, findTitled: async () => ({ doc: D.budd, others: [] }) } });
    expect(r.tradition).toBe('Buddhist'); expect(r.works[0].title).toBe('Buddhist Prayers');
  });
});
describe('the live executor takes the tradition the same way', () => {
  const sd = { ...deps, pickOccasion: async () => null };
  it('a Christian scope serves the Christian work', async () => {
    const out = await prayerShelf({ messages: [{ role: 'user', content: 'a prayer for healing' }], query: 'a prayer for healing', scope: { religion: 'Christian' }, deps: sd });
    expect(out.passages[0].title).toBe('Book of Common Prayer'); expect(out.passages[0].text).toMatch(/Heal us/);
  });
  it('no tradition → one prayer from several traditions (no Jev call)', async () => {
    const out = await prayerShelf({ messages: [{ role: 'user', content: 'a prayer for healing' }], query: 'heal', deps: { ...sd, pickOccasion: async () => { throw new Error('no Jev'); } } });
    expect(out.plan.several).toEqual(['Christian', 'Buddhist']); expect(out.format.how).toMatch(/several traditions/);
  });
  it('a tradition without prayer works → null (the tree names the absence)', async () => {
    expect(await prayerShelf({ messages: [], query: 'peace', scope: { religion: 'Hindu' }, deps: sd })).toBeNull();
  });
});
