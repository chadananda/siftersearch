// WHERE A SCOUT'S LIST COMES FROM (planning/dewey-scouts-plan.md): bahai-library.com collections (structured RIS — every
// pilgrim note it holds), and RESEARCHED lists — the works a serious library of a tradition must hold, or the important
// Bahá'í publications — web research with citations (Parallel.ai), structured by Haiku. → [{ title, author, year, why,
// importance (1–5), kind, page? }]
import { bahaiLibraryCollection } from './ris.js';
import { parallelResearch } from '../../parallel-ai.js';
import { roleCreate } from '../../role-client.js';

const jsonArray = (s) => { const m = String(s || '').match(/\[[\s\S]*\]/); try { return m ? JSON.parse(m[0]) : []; } catch { return []; } };

/** bahai-library collections → works with their page (a page is itself a source: its text is the work, or links it). */
export async function bahaiLibraryList(collections = ['Pilgrims'], deps = {}) {
  const out = [];
  for (const c of collections) for (const w of await (deps.collection || bahaiLibraryCollection)(c)) {
    out.push({ title: w.title, author: w.authors.join('; ') || null, year: w.written || w.year || null, why: w.abstract || null, importance: 4,
      kind: /pilgrim/i.test(c) ? 'pilgrim notes' : (w.kinds?.[0] || null), page: w.url, language: w.language || null, list: `bahai-library:${c}`,
      // the shelf its collection names (10-19: a pilgrim account shelved by its text under Christian › Mysticism)
      shelfHint: /pilgrim/i.test(c) ? { religion: "Baha'i", collection: 'Pilgrim Notes' } : { religion: "Baha'i", collection: null } });
  }
  return out;
}

const ASK = {
  'core-books': (religion) => `List the works that a serious research library of ${religion} must hold in English (and in the original language where central): its scriptures and canonical texts, the classical commentaries, the foundational histories and biographies, the major works of its great teachers, and the standard modern scholarship (the books scholars cite most). For each give title, author or translator, year, and one line on why it matters. Aim for 60–100 works, most important first.`,
  'bahai-publications': () => `List the important published books about the Bábí and Bahá'í Faiths that a comprehensive Bahá'í research library must hold: histories (e.g. Amanat's Resurrection and Renewal, Balyuzi, Nabil), biographies, memoirs and pilgrims' accounts published as books, the standard scholarship (Momen, Smith, Cole, MacEoin, Saiedi, Lambden, Stockman, Taherzadeh, Garlington and others), reference works, and important compilations. For each give title, author, year, and one line on why it matters. Aim for 100–150 works, most important first.`,
  'bahai-pilgrim-notes': () => `List every published collection, book or article of Bahá'í pilgrims' notes and pilgrim accounts (visits to Bahá'u'lláh, 'Abdu'l-Bahá or Shoghi Effendi): published books, articles in Star of the West, The Bahá'í World and other periodicals, memoirs that are chiefly pilgrim accounts. For each give title, author, year and where it was published.`,
};

/** A researched list: web research (cited) → Haiku structures it. topic ∈ core-books | bahai-publications | bahai-pilgrim-notes. */
export async function researchedList(topic, { religion = null } = {}, { research = parallelResearch, create = roleCreate } = {}) {
  const ask = ASK[topic]?.(religion);
  if (!ask) throw new Error(`no researched list "${topic}"`);
  // the deep run can time out (10-19: the Bahá'í publications list came back empty) — then a quicker one
  const r = (await research(ask, { processor: 'core', timeoutS: 600, caller: 'dewey-scout' })) || (await research(ask, { processor: 'base', timeoutS: 300, caller: 'dewey-scout' }));
  if (!r?.text) return [];
  const res = await create('dewey-scout', { max_tokens: 16000, temperature: 0, messages: [{ role: 'user', content:
    `Turn this research into a JSON array of works. Each: {"title","author","year","why","importance"} — importance 1–5 (5 = indispensable). Only real, specific, BOOK-LENGTH published works named in the text — no creeds, single prayers, short definitions, articles or chapters (10-19: the Nicene Creed went to 'buy'); no categories, no duplicates. Return ONLY the JSON array.\n\n${r.text.slice(0, 60000)}` }] });
  return jsonArray(res?.choices?.[0]?.message?.content).filter((w) => w?.title).map((w) => ({ title: String(w.title), author: w.author || null, year: w.year || null,
    why: w.why || null, importance: Number(w.importance) || 3, kind: topic === 'bahai-pilgrim-notes' ? 'pilgrim notes' : 'book', list: `${topic}${religion ? `:${religion}` : ''}`, cited: r.citations }));
}
