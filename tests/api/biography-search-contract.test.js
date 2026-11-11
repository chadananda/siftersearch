// biography_search's output contract: an evidence paraId may be a string (11-11: every public call for "Quddús" 500'd on the integer-only schema)
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import { REGISTRY } from '../../api/lib/assistant/tools.js';

describe('biography_search output schema', () => {
  const v = new Ajv({ strict: false }).compile(REGISTRY.biography_search.output);
  const out = (paraId) => ({ people: [{ id: 7, name: 'Quddús', evidence: [{ relation: 'member', statement: 'a Letter of the Living', source: 'The Dawn-Breakers', paraId }] }] });
  it('accepts a string paraId, an integer and null', () => {
    for (const p of ['para_1203', 21053923, null]) expect(v(out(p)), JSON.stringify(v.errors)).toBe(true);
  });
});
