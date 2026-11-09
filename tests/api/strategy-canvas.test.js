// strategy-canvas.js: graph row → xyflow nodes/edges, edge counts and percentages from branches, decision/hand/end nodes, run overlay.
import { describe, it, expect } from 'vitest';
import { buildFlow, edgeCounts } from '../../src/lib/strategy-canvas.js';

const graph = { entry: 'a', nodes: [
  { id: 'a', step: 's1', step_version: 1, activity: 'respond.plan', cls: 'jev', kind: 'code' },
  { id: 'b', step: 's2', step_version: 1, activity: 'strategy.prayer', cls: null, kind: 'tool' },
  { id: 'c', step: 's3', step_version: 2, activity: 'respond.evidence', cls: null, kind: 'code' }],
  edges: [{ from: 'a', on: 'found', to: 'b' }, { from: 'a', on: 'empty', to: 'c' }, { from: 'b', on: '*', to: 'c' }, { from: 'c', on: '*', to: '$end' }] };
const branches = [{ branch: ['a:found', 'b:*', 'c:*'], turns: 30 }, { branch: ['a:empty', 'c:*'], turns: 10 }];
const steps = [{ name: 'respond.plan', description: 'Reads the plan', input: 'messages', output: 'plan', tools: [] }, { name: 'strategy.prayer', input: 'choice, turn context', output: 'passages + plan', tools: ['prayer'] }];

describe('edgeCounts', () => {
  it('sums turns per node:edge', () => { const m = edgeCounts(branches); expect(m.get('a|found')).toBe(30); expect(m.get('c|*')).toBe(40); });
});
describe('buildFlow', () => {
  const f = buildFlow(graph, { steps, branches, strategies: [{ id: 'p1', name: 'prayer' }] });
  it('one node per step plus a single end pill, all positioned', () => {
    expect(f.nodes.map((n) => n.id).sort()).toEqual(['$end', 'a', 'b', 'c']);
    expect(f.nodes.every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y))).toBe(true);
    expect(f.nodes.find((n) => n.id === 'a').position.x).toBeLessThan(f.nodes.find((n) => n.id === 'c').position.x);
  });
  it('labels edges with the value, count and share of the node\'s turns', () => {
    expect(f.edges.find((e) => e.source === 'a' && e.target === 'b').label).toBe('found · 30 · 75%');
    expect(f.edges.find((e) => e.source === 'a' && e.target === 'c').label).toBe('empty · 10 · 25%');
  });
  it('marks decisions, entry, tool, reads/writes, hand-off', () => {
    const a = f.nodes.find((n) => n.id === 'a').data, b = f.nodes.find((n) => n.id === 'b').data;
    expect(a).toMatchObject({ decision: true, entry: true, kind: 'Jev', reads: ['messages'], writes: ['plan'] });
    expect(b).toMatchObject({ decision: false, tool: 'prayer', hand: { id: 'p1', name: 'prayer' }, reads: ['choice', 'turn context'] });
  });
  it('no run → all normal; run → lit path, dimmed rest', () => {
    expect(f.nodes.every((n) => n.data.state === 'normal')).toBe(true);
    const r = buildFlow(graph, { steps, run: { path: ['a', 'c'], values: { a: { edge: 'empty' } } } });
    expect(r.nodes.find((n) => n.id === 'a').data.state).toBe('lit');
    expect(r.nodes.find((n) => n.id === 'b').data.state).toBe('dim');
    expect(r.edges.find((e) => e.source === 'a' && e.target === 'c').data.state).toBe('lit');
    expect(r.edges.find((e) => e.source === 'a' && e.target === 'b').data.state).toBe('dim');
  });
  it('survives an empty graph', () => { expect(buildFlow(null)).toEqual({ nodes: [], edges: [] }); });
});
