// entities/projection — the entity graph as a REPLAY of the decision log over the mention substrate
// (docs/entity-improvable-architecture.md). A mention's entity = its cluster decision IN ITS OWN DOCUMENT, carried
// through every applied merge. The replay check compares that with what the database holds and names each divergence.
import { describe, it, expect } from 'vitest';
import { replay, compare } from '../../api/lib/rag/entities/projection.js';

const m = (id, doc, ra, entityId = null, basis = 'reconcile') => ({ id, docId: doc, resolvedAs: ra, entityId, basis });
const cluster = (id, kind, doc, ra, { entityId = null, applied = null, status = 'applied', supersedes = null } = {}) =>
  ({ id, kind, targetKind: 'mention-cluster', status, supersedes, payload: { docId: doc, resolvedAs: ra, entityId, applied_entity_id: applied } });
const merge = (id, canonical, merged, status = 'applied') => ({ id, kind: 'merge', targetKind: 'entity', status, payload: { canonical, merged } });

describe('replay — mention → entity from the log alone', () => {
  it('a create binds its cluster to the minted entity; a link to the chosen one', () => {
    const r = replay({ mentions: [m(1, 7, 'Quddús'), m(2, 7, 'Mullá Ḥusayn')],
      decisions: [cluster(10, 'create', 7, 'Quddús', { applied: 100 }), cluster(11, 'link', 7, 'Mullá Ḥusayn', { entityId: 200, applied: 200 })] });
    expect(r.get(1).entity).toBe(100);
    expect(r.get(2).entity).toBe(200);
  });

  it('a decision binds ONLY its own document — the same name in another book is not decided by it', () => {
    const r = replay({ mentions: [m(1, 7, 'Mírzá Abu’l-Qásim'), m(2, 8, 'Mírzá Abu’l-Qásim')],
      decisions: [cluster(10, 'link', 7, 'Mírzá Abu’l-Qásim', { entityId: 100, applied: 100 }), cluster(11, 'link', 8, 'Mírzá Abu’l-Qásim', { entityId: 300, applied: 300 })] });
    expect(r.get(1).entity).toBe(100);
    expect(r.get(2).entity).toBe(300);
  });

  it('merges carry through chains (A→B, B→C ⇒ A is C); the path is kept as proof', () => {
    const r = replay({ mentions: [m(1, 7, 'X')],
      decisions: [cluster(10, 'create', 7, 'X', { applied: 1 }), merge(20, 2, [1]), merge(21, 3, [2])] });
    expect(r.get(1)).toMatchObject({ base: 1, entity: 3, via: [20, 21] });
  });

  it('a superseding decision replaces the one it supersedes; an applied uncertain withdraws the binding', () => {
    const r = replay({ mentions: [m(1, 7, 'X'), m(2, 7, 'Y')],
      decisions: [cluster(10, 'link', 7, 'X', { entityId: 1, applied: 1 }), cluster(11, 'link', 7, 'X', { entityId: 5, applied: 5, supersedes: 10 }),
        cluster(12, 'create', 7, 'Y', { applied: 9 }), cluster(13, 'uncertain', 7, 'Y', { supersedes: 12 })] });
    expect(r.get(1).entity).toBe(5);
    expect(r.get(2).entity).toBeNull();
  });

  it('proposed (unapplied) decisions and proposed merges do not project', () => {
    const r = replay({ mentions: [m(1, 7, 'X')],
      decisions: [cluster(10, 'create', 7, 'X', { applied: 1 }), cluster(11, 'link', 7, 'X', { entityId: 4, status: 'proposed', supersedes: 10 }), merge(20, 2, [1], 'proposed')] });
    expect(r.get(1)).toMatchObject({ entity: 1, pending: 11 });
  });

  it('a merge cycle does not hang and is reported', () => {
    const r = replay({ mentions: [m(1, 7, 'X')], decisions: [cluster(10, 'create', 7, 'X', { applied: 1 }), merge(20, 2, [1]), merge(21, 1, [2])] });
    expect(r.get(1).cycle).toBe(true);
  });
});

describe('compare — the replay check against the database', () => {
  it('classifies every mention: match · cross-doc · no-decision (by who bound it) · unbound · mismatch', () => {
    const mentions = [
      m(1, 7, 'A', 100),                              // match
      m(2, 8, 'A', 100),                              // book 8 decided A=300; global bind by string left it on book 7's 100
      m(3, 7, 'B', 55, 'name-backfill'),              // bound by a script, no decision explains it
      m(4, 7, 'C', null),                             // decision says 400, DB has nothing
      m(5, 7, 'D', 999),                              // decision says 500, DB has something else
    ];
    const decisions = [cluster(11, 'link', 8, 'A', { entityId: 300, applied: 300 }), cluster(10, 'link', 7, 'A', { entityId: 100, applied: 100 }),
      cluster(12, 'create', 7, 'C', { applied: 400 }), cluster(13, 'create', 7, 'D', { applied: 500 })];
    const c = compare({ mentions, decisions });
    expect(c.counts).toEqual({ match: 1, 'cross-doc': 1, 'no-decision': 1, unbound: 1, mismatch: 1 });
    expect(c.noDecisionByBasis).toEqual({ 'name-backfill': 1 });
    expect(c.samples['cross-doc'][0]).toMatchObject({ mention: 2, db: 100, replay: 300 });
  });

  it('a mention the log leaves unresolved and the DB leaves unbound is a match', () => {
    expect(compare({ mentions: [m(1, 7, 'Z', null)], decisions: [] }).counts).toEqual({ match: 1 });
  });
});
