// Tree candidates seed at the next free version (11-09: a fixed v2 collided with older rejected candidates and INSERT OR IGNORE kept them).
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { openStrategiesDb, seedStrategies } from '../../api/lib/repos/strategies-repo.js';
import { STRATEGIES, TREE_STRATEGIES, TEMPLATES, STEPS } from '../../api/lib/assistant/strategy-seed.js';

describe('tree seed versions', () => {
  it('takes the next free version when older candidates hold v2/v3, and seeds once', () => {
    const db = openStrategiesDb(':memory:');
    const ins = db.prepare(`INSERT INTO strategies (id, version, name, description, exemplars_json, graph_json, status, parent_version, created_at, created_by)
      VALUES (?, ?, ?, '', '[]', '{}', 'candidate', 1, 'x', 'improve')`);
    ins.run('understanding', 2, 'understanding'); ins.run('understanding', 3, 'understanding'); ins.run('prayer', 2, 'prayer');
    const seed = { TEMPLATES, STEPS, STRATEGIES: [...STRATEGIES, ...TREE_STRATEGIES] };
    seedStrategies(db, seed);
    const tree = (id) => db.prepare("SELECT version FROM strategies WHERE id = ? AND created_by = 'seed-trees'").all(id).map((r) => r.version);
    expect(tree('understanding')).toEqual([4]);
    expect(tree('prayer')).toEqual([3]);
    expect(tree('guidance')).toEqual([2]);
    expect(seedStrategies(db, seed)).toBe(0);
    expect(tree('understanding')).toEqual([4]);
    const g = JSON.parse(db.prepare("SELECT graph_json FROM strategies WHERE id = 'understanding' AND version = 4").get().graph_json);
    expect(Object.keys(g.nodes).length).toBeGreaterThan(1);
  });

  it('an edited tree step ships: new step version, new candidate version pinned to it; unchanged trees stay put', () => {
    const db = openStrategiesDb(':memory:');
    const seed = { TEMPLATES, STEPS, STRATEGIES: [...STRATEGIES, ...TREE_STRATEGIES] };
    seedStrategies(db, seed);
    const sid = 'tree.understanding.gather';
    const edited = { ...seed, STEPS: STEPS.map((s) => (s.id === sid ? { ...s, params: { ...s.params, edited: true } } : s)) };
    expect(seedStrategies(db, edited)).toBeGreaterThan(0);
    expect(db.prepare('SELECT version FROM steps WHERE id = ? ORDER BY version').all(sid).map((r) => r.version)).toEqual([1, 2]);
    const rows = db.prepare("SELECT version, graph_json FROM strategies WHERE id = 'understanding' AND created_by = 'seed-trees' ORDER BY version").all();
    expect(rows.length).toBe(2);
    expect(JSON.parse(rows[1].graph_json).nodes.gather.step_version).toBe(2);
    expect(db.prepare("SELECT COUNT(*) AS n FROM strategies WHERE id = 'prayer' AND created_by = 'seed-trees'").get().n).toBe(1);
    expect(seedStrategies(db, edited)).toBe(0);
  });
});
