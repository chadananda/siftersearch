// fixStrategySlots: a planner-made tree with {x} / from:x slots becomes a NEW candidate version with {{x}} slots (steps re-versioned, no row edited).
import { describe, it, expect } from 'vitest';
import { openStrategiesDb, resetStrategiesCache } from '../../api/lib/repos/strategies-repo.js';
import { ensureCandidatesSchema, saveCandidate, strategyRow, fixSlots, fixStrategySlots } from '../../api/lib/repos/strategy-candidates-repo.js';

describe('fixSlots', () => {
  it('single braces and from: become {{unit}}; correct slots and other params stay', () => {
    expect(fixSlots({ query: '{topic} origin', k: 5, words: 'from:challenged_claim+topic', title: '{{named_work}}', by: 'authority' }))
      .toEqual({ query: '{{topic}} origin', k: 5, words: '{{challenged_claim}} {{topic}}', title: '{{named_work}}', by: 'authority' });
  });
});
describe('fixStrategySlots', () => {
  it('saves a new candidate version with re-versioned steps; the old rows stay', () => {
    const db = ensureCandidatesSchema(openStrategiesDb(':memory:')); resetStrategiesCache({ db });
    const steps = [{ id: 'hf.find', version: 1, activity: 'search.shelf', params: { query: '{topic} origin founded' } }];
    const a = saveCandidate(db, { strategy: { id: 'hf', name: 'hf', description: 'd', exemplars: [], graph: { entry: 'find', nodes: { find: { step: 'hf.find', step_version: 1 } }, edges: [] } }, steps });
    const r = fixStrategySlots(db, 'hf');
    expect(r).toMatchObject({ id: 'hf', version: a.version + 1, fixed: ['hf.find'] });
    expect(strategyRow(db, 'hf', r.version).graph.nodes.find.step_version).toBe(2);
    expect(JSON.parse(db.prepare('SELECT params_json FROM steps WHERE id = ? AND version = 2').get('hf.find').params_json).query).toBe('{{topic}} origin founded');
    expect(JSON.parse(db.prepare('SELECT params_json FROM steps WHERE id = ? AND version = 1').get('hf.find').params_json).query).toBe('{topic} origin founded');
    expect(fixStrategySlots(db, 'hf')).toMatchObject({ version: null, fixed: [] });   // already clean (newest graph)
  });
});
