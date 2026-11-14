// tz2/tz4 replays (11-14): a book searched and quoted shows its card even when the agent never called book_card (tz4 called document_search,
// whose status also reads "Finding …"); "holds only volume 3 / the opening pages" and "leave that open" are re-asked; an absence claim
// beside the reply's own deep quotations is answered with those places; held research sets carry a version and older sets are not served.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { agentAnswer, contentAbsenceAsk, deepQuoted } from '../../api/lib/assistant/agent-core.js';
import { contentAbsence, conflictClaims } from '../../api/lib/assistant/lint.js';
import { lookup, capture, currentSet, RESEARCH_VERSION } from '../../worker/anis/research-store.js';
import { researchVersion, TOOL_SHAPE } from '../../worker/anis/tool-shape.js';

const F = JSON.parse(readFileSync(new URL('../fixtures/anis/round3-taherzadeh-20261114.json', import.meta.url), 'utf8'));
const VOL2 = "The Revelation of Bahá’u’lláh vol. 2", URL2 = 'https://anis.oceanlibrary.com/doc/the-revelation-of-bahaullah-vol-2-adib-taherzadeh-430';
const P = (i) => ({ id: 9000 + i, document_id: 430, paragraph_index: i, text: `Taherzadeh on the Tablet of Aḥmad, paragraph ${i}.`, title: VOL2,
  author: i === 594 ? 'Ḥájí Muḥammad-Tahir-i-Málmírí' : 'Adib Taherzadeh', source_url: `${URL2}#p${i}`, religion: "Baha'i" });
const msg = (content, tool) => ({ choices: [{ message: { content, ...(tool ? { tool_calls: [{ id: 't', function: { name: tool[0], arguments: JSON.stringify(tool[1]) } }] } : {}) }, finish_reason: tool ? 'tool_calls' : 'stop' }], usage: {} });
const run = async (reply, { places = F.tz4.places } = {}) => {
  const script = [msg('', ['search_in_work', { work: "The Revelation of Bahá'u'lláh vol. 2", queries: ['Tablet of Aḥmad'] }]), msg(reply)];
  const ev = [];
  const r = await agentAnswer({ messages: [{ role: 'user', content: F.tz4.question }], onEvent: (e) => ev.push(e), create: async () => script.shift() || msg(reply),
    tools: { searchInWork: async () => ({ work: { id: 430, title: VOL2, author: 'Adib Taherzadeh' }, total: places.length, passages: places.map(P), per_query: [] }) } });
  return { r, books: ev.filter((e) => e.type === 'books').at(-1)?.books || [] };
};

describe('a book searched and quoted shows its card (tz4: no book_card call, no card)', () => {
  it('two quotations from the searched volume → its card, with the work\'s author (not a quoted voice), whether or not book_card ran', async () => {
    const { books } = await run('In volume 2 of *The Revelation of Bahá\'u\'lláh*, Taherzadeh treats the Tablet at length [[P1]]. Aḥmad carried it with him [[P3]].');
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({ id: 430, title: VOL2, author: 'Adib Taherzadeh', url: URL2 });
  });
  it('one passing citation → no card', async () => {
    const { books } = await run('Taherzadeh dates it to 1865 [[P1]].');
    expect(books).toEqual([]);
  });
});

describe('absence and dispute forms the tz2/tz4 replies used', () => {
  it('"holds only volume 3" and "holds only the opening pages" are content absences', () => {
    expect(contentAbsence(F.tz2.absence)).toHaveLength(1);
    expect(contentAbsence(F.tz4.absence)).toHaveLength(1);
    expect(contentAbsence('The library holds only vol. 3 of the series.')).toHaveLength(1);
  });
  it('"I could not find a passage that settles …, so I leave that open" is an absence AND a dispute', () => {
    expect(contentAbsence(F.tz2.dispute)).toHaveLength(1);
    expect(conflictClaims(F.tz2.dispute)).toHaveLength(1);
    expect(conflictClaims('So I leave it open.')).toHaveLength(1);
  });
  it('plain statements stay clear', () => {
    for (const s of ['The Tablet holds only a few verses, yet it is a charter of the Faith.', 'He left the door open for Aḥmad.', 'The Will does not say the House would be elected in his lifetime.'])
      { expect(contentAbsence(s)).toEqual([]); expect(conflictClaims(s)).toEqual([]); }
  });
});

