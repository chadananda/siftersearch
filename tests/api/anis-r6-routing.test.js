// r6-after / px-smoke (11-01 conversation replays): multi-ask follow-ups kept off the one-paragraph source template, the
// hunt kept to real quotations, ellipsis echoes, the term a "rendered X as" question names, greeting-free search strings.
import { describe, it, expect } from 'vitest';
import { anisRespond, distilQuery, searchQueryFor } from '../../api/lib/assistant/respond.js';
import { detectQuotation } from '../../api/lib/quote-detect.js';
import { termQuestion } from '../../api/lib/assistant/ctai-term.js';

const EQ_T2 = 'That second passage worries me: you attribute the "wisdom of it will be fully revealed in the future" line to Shoghi Effendi explaining a Tablet, yet cite *Uncompiled Published Letters* and then *Dawn of a New Day* "dated around the mid-20th century" — can you give the exact author, recipient and date for what you just quoted, and say whether it\'s \'Abdu\'l-Bahá\'s own words or a secretary writing on Shoghi Effendi\'s behalf?';
const thread = (last) => [{ role: 'user', content: 'What do the Writings say about the equality of women and men?' },
  { role: 'assistant', content: 'The wisdom of it will be fully revealed in the future (Uncompiled Published Letters).' }, { role: 'user', content: last }];
const deps = (calls, origin = { religion: "Baha'i", title: 'Dawn of a New Day', text: 'The wisdom of it will be fully revealed in the future.', url: 'https://oceanlibrary.com/dawn/?paraId=p1' }) => ({
  search: async () => { calls.search++; return { passages: [{ text: 'Shoghi Effendi letter on the House of Justice', title: 'Uncompiled Published Letters', source_url: 'https://oceanlibrary.com/upl/?paraId=p9', document_id: 9 }], _plan: { shape: 'fact' } }; },
  craft: async (x) => { calls.quotes = x?.retrieved_quotes; return 'ok'; }, companion: async () => ({}), plan: async () => ({ shape: 'fact' }), phrases: async () => null, upgradeLinks: async (x) => x,
  sourceHunt: async () => { calls.hunt++; return { origin, citedBy: [] }; } });

describe('multi-ask follow-ups (r6-after equality-sexes T2, seed-21 T2/T4, seed-39 T3/T5, seed-66 T5, golden-rule T5)', () => {
  it('a quotation plus author/recipient/date asks: the hunt is evidence, the ordinary pipeline answers every ask', async () => {
    const calls = { search: 0, hunt: 0 };
    const r = await anisRespond({ messages: thread(EQ_T2), deps: deps(calls), direction: { kind: 'source_lookup' } });
    expect(calls.hunt).toBe(1);
    expect(calls.search).toBe(1);
    expect(r.format?.id).not.toBe('source');
    expect(calls.quotes[0].source_title).toBe('Dawn of a New Day');            // the hunt's origin leads the evidence
    expect(calls.quotes.map((q) => q.source_title)).toContain('Uncompiled Published Letters');
    expect(r.plan?.asks).toEqual(expect.arrayContaining(['recipient', 'authenticity']));
  });
  it('a plain "where is this from" keeps the source template', async () => {
    const calls = { search: 0, hunt: 0 };
    const r = await anisRespond({ messages: [{ role: 'user', content: 'Where is this from: "The wisdom of it will be fully revealed in the future"?' }], deps: deps(calls), direction: { kind: 'source_lookup' } });
    expect(calls.hunt).toBe(1);
    expect(calls.search).toBe(0);
    expect(r.format?.id).toBe('source');
  });
  it('px-smoke return-iqan T3: in a thread, the triage kind alone does not hunt the reader\'s own sentence', async () => {
    const calls = { search: 0, hunt: 0 };
    const t3 = 'That Augustine passage on Plato and the resurrection doesn\'t answer what I asked about KI 154 and Phelps, so let me set it aside. Can you quote the exact sentence in the Íqán where Bahá\'u\'lláh says John the Baptist was Elijah?';
    await anisRespond({ messages: thread(t3), deps: deps(calls), direction: { kind: 'source_lookup' } });
    expect(calls.hunt).toBe(0);
    expect(calls.search).toBe(1);
  });
});

describe('echoes with an ellipsis (r6-after detachment T5)', () => {
  it('words Anís said, quoted back with "..." for 7 skipped words, are not wording to find', () => {
    const said = ['This passage shows non-attachment approached not as a static label, but through the systematic release of specific supports—sensuality, views, and doctrines of the self—whose cessation brings an end to becoming.'];
    expect(detectQuotation('You say this passage shows "the systematic release of specific supports... whose cessation brings an end to becoming," but where does the sutra say that?', { said })).toBeNull();
    // a real quotation is still found
    expect(detectQuotation('Where is "the best beloved of all things in My sight is Justice" from?', { said })?.phrase).toMatch(/best beloved/);
  });
});

describe('term study picks the term the question names (px-smoke justice-quote T5)', () => {
  it('"rendered *al-inṣāf* as Justice" studies inṣāf, not the Arabic address quoted earlier', () => {
    const t = 'You give the Arabic with the opening address «يَا ابْنَ الرُّوحِ» and the number (٢), but still cite it as "The Hidden Words 5" — can you quote any passage where Shoghi Effendi or the Universal House of Justice explains why he rendered *al-inṣāf* as "Justice" rather than "equity" or "fairness", with date and recipient?';
    expect(termQuestion(t)).toEqual({ term: 'inṣāf', script: 'latin' });
    expect(termQuestion('What does the word عرفان mean?')?.script).toBe('arabic');
  });
});

describe('search string without greeting, asks kept past the cut (r6-after soul T1, 004 T5)', () => {
  it('drops "Hello Anís."', () => {
    const t = 'Hello Anís. My grandmother passed away a few months ago, and I keep wondering where she is now, and whether I\'ll actually recognize her someday. Do these texts say anything about that?';
    expect(searchQueryFor([{ role: 'user', content: t }])).toMatch(/^My grandmother/);
  });
  it('a long message keeps its asking sentences first', () => {
    const long = `${'I have been reading about the soul for many years and comparing what different teachers say about it. '.repeat(5)}Then give me the actual words of Rāmānuja on the individual soul.`;
    expect(distilQuery(long)).toMatch(/^Then give me the actual words of Rāmānuja/);
    expect(distilQuery('What is justice?')).toBe('What is justice?');
  });
});
