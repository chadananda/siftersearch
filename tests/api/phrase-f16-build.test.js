// phrase-f16-build: the JSON text of a stored half-precision vector round-trips to the same f16 values; bulk-mode collection body.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/repos/phrase-vector-read-repo.js', () => ({ vectorsForPoints: () => new Map() }));
const { vectorJson, pointJson, createBody, f16Table } = await import('../../api/lib/ops/phrase-f16-build.js');

describe('phrase-f16-build', () => {
  it('every finite f16 value survives text -> f32 -> f16', () => {
    const t = f16Table(), u = new Uint16Array(65536).map((_, i) => i), f = new Float16Array(u.buffer);
    let bad = 0;
    for (let i = 0; i < 65536; i++) if (Number.isFinite(f[i]) && !Object.is(new Float16Array([Math.fround(Number(t[i]))])[0], f[i]) && f[i] !== 0) bad++;
    expect(bad).toBe(0);
  });
  it('vectorJson / pointJson make valid JSON', () => {
    const b = Buffer.from(new Float16Array([0.5, -1, 0.0123]).buffer);
    const p = JSON.parse(pointJson(7, vectorJson(b), { doc_id: 1 }));
    expect(p.id).toBe(7); expect(p.vector.literal).toHaveLength(3); expect(p.vector.literal[0]).toBe(0.5); expect(p.payload.doc_id).toBe(1);
  });
  it('collection is float16, bulk mode (indexing off), bounded segments', () => {
    const c = createBody();
    expect(c.vectors.literal.datatype).toBe('float16'); expect(c.optimizers_config.indexing_threshold).toBe(0);
    expect(c.optimizers_config.max_segment_size).toBe(10_000_000); expect(c.optimizers_config.default_segment_number).toBe(24);
    expect(c.optimizers_config.flush_interval_sec).toBe(120);
  });
});
