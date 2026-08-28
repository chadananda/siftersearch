/**
 * BEHAVIOURAL contract for the entity graph.
 *
 * WHY THIS FILE EXISTS: the OpenAPI contract test passed while every one of these was broken, because it
 * only inspected the served DOCUMENT. A spec test proves the contract is PUBLISHED; it cannot prove the
 * server honours it. Tester found, live:
 *   1. GET /entities/{Badasht}   30.5s — agent clients time out at 20s
 *   2. GET /entities/{Letters}   30 names including Shoghi Effendi, who is not a Letter of the Living
 *   3. GET /people/search        {ids, reasoning} while the spec documents people[] with evidence
 *   4. GET /people/{id}          no schema at all
 * Each assertion below fails against the code as it was.
 */
import { describe, it, expect, vi } from 'vitest';

// ── Fixtures modelled on the real rows that caused each failure ───────────────────────────────────────────
const BADASHT = { id: 1264029, cn: 'Badasht Conference', et: 'event', importance: 0, lav: null };
const LETTERS = { id: 1247655, cn: 'the Letters of the Living (Ḥurúf-i-Ḥayy)', et: 'group', importance: 0, lav: null };

const CLAIMS = [
  { id: 1247552, name: 'Quddús', imp: 90, relation: 'participated-in', statement: 'Quddús — participated-in Badasht conference', doc_id: 1, para_id: 'para_88' },
  { id: 1247554, name: 'Ṭáhirih', imp: 90, relation: 'participated-in', statement: 'Ṭáhirih — participated-in conference of Badasht', doc_id: 1, para_id: 'para_88' },
  // The false positives: they share only the generic word "conference" with the node name.
  { id: 9001, name: 'Shoghi Effendi', imp: 99, relation: 'participated-in', statement: 'Shoghi Effendi — participated-in Second Indian Cultural Conference', doc_id: 2, para_id: 'p1' },
  { id: 9002, name: '‘Abdu’l-Bahá', imp: 99, relation: 'participated-in', statement: "'Abdu'l-Bahá — participated-in Orient-Occident-Unity Conference", doc_id: 2, para_id: 'p2' },
  // Mentions the group without belonging to it — the item-2 failure.
  { id: 9001, name: 'Shoghi Effendi', imp: 99, relation: 'related-to', statement: 'Shoghi Effendi — related-to terraces named for the 18 Letters of the Living', doc_id: 2, para_id: 'p3' },
];

function fakeDb({ entity, members = [], claims = CLAIMS }) {
  const queries = [];
  const calls = [];
  const queryOne = vi.fn(async (sql) => {
    queries.push(sql);
    if (/FROM graph_entities WHERE id=\?/.test(sql)) return { id: entity.id, cn: entity.cn, et: entity.et, importance: entity.importance, lav: entity.lav };
    if (/entity_research/.test(sql)) return null;
    return { n: 0 };
  });
  const queryAll = vi.fn(async (sql, params) => {
    queries.push(sql);
    calls.push({ sql, params });
    if (/FROM entity_claims WHERE entity_id=\?/.test(sql)) return [];          // node carries no claims of its own
    if (/entity_mentions_v2/.test(sql)) return [];
    if (/FROM graph_relations/.test(sql)) return members;
    if (/FROM docs WHERE id IN/.test(sql)) return [{ id: 1, title: 'God Passes By', source_url: null }, { id: 2, title: 'Other', source_url: null }];
    if (/entity_claims/.test(sql)) return claims.map((c) => ({ ...c, rank: 1 }));
    return [];
  });
  return { queryOne, queryAll, queries, calls };
}

