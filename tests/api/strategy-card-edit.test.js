// editStrategyCard: a card rewrite is a NEW candidate version over the same graph; near_misses validated and folded into the description.
import { describe, it, expect } from 'vitest';
import { openStrategiesDb, resetStrategiesCache } from '../../api/lib/repos/strategies-repo.js';
import { ensureCandidatesSchema, saveCandidate, strategyRow, editStrategyCard } from '../../api/lib/repos/strategy-candidates-repo.js';

const mk = () => {
  const db = ensureCandidatesSchema(openStrategiesDb(':memory:')); resetStrategiesCache({ db });
  const g = { entry: 'find', nodes: { find: { step: 'hf.find', step_version: 1 } }, edges: [] };
  saveCandidate(db, { strategy: { id: 'hf', name: 'hf', description: 'Broad history questions of any kind.', exemplars: ['when did X begin', 'who founded Y'], graph: g }, steps: [{ id: 'hf.find', version: 1, activity: 'search.shelf', params: { query: '{{topic}}' } }] });
  saveCandidate(db, { strategy: { id: 'understanding', name: 'understanding', description: 'Explains a teaching in depth.', exemplars: ['a', 'b'], graph: g }, steps: [] });
  db.prepare("UPDATE strategies SET status = 'active' WHERE id = 'hf'").run();
  return db;
};
const misses = [{ example: 'The story of the Bab’s childhood?', goes_to: 'unmatched' }, { example: 'Who was Tahirih?', goes_to: 'unmatched' }, { example: 'Explain the oneness of God', goes_to: 'understanding' }];
describe('editStrategyCard', () => {
  it('saves a new version with the same graph, new description (+ Not for) and kept exemplars; the old row stays', () => {
    const db = mk();
    const r = editStrategyCard(db, 'hf', { description: 'ONE short fact: when or where something began.', near_misses: misses });
    expect(r).toMatchObject({ id: 'hf', version: 2, activatable: true });
    const row = strategyRow(db, 'hf', 2);
    expect(row.description).toBe('ONE short fact: when or where something began. Not for: The story of the Bab’s childhood; Who was Tahirih; Explain the oneness of God.');
    expect(row.exemplars).toEqual(['when did X begin', 'who founded Y']);
    expect(row.graph).toEqual(strategyRow(db, 'hf', 1).graph);
    expect(strategyRow(db, 'hf', 1).description).toBe('Broad history questions of any kind.');
  });
  it('rejects <3 near_misses, an unknown goes_to, and an over-long description', () => {
    const db = mk();
    expect(() => editStrategyCard(db, 'hf', { near_misses: misses.slice(0, 2) })).toThrow(/at least 3/);
    expect(() => editStrategyCard(db, 'hf', { near_misses: [...misses.slice(0, 2), { example: 'x y', goes_to: 'nope' }] })).toThrow(/must go to/);
    expect(() => editStrategyCard(db, 'hf', { description: 'x'.repeat(601) })).toThrow(/20-600/);
    expect(() => editStrategyCard(db, 'zz', {})).toThrow(/no strategy/);
  });
});
