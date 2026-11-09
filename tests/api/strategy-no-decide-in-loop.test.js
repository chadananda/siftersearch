// Ratchet (Chad 11-09): no decide/process node inside a loop. A loop = a search.fanout/search.together fan-out, a hand.strategy sub-tree, or a graph cycle.
// Fan-out inners must be pure tool elements; hand.strategy (a sub-tree with its own Jev judge) is not allowed in any seeded tree; no cycle holds a decide/process node.
import { describe, it, expect } from 'vitest';
import { TREE_GRAPHS, TREE_STEPS, TREE_IDS } from '../../api/lib/assistant/strategy-trees-seed.js';
import { ELEMENTS } from '../../api/lib/assistant/activities/elements.js';

const inners = (params) => [params?.inner, ...(params?.list || []), ...((params?.inner?.params?.list) || [])].filter(Boolean);
describe('seeded trees: no decide/process in a loop', () => {
  for (const id of TREE_IDS) {
    const g = TREE_GRAPHS[id];
    it(`${id}: fan-outs hold only pure tool elements, no hand.strategy, no cycle through decide/process`, () => {
      for (const [nid, n] of Object.entries(g.nodes)) {
        const step = TREE_STEPS.find((x) => x.id === n.step);
        expect(step.activity, `${nid} hand.strategy`).not.toBe('hand.strategy');
        if (['search.fanout', 'search.together'].includes(step.activity)) for (const inner of inners(step.params)) { expect(inner.element, `${nid} inner`).not.toBe('hand.strategy'); expect(ELEMENTS[inner.element]?.kind, `${nid} inner ${inner.element}`).toBe('tool'); }
      }
      const out = (a) => g.edges.filter((e) => e.from === a).map((e) => e.to);
      for (const start of Object.keys(g.nodes)) {   // a node that can reach itself is in a cycle
        const seen = new Set(), stack = [...out(start)];
        while (stack.length) { const x = stack.pop(); if (seen.has(x)) continue; seen.add(x); stack.push(...out(x)); }
        if (seen.has(start)) expect(['decide', 'process'].includes(g.nodes[start].kind), `${id}.${start} is a decide/process node inside a cycle`).toBe(false);
      }
    });
  }
});
