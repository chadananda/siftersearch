// Round 8: every work/person a long question names is found, searched in its own documents on every route, and an
// inferred tradition only leans when several works or traditions are named. Also the query distiller (no 400-char cut),
// the request-frame filter on Haiku's exact wordings, and the original-wording fallback.
import { describe, it, expect, beforeEach } from 'vitest';
import { nameSpans, resolveNamedAll } from '../../api/lib/named-object.js';
import { traditionsNamed, leanTradition, applyMentions, buildPlan } from '../../api/lib/search-plan.js';
import { workDocs, authorDocs, namedScopes, withNamed } from '../../api/lib/search/named-scope.js';
import { plannedSearch, clearPlannedCache } from '../../api/lib/planned-search.js';
import { distilQuery, searchQueryFor, anisRespond } from '../../api/lib/assistant/respond.js';
import { parsePhrases, REQUEST_FRAME } from '../../api/lib/assistant/phrases.js';

const PX_IQAN = "I'm reading the Kitáb-i-Íqán and I'm confused about the return of the Prophets. Does Bahá'u'lláh really say Elijah returned as John the Baptist? How is that different from reincarnation?";
const PX_LOG = 'You cited Lights of Guidance that this is "in no way their reincarnation", and the Íqán. Does Shoghi Effendi explain what returns in a Manifestation? And how does this differ from Augustine/Plato on the soul?';
const SEED21 = 'Augustine in the Enchiridion and Plotinus in Ennead I.8 both call evil a privation of good. Is there a Bahá\'í equivalent?';