describe('an absence claim beside the reply\'s own deep quotations (tz4: "opening pages only" while quoting #597 and #612)', () => {
  const found = new Map([['P1', P(550)], ['P2', P(596)], ['P3', P(611)], ['P4', { ...P(12), document_id: 431 }]]);
  it('deepQuoted: the works quoted past the opening pages, with their places', () => {
    expect(deepQuoted('a [[P1]] b [[P2]] c [P3] d [[P4]]', found)).toEqual([{ title: VOL2, places: [551, 597, 612] }]);
    expect(deepQuoted('only [[P4]]', found)).toEqual([]);
  });
  it('the re-ask names those places and says the claim is false', () => {
    const ask = contentAbsenceAsk([F.tz4.absence], true, deepQuoted('[[P2]] [[P3]]', found));
    expect(ask).toMatch(/That is false: this same reply quotes The Revelation of Bahá’u’lláh vol\. 2 at #597, #612/);
    expect(contentAbsenceAsk(['x'], true)).not.toMatch(/That is false/);
  });
  it('in the loop: the draft claiming opening pages is re-asked with the places', async () => {
    const seen = [];
    const script = [msg('', ['search_in_work', { work: VOL2, queries: ['Tablet of Aḥmad'] }]), msg(`He writes [[P3]] and [[P4]]. ${F.tz4.absence}`), msg('He writes [[P3]] and [[P4]].')];
    await agentAnswer({ messages: [{ role: 'user', content: F.tz4.question }], create: async (p) => { seen.push(p.messages.at(-1)); return script.shift() || msg('done'); },
      tools: { searchInWork: async () => ({ work: { id: 430, title: VOL2, author: 'Adib Taherzadeh' }, total: 4, passages: F.tz4.places.map(P), per_query: [] }) } });
    expect(seen.map((m) => String(m?.content || '')).join('\n')).toMatch(/That is false: this same reply quotes .* at #597, #612/);
  });
});

describe('held research sets carry a version (a set saved before a tool fix is not served)', () => {
  const mkEnv = () => {
    const db = new Database(':memory:'); db.exec(readFileSync('worker/d1/anis/0015_anis_edge.sql', 'utf8'));
    const vec = new Map();
    const stmt = (sql) => ({ bind: (...a) => { const s = db.prepare(sql); return { first: async () => s.get(...a) ?? null, all: async () => ({ results: s.all(...a) }), run: async () => (s.reader ? (s.get(...a), {}) : s.run(...a)) }; } });
    return { db, ANIS_DB: { prepare: stmt }, AI: { run: async (_m, { text }) => ({ data: text.map(() => [1, 0, 0]) }) },
      ANIS_VEC: { query: async () => ({ matches: [...vec.keys()].map((id) => ({ id, score: 0.99 })) }), upsert: async (xs) => xs.forEach((x) => vec.set(x.id, x)) } };
  };
  const Q = F.tz4.question, old = 'r0.old';
  it('the version folds in TOOL_SHAPE: a shape bump is a new version', () => {
    expect(RESEARCH_VERSION).toBe(researchVersion(TOOL_SHAPE));
    expect(researchVersion({ ...TOOL_SHAPE, bookCard: 'x1' })).not.toBe(RESEARCH_VERSION);
  });
  it('a set captured under an older version is served neither exactly nor by vector; a capture now replaces it, never merging its passages', async () => {
    const env = mkEnv();
    await capture(env, Q, [P(1), P(2)], { version: old });
    expect(await lookup(env, Q, { version: old })).toMatchObject({ similarity: 1 });
    expect(await lookup(env, Q)).toBeNull();
    expect(await lookup(env, 'What does Taherzadeh write about the Tablet of Aḥmad?')).toBeNull();
    await capture(env, Q, [P(550)]);
    const hit = await lookup(env, Q);
    expect(hit.set.passages.map((p) => p.paragraph_index)).toEqual([550]);
    expect(currentSet(hit.set)).toBe(true);
  });
  it('a set held before versions existed (no stamp) is not served; a curated set is, whatever its version', async () => {
    const env = mkEnv(), now = Date.now();
    env.db.prepare("INSERT INTO anis_research_sets (question, qhash, status, passages, hits, created_at, updated_at) VALUES ('q', 'h', 'candidate', ?, 0, ?, ?)").run(JSON.stringify([{ id: 1, text: 'x' }]), now, now);
    expect(currentSet({ status: 'candidate', passages: [{ id: 1 }] })).toBe(false);
    expect(currentSet({ status: 'curated', passages: [{ id: 1 }] })).toBe(true);
  });
});
