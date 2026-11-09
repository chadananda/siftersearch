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
    expect(r.saved).toBe(true);
    // re-run: the saved @2 stands (no @3); it is a candidate, so it is the target
    expect(fixStrategySlots(db, 'hf')).toMatchObject({ version: r.version, fixed: [], saved: false });
    expect(db.prepare('SELECT MAX(version) AS v FROM strategies WHERE id = ?').get('hf').v).toBe(r.version);
    expect(fixStrategySlots(db, 'hf', { version: r.version })).toMatchObject({ version: r.version, saved: false });
  });
  it('activatable only when the parent is the ACTIVE version', () => {
    const db = ensureCandidatesSchema(openStrategiesDb(':memory:')); resetStrategiesCache({ db });
    const g = { entry: 'find', nodes: { find: { step: 'x.find', step_version: 1 } }, edges: [] };
    saveCandidate(db, { strategy: { id: 'x', name: 'x', description: 'd', exemplars: [], graph: g }, steps: [{ id: 'x.find', version: 1, activity: 'search.shelf', params: { query: '{t} q' } }] });
    expect(fixStrategySlots(db, 'x').activatable).toBe(false);   // @1 was never active
    db.prepare("UPDATE strategies SET status = 'active' WHERE id = 'x' AND version = 1").run();
    const r = fixStrategySlots(db, 'x', { version: 1 });
    expect(r).toMatchObject({ version: 3, saved: true, activatable: true });   // @2 (from the first call) is skipped over: a fix of @1 saves the next version
  });
});