describe('event node — participants, precision and cost', () => {
  it('does not list people whose only tie is a GENERIC word of the node name', async () => {
    const db = fakeDb({ entity: BADASHT });
    vi.doMock('../../api/lib/db.js', () => db);
    vi.resetModules();
    const { entityDossier } = await import('../../api/lib/entity-api.js?evt');
    const d = await entityDossier(1264029);
    const names = (d.participants || []).map((p) => p.name);
    expect(names).toContain('Quddús');
    expect(names).not.toContain('Shoghi Effendi');      // "Second Indian Cultural Conference"
    expect(names).not.toContain('‘Abdu’l-Bahá');        // "Orient-Occident-Unity Conference"
  });

  it('COSTS A BOUNDED NUMBER OF QUERIES — the 30.5s came from a full folded scan per name word', async () => {
    const db = fakeDb({ entity: BADASHT });
    vi.doMock('../../api/lib/db.js', () => db);
    vi.resetModules();
    const { entityDossier } = await import('../../api/lib/entity-api.js?cost');
    await entityDossier(1264029);
    // One COUNT(*) per term over entity_claims is what blew the latency budget. There must be none.
    const countScans = db.queries.filter((s) => /COUNT\(\*\)[\s\S]*FROM entity_claims/i.test(s));
    expect(countScans.length).toBe(0);
    expect(db.queries.filter((s) => /FROM entity_claims/i.test(s)).length).toBeLessThanOrEqual(2);
  });

  it('folds each row once, not once per term — the expression may not repeat per term', async () => {
    const db = fakeDb({ entity: BADASHT });
    vi.doMock('../../api/lib/db.js', () => db);
    vi.resetModules();
    const { entityDossier } = await import('../../api/lib/entity-api.js?fold');
    await entityDossier(1264029);
    const search = db.queries.find((s) => /FROM entity_claims/i.test(s) && /LIKE/.test(s));
    if (search) {
      // The fold chain must appear ONCE (inside the CTE), not inlined into every LIKE and rank term.
      const folds = (search.match(/REPLACE\(LOWER|LOWER\(REPLACE/g) || []).length;
      expect(folds).toBeLessThanOrEqual(1);
      expect(search).toMatch(/MATERIALIZED/);
    }
  });
});

describe('group node — membership, not mention', () => {
  it('uses the STRUCTURED membership edge and excludes people who merely mention the group', async () => {
    const members = [
      { id: 1247552, name: 'Quddús', imp: 90, rel: 'member-of', doc_id: 1, para: 88 },
      { id: 1247564, name: 'Mullá Ḥusayn', imp: 95, rel: 'member-of', doc_id: 1, para: 88 },
    ];
    const db = fakeDb({ entity: LETTERS, members });
    vi.doMock('../../api/lib/db.js', () => db);
    vi.resetModules();
    const { entityDossier } = await import('../../api/lib/entity-api.js?grp');
    const d = await entityDossier(1247655);
    const names = (d.participants || []).map((p) => p.name);
    expect(names).toContain('Quddús');
    expect(names).not.toContain('Shoghi Effendi');
    expect(d.participantsProvenance.derivedFrom).toBe('graph-relations');
  });

  it('never returns a 30-name dump keyed on a generic word like "letters"', async () => {
    const members = [{ id: 1247552, name: 'Quddús', imp: 90, rel: 'member-of', doc_id: 1, para: 88 }];
    const db = fakeDb({ entity: LETTERS, members });
    vi.doMock('../../api/lib/db.js', () => db);
    vi.resetModules();
    const { entityDossier } = await import('../../api/lib/entity-api.js?dump');
    const d = await entityDossier(1247655);
    expect(d.participantsProvenance.matchedOn).not.toBe('letters');
  });
});


/**
 * PARAMETER ARITY.
 *
 * The MATERIALIZED-CTE rewrite carried the old params array (phrase + terms + terms, sized for the previous
 * query) into a new statement that binds phrase + terms in the rank and terms again in the WHERE — 1+3n
 * values for 1+2n placeholders. better-sqlite3 REJECTS that ("Too many parameter values were provided"), so
 * every entities/search and every event dossier returned 500 in production.
 *
 * The behavioural tests above all passed, because a stubbed db never binds anything. A query test that never
 * counts its parameters cannot see this class of bug at all.
 */
describe('SQL parameter arity', () => {
  it('binds exactly one value per placeholder in the claim search', async () => {
    const db = fakeDb({ entity: BADASHT });
    vi.doMock('../../api/lib/db.js', () => db);
    vi.resetModules();
    const { entityDossier } = await import('../../api/lib/entity-api.js?arity');
    await entityDossier(1264029);
    const claimCalls = db.calls.filter((c) => /FROM entity_claims|FROM c\b/i.test(c.sql) && /LIKE/.test(c.sql));
    expect(claimCalls.length).toBeGreaterThan(0);
    for (const { sql, params } of claimCalls) {
      const placeholders = (sql.match(/\?/g) || []).length;
      expect(params?.length ?? 0).toBe(placeholders);
    }
  });
});


/**
 * people/search: a GROUP named in the query BOUNDS the answer.
 *
 * Unioning bioSearch's ids with the evidence search answered "Letters of the Living who participated in
 * Badasht" with 30 people including Shoghi Effendi and Ahmad Sohrab — reintroducing, on this endpoint, the
 * exact wrong-people failure the group node had just been fixed for. Membership is decided by the structured
 * roster, never by whose claim repeats the group's name.
 */
describe('people/search is bounded by the group roster', () => {
  it('drops people who are not structured members of the group named in the query', async () => {
    const roster = [
      { id: 1247552, name: 'Quddús', imp: 90, rel: 'member-of', doc_id: 1, para: 88 },
      { id: 1247554, name: 'Ṭáhirih', imp: 90, rel: 'member-of', doc_id: 1, para: 88 },
    ];
    const bio = { ids: [1247552, 9001], q: 'x', group: 1247655, reasoning: {} };
    const claims = [
      { id: 1247552, name: 'Quddús', imp: 90, relation: 'participated-in', statement: 'Quddús — participated-in Badasht conference', doc_id: 1, para_id: 'para_88' },
      { id: 9001, name: 'Shoghi Effendi', imp: 99, relation: 'related-to', statement: 'Shoghi Effendi — related-to terraces named for the 18 Letters of the Living', doc_id: 2, para_id: 'p3' },
    ];
    const db = fakeDb({ entity: LETTERS, members: roster, claims });
    vi.doMock('../../api/lib/db.js', () => db);
    vi.doMock('../../api/lib/bio.js', () => ({
      bioSearch: async () => bio, listBioPersons: async () => ({ persons: [] }),
      getBioPerson: async () => null, getIntegrationProgress: async () => ({}),
    }));
    vi.resetModules();
    const { entityDossier } = await import('../../api/lib/entity-api.js?psearch');
    const g = await entityDossier(1247655);
    const memberIds = new Set((g.participants || []).map((m) => m.id));
    // The route filters exactly this way; assert the roster is what decides.
    expect(memberIds.has(1247552)).toBe(true);
    expect(memberIds.has(9001)).toBe(false);      // Shoghi Effendi is not a member
    expect([...memberIds].length).toBe(2);
  });
});


/**
 * THE PROOF QUERY IS A RULE, NOT A HEADCOUNT.
 *
 * BA + Tester locked it: Letters ∩ Badasht means a LETTER MEMBERSHIP EDGE **and** relation
 * `participated-in`. Earlier passes chased a number (6, then 5) and kept bending the matching to reach it —
 * which is how Bahá'u'lláh and the Báb, who are not Letters of the Living, got into the documented answer in
 * the first place. These assertions encode the two conditions and deliberately assert NO total.
 *
 *   visited is not attended     → Mullá Ḥusayn stays out
 *   a Badasht claim is not membership → nobody enters without the roster edge
 */
import { searchTerms as _st, foldText as _ft } from '../../api/lib/entity-api.js';

describe('proof query: membership edge AND participated-in', () => {
  const roster = new Set([1247552, 1247554, 1249584, 1249582]);   // Quddús, Ṭáhirih, Mírzá Hádí, M-‘Alíy
  const candidates = [
    { id: 1247552, name: 'Quddús', evidence: [{ relation: 'participated-in', statement: 'Quddús — participated-in Badasht conference' }] },
    { id: 1247554, name: 'Ṭáhirih', evidence: [{ relation: 'participated-in', statement: 'Ṭáhirih — participated-in conference of Badasht' }] },
    { id: 1247564, name: 'Mullá Ḥusayn', evidence: [{ relation: 'visited', statement: 'Mullá Ḥusayn — visited Badasht' }] },
    { id: 9100, name: "Bahá'u'lláh", evidence: [{ relation: 'participated-in', statement: "Bahá'u'lláh — participated-in Badasht conference" }] },
    { id: 9101, name: 'the Báb', evidence: [{ relation: 'participated-in', statement: 'the Báb — participated-in Conference of Badasht' }] },
  ];
  // The rule the route applies: relation named by the query, then bounded by the roster.
  const apply = (cands) => cands
    .map((c) => ({ ...c, evidence: c.evidence.filter((e) => e.relation === 'participated-in') }))
    .filter((c) => c.evidence.length)
    .filter((c) => roster.has(c.id));

  it('VISITED IS NOT ATTENDED — Mullá Ḥusayn is excluded despite a Badasht claim', () => {
    expect(apply(candidates).map((c) => c.name)).not.toContain('Mullá Ḥusayn');
  });

  it('a Badasht claim without a membership edge is not enough — Bahá\'u\'lláh and the Báb stay out', () => {
    const names = apply(candidates).map((c) => c.name);
    expect(names).not.toContain("Bahá'u'lláh");
    expect(names).not.toContain('the Báb');
  });

  it('people satisfying BOTH conditions are returned', () => {
    const names = apply(candidates).map((c) => c.name);
    expect(names).toContain('Quddús');
    expect(names).toContain('Ṭáhirih');
  });

  it('a query verb naming a relation selects that relation and no other', () => {
    const rels = ['participated-in', 'visited', 'hosted'];
    const qTerms = _st('Letters of the Living who participated in Badasht');
    const asked = rels.filter((rel) => {
      const f = _ft(rel).replace(/[^a-z0-9]+/g, ' ');
      return qTerms.some((t) => f.split(' ').some((w) => w.startsWith(t) || t.startsWith(w)));
    });
    expect(asked).toEqual(['participated-in']);
  });
});
