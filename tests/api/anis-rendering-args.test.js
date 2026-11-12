// rendering_lookup's contract names the word term_arabic; the runner must read it (11-12: it read `word` → every agent call empty).
import { describe, it, expect } from 'vitest';
import { toolRunner } from '../../api/lib/assistant/researcher.js';

describe('rendering_lookup arguments', () => {
  it('term_arabic (the contract) and word (older callers) both reach the word study', async () => {
    const asked = [];
    const { run } = toolRunner({ wordStudy: async (w) => { asked.push(w); return { summary: `Word ${w}`, passages: [] }; } });
    expect(await run.rendering_lookup({ term_arabic: 'يظهر', translator: 'Shoghi Effendi' })).toMatch(/^Word يظهر/);
    await run.rendering_lookup({ word: 'بيت' });
    expect(asked).toEqual(['يظهر', 'بيت']);
  });
});