describe('nameSpans — every name in a long question', () => {
  it('finds works, persons and connective titles, not sentence openers', () => {
    const s = nameSpans(PX_IQAN);
    expect(s).toEqual(expect.arrayContaining(['Kitáb-i-Íqán', 'Elijah', 'John the Baptist']));
    expect(s.some((x) => /^(I'm|Does|How)$/.test(x))).toBe(false);
  });
  it('splits "Augustine/Plato" and keeps a quoted phrase', () => {
    const s = nameSpans(PX_LOG);
    expect(s).toEqual(expect.arrayContaining(['Lights of Guidance', 'Augustine', 'Plato', 'Shoghi Effendi', 'in no way their reincarnation']));
  });
  it('keeps "Some" inside a title that is not at the sentence start', () => {
    expect(nameSpans('Where in Some Answered Questions is the Persian text?')).toContain('Some Answered Questions');
  });
  it('resolveNamedAll looks each span up and returns distinct matches', async () => {
    const lookup = async (p) => (/iqan/i.test(p.normalize('NFD').replace(/[̀-ͯ]/g, '')) ? [{ type: 'work', id: 20810, name: 'The Kitáb-i-Íqán', matched: p }] : []);
    const r = await resolveNamedAll(PX_IQAN, { lookup });
    expect(r.map((m) => m.id)).toEqual([20810]);
  });
});

describe('tradition lean', () => {
  it('traditionsNamed counts each tradition once', () => {
    expect(traditionsNamed('How do the Bahá\'í, Hindu and Buddhist teachings on the soul differ?').size).toBe(3);
    expect(traditionsNamed('What is detachment?').size).toBe(0);
  });
  it('lifts an inferred religion filter into plan.lean; a caller or site scope stays', () => {
    const p = { filters: { religion: "Baha'i" }, source: { religion: 'jev' } };
    const l = leanTradition(p, 'works');
    expect(l.filters.religion).toBeUndefined();
    expect(l.lean).toEqual({ religion: "Baha'i", why: 'works', was: 'jev' });
    expect(leanTradition({ ...p, source: { religion: 'caller' } }, 'works').filters.religion).toBe("Baha'i");
    expect(leanTradition({ ...p, source: { religion: 'site-default' } }, 'works').filters.religion).toBe("Baha'i");
  });
  it('applyMentions: two works named → lean; one → the filter stays', () => {
    const plan = { filters: { religion: "Baha'i" }, source: { religion: 'jev' } };
    const two = applyMentions(plan, PX_LOG, [{ type: 'work', id: 1, name: 'Lights of Guidance', matched: 'Lights of Guidance' }, { type: 'work', id: 2, name: 'The Kitáb-i-Íqán', matched: 'Íqán' }]);
    expect(two.lean?.why).toBe('works');
    expect(two.mentions).toHaveLength(2);
    const one = applyMentions(plan, PX_IQAN, [{ type: 'work', id: 2, name: 'The Kitáb-i-Íqán', matched: 'Kitáb-i-Íqán' }]);
    expect(one.filters.religion).toBe("Baha'i");
    expect(one.spans).toContain('Elijah');
  });
  it('applyMentions: a short turn keeps its spans and its one named work, the filter untouched', () => {
    const plan = { filters: { religion: "Baha'i" }, source: { religion: 'jev' }, named: { type: 'work', id: 20810, name: 'The Kitáb-i-Íqán', matched: 'Kitáb-i-Íqán' } };
    const out = applyMentions(plan, 'Return of Elijah in the Kitáb-i-Íqán', null);
    expect(out.mentions).toEqual([{ type: 'work', id: 20810, name: 'The Kitáb-i-Íqán', matched: 'Kitáb-i-Íqán' }]);
    expect(out.spans).toContain('Kitáb-i-Íqán');
    expect(out.filters.religion).toBe("Baha'i");
  });
  it('applyMentions: several traditions named → lean', () => {
    const plan = { filters: { religion: "Baha'i" }, source: { religion: 'jev' } };
    expect(applyMentions(plan, 'Compare what the Bahá\'í writings, the Upanishads of the Hindu tradition and Buddhist sutras teach about rebirth after death, please.', []).lean?.why).toBe('traditions');
  });
});

describe('named scopes', () => {
  const docs = [
    { id: 20804, title: 'Lights of Guidance: A Bahá\'í Reference File', author: 'Helen Hornby', religion: "Baha'i" },
    { id: 9, title: 'Guidance for Today', author: 'X', religion: "Baha'i" },
  ];
  it('workDocs: a bare span must begin the title; a resolved work may match by all its words', () => {
    expect(workDocs('Lights of Guidance', docs).map((d) => d.id)).toEqual([20804]);
    expect(workDocs('Guidance', docs)).toEqual([]);
    expect(workDocs('Íqán', [{ id: 20810, title: 'The Kitáb-i-Íqán' }], { resolved: true }).map((d) => d.id)).toEqual([20810]);
  });
  it('authorDocs: the author IS the name (honorific, "of …", co-authors); no namesakes, no tag pages', () => {
    const rows = [{ id: 1, author: 'Saint Augustine' }, { id: 2, author: 'Augustine Smith' }, { id: 3, author: 'Augustinian Friars' },
      { id: 4, author: 'Augustine of Hippo' }, { id: 5, author: 'Plotinus; Augustine' }, { id: 6, author: 'Augustine', title: 'Tag: Augustine' }];
    expect(authorDocs('Augustine', rows).map((d) => d.id)).toEqual([1, 4, 5]);
    expect(authorDocs('Elijah', [{ id: 7, author: 'Elijah Muhammad' }, { id: 8, author: 'X', title: 'Tag: Elijah (Prophet)' }])).toEqual([]);
  });
  it('namedScopes: works, then a bare span as a title or else a writer; central figures left to the plan', async () => {
    const find = async (q) => ({ docs: {
      'The Kitáb-i-Íqán': [{ id: 20810, title: 'The Kitáb-i-Íqán', author: "Bahá'u'lláh", religion: "Baha'i" }],
      Enchiridion: [{ id: 501, title: 'The Enchiridion', author: 'Augustine', religion: 'Christian' }],
      Plotinus: [{ id: 601, title: 'The Six Enneads', author: 'Plotinus', religion: 'Philosophy' }],
      "Bahá'í": [{ id: 700, title: "Bahá'í", author: 'X', religion: "Baha'i" }],
    }[q] || [] });
    const plan = { mentions: [{ type: 'work', id: 20810, name: 'The Kitáb-i-Íqán', matched: 'Íqán' }], spans: ['Íqán', 'Enchiridion', 'Plotinus', "Bahá'u'lláh", "Bahá'í"] };
    const s = await namedScopes(plan, { find });
    expect(s.map((x) => [x.kind, x.docIds[0]])).toEqual([['work', 20810], ['work', 501], ['author', 601]]);
  });
  it('namedScopes: a span the entity index resolved is not looked up again, articles aside ("John the Baptist" = "John Baptist")', async () => {
    const asked = [];
    const find = async (q) => { asked.push(q); return { docs: [] }; };
    await namedScopes({ mentions: [{ type: 'person', id: 1, name: 'John the Baptist', matched: 'John Baptist' }], spans: ['John the Baptist', 'Elias'] }, { find });
    expect(asked.filter((q) => q !== 'John the Baptist')).toEqual(['Elias']);
    expect(asked.filter((q) => q === 'John the Baptist').length).toBe(1);   // once, as the person's author scope
  });
  it('withNamed: each scope leads with its best passage, nothing else lost but the tail', () => {
    const hits = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    const out = withNamed(hits, [[{ id: 10 }, { id: 11 }], [{ id: 20 }]], 6);
    expect(out.map((h) => h.id)).toEqual([10, 20, 1, 2, 11, 3]);
    expect(withNamed(hits, [[], []], 4)).toBe(hits);
  });
});

describe('plannedSearch with named scopes', () => {
  beforeEach(() => clearPlannedCache());
  const planner = async (_i, { given } = {}) => ({ ...buildPlan({ tradition: { choice: "Baha'i", confidence: 0.95 }, comparative: { noul: 0 },
    author: { choice: 'none', confidence: 0.95 }, shape: { choice: 'fact', confidence: 0.9 } }, { given }), mentions: [], spans: ['City of God'], ms: 1 });

  it('searches each named work by its documents on the fact route, and a work outside the inferred tradition makes it a lean', async () => {
    const calls = [];
    const engine = async (_q, o) => { calls.push(o.filters); return { hits: o.filters.documentId ? [{ id: 900, religion: 'Christian' }] : Array.from({ length: 8 }, (_, i) => ({ id: i + 1, religion: "Baha'i" })) }; };
    const namedScope = async () => [{ kind: 'work', name: 'City of God', docIds: [77], religion: 'Christian' }];
    const r = await plannedSearch('Is the City of God like the Most Great Peace?', { planner, engine, namedScope, limit: 8 });
    expect(calls.some((f) => Array.isArray(f.documentId) && f.documentId[0] === 77)).toBe(true);
    expect(r.hits[0].id).toBe(900);
    expect(r.plan.lean?.religion).toBe("Baha'i");
    expect(r.plan.filters.religion).toBeUndefined();
  });
});

describe('search text over the limit is distilled, never cut', () => {
  const T5 = 'You quote Bahá\'u\'lláh that the soul "will continue to progress until it attaineth the presence of God," but that\'s one sentence, and you cited Gleanings twice without a link. Give me the exact passage in full, with the link, and say whether it actually states that individuality survives or only that the soul progresses. Then do the same for the Rāmānuja citation, since "distinguishing the individual soul from the highest Brahman" is your paraphrase and I want his actual words.';
  it('keeps both asks (r6-after 004 T5) and stays within 400', () => {
    const q = distilQuery(T5);
    expect(q.length).toBeLessThanOrEqual(400);
    expect(q).toMatch(/Rāmānuja/);
    expect(q).toMatch(/Give me the exact passage/);
  });
  it('a long quotation takes the same path', () => {
    const q = searchQueryFor([{ role: 'assistant', content: 'will continue to progress until it attaineth the presence of God' }, { role: 'user', content: T5 }]);
    expect(q.length).toBeLessThanOrEqual(400);
    expect(q).toMatch(/Rāmānuja/);
  });
  it('the names and quoted words of the other sentences follow the asks', () => {
    const long = `${'The Kitáb-i-Íqán speaks of the return. '.repeat(12)}I read "the return of the attributes" in a commentary by Shoghi Effendi. What does return mean?`;
    const q = distilQuery(long);
    expect(q.startsWith('What does return mean?')).toBe(true);
    expect(q).toMatch(/the return of the attributes/);
    expect(q).toMatch(/Kitáb-i-Íqán/);
  });
});

describe('request frames are no exact wording', () => {
  it('drops "the exact sentence in the Íqán where…" (px return-iqan T3) but keeps real wording', () => {
    const question = "Give me the exact sentence in the Íqán where Bahá'u'lláh says John the Baptist was Elijah, in the original Arabic wording.";
    const p = parsePhrases(JSON.stringify({ exact: ["the exact sentence in the Íqán where Bahá'u'lláh says John the Baptist was Elijah"], names: ['Íqán', 'Elijah'] }), { question });
    expect(p.exact).toEqual([]);
    expect(REQUEST_FRAME.test('the passage where He says')).toBe(true);
    expect(REQUEST_FRAME.test('the earth is but one country')).toBe(false);
    expect(REQUEST_FRAME.test('words of God are')).toBe(false);
  });
});

describe('original wording asked, no original retrieved', () => {
  it('answers from the English passage in the ordinary format and says no original is among the passages', async () => {
    const calls = [];
    const passages = [{ id: 5, text: 'Elijah returned in the person of John the Baptist.', title: 'The Kitáb-i-Íqán', author: "Bahá'u'lláh", religion: "Baha'i", document_id: 20810, paragraph_index: 170, source_url: 'https://x/iqan#170' }];
    const r = await anisRespond({ messages: [{ role: 'user', content: 'What is the original Persian wording of the Íqán on Elijah and John the Baptist?' }], deps: {
      search: async () => ({ passages, _plan: { shape: 'fact', filters: {} } }),
      originalsByIds: async () => new Map(),
      chooseFormat: async () => ({ id: 'answer', by: 'test', how: 'Answer plainly.' }),
      craft: async (a) => { calls.push(a); return 'From the Íqán: ["Elijah returned in the person of John the Baptist."](https://x/iqan#170)'; },
      companion: async () => ({ append: '', plan: null, offer: false }),
    } });
    expect(r.format.id).not.toBe('original');
    expect(calls[0].direction.format.how).toMatch(/None of the passages gives the original text/);
  });
});
