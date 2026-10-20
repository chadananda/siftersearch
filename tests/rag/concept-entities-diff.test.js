// 10-20: every concept run rebuilt concept_entities whole (DELETE all + ~29,000 INSERTs in ONE transaction) — eight runs
// finishing together held the single writer 1.5–3 s each and the WAL churn stalled other writes 8–15 s. A diff converges
// to the same table with only the changed rows written.
import { describe, it, expect } from 'vitest';
import { diffConceptEntities } from '../../api/lib/rag-adapter/store.js';

const row = (id, canonical, extra = {}) => ({ id, canonical, tradition: "Baha'i", root: null, renderings: '[]', concept_type: 'concept', importance: 1, summary: null, ...extra });
const c = (canonical, extra = {}) => ({ canonical, tradition: "Baha'i", renderings: [], concept_type: 'concept', importance: 1, summary: null, ...extra });

describe('diffConceptEntities', () => {
  it('writes nothing when nothing changed', () => {
    expect(diffConceptEntities([row(1, 'clouds'), row(2, 'sun')], [c('clouds'), c('sun')]).ops).toEqual([]);
  });
  it('deletes gone, updates changed, inserts new — never DELETE FROM the whole table', () => {
    const { ops } = diffConceptEntities([row(1, 'clouds'), row(2, 'sun')], [c('clouds', { importance: 5 }), c('moon')]);
    const sqls = ops.map((o) => o.sql.replace(/\s+/g, ' ').trim());
    expect(sqls.some((s) => s.startsWith('DELETE FROM concept_entities WHERE id = ?'))).toBe(true);
    expect(ops.find((o) => /^DELETE/.test(o.sql)).args).toEqual([2]);
    expect(ops.find((o) => /^UPDATE/.test(o.sql)).args.at(-1)).toBe(1);
    expect(ops.find((o) => /^INSERT/.test(o.sql)).args[0]).toBe('moon');
    expect(sqls).not.toContain('DELETE FROM concept_entities');
  });
});
