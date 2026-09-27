// entities/materialize — writing the projection. Scoping bugs are corrected to the replay; bindings no decision explains
// are RECORDED as rule decisions (graph unchanged); two-entity divergences become reassessment pairs.
import { describe, it, expect } from 'vitest';
import { run, recordDecisions } from '../../api/lib/rag/entities/materialize.js';
import { replay } from '../../api/lib/rag/entities/projection.js';

const m = (id, doc, ra, entityId, basis = 'reconcile') => ({ id, anchor: `a${id}`, docId: doc, resolvedAs: ra, entityId, basis });
const cluster = (id, kind, doc, ra, applied) => ({ id, kind, targetKind: 'mention-cluster', status: 'applied', actorTier: 2, payload: { docId: doc, resolvedAs: ra, entityId: applied, applied_entity_id: applied } });

function ctx(mentions, decisions) {
  const saved = [], set = [];
  return { saved, set, ctx: { log: {}, store: {
    getMentionIdentity: async () => mentions, getIdentityLog: async () => decisions,
    saveDecisions: async (d) => { saved.push(...d); return d.length; },
    setMentionEntities: async (rows) => { set.push(...rows); return rows.length; },
  } } };
}

const mentions = [
  m(1, 7, 'Shaykh Aḥmad', 100),                    // match
  m(2, 8, 'Shaykh Aḥmad', 100),                    // cross-doc: book 8 decided 300
  m(3, 9, 'Muḥammad Big', 55, 'propagate'),        // no decision explains it → recorded
  m(4, 7, 'Q', null, 'reconcile-unbind'),          // unbound by another book's re-adjudication → rebound
];
const decisions = [cluster(10, 'link', 7, 'Shaykh Aḥmad', 100), cluster(11, 'link', 8, 'Shaykh Aḥmad', 300), cluster(12, 'link', 7, 'Q', 40)];

describe('entities/materialize', () => {
  it('dry run writes nothing and reports the corrections, the recordings and the pairs', async () => {
    const f = ctx(mentions, decisions);
    const r = await run(f.ctx);
    expect(f.saved).toHaveLength(0); expect(f.set).toHaveLength(0);
    expect(r.byCategory).toEqual({ 'cross-doc': 1, 'no-decision': 1, 'cross-doc-unbind': 1 });
    expect(r.changesList).toEqual([{ id: 2, from: 100, to: 300, category: 'cross-doc' }, { id: 4, from: null, to: 40, category: 'cross-doc-unbind' }]);
    expect(r.pairs).toEqual([expect.objectContaining({ db: 100, replay: 300, mentions: 1, docs: [8] })]);
  });

  it('write records first, then corrects — and afterwards the replay reproduces the stored graph exactly', async () => {
    const f = ctx(mentions, decisions);
    await run(f.ctx, { write: true });
    expect(f.saved).toHaveLength(1);
    const after = mentions.map((x) => ({ ...x, entityId: f.set.find((s) => s.id === x.id)?.entityId ?? x.entityId }));
    const log = [...decisions, ...f.saved.map((d, i) => ({ ...d, id: 1000 + i }))];
    const r = replay({ mentions: after, decisions: log });
    for (const x of after) expect(r.get(x.id).entity).toBe(x.entityId);
  });

  it('a recorded binding is a tier-1 rule decision keyed by anchor, marked unproven', () => {
    const [d] = recordDecisions([{ category: 'no-decision', anchor: 'a3', db: 55, replay: null, basis: 'propagate', name: 'Muḥammad Big' }]);
    expect(d).toMatchObject({ kind: 'link', targetKind: 'mention', targetIds: ['a3'], payload: { entityId: 55 }, actorTier: 1, status: 'applied' });
    expect(d.rationale).toMatch(/unproven/);
  });
});
