// search.js embedLateGate: a vector layer gives way past the embed deadline only when BM25 already answers
import { describe, it, expect } from 'vitest';
import { embedLateGate, EMBED_LATE_MIN } from '../../api/lib/search.js';

const later = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
const kw = (n) => Promise.resolve({ hits: Array.from({ length: n }, (_, i) => ({ paragraph_id: i })) });

describe('embedLateGate', () => {
  it('no deadline → the layer as is', async () => {
    const gate = embedLateGate(later(30, []), kw(9), undefined);
    expect(await gate(later(40, { hits: [1] }))).toEqual({ hits: [1] });
  });
  it('late embed + BM25 holds enough → the layer gives way', async () => {
    let late = 0;
    const gate = embedLateGate(later(500, []), kw(EMBED_LATE_MIN), 20, () => { late++; });
    expect(await gate(later(600, { hits: [1] }))).toEqual({ hits: [], late: true });
    expect(late).toBe(1);
  });
  it('late embed but BM25 thin → waits for the vector layer', async () => {
    const gate = embedLateGate(later(80, []), kw(EMBED_LATE_MIN - 1), 20);
    expect(await gate(later(100, { hits: [1] }))).toEqual({ hits: [1] });
  });
  it('embed in time → the layer as is', async () => {
    const gate = embedLateGate(later(5, []), kw(30), 50);
    expect(await gate(later(10, { hits: [2] }))).toEqual({ hits: [2] });
  });
  it('null layer stays null', () => { expect(embedLateGate(later(5, []), kw(0), 50)(null)).toBe(null); });
});
